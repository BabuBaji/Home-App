// Seed a realistic KYC document set per worker, so the admin "Worker → Documents" console has
// something to show (stat cards, expiry alerts, and the full particulars table). Mirrors the
// worker-earnings seed: deterministic per worker (same worker id -> same documents) and idempotent
// (rebuilds that worker's document rows on every run).
//
// The repo has no host-level node_modules (services run in Docker), so run it inside a container
// that already has `pg` via the wrapper:
//
//   npm run seed:documents                 # seeds worker 10 (the one in the sample screen)
//   npm run seed:documents -- 4            # seeds worker 4
//   npm run seed:documents -- --all        # seeds every ACTIVE worker
//
// To run directly from a host that has `pg`, point it at the published worker-db port:
//
//   WORKER_DB_URL=postgres://homehelp:change-me@localhost:5435/worker node infra/seed/worker-documents.js --all
//
// DESTRUCTIVE FOR THE TARGET WORKER: it DELETEs that worker's worker_documents rows and rebuilds
// them, so it is a DEMO/QA tool — never run it against a database holding real uploaded documents
// (those rows carry a storage_key/object and would be wiped). It never touches any other worker.
//
// Nothing here asserts policy: expiry dates are demo values, and the admin panel's expiry alerts are
// simply DERIVED from expiry_date — a document with none never alerts. These rows carry metadata
// only (no storage_key), so the admin panel shows no "View" link for them, which is honest: there is
// no uploaded file behind a seeded row.
import pg from 'pg'

const args = process.argv.slice(2)
const ALL = args.includes('--all')
const ARG_ID = Number(args.find((a) => /^\d+$/.test(a)) || 0)
const worker = new pg.Pool({ connectionString: process.env.WORKER_DB_URL || 'postgres://homehelp:change-me@localhost:5435/worker' })

// Deterministic PRNG — same worker id produces the same document set every run.
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

const DAY = 86400000
const now = Date.now()
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10)
const dt = (daysAgo) => new Date(now - Math.max(0, daysAgo) * DAY).toISOString().slice(0, 19).replace('T', ' ')
const REVIEWERS = ['Super Admin', 'Ops Manager']

// Build the document list for one worker from its PRNG. Each entry becomes one worker_documents row.
// expiryInDays: signed offset from today (negative = already expired); absent = never expires.
function buildDocs(rnd) {
  const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)]
  const digits = (n) => Array.from({ length: n }, () => between(0, 9)).join('')
  const letters = (n) => Array.from({ length: n }, () => String.fromCharCode(65 + between(0, 25))).join('')

  const docs = []
  const add = (name, o) => docs.push({ name, ...o })

  // Core identity — always present, no expiry.
  add('Aadhaar Card', { number: `XXXX XXXX ${digits(4)}`, issuedAgo: between(200, 700), status: 'Verified' })
  add('PAN Card', { number: `${letters(5)}${digits(4)}${letters(1)}`, issuedAgo: between(200, 900), status: 'Verified' })
  add('Bank Passbook', { number: `SBIN000${digits(4)}`, issuedAgo: between(150, 600), status: 'Verified' })
  add('Address Proof', { number: `ADD/2024/${digits(4)}`, issuedAgo: between(120, 500), status: 'Verified' })
  add('Profile Photo', { number: '', issuedAgo: between(120, 500), status: 'Verified', reviewer: 'System' })

  // Expiry-bearing docs — the offsets deliberately include a "soon" and an "already expired" bucket
  // so the alerts panel and the Expiring/Expired cards have something to show on some workers.
  add('Driving License', { number: `TS09 ${digits(11)}`, issuedAgo: between(400, 1200), expiryInDays: between(1500, 3500), status: 'Verified' })
  add('Police Verification', { number: `PV/2024/${digits(4)}`, issuedAgo: between(300, 700), expiryInDays: pick([18, 27, 210, 380, -20]), status: rnd() < 0.25 ? 'Pending' : 'Verified' })
  add('Medical Certificate', { number: `MC/2024/${digits(4)}`, issuedAgo: between(150, 340), expiryInDays: pick([8, 21, 45, 160, -15]), status: 'Verified' })
  add('ESIC Card', { number: `ESIC/2024/${digits(4)}`, issuedAgo: between(300, 800), expiryInDays: pick([-40, 60, 300, 500]), status: 'Verified' })

  // Supporting — no expiry.
  add('PF Account Proof', { number: `PF/TS/${digits(7)}`, issuedAgo: between(150, 600), status: 'Verified' })
  add('Resume / Bio Data', { number: `RES/2024/${digits(3)}`, issuedAgo: between(150, 600), status: 'Verified' })
  const vaxRejected = rnd() < 0.3
  add('Vaccination Certificate', { number: `VC/2024/${digits(5)}`, issuedAgo: between(400, 900), status: vaxRejected ? 'Rejected' : 'Verified', rejectReason: vaxRejected ? 'Document image is blurred and unreadable' : '' })

  // Drop 0–2 optional docs so not every worker is identical or fully complete.
  const optional = ['PF Account Proof', 'Resume / Bio Data', 'ESIC Card']
  for (let i = 0, drop = between(0, 2); i < drop; i++) {
    const idx = docs.findIndex((d) => d.name === pick(optional))
    if (idx >= 0) docs.splice(idx, 1)
  }
  return docs
}

async function seedWorker(id) {
  const { rows: [w] } = await worker.query('SELECT id, name FROM workers WHERE id=$1', [id])
  if (!w) { console.log(`  worker ${id} does not exist — skipped`); return 0 }
  const rnd = mulberry32((id * 2654435761) % 2147483647 || 7)
  const docs = buildDocs(rnd)
  // Idempotent rebuild — wipe this worker's rows, then re-insert the deterministic set.
  await worker.query('DELETE FROM worker_documents WHERE worker_id=$1', [id])
  let counts = { Verified: 0, Pending: 0, Rejected: 0, expiring: 0, expired: 0 }
  for (const d of docs) {
    const issue = ymd(now - d.issuedAgo * DAY)
    const expiry = d.expiryInDays != null ? ymd(now + d.expiryInDays * DAY) : null
    const reviewer = d.status === 'Pending' ? null : (d.reviewer || REVIEWERS[Math.floor(rnd() * REVIEWERS.length)])
    const reviewedAt = d.status === 'Pending' ? null : dt(d.issuedAgo - 2)
    await worker.query(
      `INSERT INTO worker_documents (worker_id,name,status,reviewed_by,reviewed_at,reject_reason,document_number,issue_date,expiry_date,created)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, d.name, d.status, reviewer, reviewedAt, d.rejectReason || '', d.number || null, issue, expiry, issue])
    counts[d.status] = (counts[d.status] || 0) + 1
    if (d.expiryInDays != null && d.expiryInDays < 0) counts.expired++
    else if (d.expiryInDays != null && d.expiryInDays <= 30) counts.expiring++
  }
  console.log(`  worker ${String(w.id).padStart(3)} — ${w.name.padEnd(18)} ${docs.length} docs  (verified ${counts.Verified}, pending ${counts.Pending}, rejected ${counts.Rejected}, expiring ${counts.expiring}, expired ${counts.expired})`)
  return docs.length
}

async function run() {
  const ids = ALL
    ? (await worker.query("SELECT id FROM workers WHERE status='active' ORDER BY id")).rows.map((r) => r.id)
    : [ARG_ID || 10]
  console.log(`Seeding worker documents for ${ids.length} worker(s)…`)
  let total = 0
  for (const id of ids) total += await seedWorker(id)
  console.log(`Done — ${total} documents across ${ids.length} worker(s).`)
  console.log('Open: Workers → (a worker) → Documents')
  await worker.end()
}
run().catch((e) => { console.error('seed failed:', e.message); process.exit(1) })
