// Customer-facing features against a running stack (mock payments): extra tasks billed only after
// approval, tips reaching the expert, ratings, favourite experts, rescheduling and repeat bookings.
//
//   INTERNAL_KEY=… node infra/e2e/features.mjs          # BASE=… BOOKING=http://localhost:4006
const BASE = process.env.BASE || 'http://localhost:8080'
const BOOKING = process.env.BOOKING || 'http://localhost:4006'
const RUN = Date.now().toString().slice(-5)
const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + String(detail).slice(0, 170) : ''}`)
}
async function api(method, path, { token, body, base = BASE, headers = {} } = {}) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let json; try { json = JSON.parse(t) } catch { json = t }
  return { status: r.status, ok: r.ok, json }
}
const must = async (label, p) => { const r = await p; if (!r.ok) throw new Error(`${label} → ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`); return r.json }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(1000) } return null }
function istSlot(ms) {
  const d = new Date(ms + 330 * 60e3), M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const h = d.getUTCHours()
  return { date: `${d.getUTCDate()} ${M[d.getUTCMonth()]} ${d.getUTCFullYear()}`, time: `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}` }
}
async function pay(tok, amount) {
  const o = (await api('POST', '/api/payment/order', { token: tok, body: { amount } })).json
  return (await api('POST', '/api/payment/charge', { token: tok, body: { orderId: o.orderId, amount } })).json?.txnId
}

async function main() {
  const SUP = (await must('super', api('POST', '/api/admin/login', { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } }))).token
  const pin = `4${RUN}`, lat = 17.52, lng = 78.52
  const z = await must('zone', api('POST', '/api/admin/zones', { token: SUP, body: {
    name: `E2E Feat ${RUN}`, city: 'Hyderabad', state: 'Telangana', pincodes: pin, status: 'live',
    config: { services: ['mopping', 'kitchen', 'bathroom', 'dusting'], workingHours: { is247: true }, coverage: { lat, lng, radiusKm: 5 } },
  } }))
  // Two experts: one to serve, one who never served this customer.
  const workers = []
  for (const n of [1, 2]) {
    const phone = `9${RUN}${n}000`.slice(0, 10)
    const w = await must('worker', api('POST', '/api/admin/workers', { token: SUP, body: { name: `WF${n} ${RUN}`, phone, city: 'Hyderabad', zone_id: z.id, status: 'active', services: ['Sweeping & Mopping', 'Kitchen Cleaning', 'Dusting Furniture', 'Bathroom Cleaning'] } }))
    const id = w.id || w.worker?.id
    await must('shift', api('POST', '/api/admin/shifts', { token: SUP, body: { worker_id: id, zone_id: z.id, weekdays: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' } }))
    const o = await must('w otp', api('POST', '/api/worker/auth/request-otp', { body: { phone } }))
    const v = await must('w verify', api('POST', '/api/worker/auth/verify', { body: { phone, otp: o.devOtp || '1234' } }))
    workers.push({ id, tok: v.token })
  }
  const [W, W2] = workers
  await api('POST', '/api/worker/status', { token: W2.tok, body: { state: 'Offline' } })
  await api('POST', '/api/worker/status', { token: W.tok, body: { state: 'Available' } })
  const cphone = `8${RUN}7777`
  const co = await must('c otp', api('POST', '/api/auth/request-otp', { body: { phone: cphone } }))
  const cv = await must('c verify', api('POST', '/api/auth/verify-otp', { body: { phone: cphone, otp: co.devOtp || '4321' } }))
  const C = cv.token
  const addr = (await must('addr', api('POST', '/api/addresses', { token: C, body: { label: 'Home', house: '1', street: 'Feat', city: 'Hyderabad', pincode: pin, lat, lng, makeDefault: true } }))).id
  const item = [{ id: 'mopping', durationId: '60m' }]

  // ── A cash job with an extra task ──
  const bk = await must('book', api('POST', '/api/bookings', { token: C, body: { items: item, type: 'instant', addressId: addr, pincode: pin, lat, lng, payment: 'cash' } }))
  const offered = await waitFor(async () => (await api('GET', '/api/worker/jobs/offer', { token: W.tok })).json?.state === 'PENDING', 20000)
  check('Job offered to the in-zone expert', !!offered)
  await must('accept', api('POST', '/api/worker/jobs/accept', { token: W.tok }))
  const early = await api('POST', `/api/bookings/${bk.id}/review`, { token: C, body: { rating: 1 } })
  check('Cannot rate before the job is done', early.status === 409, `HTTP ${early.status}`)
  await must('otw', api('POST', '/api/worker/jobs/on-the-way', { token: W.tok }))
  await must('arrived', api('POST', '/api/worker/jobs/arrived', { token: W.tok }))
  const otp = (await api('GET', `/api/bookings/${bk.id}`, { token: C })).json.service_otp
  await must('otp', api('POST', '/api/worker/jobs/verify-otp', { token: W.tok, body: { otp } }))
  const before = (await api('GET', `/api/bookings/${bk.id}`, { token: C })).json.total
  await must('extra', api('POST', '/api/worker/jobs/extras', { token: W.tok, body: { name: 'Fridge cleaning', price: 150 } }))
  let ex = (await api('GET', `/api/bookings/${bk.id}/extras`, { token: C })).json
  check('Customer sees the extra task, pending', ex.length === 1 && ex[0].status === 'pending', JSON.stringify(ex).slice(0, 100))
  let st = (await api('GET', '/api/worker/jobs/state', { token: W.tok })).json
  check('Unapproved task is not billed', st.extrasTotal === 0 && (await api('GET', `/api/bookings/${bk.id}`, { token: C })).json.total === before, `extrasTotal=${st.extrasTotal}`)
  await must('approve', api('POST', `/api/bookings/${bk.id}/extras/${ex[0].id}/approve`, { token: C, body: {} }))
  const after = (await api('GET', `/api/bookings/${bk.id}`, { token: C })).json.total
  st = (await api('GET', '/api/worker/jobs/state', { token: W.tok })).json
  check('Approved task is added to the bill', after === before + 150 && st.extrasTotal === 150, `₹${before} → ₹${after}, worker sees ${st.extras?.[0]?.status}`)
  await must('extra2', api('POST', '/api/worker/jobs/extras', { token: W.tok, body: { name: 'Balcony', price: 99 } }))
  ex = (await api('GET', `/api/bookings/${bk.id}/extras`, { token: C })).json
  await must('decline', api('POST', `/api/bookings/${bk.id}/extras/${ex.find((x) => x.name === 'Balcony').id}/decline`, { token: C }))
  check('Declined task is not billed', (await api('GET', `/api/bookings/${bk.id}`, { token: C })).json.total === after)
  await must('end', api('POST', '/api/worker/jobs/end', { token: W.tok, body: {} }))
  await waitFor(async () => (await api('GET', `/api/bookings/${bk.id}`, { token: C })).json.status === 'completed', 8000)

  // ── Tip ──
  const t0 = await api('POST', `/api/bookings/${bk.id}/tip`, { token: C, body: { amount: 50 } })
  check('Tip without payment is refused', t0.status === 402, `HTTP ${t0.status}`)
  const t1 = await api('POST', `/api/bookings/${bk.id}/tip`, { token: C, body: { amount: 50, paymentId: await pay(C, 50) } })
  check('Paid tip is accepted', t1.ok, `HTTP ${t1.status} ${JSON.stringify(t1.json).slice(0, 80)}`)
  const t2 = await api('POST', `/api/bookings/${bk.id}/tip`, { token: C, body: { amount: 50, paymentId: await pay(C, 50) } })
  check('Only one tip per booking', t2.status === 409, `HTTP ${t2.status}`)
  const tipRow = await waitFor(async () => {
    const h = (await api('GET', '/api/worker/wallet/history', { token: W.tok })).json
    const rows = Array.isArray(h) ? h : h.items || h.history || []
    return rows.find((r) => /tip/i.test(JSON.stringify(r)))
  }, 8000)
  check('Tip lands in the expert wallet', !!tipRow, JSON.stringify(tipRow || {}).slice(0, 120))

  // ── Rating ──
  await must('review', api('POST', `/api/bookings/${bk.id}/review`, { token: C, body: { rating: 3, review: 'ok' } }))
  const list = (await api('GET', `/api/bookings/service-workers?service=Sweeping%20%26%20Mopping&pincode=${pin}&lat=${lat}&lng=${lng}`, { token: C })).json
  const me = list.find((w) => w.id === W.id)
  check("Expert's rating follows customer ratings", me && Number(me.rating) === 3, `rating=${me?.rating}`)

  // ── Favourite expert ──
  const f0 = await api('POST', `/api/favourite-experts/${W2.id}`, { token: C })
  check("Can't favourite an expert who never served you", f0.status === 403, `HTTP ${f0.status}`)
  await must('fav', api('POST', `/api/favourite-experts/${W.id}`, { token: C }))
  const list2 = (await api('GET', `/api/bookings/service-workers?service=Sweeping%20%26%20Mopping&pincode=${pin}&lat=${lat}&lng=${lng}`, { token: C })).json
  check('Favourite expert is flagged and listed first', list2[0]?.id === W.id && list2[0]?.favourite === true, JSON.stringify(list2.map((w) => [w.id, w.favourite])))

  // ── Reschedule ──
  const tomorrow = istSlot(Date.now() + 26 * 3600e3)
  const sb = await must('sched', api('POST', '/api/bookings', { token: C, body: { items: item, type: 'schedule', ...tomorrow, addressId: addr, pincode: pin, lat, lng, payment: 'cash' } }))
  const r1 = await api('POST', `/api/bookings/${sb.id}/reschedule`, { token: C, body: istSlot(Date.now() - 3 * 3600e3) })
  check('Cannot reschedule into the past', r1.status === 400, `HTTP ${r1.status}`)
  const r2 = await api('POST', `/api/bookings/${sb.id}/reschedule`, { token: C, body: { date: 'someday', time: 'soon' } })
  check('Nonsense date refused', r2.status === 400, `HTTP ${r2.status}`)
  const later = istSlot(Date.now() + 50 * 3600e3)
  const r3 = await api('POST', `/api/bookings/${sb.id}/reschedule`, { token: C, body: later })
  check('Valid reschedule accepted', r3.ok && r3.json.date === later.date && r3.json.time === later.time, `HTTP ${r3.status}`)
  await api('POST', `/api/bookings/${sb.id}/cancel`, { token: C, body: { reason: 'test' } })

  // ── Repeat bookings ──
  const today = istSlot(Date.now())
  const plan = await must('plan', api('POST', '/api/recurring', { token: C, body: { items: item, startDate: today.date, time: '10:00 AM', freq: 'daily', payment: 'cash', addressId: addr, pincode: pin, lat, lng } }))
  await api('POST', '/api/internal/recurring/run', { base: BOOKING, headers: { 'x-internal-key': process.env.INTERNAL_KEY || '' } })
  const plans = (await api('GET', '/api/recurring', { token: C })).json
  const p = plans.find((x) => x.id === plan.id)
  const nb = p?.lastBookingId ? (await api('GET', `/api/bookings/${p.lastBookingId}`, { token: C })).json : null
  check('Plan books the next visit a day ahead', !!nb && nb.type === 'schedule' && nb.time === '10:00 AM', p?.lastError || `booking ${p?.lastBookingId} on ${nb?.date}`)
  check('…and moves on to the following visit', p && p.nextDate !== plan.nextDate, `${plan.nextDate} → ${p?.nextDate}`)
  await must('pause', api('POST', `/api/recurring/${plan.id}/pause`, { token: C }))
  await must('stop', api('POST', `/api/recurring/${plan.id}/cancel`, { token: C }))
  check('Stopped plan disappears', !(await api('GET', '/api/recurring', { token: C })).json.some((x) => x.id === plan.id))
  if (nb) await api('POST', `/api/bookings/${nb.id}/cancel`, { token: C, body: { reason: 'test' } })

  for (const w of workers) await api('POST', '/api/worker/status', { token: w.tok, body: { state: 'Offline' } })
  await api('DELETE', `/api/admin/zones/${z.id}`, { token: SUP })
  const f = results.filter((x) => !x.pass).length
  console.log(`\n${results.length - f} passed, ${f} failed`)
  process.exit(f ? 1 : 0)
}
main().catch((e) => { console.error('ABORTED:', e.message); process.exit(1) })
