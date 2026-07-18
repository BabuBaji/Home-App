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
import { makePool, migrate, nowIso, internalOnly, publishEvent, smsConfigured, sendOtpSms, getSetting } from '@homehelp/shared'
import { signToken, tokenSubject, assertJwtSecret } from '@homehelp/shared/jwt.js'

assertJwtSecret('auth') // refuse to boot without a signing secret rather than issue forgeable sessions

const PORT = Number(process.env.PORT || 4002)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5433/auth'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const CATALOG_URL = (process.env.CATALOG_URL || 'http://localhost:4001').replace(/\/$/, '')
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '') // owns `settings` (SMS provider keys)
/* DEV_OTP pins the code to a known value AND returns it in the response, so demos work with no SMS
 * provider wired up. It is the ONLY way a code is ever disclosed and must be set explicitly —
 * unset means a random code that is never disclosed. It used to default to '4321', i.e. disclosure
 * was ON by default: two requests against any phone number minted a session for it, and
 * findOrCreateUser would create the account. Leave UNSET in production. */
const DEV_OTP = process.env.DEV_OTP || ''
const WELCOME_BONUS = 1240
const OTP_TTL_MS = 5 * 60 * 1000
const OTP_MAX_ATTEMPTS = 5
const OTP_MAX_PER_HOUR = 5
const OTP_RESEND_WAIT_MS = 30 * 1000

const pool = makePool(DATABASE_URL)
/* phone -> { hash, expires, attempts, sent, windowStarted }. In-memory is fine for a code that
 * lives 5 minutes; it just means a restart invalidates outstanding codes. The value is HASHED so
 * a heap dump / log of this map isn't a list of live credentials. */
const otpStore = new Map()
const OTP_PEPPER = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')
const hashOtp = (phone, code) => crypto.createHash('sha256').update(`${phone}:${code}:${OTP_PEPPER}`).digest('hex')
const newOtp = () => DEV_OTP || String(crypto.randomInt(1000, 10000))

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
    // Home profile captured while adding an address: house size (BHK) + appliance/room counts.
    `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS home_size TEXT`,
    `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS bedrooms INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS bathrooms INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS fans INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS acs INTEGER NOT NULL DEFAULT 0`,
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
    // Wallet preferences (Wallet Settings screen). Defaults match the previous implicit behaviour:
    // alerts and the low-balance reminder on, balance visible, no auto top-up.
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_txn BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_low_balance BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_balance BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_topup BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_topup_amount INTEGER NOT NULL DEFAULT 500`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_topup_threshold INTEGER NOT NULL DEFAULT 100`,
    // Gift cards: a redeemed card credits Promo and is kept here so the customer can see what is
    // still on it and when it lapses. `code` is unique per user (a card cannot be redeemed twice).
    `CREATE TABLE IF NOT EXISTS gift_cards (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, code TEXT NOT NULL,
      label TEXT, amount INTEGER NOT NULL, balance INTEGER NOT NULL,
      expires DATE, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_giftcard_user_code ON gift_cards(user_id, upper(code))`,
    `CREATE INDEX IF NOT EXISTS ix_giftcard_user ON gift_cards(user_id)`,
    // --- Module 12 (Profile) ---
    // Language preference + granular notification toggles (default everything on, matching prior behaviour).
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_all BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_booking_confirm BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_booking_reminder BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_service_updates BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_offers BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_payments BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_marketing BOOLEAN NOT NULL DEFAULT false`,
    // Family members (name + relation + phone). No account link — just the customer's own list.
    `CREATE TABLE IF NOT EXISTS family_members (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, relation TEXT,
      phone TEXT, is_primary BOOLEAN NOT NULL DEFAULT false, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS ix_family_user ON family_members(user_id)`,
    // Saved payment methods — DISPLAY DATA ONLY (kind + label + masked detail). Never store full
    // card numbers/CVV; a real gateway (Razorpay) tokenises those. Safe to keep here.
    `CREATE TABLE IF NOT EXISTS payment_methods (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL,
      detail TEXT, is_primary BOOLEAN NOT NULL DEFAULT false, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS ix_paymethod_user ON payment_methods(user_id)`,
    // --- Module 13 (AI Home) ---
    // Home reminders: water can / garbage / pest control. `config` holds the per-kind fields
    // (address, canType, pickupType, serviceType…). One row per kind per user.
    `CREATE TABLE IF NOT EXISTS home_reminders (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL,
      next_date DATE, frequency_days INTEGER, enabled BOOLEAN NOT NULL DEFAULT true,
      config JSONB NOT NULL DEFAULT '{}', created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_reminder_user_kind ON home_reminders(user_id, kind)`,
    // Recurring cleaning plans (the planner). service_id references a catalog service.
    `CREATE TABLE IF NOT EXISTS cleaning_plans (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, service_id TEXT NOT NULL, name TEXT NOT NULL,
      frequency TEXT NOT NULL, next_date DATE, active BOOLEAN NOT NULL DEFAULT true, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS ix_plan_user ON cleaning_plans(user_id)`,
    // --- Module 10 (Membership / Subscription) ---
    // One row per user's CURRENT membership (status='active' or 'cancelled' until it lapses).
    // Price is the amount charged for the cycle; renews_at is both the next-renewal date and the
    // valid-till date. Usage counters accrue as the member books/saves.
    `CREATE TABLE IF NOT EXISTS memberships (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL,
      plan TEXT NOT NULL, cycle TEXT NOT NULL, price INTEGER NOT NULL, method TEXT,
      status TEXT NOT NULL DEFAULT 'active', auto_renew BOOLEAN NOT NULL DEFAULT true,
      total_saved INTEGER NOT NULL DEFAULT 0, addons_used INTEGER NOT NULL DEFAULT 0, bookings_count INTEGER NOT NULL DEFAULT 0,
      started TIMESTAMPTZ NOT NULL DEFAULT now(), renews_at TIMESTAMPTZ NOT NULL,
      cancelled_at TIMESTAMPTZ, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS ix_membership_user ON memberships(user_id)`,
    // Membership history: subscribed / renewed / cancelled / saved / addon events, for Usage History.
    `CREATE TABLE IF NOT EXISTS membership_ledger (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, membership_id INTEGER,
      event TEXT NOT NULL, detail TEXT, amount INTEGER NOT NULL DEFAULT 0,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS ix_memledger_user ON membership_ledger(user_id)`,
    // Per-month membership usage: how many discounted bookings + how much saved this month. Powers the
    // "N of M discounts used" cap and the dashboard savings. One row per (membership, YYYY-MM).
    `CREATE TABLE IF NOT EXISTS membership_usage (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, membership_id INTEGER NOT NULL,
      month TEXT NOT NULL, discounted_orders INTEGER NOT NULL DEFAULT 0, saved INTEGER NOT NULL DEFAULT 0,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_memusage_month ON membership_usage(membership_id, month)`,
    // Backfill `kind` on rows written before the ledger was typed. These three titles are the exact
    // strings this service and the booking/payment services write, so the match is precise rather
    // than a guess at free text — without it, refunds are invisible to the Refund filter.
    `UPDATE transactions SET kind='REFUND' WHERE kind IS NULL AND title LIKE 'Refund %'`,
    `UPDATE transactions SET kind='ADD_MONEY' WHERE kind IS NULL AND title='Added to wallet'`,
    `UPDATE transactions SET kind='WELCOME_BONUS' WHERE kind IS NULL AND title='Welcome bonus'`,
    // Profile: gender + preferred language (captured/edited from the admin profile page).
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT`,
    // Per-channel communication opt-in. Default on — matches the previous implicit "reachable" behaviour.
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS comm_whatsapp BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS comm_sms BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS comm_email BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS comm_push BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS comm_promo BOOLEAN NOT NULL DEFAULT true`,
    // Internal ops notes an admin pins to a customer (from the Customers screen "Add Note" action).
    `CREATE TABLE IF NOT EXISTS customer_notes (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL,
      body TEXT NOT NULL, author TEXT, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS ix_custnote_user ON customer_notes(user_id)`,
  ])
  console.log('[auth] Postgres ready (users, addresses, transactions, auth_identities)')
}

const REFERRAL_REWARD = 150

/**
 * Gift-card catalog: code -> { label, amount, days }. Comes only from the admin `gift_cards`
 * setting (a JSON map). There is deliberately NO built-in list: a hardcoded code would be a real
 * code that mints real balance, so the cards that exist are exactly the ones someone configured.
 * Unset ⇒ no code redeems.
 *
 * Example value:  {"WELCOME100": {"label": "Welcome", "amount": 100, "days": 30}}
 */
async function giftCardCatalog() {
  const raw = await getSetting(ADMIN_URL, 'gift_cards', '')
  if (!raw) return {}
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!j || typeof j !== 'object') return {}
    // Keep only well-formed entries — a malformed row must not mint an arbitrary balance.
    const out = {}
    for (const [code, c] of Object.entries(j)) {
      const amount = Math.round(Number(c?.amount) || 0)
      if (!amount || amount <= 0) continue
      out[String(code).toUpperCase()] = { label: String(c.label || code), amount, days: Number(c?.days) || 0 }
    }
    return out
  } catch { return {} }
}

/**
 * The amount chips on Add Money, from the admin `wallet_topup_presets` setting (CSV, e.g.
 * "500,1000,2000,5000"). Unset ⇒ no chips; the customer just types an amount.
 */
async function topupPresets() {
  const raw = String((await getSetting(ADMIN_URL, 'wallet_topup_presets', '')) || '')
  return raw.split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 6)
}

/* ---------- data helpers ---------- */
const publicUser = (u) => u && ({
  id: u.id, phone: u.phone, name: u.name, email: u.email, provider: u.provider,
  avatar: u.avatar, country: u.country, city: u.city, location: u.location,
  wallet: u.wallet, rating: u.rating, status: u.status, created: u.created,
  referralCode: u.referral_code, referredBy: u.referred_by, dob: u.dob || null,
  promoBalance: u.promo_balance || 0, rewardPoints: u.reward_points || 0, walletStatus: u.wallet_status || 'active',
  gender: u.gender || null, language: u.language || null,
  comm: {
    whatsapp: u.comm_whatsapp ?? true, sms: u.comm_sms ?? true, email: u.comm_email ?? true,
    push: u.comm_push ?? true, promo: u.comm_promo ?? true,
  },
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
    'INSERT INTO transactions (user_id,type,title,amount,balance,created,kind) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [uid, 'credit', 'Welcome bonus', WELCOME_BONUS, WELCOME_BONUS, nowIso(), 'WELCOME_BONUS'])
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

// Coerce a home-profile count to a non-negative integer (0 when absent/invalid).
function intOr0(v) { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0 }

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
// Verifies a SIGNED token. Previously this parsed the id out of the string, so `Bearer demo-1`
// was a full session for customer 1 — no OTP, no login, any account.
async function auth(req, res, next) {
  const id = tokenSubject(req.headers.authorization, 'customer')
  const u = Number.isFinite(id) ? await getUser(id) : null
  if (!u) return res.status(401).json({ error: 'Not authenticated' })
  req.user = u
  next()
}

/* ---------- login ---------- */
app.post('/api/auth/request-otp', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  if (phone.length < 6) return res.status(400).json({ error: 'Enter a valid mobile number' })
  const prev = otpStore.get(phone)
  const now = Date.now()
  if (prev) {
    if (now - prev.sentAt < OTP_RESEND_WAIT_MS) {
      return res.status(429).json({ error: `Please wait ${Math.ceil((OTP_RESEND_WAIT_MS - (now - prev.sentAt)) / 1000)}s before requesting another code.` })
    }
    if (now - prev.windowStarted < 3600_000 && prev.sent >= OTP_MAX_PER_HOUR) {
      return res.status(429).json({ error: 'Too many codes requested. Try again in an hour.' })
    }
  }
  const fresh = !prev || now - prev.windowStarted >= 3600_000
  const code = newOtp()
  otpStore.set(phone, {
    hash: hashOtp(phone, code), expires: now + OTP_TTL_MS, attempts: 0,
    sent: fresh ? 1 : prev.sent + 1, windowStarted: fresh ? now : prev.windowStarted, sentAt: now,
  })
  // Deliver it. Disclosure in the response is only the fallback for an unconfigured provider —
  // never both: if the SMS goes out, the code must not also come back over HTTP.
  if (await smsConfigured(ADMIN_URL)) {
    const sent = await sendOtpSms(ADMIN_URL, phone, code)
    if (!sent.ok) {
      console.error(`[auth] OTP SMS failed for ${phone}: ${sent.error}`)
      return res.status(502).json({ error: 'Could not send the code right now. Please try again.' })
    }
    return res.json({ ok: true })
  }
  const exposed = !!DEV_OTP
  if (!exposed) console.log(`[auth] OTP issued for ${phone} — no SMS provider configured, so it cannot be delivered.`)
  res.json({ ok: true, ...(exposed ? { devOtp: code } : {}) })
})
app.post('/api/auth/verify-otp', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const otp = String(req.body?.otp || '').trim()
  const rec = otpStore.get(phone)
  if (!rec) return res.status(401).json({ error: 'Request a code first' })
  if (Date.now() > rec.expires) { otpStore.delete(phone); return res.status(401).json({ error: 'That code has expired. Request a new one.' }) }
  if (rec.attempts >= OTP_MAX_ATTEMPTS) { otpStore.delete(phone); return res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' }) }
  const ok = otp.length === 4 && crypto.timingSafeEqual(Buffer.from(hashOtp(phone, otp), 'hex'), Buffer.from(rec.hash, 'hex'))
  if (!ok) { rec.attempts += 1; return res.status(401).json({ error: 'Invalid OTP' }) }
  otpStore.delete(phone) // single use
  const u = await findOrCreateUser(phone)
  await recordIdentity(u, 'phone')
  publishEvent(REDIS_URL, 'customer.login', { userId: u.id, name: u.name, detail: `Signed in (${phone})` })
  res.json({ token: signToken('customer', u.id), user: publicUser(u) })
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
  res.json({ token: signToken('customer', u.id), user: publicUser(u) })
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
    `INSERT INTO addresses (user_id,label,line,house,floor,apartment,street,landmark,city,pincode,receiver_phone,lat,lng,home_size,bedrooms,bathrooms,fans,acs,is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [req.user.id, a.label || 'Other', line, a.house || null, a.floor || null, a.apartment || null, a.street || null,
      a.landmark || null, a.city || null, a.pincode || null, receiverPhone, a.lat ?? null, a.lng ?? null,
      a.home_size || null, intOr0(a.bedrooms), intOr0(a.bathrooms), intOr0(a.fans), intOr0(a.acs), makeDefault])
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
    `UPDATE addresses SET label=$1,line=$2,house=$3,floor=$4,apartment=$5,street=$6,landmark=$7,city=$8,pincode=$9,receiver_phone=$10,lat=$11,lng=$12,home_size=$13,bedrooms=$14,bathrooms=$15,fans=$16,acs=$17 WHERE id=$18 AND user_id=$19`,
    [m.label || 'Home', line, m.house || null, m.floor || null, m.apartment || null, m.street || null, m.landmark || null,
      m.city || null, m.pincode || null, receiverPhone || null, a.lat ?? cur.lat, a.lng ?? cur.lng,
      m.home_size || null, intOr0(m.bedrooms), intOr0(m.bathrooms), intOr0(m.fans), intOr0(m.acs), id, req.user.id])
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
  const [u, { rows }, presets] = await Promise.all([
    getUser(req.user.id),
    pool.query('SELECT * FROM transactions WHERE user_id=$1 ORDER BY id DESC', [req.user.id]),
    topupPresets(),
  ])
  const cash = u.wallet || 0, promo = u.promo_balance || 0, points = u.reward_points || 0
  res.json({
    balance: cash, cash, promo, points, total: cash + promo,
    status: u.wallet_status || 'active', cashback: promo, transactions: rows,
    // Cash is spendable anywhere (incl. withdrawal); Promo is locked to bookings — that IS the
    // available/locked split the wallet screen shows. Not a separate stored balance.
    available: cash, locked: promo,
    hideBalance: !!u.hide_balance,
    topupPresets: presets,
  })
})
app.post('/api/wallet/add', auth, async (req, res) => {
  const bal = await addTransaction(req.user.id, 'credit', 'Added to wallet', Math.max(1, Number(req.body?.amount) || 0), null, 'ADD_MONEY')
  res.json({ balance: bal })
})

/* ---------- wallet: cashback, referrals, gift cards, settings ---------- */

// Promo balance IS the cashback purse: credits are earned, debits are spent on bookings.
app.get('/api/wallet/cashback', auth, async (req, res) => {
  const u = await getUser(req.user.id)
  const { rows } = await pool.query(
    `SELECT id, type, title, amount, kind, ref, created FROM transactions
     WHERE user_id=$1 AND balance_type='promo' ORDER BY id DESC`, [req.user.id])
  const history = rows.map((r) => ({
    id: r.id, title: r.title, amount: r.amount, created: r.created, kind: r.kind,
    state: r.type === 'credit' ? 'earned' : 'used',
  }))
  const lifetime = rows.filter((r) => r.type === 'credit').reduce((s, r) => s + r.amount, 0)
  // No expiry is modelled on promo credits, so nothing can be reported as expired.
  res.json({ lifetime, usable: u.promo_balance || 0, expired: 0, history })
})

app.get('/api/wallet/referrals', auth, async (req, res) => {
  const u = await getUser(req.user.id)
  const [{ rows: refs }, { rows: txns }] = await Promise.all([
    pool.query('SELECT id, name, referral_rewarded, created FROM users WHERE referred_by=$1 ORDER BY id DESC', [req.user.id]),
    pool.query(`SELECT id, title, amount, ref, created FROM transactions
                WHERE user_id=$1 AND kind='REFERRAL_BONUS' ORDER BY id DESC`, [req.user.id]),
  ])
  res.json({
    code: u.referral_code, reward: REFERRAL_REWARD,
    total: refs.length,
    successful: refs.filter((r) => r.referral_rewarded).length,
    earned: txns.reduce((s, t) => s + t.amount, 0),
    history: txns.map((t) => ({ id: t.id, title: t.title, amount: t.amount, created: t.created, ref: t.ref })),
  })
})

app.get('/api/wallet/gift-cards', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, code, label, amount, balance, expires, created FROM gift_cards
     WHERE user_id=$1 ORDER BY id DESC`, [req.user.id])
  const active = rows.filter((c) => c.balance > 0 && (!c.expires || new Date(c.expires) >= new Date()))
  res.json({ balance: active.reduce((s, c) => s + c.balance, 0), active: active.length, cards: rows })
})

// Redeem a gift card. The value lands in Promo (the same purse cashback uses), so it spends through
// the existing booking flow with no payment-path change.
app.post('/api/wallet/gift-cards', auth, async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase()
  if (!/^[A-Z0-9]{4,20}$/.test(code)) return res.status(400).json({ error: 'Enter a valid gift card code' })
  const card = (await giftCardCatalog())[code]
  if (!card) return res.status(404).json({ error: 'That gift card code is not valid' })
  const dup = await pool.query('SELECT id FROM gift_cards WHERE user_id=$1 AND upper(code)=$2', [req.user.id, code])
  if (dup.rowCount) return res.status(409).json({ error: 'This gift card has already been added' })
  const expires = card.days ? new Date(Date.now() + card.days * 86400000).toISOString().slice(0, 10) : null
  const { rows } = await pool.query(
    `INSERT INTO gift_cards (user_id, code, label, amount, balance, expires) VALUES ($1,$2,$3,$4,$4,$5) RETURNING *`,
    [req.user.id, code, card.label, card.amount, expires])
  await walletMutate(req.user.id, { balanceType: 'promo', type: 'credit', kind: 'GIFT_CARD', title: `Gift card ${code}`, amount: card.amount, ref: code })
  res.json({ ok: true, card: rows[0] })
})

app.get('/api/wallet/settings', auth, async (req, res) => {
  const u = await getUser(req.user.id)
  res.json({
    autoTopup: !!u.auto_topup, autoTopupAmount: u.auto_topup_amount ?? 500, autoTopupThreshold: u.auto_topup_threshold ?? 100,
    notifyTxn: !!u.notify_txn, notifyLowBalance: !!u.notify_low_balance, hideBalance: !!u.hide_balance,
  })
})

app.patch('/api/wallet/settings', auth, async (req, res) => {
  const map = {
    autoTopup: 'auto_topup', notifyTxn: 'notify_txn', notifyLowBalance: 'notify_low_balance', hideBalance: 'hide_balance',
    autoTopupAmount: 'auto_topup_amount', autoTopupThreshold: 'auto_topup_threshold',
  }
  const sets = [], vals = []
  for (const [k, col] of Object.entries(map)) {
    if (req.body?.[k] === undefined) continue
    const v = col.startsWith('auto_topup_') ? Math.max(0, Math.round(Number(req.body[k]) || 0)) : !!req.body[k]
    sets.push(`${col}=$${sets.length + 1}`); vals.push(v)
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })
  vals.push(req.user.id)
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals)
  const u = await getUser(req.user.id)
  res.json({
    autoTopup: !!u.auto_topup, autoTopupAmount: u.auto_topup_amount ?? 500, autoTopupThreshold: u.auto_topup_threshold ?? 100,
    notifyTxn: !!u.notify_txn, notifyLowBalance: !!u.notify_low_balance, hideBalance: !!u.hide_balance,
  })
})

/* ---------- profile: notifications, language, family, payment methods (Module 12) ---------- */

const NOTIF = {
  all: 'notify_all', bookingConfirm: 'notify_booking_confirm', bookingReminder: 'notify_booking_reminder',
  serviceUpdates: 'notify_service_updates', offers: 'notify_offers', walletTxn: 'notify_txn',
  payments: 'notify_payments', marketing: 'notify_marketing',
}
const notifOut = (u) => Object.fromEntries(Object.entries(NOTIF).map(([k, col]) => [k, !!u[col]]))

app.get('/api/profile/notifications', auth, async (req, res) => res.json(notifOut(await getUser(req.user.id))))
app.patch('/api/profile/notifications', auth, async (req, res) => {
  const sets = [], vals = []
  for (const [k, col] of Object.entries(NOTIF)) {
    if (req.body?.[k] === undefined) continue
    sets.push(`${col}=$${sets.length + 1}`); vals.push(!!req.body[k])
  }
  if (sets.length) { vals.push(req.user.id); await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals) }
  res.json(notifOut(await getUser(req.user.id)))
})

app.get('/api/profile/language', auth, async (req, res) => res.json({ language: (await getUser(req.user.id)).language || 'en' }))
app.patch('/api/profile/language', auth, async (req, res) => {
  const lang = String(req.body?.language || '').slice(0, 8) || 'en'
  await pool.query('UPDATE users SET language=$1 WHERE id=$2', [lang, req.user.id])
  res.json({ language: lang })
})

// Family members -------------------------------------------------------------
app.get('/api/family', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT id,name,relation,phone,is_primary FROM family_members WHERE user_id=$1 ORDER BY is_primary DESC, id', [req.user.id])
  res.json(rows)
})
app.post('/api/family', auth, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Name is required' })
  const primary = !!req.body?.is_primary
  if (primary) await pool.query('UPDATE family_members SET is_primary=false WHERE user_id=$1', [req.user.id])
  const { rows } = await pool.query(
    'INSERT INTO family_members (user_id,name,relation,phone,is_primary) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,relation,phone,is_primary',
    [req.user.id, name, String(req.body?.relation || '').trim() || null, String(req.body?.phone || '').trim() || null, primary])
  res.json(rows[0])
})
app.patch('/api/family/:id', auth, async (req, res) => {
  const id = Number(req.params.id)
  const own = await pool.query('SELECT id FROM family_members WHERE id=$1 AND user_id=$2', [id, req.user.id])
  if (!own.rowCount) return res.status(404).json({ error: 'Not found' })
  if (req.body?.is_primary) await pool.query('UPDATE family_members SET is_primary=false WHERE user_id=$1', [req.user.id])
  const cols = { name: req.body?.name, relation: req.body?.relation, phone: req.body?.phone, is_primary: req.body?.is_primary }
  const sets = [], vals = []
  for (const [c, v] of Object.entries(cols)) { if (v === undefined) continue; sets.push(`${c}=$${sets.length + 1}`); vals.push(c === 'is_primary' ? !!v : v) }
  if (sets.length) { vals.push(id); await pool.query(`UPDATE family_members SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals) }
  const { rows } = await pool.query('SELECT id,name,relation,phone,is_primary FROM family_members WHERE id=$1', [id])
  res.json(rows[0])
})
app.delete('/api/family/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM family_members WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id])
  res.json({ ok: true })
})

// Saved payment methods (display data only) -----------------------------------
app.get('/api/payment-methods', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT id,kind,label,detail,is_primary FROM payment_methods WHERE user_id=$1 ORDER BY is_primary DESC, id', [req.user.id])
  res.json(rows)
})
app.post('/api/payment-methods', auth, async (req, res) => {
  const kind = String(req.body?.kind || '').trim(), label = String(req.body?.label || '').trim()
  if (!kind || !label) return res.status(400).json({ error: 'kind and label are required' })
  // Guard against anyone trying to persist a full card number here — only masked detail is allowed.
  const detail = String(req.body?.detail || '').trim().slice(0, 40)
  if (/\d{12,}/.test(detail)) return res.status(400).json({ error: 'Do not send full card numbers' })
  const primary = !!req.body?.is_primary
  if (primary) await pool.query('UPDATE payment_methods SET is_primary=false WHERE user_id=$1', [req.user.id])
  const { rows } = await pool.query(
    'INSERT INTO payment_methods (user_id,kind,label,detail,is_primary) VALUES ($1,$2,$3,$4,$5) RETURNING id,kind,label,detail,is_primary',
    [req.user.id, kind, label, detail || null, primary])
  res.json(rows[0])
})
app.patch('/api/payment-methods/:id', auth, async (req, res) => {
  const id = Number(req.params.id)
  const own = await pool.query('SELECT id FROM payment_methods WHERE id=$1 AND user_id=$2', [id, req.user.id])
  if (!own.rowCount) return res.status(404).json({ error: 'Not found' })
  if (req.body?.is_primary) await pool.query('UPDATE payment_methods SET is_primary=false WHERE user_id=$1', [req.user.id])
  if (req.body?.is_primary !== undefined) await pool.query('UPDATE payment_methods SET is_primary=$1 WHERE id=$2', [!!req.body.is_primary, id])
  const { rows } = await pool.query('SELECT id,kind,label,detail,is_primary FROM payment_methods WHERE id=$1', [id])
  res.json(rows[0])
})
app.delete('/api/payment-methods/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM payment_methods WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id])
  res.json({ ok: true })
})

// Delete account (Privacy screen) — removes the user's own rows, then the account.
app.delete('/api/me', auth, async (req, res) => {
  const id = req.user.id
  for (const t of ['family_members', 'payment_methods', 'gift_cards', 'transactions', 'addresses']) {
    await pool.query(`DELETE FROM ${t} WHERE user_id=$1`, [id]).catch(() => {})
  }
  await pool.query('DELETE FROM users WHERE id=$1', [id])
  res.json({ ok: true })
})

/* ---------- AI Home: reminders + cleaning plans (Module 13) ---------- */

// Home reminders (water can / garbage / pest control). One row per kind; upsert on save.
app.get('/api/reminders', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT id,kind,next_date,frequency_days,enabled,config FROM home_reminders WHERE user_id=$1', [req.user.id])
  res.json(rows)
})
app.put('/api/reminders/:kind', auth, async (req, res) => {
  const kind = String(req.params.kind).slice(0, 32)
  const { next_date = null, frequency_days = null, enabled = true, config = {} } = req.body || {}
  const { rows } = await pool.query(
    `INSERT INTO home_reminders (user_id,kind,next_date,frequency_days,enabled,config) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id,kind) DO UPDATE SET next_date=EXCLUDED.next_date, frequency_days=EXCLUDED.frequency_days, enabled=EXCLUDED.enabled, config=EXCLUDED.config
     RETURNING id,kind,next_date,frequency_days,enabled,config`,
    [req.user.id, kind, next_date, frequency_days, !!enabled, JSON.stringify(config || {})])
  res.json(rows[0])
})

// Cleaning plans (recurring planner).
app.get('/api/plans', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT id,service_id,name,frequency,next_date,active FROM cleaning_plans WHERE user_id=$1 ORDER BY active DESC, id', [req.user.id])
  res.json(rows)
})
app.post('/api/plans', auth, async (req, res) => {
  const { service_id, name, frequency, next_date = null } = req.body || {}
  if (!service_id || !name || !frequency) return res.status(400).json({ error: 'service_id, name and frequency are required' })
  const { rows } = await pool.query(
    'INSERT INTO cleaning_plans (user_id,service_id,name,frequency,next_date) VALUES ($1,$2,$3,$4,$5) RETURNING id,service_id,name,frequency,next_date,active',
    [req.user.id, service_id, name, frequency, next_date])
  res.json(rows[0])
})
app.patch('/api/plans/:id', auth, async (req, res) => {
  const id = Number(req.params.id)
  const own = await pool.query('SELECT id FROM cleaning_plans WHERE id=$1 AND user_id=$2', [id, req.user.id])
  if (!own.rowCount) return res.status(404).json({ error: 'Not found' })
  if (req.body?.active !== undefined) await pool.query('UPDATE cleaning_plans SET active=$1 WHERE id=$2', [!!req.body.active, id])
  const { rows } = await pool.query('SELECT id,service_id,name,frequency,next_date,active FROM cleaning_plans WHERE id=$1', [id])
  res.json(rows[0])
})
app.delete('/api/plans/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM cleaning_plans WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id])
  res.json({ ok: true })
})

/* ---------- membership (Module 10 · Subscription) ---------- */
// Authoritative plan catalog + billing cycles. The client has a copy for display (membership.ts),
// but price is ALWAYS recomputed here so the amount charged can't be tampered with.
const MEM_PLANS = {
  silver:   { name: 'Silver',   price: 299, discountCap: 1000 },
  gold:     { name: 'Gold',     price: 599, discountCap: 2500 },
  platinum: { name: 'Platinum', price: 999, discountCap: 5000 },
}
const MEM_CYCLES = { monthly: { months: 1, savePct: 0 }, '3m': { months: 3, savePct: 0.11 }, '12m': { months: 12, savePct: 0.17 } }
const cyclePrice = (price, months, savePct = 0) => Math.round(price * months * (1 - savePct))
const addMonths = (from, months) => { const d = new Date(from); d.setMonth(d.getMonth() + months); return d }

// Plan catalog is the admin-configurable one owned by the catalog service. Cache briefly and fall
// back to the built-in defaults above if catalog is unreachable, so subscribe/renew never hard-fail.
let _planCache = { at: 0, byKey: null }
async function planCatalog() {
  if (_planCache.byKey && Date.now() - _planCache.at < 60000) return _planCache.byKey
  try {
    const r = await fetch(`${CATALOG_URL}/api/membership-plans`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000) })
    if (r.ok) {
      const list = await r.json()
      if (Array.isArray(list) && list.length) {
        const byKey = {}
        for (const p of list) byKey[p.key] = { name: p.name, price: p.price, discountCap: p.maxDiscountPerOrder || 0 }
        _planCache = { at: Date.now(), byKey }
        return byKey
      }
    }
  } catch { /* fall through to defaults */ }
  return MEM_PLANS
}

// The user's current membership row (most recent), or null.
async function currentMembership(uid) {
  const { rows } = await pool.query('SELECT * FROM memberships WHERE user_id=$1 ORDER BY id DESC LIMIT 1', [uid])
  return rows[0] || null
}
// Shape a membership row for the app: a cancelled plan still counts as active until renews_at passes.
function membershipOut(m) {
  if (!m) return { active: false }
  const renews = new Date(m.renews_at)
  const live = renews.getTime() > Date.now() && m.status !== 'expired'
  const daysLeft = Math.max(0, Math.ceil((renews.getTime() - Date.now()) / 86400000))
  // Tier names are stable labels; an admin-created key we don't recognise falls back to the key itself.
  const plan = MEM_PLANS[m.plan] || { name: m.plan, discountCap: 0 }
  return {
    active: live, id: m.id, plan: m.plan, planName: plan.name, discountCap: plan.discountCap,
    cycle: m.cycle, price: m.price, method: m.method, status: m.status, autoRenew: m.auto_renew,
    startedAt: m.started, renewsAt: m.renews_at, validTill: m.renews_at, daysLeft,
    usage: { totalSaved: m.total_saved || 0, addonsUsed: m.addons_used || 0, bookings: m.bookings_count || 0 },
  }
}
// Validate {plan, cycle} against the (admin-configurable) catalog and return
// { planKey, cycleKey, months, amount, name } or throw a 400. Price is ALWAYS the config price.
async function priceFor(planKey, cycleKey) {
  const plans = await planCatalog()
  const plan = plans[planKey]; const cyc = MEM_CYCLES[cycleKey]
  if (!plan) throw Object.assign(new Error('Unknown plan'), { code: 400 })
  if (!cyc) throw Object.assign(new Error('Unknown billing cycle'), { code: 400 })
  return { planKey, cycleKey, months: cyc.months, amount: cyclePrice(plan.price, cyc.months, cyc.savePct), name: plan.name }
}
// Charge the amount: from the wallet (Promo→Cash) when payWithWallet, else treat the external
// gateway payment as already succeeded (the app's pay sheet handles the real charge).
async function chargeMembership(uid, amount, payWithWallet, title) {
  if (payWithWallet) await walletSpend(uid, amount, { title, kind: 'MEMBERSHIP' })
}

app.get('/api/membership', auth, async (req, res) => {
  res.json(membershipOut(await currentMembership(req.user.id)))
})

app.post('/api/membership/subscribe', auth, async (req, res) => {
  try {
    const { plan, cycle = 'monthly', method = 'upi', payWithWallet = false } = req.body || {}
    const { planKey, cycleKey, months, amount, name } = await priceFor(plan, cycle)
    await chargeMembership(req.user.id, amount, payWithWallet, `${name} membership`)
    const renewsAt = addMonths(new Date(), months)
    // Replace any prior membership (upgrade/downgrade/re-subscribe) with a fresh active row.
    await pool.query('DELETE FROM memberships WHERE user_id=$1', [req.user.id])
    const { rows } = await pool.query(
      `INSERT INTO memberships (user_id, plan, cycle, price, method, status, renews_at)
       VALUES ($1,$2,$3,$4,$5,'active',$6) RETURNING *`,
      [req.user.id, planKey, cycleKey, amount, method, renewsAt.toISOString()])
    const m = rows[0]
    await pool.query('INSERT INTO membership_ledger (user_id,membership_id,event,detail,amount) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, m.id, 'subscribed', `${name} · ${cycleKey}`, amount])
    publishEvent(REDIS_URL, 'customer.membership', { userId: req.user.id, name: req.user.name, detail: `Subscribed to ${name} (${cycleKey})` })
    res.json(membershipOut(m))
  } catch (e) { res.status(e.code === 402 ? 402 : e.code === 400 ? 400 : 500).json({ error: e.message || 'Could not subscribe' }) }
})

app.post('/api/membership/renew', auth, async (req, res) => {
  try {
    const cur = await currentMembership(req.user.id)
    if (!cur) return res.status(404).json({ error: 'No membership to renew' })
    const cycle = req.body?.cycle || cur.cycle
    const { cycleKey, months, amount, name } = await priceFor(cur.plan, cycle)
    await chargeMembership(req.user.id, amount, req.body?.payWithWallet, `${name} renewal`)
    // Extend from whichever is later: the existing valid-till (if still live) or now.
    const base = new Date(cur.renews_at).getTime() > Date.now() ? new Date(cur.renews_at) : new Date()
    const renewsAt = addMonths(base, months)
    const { rows } = await pool.query(
      `UPDATE memberships SET cycle=$1, price=$2, status='active', auto_renew=true, cancelled_at=NULL, renews_at=$3 WHERE id=$4 RETURNING *`,
      [cycleKey, amount, renewsAt.toISOString(), cur.id])
    await pool.query('INSERT INTO membership_ledger (user_id,membership_id,event,detail,amount) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, cur.id, 'renewed', `${name} · ${cycleKey}`, amount])
    publishEvent(REDIS_URL, 'customer.membership', { userId: req.user.id, name: req.user.name, detail: `Renewed ${name}` })
    res.json(membershipOut(rows[0]))
  } catch (e) { res.status(e.code === 402 ? 402 : e.code === 400 ? 400 : 500).json({ error: e.message || 'Could not renew' }) }
})

app.post('/api/membership/cancel', auth, async (req, res) => {
  const cur = await currentMembership(req.user.id)
  if (!cur) return res.status(404).json({ error: 'No membership to cancel' })
  // Soft-cancel: turn off auto-renew and mark cancelled, but keep benefits until renews_at.
  const { rows } = await pool.query(
    `UPDATE memberships SET status='cancelled', auto_renew=false, cancelled_at=now() WHERE id=$1 RETURNING *`, [cur.id])
  await pool.query('INSERT INTO membership_ledger (user_id,membership_id,event,detail,amount) VALUES ($1,$2,$3,$4,0)',
    [req.user.id, cur.id, 'cancelled', String(req.body?.reason || '').slice(0, 200) || 'Cancelled'])
  publishEvent(REDIS_URL, 'customer.membership', { userId: req.user.id, name: req.user.name, detail: `Cancelled ${MEM_PLANS[cur.plan]?.name || cur.plan}` })
  res.json(membershipOut(rows[0]))
})

app.get('/api/membership/usage', auth, async (req, res) => {
  const cur = await currentMembership(req.user.id)
  const { rows } = await pool.query(
    'SELECT id, event, detail, amount, created FROM membership_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 100', [req.user.id])
  res.json({ membership: membershipOut(cur), history: rows })
})

/* ---------- internal (service-to-service) ---------- */
app.get('/api/internal/users/:id', internalOnly, async (req, res) => {
  const u = await getUser(Number(req.params.id))
  res.json({ user: publicUser(u) })
})

// Membership snapshot for the catalog pricing engine: the active plan key + this-month usage count.
app.get('/api/internal/users/:id/membership', internalOnly, async (req, res) => {
  const cur = await currentMembership(Number(req.params.id))
  if (!cur) return res.json({ active: false })
  const live = new Date(cur.renews_at).getTime() > Date.now() && cur.status !== 'expired'
  const month = new Date().toISOString().slice(0, 7)
  const u = (await pool.query('SELECT discounted_orders FROM membership_usage WHERE membership_id=$1 AND month=$2', [cur.id, month])).rows[0]
  res.json({ active: live, planKey: cur.plan, cycle: cur.cycle, usedThisMonth: u?.discounted_orders || 0 })
})

// Record a membership-discounted booking: bump this-month usage + lifetime savings on the membership.
// Called by the booking service after a booking that received a member discount. Best-effort.
app.post('/api/internal/users/:id/membership-usage', internalOnly, async (req, res) => {
  const uid = Number(req.params.id)
  const saved = Math.max(0, Math.round(Number(req.body?.saved) || 0))
  const cur = await currentMembership(uid)
  if (!cur) return res.json({ ok: false })
  const month = new Date().toISOString().slice(0, 7)
  await pool.query(
    `INSERT INTO membership_usage (user_id, membership_id, month, discounted_orders, saved) VALUES ($1,$2,$3,1,$4)
     ON CONFLICT (membership_id, month) DO UPDATE SET discounted_orders = membership_usage.discounted_orders + 1, saved = membership_usage.saved + $4`,
    [uid, cur.id, month, saved])
  await pool.query('UPDATE memberships SET total_saved = total_saved + $1, bookings_count = bookings_count + 1 WHERE id=$2', [saved, cur.id])
  await pool.query('INSERT INTO membership_ledger (user_id,membership_id,event,detail,amount) VALUES ($1,$2,$3,$4,$5)',
    [uid, cur.id, 'saved', 'Member discount on booking', saved])
  res.json({ ok: true })
})
app.get('/api/internal/users/:id/addresses', internalOnly, async (req, res) => res.json(await getAddresses(Number(req.params.id))))
// One default (or first) address per user — lets the admin Customers list show a locality without
// N per-user calls. `is_default DESC` picks the default; ties fall back to the earliest address.
app.get('/api/internal/addresses/defaults', internalOnly, async (_q, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (user_id) user_id, street, landmark, apartment, city, pincode
     FROM addresses ORDER BY user_id, is_default DESC, id`)
  res.json(rows)
})
// Admin-pinned customer notes.
app.get('/api/internal/users/:id/notes', internalOnly, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM customer_notes WHERE user_id=$1 ORDER BY id DESC LIMIT 100', [Number(req.params.id)])
  res.json(rows)
})
app.post('/api/internal/users/:id/notes', internalOnly, async (req, res) => {
  const body = String(req.body?.body || '').trim()
  if (!body) return res.status(400).json({ error: 'Note is empty' })
  const { rows } = await pool.query(
    'INSERT INTO customer_notes (user_id, body, author) VALUES ($1,$2,$3) RETURNING *',
    [Number(req.params.id), body, req.body?.author || null])
  res.json(rows[0])
})
// Referral summary for the admin customer profile: who referred them, and how many they've referred
// (joined = signed up; pending = joined but the referral reward hasn't been earned yet).
app.get('/api/internal/users/:id/referrals', internalOnly, async (req, res) => {
  const id = Number(req.params.id)
  const u = await getUser(id)
  let referredByName = null, referredByCode = null
  if (u?.referred_by) { const r = await getUser(u.referred_by); referredByName = r?.name || null; referredByCode = r?.referral_code || null }
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS joined, COUNT(*) FILTER (WHERE NOT referral_rewarded)::int AS pending FROM users WHERE referred_by=$1', [id])
  res.json({ referredByName, referredByCode, referralCode: u?.referral_code || null, joined: rows[0].joined, pending: rows[0].pending })
})
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
// Whitelisted columns an admin may patch. Booleans are coerced so a JSON `false` isn't lost.
const PATCHABLE = { name: 0, email: 0, phone: 0, city: 0, status: 0, gender: 0, language: 0,
  comm_whatsapp: 1, comm_sms: 1, comm_email: 1, comm_push: 1, comm_promo: 1 }
app.patch('/api/internal/users/:id', internalOnly, async (req, res) => {
  const b = req.body || {}
  const u = await getUser(Number(req.params.id))
  if (!u) return res.status(404).json({ error: 'User not found' })
  const sets = [], vals = []
  for (const [col, isBool] of Object.entries(PATCHABLE)) {
    if (b[col] === undefined) continue
    vals.push(isBool ? !!b[col] : b[col]); sets.push(`${col}=$${vals.length}`)
  }
  if (!sets.length) return res.json({ user: publicUser(u) })
  vals.push(u.id)
  const upd = await pool.query(`UPDATE users SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals)
  res.json({ user: publicUser(upd.rows[0]) })
})

init()
  .then(() => app.listen(PORT, () => console.log(`[auth] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[auth] failed to start:', e.message); process.exit(1) });
