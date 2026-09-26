// Worker-side money and safety checks against a running stack: advances need approval, payslips
// come from the ledger, managers only touch their own zone's wallets, worker tickets reach ops,
// insurance shows the real policy, referral codes, customer SOS.
//
//   node infra/e2e/worker-side.mjs            # BASE=… ADMIN_PW=…
const BASE = process.env.BASE || 'http://localhost:8080'
const RUN = Date.now().toString().slice(-5)
let fails = 0, total = 0
const check = (n, p, d = '') => { total++; if (!p) fails++; console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + String(d).slice(0, 160) : ''}`) }
async function api(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let json; try { json = JSON.parse(t) } catch { json = t }
  return { status: r.status, ok: r.ok, json }
}
const must = async (label, p) => { const r = await p; if (!r.ok) throw new Error(`${label} → ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`); return r.json }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const SUP = (await must('super', api('POST', '/api/admin/login', { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } }))).token
  const zone = async (k, pin, lat, lng) => must('zone', api('POST', '/api/admin/zones', { token: SUP, body: { name: `E2E WS${k} ${RUN}`, city: 'Hyderabad', state: 'Telangana', pincodes: pin, status: 'live', config: { services: ['mopping'], workingHours: { is247: true }, coverage: { lat, lng, radiusKm: 4 } } } }))
  const ZA = await zone('A', `3${RUN}`, 17.36, 78.47), ZB = await zone('B', `2${RUN}`, 17.30, 78.40)
  const worker = async (n, z) => {
    const phone = `9${RUN}${n}111`.slice(0, 10)
    const w = await must('worker', api('POST', '/api/admin/workers', { token: SUP, body: { name: `WS${n} ${RUN}`, phone, city: 'Hyderabad', zone_id: z.id, status: 'active', services: ['Sweeping & Mopping'] } }))
    const o = await must('otp', api('POST', '/api/worker/auth/request-otp', { body: { phone } }))
    const v = await must('verify', api('POST', '/api/worker/auth/verify', { body: { phone, otp: o.devOtp || '1234' } }))
    return { id: w.id || w.worker?.id, tok: v.token }
  }
  const W1 = await worker(1, ZA), W2 = await worker(2, ZA)
  const mgrEmail = `mws${RUN}@e2e.test`
  await must('mgr', api('POST', '/api/admin/admins', { token: SUP, body: { name: 'Mgr WSB', email: mgrEmail, password: 'Mgr@12345', role: 'manager', scopeType: 'zone', scopeValues: [ZB.id] } }))
  const MB = (await must('mgr login', api('POST', '/api/admin/login', { body: { email: mgrEmail, password: 'Mgr@12345' } }))).token

  // ── Advances need approval ──
  const bal = async () => (await api('GET', '/api/worker/wallet/summary', { token: W1.tok })).json.available
  const b0 = await bal()
  const a1 = await api('POST', '/api/worker/wallet/advance/request', { token: W1.tok, body: { amount: 1000 } })
  check('Advance request is pending, not paid', a1.json?.ok && a1.json?.pending && (await bal()) === b0, `balance ₹${b0} → ₹${await bal()}`)
  const a2 = await api('POST', '/api/worker/wallet/advance/request', { token: W1.tok, body: { amount: 500 } })
  check('Second request while one is pending is refused', a2.json?.ok === false, a2.json?.error)
  const adv = (await api('GET', `/api/admin/workers/${W1.id}/wallet`, { token: SUP })).json.advances.find((x) => x.status === 'Pending')
  const other = await api('POST', `/api/admin/workers/${W1.id}/wallet/advances/${adv.id}/approve`, { token: MB })
  check("Another zone's manager can't approve it", other.status === 404, `HTTP ${other.status}`)
  const seen = await api('GET', `/api/admin/workers/${W1.id}/wallet`, { token: MB })
  check("…or even see that worker's wallet", seen.status === 404, `HTTP ${seen.status}`)
  const bonusX = await api('POST', `/api/admin/workers/${W1.id}/wallet/bonus`, { token: MB, body: { amount: 999 } })
  check("…or pay them a bonus", !bonusX.ok, `HTTP ${bonusX.status}`)
  await must('approve', api('POST', `/api/admin/workers/${W1.id}/wallet/advances/${adv.id}/approve`, { token: SUP }))
  check('Approved advance is credited', (await bal()) === b0 + 1000, `balance ₹${await bal()}`)

  // ── Payslip from the ledger ──
  await must('bonus', api('POST', `/api/admin/workers/${W1.id}/wallet/bonus`, { token: SUP, body: { amount: 500, label: 'Test bonus' } }))
  await must('penalty', api('POST', `/api/admin/workers/${W1.id}/wallet/penalty`, { token: SUP, body: { amount: 120, label: 'Test penalty' } }))
  const ps = (await api('GET', '/api/worker/wallet/payslip', { token: W1.tok })).json
  check('Payslip shows real earnings, deductions and net', ps.gross === 500 && ps.deductions === 120 && ps.net === 380, JSON.stringify({ gross: ps.gross, deductions: ps.deductions, net: ps.net }))

  // ── Insurance shows the recorded policy only ──
  const i0 = (await api('GET', '/api/worker/insurance', { token: W1.tok })).json
  check('No invented policy number before one is recorded', !i0.policyNo && !i0.activated, JSON.stringify(i0).slice(0, 100))
  await must('policy', api('POST', `/api/admin/workers/${W1.id}/insurance`, { token: SUP, body: { policyNo: 'ICICI-LMB-778812' } }))
  const i1 = (await api('GET', '/api/worker/insurance', { token: W1.tok })).json
  check('Recorded policy shows in the app', i1.policyNo === 'ICICI-LMB-778812' && i1.activated)

  // ── Worker tickets reach the ops queue ──
  await must('ticket', api('POST', '/api/worker/support', { token: W1.tok, body: { subject: `Uniform size ${RUN}`, message: 'Need a larger size' } }))
  await sleep(800)
  const tl = (await api('GET', '/api/admin/tickets', { token: SUP })).json
  const t = tl.find((x) => x.subject === `Uniform size ${RUN}`)
  check('Worker ticket appears in admin Tickets', !!t && t.requester === 'worker' && /Expert/.test(t.customer), t ? t.customer : 'missing')
  const tlB = (await api('GET', '/api/admin/tickets', { token: MB })).json
  check("Other zone's manager doesn't see it", !tlB.some((x) => x.subject === `Uniform size ${RUN}`))
  if (t) await must('reply', api('PATCH', `/api/admin/tickets/${t.id}`, { token: SUP, body: { status: 'Resolved', response: 'Sent a size L' } }))
  const mine = (await api('GET', '/api/worker/support', { token: W1.tok })).json
  const mt = (Array.isArray(mine) ? mine : []).find((x) => x.subject === `Uniform size ${RUN}`)
  check("Worker sees ops' reply and status", mt?.status === 'Resolved' && mt?.response === 'Sent a size L', JSON.stringify(mt || {}).slice(0, 120))

  // ── Referral codes ──
  const code1 = (await api('GET', '/api/worker/referral', { token: W1.tok })).json.code
  const self = await api('POST', '/api/worker/referral/apply', { token: W1.tok, body: { code: code1 } })
  check("Can't use your own code", !self.ok, `HTTP ${self.status}`)
  const ok = await api('POST', '/api/worker/referral/apply', { token: W2.tok, body: { code: code1 } })
  check("New worker can apply a colleague's code", ok.ok, `HTTP ${ok.status} ${JSON.stringify(ok.json).slice(0, 80)}`)
  const again = await api('POST', '/api/worker/referral/apply', { token: W2.tok, body: { code: code1 } })
  check('Only once', again.status === 409, `HTTP ${again.status}`)

  // ── Safety check-in endpoints ──
  const sf = await api('GET', '/api/worker/safety', { token: W1.tok })
  check('Safety state is readable (no prompt when not on a job)', sf.ok && sf.json.prompt === false)

  // ── Customer SOS ──
  const cphone = `7${RUN}3131`
  const co = await must('c otp', api('POST', '/api/auth/request-otp', { body: { phone: cphone } }))
  const C = (await must('c verify', api('POST', '/api/auth/verify-otp', { body: { phone: cphone, otp: co.devOtp || '4321' } }))).token
  const addr = (await must('addr', api('POST', '/api/addresses', { token: C, body: { label: 'Home', house: '1', street: 'x', city: 'Hyderabad', pincode: `3${RUN}`, lat: 17.36, lng: 78.47, makeDefault: true } }))).id
  const bk = await must('book', api('POST', '/api/bookings', { token: C, body: { items: [{ id: 'mopping', durationId: '60m' }], type: 'instant', addressId: addr, pincode: `3${RUN}`, lat: 17.36, lng: 78.47, payment: 'cash' } }))
  const sos = await api('POST', `/api/bookings/${bk.id}/sos`, { token: C, body: {} })
  check('Customer SOS is accepted', sos.ok, sos.json?.message)
  await sleep(800)
  const sosT = (await api('GET', '/api/admin/tickets', { token: SUP })).json.find((x) => x.booking_id === bk.id && x.category === 'Safety')
  check('SOS opens an urgent safety ticket', !!sosT && sosT.priority === 'urgent')
  if (sosT) await api('POST', `/api/admin/sos/${sosT.id}/resolve`, { token: SUP, body: { note: 'e2e cleanup' } })
  await api('POST', `/api/bookings/${bk.id}/cancel`, { token: C, body: { reason: 'test' } })
  const tl2 = (await api('GET', `/api/admin/bookings/${bk.id}/timeline`, { token: SUP })).json
  check('Admin booking timeline is available', Array.isArray(tl2) && tl2.some((e) => /placed/i.test(e.title)) && tl2.some((e) => /cancel/i.test(e.title)), JSON.stringify(tl2).slice(0, 120))

  for (const z of [ZA, ZB]) await api('DELETE', `/api/admin/zones/${z.id}`, { token: SUP })
  console.log(`\n${total - fails} passed, ${fails} failed`)
  process.exit(fails ? 1 : 0)
}
main().catch((e) => { console.error('ABORTED:', e.message); process.exit(1) })
