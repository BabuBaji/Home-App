// HomeHelp Catalog Service
// -------------------------
// Owns the service catalogue on its own Postgres, and is the authority for pricing/coupons.
// Serves the customer catalogue + quote + coupons + home content, and admin service CRUD.
// Admin auth + config are delegated to the admin service; per-service booking counts come from
// the booking service; catalogue changes are broadcast as `services:update` via the realtime bus.
import express from 'express'
import {
  makePool, migrate, makeAdminAuth, requireRole, internalOnly, tryGet, publishRealtime,
} from '@homehelp/shared'
import {
  CATEGORIES, SERVICES_SEED, SERVICE_IMAGES, detailsFor, durationsFor,
  REFERRAL, TRUST_BADGES, COUPONS, applyCoupon, priceBreakdown,
} from './catalog-data.js'

const PORT = Number(process.env.PORT || 4001)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5432/catalog'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const BOOKING_URL = (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, '')

const pool = makePool(DATABASE_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, price INTEGER NOT NULL,
      category TEXT NOT NULL, available BOOLEAN NOT NULL DEFAULT true, sort INTEGER NOT NULL DEFAULT 0
    )`,
  ])
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

async function allServices() {
  const { rows } = await pool.query('SELECT id,name,icon,price,category,available FROM services ORDER BY sort, name')
  return rows.map(withImage)
}
async function getService(id) {
  const { rows } = await pool.query('SELECT id,name,icon,price,category,available FROM services WHERE id=$1', [id])
  return rows[0] ? withImage(rows[0]) : null
}
async function broadcastServices() {
  publishRealtime(REDIS_URL, null, 'services:update', await allServices())
}
// service-to-service: booking counts live in the booking service.
const bookingCounts = () => tryGet(BOOKING_URL, '/api/internal/service-booking-counts', {})

// Authoritative pricing for a set of {id, durationId} items.
async function priceItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return { error: 'Select at least one service' }
  const items = []
  for (const it of rawItems) {
    const s = await getService(it.id)
    if (!s || !s.available) return { error: `"${it.id}" is not available` }
    const durs = durationsFor(s.price)
    const dur = durs.find((d) => d.id === (it.durationId || '60m')) || durs[0]
    items.push({ id: s.id, name: s.name, icon: s.icon, category: s.category, durationId: dur.id, durationLabel: dur.label, price: dur.price })
  }
  const subtotal = Math.max(0, items.reduce((sum, x) => sum + x.price, 0))
  return { items, subtotal }
}
async function quote({ items, coupon }) {
  const q = await priceItems(items)
  if (q.error) return { status: 409, body: q }
  let discount = 0, code = null
  if (coupon) { const c = applyCoupon(coupon, q.subtotal); if (!c.error) { discount = c.discount; code = c.code } }
  return { status: 200, body: { items: q.items, coupon: code, ...priceBreakdown(q.subtotal, discount) } }
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'catalog', ok: true }))

/* ---------- customer catalogue (public) ---------- */
app.get('/api/services', async (_q, res) => res.json({ categories: CATEGORIES, services: await allServices() }))
app.get('/api/services/:id', async (req, res) => {
  const s = await getService(req.params.id)
  if (!s) return res.status(404).json({ error: 'Service not found' })
  res.json({ ...s, ...detailsFor(s.id, s.price) })
})

/* ---------- pricing / coupons / home ---------- */
app.post('/api/quote', async (req, res) => { const r = await quote(req.body || {}); res.status(r.status).json(r.body) })
app.get('/api/coupons', (_q, res) => res.json(COUPONS))
app.post('/api/coupons/validate', (req, res) => {
  const r = applyCoupon(req.body?.code, Number(req.body?.subtotal) || 0)
  if (r.error) return res.status(400).json(r)
  res.json(r)
})
app.get('/api/home', (_q, res) => res.json({ referral: REFERRAL, trust: TRUST_BADGES, instantEta: 5 }))
app.get('/api/referral', (_q, res) => res.json(REFERRAL))

/* ---------- internal (service-to-service) ---------- */
// Booking service prices bookings authoritatively through here.
app.post('/api/internal/price', internalOnly, async (req, res) => { const r = await quote(req.body || {}); res.status(r.status).json(r.body) })

/* ---------- admin management ---------- */
app.get('/api/admin/services', adminAuth, async (_q, res) => {
  const [rows, counts] = await Promise.all([allServices(), bookingCounts()])
  res.json(rows.map((s) => ({ ...s, bookings: counts[s.id] || 0 })))
})
app.post('/api/admin/services', adminAuth, requireRole('manager'), async (req, res) => {
  const b = req.body || {}
  const id = String(b.id || b.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24)
  if (!id || !b.name) return res.status(400).json({ error: 'Name is required' })
  const exists = await pool.query('SELECT 1 FROM services WHERE id=$1', [id])
  if (exists.rowCount) return res.status(409).json({ error: 'Service already exists' })
  const { rows } = await pool.query('SELECT COALESCE(MAX(sort),0)+1 AS s FROM services')
  await pool.query('INSERT INTO services (id,name,icon,price,category,available,sort) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, b.name, b.icon || '🧰', Math.max(0, Number(b.price) || 99), b.category || 'Cleaning', b.available === false ? false : true, rows[0].s])
  await broadcastServices()
  res.status(201).json({ ok: true, id })
})
app.patch('/api/admin/services/:id', adminAuth, requireRole('manager'), async (req, res) => {
  const b = req.body || {}
  const cur = await pool.query('SELECT * FROM services WHERE id=$1', [req.params.id])
  if (!cur.rowCount) return res.status(404).json({ error: 'Not found' })
  const s = cur.rows[0]
  await pool.query('UPDATE services SET name=$1, icon=$2, price=$3, category=$4, available=$5 WHERE id=$6', [
    b.name ?? s.name, b.icon ?? s.icon, b.price ?? s.price, b.category ?? s.category,
    b.available === undefined ? s.available : !!b.available, req.params.id,
  ])
  await broadcastServices()
  res.json({ ok: true })
})
app.delete('/api/admin/services/:id', adminAuth, requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM services WHERE id=$1', [req.params.id])
  await broadcastServices()
  res.json({ ok: true })
})
// Customer-facing single-field update kept from the monolith (price/availability toggle).
app.patch('/api/services/:id', adminAuth, requireRole('manager'), async (req, res) => {
  const cur = await pool.query('SELECT * FROM services WHERE id=$1', [req.params.id])
  if (!cur.rowCount) return res.status(404).json({ error: 'Service not found' })
  const s = cur.rows[0]
  await pool.query('UPDATE services SET price=$1, available=$2 WHERE id=$3',
    [req.body?.price ?? s.price, req.body?.available === undefined ? s.available : !!req.body.available, req.params.id])
  await broadcastServices()
  res.json(await getService(req.params.id))
})

init()
  .then(() => app.listen(PORT, () => console.log(`[catalog] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[catalog] failed to start:', e.message); process.exit(1) })
