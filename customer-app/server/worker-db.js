// Worker-side persistence for the HomeHelp Pro app. Shares the same SQLite file
// (db.js) as the customer and admin apps, so a worker logs in as a real row in
// the `workers` table, picks up real customer bookings as jobs, and their wallet,
// earnings and documents are stored alongside everyone else's data.
//
// The base `workers` table is created by admin-db.js. Here we (a) extend it with
// the profile / wallet / dispatch columns the worker app needs, (b) add child
// tables for wallet transactions, earnings history and verification documents,
// and (c) tag bookings with the worker who is handling them.
import { db } from './db.js'
import { getSetting } from './admin-db.js'

const now = () => new Date().toISOString()

/* ---------- migrations: extend `workers` with worker-app fields ---------- */
const WORKER_COLUMNS = [
  "bank_holder TEXT NOT NULL DEFAULT ''",
  "bank_name TEXT NOT NULL DEFAULT ''",
  "bank_account TEXT NOT NULL DEFAULT ''",
  "bank_ifsc TEXT NOT NULL DEFAULT ''",
  "shift_start TEXT NOT NULL DEFAULT '08:00 AM'",
  "shift_end TEXT NOT NULL DEFAULT '08:00 PM'",
  "available_days TEXT NOT NULL DEFAULT '{}'",
  "job_prefs TEXT NOT NULL DEFAULT '{}'",
  'notif_new_jobs INTEGER NOT NULL DEFAULT 1',
  'notif_payments INTEGER NOT NULL DEFAULT 1',
  'notif_promotions INTEGER NOT NULL DEFAULT 0',
  'notif_ratings INTEGER NOT NULL DEFAULT 1',
  'balance INTEGER NOT NULL DEFAULT 0',
  'withdrawn INTEGER NOT NULL DEFAULT 0',
  'pending INTEGER NOT NULL DEFAULT 0',
  'today_earnings INTEGER NOT NULL DEFAULT 0',
  'today_jobs INTEGER NOT NULL DEFAULT 0',
  'offered_booking INTEGER',
]
for (const col of WORKER_COLUMNS) {
  try { db.exec(`ALTER TABLE workers ADD COLUMN ${col}`) } catch { /* already exists */ }
}

// Tag bookings with the worker handling them + whether earnings were settled.
try { db.exec('ALTER TABLE bookings ADD COLUMN worker_id INTEGER') } catch { /* exists */ }
try { db.exec('ALTER TABLE bookings ADD COLUMN settled INTEGER NOT NULL DEFAULT 0') } catch { /* exists */ }
// Customer location (for the worker's map) + the worker's proof-of-work photo on completion.
try { db.exec('ALTER TABLE bookings ADD COLUMN cust_lat REAL') } catch { /* exists */ }
try { db.exec('ALTER TABLE bookings ADD COLUMN cust_lng REAL') } catch { /* exists */ }
try { db.exec('ALTER TABLE bookings ADD COLUMN work_photo TEXT') } catch { /* exists */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS worker_txns (
    id INTEGER PRIMARY KEY AUTOINCREMENT, worker_id INTEGER NOT NULL,
    title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '',
    amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Success',
    is_credit INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS worker_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, worker_id INTEGER NOT NULL,
    date TEXT NOT NULL, amount INTEGER NOT NULL, paid INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS worker_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, worker_id INTEGER NOT NULL,
    name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending', file_name TEXT NOT NULL DEFAULT ''
  );
`)

/* ---------- defaults seeded onto every new worker ---------- */
const DEFAULT_DAYS = { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false }
const DEFAULT_PREFS = {
  'Utensil Wash': true, Mopping: true, Sweeping: true, Dusting: true,
  'Bathroom Cleaning': true, Laundry: false, 'Kitchen Cleaning': true,
}
const DEFAULT_DOCS = [
  { name: 'Aadhaar Card', status: 'Pending' },
  { name: 'PAN Card', status: 'Pending' },
  { name: 'Police Verification', status: 'Pending' },
  { name: 'Address Proof', status: 'Pending' },
]

function seedDocuments(workerId, docs = DEFAULT_DOCS) {
  const ins = db.prepare('INSERT INTO worker_documents (worker_id,name,status,file_name) VALUES (?,?,?,?)')
  for (const d of docs) ins.run(workerId, d.name, d.status, d.fileName || '')
}

/* ---------- demo worker (matches the worker app's built-in identity) ----------
   Lets the app's default "9000012345" login land on a fully populated profile,
   exactly like the old standalone backend, but now DB-backed and dispatchable. */
function seedDemoWorker() {
  if (db.prepare('SELECT id FROM workers WHERE phone=?').get('9000012345')) return
  const info = db.prepare(`INSERT INTO workers
    (name,phone,email,city,services,status,verified,rating,jobs,earnings,joined,
     bank_holder,bank_name,bank_account,bank_ifsc,shift_start,shift_end,available_days,job_prefs,
     balance,withdrawn,pending,today_earnings,today_jobs)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?,?)`).run(
    'Rahul Kumar', '9000012345', 'rahul.kumar@email.com', 'Mumbai',
    JSON.stringify(['Cleaning', 'Bathroom']), 'active', 1, 4.7, 128, 15680, now(),
    'Rahul Kumar', 'HDFC Bank', 'xxxx xxxx 1234', 'HDFC0001234', '08:00 AM', '08:00 PM',
    JSON.stringify(DEFAULT_DAYS), JSON.stringify(DEFAULT_PREFS),
    8450, 7230, 1200, 650, 4)
  const id = info.lastInsertRowid
  seedDocuments(id, [
    { name: 'Aadhaar Card', status: 'Verified' },
    { name: 'PAN Card', status: 'Verified' },
    { name: 'Police Verification', status: 'Verified' },
    { name: 'Address Proof', status: 'Pending' },
  ])
  const ie = db.prepare('INSERT INTO worker_earnings (worker_id,date,amount,paid,created) VALUES (?,?,?,?,?)')
  ;[['16 May 2025', 650], ['15 May 2025', 810], ['14 May 2025', 540], ['13 May 2025', 620],
    ['12 May 2025', 430], ['11 May 2025', 590], ['10 May 2025', 710]].forEach(([d, a]) => ie.run(id, d, a, 1, now()))
  const it = db.prepare('INSERT INTO worker_txns (worker_id,title,subtitle,amount,status,is_credit,created) VALUES (?,?,?,?,?,?,?)')
  ;[['Job Payment', '16 May 2025, 11:00 AM', 297, 'Success', 1],
    ['Withdraw to Bank', 'A/c No. xxxx1234', 2700, 'Success', 0],
    ['Job Payment', '12 May 2025, 06:30 PM', 349, 'Success', 1],
    ['Incentive', 'Performance Bonus', 50, 'Success', 1],
    ['Pending Amount', '16 May 2025, 05:00 PM', 1200, 'Pending', 1]].forEach(([t, s, a, st, c]) => it.run(id, t, s, a, st, c, now()))
  console.log('[worker-db] seeded demo worker (Rahul Kumar)')
}
seedDemoWorker()

/* ---------- helpers ---------- */
const digits = (p) => String(p || '').replace(/\D/g, '')
function parseJson(s, fallback) { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : fallback } catch { return fallback } }

// Worker's share of a booking total after the platform commission (settings-driven).
export function workerShare(total) {
  const pct = Math.max(0, Math.min(100, Number(getSetting('commission_percent', '20')) || 0))
  return Math.max(0, Math.round((Number(total) || 0) * (1 - pct / 100)))
}

/* ---------- auth ---------- */
// Match on the last 10 digits so "+91 90000 12345" and "9000012345" resolve to one row.
export function findWorkerByPhone(phone) {
  const tail = digits(phone).slice(-10)
  if (!tail) return null
  return db.prepare('SELECT * FROM workers').all().find((w) => digits(w.phone).slice(-10) === tail) || null
}
// A worker logs in with their phone. If an admin already onboarded this number
// (Workers → Add) we match that row; otherwise we create a pending worker they can
// flesh out from their profile screen.
export function findOrCreateWorker(phone) {
  let w = findWorkerByPhone(phone)
  if (!w) {
    const tail = digits(phone).slice(-10) || digits(phone)
    const info = db.prepare(`INSERT INTO workers (name,phone,email,city,services,status,verified,rating,jobs,earnings,joined,available_days,job_prefs)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'New Pro', tail, '', null, '[]', 'pending', 0, 4.5, 0, 0, now(),
      JSON.stringify(DEFAULT_DAYS), JSON.stringify(DEFAULT_PREFS))
    seedDocuments(info.lastInsertRowid)
    w = db.prepare('SELECT * FROM workers WHERE id=?').get(info.lastInsertRowid)
  }
  return w
}
export function getWorkerRow(id) { return db.prepare('SELECT * FROM workers WHERE id=?').get(id) }

/* ---------- mappers (DB row -> the shapes the Kotlin app deserializes) ---------- */
export function workerDto(w) {
  return {
    name: w.name || '', phone: w.phone || '', email: w.email || '', city: w.city || '',
    jobsCompleted: w.jobs || 0, rating: w.rating || 0,
    bankName: w.bank_name || '', bankAccount: w.bank_account || '', bankIfsc: w.bank_ifsc || '', bankHolder: w.bank_holder || '',
    shiftStart: w.shift_start || '', shiftEnd: w.shift_end || '',
    availableDays: parseJson(w.available_days, DEFAULT_DAYS), jobPreferences: parseJson(w.job_prefs, DEFAULT_PREFS),
    notifNewJobs: !!w.notif_new_jobs, notifPayments: !!w.notif_payments,
    notifPromotions: !!w.notif_promotions, notifRatings: !!w.notif_ratings,
  }
}
export function walletDto(w) {
  return {
    balance: w.balance || 0, totalEarned: w.earnings || 0, withdrawnTotal: w.withdrawn || 0,
    pendingAmount: w.pending || 0, todayEarnings: w.today_earnings || 0, todayJobs: w.today_jobs || 0,
  }
}
export function workerEarnings(id) {
  return db.prepare('SELECT date,amount,paid FROM worker_earnings WHERE worker_id=? ORDER BY id DESC').all(id)
    .map((e) => ({ date: e.date, amount: e.amount, paid: !!e.paid }))
}
export function workerTxns(id) {
  return db.prepare('SELECT title,subtitle,amount,status,is_credit FROM worker_txns WHERE worker_id=? ORDER BY id DESC').all(id)
    .map((t) => ({ title: t.title, subtitle: t.subtitle, amount: t.amount, status: t.status, isCredit: !!t.is_credit }))
}
export function workerDocuments(id) {
  return db.prepare('SELECT name,status,file_name FROM worker_documents WHERE worker_id=? ORDER BY id').all(id)
    .map((d) => ({ name: d.name, status: d.status, fileName: d.file_name }))
}

/* ---------- profile mutations ---------- */
export function updateWorkerProfile(id, b) {
  const w = getWorkerRow(id); if (!w) return null
  db.prepare('UPDATE workers SET name=?, phone=?, email=?, city=? WHERE id=?')
    .run(b.name ?? w.name, b.phone ?? w.phone, b.email ?? w.email, b.city ?? w.city, id)
  return workerDto(getWorkerRow(id))
}
export function updateWorkerBank(id, b) {
  const w = getWorkerRow(id); if (!w) return null
  db.prepare('UPDATE workers SET bank_holder=?, bank_name=?, bank_account=?, bank_ifsc=? WHERE id=?')
    .run(b.bankHolder ?? w.bank_holder, b.bankName ?? w.bank_name, b.bankAccount ?? w.bank_account, b.bankIfsc ?? w.bank_ifsc, id)
  return workerDto(getWorkerRow(id))
}
export function updateWorkerAvailability(id, b) {
  const w = getWorkerRow(id); if (!w) return null
  db.prepare('UPDATE workers SET available_days=?, shift_start=?, shift_end=? WHERE id=?')
    .run(JSON.stringify(b.availableDays || parseJson(w.available_days, DEFAULT_DAYS)),
      b.shiftStart ?? w.shift_start, b.shiftEnd ?? w.shift_end, id)
  return workerDto(getWorkerRow(id))
}
export function updateWorkerPreferences(id, b) {
  const w = getWorkerRow(id); if (!w) return null
  db.prepare('UPDATE workers SET job_prefs=? WHERE id=?')
    .run(JSON.stringify(b.jobPreferences || parseJson(w.job_prefs, DEFAULT_PREFS)), id)
  return workerDto(getWorkerRow(id))
}
export function updateWorkerNotifications(id, b) {
  const w = getWorkerRow(id); if (!w) return null
  const v = (x, d) => (x === undefined || x === null ? d : x ? 1 : 0)
  db.prepare('UPDATE workers SET notif_new_jobs=?, notif_payments=?, notif_promotions=?, notif_ratings=? WHERE id=?')
    .run(v(b.notifNewJobs, w.notif_new_jobs), v(b.notifPayments, w.notif_payments),
      v(b.notifPromotions, w.notif_promotions), v(b.notifRatings, w.notif_ratings), id)
  return workerDto(getWorkerRow(id))
}

/* ---------- documents ---------- */
export function uploadWorkerDocument(id, name, fileName) {
  const existing = db.prepare('SELECT id FROM worker_documents WHERE worker_id=? AND name=?').get(id, name)
  if (existing) db.prepare('UPDATE worker_documents SET status=?, file_name=? WHERE id=?').run('Under Review', fileName || '', existing.id)
  else db.prepare('INSERT INTO worker_documents (worker_id,name,status,file_name) VALUES (?,?,?,?)').run(id, name, 'Under Review', fileName || '')
  return workerDocuments(id)
}

/* ---------- wallet ---------- */
export function addWorkerTxn(id, title, subtitle, amount, isCredit, status = 'Success') {
  db.prepare('INSERT INTO worker_txns (worker_id,title,subtitle,amount,status,is_credit,created) VALUES (?,?,?,?,?,?,?)')
    .run(id, title, subtitle || '', amount, status, isCredit ? 1 : 0, now())
}
export function addWorkerEarning(id, date, amount) {
  db.prepare('INSERT INTO worker_earnings (worker_id,date,amount,paid,created) VALUES (?,?,?,?,?)').run(id, date, amount, 1, now())
}
export function walletAdd(id, amount) {
  const w = getWorkerRow(id); if (!w) return null
  db.prepare('UPDATE workers SET balance=? WHERE id=?').run(w.balance + amount, id)
  addWorkerTxn(id, 'Added to Wallet', 'UPI • Instant', amount, true)
  return getWorkerRow(id)
}
export function walletWithdraw(id, amount) {
  const w = getWorkerRow(id); if (!w) return { error: 'Worker not found' }
  if (amount > w.balance) return { error: 'Amount exceeds available balance' }
  db.prepare('UPDATE workers SET balance=?, withdrawn=? WHERE id=?').run(w.balance - amount, w.withdrawn + amount, id)
  addWorkerTxn(id, 'Withdraw to Bank', `A/c No. ${(w.bank_account || 'xxxx1234').slice(-4).padStart(8, 'x')}`, amount, false)
  return { worker: getWorkerRow(id) }
}

/* ---------- booking location + proof-of-work photo ---------- */
export function setBookingCoords(id, lat, lng) {
  if (lat == null || lng == null) return
  db.prepare('UPDATE bookings SET cust_lat=?, cust_lng=? WHERE id=?').run(Number(lat), Number(lng), id)
}
export function setWorkPhoto(id, photo) {
  db.prepare('UPDATE bookings SET work_photo=? WHERE id=?').run(photo || null, id)
}

/* ---------- settlement: credit the worker for a completed booking ---------- */
export function settleBookingForWorker(id, booking) {
  const earn = workerShare(booking.total)
  const w = getWorkerRow(id)
  db.prepare(`UPDATE workers SET balance=balance+?, earnings=earnings+?, jobs=jobs+1,
    today_earnings=today_earnings+?, today_jobs=today_jobs+1 WHERE id=?`).run(earn, earn, earn, id)
  db.prepare('UPDATE bookings SET settled=1 WHERE id=?').run(booking.id)
  const svc = booking.items.map((i) => i.name).join(', ')
  addWorkerTxn(id, 'Job Payment', `${booking.ref} • ${svc}`.slice(0, 60), earn, true)
  addWorkerEarning(id, `Today • ${booking.ref}`, earn)
  return { earn, worker: getWorkerRow(id) }
}
