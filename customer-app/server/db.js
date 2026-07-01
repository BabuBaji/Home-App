// Real SQLite persistence using Node's built-in driver (Node 22.5+/24).
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SERVICES_SEED, SERVICE_IMAGES, CATEGORIES } from './catalog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const db = new DatabaseSync(join(__dirname, 'homehelp.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    phone    TEXT, name TEXT NOT NULL DEFAULT 'Guest User', email TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT 'phone', avatar TEXT,
    country  TEXT, city TEXT, location TEXT,
    wallet   INTEGER NOT NULL DEFAULT 1240, rating REAL NOT NULL DEFAULT 5.0, created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    label TEXT NOT NULL, line TEXT NOT NULL,
    house TEXT, apartment TEXT, street TEXT, landmark TEXT, city TEXT, pincode TEXT,
    is_default INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, price INTEGER NOT NULL,
    category TEXT NOT NULL, available INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL, user_id INTEGER NOT NULL,
    type TEXT NOT NULL, freq TEXT, note TEXT, date TEXT, time TEXT,
    address TEXT NOT NULL, payment TEXT NOT NULL, payment_status TEXT NOT NULL DEFAULT 'pending',
    items TEXT NOT NULL, duration TEXT,
    subtotal INTEGER NOT NULL, fee INTEGER NOT NULL, tax INTEGER NOT NULL DEFAULT 0,
    discount INTEGER NOT NULL DEFAULT 0, coupon TEXT, total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed', service_otp TEXT NOT NULL,
    pro_name TEXT NOT NULL DEFAULT 'Anjali Verma', pro_rating REAL NOT NULL DEFAULT 4.8,
    rating INTEGER, review TEXT, photo TEXT, cancel_reason TEXT, cancel_fee INTEGER, refund INTEGER,
    created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL,
    title TEXT NOT NULL, amount INTEGER NOT NULL, balance INTEGER NOT NULL, ref TEXT, created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, category TEXT NOT NULL,
    message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Open', ref TEXT, created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS favourites (
    user_id INTEGER NOT NULL, service_id TEXT NOT NULL, created TEXT NOT NULL,
    PRIMARY KEY (user_id, service_id)
  );
`)

// Migration: timestamps for when the service actually started (OTP verified) and
// finished — so we can show the real time the worker spent, not just the booked duration.
try { db.exec('ALTER TABLE bookings ADD COLUMN started_at TEXT') } catch { /* column already exists */ }
try { db.exec('ALTER TABLE bookings ADD COLUMN completed_at TEXT') } catch { /* column already exists */ }

// Migration: richer cancellation record (who cancelled, when, worker compensation, refund state).
try { db.exec('ALTER TABLE bookings ADD COLUMN cancelled_by TEXT') } catch { /* exists */ }
try { db.exec('ALTER TABLE bookings ADD COLUMN cancel_time TEXT') } catch { /* exists */ }
try { db.exec('ALTER TABLE bookings ADD COLUMN worker_comp INTEGER') } catch { /* exists */ }
try { db.exec('ALTER TABLE bookings ADD COLUMN refund_status TEXT') } catch { /* exists */ }

export { CATEGORIES }

// Upsert the catalogue on every boot so name/price/icon/category changes (e.g. the
// Snabbit rename) apply to an already-seeded DB without wiping bookings.
{
  const up = db.prepare(`INSERT INTO services (id,name,icon,price,category,available,sort)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, icon=excluded.icon,
      price=excluded.price, category=excluded.category, sort=excluded.sort`)
  SERVICES_SEED.forEach((r, i) => up.run(...r, i))
  // prune services removed from the catalogue (past bookings keep their own item snapshots)
  const keep = SERVICES_SEED.map((r) => `'${r[0]}'`).join(',')
  db.exec(`DELETE FROM services WHERE id NOT IN (${keep})`)
  console.log(`[db] synced ${SERVICES_SEED.length} services`)
}

const now = () => new Date().toISOString()

/* ---------- services ---------- */
export function getServices() {
  return db.prepare('SELECT id,name,icon,price,category,available FROM services ORDER BY sort').all()
    .map((s) => ({ ...s, available: !!s.available, image: SERVICE_IMAGES[s.id] || null }))
}
export function getServiceById(id) {
  const s = db.prepare('SELECT id,name,icon,price,category,available FROM services WHERE id=?').get(id)
  return s ? { ...s, available: !!s.available, image: SERVICE_IMAGES[s.id] || null } : null
}
export function updateService(id, patch) {
  const cur = db.prepare('SELECT * FROM services WHERE id=?').get(id)
  if (!cur) return null
  const price = patch.price ?? cur.price
  const available = patch.available === undefined ? cur.available : patch.available ? 1 : 0
  db.prepare('UPDATE services SET price=?, available=? WHERE id=?').run(price, available, id)
  return getServiceById(id)
}

/* ---------- users ---------- */
// New accounts start with just a welcome wallet credit. No fake name or
// addresses — the user supplies those during onboarding (name + location).
function provisionExtras(uid) {
  db.prepare('INSERT INTO transactions (user_id,type,title,amount,balance,created) VALUES (?,?,?,?,?,?)')
    .run(uid, 'credit', 'Welcome bonus', 1240, 1240, now())
}
export function findOrCreateUser(phone) {
  let u = db.prepare('SELECT * FROM users WHERE phone=?').get(phone)
  if (!u) {
    // name left empty so the app routes the user to the "What's your name?" step.
    const info = db.prepare('INSERT INTO users (phone,name,email,provider,country,created) VALUES (?,?,?,?,?,?)')
      .run(phone, '', '', 'phone', 'IN', now())
    provisionExtras(info.lastInsertRowid)
    u = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid)
  }
  return u
}
export function findOrCreateGoogleUser({ email, name, avatar }) {
  let u = db.prepare('SELECT * FROM users WHERE email=?').get(email)
  if (!u) {
    const info = db.prepare('INSERT INTO users (phone,name,email,provider,avatar,country,created) VALUES (?,?,?,?,?,?,?)')
      .run(null, name || '', email, 'google', avatar || null, 'IN', now())
    provisionExtras(info.lastInsertRowid)
    u = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid)
  }
  return u
}
// When the user confirms their location and has no address yet, create a
// default "Home" address from the chosen place so bookings have somewhere to go.
export function ensureDefaultAddressFromLocation(uid, city, location) {
  if (!location && !city) return
  const n = db.prepare('SELECT COUNT(*) AS n FROM addresses WHERE user_id=?').get(uid).n
  if (n > 0) return
  db.prepare('INSERT INTO addresses (user_id,label,line,city,is_default) VALUES (?,?,?,?,1)')
    .run(uid, 'Home', location || city, city || null)
}
export function getUser(id) { return db.prepare('SELECT * FROM users WHERE id=?').get(id) }
export function updateUser(id, patch) {
  const u = getUser(id); if (!u) return null
  db.prepare('UPDATE users SET name=?, email=?, phone=?, country=?, city=?, location=? WHERE id=?')
    .run(patch.name ?? u.name, patch.email ?? u.email, patch.phone ?? u.phone,
      patch.country ?? u.country, patch.city ?? u.city, patch.location ?? u.location, id)
  return getUser(id)
}

/* ---------- addresses ---------- */
export function getAddresses(uid) { return db.prepare('SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC, id').all(uid) }
export function addAddress(uid, a) {
  const line = a.line || [a.house, a.apartment, a.street, a.landmark, a.city, a.pincode].filter(Boolean).join(', ')
  const info = db.prepare(`INSERT INTO addresses (user_id,label,line,house,apartment,street,landmark,city,pincode,is_default)
    VALUES (?,?,?,?,?,?,?,?,?,0)`).run(uid, a.label || 'Other', line, a.house, a.apartment, a.street, a.landmark, a.city, a.pincode)
  return db.prepare('SELECT * FROM addresses WHERE id=?').get(info.lastInsertRowid)
}
export function setDefaultAddress(uid, id) {
  db.prepare('UPDATE addresses SET is_default=0 WHERE user_id=?').run(uid)
  db.prepare('UPDATE addresses SET is_default=1 WHERE id=? AND user_id=?').run(id, uid)
  return getAddresses(uid)
}
export function deleteAddress(uid, id) {
  db.prepare('DELETE FROM addresses WHERE id=? AND user_id=?').run(id, uid)
  return getAddresses(uid)
}

/* ---------- wallet ---------- */
export function getTransactions(uid) { return db.prepare('SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC').all(uid) }
export function addTransaction(uid, type, title, amount, ref) {
  const u = getUser(uid)
  const newBal = type === 'credit' ? u.wallet + amount : u.wallet - amount
  db.prepare('UPDATE users SET wallet=? WHERE id=?').run(newBal, uid)
  db.prepare('INSERT INTO transactions (user_id,type,title,amount,balance,ref,created) VALUES (?,?,?,?,?,?,?)')
    .run(uid, type, title, amount, newBal, ref ?? null, now())
  return newBal
}

/* ---------- bookings ---------- */
function rowToBooking(r) { return r ? { ...r, items: JSON.parse(r.items) } : null }
export function createBooking(b) {
  const info = db.prepare(`INSERT INTO bookings
    (ref,user_id,type,freq,note,date,time,address,payment,payment_status,items,duration,subtotal,fee,tax,discount,coupon,total,status,service_otp,created)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    b.ref, b.user_id, b.type, b.freq ?? null, b.note ?? null, b.date ?? null, b.time ?? null,
    b.address, b.payment, b.payment_status, JSON.stringify(b.items), b.duration ?? null,
    b.subtotal, b.fee, b.tax, b.discount, b.coupon ?? null, b.total, b.status, b.service_otp, now())
  return getBooking(info.lastInsertRowid)
}
export function getBooking(id) { return rowToBooking(db.prepare('SELECT * FROM bookings WHERE id=?').get(id)) }
export function getBookings(uid) { return db.prepare('SELECT * FROM bookings WHERE user_id=? ORDER BY id DESC').all(uid).map(rowToBooking) }
export function setBookingStatus(id, status) {
  // Stamp the finish time the first time a booking is marked completed, so the actual
  // service duration (completed_at − started_at) can be shown alongside the booked time.
  if (status === 'completed') db.prepare('UPDATE bookings SET status=?, completed_at=COALESCE(completed_at, ?) WHERE id=?').run(status, now(), id)
  else db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status, id)
  return getBooking(id)
}
export function setBookingStarted(id) {
  db.prepare('UPDATE bookings SET status=?, started_at=? WHERE id=?').run('in_progress', now(), id)
  return getBooking(id)
}
export function setPaymentStatus(id, ps) { db.prepare('UPDATE bookings SET payment_status=? WHERE id=?').run(ps, id); return getBooking(id) }
export function rescheduleBooking(id, date, time) { db.prepare('UPDATE bookings SET date=?, time=?, type=? WHERE id=?').run(date, time, 'schedule', id); return getBooking(id) }
export function cancelBookingRow(id, reason, fee, refund, extra = {}) {
  db.prepare(`UPDATE bookings SET status=?, cancel_reason=?, cancel_fee=?, refund=?,
      cancelled_by=?, cancel_time=?, worker_comp=?, refund_status=? WHERE id=?`)
    .run('cancelled', reason, fee, refund,
      extra.cancelledBy || 'customer', now(), extra.workerComp || 0,
      extra.refundStatus || (refund > 0 ? 'refunded' : 'none'), id)
  return getBooking(id)
}
export function setBookingReview(id, rating, review, photo) {
  db.prepare('UPDATE bookings SET rating=?, review=?, photo=? WHERE id=?').run(rating, review ?? null, photo ?? null, id)
  return getBooking(id)
}

/* ---------- favourites ---------- */
export function getFavourites(uid) {
  return db.prepare('SELECT service_id FROM favourites WHERE user_id=? ORDER BY created DESC').all(uid).map((r) => r.service_id)
}
export function addFavourite(uid, sid) {
  db.prepare('INSERT OR IGNORE INTO favourites (user_id,service_id,created) VALUES (?,?,?)').run(uid, sid, now())
  return getFavourites(uid)
}
export function removeFavourite(uid, sid) {
  db.prepare('DELETE FROM favourites WHERE user_id=? AND service_id=?').run(uid, sid)
  return getFavourites(uid)
}

/* ---------- support ---------- */
export function createTicket(uid, category, message) {
  const ref = '#TK' + Math.floor(1000 + Math.random() * 8999)
  const info = db.prepare('INSERT INTO tickets (user_id,category,message,status,ref,created) VALUES (?,?,?,?,?,?)')
    .run(uid, category, message, 'Open', ref, now())
  return db.prepare('SELECT * FROM tickets WHERE id=?').get(info.lastInsertRowid)
}
export function getTickets(uid) { return db.prepare('SELECT * FROM tickets WHERE user_id=? ORDER BY id DESC').all(uid) }
