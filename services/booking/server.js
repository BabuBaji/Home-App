// HomeHelp Booking Service
// -------------------------
// Owns `bookings` (incl. the worker/settlement/coords columns reclaimed from the monolith)
// and `favourites`. Drives the booking lifecycle, prices bookings via the catalog service,
// reads addresses / moves the customer wallet via the auth service, and emits booking.* events
// (consumed by dispatch, wallet, payment and notification). Realtime booking:update messages
// are published to Redis and relayed by the gateway's socket hub.
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

app.post('/api/bookings', auth, async (req, res) => {
  const body = req.body || {}
  // Authoritative pricing from the catalog service.
  let priced
  try { priced = await internalPost(CATALOG_URL, '/api/internal/price', { items: body.items, coupon: body.coupon }) }
  catch { return res.status(409).json({ error: 'Could not price these items' }) }
  if (priced.error) return res.status(priced.error.includes('available') ? 409 : 400).json(priced)

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
  res.json(bookings.map((b) => ({ ...b, customer: names[b.user_id] || 'Customer' })))
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

init()
  .then(() => app.listen(PORT, () => console.log(`[booking] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[booking] failed to start:', e.message); process.exit(1) })
