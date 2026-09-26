// Multi-zone end-to-end test against a running stack (gateway :8080).
//
//   node infra/e2e/zone-e2e.mjs            # BASE=http://host:8080 ADMIN_PW=… to override
//
// Needs DEV_OTP / WORKER_DEV_OTP set (4 digits) and no SMS provider, so OTPs come back in the API.
// Seeded demo workers with zone-less shifts will steal the first offers (see the dispatch finding);
// take them offline first for a clean happy-path run.
// Sets up two zones with their own managers, workers, customers, prices and offers, runs a full
// booking → dispatch → job → completion flow in each, and checks that zone data stays isolated.
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:8080'
const RUN = Date.now().toString().slice(-5)            // makes phones/emails unique per run
const results = []
const log = (...a) => console.log(...a)

function check(area, name, pass, detail = '') {
  results.push({ area, name, pass: !!pass, detail: String(detail).slice(0, 300) })
  log(`${pass ? 'PASS' : 'FAIL'}  [${area}] ${name}${detail ? '  — ' + String(detail).slice(0, 160) : ''}`)
}

async function api(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let json; try { json = JSON.parse(text) } catch { json = text }
  return { status: r.status, ok: r.ok, json }
}
const must = async (label, p) => {
  const r = await p
  if (!r.ok) throw new Error(`${label} → ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`)
  return r.json
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ids = (list) => (Array.isArray(list) ? list : list?.workers || list?.bookings || list?.customers || list?.rows || []).map((x) => x.id)

// ── Setup ────────────────────────────────────────────────────────────────────────────────────
const ZONES = {
  A: { name: `E2E Zone A ${RUN}`, city: 'Hyderabad', state: 'Telangana', pins: ['500081', '500084'],
       services: ['mopping', 'kitchen', 'bathroom'], price: { mopping: 149 }, offer: `Zone A Special ${RUN}` },
  B: { name: `E2E Zone B ${RUN}`, city: 'Pune', state: 'Maharashtra', pins: ['411045', '411046'],
       services: ['mopping', 'dusting'], price: { mopping: 199 }, offer: `Zone B Special ${RUN}` },
}
const phone = (n) => `9${RUN}${String(n).padStart(4, '0')}`

async function main() {
  const superTok = (await must('super login', api('POST', '/api/admin/login', { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } }))).token

  // Remove zones left by earlier runs of either suite (they hold the same pincodes).
  const prev = (await api('GET', '/api/admin/zones', { token: superTok })).json
  for (const z of prev.filter((z) => z.name.startsWith('E2E '))) await api('DELETE', `/api/admin/zones/${z.id}`, { token: superTok })

  for (const [k, z] of Object.entries(ZONES)) {
    const zr = await must(`create zone ${k}`, api('POST', '/api/admin/zones', { token: superTok, body: {
      name: z.name, state: z.state, city: z.city, pincodes: z.pins.join(','), status: 'live', slaMinutes: 60,
      config: { services: z.services, pricing: z.price, workingHours: { is247: true } },
    } }))
    z.id = zr.id
    check('setup', `Zone ${k} created (id ${z.id}, pins ${z.pins.join('/')})`, z.id)

    // Zone manager scoped to this zone only.
    const email = `mgr${k.toLowerCase()}${RUN}@e2e.test`
    await must(`create manager ${k}`, api('POST', '/api/admin/admins', { token: superTok, body: {
      name: `Manager ${k}`, email, password: 'Mgr@12345', role: 'manager', scopeType: 'zone', scopeValues: [z.id],
    } }))
    z.mgr = (await must(`manager ${k} login`, api('POST', '/api/admin/login', { body: { email, password: 'Mgr@12345' } }))).token
    const me = await must('me', api('GET', '/api/admin/me', { token: z.mgr }))
    check('setup', `Manager ${k} scoped to zone ${z.id}`, JSON.stringify(me.admin?.scope?.zoneIds) === JSON.stringify([z.id]), JSON.stringify(me.admin?.scope))

    // Zone-only offer shown to customers.
    await must(`campaign ${k}`, api('POST', '/api/admin/campaigns', { token: superTok, body: {
      campaign_name: z.offer, campaign_type: 'zone', discount_type: 'flat', discount_value: 20, max_discount: 20,
      min_subtotal: 0, priority: 5, stackable: false, status: 'active', banner_title: z.offer,
      banner_subtitle: `Only in ${z.name}`, zoneIds: [z.id], rule: {},
    } }))

    // Worker for this zone, active, on a zone-tagged 24h shift every day, restricted to own zone.
    z.wPhone = phone(k === 'A' ? 1 : 2)
    const w = await must(`create worker ${k}`, api('POST', '/api/admin/workers', { token: superTok, body: {
      name: `Worker ${k} ${RUN}`, phone: z.wPhone, city: z.city, zone_id: z.id, status: 'active',
      services: ['Sweeping & Mopping', 'Kitchen Cleaning', 'Dusting Furniture', 'Bathroom Cleaning'],
    } }))
    z.wId = w.id || w.worker?.id
    await must(`shift ${k}`, api('POST', '/api/admin/shifts', { token: superTok, body: {
      worker_id: z.wId, zone_id: z.id, weekdays: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59',
    } }))
    await api('PATCH', `/api/admin/workers/${z.wId}/coverage`, { token: superTok, body: { allowOutsideRadius: false, jobRadiusKm: 25 } })
    const otpW = await must(`worker ${k} otp`, api('POST', '/api/worker/auth/request-otp', { body: { phone: z.wPhone } }))
    const vw = await must(`worker ${k} verify`, api('POST', '/api/worker/auth/verify', { body: { phone: z.wPhone, otp: otpW.devOtp || '1234' } }))
    z.wTok = vw.token
    await must(`worker ${k} online`, api('POST', '/api/worker/status', { token: z.wTok, body: { state: 'Available' } }))
    check('setup', `Worker ${k} (id ${z.wId}) onboarded, logged in, online`, z.wTok)

    // Customer with an address inside the zone.
    z.cPhone = phone(k === 'A' ? 11 : 12)
    const otpC = await must(`customer ${k} otp`, api('POST', '/api/auth/request-otp', { body: { phone: z.cPhone } }))
    const vc = await must(`customer ${k} verify`, api('POST', '/api/auth/verify-otp', { body: { phone: z.cPhone, otp: otpC.devOtp || '4321' } }))
    z.cTok = vc.token; z.cId = vc.user?.id
    await must(`customer ${k} name`, api('PATCH', '/api/me', { token: z.cTok, body: { name: `Customer ${k} ${RUN}`, city: z.city } }))
    const addr = await must(`address ${k}`, api('POST', '/api/addresses', { token: z.cTok, body: {
      label: 'Home', house: '12-3', street: 'Main Road', city: z.city, pincode: z.pins[0],
      lat: k === 'A' ? 17.4435 : 18.559, lng: k === 'A' ? 78.3772 : 73.7868, makeDefault: true,
    } }))
    z.addrId = addr.id
    check('setup', `Customer ${k} (id ${z.cId}) registered with address in ${z.pins[0]}`, z.cTok && z.addrId)
  }

  // ── Customer catalogue & offers per zone ───────────────────────────────────────────────────
  for (const [k, z] of Object.entries(ZONES)) {
    const other = ZONES[k === 'A' ? 'B' : 'A']
    const sv = await must('services', api('GET', `/api/services?pincode=${z.pins[0]}`, { token: z.cTok }))
    const avail = sv.services.filter((s) => s.available).map((s) => s.id).sort()
    check('catalogue', `Zone ${k} customer sees only zone ${k} services`, JSON.stringify(avail) === JSON.stringify([...z.services].sort()), `available=${avail}`)
    // The list shows a "from" price (shortest 30-min slot = 60-min zone price − ₹50) before offers.
    const mop = sv.services.find((s) => s.id === 'mopping')
    check('catalogue', `Zone ${k} mopping uses the zone price (from ₹${z.price.mopping - 50})`, mop?.listPrice === z.price.mopping - 50, `listPrice ₹${mop?.listPrice}, after offers ₹${mop?.price}`)
    const offers = await must('offers', api('GET', `/api/offers?pincode=${z.pins[0]}`, { token: z.cTok }))
    const titles = offers.map((o) => o.title)
    check('offers', `Zone ${k} customer sees zone ${k} offer`, titles.includes(z.offer), titles.join(' | '))
    check('offers', `Zone ${k} customer does NOT see zone ${k === 'A' ? 'B' : 'A'} offer`, !titles.includes(other.offer), titles.join(' | '))
  }

  // ── Booking → dispatch → job flow → completion, per zone ───────────────────────────────────
  for (const [k, z] of Object.entries(ZONES)) {
    const other = ZONES[k === 'A' ? 'B' : 'A']
    const q = await must('quote', api('POST', '/api/quote', { token: z.cTok, body: { items: [{ id: 'mopping', durationId: '60m' }], pincode: z.pins[0] } }))
    check('booking', `Zone ${k} quote total ₹${q.total}`, q.total > 0, JSON.stringify({ subtotal: q.subtotal, discount: q.discount, fee: q.fee, tax: q.tax }))
    const now = new Date()
    const b = await must('booking', api('POST', '/api/bookings', { token: z.cTok, body: {
      items: [{ id: 'mopping', durationId: '60m' }], type: 'instant', addressId: z.addrId, pincode: z.pins[0],
      payment: 'cash', lat: k === 'A' ? 17.4435 : 18.559, lng: k === 'A' ? 78.3772 : 73.7868,
      date: now.toDateString(), time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    } }))
    z.bookingId = b.id
    check('booking', `Zone ${k} booking ${b.ref} created`, b.id, `status=${b.status}`)
    check('booking', `Zone ${k} booking tagged with zone ${z.id}`, Number(b.zone_id) === z.id, `zone_id=${b.zone_id}`)

    // Wait for the offer to reach this zone's worker, and make sure the other zone's worker never gets it.
    let offer, otherSaw = false
    for (let i = 0; i < 20; i++) {
      offer = (await api('GET', '/api/worker/jobs/offer', { token: z.wTok })).json
      const o2 = (await api('GET', '/api/worker/jobs/offer', { token: other.wTok })).json
      if (o2?.state === 'PENDING' && Number(o2.bookingId) === z.bookingId) otherSaw = true
      if (offer?.state === 'PENDING' && Number(offer.bookingId) === z.bookingId) break
      await sleep(1500)
    }
    check('dispatch', `Zone ${k} worker receives the offer`, offer?.state === 'PENDING' && Number(offer.bookingId) === z.bookingId, JSON.stringify({ state: offer?.state, bookingId: offer?.bookingId, remainingSec: offer?.remainingSec }))
    check('dispatch', `Zone ${k === 'A' ? 'B' : 'A'} worker never offered zone ${k}'s job`, !otherSaw)
    if (offer?.state !== 'PENDING') continue

    const acc = await api('POST', '/api/worker/jobs/accept', { token: z.wTok })
    check('job', `Zone ${k} worker accepts`, acc.ok && acc.json?.ok !== false, JSON.stringify(acc.json).slice(0, 120))
    let cb = (await api('GET', `/api/bookings/${z.bookingId}`, { token: z.cTok })).json
    check('job', `Customer ${k} sees worker assigned`, ['worker_assigned', 'on_the_way'].includes(cb.status), `status=${cb.status}, pro=${cb.pro_name}`)
    await must('otw', api('POST', '/api/worker/jobs/on-the-way', { token: z.wTok }))
    cb = (await api('GET', `/api/bookings/${z.bookingId}`, { token: z.cTok })).json
    check('job', `Customer ${k} sees "on the way"`, cb.status === 'on_the_way', `status=${cb.status}`)
    await must('arrived', api('POST', '/api/worker/jobs/arrived', { token: z.wTok }))
    cb = (await api('GET', `/api/bookings/${z.bookingId}`, { token: z.cTok })).json
    check('job', `Customer ${k} sees "arrived" and has the start OTP`, cb.status === 'arrived' && cb.service_otp, `status=${cb.status}, otp=${cb.service_otp ? 'yes' : 'no'}`)
    const bad = await api('POST', '/api/worker/jobs/verify-otp', { token: z.wTok, body: { otp: '0000' } })
    check('job', `Zone ${k} wrong OTP is rejected`, bad.json?.ok === false || !bad.ok, JSON.stringify(bad.json).slice(0, 100))
    const good = await api('POST', '/api/worker/jobs/verify-otp', { token: z.wTok, body: { otp: cb.service_otp } })
    check('job', `Zone ${k} correct OTP starts the service`, good.ok && good.json?.ok !== false, JSON.stringify(good.json).slice(0, 100))
    cb = (await api('GET', `/api/bookings/${z.bookingId}`, { token: z.cTok })).json
    check('job', `Customer ${k} sees "in progress"`, cb.status === 'in_progress', `status=${cb.status}`)
    await must('end', api('POST', '/api/worker/jobs/end', { token: z.wTok, body: {} }))
    await sleep(1500)
    cb = (await api('GET', `/api/bookings/${z.bookingId}`, { token: z.cTok })).json
    check('job', `Customer ${k} sees "completed"`, cb.status === 'completed', `status=${cb.status}`)
    const settle = await api('POST', '/api/worker/jobs/settle', { token: z.wTok })
    check('job', `Zone ${k} worker settle call`, settle.ok, JSON.stringify(settle.json).slice(0, 120))
  }

  // ── Admin zone isolation ───────────────────────────────────────────────────────────────────
  const A = ZONES.A, B = ZONES.B
  for (const [k, z] of Object.entries(ZONES)) {
    const o = ZONES[k === 'A' ? 'B' : 'A'], ok = k === 'A' ? 'B' : 'A'
    const wl = ids((await api('GET', '/api/admin/workers', { token: z.mgr })).json)
    check('isolation', `Manager ${k} worker list includes own worker`, wl.includes(z.wId))
    check('isolation', `Manager ${k} worker list excludes zone ${ok} worker`, !wl.includes(o.wId), `sees ${wl.length} workers: ${wl.join(',')}`)
    const wd = await api('GET', `/api/admin/workers/${o.wId}`, { token: z.mgr })
    check('isolation', `Manager ${k} cannot open zone ${ok} worker profile`, !wd.ok, `HTTP ${wd.status}`)
    const bl = ids((await api('GET', '/api/admin/bookings', { token: z.mgr })).json)
    check('isolation', `Manager ${k} bookings include own zone booking`, bl.includes(z.bookingId))
    check('isolation', `Manager ${k} bookings exclude zone ${ok} booking`, !bl.includes(o.bookingId), `sees ${bl.length} bookings`)
    const bd = await api('GET', `/api/admin/bookings/${o.bookingId}`, { token: z.mgr })
    check('isolation', `Manager ${k} cannot open zone ${ok} booking`, !bd.ok, `HTTP ${bd.status}`)
    const cl = ids((await api('GET', '/api/admin/customers', { token: z.mgr })).json)
    check('isolation', `Manager ${k} customers include own customer`, cl.includes(z.cId), `sees ${cl.length}`)
    check('isolation', `Manager ${k} customers exclude zone ${ok} customer`, !cl.includes(o.cId), `sees ${cl.length}`)
    const cd = await api('GET', `/api/admin/customers/${o.cId}`, { token: z.mgr })
    check('isolation', `Manager ${k} cannot open zone ${ok} customer`, !cd.ok, `HTTP ${cd.status}`)
    const cp = await api('PATCH', `/api/admin/customers/${o.cId}`, { token: z.mgr, body: { note: 'probe' } })
    check('isolation', `Manager ${k} cannot edit zone ${ok} customer`, !cp.ok, `HTTP ${cp.status}`)
    const camps = (await api('GET', '/api/admin/campaigns', { token: z.mgr })).json
    const campNames = (Array.isArray(camps) ? camps : []).map((c) => c.campaign_name)
    check('isolation', `Manager ${k} campaigns exclude zone ${ok} offer`, !campNames.includes(o.offer), `sees ${campNames.length} campaigns`)
    const sh = await api('GET', '/api/admin/shifts', { token: z.mgr })
    const shRows = Array.isArray(sh.json) ? sh.json : sh.json?.shifts || []
    check('isolation', `Manager ${k} shifts exclude zone ${ok} worker`, !shRows.some((s) => Number(s.worker_id) === o.wId), `HTTP ${sh.status}, ${shRows.length} rows`)
    const mk = await api('POST', '/api/admin/workers', { token: z.mgr, body: { name: `Probe ${k}${RUN}`, phone: phone(k === 'A' ? 91 : 92), city: o === B ? 'Pune' : 'Hyderabad', zone_id: o.id, status: 'pending', services: [] } })
    check('isolation', `Manager ${k} cannot create a worker in zone ${ok}`, !mk.ok, `HTTP ${mk.status}`)
    const mv = await api('PATCH', `/api/admin/workers/${z.wId}`, { token: z.mgr, body: { zone_id: o.id } })
    const back = (await api('GET', `/api/admin/workers/${z.wId}`, { token: (await api('POST', '/api/admin/login', { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } })).json.token })).json
    const moved = Number((back.worker || back).zone_id) === o.id
    check('isolation', `Manager ${k} cannot move own worker into zone ${ok}`, !moved, `PATCH HTTP ${mv.status}, zone now ${(back.worker || back).zone_id}`)
    if (moved) await api('PATCH', `/api/admin/workers/${z.wId}`, { token: superTok, body: { zone_id: z.id } })
  }

  // ── Customer cross-zone access ──────────────────────────────────────────────────────────────
  const xb = await api('GET', `/api/bookings/${B.bookingId}`, { token: A.cTok })
  check('isolation', 'Customer A cannot read customer B\'s booking', !xb.ok, `HTTP ${xb.status}`)
  const xw = await api('GET', `/api/worker/jobs/offer`, { token: A.cTok })
  check('isolation', 'Customer token rejected on worker API', !xw.ok, `HTTP ${xw.status}`)

  fs.writeFileSync(process.env.OUT || 'e2e-results.json', JSON.stringify({ run: RUN, zones: ZONES, results }, null, 2))
  const fails = results.filter((r) => !r.pass)
  log(`\n${results.length - fails.length}/${results.length} passed`)
}

main().catch((e) => {
  console.error('ABORTED:', e.message)
  fs.writeFileSync(process.env.OUT || 'e2e-results.json', JSON.stringify({ run: RUN, aborted: e.message, results }, null, 2))
  process.exit(1)
})
