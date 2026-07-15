// Seed a rich worker earnings ledger, so the admin "Earnings & Payouts" screens have something
// realistic to show (transactions, incentives & bonuses, deductions, payouts).
//
// The repo has no host-level node_modules (services run in Docker), so the easy way to run this is
// inside the wallet container, which already has `pg`:
//
//   npm run seed:earnings                 # seeds worker 1, 60 days
//   npm run seed:earnings -- 4 --days=90  # seeds worker 4, 90 days
//
// That wrapper does the docker cp + exec. To run it directly from a host that does have `pg`
// installed, point it at the published DB ports:
//
//   WALLET_DB_URL=postgres://homehelp:change-me@localhost:5439/wallet \
//   WORKER_DB_URL=postgres://homehelp:change-me@localhost:5435/worker node infra/seed/worker-earnings.js 1
//
// DESTRUCTIVE FOR THE TARGET WORKER: it wipes that worker's ledger and rebuilds it, so re-running
// is idempotent. It never touches any other worker.
//
// Everything the admin screens show is DERIVED from this ledger (wallet summary() recomputes
// balance/hold/withdrawn from these rows), so the seed only has to be internally consistent. The
// worker service keeps a denormalised snapshot too, which we sync at the end so the worker app
// agrees with the admin panel.
import pg from 'pg'

const args = process.argv.slice(2)
const WORKER_ID = Number(args.find((a) => /^\d+$/.test(a)) || process.env.SEED_WORKER_ID || 1)
const DAYS = Number((args.find((a) => a.startsWith('--days=')) || '').split('=')[1] || 60)
const wallet = new pg.Pool({ connectionString: process.env.WALLET_DB_URL || 'postgres://homehelp:change-me@localhost:5439/wallet' })
const worker = new pg.Pool({ connectionString: process.env.WORKER_DB_URL || 'postgres://homehelp:change-me@localhost:5435/worker' })

// Deterministic PRNG — same seed produces the same ledger every run, so screenshots stay stable.
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const rnd = mulberry32(WORKER_ID * 7919)
const pick = (xs) => xs[Math.floor(rnd() * xs.length)]
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
const money = (lo, hi) => between(lo / 5, hi / 5) * 5 // round to ₹5

const SERVICES = ['Kitchen Cleaning', 'Deep Cleaning', 'Bathroom Cleaning', 'Sweeping & Mopping', 'Laundry Washing & Folding',
  'Dishwashing', 'Home Sanitization', 'Refrigerator Cleaning', 'Window Cleaning', 'Fan Cleaning']

const now = Date.now()
const DAY = 86400000
const at = (daysAgo, hour = 10, min = 0) => new Date(now - daysAgo * DAY).toISOString().slice(0, 10) + `T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`
const dayOf = (daysAgo) => new Date(now - daysAgo * DAY).toISOString().slice(0, 10)
const monthOf = (daysAgo) => dayOf(daysAgo).slice(0, 7)

const income = []      // { category, label, amount, ref_id, source, created }
const deductions = []  // { category, label, amount, created }
const withdrawals = [] // { amount, method, status, reference, created }
let n = 0
const ref = () => `#HH${between(10000, 99999)}`

// ---- jobs: one to three a day, each crediting the worker's post-commission share ----
for (let d = DAYS; d >= 0; d--) {
  if (rnd() < 0.18) continue // days off
  for (let j = 0, jobs = between(1, 3); j < jobs; j++) {
    const svc = pick(SERVICES)
    const r = ref()
    const hour = 9 + j * 3 + between(0, 1)
    income.push({ category: 'Job Earnings', label: `${svc} · ${r}`, amount: money(320, 1250), ref_id: `demo-job-${++n}`, source: 'System', created: at(d, hour, between(0, 59)) })
    // On-time start incentive on most jobs
    if (rnd() < 0.62) income.push({ category: 'Incentive', label: `On-time start · ${r}`, amount: 15, ref_id: `demo-ontime-${n}`, source: 'System', created: at(d, hour, 2) })
    // 5-star rating incentive on some
    if (rnd() < 0.3) income.push({ category: 'Incentive', label: `Customer rating 5★ · ${r}`, amount: money(25, 75), ref_id: `demo-rating-${n}`, source: 'System', created: at(d, hour + 1, 12) })
    // First job of the day
    if (j === 0 && rnd() < 0.25) income.push({ category: 'Incentive', label: `First job of the day · ${r}`, amount: money(40, 90), ref_id: `demo-firstjob-${n}`, source: 'System', created: at(d, hour, 5) })
    // Occasional late start — applied automatically by the platform
    if (rnd() < 0.07) deductions.push({ category: 'Late Start Penalty', label: `Late start · ${r} (not started within 15 min)`, amount: 15, source: 'System', created: at(d, hour, 20) })
    // Rare cancellation compensation
    if (rnd() < 0.04) income.push({ category: 'Compensation', label: `Cancellation comp · ${svc} · ${r}`, amount: money(60, 180), ref_id: `demo-comp-${n}`, source: 'System', created: at(d, hour + 2, 30) })
  }
}

// ---- weekly incentives (not tied to one job) ----
for (let d = DAYS; d >= 0; d -= 7) {
  if (rnd() < 0.7) income.push({ category: 'Incentive', label: `High acceptance rate · Week of ${dayOf(d)}`, amount: money(150, 300), ref_id: `demo-accept-${d}`, source: 'System', created: at(d, 20, 0) })
  if (rnd() < 0.55) income.push({ category: 'Incentive', label: `No cancellation · Week of ${dayOf(d)}`, amount: money(100, 300), ref_id: `demo-nocancel-${d}`, source: 'System', created: at(d, 20, 5) })
  // Weekend performance bonus — granted by an admin, so it shows a real name under "Approved By"
  if (rnd() < 0.5) income.push({ category: 'Bonus', label: `Weekend Performance Bonus · Week of ${dayOf(d)}`, amount: money(300, 700), ref_id: `demo-weekend-${d}`, source: pick(['Super Admin', 'Ops Manager']), created: at(d, 21, 0) })
}

// ---- monthly: tier bonus (system) + an admin-granted special ----
for (let d = DAYS; d >= 0; d -= 30) {
  income.push({ category: 'Sitara Bonus', label: `${pick(['Gold', 'Silver'])} Sitara Bonus · ${monthOf(d)}`, amount: money(800, 1500), ref_id: `demo-sitara-${monthOf(d)}`, source: 'System', created: at(d, 12, 0) })
  income.push({ category: 'Bonus', label: `Deep Cleaning Specialist Bonus · ${monthOf(d)}`, amount: money(700, 1300), ref_id: `demo-spec-${monthOf(d)}`, source: 'Super Admin', created: at(d, 12, 30) })
  if (rnd() < 0.6) income.push({ category: 'Bonus', label: `Festival Special Bonus · ${monthOf(d)}`, amount: money(500, 1000), ref_id: `demo-festival-${monthOf(d)}`, source: 'Ops Manager', created: at(d, 13, 0) })
}

// ---- minimum-guarantee top-ups on a few thin days ----
for (let i = 0; i < 3; i++) {
  const d = between(5, DAYS)
  income.push({ category: 'Min Guarantee', label: `Shift minimum guarantee top-up (${dayOf(d)})`, amount: money(200, 600), ref_id: `demo-ming-${d}`, source: 'System', created: at(d, 22, 0) })
}

// ---- other deductions: automatic shift penalties + a spread of admin-applied ones ----
deductions.push({ category: 'Shift Late Penalty', label: 'Late shift check-in · Morning (42 min late)', amount: 50, source: 'System', created: at(between(10, DAYS), 8, 42) })
deductions.push({ category: 'Shift Late Penalty', label: 'Late shift check-in · Evening (28 min late)', amount: 50, source: 'System', created: at(between(3, 20), 17, 28) })
for (const [category, label, amount] of [
  ['Uniform Deduction', 'Uniform charge for the month', 250],
  ['Tools Damage', 'Mop handle damaged during a job', 350],
  ['Quality Penalty', 'Customer complaint · low rating', 200],
  ['ID Card Replacement', 'Replacement ID card issued', 50],
  ['Policy Violation', 'Unauthorised break time', 150],
  ['Leave Deduction', '1 day unpaid leave', 300],
]) deductions.push({ category, label, amount, source: pick(['Super Admin', 'Ops Manager']), created: at(between(2, DAYS), between(9, 18), between(0, 59)) })

const earned = income.reduce((s, r) => s + r.amount, 0)
const dedTotal = deductions.reduce((s, r) => s + r.amount, 0)

// ---- bank details, mirrored into every payout's `destination` snapshot ----
const ACCOUNT = String(between(10000000000, 99999999999))
const BANK_NAME = 'HDFC Bank'
const UPI_ID = (name) => `${name.toLowerCase().split(' ')[0]}@okhdfcbank`
const destBank = `${BANK_NAME} ••••${ACCOUNT.slice(-4)}`
const gwRef = () => `pout_${Math.floor(rnd() * 1e9).toString(36).toUpperCase()}`
// A bank UTR only exists once the rail settles, so only Paid rows get one.
const bankUtr = (m) => m === 'upi' ? `UPI/DR/${between(100000000, 999999999)}` : `HDFCS${between(10000000000, 99999999999)}`

// ---- payouts: a run of completed ones, plus one in flight and one that bounced ----
let paid = 0
for (let d = DAYS - 4; d > 7; d -= 9) {
  const amt = money(1500, 4000)
  if (paid + amt > earned * 0.55) break // never pay out more than the worker actually earned
  paid += amt
  const method = rnd() < 0.75 ? 'bank' : 'upi'
  withdrawals.push({ amount: amt, method, status: 'Paid', reference: gwRef(), utr: bankUtr(method), destination: method === 'upi' ? UPI_ID('x') : destBank, created: at(d, 6, 0) })
}
withdrawals.push({ amount: money(800, 1500), method: 'upi', status: 'Failed', reference: gwRef(), utr: null, destination: UPI_ID('x'), created: at(6, 9, 30) })
const inFlight = money(700, 1400)
withdrawals.push({ amount: inFlight, method: 'bank', status: 'Processing', reference: gwRef(), utr: null, destination: destBank, created: at(2, 7, 15) })

const available = earned - paid - inFlight - dedTotal

async function run() {
  if (available < 0) throw new Error(`seed would leave a negative balance (${available}) — lower the payout amounts`)
  const { rows: [w] } = await worker.query('SELECT id, name FROM workers WHERE id=$1', [WORKER_ID])
  if (!w) throw new Error(`worker ${WORKER_ID} does not exist`)
  console.log(`Seeding ${DAYS} days of earnings for worker ${w.id} — ${w.name}`)

  // Rebuild from scratch so re-running is idempotent.
  for (const t of ['worker_income', 'worker_deductions', 'worker_withdrawals', 'worker_advances'])
    await wallet.query(`DELETE FROM ${t} WHERE worker_id=$1`, [WORKER_ID])

  for (const r of income)
    await wallet.query('INSERT INTO worker_income (worker_id,category,label,amount,ref_id,bucket,source,created) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [WORKER_ID, r.category, r.label, r.amount, r.ref_id, 'available', r.source, r.created])
  for (const r of deductions)
    await wallet.query('INSERT INTO worker_deductions (worker_id,category,label,amount,source,created) VALUES ($1,$2,$3,$4,$5,$6)',
      [WORKER_ID, r.category, r.label, r.amount, r.source, r.created])
  for (const r of withdrawals)
    await wallet.query('INSERT INTO worker_withdrawals (worker_id,amount,method,status,reference,utr,destination,created) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [WORKER_ID, r.amount, r.method, r.status, r.reference, r.utr, r.destination.replace('x@okhdfcbank', UPI_ID(w.name)), r.created])

  // Bank details, so the Payout Account panel has something to show and payouts are plausible.
  const bank = {
    bank: { bankHolder: w.name, bankName: BANK_NAME, bankAccount: ACCOUNT, bankIfsc: 'HDFC0001234', bankUpi: UPI_ID(w.name), bankAccountType: 'savings' },
    bankVerification: { status: 'Verified', registeredName: w.name.toUpperCase(), nameMatch: true, reason: '', at: new Date().toISOString() },
  }
  await worker.query(`UPDATE workers SET profile = COALESCE(profile,'{}'::jsonb) || $2::jsonb, bank_status='Verified' WHERE id=$1`, [WORKER_ID, JSON.stringify(bank)])

  // Sync the worker service's denormalised snapshot to the ledger we just wrote, so the worker app
  // and the admin panel report the same money.
  const jobs = income.filter((r) => r.category === 'Job Earnings').length
  await worker.query('UPDATE workers SET balance=$2, earnings=$3, hold=$4, withdrawn=$5, pending=0, advance_outstanding=0, jobs=GREATEST(jobs,$6) WHERE id=$1',
    [WORKER_ID, available, earned, inFlight, paid, jobs])

  const inc = income.filter((r) => ['Incentive'].includes(r.category)).reduce((s, r) => s + r.amount, 0)
  const bon = income.filter((r) => ['Bonus', 'Sitara Bonus'].includes(r.category)).reduce((s, r) => s + r.amount, 0)
  console.log(`  income rows   ${String(income.length).padStart(4)}   earned      ₹${earned.toLocaleString('en-IN')}`)
  console.log(`  deductions    ${String(deductions.length).padStart(4)}   deducted    ₹${dedTotal.toLocaleString('en-IN')}`)
  console.log(`  payouts       ${String(withdrawals.length).padStart(4)}   paid        ₹${paid.toLocaleString('en-IN')}  (in flight ₹${inFlight.toLocaleString('en-IN')})`)
  console.log(`  incentives    ₹${inc.toLocaleString('en-IN')}   bonuses ₹${bon.toLocaleString('en-IN')}`)
  console.log(`  available     ₹${available.toLocaleString('en-IN')}`)
  console.log(`\nOpen: Workers → ${w.name} → Earnings & Payouts`)
  await Promise.all([wallet.end(), worker.end()])
}
run().catch((e) => { console.error('seed failed:', e.message); process.exit(1) })
