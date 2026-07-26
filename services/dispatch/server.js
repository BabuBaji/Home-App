// HomeHelp Dispatch Service
// -------------------------
// Owns job matching + the worker-app job lifecycle (/api/worker/jobs/*). It holds no bookings
// of its own — it reads the open pool + a worker's jobs from the BOOKING service, reads worker
// availability/services/location from the WORKER service, and claims/advances bookings over the
// booking service's internal API. Live GPS + status changes surface to the customer via the
// booking service's realtime events. Owns only ephemeral per-worker skip state.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import {
  makePool, migrate, internalGet, internalPost, tryGet, publishEvent, getSettingInt,
} from '@homehelp/shared'
// Imported directly, not via the shared index: it carries the jsonwebtoken dep.
import { tokenSubject, assertJwtSecret } from '@homehelp/shared/jwt.js'
import { makeCustomerAuth } from '@homehelp/shared/customer-auth.js'

assertJwtSecret('dispatch') // refuse to boot without a signing secret rather than trust forgeable tokens

const PORT = Number(process.env.PORT || 4007)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5437/dispatch'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const WORKER_URL = (process.env.WORKER_URL || 'http://localhost:4004').replace(/\/$/, '')
const BOOKING_URL = (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, '')
const CATALOG_URL = (process.env.CATALOG_URL || 'http://localhost:4001').replace(/\/$/, '')
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')

process.on('unhandledRejection', (e) => console.error('[dispatch] unhandledRejection:', e?.message || e))

const pool = makePool(DATABASE_URL)
const skips = new Map() // workerId -> Set(bookingId) skipped this session
const skipSet = (id) => { if (!skips.has(id)) skips.set(id, new Set()); return skips.get(id) }

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS dispatch_offers (worker_id INTEGER PRIMARY KEY, booking_id INTEGER, created TIMESTAMPTZ DEFAULT now())`,
    // Per-job working state for the in-service flow: checklist ticks, before/after photo sets,
    // worker-added extra services, and pause bookkeeping. Keyed by booking — a booking IS a job.
    `CREATE TABLE IF NOT EXISTS job_state (
       booking_id INTEGER PRIMARY KEY,
       checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
       before_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
       after_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
       extras JSONB NOT NULL DEFAULT '[]'::jsonb,
       paused BOOLEAN NOT NULL DEFAULT false,
       paused_ms BIGINT NOT NULL DEFAULT 0,
       paused_at TIMESTAMPTZ,
       updated TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS job_messages (
       id SERIAL PRIMARY KEY,
       booking_id INTEGER NOT NULL,
       sender TEXT NOT NULL,
       body TEXT NOT NULL,
       created TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS job_messages_booking ON job_messages (booking_id, id)`,
    // Step 5/7/8 of the job flow: named before/after photo slots, per-phase notes, and the
    // customer's sign-off + rating. Added as ALTERs so existing job_state rows survive.
    `ALTER TABLE job_state ADD COLUMN IF NOT EXISTS photo_slots JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE job_state ADD COLUMN IF NOT EXISTS before_notes TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE job_state ADD COLUMN IF NOT EXISTS after_notes TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE job_state ADD COLUMN IF NOT EXISTS signature TEXT`,
    `ALTER TABLE job_state ADD COLUMN IF NOT EXISTS customer_rating INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE job_state ADD COLUMN IF NOT EXISTS customer_notes TEXT NOT NULL DEFAULT ''`,
  ])
  console.log('[dispatch] Postgres ready (dispatch_offers, job_state, job_messages)')
}

// Default per-service task list, seeded on first read of a job's state. Mirrors the task lists the
// worker app used to hardcode client-side, so ticks now survive nav/restart and reach the server.
const CHECKLIST_BY_SERVICE = [
  [/bathroom/i, ['Scrub toilet & seat', 'Clean washbasin & mirror', 'Scrub floor & tiles', 'Wipe fittings dry', 'Empty dustbin']],
  [/kitchen/i, ['Clear & wipe counters', 'Clean stove & backsplash', 'Degrease chimney/hob', 'Wipe cabinet fronts', 'Mop floor', 'Take out trash']],
  [/dish/i, ['Wash utensils', 'Rinse & stack to dry', 'Wipe sink area']],
  [/sweep|mop/i, ['Sweep all rooms', 'Mop all rooms', 'Clean under furniture']],
  [/laundry/i, ['Sort colours & whites', 'Run wash cycle', 'Dry & fold', 'Stack neatly']],
  [/window/i, ['Dust frames & grills', 'Wash glass both sides', 'Wipe streak-free']],
  [/fan/i, ['Dust blades', 'Wipe blades damp', 'Clean fan mount']],
  [/fridge|refrigerator/i, ['Empty & discard expired', 'Wipe shelves & trays', 'Clean door seals']],
  [/sofa|upholstery/i, ['Vacuum cushions', 'Spot-treat stains', 'Deodorise fabric']],
]
function defaultChecklist(b) {
  const names = (b.items || []).map((i) => String(i.name || ''))
  const tasks = []
  for (const n of names) {
    const hit = CHECKLIST_BY_SERVICE.find(([re]) => re.test(n))
    const list = hit ? hit[1] : ['Complete the service', 'Tidy the work area']
    for (const label of list) tasks.push({ label, service: n, done: false })
  }
  if (tasks.length === 0) tasks.push({ label: 'Complete the service', service: '', done: false })
  return tasks.map((t, i) => ({ id: i + 1, ...t }))
}

// The named shots the worker must take before/after, per the job-flow design ("Photos Required
// 2/3" — Kitchen Overall View, Sink Area, …). Derived from the booked service, like the checklist.
const PHOTO_SLOTS_BY_SERVICE = [
  [/kitchen/i, ['Kitchen Overall View', 'Sink Area', 'Cabinets & Platform']],
  [/bathroom/i, ['Bathroom Overall View', 'Toilet & Seat', 'Washbasin & Mirror']],
  [/sweep|mop/i, ['Room Overall View', 'Floor Area', 'Corners & Under Furniture']],
  [/dish/i, ['Sink & Utensils', 'Counter Area']],
  [/laundry/i, ['Clothes Pile', 'Washing Area']],
  [/window/i, ['Window Overall View', 'Glass Close-up']],
  [/fan/i, ['Fan Overall View', 'Blades Close-up']],
  [/sofa|upholstery/i, ['Sofa Overall View', 'Cushions & Corners']],
]
function defaultPhotoSlots(b) {
  const first = (b.items || [])[0]?.name || ''
  const hit = PHOTO_SLOTS_BY_SERVICE.find(([re]) => re.test(first))
  return hit ? hit[1] : ['Overall View', 'Work Area']
}

// Reads a job's state, seeding the row (its checklist + photo slots) on first touch.
async function jobState(b) {
  const q = await pool.query('SELECT * FROM job_state WHERE booking_id=$1', [b.id])
  if (q.rows.length) {
    const row = q.rows[0]
    // Backfill slots for rows created before the photo step existed.
    if (!row.photo_slots || row.photo_slots.length === 0) {
      const up = await pool.query('UPDATE job_state SET photo_slots=$2::jsonb WHERE booking_id=$1 RETURNING *', [b.id, JSON.stringify(defaultPhotoSlots(b))])
      return up.rows[0]
    }
    return row
  }
  const ins = await pool.query(
    `INSERT INTO job_state (booking_id, checklist, photo_slots) VALUES ($1, $2::jsonb, $3::jsonb)
     ON CONFLICT (booking_id) DO UPDATE SET updated=now() RETURNING *`,
    [b.id, JSON.stringify(defaultChecklist(b)), JSON.stringify(defaultPhotoSlots(b))],
  )
  return ins.rows[0]
}

// Milliseconds this job has spent paused, counting an in-flight pause up to now.
const pausedMsNow = (s) =>
  Number(s.paused_ms || 0) + (s.paused && s.paused_at ? Date.now() - new Date(s.paused_at).getTime() : 0)

const stateDto = (s) => ({
  checklist: s.checklist || [],
  photoSlots: s.photo_slots || [],
  beforePhotos: s.before_photos || [],
  afterPhotos: s.after_photos || [],
  beforeNotes: s.before_notes || '',
  afterNotes: s.after_notes || '',
  signature: s.signature || null,
  signed: !!s.signature,
  customerRating: s.customer_rating || 0,
  customerNotes: s.customer_notes || '',
  extras: s.extras || [],
  paused: !!s.paused,
  pausedMs: pausedMsNow(s),
  extrasTotal: (s.extras || []).reduce((t, e) => t + Number(e.price || 0), 0),
})

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

// Booked service length in minutes — authoritative value for the live timer / "time completed"
// popup. Prefer the item's durationId (e.g. "90m", "2h"); fall back to parsing the label.
const DUR_MIN = { '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }
function bookingDurationMinutes(b) {
  const id = b.items?.[0]?.durationId
  if (id && DUR_MIN[id]) return DUR_MIN[id]
  const s = String(b.duration || '')
  const n = parseInt(s, 10)
  if (!n) return 60
  return /h/i.test(s) && !/min/i.test(s) ? n * 60 : n
}

// Reason menu the worker picks from. `chargeable:false` means the customer is not billed for the
// extra time — kept in sync with EXT_REASONS in the booking service, which is the authority.
const EXT_REASON_LIST = [
  { code: 'customer_request', label: 'Customer requested additional work', chargeable: true },
  { code: 'more_area', label: 'More area/items than expected', chargeable: true },
  { code: 'service_condition', label: 'Service condition requires more time', chargeable: true },
  { code: 'customer_added_task', label: 'Customer added another task', chargeable: true },
  { code: 'scope_incomplete', label: 'Original scope incomplete', chargeable: false },
  { code: 'other', label: 'Other', chargeable: true },
]

async function jobFromBooking(b) {
  const u = await tryGet(AUTH_URL, `/api/internal/users/${b.user_id}`, null)
  const c = u?.user || {}
  const initials = String(c.name || 'C').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return {
    id: b.ref, bookingId: b.id, customerName: c.name || 'Customer', initials, customerAvatar: c.avatar || '', customerPhone: c.phone || '', customerRating: c.rating || 5.0,
    customerType: b.type || 'Residential', note: b.note || '',
    services: (b.items || []).map((i) => i.name), dateTime: [b.date, b.time].filter(Boolean).join(', ') || new Date(b.created).toLocaleString(),
    durationHours: Math.max(1, parseInt(b.duration, 10) || 2), durationMinutes: bookingDurationMinutes(b), address: b.address, area: (b.address || '').split(',').slice(-2).join(',').trim() || b.address,
    distanceKm: +(1 + (b.id % 30) / 10).toFixed(1), earnings: await workerShare(b.total), otp: b.service_otp,
    lat: b.cust_lat ?? (17.4448 + (b.id % 10) * 0.002), lng: b.cust_lng ?? (78.3498 + (b.id % 10) * 0.002),
    startedAt: b.started_at || null, completedAt: b.completed_at || null,
    // Extra approved time rides alongside the booked duration — the app adds the two for the live
    // countdown, so the base figure keeps meaning "what was booked".
    extensionMinutes: b.extension_minutes || 0,
  }
}

// Candidate bookings this worker qualifies for (service match, not skipped), nearest first.
async function matchingBookings(w) {
  const svc = new Set((w.services || []).map((s) => String(s).toLowerCase().trim()))
  if (svc.size === 0) return []
  const pool_ = await tryGet(BOOKING_URL, '/api/internal/pool', [])
  const skip = skipSet(w.id)
  const cands = []
  // Per-call cache of each zone's capacity so we fetch a zone's Max Travel Distance at most once.
  const capCache = new Map()
  const capFor = async (zid) => {
    if (zid == null) return null
    if (capCache.has(zid)) return capCache.get(zid)
    const r = await tryGet(CATALOG_URL, `/api/internal/zone-capacity?zoneId=${zid}`, null)
    const cap = r?.capacity || null; capCache.set(zid, cap); return cap
  }
  /* Coverage. When a worker is RESTRICTED (allowOutsideRadius === false) their zone stops being a
   * preference and becomes a filter, and their job radius is measured from their assigned store —
   * which is what makes the admin screen's "only jobs within the assigned zone" true rather than a
   * hopeful label. Left open (the default), the old soft-preference behaviour stands and nobody in
   * a quiet zone sits idle next to work they could do.
   */
  const wz = w.zone_id ?? null
  const restricted = w.allowOutsideRadius === false && wz != null
  const radiusKm = Number(w.jobRadiusKm) || 0
  // The store's location, fetched at most once per call — the radius is measured from it, not from
  // the worker's live GPS, because that is what the admin drew a circle around.
  let store = null
  if (restricted && radiusKm > 0 && w.storeId) {
    const r = await tryGet(CATALOG_URL, `/api/internal/stores/${w.storeId}`, null)
    if (r && r.lat != null && r.lng != null) store = { lat: Number(r.lat), lng: Number(r.lng) }
    else console.error(`[dispatch] worker ${w.id} has a ${radiusKm}km radius but store ${w.storeId} has no location — radius not applied`)
  }

  for (const b of pool_) {
    if (skip.has(b.id)) continue
    const names = (b.items || []).map((i) => String(i.name || '').toLowerCase().trim())
    if (!names.some((n) => svc.has(n))) continue
    // Restricted: own zone only.
    if (restricted && b.zone_id !== wz) continue
    // Restricted: within their radius of their store. Only when we actually know where the store
    // is — a radius we cannot measure must not silently drop every job.
    if (restricted && store && radiusKm > 0) {
      if (distanceKm(store.lat, store.lng, b.cust_lat, b.cust_lng) > radiusKm) continue
    }
    const dist = w.last ? distanceKm(w.last.lat, w.last.lng, b.cust_lat, b.cust_lng) : null
    // Max Travel Distance: don't offer a job to a worker farther than the job's zone allows.
    // Independent of the per-worker radius — whichever is tighter wins.
    if (dist != null) {
      const maxKm = Number((await capFor(b.zone_id))?.maxTravelKm) || 0
      if (maxKm > 0 && dist > maxKm) continue
    }
    cands.push({ b, dist })
  }
  // Zone-first: a worker's own-zone jobs rank ahead of out-of-zone ones; then nearest by GPS.
  // (For an unrestricted worker this stays a soft preference — out-of-zone jobs are still offered
  // if there is no in-zone work, to avoid starvation.)
  cands.sort((a, c) => {
    const az = wz != null && a.b.zone_id === wz ? 0 : 1
    const cz = wz != null && c.b.zone_id === wz ? 0 : 1
    if (az !== cz) return az - cz
    const ad = a.dist ?? Infinity, cd = c.dist ?? Infinity
    return ad !== cd ? ad - cd : a.b.id - c.b.id
  })
  return cands.map((x) => x.b)
}

async function activeBooking(wid) {
  const mine = await tryGet(BOOKING_URL, `/api/internal/bookings?worker_id=${wid}`, [])
  return mine.find((b) => ACTIVE.includes(b.status)) || null
}

const app = express()
app.use(express.json({ limit: '6mb' }))
app.get('/health', (_q, res) => res.json({ service: 'dispatch', ok: true }))

// Worker auth: verify the SIGNED token, then load the worker's service-set/location from the
// worker svc. This used to parse the id straight out of `worker-<id>`, so `Bearer worker-6`
// exposed another worker's job offers — the same hole the worker/auth/admin services had.
async function auth(req, res, next) {
  const id = tokenSubject(req.headers.authorization, 'worker')
  if (!Number.isFinite(id)) return res.status(401).json({ ok: false, error: 'Not authenticated' })
  const w = await tryGet(WORKER_URL, `/internal/workers/${id}/service-set`, null)
  if (!w || w.status !== 'active') return res.status(401).json({ ok: false, error: 'Not authenticated' })
  req.worker = { id, ...w }
  next()
}

// Customer auth, for the customer half of the job chat below. The messages live in THIS service's
// database, so the customer's routes belong here next to the worker's rather than being proxied
// through the booking service.
const customerAuth = makeCustomerAuth(AUTH_URL)

/* Phase 11: the worker's own stated weekly hours cap.
 * Enforced here rather than in the app, because the app isn't the only thing that can call this.
 * It's the ONE availability preference that gates: jobs are pull-based, so refusing a worker who
 * is actively asking for work because they'd marked the day off would be absurd — but a cap they
 * set on themselves is a boundary worth holding when they're tired enough to ignore it.
 */
const cappedMsg = (wl) => `You've reached the ${wl.maxWeeklyHours}h weekly limit you set (${wl.hoursThisWeek}h worked). Raise it in Availability if you want more work.`

app.get('/api/worker/jobs/available', auth, async (req, res) => {
  const wl = req.worker.workLimit
  if (wl?.capped) return res.json({ available: false, count: 0, capped: true, reason: cappedMsg(wl) })
  const n = (await matchingBookings(req.worker)).length
  res.json({ available: n > 0, count: n })
})

app.post('/api/worker/jobs/request', auth, async (req, res) => {
  const wl = req.worker.workLimit
  if (wl?.capped) return res.json({ job: null, jobStatus: 'NONE', capped: true, error: cappedMsg(wl) })
  const match = (await matchingBookings(req.worker))[0]
  if (!match) return res.json({ job: null, jobStatus: 'NONE' })
  await internalPost(WORKER_URL, `/internal/workers/${req.worker.id}/offered`, { bookingId: match.id })
  res.json({ job: await jobFromBooking(match), jobStatus: 'REQUESTED' })
})

app.post('/api/worker/jobs/accept', auth, async (req, res) => {
  const offeredId = req.worker.offered_booking
  await internalPost(WORKER_URL, `/internal/workers/${req.worker.id}/offered`, { bookingId: null })
  if (!offeredId) return res.status(409).json({ ok: false, error: 'Job no longer available' })
  // Log the acceptance before claiming: the worker said yes, so it counts toward their
  // acceptance rate even if another worker wins the race for the booking below.
  await internalPost(WORKER_URL, `/internal/workers/${req.worker.id}/offer-outcome`, { bookingId: offeredId, outcome: 'accepted' })
  const claim = await internalPost(BOOKING_URL, `/api/internal/bookings/${offeredId}/assign`, { worker_id: req.worker.id, pro_name: req.worker.name, pro_rating: req.worker.rating })
  if (!claim.ok) return res.status(409).json({ ok: false, error: 'Job already taken by another expert' })
  publishEvent(REDIS_URL, 'job.accepted', { bookingId: offeredId, workerId: req.worker.id, ref: claim.booking?.ref })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.accept', entityType: 'booking', entityId: offeredId, ref: claim.booking?.ref, detail: `${req.worker.name} accepted the job` })
  res.json({ ok: true, jobStatus: 'ACCEPTED', activeJob: await jobFromBooking(claim.booking) })
})

app.post('/api/worker/jobs/reject', auth, async (req, res) => {
  if (req.worker.offered_booking) {
    const offeredId = req.worker.offered_booking
    skipSet(req.worker.id).add(offeredId)
    await internalPost(WORKER_URL, `/internal/workers/${req.worker.id}/offered`, { bookingId: null })
    await internalPost(WORKER_URL, `/internal/workers/${req.worker.id}/offer-outcome`, { bookingId: offeredId, outcome: 'declined' })
  }
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
  // Domain event: the wallet service uses this to decide the on-time-start incentive vs late penalty.
  publishEvent(REDIS_URL, 'job.start', { bookingId: b.id, workerId: req.worker.id, ref: b.ref })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.start', entityType: 'booking', entityId: b.id, ref: b.ref, detail: 'Service started (OTP verified)' })
  res.json({ ok: true, jobStatus: 'IN_PROGRESS', activeJob: await jobFromBooking({ ...b, status: 'in_progress' }) })
})

app.post('/api/worker/jobs/end', auth, async (req, res) => {
  const b = await activeBooking(req.worker.id)
  if (!b) return res.status(409).json({ ok: false, error: 'No active job' })
  // The proof photo now comes from the after-photo set captured at step 7; an explicit body photo
  // is still honoured so an older client keeps working.
  const st = await jobState(b)
  const proof = req.body?.photo || (st.after_photos || [])[0]?.url || null
  if (proof) await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/work-photo`, { url: proof })
  await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/status`, { status: 'completed' }) // booking emits booking.completed → wallet settles
  const shots = (st.after_photos || []).length
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.complete', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `Job completed${shots ? ` (${shots} after photo${shots > 1 ? 's' : ''})` : ''}${st.signature ? ' · customer signed' : ''}`, meta: { status: 'completed' } })
  res.json({ ok: true, jobStatus: 'COMPLETED', activeJob: await jobFromBooking({ ...b, status: 'completed' }) })
})

// ─── In-service job state: checklist · photos · extras · pause/resume · chat ──────────────
// All of these hang off the worker's ACTIVE booking, so none of them take an id: the worker app
// only ever drives one live job at a time (mirroring /on-the-way, /arrived, /end above).

const activeOr409 = async (req, res) => {
  const b = await activeBooking(req.worker.id)
  if (!b) { res.status(409).json({ ok: false, error: 'No active job' }); return null }
  return b
}
const saveState = async (id, patch) => {
  const keys = Object.keys(patch)
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ')
  const vals = keys.map((k) => (typeof patch[k] === 'object' && patch[k] !== null ? JSON.stringify(patch[k]) : patch[k]))
  const q = await pool.query(`UPDATE job_state SET ${sets}, updated=now() WHERE booking_id=$1 RETURNING *`, [id, ...vals])
  return q.rows[0]
}

app.get('/api/worker/jobs/state', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  res.json({ ok: true, ...stateDto(await jobState(b)) })
})

// Whole-list save: the app owns the tick state and posts the list back, so a stale client can
// never resurrect a task the worker removed.
app.post('/api/worker/jobs/checklist', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  await jobState(b)
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  const clean = items.map((t, i) => ({ id: Number(t.id) || i + 1, label: String(t.label || ''), service: String(t.service || ''), done: !!t.done }))
  res.json({ ok: true, ...stateDto(await saveState(b.id, { checklist: clean })) })
})

// Photos are keyed by slot ("Sink Area"), so a retake replaces that shot rather than appending a
// second copy, and "Photos Required (2/3)" can be counted honestly.
app.post('/api/worker/jobs/photos', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  const s = await jobState(b)
  const phase = req.body?.phase === 'after' ? 'after_photos' : 'before_photos'
  const photo = String(req.body?.photo || '')
  const slot = String(req.body?.slot || '').trim() || 'Additional'
  if (!photo.startsWith('data:image/')) return res.status(400).json({ ok: false, error: 'photo must be a data URL' })
  const list = [...(s[phase] || [])].filter((p) => p.slot !== slot)
  list.push({ slot, url: photo, at: new Date().toISOString() })
  res.json({ ok: true, ...stateDto(await saveState(b.id, { [phase]: list.slice(-8) })) })
})

app.post('/api/worker/jobs/photos/remove', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  const s = await jobState(b)
  const phase = req.body?.phase === 'after' ? 'after_photos' : 'before_photos'
  const slot = String(req.body?.slot || '')
  res.json({ ok: true, ...stateDto(await saveState(b.id, { [phase]: (s[phase] || []).filter((p) => p.slot !== slot) })) })
})

app.post('/api/worker/jobs/notes', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  await jobState(b)
  const col = req.body?.phase === 'after' ? 'after_notes' : 'before_notes'
  res.json({ ok: true, ...stateDto(await saveState(b.id, { [col]: String(req.body?.text || '').slice(0, 200) })) })
})

// Step 8 — the customer signs off and rates the service on the worker's device.
app.post('/api/worker/jobs/signature', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  await jobState(b)
  const sig = String(req.body?.signature || '')
  if (!sig.startsWith('data:image/')) return res.status(400).json({ ok: false, error: 'signature must be a data URL' })
  const rating = Math.min(5, Math.max(0, Math.round(Number(req.body?.rating) || 0)))
  const out = stateDto(await saveState(b.id, {
    signature: sig, customer_rating: rating, customer_notes: String(req.body?.notes || '').slice(0, 200),
  }))
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.signed', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `Customer signed off${rating ? ` · rated ${rating}★` : ''}` })
  res.json({ ok: true, ...out })
})

/* ---------- service extensions (worker side) ---------- */
// The menu the worker is offered, plus what's already been used — booking owns the accounting, so
// this is a straight proxy rather than a second copy of the rules.
app.get('/api/worker/jobs/extension-options', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  const serviceId = (b.items || [])[0]?.id || ''
  const rule = await tryGet(CATALOG_URL, `/api/internal/extension-rule/${encodeURIComponent(serviceId)}`, null)
  const rows = await tryGet(BOOKING_URL, `/api/internal/bookings/${b.id}/extensions`, [])
  const approved = (Array.isArray(rows) ? rows : []).filter((r) => r.status === 'approved')
  const usedMin = approved.reduce((s, r) => s + r.minutes, 0)
  const remaining = Math.max(0, (rule?.maxTotalMin || 0) - usedMin)
  res.json({
    enabled: !!rule?.enabled && remaining > 0 && approved.length < (rule?.maxRequests || 0),
    blocks: (rule?.blocks || []).filter((x) => x.mins <= remaining),
    reasons: EXT_REASON_LIST,
    pending: (Array.isArray(rows) ? rows : []).find((r) => r.status === 'pending') || null,
    usedMinutes: usedMin, remainingMinutes: remaining,
    requestsLeft: Math.max(0, (rule?.maxRequests || 0) - approved.length),
  })
})

app.post('/api/worker/jobs/extension', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  try {
    const out = await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/extension`, {
      minutes: Number(req.body?.minutes) || 0,
      reasonCode: String(req.body?.reasonCode || ''),
      reasonText: String(req.body?.reasonText || ''),
    })
    res.json(out)
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || 'Could not request more time' })
  }
})

// Poll target while the worker waits on the customer — cheap, and the app already polls job state.
app.get('/api/worker/jobs/extensions', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  const rows = await tryGet(BOOKING_URL, `/api/internal/bookings/${b.id}/extensions`, [])
  res.json({ ok: true, extensions: Array.isArray(rows) ? rows : [], extensionMinutes: b.extension_minutes || 0 })
})

app.post('/api/worker/jobs/extras', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  const s = await jobState(b)
  const name = String(req.body?.name || '').trim()
  const price = Math.max(0, Math.round(Number(req.body?.price) || 0))
  if (!name || !price) return res.status(400).json({ ok: false, error: 'name and price are required' })
  const extras = [...(s.extras || []), { id: Date.now(), name, price }]
  const out = stateDto(await saveState(b.id, { extras }))
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.extra', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `Added extra: ${name} (₹${price})` })
  res.json({ ok: true, ...out })
})

app.post('/api/worker/jobs/extras/remove', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  const s = await jobState(b)
  const id = Number(req.body?.id)
  res.json({ ok: true, ...stateDto(await saveState(b.id, { extras: (s.extras || []).filter((e) => Number(e.id) !== id) })) })
})

// Pause bookkeeping: paused_at marks the current pause's start; paused_ms accumulates finished
// pauses. The app subtracts pausedMs from the server-anchored timer so a pause stops the clock.
app.post('/api/worker/jobs/pause', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  const s = await jobState(b)
  if (s.paused) return res.json({ ok: true, ...stateDto(s) })
  const out = stateDto(await saveState(b.id, { paused: true, paused_at: new Date().toISOString() }))
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.pause', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `${req.worker.name} paused the service${req.body?.reason ? ` — ${req.body.reason}` : ''}` })
  res.json({ ok: true, ...out })
})

app.post('/api/worker/jobs/resume', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  const s = await jobState(b)
  if (!s.paused) return res.json({ ok: true, ...stateDto(s) })
  const add = s.paused_at ? Date.now() - new Date(s.paused_at).getTime() : 0
  const out = stateDto(await saveState(b.id, { paused: false, paused_at: null, paused_ms: Number(s.paused_ms || 0) + add }))
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.resume', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `${req.worker.name} resumed the service` })
  res.json({ ok: true, ...out })
})

app.get('/api/worker/jobs/messages', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  const q = await pool.query('SELECT id, sender, body, created FROM job_messages WHERE booking_id=$1 ORDER BY id', [b.id])
  res.json({ ok: true, messages: q.rows })
})

app.post('/api/worker/jobs/messages', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  const body = String(req.body?.text || '').trim().slice(0, 1000)
  if (!body) return res.status(400).json({ ok: false, error: 'text is required' })
  const q = await pool.query('INSERT INTO job_messages (booking_id, sender, body) VALUES ($1, $2, $3) RETURNING id, sender, body, created', [b.id, 'worker', body])
  // Surfaces to the customer side via the same realtime bus the status changes use.
  publishEvent(REDIS_URL, 'job.message', { bookingId: b.id, ref: b.ref, workerId: req.worker.id, sender: 'worker', body })
  res.json({ ok: true, message: q.rows[0] })
})

/* ---------- job chat: customer half ----------
 * The worker half above has existed for a while; the customer app had no API to talk to and kept
 * its messages in localStorage, so nothing the customer typed ever reached the worker. These two
 * routes close that loop by writing the SAME job_messages rows with sender='customer' — the worker
 * app already renders anything that isn't sender='worker' as an incoming bubble, so it needs no
 * change. The booking service stays the authority on who owns a booking; we ask it every time
 * rather than trusting the caller's id.
 */
const MSG_MAX = 1000
async function ownedBookingOr404(req, res) {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) { res.status(404).json({ error: 'Not found' }); return null }
  const b = await tryGet(BOOKING_URL, `/api/internal/bookings/${id}`, null)
  // Same 404 for "no such booking" and "not yours" — never confirm another customer's booking exists.
  if (!b || b.user_id !== req.user.id) { res.status(404).json({ error: 'Not found' }); return null }
  return b
}

app.get('/api/bookings/:id/messages', customerAuth, async (req, res) => {
  const b = await ownedBookingOr404(req, res); if (!b) return
  const q = await pool.query('SELECT id, sender, body, created FROM job_messages WHERE booking_id=$1 ORDER BY id', [b.id])
  res.json({ ok: true, messages: q.rows })
})

app.post('/api/bookings/:id/messages', customerAuth, async (req, res) => {
  const b = await ownedBookingOr404(req, res); if (!b) return
  // Readable after the job ends, but writable only while it's live — a message sent to a finished
  // job would land in an app the worker has already closed.
  if (!ACTIVE.includes(b.status)) return res.status(409).json({ ok: false, error: 'This job is no longer active' })
  const body = String(req.body?.text || '').trim().slice(0, MSG_MAX)
  if (!body) return res.status(400).json({ ok: false, error: 'text is required' })
  const q = await pool.query('INSERT INTO job_messages (booking_id, sender, body) VALUES ($1, $2, $3) RETURNING id, sender, body, created', [b.id, 'customer', body])
  publishEvent(REDIS_URL, 'job.message', { bookingId: b.id, ref: b.ref, workerId: b.worker_id || null, sender: 'customer', body })
  res.json({ ok: true, message: q.rows[0] })
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
  .catch((e) => { console.error('[dispatch] failed to start:', e.message); process.exit(1) });
