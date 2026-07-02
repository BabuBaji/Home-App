// HomeHelp Dispatch Service
// -------------------------
// Owns job matching + the worker-app job lifecycle (/api/worker/jobs/*). It holds no bookings
// of its own — it reads the open pool + a worker's jobs from the BOOKING service, reads worker
// availability/services/location from the WORKER service, and claims/advances bookings over the
// booking service's internal API. Live GPS + status changes surface to the customer via the
// booking service's realtime events. Owns only ephemeral per-worker skip state.
import express from 'express'
import {
  makePool, migrate, internalGet, internalPost, tryGet, publishEvent, getSettingInt,
} from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4007)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5437/dispatch'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const WORKER_URL = (process.env.WORKER_URL || 'http://localhost:4004').replace(/\/$/, '')
const BOOKING_URL = (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, '')
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')

process.on('unhandledRejection', (e) => console.error('[dispatch] unhandledRejection:', e?.message || e))

const pool = makePool(DATABASE_URL)
const skips = new Map() // workerId -> Set(bookingId) skipped this session
const skipSet = (id) => { if (!skips.has(id)) skips.set(id, new Set()); return skips.get(id) }

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS dispatch_offers (worker_id INTEGER PRIMARY KEY, booking_id INTEGER, created TIMESTAMPTZ DEFAULT now())`,
  ])
  console.log('[dispatch] Postgres ready (dispatch_offers)')
}

const STATUS_TO_ENUM = { worker_assigned: 'ACCEPTED', on_the_way: 'ON_THE_WAY', arrived: 'ARRIVED', in_progress: 'IN_PROGRESS', completed: 'COMPLETED' }
const ACTIVE = ['worker_assigned', 'on_the_way', 'arrived', 'in_progress']

function distanceKm(aLat, aLng, bLat, bLng) {
  if ([aLat, aLng, bLat, bLng].some((v) => v == null)) return null
  const R = 6371, toR = (d) => (d * Math.PI) / 180
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}
const workerShare = async (amt) => { const pct = await getSettingInt(ADMIN_URL, 'commission_percent', 20); return Math.max(0, Math.round((amt * (100 - pct)) / 100)) }

async function jobFromBooking(b) {
  const u = await tryGet(AUTH_URL, `/api/internal/users/${b.user_id}`, null)
  const c = u?.user || {}
  const initials = String(c.name || 'C').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return {
    id: b.ref, bookingId: b.id, customerName: c.name || 'Customer', initials, customerPhone: c.phone || '', customerRating: c.rating || 5.0,
    services: (b.items || []).map((i) => i.name), dateTime: [b.date, b.time].filter(Boolean).join(', ') || new Date(b.created).toLocaleString(),
    durationHours: Math.max(1, parseInt(b.duration, 10) || 2), address: b.address, area: (b.address || '').split(',').slice(-2).join(',').trim() || b.address,
    distanceKm: +(1 + (b.id % 30) / 10).toFixed(1), earnings: await workerShare(b.total), otp: b.service_otp,
    lat: b.cust_lat ?? (17.4448 + (b.id % 10) * 0.002), lng: b.cust_lng ?? (78.3498 + (b.id % 10) * 0.002),
    startedAt: b.started_at || null, completedAt: b.completed_at || null,
  }
}

// Candidate bookings this worker qualifies for (service match, not skipped), nearest first.
async function matchingBookings(w) {
  const svc = new Set((w.services || []).map((s) => String(s).toLowerCase().trim()))
  if (svc.size === 0) return []
  const pool_ = await tryGet(BOOKING_URL, '/api/internal/pool', [])
  const skip = skipSet(w.id)
  const cands = []
  for (const b of pool_) {
    if (skip.has(b.id)) continue
    const names = (b.items || []).map((i) => String(i.name || '').toLowerCase().trim())
    if (!names.some((n) => svc.has(n))) continue
    const dist = w.last ? distanceKm(w.last.lat, w.last.lng, b.cust_lat, b.cust_lng) : null
    cands.push({ b, dist })
  }
  cands.sort((a, c) => { const ad = a.dist ?? Infinity, cd = c.dist ?? Infinity; return ad !== cd ? ad - cd : a.b.id - c.b.id })
  return cands.map((x) => x.b)
}

async function activeBooking(wid) {
  const mine = await tryGet(BOOKING_URL, `/api/internal/bookings?worker_id=${wid}`, [])
  return mine.find((b) => ACTIVE.includes(b.status)) || null
}

const app = express()
app.use(express.json({ limit: '6mb' }))
app.get('/health', (_q, res) => res.json({ service: 'dispatch', ok: true }))

// Worker auth: decode worker-<id>, load the worker's service-set/location from the worker svc.
async function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const id = token.startsWith('worker-') ? Number(token.slice(7)) : NaN
  if (!Number.isFinite(id)) return res.status(401).json({ ok: false, error: 'Not authenticated' })
  const w = await tryGet(WORKER_URL, `/internal/workers/${id}/service-set`, null)
  if (!w || w.status !== 'active') return res.status(401).json({ ok: false, error: 'Not authenticated' })
  req.worker = { id, ...w }
  next()
}

app.get('/api/worker/jobs/available', auth, async (req, res) => {
  const n = (await matchingBookings(req.worker)).length
  res.json({ available: n > 0, count: n })
})

app.post('/api/worker/jobs/request', auth, async (req, res) => {
  const match = (await matchingBookings(req.worker))[0]
  if (!match) return res.json({ job: null, jobStatus: 'NONE' })
  await internalPost(WORKER_URL, `/internal/workers/${req.worker.id}/offered`, { bookingId: match.id })
  res.json({ job: await jobFromBooking(match), jobStatus: 'REQUESTED' })
})

app.post('/api/worker/jobs/accept', auth, async (req, res) => {
  const offeredId = req.worker.offered_booking
  await internalPost(WORKER_URL, `/internal/workers/${req.worker.id}/offered`, { bookingId: null })
  if (!offeredId) return res.status(409).json({ ok: false, error: 'Job no longer available' })
  const claim = await internalPost(BOOKING_URL, `/api/internal/bookings/${offeredId}/assign`, { worker_id: req.worker.id, pro_name: req.worker.name, pro_rating: req.worker.rating })
  if (!claim.ok) return res.status(409).json({ ok: false, error: 'Job already taken by another expert' })
  publishEvent(REDIS_URL, 'job.accepted', { bookingId: offeredId, workerId: req.worker.id })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.accept', entityType: 'booking', entityId: offeredId, ref: claim.booking?.ref, detail: `${req.worker.name} accepted the job` })
  res.json({ ok: true, jobStatus: 'ACCEPTED', activeJob: await jobFromBooking(claim.booking) })
})

app.post('/api/worker/jobs/reject', auth, async (req, res) => {
  if (req.worker.offered_booking) { skipSet(req.worker.id).add(req.worker.offered_booking); await internalPost(WORKER_URL, `/internal/workers/${req.worker.id}/offered`, { bookingId: null }) }
  res.json({ ok: true, jobStatus: 'NONE' })
})

async function advance(req, res, status) {
  const b = await activeBooking(req.worker.id)
  if (!b) return res.status(409).json({ ok: false, error: 'No active job' })
  await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/status`, { status })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.status', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `Status → ${status.replace(/_/g, ' ')}`, meta: { status } })
  res.json({ ok: true, jobStatus: STATUS_TO_ENUM[status] || status, activeJob: await jobFromBooking({ ...b, status }) })
}
app.post('/api/worker/jobs/on-the-way', auth, (req, res) => advance(req, res, 'on_the_way'))
app.post('/api/worker/jobs/arrived', auth, (req, res) => advance(req, res, 'arrived'))

app.post('/api/worker/jobs/location', auth, async (req, res) => {
  const b = await activeBooking(req.worker.id)
  const lat = Number(req.body?.lat), lng = Number(req.body?.lng)
  if (!b || !isFinite(lat) || !isFinite(lng)) return res.json({ ok: false })
  await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/coords`, { worker_lat: lat, worker_lng: lng })
  await internalPost(WORKER_URL, `/internal/workers/${req.worker.id}/location`, { lat, lng })
  const dist = distanceKm(lat, lng, b.cust_lat, b.cust_lng)
  const eta = dist != null ? Math.max(1, Math.round(dist * 2.5)) : null
  res.json({ ok: true, dist: dist != null ? +dist.toFixed(1) : null, eta })
})

app.post('/api/worker/jobs/verify-otp', auth, async (req, res) => {
  const b = await activeBooking(req.worker.id)
  if (!b) return res.status(409).json({ ok: false, error: 'No active job' })
  if (String(req.body?.otp) !== String(b.service_otp)) return res.json({ ok: false, error: 'Incorrect OTP' })
  await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/status`, { status: 'in_progress' })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.start', entityType: 'booking', entityId: b.id, ref: b.ref, detail: 'Service started (OTP verified)' })
  res.json({ ok: true, jobStatus: 'IN_PROGRESS', activeJob: await jobFromBooking({ ...b, status: 'in_progress' }) })
})

app.post('/api/worker/jobs/end', auth, async (req, res) => {
  const b = await activeBooking(req.worker.id)
  if (!b) return res.status(409).json({ ok: false, error: 'No active job' })
  if (req.body?.photo) await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/work-photo`, { url: req.body.photo })
  await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/status`, { status: 'completed' }) // booking emits booking.completed → wallet settles
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.complete', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `Job completed${req.body?.photo ? ' (proof photo attached)' : ''}`, meta: { status: 'completed' } })
  res.json({ ok: true, jobStatus: 'COMPLETED', activeJob: await jobFromBooking({ ...b, status: 'completed' }) })
})

app.post('/api/worker/jobs/settle', auth, async (req, res) => {
  const wallet = await tryGet(WORKER_URL, `/internal/workers/${req.worker.id}`, {})
  res.json({ ok: true, wallet: { balance: wallet.balance, pending: wallet.pending, hold: wallet.hold, withdrawn: wallet.withdrawn } })
})

app.post('/api/worker/jobs/cancel', auth, async (req, res) => {
  const b = await activeBooking(req.worker.id)
  if (b) {
    await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/release`, {})
    skipSet(req.worker.id).add(b.id)
    publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.drop', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `${req.worker.name} dropped the job (returned to pool)` })
  }
  res.json({ ok: true, jobStatus: 'NONE' })
})

init()
  .then(() => app.listen(PORT, () => console.log(`[dispatch] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[dispatch] failed to start:', e.message); process.exit(1) })
