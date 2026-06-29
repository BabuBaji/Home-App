import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import {
  getServices, getServiceById, updateService,
  findOrCreateUser, findOrCreateGoogleUser, getUser, updateUser,
  getAddresses, addAddress, setDefaultAddress, deleteAddress, ensureDefaultAddressFromLocation,
  getTransactions, addTransaction,
  createBooking, getBooking, getBookings, setBookingStatus, setBookingStarted, setPaymentStatus,
  rescheduleBooking, cancelBookingRow, setBookingReview,
  createTicket, getTickets, CATEGORIES,
  getFavourites, addFavourite, removeFavourite,
} from './db.js'
import { detailsFor, durationsFor, applyCoupon, priceBreakdown, COUPONS, CANCEL_REASONS, REFERRAL, TRUST_BADGES, PAYMENT_METHODS, EXTERNAL_METHODS } from './catalog.js'
import { createAdminRouter } from './admin.js'
import { createWorkerRouter } from './worker.js'
import { setBookingCoords } from './worker-db.js'
import { confirmWorkerSettlement } from './worker-wallet-db.js'
import { createPaymentsRouter } from './payments.js'
import { recordExternalPayment, createPayment } from './payments-db.js'
import { getSetting } from './admin-db.js'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'

/* ---------- Razorpay config ----------
   Keys are read from server/payment.config.json (gitignored) or env vars.
   With no keys present, payments fall back to MOCK mode so the app still runs. */
let RZP = { keyId: process.env.RAZORPAY_KEY_ID || '', keySecret: process.env.RAZORPAY_KEY_SECRET || '' }
// Payee VPA the customer pays INTO (company UPI handle). Money is company-first.
// upiMode: 'demo' = show an in-app UPI pay screen (no real money, no valid VPA needed);
//          'live' = deep-link into the real UPI app (needs a real, registered upiVpa).
let UPI = { vpa: process.env.UPI_VPA || 'homehelp@upi', payeeName: process.env.UPI_PAYEE_NAME || 'HomeHelp Services', mode: process.env.UPI_MODE || 'demo' }
try {
  const c = JSON.parse(readFileSync(new URL('./payment.config.json', import.meta.url), 'utf8'))
  RZP = { keyId: c.keyId || RZP.keyId, keySecret: c.keySecret || RZP.keySecret }
  UPI = { vpa: c.upiVpa || UPI.vpa, payeeName: c.payeeName || UPI.payeeName, mode: c.upiMode || UPI.mode }
} catch { /* no config file → mock mode */ }
const RZP_LIVE = !!(RZP.keyId && RZP.keySecret)
const verifiedPayments = new Map() // razorpay_payment_id -> { amount, at }

const app = express()
app.use(cors())
// Keep the raw body so gateway/payout webhooks can verify HMAC signatures over the exact bytes.
app.use(express.json({ limit: '6mb', verify: (req, _res, buf) => { req.rawBody = buf } }))
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })
app.use('/api/admin', createAdminRouter(io)) // admin panel API (workers, settings, dashboard, …)
app.use('/api/worker', createWorkerRouter(io)) // worker app API (HomeHelp Pro) — shares bookings/DB/socket
app.use('/api/payments', createPaymentsRouter(io)) // payment + payout gateway webhooks (signed, idempotent)
const room = (id) => `booking:${id}`
const now = () => new Date()
const otp4 = () => String(Math.floor(1000 + Math.random() * 9000))
const ref = () => '#HH' + Math.floor(10000 + Math.random() * 89999)

function publicUser(u) {
  return { id: u.id, phone: u.phone, name: u.name, email: u.email, provider: u.provider, avatar: u.avatar, country: u.country, city: u.city, location: u.location, wallet: u.wallet, rating: u.rating }
}
function decodeJwt(t) { try { return JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) } catch { return null } }

/* ---------- scheduled bookings: OTP + expert dispatch open 1 hour before the slot ----------
   For a future "schedule" booking the check-in OTP is withheld and the expert is not
   dispatched until OTP_LEAD_MS before the chosen date/time. Instant bookings are always open. */
const OTP_LEAD_MS = 60 * 60 * 1000
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }
function scheduledStartMs(b) {
  if (!b || b.type !== 'schedule' || !b.date || !b.time) return null
  const dm = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(String(b.date).trim())
  const tm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(b.time).trim())
  if (!dm || !tm || !(dm[2] in MON)) return null
  let hr = Number(tm[1]) % 12; if (/pm/i.test(tm[3])) hr += 12
  return new Date(Number(dm[3]), MON[dm[2]], Number(dm[1]), hr, Number(tm[2]), 0, 0).getTime()
}
function serviceWindowOpen(b) {
  const start = scheduledStartMs(b)
  return start == null ? true : Date.now() >= start - OTP_LEAD_MS
}
// Adds scheduling fields and withholds the OTP until its release window for the client.
function publicBooking(b) {
  if (!b) return b
  const start = scheduledStartMs(b)
  const open = start == null ? true : Date.now() >= start - OTP_LEAD_MS
  return { ...b, scheduled_at: start, otp_released: open, service_otp: open ? b.service_otp : null }
}

// Authoritative pricing from the catalogue. items: [{id, durationId}]
function priceItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return { error: 'Select at least one service' }
  const items = []
  for (const it of rawItems) {
    const s = getServiceById(it.id)
    if (!s || !s.available) return { error: `"${it.id}" is not available` }
    const durs = durationsFor(s.price)
    const dur = durs.find((d) => d.id === (it.durationId || '60m')) || durs[0]
    items.push({ id: s.id, name: s.name, icon: s.icon, category: s.category, durationId: dur.id, durationLabel: dur.label, price: dur.price })
  }
  const subtotal = Math.max(0, items.reduce((sum, x) => sum + x.price, 0))
  return { items, subtotal }
}

/* ---------- health ---------- */
app.get('/api/health', (_q, r) => r.json({ ok: true }))

/* ---------- auth ---------- */
const otpStore = new Map()
app.post('/api/auth/request-otp', (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  if (phone.length < 6) return res.status(400).json({ error: 'Enter a valid mobile number' })
  otpStore.set(phone, '4321')
  res.json({ ok: true, devOtp: '4321' })
})
app.post('/api/auth/verify-otp', (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  if (String(req.body?.otp || '') !== otpStore.get(phone)) return res.status(401).json({ error: 'Invalid OTP' })
  otpStore.delete(phone)
  const u = findOrCreateUser(phone)
  res.json({ token: 'demo-' + u.id, user: publicUser(u) })
})
app.post('/api/auth/google', (req, res) => {
  let p = null
  if (req.body?.credential) { const j = decodeJwt(req.body.credential); if (!j?.email) return res.status(401).json({ error: 'Invalid Google credential' }); p = { email: j.email, name: j.name || 'Google User', avatar: j.picture } }
  else if (req.body?.demo) p = { email: 'rahul.sharma@gmail.com', name: 'Rahul Sharma' }
  else return res.status(400).json({ error: 'Missing Google credential' })
  const u = findOrCreateGoogleUser(p)
  res.json({ token: 'demo-' + u.id, user: publicUser(u) })
})

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const id = token.startsWith('demo-') ? Number(token.slice(5)) : NaN
  const u = getUser(id); if (!u) return res.status(401).json({ error: 'Not authenticated' })
  req.user = u; next()
}

/* ---------- services & catalogue ---------- */
app.get('/api/services', (_q, res) => res.json({ categories: CATEGORIES, services: getServices() }))
app.get('/api/services/:id', (req, res) => {
  const s = getServiceById(req.params.id)
  if (!s) return res.status(404).json({ error: 'Service not found' })
  res.json({ ...s, ...detailsFor(s.id, s.price) })
})
app.patch('/api/services/:id', (req, res) => {
  const u = updateService(req.params.id, { price: req.body?.price, available: req.body?.available })
  if (!u) return res.status(404).json({ error: 'Service not found' })
  io.emit('services:update', getServices()); res.json(u)
})

/* ---------- home content (referral + trust badges) ---------- */
app.get('/api/home', (_q, res) => res.json({
  referral: REFERRAL,
  trust: TRUST_BADGES,
  instantEta: 5, // minutes
}))
app.get('/api/referral', (_q, res) => res.json(REFERRAL))

/* ---------- payments (Razorpay, with mock fallback) ---------- */
const orders = new Map()
app.get('/api/payment/methods', (_q, res) => res.json({ methods: PAYMENT_METHODS }))

// Tells the client which flow to use and exposes the PUBLIC key id (never the secret).
app.get('/api/payment/config', (_q, res) =>
  res.json({
    provider: RZP_LIVE ? 'razorpay' : 'mock', keyId: RZP_LIVE ? RZP.keyId : null,
    // UPI payee so the app can deep-link into PhonePe/GPay/Paytm with the amount prefilled.
    upiVpa: getSetting('upi_vpa', '') || UPI.vpa,
    payeeName: getSetting('upi_payee_name', '') || UPI.payeeName,
    upiMode: getSetting('upi_mode', '') || UPI.mode, // 'demo' | 'live'
  }))

// Create an order. Real Razorpay order when keys are present; otherwise a mock order.
app.post('/api/payment/order', auth, async (req, res) => {
  const amount = Math.max(0, Math.round(Number(req.body?.amount) || 0))
  if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' })
  if (RZP_LIVE) {
    try {
      const r = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + Buffer.from(`${RZP.keyId}:${RZP.keySecret}`).toString('base64'),
        },
        body: JSON.stringify({ amount: amount * 100, currency: 'INR', receipt: 'rcpt_' + Date.now() }),
      })
      const o = await r.json()
      if (!r.ok) return res.status(502).json({ error: o?.error?.description || 'Gateway order failed' })
      return res.json({ provider: 'razorpay', orderId: o.id, amount, currency: 'INR', keyId: RZP.keyId })
    } catch (e) {
      return res.status(502).json({ error: 'Could not reach payment gateway' })
    }
  }
  // mock
  const orderId = 'ORD' + Math.floor(100000 + Math.random() * 899999)
  orders.set(orderId, { amount, user: req.user.id, paid: false })
  res.json({ provider: 'mock', orderId, amount, currency: 'INR' })
})

// Verify a completed Razorpay payment via HMAC signature (authentic & tamper-proof).
app.post('/api/payment/verify', auth, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {}
  if (!RZP_LIVE) return res.status(400).json({ error: 'Razorpay not configured' })
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    return res.status(400).json({ error: 'Missing payment fields' })
  const expected = crypto.createHmac('sha256', RZP.keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex')
  if (expected !== razorpay_signature) return res.status(400).json({ error: 'Payment verification failed' })
  verifiedPayments.set(String(razorpay_payment_id), { at: Date.now() })
  res.json({ ok: true, txnId: razorpay_payment_id })
})

// Create a payment order (spec: "Backend creates payment order"). Returns an orderId the
// client opens in the UPI/QR/card/netbanking gateway; the booking is only marked paid when
// the SIGNED gateway webhook arrives (POST /api/payments/webhook) — never from the frontend.
app.post('/api/payments/order', auth, (req, res) => {
  const amount = parseInt(req.body?.amount, 10)
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount' })
  const mode = String(req.body?.mode || 'upi') // upi_intent | upi_qr | upi_id | card | netbanking | wallet
  const orderId = 'order_' + crypto.randomBytes(8).toString('hex')
  const p = createPayment({ bookingId: req.body?.bookingId || null, customerId: req.user.id, amount, mode, gateway: 'razorpay', orderId, idempotencyKey: req.body?.idempotencyKey || '' })
  res.json({ ok: true, orderId, paymentId: `PM${String(p.id).padStart(7, '0')}`, amount, mode, status: 'CREATED' })
})

// Legacy mock charge (still used when no keys are configured).
app.post('/api/payment/charge', auth, (req, res) => {
  if (RZP_LIVE) return res.status(400).json({ error: 'Use the Razorpay checkout flow' })
  const method = String(req.body?.method || 'phonepe')
  const order = orders.get(String(req.body?.orderId || ''))
  const amount = order ? order.amount : Math.max(0, Math.round(Number(req.body?.amount) || 0))
  if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' })
  if (method === 'wallet' && req.user.wallet < amount) return res.status(402).json({ error: 'Insufficient wallet balance' })
  const txnId = 'TXN' + Math.floor(10000000 + Math.random() * 89999999)
  if (order) order.paid = true
  res.json({ status: 'paid', txnId, method, amount })
})

/* ---------- coupons ---------- */
app.get('/api/coupons', (_q, res) => res.json(COUPONS))
app.post('/api/coupons/validate', (req, res) => {
  const r = applyCoupon(req.body?.code, Number(req.body?.subtotal) || 0)
  if (r.error) return res.status(400).json(r)
  res.json(r)
})

/* ---------- quote (price breakdown) ---------- */
app.post('/api/quote', (req, res) => {
  const q = priceItems(req.body?.items)
  if (q.error) return res.status(409).json(q)
  let discount = 0, coupon = null
  if (req.body?.coupon) { const c = applyCoupon(req.body.coupon, q.subtotal); if (!c.error) { discount = c.discount; coupon = c.code } }
  res.json({ items: q.items, coupon, ...priceBreakdown(q.subtotal, discount) })
})

/* ---------- favourites ---------- */
app.get('/api/favourites', auth, (req, res) => res.json(getFavourites(req.user.id)))
app.post('/api/favourites/:id', auth, (req, res) => res.json(addFavourite(req.user.id, req.params.id)))
app.delete('/api/favourites/:id', auth, (req, res) => res.json(removeFavourite(req.user.id, req.params.id)))

/* ---------- notifications ---------- */
const STATUS_TITLES = {
  confirmed: 'Booking confirmed', worker_assigned: 'Expert assigned', on_the_way: 'Your expert is on the way',
  arrived: 'Your expert has arrived', in_progress: 'Service in progress', completed: 'Service completed', cancelled: 'Booking cancelled',
}
app.get('/api/notifications', auth, (req, res) => {
  const items = []
  for (const b of getBookings(req.user.id).slice(0, 6)) {
    items.push({
      id: 'b' + b.id, type: 'booking', title: STATUS_TITLES[b.status] || 'Booking update',
      body: `${b.items.map((i) => i.name).join(', ')} · ${b.ref}`, time: b.created, bookingId: b.id,
    })
  }
  items.push({ id: 'o1', type: 'offer', title: '20% off this weekend', body: 'Use code SAVE20 on any service. Limited time!', time: null })
  items.push({ id: 'o2', type: 'cashback', title: `Earn ₹${REFERRAL.reward} per friend`, body: `Share code ${REFERRAL.code} and earn on every referral.`, time: null })
  res.json(items)
})

/* ---------- me / addresses ---------- */
app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user), addresses: getAddresses(req.user.id) }))
app.patch('/api/me', auth, (req, res) => {
  const user = updateUser(req.user.id, req.body || {})
  if (req.body?.location || req.body?.city) ensureDefaultAddressFromLocation(user.id, user.city, user.location)
  res.json({ user: publicUser(user) })
})
app.get('/api/addresses', auth, (req, res) => res.json(getAddresses(req.user.id)))
app.post('/api/addresses', auth, (req, res) => res.status(201).json(addAddress(req.user.id, req.body || {})))
app.patch('/api/addresses/:id/default', auth, (req, res) => res.json(setDefaultAddress(req.user.id, Number(req.params.id))))
app.delete('/api/addresses/:id', auth, (req, res) => res.json(deleteAddress(req.user.id, Number(req.params.id))))

/* ---------- wallet ---------- */
app.get('/api/wallet', auth, (req, res) => res.json({ balance: req.user.wallet, cashback: 200, transactions: getTransactions(req.user.id) }))
app.post('/api/wallet/add', auth, (req, res) => res.json({ balance: addTransaction(req.user.id, 'credit', 'Added to wallet', Math.max(1, Number(req.body?.amount) || 0)) }))

/* ---------- support ---------- */
app.get('/api/support/reasons', (_q, res) => res.json({ cancelReasons: CANCEL_REASONS }))
app.get('/api/tickets', auth, (req, res) => res.json(getTickets(req.user.id)))
app.post('/api/tickets', auth, (req, res) => {
  if (!req.body?.message) return res.status(400).json({ error: 'Describe your issue' })
  res.status(201).json(createTicket(req.user.id, req.body.category || 'General', req.body.message))
})

/* ---------- bookings ---------- */
app.get('/api/bookings', auth, (req, res) => res.json(getBookings(req.user.id).map(publicBooking)))
app.get('/api/bookings/:id', auth, (req, res) => {
  const b = getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  res.json(publicBooking(b))
})
app.post('/api/bookings', auth, (req, res) => {
  const body = req.body || {}
  const q = priceItems(body.items)
  if (q.error) return res.status(q.error.includes('available') ? 409 : 400).json(q)
  let discount = 0, coupon = null
  if (body.coupon) { const c = applyCoupon(body.coupon, q.subtotal); if (!c.error) { discount = c.discount; coupon = c.code } }
  const pb = priceBreakdown(q.subtotal, discount)
  const addresses = getAddresses(req.user.id)
  const address = body.address || addresses.find((a) => a.is_default)?.line || addresses[0]?.line || ''
  const payment = body.payment || 'phonepe'
  const isCash = payment === 'cash'
  const isWallet = payment === 'wallet'
  let paymentStatus = isCash ? 'pending' : 'paid'
  // UPI-direct (deep-link straight into PhonePe/GPay/Paytm) is confirmed in-app, so it carries no
  // Razorpay paymentId. Only the Razorpay-routed methods (cards / net banking) need gateway
  // verification — those go through Checkout and pass a verified paymentId.
  const upiDirect = ['phonepe', 'gpay', 'paytm', 'bhim', 'upi'].includes(payment)
  if (RZP_LIVE && !isCash && !isWallet && !upiDirect) {
    const pid = String(body.paymentId || '')
    if (!verifiedPayments.has(pid)) return res.status(402).json({ error: 'Payment not verified' })
    verifiedPayments.delete(pid) // single use
    paymentStatus = 'paid'
  }

  let booking = createBooking({
    ref: ref(), user_id: req.user.id, type: body.type || 'instant', freq: body.freq, note: body.note,
    date: body.date, time: body.time, address, payment, payment_status: paymentStatus,
    items: q.items, duration: q.items[0]?.durationLabel,
    subtotal: pb.subtotal, fee: pb.fee, tax: pb.tax, discount: pb.discount, coupon, total: pb.total,
    status: 'confirmed', service_otp: otp4(),
  })
  // Capture the customer's live location so the assigned worker can see it on their map.
  if (body.lat != null && body.lng != null) { setBookingCoords(booking.id, body.lat, body.lng); booking = getBooking(booking.id) }
  // Only the in-app wallet reduces the balance; external gateway methods (UPI/card/
  // netbanking) are settled outside, so we just record them as paid.
  if (isWallet) addTransaction(req.user.id, 'debit', `Booking Payment ${booking.ref}`, pb.total, booking.ref)
  // Record the customer payment in the finance ledger (online/wallet are paid up-front;
  // cash is recorded at settlement time when the worker collects). Company-first: this money
  // belongs to the platform account until the booking is settled to the worker.
  if (paymentStatus === 'paid') {
    try { recordExternalPayment({ bookingId: booking.id, customerId: req.user.id, amount: pb.total, mode: isWallet ? 'wallet' : payment, gateway: isWallet ? 'wallet' : 'razorpay', paymentId: body.paymentId || '' }) } catch { /* finance optional */ }
  }
  res.status(201).json(publicBooking(booking))
})

/* ---------- real-time tracking ----------
   confirmed -> worker_assigned -> on_the_way -> arrived -> in_progress -> completed */
const sims = new Map()
function startTracking(id) {
  if (sims.has(id)) return
  const b = getBooking(id); if (!b) return
  setBookingStatus(id, 'worker_assigned')
  io.to(room(id)).emit('booking:update', { ...getBooking(id), dist: 2.4, eta: 12, pos: { lat: 0.10, lng: 0.12 } })
  let t = 0
  setBookingStatus(id, 'on_the_way')
  const tick = () => {
    t = Math.min(1, t + 0.12)
    const dist = Math.max(0, +(2.4 * (1 - t)).toFixed(1))
    const eta = Math.max(0, Math.round(12 * (1 - t)))
    const pos = { lat: 0.10 + 0.78 * t, lng: 0.12 + 0.76 * t }
    if (t >= 1) {
      clearInterval(sims.get(id)); sims.delete(id)
      const a = setBookingStatus(id, 'arrived')
      io.to(room(id)).emit('booking:update', { ...a, dist: 0, eta: 0, pos })
      return
    }
    io.to(room(id)).emit('booking:update', { ...getBooking(id), status: 'on_the_way', dist, eta, pos })
  }
  io.to(room(id)).emit('booking:update', { ...getBooking(id), status: 'on_the_way', dist: 2.4, eta: 12, pos: { lat: 0.10, lng: 0.12 } })
  sims.set(id, setInterval(tick, 1500))
}
app.post('/api/bookings/:id/track', auth, (req, res) => {
  const b = getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  // A future scheduled booking waits — the expert is only dispatched 1 hour before the slot.
  if (!serviceWindowOpen(b)) return res.json({ ok: false, scheduled: true, ...publicBooking(b) })
  // Unified with the HomeHelp Pro worker app: a REAL worker drives the live status
  // (assigned → on the way → arrived → in progress). The customer just subscribes to the
  // booking room and reflects the worker's updates over socket.io. The old simulated
  // "Anjali Verma" dispatch is only used as a fallback when no worker app is in play
  // (set SIMULATE_DISPATCH=1 to re-enable it for the standalone customer demo).
  if (b.worker_id || process.env.SIMULATE_DISPATCH !== '1') return res.json({ ok: true, live: true })
  startTracking(b.id); res.json({ ok: true })
})
app.post('/api/bookings/:id/verify-otp', auth, (req, res) => {
  const b = getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  if (!serviceWindowOpen(b)) return res.status(409).json({ error: 'This scheduled service has not started yet' })
  if (String(req.body?.otp) !== b.service_otp) return res.status(401).json({ error: 'Incorrect OTP' })
  const u = setBookingStarted(b.id) // status -> in_progress + stamp started_at
  io.to(room(b.id)).emit('booking:update', u); res.json(u)
})
app.post('/api/bookings/:id/complete', auth, (req, res) => {
  const b = getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  let u = setBookingStatus(b.id, 'completed')
  if (b.payment === 'cash') u = setPaymentStatus(b.id, 'paid')
  // Customer confirms the job is done -> system verifies and credits the worker (Pending -> QC).
  confirmWorkerSettlement(getBooking(b.id))
  io.to(room(b.id)).emit('booking:update', u); res.json(u)
})
app.post('/api/bookings/:id/reschedule', auth, (req, res) => {
  const b = getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  res.json(rescheduleBooking(b.id, req.body?.date, req.body?.time))
})
app.post('/api/bookings/:id/cancel', auth, (req, res) => {
  const b = getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  if (sims.has(b.id)) { clearInterval(sims.get(b.id)); sims.delete(b.id) }
  // fee: free before pro is on the way, else ₹50
  const fee = ['confirmed', 'worker_assigned'].includes(b.status) ? 0 : 50
  const refundable = b.payment === 'cash' ? 0 : Math.max(0, b.total - fee)
  const u = cancelBookingRow(b.id, req.body?.reason || 'Not specified', fee, refundable)
  if (refundable > 0) { addTransaction(req.user.id, 'credit', `Refund ${b.ref}`, refundable, b.ref); setPaymentStatus(b.id, 'refunded') }
  io.to(room(b.id)).emit('booking:update', getBooking(b.id))
  res.json(getBooking(b.id))
})
app.post('/api/bookings/:id/review', auth, (req, res) => {
  const b = getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  const reviewed = setBookingReview(b.id, Number(req.body?.rating) || 5, req.body?.review, req.body?.photo)
  // Submitting the review is the customer's confirmation -> settle the worker if not already done.
  confirmWorkerSettlement(getBooking(b.id))
  res.json(reviewed)
})

/* ---------- socket ---------- */
io.on('connection', (socket) => {
  socket.emit('services:init', getServices())
  socket.on('booking:join', (id) => socket.join(room(Number(id))))
  socket.on('booking:leave', (id) => socket.leave(room(Number(id))))
})

const PORT = process.env.PORT || 4000
httpServer.listen(PORT, () => console.log(`[server] HomeHelp API on http://localhost:${PORT}`))
