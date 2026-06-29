// Finance core for the HomeHelp platform — the money "source of truth".
//
// This formalises the payment system on top of the shared SQLite DB:
//   • payments        — every customer payment (gateway order/payment ids, signature, status)
//   • settlements     — per-booking split: commission / worker earning / tax / gateway fee / discount
//   • wallet_ledger   — IMMUTABLE, double-entry-style ledger; one row per wallet movement
//   • payouts         — worker withdrawals sent to a payout provider (Cashfree/RazorpayX-shaped)
//   • webhook_events  — idempotency guard so a gateway can deliver the same webhook twice safely
//
// Business rules enforced here: customer money belongs to the company first; the worker
// only ever receives their settled earning; the ledger can never be updated or deleted
// (DB triggers RAISE(ABORT)); bank/account numbers are encrypted at rest and masked in UI.
import { db } from './db.js'
import { getSetting } from './admin-db.js'
import crypto from 'node:crypto'

const now = () => new Date().toISOString()
const intSetting = (k, d) => { const v = parseFloat(getSetting(k, '')); return Number.isFinite(v) ? v : d }

/* ===================== encryption (bank/account at rest) ===================== */
// AES-256-GCM. Key from FINANCE_ENC_KEY (hex/passphrase) or a stable dev fallback.
const ENC_KEY = crypto.createHash('sha256').update(process.env.FINANCE_ENC_KEY || 'homehelp-dev-finance-key').digest()
export function encryptField(plain) {
  if (plain == null || plain === '') return ''
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()])
  return `${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${enc.toString('hex')}`
}
export function decryptField(blob) {
  try {
    const [ivh, tagh, dh] = String(blob).split(':')
    if (!ivh || !tagh || !dh) return ''
    const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivh, 'hex'))
    d.setAuthTag(Buffer.from(tagh, 'hex'))
    return Buffer.concat([d.update(Buffer.from(dh, 'hex')), d.final()]).toString('utf8')
  } catch { return '' }
}
export function maskAccount(acc) {
  const s = String(acc || '').replace(/\s+/g, '')
  if (s.length <= 4) return s ? `••••${s}` : '—'
  return '••••' + s.slice(-4)
}

/* ===================== schema ===================== */
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER, customer_id INTEGER, amount INTEGER NOT NULL,
    mode TEXT NOT NULL DEFAULT 'upi', gateway TEXT NOT NULL DEFAULT 'razorpay',
    gateway_order_id TEXT NOT NULL DEFAULT '', gateway_payment_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'CREATED', signature TEXT NOT NULL DEFAULT '',
    failure_reason TEXT NOT NULL DEFAULT '', idempotency_key TEXT NOT NULL DEFAULT '',
    paid_at TEXT, created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER, payment_id INTEGER, worker_id INTEGER,
    customer_amount INTEGER NOT NULL DEFAULT 0, platform_commission INTEGER NOT NULL DEFAULT 0,
    worker_earning INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL DEFAULT 0,
    gateway_fee INTEGER NOT NULL DEFAULT 0, discount INTEGER NOT NULL DEFAULT 0,
    refund_amount INTEGER NOT NULL DEFAULT 0, final_payable INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING', created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS wallet_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL, booking_id INTEGER, payment_id INTEGER, withdrawal_id INTEGER,
    type TEXT NOT NULL, credit INTEGER NOT NULL DEFAULT 0, debit INTEGER NOT NULL DEFAULT 0,
    bucket TEXT NOT NULL DEFAULT 'available',
    avail_after INTEGER NOT NULL DEFAULT 0, pending_after INTEGER NOT NULL DEFAULT 0, hold_after INTEGER NOT NULL DEFAULT 0,
    balance_after INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'SUCCESS', created_by TEXT NOT NULL DEFAULT 'system',
    remarks TEXT NOT NULL DEFAULT '', created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    withdrawal_id INTEGER, worker_id INTEGER NOT NULL, amount INTEGER NOT NULL,
    provider TEXT NOT NULL DEFAULT 'mock', mode TEXT NOT NULL DEFAULT 'UPI',
    transfer_id TEXT NOT NULL DEFAULT '', reference TEXT NOT NULL DEFAULT '',
    dest_enc TEXT NOT NULL DEFAULT '', dest_mask TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Requested', failure_reason TEXT NOT NULL DEFAULT '',
    idempotency_key TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, updated TEXT
  );
  CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, event_id TEXT NOT NULL,
    received TEXT NOT NULL, UNIQUE(source, event_id)
  );
`)
// Immutability: the ledger is append-only. Admins (and code) cannot UPDATE or DELETE rows.
try {
  db.exec(`CREATE TRIGGER IF NOT EXISTS wallet_ledger_no_update BEFORE UPDATE ON wallet_ledger
    BEGIN SELECT RAISE(ABORT, 'wallet_ledger is immutable: entries cannot be modified'); END;`)
  db.exec(`CREATE TRIGGER IF NOT EXISTS wallet_ledger_no_delete BEFORE DELETE ON wallet_ledger
    BEGIN SELECT RAISE(ABORT, 'wallet_ledger is immutable: entries cannot be deleted'); END;`)
} catch { /* triggers exist */ }

/* ===================== transaction types (spec enum) ===================== */
export const LEDGER_TYPES = [
  'JOB_EARNING', 'BONUS', 'TIP', 'INCENTIVE', 'REFERRAL_REWARD', 'ATTENDANCE_BONUS',
  'WITHDRAWAL', 'WITHDRAWAL_FAILED_REVERSAL', 'PENALTY', 'HOSTEL_RENT', 'MEAL_CHARGE',
  'UNIFORM_CHARGE', 'EQUIPMENT_CHARGE', 'SALARY_ADVANCE', 'ADVANCE_RECOVERY',
  'HOLD', 'HOLD_RELEASE', 'REFUND_ADJUSTMENT',
]
// Withdrawal status machine.
export const WITHDRAWAL_STATUSES = [
  'Requested', 'Pending Approval', 'Approved', 'Processing', 'Paid', 'Failed', 'Rejected', 'On Hold', 'Reversed',
]

const workerRow = (id) => db.prepare('SELECT id,balance,pending,hold,earnings,withdrawn FROM workers WHERE id=?').get(id)

/* ===================== immutable ledger posting ===================== */
// Append one ledger row. Call AFTER the worker's balance buckets have been updated, so the
// *_after snapshots are accurate. credit/debit are from the worker's perspective (double-entry:
// the opposite leg is the PLATFORM account, noted in remarks). Returns the new ledger row.
export function postLedger({
  workerId, type, credit = 0, debit = 0, bucket = 'available', status = 'SUCCESS',
  bookingId = null, paymentId = null, withdrawalId = null, createdBy = 'system', remarks = '',
}) {
  const w = workerRow(workerId)
  if (!w) return null
  const total = (w.balance || 0) + (w.pending || 0) + (w.hold || 0)
  const info = db.prepare(`INSERT INTO wallet_ledger
    (worker_id,booking_id,payment_id,withdrawal_id,type,credit,debit,bucket,
     avail_after,pending_after,hold_after,balance_after,status,created_by,remarks,created)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    workerId, bookingId, paymentId, withdrawalId, type, Math.round(credit) || 0, Math.round(debit) || 0, bucket,
    w.balance || 0, w.pending || 0, w.hold || 0, total, status, createdBy, remarks, now())
  return db.prepare('SELECT * FROM wallet_ledger WHERE id=?').get(info.lastInsertRowid)
}
export function ledgerForWorker(workerId, limit = 200) {
  return db.prepare('SELECT * FROM wallet_ledger WHERE worker_id=? ORDER BY id DESC LIMIT ?').all(workerId, limit).map(ledgerDto)
}
export function ledgerAll(limit = 500) {
  return db.prepare('SELECT * FROM wallet_ledger ORDER BY id DESC LIMIT ?').all(limit).map(ledgerDto)
}
function ledgerDto(r) {
  return {
    ledgerId: `LG${String(r.id).padStart(7, '0')}`, workerId: r.worker_id, bookingId: r.booking_id,
    paymentId: r.payment_id, withdrawalId: r.withdrawal_id, type: r.type,
    credit: r.credit, debit: r.debit, bucket: r.bucket, balanceAfter: r.balance_after,
    availableAfter: r.avail_after, pendingAfter: r.pending_after, holdAfter: r.hold_after,
    status: r.status, createdBy: r.created_by, remarks: r.remarks,
    date: r.created, createdAt: r.created,
  }
}

/* ===================== customer payments ===================== */
export function createPayment({ bookingId, customerId, amount, mode = 'upi', gateway = 'razorpay', orderId = '', idempotencyKey = '' }) {
  const info = db.prepare(`INSERT INTO payments
    (booking_id,customer_id,amount,mode,gateway,gateway_order_id,status,idempotency_key,created)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(bookingId, customerId, amount, mode, gateway, orderId, 'CREATED', idempotencyKey, now())
  return db.prepare('SELECT * FROM payments WHERE id=?').get(info.lastInsertRowid)
}
export function findPaymentByOrder(orderId) {
  return orderId ? db.prepare('SELECT * FROM payments WHERE gateway_order_id=?').get(orderId) : null
}
export function paymentForBooking(bookingId) {
  return bookingId ? db.prepare("SELECT * FROM payments WHERE booking_id=? AND status='SUCCESS' ORDER BY id DESC LIMIT 1").get(bookingId) : null
}
export function markPaymentSuccess(id, { paymentId = '', signature = '' } = {}) {
  db.prepare("UPDATE payments SET status='SUCCESS', gateway_payment_id=?, signature=?, paid_at=? WHERE id=?")
    .run(paymentId, signature, now(), id)
  return db.prepare('SELECT * FROM payments WHERE id=?').get(id)
}
export function markPaymentFailed(id, reason = 'Payment failed') {
  db.prepare("UPDATE payments SET status='FAILED', failure_reason=? WHERE id=?").run(reason, id)
  return db.prepare('SELECT * FROM payments WHERE id=?').get(id)
}
// Record a payment that already settled outside our gateway (cash, prior-verified online).
export function recordExternalPayment({ bookingId, customerId, amount, mode, gateway = 'external', paymentId = '' }) {
  const p = createPayment({ bookingId, customerId, amount, mode, gateway })
  return markPaymentSuccess(p.id, { paymentId })
}
export function paymentsList({ status = 'all', limit = 200 } = {}) {
  const rows = status === 'all'
    ? db.prepare('SELECT * FROM payments ORDER BY id DESC LIMIT ?').all(limit)
    : db.prepare('SELECT * FROM payments WHERE status=? ORDER BY id DESC LIMIT ?').all(status, limit)
  return rows.map(paymentDto)
}
const paymentDto = (p) => ({
  paymentId: `PM${String(p.id).padStart(7, '0')}`, id: p.id, bookingId: p.booking_id, customerId: p.customer_id,
  amount: p.amount, mode: p.mode, gateway: p.gateway, gatewayOrderId: p.gateway_order_id,
  gatewayPaymentId: p.gateway_payment_id, status: p.status, failureReason: p.failure_reason,
  paidAt: p.paid_at, createdAt: p.created,
})

/* ===================== webhook signature + idempotency ===================== */
// HMAC-SHA256 over the raw body (Razorpay/Cashfree style). Returns true if valid.
export function verifySignature(rawBody, signature, secret) {
  if (!secret) return true // dev/mock mode: no secret configured -> accept
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature || ''))) } catch { return false }
}
// Returns false if this (source,event_id) was already processed (duplicate webhook).
export function claimWebhook(source, eventId) {
  if (!eventId) return true
  try { db.prepare('INSERT INTO webhook_events (source,event_id,received) VALUES (?,?,?)').run(source, eventId, now()); return true }
  catch { return false } // UNIQUE violation -> already handled
}

/* ===================== settlement engine ===================== */
// Compute the company-first split for a booking total. Worker earning matches the existing
// workerShare() (total - commission) so app figures stay consistent; tax (GST on commission)
// and gateway fee are platform-side costs and do not reduce the worker.
export function computeSettlement(total, { discount = 0, mode = 'upi' } = {}) {
  const commissionPct = Math.max(0, Math.min(100, intSetting('commission_percent', 20)))
  const gstPct = Math.max(0, intSetting('gst_percent', 0))
  const feePct = Math.max(0, intSetting('gateway_fee_percent', mode === 'cash' ? 0 : 2))
  const customerAmount = Math.round(total) || 0
  const platformCommission = Math.round(customerAmount * commissionPct / 100)
  const workerEarning = Math.max(0, customerAmount - platformCommission)
  const tax = Math.round(platformCommission * gstPct / 100)
  const gatewayFee = Math.round(customerAmount * feePct / 100)
  return { customerAmount, platformCommission, workerEarning, tax, gatewayFee, discount: Math.round(discount) || 0, finalPayable: workerEarning }
}
export function recordSettlement({ bookingId, paymentId, workerId, total, discount = 0, mode = 'upi' }) {
  const s = computeSettlement(total, { discount, mode })
  const info = db.prepare(`INSERT INTO settlements
    (booking_id,payment_id,worker_id,customer_amount,platform_commission,worker_earning,tax,gateway_fee,discount,refund_amount,final_payable,status,created)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    bookingId, paymentId, workerId, s.customerAmount, s.platformCommission, s.workerEarning, s.tax, s.gatewayFee, s.discount, 0, s.finalPayable, 'PENDING', now())
  return { id: info.lastInsertRowid, ...s }
}
export function markSettlementStatus(bookingId, status) {
  db.prepare('UPDATE settlements SET status=? WHERE booking_id=?').run(status, bookingId)
}
export function settlementsList(limit = 200) {
  return db.prepare('SELECT * FROM settlements ORDER BY id DESC LIMIT ?').all(limit).map((s) => ({
    settlementId: `ST${String(s.id).padStart(7, '0')}`, bookingId: s.booking_id, paymentId: s.payment_id, workerId: s.worker_id,
    customerAmount: s.customer_amount, platformCommission: s.platform_commission, workerEarning: s.worker_earning,
    tax: s.tax, gatewayFee: s.gateway_fee, discount: s.discount, refundAmount: s.refund_amount,
    finalPayable: s.final_payable, status: s.status, createdAt: s.created,
  }))
}

/* ===================== payout provider (Cashfree / RazorpayX shaped) ===================== */
// Pluggable: a real integration swaps `mockTransfer` for the provider SDK/HTTP call. The shape
// (transferId + async webhook confirming SUCCESS/FAILED) mirrors Cashfree Payouts & RazorpayX.
function mockTransfer({ amount, mode }) {
  // Deterministic mock: small amounts succeed instantly; a sentinel amount (ending in 13) fails.
  const id = 'TR' + crypto.randomBytes(5).toString('hex').toUpperCase()
  const willFail = amount % 100 === 13
  return { transferId: id, accepted: true, willFail }
}
export function createPayout({ withdrawalId, workerId, amount, mode = 'UPI', destination = '', reference = '', idempotencyKey = '' }) {
  const provider = getSetting('payout_provider', 'mock') // 'cashfree' | 'razorpayx' | 'paytm' | 'mock'
  const t = mockTransfer({ amount, mode })
  const info = db.prepare(`INSERT INTO payouts
    (withdrawal_id,worker_id,amount,provider,mode,transfer_id,reference,dest_enc,dest_mask,status,idempotency_key,created)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    withdrawalId, workerId, amount, provider, mode, t.transferId, reference,
    encryptField(destination), maskAccount(destination), 'Processing', idempotencyKey, now())
  return { id: info.lastInsertRowid, transferId: t.transferId, willFail: t.willFail, provider }
}
export function getPayout(id) { return db.prepare('SELECT * FROM payouts WHERE id=?').get(id) }
export function findPayoutByTransfer(transferId) { return db.prepare('SELECT * FROM payouts WHERE transfer_id=?').get(transferId) }
export function updatePayoutStatus(id, status, failureReason = '') {
  db.prepare('UPDATE payouts SET status=?, failure_reason=?, updated=? WHERE id=?').run(status, failureReason, now(), id)
  return getPayout(id)
}
export function payoutsList({ status = 'all', limit = 200 } = {}) {
  const rows = status === 'all'
    ? db.prepare('SELECT * FROM payouts ORDER BY id DESC LIMIT ?').all(limit)
    : db.prepare('SELECT * FROM payouts WHERE status=? ORDER BY id DESC LIMIT ?').all(status, limit)
  return rows.map((p) => ({
    payoutId: `PO${String(p.id).padStart(7, '0')}`, id: p.id, withdrawalId: p.withdrawal_id, workerId: p.worker_id,
    amount: p.amount, provider: p.provider, mode: p.mode, transferId: p.transfer_id, reference: p.reference,
    destination: p.dest_mask, status: p.status, failureReason: p.failure_reason, createdAt: p.created, updatedAt: p.updated,
  }))
}

/* ===================== reports ===================== */
const sum = (q, ...a) => db.prepare(q).get(...a)?.s || 0
const cnt = (q, ...a) => db.prepare(q).get(...a)?.n || 0
export function financeReports() {
  const day = now().slice(0, 10)
  return {
    asOf: now(),
    dailyCollection: sum("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status='SUCCESS' AND substr(paid_at,1,10)=?", day),
    dailyPayout: sum("SELECT COALESCE(SUM(amount),0) s FROM payouts WHERE status='Paid' AND substr(updated,1,10)=?", day),
    totalCollection: sum("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status='SUCCESS'"),
    platformRevenue: sum('SELECT COALESCE(SUM(platform_commission),0) s FROM settlements'),
    taxCollected: sum('SELECT COALESCE(SUM(tax),0) s FROM settlements'),
    gatewayFees: sum('SELECT COALESCE(SUM(gateway_fee),0) s FROM settlements'),
    workerEarningsTotal: sum('SELECT COALESCE(SUM(worker_earning),0) s FROM settlements'),
    totalPaidOut: sum("SELECT COALESCE(SUM(amount),0) s FROM payouts WHERE status='Paid'"),
    // Pending liability = money we owe workers (available + pending), not yet withdrawn.
    pendingLiability: sum('SELECT COALESCE(SUM(balance),0)+COALESCE(SUM(pending),0) s FROM workers'),
    holdLiability: sum('SELECT COALESCE(SUM(hold),0) s FROM workers'),
    failedPayments: cnt("SELECT COUNT(*) n FROM payments WHERE status='FAILED'"),
    failedPayouts: cnt("SELECT COUNT(*) n FROM payouts WHERE status='Failed'"),
    counts: {
      payments: cnt('SELECT COUNT(*) n FROM payments'),
      settlements: cnt('SELECT COUNT(*) n FROM settlements'),
      payouts: cnt('SELECT COUNT(*) n FROM payouts'),
      ledgerEntries: cnt('SELECT COUNT(*) n FROM wallet_ledger'),
    },
  }
}
export function workerWisePayout() {
  return db.prepare(`SELECT w.id, w.name, COALESCE(SUM(p.amount),0) paid
    FROM workers w LEFT JOIN payouts p ON p.worker_id=w.id AND p.status='Paid'
    GROUP BY w.id HAVING paid>0 ORDER BY paid DESC`).all()
    .map((r) => ({ workerId: r.id, name: r.name, totalPaid: r.paid }))
}
