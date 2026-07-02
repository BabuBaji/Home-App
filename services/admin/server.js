// HomeHelp Admin Service — core (identity + config + audit)
// ----------------------------------------------------------
// Owns admins/settings/audit_log on its own Postgres. It is:
//   • the admin identity provider — /api/admin/login + /api/admin/me (token `admin-<id>`),
//     which every other service calls (via @homehelp/shared makeAdminAuth) to authorize
//     their own /api/admin/* routes;
//   • the CONFIG service — the old global `settings` bus. /internal/settings serves the
//     unmasked values that shared/config.js getSetting() reads.
// The BFF aggregation endpoints (dashboard/analytics/customers/…) are added in Phase 2i.
import express from 'express'
import crypto from 'node:crypto'
import { makePool, migrate, nowIso, internalOnly, requireRole, publishEvent } from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4010)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5440/admin'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

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
  auto_assign: 'true', maintenance_mode: 'false',
  razorpay_key_id: '', razorpay_key_secret: '', google_maps_key: '', msg91_key: '',
  firebase_server_key: '', smtp_host: '', smtp_user: '', smtp_pass: '',
  upi_vpa: '', upi_payee_name: '', upi_mode: 'demo',
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
  const n = await pool.query('SELECT COUNT(*)::int AS n FROM admins')
  if (n.rows[0].n === 0) {
    await pool.query('INSERT INTO admins (name,email,phone,pass_hash,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
      ['Super Admin', 'admin@homehelp.in', '+91 90000 00000', hashPw('admin123'), 'super', 'active'])
    await pool.query('INSERT INTO admins (name,email,phone,pass_hash,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
      ['Ops Manager', 'ops@homehelp.in', '+91 90000 11111', hashPw('ops12345'), 'manager', 'active'])
    console.log('[admin] seeded default admins (admin@homehelp.in / admin123)')
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
      [b.name, String(b.email).toLowerCase(), b.phone || null, hashPw(b.password || 'changeme123'), b.role || 'manager', b.status || 'active'])
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
  .catch((e) => { console.error('[admin] failed to start:', e.message); process.exit(1) })
