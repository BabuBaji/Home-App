// One-time data migration: HomeHelp monolith SQLite (services/api/homehelp.db) → the
// per-service Postgres databases. Idempotent (ON CONFLICT DO NOTHING) and resilient (skips
// tables that don't exist in the source). Run once, on the HOST, with the compose stack up:
//
//   node infra/migrate/index.js            # uses default localhost DB ports (5432–5440)
//
// Services seed their own demo data on boot, so this is only needed to carry over REAL data
// from an existing monolith DB. After it runs, the balance snapshots on workers already hold
// their money; the ledgers are historical.
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQLITE = process.env.SQLITE_PATH || join(__dirname, '..', '..', 'services', 'api', 'homehelp.db')
const H = process.env.PG_HOST || 'localhost'
const url = (port, db) => `postgres://homehelp:homehelp@${H}:${port}/${db}`
const DBS = {
  auth: url(5433, 'auth'), catalog: url(5432, 'catalog'), booking: url(5436, 'booking'),
  worker: url(5435, 'worker'), wallet: url(5439, 'wallet'), payment: url(5438, 'payment'),
  admin: url(5440, 'admin'), notification: url(5434, 'notification'),
}

const sq = new DatabaseSync(SQLITE, { readOnly: true })
const has = (t) => !!sq.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t)
const rows = (t) => (has(t) ? sq.prepare(`SELECT * FROM ${t}`).all() : [])

const pools = Object.fromEntries(Object.entries(DBS).map(([k, u]) => [k, new pg.Pool({ connectionString: u })]))
let counts = {}
async function insert(dbKey, sql, vals, label) {
  try { const r = await pools[dbKey].query(sql, vals); counts[label] = (counts[label] || 0) + (r.rowCount || 0) }
  catch (e) { console.error(`  ! ${label}:`, e.message) }
}
// After inserting explicit ids, bump the SERIAL sequence past the max id.
async function fixSeq(dbKey, table) {
  try { await pools[dbKey].query(`SELECT setval(pg_get_serial_sequence('${table}','id'), COALESCE((SELECT MAX(id) FROM ${table}),1))`) } catch {}
}

async function run() {
  console.log('Migrating from', SQLITE)

  // ---- auth: users, addresses, transactions ----
  for (const u of rows('users'))
    await insert('auth', `INSERT INTO users (id,phone,name,email,provider,avatar,country,city,location,wallet,rating,status,created)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,'active'),COALESCE($13,now())) ON CONFLICT (id) DO NOTHING`,
      [u.id, u.phone, u.name, u.email, u.provider, u.avatar, u.country, u.city, u.location, u.wallet, u.rating, u.status, u.created], 'users')
  for (const a of rows('addresses'))
    await insert('auth', `INSERT INTO addresses (id,user_id,label,line,house,apartment,street,landmark,city,pincode,is_default)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.user_id, a.label, a.line, a.house, a.apartment, a.street, a.landmark, a.city, a.pincode, !!a.is_default], 'addresses')
  for (const t of rows('transactions'))
    await insert('auth', `INSERT INTO transactions (id,user_id,type,title,amount,balance,ref,created) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,now())) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.user_id, t.type, t.title, t.amount, t.balance, t.ref, t.created], 'transactions')
  await fixSeq('auth', 'users'); await fixSeq('auth', 'addresses'); await fixSeq('auth', 'transactions')

  // ---- catalog: services (upsert over the seed) ----
  for (const s of rows('services'))
    await insert('catalog', `INSERT INTO services (id,name,icon,price,category,available,sort) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, available=EXCLUDED.available`,
      [s.id, s.name, s.icon, s.price, s.category, !!s.available, s.sort || 0], 'services')

  // ---- booking: bookings, favourites ----
  for (const b of rows('bookings'))
    await insert('booking', `INSERT INTO bookings (id,ref,user_id,type,freq,note,date,time,address,payment,payment_status,items,duration,
        subtotal,fee,tax,discount,coupon,total,status,service_otp,pro_name,pro_rating,worker_id,settled,cust_lat,cust_lng,worker_lat,worker_lng,
        work_photo,rating,review,photo,cancel_reason,cancel_fee,refund,cancelled_by,worker_comp,refund_status,started_at,completed_at,created)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,COALESCE($42,now()))
      ON CONFLICT (id) DO NOTHING`,
      [b.id, b.ref, b.user_id, b.type, b.freq, b.note, b.date, b.time, b.address, b.payment, b.payment_status, b.items, b.duration,
        b.subtotal, b.fee, b.tax, b.discount, b.coupon, b.total, b.status, b.service_otp, b.pro_name, b.pro_rating, b.worker_id, b.settled ? 1 : 0,
        b.cust_lat, b.cust_lng, b.worker_lat, b.worker_lng, b.work_photo, b.rating, b.review, b.photo, b.cancel_reason, b.cancel_fee, b.refund,
        b.cancelled_by, b.worker_comp, b.refund_status, b.started_at, b.completed_at, b.created], 'bookings')
  for (const f of rows('favourites'))
    await insert('booking', `INSERT INTO favourites (user_id,service_id,created) VALUES ($1,$2,COALESCE($3,now())) ON CONFLICT DO NOTHING`, [f.user_id, f.service_id, f.created], 'favourites')
  await fixSeq('booking', 'bookings')

  // ---- worker: workers, documents ----
  for (const w of rows('workers'))
    await insert('worker', `INSERT INTO workers (id,name,phone,email,city,services,avatar,status,verified,rating,jobs,earnings,balance,pending,hold,withdrawn,advance_outstanding,available,last_lat,last_lng,bank_status)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) ON CONFLICT (id) DO NOTHING`,
      [w.id, w.name, w.phone, w.email, w.city, w.services || '[]', w.avatar, w.status, !!w.verified, w.rating, w.jobs, w.earnings,
        w.balance || 0, w.pending || 0, w.hold || 0, w.withdrawn || 0, w.advance_outstanding || 0, w.available == null ? true : !!w.available, w.last_lat, w.last_lng, w.bank_status || 'Pending'], 'workers')
  for (const d of rows('worker_documents'))
    await insert('worker', `INSERT INTO worker_documents (id,worker_id,name,file_name,status,created) VALUES ($1,$2,$3,$4,$5,COALESCE($6,now())) ON CONFLICT (id) DO NOTHING`, [d.id, d.worker_id, d.name, d.file_name, d.status, d.created], 'worker_documents')
  await fixSeq('worker', 'workers'); await fixSeq('worker', 'worker_documents')

  // ---- wallet: ledger tables ----
  const walletTables = { worker_income: 'worker_income', worker_deductions: 'worker_deductions', worker_withdrawals: 'worker_withdrawals', worker_advances: 'worker_advances', worker_payslips: 'worker_payslips', worker_notifications: 'worker_notifications' }
  for (const t of Object.keys(walletTables))
    for (const r of rows(t)) {
      const cols = Object.keys(r); const ph = cols.map((_, i) => `$${i + 1}`).join(',')
      await insert('wallet', `INSERT INTO ${t} (${cols.join(',')}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`, cols.map((c) => r[c]), t)
    }
  for (const t of Object.keys(walletTables)) await fixSeq('wallet', t)

  // ---- payment: finance tables ----
  for (const t of ['payments', 'settlements', 'payouts', 'wallet_ledger', 'webhook_events'])
    for (const r of rows(t)) {
      const cols = Object.keys(r); const ph = cols.map((_, i) => `$${i + 1}`).join(',')
      await insert('payment', `INSERT INTO ${t} (${cols.join(',')}) VALUES (${ph}) ON CONFLICT DO NOTHING`, cols.map((c) => r[c]), t)
    }

  // ---- admin: admins, settings, audit_log ----
  for (const a of rows('admins'))
    await insert('admin', `INSERT INTO admins (id,name,email,phone,pass_hash,role,status,avatar,last_login,created) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,now())) ON CONFLICT (email) DO NOTHING`,
      [a.id, a.name, a.email, a.phone, a.pass_hash, a.role, a.status, a.avatar, a.last_login, a.created], 'admins')
  for (const s of rows('settings'))
    if (s.key !== '__seeded') await insert('admin', `INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [s.key, s.value], 'settings')
  for (const a of rows('audit_log'))
    await insert('admin', `INSERT INTO audit_log (id,admin,action,target,created) VALUES ($1,$2,$3,$4,COALESCE($5,now())) ON CONFLICT (id) DO NOTHING`, [a.id, a.admin, a.action, a.target, a.created], 'audit_log')
  await fixSeq('admin', 'admins'); await fixSeq('admin', 'audit_log')

  // ---- notification: tickets, complaints ----
  for (const t of rows('tickets'))
    await insert('notification', `INSERT INTO tickets (id,user_id,category,message,status,response,ref,created) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,now())) ON CONFLICT (id) DO NOTHING`, [t.id, t.user_id, t.category, t.message, t.status, t.response, t.ref, t.created], 'tickets')
  for (const c of rows('complaints'))
    await insert('notification', `INSERT INTO complaints (id,ref,customer,against,booking_ref,category,message,priority,status,created) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,now())) ON CONFLICT (id) DO NOTHING`, [c.id, c.ref, c.customer, c.against, c.booking_ref, c.category, c.message, c.priority, c.status, c.created], 'complaints')
  await fixSeq('notification', 'tickets'); await fixSeq('notification', 'complaints')

  console.log('Migrated rows:', counts)
  await Promise.all(Object.values(pools).map((p) => p.end()))
  sq.close()
}
run().catch((e) => { console.error('migration failed:', e); process.exit(1) })
