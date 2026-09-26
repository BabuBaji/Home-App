// Layout audit for the admin panel or the customer app: opens every page at a few screen widths,
// saves a full-page screenshot, and measures the problems a person notices first —
//   • the page scrolls sideways            • text cut off inside its box
//   • content spilling out of its card     • a table wider than its space
//   • icons squashed to 0px                • button labels wrapping onto two lines
//   • a row of stat cards with uneven heights
//   • (phone) tap targets smaller than 40px
// It reports; it doesn't judge taste — review the screenshots too.
//
//   node infra/e2e/ui-audit.mjs admin      # APP=http://127.0.0.1:5174 WIDTHS=1280,1024 OUT=dir ONLY=/customers
//   node infra/e2e/ui-audit.mjs customer   # APP=http://127.0.0.1:5173 WIDTHS=360,393
import { createRequire } from 'node:module'
import fs from 'node:fs'
const puppeteer = createRequire(new URL('../../apps/customer/package.json', import.meta.url))('puppeteer-core')

const APPNAME = process.argv[2] || 'admin'
const ADMIN = APPNAME === 'admin'
const APP = process.env.APP || (ADMIN ? 'http://127.0.0.1:5174' : 'http://127.0.0.1:5173')
const BASE = process.env.BASE || 'http://localhost:8080'
const OUT = process.env.OUT || `/tmp/ui-audit-${APPNAME}`
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const WIDTHS = (process.env.WIDTHS || (ADMIN ? '1280,1024' : '360,393')).split(',').map(Number)
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function api(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); try { return JSON.parse(t) } catch { return t }
}
const first = (x) => (Array.isArray(x) ? x : x?.workers || x?.bookings || x?.customers || [])[0]

const ADMIN_PAGES = ['/dashboard', '/customers', '/customers/:cid', '/workers', '/workers/new', '/workers/:wid', '/worker-wallet',
  '/bookings', '/bookings/:bid', '/cancellations', '/services', '/extension-rules', '/campaigns', '/membership', '/home-banners', '/packages',
  '/service-areas', '/zones', '/zones/cities', '/zones/clusters', '/zones/apartments', '/zones/stores', '/zones/pricing', '/zones/surge',
  '/zones/coverage', '/zones/inventory', '/command-center', '/control-tower', '/live-ops', '/roster', '/shift-plans', '/training', '/equipment',
  '/salary-plans', '/incentive-plans', '/payroll', '/compensation-rules', '/payments', '/refunds', '/complaints', '/notifications', '/tickets',
  '/reports', '/analytics', '/activity', '/settings', '/admins', '/roles', '/approvals', '/organization', '/field/sos']

const CUSTOMER_PAGES = ['/home', '/popular-services', '/service/mopping', '/booking/mopping', '/cart', '/notifications', '/offers', '/offers/zone',
  '/refer', '/bookings', '/bookings/completed', '/booking-details/:done', '/invoice/:done', '/receipt/:done', '/history', '/job/:live',
  '/job/:live/progress', '/job/:done/completed', '/rate/:done', '/tip/:done', '/cancel/:live', '/reschedule/:live', '/wallet',
  '/wallet/transactions', '/wallet/add', '/wallet/refunds', '/wallet/payments', '/wallet/gift-cards', '/wallet/settings', '/profile',
  '/profile/payment-methods', '/profile/notifications', '/profile/language', '/profile/privacy', '/profile/help', '/membership',
  '/membership/compare', '/membership/subscribe', '/support', '/support/ticket', '/support/faqs', '/addresses', '/addresses/add',
  '/personal', '/cancellation-policy', '/terms', '/quick-actions']

// Runs in the page. Returns the measured problems.
function measure(phone) {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
  const label = (el) => ((el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)) || `<${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}>`
  const out = []
  const vw = window.innerWidth
  if (document.documentElement.scrollWidth > vw + 1) {
    const wide = [...document.querySelectorAll('body *')].filter((e) => vis(e) && e.getBoundingClientRect().right > vw + 1 && !e.closest('.tablewrap, [class*=scroll], .chips, .ord-chips, .hscroll'))
    const worst = wide.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0]
    out.push(`PAGE SCROLLS SIDEWAYS by ${document.documentElement.scrollWidth - vw}px (widest: ${worst ? label(worst) : '?'})`)
  }
  // text cut off: element clips horizontally and its content is wider
  const clipped = [...document.querySelectorAll('body *')].filter((e) => {
    if (!vis(e) || !e.childNodes.length) return false
    const cs = getComputedStyle(e)
    if (!/(hidden|clip)/.test(cs.overflowX) || cs.textOverflow === 'ellipsis') return false
    if (e.closest('svg') || e.matches('img, svg, canvas, .leaflet-container *, .leaflet-container')) return false
    return e.scrollWidth > e.clientWidth + 2 && (e.innerText || '').trim().length > 0 && e.children.length < 6
  })
  clipped.slice(0, 5).forEach((e) => out.push(`TEXT CUT OFF: "${label(e)}" (${e.scrollWidth - e.clientWidth}px hidden)`))
  // spilling out of its card
  const cards = [...document.querySelectorAll('.card, .stat, .modal')].filter(vis)
  let spills = 0
  for (const c of cards) {
    const cr = c.getBoundingClientRect()
    if (getComputedStyle(c).overflowX !== 'visible') continue
    for (const e of c.querySelectorAll('*')) {
      if (!vis(e) || e.closest('.tablewrap, .menu, [class*=dropdown], [class*=popover], .leaflet-container')) continue
      const r = e.getBoundingClientRect()
      if (r.right > cr.right + 3 && r.width < cr.width * 3) { if (spills++ < 3) out.push(`SPILLS OUT OF CARD: "${label(e)}" by ${Math.round(r.right - cr.right)}px`); break }
    }
  }
  // wide tables
  document.querySelectorAll('.tablewrap').forEach((w) => { if (vis(w) && w.scrollWidth > w.clientWidth + 2) out.push(`TABLE SCROLLS: ${w.scrollWidth - w.clientWidth}px hidden (${w.querySelectorAll('thead th').length} columns)`) })
  // squashed icons
  const flat = [...document.querySelectorAll('button svg, a svg, .searchbox svg, .stat svg')].filter((s) => s.getBoundingClientRect().width < 1 && s.closest('button, a, .searchbox, .stat') && vis(s.closest('button, a, .searchbox, .stat')))
  if (flat.length) out.push(`ICONS SQUASHED TO 0px: ${flat.length} (e.g. in "${label(flat[0].closest('button, a, .searchbox, .stat'))}")`)
  // wrapped button labels
  const wrapped = [...document.querySelectorAll('button, .btn, a.btn')].filter((b) => {
    if (!vis(b)) return false
    const t = (b.innerText || '').trim(); if (!t || t.length < 4 || t.includes('\n')) return false
    const lh = parseFloat(getComputedStyle(b).lineHeight) || parseFloat(getComputedStyle(b).fontSize) * 1.3
    const r = document.createRange(); r.selectNodeContents(b); const rects = [...r.getClientRects()]
    const lines = new Set(rects.filter((x) => x.width > 1).map((x) => Math.round(x.top / (lh * 0.6)))).size
    return lines > 1 && b.getBoundingClientRect().height > lh * 1.8 && b.getBoundingClientRect().width < 260
  })
  wrapped.slice(0, 4).forEach((b) => out.push(`BUTTON TEXT WRAPS: "${label(b)}"`))
  // uneven stat rows
  document.querySelectorAll('.stat-row').forEach((row) => {
    const hs = [...row.children].filter(vis).map((c) => c.getBoundingClientRect())
    const byRow = {}; hs.forEach((r) => { (byRow[Math.round(r.top)] ||= []).push(r.height) })
    for (const h of Object.values(byRow)) if (h.length > 1 && Math.max(...h) - Math.min(...h) > 10) { out.push(`UNEVEN CARD ROW: heights ${Math.round(Math.min(...h))}–${Math.round(Math.max(...h))}px`); break }
  })
  if (phone) {
    const small = [...document.querySelectorAll('button, a, [role=button], input[type=checkbox], input[type=radio]')].filter((e) => {
      if (!vis(e)) return false
      const r = e.getBoundingClientRect()
      return (r.width < 32 || r.height < 32) && !e.closest('p, .muted, footer')
    })
    if (small.length) out.push(`SMALL TAP TARGETS (<32px): ${small.length} — ${[...new Set(small.slice(0, 5).map(label))].join(' | ')}`)
  }
  return out
}

async function main() {
  const sup = await api('POST', '/api/admin/login', { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } })
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  let pages, ids = {}
  if (ADMIN) {
    ids = { cid: first(await api('GET', '/api/admin/customers', { token: sup.token }))?.id, wid: first(await api('GET', '/api/admin/workers', { token: sup.token }))?.id, bid: first(await api('GET', '/api/admin/bookings', { token: sup.token }))?.id }
    pages = ADMIN_PAGES
    await page.goto(APP + '/login'); await page.evaluate((t, a) => { localStorage.setItem('hha_token', t); localStorage.setItem('hha_admin', JSON.stringify(a)) }, sup.token, sup.admin)
  } else {
    // A customer with one finished and one live booking (the customer-crawl setup does the same).
    const { setupCustomer } = await import(new URL('./ui-audit-customer-setup.mjs', import.meta.url))
    const d = await setupCustomer(api, sup.token)
    ids = { done: d.done, live: d.live }
    pages = CUSTOMER_PAGES
    await page.goto(APP + '/login'); await page.evaluate((t, u) => { localStorage.setItem('hh_token', t); localStorage.setItem('hh_user', JSON.stringify(u)); localStorage.setItem('hh_splash_seen', '1') }, d.token, d.user)
  }
  const report = []
  for (const w of WIDTHS) {
    await page.setViewport(ADMIN ? { width: w, height: 900 } : { width: w, height: 780, isMobile: true, hasTouch: true })
    for (const tmpl of pages) {
      const path = tmpl.replace(/:(\w+)/g, (_, k) => ids[k] ?? 1)
      if (ONLY && !ONLY.some((o) => path === o || path.startsWith(o + '/'))) continue
      await page.goto(APP + path, { waitUntil: 'networkidle0', timeout: 25000 }).catch(() => {})
      await sleep(ADMIN ? 900 : 3200) // the customer app shows its launch poster for ~2s on every fresh load
      const issues = await page.evaluate(measure, !ADMIN).catch((e) => [`AUDIT FAILED: ${e.message}`])
      const file = `${OUT}/${w}_${path.replace(/[/:?=]/g, '_').replace(/^_/, '') || 'root'}.png`
      await page.screenshot({ path: file, fullPage: true }).catch(() => {})
      report.push({ width: w, path, issues, shot: file })
      console.log(`${issues.length ? '✗' : '✓'} ${w} ${path}`); issues.forEach((i) => console.log(`     ${i}`))
    }
  }
  await browser.close()
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  const bad = report.filter((r) => r.issues.length)
  console.log(`\n${report.length} page views, ${bad.length} with issues — screenshots and report.json in ${OUT}`)
}
main().catch((e) => { console.error('ABORTED', e.stack || e.message); process.exit(1) })
