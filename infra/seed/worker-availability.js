// Seed the Availability tab: assign a shift, mark Sunday as the weekly off, build ~45 days of
// attendance (with occasional late arrivals + overtime), a few leaves, and the change log — so the
// overview cards, week summary, month calendar, upcoming leaves and recent changes are populated.
//
//   npm run seed:availability                 # worker 10
//   npm run seed:availability -- 4            # worker 4
//   npm run seed:availability -- --all        # every ACTIVE worker
//
// DESTRUCTIVE FOR THE TARGET WORKER: rewrites its shift assignment + profile.availability and
// rebuilds its attendance / leave_requests / worker_availability_log rows — a DEMO/QA tool. Hours
// and lateness are demo values; the tab derives everything from these real rows.
import pg from 'pg'

const args = process.argv.slice(2)
const ALL = args.includes('--all')
const ARG_ID = Number(args.find((a) => /^\d+$/.test(a)) || 0)
const worker = new pg.Pool({ connectionString: process.env.WORKER_DB_URL || 'postgres://homehelp:change-me@localhost:5435/worker' })

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const DAY = 86400000
const now = Date.now()
const istToday = new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const dayStr = (daysFromToday) => new Date(new Date(istToday + 'T00:00:00Z').getTime() + daysFromToday * DAY).toISOString().slice(0, 10)
const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
const REVIEWERS = ['Super Admin', 'Ops Manager']

async function seedWorker(id, shiftDefs) {
  const { rows: [w] } = await worker.query('SELECT id, name FROM workers WHERE id=$1', [id])
  if (!w) { console.log(`  worker ${id} does not exist — skipped`); return false }
  const rnd = mulberry32((id * 2246822519) % 2147483647 || 13)
  const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)]

  const sd = pick(shiftDefs)
  // Assign the shift + a Sunday weekly-off availability profile (approved).
  await worker.query('UPDATE workers SET shift_def_id=$1 WHERE id=$2', [sd.id, id])
  const availableDays = { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false }
  const availability = { availableDays, shiftStart: hhmm(sd.start_min), shiftEnd: hhmm(sd.end_min), preferredShiftId: sd.id, status: 'Approved', reviewedBy: pick(REVIEWERS), reviewedAt: new Date(now - between(20, 90) * DAY).toISOString() }
  await worker.query(`UPDATE workers SET profile = COALESCE(profile,'{}'::jsonb) || jsonb_build_object('availability', $2::jsonb) WHERE id=$1`, [id, JSON.stringify(availability)])

  // Leaves — one past (approved) + two upcoming (one pending, one approved).
  await worker.query('DELETE FROM leave_requests WHERE worker_id=$1', [id])
  const leaveDays = new Set()
  const addLeave = async (fromOff, span, type, status, reason) => {
    const from = dayStr(fromOff), to = dayStr(fromOff + span - 1)
    for (let k = 0; k < span; k++) leaveDays.add(dayStr(fromOff + k))
    await worker.query('INSERT INTO leave_requests (worker_id,from_date,to_date,reason,status,leave_type) VALUES ($1,$2,$3,$4,$5,$6)', [id, from, to, reason, status, type])
  }
  await addLeave(-between(6, 12), 1, 'Personal', 'Approved', 'Personal work')
  await addLeave(between(6, 12), 1, 'Personal', 'Pending', 'Family function')
  await addLeave(between(20, 30), between(1, 2), 'Medical', 'Approved', 'Medical checkup')

  // Attendance — last ~45 days, working days only (skip Sunday + leave days).
  await worker.query('DELETE FROM attendance WHERE worker_id=$1', [id])
  for (let off = -45; off <= -1; off++) {
    const ds = dayStr(off)
    const dow = new Date(ds + 'T00:00:00Z').getUTCDay() // 0=Sun
    if (dow === 0 || leaveDays.has(ds)) continue
    const late = rnd() < 0.14 ? between(5, 40) : 0
    const ot = rnd() < 0.3 ? between(15, 90) : 0
    const inMin = sd.start_min + late, outMin = sd.end_min + ot
    const onTime = late <= (sd.grace_min || 15)
    const checkIn = `${ds}T${hhmm(inMin)}:00+05:30`, checkOut = `${ds}T${hhmm(outMin)}:00+05:30`
    await worker.query(
      `INSERT INTO attendance (worker_id,day,check_in,check_out,shift_def_id,late_minutes,on_time,penalty)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (worker_id,day) DO UPDATE SET check_in=EXCLUDED.check_in, check_out=EXCLUDED.check_out, late_minutes=EXCLUDED.late_minutes, on_time=EXCLUDED.on_time, penalty=EXCLUDED.penalty`,
      [id, ds, checkIn, checkOut, sd.id, late, onTime, onTime ? 0 : (sd.penalty || 50)])
  }

  // Change log — a shift tweak, a half-day, and the leave decisions.
  await worker.query('DELETE FROM worker_availability_log WHERE worker_id=$1', [id])
  const logAt = (off) => new Date(new Date(istToday + 'T10:30:00Z').getTime() + off * DAY).toISOString()
  const log = async (off, type, from, to, reason, status) => worker.query(
    'INSERT INTO worker_availability_log (worker_id,at,type,from_val,to_val,reason,updated_by,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, logAt(off), type, from, to, reason, pick(REVIEWERS), status])
  await log(-between(8, 15), 'Shift Change', '06:00 AM - 06:00 PM', `${hhmm(sd.start_min)} - ${hhmm(sd.end_min)}`, 'Zone requirement', 'Approved')
  await log(-between(3, 7), 'Half Day', `${hhmm(sd.start_min)} - ${hhmm(sd.end_min)}`, `${hhmm(sd.start_min)} - ${hhmm(sd.start_min + 240)}`, 'Personal work', 'Approved')
  await log(-between(16, 20), 'Leave Request', dayStr(-between(6, 12)), dayStr(-between(6, 12)), 'Personal work', 'Approved')

  console.log(`  worker ${String(w.id).padStart(3)} — ${w.name.padEnd(18)} shift ${sd.name} (${hhmm(sd.start_min)}-${hhmm(sd.end_min)}) · attendance built · 3 leaves · 3 log entries`)
  return true
}

async function run() {
  const shiftDefs = (await worker.query('SELECT id, name, start_min, end_min, grace_min, penalty FROM shift_defs WHERE active=true ORDER BY sort, start_min')).rows
  if (!shiftDefs.length) { console.error('No active shift_defs found — cannot assign shifts.'); process.exit(1) }
  const ids = ALL
    ? (await worker.query("SELECT id FROM workers WHERE status='active' ORDER BY id")).rows.map((r) => r.id)
    : [ARG_ID || 10]
  console.log(`Seeding Availability for ${ids.length} worker(s)…`)
  for (const id of ids) await seedWorker(id, shiftDefs)
  console.log('Done. Open: Workers → (a worker) → Availability')
  await worker.end()
}
run().catch((e) => { console.error('seed failed:', e.message); process.exit(1) })
