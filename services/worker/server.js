// HomeHelp Worker Service
// -----------------------
// Owns worker identity/profile + a balance snapshot (account-of-record) on its own Postgres.
// Serves worker-app auth/bootstrap/profile/documents and the admin worker panel. The dispatch
// service reads worker availability/services/location from here to match jobs; the wallet
// service owns the earnings LEDGER and adjusts the balance snapshot here via /internal.
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
async function getByPhone(phone) { const { rows } = await pool.query('SELECT * FROM workers WHERE phone=$1', [String(phone || '')]); return rows[0] || null }
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

// Worker-app bootstrap aggregates identity (local) + jobs/history (booking svc) + wallet (local snapshot).
async function bootstrap(wid) {
  const w = await getWorker(wid)
  const mine = await tryGet(BOOKING_URL, `/api/internal/bookings?worker_id=${wid}`, [])
  const active = mine.find((b) => ['worker_assigned', 'on_the_way', 'arrived', 'in_progress'].includes(b.status)) || null
  const STATUS_TO_ENUM = { worker_assigned: 'ACCEPTED', on_the_way: 'ON_THE_WAY', arrived: 'ARRIVED', in_progress: 'IN_PROGRESS', completed: 'COMPLETED' }
  return {
    worker: workerDto(w), wallet: walletDto(w), walletSummary: walletSummary(w),
    jobStatus: active ? (STATUS_TO_ENUM[active.status] || 'NONE') : 'NONE',
    activeJob: active ? { id: active.ref, bookingId: active.id, services: (active.items || []).map((i) => i.name), address: active.address, otp: active.service_otp, startedAt: active.started_at, completedAt: active.completed_at } : null,
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

app.post('/api/worker/auth/request-otp', (req, res) => res.json({ ok: true, devOtp: '1234', message: `OTP sent to ${req.body?.phone || ''}` }))
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
  const rows = (await pool.query("SELECT services FROM workers WHERE status='active' AND available=true")).rows
  const available = rows.some((w) => { const set = serviceSet(w); return names.some((n) => set.has(n)) })
  res.json({ available })
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
  .catch((e) => { console.error('[worker] failed to start:', e.message); process.exit(1) })
