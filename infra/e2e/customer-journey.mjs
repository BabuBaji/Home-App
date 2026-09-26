// A new customer's journey through the real customer-app screens (phone-sized browser, mock
// payments): sign up with OTP → pick a city → Home → bottom tabs → book a service and pay by UPI
// → track it → see it in My Bookings → cancel it → refund to UPI shows in Refund History and in
// UPI & Card Payments → add money to the wallet → a second booking's whole life (expert accepts,
// on the way, arrives, customer shares the start OTP, service completes, 5★ rating, tip, receipt
// and invoice; the expert is played through the worker API) → switch language → log out.
// Needs the stack (payment_gateway=mock) and the customer app's dev server running.
//
//   node infra/e2e/customer-journey.mjs    # APP=http://127.0.0.1:5173 BASE=http://localhost:8080 ADMIN_PW=… SHOTS=dir
import { createRequire } from 'node:module'
import fs from 'node:fs'
const puppeteer = createRequire(new URL('../../apps/customer/package.json', import.meta.url))('puppeteer-core')
const APP = process.env.APP || 'http://127.0.0.1:5173', BASE = process.env.BASE || 'http://localhost:8080'
const OUT = process.env.SHOTS || '/tmp/customer-journey'
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const ctx = browser.defaultBrowserContext()
await ctx.overridePermissions(APP, ['geolocation', 'notifications'])
const page = await browser.newPage()
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
await page.setGeolocation({ latitude: 12.9716, longitude: 77.5946 })
const errs = []
page.on('pageerror', (e) => errs.push('CRASH ' + e.message))
page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) errs.push(`API ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`) })
let n = 0
const shot = async (name) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` })
const url = () => page.evaluate(() => location.pathname)
const settle = async (ms = 700) => { await page.waitForNetworkIdle({ idleTime: 300, timeout: 6000 }).catch(() => {}); await sleep(ms) }
// Tap the visible, enabled button/link whose text or aria-label matches.
async function tap(re, { optional = false } = {}) {
  const ok = await page.evaluate((src) => {
    const re = new RegExp(src, 'i')
    const els = [...document.querySelectorAll('button, a, [role=button], label, .tap, [class*=row], [class*=card], [class*=opt], [class*=chip]')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && !e.closest('[disabled]') })
    const txt = (e) => ((e.getAttribute('aria-label') || '') + ' ' + (e.innerText || '')).replace(/\s+/g, ' ').trim()
    // Prefer the smallest matching element (the button itself, not its container).
    const hits = els.map((e, i) => [e, i]).filter(([e]) => re.test(txt(e))).sort((a, b) => txt(a[0]).length - txt(b[0]).length || b[1] - a[1]).map(([e]) => e)  // same label: the later (top-most) one
    if (!hits[0]) return false
    hits[0].scrollIntoView({ block: 'center' }); hits[0].click(); return true
  }, re.source)
  if (!ok && !optional) throw new Error(`no tappable matching ${re} on ${await url()}`)
  await settle()
  return ok
}
async function type(sel, text) { await page.waitForSelector(sel, { timeout: 8000 }); await page.click(sel, { clickCount: 3 }); await page.type(sel, text, { delay: 15 }) }
const results = []
async function step(name, fn) {
  try { const r = await fn(); results.push({ name, ok: true, info: r || '' }); console.log(`PASS  ${name}${r ? '  — ' + r : ''}`) }
  catch (e) { results.push({ name, ok: false }); console.log(`FAIL  ${name}  — ${e.message.slice(0, 200)}`); await shot('FAIL-' + name.replace(/\W+/g, '_')) }
}

const phone = '9' + Date.now().toString().slice(-9)
await step('Open app → login screen', async () => {
  await page.goto(APP + '/', { waitUntil: 'networkidle0' }); await sleep(3500); await shot('open')
  return await url()
})
await step('Login with phone + OTP', async () => {
  await tap(/get started/, { optional: true }); await shot('phone')
  await type('input[type=tel], input[inputmode=numeric], input', phone)
  await tap(/send otp/); await shot('otp')
  const shown = await page.evaluate(() => (document.body.innerText.match(/\+91\s*([\d ]+)/) || [])[1] || '')
  if (shown.replace(/\D/g, '') !== phone) throw new Error('OTP screen shows +91 ' + shown + ', typed ' + phone)
  for (const dgt of '4321') await tap(new RegExp('^' + dgt + '$'))
  await settle(1500)
  await tap(/verify|continue|login/, { optional: true })
  await settle(1500); await shot('after-otp')
  const u = await url(); if (u === '/login') throw new Error('still on login'); return u
})
if (!results.at(-1).ok) { console.log('login failed — stopping'); await browser.close(); process.exit(1) }
await step('Onboarding: name', async () => {
  if (!(await url()).includes('/onboarding/name')) return 'skipped (not shown)'
  await type('input[placeholder="Full name"]', 'Journey Tester'); await tap(/^continue$/); return await url()
})
await step('Onboarding: city', async () => {
  if (!(await url()).includes('/onboarding/city')) return 'skipped (not shown)'
  await tap(/^bengaluru$/); await shot('city'); await tap(/^continue$/); return await url()
})
await step('Onboarding: permissions (Not now)', async () => {
  const u = await url()
  if (u.includes('/onboarding/permission')) { await shot('perm'); await tap(/not now/) }
  else if (u.includes('/onboarding/')) { await shot('onboard-other'); throw new Error('unexpected onboarding screen ' + u) }
  const w = await url(); if (w !== '/home') throw new Error('landed on ' + w); await shot('home'); return w
})
const tok = await page.evaluate(() => localStorage.getItem('hh_token'))
const api = async (m, p, body) => (await fetch(BASE + p, { method: m, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: body ? JSON.stringify(body) : undefined })).json()
await step('Bottom tabs reach Bookings / Wallet / Profile and back to Home', async () => {
  const seen = []
  for (const [re, want] of [[/^bookings$/, '/bookings'], [/^wallet$/, '/wallet'], [/^profile$|^account$/, '/profile'], [/^home$/, '/home']]) {
    const ok = await tap(re, { optional: true }); if (!ok) { seen.push(`no "${re.source}" tab`); continue }
    const u = await url(); seen.push(u); if (!u.startsWith(want)) throw new Error(`${re} → ${u}`)
  }
  return seen.join(', ')
})
await step('Add an address (form)', async () => {
  await page.goto(APP + '/addresses/add', { waitUntil: 'networkidle0' }); await sleep(3000); await shot('addr-form')
  return await url()
})
// Booking address: created through the API — the map picker needs a live map provider.
const sup = (await (await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' }) })).json()).token
const zones = await (await fetch(BASE + '/api/admin/zones', { headers: { authorization: 'Bearer ' + sup } })).json()
const z = zones.find((z) => z.status === 'live' && z.city === 'Bengaluru' && z.pincodeList?.length) || zones.find((z) => z.status === 'live' && z.pincodeList?.length)
await api('POST', '/api/addresses', { label: 'Home', house: '12', street: 'MG Road', city: z.city, pincode: z.pincodeList[0], lat: z.config?.coverage?.lat || 12.9716, lng: z.config?.coverage?.lng || 77.5946, makeDefault: true })

await step('Book a service and pay by UPI', async () => {
  await page.goto(APP + '/home', { waitUntil: 'networkidle0' }); await sleep(3200)
  await page.goto(APP + '/service/mopping', { waitUntil: 'networkidle0' }); await sleep(1500); await shot('service')
  await tap(/^book now$/); await shot('book-1')
  const trail = []
  for (let i = 0; i < 12; i++) {
    const u = await url(); trail.push(u)
    if (u.startsWith('/confirmed')) break
    const sheet = await page.$('.pay-sheet, .ps-sheet, [class*=pay] .sheet, .sheet')
    if ((sheet || /Demo mode|Choose a payment method/.test(await page.evaluate(() => document.body.innerText))) && await tap(/^pay ₹/, { optional: true })) { await settle(2500); await shot('after-pay'); continue }
    if (await tap(/^(now|instant|book now|asap)/, { optional: true })) { }
    // On Review & pay: pay the whole amount by UPI (switch the wallet off) so the gateway path runs.
    if (/Review & pay/.test(await page.evaluate(() => document.body.innerText))) {
      await page.evaluate(() => { const b = document.querySelector('.sf-switch.on[aria-label]'); if (b) b.click() })
      await settle(500)
    }
    if (await tap(/^continue|^proceed|confirm & pay|^pay |place order|book now|^confirm booking/, { optional: true })) { await shot('book-' + (i + 2)); continue }
    await shot('stuck'); throw new Error('stuck on ' + u + ' after ' + trail.join(' → '))
  }
  const u = await url(); if (!u.startsWith('/confirmed')) throw new Error('did not reach confirmation: ' + trail.join(' → '))
  await shot('confirmed'); return trail.join(' → ')
})
const bookingId = Number((await url()).split('/').pop())
await step('Track booking from confirmation', async () => { await tap(/track your booking/); await shot('track'); return await url() })
await step('Booking shows in My Bookings', async () => {
  await page.goto(APP + '/bookings', { waitUntil: 'networkidle0' }); await sleep(3000); await shot('bookings')
  const t = await page.evaluate(() => document.body.innerText); if (!/Sweeping|Mopping/i.test(t)) throw new Error('booking not listed'); return 'listed'
})
await step('Cancel booking with a reason → refund shown', async () => {
  await page.goto(APP + `/cancel/${bookingId}`, { waitUntil: 'networkidle0' }); await sleep(3000); await shot('cancel')
  await tap(/booked by mistake/); await tap(/confirm cancellation/); await settle(2000); await shot('cancelled')
  const b = await api('GET', `/api/bookings/${bookingId}`)
  if (b.status !== 'cancelled') throw new Error('status ' + b.status)
  const txt = await page.evaluate(() => document.body.innerText)
  return `status cancelled, refund ₹${b.refund}, to UPI ₹${b.refund_to_source}; screen shows refund: ${/to your UPI \/ card|Refunded/i.test(txt)}`
})
await step('Refund appears in Refund History and UPI & Card Payments', async () => {
  await page.goto(APP + '/wallet/refunds', { waitUntil: 'networkidle0' }); await sleep(3000); await shot('refunds')
  const a = await page.evaluate(() => document.body.innerText)
  await page.goto(APP + '/wallet/payments', { waitUntil: 'networkidle0' }); await sleep(3000); await shot('payments')
  const b = await page.evaluate(() => document.body.innerText)
  if (!/to UPI \/ card|to wallet/i.test(a)) throw new Error('refund history missing where it went'); if (!/Refunded/i.test(b)) throw new Error('payments list missing refunded tag')
  return 'both show it'
})
await step('Add money to wallet (UPI)', async () => {
  const w0 = (await api('GET', '/api/wallet')).total
  await page.goto(APP + '/wallet/add', { waitUntil: 'networkidle0' }); await sleep(3000); await shot('add-money')
  await type('input', '250'); await tap(/^google pay/, { optional: true })
  await tap(/add ₹|proceed|continue|^add money/); await settle(1500); await shot('add-money-2')
  for (let k = 0; k < 3 && await tap(/^pay ₹/, { optional: true }); k++) { await settle(2500); await shot('add-money-pay') }
  const w1 = (await api('GET', '/api/wallet')).total
  if (!(w1 > w0)) throw new Error(`wallet ₹${w0} → ₹${w1}`); return `wallet ₹${w0} → ₹${w1}`
})
// ---- A booking's whole life. The expert side is played through the worker API; everything the
// customer does or sees happens in the real screens.
const RUN = Date.now().toString().slice(-5)
const adm = async (m, p, body) => { const r = await fetch(BASE + p, { method: m, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + sup }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${JSON.stringify(j).slice(0, 120)}`); return j }
const wapi = async (m, p, body, wt) => { const r = await fetch(BASE + p, { method: m, headers: { 'content-type': 'application/json', ...(wt ? { authorization: 'Bearer ' + wt } : {}) }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${JSON.stringify(j).slice(0, 120)}`); return j }
const lpin = `5${RUN}`, llat = 17.40, llng = 78.45
const lzone = await adm('POST', '/api/admin/zones', { name: `Journey ${RUN}`, city: 'Hyderabad', state: 'Telangana', pincodes: lpin, status: 'live',
  config: { services: ['mopping', 'kitchen', 'bathroom', 'dusting'], workingHours: { is247: true }, coverage: { lat: llat, lng: llng, radiusKm: 5 } } })
const wphone = `9${RUN}6666`
const wk = await adm('POST', '/api/admin/workers', { name: `Lakshmi ${RUN}`, phone: wphone, city: 'Hyderabad', zone_id: lzone.id, status: 'active', services: ['Sweeping & Mopping', 'Kitchen Cleaning', 'Dusting Furniture', 'Bathroom Cleaning'] })
await adm('POST', '/api/admin/shifts', { worker_id: wk.id || wk.worker?.id, zone_id: lzone.id, weekdays: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' })
const wo = await wapi('POST', '/api/worker/auth/request-otp', { phone: wphone })
const W = (await wapi('POST', '/api/worker/auth/verify', { phone: wphone, otp: wo.devOtp || '1234' })).token
await wapi('POST', '/api/worker/status', { state: 'Available' }, W)
await api('POST', '/api/addresses', { label: 'Work', house: 'Flat 7', street: 'Road No. 12, Banjara Hills', city: 'Hyderabad', pincode: lpin, lat: llat, lng: llng, makeDefault: true })
const jobText = () => page.evaluate(() => document.body.innerText)
const waitText = async (re, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (re.test(await jobText())) return true; await sleep(1000) } return false }
let lifeId = null
await step('Life: book + pay by UPI in the new zone', async () => {
  await page.goto(APP + '/service/mopping', { waitUntil: 'networkidle0' }); await sleep(1500)
  await tap(/^book now$/)
  for (let i = 0; i < 12 && !(await url()).startsWith('/confirmed'); i++) {
    if (/Review & pay/.test(await jobText())) await page.evaluate(() => { const b = document.querySelector('.sf-switch.on[aria-label]'); if (b) b.click() })
    if (/Demo mode|Choose a payment method/.test(await jobText()) && await tap(/^pay ₹/, { optional: true })) { await settle(2500); continue }
    await tap(/^(now|instant|asap)/, { optional: true })
    if (!(await tap(/^continue|^proceed|^pay |place order|book now|^confirm booking/, { optional: true }))) throw new Error('stuck on ' + await url())
  }
  if (!(await url()).startsWith('/confirmed')) throw new Error('no confirmation')
  lifeId = Number((await url()).split('/').pop()); await shot('life-confirmed'); return `booking ${lifeId}`
})
await step('Life: expert accepts → customer sees the expert assigned', async () => {
  const end = Date.now() + 30000
  while (Date.now() < end && (await wapi('GET', '/api/worker/jobs/offer', null, W))?.state !== 'PENDING') await sleep(1000)
  await wapi('POST', '/api/worker/jobs/accept', null, W)
  await page.goto(APP + `/job/${lifeId}`, { waitUntil: 'networkidle0' }); await sleep(2500)
  if (!(await waitText(/Lakshmi|getting ready|assigned/i))) throw new Error('tracking screen does not show the expert'); await shot('life-assigned'); return 'shown'
})
await step('Life: on the way → arrived shown live', async () => {
  await wapi('POST', '/api/worker/jobs/on-the-way', null, W)
  if (!(await waitText(/on the way/i))) throw new Error('"on the way" not shown')
  await wapi('POST', '/api/worker/jobs/arrived', null, W)
  // On arrival the app moves the customer to the Share OTP screen by itself.
  if (!(await waitText(/arrived|arrives|Share this OTP/i))) throw new Error('arrival not shown'); await shot('life-arrived'); return `both shown, now on ${await url()}`
})
await step('Life: customer shares the start OTP; expert starts with it', async () => {
  await page.goto(APP + `/job/${lifeId}/otp`, { waitUntil: 'networkidle0' }); await sleep(2000); await shot('life-otp')
  // The code is shown one digit per box.
  const otpText = await jobText()
  const code = otpText.match(/(\d)\s+(\d)\s+(\d)\s+(\d)/)?.slice(1).join('') || otpText.match(/\b(\d{4})\b/)?.[1]
  if (!code) throw new Error('no OTP on the Share OTP screen')
  // Completing before the service has started must be refused (the expert would otherwise get
  // paid for a job the customer never let them start).
  const early = await fetch(BASE + '/api/worker/jobs/end', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + W }, body: '{}' })
  if (early.ok) throw new Error('expert could complete the job before starting it')
  const wrong = await wapi('POST', '/api/worker/jobs/verify-otp', { otp: code === '0000' ? '1111' : '0000' }, W)
  if (wrong.ok) throw new Error('a wrong OTP started the job')
  await wapi('POST', '/api/worker/jobs/verify-otp', { otp: code }, W)
  await page.goto(APP + `/job/${lifeId}`, { waitUntil: 'networkidle0' }); await sleep(2000)
  if (!(await waitText(/in progress|underway|started/i))) throw new Error('screen does not show service started'); await shot('life-started'); return `early completion refused (HTTP ${early.status}), wrong OTP refused, OTP ${code} started it`
})
await step('Life: expert finishes → customer sees Service Completed', async () => {
  await wapi('POST', '/api/worker/jobs/end', {}, W); await sleep(1500)
  await page.goto(APP + `/job/${lifeId}/completed`, { waitUntil: 'networkidle0' }); await sleep(2000)
  if (!/Service Completed/i.test(await jobText())) throw new Error('not shown'); await shot('life-completed'); return (await url())
})
await step('Life: rate 5 stars with feedback', async () => {
  const star5 = () => page.evaluate(() => { const s = [...document.querySelectorAll('body *')].filter((b) => b.children.length === 0 && b.textContent.trim() === '★'); s[4]?.click(); return s.length })
  await star5(); await settle(1000)
  if (!(await url()).startsWith(`/rate/${lifeId}`)) throw new Error('stars did not open rating: ' + await url())
  await star5()
  const ta = await page.$('textarea'); if (ta) await ta.type('Very thorough, on time.')
  await tap(/^continue$/); await shot('life-photos'); await tap(/^continue$/); await settle(1500); await shot('life-rated')
  const b = await api('GET', `/api/bookings/${lifeId}`)
  if (Number(b.rating) !== 5) throw new Error('rating saved as ' + b.rating); return `saved ${b.rating}★, now on ${await url()}`
})
await step('Life: tip the expert ₹20 from the wallet', async () => {
  await page.goto(APP + `/tip/${lifeId}`, { waitUntil: 'networkidle0' }); await sleep(2000)
  await tap(/^₹20$/, { optional: true }); await shot('life-tip')
  await tap(/add tip/); await settle(1000); await shot('life-tip-2')
  for (let k = 0; k < 3 && await tap(/^pay ₹|^confirm|^pay from wallet|^use wallet/, { optional: true }); k++) await settle(1500)
  await shot('life-tip-3')
  const b = await api('GET', `/api/bookings/${lifeId}`)
  if (!(Number(b.tip) > 0)) throw new Error('tip not recorded (tip=' + b.tip + ')'); return `tip ₹${b.tip}`
})
await step('Life: booking details show paid + transaction id; invoice opens', async () => {
  await page.goto(APP + `/booking-details/${lifeId}`, { waitUntil: 'networkidle0' }); await sleep(2500); await shot('life-details')
  const t = await jobText()
  if (!/pay_[a-z]+_\w+/.test(t)) throw new Error('no gateway transaction id on booking details')
  await page.goto(APP + `/invoice/${lifeId}`, { waitUntil: 'networkidle0' }); await sleep(2500); await shot('life-invoice')
  // The invoice is rendered in an iframe.
  const inv = await page.evaluate(() => document.querySelector('iframe')?.contentDocument?.body?.innerText || '')
  if (!/TAX\s*INVOICE/i.test(inv)) throw new Error('invoice did not render')
  if (!/pay_[a-z]+_\w+/.test(inv)) throw new Error('invoice shows no gateway transaction id')
  return 'details + invoice show the payment id'
})
try { await wapi('POST', '/api/worker/status', { state: 'Offline' }, W) } catch {}

await step('Switch language to Hindi and back', async () => {
  await page.goto(APP + '/profile/language', { waitUntil: 'networkidle0' }); await sleep(3000)
  await tap(/हिन्दी|hindi/); await tap(/save|apply|continue|done/, { optional: true }); await settle(1500)
  await page.goto(APP + '/profile', { waitUntil: 'networkidle0' }); await sleep(3000); await shot('hindi')
  const hi = /[ऀ-ॿ]/.test(await page.evaluate(() => document.body.innerText))
  await page.goto(APP + '/profile/language', { waitUntil: 'networkidle0' }); await sleep(2500)
  await tap(/^english/); await tap(/save|apply|continue|done/, { optional: true }); await settle(1500)
  if (!hi) throw new Error('profile not in Hindi'); return 'Hindi shown, switched back'
})
await step('Logout', async () => {
  await page.goto(APP + '/profile/logout', { waitUntil: 'networkidle0' }); await sleep(3000); await shot('logout')
  await tap(/log ?out|yes/); await settle(1500); const u = await url(); await shot('logged-out')
  if (!/login/.test(u)) throw new Error('landed on ' + u); return u
})
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} steps passed; page errors: ${errs.length ? errs.join(' | ') : 'none'} — screenshots in ${OUT}`)
await browser.close()
process.exit(failed || errs.length ? 1 : 0)
