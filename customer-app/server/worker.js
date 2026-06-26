// Worker-app REST API, mounted at /worker on the customer backend.
//
// This is the bridge that makes the two apps one product: it serves the exact
// JSON shapes the HomeHelp Pro (worker) Android app expects, but the JOB lifecycle
// reads and writes the SAME `bookings` table the customer app uses. When a worker
// accepts / progresses / completes a job here, we push `booking:update` events over
// the shared Socket.IO instance to the customer's live Track screen.
//
// Worker profile + wallet are kept in memory (single demo worker); only the job
// flow needs to be shared with the customer side.
import express from 'express'
import {
  getUser, getOpenBookings, getBooking,
  setBookingStatus, setBookingStarted, setPaymentStatus, setBookingPro, cancelBookingRow,
} from './db.js'

const room = (id) => `booking:${id}`

function seedWorker() {
  return {
    name: 'Rahul Kumar', phone: '+91 90000 12345', email: 'rahul.kumar@email.com', city: 'Mumbai',
    jobsCompleted: 128, rating: 4.7,
    bankName: 'HDFC Bank', bankAccount: 'xxxx xxxx 1234', bankIfsc: 'HDFC0001234', bankHolder: 'Rahul Kumar',
    shiftStart: '08:00 AM', shiftEnd: '08:00 PM',
    availableDays: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false },
    jobPreferences: {
      'Utensil Wash': true, 'Mopping': true, 'Sweeping': true, 'Dusting': true,
      'Bathroom Cleaning': true, 'Laundry': false, 'Kitchen Cleaning': true,
    },
    notifNewJobs: true, notifPayments: true, notifPromotions: false, notifRatings: true,
  }
}
function seedWallet() {
  return { balance: 8450, totalEarned: 15680, withdrawnTotal: 7230, pendingAmount: 1200, todayEarnings: 650, todayJobs: 4 }
}

export function createWorkerRouter(io) {
  const router = express.Router()

  const state = {
    worker: seedWorker(),
    wallet: seedWallet(),
    documents: [
      { name: 'Aadhaar Card', status: 'Verified', fileName: '' },
      { name: 'PAN Card', status: 'Verified', fileName: '' },
      { name: 'Police Verification', status: 'Verified', fileName: '' },
      { name: 'Address Proof', status: 'Pending', fileName: '' },
    ],
    bookings: [],   // worker-shaped history (completed / cancelled jobs)
    earnings: [],
    walletTxns: [
      { title: 'Job Payment', subtitle: '16 May 2025, 11:00 AM', amount: 297, status: 'Success', isCredit: true },
      { title: 'Withdraw to Bank', subtitle: 'A/c No. xxxx1234', amount: 2700, status: 'Success', isCredit: false },
    ],
    activeBookingId: null, // the DB booking this worker is currently handling
    jobStatus: 'NONE',
  }

  // ---- map a customer booking (+ its customer) onto the worker app's Job DTO ----
  function shortArea(addr) {
    if (!addr) return ''
    const parts = String(addr).split(',').map((s) => s.trim()).filter(Boolean)
    return parts.length >= 2 ? parts.slice(-2).join(', ') : addr
  }
  function bookingToJob(b) {
    const u = getUser(b.user_id) || {}
    const name = (u.name && u.name.trim()) || 'Customer'
    const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
    const services = Array.isArray(b.items) ? b.items.map((i) => i.name) : []
    const dateTime = b.type === 'schedule' && b.date ? `${b.date}, ${b.time || ''}`.trim() : 'Now • Instant'
    const m = /(\d+)\s*h/.exec(b.duration || '')
    return {
      id: b.ref || ('JOB' + b.id),
      customerName: name,
      initials,
      customerPhone: u.phone || '',
      customerRating: u.rating || 5.0,
      services,
      dateTime,
      durationHours: m ? Number(m[1]) : 2,
      address: b.address || '',
      area: shortArea(b.address),
      distanceKm: +(1 + (b.id % 40) / 10).toFixed(1),
      earnings: b.subtotal || b.total || 0, // worker payout = service value (pre fee/tax)
      otp: b.service_otp,                    // the shared check-in OTP the customer sees
      lat: 19.0760, lng: 72.8777,
    }
  }

  function activeJobDto() {
    const b = state.activeBookingId ? getBooking(state.activeBookingId) : null
    return b ? bookingToJob(b) : null
  }
  function bootstrap() {
    return {
      worker: state.worker, wallet: state.wallet, jobStatus: state.jobStatus,
      activeJob: activeJobDto(),
      bookings: state.bookings, earnings: state.earnings, walletTxns: state.walletTxns,
      documents: state.documents,
    }
  }
  function emitBooking(id, extra = {}) {
    const b = getBooking(id)
    if (b) io.to(room(id)).emit('booking:update', { ...b, ...extra })
  }
  // Resolve the active booking or send a 409; returns null when there is none.
  function requireActive(res) {
    const b = state.activeBookingId ? getBooking(state.activeBookingId) : null
    if (!b) { state.activeBookingId = null; res.status(409).json({ ok: false, error: 'No active job' }); return null }
    return b
  }

  // ---- health & auth ----
  router.get('/api/health', (_q, r) => r.json({ ok: true, service: 'homehelp-worker', time: new Date().toISOString() }))
  router.post('/api/auth/request-otp', (req, res) => res.json({ ok: true, devOtp: '1234', message: `OTP sent to ${req.body?.phone || ''}` }))
  router.post('/api/auth/verify', (req, res) => {
    const { phone, otp } = req.body || {}
    if (!otp || String(otp).length < 4) return res.status(400).json({ ok: false, error: 'Invalid OTP' })
    res.json({ ok: true, token: 'worker-' + (phone || 'demo'), ...bootstrap() })
  })
  router.get('/api/bootstrap', (_q, res) => res.json(bootstrap()))

  // ---- worker profile ----
  router.get('/api/worker', (_q, res) => res.json(state.worker))
  router.put('/api/worker/profile', (req, res) => { ['name', 'phone', 'email', 'city'].forEach((k) => { if (req.body[k] != null) state.worker[k] = req.body[k] }); res.json(state.worker) })
  router.put('/api/worker/bank', (req, res) => { ['bankHolder', 'bankName', 'bankAccount', 'bankIfsc'].forEach((k) => { if (req.body[k] != null) state.worker[k] = req.body[k] }); res.json(state.worker) })
  router.put('/api/worker/availability', (req, res) => {
    if (req.body.availableDays) state.worker.availableDays = req.body.availableDays
    if (req.body.shiftStart != null) state.worker.shiftStart = req.body.shiftStart
    if (req.body.shiftEnd != null) state.worker.shiftEnd = req.body.shiftEnd
    res.json(state.worker)
  })
  router.put('/api/worker/preferences', (req, res) => { if (req.body.jobPreferences) state.worker.jobPreferences = req.body.jobPreferences; res.json(state.worker) })
  router.put('/api/worker/notifications', (req, res) => { ['notifNewJobs', 'notifPayments', 'notifPromotions', 'notifRatings'].forEach((k) => { if (req.body[k] != null) state.worker[k] = req.body[k] }); res.json(state.worker) })
  router.get('/api/worker/documents', (_q, res) => res.json(state.documents))
  router.post('/api/worker/documents/upload', (req, res) => {
    const { name, fileName } = req.body || {}
    if (!name) return res.status(400).json({ ok: false, error: 'Document name required' })
    let d = state.documents.find((x) => x.name === name)
    if (!d) { d = { name, status: 'Under Review', fileName: fileName || '' }; state.documents.push(d) }
    else { d.status = 'Under Review'; d.fileName = fileName || d.fileName || '' }
    res.json({ ok: true, documents: state.documents })
  })

  // ---- job lifecycle (backed by the shared bookings table) ----
  // Pull the newest unassigned customer booking and present it to the worker.
  router.post('/api/jobs/request', (_q, res) => {
    const open = getOpenBookings().filter((b) => b.id !== state.activeBookingId)
    const b = open[0]
    if (!b) return res.json({ job: null, jobStatus: 'NONE' })
    state.activeBookingId = b.id
    state.jobStatus = 'REQUESTED'
    res.json({ job: bookingToJob(b), jobStatus: 'REQUESTED' })
  })

  router.post('/api/jobs/accept', (_q, res) => {
    const b = requireActive(res); if (!b) return
    setBookingPro(b.id, state.worker.name, state.worker.rating)
    setBookingStatus(b.id, 'worker_assigned')
    state.jobStatus = 'ACCEPTED'
    emitBooking(b.id)
    res.json({ ok: true, jobStatus: 'ACCEPTED', activeJob: activeJobDto() })
  })
  router.post('/api/jobs/on-the-way', (_q, res) => {
    const b = requireActive(res); if (!b) return
    setBookingStatus(b.id, 'on_the_way')
    state.jobStatus = 'ON_THE_WAY'
    emitBooking(b.id, { dist: 2.4, eta: 12, pos: { lat: 0.10, lng: 0.12 } })
    res.json({ ok: true, jobStatus: 'ON_THE_WAY', activeJob: activeJobDto() })
  })
  router.post('/api/jobs/arrived', (_q, res) => {
    const b = requireActive(res); if (!b) return
    setBookingStatus(b.id, 'arrived')
    state.jobStatus = 'ARRIVED'
    emitBooking(b.id, { dist: 0, eta: 0 })
    res.json({ ok: true, jobStatus: 'ARRIVED', activeJob: activeJobDto() })
  })
  router.post('/api/jobs/verify-otp', (req, res) => {
    const b = requireActive(res); if (!b) return
    if (String(req.body?.otp) !== String(b.service_otp)) return res.json({ ok: false, error: 'Incorrect OTP' })
    setBookingStarted(b.id) // -> in_progress + started_at
    state.jobStatus = 'IN_PROGRESS'
    emitBooking(b.id)
    res.json({ ok: true, jobStatus: 'IN_PROGRESS', activeJob: activeJobDto() })
  })
  router.post('/api/jobs/end', (_q, res) => {
    const b = requireActive(res); if (!b) return
    setBookingStatus(b.id, 'completed')
    if (b.payment === 'cash') setPaymentStatus(b.id, 'paid')
    state.jobStatus = 'COMPLETED'
    emitBooking(b.id)
    res.json({ ok: true, jobStatus: 'COMPLETED', activeJob: activeJobDto() })
  })
  router.post('/api/jobs/reject', (_q, res) => {
    state.activeBookingId = null
    state.jobStatus = 'NONE'
    res.json({ ok: true, jobStatus: 'NONE' })
  })
  // Finish & settle -> credit worker wallet, append worker history, free the slot.
  router.post('/api/jobs/settle', (_q, res) => {
    const b = state.activeBookingId ? getBooking(state.activeBookingId) : null
    if (b) {
      const job = bookingToJob(b)
      if (b.status !== 'completed') {
        setBookingStatus(b.id, 'completed')
        if (b.payment === 'cash') setPaymentStatus(b.id, 'paid')
        emitBooking(b.id)
      }
      state.wallet.todayEarnings += job.earnings
      state.wallet.todayJobs += 1
      state.wallet.balance += job.earnings
      state.wallet.totalEarned += job.earnings
      state.bookings.unshift({ service: job.services.join(', '), customerName: job.customerName, address: job.area, timeInfo: `${job.dateTime} • ${job.durationHours} hours`, amount: job.earnings, status: 'Completed' })
      state.earnings.unshift({ date: `Today • ${job.id}`, amount: job.earnings, paid: true })
      state.walletTxns.unshift({ title: 'Job Payment', subtitle: `${job.id} • ${job.customerName}`, amount: job.earnings, status: 'Success', isCredit: true })
    }
    state.activeBookingId = null
    state.jobStatus = 'NONE'
    res.json({ ok: true, wallet: state.wallet, bookings: state.bookings, earnings: state.earnings, walletTxns: state.walletTxns })
  })
  router.post('/api/jobs/cancel', (req, res) => {
    const b = state.activeBookingId ? getBooking(state.activeBookingId) : null
    const reason = (req.body && req.body.reason) || 'Cancelled'
    if (b) {
      const job = bookingToJob(b)
      cancelBookingRow(b.id, reason, 0, 0)
      emitBooking(b.id)
      state.bookings.unshift({ service: job.services.join(', '), customerName: job.customerName, address: job.area, timeInfo: `${job.dateTime} • ${reason}`, amount: job.earnings, status: 'Cancelled' })
    }
    state.activeBookingId = null
    state.jobStatus = 'NONE'
    res.json({ ok: true, bookings: state.bookings })
  })

  // ---- collections & wallet ----
  router.get('/api/bookings', (_q, res) => res.json(state.bookings))
  router.get('/api/earnings', (_q, res) => res.json(state.earnings))
  router.get('/api/wallet', (_q, res) => res.json({ wallet: state.wallet, walletTxns: state.walletTxns }))
  router.post('/api/wallet/withdraw', (req, res) => {
    const amount = parseInt(req.body?.amount, 10)
    if (!amount || amount <= 0) return res.json({ ok: false, error: 'Enter a valid amount' })
    if (amount > state.wallet.balance) return res.json({ ok: false, error: 'Amount exceeds available balance' })
    state.wallet.balance -= amount
    state.wallet.withdrawnTotal += amount
    state.walletTxns.unshift({ title: 'Withdraw to Bank', subtitle: 'A/c No. xxxx1234', amount, status: 'Success', isCredit: false })
    res.json({ ok: true, wallet: state.wallet, walletTxns: state.walletTxns })
  })
  router.post('/api/wallet/add', (req, res) => {
    const amount = parseInt(req.body?.amount, 10)
    if (!amount || amount <= 0) return res.json({ ok: false, error: 'Enter a valid amount' })
    state.wallet.balance += amount
    state.walletTxns.unshift({ title: 'Added to Wallet', subtitle: 'UPI • Instant', amount, status: 'Success', isCredit: true })
    res.json({ ok: true, wallet: state.wallet, walletTxns: state.walletTxns })
  })

  return router
}
