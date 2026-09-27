// Settings ▸ General switches, end to end through the gateway: promo codes, reviews & ratings,
// new-customer sign-ups and maintenance mode. Restores the original values when done.
// Run: node infra/e2e/feature-switches.mjs   (stack up on :8080, admin@homehelp.in)
import { setupCustomer } from './ui-audit-customer-setup.mjs'
const B = process.env.API || 'http://localhost:8080'
const api = async (m, p, { token, body } = {}) => { const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json() } catch {} return { s: r.status, j } }
let pass = 0, fail = 0
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + info}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SUP = (await api('POST', '/api/admin/login', { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } })).j.token
const orig = (await api('GET', '/api/admin/settings', { token: SUP })).j
const KEYS = ['maintenance_mode', 'allow_registration', 'enable_promo', 'enable_reviews']
const set = async (o) => { await api('PATCH', '/api/admin/settings', { token: SUP, body: o }); await sleep(1500) }
const login = async (phone) => { const o = await api('POST', '/api/auth/request-otp', { body: { phone } }); return api('POST', '/api/auth/verify-otp', { body: { phone, otp: o.j?.devOtp || '4321' } }) }
try {
  // a fresh customer with one finished booking (zone + expert created by the shared setup)
  const setup = await setupCustomer(async (m, p, o = {}) => (await api(m, p, o)).j, SUP)
  const C = setup.token, phone = setup.user.phone
  const done = { id: setup.done, rating: null }

  // ---- promo codes
  await set({ enable_promo: 'true' })
  const codes = (await api('GET', '/api/coupons')).j
  const code = codes[0]?.code
  check('promo on: coupon list has codes', codes.length > 0, JSON.stringify(codes).slice(0, 80))
  await set({ enable_promo: 'false' })
  check('promo off: coupon list is empty', (await api('GET', '/api/coupons')).j.length === 0)
  const v = await api('POST', '/api/coupons/validate', { body: { code, subtotal: 5000 } })
  check('promo off: validating a code is refused', v.s === 400 && /not available/.test(v.j.error), JSON.stringify(v))
  const q = await api('POST', '/api/quote', { body: { items: [{ id: 'mopping', durationId: '60m' }], coupon: code, pincode: '500034' } })
  check('promo off: a typed code gives no coupon discount', q.s !== 200 || !q.j.coupon, JSON.stringify(q.j).slice(0, 120))
  check('app-config reports promoCodes=false', (await api('GET', '/api/app-config')).j.promoCodes === false)
  await set({ enable_promo: 'true' })

  // ---- reviews
  await set({ enable_reviews: 'false' })
  const rv = await api('POST', `/api/bookings/${done.id}/review`, { token: C, body: { rating: 5 } })
  check('reviews off: rating is refused', rv.s === 403 && rv.j.reviewsOff, JSON.stringify(rv))
  check('app-config reports reviews=false', (await api('GET', '/api/app-config')).j.reviews === false)
  await set({ enable_reviews: 'true' })
  const rv2 = await api('POST', `/api/bookings/${done.id}/review`, { token: C, body: { rating: done.rating || 5 } })
  check('reviews on: rating accepted', rv2.s === 200, JSON.stringify(rv2).slice(0, 120))

  // ---- sign-ups
  await set({ allow_registration: 'false' })
  const fresh = '7' + Date.now().toString().slice(-9)
  const nw = await login(fresh)
  check('sign-ups off: a new number cannot create an account', nw.s === 403 && nw.j.signupsClosed, JSON.stringify(nw))
  const ex = await login(phone)
  check('sign-ups off: an existing customer still signs in', ex.s === 200 && !!ex.j.token, JSON.stringify(ex).slice(0, 120))
  await set({ allow_registration: 'true' })
  const nw2 = await login(fresh)
  check('sign-ups on: the new number can sign up', nw2.s === 200 && !!nw2.j.token, JSON.stringify(nw2).slice(0, 120))

  // ---- maintenance
  await set({ maintenance_mode: 'true' }); await sleep(11000) // gateway polls every 10s
  const m1 = await api('GET', '/api/services')
  check('maintenance on: customer API answers 503 maintenance', m1.s === 503 && m1.j.maintenance, JSON.stringify(m1).slice(0, 120))
  const m2 = await api('POST', '/api/bookings', { token: C, body: {} })
  check('maintenance on: new bookings are held', m2.s === 503, String(m2.s))
  check('maintenance on: app-config still reachable', (await api('GET', '/api/app-config')).j.maintenance === true)
  check('maintenance on: admin API works', (await api('GET', '/api/admin/settings', { token: SUP })).s === 200)
  const w = await api('POST', '/api/worker/auth/request-otp', { body: { phone: '9000000001' } })
  check('maintenance on: expert app API not held', w.s !== 503, String(w.s))
  const wh = await api('POST', '/api/payments/webhook', { body: {} })
  check('maintenance on: payment webhook still reaches the payment service', !(wh.s === 503 && wh.j?.maintenance), JSON.stringify(wh).slice(0, 100))
  await set({ maintenance_mode: 'false' }); await sleep(11000)
  check('maintenance off: customer API back', (await api('GET', '/api/services')).s === 200)
} finally {
  const restore = Object.fromEntries(KEYS.map((k) => [k, orig[k] ?? '']).filter(([, v]) => v !== ''))
  await api('PATCH', '/api/admin/settings', { token: SUP, body: { maintenance_mode: 'false', allow_registration: 'true', enable_promo: 'true', enable_reviews: 'true', ...restore } })
  console.log(`\n${pass} passed, ${fail} failed`)
}
