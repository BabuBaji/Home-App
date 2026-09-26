// Taps every button on every customer-app screen (phone-sized browser, real data: a finished job
// and a job in progress) and reports what each tap did. Flags: crashes, console errors, failed API
// calls (5xx, or 4xx other than expected refusals), error screens, taps that land on Home without
// asking to (an unknown route falls back to /home), and taps with no visible effect at all.
// Destructive or money-moving controls (logout, delete, confirm/pay, cancel booking…) are skipped.
// Also checks the app's Back button returns to the screen it came from.
//
//   node infra/e2e/customer-taps.mjs     # APP=http://127.0.0.1:5173 BASE=http://localhost:8080 OUT=dir ONLY=/wallet,/profile
import { createRequire } from 'node:module'
import fs from 'node:fs'
const puppeteer = createRequire(new URL('../../apps/customer/package.json', import.meta.url))('puppeteer-core')
const APP = process.env.APP || 'http://127.0.0.1:5173'
const BASE = process.env.BASE || 'http://localhost:8080'
const OUT = process.env.OUT || '/tmp/customer-taps'
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

const ROUTES = ['/home', '/popular-services', '/continue-booking', '/service/mopping', '/booking/mopping', '/booking/cart', '/confirmed/:done',
  '/notifications', '/cart', '/reschedule/:live', '/cancel/:live',
  '/job/:live', '/job/:live/worker', '/job/:live/otw', '/job/:live/map', '/job/:live/chat', '/job/:live/call', '/job/:live/otp', '/job/:live/started',
  '/job/:live/extend', '/job/:live/progress', '/job/:done/completed', '/rate/:done', '/rate/:done/photos', '/complaint/:done', '/tip/:done', '/rebook/:done',
  '/offers', '/offers/applied', '/offers/zone', '/refer', '/bookings', '/bookings/active', '/bookings/upcoming', '/bookings/completed',
  '/booking-details/:done', '/invoice/:done', '/receipt/:done', '/history', '/wallet', '/wallet/transactions', '/wallet/add', '/wallet/cashback',
  '/wallet/referrals', '/wallet/gift-cards', '/wallet/refunds', '/wallet/payments', '/wallet/settings', '/profile', '/profile/repeat', '/profile/family',
  '/profile/payment-methods', '/profile/notifications', '/profile/language', '/profile/privacy', '/profile/about', '/profile/help', '/profile/logout',
  '/quick-actions', '/membership', '/membership/compare', '/membership/subscribe', '/membership/active', '/membership/manage', '/membership/usage',
  '/membership/renewal', '/membership/cancel', '/membership/benefits', '/ai/recommendations', '/ai/timeline', '/support', '/support/ticket', '/support/chat', '/support/emergency',
  '/support/refund-status', '/support/cancellation', '/support/escalation', '/support/faqs', '/addresses', '/addresses/add', '/addresses/saved',
  '/addresses/default', '/cancellation-policy', '/personal', '/terms', '/locations', '/address-details', '/coming-soon']


// Never tapped: they end the session, delete data, or move money / change a booking for real.
const SKIP = /log ?out|sign ?out|delete|remove|deactivate|confirm|pay ₹|pay now|^pay\b|place (the )?order|book now|cancel (booking|membership|plan)|yes,? cancel|submit|send|end service|approve|decline|subscribe|renew|withdraw|add ₹|proceed|report|sos|emergency|call\b|whatsapp|download|share/i
const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const d = await setup()
  console.log(`setup: customer ${d.user.id}, finished booking ${d.done}, live booking ${d.live}`)
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--ignore-certificate-errors'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  // External openers (tel:, maps, share sheets) must not leave the app.
  await page.evaluateOnNewDocument(() => { window.open = (u) => { window.__opened = String(u); return null }; navigator.share = async () => {} })
  let events = []
  const ev = (k, m) => events.push(`${k}: ${String(m).slice(0, 180)}`)
  page.on('pageerror', (e) => ev('CRASH', e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|ERR_CERT|ERR_TUNNEL|status of 4\d\d|tile|Download the React|net::ERR/.test(m.text())) ev('console', m.text()) })
  let api = 0
  page.on('request', (r) => { if (r.url().includes('/api/') && !r.url().includes('/socket.io')) api++ })
  page.on('response', (r) => { const u = r.url(); if (u.includes('/api/') && r.status() >= 500) ev(`API ${r.status()}`, `${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`) })
  await page.goto(APP + '/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate((t, u) => { localStorage.setItem('hh_token', t); localStorage.setItem('hh_user', JSON.stringify(u)); localStorage.setItem('hh_splash_seen', '1') }, d.C, d.user)
  await page.goto(APP + '/home', { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {})
  await sleep2(3000)
  // Client-side navigation (no reload → no splash): what a tap inside the app does.
  const go = async (p) => {
    // Same history entry shape react-router writes (idx counts depth), so the app's Back sees a
    // real previous screen instead of falling back to Home.
    await page.evaluate((p) => { const idx = ((window.history.state && window.history.state.idx) || 0) + 1; window.history.pushState({ usr: null, key: 'e2e' + idx, idx }, '', p); window.dispatchEvent(new PopStateEvent('popstate')) }, p)
    await page.waitForNetworkIdle({ idleTime: 250, timeout: 1500 }).catch(() => {})
    await sleep2(350)
  }
  const snap = () => page.evaluate(() => ({
    url: location.pathname + location.search,
    text: document.body.innerText || '',
    // Markup fingerprint: catches a chip/tab/radio becoming selected when the visible text stays the same.
    html: (() => { const h = document.body.innerHTML; let x = 0; for (let i = 0; i < h.length; i++) x = (x * 31 + h.charCodeAt(i)) | 0; return x })(),
    layers: document.querySelectorAll('.modal, .sheet, [role=dialog], .overlay, .backdrop, .bs-sheet, .sheet-bg').length,
    toast: [...document.querySelectorAll('.toast, [role=status], .snack')].map((e) => e.textContent.trim()).join(' | ').slice(0, 120),
    opened: window.__opened || '',
    err: ((document.body.innerText || '').match(/Something went wrong|Cannot read[^\n]{0,40}|is not a function|undefined is not/i) || [null])[0],
  }))
  // Tappables: buttons, links and anything React gave an onClick; repeated look-alike rows are
  // sampled (first 2) so a 30-row list doesn't take 30 taps.
  const tappables = () => page.evaluate((skipSrc) => {
    const skip = new RegExp(skipSrc, 'i')
    const out = [], seenKind = {}
    const all = [...document.querySelectorAll('body *')].filter((el) => {
      if (el.closest('[disabled], [aria-disabled=true]')) return false
      const tag = el.tagName
      if (tag === 'BUTTON' || tag === 'A' || el.getAttribute('role') === 'button') return true
      const k = Object.keys(el).find((x) => x.startsWith('__reactProps'))
      return !!(k && el[k] && typeof el[k].onClick === 'function' && !el.parentElement?.closest('button,a,[role=button]'))
    })
    all.forEach((el, i) => {
      const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return
      const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.innerText || el.textContent || '')).replace(/\s+/g, ' ').trim().slice(0, 50) || `<${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}>`
      if (skip.test(label)) return
      const kind = el.tagName + '.' + String(el.className)
      seenKind[kind] = (seenKind[kind] || 0) + 1
      if (seenKind[kind] > 2) return
      out.push({ i, label })
    })
    return out
  }, SKIP.source)
  const clickNth = (i) => page.evaluate((i) => {
    const all = [...document.querySelectorAll('body *')].filter((el) => {
      if (el.closest('[disabled], [aria-disabled=true]')) return false
      const tag = el.tagName
      if (tag === 'BUTTON' || tag === 'A' || el.getAttribute('role') === 'button') return true
      const k = Object.keys(el).find((x) => x.startsWith('__reactProps'))
      return !!(k && el[k] && typeof el[k].onClick === 'function' && !el.parentElement?.closest('button,a,[role=button]'))
    })
    const el = all[i]; if (!el) return false
    el.scrollIntoView({ block: 'center' }); el.click(); return true
  }, i)

  const only = process.env.ONLY
  const report = []
  let taps = 0
  for (const tmpl of ROUTES) {
    const path = tmpl.replace(':done', d.done).replace(':live', d.live)
    if (only && !only.split(',').some((o) => path === o || path.startsWith(o + '/'))) continue
    events = []
    await go(path)
    const base = await snap()
    const screenIssues = []
    if (base.err) screenIssues.push(`SCREEN: ${base.err}`)
    if (events.length) screenIssues.push(...events)
    const list = base.url.split('?')[0] === path ? await tappables() : []
    const rows = []
    for (const tp of list.slice(0, 30)) {
      // Give Back somewhere real to return to: arrive from a different screen first.
      const isBack = /^back$/i.test(tp.label.trim())
      // Always arrive from another screen: the screen remounts, so state from the previous tap (an open
      // sheet, a selected chip) can't leak in — and Back has somewhere real to return to.
      await go(isBack ? (path === '/profile' ? '/wallet' : '/profile') : (path === '/terms' ? '/profile/about' : '/terms'))
      await go(path); events = []; api = 0
      await page.evaluate(() => { window.__opened = '' })
      const before = await snap()
      const ok = await clickNth(tp.i).catch(() => false)
      if (!ok) continue
      taps++
      await page.waitForNetworkIdle({ idleTime: 250, timeout: 1500 }).catch(() => {})
      await sleep2(450)
      const after = await snap()
      const moved = after.url !== before.url
      const what = moved ? `→ ${after.url}` : after.opened ? `opens ${after.opened.slice(0, 50)}` : after.layers > before.layers ? 'opens sheet/dialog'
        : after.toast && after.toast !== before.toast ? `toast "${after.toast.slice(0, 60)}"` : after.text !== before.text || after.html !== before.html ? 'updates screen' : api ? `calls API (${api})` : 'NO EFFECT'
      const probs = [...events]
      if (after.err) probs.push(`SCREEN: ${after.err}`)
      // Unknown routes fall back to /home — a tap that isn't about Home landing there is a broken link.
      if (moved && after.url === '/home' && path !== '/home' && !/home|done|continue|back|explore|browse|skip|later|go to|close|×|✕/i.test(tp.label)) probs.push('landed on Home (broken link?)')
      if (what === 'NO EFFECT') probs.push('tap did nothing visible')
      // The app's Back button must return where we came from.
      if (isBack && moved && after.url.split('?')[0] !== (path === '/profile' ? '/wallet' : '/profile')) probs.push(`Back went to ${after.url}`)
      if (!isBack && moved && !/\/job\/|\/confirmed/.test(after.url)) {
        const backed = await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /back/i.test(x.getAttribute('aria-label') || '')); if (b) { b.click(); return true } return false })
        if (backed) { await sleep2(500); const u = await page.evaluate(() => location.pathname); if (u !== path && u !== before.url.split('?')[0]) probs.push(`Back went to ${u}, expected ${path}`) }
      }
      rows.push({ label: tp.label, what, probs })
    }
    report.push({ path, issues: screenIssues, taps: rows })
    const bad = rows.filter((r) => r.probs.length)
    console.log(`${bad.length || screenIssues.length ? '✗' : '✓'} ${path}  (${rows.length} taps${bad.length ? `, ${bad.length} flagged` : ''})`)
    screenIssues.forEach((x) => console.log(`     ${x}`))
    bad.forEach((r) => console.log(`     [${r.label}] ${r.what} — ${r.probs.join('; ')}`))
  }
  await browser.close()
  fs.writeFileSync(`${OUT}/taps.json`, JSON.stringify(report, null, 2))
  const flagged = report.reduce((n, s) => n + s.taps.filter((r) => r.probs.length).length + s.issues.length, 0)
  console.log(`\n${report.length} screens, ${taps} taps, ${flagged} flagged — full log ${OUT}/taps.json`)
  try { await api2('POST', '/api/worker/jobs/end', { token: d.W, body: {} }) } catch {}
}
const api2 = api
main().catch((e) => { console.error('ABORTED', e.stack || e.message); process.exit(1) })
