// HomeHelp Auth / User Service
// ----------------------------
// System of record for CUSTOMER identity + profile on its own Postgres:
//   auth_identities  – every identity that has ever logged in (audit of logins)
//   users            – the customer profile (name/email/location/wallet/rating/status)
//   addresses        – saved delivery addresses
//   transactions     – the customer wallet ledger
// Serves the customer-facing /api/auth, /api/me, /api/addresses, /api/wallet, and exposes
// /api/internal/* for other services (user lookup for token validation, addresses, wallet
// debit/credit, admin customer management). No monolith involved.
import express from 'express'
import { makePool, migrate, nowIso, internalOnly, publishEvent } from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4002)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5433/auth'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const DEV_OTP = process.env.DEV_OTP || '4321'
const WELCOME_BONUS = 1240

const pool = makePool(DATABASE_URL)
const otpStore = new Map() // phone -> otp (in-memory; fine for OTP's short TTL)

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      phone TEXT, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'phone', avatar TEXT,
      country TEXT, city TEXT, location TEXT,
      wallet INTEGER NOT NULL DEFAULT ${WELCOME_BONUS}, rating REAL NOT NULL DEFAULT 5.0,
      status TEXT NOT NULL DEFAULT 'active', created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS addresses (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL,
      label TEXT NOT NULL, line TEXT NOT NULL,
      house TEXT, apartment TEXT, street TEXT, landmark TEXT, city TEXT, pincode TEXT,
      is_default BOOLEAN NOT NULL DEFAULT false
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, amount INTEGER NOT NULL, balance INTEGER NOT NULL,
      ref TEXT, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS auth_identities (
      id BIGINT PRIMARY KEY, phone TEXT, email TEXT, provider TEXT, name TEXT,
      created TIMESTAMPTZ NOT NULL DEFAULT now(), last_login TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS ix_addr_user ON addresses(user_id)`,
    `CREATE INDEX IF NOT EXISTS ix_txn_user ON transactions(user_id)`,
  ])
  console.log('[auth] Postgres ready (users, addresses, transactions, auth_identities)')
}

/* ---------- data helpers ---------- */
const publicUser = (u) => u && ({
  id: u.id, phone: u.phone, name: u.name, email: u.email, provider: u.provider,
  avatar: u.avatar, country: u.country, city: u.city, location: u.location,
  wallet: u.wallet, rating: u.rating, status: u.status,
})

async function getUser(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [id])
  return rows[0] || null
}

async function provisionExtras(uid) {
  await pool.query(
    'INSERT INTO transactions (user_id,type,title,amount,balance,created) VALUES ($1,$2,$3,$4,$5,$6)',
    [uid, 'credit', 'Welcome bonus', WELCOME_BONUS, WELCOME_BONUS, nowIso()])
}

async function findOrCreateUser(phone) {
  const cur = await pool.query('SELECT * FROM users WHERE phone=$1', [phone])
  if (cur.rows[0]) return cur.rows[0]
  const ins = await pool.query(
    "INSERT INTO users (phone,name,email,provider,country) VALUES ($1,'','','phone','IN') RETURNING *", [phone])
  await provisionExtras(ins.rows[0].id)
  return ins.rows[0]
}

async function findOrCreateGoogleUser({ email, name, avatar }) {
  const cur = await pool.query('SELECT * FROM users WHERE email=$1', [email])
  if (cur.rows[0]) return cur.rows[0]
  const ins = await pool.query(
    "INSERT INTO users (phone,name,email,provider,avatar,country) VALUES (NULL,$1,$2,'google',$3,'IN') RETURNING *",
    [name || '', email, avatar || null])
  await provisionExtras(ins.rows[0].id)
  return ins.rows[0]
}

async function ensureDefaultAddressFromLocation(uid, city, location) {
  if (!location && !city) return
  const n = await pool.query('SELECT COUNT(*)::int AS n FROM addresses WHERE user_id=$1', [uid])
  if (n.rows[0].n > 0) return
  await pool.query('INSERT INTO addresses (user_id,label,line,city,is_default) VALUES ($1,$2,$3,$4,true)',
    [uid, 'Home', location || city, city || null])
}

async function getAddresses(uid) {
  const { rows } = await pool.query('SELECT * FROM addresses WHERE user_id=$1 ORDER BY is_default DESC, id', [uid])
  return rows
}

async function addTransaction(uid, type, title, amount, ref) {
  const u = await getUser(uid)
  const bal = type === 'credit' ? u.wallet + amount : u.wallet - amount
  await pool.query('UPDATE users SET wallet=$1 WHERE id=$2', [bal, uid])
  await pool.query('INSERT INTO transactions (user_id,type,title,amount,balance,ref,created) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [uid, type, title, amount, bal, ref ?? null, nowIso()])
  return bal
}

async function recordIdentity(user, provider) {
  await pool.query(
    `INSERT INTO auth_identities (id, phone, email, provider, name, last_login)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (id) DO UPDATE SET phone=EXCLUDED.phone, email=EXCLUDED.email,
       provider=EXCLUDED.provider, name=EXCLUDED.name, last_login=now()`,
    [user.id, user.phone || null, user.email || null, provider, user.name || null])
}

function decodeJwt(t) {
  try { return JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) } catch { return null }
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'auth', ok: true }))

/* ---------- customer token auth (local) ---------- */
async function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '')
  const id = t.startsWith('demo-') ? Number(t.slice(5)) : NaN
  const u = Number.isFinite(id) ? await getUser(id) : null
  if (!u) return res.status(401).json({ error: 'Not authenticated' })
  req.user = u
  next()
}

/* ---------- login ---------- */
app.post('/api/auth/request-otp', (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  if (phone.length < 6) return res.status(400).json({ error: 'Enter a valid mobile number' })
  otpStore.set(phone, DEV_OTP)
  res.json({ ok: true, devOtp: DEV_OTP })
})
app.post('/api/auth/verify-otp', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  if (String(req.body?.otp || '') !== otpStore.get(phone)) return res.status(401).json({ error: 'Invalid OTP' })
  otpStore.delete(phone)
  const u = await findOrCreateUser(phone)
  await recordIdentity(u, 'phone')
  publishEvent(REDIS_URL, 'customer.login', { userId: u.id, name: u.name, detail: `Signed in (${phone})` })
  res.json({ token: 'demo-' + u.id, user: publicUser(u) })
})
app.post('/api/auth/google', async (req, res) => {
  let p = null
  if (req.body?.credential) {
    const j = decodeJwt(req.body.credential)
    if (!j?.email) return res.status(401).json({ error: 'Invalid Google credential' })
    p = { email: j.email, name: j.name || 'Google User', avatar: j.picture }
  } else if (req.body?.demo) {
    p = { email: 'rahul.sharma@gmail.com', name: 'Rahul Sharma' }
  } else return res.status(400).json({ error: 'Missing Google credential' })
  const u = await findOrCreateGoogleUser(p)
  await recordIdentity(u, 'google')
  publishEvent(REDIS_URL, 'customer.login', { userId: u.id, name: u.name, detail: `Signed in with Google (${u.email || ''})` })
  res.json({ token: 'demo-' + u.id, user: publicUser(u) })
})

/* ---------- me / profile ---------- */
app.get('/api/me', auth, async (req, res) => res.json({ user: publicUser(req.user), addresses: await getAddresses(req.user.id) }))
app.patch('/api/me', auth, async (req, res) => {
  const b = req.body || {}
  const u = req.user
  const upd = await pool.query(
    'UPDATE users SET name=$1, email=$2, phone=$3, country=$4, city=$5, location=$6 WHERE id=$7 RETURNING *',
    [b.name ?? u.name, b.email ?? u.email, b.phone ?? u.phone, b.country ?? u.country, b.city ?? u.city, b.location ?? u.location, u.id])
  if (b.location || b.city) await ensureDefaultAddressFromLocation(u.id, upd.rows[0].city, upd.rows[0].location)
  res.json({ user: publicUser(upd.rows[0]) })
})

/* ---------- addresses ---------- */
app.get('/api/addresses', auth, async (req, res) => res.json(await getAddresses(req.user.id)))
app.post('/api/addresses', auth, async (req, res) => {
  const a = req.body || {}
  const line = a.line || [a.house, a.apartment, a.street, a.landmark, a.city, a.pincode].filter(Boolean).join(', ')
  const { rows } = await pool.query(
    `INSERT INTO addresses (user_id,label,line,house,apartment,street,landmark,city,pincode,is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false) RETURNING *`,
    [req.user.id, a.label || 'Other', line, a.house, a.apartment, a.street, a.landmark, a.city, a.pincode])
  res.status(201).json(rows[0])
})
app.patch('/api/addresses/:id/default', auth, async (req, res) => {
  await pool.query('UPDATE addresses SET is_default=false WHERE user_id=$1', [req.user.id])
  await pool.query('UPDATE addresses SET is_default=true WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id])
  res.json(await getAddresses(req.user.id))
})
app.delete('/api/addresses/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM addresses WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id])
  res.json(await getAddresses(req.user.id))
})

/* ---------- wallet ---------- */
app.get('/api/wallet', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM transactions WHERE user_id=$1 ORDER BY id DESC', [req.user.id])
  res.json({ balance: req.user.wallet, cashback: 200, transactions: rows })
})
app.post('/api/wallet/add', auth, async (req, res) => {
  const bal = await addTransaction(req.user.id, 'credit', 'Added to wallet', Math.max(1, Number(req.body?.amount) || 0))
  res.json({ balance: bal })
})

/* ---------- internal (service-to-service) ---------- */
app.get('/api/internal/users/:id', internalOnly, async (req, res) => {
  const u = await getUser(Number(req.params.id))
  res.json({ user: publicUser(u) })
})
app.get('/api/internal/users/:id/addresses', internalOnly, async (req, res) => res.json(await getAddresses(Number(req.params.id))))
app.post('/api/internal/users/find-or-create', internalOnly, async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  if (phone.length < 6) return res.status(400).json({ error: 'Invalid phone' })
  res.json({ user: publicUser(await findOrCreateUser(phone)) })
})
app.post('/api/internal/users/find-or-create-google', internalOnly, async (req, res) => {
  const p = req.body?.profile
  if (!p?.email) return res.status(400).json({ error: 'Invalid profile' })
  res.json({ user: publicUser(await findOrCreateGoogleUser(p)) })
})
// Wallet debit/credit/refund driven by the booking service.
app.post('/api/internal/users/:id/wallet', internalOnly, async (req, res) => {
  const { type, title, amount, ref } = req.body || {}
  const uid = Number(req.params.id)
  const u = await getUser(uid)
  if (!u) return res.status(404).json({ error: 'User not found' })
  const amt = Math.max(0, Math.round(Number(amount) || 0))
  if (type === 'debit' && u.wallet < amt) return res.status(402).json({ error: 'Insufficient wallet balance' })
  const bal = await addTransaction(uid, type === 'debit' ? 'debit' : 'credit', title || 'Wallet', amt, ref || null)
  res.json({ balance: bal })
})
// Admin customer management (called by the admin BFF).
app.get('/api/internal/customers', internalOnly, async (_q, res) => {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY id DESC')
  res.json(rows.map(publicUser))
})
app.patch('/api/internal/users/:id', internalOnly, async (req, res) => {
  const b = req.body || {}
  const u = await getUser(Number(req.params.id))
  if (!u) return res.status(404).json({ error: 'User not found' })
  const upd = await pool.query(
    'UPDATE users SET name=$1,email=$2,phone=$3,city=$4,status=$5 WHERE id=$6 RETURNING *',
    [b.name ?? u.name, b.email ?? u.email, b.phone ?? u.phone, b.city ?? u.city, b.status ?? u.status, u.id])
  res.json({ user: publicUser(upd.rows[0]) })
})

init()
  .then(() => app.listen(PORT, () => console.log(`[auth] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[auth] failed to start:', e.message); process.exit(1) })
