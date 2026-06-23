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

const app = express()
app.use(cors())
app.use(express.json({ limit: '6mb' })) // allow review photo data-URLs
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })
const room = (id) => `booking:${id}`
const now = () => new Date()
const otp4 = () => String(Math.floor(1000 + Math.random() * 9000))
const ref = () => '#HH' + Math.floor(10000 + Math.random() * 89999)

function publicUser(u) {
  return { id: u.id, phone: u.phone, name: u.name, email: u.email, provider: u.provider, avatar: u.avatar, country: u.country, city: u.city, location: u.location, wallet: u.wallet, rating: u.rating }
}
function decodeJwt(t) { try { return JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) } catch { return null } }

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

/* ---------- payment gateway (mock) ---------- */
const orders = new Map()
app.get('/api/payment/methods', (_q, res) => res.json({ methods: PAYMENT_METHODS }))
app.post('/api/payment/order', auth, (req, res) => {
  const amount = Math.max(0, Math.round(Number(req.body?.amount) || 0))
  if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' })
  const orderId = 'ORD' + Math.floor(100000 + Math.random() * 899999)
  orders.set(orderId, { amount, user: req.user.id, paid: false })
  res.json({ orderId, amount, currency: 'INR' })
})
app.post('/api/payment/charge', auth, (req, res) => {
  const method = String(req.body?.method || 'phonepe')
  const order = orders.get(String(req.body?.orderId || ''))
  const amount = order ? order.amount : Math.max(0, Math.round(Number(req.body?.amount) || 0))
  if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' })
  if (method === 'wallet' && req.user.wallet < amount) return res.status(402).json({ error: 'Insufficient wallet balance' })
  // simulate gateway authorisation
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
app.get('/api/bookings', auth, (req, res) => res.json(getBookings(req.user.id)))
app.get('/api/bookings/:id', auth, (req, res) => {
  const b = getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  res.json(b)
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
  const paymentStatus = isCash ? 'pending' : 'paid'

  const booking = createBooking({
    ref: ref(), user_id: req.user.id, type: body.type || 'instant', freq: body.freq, note: body.note,
    date: body.date, time: body.time, address, payment, payment_status: paymentStatus,
    items: q.items, duration: q.items[0]?.durationLabel,
    subtotal: pb.subtotal, fee: pb.fee, tax: pb.tax, discount: pb.discount, coupon, total: pb.total,
    status: 'confirmed', service_otp: otp4(),
  })
  // Only the in-app wallet reduces the balance; external gateway methods (UPI/card/
  // netbanking) are settled outside, so we just record them as paid.
  if (isWallet) addTransaction(req.user.id, 'debit', `Booking Payment ${booking.ref}`, pb.total, booking.ref)
  res.status(201).json(booking)
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
  startTracking(b.id); res.json({ ok: true })
})
app.post('/api/bookings/:id/verify-otp', auth, (req, res) => {
  const b = getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  if (String(req.body?.otp) !== b.service_otp) return res.status(401).json({ error: 'Incorrect OTP' })
  const u = setBookingStarted(b.id) // status -> in_progress + stamp started_at
  io.to(room(b.id)).emit('booking:update', u); res.json(u)
})
app.post('/api/bookings/:id/complete', auth, (req, res) => {
  const b = getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  let u = setBookingStatus(b.id, 'completed')
  if (b.payment === 'cash') u = setPaymentStatus(b.id, 'paid')
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
  res.json(setBookingReview(b.id, Number(req.body?.rating) || 5, req.body?.review, req.body?.photo))
})

/* ---------- socket ---------- */
io.on('connection', (socket) => {
  socket.emit('services:init', getServices())
  socket.on('booking:join', (id) => socket.join(room(Number(id))))
  socket.on('booking:leave', (id) => socket.leave(room(Number(id))))
})

const PORT = process.env.PORT || 4000
httpServer.listen(PORT, () => console.log(`[server] HomeHelp API on http://localhost:${PORT}`))
