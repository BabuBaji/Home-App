// Staff roles, hub-level scope and SOS routing, against a running stack.
//   • the 11 built-in roles exist and each can do its job — and only its job;
//   • a hub manager sees their hub's experts and bookings, not the next hub's in the same zone;
//   • an SOS reaches super admins, the safety desk and the manager of that expert's hub — not other
//     zones' managers, not finance, and not an unauthenticated socket;
//   • SOS incidents: hub-scoped list, "I'm responding", resolve with a note.
//
//   node infra/e2e/roles-sos-hubs.mjs            # BASE=… ADMIN_PW=…
import { createRequire } from 'node:module'
const { io } = createRequire(new URL('../../apps/admin/package.json', import.meta.url))('socket.io-client')
const BASE = process.env.BASE || 'http://localhost:8080'
const RUN = Date.now().toString().slice(-5)
let fails = 0, total = 0
const check = (n, p, d = '') => { total++; if (!p) fails++; console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + String(d).slice(0, 180) : ''}`) }
async function api(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let json; try { json = JSON.parse(t) } catch { json = t }
  return { status: r.status, ok: r.ok, json }
}
const must = async (label, p) => { const r = await p; if (!r.ok) throw new Error(`${label} → ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`); return r.json }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const A = (p) => `/api/admin${p}`

async function main() {
  const SUP = (await must('super', api('POST', A('/login'), { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } }))).token
  const cleanup = []
  try {
    // ── Built-in roles ──
    const roles = (await must('roles', api('GET', A('/roles'), { token: SUP }))).roles || []
    const sys = roles.filter((r) => r.isSystem).map((r) => r.key).sort()
    check('11 built-in roles exist', ['admin', 'auditor', 'dispatcher', 'finance', 'manager', 'marketing', 'recruiter', 'safety', 'super', 'support', 'trainer'].every((k) => sys.includes(k)), sys.join(', '))

    // ── Geography: zone Z with hubs H1, H2 (4 km apart); zone Z2 elsewhere ──
    const off = (Number(RUN) % 97) / 1000
    const lat = 18.2 + off, lng = 79.1 + off
    const pinZ = `6${RUN}`, pinZ2 = `7${RUN}`
    const Z = await must('zone', api('POST', A('/zones'), { token: SUP, body: { name: `E2E Hubs ${RUN}`, city: 'Hyderabad', state: 'Telangana', pincodes: pinZ, status: 'live', config: { services: ['mopping'], workingHours: { is247: true }, coverage: { lat, lng, radiusKm: 6 } } } }))
    const Z2 = await must('zone2', api('POST', A('/zones'), { token: SUP, body: { name: `E2E Other ${RUN}`, city: 'Hyderabad', state: 'Telangana', pincodes: pinZ2, status: 'live', config: { services: ['mopping'], workingHours: { is247: true }, coverage: { lat: lat + 0.5, lng: lng + 0.5, radiusKm: 4 } } } }))
    cleanup.push(() => api('DELETE', A(`/zones/${Z.id}`), { token: SUP }), () => api('DELETE', A(`/zones/${Z2.id}`), { token: SUP }))
    const store = async (n, dLng) => must('store', api('POST', A('/stores'), { token: SUP, body: { name: `E2E Hub${n} ${RUN}`, zone_id: Z.id, lat, lng: lng + dLng, radius_km: 1.2, override: true } }))
    const H1 = await store(1, -0.02), H2 = await store(2, 0.02)
    cleanup.push(() => api('DELETE', A(`/stores/${H1.id}`), { token: SUP }), () => api('DELETE', A(`/stores/${H2.id}`), { token: SUP }))

    const worker = async (n, zone, storeId) => {
      const phone = `9${RUN}${n}3${n}3`.slice(0, 10)
      const w = await must('worker', api('POST', A('/workers'), { token: SUP, body: { name: `Hub${n} ${RUN}`, phone, city: 'Hyderabad', zone_id: zone.id, store_id: storeId, status: 'active', services: ['Sweeping & Mopping'] } }))
      const o = await must('otp', api('POST', '/api/worker/auth/request-otp', { body: { phone } }))
      const v = await must('verify', api('POST', '/api/worker/auth/verify', { body: { phone, otp: o.devOtp || '1234' } }))
      return { id: w.id || w.worker?.id, tok: v.token }
    }
    const WA = await worker(1, Z, H1.id), WB = await worker(2, Z, H2.id), WC = await worker(3, Z2, null)

    const admin = async (key, role, scopeType, scopeValues) => {
      const email = `${key}${RUN}@e2e.test`
      await must(`admin ${key}`, api('POST', A('/admins'), { token: SUP, body: { name: `E2E ${key}`, email, password: 'Role@12345', role, scopeType, scopeValues } }))
      return (await must(`login ${key}`, api('POST', A('/login'), { body: { email, password: 'Role@12345' } }))).token
    }
    const HUB = await admin('hub', 'manager', 'store', [H1.id])
    const ZM2 = await admin('zm', 'manager', 'zone', [Z2.id])
    const SAF = await admin('saf', 'safety', 'all', [])
    const FIN = await admin('fin', 'finance', 'all', [])
    const REC = await admin('rec', 'recruiter', 'all', [])
    const AUD = await admin('aud', 'auditor', 'all', [])
    const MKT = await admin('mkt', 'marketing', 'all', [])
    const DSP = await admin('dsp', 'dispatcher', 'all', [])

    // ── Each role does its job, and only its job ──
    check('Finance can see payments', (await api('GET', A('/payments'), { token: FIN })).ok)
    check("Finance can't change settings", (await api('PATCH', A('/settings'), { token: FIN, body: { platform_tagline: 'x' } })).status === 403)
    check("Finance can't edit services/prices", (await api('PATCH', A('/services/mopping'), { token: FIN, body: { price: 1 } })).status === 403)
    const rw = await api('POST', A('/workers'), { token: REC, body: { name: `Rec ${RUN}`, phone: `8${RUN}6161`, city: 'Hyderabad', zone_id: Z.id, status: 'pending', services: ['Sweeping & Mopping'] } })
    check('Recruiter can onboard a worker', rw.ok, `HTTP ${rw.status}`)
    check("Recruiter can't see payments", (await api('GET', A('/payments'), { token: REC })).status === 403)
    check('Auditor can read customers and the activity log', (await api('GET', A('/customers'), { token: AUD })).ok && (await api('GET', A('/activity?limit=5'), { token: AUD })).ok)
    check("Auditor can't change anything", (await api('PATCH', A('/settings'), { token: AUD, body: { platform_tagline: 'x' } })).status === 403 && (await api('POST', A('/workers'), { token: AUD, body: { name: 'x', phone: `8${RUN}6262` } })).status === 403)
    check("Auditor can't see admin users", (await api('GET', A('/admins'), { token: AUD })).status === 403)
    const camp = await api('POST', A('/banners'), { token: MKT, body: { title: `E2E Mkt ${RUN}`, active: false } })
    check('Marketing can create a banner', camp.ok, `HTTP ${camp.status} ${JSON.stringify(camp.json).slice(0, 80)}`)
    if (camp.ok && camp.json?.id) cleanup.push(() => api('DELETE', A(`/banners/${camp.json.id}`), { token: SUP }))
    check("Marketing can't touch worker wallets", !(await api('POST', A(`/workers/${WA.id}/wallet/bonus`), { token: MKT, body: { amount: 10 } })).ok)
    check('Dispatcher can open the control tower', (await api('GET', A('/control-tower'), { token: DSP })).ok)
    check("Dispatcher can't issue refunds", (await api('POST', A('/actions/refund'), { token: DSP, body: { bookingId: 1 } })).status === 403)

    // ── Hub scope ──
    const hubWorkers = (await must('workers', api('GET', A('/workers?status=all'), { token: HUB }))).workers.map((w) => w.id)
    check("Hub manager sees their hub's expert", hubWorkers.includes(WA.id))
    check("…not the other hub's expert in the same zone", !hubWorkers.includes(WB.id))
    check('…not another zone’s expert', !hubWorkers.includes(WC.id))
    check("Opening the other hub's expert is a 404", (await api('GET', A(`/workers/${WB.id}`), { token: HUB })).status === 404)
    const nw = await api('POST', A('/workers'), { token: HUB, body: { name: `HubNew ${RUN}`, phone: `8${RUN}7171`, city: 'Hyderabad', zone_id: Z.id, status: 'pending', services: ['Sweeping & Mopping'] } })
    const nwd = nw.ok ? await api('GET', A(`/workers/${nw.json.id || nw.json.worker?.id}`), { token: SUP }) : null
    check('A worker added by the hub manager lands in their hub', nw.ok && Number(nwd?.json?.store_id) === H1.id, `HTTP ${nw.status} store ${nwd?.json?.store_id}`)
    check("Hub manager can't move a worker to another hub", (await api('PATCH', A(`/workers/${WA.id}`), { token: HUB, body: { store_id: H2.id } })).status === 403)
    check("Hub manager can't set zone-wide surge", (await api('POST', A('/surge'), { token: HUB, body: { zoneId: Z.id, pct: 10, minutes: 1 } })).status === 403)

    const cphone = `6${RUN}8989`
    const co = await must('c otp', api('POST', '/api/auth/request-otp', { body: { phone: cphone } }))
    const C = (await must('c verify', api('POST', '/api/auth/verify-otp', { body: { phone: cphone, otp: co.devOtp || '4321' } }))).token
    const book = async (dLng, label) => {
      const addr = (await must('addr', api('POST', '/api/addresses', { token: C, body: { label, house: '1', street: 'Hub Rd', city: 'Hyderabad', pincode: pinZ, lat, lng: lng + dLng, makeDefault: true } }))).id
      return must('book', api('POST', '/api/bookings', { token: C, body: { items: [{ id: 'mopping', durationId: '60m' }], type: 'instant', addressId: addr, pincode: pinZ, lat, lng: lng + dLng, payment: 'cash' } }))
    }
    const b1 = await book(-0.02, 'Near hub 1'), b2 = await book(0.02, 'Near hub 2')
    cleanup.push(() => api('POST', `/api/bookings/${b1.id}/cancel`, { token: C, body: { reason: 'e2e' } }), () => api('POST', `/api/bookings/${b2.id}/cancel`, { token: C, body: { reason: 'e2e' } }))
    const g1 = await must('b1', api('GET', A(`/bookings/${b1.id}`), { token: SUP })).catch(() => null)
    check('A booking is stamped with the hub that covers the address', Number(g1?.store_id ?? (await api('GET', A('/bookings'), { token: SUP })).json.find((x) => x.id === b1.id)?.store_id) === H1.id)
    const hb = (await must('bookings', api('GET', A('/bookings'), { token: HUB }))).map((x) => x.id)
    check("Hub manager's booking list has hub 1's booking, not hub 2's", hb.includes(b1.id) && !hb.includes(b2.id), `has b1 ${hb.includes(b1.id)}, has b2 ${hb.includes(b2.id)}`)

    // ── SOS routing over the realtime socket ──
    const listen = (token) => new Promise((resolve) => {
      const s = io(BASE, { transports: ['websocket'], forceNew: true })
      const got = []
      s.on('sos', (p) => got.push(p))
      s.on('connect', () => { if (token !== undefined) s.emit('admin:join', token); setTimeout(() => resolve({ s, got }), 700) })
    })
    const L = { super: await listen(SUP), hub: await listen(HUB), zm2: await listen(ZM2), safety: await listen(SAF), finance: await listen(FIN), anon: await listen(''), none: await listen(undefined) }
    await must('sos A', api('POST', '/api/worker/sos', { token: WA.tok, body: { lat, lng: lng - 0.02, reason: `E2E SOS ${RUN}` } }))
    await sleep(1500)
    const got = (k) => L[k].got.some((p) => p.workerId === WA.id)
    check("SOS reaches the expert's hub manager", got('hub'))
    check('…the safety desk', got('safety'))
    check('…and super admins', got('super'))
    check("…not another zone's manager", !got('zm2'))
    check('…not finance', !got('finance'))
    check('…and never an unauthenticated socket', !got('anon') && !got('none'))
    await must('sos B', api('POST', '/api/worker/sos', { token: WB.tok, body: { reason: `E2E SOS B ${RUN}` } }))
    await sleep(1500)
    check("An SOS in the other hub doesn't reach this hub's manager", !L.hub.got.some((p) => p.workerId === WB.id) && L.safety.got.some((p) => p.workerId === WB.id))
    for (const v of Object.values(L)) v.s.close()

    // ── SOS incidents ──
    const hubSos = await must('sos list', api('GET', A('/sos'), { token: HUB }))
    const inc = hubSos.find((x) => x.workerId === WA.id)
    check('Hub manager sees the incident with location', !!inc && inc.kind === 'worker' && inc.lat != null && inc.status === 'Open', JSON.stringify(inc || {}).slice(0, 150))
    check("…but not the other hub's incident", !hubSos.some((x) => x.workerId === WB.id))
    check("Finance can't open the SOS queue", (await api('GET', A('/sos'), { token: FIN })).status === 403)
    const ack = await api('POST', A(`/sos/${inc?.id}/ack`), { token: HUB })
    check('"I\'m responding" records who', ack.ok && ack.json.status === 'Acknowledged' && /E2E hub/.test(ack.json.acknowledgedBy || ''), JSON.stringify(ack.json).slice(0, 120))
    check('Closing without a note is refused', (await api('POST', A(`/sos/${inc?.id}/resolve`), { token: HUB, body: {} })).status === 400)
    const rs = await api('POST', A(`/sos/${inc?.id}/resolve`), { token: HUB, body: { note: 'Called her — she slipped, is fine.' } })
    check('Resolve with a note', rs.ok && rs.json.status === 'Resolved')
    const safList = await must('saf sos', api('GET', A('/sos'), { token: SAF }))
    const incB = safList.find((x) => x.workerId === WB.id)
    check('Safety desk sees every open incident', !!incB && !safList.some((x) => x.id === inc?.id))
    if (incB) await api('POST', A(`/sos/${incB.id}/resolve`), { token: SAF, body: { note: 'e2e cleanup' } })
    const acts = (await must('activity', api('GET', A(`/activity?entityType=worker&entityId=${WA.id}&limit=20`), { token: SUP }))).items
    check('SOS is in the activity log with its reason', acts.some((a) => a.action === 'sos' && /E2E SOS/.test(a.detail || '')))
  } finally {
    for (const f of cleanup.reverse()) { try { await f() } catch { /* best effort */ } }
  }
  console.log(`\n${total - fails} passed, ${fails} failed`)
  process.exit(fails ? 1 : 0)
}
main().catch((e) => { console.error('ABORTED:', e.message); process.exit(1) })
