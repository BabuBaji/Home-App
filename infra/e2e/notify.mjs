// Push/inbox/broadcast checks against a running stack (no Firebase needed: delivery to the
// in-app inbox is what's verified; FCM itself is only called when fcm_service_account is set).
const BASE = process.env.BASE || 'http://localhost:8080'
const RUN = Date.now().toString().slice(-5)
let fails = 0
const check = (n, p, d = '') => { if (!p) fails++; console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + String(d).slice(0, 150) : ''}`) }
async function api(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let json; try { json = JSON.parse(t) } catch { json = t }
  return { status: r.status, ok: r.ok, json }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const phone = `6${RUN}4242`
const o = (await api('POST', '/api/auth/request-otp', { body: { phone } })).json
const C = (await api('POST', '/api/auth/verify-otp', { body: { phone, otp: o.devOtp || '4321' } })).json.token
const r1 = await api('POST', '/api/push/register', { token: C, body: { token: 'fcm-test-token-' + RUN + '-xxxxxxxxxxxx', platform: 'android' } })
check('Customer can register a push token', r1.ok, `HTTP ${r1.status}`)
const r2 = await api('POST', '/api/push/register', { body: { token: 'fcm-anon-xxxxxxxxxxxxxxxxxxxx' } })
check('Anonymous token registration refused', r2.status === 401, `HTTP ${r2.status}`)
const SUP = (await api('POST', '/api/admin/login', { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } })).json.token
const title = `E2E announcement ${RUN}`
const b = await api('POST', '/api/admin/notifications/broadcast', { token: SUP, body: { title, body: 'Hello from the test', audience: 'customers', channel: 'push', type: 'announcement' } })
check('Broadcast accepted', b.ok, `HTTP ${b.status} sent=${b.json?.sent}`)
let seen = false
for (let i = 0; i < 20 && !seen; i++) { await sleep(1000); seen = JSON.stringify((await api('GET', '/api/notifications', { token: C })).json).includes(title) }
check('Broadcast reaches the customer inbox', seen)
const feed = JSON.stringify((await api('GET', '/api/notifications', { token: C })).json)
check('No hard-coded promo items in the feed', !feed.includes('CLEAN20') && !feed.includes('HOMEHELP150'))
console.log(`\n${fails ? fails + ' failed' : 'all passed'}`)
process.exit(fails ? 1 : 0)
