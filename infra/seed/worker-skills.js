// Seed the Skills & Services tab: per-service skill LEVELS on the worker profile, a couple of extra
// claimed skills, professional certifications, tools/equipment issuance, and the skill-level change
// history. Deterministic per worker (same id -> same data) and idempotent (rebuilds its own rows).
//
// The repo has no host-level node_modules, so run it inside a container that has `pg` via the wrapper:
//
//   npm run seed:skills                 # seeds worker 10
//   npm run seed:skills -- 4            # seeds worker 4
//   npm run seed:skills -- --all        # seeds every ACTIVE worker
//
// DESTRUCTIVE FOR THE TARGET WORKER: it rewrites that worker's profile.skillLevels, and rebuilds its
// worker_certifications / worker_skill_history / worker_equipment rows — a DEMO/QA tool. Levels,
// certs and history are demo values; services themselves and their real completed-job counts are NOT
// touched (those stay live from the worker's actual bookings).
import pg from 'pg'

const args = process.argv.slice(2)
const ALL = args.includes('--all')
const ARG_ID = Number(args.find((a) => /^\d+$/.test(a)) || 0)
const worker = new pg.Pool({ connectionString: process.env.WORKER_DB_URL || 'postgres://homehelp:change-me@localhost:5435/worker' })

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const DAY = 86400000
const now = Date.now()
const dt = (daysAgo) => new Date(now - Math.max(0, daysAgo) * DAY).toISOString().slice(0, 19).replace('T', ' ')
const ymd = (daysAgo) => new Date(now - Math.max(0, daysAgo) * DAY).toISOString().slice(0, 10)

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert']
const EXTRA_SKILLS = ['Ironing', 'Laundry', 'Dusting', 'Window Cleaning']
const CERTS = [
  ['Deep Cleaning Certified', 'HomeHelp Academy'],
  ['Kitchen Hygiene Expert', 'FSSAI Training'],
  ['First Aid & Safety', 'St. John Ambulance'],
  ['Pest Control Training', 'HomeHelp Academy'],
  ['Fire Safety Training', 'National Safety Council'],
  ['Customer Service Excellence', 'HomeHelp Academy'],
]
const REVIEWERS = ['Super Admin', 'Ops Manager']
const REMARKS = ['Upgraded based on performance', 'Performance improvement', 'Training completed', 'On-time performance', 'Consistent 5-star ratings']

async function seedWorker(id) {
  const { rows: [w] } = await worker.query('SELECT id, name, services, profile FROM workers WHERE id=$1', [id])
  if (!w) { console.log(`  worker ${id} does not exist — skipped`); return false }
  const rnd = mulberry32((id * 2654435761) % 2147483647 || 11)
  const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)]

  const services = Array.isArray(w.services) ? w.services : []
  // Assign each live service a level (leans higher for the first few — a worker's primary services).
  const skillLevels = {}
  services.forEach((s, i) => { skillLevels[s] = i === 0 ? 'Expert' : i === 1 ? (rnd() < 0.6 ? 'Expert' : 'Advanced') : LEVELS[Math.max(0, 3 - i - between(0, 1))] })
  // A couple of extra claimed (non-service) skills, so Worker Skills is broader than Services Offered.
  for (const s of EXTRA_SKILLS.slice(0, between(2, 3))) if (!skillLevels[s]) skillLevels[s] = pick(['Basic', 'Intermediate'])

  await worker.query(`UPDATE workers SET profile = COALESCE(profile,'{}'::jsonb) || jsonb_build_object('skillLevels', $2::jsonb) WHERE id=$1`, [id, JSON.stringify(skillLevels)])

  // Certifications — 2 to 4, issued over the last ~2 years.
  await worker.query('DELETE FROM worker_certifications WHERE worker_id=$1', [id])
  const chosen = [...CERTS].sort(() => rnd() - 0.5).slice(0, between(2, 4))
  for (const [name, issuer] of chosen) {
    await worker.query('INSERT INTO worker_certifications (worker_id,name,issuer,issued_on,status,created) VALUES ($1,$2,$3,$4,$5,now())',
      [id, name, issuer, ymd(between(120, 720)), rnd() < 0.85 ? 'Verified' : 'Pending'])
  }

  // Equipment issuance — issue a deterministic subset of the active equipment types.
  const eqTypes = (await worker.query("SELECT id, name FROM equipment_types WHERE active=true ORDER BY sort, id")).rows
  await worker.query('DELETE FROM worker_equipment WHERE worker_id=$1', [id])
  let issued = 0
  for (const t of eqTypes) {
    if (rnd() < 0.72) {
      await worker.query("INSERT INTO worker_equipment (worker_id,type_id,serial,status,issued_at,issued_by) VALUES ($1,$2,$3,'issued',$4,$5)",
        [id, t.id, `SN-${between(10000, 99999)}`, dt(between(30, 400)), pick(REVIEWERS)])
      issued++
    }
  }

  // Skill-level history — the primary services got upgraded over time.
  await worker.query('DELETE FROM worker_skill_history WHERE worker_id=$1', [id])
  const upgraded = services.slice(0, between(2, Math.min(4, services.length || 1)))
  let hist = 0
  for (let i = 0; i < upgraded.length; i++) {
    const s = upgraded[i]
    const target = skillLevels[s] || 'Advanced'
    const ti = Math.max(1, LEVELS.indexOf(target))
    const oldLvl = LEVELS[Math.max(0, ti - 1)]
    if (oldLvl === target) continue
    await worker.query('INSERT INTO worker_skill_history (worker_id,skill,old_level,new_level,verified_by,remarks,created) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, s, oldLvl, target, pick(REVIEWERS), pick(REMARKS), dt(between(20, 120) + i * 10)])
    hist++
  }

  console.log(`  worker ${String(w.id).padStart(3)} — ${w.name.padEnd(18)} skills ${Object.keys(skillLevels).length} (${services.length} services) · certs ${chosen.length} · equipment ${issued}/${eqTypes.length} · history ${hist}`)
  return true
}

async function run() {
  const ids = ALL
    ? (await worker.query("SELECT id FROM workers WHERE status='active' ORDER BY id")).rows.map((r) => r.id)
    : [ARG_ID || 10]
  console.log(`Seeding Skills & Services for ${ids.length} worker(s)…`)
  for (const id of ids) await seedWorker(id)
  console.log('Done. Open: Workers → (a worker) → Skills & Services')
  await worker.end()
}
run().catch((e) => { console.error('seed failed:', e.message); process.exit(1) })
