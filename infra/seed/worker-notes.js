// Seed a couple of sample admin notes per worker so the Notes & Activity tab isn't empty in the
// demo. Deterministic per worker and idempotent (rebuilds that worker's notes).
//
//   npm run seed:notes                 # worker 10
//   npm run seed:notes -- 4            # worker 4
//   npm run seed:notes -- --all        # every ACTIVE worker
//
// DESTRUCTIVE FOR THE TARGET WORKER: replaces its worker_notes rows — a DEMO/QA tool. Notes are
// admin-authored context; these are demo values.
import pg from 'pg'

const args = process.argv.slice(2)
const ALL = args.includes('--all')
const ARG_ID = Number(args.find((a) => /^\d+$/.test(a)) || 0)
const worker = new pg.Pool({ connectionString: process.env.WORKER_DB_URL || 'postgres://homehelp:change-me@localhost:5435/worker' })

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const DAY = 86400000
const now = Date.now()
const NOTES = [
  'Consistently high customer ratings — good candidate for premium jobs.',
  'Punctual and reliable this month; low cancellation rate.',
  'Completed the deep-cleaning refresher training.',
  'Requested weekend shifts going forward — noted for roster.',
  'Handled a difficult customer well; positive feedback received.',
  'Reminded to keep the equipment kit updated.',
  'Strong performance streak — eligible for the performance bonus.',
]
const AUTHORS = ['Super Admin', 'Ops Manager']

async function seedWorker(id) {
  const { rows: [w] } = await worker.query('SELECT id, name FROM workers WHERE id=$1', [id])
  if (!w) { console.log(`  worker ${id} does not exist — skipped`); return false }
  const rnd = mulberry32((id * 40503) % 2147483647 || 17)
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)]
  const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
  // Idempotent rebuild — replace this worker's notes.
  await worker.query('DELETE FROM worker_notes WHERE worker_id=$1', [id])
  const chosen = [...NOTES].sort(() => rnd() - 0.5).slice(0, between(2, 3))
  for (const text of chosen) {
    await worker.query('INSERT INTO worker_notes (worker_id, note, author, created) VALUES ($1,$2,$3,$4)',
      [id, text, pick(AUTHORS), new Date(now - between(2, 40) * DAY).toISOString()])
  }
  console.log(`  worker ${String(w.id).padStart(3)} — ${w.name.padEnd(18)} ${chosen.length} notes`)
  return true
}

async function run() {
  const ids = ALL
    ? (await worker.query("SELECT id FROM workers WHERE status='active' ORDER BY id")).rows.map((r) => r.id)
    : [ARG_ID || 10]
  console.log(`Seeding admin notes for ${ids.length} worker(s)…`)
  for (const id of ids) await seedWorker(id)
  console.log('Done. Open: Workers → (a worker) → Notes & Activity')
  await worker.end()
}
run().catch((e) => { console.error('seed failed:', e.message); process.exit(1) })
