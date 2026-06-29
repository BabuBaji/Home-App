// Admin REST API — mounted at /api/admin by index.js. Shares the same DB/socket
// as the customer app so it manages real customers, bookings, payments, services.
import { Router } from 'express'
import { writeFileSync } from 'node:fs'
import { db } from './db.js'
import {
  verifyPw, getAdminByEmail, getAdmin, touchLogin, publicAdmin,
  listAdmins, createAdmin, updateAdmin, deleteAdmin,
  listWorkers, getWorker, createWorker, updateWorker, deleteWorker, workerStats,
  getSettings, getPublicSettings, updateSettings,
  listComplaints, createComplaint, updateComplaint,
  logAudit, listAudit,
} from './admin-db.js'
import {
  walletSummary, earningsBreakup, deductionsList, walletHistory, withdrawalsList, advancesList,
  recordIncome, recordDeduction, holdAmount, releaseHold, releasePending,
  approveWithdrawal, rejectWithdrawal, approveAdvance, rejectAdvance,
  generatePayslip, buildPayslip,
} from './worker-wallet-db.js'
import { bankKycDto, setWorkerBankStatus } from './worker-db.js'
import { retryPayout } from './worker-wallet-db.js'
import {
  financeReports, paymentsList, settlementsList, payoutsList, ledgerForWorker, ledgerAll, workerWisePayout,
} from './payments-db.js'

const now = () => new Date()
const iso = () => now().toISOString()

export function createAdminRouter(io) {
  const r = Router()

  /* ---------- auth ---------- */
  function admin(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const id = token.startsWith('admin-') ? Number(token.slice(6)) : NaN
    const a = getAdmin(id)
    if (!a || a.status !== 'active') return res.status(401).json({ error: 'Not authenticated' })
    req.admin = a
    next()
  }
  // role gate: super > admin > manager > support
  const RANK = { super: 4, admin: 3, manager: 2, support: 1 }
  const require = (min) => (req, res, next) =>
    (RANK[req.admin.role] || 0) >= RANK[min] ? next() : res.status(403).json({ error: 'Insufficient permissions' })

  r.post('/login', (req, res) => {
    const a = getAdminByEmail(String(req.body?.email || '').trim())
    if (!a || !verifyPw(String(req.body?.password || ''), a.pass_hash))
      return res.status(401).json({ error: 'Invalid email or password' })
    if (a.status !== 'active') return res.status(403).json({ error: 'Account disabled' })
    touchLogin(a.id)
    logAudit(a.email, 'login')
    res.json({ token: 'admin-' + a.id, admin: publicAdmin(a) })
  })
  r.get('/me', admin, (req, res) => res.json({ admin: publicAdmin(req.admin) }))

  /* ---------- helpers over the shared customer tables ---------- */
  const customerName = (uid) => db.prepare('SELECT name FROM users WHERE id=?').get(uid)?.name || 'Customer'
  const parseItems = (s) => { try { return JSON.parse(s) } catch { return [] } }
  const PAID = "(payment_status='paid' OR status='completed')"

  /* ---------- dashboard ---------- */
  r.get('/dashboard', admin, (req, res) => {
    const totalBookings = db.prepare('SELECT COUNT(*) n FROM bookings').get().n
    const completed = db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='completed'").get().n
    const active = db.prepare("SELECT COUNT(*) n FROM bookings WHERE status IN ('confirmed','worker_assigned','on_the_way','arrived','in_progress')").get().n
    const cancelled = db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='cancelled'").get().n
    const revenue = db.prepare(`SELECT COALESCE(SUM(total),0) s FROM bookings WHERE ${PAID}`).get().s
    const customers = db.prepare('SELECT COUNT(*) n FROM users').get().n
    const ws = workerStats()
    const avgRating = db.prepare('SELECT COALESCE(AVG(rating),0) a FROM bookings WHERE rating IS NOT NULL').get().a

    // bookings trend — last 7 days
    const trend = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now()); d.setDate(d.getDate() - i)
      const day = d.toISOString().slice(0, 10)
      const total = db.prepare("SELECT COUNT(*) n FROM bookings WHERE substr(created,1,10)=?").get(day).n
      const comp = db.prepare("SELECT COUNT(*) n FROM bookings WHERE substr(created,1,10)=? AND status='completed'").get(day).n
      const rev = db.prepare(`SELECT COALESCE(SUM(total),0) s FROM bookings WHERE substr(created,1,10)=? AND ${PAID}`).get(day).s
      trend.push({ day: d.toLocaleDateString('en-US', { weekday: 'short' }), total, completed: comp, revenue: rev })
    }

    // bookings by city (via customer city)
    const cityRows = db.prepare(`SELECT COALESCE(u.city,'Unknown') city, COUNT(*) n
      FROM bookings b JOIN users u ON u.id=b.user_id GROUP BY u.city ORDER BY n DESC LIMIT 6`).all()

    // top services (expand items JSON)
    const counts = {}
    for (const b of db.prepare('SELECT items FROM bookings').all())
      for (const it of parseItems(b.items)) counts[it.name] = (counts[it.name] || 0) + 1
    const topServices = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, n]) => ({ name, n }))

    const recent = db.prepare('SELECT id,ref,user_id,total,status,created,items FROM bookings ORDER BY id DESC LIMIT 6').all()
      .map((b) => ({ id: b.id, ref: b.ref, customer: customerName(b.user_id), total: b.total, status: b.status, created: b.created, service: parseItems(b.items)[0]?.name || '—' }))

    const registrations = db.prepare('SELECT id,name,phone,email,city,created FROM users ORDER BY id DESC LIMIT 6').all()

    res.json({
      stats: { totalBookings, completed, active, cancelled, revenue, customers, avgRating: +avgRating.toFixed(2), workers: ws },
      trend, cityRows, topServices, recent, registrations,
    })
  })

  /* ---------- customers ---------- */
  r.get('/customers', admin, (req, res) => {
    const q = String(req.query.q || '').toLowerCase()
    const status = String(req.query.status || 'all')
    let rows = db.prepare('SELECT * FROM users ORDER BY id DESC').all()
    if (status !== 'all') rows = rows.filter((u) => (u.status || 'active') === status)
    if (q) rows = rows.filter((u) => (u.name || '').toLowerCase().includes(q) || (u.phone || '').includes(q) || (u.email || '').toLowerCase().includes(q))
    const out = rows.map((u) => {
      const agg = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(total),0) spend, MAX(created) last FROM bookings WHERE user_id=?').get(u.id)
      return { id: u.id, name: u.name || 'Guest', phone: u.phone, email: u.email, city: u.city, country: u.country,
        wallet: u.wallet, rating: u.rating, status: u.status || 'active', bookings: agg.n, spend: agg.spend, lastOrder: agg.last, joined: u.created }
    })
    res.json(out)
  })
  r.get('/customers/:id', admin, (req, res) => {
    const id = Number(req.params.id)
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(id)
    if (!u) return res.status(404).json({ error: 'Customer not found' })
    const addresses = db.prepare('SELECT * FROM addresses WHERE user_id=?').all(id)
    const bookings = db.prepare('SELECT id,ref,total,status,created,items FROM bookings WHERE user_id=? ORDER BY id DESC').all(id)
      .map((b) => ({ ...b, items: parseItems(b.items) }))
    const transactions = db.prepare('SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC').all(id)
    res.json({ customer: { ...u, status: u.status || 'active' }, addresses, bookings, transactions })
  })
  r.patch('/customers/:id', admin, (req, res) => {
    const id = Number(req.params.id)
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(id)
    if (!u) return res.status(404).json({ error: 'Customer not found' })
    const status = req.body?.status ?? u.status ?? 'active'
    db.prepare('UPDATE users SET name=?, email=?, city=?, status=? WHERE id=?')
      .run(req.body?.name ?? u.name, req.body?.email ?? u.email, req.body?.city ?? u.city, status, id)
    logAudit(req.admin.email, 'customer:update', `#${id} → ${status}`)
    res.json({ ok: true })
  })
  r.post('/customers/:id/wallet', admin, (req, res) => {
    const id = Number(req.params.id)
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(id)
    if (!u) return res.status(404).json({ error: 'Customer not found' })
    const amount = Math.round(Number(req.body?.amount) || 0)
    if (!amount) return res.status(400).json({ error: 'Enter an amount' })
    const type = amount > 0 ? 'credit' : 'debit'
    const newBal = u.wallet + amount
    if (newBal < 0) return res.status(400).json({ error: 'Balance cannot go negative' })
    db.prepare('UPDATE users SET wallet=? WHERE id=?').run(newBal, id)
    db.prepare('INSERT INTO transactions (user_id,type,title,amount,balance,created) VALUES (?,?,?,?,?,?)')
      .run(id, type, req.body?.note || 'Admin adjustment', Math.abs(amount), newBal, iso())
    logAudit(req.admin.email, 'wallet:adjust', `#${id} ${amount > 0 ? '+' : ''}${amount}`)
    res.json({ balance: newBal })
  })

  /* ---------- workers (pros) ---------- */
  r.get('/workers', admin, (req, res) => res.json({ stats: workerStats(), workers: listWorkers(req.query) }))
  r.post('/workers', admin, require('manager'), (req, res) => { const w = createWorker(req.body || {}); logAudit(req.admin.email, 'worker:create', w?.name); res.status(201).json(w) })
  r.get('/workers/:id', admin, (req, res) => { const w = getWorker(Number(req.params.id)); return w ? res.json(w) : res.status(404).json({ error: 'Not found' }) })
  r.patch('/workers/:id', admin, require('manager'), (req, res) => { const w = updateWorker(Number(req.params.id), req.body || {}); logAudit(req.admin.email, 'worker:update', w?.name); return w ? res.json(w) : res.status(404).json({ error: 'Not found' }) })
  r.delete('/workers/:id', admin, require('admin'), (req, res) => { deleteWorker(Number(req.params.id)); logAudit(req.admin.email, 'worker:delete', req.params.id); res.json({ ok: true }) })

  /* ---------- worker wallet controls ---------- */
  // Full wallet view for one worker (dashboard + breakup + deductions + history + queues).
  const walletView = (wid) => ({
    summary: walletSummary(wid), earningsBreakup: earningsBreakup(wid), deductions: deductionsList(wid),
    history: walletHistory(wid, 200), withdrawals: withdrawalsList(wid), advances: advancesList(wid),
    bank: bankKycDto(wid), ledger: ledgerForWorker(wid, 200),
  })
  r.get('/workers/:id/wallet', admin, (req, res) => res.json(walletView(Number(req.params.id))))

  /* ---------- finance panel: payments, settlements, payouts, ledger, reports ---------- */
  r.get('/finance/reports', admin, (_q, res) => res.json(financeReports()))
  r.get('/finance/payments', admin, (req, res) => res.json(paymentsList({ status: String(req.query.status || 'all') })))
  r.get('/finance/settlements', admin, (_q, res) => res.json(settlementsList()))
  r.get('/finance/payouts', admin, (req, res) => res.json(payoutsList({ status: String(req.query.status || 'all') })))
  r.get('/finance/ledger', admin, (req, res) => res.json(req.query.worker ? ledgerForWorker(Number(req.query.worker), 500) : ledgerAll(500)))
  r.get('/finance/worker-payout', admin, (_q, res) => res.json(workerWisePayout()))
  // Retry a failed/reversed payout (re-debits available + re-dispatches to the provider).
  r.post('/finance/payouts/:withdrawalId/retry', admin, require('manager'), (req, res) => {
    const out = retryPayout(Number(req.params.withdrawalId))
    if (out?.error) return res.status(400).json({ error: out.error })
    logAudit(req.admin.email, 'payout:retry', req.params.withdrawalId)
    res.json({ ok: true })
  })
  // CSV exports for finance reconciliation.
  r.get('/finance/payments.csv', admin, (_q, res) => {
    const rows = paymentsList({ limit: 5000 })
    const head = 'PaymentID,BookingID,CustomerID,Amount,Mode,Gateway,Status,PaidAt'
    const body = rows.map((p) => [p.paymentId, p.bookingId, p.customerId, p.amount, p.mode, p.gateway, p.status, p.paidAt || ''].join(',')).join('\n')
    res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"')
    res.send(`${head}\n${body}\n`)
  })
  r.get('/finance/payouts.csv', admin, (_q, res) => {
    const rows = payoutsList({ limit: 5000 })
    const head = 'PayoutID,WithdrawalID,WorkerID,Amount,Provider,Mode,Status,Destination,CreatedAt'
    const body = rows.map((p) => [p.payoutId, p.withdrawalId, p.workerId, p.amount, p.provider, p.mode, p.status, p.destination, p.createdAt].join(',')).join('\n')
    res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="payouts.csv"')
    res.send(`${head}\n${body}\n`)
  })

  // Bank & KYC verification — approve/reject a worker's bank account.
  r.post('/workers/:id/bank/approve', admin, require('manager'), (req, res) => {
    const wid = Number(req.params.id)
    const out = setWorkerBankStatus(wid, 'Approved')
    if (!out) return res.status(404).json({ error: 'Worker not found' })
    logAudit(req.admin.email, 'bank:approve', wid)
    res.json({ ok: true, ...walletView(wid) })
  })
  r.post('/workers/:id/bank/reject', admin, require('manager'), (req, res) => {
    const wid = Number(req.params.id)
    const out = setWorkerBankStatus(wid, 'Rejected', req.body?.reason || 'Details could not be verified')
    if (!out) return res.status(404).json({ error: 'Worker not found' })
    logAudit(req.admin.email, 'bank:reject', wid)
    res.json({ ok: true, ...walletView(wid) })
  })

  const num = (v) => parseInt(v, 10)
  const walletAction = (handler, audit) => (req, res) => {
    const wid = Number(req.params.id)
    const out = handler(wid, req)
    if (out?.error) return res.status(400).json({ error: out.error })
    logAudit(req.admin.email, audit, wid)
    res.json({ ok: true, ...walletView(wid) })
  }

  // Add bonus / incentive (credit) and penalty / charge (debit) — both fully transparent.
  r.post('/workers/:id/wallet/bonus', admin, require('manager'),
    walletAction((wid, req) => recordIncome(wid, req.body?.category || 'Performance Bonus', num(req.body?.amount),
      { label: req.body?.label || req.body?.reason || '', bucket: req.body?.bucket || 'available' }) || { ok: true }, 'wallet:bonus'))
  r.post('/workers/:id/wallet/penalty', admin, require('manager'),
    walletAction((wid, req) => recordDeduction(wid, req.body?.category || 'Penalty', num(req.body?.amount),
      { label: req.body?.reason || req.body?.label || '' }) || { ok: true }, 'wallet:penalty'))

  // Hold / release payment, and clear Pending -> Available after quality check.
  r.post('/workers/:id/wallet/hold', admin, require('manager'),
    walletAction((wid, req) => holdAmount(wid, num(req.body?.amount), req.body?.reason || 'Quality check'), 'wallet:hold'))
  r.post('/workers/:id/wallet/release-hold', admin, require('manager'),
    walletAction((wid, req) => releaseHold(wid, num(req.body?.amount), req.body?.reason || 'Hold released'), 'wallet:release-hold'))
  r.post('/workers/:id/wallet/release-pending', admin, require('manager'),
    walletAction((wid, req) => releasePending(wid, num(req.body?.amount)), 'wallet:release-pending'))

  // Approve / reject a withdrawal request.
  r.post('/workers/:id/wallet/withdrawals/:wd/approve', admin, require('manager'),
    walletAction((wid, req) => approveWithdrawal(num(req.params.wd)), 'wallet:withdraw-approve'))
  r.post('/workers/:id/wallet/withdrawals/:wd/reject', admin, require('manager'),
    walletAction((wid, req) => rejectWithdrawal(num(req.params.wd), req.body?.reason), 'wallet:withdraw-reject'))

  // Approve / reject a salary advance (approval credits + starts recovery).
  r.post('/workers/:id/wallet/advances/:adv/approve', admin, require('manager'),
    walletAction((wid, req) => approveAdvance(num(req.params.adv)), 'wallet:advance-approve'))
  r.post('/workers/:id/wallet/advances/:adv/reject', admin, require('manager'),
    walletAction((wid, req) => rejectAdvance(num(req.params.adv), req.body?.reason), 'wallet:advance-reject'))

  // Generate a monthly payslip; export a CSV wallet report across all workers.
  r.post('/workers/:id/wallet/payslip', admin, require('manager'), (req, res) => {
    const wid = Number(req.params.id)
    const slip = generatePayslip(wid, req.body?.month)
    logAudit(req.admin.email, 'wallet:payslip', wid)
    res.json({ ok: true, payslip: slip })
  })
  r.get('/wallet/report.csv', admin, (req, res) => {
    const rows = db.prepare('SELECT id,name,balance,pending,hold,withdrawn,advance_outstanding,earnings FROM workers ORDER BY id').all()
    const head = 'WorkerID,Name,Available,Pending,Hold,TotalWithdrawn,AdvanceOutstanding,TotalEarned'
    const body = rows.map((w) => [w.id, `"${(w.name || '').replace(/"/g, '""')}"`, w.balance || 0, w.pending || 0, w.hold || 0, w.withdrawn || 0, w.advance_outstanding || 0, w.earnings || 0].join(',')).join('\n')
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="wallet-report.csv"')
    res.send(`${head}\n${body}\n`)
  })

  /* ---------- bookings ---------- */
  r.get('/bookings', admin, (req, res) => {
    const status = String(req.query.status || 'all')
    const q = String(req.query.q || '').toLowerCase()
    let rows = db.prepare('SELECT * FROM bookings ORDER BY id DESC').all()
    if (status !== 'all') {
      const map = { ongoing: ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress'], completed: ['completed'], cancelled: ['cancelled'], upcoming: ['confirmed', 'worker_assigned'] }
      const allowed = map[status]
      rows = allowed ? rows.filter((b) => allowed.includes(b.status)) : rows.filter((b) => b.status === status)
    }
    let out = rows.map((b) => ({ id: b.id, ref: b.ref, customer: customerName(b.user_id), service: parseItems(b.items).map((i) => i.name).join(', '),
      pro: b.pro_name, date: b.date, time: b.time, type: b.type, total: b.total, payment: b.payment, payment_status: b.payment_status, status: b.status, created: b.created }))
    if (q) out = out.filter((b) => b.ref.toLowerCase().includes(q) || b.customer.toLowerCase().includes(q) || b.service.toLowerCase().includes(q))
    res.json(out)
  })
  r.get('/bookings/:id', admin, (req, res) => {
    const b = db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(req.params.id))
    if (!b) return res.status(404).json({ error: 'Not found' })
    res.json({ ...b, items: parseItems(b.items), customer: customerName(b.user_id) })
  })
  r.patch('/bookings/:id', admin, require('manager'), (req, res) => {
    const id = Number(req.params.id)
    const b = db.prepare('SELECT * FROM bookings WHERE id=?').get(id)
    if (!b) return res.status(404).json({ error: 'Not found' })
    if (req.body?.status) db.prepare('UPDATE bookings SET status=? WHERE id=?').run(req.body.status, id)
    if (req.body?.pro_name) db.prepare('UPDATE bookings SET pro_name=?, status=CASE WHEN status=? THEN ? ELSE status END WHERE id=?')
      .run(req.body.pro_name, 'confirmed', 'worker_assigned', id)
    const updated = db.prepare('SELECT * FROM bookings WHERE id=?').get(id)
    io?.to(`booking:${id}`).emit('booking:update', { ...updated, items: parseItems(updated.items) })
    logAudit(req.admin.email, 'booking:update', b.ref)
    res.json({ ...updated, items: parseItems(updated.items) })
  })

  /* ---------- services ---------- */
  r.get('/services', admin, (req, res) => {
    const rows = db.prepare('SELECT * FROM services ORDER BY sort, name').all()
    const withCount = rows.map((s) => ({ ...s, available: !!s.available,
      bookings: db.prepare('SELECT COUNT(*) n FROM bookings WHERE items LIKE ?').get(`%"id":"${s.id}"%`).n }))
    res.json(withCount)
  })
  r.post('/services', admin, require('manager'), (req, res) => {
    const b = req.body || {}
    const id = String(b.id || b.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24)
    if (!id || !b.name) return res.status(400).json({ error: 'Name is required' })
    if (db.prepare('SELECT 1 FROM services WHERE id=?').get(id)) return res.status(409).json({ error: 'Service already exists' })
    const sort = (db.prepare('SELECT COALESCE(MAX(sort),0) m FROM services').get().m) + 1
    db.prepare('INSERT INTO services (id,name,icon,price,category,available,sort) VALUES (?,?,?,?,?,?,?)')
      .run(id, b.name, b.icon || '🧰', Math.max(0, Number(b.price) || 99), b.category || 'Cleaning', b.available === false ? 0 : 1, sort)
    logAudit(req.admin.email, 'service:create', b.name)
    io?.emit('services:update', db.prepare('SELECT id,name,icon,price,category,available FROM services ORDER BY sort').all())
    res.status(201).json({ ok: true, id })
  })
  r.patch('/services/:id', admin, require('manager'), (req, res) => {
    const id = req.params.id
    const s = db.prepare('SELECT * FROM services WHERE id=?').get(id)
    if (!s) return res.status(404).json({ error: 'Not found' })
    const b = req.body || {}
    db.prepare('UPDATE services SET name=?, icon=?, price=?, category=?, available=? WHERE id=?').run(
      b.name ?? s.name, b.icon ?? s.icon, b.price ?? s.price, b.category ?? s.category,
      b.available === undefined ? s.available : b.available ? 1 : 0, id)
    logAudit(req.admin.email, 'service:update', id)
    io?.emit('services:update', db.prepare('SELECT id,name,icon,price,category,available FROM services ORDER BY sort').all())
    res.json({ ok: true })
  })
  r.delete('/services/:id', admin, require('admin'), (req, res) => {
    db.prepare('DELETE FROM services WHERE id=?').run(req.params.id)
    logAudit(req.admin.email, 'service:delete', req.params.id)
    res.json({ ok: true })
  })

  /* ---------- payments ---------- */
  r.get('/payments', admin, (req, res) => {
    const txns = db.prepare(`SELECT t.id, t.type, t.title, t.amount, t.created, t.ref, u.name customer
      FROM transactions t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 200`).all()
    const summary = {
      revenue: db.prepare(`SELECT COALESCE(SUM(total),0) s FROM bookings WHERE ${PAID}`).get().s,
      successful: db.prepare(`SELECT COUNT(*) n FROM bookings WHERE ${PAID}`).get().n,
      pending: db.prepare("SELECT COUNT(*) n FROM bookings WHERE payment_status='pending'").get().n,
      refunded: db.prepare(`SELECT COALESCE(SUM(refund),0) s FROM bookings WHERE refund IS NOT NULL`).get().s,
    }
    // payment method split
    const methods = db.prepare(`SELECT payment method, COUNT(*) n, COALESCE(SUM(total),0) amount FROM bookings GROUP BY payment`).all()
    res.json({ summary, methods, transactions: txns })
  })

  /* ---------- refunds ---------- */
  r.get('/refunds', admin, (req, res) => {
    const rows = db.prepare("SELECT id,ref,user_id,total,refund,cancel_fee,cancel_reason,payment,payment_status,created FROM bookings WHERE status='cancelled' OR refund IS NOT NULL ORDER BY id DESC").all()
      .map((b) => ({ ...b, customer: customerName(b.user_id) }))
    res.json(rows)
  })
  r.post('/refunds/:id', admin, require('manager'), (req, res) => {
    const id = Number(req.params.id)
    const b = db.prepare('SELECT * FROM bookings WHERE id=?').get(id)
    if (!b) return res.status(404).json({ error: 'Not found' })
    const amount = Math.max(0, Math.round(Number(req.body?.amount) || b.total))
    db.prepare('UPDATE bookings SET payment_status=?, refund=? WHERE id=?').run('refunded', amount, id)
    const u = db.prepare('SELECT wallet FROM users WHERE id=?').get(b.user_id)
    const bal = (u?.wallet || 0) + amount
    db.prepare('UPDATE users SET wallet=? WHERE id=?').run(bal, b.user_id)
    db.prepare('INSERT INTO transactions (user_id,type,title,amount,balance,ref,created) VALUES (?,?,?,?,?,?,?)')
      .run(b.user_id, 'credit', `Refund ${b.ref}`, amount, bal, b.ref, iso())
    logAudit(req.admin.email, 'refund:issue', `${b.ref} ₹${amount}`)
    res.json({ ok: true, amount })
  })

  /* ---------- complaints ---------- */
  r.get('/complaints', admin, (req, res) => res.json(listComplaints(req.query)))
  r.post('/complaints', admin, (req, res) => res.status(201).json(createComplaint(req.body || {})))
  r.patch('/complaints/:id', admin, (req, res) => { const c = updateComplaint(Number(req.params.id), req.body || {}); logAudit(req.admin.email, 'complaint:update', c?.ref); return c ? res.json(c) : res.status(404).json({ error: 'Not found' }) })

  /* ---------- support tickets (across all customers) ---------- */
  r.get('/tickets', admin, (req, res) => {
    const rows = db.prepare(`SELECT t.*, u.name customer FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC`).all()
    res.json(rows)
  })
  r.patch('/tickets/:id', admin, (req, res) => {
    const id = Number(req.params.id)
    if (!db.prepare('SELECT 1 FROM tickets WHERE id=?').get(id)) return res.status(404).json({ error: 'Not found' })
    db.prepare('UPDATE tickets SET status=? WHERE id=?').run(req.body?.status || 'Resolved', id)
    logAudit(req.admin.email, 'ticket:update', `#${id}`)
    res.json(db.prepare('SELECT * FROM tickets WHERE id=?').get(id))
  })

  /* ---------- notifications broadcast ---------- */
  r.post('/notifications/broadcast', admin, require('manager'), (req, res) => {
    const payload = { id: 'admin-' + Date.now(), type: req.body?.type || 'announcement', title: req.body?.title || 'Announcement', body: req.body?.body || '', time: iso() }
    io?.emit('admin:notification', payload)
    logAudit(req.admin.email, 'notify:broadcast', payload.title)
    res.json({ ok: true, sent: db.prepare('SELECT COUNT(*) n FROM users').get().n, payload })
  })

  /* ---------- settings (incl. backend API keys) ---------- */
  r.get('/settings', admin, (req, res) => res.json(getPublicSettings()))
  r.patch('/settings', admin, require('admin'), (req, res) => {
    const updated = updateSettings(req.body || {})
    // Mirror Razorpay keys to payment.config.json so the customer payment flow goes live on next server boot.
    const s = getSettings()
    if (s.razorpay_key_id && s.razorpay_key_secret) {
      try { writeFileSync(new URL('./payment.config.json', import.meta.url), JSON.stringify({ keyId: s.razorpay_key_id, keySecret: s.razorpay_key_secret }, null, 2)) } catch { /* ignore */ }
    }
    logAudit(req.admin.email, 'settings:update', Object.keys(req.body || {}).join(','))
    res.json(updated)
  })

  /* ---------- admin users ---------- */
  r.get('/admins', admin, require('admin'), (req, res) => res.json(listAdmins()))
  r.post('/admins', admin, require('admin'), (req, res) => {
    if (!req.body?.email || !req.body?.name) return res.status(400).json({ error: 'Name and email required' })
    if (getAdminByEmail(req.body.email)) return res.status(409).json({ error: 'Email already in use' })
    const a = createAdmin(req.body); logAudit(req.admin.email, 'admin:create', a.email); res.status(201).json(publicAdmin(a))
  })
  r.patch('/admins/:id', admin, require('admin'), (req, res) => { const a = updateAdmin(Number(req.params.id), req.body || {}); logAudit(req.admin.email, 'admin:update', a?.email); return a ? res.json(publicAdmin(a)) : res.status(404).json({ error: 'Not found' }) })
  r.delete('/admins/:id', admin, require('super'), (req, res) => {
    if (Number(req.params.id) === req.admin.id) return res.status(400).json({ error: 'You cannot delete your own account' })
    deleteAdmin(Number(req.params.id)); logAudit(req.admin.email, 'admin:delete', req.params.id); res.json({ ok: true })
  })

  /* ---------- analytics & audit ---------- */
  r.get('/analytics', admin, (req, res) => {
    // revenue over last 30 days
    const series = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now()); d.setDate(d.getDate() - i)
      const day = d.toISOString().slice(0, 10)
      const rev = db.prepare(`SELECT COALESCE(SUM(total),0) s FROM bookings WHERE substr(created,1,10)=? AND ${PAID}`).get(day).s
      const n = db.prepare('SELECT COUNT(*) n FROM bookings WHERE substr(created,1,10)=?').get(day).n
      series.push({ date: day.slice(5), revenue: rev, bookings: n })
    }
    const statusSplit = db.prepare('SELECT status, COUNT(*) n FROM bookings GROUP BY status').all()
    const topWorkers = listWorkers({}).sort((a, b) => b.jobs - a.jobs).slice(0, 5)
    res.json({ series, statusSplit, topWorkers })
  })
  r.get('/audit', admin, (req, res) => res.json(listAudit(40)))

  return r
}
