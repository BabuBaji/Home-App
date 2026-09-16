/* Screen-by-screen sweep of the HomeHelp customer + admin web apps.
 *
 * For every route: navigate, then record uncaught exceptions, console errors, failed network
 * requests (>=400) and whether anything actually rendered. Auth is injected straight into
 * localStorage (the same keys api.ts uses) rather than driven through the login UI, so a login
 * regression can't mask every other screen.
 *
 * Deliberately does NOT reuse apps/admin/shot.mjs -- that file carries the obfuscated payload.
 */
import puppeteer from 'puppeteer-core'
import { writeFileSync } from 'fs'

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const GW = 'http://localhost:8080'

const api = async (path, body, token) => {
  const r = await fetch(GW + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return r.json().catch(() => ({}))
}

// Routes carry :params; substitute ids that exist in the seeded/test data.
const fill = (p) => p
  .replace(/:id\b/g, '2').replace(/:status\b/g, 'active').replace(/:code\b/g, 'SAVE10')
  .replace(/:tab\b/g, 'all').replace(/:type\b/g, 'all').replace(/:key\b/g, 'aadhaar')

async function sweep(page, label, base, routes, ready) {
  const results = []
  for (const route of routes) {
    const url = base + fill(route)
    const errs = [], net = []
    const onErr = (e) => errs.push('pageerror: ' + String(e.message || e).slice(0, 160))
    const onCon = (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)) }
    const onRes = (r) => { if (r.status() >= 400) net.push(`${r.status()} ${r.url().replace(base, '').replace(GW, '').slice(0, 90)}`) }
    page.on('pageerror', onErr); page.on('console', onCon); page.on('response', onRes)
    let text = '', ok = true, note = ''
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 })
      await new Promise((r) => setTimeout(r, 350))
      text = await page.evaluate(() => (document.body.innerText || '').trim())
    } catch (e) { ok = false; note = 'nav: ' + String(e.message).slice(0, 90) }
    page.off('pageerror', onErr); page.off('console', onCon); page.off('response', onRes)

    // A route that renders almost nothing is a blank screen even without a thrown error.
    const blank = text.replace(/\s+/g, ' ').length < 25
    if (blank) { ok = false; note = note || 'blank/near-empty render' }
    if (errs.length) ok = false
    results.push({ app: label, route, ok, blank, errs, net, chars: text.length, note })
    process.stdout.write(ok ? '.' : 'X')
  }
  return results
}

const routesOf = (file, src) => [...src.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1])
  .filter((p) => p !== '*' && !p.includes('login'))

const { readFileSync } = await import('fs')
const custRoutes = [...new Set(routesOf('c', readFileSync('D:/Smartgrow Projects/Home-App/apps/customer/src/App.tsx', 'utf8')))]
const admRoutes = [...new Set(routesOf('a', readFileSync('D:/Smartgrow Projects/Home-App/apps/admin/src/App.tsx', 'utf8')))]

// --- tokens -----------------------------------------------------------------
await api('/api/auth/request-otp', { phone: '9111100001' })
const cust = await api('/api/auth/verify-otp', { phone: '9111100001', otp: '4321' })
const adm = await api('/api/admin/login', { email: 'admin@homehelp.in', password: 'change-me' })
if (!cust.token || !adm.token) { console.error('could not obtain tokens', !!cust.token, !!adm.token); process.exit(1) }

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=430,932'],
})
const page = await browser.newPage()
await page.setViewport({ width: 430, height: 932 })

// customer
await page.goto('http://localhost:5176/', { waitUntil: 'domcontentloaded' })
await page.evaluate((t, u) => { localStorage.setItem('hh_token', t); localStorage.setItem('hh_user', JSON.stringify(u)) }, cust.token, cust.user || {})
console.log(`\nCUSTOMER — ${custRoutes.length} routes`)
const rc = await sweep(page, 'customer', 'http://localhost:5176', custRoutes)

// admin
await page.setViewport({ width: 1440, height: 900 })
await page.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' })
await page.evaluate((t, a) => { localStorage.setItem('hha_token', t); localStorage.setItem('hha_admin', JSON.stringify(a)) }, adm.token, adm.admin || {})
console.log(`\n\nADMIN — ${admRoutes.length} routes`)
const ra = await sweep(page, 'admin', 'http://localhost:5175', admRoutes)

await browser.close()

const all = [...rc, ...ra]
writeFileSync('screens-report.json', JSON.stringify(all, null, 1))
const bad = all.filter((r) => !r.ok)
console.log(`\n\n${'='.repeat(70)}`)
console.log(`TOTAL ${all.length} screens — ${all.length - bad.length} ok, ${bad.length} with problems`)
console.log('='.repeat(70))
for (const b of bad) {
  console.log(`\n[${b.app}] ${b.route}${b.note ? '  (' + b.note + ')' : ''}`)
  for (const e of [...new Set(b.errs)].slice(0, 3)) console.log('   ' + e)
  for (const n of [...new Set(b.net)].slice(0, 3)) console.log('   net ' + n)
}
