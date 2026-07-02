// HomeHelp Payment Service
// -------------------------
// Owns the finance domain on its own Postgres: payments, settlements, payouts, wallet_ledger,
// webhook_events. Serves the customer payment flow (/api/payment/*, /api/payments/*), the signed
// gateway + payout webhooks, and the admin finance panel. Razorpay keys / webhook secrets come
// from the admin config service. Records the customer payment on payment.succeeded and the worker
// settlement on booking.completed (both from the event bus).
import express from 'express'
import crypto from 'node:crypto'
import {
  makePool, migrate, makeCustomerAuth, makeAdminAuth, internalOnly, subscribeEvents,
  publishEvent, getSetting, getSettingInt,
} from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4008)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5438/payment'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')

process.on('unhandledRejection', (e) => console.error('[payment] unhandledRejection:', e?.message || e))

const pool = makePool(DATABASE_URL)
const auth = makeCustomerAuth(AUTH_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)
const verifiedPayments = new Map() // razorpay_payment_id -> { at } (single-use)

const PAYMENT_METHODS = [
  { group: 'UPI', recommended: true, options: [
    { id: 'phonepe', name: 'PhonePe', icon: '🟣', sub: 'UPI' }, { id: 'gpay', name: 'Google Pay', icon: '🟢', sub: 'UPI' },
    { id: 'paytm', name: 'Paytm UPI', icon: '🔵', sub: 'UPI' }, { id: 'bhim', name: 'BHIM / Other UPI', icon: '🇮🇳', sub: 'Enter UPI ID' }] },
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
app.post('/api/payments/payout/webhook', async (req, res) => {
  const secret = await getSetting(ADMIN_URL, 'payout_webhook_secret', '')
  const sig = req.headers['x-payout-signature']
  if (secret) { const expected = crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.from('')).digest('hex'); if (sig !== expected) return res.status(400).json({ error: 'bad signature' }) }
  const evt = req.body || {}
  if (evt.withdrawalId) { await pool.query("UPDATE payouts SET status='paid' WHERE withdrawal_id=$1", [evt.withdrawalId]); publishEvent(REDIS_URL, 'payout.completed', { withdrawalId: evt.withdrawalId, workerId: evt.workerId }) }
  res.json({ ok: true })
})

/* ---------- admin finance ---------- */
app.get('/api/admin/payments', adminAuth, async (_q, res) => res.json((await pool.query('SELECT * FROM payments ORDER BY id DESC LIMIT 500')).rows))
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
app.get('/api/admin/refunds', adminAuth, async (_q, res) => res.json((await pool.query("SELECT * FROM payments WHERE status='REFUNDED' ORDER BY id DESC")).rows))
app.post('/api/admin/refunds/:id', adminAuth, async (req, res) => { await pool.query("UPDATE payments SET status='REFUNDED' WHERE id=$1", [Number(req.params.id)]); res.json({ ok: true }) })

/* ---------- event consumers ---------- */
subscribeEvents(REDIS_URL, 'payment', async (type, data) => {
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
  .catch((e) => { console.error('[payment] failed to start:', e.message); process.exit(1) })
