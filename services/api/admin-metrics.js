// Admin analytics/insights — every number here is computed live from the real DB
// (bookings, users, workers, services), so the admin Analytics & Reports screens
// show actual data instead of hardcoded placeholders.
import { db } from './db.js'

const PAID = "(payment_status='paid' OR status='completed')"
const parseItems = (s) => { try { return JSON.parse(s) } catch { return [] } }
const round1 = (n) => Math.round(n * 10) / 10

// Top-N rows by value, with the remainder folded into an "Others" bucket.
function topWithOthers(rows, n = 6) {
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  if (sorted.length <= n) return sorted
  const head = sorted.slice(0, n - 1)
  const others = sorted.slice(n - 1).reduce((s, r) => s + r.value, 0)
  return [...head, { label: 'Others', value: others }]
}

export function adminInsights() {
  const bookings = db.prepare('SELECT id,user_id,items,total,payment,payment_status,status,rating,created FROM bookings').all()

  // ---- per-service + per-payment + per-customer accumulation (single pass) ----
  const svc = new Map()          // name -> { revenue, bookings, completed, cancellations, ratingSum, ratingN }
  const payCount = new Map()     // payment method -> booking count
  const payRevenue = new Map()   // payment method -> revenue
  const perCustomer = new Map()  // user_id -> booking count
  const payingCustomers = new Set()
  let revenue = 0, paidBookings = 0, completed = 0, cancelled = 0

  for (const b of bookings) {
    const paid = b.payment_status === 'paid' || b.status === 'completed'
    if (paid) { revenue += b.total || 0; paidBookings++; payingCustomers.add(b.user_id) }
    if (b.status === 'completed') completed++
    if (b.status === 'cancelled') cancelled++

    perCustomer.set(b.user_id, (perCustomer.get(b.user_id) || 0) + 1)

    const method = (b.payment || 'other').toLowerCase()
    payCount.set(method, (payCount.get(method) || 0) + 1)
    if (paid) payRevenue.set(method, (payRevenue.get(method) || 0) + (b.total || 0))

    const seen = new Set()
    for (const it of parseItems(b.items)) {
      const name = it.name || it.id || 'Service'
      if (!svc.has(name)) svc.set(name, { revenue: 0, bookings: 0, completed: 0, cancellations: 0, ratingSum: 0, ratingN: 0 })
      const s = svc.get(name)
      if (paid) s.revenue += it.price || 0
      if (!seen.has(name)) {                 // count each booking once per distinct service
        seen.add(name)
        s.bookings++
        if (b.status === 'completed') s.completed++
        if (b.status === 'cancelled') s.cancellations++
        if (b.rating) { s.ratingSum += b.rating; s.ratingN++ }
      }
    }
  }

  const totalBookings = bookings.length
  const distinctCustomers = perCustomer.size
  const repeatCustomers = [...perCustomer.values()].filter((n) => n > 1).length
  const newCustomers = [...perCustomer.values()].filter((n) => n === 1).length

  const activeCustomers = db.prepare('SELECT COUNT(*) n FROM users').get().n
  const activeWorkers = db.prepare("SELECT COUNT(*) n FROM workers WHERE status='active'").get().n
  const noShow = db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='cancelled' AND (cancel_reason LIKE '%no-show%' OR cancel_reason LIKE '%no show%' OR cancel_reason LIKE '%unreachable%')").get().n

  const totals = {
    revenue,
    bookings: totalBookings,
    completed,
    cancelled,
    cancellationRate: totalBookings ? round1((cancelled / totalBookings) * 100) : 0,
    activeCustomers,
    activeWorkers,
    aov: paidBookings ? Math.round(revenue / paidBookings) : 0,
    repeatRate: distinctCustomers ? round1((repeatCustomers / distinctCustomers) * 100) : 0,
    clv: payingCustomers.size ? Math.round(revenue / payingCustomers.size) : 0,
    noShowRate: totalBookings ? round1((noShow / totalBookings) * 100) : 0,
  }

  // ---- 30-day series (date, revenue, bookings, completed) ----
  const series = []
  const growth = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const day = d.toISOString().slice(0, 10)
    const rev = db.prepare(`SELECT COALESCE(SUM(total),0) s FROM bookings WHERE substr(created,1,10)=? AND ${PAID}`).get(day).s
    const n = db.prepare('SELECT COUNT(*) n FROM bookings WHERE substr(created,1,10)=?').get(day).n
    const comp = db.prepare("SELECT COUNT(*) n FROM bookings WHERE substr(created,1,10)=? AND status='completed'").get(day).n
    const nu = db.prepare('SELECT COUNT(*) n FROM users WHERE substr(created,1,10)=?').get(day).n
    const canc = db.prepare("SELECT COUNT(*) n FROM bookings WHERE substr(created,1,10)=? AND status='cancelled'").get(day).n
    series.push({ date: day.slice(5), revenue: rev, bookings: n, completed: comp, cancelled: canc })
    growth.push({ date: day.slice(5), n: nu })
  }

  // ---- period-over-period deltas: last 15 days vs the prior 15 days ----
  const half = Math.floor(series.length / 2)
  const sum = (arr, key) => arr.reduce((s, x) => s + x[key], 0)
  const delta = (arr, key) => {
    const prior = sum(arr.slice(0, half), key), recent = sum(arr.slice(half), key)
    return prior ? round1(((recent - prior) / prior) * 100) : null
  }
  const cancelRateDelta = (() => {
    const p = series.slice(0, half), r = series.slice(half)
    const pr = sum(p, 'bookings') ? sum(p, 'cancelled') / sum(p, 'bookings') : 0
    const rr = sum(r, 'bookings') ? sum(r, 'cancelled') / sum(r, 'bookings') : 0
    return round1((rr - pr) * 100)
  })()
  const deltas = {
    revenue: delta(series, 'revenue'),
    bookings: delta(series, 'bookings'),
    completed: delta(series, 'completed'),
    newCustomers: delta(growth, 'n'),
    cancelRate: cancelRateDelta,
  }

  // ---- service breakdowns ----
  const svcRows = [...svc.entries()].map(([name, s]) => ({
    service: name, revenue: s.revenue, bookings: s.bookings, completed: s.completed,
    cancellations: s.cancellations, cancelRate: s.bookings ? round1((s.cancellations / s.bookings) * 100) : 0,
    rating: s.ratingN ? round1(s.ratingSum / s.ratingN) : 0,
  })).sort((a, b) => b.revenue - a.revenue)
  const revenueByService = topWithOthers(svcRows.map((s) => ({ label: s.service, value: s.revenue }))).filter((r) => r.value > 0)

  // ---- payment "channels" (real: by payment method) ----
  const cap = (m) => m === 'upi' ? 'UPI' : m.charAt(0).toUpperCase() + m.slice(1)
  const bookingsByPayment = [...payCount.entries()].map(([m, v]) => ({ label: cap(m), value: v })).sort((a, b) => b.value - a.value)
  const revenueByPayment = [...payRevenue.entries()].map(([m, v]) => ({ label: cap(m), value: v })).sort((a, b) => b.value - a.value)

  // ---- cities (real: from users.city) ----
  const cityRev = db.prepare(`SELECT COALESCE(u.city,'Unknown') label, COALESCE(SUM(b.total),0) value
    FROM bookings b JOIN users u ON u.id=b.user_id
    WHERE (b.payment_status='paid' OR b.status='completed') GROUP BY u.city ORDER BY value DESC LIMIT 5`).all()
  const cityBk = db.prepare(`SELECT COALESCE(u.city,'Unknown') label, COUNT(*) value
    FROM bookings b JOIN users u ON u.id=b.user_id GROUP BY u.city ORDER BY value DESC LIMIT 5`).all()

  // ---- bookings heatmap: 4 time-buckets x 7 weekdays (Mon..Sun), normalized 0..1 ----
  const heatCounts = [[0,0,0,0,0,0,0],[0,0,0,0,0,0,0],[0,0,0,0,0,0,0],[0,0,0,0,0,0,0]]
  for (const b of bookings) {
    const dt = new Date(b.created); if (isNaN(dt)) continue
    const dow = (dt.getDay() + 6) % 7            // 0=Mon .. 6=Sun
    const h = dt.getHours()
    const bucket = h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3
    heatCounts[bucket][dow]++
  }
  const heatMax = Math.max(1, ...heatCounts.flat())
  const heatmap = heatCounts.map((row) => row.map((v) => round1(v / heatMax)))

  // ---- a few genuinely-computed insights ----
  const revDelta = deltas.revenue ?? 0
  const peakDow = (() => {
    const dayTot = [0,0,0,0,0,0,0]
    for (const b of bookings) { const dt = new Date(b.created); if (!isNaN(dt)) dayTot[(dt.getDay() + 6) % 7]++ }
    const names = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    let mi = 0; for (let i = 1; i < 7; i++) if (dayTot[i] > dayTot[mi]) mi = i
    return names[mi]
  })()
  const topSvcName = svcRows[0]?.service || '—'
  const insights = [
    { title: `Revenue ${revDelta >= 0 ? 'is up' : 'is down'} by ${Math.abs(revDelta)}%`, sub: 'comparing the last 15 days with the prior 15 days.' },
    { title: `${peakDow} is the busiest day`, sub: 'by number of bookings this month.' },
    { title: `${topSvcName} is the top service`, sub: 'by revenue across all bookings.' },
    { title: `Cancellation rate is ${totals.cancellationRate}%`, sub: `${cancelled} of ${totalBookings} bookings were cancelled.` },
    { title: `${newCustomers} new customers`, sub: `and ${repeatCustomers} returning customers so far.` },
  ]

  const statusSplit = db.prepare('SELECT status, COUNT(*) n FROM bookings GROUP BY status ORDER BY n DESC').all()

  return {
    totals,
    deltas,
    statusSplit,
    series,
    growth,
    revenueByService,
    topServices: svcRows,
    bookingsByPayment,
    revenueByPayment,
    topCitiesByRevenue: cityRev,
    topCitiesByBookings: cityBk,
    newVsReturning: [{ label: 'New Customers', value: newCustomers }, { label: 'Returning Customers', value: repeatCustomers }],
    heatmap,
    insights,
  }
}
