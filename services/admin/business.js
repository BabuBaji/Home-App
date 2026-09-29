/* Business Performance (Admin ▸ Insights) — orders and money by State → City → Zone.
 *
 * Nothing is stored here: each call asks the owning services for their numbers over the range and
 * joins them on zone. Bookings (orders, GMV, collected, refunds, customers) come from booking;
 * zones (name, city, state) from catalog; experts per zone from worker; money paid to experts
 * (earnings, incentives, salary, payouts) from wallet, mapped to the expert's zone.
 * Every figure is limited to the viewer's territory (admin scope), like the rest of the panel.
 */
import { requireAnyPerm, tryGet, inScope } from '@homehelp/shared'

const DAY = 86400000
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))
const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
const shift = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

export function installBusiness({ app, admin, U }) {
  const WALLET = (process.env.WALLET_URL || 'http://localhost:4009').replace(/\/$/, '')
  const view = requireAnyPerm('reports.view', 'analytics.view', 'finance.view')

  const range = (q) => {
    const to = isDate(q.to) ? q.to : istToday()
    const from = isDate(q.from) ? q.from : to
    const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1)
    return { from, to, days, prevFrom: shift(from, -days), prevTo: shift(from, -1) }
  }
  const zoneVisible = (scope, z) => (z ? inScope(scope, { zoneId: z.id, city: z.city }) : !scope || scope.type === 'all')

  async function gather(from, to) {
    const qs = `?from=${from}&to=${to}`
    const [zones, orders, experts, money] = await Promise.all([
      tryGet(U.catalog, '/api/internal/zones', []),
      tryGet(U.booking, `/internal/business/zones${qs}`, []),
      tryGet(U.worker, '/internal/business/experts', []),
      tryGet(WALLET, `/internal/business/money${qs}`, []),
    ])
    return { zones: zones || [], orders: orders || [], experts: experts || [], money: money || [] }
  }

  const blank = () => ({ orders: 0, completed: 0, cancelled: 0, gmv: 0, revenue: 0, collected: 0, refunds: 0, customers: 0, newCustomers: 0,
    experts: 0, online: 0, expertEarnings: 0, incentives: 0, salary: 0, paidOut: 0, payoutsPending: 0 })
  const NUM = Object.keys(blank())
  const add = (t, x) => { for (const k of NUM) t[k] = (Number(t[k]) || 0) + (Number(x[k]) || 0); return t }
  const finish = (t) => ({ ...t, aov: t.orders - t.cancelled > 0 ? Math.round(t.gmv / (t.orders - t.cancelled)) : 0,
    cancelRate: t.orders ? Math.round((t.cancelled / t.orders) * 1000) / 10 : 0,
    expertCost: t.expertEarnings + t.incentives + t.salary,
    net: t.collected - t.refunds - (t.expertEarnings + t.incentives + t.salary) })

  // One row per zone (plus "No zone" for bookings outside every zone), limited to the viewer's turf.
  function perZone({ zones, orders, experts, money }, scope) {
    const zoneById = new Map(zones.map((z) => [z.id, z]))
    const rows = new Map()
    const row = (zid) => {
      const key = zid ?? 'none'
      if (!rows.has(key)) {
        const z = zoneById.get(zid)
        rows.set(key, { zoneId: zid ?? null, zone: z?.name || 'No zone', city: z?.city || (z ? '—' : 'No zone'), state: z?.state || (z ? '—' : 'Not in any zone'), status: z?.status || '', ...blank() })
      }
      return rows.get(key)
    }
    for (const z of zones) if (zoneVisible(scope, z)) row(z.id)
    for (const o of orders) { const z = zoneById.get(o.zone_id) || null; if (!zoneVisible(scope, z)) continue; add(row(o.zone_id), { ...o, newCustomers: o.newCustomers }) }
    const expertZone = new Map()
    for (const e of experts) {
      const z = zoneById.get(e.zoneId) || null
      expertZone.set(e.id, e.zoneId ?? null)
      if (!zoneVisible(scope, z) || e.status !== 'active') continue
      const r = row(e.zoneId); r.experts++; if (e.online) r.online++
    }
    for (const m of money) {
      const zid = expertZone.has(m.workerId) ? expertZone.get(m.workerId) : null
      if (!zoneVisible(scope, zoneById.get(zid) || null)) continue
      add(row(zid), { expertEarnings: m.earnings, incentives: m.incentives, salary: m.salary + m.other, paidOut: m.paidOut, payoutsPending: m.payoutsPending })
    }
    return [...rows.values()]
  }

  app.get('/api/admin/business/performance', admin, view, async (req, res) => {
    const r = range(req.query)
    const [cur, prev] = await Promise.all([gather(r.from, r.to), gather(r.prevFrom, r.prevTo)])
    const scope = req.admin?.scope
    const now = perZone(cur, scope), before = new Map(perZone(prev, scope).map((z) => [z.zoneId ?? 'none', z]))
    const zones = now.map((z) => { const p = before.get(z.zoneId ?? 'none') || blank(); return { ...finish(z), prev: { orders: p.orders, gmv: p.gmv, collected: p.collected, completed: p.completed } } })
    // State → City → Zone, each level with its own totals.
    const states = {}
    for (const z of zones) {
      const s = states[z.state] || (states[z.state] = { state: z.state, cities: {} })
      const c = s.cities[z.city] || (s.cities[z.city] = { city: z.city, zones: [] })
      c.zones.push(z)
    }
    const sum = (list) => { const t = blank(); const p = { orders: 0, gmv: 0, collected: 0, completed: 0 }; for (const z of list) { add(t, z); for (const k of Object.keys(p)) p[k] += z.prev[k] } return { ...finish(t), prev: p } }
    const tree = Object.values(states).map((s) => {
      const cities = Object.values(s.cities).map((c) => ({ city: c.city, ...sum(c.zones), zones: c.zones.sort((a, b) => b.gmv - a.gmv) })).sort((a, b) => b.gmv - a.gmv)
      return { state: s.state, ...sum(cities.flatMap((c) => c.zones)), cities }
    }).sort((a, b) => b.gmv - a.gmv)
    res.json({ range: r, totals: sum(zones), states: tree })
  })

  app.get('/api/admin/business/trend', admin, view, async (req, res) => {
    const r = range(req.query)
    const zones = await tryGet(U.catalog, '/api/internal/zones', [])
    const scope = req.admin?.scope
    let ids = String(req.query.zoneIds || '').split(',').filter(Boolean)
    const zoneById = new Map((zones || []).map((z) => [String(z.id), z]))
    // Only zones the viewer may see; no ids → all of their zones.
    ids = (ids.length ? ids : [...zoneById.keys(), 'none']).filter((id) => zoneVisible(scope, id === 'none' ? null : zoneById.get(id)))
    if (!ids.length) return res.json({ days: [], services: [] })
    const t = await tryGet(U.booking, `/internal/business/trend?from=${r.from}&to=${r.to}&zoneIds=${ids.join(',')}`, { days: [], services: [] })
    // Fill empty days so the chart has a point for every day.
    const byDay = new Map((t.days || []).map((d) => [d.d, d]))
    const days = []
    for (let i = 0; i < r.days; i++) { const d = shift(r.from, i); days.push(byDay.get(d) || { d, orders: 0, completed: 0, gmv: 0 }) }
    res.json({ range: r, days, services: t.services || [] })
  })

  // Every expert payout (withdrawal) in one list, with the expert and their zone.
  app.get('/api/admin/business/payouts', admin, requireAnyPerm('finance.view', 'wallet.view', 'payments.view'), async (req, res) => {
    const r = range(req.query)
    const [list, experts, zones] = await Promise.all([
      tryGet(WALLET, `/internal/business/withdrawals?from=${r.from}&to=${r.to}${req.query.status ? `&status=${encodeURIComponent(req.query.status)}` : ''}`, []),
      tryGet(U.worker, '/internal/business/experts', []),
      tryGet(U.catalog, '/api/internal/zones', []),
    ])
    const ex = new Map((experts || []).map((e) => [e.id, e]))
    const zb = new Map((zones || []).map((z) => [z.id, z]))
    const scope = req.admin?.scope
    const zoneF = req.query.zoneId ? String(req.query.zoneId) : ''
    const out = (list || []).map((w) => { const e = ex.get(w.workerId); const z = zb.get(e?.zoneId); return { ...w, workerName: e?.name || `Expert #${w.workerId}`, phone: e?.phone || '', zoneId: e?.zoneId ?? null, zone: z?.name || '—', city: z?.city || '—' } })
      .filter((w) => zoneVisible(scope, zb.get(w.zoneId) || null) && (!zoneF || String(w.zoneId ?? 'none') === zoneF))
    const tot = (st) => out.filter((w) => st.includes(w.status)).reduce((s, w) => s + (w.amount || 0), 0)
    res.json({ range: r, summary: { paid: tot(['Paid']), pending: tot(['Pending']), processing: tot(['Processing']), failed: tot(['Failed', 'Rejected']), count: out.length }, payouts: out })
  })
}
