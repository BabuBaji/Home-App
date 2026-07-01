// HomeHelp Auth Service
// ---------------------
// Owns CUSTOMER identity + OTP/login on its OWN Postgres database (database-per-service).
// It handles the whole login flow (/api/auth/*), records every identity that has ever
// authenticated, and issues the session token. It does NOT own the user *profile* (wallet,
// bookings FK, etc.) — that stays in the monolith — so on first login it provisions the
// profile row via a service-to-service call and keeps the same `demo-<id>` token format,
// meaning existing token validation everywhere keeps working unchanged.
import express from 'express'
import pg from 'pg'

const PORT = Number(process.env.PORT || 4002)
const MONOLITH_URL = (process.env.MONOLITH_URL || 'http://localhost:4000').replace(/\/$/, '')
const INTERNAL_KEY = process.env.INTERNAL_KEY || ''
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5433/auth'
const DEV_OTP = process.env.DEV_OTP || '4321'

const pool = new pg.Pool({ connectionString: DATABASE_URL })
const otpStore = new Map() // phone -> otp (in-memory; fine for OTP's short TTL)

async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS auth_identities (
    id BIGINT PRIMARY KEY,          -- same id as the monolith user (profile) row
    phone TEXT,
    email TEXT,
    provider TEXT,                  -- phone | google
    name TEXT,
    created TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login TIMESTAMPTZ
  )`)
  console.log('[auth] Postgres ready (auth_identities)')
}

// Record/refresh the identity that just authenticated (auth-owned data).
async function recordIdentity(user, provider) {
  await pool.query(
    `INSERT INTO auth_identities (id, phone, email, provider, name, last_login)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (id) DO UPDATE SET phone=EXCLUDED.phone, email=EXCLUDED.email,
       provider=EXCLUDED.provider, name=EXCLUDED.name, last_login=now()`,
    [user.id, user.phone || null, user.email || null, provider, user.name || null],
  )
}

// service-to-service: ask the monolith to find/create the user PROFILE row.
async function provisionProfile(path, body) {
  const r = await fetch(`${MONOLITH_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': INTERNAL_KEY },
    body: JSON.stringify(body),
  })
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `profile service ${r.status}`) }
  return (await r.json()).user
}

// Decode a Google credential (JWT) payload — same logic the monolith used.
function decodeJwt(t) {
  try { return JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) } catch { return null }
}

const app = express()
app.use(express.json())

app.get('/health', (_q, res) => res.json({ service: 'auth', ok: true }))

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
  try {
    const user = await provisionProfile('/api/internal/users/find-or-create', { phone })
    await recordIdentity(user, 'phone')
    res.json({ token: 'demo-' + user.id, user })
  } catch (e) { res.status(502).json({ error: e.message }) }
})

app.post('/api/auth/google', async (req, res) => {
  let profile = null
  if (req.body?.credential) {
    const j = decodeJwt(req.body.credential)
    if (!j?.email) return res.status(401).json({ error: 'Invalid Google credential' })
    profile = { email: j.email, name: j.name || 'Google User', avatar: j.picture }
  } else if (req.body?.demo) {
    profile = { email: 'rahul.sharma@gmail.com', name: 'Rahul Sharma' }
  } else {
    return res.status(400).json({ error: 'Missing Google credential' })
  }
  try {
    const user = await provisionProfile('/api/internal/users/find-or-create-google', { profile })
    await recordIdentity(user, 'google')
    res.json({ token: 'demo-' + user.id, user })
  } catch (e) { res.status(502).json({ error: e.message }) }
})

init()
  .then(() => app.listen(PORT, () => console.log(`[auth] service on http://localhost:${PORT} (monolith: ${MONOLITH_URL})`)))
  .catch((e) => { console.error('[auth] failed to start:', e.message); process.exit(1) })
