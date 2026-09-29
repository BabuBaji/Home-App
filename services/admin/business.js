/* Business Performance (Admin ▸ Insights) — orders and money by State → City → Zone.
 *
 * Nothing is stored here: each call asks the owning services for their numbers over the range and
 * joins them on zone. Bookings (orders, GMV, collected, refunds, customers) come from booking;
 * zones (name, city, state) from catalog; experts per zone from worker; money paid to experts
 * (earnings, incentives, salary, payouts) from wallet, mapped to the expert's zone.
 * Every figure is limited to the viewer's territory (admin scope), like the rest of the panel.
 */
import { requireAnyPerm, tryGet, inScope, internalPost } from '@homehelp/shared'

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

  /* Ledger: every money movement, newest first. dir: 'in' = the company receives (or is owed back),
   * 'out' = the company pays or owes, 'settle' = moves money already counted (expert bank payout,
   * the wallet credit of a top-up) — listed but kept out of the totals so nothing counts twice. */
  const KIND = {
    customer_payment: ['Customer payment', 'in'], wallet_topup: ['Wallet top-up (paid)', 'in'], wallet_payment: ['Booking paid from wallet', 'in'],
    expert_deduction: ['Expert deduction / fine', 'in'], wallet_debit: ['Customer wallet debit', 'in'],
    refund_gateway: ['Refund to card / UPI', 'out'], refund_wallet: ['Refund to customer wallet', 'out'], wallet_credit: ['Wallet credit / bonus', 'out'],
    expert_earning: ['Expert job earning', 'out'], expert_incentive: ['Expert incentive / bonus', 'out'], expert_advance: ['Salary advance', 'out'],
    expert_payout: ['Payout to expert bank', 'settle'], wallet_topup_credit: ['Top-up credited to wallet', 'settle'],
  }
  // The specific reward behind a generic wallet credit / expert income line.
  const CUSTOMER_SUB = { REFERRAL_BONUS: 'Customer referral bonus', CASHBACK: 'Cashback', WELCOME_BONUS: 'Welcome bonus', GIFT_CARD: 'Gift card credit',
    MEMBERSHIP: 'Membership', ADMIN: 'Wallet credit by admin', ADMIN_CREDIT: 'Wallet credit by admin', COMPENSATION: 'Compensation credit' }
  const EXPERT_SUB = { 'Joining Bonus': 'Expert joining bonus', Referral: 'Expert referral bonus', Incentive: 'Expert incentive (rule)', Bonus: 'Expert bonus (manual)',
    'Min Guarantee': 'Expert minimum guarantee', Compensation: 'Expert compensation', Tip: 'Tip to expert', Extension: 'Expert extension pay', Salary: 'Expert salary' }
  const pretty = (k) => String(k || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  // "Incentive" covers every rule-driven payment; its own name is the part of the label before " · ".
  const expertName = (x) => (x.sub === 'Incentive' && x.note ? `Expert: ${String(x.note).split(' · ')[0]}` : EXPERT_SUB[x.sub] || (x.sub ? `Expert ${String(x.sub).toLowerCase()}` : 'Expert incentive'))
  const subLabel = (x, fallback) => {
    if (x.kind === 'wallet_credit' || x.kind === 'wallet_debit') return CUSTOMER_SUB[x.sub] || (x.sub ? pretty(x.sub) : fallback)
    if (x.kind === 'expert_incentive') return expertName(x)
    return fallback
  }

  app.get('/api/admin/business/ledger', admin, requireAnyPerm('finance.view', 'payments.view', 'wallet.view'), async (req, res) => {
    const r = range(req.query)
    const qs = `?from=${r.from}&to=${r.to}`
    const [pay, cw, exp, zones, experts, customers] = await Promise.all([
      tryGet(U.payment, `/internal/business/ledger${qs}`, []),
      tryGet(U.auth, `/api/internal/business/ledger${qs}`, []),
      tryGet(WALLET, `/internal/business/ledger${qs}`, []),
      tryGet(U.catalog, '/api/internal/zones', []),
      tryGet(U.worker, '/internal/business/experts', []),
      tryGet(U.auth, '/api/internal/customers', []),
    ])
    const all = [...(pay || []), ...(cw || []), ...(exp || [])]
    // Zone: booking's zone for customer money (by id or "#HH" ref), the expert's zone for expert money.
    const ids = [...new Set(all.map((x) => x.bookingId).filter(Boolean))]
    const refs = [...new Set(all.map((x) => x.ref).filter((v) => /^#?HH\d+/.test(String(v || ''))))]
    const [byId, byRef] = await Promise.all([
      ids.length ? internalPost(U.booking, '/internal/business/booking-zones', { ids }).catch(() => ({})) : {},
      refs.length ? internalPost(U.booking, '/internal/business/booking-refs', { refs }).catch(() => ({})) : {},
    ])
    const zb = new Map((zones || []).map((z) => [z.id, z]))
    const ex = new Map((experts || []).map((e) => [e.id, e]))
    // OTP sign-up never asks for a name, so fall back to the phone number.
    const cu = new Map((customers || []).map((c) => [c.id, c.name || c.phone || '']))
    const scope = req.admin?.scope
    const typeF = String(req.query.type || ''), zoneF = String(req.query.zoneId || '')
    const rows = all.map((x) => {
      const [base, dir] = KIND[x.kind] || [x.kind, 'settle']
      const label = subLabel(x, base)
      const zoneId = x.workerId ? (ex.get(x.workerId)?.zoneId ?? null) : x.bookingId ? (byId[x.bookingId] ?? null) : (byRef[x.ref]?.zoneId ?? null)
      const z = zb.get(zoneId)
      return {
        key: x.key, at: x.at, kind: x.kind, sub: x.sub || '', label, dir, amount: Number(x.amount) || 0, method: x.method || '', ref: x.ref || '', note: x.note || '',
        party: x.workerId ? (ex.get(x.workerId)?.name || `Expert #${x.workerId}`) : (x.customerName || cu.get(x.customerId) || (x.customerId ? `Customer #${x.customerId}` : '—')),
        partyType: x.workerId ? 'expert' : 'customer', workerId: x.workerId || null, customerId: x.customerId || null,
        zoneId, zone: z?.name || '—', city: z?.city || '—',
      }
    }).filter((x) => zoneVisible(scope, zb.get(x.zoneId) || null) && (!typeF || x.kind === typeF || x.dir === typeF) && (!zoneF || String(x.zoneId ?? 'none') === zoneF))
      .sort((a, b) => new Date(b.at) - new Date(a.at))
    const sum = (d) => rows.filter((x) => x.dir === d).reduce((s, x) => s + x.amount, 0)
    res.json({ range: r, totals: { in: sum('in'), out: sum('out'), net: sum('in') - sum('out'), settled: sum('settle'), count: rows.length }, kinds: Object.entries(KIND).map(([k, [l, d]]) => ({ kind: k, label: l, dir: d })), rows: rows.slice(0, 3000) })
  })

  /* Rewards & Discounts — what every offer, reward and incentive cost over a range.
   * Discounts (coupons/campaigns, membership, zone) come off the order value; customer rewards are
   * wallet credits; expert incentives are wallet income. Plus incentive-rule spend vs budget for the
   * month of `to`, and gift cards issued vs redeemed. Limited to the viewer's territory. */
  app.get('/api/admin/business/rewards', admin, requireAnyPerm('reports.view', 'finance.view', 'campaigns.view'), async (req, res) => {
    const r = range(req.query)
    const qs = `?from=${r.from}&to=${r.to}`
    const [disc, camp, cw, exp, rules, gift, zones, experts] = await Promise.all([
      tryGet(U.booking, `/internal/business/discounts${qs}`, []),
      tryGet(U.catalog, `/api/internal/business/campaign-usage${qs}`, []),
      tryGet(U.auth, `/api/internal/business/ledger${qs}`, []),
      tryGet(WALLET, `/internal/business/ledger${qs}`, []),
      tryGet(U.worker, `/internal/business/incentive-rules?month=${r.to.slice(0, 7)}`, { rules: [] }),
      tryGet(U.auth, '/api/internal/business/gift-cards', null),
      tryGet(U.catalog, '/api/internal/zones', []),
      tryGet(U.worker, '/internal/business/experts', []),
    ])
    const scope = req.admin?.scope
    const zb = new Map((zones || []).map((z) => [z.id, z]))
    const seeZone = (zid) => zoneVisible(scope, zb.get(zid) || null)
    const exZone = new Map((experts || []).map((e) => [e.id, e.zoneId ?? null]))
    const campByBooking = new Map((camp || []).map((c) => [c.bookingId, c]))
    // cashback / referral rows carry a booking ref → zone
    const refs = [...new Set((cw || []).map((x) => x.ref).filter((v) => /^#?HH\d+/.test(String(v || ''))))]
    const byRef = refs.length ? await internalPost(U.booking, '/internal/business/booking-refs', { refs }).catch(() => ({})) : {}

    // --- discounts
    const d = (disc || []).filter((x) => seeZone(x.zoneId))
    const coupons = {}
    for (const x of d) if (x.discount) {
      const c = campByBooking.get(x.bookingId)
      const key = c ? `${c.name}${c.code ? ` (${c.code})` : ''}` : x.coupon ? `Coupon ${x.coupon}` : 'Other discount'
      const e = coupons[key] || (coupons[key] = { name: key, orders: 0, amount: 0 }); e.orders++; e.amount += x.discount
    }
    const discounts = {
      coupon: d.reduce((s, x) => s + x.discount, 0), membership: d.reduce((s, x) => s + x.memberDiscount, 0), zone: d.reduce((s, x) => s + x.zoneDiscount, 0),
      orders: d.length, byCampaign: Object.values(coupons).sort((a, b) => b.amount - a.amount),
      couponOrders: d.filter((x) => x.discount).length, membershipOrders: d.filter((x) => x.memberDiscount).length, zoneOrders: d.filter((x) => x.zoneDiscount).length,
    }
    discounts.total = discounts.coupon + discounts.membership + discounts.zone

    // --- customer rewards (wallet credits other than refunds / top-ups)
    const creward = {}
    for (const x of cw || []) {
      if (x.kind !== 'wallet_credit') continue
      const zid = byRef[x.ref]?.zoneId ?? null
      if (!seeZone(zid) && !(scope?.type === 'all' || !scope)) continue
      const k = CUSTOMER_SUB[x.sub] || pretty(x.sub) || 'Wallet credit'
      const e = creward[k] || (creward[k] = { name: k, count: 0, amount: 0 }); e.count++; e.amount += Number(x.amount) || 0
    }
    // --- expert incentives (non-job income)
    const ereward = {}
    for (const x of exp || []) {
      if (x.kind !== 'expert_incentive' || !seeZone(exZone.get(x.workerId) ?? null)) continue
      const k = expertName(x)
      const e = ereward[k] || (ereward[k] = { name: k, count: 0, amount: 0 }); e.count++; e.amount += Number(x.amount) || 0
    }
    const list = (o) => Object.values(o).sort((a, b) => b.amount - a.amount)
    const customerRewards = list(creward), expertIncentives = list(ereward)
    const tot = (l) => l.reduce((s, x) => s + x.amount, 0)
    // Budgets and gift cards are company-wide numbers — only for admins who see everything.
    const whole = !scope || scope.type === 'all'
    res.json({
      range: r,
      totals: { discounts: discounts.total, customerRewards: tot(customerRewards), expertIncentives: tot(expertIncentives), all: discounts.total + tot(customerRewards) + tot(expertIncentives) },
      discounts, customerRewards, expertIncentives,
      rules: whole ? (rules?.rules || []) : [], rulesMonth: rules?.month || r.to.slice(0, 7),
      giftCards: whole ? gift : null,
    })
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
