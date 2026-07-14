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
  makePool, migrate, makeCustomerAuth, makeAdminAuth, internalOnly, subscribeEvents, invalidateSettings,
  publishEvent, getSetting, getSettingInt, tryGet, internalPost,
} from '@homehelp/shared'

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
const verifiedPayments = new Map() // razorpay_payment_id -> { at } (single-use)

const PAYMENT_METHODS = [
  { group: 'UPI', recommended: true, options: [
    { id: 'upi', name: 'UPI', icon: '📲', sub: 'PhonePe, Google Pay, Paytm & more' }] },
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
    `CREATE TABLE IF NOT EXISTS webhook_events (id SERIAL PRIMARY KEY, event_id TEXT UNIQUE, type TEXT, created TIMESTAMPTZ DEFAULT now())`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_pay_booking ON payments(booking_id) WHERE booking_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_settle_booking ON settlements(booking_id)`,
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

async function rzp() {
  const keyId = await getSetting(ADMIN_URL, 'razorpay_key_id', '')
  const keySecret = await getSetting(ADMIN_URL, 'razorpay_key_secret', '')
  return { keyId, keySecret, live: !!(keyId && keySecret) }
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

// RazorpayX payout statuses -> our ledger outcome. 'processed' = money delivered.
const PAYOUT_DONE = new Set(['processed'])
const PAYOUT_FAILED = new Set(['reversed', 'failed', 'rejected', 'cancelled'])

// Initiate a single worker payout. Idempotent per withdrawal via the unique index; safe to re-run.
async function initiatePayout({ withdrawalId, workerId, amount, method }) {
  if (!withdrawalId || !amount || amount <= 0) return
  // Already handled? (event redelivery) — bail so we never double-pay.
  const existing = await pool.query('SELECT id, status FROM payouts WHERE withdrawal_id=$1', [withdrawalId])
  if (existing.rowCount) return

  const cfg = await payoutCfg()

  // MOCK mode — no real gateway configured. Complete instantly so the ledger reconciles.
  if (!cfg.live) {
    await pool.query("INSERT INTO payouts (worker_id,withdrawal_id,amount,status,provider,mode,reference) VALUES ($1,$2,$3,'paid','mock',$4,$5) ON CONFLICT (withdrawal_id) WHERE withdrawal_id IS NOT NULL DO NOTHING",
      [workerId, withdrawalId, amount, method || 'bank', 'MOCK-' + withdrawalId])
    publishEvent(REDIS_URL, 'payout.completed', { withdrawalId, workerId })
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
    const fundAccount = await rzpxCall(cfg, '/v1/fund_accounts', useUpi
      ? { contact_id: contact.id, account_type: 'vpa', vpa: { address: bank.bankUpi } }
      : { contact_id: contact.id, account_type: 'bank_account', bank_account: { name: holder, ifsc: bank.bankIfsc, account_number: bank.bankAccount } })

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

    if (status === 'paid') publishEvent(REDIS_URL, 'payout.completed', { withdrawalId, workerId })
    else if (status === 'failed') publishEvent(REDIS_URL, 'payout.failed', { withdrawalId, workerId, reason: 'Payout rejected' })
    // else: queued/processing — the payout webhook will finalize it.
    console.log(`[payment] payout ${withdrawalId} -> RazorpayX ${payout.id} (${payout.status})`)
  } catch (e) {
    await pool.query("INSERT INTO payouts (worker_id,withdrawal_id,amount,status,provider,failure_reason) VALUES ($1,$2,$3,'failed','razorpayx',$4) ON CONFLICT (withdrawal_id) WHERE withdrawal_id IS NOT NULL DO NOTHING",
      [workerId, withdrawalId, amount, String(e.message || 'payout error')])
    publishEvent(REDIS_URL, 'payout.failed', { withdrawalId, workerId, reason: String(e.message || 'payout error') })
    console.error(`[payment] payout ${withdrawalId} failed:`, e.message)
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
app.post('/api/payment/order', auth, async (req, res) => {
  const amount = Math.max(0, Math.round(Number(req.body?.amount) || 0))
  if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' })
  const r = await rzp()
  if (r.live) {
    try {
      const resp = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${r.keyId}:${r.keySecret}`).toString('base64') },
        body: JSON.stringify({ amount: amount * 100, currency: 'INR', receipt: 'rcpt_' + Date.now() }),
      })
      const o = await resp.json()
      if (!resp.ok) return res.status(502).json({ error: o?.error?.description || 'Gateway order failed' })
      return res.json({ provider: 'razorpay', orderId: o.id, amount, currency: 'INR', keyId: r.keyId })
    } catch { return res.status(502).json({ error: 'Could not reach payment gateway' }) }
  }
  res.json({ provider: 'mock', orderId: 'ORD' + Math.floor(100000 + Math.random() * 899999), amount, currency: 'INR' })
})
app.post('/api/payment/verify', auth, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {}
  const r = await rzp()
  if (!r.live) return res.status(400).json({ error: 'Razorpay not configured' })
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ error: 'Missing payment fields' })
  const expected = crypto.createHmac('sha256', r.keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex')
  if (expected !== razorpay_signature) return res.status(400).json({ error: 'Payment verification failed' })
  verifiedPayments.set(String(razorpay_payment_id), { at: Date.now() })
  res.json({ ok: true, txnId: razorpay_payment_id })
})
// Verified wallet top-up. Credits the customer wallet ONLY after the gateway payment passed
// server-side signature verification (done in /api/payment/verify). Idempotent by payment_id, so
// a repeated call or a duplicate Razorpay webhook can never double-credit the wallet.
app.post('/api/payment/wallet/topup', auth, async (req, res) => {
  const amount = Math.max(1, Math.round(Number(req.body?.amount) || 0))
  const paymentId = String(req.body?.paymentId || '').trim()
  if (!amount || !paymentId) return res.status(400).json({ error: 'Missing amount or paymentId' })
  const r = await rzp()
  // Live gateway → the payment must have been verified (never trust frontend success alone).
  if (r.live && !verifiedPayments.has(paymentId)) return res.status(400).json({ error: 'Payment not verified' })
  // Idempotency guard — one gateway payment credits the wallet exactly once.
  const dup = await pool.query("SELECT id FROM payments WHERE payment_id=$1 AND mode='wallet_topup'", [paymentId])
  if (dup.rowCount) return res.json({ ok: true, duplicate: true })
  let balance = null
  try {
    const credited = await internalPost(AUTH_URL, `/api/internal/users/${req.user.id}/wallet`, { type: 'credit', title: 'Added to wallet', amount, ref: paymentId })
    balance = credited?.balance ?? null
  } catch { return res.status(502).json({ error: 'Could not credit wallet' }) }
  await pool.query("INSERT INTO payments (customer_id,amount,mode,gateway,payment_id,status) VALUES ($1,$2,'wallet_topup','razorpay',$3,'SUCCESS')", [req.user.id, amount, paymentId])
  verifiedPayments.delete(paymentId)
  res.json({ ok: true, balance })
})

app.post('/api/payment/charge', auth, async (req, res) => {
  const r = await rzp()
  if (r.live) return res.status(400).json({ error: 'Use the Razorpay checkout flow' })
  const amount = Math.max(0, Math.round(Number(req.body?.amount) || 0))
  if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' })
  res.json({ status: 'paid', txnId: 'TXN' + Math.floor(10000000 + Math.random() * 89999999), method: req.body?.method || 'phonepe', amount })
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
app.post('/api/payments/webhook', async (req, res) => {
  const secret = await getSetting(ADMIN_URL, 'razorpay_webhook_secret', '') || await getSetting(ADMIN_URL, 'payment_webhook_secret', '')
  const sig = req.headers['x-razorpay-signature']
  if (secret) {
    const expected = crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.from('')).digest('hex')
    if (sig !== expected) return res.status(400).json({ error: 'bad signature' })
  }
  const evt = req.body || {}
  const eventId = evt.id || (evt.payload?.payment?.entity?.id) || crypto.randomBytes(8).toString('hex')
  const dup = await pool.query('INSERT INTO webhook_events (event_id,type) VALUES ($1,$2) ON CONFLICT (event_id) DO NOTHING RETURNING id', [String(eventId), evt.event || 'payment'])
  if (!dup.rowCount) return res.json({ ok: true, duplicate: true })
  const bookingId = evt.bookingId || evt.payload?.payment?.entity?.notes?.bookingId
  const amount = evt.amount || Math.round((evt.payload?.payment?.entity?.amount || 0) / 100)
  if (bookingId) publishEvent(REDIS_URL, 'payment.succeeded', { bookingId: Number(bookingId), amount, mode: 'upi', gateway: 'razorpay' })
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
  if (type === 'payout.processed' || (!evt.event && evt.withdrawalId)) {
    await pool.query("UPDATE payouts SET status='paid' WHERE withdrawal_id=$1", [withdrawalId])
    publishEvent(REDIS_URL, 'payout.completed', { withdrawalId, workerId })
  } else if (type === 'payout.reversed' || type === 'payout.failed' || type === 'payout.rejected') {
    await pool.query("UPDATE payouts SET status='failed', failure_reason=$2 WHERE withdrawal_id=$1", [withdrawalId, entity.status_details?.description || type])
    publishEvent(REDIS_URL, 'payout.failed', { withdrawalId, workerId, reason: entity.status_details?.description || type })
  }
  res.json({ ok: true })
})

/* ---------- admin finance ---------- */
// Admin Payments screen expects { summary, methods, transactions } — not a raw row array.
app.get('/api/admin/payments', adminAuth, async (_q, res) => {
  const rows = (await pool.query('SELECT * FROM payments ORDER BY id DESC LIMIT 500')).rows
  const customers = await tryGet(AUTH_URL, '/api/internal/customers', [])
  const nameById = new Map((customers || []).map((c) => [c.id, c.name]))
  const paid = rows.filter((r) => r.status === 'PAID')
  const summary = {
    revenue: paid.reduce((s, r) => s + (r.amount || 0), 0),
    successful: paid.length,
    pending: rows.filter((r) => ['CREATED', 'PENDING'].includes(r.status)).length,
    refunded: rows.filter((r) => r.status === 'REFUNDED').length,
  }
  const methodMap = {}
  for (const r of rows) {
    const m = r.mode || 'other'
    const e = methodMap[m] || (methodMap[m] = { method: m, n: 0, amount: 0 })
    e.n += 1
    if (r.status === 'PAID') e.amount += (r.amount || 0)
  }
  const transactions = rows.map((r) => ({
    id: r.id,
    type: r.status === 'REFUNDED' ? 'refund' : 'credit',
    status: r.status,
    title: `${r.mode || 'Online'} payment`,
    amount: r.amount || 0,
    created: r.created,
    ref: r.booking_id ? `BK${r.booking_id}` : (r.order_id || ''),
    customer: nameById.get(r.customer_id) || `Customer #${r.customer_id}`,
  }))
  res.json({ summary, methods: Object.values(methodMap), transactions })
})
app.get('/api/admin/finance/payments', adminAuth, async (_q, res) => res.json((await pool.query('SELECT * FROM payments ORDER BY id DESC LIMIT 500')).rows))
app.get('/api/admin/finance/settlements', adminAuth, async (_q, res) => res.json((await pool.query('SELECT * FROM settlements ORDER BY id DESC LIMIT 500')).rows))
app.get('/api/admin/finance/payouts', adminAuth, async (_q, res) => res.json((await pool.query('SELECT * FROM payouts ORDER BY id DESC LIMIT 500')).rows))
app.get('/api/admin/finance/ledger', adminAuth, async (_q, res) => res.json((await pool.query('SELECT * FROM wallet_ledger ORDER BY id DESC LIMIT 500')).rows))
app.get('/api/admin/finance/reports', adminAuth, async (_q, res) => {
  const rev = (await pool.query("SELECT COALESCE(SUM(amount),0)::int s FROM payments WHERE status='PAID'")).rows[0].s
  const paidOut = (await pool.query('SELECT COALESCE(SUM(amount),0)::int s FROM settlements')).rows[0].s
  const commissionPct = await getSettingInt(ADMIN_URL, 'commission_percent', 20)
  res.json({ revenue: rev, settledToWorkers: paidOut, commission: rev - paidOut, commissionPct })
})
// Refunds screen shows CANCELLED bookings + their refund/fee/reason (that data lives on the
// booking table, not payments). Fetch cancelled bookings and shape them with the customer name.
app.get('/api/admin/refunds', adminAuth, async (_q, res) => {
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
app.post('/api/admin/refunds/:id', adminAuth, async (req, res) => {
  await internalPost(BOOKING_URL, `/api/internal/bookings/${Number(req.params.id)}/refund`, {})
  res.json({ ok: true })
})

/* ---------- event consumers ---------- */
subscribeEvents(REDIS_URL, 'payment', async (type, data) => {
  if (type === 'settings.updated') return invalidateSettings()
  if (type === 'payout.requested') return initiatePayout(data)
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
  .catch((e) => { console.error('[payment] failed to start:', e.message); process.exit(1) });
