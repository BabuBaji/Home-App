// HomeHelp Worker Service
// -----------------------
// Owns worker identity/profile + a balance snapshot (account-of-record) on its own Postgres.
// Serves worker-app auth/bootstrap/profile/documents and the admin worker panel. The dispatch
// service reads worker availability/services/location from here to match jobs; the wallet
// service owns the earnings LEDGER and adjusts the balance snapshot here via /internal.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import {
  makePool, migrate, makeAdminAuth, internalOnly, tryGet, publishEvent, subscribeEvents, publishRealtime,
} from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4004)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5435/worker'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const BOOKING_URL = (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')
const WALLET_URL = (process.env.WALLET_URL || 'http://localhost:4009').replace(/\/$/, '')

process.on('unhandledRejection', (e) => console.error('[worker] unhandledRejection:', e?.message || e))

const pool = makePool(DATABASE_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS workers (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, city TEXT,
      services JSONB NOT NULL DEFAULT '[]', avatar TEXT,
      status TEXT NOT NULL DEFAULT 'active', verified BOOLEAN NOT NULL DEFAULT false,
      rating REAL NOT NULL DEFAULT 4.7, jobs INTEGER NOT NULL DEFAULT 0, earnings INTEGER NOT NULL DEFAULT 0,
      balance INTEGER NOT NULL DEFAULT 0, pending INTEGER NOT NULL DEFAULT 0, hold INTEGER NOT NULL DEFAULT 0,
      withdrawn INTEGER NOT NULL DEFAULT 0, advance_outstanding INTEGER NOT NULL DEFAULT 0,
      available BOOLEAN NOT NULL DEFAULT true, last_lat REAL, last_lng REAL,
      offered_booking INTEGER, bank_status TEXT DEFAULT 'Pending',
      profile JSONB NOT NULL DEFAULT '{}', joined TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS worker_documents (id SERIAL PRIMARY KEY, worker_id INTEGER, name TEXT, file_name TEXT, status TEXT DEFAULT 'Pending', created TIMESTAMPTZ DEFAULT now())`,
    // Columns added on top of the earlier worker schema (idempotent).
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS offered_booking INTEGER`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS bank_status TEXT DEFAULT 'Pending'`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS zone_id INTEGER`,
    // Shifts (WFM roster): a worker is "on shift" in a zone during weekly time windows.
    // weekday 0=Sun..6=Sat; start_min/end_min = minutes from midnight (IST).
    `CREATE TABLE IF NOT EXISTS shifts (
      id SERIAL PRIMARY KEY, worker_id INTEGER NOT NULL, zone_id INTEGER,
      weekday INTEGER NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS ix_shift_worker ON shifts(worker_id)`,
    // Daily attendance: one row per worker per day with check-in/out times + GPS.
    `CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY, worker_id INTEGER NOT NULL, day DATE NOT NULL,
      check_in TIMESTAMPTZ, check_out TIMESTAMPTZ,
      in_lat REAL, in_lng REAL, out_lat REAL, out_lng REAL,
      UNIQUE(worker_id, day)
    )`,
    // Shift PLANS (min-guarantee model): the named shifts a worker signs up for. A worker picks
    // one; attendance/check-in is judged against its start_min (+ grace_min); late → penalty; and
    // the day is topped up to min_g_* if job earnings fall short. Admin-editable.
    `CREATE TABLE IF NOT EXISTS shift_defs (
      id SERIAL PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL,
      start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
      grace_min INTEGER NOT NULL DEFAULT 10, penalty INTEGER NOT NULL DEFAULT 50,
      min_g_weekday INTEGER NOT NULL DEFAULT 850, min_g_weekend INTEGER NOT NULL DEFAULT 950,
      active BOOLEAN NOT NULL DEFAULT true, sort INTEGER NOT NULL DEFAULT 0
    )`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS shift_def_id INTEGER`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS shift_def_id INTEGER`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_minutes INTEGER`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS on_time BOOLEAN`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS penalty INTEGER DEFAULT 0`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS min_g INTEGER DEFAULT 0`,
    // Assigned APARTMENTS/sites (geofence): a worker is assigned an apartment for the day; the
    // app alerts if they wander beyond `radius` metres of it. Admin-managed.
    `CREATE TABLE IF NOT EXISTS worker_sites (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, address TEXT,
      lat REAL NOT NULL, lng REAL NOT NULL, radius INTEGER NOT NULL DEFAULT 300,
      active BOOLEAN NOT NULL DEFAULT true, created TIMESTAMPTZ DEFAULT now()
    )`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS site_id INTEGER`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS site_id INTEGER`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS site_name TEXT`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS site_lat REAL`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS site_lng REAL`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS geofence_m INTEGER`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS geo_outside BOOLEAN DEFAULT false`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS geo_breaches INTEGER DEFAULT 0`,
    // Leave requests (worker submits; admin/ops approves — status Pending|Approved|Rejected).
    `CREATE TABLE IF NOT EXISTS leave_requests (
      id SERIAL PRIMARY KEY, worker_id INTEGER NOT NULL,
      from_date DATE, to_date DATE, reason TEXT,
      status TEXT NOT NULL DEFAULT 'Pending', created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // Support tickets raised by the worker (ops resolves — status Open|Resolved).
    `CREATE TABLE IF NOT EXISTS support_tickets (
      id SERIAL PRIMARY KEY, worker_id INTEGER NOT NULL, subject TEXT, message TEXT,
      status TEXT NOT NULL DEFAULT 'Open', created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // Always-available demo/QA worker so a clean phone login works out-of-the-box for testing
    // (idempotent — matches on the last-10-digits of the phone, ignoring any +91/space format).
    `INSERT INTO workers (name, phone, email, city, services, status, verified, rating)
     SELECT 'Demo Partner', '9876543210', 'demo.partner@pros.homehelp.in', 'Hyderabad',
            '["Utensil Wash","Mopping","Sweeping","Dusting","Bathroom Cleaning","Laundry","Kitchen Cleaning"]'::jsonb,
            'active', true, 4.8
     WHERE NOT EXISTS (
       SELECT 1 FROM workers WHERE regexp_replace(coalesce(phone,''), '\\D', '', 'g') LIKE '%9876543210'
     )`,
  ])
  const seeded = (await pool.query('SELECT COUNT(*)::int n FROM workers')).rows[0].n
  if (!seeded) {
    // Every ACTIVE pro is qualified for the full Cleaning catalogue so any booked service matches
    // and can be push auto-assigned out of the box. These MUST equal the catalog `name`s exactly,
    // because dispatch matches (booking item name === worker service name), case-insensitively.
    const ALL_SERVICES = [
      'Sweeping & Mopping', 'Dusting Furniture', 'Dishwashing', 'Bathroom Cleaning', 'Kitchen Cleaning',
      'Laundry Washing & Folding', 'Window Cleaning', 'Fan Cleaning', 'Bed Making', 'Garbage Disposal',
      'Basic Home Organization', 'Ironing', 'Deep Cleaning', 'Refrigerator Cleaning', 'Home Sanitization',
    ]
    const W = [
      ['Rakesh Kumar', 'Cleaning,Bathroom', 'Mumbai', 'active', true, 4.9, 312, 84200],
      ['Pooja Mehta', 'Beauty,Salon', 'Delhi', 'active', true, 4.8, 221, 61500],
      ['Suresh Yadav', 'Plumbing,Electrical', 'Pune', 'active', true, 4.7, 540, 132000],
      ['Neha Gupta', 'Cleaning,Kitchen', 'Bengaluru', 'active', true, 4.9, 188, 49800],
      ['Imran Shaikh', 'AC,Appliance', 'Hyderabad', 'active', true, 4.6, 402, 158000],
      ['Vikash Pandey', 'Carpentry,Painting', 'Chennai', 'pending', false, 4.5, 12, 3200],
      ['Kavita Joshi', 'Laundry,Cleaning', 'Ahmedabad', 'active', true, 4.8, 95, 21400],
      ['Anil Verma', 'Pest Control,Gardening', 'Kolkata', 'inactive', true, 4.4, 76, 18900],
      ['Sunita Devi', 'Care,Cooking', 'Jaipur', 'active', true, 4.9, 154, 38600],
      ['Manish Tiwari', 'Plumbing,Carpentry', 'Lucknow', 'pending', false, 4.3, 5, 1100],
    ]
    const activeIds = []
    for (let i = 0; i < W.length; i++) {
      const [name, services, city, status, verified, rating, jobs, earnings] = W[i]
      const slug = name.toLowerCase().replace(/\s+/g, '.')
      // Active pros get the full catalogue; pending/inactive keep their original tags (they can't
      // take jobs anyway, so their services never need to match).
      const svc = status === 'active' ? ALL_SERVICES : services.split(',')
      const { rows } = await pool.query(
        `INSERT INTO workers (name,phone,email,city,services,status,verified,rating,jobs,earnings,balance)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [name, `+91 9${String(800000000 + i * 11111).slice(0, 9)}`, `${slug}@pros.homehelp.in`, city,
          JSON.stringify(svc), status, verified, rating, jobs, earnings, Math.round(earnings * 0.1)])
      if (status === 'active') activeIds.push(rows[0].id)
    }
    // Roster every active pro on an all-day, every-day, zone-less shift (zone_id NULL matches any
    // live zone), so push auto-assign has on-shift, online (available defaults true) supply on a
    // fresh DB. Admins can refine the roster later via /api/admin/shifts.
    for (const id of activeIds) {
      for (let d = 0; d < 7; d++) {
        await pool.query('INSERT INTO shifts (worker_id,zone_id,weekday,start_min,end_min) VALUES ($1,NULL,$2,0,1439)', [id, d])
      }
    }
    console.log(`[worker] seeded ${W.length} workers + all-day shifts for ${activeIds.length} active pros`)
  }
  // Seed the 3 selectable shift PLANS once (8h each, spanning 05:00–22:00). Admin can edit these.
  if (!(await pool.query('SELECT COUNT(*)::int n FROM shift_defs')).rows[0].n) {
    const S = [
      ['morning', 'Morning', 300, 780, 1],    // 05:00 – 13:00
      ['afternoon', 'Afternoon', 720, 1200, 2], // 12:00 – 20:00
      ['evening', 'Evening', 840, 1320, 3],    // 14:00 – 22:00
    ]
    for (const [code, name, sm, em, sort] of S)
      await pool.query('INSERT INTO shift_defs (code,name,start_min,end_min,sort) VALUES ($1,$2,$3,$4,$5)', [code, name, sm, em, sort])
    console.log('[worker] seeded 3 shift plans (Morning/Afternoon/Evening)')
  }
  // Seed a couple of sample apartments (geofence sites, 300 m) — admin can add/edit more.
  if (!(await pool.query('SELECT COUNT(*)::int n FROM worker_sites')).rows[0].n) {
    const A = [
      ['Brigade Citadel', 'Moosapet, Hyderabad', 17.4517, 78.4308, 300],
      ['My Home Avatar', 'Narsingi, Hyderabad', 17.3936, 78.3711, 300],
      ['Aparna Sarovar', 'Nallagandla, Hyderabad', 17.4720, 78.3050, 300],
    ]
    for (const [name, addr, lat, lng, r] of A)
      await pool.query('INSERT INTO worker_sites (name,address,lat,lng,radius) VALUES ($1,$2,$3,$4,$5)', [name, addr, lat, lng, r])
    console.log('[worker] seeded 3 sample apartments (geofence sites)')
  }
  console.log('[worker] Postgres ready (workers, worker_documents)')
}

/* ---------- helpers ---------- */
const rowToWorker = (w) => w && ({ ...w, verified: !!w.verified, available: !!w.available })
const workerDto = (w) => w && ({ id: w.id, name: w.name, phone: w.phone, email: w.email, city: w.city, services: w.services, avatar: w.avatar, status: w.status, verified: !!w.verified, rating: w.rating, jobs: w.jobs, available: !!w.available, bankStatus: w.bank_status, ...(w.profile || {}) })
const walletDto = (w) => ({ balance: w.balance, pending: w.pending, hold: w.hold, withdrawn: w.withdrawn, advanceOutstanding: w.advance_outstanding, earnings: w.earnings })
const walletSummary = (w) => ({ available: w.balance, pending: w.pending, onHold: w.hold, totalEarned: w.earnings, withdrawn: w.withdrawn, advanceOutstanding: w.advance_outstanding })
// Real period earnings for the wallet/earnings dashboard: the worker's 80% share of jobs
// COMPLETED today / in the last 7 days / this calendar month, in IST. Field names match the
// worker app's WalletSummaryDto (todayEarnings/weekEarnings/monthEarnings) so they render live.
function periodEarnings(bookings) {
  const shareOf = (b) => Math.round((b.total || 0) * 0.8)
  const istDay = (d) => { try { return new Date(new Date(d).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) } catch { return '' } }
  const nowIstMs = Date.now() + 5.5 * 3600 * 1000
  const todayStr = new Date(nowIstMs).toISOString().slice(0, 10)
  const monthStr = todayStr.slice(0, 7)
  const weekAgoStr = new Date(nowIstMs - 6 * 86400 * 1000).toISOString().slice(0, 10)
  let todayEarnings = 0, weekEarnings = 0, monthEarnings = 0, todayCompleted = 0, todayJobs = 0
  for (const b of bookings || []) {
    // Today's job count = everything scheduled/created today that wasn't cancelled.
    if (istDay(b.date || b.created) === todayStr && b.status !== 'cancelled') todayJobs++
    if (b.status !== 'completed') continue
    const day = istDay(b.completed_at || b.created)
    if (!day) continue
    const amt = shareOf(b)
    if (day === todayStr) { todayEarnings += amt; todayCompleted++ }
    if (day >= weekAgoStr) weekEarnings += amt
    if (day.startsWith(monthStr)) monthEarnings += amt
  }
  return { todayEarnings, weekEarnings, monthEarnings, todayCompleted, todayJobs }
}
// IST calendar date (YYYY-MM-DD) and 12-hour clock label for a timestamp — used by Today's Schedule.
const istDateStr = (d) => { try { return new Date(new Date(d).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) } catch { return '' } }
const istClock = (d) => { try { const t = new Date(new Date(d).getTime() + 5.5 * 3600 * 1000); let h = t.getUTCHours(); const m = String(t.getUTCMinutes()).padStart(2, '0'); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${m} ${ap}` } catch { return '' } }
// Build Today's Schedule timeline from the worker's non-cancelled jobs dated today, in order.
function todaySchedule(bookings, custNames) {
  const today = istDateStr(Date.now())
  const inProgress = ['worker_assigned', 'on_the_way', 'arrived', 'in_progress']
  return (bookings || [])
    .filter((b) => b.status !== 'cancelled' && istDateStr(b.date || b.created) === today)
    .sort((a, b) => new Date(a.created) - new Date(b.created))
    .map((b) => ({
      time: b.time || istClock(b.created),
      service: (b.items || []).map((i) => i.name).join(', ') || 'Service',
      location: b.address || '—',
      durationMins: bookingDurationMinutes(b),
      customerName: (custNames && custNames[b.user_id]) || 'Customer',
      paymentStatus: b.payment_status === 'paid' ? 'Paid' : (String(b.payment || '').toLowerCase() === 'cash' ? 'Cash' : 'Pending'),
      status: b.status === 'completed' ? 'Completed' : (inProgress.includes(b.status) ? 'In progress' : 'Upcoming'),
    }))
}
async function getWorker(id) { if (!Number.isFinite(id)) return null; const { rows } = await pool.query('SELECT * FROM workers WHERE id=$1', [id]); return rows[0] || null }
// If the same phone maps to more than one worker (e.g. a stray pending placeholder alongside a
// real onboarded pro), prefer the active + verified account so login isn't shadowed by the dupe.
// Match by the last 10 digits, ignoring formatting (+91, spaces, dashes) on BOTH sides, so a
// bare 10-digit app login lines up with a stored "+91 98xxxxxxxx". Prefer active + verified.
async function getByPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10)
  if (digits.length < 10) return null
  const { rows } = await pool.query(
    "SELECT * FROM workers WHERE right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 10)=$1 ORDER BY (status='active') DESC, verified DESC, id DESC",
    [digits])
  return rows[0] || null
}
const serviceSet = (w) => new Set((w.services || []).map((s) => String(s).toLowerCase().trim()))

/* ---------- shifts / roster (WFM) ---------- */
// Current IST weekday + minutes-from-midnight (the settings timezone is GMT+5:30).
function istNow() { const d = new Date(Date.now() + 5.5 * 3600 * 1000); return { weekday: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() } }
const onShiftNow = (rows) => { const { weekday, minutes } = istNow(); return rows.some((s) => s.weekday === weekday && s.start_min <= minutes && minutes < s.end_min) }
const toMin = (t) => { const [h, m] = String(t || '').split(':').map(Number); return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0) }
const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

// ---- shift plans (min-guarantee) ----
const isWeekend = (weekday) => weekday === 0 || weekday === 6
// App DTO for a shift plan; minGuarantee resolves to weekday/weekend rate for the given day.
const shiftDefDto = (s, weekday) => ({
  id: s.id, code: s.code, name: s.name,
  start: toHHMM(s.start_min), end: toHHMM(s.end_min),
  hours: Math.round((s.end_min - s.start_min) / 60),
  graceMin: s.grace_min, penalty: s.penalty,
  minGuarantee: isWeekend(weekday) ? s.min_g_weekend : s.min_g_weekday,
})
const getShiftDef = async (id) => (id ? (await pool.query('SELECT * FROM shift_defs WHERE id=$1', [id])).rows[0] || null : null)

// ---- geofence (assigned apartment) ----
const getSite = async (id) => (id ? (await pool.query('SELECT * FROM worker_sites WHERE id=$1', [id])).rows[0] || null : null)
// Great-circle distance in METRES between two lat/lng points (Haversine).
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}
async function shiftsByWorker() {
  const rows = (await pool.query('SELECT worker_id, weekday, start_min, end_min FROM shifts')).rows
  const by = {}; for (const s of rows) (by[s.worker_id] ||= []).push(s); return by
}

async function listWorkers({ status, city, q } = {}) {
  let rows = (await pool.query('SELECT * FROM workers ORDER BY id DESC')).rows.map(rowToWorker)
  const by = await shiftsByWorker()
  rows = rows.map((w) => ({ ...w, on_shift: onShiftNow(by[w.id] || []) }))
  if (status && status !== 'all') rows = rows.filter((w) => w.status === status)
  if (city && city !== 'all') rows = rows.filter((w) => w.city === city)
  if (q) { const s = q.toLowerCase(); rows = rows.filter((w) => w.name.toLowerCase().includes(s) || (w.phone || '').includes(s) || (w.email || '').toLowerCase().includes(s)) }
  return rows
}
async function workerStats() {
  const all = (await pool.query('SELECT status FROM workers')).rows
  return { total: all.length, active: all.filter((w) => w.status === 'active').length, pending: all.filter((w) => w.status === 'pending').length, inactive: all.filter((w) => w.status === 'inactive' || w.status === 'suspended').length }
}
async function documents(wid) { return (await pool.query('SELECT * FROM worker_documents WHERE worker_id=$1 ORDER BY id DESC', [wid])).rows }
async function mergeProfile(wid, patch) {
  const w = await getWorker(wid)
  const profile = { ...(w.profile || {}), ...patch }
  await pool.query('UPDATE workers SET profile=$1::jsonb WHERE id=$2', [JSON.stringify(profile), wid])
  return getWorker(wid)
}

// Booked service length in minutes — mirrors the dispatch service so the restored (post-relaunch)
// timer matches the live one. Prefer the item's durationId, else parse the label.
const DUR_MIN = { '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }
function bookingDurationMinutes(b) {
  const id = b?.items?.[0]?.durationId
  if (id && DUR_MIN[id]) return DUR_MIN[id]
  const s = String(b?.duration || '')
  const n = parseInt(s, 10)
  if (!n) return 60
  return /h/i.test(s) && !/min/i.test(s) ? n * 60 : n
}

// Worker-app bootstrap aggregates identity (local) + jobs/history (booking svc) + wallet (local snapshot).
async function bootstrap(wid) {
  const w = await getWorker(wid)
  const mine = await tryGet(BOOKING_URL, `/api/internal/bookings?worker_id=${wid}`, [])
  const active = mine.find((b) => ['worker_assigned', 'on_the_way', 'arrived', 'in_progress'].includes(b.status)) || null
  const STATUS_TO_ENUM = { worker_assigned: 'ACCEPTED', on_the_way: 'ON_THE_WAY', arrived: 'ARRIVED', in_progress: 'IN_PROGRESS', completed: 'COMPLETED' }
  // Resolve customer names once per unique user (the worker app's Booking card shows them).
  const uids = [...new Set(mine.map((b) => b.user_id).filter(Boolean))]
  const custNames = {}, custPhones = {}
  await Promise.all(uids.map(async (id) => {
    const u = await tryGet(AUTH_URL, `/api/internal/users/${id}`, null)
    if (u?.user?.name) custNames[id] = u.user.name
    if (u?.user?.phone) custPhones[id] = u.user.phone
  }))
  // Every field the worker app's Booking model requires is non-null here — the Compose UI treats
  // them as non-null String, and a missing key would deserialize to null and crash the Bookings tab.
  const bookingDto = (b) => ({
    ref: b.ref,
    service: (b.items || []).map((i) => i.name).join(', ') || 'Service',
    customerName: custNames[b.user_id] || 'Customer',
    address: b.address || '—',
    timeInfo: [b.date, b.time].filter(Boolean).join(' • ') || (b.created ? new Date(b.created).toLocaleDateString('en-IN') : ''),
    amount: Math.round((b.total || 0) * 0.8),
    status: b.status === 'completed' ? 'Completed' : b.status === 'cancelled' ? 'Cancelled' : 'Upcoming',
  })
  // Prefer the wallet service's real ledger summary (balance from actual completed services);
  // fall back to the local snapshot only if the wallet service is unreachable.
  const wsum = await tryGet(WALLET_URL, `/internal/summary/${wid}`, null)
  const pe = periodEarnings(mine)
  const walletSummaryOut = wsum ? { ...wsum, todayJobs: pe.todayJobs, todayCompleted: pe.todayCompleted } : { ...walletSummary(w), ...pe }
  return {
    worker: workerDto(w), wallet: walletDto(w), walletSummary: walletSummaryOut,
    jobStatus: active ? (STATUS_TO_ENUM[active.status] || 'NONE') : 'NONE',
    // Full activeJob so the worker app's (non-null) Job model never deserializes a null field —
    // a missing key here NPE-crashes the In-Progress / Job screens.
    activeJob: active ? (() => {
      const nm = custNames[active.user_id] || 'Customer'
      const initials = (nm.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('') || 'C').toUpperCase()
      const addr = active.address || '—'
      return {
        id: active.ref || `#${active.id}`, bookingId: active.id,
        customerName: nm, initials, customerPhone: custPhones[active.user_id] || '',
        customerRating: 5.0,
        services: (active.items || []).map((i) => i.name),
        dateTime: [active.date, active.time].filter(Boolean).join(', ') || istClock(active.created),
        durationHours: Math.max(1, Math.round(bookingDurationMinutes(active) / 60)),
        durationMinutes: bookingDurationMinutes(active),
        address: addr, area: addr, distanceKm: 0,
        earnings: Math.round((active.total || 0) * 0.8),
        otp: active.service_otp || '',
        lat: active.cust_lat || 0, lng: active.cust_lng || 0,
        startedAt: active.started_at, completedAt: active.completed_at,
      }
    })() : null,
    bookings: mine.map(bookingDto),
    schedule: todaySchedule(mine, custNames),
    attendance: await attendanceToday(wid),
    shift: await shiftPlans(wid),
    leaves: await leaveList(wid),
    tickets: await ticketList(wid),
    documents: await documents(wid),
  }
}

// Today's attendance snapshot for a worker (check-in/out times + derived status + shift plan).
async function attendanceToday(wid) {
  const day = istDateStr(Date.now())
  const { rows } = await pool.query('SELECT * FROM attendance WHERE worker_id=$1 AND day=$2', [wid, day])
  const r = rows[0]
  const checkedIn = !!(r && r.check_in)
  const checkedOut = !!(r && r.check_out)
  const w = await getWorker(wid)
  const sd = await getShiftDef(w?.shift_def_id)
  const { weekday } = istNow()
  // How many days the worker has attended (checked in) this IST calendar month.
  const attendedThisMonth = (await pool.query(
    "SELECT COUNT(*)::int n FROM attendance WHERE worker_id=$1 AND check_in IS NOT NULL AND day >= date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date)",
    [wid])).rows[0].n
  // Assigned apartment (geofence): while checked in use the day's snapshot; otherwise show the
  // admin-assigned site so the worker knows where they'll be posted.
  const assigned = await getSite(w?.site_id)
  const geoActive = checkedIn && r && r.site_lat != null
  return {
    checkedIn, checkedOut,
    attendedThisMonth,
    // Assigned apartment + geofence.
    siteName: (r && r.site_name) || assigned?.name || '',
    siteAddress: assigned?.address || '',
    siteLat: (r && r.site_lat != null ? r.site_lat : assigned?.lat) ?? null,
    siteLng: (r && r.site_lng != null ? r.site_lng : assigned?.lng) ?? null,
    geofenceM: (r && r.geofence_m) || assigned?.radius || 300,
    geoActive: !!geoActive,
    geoOutside: !!(r && r.geo_outside),
    geoBreaches: (r && r.geo_breaches) || 0,
    checkInAt: r && r.check_in ? istClock(r.check_in) : '',
    checkOutAt: r && r.check_out ? istClock(r.check_out) : '',
    status: checkedOut ? 'Checked out' : (checkedIn ? 'Checked in' : 'Not checked in'),
    // Shift plan the worker signed up for + today's on-time / penalty / guarantee status.
    shiftId: sd ? sd.id : null,
    shiftName: sd ? sd.name : '',
    shiftStart: sd ? toHHMM(sd.start_min) : '',
    shiftEnd: sd ? toHHMM(sd.end_min) : '',
    graceMin: sd ? sd.grace_min : 0,
    onTime: r && r.on_time != null ? !!r.on_time : true,
    lateMinutes: r && r.late_minutes ? r.late_minutes : 0,
    penalty: r && r.penalty ? r.penalty : 0,
    minGuarantee: sd ? (isWeekend(weekday) ? sd.min_g_weekend : sd.min_g_weekday) : 0,
  }
}

// The selectable shift plans + which one this worker picked (for the app's shift picker).
async function shiftPlans(wid) {
  const { weekday } = istNow()
  const { rows } = await pool.query('SELECT * FROM shift_defs WHERE active=true ORDER BY sort, start_min')
  const w = await getWorker(wid)
  return { selectedId: w?.shift_def_id || null, shifts: rows.map((s) => shiftDefDto(s, weekday)) }
}

// A worker's support tickets, newest first.
async function ticketList(wid) {
  const { rows } = await pool.query('SELECT id, subject, message, status, created FROM support_tickets WHERE worker_id=$1 ORDER BY id DESC', [wid])
  return rows.map((r) => ({ id: r.id, subject: r.subject || '', message: r.message || '', status: r.status, created: r.created ? new Date(r.created).toISOString().slice(0, 10) : '' }))
}

// A worker's leave requests, newest first.
async function leaveList(wid) {
  const { rows } = await pool.query('SELECT id, from_date, to_date, reason, status FROM leave_requests WHERE worker_id=$1 ORDER BY id DESC', [wid])
  const d = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '')
  return rows.map((r) => ({ id: r.id, fromDate: d(r.from_date), toDate: d(r.to_date), reason: r.reason || '', status: r.status }))
}

const app = express()
app.use(express.json({ limit: '6mb' }))
app.get('/health', (_q, res) => res.json({ service: 'worker', ok: true }))

/* ---------- worker-app auth ---------- */
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const id = token.startsWith('worker-') ? Number(token.slice(7)) : NaN
  if (!Number.isFinite(id)) return res.status(401).json({ ok: false, error: 'Not authenticated' })
  getWorker(id).then((w) => { if (!w) return res.status(401).json({ ok: false, error: 'Not authenticated' }); req.worker = w; next() })
}

const WORKER_DEV_OTP = process.env.WORKER_DEV_OTP || '1234'
app.post('/api/worker/auth/request-otp', (req, res) => res.json({ ok: true, devOtp: WORKER_DEV_OTP, message: `OTP sent to ${req.body?.phone || ''}` }))
app.post('/api/worker/auth/verify', async (req, res) => {
  const { phone, otp } = req.body || {}
  if (!otp || String(otp).length < 4) return res.status(400).json({ ok: false, error: 'Invalid OTP' })
  const w = await getByPhone(phone)
  if (!w) return res.status(403).json({ ok: false, error: 'This number is not registered. Please contact the admin to onboard you.' })
  if (w.status !== 'active') return res.status(403).json({ ok: false, error: `Your account is ${w.status}. Please ask the admin to activate it.` })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: w.id, actorName: w.name, action: 'worker.login', entityType: 'worker', entityId: w.id, detail: `Worker signed in (${phone || ''})` })
  res.json({ ok: true, token: 'worker-' + w.id, ...(await bootstrap(w.id)) })
})
app.get('/api/worker/bootstrap', auth, async (req, res) => res.json(await bootstrap(req.worker.id)))

/* ---------- profile / documents ---------- */
app.put('/api/worker/profile', auth, async (req, res) => { const b = req.body || {}; await pool.query('UPDATE workers SET name=COALESCE($1,name), email=COALESCE($2,email), city=COALESCE($3,city), avatar=COALESCE($4,avatar) WHERE id=$5', [b.name ?? null, b.email ?? null, b.city ?? null, b.avatar ?? null, req.worker.id]); res.json(workerDto(await getWorker(req.worker.id))) })
app.put('/api/worker/bank', auth, async (req, res) => { await mergeProfile(req.worker.id, { bank: req.body || {} }); await pool.query("UPDATE workers SET bank_status='Pending' WHERE id=$1", [req.worker.id]); publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'kyc.bank', entityType: 'worker', entityId: req.worker.id, detail: 'Updated bank / payout details (pending verification)' }); res.json(workerDto(await getWorker(req.worker.id))) })
app.put('/api/worker/availability', auth, async (req, res) => { if (req.body?.available !== undefined) await pool.query('UPDATE workers SET available=$1 WHERE id=$2', [!!req.body.available, req.worker.id]); await mergeProfile(req.worker.id, { availability: req.body || {} }); res.json(workerDto(await getWorker(req.worker.id))) })

/* ---------- shift plans (min-guarantee) ---------- */
app.get('/api/worker/shifts', auth, async (req, res) => {
  const { weekday } = istNow()
  const { rows } = await pool.query('SELECT * FROM shift_defs WHERE active=true ORDER BY sort, start_min')
  const w = await getWorker(req.worker.id)
  res.json({ selectedId: w?.shift_def_id || null, shifts: rows.map((s) => shiftDefDto(s, weekday)) })
})
app.post('/api/worker/shift', auth, async (req, res) => {
  const id = Number(req.body?.shiftId) || null
  await pool.query('UPDATE workers SET shift_def_id=$1 WHERE id=$2', [id, req.worker.id])
  const sd = await getShiftDef(id)
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, action: 'shift.select', entityType: 'worker', entityId: req.worker.id, detail: `Chose ${sd ? sd.name + ' shift' : 'no shift'}` })
  res.json(await attendanceToday(req.worker.id))
})

/* ---------- attendance (check-in / check-out) ---------- */
app.post('/api/worker/attendance/checkin', auth, async (req, res) => {
  const b = req.body || {}, day = istDateStr(Date.now())
  // Judge the check-in against the worker's chosen shift: on-time within grace, else a penalty.
  const w = await getWorker(req.worker.id)
  const sd = await getShiftDef(w?.shift_def_id)
  const { weekday, minutes } = istNow()
  const minG = sd ? (isWeekend(weekday) ? sd.min_g_weekend : sd.min_g_weekday) : 0
  let lateMin = 0, onTime = true, penalty = 0
  if (sd) {
    lateMin = Math.max(0, minutes - sd.start_min)
    if (minutes - sd.start_min > sd.grace_min) { onTime = false; penalty = sd.penalty }
  }
  // Assign the day's APARTMENT/geofence: the worker's admin-assigned site if set, else the
  // check-in location becomes the centre. The worker must stay within `geofence_m` metres.
  const site = await getSite(w?.site_id)
  const siteLat = site ? site.lat : (b.lat ?? null)
  const siteLng = site ? site.lng : (b.lng ?? null)
  const geofenceM = site ? site.radius : 300
  const siteName = site ? site.name : (b.lat != null ? 'Check-in area' : '')
  // Apply shift rules only on the FIRST check-in of the day (never re-penalize a re-tap).
  const existing = (await pool.query('SELECT check_in FROM attendance WHERE worker_id=$1 AND day=$2', [req.worker.id, day])).rows[0]
  const firstCheckin = !existing?.check_in
  await pool.query(
    `INSERT INTO attendance (worker_id, day, check_in, in_lat, in_lng, shift_def_id, late_minutes, on_time, penalty, min_g,
       site_id, site_name, site_lat, site_lng, geofence_m, geo_outside, geo_breaches)
     VALUES ($1,$2,now(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false,0)
     ON CONFLICT (worker_id, day) DO UPDATE SET check_in = COALESCE(attendance.check_in, now()),
       in_lat = COALESCE(attendance.in_lat, $3), in_lng = COALESCE(attendance.in_lng, $4)`,
    [req.worker.id, day, b.lat ?? null, b.lng ?? null, sd?.id ?? null, lateMin, onTime, firstCheckin ? penalty : 0, minG,
      site?.id ?? null, siteName, siteLat, siteLng, geofenceM])
  if (firstCheckin && penalty > 0) {
    // Wallet service owns the ledger — it deducts the penalty on this event.
    publishEvent(REDIS_URL, 'shift.late', { workerId: req.worker.id, amount: penalty, shiftName: sd.name, lateMinutes: lateMin })
  }
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, action: 'attendance.checkin', entityType: 'worker', entityId: req.worker.id, detail: onTime ? 'Checked in (on time)' : `Checked in ${lateMin} min late — ₹${penalty} penalty` })
  res.json(await attendanceToday(req.worker.id))
})
app.post('/api/worker/attendance/checkout', auth, async (req, res) => {
  const b = req.body || {}, day = istDateStr(Date.now())
  await pool.query('UPDATE attendance SET check_out=now(), out_lat=$2, out_lng=$3 WHERE worker_id=$1 AND day=$4',
    [req.worker.id, b.lat ?? null, b.lng ?? null, day])
  // On checkout, settle the shift's minimum guarantee (wallet tops up if the day fell short).
  const att = (await pool.query('SELECT min_g FROM attendance WHERE worker_id=$1 AND day=$2', [req.worker.id, day])).rows[0]
  if (att?.min_g > 0) publishEvent(REDIS_URL, 'shift.settle', { workerId: req.worker.id, minG: att.min_g, day })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, action: 'attendance.checkout', entityType: 'worker', entityId: req.worker.id, detail: 'Checked out' })
  res.json(await attendanceToday(req.worker.id))
})

/* ---------- geofence (assigned-apartment radius) ---------- */
// The app reports the worker's live location; we return whether they're inside their assigned
// apartment's radius. Edge-triggered: the FIRST time they leave, fire an alert (notification +
// activity); returning inside re-arms it. Only active once checked in with a site.
app.post('/api/worker/geofence/report', auth, async (req, res) => {
  const { lat, lng } = req.body || {}
  const day = istDateStr(Date.now())
  const a = (await pool.query('SELECT * FROM attendance WHERE worker_id=$1 AND day=$2', [req.worker.id, day])).rows[0]
  if (!a || !a.check_in || a.site_lat == null || a.site_lng == null || lat == null || lng == null) {
    return res.json({ active: false, inside: true, distance: 0, radius: a?.geofence_m || 0, siteName: a?.site_name || '', breaches: a?.geo_breaches || 0 })
  }
  const radius = a.geofence_m || 300
  const distance = Math.round(distanceM(a.site_lat, a.site_lng, lat, lng))
  const inside = distance <= radius
  let breached = false
  if (!inside && !a.geo_outside) {
    // Rising edge: worker just left the assigned area → alert.
    breached = true
    await pool.query('UPDATE attendance SET geo_outside=true, geo_breaches=geo_breaches+1 WHERE id=$1', [a.id])
    publishEvent(REDIS_URL, 'geofence.breach', { workerId: req.worker.id, siteName: a.site_name || 'your assigned area', distance, radius })
    publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Geofence', action: 'geofence.breach', entityType: 'worker', entityId: req.worker.id, detail: `Left ${a.site_name || 'assigned area'} — ${distance} m away (limit ${radius} m)` })
  } else if (inside && a.geo_outside) {
    await pool.query('UPDATE attendance SET geo_outside=false WHERE id=$1', [a.id])
  }
  res.json({ active: true, inside, distance, radius, siteName: a.site_name || '', breaches: (a.geo_breaches || 0) + (breached ? 1 : 0), justBreached: breached })
})

/* ---------- availability state (Available | Busy | Break | Offline | Leave) ---------- */
// Only 'Available' workers are online for job matching (available=true drives auto-assign/pull).
app.post('/api/worker/status', auth, async (req, res) => {
  const state = String(req.body?.state || 'Offline')
  await pool.query('UPDATE workers SET available=$1 WHERE id=$2', [state === 'Available', req.worker.id])
  await mergeProfile(req.worker.id, { availabilityState: state })
  res.json(workerDto(await getWorker(req.worker.id)))
})

/* ---------- leave requests ---------- */
app.get('/api/worker/leave', auth, async (req, res) => res.json(await leaveList(req.worker.id)))
app.post('/api/worker/leave', auth, async (req, res) => {
  const b = req.body || {}
  await pool.query('INSERT INTO leave_requests (worker_id, from_date, to_date, reason) VALUES ($1,$2,$3,$4)',
    [req.worker.id, b.fromDate || null, b.toDate || b.fromDate || null, b.reason || ''])
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, action: 'leave.request', entityType: 'worker', entityId: req.worker.id, detail: `Requested leave ${b.fromDate || ''}` })
  res.json(await leaveList(req.worker.id))
})

/* ---------- support tickets + SOS ---------- */
app.get('/api/worker/support', auth, async (req, res) => res.json(await ticketList(req.worker.id)))
app.post('/api/worker/support', auth, async (req, res) => {
  const b = req.body || {}
  await pool.query('INSERT INTO support_tickets (worker_id, subject, message) VALUES ($1,$2,$3)', [req.worker.id, b.subject || 'Support request', b.message || ''])
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, action: 'support.ticket', entityType: 'worker', entityId: req.worker.id, detail: `Raised a ticket: ${b.subject || ''}` })
  res.json(await ticketList(req.worker.id))
})
// SOS — emergency alert. Broadcasts to ops (activity monitor) with the worker's live location.
app.post('/api/worker/sos', auth, async (req, res) => {
  const b = req.body || {}
  const w = await getWorker(req.worker.id)
  const loc = (b.lat != null && b.lng != null) ? ` @ ${b.lat},${b.lng}` : ''
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: w?.name, action: 'sos', entityType: 'worker', entityId: req.worker.id, detail: `🆘 SOS raised${loc}`, meta: { lat: b.lat ?? null, lng: b.lng ?? null } })
  // Real-time push to the admin control tower (siren + alert modal in the admin panel).
  publishRealtime(REDIS_URL, 'admin', 'sos', {
    workerId: req.worker.id, workerName: w?.name || `Worker #${req.worker.id}`, phone: w?.phone || '',
    lat: b.lat ?? null, lng: b.lng ?? null, at: new Date().toISOString(),
  })
  res.json({ ok: true, message: 'Help is on the way. Our team has been alerted.' })
})

/* ---------- Refer & Earn ---------- */
const REFERRAL_BONUS = Number(process.env.REFERRAL_BONUS || 1500)
const referralCode = (w) => `HHP${String(1000 + Number(w.id))}`
app.get('/api/worker/referral', auth, async (req, res) => {
  const w = req.worker
  const code = referralCode(w)
  // Referrals credited as wallet income of category 'Referral' (kept in the wallet ledger).
  const lifetime = await tryGet(WALLET_URL, `/internal/referral-total/${w.id}`, { total: 0, items: [] })
  res.json({
    code,
    bonus: REFERRAL_BONUS,
    lifetimeEarnings: lifetime.total || 0,
    referrals: lifetime.items || [],
    shareMessage: `Join me as a HomeHelp Pro! Use my referral code ${code} when you sign up and we both earn ₹${REFERRAL_BONUS}. Download: https://homehelp.in/pro`,
  })
})

/* ---------- Claim Insurance / Health Card ---------- */
app.get('/api/worker/insurance', auth, async (req, res) => {
  const w = req.worker
  const activated = !!(w.profile && w.profile.insurance_activated)
  res.json({
    activated,
    coverage: '₹2,00,000 accidental cover + ₹50,000 hospitalisation',
    policyNo: activated ? `HH-INS-${1000 + Number(w.id)}` : '',
    helpline: '1800-123-4567',
  })
})
app.post('/api/worker/insurance/claim', auth, async (req, res) => {
  const b = req.body || {}
  await pool.query('INSERT INTO support_tickets (worker_id, subject, message) VALUES ($1,$2,$3)', [req.worker.id, 'Insurance claim', b.reason || b.message || 'Insurance claim request'])
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'insurance.claim', entityType: 'worker', entityId: req.worker.id, detail: `Raised an insurance claim: ${b.reason || ''}` })
  res.json({ ok: true, message: 'Claim submitted. Our team will contact you within 24 hours.' })
})

/* ---------- Merch Store ---------- */
const MERCH = [
  { id: 'tshirt', name: 'Branded T-Shirt', emoji: '👕', price: 299, desc: 'Official HomeHelp Pro tee' },
  { id: 'cap', name: 'Cap', emoji: '🧢', price: 149, desc: 'Sun-protection cap' },
  { id: 'bag', name: 'Kit Bag', emoji: '🎒', price: 499, desc: 'Carry your supplies' },
  { id: 'apron', name: 'Work Apron', emoji: '🦺', price: 249, desc: 'Durable service apron' },
  { id: 'shoes', name: 'Safety Shoes', emoji: '👟', price: 899, desc: 'Anti-slip work shoes' },
  { id: 'bottle', name: 'Water Bottle', emoji: '🧴', price: 199, desc: 'Insulated 1L bottle' },
]
app.get('/api/worker/merch', auth, (_req, res) => res.json({ products: MERCH }))
app.post('/api/worker/merch/order', auth, async (req, res) => {
  const p = MERCH.find((m) => m.id === (req.body || {}).productId)
  if (!p) return res.json({ ok: false, error: 'Product not found' })
  await pool.query('INSERT INTO support_tickets (worker_id, subject, message) VALUES ($1,$2,$3)', [req.worker.id, 'Merch order', `Ordered ${p.name} (₹${p.price})`])
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'merch.order', entityType: 'worker', entityId: req.worker.id, detail: `Ordered merch: ${p.name} (₹${p.price})`, meta: { amount: p.price } })
  res.json({ ok: true, message: `Order placed for ${p.name}. Cost is deducted from your next payout.` })
})

/* ---------- Shakti Bonus (monthly performance bonus, mapped to our per-job model) ---------- */
// "Sitara Bonus" — monthly bonus based on WORKING DAYS + rating (Gold also needs Sundays worked).
// Bronze 25 days · Silver 27 days · Gold 28 days incl. 4 Sundays. All require ≥ rating gate.
const SHAKTI = [
  { name: 'Bronze', amount: Number(process.env.SHAKTI_BRONZE || 3500), days: Number(process.env.SHAKTI_BRONZE_DAYS || 25), sundays: Number(process.env.SHAKTI_BRONZE_SUNDAYS || 0) },
  { name: 'Silver', amount: Number(process.env.SHAKTI_SILVER || 4500), days: Number(process.env.SHAKTI_SILVER_DAYS || 27), sundays: Number(process.env.SHAKTI_SILVER_SUNDAYS || 0) },
  { name: 'Gold', amount: Number(process.env.SHAKTI_GOLD || 5500), days: Number(process.env.SHAKTI_GOLD_DAYS || 28), sundays: Number(process.env.SHAKTI_GOLD_SUNDAYS || 4) },
]
const SHAKTI_RATING = Number(process.env.SHAKTI_RATING || 4.5)

// Distinct working (checked-in) days + Sundays worked in [start,end); highest tier reached.
async function computeShakti(wid, rating, start, end) {
  const s = start.toISOString().slice(0, 10), e = end.toISOString().slice(0, 10)
  const wd = (await pool.query(
    'SELECT COUNT(*)::int n FROM attendance WHERE worker_id=$1 AND check_in IS NOT NULL AND day >= $2 AND day < $3',
    [wid, s, e])).rows[0].n
  const su = (await pool.query(
    'SELECT COUNT(*)::int n FROM attendance WHERE worker_id=$1 AND check_in IS NOT NULL AND day >= $2 AND day < $3 AND EXTRACT(DOW FROM day) = 0',
    [wid, s, e])).rows[0].n
  let currentIdx = -1
  for (let i = 0; i < SHAKTI.length; i++) if (wd >= SHAKTI[i].days && su >= SHAKTI[i].sundays && rating >= SHAKTI_RATING) currentIdx = i
  return { workingDays: wd, sundays: su, currentIdx }
}

app.get('/api/worker/shakti-bonus', auth, async (req, res) => {
  const w = req.worker
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const rating = Number(w.rating || 0)
  const { workingDays, sundays, currentIdx } = await computeShakti(w.id, rating, start, end)
  const next = currentIdx + 1 < SHAKTI.length ? SHAKTI[currentIdx + 1] : null
  res.json({
    tiers: SHAKTI,
    workingDays,
    sundays,
    rating,
    ratingTarget: SHAKTI_RATING,
    ratingMet: rating >= SHAKTI_RATING,
    currentTier: currentIdx >= 0 ? SHAKTI[currentIdx].name : '',
    nextTier: next ? next.name : '',
    daysToNext: next ? Math.max(0, next.days - workingDays) : 0,
    sundaysToNext: next ? Math.max(0, next.sundays - sundays) : 0,
    lastUpdated: now.toISOString().slice(0, 10),
  })
})

// Month-end settlement: for each worker who met a Shakti tier that month (jobs + rating),
// publish a shakti.bonus event; the wallet service credits it idempotently (once per month).
async function settleShaktiForMonth(y, m) {
  const monthStr = `${y}-${String(m + 1).padStart(2, '0')}`
  const start = new Date(y, m, 1), end = new Date(y, m + 1, 1)
  const { rows: workers } = await pool.query('SELECT id, rating FROM workers')
  let paid = 0
  for (const w of workers) {
    const rating = Number(w.rating || 0)
    if (rating < SHAKTI_RATING) continue
    const { currentIdx } = await computeShakti(w.id, rating, start, end)
    if (currentIdx < 0) continue
    const tier = SHAKTI[currentIdx]
    publishEvent(REDIS_URL, 'shakti.bonus', { workerId: w.id, amount: tier.amount, tier: tier.name, month: monthStr })
    paid++
  }
  console.log(`[worker] shakti settlement ${monthStr}: ${paid} worker(s) qualified`)
  return { month: monthStr, qualified: paid }
}

// Manual trigger (admin/testing). Body { month:'YYYY-MM' } — defaults to the current month.
app.post('/internal/shakti/settle', internalOnly, async (req, res) => {
  let y, m
  const mth = req.body?.month
  if (mth && /^\d{4}-\d{2}$/.test(mth)) { const [yy, mm] = mth.split('-').map(Number); y = yy; m = mm - 1 }
  else { const n = new Date(); y = n.getFullYear(); m = n.getMonth() }
  res.json({ ok: true, ...(await settleShaftiSafe(y, m)) })
})
const settleShaftiSafe = (y, m) => settleShaktiForMonth(y, m).catch((e) => { console.error('[worker] shakti settle error:', e.message); return { error: e.message } })

app.put('/api/worker/preferences', auth, async (req, res) => res.json(workerDto(await mergeProfile(req.worker.id, { preferences: req.body || {} }))))
app.put('/api/worker/notifications', auth, async (req, res) => res.json(workerDto(await mergeProfile(req.worker.id, { notifications: req.body || {} }))))
app.get('/api/worker/documents', auth, async (req, res) => res.json(await documents(req.worker.id)))
app.post('/api/worker/documents/upload', auth, async (req, res) => {
  const { name, fileName } = req.body || {}
  if (!name) return res.status(400).json({ ok: false, error: 'Document name required' })
  await pool.query('INSERT INTO worker_documents (worker_id,name,file_name) VALUES ($1,$2,$3)', [req.worker.id, name, fileName || null])
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'kyc.document', entityType: 'worker', entityId: req.worker.id, detail: `Uploaded document: ${name}` })
  res.json({ ok: true, documents: await documents(req.worker.id) })
})

/* ---------- admin worker management ---------- */
app.get('/api/admin/workers', adminAuth, async (req, res) => res.json({ stats: await workerStats(), workers: await listWorkers(req.query) }))
app.post('/api/admin/workers', adminAuth, async (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ error: 'Name required' })
  const { rows } = await pool.query(
    `INSERT INTO workers (name,phone,email,city,services,status,verified,rating,zone_id) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9) RETURNING *`,
    [b.name, b.phone || null, b.email || null, b.city || null, JSON.stringify(b.services || []), b.status || 'pending', !!b.verified, b.rating ?? 4.5, b.zone_id ? Number(b.zone_id) : null])
  res.status(201).json(rowToWorker(rows[0]))
})
app.get('/api/admin/workers/:id', adminAuth, async (req, res) => { const w = await getWorker(Number(req.params.id)); return w ? res.json(rowToWorker(w)) : res.status(404).json({ error: 'Not found' }) })
app.patch('/api/admin/workers/:id', adminAuth, async (req, res) => res.json(await patchWorker(Number(req.params.id), req.body || {}, res)))
app.delete('/api/admin/workers/:id', adminAuth, async (req, res) => { await pool.query('DELETE FROM workers WHERE id=$1', [Number(req.params.id)]); res.json({ ok: true }) })

/* ---------- shifts / roster (admin) ---------- */
app.get('/api/admin/shifts', adminAuth, async (_q, res) => {
  const { rows } = await pool.query('SELECT s.*, w.name AS worker_name FROM shifts s JOIN workers w ON w.id=s.worker_id ORDER BY s.worker_id, s.weekday, s.start_min')
  const { weekday, minutes } = istNow()
  res.json(rows.map((s) => ({
    id: s.id, worker_id: s.worker_id, worker_name: s.worker_name, zone_id: s.zone_id, weekday: s.weekday,
    start: toHHMM(s.start_min), end: toHHMM(s.end_min),
    on_now: s.weekday === weekday && s.start_min <= minutes && minutes < s.end_min,
  })))
})
app.post('/api/admin/shifts', adminAuth, async (req, res) => {
  const b = req.body || {}
  if (!b.worker_id) return res.status(400).json({ error: 'Worker is required' })
  const days = Array.isArray(b.weekdays) && b.weekdays.length ? b.weekdays : [b.weekday]
  const sm = toMin(b.start), em = toMin(b.end)
  if (!(em > sm)) return res.status(400).json({ error: 'End time must be after start time' })
  let added = 0
  for (const d of days) {
    if (!Number.isFinite(Number(d))) continue
    await pool.query('INSERT INTO shifts (worker_id,zone_id,weekday,start_min,end_min) VALUES ($1,$2,$3,$4,$5)',
      [Number(b.worker_id), b.zone_id ? Number(b.zone_id) : null, Number(d), sm, em]); added++
  }
  res.status(201).json({ ok: true, added })
})
app.delete('/api/admin/shifts/:id', adminAuth, async (req, res) => { await pool.query('DELETE FROM shifts WHERE id=$1', [Number(req.params.id)]); res.json({ ok: true }) })

/* ---------- shift PLANS + attendance (admin control) ---------- */
app.get('/api/admin/shift-defs', adminAuth, async (_q, res) => {
  const { rows } = await pool.query('SELECT * FROM shift_defs ORDER BY sort, start_min')
  res.json(rows.map((s) => ({
    id: s.id, code: s.code, name: s.name, start: toHHMM(s.start_min), end: toHHMM(s.end_min),
    graceMin: s.grace_min, penalty: s.penalty, minGWeekday: s.min_g_weekday, minGWeekend: s.min_g_weekend, active: !!s.active,
  })))
})
app.put('/api/admin/shift-defs/:id', adminAuth, async (req, res) => {
  const b = req.body || {}
  const sm = b.start != null ? toMin(b.start) : null
  const em = b.end != null ? toMin(b.end) : null
  if (sm != null && em != null && !(em > sm)) return res.status(400).json({ error: 'End time must be after start time' })
  await pool.query(
    `UPDATE shift_defs SET name=COALESCE($1,name), start_min=COALESCE($2,start_min), end_min=COALESCE($3,end_min),
       grace_min=COALESCE($4,grace_min), penalty=COALESCE($5,penalty), min_g_weekday=COALESCE($6,min_g_weekday),
       min_g_weekend=COALESCE($7,min_g_weekend), active=COALESCE($8,active) WHERE id=$9`,
    [b.name ?? null, sm, em, b.graceMin ?? null, b.penalty ?? null, b.minGWeekday ?? null, b.minGWeekend ?? null,
      b.active === undefined ? null : !!b.active, Number(req.params.id)])
  res.json({ ok: true })
})
app.get('/api/admin/attendance', adminAuth, async (req, res) => {
  const day = req.query.day || istDateStr(Date.now())
  const { rows } = await pool.query(
    `SELECT a.*, w.name worker_name, sd.name shift_name FROM attendance a
       JOIN workers w ON w.id=a.worker_id LEFT JOIN shift_defs sd ON sd.id=a.shift_def_id
     WHERE a.day=$1 ORDER BY a.check_in DESC NULLS LAST`, [day])
  res.json({
    day,
    rows: rows.map((a) => ({
      workerId: a.worker_id, workerName: a.worker_name, shift: a.shift_name || '—',
      checkIn: a.check_in ? istClock(a.check_in) : '', checkOut: a.check_out ? istClock(a.check_out) : '',
      onTime: a.on_time, lateMinutes: a.late_minutes || 0, penalty: a.penalty || 0, minG: a.min_g || 0,
      site: a.site_name || '—', geoBreaches: a.geo_breaches || 0, geoOutside: !!a.geo_outside,
    })),
  })
})

/* ---------- apartments / geofence sites (admin control) ---------- */
app.get('/api/admin/sites', adminAuth, async (_q, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, (SELECT COUNT(*)::int FROM workers w WHERE w.site_id = s.id) AS assigned FROM worker_sites s ORDER BY s.id`)
  res.json(rows.map((s) => ({ id: s.id, name: s.name, address: s.address || '', lat: s.lat, lng: s.lng, radius: s.radius, active: !!s.active, assigned: s.assigned })))
})
app.post('/api/admin/sites', adminAuth, async (req, res) => {
  const b = req.body || {}
  if (!b.name || b.lat == null || b.lng == null) return res.status(400).json({ error: 'name, lat, lng are required' })
  const { rows } = await pool.query('INSERT INTO worker_sites (name,address,lat,lng,radius) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [b.name, b.address || '', Number(b.lat), Number(b.lng), Number(b.radius) || 300])
  res.status(201).json({ ok: true, id: rows[0].id })
})
app.put('/api/admin/sites/:id', adminAuth, async (req, res) => {
  const b = req.body || {}
  await pool.query(
    `UPDATE worker_sites SET name=COALESCE($1,name), address=COALESCE($2,address), lat=COALESCE($3,lat),
       lng=COALESCE($4,lng), radius=COALESCE($5,radius), active=COALESCE($6,active) WHERE id=$7`,
    [b.name ?? null, b.address ?? null, b.lat ?? null, b.lng ?? null, b.radius ?? null,
      b.active === undefined ? null : !!b.active, Number(req.params.id)])
  res.json({ ok: true })
})
app.delete('/api/admin/sites/:id', adminAuth, async (req, res) => {
  await pool.query('UPDATE workers SET site_id=NULL WHERE site_id=$1', [Number(req.params.id)])
  await pool.query('DELETE FROM worker_sites WHERE id=$1', [Number(req.params.id)])
  res.json({ ok: true })
})
// Assign (or clear) a worker's apartment for their shifts.
app.post('/api/admin/workers/:id/site', adminAuth, async (req, res) => {
  const siteId = req.body?.siteId ? Number(req.body.siteId) : null
  await pool.query('UPDATE workers SET site_id=$1 WHERE id=$2', [siteId, Number(req.params.id)])
  res.json({ ok: true })
})

/* Internal: on-shift qualified workers now (for auto-assign / live-ops). */
app.get('/internal/on-shift', internalOnly, async (req, res) => {
  const zoneId = req.query.zone_id ? Number(req.query.zone_id) : null
  const names = String(req.query.services || '').split(',').map((s) => s.toLowerCase().trim()).filter(Boolean)
  const { weekday, minutes } = istNow()
  const vals = [weekday, minutes]
  let sql = `SELECT DISTINCT w.* FROM workers w JOIN shifts s ON s.worker_id=w.id
    WHERE w.status='active' AND s.weekday=$1 AND s.start_min<=$2 AND $2 < s.end_min`
  if (zoneId) { vals.push(zoneId); sql += ` AND (s.zone_id=$3 OR s.zone_id IS NULL)` }
  const rows = (await pool.query(sql, vals)).rows
  const qualified = rows.filter((w) => { const set = serviceSet(w); return names.length === 0 || names.some((n) => set.has(n)) })
  res.json({ count: qualified.length, workers: qualified.map((w) => ({ id: w.id, name: w.name, rating: w.rating, available: !!w.available, zone_id: w.zone_id, last: w.last_lat != null ? { lat: w.last_lat, lng: w.last_lng } : null })) })
})

async function patchWorker(id, b, res) {
  const w = await getWorker(id); if (!w) { res.status(404); return { error: 'Not found' } }
  await pool.query('UPDATE workers SET name=$1, phone=$2, email=$3, city=$4, services=$5::jsonb, status=$6, verified=$7, bank_status=COALESCE($8,bank_status), zone_id=$9 WHERE id=$10', [
    b.name ?? w.name, b.phone ?? w.phone, b.email ?? w.email, b.city ?? w.city,
    JSON.stringify(b.services ?? w.services), b.status ?? w.status,
    b.verified === undefined ? w.verified : !!b.verified, b.bank_status ?? null,
    b.zone_id === undefined ? w.zone_id : (b.zone_id ? Number(b.zone_id) : null), id])
  return rowToWorker(await getWorker(id))
}

/* ---------- internal (service-to-service) ---------- */
app.get('/internal/workers', internalOnly, async (req, res) => res.json({ stats: await workerStats(), workers: await listWorkers(req.query) }))
app.get('/internal/workers/active-for', internalOnly, async (req, res) => {
  const names = String(req.query.services || '').split(',').map((s) => s.toLowerCase().trim()).filter(Boolean)
  const rows = (await pool.query("SELECT services, available FROM workers WHERE status='active'")).rows
  const qualified = rows.filter((w) => { const set = serviceSet(w); return names.some((n) => set.has(n)) })
  // available/onlineCount = qualified workers online now (for instant); count = all active qualified
  // workers (for future scheduled slots, where being online right now doesn't matter).
  res.json({ available: qualified.some((w) => w.available), count: qualified.length, onlineCount: qualified.filter((w) => w.available).length })
})
app.get('/internal/workers/:id', internalOnly, async (req, res) => { const w = await getWorker(Number(req.params.id)); return w ? res.json(rowToWorker(w)) : res.status(404).json({ error: 'Not found' }) })
app.get('/internal/workers/:id/service-set', internalOnly, async (req, res) => { const w = await getWorker(Number(req.params.id)); res.json({ services: w ? [...serviceSet(w)] : [], name: w?.name, rating: w?.rating, available: !!w?.available, status: w?.status, offered_booking: w?.offered_booking, zone_id: w?.zone_id ?? null, last: w?.last_lat != null ? { lat: w.last_lat, lng: w.last_lng } : null }) })
app.post('/internal/workers/:id/offered', internalOnly, async (req, res) => { await pool.query('UPDATE workers SET offered_booking=$1 WHERE id=$2', [req.body?.bookingId ?? null, Number(req.params.id)]); res.json({ ok: true }) })
app.post('/internal/workers/:id/location', internalOnly, async (req, res) => { await pool.query('UPDATE workers SET last_lat=$1, last_lng=$2 WHERE id=$3', [req.body?.lat, req.body?.lng, Number(req.params.id)]); res.json({ ok: true }) })
app.get('/internal/workers/:id/public-profile', internalOnly, async (req, res) => { const w = await getWorker(Number(req.params.id)); res.json(w ? { id: w.id, name: w.name, rating: w.rating, jobs: w.jobs, phone: w.phone, avatar: w.avatar, verified: !!w.verified } : null) })
app.patch('/internal/workers/:id', internalOnly, async (req, res) => res.json(await patchWorker(Number(req.params.id), req.body || {}, res)))
// Wallet service adjusts the balance snapshot (deltas) after ledger changes.
app.post('/internal/workers/:id/balance', internalOnly, async (req, res) => {
  const b = req.body || {}
  await pool.query(`UPDATE workers SET balance=balance+$1, pending=pending+$2, hold=hold+$3, withdrawn=withdrawn+$4, advance_outstanding=advance_outstanding+$5, earnings=earnings+$6, jobs=jobs+$7 WHERE id=$8`,
    [b.balance || 0, b.pending || 0, b.hold || 0, b.withdrawn || 0, b.advance_outstanding || 0, b.earnings || 0, b.jobs || 0, Number(req.params.id)])
  const w = await getWorker(Number(req.params.id))
  res.json({ ok: true, wallet: walletDto(w) })
})

// Admin bank approve/reject (routes via gateway /api/admin/workers/:id/bank/*).
app.post('/api/admin/workers/:id/bank/approve', adminAuth, async (req, res) => { await pool.query("UPDATE workers SET bank_status='Verified' WHERE id=$1", [Number(req.params.id)]); res.json({ ok: true }) })
app.post('/api/admin/workers/:id/bank/reject', adminAuth, async (req, res) => { await pool.query("UPDATE workers SET bank_status='Rejected' WHERE id=$1", [Number(req.params.id)]); res.json({ ok: true }) })

/* ---------- events ---------- */
subscribeEvents(REDIS_URL, 'worker', async (_type, _data) => { /* reserved for future reactions */ })

// Auto-settle Shakti bonuses at the start of each month (pays out the PREVIOUS month).
// Runs daily but only acts on the 1st–2nd; the wallet credit is idempotent per worker/month.
function scheduleShaktiSettlement() {
  const tick = () => {
    const now = new Date()
    if (now.getDate() <= 2) {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      settleShaftiSafe(prev.getFullYear(), prev.getMonth())
    }
  }
  setInterval(tick, 24 * 3600 * 1000) // once a day
  setTimeout(tick, 15000) // and shortly after boot (catches a missed run)
}

init()
  .then(() => {
    app.listen(PORT, () => console.log(`[worker] service on http://localhost:${PORT}`))
    scheduleShaktiSettlement()
  })
  .catch((e) => { console.error('[worker] failed to start:', e.message); process.exit(1) });
