// HomeHelp Catalog Service
// -------------------------
// A standalone microservice that OWNS the service catalogue on its own Postgres DB.
// The API Gateway routes /api/services* and /api/admin/services* here; everything else
// still goes to the legacy monolith. Admin auth is delegated to the monolith (/api/admin/me)
// — a simple service-to-service auth pattern — and per-service booking counts are fetched
// from the monolith over HTTP (service-to-service data).
import express from 'express'
import pg from 'pg'
import { CATEGORIES, SERVICES_SEED, SERVICE_IMAGES, detailsFor } from './catalog-data.js'

const PORT = Number(process.env.PORT || 4001)
const MONOLITH_URL = (process.env.MONOLITH_URL || 'http://localhost:4000').replace(/\/$/, '')
const INTERNAL_KEY = process.env.INTERNAL_KEY || ''
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5432/catalog'

const pool = new pg.Pool({ connectionString: DATABASE_URL })

/* ---------- schema + idempotent seed ---------- */
async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL,
    available BOOLEAN NOT NULL DEFAULT true,
    sort INTEGER NOT NULL DEFAULT 0
  )`)
  // Upsert the seed catalogue (keeps admin-created services; refreshes seed name/price).
  const up = `INSERT INTO services (id,name,icon,price,category,available,sort)
    VALUES ($1,$2,$3,$4,$5,true,$6)
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, icon=EXCLUDED.icon, price=EXCLUDED.price, category=EXCLUDED.category, sort=EXCLUDED.sort`
  for (let i = 0; i < SERVICES_SEED.length; i++) {
    const [id, name, icon, price, category] = SERVICES_SEED[i]
    await pool.query(up, [id, name, icon, price, category, i])
  }
  console.log(`[catalog] Postgres ready, seeded ${SERVICES_SEED.length} services`)
}

const withImage = (s) => ({ ...s, available: !!s.available, image: SERVICE_IMAGES[s.id] || null })

/* ---------- service-to-service: admin auth via the monolith ---------- */
async function adminAuth(req, res, next) {
  try {
    const r = await fetch(`${MONOLITH_URL}/api/admin/me`, { headers: { authorization: req.headers.authorization || '' } })
    if (!r.ok) return res.status(401).json({ error: 'Not authenticated' })
    req.admin = (await r.json()).admin
    next()
  } catch {
    res.status(502).json({ error: 'Auth service unavailable' })
  }
}
const RANK = { super: 4, admin: 3, manager: 2, support: 1 }
const require = (min) => (req, res, next) =>
  (RANK[req.admin?.role] || 0) >= RANK[min] ? next() : res.status(403).json({ error: 'Insufficient permissions' })

// service-to-service: per-service booking counts live in the monolith's bookings DB.
async function bookingCounts() {
  try {
    const r = await fetch(`${MONOLITH_URL}/api/internal/service-booking-counts`, { headers: { 'x-internal-key': INTERNAL_KEY } })
    if (r.ok) return await r.json()
  } catch { /* monolith down — fall back to zeros */ }
  return {}
}

/* ---------- app ---------- */
const app = express()
app.use(express.json())

app.get('/health', (_q, res) => res.json({ service: 'catalog', ok: true }))

// Customer catalogue (public)
app.get('/api/services', async (_q, res) => {
  const { rows } = await pool.query('SELECT id,name,icon,price,category,available FROM services ORDER BY sort, name')
  res.json({ categories: CATEGORIES, services: rows.map(withImage) })
})
app.get('/api/services/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT id,name,icon,price,category,available FROM services WHERE id=$1', [req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  const s = withImage(rows[0])
  res.json({ ...s, ...detailsFor(s.id, s.price) })
})

// Admin management (auth delegated to the monolith)
app.get('/api/admin/services', adminAuth, async (_q, res) => {
  const [{ rows }, counts] = await Promise.all([
    pool.query('SELECT id,name,icon,price,category,available FROM services ORDER BY sort, name'),
    bookingCounts(),
  ])
  res.json(rows.map((s) => ({ ...withImage(s), bookings: counts[s.id] || 0 })))
})
app.post('/api/admin/services', adminAuth, require('manager'), async (req, res) => {
  const b = req.body || {}
  const id = String(b.id || b.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24)
  if (!id || !b.name) return res.status(400).json({ error: 'Name is required' })
  const exists = await pool.query('SELECT 1 FROM services WHERE id=$1', [id])
  if (exists.rowCount) return res.status(409).json({ error: 'Service already exists' })
  const { rows } = await pool.query('SELECT COALESCE(MAX(sort),0)+1 AS s FROM services')
  await pool.query('INSERT INTO services (id,name,icon,price,category,available,sort) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, b.name, b.icon || '🧰', Math.max(0, Number(b.price) || 99), b.category || 'Cleaning', b.available === false ? false : true, rows[0].s])
  res.status(201).json({ ok: true, id })
})
app.patch('/api/admin/services/:id', adminAuth, require('manager'), async (req, res) => {
  const b = req.body || {}
  const cur = await pool.query('SELECT * FROM services WHERE id=$1', [req.params.id])
  if (!cur.rowCount) return res.status(404).json({ error: 'Not found' })
  const s = cur.rows[0]
  await pool.query('UPDATE services SET name=$1, icon=$2, price=$3, category=$4, available=$5 WHERE id=$6', [
    b.name ?? s.name, b.icon ?? s.icon, b.price ?? s.price, b.category ?? s.category,
    b.available === undefined ? s.available : !!b.available, req.params.id,
  ])
  res.json({ ok: true })
})
app.delete('/api/admin/services/:id', adminAuth, require('admin'), async (req, res) => {
  await pool.query('DELETE FROM services WHERE id=$1', [req.params.id])
  res.json({ ok: true })
})

init()
  .then(() => app.listen(PORT, () => console.log(`[catalog] service on http://localhost:${PORT} (monolith: ${MONOLITH_URL})`)))
  .catch((e) => { console.error('[catalog] failed to start:', e.message); process.exit(1) })
