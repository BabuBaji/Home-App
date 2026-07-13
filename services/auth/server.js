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
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import crypto from 'node:crypto'
import { makePool, migrate, nowIso, internalOnly, publishEvent } from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4002)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5433/auth'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const CATALOG_URL = (process.env.CATALOG_URL || 'http://localhost:4001').replace(/\/$/, '')
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
    // Map-picker address details: floor, receiver phone, and the exact pinned coordinate.
    `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS floor TEXT`,
    `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS receiver_phone TEXT`,
    `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS lat REAL`,
    `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS lng REAL`,
    // Three-balance wallet: `wallet` is the Cash balance; add Promo + Reward Points and a status.
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_balance INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS reward_points INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_status TEXT NOT NULL DEFAULT 'active'`,
    // Ledger: which balance a row touched, and a typed reason (ADD_MONEY, CASHBACK, REFUND…).
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS balance_type TEXT NOT NULL DEFAULT 'cash'`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS kind TEXT`,
    // Referrals: each user has a unique code; referred_by links a new user to their referrer.
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_rewarded BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS dob DATE`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_users_refcode ON users(referral_code)`,
    `UPDATE users SET referral_code='HH'||upper(substr(md5(random()::text||id::text),1,6)) WHERE referral_code IS NULL`,
  ])
  console.log('[auth] Postgres ready (users, addresses, transactions, auth_identities)')
}

const REFERRAL_REWARD = 150

/* ---------- data helpers ---------- */
const publicUser = (u) => u && ({
  id: u.id, phone: u.phone, name: u.name, email: u.email, provider: u.provider,
  avatar: u.avatar, country: u.country, city: u.city, location: u.location,
  wallet: u.wallet, rating: u.rating, status: u.status, created: u.created,
  referralCode: u.referral_code, referredBy: u.referred_by, dob: u.dob || null,
  promoBalance: u.promo_balance || 0, rewardPoints: u.reward_points || 0, walletStatus: u.wallet_status || 'active',
})

async function getUser(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [id])
  return rows[0] || null
}

// Give a user a unique shareable referral code (idempotent — keeps an existing one).
async function ensureReferralCode(uid) {
  const u = await getUser(uid)
  if (u?.referral_code) return u.referral_code
  for (let i = 0; i < 6; i++) {
    const code = 'HH' + crypto.randomBytes(3).toString('hex').toUpperCase()
    try { await pool.query('UPDATE users SET referral_code=$1 WHERE id=$2', [code, uid]); return code } catch { /* collision → retry */ }
  }
  return null
}

async function provisionExtras(uid) {
  await ensureReferralCode(uid)
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

// A location value that is raw "lat,lng" coordinates rather than a human-readable address.
const looksLikeCoords = (s) => typeof s === 'string' && /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(s)
// Pull a 6-digit PIN out of an address string (India), if present.
const pinOf = (s) => (typeof s === 'string' ? (s.match(/\b\d{6}\b/) || [null])[0] : null)
async function ensureDefaultAddressFromLocation(uid, city, location, pincode) {
  if (!location && !city) return
  const pin = pincode || pinOf(location) || null
  const def = await pool.query('SELECT id, line, pincode FROM addresses WHERE user_id=$1 ORDER BY is_default DESC, id LIMIT 1', [uid])
  if (def.rows.length === 0) {
    // First address: seed "Home" from a human-readable value only (never raw coordinates).
    const line = looksLikeCoords(location) ? city : (location || city)
    if (!line) return
    await pool.query('INSERT INTO addresses (user_id,label,line,city,pincode,is_default) VALUES ($1,$2,$3,$4,$5,true)',
      [uid, 'Home', line, city || null, pin])
    return
  }
  // Repair a default address whose line is stale raw coordinates once a real address arrives;
  // also backfill the PIN on a default address that doesn't have one yet.
  if (location && !looksLikeCoords(location) && looksLikeCoords(def.rows[0].line)) {
    await pool.query('UPDATE addresses SET line=$1, city=COALESCE($2,city), pincode=COALESCE($3,pincode) WHERE id=$4',
      [location, city || null, pin, def.rows[0].id])
  } else if (pin && !def.rows[0].pincode) {
    await pool.query('UPDATE addresses SET pincode=$1 WHERE id=$2', [pin, def.rows[0].id])
  }
}

// Reverse-geocode "lat,lng" to "Area, City - PIN" via the catalog's /api/reverse-geocode (Google when
// the key is set, else Nominatim). Centralised there so pincodes are accurate. Cached in memory
// (rounded key) so repeated app-opens don't re-hit the geocoder.
const geoCache = new Map()
async function reverseGeocodeServer(location) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(location || '')
  if (!m) return null
  const lat = Number(m[1]), lng = Number(m[2])
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
  if (geoCache.has(key)) return geoCache.get(key)
  try {
    const r = await fetch(`${CATALOG_URL}/api/reverse-geocode?lat=${lat}&lng=${lng}`, { headers: { Accept: 'application/json' } })
    if (!r.ok) return null
    const j = await r.json()
    const out = j && j.label ? { label: j.label, pincode: j.pincode || pinOf(j.label) || null } : null
    if (out) geoCache.set(key, out)
    return out
  } catch { return null }
}

// Decide what to persist as the display location. Never store raw coordinates: keep an already
// chosen address, else reverse-geocode the incoming coords to "Area, City - PIN".
// Returns { value, pincode }.
async function normalizeLocation(incoming, existing) {
  if (incoming == null) return { value: existing ?? null, pincode: pinOf(existing) }
  if (!looksLikeCoords(incoming)) return { value: incoming, pincode: pinOf(incoming) }
  if (existing && !looksLikeCoords(existing)) return { value: existing, pincode: pinOf(existing) }
  const g = await reverseGeocodeServer(incoming)
  if (!g) return { value: existing || null, pincode: pinOf(existing) }
  return { value: g.label, pincode: g.pincode }
}

async function getAddresses(uid) {
  const { rows } = await pool.query('SELECT * FROM addresses WHERE user_id=$1 ORDER BY is_default DESC, id', [uid])
  return rows
}

const BAL_COL = { cash: 'wallet', promo: 'promo_balance', points: 'reward_points' }
// The ONLY way a balance changes — mutates one balance and writes a ledger row with the balance-after.
async function walletMutate(uid, { balanceType = 'cash', type, kind, title, amount, ref }) {
  const u = await getUser(uid)
  if (!u) throw new Error('User not found')
  const col = BAL_COL[balanceType] || 'wallet'
  const amt = Math.max(0, Math.round(Number(amount) || 0))
  const next = (type === 'debit' ? (u[col] || 0) - amt : (u[col] || 0) + amt)
  if (next < 0) throw Object.assign(new Error('Insufficient balance'), { code: 402 })
  await pool.query(`UPDATE users SET ${col}=$1 WHERE id=$2`, [next, uid])
  await pool.query('INSERT INTO transactions (user_id,type,title,amount,balance,ref,kind,balance_type,created) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [uid, type, title, amt, next, ref ?? null, kind ?? null, balanceType, nowIso()])
  return next
}
// Spend the wallet for a booking: Promo balance first, then Cash.
async function walletSpend(uid, amount, { title, ref, kind = 'BOOKING_PAYMENT' }) {
  const u = await getUser(uid)
  const amt = Math.max(0, Math.round(Number(amount) || 0))
  if ((u.promo_balance || 0) + (u.wallet || 0) < amt) throw Object.assign(new Error('Insufficient wallet balance'), { code: 402 })
  const fromPromo = Math.min(u.promo_balance || 0, amt)
  if (fromPromo > 0) await walletMutate(uid, { balanceType: 'promo', type: 'debit', kind: kind === 'BOOKING_PAYMENT' && amt > fromPromo ? 'PARTIAL_PAYMENT' : kind, title, amount: fromPromo, ref })
  if (amt - fromPromo > 0) await walletMutate(uid, { balanceType: 'cash', type: 'debit', kind, title, amount: amt - fromPromo, ref })
  const nu = await getUser(uid)
  return { balance: nu.wallet, promo: nu.promo_balance, total: (nu.wallet || 0) + (nu.promo_balance || 0) }
}
// Back-compat cash credit/debit used by existing callers.
async function addTransaction(uid, type, title, amount, ref, kind) {
  return walletMutate(uid, { balanceType: 'cash', type: type === 'debit' ? 'debit' : 'credit', kind: kind || (type === 'debit' ? 'DEBIT' : 'CREDIT'), title, amount, ref })
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
  // Convert any raw "lat,lng" into a human-readable "Area, City - PIN" before saving (keeps a chosen address).
  const norm = b.location !== undefined ? await normalizeLocation(b.location, u.location) : { value: u.location, pincode: pinOf(u.location) }
  const upd = await pool.query(
    'UPDATE users SET name=$1, email=$2, phone=$3, country=$4, city=$5, location=$6 WHERE id=$7 RETURNING *',
    [b.name ?? u.name, b.email ?? u.email, b.phone ?? u.phone, b.country ?? u.country, b.city ?? u.city, norm.value, u.id])
  if (b.location || b.city) await ensureDefaultAddressFromLocation(u.id, upd.rows[0].city, upd.rows[0].location, norm.pincode)
  res.json({ user: publicUser(upd.rows[0]) })
})

/* ---------- referrals ---------- */
// A new user applies a friend's referral code (once). The referrer is rewarded later, when this
// user completes their first booking (see /api/internal/users/:id/referral-complete).
app.post('/api/referral/apply', auth, async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase()
  if (!code) return res.status(400).json({ error: 'Enter a referral code' })
  const me = await getUser(req.user.id)
  if (me.referred_by) return res.status(400).json({ error: 'You’ve already used a referral code' })
  if (me.referral_code && code === me.referral_code) return res.status(400).json({ error: 'You can’t use your own code' })
  const ref = (await pool.query('SELECT id,name FROM users WHERE referral_code=$1', [code])).rows[0]
  if (!ref) return res.status(404).json({ error: 'Invalid referral code' })
  if (ref.id === req.user.id) return res.status(400).json({ error: 'You can’t use your own code' })
  await pool.query('UPDATE users SET referred_by=$1 WHERE id=$2', [ref.id, req.user.id])
  res.json({ ok: true, referrer: ref.name || 'a friend', reward: REFERRAL_REWARD })
})

/* ---------- addresses ---------- */
app.get('/api/addresses', auth, async (req, res) => res.json(await getAddresses(req.user.id)))
app.post('/api/addresses', auth, async (req, res) => {
  const a = req.body || {}
  // Human-readable one-liner: flat/floor/building first, then the map locality + pincode.
  const line = a.line || [a.house, a.floor && `Floor ${a.floor}`, a.apartment, a.street, a.landmark, a.city, a.pincode].filter(Boolean).join(', ')
  const receiverPhone = a.receiver_phone ?? a.receiverPhone ?? null
  // First address (or an explicit makeDefault) becomes the default → drives the customer's zone/pricing.
  const existing = (await pool.query('SELECT count(*)::int n FROM addresses WHERE user_id=$1', [req.user.id])).rows[0].n
  const makeDefault = a.makeDefault === true || existing === 0
  if (makeDefault) await pool.query('UPDATE addresses SET is_default=false WHERE user_id=$1', [req.user.id])
  const { rows } = await pool.query(
    `INSERT INTO addresses (user_id,label,line,house,floor,apartment,street,landmark,city,pincode,receiver_phone,lat,lng,is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [req.user.id, a.label || 'Other', line, a.house || null, a.floor || null, a.apartment || null, a.street || null,
      a.landmark || null, a.city || null, a.pincode || null, receiverPhone, a.lat ?? null, a.lng ?? null, makeDefault])
  res.status(201).json(rows[0])
})
app.patch('/api/addresses/:id', auth, async (req, res) => {
  const id = Number(req.params.id)
  const a = req.body || {}
  const cur = (await pool.query('SELECT * FROM addresses WHERE id=$1 AND user_id=$2', [id, req.user.id])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Not found' })
  const m = { ...cur, ...a }
  const receiverPhone = a.receiver_phone ?? a.receiverPhone ?? cur.receiver_phone
  const line = a.line || [m.house, m.floor && `Floor ${m.floor}`, m.apartment, m.street, m.landmark, m.city, m.pincode].filter(Boolean).join(', ')
  await pool.query(
    `UPDATE addresses SET label=$1,line=$2,house=$3,floor=$4,apartment=$5,street=$6,landmark=$7,city=$8,pincode=$9,receiver_phone=$10,lat=$11,lng=$12 WHERE id=$13 AND user_id=$14`,
    [m.label || 'Home', line, m.house || null, m.floor || null, m.apartment || null, m.street || null, m.landmark || null,
      m.city || null, m.pincode || null, receiverPhone || null, a.lat ?? cur.lat, a.lng ?? cur.lng, id, req.user.id])
  res.json((await pool.query('SELECT * FROM addresses WHERE id=$1', [id])).rows[0])
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
  const u = await getUser(req.user.id)
  const { rows } = await pool.query('SELECT * FROM transactions WHERE user_id=$1 ORDER BY id DESC', [req.user.id])
  const cash = u.wallet || 0, promo = u.promo_balance || 0, points = u.reward_points || 0
  res.json({
    balance: cash, cash, promo, points, total: cash + promo,
    status: u.wallet_status || 'active', cashback: promo, transactions: rows,
  })
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
// Full wallet ledger for a user (admin view).
app.get('/api/internal/users/:id/transactions', internalOnly, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 200', [Number(req.params.id)])
  res.json(rows)
})
// Admin sets the wallet status (active / frozen / blocked / inactive).
app.post('/api/internal/users/:id/wallet-status', internalOnly, async (req, res) => {
  const status = String(req.body?.status || '').toLowerCase()
  if (!['active', 'frozen', 'blocked', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' })
  await pool.query('UPDATE users SET wallet_status=$1 WHERE id=$2', [status, Number(req.params.id)])
  res.json({ ok: true, status })
})
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
  const { type, title, amount, ref, kind, balance, admin } = req.body || {}
  const uid = Number(req.params.id)
  const u = await getUser(uid)
  if (!u) return res.status(404).json({ error: 'User not found' })
  const amt = Math.max(0, Math.round(Number(amount) || 0))
  const status = u.wallet_status || 'active'
  const bt = balance === 'promo' || balance === 'points' ? balance : 'cash'
  try {
    if (type === 'debit') {
      // Customer spending is blocked on a frozen/blocked wallet; admin debits bypass.
      if (!admin && status !== 'active') return res.status(403).json({ error: `Wallet is ${status}` })
      if (bt !== 'cash') { const bal = await walletMutate(uid, { balanceType: bt, type: 'debit', kind, title: title || 'Wallet', amount: amt, ref: ref || null }); return res.json({ balance: u.wallet, [bt]: bal }) }
      const r = await walletSpend(uid, amt, { title: title || 'Booking payment', ref: ref || null, kind }) // promo-first, then cash
      return res.json(r)
    }
    // Credits (refund / cashback / referral / admin) are always allowed.
    const bal = await walletMutate(uid, { balanceType: bt, type: 'credit', kind, title: title || 'Wallet', amount: amt, ref: ref || null })
    return res.json({ balance: bt === 'cash' ? bal : u.wallet, [bt]: bal })
  } catch (e) {
    return res.status(e.code === 402 ? 402 : 500).json({ error: e.message || 'Wallet error' })
  }
})

// Called by the booking service when a user completes a booking. If this user was referred and the
// referrer hasn't been paid yet, credit the referrer's Promo balance — exactly once.
app.post('/api/internal/users/:id/referral-complete', internalOnly, async (req, res) => {
  const uid = Number(req.params.id)
  const u = await getUser(uid)
  if (!u || !u.referred_by || u.referral_rewarded) return res.json({ ok: true, rewarded: false })
  // Atomically flip the flag so concurrent completions reward the referrer only once.
  const flip = await pool.query('UPDATE users SET referral_rewarded=true WHERE id=$1 AND referral_rewarded=false RETURNING id', [uid])
  if (!flip.rowCount) return res.json({ ok: true, rewarded: false })
  try {
    await walletMutate(u.referred_by, { balanceType: 'promo', type: 'credit', kind: 'REFERRAL_BONUS', title: `Referral bonus — ${u.name || 'a friend'} joined`, amount: REFERRAL_REWARD, ref: `REF${uid}` })
  } catch (e) { console.error('[auth] referral reward failed:', e.message) }
  res.json({ ok: true, rewarded: true })
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
  .catch((e) => { console.error('[auth] failed to start:', e.message); process.exit(1) });
