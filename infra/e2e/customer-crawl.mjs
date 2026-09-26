// Opens every customer-app screen in a phone-sized browser with real data (a finished job and a
// job in progress) and reports: crashes, console errors, failed API calls, error/blank screens,
// and navigation dead-ends (a screen with neither a Back button nor the bottom tab bar).
//
//   node infra/e2e/customer-crawl.mjs     # APP=http://127.0.0.1:5173 BASE=http://localhost:8080 SHOTS=dir
import { createRequire } from 'node:module'
import fs from 'node:fs'
const puppeteer = createRequire(new URL('../../apps/customer/package.json', import.meta.url))('puppeteer-core')
const APP = process.env.APP || 'http://127.0.0.1:5173'
const BASE = process.env.BASE || 'http://localhost:8080'
const OUT = process.env.SHOTS || '/tmp/customer-crawl'
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
fs.mkdirSync(OUT, { recursive: true })
const RUN = Date.now().toString().slice(-5)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function api(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let json; try { json = JSON.parse(t) } catch { json = t }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 160)}`)
  return json
}
async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(1000) } return null }

async function setup() {
  const SUP = (await api('POST', '/api/admin/login', { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } })).token
  const pin = `5${RUN}`, lat = 17.40, lng = 78.45
  const zone = await api('POST', '/api/admin/zones', { token: SUP, body: { name: `E2E UX ${RUN}`, city: 'Hyderabad', state: 'Telangana', pincodes: pin, status: 'live',
    config: { services: ['mopping', 'kitchen', 'bathroom', 'dusting'], workingHours: { is247: true }, coverage: { lat, lng, radiusKm: 5 } } } })
  const wphone = `9${RUN}5555`
  const w = await api('POST', '/api/admin/workers', { token: SUP, body: { name: `Priya ${RUN}`, phone: wphone, city: 'Hyderabad', zone_id: zone.id, status: 'active', services: ['Sweeping & Mopping', 'Kitchen Cleaning', 'Dusting Furniture', 'Bathroom Cleaning'] } })
  const wid = w.id || w.worker?.id
  await api('POST', '/api/admin/shifts', { token: SUP, body: { worker_id: wid, zone_id: zone.id, weekdays: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' } })
  const wo = await api('POST', '/api/worker/auth/request-otp', { body: { phone: wphone } })
  const W = (await api('POST', '/api/worker/auth/verify', { body: { phone: wphone, otp: wo.devOtp || '1234' } })).token
  const cphone = `8${RUN}4444`
  const co = await api('POST', '/api/auth/request-otp', { body: { phone: cphone } })
  const cv = await api('POST', '/api/auth/verify-otp', { body: { phone: cphone, otp: co.devOtp || '4321' } })
  const C = cv.token
  await api('PATCH', '/api/me', { token: C, body: { name: 'Asha Rao', city: 'Hyderabad', location: 'Banjara Hills, Hyderabad' } })
  const addr = (await api('POST', '/api/addresses', { token: C, body: { label: 'Home', house: 'Flat 402', street: 'Lotus Residency, Banjara Hills', city: 'Hyderabad', pincode: pin, lat, lng, makeDefault: true } })).id
  const book = () => api('POST', '/api/bookings', { token: C, body: { items: [{ id: 'mopping', durationId: '60m' }], type: 'instant', addressId: addr, pincode: pin, lat, lng, payment: 'cash' } })
  const runTo = async (id, finish) => {
    await api('POST', '/api/worker/status', { token: W, body: { state: 'Available' } })
    await waitFor(async () => (await api('GET', '/api/worker/jobs/offer', { token: W }))?.state === 'PENDING', 20000)
    await api('POST', '/api/worker/jobs/accept', { token: W })
    await api('POST', '/api/worker/jobs/on-the-way', { token: W })
    await api('POST', '/api/worker/jobs/arrived', { token: W })
    const otp = (await api('GET', `/api/bookings/${id}`, { token: C })).service_otp
    await api('POST', '/api/worker/jobs/verify-otp', { token: W, body: { otp } })
    if (finish) { await api('POST', '/api/worker/jobs/end', { token: W, body: {} }); await sleep(1500) }
  }
  const done = await book(); await runTo(done.id, true)
  const live = await book(); await runTo(live.id, false)
  const me = (await api('GET', '/api/me', { token: C })).user
  return { SUP, C, user: me, done: done.id, live: live.id, zone: zone.id, pin, lat, lng, W }
}

const ROUTES = ['/home', '/popular-services', '/continue-booking', '/service/mopping', '/configure/mopping', '/booking/mopping', '/book/mopping', '/confirmed/:done',
  '/notifications', '/cart', '/address', '/schedule', '/summary', '/payment', '/tracking/:live', '/track/:live', '/reschedule/:live', '/cancel/:live',
  '/job/:live', '/job/:live/worker', '/job/:live/otw', '/job/:live/map', '/job/:live/chat', '/job/:live/call', '/job/:live/otp', '/job/:live/started',
  '/job/:live/extend', '/job/:live/progress', '/job/:done/completed', '/rate/:done', '/rate/:done/photos', '/complaint/:done', '/tip/:done', '/rebook/:done',
  '/offers', '/offers/applied', '/offers/zone', '/offers/scratch', '/offers/loyalty', '/refer', '/bookings', '/bookings/active', '/bookings/completed',
  '/booking-details/:done', '/invoice/:done', '/receipt/:done', '/history', '/wallet', '/wallet/transactions', '/wallet/add', '/wallet/cashback',
  '/wallet/referrals', '/wallet/gift-cards', '/wallet/refunds', '/wallet/settings', '/profile', '/profile/repeat', '/profile/family',
  '/profile/payment-methods', '/profile/notifications', '/profile/language', '/profile/privacy', '/profile/about', '/profile/help', '/profile/logout',
  '/quick-actions', '/membership', '/membership/compare', '/membership/subscribe', '/membership/active', '/membership/manage', '/membership/usage',
  '/membership/renewal', '/membership/cancel', '/membership/benefits', '/ai-home', '/ai/recommendations', '/ai/planner', '/ai/calendar', '/ai/water',
  '/ai/garbage', '/ai/pest', '/ai/festival', '/ai/budget', '/ai/timeline', '/support', '/support/ticket', '/support/chat', '/support/emergency',
  '/support/refund-status', '/support/cancellation', '/support/escalation', '/support/faqs', '/addresses', '/addresses/add', '/addresses/saved',
  '/addresses/default', '/cancellation-policy', '/personal', '/terms', '/locations', '/address-details', '/coming-soon']

async function main() {
  const d = await setup()
  console.log(`setup: customer ${d.user.id}, finished booking ${d.done}, live booking ${d.live}`)
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--ignore-certificate-errors'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  let cur = ''
  const issues = {}
  const add = (k, m) => { (issues[cur] ||= []).push(`${k}: ${String(m).slice(0, 200)}`) }
  page.on('pageerror', (e) => add('CRASH', e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|ERR_CERT|ERR_TUNNEL|status of 4\d\d|tile|Download the React/.test(m.text())) add('console', m.text()) })
  page.on('response', (r) => { const u = r.url(); if (u.includes('/api/') && r.status() >= 400 && !u.includes('/socket.io')) add(`API ${r.status()}`, `${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`) })
  await page.goto(APP + '/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate((t, u) => { localStorage.setItem('hh_token', t); localStorage.setItem('hh_user', JSON.stringify(u)); localStorage.setItem('hh_splash_seen', '1') }, d.C, d.user)
  const rows = []
  for (const tmpl of ROUTES) {
    const path = tmpl.replace(':done', d.done).replace(':live', d.live)
    cur = path
    await page.goto(APP + path, { waitUntil: 'networkidle0', timeout: 25000 }).catch((e) => add('NAV', e.message))
    await sleep(2800) // the app shows its splash poster for ~2 s on a fresh load
    const info = await page.evaluate(() => {
      const txt = document.body.innerText || ''
      const btns = [...document.querySelectorAll('button,a')]
      const back = btns.some((b) => /back/i.test(b.getAttribute('aria-label') || '') || /^(back|‹|←)$/i.test((b.textContent || '').trim()))
      const nav = !!document.querySelector('nav, .bnav, .bottom-nav, .tabbar, .has-nav')
      return { len: txt.trim().length, url: location.pathname, back, nav, title: (document.querySelector('h1,h2,b')?.textContent || '').trim().slice(0, 40),
        err: (txt.match(/Something went wrong|Could not load[^\n]{0,50}|Failed to[^\n]{0,50}|Cannot read[^\n]{0,40}|not found|Not Found/i) || [null])[0] }
    })
    if (info.err) add('SCREEN', info.err)
    if (info.len < 30) add('BLANK', `${info.len} chars`)
    if (info.url !== path) add('REDIRECT', `→ ${info.url}`)
    if (!info.back && !info.nav && info.url === path) add('DEAD-END', 'no Back button and no bottom tab bar')
    await page.screenshot({ path: `${OUT}/${path.replace(/[/:]/g, '_').replace(/^_/, '') || 'root'}.png` }).catch(() => {})
    rows.push({ path, title: info.title, issues: [...new Set(issues[path] || [])] })
  }
  await browser.close()
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ setup: { done: d.done, live: d.live }, rows }, null, 2))
  const bad = rows.filter((r) => r.issues.length)
  console.log(`${rows.length - bad.length}/${rows.length} screens clean`)
  for (const r of bad) { console.log(`  ${r.path}  [${r.title}]`); r.issues.slice(0, 5).forEach((i) => console.log(`     ${i}`)) }
  // leave nothing running: finish the live job
  try { await api('POST', '/api/worker/jobs/end', { token: d.W, body: {} }); await api('POST', '/api/worker/status', { token: d.W, body: { state: 'Offline' } }) } catch {}
}
main().catch((e) => { console.error('ABORTED', e.message); process.exit(1) })
