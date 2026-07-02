// HomeHelp Wallet Service
// -----------------------
// Owns the worker earnings LEDGER on its own Postgres (income/deductions/withdrawals/advances/
// payslips/notifications). It reacts to booking.completed (credit the worker's share),
// booking.cancelled (travel/visit compensation) and payout.completed (mark a withdrawal paid),
// and updates the worker's balance snapshot in the worker service via /internal. Serves the
// worker wallet screens and the admin wallet actions.
import express from 'express'
import {
  makePool, migrate, internalGet, internalPost, tryGet, publishEvent, subscribeEvents,
  makeAdminAuth, getSettingInt,
} from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4009)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5439/wallet'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const WORKER_URL = (process.env.WORKER_URL || 'http://localhost:4004').replace(/\/$/, '')

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
    // Plain unique (NULLs are distinct in Postgres, so bonus/penalty rows with no ref_id are fine),
    // so `INSERT ... ON CONFLICT (worker_id, ref_id)` can use it as the arbiter for idempotent settlement.
    `DROP INDEX IF EXISTS ux_income_ref`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_income_ref ON worker_income(worker_id, ref_id)`,
  ])
  console.log('[wallet] Postgres ready (worker earnings ledger)')
}

const commission = () => getSettingInt(ADMIN_URL, 'commission_percent', 20)
const workerSnapshot = (wid) => tryGet(WORKER_URL, `/internal/workers/${wid}`, {})
const adjustBalance = (wid, delta) => internalPost(WORKER_URL, `/internal/workers/${wid}/balance`, delta).catch((e) => console.error('[wallet] balance adjust failed:', e.message))
async function notify(wid, title, body) { await pool.query('INSERT INTO worker_notifications (worker_id,title,body) VALUES ($1,$2,$3)', [wid, title, body]) }

// Credit a worker's earnings for a completed booking (idempotent on ref_id).
async function settleBooking(b) {
  if (!b?.worker_id) return
  const pct = await commission()
  const share = Math.max(0, Math.round(((b.total || 0) * (100 - pct)) / 100))
  if (share <= 0) return
  const ins = await pool.query(
    `INSERT INTO worker_income (worker_id,category,label,amount,ref_id,bucket) VALUES ($1,'Job Earnings',$2,$3,$4,'available')
     ON CONFLICT (worker_id, ref_id) DO NOTHING RETURNING id`,
    [b.worker_id, b.ref || `#${b.id}`, share, String(b.id)])
  if (!ins.rowCount) return // already settled
  await adjustBalance(b.worker_id, { balance: share, earnings: share, jobs: 1 })
  await internalPost((process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, ''), `/api/internal/bookings/${b.id}/settled`, {}).catch(() => {})
  await notify(b.worker_id, 'Earnings credited', `₹${share} for ${b.ref || b.id}`)
  publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Wallet', action: 'wallet.credit', entityType: 'worker', entityId: b.worker_id, detail: `Credited ₹${share} for ${b.ref || b.id}`, meta: { amount: share } })
}

async function summary(wid) {
  const w = await workerSnapshot(wid)
  const wk = (await pool.query("SELECT COALESCE(SUM(amount),0)::int s FROM worker_income WHERE worker_id=$1 AND created > now()-interval '7 days'", [wid])).rows[0].s
  const mo = (await pool.query("SELECT COALESCE(SUM(amount),0)::int s FROM worker_income WHERE worker_id=$1 AND created > now()-interval '30 days'", [wid])).rows[0].s
  return { available: w.balance || 0, pending: w.pending || 0, onHold: w.hold || 0, totalEarned: w.earnings || 0, withdrawn: w.withdrawn || 0, advanceOutstanding: w.advance_outstanding || 0, thisWeek: wk, thisMonth: mo }
}
const rowsFor = async (table, wid) => (await pool.query(`SELECT * FROM ${table} WHERE worker_id=$1 ORDER BY id DESC`, [wid])).rows
async function walletState(wid) {
  return {
    walletSummary: await summary(wid),
    earningsBreakup: await rowsFor('worker_income', wid),
    deductions: await rowsFor('worker_deductions', wid),
    history: await rowsFor('worker_income', wid),
    withdrawals: await rowsFor('worker_withdrawals', wid),
    advances: await rowsFor('worker_advances', wid),
  }
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'wallet', ok: true }))

function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '')
  const id = t.startsWith('worker-') ? Number(t.slice(7)) : NaN
  if (!Number.isFinite(id)) return res.status(401).json({ ok: false, error: 'Not authenticated' })
  req.wid = id
  next()
}

/* ---------- worker wallet ---------- */
app.get('/api/worker/wallet/summary', auth, async (req, res) => res.json(await summary(req.wid)))
app.get('/api/worker/wallet/state', auth, async (req, res) => res.json(await walletState(req.wid)))
app.get('/api/worker/wallet/earnings-breakup', auth, async (req, res) => res.json(await rowsFor('worker_income', req.wid)))
app.get('/api/worker/wallet/deductions', auth, async (req, res) => res.json(await rowsFor('worker_deductions', req.wid)))
app.get('/api/worker/wallet/history', auth, async (req, res) => res.json(await rowsFor('worker_income', req.wid)))
app.get('/api/worker/wallet/withdrawals', auth, async (req, res) => res.json(await rowsFor('worker_withdrawals', req.wid)))
app.get('/api/worker/wallet/advances', auth, async (req, res) => res.json(await rowsFor('worker_advances', req.wid)))
app.get('/api/worker/wallet/notifications', auth, async (req, res) => res.json(await rowsFor('worker_notifications', req.wid)))
app.post('/api/worker/wallet/notifications/read', auth, async (req, res) => { await pool.query('UPDATE worker_notifications SET read=true WHERE worker_id=$1', [req.wid]); res.json({ ok: true }) })
app.get('/api/worker/wallet/payslip', auth, async (req, res) => { const s = await summary(req.wid); res.json({ month: req.query.month || 'This month', gross: s.thisMonth, deductions: 0, net: s.thisMonth }) })
app.get('/api/worker/wallet/payslips', auth, async (req, res) => res.json(await rowsFor('worker_payslips', req.wid)))
app.post('/api/worker/wallet/payslip/generate', auth, async (req, res) => { const s = await summary(req.wid); const { rows } = await pool.query('INSERT INTO worker_payslips (worker_id,month,gross,deductions,net) VALUES ($1,$2,$3,0,$3) RETURNING *', [req.wid, req.body?.month || 'This month', s.thisMonth]); res.json(rows[0]) })

app.post('/api/worker/wallet/withdraw/request-otp', auth, (_q, res) => res.json({ ok: true, devOtp: '1234' }))
app.post('/api/worker/wallet/withdraw/request', auth, async (req, res) => {
  const amount = parseInt(req.body?.amount, 10)
  const w = await workerSnapshot(req.wid)
  if (!amount || amount <= 0) return res.json({ ok: false, error: 'Enter a valid amount' })
  if (amount > (w.balance || 0)) return res.json({ ok: false, error: 'Amount exceeds available balance' })
  const autoBelow = await getSettingInt(ADMIN_URL, 'auto_approve_withdrawal_below', 2000)
  const status = amount <= autoBelow ? 'Paid' : 'Pending'
  await pool.query('INSERT INTO worker_withdrawals (worker_id,amount,method,status) VALUES ($1,$2,$3,$4)', [req.wid, amount, req.body?.method || 'bank', status])
  await adjustBalance(req.wid, { balance: -amount, withdrawn: status === 'Paid' ? amount : 0, hold: status === 'Pending' ? amount : 0 })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.wid, action: 'wallet.withdraw', entityType: 'wallet', entityId: req.wid, detail: `Requested withdrawal ₹${amount} (${status})`, meta: { amount } })
  res.json({ ok: true, ...(await walletState(req.wid)) })
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
app.post('/api/admin/workers/:id/wallet/bonus', adminAuth, async (req, res) => { const wid = Number(req.params.id), amt = Math.max(0, parseInt(req.body?.amount, 10) || 0); await pool.query("INSERT INTO worker_income (worker_id,category,label,amount,bucket) VALUES ($1,'Bonus',$2,$3,'available')", [wid, req.body?.label || 'Admin bonus', amt]); await adjustBalance(wid, { balance: amt, earnings: amt }); res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/penalty', adminAuth, async (req, res) => { const wid = Number(req.params.id), amt = Math.max(0, parseInt(req.body?.amount, 10) || 0); await pool.query("INSERT INTO worker_deductions (worker_id,category,label,amount) VALUES ($1,'Penalty',$2,$3)", [wid, req.body?.label || 'Admin penalty', amt]); await adjustBalance(wid, { balance: -amt }); res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/hold', adminAuth, async (req, res) => { const wid = Number(req.params.id), amt = Math.max(0, parseInt(req.body?.amount, 10) || 0); await adjustBalance(wid, { balance: -amt, hold: amt }); res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/release-hold', adminAuth, async (req, res) => { const wid = Number(req.params.id), amt = Math.max(0, parseInt(req.body?.amount, 10) || 0); await adjustBalance(wid, { balance: amt, hold: -amt }); res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/withdrawals/:wd/approve', adminAuth, async (req, res) => { const wid = Number(req.params.id); const w = (await pool.query('SELECT * FROM worker_withdrawals WHERE id=$1', [Number(req.params.wd)])).rows[0]; if (w) { await pool.query("UPDATE worker_withdrawals SET status='Paid' WHERE id=$1", [w.id]); await adjustBalance(wid, { hold: -w.amount, withdrawn: w.amount }) } res.json(await walletState(wid)) })
app.post('/api/admin/workers/:id/wallet/withdrawals/:wd/reject', adminAuth, async (req, res) => { const wid = Number(req.params.id); const w = (await pool.query('SELECT * FROM worker_withdrawals WHERE id=$1', [Number(req.params.wd)])).rows[0]; if (w) { await pool.query("UPDATE worker_withdrawals SET status='Rejected' WHERE id=$1", [w.id]); await adjustBalance(wid, { hold: -w.amount, balance: w.amount }) } res.json(await walletState(wid)) })

/* ---------- event consumers ---------- */
subscribeEvents(REDIS_URL, 'wallet', async (type, data) => {
  if (type === 'booking.completed' && data.booking) await settleBooking(data.booking)
  else if (type === 'booking.cancelled' && data.booking?.worker_id && data.quote?.workerComp > 0) {
    const b = data.booking, comp = data.quote.workerComp
    const ins = await pool.query("INSERT INTO worker_income (worker_id,category,label,amount,ref_id,bucket) VALUES ($1,'Compensation',$2,$3,$4,'available') ON CONFLICT (worker_id, ref_id) DO NOTHING RETURNING id", [b.worker_id, `Comp ${b.ref}`, comp, `comp-${b.id}`])
    if (ins.rowCount) await adjustBalance(b.worker_id, { balance: comp, earnings: comp })
  } else if (type === 'payout.completed' && data.withdrawalId) {
    await pool.query("UPDATE worker_withdrawals SET status='Paid' WHERE id=$1", [data.withdrawalId])
  }
})

init()
  .then(() => app.listen(PORT, () => console.log(`[wallet] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[wallet] failed to start:', e.message); process.exit(1) })
