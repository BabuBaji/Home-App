// HomeHelp Worker Service
// -----------------------
// Owns worker identity/profile + the worker wallet ledger on its OWN Postgres DB.
// The Booking core (still the monolith, for now) calls this service for worker data during
// the job lifecycle; the admin panel manages workers through it. This is the 4th service
// peeled off the monolith (Auth, Catalog, Activity already done).
import express from 'express'
import pg from 'pg'

const PORT = Number(process.env.PORT || 4004)
const MONOLITH_URL = (process.env.MONOLITH_URL || 'http://localhost:4000').replace(/\/$/, '')
const INTERNAL_KEY = process.env.INTERNAL_KEY || ''
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5435/worker'

const pool = new pg.Pool({ connectionString: DATABASE_URL })

async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS workers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL, phone TEXT, email TEXT, city TEXT,
    services JSONB NOT NULL DEFAULT '[]', avatar TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    verified BOOLEAN NOT NULL DEFAULT false,
    rating REAL NOT NULL DEFAULT 4.7, jobs INTEGER NOT NULL DEFAULT 0, earnings INTEGER NOT NULL DEFAULT 0,
    balance INTEGER NOT NULL DEFAULT 0, pending INTEGER NOT NULL DEFAULT 0, hold INTEGER NOT NULL DEFAULT 0,
    withdrawn INTEGER NOT NULL DEFAULT 0, advance_outstanding INTEGER NOT NULL DEFAULT 0,
    available BOOLEAN NOT NULL DEFAULT true, last_lat REAL, last_lng REAL,
    bank_status TEXT DEFAULT 'Pending', joined TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)
  // Worker wallet ledger (income / deductions / withdrawals / advances / payslips / notifications).
  await pool.query(`CREATE TABLE IF NOT EXISTS worker_income (id SERIAL PRIMARY KEY, worker_id INTEGER, category TEXT, label TEXT, amount INTEGER, ref_id TEXT, bucket TEXT, created TIMESTAMPTZ DEFAULT now())`)
  await pool.query(`CREATE TABLE IF NOT EXISTS worker_deductions (id SERIAL PRIMARY KEY, worker_id INTEGER, category TEXT, label TEXT, amount INTEGER, created TIMESTAMPTZ DEFAULT now())`)
  await pool.query(`CREATE TABLE IF NOT EXISTS worker_withdrawals (id SERIAL PRIMARY KEY, worker_id INTEGER, amount INTEGER, status TEXT, reference TEXT, created TIMESTAMPTZ DEFAULT now())`)
  await pool.query(`CREATE TABLE IF NOT EXISTS worker_txns (id SERIAL PRIMARY KEY, worker_id INTEGER, title TEXT, subtitle TEXT, amount INTEGER, status TEXT, is_credit BOOLEAN, kind TEXT, ref_id TEXT, created TIMESTAMPTZ DEFAULT now())`)

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
  console.log('[worker] Postgres ready (workers + wallet ledger)')
}

/* ---------- auth ---------- */
async function adminAuth(req, res, next) {
  try {
    const r = await fetch(`${MONOLITH_URL}/api/admin/me`, { headers: { authorization: req.headers.authorization || '' } })
    if (!r.ok) return res.status(401).json({ error: 'Not authenticated' })
    req.admin = (await r.json()).admin
    next()
  } catch { res.status(502).json({ error: 'Auth service unavailable' }) }
}
const internalOnly = (req, res, next) =>
  (!INTERNAL_KEY || req.headers['x-internal-key'] === INTERNAL_KEY) ? next() : res.status(403).json({ error: 'forbidden' })

const rowToWorker = (w) => w && ({ ...w, verified: !!w.verified, available: !!w.available })

async function listWorkers({ status, city, q } = {}) {
  let rows = (await pool.query('SELECT * FROM workers ORDER BY id DESC')).rows.map(rowToWorker)
  if (status && status !== 'all') rows = rows.filter((w) => w.status === status)
  if (city && city !== 'all') rows = rows.filter((w) => w.city === city)
  if (q) { const s = q.toLowerCase(); rows = rows.filter((w) => w.name.toLowerCase().includes(s) || (w.phone || '').includes(s) || (w.email || '').toLowerCase().includes(s)) }
  return rows
}
async function workerStats() {
  const all = (await pool.query('SELECT status FROM workers')).rows
  return { total: all.length, active: all.filter((w) => w.status === 'active').length,
    pending: all.filter((w) => w.status === 'pending').length,
    inactive: all.filter((w) => w.status === 'inactive' || w.status === 'suspended').length }
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'worker', ok: true }))

// Internal (called by the Booking core during dispatch/job flow + admin proxy).
app.get('/internal/workers', internalOnly, async (req, res) => res.json({ stats: await workerStats(), workers: await listWorkers(req.query) }))
app.get('/internal/workers/:id', internalOnly, async (req, res) => {
  const w = rowToWorker((await pool.query('SELECT * FROM workers WHERE id=$1', [req.params.id])).rows[0])
  return w ? res.json(w) : res.status(404).json({ error: 'Not found' })
})
app.patch('/internal/workers/:id', internalOnly, async (req, res) => {
  const b = req.body || {}
  const cur = (await pool.query('SELECT * FROM workers WHERE id=$1', [req.params.id])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Not found' })
  await pool.query('UPDATE workers SET name=$1, phone=$2, email=$3, city=$4, services=$5::jsonb, status=$6, verified=$7 WHERE id=$8', [
    b.name ?? cur.name, b.phone ?? cur.phone, b.email ?? cur.email, b.city ?? cur.city,
    JSON.stringify(b.services ?? cur.services), b.status ?? cur.status,
    b.verified === undefined ? cur.verified : !!b.verified, req.params.id])
  res.json(rowToWorker((await pool.query('SELECT * FROM workers WHERE id=$1', [req.params.id])).rows[0]))
})

// Admin-facing (via gateway): manage workers.
app.get('/api/admin/workers', adminAuth, async (req, res) => res.json({ stats: await workerStats(), workers: await listWorkers(req.query) }))

init()
  .then(() => app.listen(PORT, () => console.log(`[worker] service on http://localhost:${PORT} (monolith: ${MONOLITH_URL})`)))
  .catch((e) => { console.error('[worker] failed to start:', e.message); process.exit(1) })
