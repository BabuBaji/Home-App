// Zone + dispatch scenario suite (positive and negative) against a running stack.
//
//   OFFER_TTL_SEC=20 on the booking service is assumed (set it when starting booking) so offer
//   expiry scenarios run in seconds; the suite sets dispatch_timeout_min=2 and restores 5.
//
//   node infra/e2e/scenarios.mjs          # BASE=… ADMIN_PW=… OUT=results.json
//
// Every check states the behaviour the business wants (strict zone isolation). A FAIL means the
// system does something else today; the detail column says what actually happened.
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:8080'
const ADMIN_PW = process.env.ADMIN_PW || 'Admin@12345'
const TTL = Number(process.env.OFFER_TTL_SEC || 20)
const RUN = Date.now().toString().slice(-5)
const results = []
let scenario = ''

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function check(name, pass, detail = '', level = 'must') {
  const status = level === 'info' ? 'INFO' : pass ? 'PASS' : 'FAIL'
  results.push({ scenario, name, status, detail: String(detail).slice(0, 400) })
  console.log(`${status.padEnd(4)}  ${scenario.padEnd(34)} ${name}${detail ? '  — ' + String(detail).slice(0, 170) : ''}`)
}
async function api(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let json; try { json = JSON.parse(t) } catch { json = t }
  return { status: r.status, ok: r.ok, json }
}
async function must(label, p) { const r = await p; if (!r.ok) throw new Error(`${label} → ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`); return r.json }
async function waitFor(fn, ms, every = 1000) { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(every) } return v }
// A slot the way the customer app sends it: "26 Sep 2026" + "10:00 AM", in IST.
function istSlot(ms) {
  const d = new Date(ms + 330 * 60e3), M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const h = d.getUTCHours(), m = d.getUTCMinutes()
  return { date: `${d.getUTCDate()} ${M[d.getUTCMonth()]} ${d.getUTCFullYear()}`, time: `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }
}
const phone = (n) => `8${RUN}${String(n).padStart(4, '0')}`
const list = (j) => (Array.isArray(j) ? j : j?.workers || j?.bookings || j?.customers || j?.shifts || [])

let SUPER
const Z = {}, W = {}, C = {}, M = {}
const created = []   // every booking id we make, for cleanup

// ── actors ─────────────────────────────────────────────────────────────────────────────────────
async function mkZone(key, name, city, state, pins, coverage) {
  // `coverage` is the zone's area on the map (the wizard's centre + radius); it is what splits two
  // zones that share a pincode.
  const z = await must(`zone ${key}`, api('POST', '/api/admin/zones', { token: SUPER, body: {
    name: `E2E ${name} ${RUN}`, city, state, pincodes: pins.join(','), status: 'live',
    config: { services: ['mopping', 'kitchen', 'bathroom', 'dusting'], workingHours: { is247: true }, ...(coverage ? { coverage } : {}) },
  } }))
  Z[key] = { id: z.id, name: z.name, city, pins }
  const offer = `E2E Offer ${key} ${RUN}`
  const cm = await must(`offer ${key}`, api('POST', '/api/admin/campaigns', { token: SUPER, body: {
    campaign_name: offer, banner_title: offer, campaign_type: 'zone', discount_type: 'flat', discount_value: 10, status: 'active', zoneIds: [z.id],
  } }))
  Z[key].offer = offer; Z[key].campaign = cm.campaign_id
}
async function mkManager(key, zoneKey) {
  const email = `m${key.toLowerCase()}${RUN}@e2e.test`
  await must(`manager ${key}`, api('POST', '/api/admin/admins', { token: SUPER, body: { name: `Mgr ${key}`, email, password: 'Mgr@12345', role: 'manager', scopeType: 'zone', scopeValues: [Z[zoneKey].id] } }))
  M[key] = (await must('mgr login', api('POST', '/api/admin/login', { body: { email, password: 'Mgr@12345' } }))).token
}
async function mkWorker(key, zoneKey, n) {
  const z = Z[zoneKey]
  const w = await must(`worker ${key}`, api('POST', '/api/admin/workers', { token: SUPER, body: {
    name: `W${key} ${RUN}`, phone: phone(n), city: z.city, zone_id: z.id, status: 'active',
    services: ['Sweeping & Mopping', 'Kitchen Cleaning', 'Dusting Furniture', 'Bathroom Cleaning'],
  } }))
  const id = w.id || w.worker?.id
  await must('shift', api('POST', '/api/admin/shifts', { token: SUPER, body: { worker_id: id, zone_id: z.id, weekdays: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' } }))
  const o = await must('w otp', api('POST', '/api/worker/auth/request-otp', { body: { phone: phone(n) } }))
  const v = await must('w verify', api('POST', '/api/worker/auth/verify', { body: { phone: phone(n), otp: o.devOtp || '1234' } }))
  W[key] = { id, tok: v.token, zone: zoneKey, name: `W${key} ${RUN}` }
  await online(key, false)
}
async function mkCustomer(key, zoneKey, n, pin, lat, lng) {
  const o = await must('c otp', api('POST', '/api/auth/request-otp', { body: { phone: phone(n) } }))
  const v = await must('c verify', api('POST', '/api/auth/verify-otp', { body: { phone: phone(n), otp: o.devOtp || '4321' } }))
  await api('PATCH', '/api/me', { token: v.token, body: { name: `C${key} ${RUN}`, city: Z[zoneKey].city, location: Z[zoneKey].city } })
  const a = await must('addr', api('POST', '/api/addresses', { token: v.token, body: { label: 'Home', house: '1', street: `${key} street`, city: Z[zoneKey].city, pincode: pin, lat, lng, makeDefault: true } }))
  C[key] = { id: v.user.id, tok: v.token, addr: a.id, pin, lat, lng, zone: zoneKey }
}
// Going online also sends the app's heartbeat — dispatch only offers to experts whose app checked in lately.
const online = async (k, on) => { const r = await api('POST', '/api/worker/status', { token: W[k].tok, body: { state: on ? 'Available' : 'Offline' } }); if (on) await api('POST', '/api/worker/heartbeat', { token: W[k].tok, body: { battery: 80, network: 'wifi' } }); return r }
const offerOf = async (k) => { const o = (await api('GET', '/api/worker/jobs/offer', { token: W[k].tok })).json; return o?.state === 'PENDING' ? Number(o.bookingId) : null }
const bookingAdmin = async (id) => (await api('GET', `/api/admin/bookings/${id}`, { token: SUPER })).json
async function book(ck, extra = {}) {
  const c = C[ck], now = new Date()
  const r = await api('POST', '/api/bookings', { token: c.tok, body: {
    items: [{ id: 'mopping', durationId: '60m' }], type: 'instant', addressId: c.addr, pincode: c.pin, payment: 'cash',
    lat: c.lat, lng: c.lng, date: now.toDateString(), time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), ...extra,
  } })
  if (r.ok) created.push(r.json.id)
  return r
}
/** Which of our workers currently holds a PENDING offer for booking `id`. */
async function whoIsOffered(id) {
  for (const k of Object.keys(W)) if ((await offerOf(k)) === id) return k
  return null
}
async function runJob(wk, ck, id) {
  await must('otw', api('POST', '/api/worker/jobs/on-the-way', { token: W[wk].tok }))
  await must('arrived', api('POST', '/api/worker/jobs/arrived', { token: W[wk].tok }))
  const b = (await api('GET', `/api/bookings/${id}`, { token: C[ck].tok })).json
  await must('otp', api('POST', '/api/worker/jobs/verify-otp', { token: W[wk].tok, body: { otp: b.service_otp } }))
  await must('end', api('POST', '/api/worker/jobs/end', { token: W[wk].tok, body: {} }))
}
/** Leave nothing active: cancel open bookings, finish started ones, everyone offline. */
async function cleanup() {
  for (const id of created) {
    const b = await bookingAdmin(id)
    if (!b || ['completed', 'cancelled'].includes(b.status)) continue
    const owner = Object.keys(C).find((k) => C[k].id === b.user_id)
    if (b.status === 'in_progress' || b.status === 'arrived') {
      const wk = Object.keys(W).find((k) => W[k].id === b.worker_id)
      if (wk && b.status === 'arrived') {
        const cb = (await api('GET', `/api/bookings/${id}`, { token: C[owner].tok })).json
        await api('POST', '/api/worker/jobs/verify-otp', { token: W[wk].tok, body: { otp: cb.service_otp } })
      }
      if (wk) await api('POST', '/api/worker/jobs/end', { token: W[wk].tok, body: {} })
    } else if (owner) await api('POST', `/api/bookings/${id}/cancel`, { token: C[owner].tok, body: { reason: 'test cleanup' } })
  }
  for (const k of Object.keys(W)) await online(k, false)
  await sleep(1200)
}

// ── scenarios ──────────────────────────────────────────────────────────────────────────────────
async function main() {
  SUPER = (await must('super', api('POST', '/api/admin/login', { body: { email: 'admin@homehelp.in', password: ADMIN_PW } }))).token
  const prev = (await api('GET', '/api/admin/zones', { token: SUPER })).json
  for (const z of prev.filter((z) => z.name.startsWith('E2E'))) await api('DELETE', `/api/admin/zones/${z.id}`, { token: SUPER })
  await api('PATCH', '/api/admin/settings', { token: SUPER, body: { dispatch_timeout_min: '2', auto_assign: 'true' } })

  // City Hyderabad with two zones that SHARE pincode 500081 (West created first), plus Pune.
  await mkZone('W', 'Hyd West', 'Hyderabad', 'Telangana', ['500081', '500032'], { lat: 17.4435, lng: 78.3772, radiusKm: 9 })
  await mkZone('E', 'Hyd East', 'Hyderabad', 'Telangana', ['500081', '500039'], { lat: 17.4062, lng: 78.5591, radiusKm: 9 })
  await mkZone('P', 'Pune Baner', 'Pune', 'Maharashtra', ['411045'])
  await mkManager('W', 'W'); await mkManager('E', 'E'); await mkManager('P', 'P')
  await mkWorker('W1', 'W', 1); await mkWorker('W2', 'W', 2); await mkWorker('E1', 'E', 3); await mkWorker('P1', 'P', 4)
  await mkCustomer('W', 'W', 11, '500032', 17.4435, 78.3772)          // Hyd West, own pincode
  await mkCustomer('E', 'E', 12, '500081', 17.4062, 78.5591)          // Hyd East side of the SHARED pincode
  await mkCustomer('P', 'P', 13, '411045', 18.559, 73.7868)
  await mkCustomer('X', 'W', 14, '560300', 12.97, 77.59)              // pincode served by no zone
  scenario = 'Setup'
  check('3 zones (2 in Hyderabad sharing 500081, 1 in Pune), 4 workers, 4 customers, 3 zone managers, 1 offer per zone', true)

  // S1 — happy path, in-zone offer and completion.
  scenario = 'S1 Happy path (in-zone)'
  await online('W1', true); await online('W2', true); await online('E1', true); await online('P1', true)
  let r = await book('W')
  check('Booking accepted', r.ok, `HTTP ${r.status}`)
  let id = r.json.id, got = await waitFor(() => whoIsOffered(id), 15000)
  check('Offer goes to a Hyd-West worker', got && W[got].zone === 'W', `offered to ${got ? W[got].name + ' (' + W[got].zone + ')' : 'nobody'}`)
  if (got) { await must('accept', api('POST', '/api/worker/jobs/accept', { token: W[got].tok })); await runJob(got, 'W', id) }
  check('Completes end to end', (await bookingAdmin(id)).status === 'completed')
  await cleanup()

  // S2 — shared pincode: an East customer in 500081 must land in Hyd East.
  scenario = 'S2 Same pincode, 2 zones'
  await online('E1', true); await online('W1', true)
  r = await book('E')
  id = r.json?.id
  check('Booking from East side of shared 500081 is tagged Hyd East', Number(r.json?.zone_id) === Z.E.id, `tagged zone ${r.json?.zone_id} (${Number(r.json?.zone_id) === Z.W.id ? 'Hyd West' : 'other'}); East=${Z.E.id}`)
  got = await waitFor(() => whoIsOffered(id), 15000)
  check('Offer goes to the East worker', got === 'E1', `offered to ${got || 'nobody'}`)
  const svE = (await api('GET', `/api/serviceable?pincode=500081&lat=${C.E.lat}&lng=${C.E.lng}`)).json
  check('Catalogue resolves the East location of 500081 to Hyd East', Number(svE?.zoneId) === Z.E.id, `zoneId=${svE?.zoneId}`)
  const svW = (await api('GET', `/api/serviceable?pincode=500081&lat=17.4401&lng=78.3489`)).json
  check('…and the West location of 500081 to Hyd West', Number(svW?.zoneId) === Z.W.id, `zoneId=${svW?.zoneId}`)
  await cleanup()

  // S3 — nobody online in the zone: must NOT go to another zone; waits, then auto-cancels.
  scenario = 'S3 No worker online in zone'
  await online('E1', true); await online('P1', true)          // other zones online, Hyd West offline
  r = await book('W'); id = r.json.id
  got = await waitFor(() => whoIsOffered(id), 12000)
  check('Not offered to a worker from another zone', !got, got ? `offered to ${W[got].name} (${W[got].zone})` : 'no offer')
  if (got) await api('POST', '/api/worker/jobs/reject', { token: W[got].tok })
  // S3b — pull model: other-zone worker asks for work.
  const pull = await api('POST', '/api/worker/jobs/request', { token: W.P1.tok })
  const pulledId = pull.json?.job?.bookingId || pull.json?.job?.id
  check('Other-zone worker cannot pull this job', !(pull.ok && Number(pulledId) === id), `HTTP ${pull.status} ${JSON.stringify(pull.json).slice(0, 120)}`)
  if (pull.ok && pull.json?.job) await api('POST', '/api/worker/jobs/cancel', { token: W.P1.tok, body: { reason: 'test' } })
  let b = await bookingAdmin(id)
  check('Booking waits as "confirmed" (searching)', ['confirmed'].includes(b.status) || b.status === 'cancelled', `status=${b.status}`)
  // An in-zone worker coming online picks it up via the 10 s sweep.
  await online('E1', false); await online('P1', false); await online('W2', true)
  got = await waitFor(() => whoIsOffered(id), 25000)
  check('When an in-zone worker comes online, the sweep offers it', got === 'W2', `offered to ${got || 'nobody'}`)
  if (got) await api('POST', '/api/worker/jobs/reject', { token: W[got].tok })
  await online('W2', false)
  const cancelled = await waitFor(async () => { const x = await bookingAdmin(id); return x.status === 'cancelled' ? x : null }, 190000, 5000)
  check('Auto-cancelled after dispatch_timeout (2 min in test)', !!cancelled, cancelled ? `cancelled_by=${cancelled.cancelled_by}, reason=${cancelled.cancel_reason}` : `still ${(await bookingAdmin(id)).status}`)
  await cleanup()

  // S4 — all in-zone workers busy.
  scenario = 'S4 All in-zone workers busy'
  await online('W1', true); await online('W2', true)
  const busyIds = []
  for (let i = 0; i < 2; i++) {
    const x = await book('W'); const who = await waitFor(() => whoIsOffered(x.json.id), 15000)
    if (who) { await api('POST', '/api/worker/jobs/accept', { token: W[who].tok }); busyIds.push([who, x.json.id]) }
  }
  check('Both Hyd-West workers now busy', busyIds.length === 2, busyIds.map((x) => x[0]).join(','))
  await online('P1', true)
  r = await book('W'); id = r.json.id
  got = await waitFor(() => whoIsOffered(id), 12000)
  check('New order is not given to a busy worker or another zone', !got, got ? `offered to ${got}` : 'queued')
  const [freeK, freeId] = busyIds[0] || []
  if (freeK) await runJob(freeK, 'W', freeId)
  got = await waitFor(() => whoIsOffered(id), 25000)
  check('Offered to the first worker who becomes free', got === freeK, `offered to ${got || 'nobody'}`)
  await cleanup()

  // S5 — reject → next in-zone worker; never re-offered to the one who declined.
  scenario = 'S5 Worker rejects'
  await online('W1', true); await online('W2', true)
  r = await book('W'); id = r.json.id
  const first = await waitFor(() => whoIsOffered(id), 15000)
  await api('POST', '/api/worker/jobs/reject', { token: W[first].tok })
  const second = await waitFor(async () => { const k = await whoIsOffered(id); return k && k !== first ? k : null }, 20000)
  check('Re-offered to the other in-zone worker', second && W[second].zone === 'W', `${first} rejected → ${second || 'nobody'}`)
  await api('POST', '/api/worker/jobs/reject', { token: W[second].tok })
  const again = await waitFor(() => whoIsOffered(id), 20000)
  check('After both reject, nobody is re-offered', !again, again ? `re-offered to ${again}` : 'no offer')
  await cleanup()

  // S6 — offer ignored until it expires; late accept refused.
  scenario = 'S6 Offer expires (TTL)'
  await online('W1', true); await online('W2', true)
  r = await book('W'); id = r.json.id
  const lazy = await waitFor(() => whoIsOffered(id), 15000)
  const next = await waitFor(async () => { const k = await whoIsOffered(id); return k && k !== lazy ? k : null }, (TTL + 25) * 1000)
  check(`After ${TTL}s the offer moves to the other worker`, !!next, `${lazy} ignored → ${next || 'nobody'}`)
  const late = await api('POST', '/api/worker/jobs/accept', { token: W[lazy].tok })
  check('Late accept by the first worker is refused', !late.ok || late.json?.ok === false, `HTTP ${late.status} ${JSON.stringify(late.json).slice(0, 80)}`)
  await cleanup()

  // S7 — worker goes offline while holding an offer.
  scenario = 'S7 Goes offline holding offer'
  await online('W1', true); await online('W2', true)
  r = await book('W'); id = r.json.id
  const holder = await waitFor(() => whoIsOffered(id), 15000)
  const t0 = Date.now(); await online(holder, false)
  const moved = await waitFor(async () => { const k = await whoIsOffered(id); return k && k !== holder ? k : null }, (TTL + 25) * 1000)
  check('Offer moves to someone else promptly (< TTL)', moved && Date.now() - t0 < TTL * 1000, `moved after ${Math.round((Date.now() - t0) / 1000)}s to ${moved || 'nobody'}`)
  const offAcc = await api('POST', '/api/worker/jobs/accept', { token: W[holder].tok })
  check('Offline worker cannot accept', !offAcc.ok || offAcc.json?.ok === false, `HTTP ${offAcc.status}`)
  await cleanup()

  // S8 — worker cancels after accepting → re-dispatched to someone else in zone.
  scenario = 'S8 Worker drops after accept'
  await online('W1', true); await online('W2', true)
  r = await book('W'); id = r.json.id
  const acc = await waitFor(() => whoIsOffered(id), 15000)
  await api('POST', '/api/worker/jobs/accept', { token: W[acc].tok })
  const drop = await api('POST', '/api/worker/jobs/cancel', { token: W[acc].tok, body: { reason: 'vehicle breakdown' } })
  check('Worker can drop the job', drop.ok, `HTTP ${drop.status}`)
  const re = await waitFor(() => whoIsOffered(id), 25000)
  check('Re-offered to a different in-zone worker', re && re !== acc && W[re].zone === 'W', `${acc} dropped → ${re || 'nobody'}`)
  await cleanup()

  // S9 — customer cancellations.
  scenario = 'S9 Customer cancels'
  await online('W1', true)
  r = await book('W'); id = r.json.id
  const hold = await waitFor(() => whoIsOffered(id), 15000)
  let cq = (await api('GET', `/api/bookings/${id}/cancel-quote`, { token: C.W.tok })).json
  check('Cancel while searching: no fee', (cq.fee ?? cq.cancelFee ?? 0) === 0, JSON.stringify(cq).slice(0, 120))
  await api('POST', `/api/bookings/${id}/cancel`, { token: C.W.tok, body: { reason: 'changed mind' } })
  const st = (await api('GET', '/api/worker/jobs/offer', { token: W[hold].tok })).json
  check('Worker holding the offer sees it withdrawn', st?.state !== 'PENDING', `offer state=${st?.state}`)
  r = await book('W'); id = r.json.id
  const w2 = await waitFor(() => whoIsOffered(id), 15000)
  await api('POST', '/api/worker/jobs/accept', { token: W[w2].tok }); await api('POST', '/api/worker/jobs/on-the-way', { token: W[w2].tok })
  cq = (await api('GET', `/api/bookings/${id}/cancel-quote`, { token: C.W.tok })).json
  check('Cancel after worker is on the way: fee applies', (cq.fee ?? cq.cancelFee ?? 0) > 0, JSON.stringify(cq).slice(0, 120))
  await api('POST', '/api/worker/jobs/arrived', { token: W[w2].tok })
  const cb = (await api('GET', `/api/bookings/${id}`, { token: C.W.tok })).json
  await api('POST', '/api/worker/jobs/verify-otp', { token: W[w2].tok, body: { otp: cb.service_otp } })
  const cip = await api('POST', `/api/bookings/${id}/cancel`, { token: C.W.tok, body: { reason: 'too late' } })
  check('Cannot cancel once service is in progress', !cip.ok, `HTTP ${cip.status}`)
  await cleanup()

  // S10 — scheduled booking for tomorrow.
  scenario = 'S10 Scheduled for tomorrow'
  await online('W1', true)
  const tm = new Date(Date.now() + 26 * 3600e3)
  r = await book('W', { type: 'schedule', ...istSlot(tm.getTime()), at: tm.toISOString() })
  check('Scheduled booking accepted', r.ok, `HTTP ${r.status} ${r.ok ? '' : JSON.stringify(r.json).slice(0, 120)}`)
  if (r.ok) {
    got = await waitFor(() => whoIsOffered(r.json.id), 15000)
    check('Not offered yet — held until 2 h before the slot', !got, got ? `offered now to ${got}` : 'held for later')
    const pulled = await api('POST', '/api/worker/jobs/request', { token: W.W1.tok })
    check('Cannot be pulled early either', Number(pulled.json?.job?.bookingId) !== r.json.id, `HTTP ${pulled.status}`)
    if (pulled.ok && pulled.json?.job) await api('POST', '/api/worker/jobs/cancel', { token: W.W1.tok, body: { reason: 'test' } })
    // Pull the slot to within the lead window: it is dispatched on the next sweep.
    await api('POST', `/api/bookings/${r.json.id}/reschedule`, { token: C.W.tok, body: istSlot(Date.now() + 60 * 60e3) })
    got = await waitFor(() => whoIsOffered(r.json.id), 25000)
    check('Offered once the slot is within 2 h', got === 'W1', got ? `offered to ${got}` : 'nobody')
  }
  await cleanup()

  // S11 — admin manual assignment respects zone.
  scenario = 'S11 Admin assign'
  r = await book('W'); id = r.json.id
  const x1 = await api('PATCH', `/api/admin/bookings/${id}`, { token: M.P, body: { workerId: W.P1.id, workerName: W.P1.name } })
  check('Pune manager cannot touch a Hyd-West order', !x1.ok, `HTTP ${x1.status}`)
  const x2 = await api('PATCH', `/api/admin/bookings/${id}`, { token: M.W, body: { workerId: W.P1.id, workerName: W.P1.name } })
  check('Hyd-West manager cannot assign a Pune worker', !x2.ok, `HTTP ${x2.status}, status now ${(await bookingAdmin(id)).status}`)
  await api('PATCH', `/api/admin/bookings/${id}`, { token: SUPER, body: { unassign: true } })
  const x3 = await api('PATCH', `/api/admin/bookings/${id}`, { token: M.W, body: { workerId: W.W1.id, workerName: W.W1.name } })
  check('Hyd-West manager can assign own worker', x3.ok, `HTTP ${x3.status}`)
  await cleanup()

  // S12 — customer names a worker from another zone.
  scenario = 'S12 Customer picks worker'
  r = await book('W', { workerId: W.P1.id })
  const bb = r.ok ? await bookingAdmin(r.json.id) : null
  check('Cannot book a worker from another zone', !r.ok || Number(bb?.worker_id) !== W.P1.id, r.ok ? `assigned worker ${bb?.worker_id} (P1=${W.P1.id})` : `HTTP ${r.status}`)
  await cleanup()

  // S13 — two workers race for the same order.
  scenario = 'S13 Race to accept'
  await online('W1', true); await online('W2', true)
  r = await book('W'); id = r.json.id
  const owner = await waitFor(() => whoIsOffered(id), 15000)
  const other = owner === 'W1' ? 'W2' : 'W1'
  const [ra, rb] = await Promise.all([
    api('POST', '/api/worker/jobs/accept', { token: W[owner].tok }),
    api('POST', '/api/worker/jobs/request', { token: W[other].tok }),
  ])
  b = await bookingAdmin(id)
  check('Exactly one worker ends up with the job', Number(b.worker_id) === W[owner].id, `winner=${b.worker_id} owner=${W[owner].id} otherHTTP=${rb.status}`)
  await cleanup()

  // S14 — negatives on the edges.
  scenario = 'S14 Negative inputs'
  r = await book('X')
  check('Order from an unserved pincode is refused', !r.ok, `HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 100)}`)
  const badOtp = await api('POST', '/api/auth/verify-otp', { body: { phone: phone(11), otp: '0000' } })
  check('Wrong customer OTP refused', !badOtp.ok, `HTTP ${badOtp.status}`)
  const wOnAdmin = await api('GET', '/api/admin/workers', { token: W.W1.tok })
  check('Worker token refused on admin API', !wOnAdmin.ok, `HTTP ${wOnAdmin.status}`)
  const cOnAdmin = await api('GET', '/api/admin/bookings', { token: C.W.tok })
  check('Customer token refused on admin API', !cOnAdmin.ok, `HTTP ${cOnAdmin.status}`)
  const mkZ = await api('POST', '/api/admin/zones', { token: M.W, body: { name: 'rogue', city: 'X', pincodes: '999999' } })
  check('Zone manager cannot create zones', !mkZ.ok, `HTTP ${mkZ.status}`)
  const noAuth = await api('GET', '/api/admin/bookings')
  check('No token → refused', !noAuth.ok, `HTTP ${noAuth.status}`)
  const badItem = await api('POST', '/api/bookings', { token: C.W.tok, body: { items: [{ id: 'nope', durationId: '60m' }], type: 'instant', addressId: C.W.addr, pincode: C.W.pin, payment: 'cash' } })
  check('Unknown service refused', !badItem.ok, `HTTP ${badItem.status}`)
  if (badItem.ok) created.push(badItem.json.id)
  await cleanup()

  // S15 — isolation of every list for the three managers.
  scenario = 'S15 Manager isolation'
  for (const [mk, zk] of [['W', 'W'], ['E', 'E'], ['P', 'P']]) {
    const others = Object.keys(W).filter((k) => W[k].zone !== zk)
    const wl = list((await api('GET', '/api/admin/workers', { token: M[mk] })).json).map((w) => w.id)
    check(`Mgr ${mk}: no other-zone workers`, !others.some((k) => wl.includes(W[k].id)), `sees ${others.filter((k) => wl.includes(W[k].id)).join(',') || 'none'}`)
    const bl = list((await api('GET', '/api/admin/bookings', { token: M[mk] })).json)
    check(`Mgr ${mk}: no other-zone orders`, bl.every((x) => Number(x.zone_id) === Z[zk].id), `${bl.filter((x) => Number(x.zone_id) !== Z[zk].id).length} foreign of ${bl.length}`)
    const cl = list((await api('GET', '/api/admin/customers', { token: M[mk] })).json).map((c) => c.id)
    const foreignC = Object.keys(C).filter((k) => C[k].zone !== zk && cl.includes(C[k].id))
    check(`Mgr ${mk}: no other-zone customers`, !foreignC.length, `sees ${foreignC.join(',') || 'none'}`)
    const cm = (await api('GET', '/api/admin/campaigns', { token: M[mk] })).json
    const foreignCamp = (Array.isArray(cm) ? cm : []).filter((c) => (c.zoneIds || []).length && !(c.zoneIds || []).includes(Z[zk].id))
    check(`Mgr ${mk}: no other-zone offers`, !foreignCamp.length, `${foreignCamp.length} foreign campaigns visible`)
    const sh = list((await api('GET', '/api/admin/shifts', { token: M[mk] })).json)
    check(`Mgr ${mk}: no other-zone shifts`, sh.every((s) => s.zone_id == null || Number(s.zone_id) === Z[zk].id), `${sh.filter((s) => s.zone_id != null && Number(s.zone_id) !== Z[zk].id).length} foreign shifts`)
  }

  // S16 — a zone manager cannot change anything outside their zone.
  scenario = 'S16 Manager write isolation'
  const n1 = await api('PATCH', `/api/admin/campaigns/${Z.P.campaign}`, { token: M.W, body: { discount_value: 99 } })
  check("Can't edit another zone's offer", !n1.ok, `HTTP ${n1.status}`)
  const n2 = await api('POST', '/api/admin/campaigns', { token: M.W, body: { campaign_name: `rogue ${RUN}`, campaign_type: 'zone', discount_type: 'flat', discount_value: 5, zoneIds: [] } })
  check("Can't create an all-zones offer", !n2.ok, `HTTP ${n2.status}`)
  const n3 = await api('POST', '/api/admin/campaigns', { token: M.W, body: { campaign_name: `own ${RUN}`, campaign_type: 'zone', discount_type: 'flat', discount_value: 5, zoneIds: [Z.W.id] } })
  check('Can create an offer for own zone', n3.ok, `HTTP ${n3.status}`)
  if (n3.ok) await api('DELETE', `/api/admin/campaigns/${n3.json.campaign_id}`, { token: SUPER })
  const n4 = await api('GET', `/api/admin/customers/${C.E.id}`, { token: M.W })
  check("Can't open another zone's customer (same city)", n4.status === 404, `HTTP ${n4.status}`)
  const n5 = await api('PATCH', `/api/admin/customers/${C.E.id}`, { token: M.W, body: { name: 'hijack' } })
  check("Can't edit another zone's customer", !n5.ok, `HTTP ${n5.status}`)
  const n6 = await api('GET', `/api/admin/customers/${C.W.id}`, { token: M.W })
  check('Can open own zone customer', n6.ok, `HTTP ${n6.status}`)
  const n7 = await api('POST', '/api/admin/shifts', { token: M.W, body: { worker_id: W.E1.id, weekdays: [1], start: '09:00', end: '10:00' } })
  check("Can't add a shift for another zone's worker", !n7.ok, `HTTP ${n7.status}`)
  const n8 = await api('PATCH', `/api/admin/workers/${W.W1.id}`, { token: M.W, body: { zone_id: Z.P.id } })
  check("Can't move own worker into another zone", !n8.ok, `HTTP ${n8.status}`)
  const n9 = await api('POST', '/api/admin/workers', { token: M.W, body: { name: `rogue ${RUN}`, phone: phone(99), city: 'Pune', zone_id: Z.P.id } })
  check("Can't onboard a worker into another zone", !n9.ok, `HTTP ${n9.status}`)
  const n10 = await api('GET', '/api/admin/zones', { token: M.W })
  check('Sees only own zone in the zone list', list(n10.json).every((z) => z.id === Z.W.id), `${list(n10.json).map((z) => z.id).join(',')}`)
  const n11 = await api('GET', '/api/admin/banners', { token: M.W })
  check('Banner list excludes other zones', list(n11.json).every((b) => b.zone_id == null || b.zone_id === Z.W.id), `HTTP ${n11.status}`)
  // S17 — customer offers are zone-local.
  scenario = 'S17 Customer offers by zone'
  for (const ck of ['W', 'E', 'P']) {
    const c = C[ck], zk = c.zone
    const offers = JSON.stringify((await api('GET', `/api/offers?pincode=${c.pin}&lat=${c.lat}&lng=${c.lng}`, { token: c.tok })).json || '')
    const foreign = ['W', 'E', 'P'].filter((k) => k !== zk && offers.includes(Z[k].offer))
    check(`Customer ${ck} sees no other zone's offer`, !foreign.length, foreign.length ? `sees ${foreign.join(',')}` : 'ok')
  }

  await api('PATCH', '/api/admin/settings', { token: SUPER, body: { dispatch_timeout_min: '5' } })
  fs.writeFileSync(process.env.OUT || 'scenario-results.json', JSON.stringify({ run: RUN, results }, null, 2))
  const f = results.filter((r) => r.status === 'FAIL').length, p = results.filter((r) => r.status === 'PASS').length
  console.log(`\n${p} passed, ${f} failed, ${results.length - p - f} info`)
}

main().catch(async (e) => {
  console.error('ABORTED in', scenario, ':', e.message)
  try { await api('PATCH', '/api/admin/settings', { token: SUPER, body: { dispatch_timeout_min: '5' } }) } catch {}
  fs.writeFileSync(process.env.OUT || 'scenario-results.json', JSON.stringify({ run: RUN, aborted: e.message, results }, null, 2))
  process.exit(1)
})
