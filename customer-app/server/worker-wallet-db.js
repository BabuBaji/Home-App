// Worker Wallet module — full earnings / incentives / deductions / salary-advance /
// withdrawal / payslip engine for the HomeHelp Pro worker app. Shares the same
// SQLite file (db.js) as everyone else and builds on the columns/tables added by
// worker-db.js (balance = Available, pending = Pending, withdrawn = Total Withdrawn).
//
// Design goals (per spec): complete transparency — never hide a deduction, always
// say WHY money is pending/held, and raise a notification for every credit, debit,
// withdrawal, hold and salary-advance update. Money is whole rupees (integers).
import { db } from './db.js'
import { getSetting } from './admin-db.js'
import { workerShare } from './worker-db.js'
import { postLedger, recordSettlement, markSettlementStatus, createPayout, updatePayoutStatus, paymentForBooking, recordExternalPayment } from './payments-db.js'

// Map wallet categories -> the immutable ledger's transaction-type enum.
const INCOME_LEDGER_TYPE = {
  'Completed Jobs': 'JOB_EARNING', Tips: 'TIP', 'Attendance Bonus': 'ATTENDANCE_BONUS',
  'Peak Hour Bonus': 'INCENTIVE', 'Festival Bonus': 'BONUS', 'Performance Bonus': 'BONUS',
  'Referral Bonus': 'REFERRAL_REWARD', 'Customer Rating Bonus': 'INCENTIVE',
}
const DEDUCTION_LEDGER_TYPE = {
  'Hostel Rent': 'HOSTEL_RENT', 'Meal Charges': 'MEAL_CHARGE', 'Uniform Charges': 'UNIFORM_CHARGE',
  'Equipment Charges': 'EQUIPMENT_CHARGE', 'Advance Salary Recovery': 'ADVANCE_RECOVERY',
  Penalty: 'PENALTY', 'Late Arrival Deduction': 'PENALTY', 'Damage Deduction': 'PENALTY', 'Other Deductions': 'PENALTY',
}
const safeLedger = (e) => { try { return postLedger(e) } catch { return null } }

const now = () => new Date().toISOString()
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })

/* ---------- migrations: extra wallet columns on `workers` ---------- */
const COLS = [
  'hold INTEGER NOT NULL DEFAULT 0',              // Hold Balance — blocked (complaint/refund/QC)
  'week_earnings INTEGER NOT NULL DEFAULT 0',     // rolling weekly earned
  'month_earnings INTEGER NOT NULL DEFAULT 0',    // rolling monthly earned
  'advance_outstanding INTEGER NOT NULL DEFAULT 0', // salary advance still to recover
  "next_payout TEXT NOT NULL DEFAULT ''",         // next scheduled payout date
]
for (const c of COLS) { try { db.exec(`ALTER TABLE workers ADD COLUMN ${c}`) } catch { /* exists */ } }

// Richer history columns on the existing worker_txns ledger.
for (const c of ['ref_id TEXT', 'method TEXT', 'remarks TEXT', "kind TEXT NOT NULL DEFAULT 'general'"]) {
  try { db.exec(`ALTER TABLE worker_txns ADD COLUMN ${c}`) } catch { /* exists */ }
}
// A printable reference number on every withdrawal (for the transaction receipt).
try { db.exec("ALTER TABLE worker_withdrawals ADD COLUMN reference TEXT NOT NULL DEFAULT ''") } catch { /* exists or table not yet created */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS worker_income (
    id INTEGER PRIMARY KEY AUTOINCREMENT, worker_id INTEGER NOT NULL,
    category TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
    amount INTEGER NOT NULL, ref_id TEXT NOT NULL DEFAULT '',
    bucket TEXT NOT NULL DEFAULT 'available', created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS worker_deductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, worker_id INTEGER NOT NULL,
    category TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
    amount INTEGER NOT NULL, ref_id TEXT NOT NULL DEFAULT '', created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS worker_withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT, worker_id INTEGER NOT NULL,
    amount INTEGER NOT NULL, method TEXT NOT NULL DEFAULT 'Bank',
    destination TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Requested',
    remarks TEXT NOT NULL DEFAULT '', reference TEXT NOT NULL DEFAULT '',
    requested TEXT NOT NULL, processed TEXT
  );
  CREATE TABLE IF NOT EXISTS worker_advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT, worker_id INTEGER NOT NULL,
    amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Requested',
    recovered INTEGER NOT NULL DEFAULT 0, remarks TEXT NOT NULL DEFAULT '',
    requested TEXT NOT NULL, processed TEXT
  );
  CREATE TABLE IF NOT EXISTS worker_payslips (
    id INTEGER PRIMARY KEY AUTOINCREMENT, worker_id INTEGER NOT NULL,
    month TEXT NOT NULL, payload TEXT NOT NULL, created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS worker_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, worker_id INTEGER NOT NULL,
    text TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'info',
    read INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL
  );
`)

/* ---------- the canonical category lists (always shown, even at ₹0) ---------- */
export const INCOME_CATEGORIES = [
  'Completed Jobs', 'Tips', 'Attendance Bonus', 'Peak Hour Bonus',
  'Festival Bonus', 'Performance Bonus', 'Referral Bonus', 'Customer Rating Bonus',
]
export const DEDUCTION_CATEGORIES = [
  'Hostel Rent', 'Meal Charges', 'Uniform Charges', 'Equipment Charges',
  'Advance Salary Recovery', 'Penalty', 'Late Arrival Deduction', 'Damage Deduction', 'Other Deductions',
]

const getRow = (id) => db.prepare('SELECT * FROM workers WHERE id=?').get(id)
const settingInt = (k, d) => { const v = parseInt(getSetting(k, ''), 10); return Number.isFinite(v) ? v : d }

/* ---------- low-level writers (each also drops a ledger row + notification) ---------- */
export function notify(workerId, text, kind = 'info') {
  db.prepare('INSERT INTO worker_notifications (worker_id,text,kind,created) VALUES (?,?,?,?)').run(workerId, text, kind, now())
}
function ledger(workerId, { title, subtitle = '', amount, isCredit, status = 'Success', kind = 'general', refId = '', method = '', remarks = '' }) {
  db.prepare(`INSERT INTO worker_txns (worker_id,title,subtitle,amount,status,is_credit,kind,ref_id,method,remarks,created)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(workerId, title, subtitle, amount, status, isCredit ? 1 : 0, kind, refId, method, remarks, now())
}

// Credit income into a balance bucket: 'pending' (awaiting QC), 'available', or 'hold'.
export function recordIncome(workerId, category, amount, { label = '', refId = '', bucket = 'available' } = {}) {
  amount = Math.round(Number(amount) || 0)
  if (amount <= 0) return
  const w = getRow(workerId); if (!w) return
  db.prepare('INSERT INTO worker_income (worker_id,category,label,amount,ref_id,bucket,created) VALUES (?,?,?,?,?,?,?)')
    .run(workerId, category, label || category, amount, refId, bucket, now())
  const col = bucket === 'pending' ? 'pending' : bucket === 'hold' ? 'hold' : 'balance'
  db.prepare(`UPDATE workers SET ${col}=${col}+?, earnings=earnings+?, week_earnings=week_earnings+?, month_earnings=month_earnings+? WHERE id=?`)
    .run(amount, amount, amount, amount, workerId)
  const where = bucket === 'pending' ? 'Pending — awaiting quality check' : bucket === 'hold' ? 'On hold' : 'Available'
  ledger(workerId, { title: category, subtitle: label || where, amount, isCredit: true, kind: 'income', refId, status: bucket === 'available' ? 'Success' : 'Pending' })
  safeLedger({ workerId, type: INCOME_LEDGER_TYPE[category] || 'BONUS', credit: amount, bucket, status: bucket === 'available' ? 'SUCCESS' : 'PENDING', remarks: label || category })
  notify(workerId, `+₹${amount} ${category} credited (${where})`, 'credit')
}

// Record income into the breakup ONLY (no balance/ledger touch). Used by the job
// settlement path, which already credits Available balance + writes its own ledger row,
// so we just tag the amount under its earnings category for the breakup screen.
export function tallyIncome(workerId, category, amount, { label = '', refId = '' } = {}) {
  amount = Math.round(Number(amount) || 0); if (amount <= 0) return
  db.prepare('INSERT INTO worker_income (worker_id,category,label,amount,ref_id,bucket,created) VALUES (?,?,?,?,?,?,?)')
    .run(workerId, category, label || category, amount, refId, 'available', now())
}

// Record a deduction and subtract it from Available balance (never hidden).
export function recordDeduction(workerId, category, amount, { label = '', refId = '' } = {}) {
  amount = Math.round(Number(amount) || 0)
  if (amount <= 0) return
  db.prepare('INSERT INTO worker_deductions (worker_id,category,label,amount,ref_id,created) VALUES (?,?,?,?,?,?)')
    .run(workerId, category, label || category, amount, refId, now())
  db.prepare('UPDATE workers SET balance=balance-? WHERE id=?').run(amount, workerId)
  ledger(workerId, { title: category, subtitle: label || 'Deduction', amount, isCredit: false, kind: 'deduction', refId })
  safeLedger({ workerId, type: DEDUCTION_LEDGER_TYPE[category] || 'PENALTY', debit: amount, remarks: label || category })
  notify(workerId, `-₹${amount} ${category} deducted. Reason: ${label || category}`, 'debit')
}

/* ---------- advance recovery hook (called from worker-db on each job settle) ---------- */
// "Recovery starts from future earnings": skim a slice of each settled job until cleared.
export function recoverAdvanceOnEarning(workerId, earn) {
  const w = getRow(workerId)
  if (!w || w.advance_outstanding <= 0 || earn <= 0) return 0
  const pct = Math.min(100, Math.max(0, settingInt('advance_recovery_percent', 25)))
  const take = Math.min(w.advance_outstanding, Math.max(1, Math.round(earn * pct / 100)))
  db.prepare('UPDATE workers SET advance_outstanding=advance_outstanding-? WHERE id=?').run(take, workerId)
  recordDeduction(workerId, 'Advance Salary Recovery', take, { label: `Recovered from job earnings (${pct}%)` })
  const left = getRow(workerId).advance_outstanding
  if (left <= 0) {
    db.prepare("UPDATE worker_advances SET status='Cleared' WHERE worker_id=? AND status='Recovering'").run(workerId)
    notify(workerId, 'Salary advance fully recovered. You are all clear!', 'advance')
  }
  return take
}

/* ---------- the spec flow: customer confirms -> Pending -> (QC) -> Available ----------
   Called when the customer confirms a completed job (review/confirm). Idempotent via the
   booking's `settled` flag so it credits exactly once. Earnings land in PENDING first;
   then quality-check releases them to Available — automatically (earnings_auto_release=1,
   the default) or manually by an admin via "Clear Pending" when the flag is '0'. */
export function confirmWorkerSettlement(booking) {
  if (!booking || !booking.worker_id || booking.settled) return null
  const wid = booking.worker_id
  const earn = workerShare(booking.total)
  if (earn <= 0) { db.prepare('UPDATE bookings SET settled=1 WHERE id=?').run(booking.id); return null }
  // 1) Credit Pending + tag under "Completed Jobs" for the breakup. Stats (jobs/today/week/month) update now.
  db.prepare(`UPDATE workers SET pending=pending+?, earnings=earnings+?, week_earnings=week_earnings+?,
    month_earnings=month_earnings+?, jobs=jobs+1, today_earnings=today_earnings+?, today_jobs=today_jobs+1 WHERE id=?`)
    .run(earn, earn, earn, earn, earn, wid)
  db.prepare('UPDATE bookings SET settled=1 WHERE id=?').run(booking.id)
  db.prepare('INSERT INTO worker_income (worker_id,category,label,amount,ref_id,bucket,created) VALUES (?,?,?,?,?,?,?)')
    .run(wid, 'Completed Jobs', booking.ref, earn, booking.ref, 'pending', now())
  db.prepare('INSERT INTO worker_earnings (worker_id,date,amount,paid,created) VALUES (?,?,?,?,?)')
    .run(wid, `Today • ${booking.ref}`, earn, 1, now())
  const svc = (booking.items || []).map((i) => i.name).join(', ')
  ledger(wid, { title: 'Job Earnings', subtitle: `${booking.ref} • ${svc}`.slice(0, 60), amount: earn, isCredit: true, kind: 'income', refId: booking.ref, status: 'Pending', remarks: 'Customer confirmed — pending quality check' })
  // Formal booking settlement (company-first split) + immutable JOB_EARNING ledger entry.
  // Ensure a customer payment row exists (cash bookings are recorded here on confirmation).
  try {
    let pay = paymentForBooking(booking.id)
    if (!pay) pay = recordExternalPayment({ bookingId: booking.id, customerId: booking.user_id, amount: booking.total, mode: booking.payment || 'cash', gateway: booking.payment === 'cash' ? 'cash' : 'razorpay' })
    recordSettlement({ bookingId: booking.id, paymentId: pay?.id || null, workerId: wid, total: booking.total, discount: booking.discount || 0, mode: booking.payment || 'upi' })
  } catch { /* finance optional */ }
  safeLedger({ workerId: wid, type: 'JOB_EARNING', credit: earn, bucket: 'pending', status: 'PENDING', bookingId: booking.id, remarks: `${booking.ref} — pending QC` })
  notify(wid, `+₹${earn} for ${booking.ref} added to Pending — awaiting quality check.`, 'credit')
  // 2) Quality check — auto-release to Available unless an admin must review first.
  const autoRelease = getSetting('earnings_auto_release', '1') !== '0'
  if (autoRelease) {
    releasePending(wid, earn)
    recoverAdvanceOnEarning(wid, earn)
  }
  try { markSettlementStatus(booking.id, autoRelease ? 'SETTLED' : 'PENDING') } catch { /* ignore */ }
  return { earn, autoReleased: autoRelease }
}

/* ---------- DTOs the Kotlin app deserializes ---------- */
export function walletSummary(workerId) {
  const w = getRow(workerId) || {}
  return {
    available: w.balance || 0,
    pending: w.pending || 0,
    hold: w.hold || 0,
    todayEarnings: w.today_earnings || 0,
    weekEarnings: w.week_earnings || 0,
    monthEarnings: w.month_earnings || 0,
    totalWithdrawn: w.withdrawn || 0,
    advanceOutstanding: w.advance_outstanding || 0,
    nextPayout: w.next_payout || nextFriday(),
  }
}
export function earningsBreakup(workerId) {
  const rows = db.prepare('SELECT category, SUM(amount) total FROM worker_income WHERE worker_id=? GROUP BY category').all(workerId)
  const map = Object.fromEntries(rows.map((r) => [r.category, r.total]))
  return INCOME_CATEGORIES.map((category) => ({ category, amount: map[category] || 0 }))
}
export function deductionsList(workerId) {
  const rows = db.prepare('SELECT category,label,amount,created FROM worker_deductions WHERE worker_id=? ORDER BY id DESC').all(workerId)
  const detail = rows.map((d) => ({ category: d.category, label: d.label, amount: d.amount, date: fmtDate(d.created) }))
  const totals = {}
  for (const r of rows) totals[r.category] = (totals[r.category] || 0) + r.amount
  const summary = DEDUCTION_CATEGORIES.map((category) => ({ category, amount: totals[category] || 0 }))
  return { summary, detail, total: rows.reduce((s, r) => s + r.amount, 0) }
}
export function walletHistory(workerId, limit = 100) {
  return db.prepare('SELECT * FROM worker_txns WHERE worker_id=? ORDER BY id DESC LIMIT ?').all(workerId, limit).map((t) => ({
    id: t.id, date: fmtDate(t.created), time: fmtTime(t.created),
    type: t.title, refId: t.ref_id || '', amount: t.amount,
    isCredit: !!t.is_credit, status: t.status, method: t.method || '—',
    remarks: t.remarks || t.subtitle || '',
  }))
}
export function withdrawalsList(workerId) {
  return db.prepare('SELECT * FROM worker_withdrawals WHERE worker_id=? ORDER BY id DESC').all(workerId).map((x) => ({
    id: x.id, amount: x.amount, method: x.method, destination: x.destination,
    status: x.status, remarks: x.remarks, reference: x.reference || '', date: fmtDate(x.requested),
  }))
}

// The transaction receipt for one withdrawal (shown after payout + from history).
export function withdrawalReceipt(workerId, id) {
  const x = db.prepare('SELECT * FROM worker_withdrawals WHERE id=? AND worker_id=?').get(id, workerId)
  if (!x) return null
  const w = getRow(workerId) || {}
  return {
    reference: x.reference || ('HHW' + id),
    workerName: w.name || '', workerId: `HH-${String(workerId).padStart(5, '0')}`,
    amount: x.amount, method: x.method, destination: x.destination, status: x.status,
    date: fmtDate(x.requested), time: fmtTime(x.requested),
    processedDate: x.processed ? `${fmtDate(x.processed)}, ${fmtTime(x.processed)}` : '',
    bankDetails: x.method === 'UPI' ? x.destination : `${w.bank_name || '—'} • ${w.bank_account || '—'}`,
    note: x.status === 'Paid' ? 'Amount successfully transferred to your account.'
      : x.status === 'Rejected' ? (x.remarks || 'This withdrawal was rejected and refunded.')
        : 'Your withdrawal is being processed. You will be notified once paid.',
  }
}
export function advancesList(workerId) {
  return db.prepare('SELECT * FROM worker_advances WHERE worker_id=? ORDER BY id DESC').all(workerId).map((x) => ({
    id: x.id, amount: x.amount, status: x.status, recovered: x.recovered,
    remarks: x.remarks, date: fmtDate(x.requested),
  }))
}
export function notificationsList(workerId, limit = 40) {
  const items = db.prepare('SELECT id,text,kind,read,created FROM worker_notifications WHERE worker_id=? ORDER BY id DESC LIMIT ?')
    .all(workerId, limit).map((n) => ({ id: n.id, text: n.text, kind: n.kind, read: !!n.read, time: fmtTime(n.created), date: fmtDate(n.created) }))
  const unread = db.prepare('SELECT COUNT(*) n FROM worker_notifications WHERE worker_id=? AND read=0').get(workerId).n
  return { items, unread }
}
export function markNotificationsRead(workerId) {
  db.prepare('UPDATE worker_notifications SET read=1 WHERE worker_id=?').run(workerId)
  return notificationsList(workerId)
}

function nextFriday() {
  const d = new Date()
  const day = d.getDay() // 0 Sun .. 5 Fri
  const add = ((5 - day + 7) % 7) || 7
  d.setDate(d.getDate() + add)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ---------- withdrawal flow (OTP + request + admin/auto approval) ---------- */
export function requestWithdrawOtp() { return { ok: true, devOtp: '1234' } }

export function createWithdrawal(workerId, amount, method, otp) {
  amount = Math.round(Number(amount) || 0)
  const w = getRow(workerId); if (!w) return { error: 'Worker not found' }
  // Best rule: cannot withdraw until the bank account is admin-verified (Approved).
  if (w.bank_status !== 'Approved') return { error: 'Your bank account is not verified yet. Add it and wait for admin approval before withdrawing.' }
  if (amount <= 0) return { error: 'Enter a valid amount' }
  if (String(otp || '') !== '1234') return { error: 'Incorrect OTP' }
  if (amount > w.balance) return { error: 'Amount exceeds available balance' }
  const m = method === 'UPI' ? 'UPI' : 'Bank'
  const dest = m === 'UPI'
    ? (w.bank_holder ? `${String(w.bank_holder).toLowerCase().replace(/\s+/g, '')}@upi` : 'worker@upi')
    : `A/c ${String(w.bank_account || 'xxxx1234').slice(-4).padStart(8, 'x')}`
  // Money leaves Available immediately and is parked until the payout settles.
  db.prepare('UPDATE workers SET balance=balance-? WHERE id=?').run(amount, workerId)
  const auto = settingInt('auto_approve_withdrawal_below', 2000)
  const autoOk = amount <= auto
  const info = db.prepare('INSERT INTO worker_withdrawals (worker_id,amount,method,destination,status,requested) VALUES (?,?,?,?,?,?)')
    .run(workerId, amount, m, dest, autoOk ? 'Approved' : 'Pending Approval', now())
  // Printable reference number for the transaction receipt, e.g. HHW2606270007.
  const reference = 'HHW' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + String(info.lastInsertRowid).padStart(4, '0')
  db.prepare('UPDATE worker_withdrawals SET reference=? WHERE id=?').run(reference, info.lastInsertRowid)
  ledger(workerId, { title: 'Withdrawal', subtitle: `${m} • ${dest}`, amount, isCredit: false, kind: 'withdrawal', method: m, refId: reference, status: autoOk ? 'Processing' : 'Pending', remarks: autoOk ? 'Auto-approved' : 'Awaiting admin approval' })
  safeLedger({ workerId, type: 'WITHDRAWAL', debit: amount, withdrawalId: info.lastInsertRowid, status: autoOk ? 'Processing' : 'Pending Approval', remarks: `${m} • ${reference}` })
  notify(workerId, `Withdrawal of ₹${amount} to ${m} ${autoOk ? 'is processing' : 'requested — awaiting approval'}.`, 'withdrawal')
  if (autoOk) dispatchPayout(db.prepare('SELECT * FROM worker_withdrawals WHERE id=?').get(info.lastInsertRowid))
  return { ok: true, id: info.lastInsertRowid, reference }
}

// Send the approved withdrawal to the payout provider. A real provider (Cashfree/RazorpayX)
// confirms asynchronously via /api/payments/payout/webhook; the mock resolves immediately.
function dispatchPayout(x) {
  if (!x) return
  const w = getRow(x.worker_id)
  const dest = x.method === 'UPI' ? (w.bank_upi || x.destination) : (w.bank_account || x.destination)
  const { id: payoutId, willFail } = createPayout({
    withdrawalId: x.id, workerId: x.worker_id, amount: x.amount, mode: x.method, destination: dest, reference: x.reference,
  })
  db.prepare("UPDATE worker_withdrawals SET status='Processing' WHERE id=?").run(x.id)
  if (getSetting('payout_provider', 'mock') !== 'mock') {
    notify(x.worker_id, `Withdrawal of ₹${x.amount} is processing.`, 'withdrawal')
    return // await the provider's signed webhook
  }
  if (willFail) { updatePayoutStatus(payoutId, 'Failed', 'Bank rejected the transfer (mock)'); reverseWithdrawal(x.id, 'Bank rejected the transfer') }
  else { updatePayoutStatus(payoutId, 'Paid'); markWithdrawalPaid(x.id) }
}

// Admin approves a pending withdrawal -> dispatch the payout.
export function approveWithdrawal(id) {
  const x = db.prepare('SELECT * FROM worker_withdrawals WHERE id=?').get(id)
  if (!x || !['Requested', 'Pending Approval', 'Approved', 'On Hold'].includes(x.status)) return { error: 'Not a pending withdrawal' }
  db.prepare("UPDATE worker_withdrawals SET status='Approved', processed=? WHERE id=?").run(now(), id)
  notify(x.worker_id, `Withdrawal of ₹${x.amount} approved. Processing to your ${x.method}.`, 'withdrawal')
  dispatchPayout(db.prepare('SELECT * FROM worker_withdrawals WHERE id=?').get(id))
  return { ok: true }
}
// Admin rejects -> the money parked out of Available is refunded back.
export function rejectWithdrawal(id, remarks = 'Rejected by admin') {
  const x = db.prepare('SELECT * FROM worker_withdrawals WHERE id=?').get(id)
  if (!x || ['Paid', 'Rejected', 'Reversed'].includes(x.status)) return { error: 'Cannot reject this withdrawal' }
  db.prepare("UPDATE worker_withdrawals SET status='Rejected', remarks=?, processed=? WHERE id=?").run(remarks, now(), id)
  db.prepare('UPDATE workers SET balance=balance+? WHERE id=?').run(x.amount, x.worker_id)
  ledger(x.worker_id, { title: 'Withdrawal Reversed', subtitle: remarks, amount: x.amount, isCredit: true, kind: 'withdrawal', remarks })
  safeLedger({ workerId: x.worker_id, type: 'WITHDRAWAL_FAILED_REVERSAL', credit: x.amount, withdrawalId: id, status: 'Rejected', remarks })
  notify(x.worker_id, `Withdrawal of ₹${x.amount} was rejected and refunded to Available. ${remarks}`, 'withdrawal')
  return { ok: true }
}

// Payout settled -> mark Paid + count in Total Withdrawn (balance already left at request time).
export function markWithdrawalPaid(withdrawalId) {
  const x = db.prepare('SELECT * FROM worker_withdrawals WHERE id=?').get(withdrawalId)
  if (!x || x.status === 'Paid') return
  db.prepare("UPDATE worker_withdrawals SET status='Paid', processed=? WHERE id=?").run(now(), withdrawalId)
  db.prepare('UPDATE workers SET withdrawn=withdrawn+? WHERE id=?').run(x.amount, x.worker_id)
  notify(x.worker_id, `₹${x.amount} paid to your ${x.method}. Transaction complete.`, 'withdrawal')
}
// Payout failed -> refund the parked amount to Available + immutable reversal ledger entry.
export function reverseWithdrawal(withdrawalId, reason = 'Payout failed') {
  const x = db.prepare('SELECT * FROM worker_withdrawals WHERE id=?').get(withdrawalId)
  if (!x || ['Reversed', 'Rejected', 'Paid'].includes(x.status)) return
  db.prepare("UPDATE worker_withdrawals SET status='Reversed', remarks=?, processed=? WHERE id=?").run(reason, now(), withdrawalId)
  db.prepare('UPDATE workers SET balance=balance+? WHERE id=?').run(x.amount, x.worker_id)
  ledger(x.worker_id, { title: 'Withdrawal Reversed', subtitle: reason, amount: x.amount, isCredit: true, kind: 'withdrawal', remarks: reason })
  safeLedger({ workerId: x.worker_id, type: 'WITHDRAWAL_FAILED_REVERSAL', credit: x.amount, withdrawalId, status: 'Reversed', remarks: reason })
  notify(x.worker_id, `Withdrawal of ₹${x.amount} failed and was refunded to your Available balance. ${reason}`, 'withdrawal')
}
// Admin retries a failed payout -> create a fresh payout attempt (re-debits the refunded amount).
export function retryPayout(withdrawalId) {
  const x = db.prepare('SELECT * FROM worker_withdrawals WHERE id=?').get(withdrawalId)
  if (!x || !['Failed', 'Reversed'].includes(x.status)) return { error: 'Only failed/reversed payouts can be retried' }
  const w = getRow(x.worker_id)
  if (x.amount > w.balance) return { error: 'Worker no longer has enough available balance' }
  db.prepare('UPDATE workers SET balance=balance-? WHERE id=?').run(x.amount, x.worker_id)
  safeLedger({ workerId: x.worker_id, type: 'WITHDRAWAL', debit: x.amount, withdrawalId, status: 'Processing', remarks: `Retry • ${x.reference}` })
  dispatchPayout(db.prepare('SELECT * FROM worker_withdrawals WHERE id=?').get(withdrawalId))
  return { ok: true }
}

/* ---------- salary advance flow ---------- */
export function advanceEligibility(workerId) {
  const w = getRow(workerId) || {}
  const attendanceDays = Object.values(JSON.parse(w.available_days || '{}')).filter(Boolean).length
  const attendancePct = Math.round((attendanceDays / 7) * 100)
  const activePenalties = db.prepare("SELECT COUNT(*) n FROM worker_deductions WHERE worker_id=? AND category='Penalty'").get(workerId).n
  const rating = w.rating || 0
  const jobs = w.jobs || 0
  const reasons = []
  if (attendancePct < 60) reasons.push('Attendance below 60%')
  if (rating < 4.0) reasons.push('Rating below 4.0')
  if (jobs < 10) reasons.push('Fewer than 10 completed jobs')
  if (activePenalties > 0) reasons.push(`${activePenalties} active penalty(ies)`)
  if (w.advance_outstanding > 0) reasons.push('Previous advance not fully recovered')
  const eligible = reasons.length === 0
  // Cap advance at a multiple of monthly earnings (or a floor), settings-driven.
  const cap = settingInt('advance_max', 10000)
  const maxAmount = eligible ? Math.min(cap, Math.max(2000, Math.round((w.month_earnings || 0) * 0.5))) : 0
  return { eligible, maxAmount, attendancePct, rating, completedJobs: jobs, activePenalties, reasons }
}

export function requestAdvance(workerId, amount) {
  amount = Math.round(Number(amount) || 0)
  const elig = advanceEligibility(workerId)
  if (!elig.eligible) return { error: 'Not eligible: ' + (elig.reasons[0] || 'criteria not met') }
  if (amount <= 0) return { error: 'Enter a valid amount' }
  if (amount > elig.maxAmount) return { error: `Maximum advance is ₹${elig.maxAmount}` }
  const info = db.prepare('INSERT INTO worker_advances (worker_id,amount,status,requested) VALUES (?,?,?,?)')
    .run(workerId, amount, 'Requested', now())
  ledger(workerId, { title: 'Salary Advance', subtitle: 'Requested', amount, isCredit: false, kind: 'advance', status: 'Pending', remarks: 'Awaiting admin approval' })
  notify(workerId, `Salary advance of ₹${amount} requested — awaiting admin approval.`, 'advance')
  return { ok: true, id: info.lastInsertRowid }
}

// Admin approves: credit advance into Available + start recovery against future earnings.
export function approveAdvance(id) {
  const x = db.prepare('SELECT * FROM worker_advances WHERE id=?').get(id); if (!x || x.status !== 'Requested') return { error: 'Not a pending advance' }
  db.prepare("UPDATE worker_advances SET status='Recovering', processed=? WHERE id=?").run(now(), id)
  db.prepare('UPDATE workers SET balance=balance+?, advance_outstanding=advance_outstanding+? WHERE id=?').run(x.amount, x.amount, x.worker_id)
  ledger(x.worker_id, { title: 'Salary Advance', subtitle: 'Approved & credited', amount: x.amount, isCredit: true, kind: 'advance', remarks: 'Recovery from future earnings' })
  safeLedger({ workerId: x.worker_id, type: 'SALARY_ADVANCE', credit: x.amount, status: 'SUCCESS', remarks: 'Advance credited — recovery from future earnings' })
  notify(x.worker_id, `Salary advance of ₹${x.amount} approved & credited. Recovery will start from future earnings.`, 'advance')
  return { ok: true }
}
export function rejectAdvance(id, remarks = 'Rejected by admin') {
  const x = db.prepare('SELECT * FROM worker_advances WHERE id=?').get(id); if (!x || x.status !== 'Requested') return { error: 'Not a pending advance' }
  db.prepare("UPDATE worker_advances SET status='Rejected', remarks=?, processed=? WHERE id=?").run(remarks, now(), id)
  notify(x.worker_id, `Salary advance of ₹${x.amount} was rejected. ${remarks}`, 'advance')
  return { ok: true }
}

/* ---------- hold / release (complaint, refund, QC) ---------- */
export function holdAmount(workerId, amount, reason = 'Quality check') {
  amount = Math.round(Number(amount) || 0)
  const w = getRow(workerId); if (!w || amount <= 0) return { error: 'Invalid hold' }
  const from = Math.min(amount, w.balance)
  db.prepare('UPDATE workers SET balance=balance-?, hold=hold+? WHERE id=?').run(from, amount, workerId)
  ledger(workerId, { title: 'Payment On Hold', subtitle: reason, amount, isCredit: false, kind: 'hold', status: 'Hold', remarks: reason })
  safeLedger({ workerId, type: 'HOLD', debit: amount, bucket: 'hold', status: 'HOLD', remarks: reason })
  notify(workerId, `₹${amount} placed on hold. Reason: ${reason}`, 'hold')
  return { ok: true }
}
export function releaseHold(workerId, amount, reason = 'Hold released') {
  const w = getRow(workerId); if (!w) return { error: 'Worker not found' }
  amount = Math.min(Math.round(Number(amount) || 0) || w.hold, w.hold)
  if (amount <= 0) return { error: 'Nothing on hold' }
  db.prepare('UPDATE workers SET hold=hold-?, balance=balance+? WHERE id=?').run(amount, amount, workerId)
  ledger(workerId, { title: 'Hold Released', subtitle: reason, amount, isCredit: true, kind: 'hold', remarks: reason })
  safeLedger({ workerId, type: 'HOLD_RELEASE', credit: amount, status: 'SUCCESS', remarks: reason })
  notify(workerId, `₹${amount} hold released to your Available balance. ${reason}`, 'hold')
  return { ok: true }
}

/* ---------- pending -> available (quality check / settlement clears) ---------- */
export function releasePending(workerId, amount) {
  const w = getRow(workerId); if (!w) return { error: 'Worker not found' }
  amount = Math.min(Math.round(Number(amount) || 0) || w.pending, w.pending)
  if (amount <= 0) return { error: 'No pending balance' }
  db.prepare('UPDATE workers SET pending=pending-?, balance=balance+? WHERE id=?').run(amount, amount, workerId)
  db.prepare("UPDATE worker_income SET bucket='available' WHERE worker_id=? AND bucket='pending'").run(workerId)
  ledger(workerId, { title: 'Earnings Cleared', subtitle: 'Quality check passed', amount, isCredit: true, kind: 'income', remarks: 'Moved from Pending to Available' })
  notify(workerId, `₹${amount} cleared quality check and is now available to withdraw.`, 'credit')
  return { ok: true }
}

/* ---------- payslip ---------- */
export function buildPayslip(workerId, month) {
  const w = getRow(workerId) || {}
  month = month || new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const income = db.prepare('SELECT category, SUM(amount) total FROM worker_income WHERE worker_id=? GROUP BY category').all(workerId)
  const incomeMap = Object.fromEntries(income.map((r) => [r.category, r.total]))
  const gross = income.reduce((s, r) => s + r.total, 0)
  const jobsTotal = incomeMap['Completed Jobs'] || 0
  const bonuses = gross - jobsTotal
  const dedRows = db.prepare('SELECT category, SUM(amount) total FROM worker_deductions WHERE worker_id=? GROUP BY category').all(workerId)
  const deductions = dedRows.reduce((s, r) => s + r.total, 0)
  return {
    workerName: w.name || '', workerId: `HH-${String(workerId).padStart(5, '0')}`, month,
    totalJobs: w.jobs || 0, grossEarnings: gross, bonuses, deductions,
    netPay: gross - deductions, withdrawals: w.withdrawn || 0, pending: w.pending || 0,
    bankDetails: `${w.bank_name || '—'} • ${w.bank_account || '—'}`,
    breakup: INCOME_CATEGORIES.map((c) => ({ category: c, amount: incomeMap[c] || 0 })),
    deductionBreakup: DEDUCTION_CATEGORIES.map((c) => ({ category: c, amount: (dedRows.find((d) => d.category === c)?.total) || 0 })),
  }
}
export function generatePayslip(workerId, month) {
  const slip = buildPayslip(workerId, month)
  db.prepare('INSERT INTO worker_payslips (worker_id,month,payload,created) VALUES (?,?,?,?)')
    .run(workerId, slip.month, JSON.stringify(slip), now())
  notify(workerId, `Payslip for ${slip.month} is ready to download.`, 'info')
  return slip
}
export function payslipsList(workerId) {
  return db.prepare('SELECT month,created FROM worker_payslips WHERE worker_id=? ORDER BY id DESC').all(workerId)
    .map((p) => ({ month: p.month, date: fmtDate(p.created) }))
}

/* ---------- one-time demo seed for the built-in worker (Rahul Kumar) ---------- */
function seedWalletDemo() {
  const w = db.prepare('SELECT id FROM workers WHERE phone=?').get('9000012345')
  if (!w) return
  if (db.prepare('SELECT COUNT(*) n FROM worker_income WHERE worker_id=?').get(w.id).n > 0) return
  const id = w.id
  // Earnings breakup
  ;[['Completed Jobs', 12480, 'available'], ['Tips', 640, 'available'], ['Attendance Bonus', 500, 'available'],
    ['Peak Hour Bonus', 360, 'available'], ['Performance Bonus', 300, 'available'], ['Customer Rating Bonus', 250, 'available'],
    ['Referral Bonus', 200, 'available'], ['Festival Bonus', 750, 'pending']].forEach(([c, a, b]) =>
    recordIncome(id, c, a, { bucket: b }))
  // Deductions (transparent, itemised)
  ;[['Hostel Rent', 1500], ['Meal Charges', 900], ['Uniform Charges', 200], ['Equipment Charges', 150],
    ['Late Arrival Deduction', 50], ['Penalty', 0]].filter(([, a]) => a > 0).forEach(([c, a]) =>
    recordDeduction(id, c, a, {}))
  // A hold (sample complaint) + a paid withdrawal in history
  holdAmount(id, 500, 'Customer raised a cleaning-quality complaint')
  db.prepare("UPDATE workers SET next_payout=? WHERE id=?").run(nextFriday(), id)
  db.prepare('INSERT INTO worker_withdrawals (worker_id,amount,method,destination,status,requested,processed) VALUES (?,?,?,?,?,?,?)')
    .run(id, 2700, 'Bank', 'A/c xxxx1234', 'Paid', now(), now())
  console.log('[worker-wallet] seeded demo wallet (earnings, deductions, hold)')
}
seedWalletDemo()
