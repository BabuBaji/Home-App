// Worker REST API — mounted at /api/worker by index.js. This is what unifies the
// HomeHelp Pro worker app onto the shared backend: a worker's "new job request" is
// a real customer booking, and every lifecycle action (accept → on the way →
// arrived → start (OTP) → end → settle) updates the SAME bookings row, so the
// customer app (live over socket.io) and the admin dispatch board stay in sync.
import { Router } from 'express'
import { db } from './db.js'
import { getBooking, setBookingStatus, setBookingStarted, setPaymentStatus } from './db.js'
import {
  findOrCreateWorker, findWorkerByPhone, getWorkerRow, workerDto, walletDto, workerEarnings, workerTxns, workerDocuments,
  updateWorkerProfile, updateWorkerBank, updateWorkerAvailability, updateWorkerPreferences, updateWorkerNotifications,
  uploadWorkerDocument, walletAdd, walletWithdraw, settleBookingForWorker, workerShare, setWorkPhoto,
  setWorkerPos, distanceKm, workerServiceSet,
  setWorkerLastLocation, workerLastLocation, workerServedCustomer, countActiveWorkersForServices,
  workerPublicProfile,
} from './worker-db.js'
import {
  walletSummary, earningsBreakup, deductionsList, walletHistory, withdrawalsList, advancesList,
  requestWithdrawOtp, createWithdrawal, advanceEligibility, requestAdvance,
  buildPayslip, generatePayslip, payslipsList, notificationsList, markNotificationsRead,
  tallyIncome, recoverAdvanceOnEarning, withdrawalReceipt,
} from './worker-wallet-db.js'
import { logActivity } from './activity-db.js'

const room = (id) => `booking:${id}`

// Booking status -> the Kotlin JobStatus enum name the worker app expects.
const STATUS_TO_ENUM = {
  worker_assigned: 'ACCEPTED', on_the_way: 'ON_THE_WAY', arrived: 'ARRIVED',
  in_progress: 'IN_PROGRESS', completed: 'COMPLETED',
}
const ACTIVE_STATUSES = ['worker_assigned', 'on_the_way', 'arrived', 'in_progress']

// Bookings a worker has skipped this server session (so "request" rotates).
const rejected = new Map() // workerId -> Set(bookingId)
const skipSet = (id) => { if (!rejected.has(id)) rejected.set(id, new Set()); return rejected.get(id) }

export function createWorkerRouter(io) {
  const r = Router()

  /* ---------- mappers over the shared customer tables ---------- */
  const customer = (uid) => db.prepare('SELECT name,phone,rating FROM users WHERE id=?').get(uid) || {}
  const initials = (name) => String(name || 'C').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()

  // A customer booking row, shaped as the worker app's Job model.
  function jobFromBooking(b) {
    const c = customer(b.user_id)
    return {
      id: b.ref,
      customerName: c.name || 'Customer',
      initials: initials(c.name),
      customerPhone: c.phone || '',
      customerRating: c.rating || 5.0,
      services: b.items.map((i) => i.name),
      dateTime: [b.date, b.time].filter(Boolean).join(', ') || new Date(b.created).toLocaleString(),
      durationHours: Math.max(1, parseInt(b.duration, 10) || 2),
      address: b.address,
      area: (b.address || '').split(',').slice(-2).join(',').trim() || b.address,
      distanceKm: +(1 + (b.id % 30) / 10).toFixed(1),
      earnings: workerShare(b.total),
      otp: b.service_otp,
      // Real customer coordinates when the customer app shared them at booking time;
      // otherwise fall back near the booking's city centre (Hyderabad) so the map still renders.
      lat: b.cust_lat ?? (17.4448 + (b.id % 10) * 0.002),
      lng: b.cust_lng ?? (78.3498 + (b.id % 10) * 0.002),
      // Server timestamp the service actually started — both apps anchor the live timer
      // to THIS so the worker and customer always show the same elapsed time.
      startedAt: b.started_at || null,
      completedAt: b.completed_at || null,
    }
  }

  // A worker's handled booking, shaped as the worker app's Booking (history) model.
  function historyFromBooking(b) {
    const c = customer(b.user_id)
    const status = b.status === 'completed' ? 'Completed' : b.status === 'cancelled' ? 'Cancelled' : 'Upcoming'
    return {
      service: b.items.map((i) => i.name).join(', '),
      customerName: c.name || 'Customer',
      address: b.address,
      timeInfo: [b.date, b.time].filter(Boolean).join(', ') || new Date(b.created).toLocaleDateString(),
      amount: workerShare(b.total),
      status,
    }
  }

  const activeBooking = (wid) => {
    const row = db.prepare(`SELECT id FROM bookings WHERE worker_id=? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 1`)
      .get(wid, ...ACTIVE_STATUSES)
    return row ? getBooking(row.id) : null
  }
  const settleableBooking = (wid) => {
    const row = db.prepare("SELECT id FROM bookings WHERE worker_id=? AND status='completed' AND settled=0 ORDER BY id DESC LIMIT 1").get(wid)
    return row ? getBooking(row.id) : null
  }
  const historyBookings = (wid) =>
    db.prepare('SELECT id FROM bookings WHERE worker_id=? ORDER BY id DESC').all(wid).map((row) => historyFromBooking(getBooking(row.id)))

  function bootstrap(wid) {
    const w = getWorkerRow(wid)
    const active = activeBooking(wid)
    return {
      worker: workerDto(w),
      wallet: walletDto(w),
      walletSummary: walletSummary(wid),
      jobStatus: active ? (STATUS_TO_ENUM[active.status] || 'NONE') : 'NONE',
      activeJob: active ? jobFromBooking(active) : null,
      bookings: historyBookings(wid),
      earnings: workerEarnings(wid),
      walletTxns: workerTxns(wid),
      documents: workerDocuments(wid),
    }
  }

  // Push live booking updates to the customer's Track screen — and attach the assigned
  // worker's public profile so the customer sees the expert (rating, jobs, reviews, phone)
  // the instant they accept, not only on a manual refresh.
  const emitBooking = (b) => {
    if (!b) return
    const payload = b.worker_id ? { ...b, pro: workerPublicProfile(b.worker_id) } : b
    io?.to(room(b.id)).emit('booking:update', payload)
  }

  /* ---------- auth ---------- */
  function auth(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const id = token.startsWith('worker-') ? Number(token.slice(7)) : NaN
    const w = getWorkerRow(id)
    if (!w) return res.status(401).json({ ok: false, error: 'Not authenticated' })
    req.worker = w
    next()
  }

  r.get('/health', (_q, res) => res.json({ ok: true, service: 'homehelp-worker', time: new Date().toISOString() }))

  // Demo OTP — any phone, any 4-digit code (mirrors the customer/admin demo auth).
  r.post('/auth/request-otp', (req, res) => res.json({ ok: true, devOtp: '1234', message: `OTP sent to ${req.body?.phone || ''}` }))
  r.post('/auth/verify', (req, res) => {
    const { phone, otp } = req.body || {}
    if (!otp || String(otp).length < 4) return res.status(400).json({ ok: false, error: 'Invalid OTP' })
    // Gate: only a worker the admin has onboarded AND marked active may log in. Unknown or
    // pending/suspended/inactive numbers are refused — no auto-creation here.
    const w = findWorkerByPhone(phone)
    if (!w) return res.status(403).json({ ok: false, error: 'This number is not registered. Please contact the admin to onboard you.' })
    if (w.status !== 'active') return res.status(403).json({ ok: false, error: `Your account is ${w.status}. Please ask the admin to activate it.` })
    logActivity({ actorType: 'worker', actorId: w.id, actorName: w.name, action: 'worker.login', entityType: 'worker', entityId: w.id, detail: `Worker signed in (${phone || ''})` })
    res.json({ ok: true, token: 'worker-' + w.id, ...bootstrap(w.id) })
  })

  r.get('/bootstrap', auth, (req, res) => res.json(bootstrap(req.worker.id)))

  /* ---------- profile ---------- */
  r.put('/profile', auth, (req, res) => res.json(updateWorkerProfile(req.worker.id, req.body || {})))
  r.put('/bank', auth, (req, res) => { logActivity({ actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'kyc.bank', entityType: 'worker', entityId: req.worker.id, detail: 'Updated bank / payout details (pending verification)' }); res.json(updateWorkerBank(req.worker.id, req.body || {})) })
  r.put('/availability', auth, (req, res) => res.json(updateWorkerAvailability(req.worker.id, req.body || {})))
  r.put('/preferences', auth, (req, res) => res.json(updateWorkerPreferences(req.worker.id, req.body || {})))
  r.put('/notifications', auth, (req, res) => res.json(updateWorkerNotifications(req.worker.id, req.body || {})))

  /* ---------- documents ---------- */
  r.get('/documents', auth, (req, res) => res.json(workerDocuments(req.worker.id)))
  r.post('/documents/upload', auth, (req, res) => {
    const { name, fileName } = req.body || {}
    if (!name) return res.status(400).json({ ok: false, error: 'Document name required' })
    logActivity({ actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'kyc.document', entityType: 'worker', entityId: req.worker.id, detail: `Uploaded document: ${name}` })
    res.json({ ok: true, documents: uploadWorkerDocument(req.worker.id, name, fileName) })
  })

  /* ---------- job lifecycle (real customer bookings) ---------- */
  // A booking is only offered to a worker who actually provides one of its services.
  const parseI = (s) => { try { return JSON.parse(s) } catch { return [] } }
  const bookingMatchesWorker = (svc, b) => {
    if (svc.size === 0) return false   // a worker with no assigned services is offered nothing
    const items = Array.isArray(b.items) ? b.items : parseI(b.items)
    return items.some((i) => svc.has(String(i.name || '').toLowerCase().trim()))
  }
  // How long a booking is "held" for a fresh worker before anyone matching can take it,
  // so a repeat-visit booking never starves if the alternate worker never comes online.
  const ROTATE_GRACE_MIN = 2

  // Candidate bookings (confirmed, unassigned, not skipped) this worker is qualified for,
  // applying: service match → avoid repeat worker for a customer (unless no alternative or
  // grace elapsed) → prefer the nearest customer (~3 km).
  const matchingBookings = (worker) => {
    const skip = skipSet(worker.id)
    const svc = workerServiceSet(worker)
    if (svc.size === 0) return []
    const myPos = workerLastLocation(worker.id)
    const rows = db.prepare("SELECT id, items, user_id, created, cust_lat, cust_lng FROM bookings WHERE status='confirmed' AND worker_id IS NULL ORDER BY id ASC").all()
    const candidates = []
    for (const b of rows) {
      if (skip.has(b.id) || !bookingMatchesWorker(svc, b)) continue
      // Avoid sending the same worker back to a customer they already served — hold the job
      // for a different worker. Assign anyway if no other worker offers it, or it has waited.
      const ageMin = (Date.now() - new Date(b.created).getTime()) / 60000
      if (ageMin < ROTATE_GRACE_MIN && workerServedCustomer(worker.id, b.user_id)) {
        const names = (Array.isArray(b.items) ? b.items : parseI(b.items)).map((i) => i.name)
        if (countActiveWorkersForServices(names, worker.id) > 0) continue
      }
      const dist = myPos ? distanceKm(myPos.lat, myPos.lng, b.cust_lat, b.cust_lng) : null
      candidates.push({ b, dist })
    }
    // Nearest customer first (unknown distance last), then oldest booking.
    candidates.sort((a, c) => {
      const ad = a.dist == null ? Infinity : a.dist, cd = c.dist == null ? Infinity : c.dist
      return ad !== cd ? ad - cd : a.b.id - c.b.id
    })
    return candidates.map((x) => x.b)
  }

  // Lightweight check the worker app polls while online: is there a real customer booking
  // waiting THAT MATCHES THIS WORKER'S SERVICES? Non-destructive (offers/assigns nothing).
  r.get('/jobs/available', auth, (req, res) => {
    const n = matchingBookings(req.worker).length
    res.json({ available: n > 0, count: n })
  })

  // Offer the next matching, unassigned booking this worker hasn't skipped.
  r.post('/jobs/request', auth, (req, res) => {
    const match = matchingBookings(req.worker)[0]
    if (!match) return res.json({ job: null, jobStatus: 'NONE' })
    db.prepare('UPDATE workers SET offered_booking=? WHERE id=?').run(match.id, req.worker.id)
    res.json({ job: jobFromBooking(getBooking(match.id)), jobStatus: 'REQUESTED' })
  })

  // Claim the offered booking: assign this worker + advance to worker_assigned.
  r.post('/jobs/accept', auth, (req, res) => {
    const w = getWorkerRow(req.worker.id)
    const offered = w.offered_booking && getBooking(w.offered_booking)
    if (!offered || offered.status !== 'confirmed' || offered.worker_id) return res.status(409).json({ ok: false, error: 'Job no longer available' })
    db.prepare("UPDATE bookings SET worker_id=?, pro_name=?, pro_rating=?, status='worker_assigned' WHERE id=?")
      .run(w.id, w.name, w.rating, offered.id)
    db.prepare('UPDATE workers SET offered_booking=NULL WHERE id=?').run(w.id)
    const b = getBooking(offered.id); emitBooking(b)
    logActivity({ actorType: 'worker', actorId: w.id, actorName: w.name, action: 'job.accept', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `${w.name} accepted the job`, meta: { status: 'worker_assigned' } })
    res.json({ ok: true, jobStatus: 'ACCEPTED', activeJob: jobFromBooking(b) })
  })

  r.post('/jobs/reject', auth, (req, res) => {
    const w = getWorkerRow(req.worker.id)
    if (w.offered_booking) { skipSet(w.id).add(w.offered_booking); db.prepare('UPDATE workers SET offered_booking=NULL WHERE id=?').run(w.id); logActivity({ actorType: 'worker', actorId: w.id, actorName: w.name, action: 'job.reject', entityType: 'booking', entityId: w.offered_booking, detail: `${w.name} declined the job` }) }
    res.json({ ok: true, jobStatus: 'NONE' })
  })

  // Advance the worker's active booking to a new status (+ notify the customer).
  function advance(req, res, status) {
    const b = activeBooking(req.worker.id)
    if (!b) return res.status(409).json({ ok: false, error: 'No active job' })
    const u = setBookingStatus(b.id, status); emitBooking(u)
    logActivity({ actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.status', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `Status → ${status.replace(/_/g, ' ')}`, meta: { status } })
    res.json({ ok: true, jobStatus: STATUS_TO_ENUM[status] || status, activeJob: jobFromBooking(u) })
  }
  r.post('/jobs/on-the-way', auth, (req, res) => advance(req, res, 'on_the_way'))
  r.post('/jobs/arrived', auth, (req, res) => advance(req, res, 'arrived'))

  // The worker app posts its live GPS while travelling. We store it, work out the real
  // distance + ETA to the customer, and push the worker's true position to the customer's
  // live map (booking room) so they can watch the expert approach with an accurate ETA.
  r.post('/jobs/location', auth, (req, res) => {
    const b = activeBooking(req.worker.id)
    const lat = Number(req.body?.lat), lng = Number(req.body?.lng)
    if (!b || !isFinite(lat) || !isFinite(lng)) return res.json({ ok: false })
    setWorkerPos(b.id, lat, lng)
    setWorkerLastLocation(req.worker.id, lat, lng)   // remember for proximity-based dispatch
    const dist = distanceKm(lat, lng, b.cust_lat, b.cust_lng)
    const eta = dist != null ? Math.max(1, Math.round(dist * 2.5)) : null // ~24 km/h city avg
    io?.to(room(b.id)).emit('booking:update', {
      id: b.id, status: b.status, pos: { lat, lng },
      dist: dist != null ? +dist.toFixed(1) : undefined,
      eta: eta != null ? eta : undefined,
    })
    res.json({ ok: true, dist: dist != null ? +dist.toFixed(1) : null, eta })
  })

  // Start service: the OTP the worker enters must match the customer's booking OTP.
  r.post('/jobs/verify-otp', auth, (req, res) => {
    const b = activeBooking(req.worker.id)
    if (!b) return res.status(409).json({ ok: false, error: 'No active job' })
    if (String(req.body?.otp) !== String(b.service_otp)) return res.json({ ok: false, error: 'Incorrect OTP' })
    const u = setBookingStarted(b.id); emitBooking(u)
    logActivity({ actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.start', entityType: 'booking', entityId: b.id, ref: b.ref, detail: 'Service started (OTP verified)', meta: { status: 'in_progress' } })
    res.json({ ok: true, jobStatus: 'IN_PROGRESS', activeJob: jobFromBooking(u) })
  })

  // End service. The worker attaches a live proof-of-work photo, which we store on the
  // booking; the customer app sees status=completed (+ the photo) and jumps to the
  // review/feedback page automatically.
  r.post('/jobs/end', auth, (req, res) => {
    const b = activeBooking(req.worker.id)
    if (!b) return res.status(409).json({ ok: false, error: 'No active job' })
    if (req.body?.photo) setWorkPhoto(b.id, req.body.photo)
    let u = setBookingStatus(b.id, 'completed')
    if (b.payment === 'cash') u = setPaymentStatus(b.id, 'paid')
    emitBooking(u)
    logActivity({ actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.complete', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `Job completed${req.body?.photo ? ' (proof photo attached)' : ''}`, meta: { status: 'completed', photo: !!req.body?.photo } })
    res.json({ ok: true, jobStatus: 'COMPLETED', activeJob: jobFromBooking(u) })
  })

  // Finish: the worker has completed the job + uploaded proof. Earnings are NOT credited
  // here — per the flow, the money is credited (into Pending, then QC -> Available) only
  // when the CUSTOMER confirms completion (review/confirm) on their app. This endpoint just
  // finalises the worker's lifecycle and returns the latest wallet snapshot.
  r.post('/jobs/settle', auth, (req, res) => {
    const w = getWorkerRow(req.worker.id)
    res.json({
      ok: true, wallet: walletDto(w), walletSummary: walletSummary(w.id),
      bookings: historyBookings(w.id), earnings: workerEarnings(w.id), walletTxns: workerTxns(w.id),
    })
  })

  // Worker drops the job mid-flow → release the booking back into the dispatch pool.
  r.post('/jobs/cancel', auth, (req, res) => {
    const b = activeBooking(req.worker.id)
    if (b) {
      db.prepare("UPDATE bookings SET worker_id=NULL, status='confirmed' WHERE id=?").run(b.id)
      skipSet(req.worker.id).add(b.id)
      emitBooking(getBooking(b.id))
      logActivity({ actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.drop', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `${req.worker.name} dropped the job (returned to pool)` })
    }
    res.json({ ok: true, jobStatus: 'NONE' })
  })

  /* ---------- wallet ---------- */
  r.post('/wallet/add', auth, (req, res) => {
    const amount = parseInt(req.body?.amount, 10)
    if (!amount || amount <= 0) return res.json({ ok: false, error: 'Enter a valid amount' })
    const w = walletAdd(req.worker.id, amount)
    res.json({ ok: true, wallet: walletDto(w), walletTxns: workerTxns(w.id) })
  })
  r.post('/wallet/withdraw', auth, (req, res) => {
    // Backwards-compatible quick withdraw (no OTP) — kept for the old Add-Money flow.
    const amount = parseInt(req.body?.amount, 10)
    if (!amount || amount <= 0) return res.json({ ok: false, error: 'Enter a valid amount' })
    const out = walletWithdraw(req.worker.id, amount)
    if (out.error) return res.json({ ok: false, error: out.error })
    res.json({ ok: true, wallet: walletDto(out.worker), walletTxns: workerTxns(out.worker.id) })
  })

  /* ---------- wallet module: dashboard, breakup, deductions, history ---------- */
  const id = (req) => req.worker.id
  const walletState = (wid) => ({
    walletSummary: walletSummary(wid), earningsBreakup: earningsBreakup(wid),
    deductions: deductionsList(wid), history: walletHistory(wid),
    withdrawals: withdrawalsList(wid), advances: advancesList(wid),
  })

  r.get('/wallet/summary', auth, (req, res) => res.json(walletSummary(id(req))))
  r.get('/wallet/state', auth, (req, res) => res.json(walletState(id(req))))
  r.get('/wallet/earnings-breakup', auth, (req, res) => res.json(earningsBreakup(id(req))))
  r.get('/wallet/deductions', auth, (req, res) => res.json(deductionsList(id(req))))
  r.get('/wallet/history', auth, (req, res) => res.json(walletHistory(id(req))))
  r.get('/wallet/withdrawals', auth, (req, res) => res.json(withdrawalsList(id(req))))
  r.get('/wallet/withdrawals/:wd/receipt', auth, (req, res) => {
    const rec = withdrawalReceipt(id(req), parseInt(req.params.wd, 10))
    return rec ? res.json(rec) : res.status(404).json({ ok: false, error: 'Receipt not found' })
  })
  r.get('/wallet/advances', auth, (req, res) => res.json(advancesList(id(req))))

  /* ---------- withdrawal (OTP-gated, Bank/UPI) ---------- */
  r.post('/wallet/withdraw/request-otp', auth, (req, res) => res.json(requestWithdrawOtp()))
  r.post('/wallet/withdraw/request', auth, (req, res) => {
    const { amount, method, otp } = req.body || {}
    const out = createWithdrawal(id(req), parseInt(amount, 10), method, otp)
    if (out.error) return res.json({ ok: false, error: out.error })
    logActivity({ actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'wallet.withdraw', entityType: 'wallet', entityId: req.worker.id, detail: `Requested withdrawal ₹${parseInt(amount, 10)} via ${method || 'bank'}`, meta: { amount: parseInt(amount, 10), method } })
    res.json({ ok: true, ...walletState(id(req)) })
  })

  /* ---------- salary advance ---------- */
  r.get('/wallet/advance/eligibility', auth, (req, res) => res.json(advanceEligibility(id(req))))
  r.post('/wallet/advance/request', auth, (req, res) => {
    const out = requestAdvance(id(req), parseInt(req.body?.amount, 10))
    if (out.error) return res.json({ ok: false, error: out.error })
    logActivity({ actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'wallet.advance', entityType: 'wallet', entityId: req.worker.id, detail: `Requested salary advance ₹${parseInt(req.body?.amount, 10)}`, meta: { amount: parseInt(req.body?.amount, 10) } })
    res.json({ ok: true, ...walletState(id(req)) })
  })

  /* ---------- payslip ---------- */
  r.get('/wallet/payslip', auth, (req, res) => res.json(buildPayslip(id(req), req.query?.month)))
  r.get('/wallet/payslips', auth, (req, res) => res.json(payslipsList(id(req))))
  r.post('/wallet/payslip/generate', auth, (req, res) => res.json(generatePayslip(id(req), req.body?.month)))

  /* ---------- notifications ---------- */
  r.get('/wallet/notifications', auth, (req, res) => res.json(notificationsList(id(req))))
  r.post('/wallet/notifications/read', auth, (req, res) => res.json(markNotificationsRead(id(req))))

  return r
}
