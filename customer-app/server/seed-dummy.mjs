// Rich dummy-data seed for the HomeHelp ADMIN portal — populates every screen so the
// visualisation matches the mock slides (full tables, charts, donuts, stat cards).
//
//   node seed-dummy.mjs            # add/refresh dummy data
//   node seed-dummy.mjs --clean    # remove dummy data only
//
// All dummy rows are tagged so re-running is idempotent and the real data is left alone:
//   customers  users.email      LIKE '%@demo.homehelp'
//   workers    workers.email    LIKE '%@demo.pros'
//   admins     admins.email     LIKE '%@homehelp.com'
//   bookings   bookings.ref     LIKE 'HHD%'
//   tickets    tickets.ref      LIKE '#TKD%'
//   complaints complaints.ref   LIKE '#CMPD%'
import { db } from './db.js'
import { hashPw } from './admin-db.js'

const args = process.argv.slice(2)
const CLEAN_ONLY = args.includes('--clean')

const ISO = (d) => d.toISOString()
const daysAgo = (n, hour = 9 + Math.floor(rnd() * 10)) => {
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(hour, Math.floor(rnd() * 60), 0, 0); return d
}
// deterministic-ish PRNG so re-seeds look stable (Math.random avoided per house style not required here)
let _s = 1337
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff }
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
const chance = (p) => rnd() < p

const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Pune', 'Hyderabad', 'Chennai', 'Ahmedabad', 'Kolkata', 'Jaipur', 'Lucknow']
const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Pari', 'Anika', 'Navya', 'Riya', 'Priya', 'Kavya', 'Rohan', 'Karan', 'Nikhil', 'Rahul', 'Amit', 'Sneha', 'Pooja', 'Neha', 'Meera', 'Tanvi']
const LAST = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Singh', 'Iyer', 'Das', 'Gupta', 'Mehta', 'Joshi', 'Rao', 'Kumar', 'Shah', 'Pillai', 'Bose', 'Chopra', 'Kapoor', 'Malhotra', 'Agarwal']

// real service catalogue (so Services booking-counts & item names line up)
const SERVICES = db.prepare('SELECT id,name,icon,price,category FROM services ORDER BY sort').all()

/* ---------------- clean previous dummy rows ---------------- */
function clean() {
  const dueUsers = db.prepare("SELECT id FROM users WHERE email LIKE '%@demo.homehelp'").all().map((r) => r.id)
  if (dueUsers.length) {
    const ph = dueUsers.map(() => '?').join(',')
    db.prepare(`DELETE FROM bookings WHERE user_id IN (${ph})`).run(...dueUsers)
    db.prepare(`DELETE FROM transactions WHERE user_id IN (${ph})`).run(...dueUsers)
    db.prepare(`DELETE FROM tickets WHERE user_id IN (${ph})`).run(...dueUsers)
    db.prepare(`DELETE FROM addresses WHERE user_id IN (${ph})`).run(...dueUsers)
    db.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...dueUsers)
  }
  db.prepare("DELETE FROM bookings WHERE ref LIKE 'HHD%'").run()
  db.prepare("DELETE FROM tickets WHERE ref LIKE '#TKD%'").run()
  db.prepare("DELETE FROM complaints WHERE ref LIKE '#CMPD%'").run()
  db.prepare("DELETE FROM workers WHERE email LIKE '%@demo.pros'").run()
  db.prepare("DELETE FROM admins WHERE email LIKE '%@homehelp.com'").run()
}

clean()
if (CLEAN_ONLY) { console.log('[seed] removed all dummy data'); process.exit(0) }

db.exec('BEGIN')

/* ---------------- workers (pros) ---------------- */
const WORKER_NAMES = ['Rahul Kumar', 'Anjali Verma', 'Suresh Yadav', 'Neha Gupta', 'Imran Shaikh', 'Vikash Pandey', 'Kavita Joshi', 'Anil Verma', 'Sunita Devi', 'Manish Tiwari', 'Deepak Nair', 'Ritu Singh', 'Sanjay Patil', 'Farhan Ali', 'Geeta Rao', 'Mohit Sharma', 'Lakshmi Menon', 'Ravi Teja', 'Pooja Shetty', 'Akash Gupta', 'Divya Pillai', 'Naveen Reddy', 'Sweta Das', 'Harish Chand', 'Megha Jain', 'Vinod Kumar', 'Shalini Roy', 'Arun Prasad', 'Nisha Bano', 'Gaurav Malhotra']
const SKILLS = ['Cleaning', 'Bathroom', 'Kitchen', 'Plumbing', 'Electrical', 'AC', 'Appliance', 'Carpentry', 'Painting', 'Pest Control', 'Beauty', 'Salon', 'Laundry', 'Cooking', 'Gardening']
const iw = db.prepare(`INSERT INTO workers (name,phone,email,city,services,status,verified,rating,jobs,earnings,joined)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
const workerNamePool = []
WORKER_NAMES.forEach((name, i) => {
  const status = chance(0.78) ? 'active' : pick(['pending', 'inactive', 'pending'])
  const jobs = status === 'active' ? int(40, 560) : int(0, 25)
  const slug = name.toLowerCase().replace(/\s+/g, '.')
  iw.run(name, '+91 9' + String(700000000 + i * 1234567).slice(0, 9), `${slug}.${i}@demo.pros`,
    pick(CITIES), JSON.stringify([pick(SKILLS), pick(SKILLS)]),
    status, status === 'active' ? 1 : 0, +(4.2 + rnd() * 0.8).toFixed(1), jobs,
    jobs * int(180, 420), ISO(daysAgo(int(20, 400))))
  if (status === 'active') workerNamePool.push(name)
})
if (!workerNamePool.length) workerNamePool.push('Anjali Verma')

/* ---------------- customers ---------------- */
const iu = db.prepare(`INSERT INTO users (phone,name,email,provider,country,city,wallet,rating,created,status)
  VALUES (?,?,?,?,?,?,?,?,?,?)`)
const customers = []
for (let i = 0; i < 170; i++) {
  const name = `${pick(FIRST)} ${pick(LAST)}`
  const city = pick(CITIES)
  const created = daysAgo(int(0, 160))
  const status = chance(0.93) ? 'active' : 'blocked'
  const info = iu.run('9' + String(int(100000000, 999999999)), name,
    `${name.toLowerCase().replace(/\s+/g, '.')}.${i}@demo.homehelp`, 'phone', 'IN',
    city, int(0, 4) * 250, +(4 + rnd()).toFixed(1), ISO(created), status)
  customers.push({ id: Number(info.lastInsertRowid), name, city, created })
}

/* ---------------- bookings + transactions ---------------- */
const ib = db.prepare(`INSERT INTO bookings
  (ref,user_id,type,freq,note,date,time,address,payment,payment_status,items,duration,
   subtotal,fee,tax,discount,coupon,total,status,service_otp,pro_name,pro_rating,rating,review,created,started_at,completed_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
const it = db.prepare('INSERT INTO transactions (user_id,type,title,amount,balance,ref,created) VALUES (?,?,?,?,?,?,?)')

const PAY_METHODS = ['upi', 'card', 'cash', 'wallet', 'netbanking']
const ALL_STATUS = ['completed', 'completed', 'completed', 'completed', 'confirmed', 'worker_assigned', 'on_the_way', 'in_progress', 'cancelled', 'cancelled']
const REVIEWS = ['Excellent service, very professional!', 'On time and thorough.', 'Great job, will book again.', 'Friendly and efficient.', 'Cleaned everything perfectly.', 'Highly recommended.']
const CANCEL_REASONS = ['Want to change date/time', 'Found a better price', 'No longer needed', 'Booked by mistake']

let bookingSeq = 40000
for (let i = 0; i < 820; i++) {
  const cust = pick(customers)
  // 1–2 services per booking
  const n = chance(0.75) ? 1 : 2
  const items = []
  for (let k = 0; k < n; k++) { const s = pick(SERVICES); items.push({ id: s.id, name: s.name, icon: s.icon, price: s.price, durationLabel: pick(['45 min', '1 hr', '1.5 hr', '2 hr']) }) }
  const subtotal = items.reduce((a, b) => a + b.price, 0) * int(1, 3)
  const fee = 20, tax = Math.round(subtotal * 0.05), discount = chance(0.25) ? int(20, 80) : 0
  const total = subtotal + fee + tax - discount
  const status = pick(ALL_STATUS)
  const created = daysAgo(int(0, 34))
  const ref = 'HHD' + (bookingSeq++)
  const pro = pick(workerNamePool)
  const type = chance(0.5) ? 'instant' : 'schedule'
  let payStatus, rating = null, review = null, startedAt = null, completedAt = null
  if (status === 'completed') {
    payStatus = 'paid'; startedAt = ISO(created); completedAt = ISO(new Date(created.getTime() + int(40, 130) * 60000))
    if (chance(0.7)) { rating = int(3, 5); review = chance(0.6) ? pick(REVIEWS) : null }
  } else if (status === 'cancelled') {
    payStatus = chance(0.6) ? 'refunded' : 'paid'
  } else { payStatus = chance(0.7) ? 'paid' : 'pending' }
  const payment = pick(PAY_METHODS)
  const dateStr = type === 'schedule' ? ISO(daysAgo(int(-7, 5))).slice(0, 10) : null
  const timeStr = type === 'schedule' ? pick(['09:00 AM', '11:00 AM', '02:00 PM', '04:30 PM', '06:00 PM']) : null
  const refund = payStatus === 'refunded' ? total : null
  const info = ib.run(ref, cust.id, type, null, null, dateStr, timeStr,
    `${int(1, 99)}, ${pick(['Green Acres', 'Lake View', 'Sunrise Towers', 'Palm Residency', 'Orchid Apartments'])}, ${cust.city}`,
    payment, payStatus, JSON.stringify(items), items[0].durationLabel,
    subtotal, fee, tax, discount, discount ? 'SAVE' + discount : null, total, status,
    String(int(1000, 9999)), pro, +(4.4 + rnd() * 0.6).toFixed(1), rating, review, ISO(created), startedAt, completedAt)
  // record a payment / refund transaction for the Payments screen
  if (payStatus === 'paid') it.run(cust.id, 'debit', `Payment ${ref}`, total, int(0, 2000), ref, ISO(created))
  if (payStatus === 'refunded') it.run(cust.id, 'credit', `Refund ${ref}`, refund, int(0, 3000), ref, ISO(created))
  if (refund !== null) db.prepare('UPDATE bookings SET refund=?, cancel_reason=?, cancel_fee=? WHERE id=?').run(refund, pick(CANCEL_REASONS), 0, Number(info.lastInsertRowid))
  else if (status === 'cancelled') db.prepare('UPDATE bookings SET cancel_reason=? WHERE id=?').run(pick(CANCEL_REASONS), Number(info.lastInsertRowid))
}
// welcome-bonus credits (mirrors real signups) so the Payments transactions table looks full
customers.forEach((c) => { if (chance(0.85)) it.run(c.id, 'credit', 'Welcome bonus', 1240, 1240, null, ISO(c.created)) })

/* ---------------- support tickets ---------------- */
const itk = db.prepare('INSERT INTO tickets (user_id,category,message,status,ref,created) VALUES (?,?,?,?,?,?)')
const TK_CAT = ['Payment', 'Booking', 'Account', 'Service Quality', 'Refund', 'Technical', 'Other']
const TK_MSG = ['Unable to apply coupon code at checkout.', 'My booking was not confirmed but money deducted.', 'Need to update my registered mobile number.', 'Worker did not show up for the appointment.', 'Refund not received after 5 days.', 'App crashes when I open the wallet.', 'Requesting invoice for last booking.']
const TK_STATUS = ['Open', 'Open', 'In Progress', 'Resolved', 'Resolved', 'Closed']
for (let i = 0; i < 48; i++) {
  const c = pick(customers)
  itk.run(c.id, pick(TK_CAT), pick(TK_MSG), pick(TK_STATUS), '#TKD' + (5000 + i), ISO(daysAgo(int(0, 30))))
}

/* ---------------- complaints ---------------- */
const ic = db.prepare(`INSERT INTO complaints (ref,customer,against,booking_ref,category,message,priority,status,created)
  VALUES (?,?,?,?,?,?,?,?,?)`)
const CMP_CAT = ['Service Quality', 'Late Arrival', 'Payment', 'Behaviour', 'Damage', 'No Show']
const CMP_MSG = ['Bathroom not cleaned properly, had to redo.', 'Professional arrived 45 minutes late.', 'Charged twice for a single booking.', 'Worker was rude during the service.', 'Damaged a vase while cleaning.', 'Worker never arrived for the slot.']
const CMP_PRIO = ['high', 'high', 'medium', 'medium', 'low']
const CMP_STATUS = ['open', 'open', 'in_progress', 'resolved', 'closed']
for (let i = 0; i < 32; i++) {
  const c = pick(customers)
  ic.run('#CMPD' + (2000 + i), c.name, chance(0.7) ? pick(workerNamePool) : null,
    'HHD' + int(40000, 40820), pick(CMP_CAT), pick(CMP_MSG), pick(CMP_PRIO), pick(CMP_STATUS), ISO(daysAgo(int(0, 25))))
}

/* ---------------- admin users (matches the mock names) ---------------- */
const ia = db.prepare('INSERT INTO admins (name,email,phone,pass_hash,role,status,last_login,created) VALUES (?,?,?,?,?,?,?,?)')
const ADMINS = [
  ['Neha Sharma', 'neha.sharma@homehelp.com', 'admin', 'active', 'Delhi', 12],
  ['Rohit Verma', 'rohit.verma@homehelp.com', 'manager', 'active', 'Bangalore', 16],
  ['Priya Mehta', 'priya.mehta@homehelp.com', 'support', 'active', 'Pune', 25],
  ['Ankit Patel', 'ankit.patel@homehelp.com', 'admin', 'active', 'Ahmedabad', 33],
  ['Sneha Reddy', 'sneha.reddy@homehelp.com', 'manager', 'active', 'Hyderabad', 41],
  ['Vikram Singh', 'vikram.singh@homehelp.com', 'manager', 'inactive', 'Chennai', 50],
  ['Kavya Nair', 'kavya.nair@homehelp.com', 'support', 'inactive', 'Kochi', 55],
  ['Arjun Das', 'arjun.das@homehelp.com', 'admin', 'active', 'Kolkata', 60],
  ['Pooja Iyer', 'pooja.iyer@homehelp.com', 'support', 'inactive', 'Jaipur', 70],
]
const hp = hashPw('demo12345')
ADMINS.forEach(([name, email, role, status, , joinAgo], i) => {
  ia.run(name, email, '+91 9' + String(120000000 + i * 1111111).slice(0, 9), hp, role, status,
    status === 'active' ? ISO(daysAgo(int(0, 3))) : ISO(daysAgo(int(20, 60))), ISO(daysAgo(joinAgo + 360)))
})

db.exec('COMMIT')

/* ---------------- report ---------------- */
const c = (sql) => db.prepare(sql).get().n
console.log('[seed] dummy data loaded:')
console.log('  customers :', c("SELECT COUNT(*) n FROM users WHERE email LIKE '%@demo.homehelp'"))
console.log('  workers   :', c("SELECT COUNT(*) n FROM workers WHERE email LIKE '%@demo.pros'"), '(+ existing)')
console.log('  bookings  :', c("SELECT COUNT(*) n FROM bookings WHERE ref LIKE 'HHD%'"))
console.log('  revenue ₹ :', db.prepare("SELECT COALESCE(SUM(total),0) n FROM bookings WHERE ref LIKE 'HHD%' AND (payment_status='paid' OR status='completed')").get().n.toLocaleString('en-IN'))
console.log('  txns      :', c("SELECT COUNT(*) n FROM transactions t JOIN users u ON u.id=t.user_id WHERE u.email LIKE '%@demo.homehelp'"))
console.log('  tickets   :', c("SELECT COUNT(*) n FROM tickets WHERE ref LIKE '#TKD%'"))
console.log('  complaints:', c("SELECT COUNT(*) n FROM complaints WHERE ref LIKE '#CMPD%'"))
console.log('  admins    :', c("SELECT COUNT(*) n FROM admins WHERE email LIKE '%@homehelp.com'"))
