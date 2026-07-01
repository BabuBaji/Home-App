// Admin-side persistence: workers, admin users, settings (incl. API keys),
// complaints and an audit log. Shares the same SQLite file as the customer app
// (db.js) so the admin manages real customers, bookings, payments and services.
import crypto from 'node:crypto'
import { db } from './db.js'

const now = () => new Date().toISOString()

db.exec(`
  CREATE TABLE IF NOT EXISTS workers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, phone TEXT, email TEXT,
    city TEXT, services TEXT NOT NULL DEFAULT '[]', avatar TEXT,
    status TEXT NOT NULL DEFAULT 'active',          -- active | inactive | pending | suspended
    verified INTEGER NOT NULL DEFAULT 0,
    rating REAL NOT NULL DEFAULT 4.7, jobs INTEGER NOT NULL DEFAULT 0,
    earnings INTEGER NOT NULL DEFAULT 0, joined TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT,
    pass_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'manager', -- super | admin | manager | support
    status TEXT NOT NULL DEFAULT 'active', avatar TEXT,
    last_login TEXT, created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL,
    customer TEXT NOT NULL, against TEXT, booking_ref TEXT,
    category TEXT NOT NULL, message TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',          -- low | medium | high
    status TEXT NOT NULL DEFAULT 'open',              -- open | in_progress | resolved | closed
    created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, admin TEXT NOT NULL,
    action TEXT NOT NULL, target TEXT, created TEXT NOT NULL
  );
`)

// Migration: let admins block/unblock customers (the customer app's users table
// has no status column of its own).
try { db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'") } catch { /* exists */ }

/* ---------- password hashing (scrypt) ---------- */
export function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex')
  return `${salt}:${hash}`
}
export function verifyPw(pw, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  const test = crypto.scryptSync(pw, salt, 32).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'))
}

/* ---------- seed (runs once) ---------- */
const DEFAULT_SETTINGS = {
  platform_name: 'HomeHelp',
  support_email: 'support@homehelp.in',
  support_phone: '+91 1800 200 3000',
  currency: 'INR',
  currency_symbol: '₹',
  timezone: 'GMT+5:30 (IST)',
  platform_fee: '20',          // ₹ booking fee
  tax_percent: '5',            // GST %
  cancel_fee: '50',            // travel fee once a worker is on the way (instant bookings)
  cancel_arrival_pct: '100',   // % of the bill charged if cancelled after the worker arrives
  cancel_sched_full_hrs: '6',  // scheduled: cancel >6h before slot → full refund
  cancel_sched_half_hrs: '3',  // scheduled: cancel 3–6h before slot → partial refund
  cancel_sched_half_pct: '50', // scheduled: partial-refund percentage
  commission_percent: '20',    // platform cut of worker earnings
  auto_assign: 'true',
  maintenance_mode: 'false',
  // ---- API keys / integrations (the "backend API keys") ----
  razorpay_key_id: '',
  razorpay_key_secret: '',
  google_maps_key: '',
  msg91_key: '',               // SMS / OTP
  firebase_server_key: '',     // push notifications
  smtp_host: '', smtp_user: '', smtp_pass: '',
}

function seed() {
  const seeded = db.prepare('SELECT value FROM settings WHERE key=?').get('__seeded')
  // settings: insert any missing default keys (idempotent, additive)
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)')
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v)
  if (seeded) return

  // default super admin — change the password after first login
  db.prepare('INSERT OR IGNORE INTO admins (name,email,phone,pass_hash,role,status,created) VALUES (?,?,?,?,?,?,?)')
    .run('Super Admin', 'admin@homehelp.in', '+91 90000 00000', hashPw('admin123'), 'super', 'active', now())
  db.prepare('INSERT OR IGNORE INTO admins (name,email,phone,pass_hash,role,status,created) VALUES (?,?,?,?,?,?,?)')
    .run('Ops Manager', 'ops@homehelp.in', '+91 90000 11111', hashPw('ops12345'), 'manager', 'active', now())

  // seed a fleet of workers (pros)
  const W = [
    ['Rakesh Kumar', 'Cleaning,Bathroom', 'Mumbai', 'active', 1, 4.9, 312, 84200],
    ['Pooja Mehta', 'Beauty,Salon', 'Delhi', 'active', 1, 4.8, 221, 61500],
    ['Suresh Yadav', 'Plumbing,Electrical', 'Pune', 'active', 1, 4.7, 540, 132000],
    ['Neha Gupta', 'Cleaning,Kitchen', 'Bengaluru', 'active', 1, 4.9, 188, 49800],
    ['Imran Shaikh', 'AC,Appliance', 'Hyderabad', 'active', 1, 4.6, 402, 158000],
    ['Vikash Pandey', 'Carpentry,Painting', 'Chennai', 'pending', 0, 4.5, 12, 3200],
    ['Kavita Joshi', 'Laundry,Cleaning', 'Ahmedabad', 'active', 1, 4.8, 95, 21400],
    ['Anil Verma', 'Pest Control,Gardening', 'Kolkata', 'inactive', 1, 4.4, 76, 18900],
    ['Sunita Devi', 'Care,Cooking', 'Jaipur', 'active', 1, 4.9, 154, 38600],
    ['Manish Tiwari', 'Plumbing,Carpentry', 'Lucknow', 'pending', 0, 4.3, 5, 1100],
  ]
  const iw = db.prepare(`INSERT INTO workers (name,phone,email,city,services,status,verified,rating,jobs,earnings,joined)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  W.forEach((w, i) => {
    const [name, services, city, status, verified, rating, jobs, earnings] = w
    const slug = name.toLowerCase().replace(/\s+/g, '.')
    iw.run(name, `+91 9${String(800000000 + i * 11111).slice(0, 9)}`, `${slug}@pros.homehelp.in`,
      city, JSON.stringify(services.split(',')), status, verified, rating, jobs, earnings, now())
  })

  // a few complaints
  const ic = db.prepare(`INSERT INTO complaints (ref,customer,against,booking_ref,category,message,priority,status,created)
    VALUES (?,?,?,?,?,?,?,?,?)`)
  ic.run('#CMP1042', 'Priya Sharma', 'Rakesh Kumar', '#HH40231', 'Service Quality', 'Bathroom not cleaned properly, had to redo.', 'high', 'open', now())
  ic.run('#CMP1043', 'Rohit Verma', 'Pooja Mehta', '#HH40198', 'Late Arrival', 'Professional arrived 45 minutes late.', 'medium', 'in_progress', now())
  ic.run('#CMP1044', 'Anjali Nair', null, '#HH40150', 'Payment', 'Charged twice for a single booking.', 'high', 'open', now())

  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('__seeded', '1')
  console.log('[admin-db] seeded admins, workers, settings, complaints')
}
seed()

/* ---------- settings ---------- */
export function getSettings() {
  const rows = db.prepare('SELECT key,value FROM settings').all()
  const out = {}
  for (const r of rows) if (r.key !== '__seeded') out[r.key] = r.value
  return out
}
// Mask secrets for the client (show only that a key is set + last 4 chars).
const SECRET_KEYS = ['razorpay_key_secret', 'msg91_key', 'firebase_server_key', 'smtp_pass', 'google_maps_key']
export function getPublicSettings() {
  const s = getSettings()
  for (const k of SECRET_KEYS) {
    if (s[k]) s[k] = '••••••••' + String(s[k]).slice(-4)
  }
  return s
}
export function updateSettings(patch) {
  const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === '__seeded') continue
    // ignore masked secret values sent back unchanged from the UI
    if (SECRET_KEYS.includes(k) && String(v).startsWith('••••')) continue
    up.run(k, String(v))
  }
  return getPublicSettings()
}
export function getSetting(key, fallback = '') {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key)
  return r ? r.value : fallback
}

/* ---------- admins ---------- */
export function getAdminByEmail(email) { return db.prepare('SELECT * FROM admins WHERE email=?').get(String(email).toLowerCase()) }
export function getAdmin(id) { return db.prepare('SELECT * FROM admins WHERE id=?').get(id) }
export function listAdmins() {
  return db.prepare('SELECT id,name,email,phone,role,status,avatar,last_login,created FROM admins ORDER BY id').all()
}
export function createAdmin(a) {
  const info = db.prepare('INSERT INTO admins (name,email,phone,pass_hash,role,status,created) VALUES (?,?,?,?,?,?,?)')
    .run(a.name, String(a.email).toLowerCase(), a.phone || null, hashPw(a.password || 'changeme123'), a.role || 'manager', a.status || 'active', now())
  return getAdmin(info.lastInsertRowid)
}
export function updateAdmin(id, patch) {
  const a = getAdmin(id); if (!a) return null
  db.prepare('UPDATE admins SET name=?, phone=?, role=?, status=? WHERE id=?')
    .run(patch.name ?? a.name, patch.phone ?? a.phone, patch.role ?? a.role, patch.status ?? a.status, id)
  if (patch.password) db.prepare('UPDATE admins SET pass_hash=? WHERE id=?').run(hashPw(patch.password), id)
  return getAdmin(id)
}
export function deleteAdmin(id) { db.prepare('DELETE FROM admins WHERE id=?').run(id); return true }
export function touchLogin(id) { db.prepare('UPDATE admins SET last_login=? WHERE id=?').run(now(), id) }
export function publicAdmin(a) {
  return a && { id: a.id, name: a.name, email: a.email, phone: a.phone, role: a.role, status: a.status, avatar: a.avatar, last_login: a.last_login, created: a.created }
}

/* ---------- workers ---------- */
function rowToWorker(w) { return w ? { ...w, services: JSON.parse(w.services || '[]'), verified: !!w.verified } : null }
export function listWorkers({ status, city, q } = {}) {
  let rows = db.prepare('SELECT * FROM workers ORDER BY id DESC').all().map(rowToWorker)
  if (status && status !== 'all') rows = rows.filter((w) => w.status === status)
  if (city && city !== 'all') rows = rows.filter((w) => w.city === city)
  if (q) { const s = q.toLowerCase(); rows = rows.filter((w) => w.name.toLowerCase().includes(s) || (w.phone || '').includes(s) || (w.email || '').toLowerCase().includes(s)) }
  return rows
}
export function getWorker(id) { return rowToWorker(db.prepare('SELECT * FROM workers WHERE id=?').get(id)) }
export function createWorker(w) {
  const info = db.prepare(`INSERT INTO workers (name,phone,email,city,services,status,verified,rating,jobs,earnings,joined)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    w.name, w.phone || null, w.email || null, w.city || null,
    JSON.stringify(w.services || []), w.status || 'pending', w.verified ? 1 : 0,
    w.rating ?? 4.5, w.jobs ?? 0, w.earnings ?? 0, now())
  return getWorker(info.lastInsertRowid)
}
export function updateWorker(id, patch) {
  const w = db.prepare('SELECT * FROM workers WHERE id=?').get(id); if (!w) return null
  db.prepare('UPDATE workers SET name=?, phone=?, email=?, city=?, services=?, status=?, verified=? WHERE id=?').run(
    patch.name ?? w.name, patch.phone ?? w.phone, patch.email ?? w.email, patch.city ?? w.city,
    patch.services ? JSON.stringify(patch.services) : w.services,
    patch.status ?? w.status, patch.verified === undefined ? w.verified : patch.verified ? 1 : 0, id)
  return getWorker(id)
}
export function deleteWorker(id) { db.prepare('DELETE FROM workers WHERE id=?').run(id); return true }
export function workerStats() {
  const all = db.prepare('SELECT status FROM workers').all()
  return {
    total: all.length,
    active: all.filter((w) => w.status === 'active').length,
    pending: all.filter((w) => w.status === 'pending').length,
    inactive: all.filter((w) => w.status === 'inactive' || w.status === 'suspended').length,
  }
}

/* ---------- complaints ---------- */
export function listComplaints({ status, priority } = {}) {
  let rows = db.prepare('SELECT * FROM complaints ORDER BY id DESC').all()
  if (status && status !== 'all') rows = rows.filter((c) => c.status === status)
  if (priority && priority !== 'all') rows = rows.filter((c) => c.priority === priority)
  return rows
}
export function createComplaint(c) {
  const ref = '#CMP' + Math.floor(1000 + Math.random() * 8999)
  const info = db.prepare(`INSERT INTO complaints (ref,customer,against,booking_ref,category,message,priority,status,created)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(ref, c.customer, c.against || null, c.booking_ref || null,
    c.category || 'General', c.message, c.priority || 'medium', 'open', now())
  return db.prepare('SELECT * FROM complaints WHERE id=?').get(info.lastInsertRowid)
}
export function updateComplaint(id, patch) {
  const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(id); if (!c) return null
  db.prepare('UPDATE complaints SET status=?, priority=? WHERE id=?')
    .run(patch.status ?? c.status, patch.priority ?? c.priority, id)
  return db.prepare('SELECT * FROM complaints WHERE id=?').get(id)
}

/* ---------- audit log ---------- */
export function logAudit(admin, action, target) {
  db.prepare('INSERT INTO audit_log (admin,action,target,created) VALUES (?,?,?,?)').run(admin, action, target || null, now())
  // Mirror into the unified cross-app activity feed so the admin's actions appear
  // alongside customer + worker events. Lazy import avoids a load-order cycle.
  try { activityHook?.({ actorType: 'admin', actorName: admin, action: 'admin.' + action, detail: target || null }) } catch { /* ignore */ }
}
// Wired up by activity-db.js after both modules load (breaks the import cycle).
let activityHook = null
export function _setActivityHook(fn) { activityHook = fn }
export function listAudit(limit = 30) {
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit)
}
