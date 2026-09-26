// Opens every admin-panel page in a real browser (as the super admin and as a zone manager) and
// records what breaks: JS crashes, console errors, failed API calls, error screens, blank pages.
//
//   node infra/e2e/admin-crawl.mjs        # APP=http://127.0.0.1:5174 BASE=http://localhost:8080 SHOTS=dir
import { createRequire } from 'node:module'
import fs from 'node:fs'
const puppeteer = createRequire(new URL('../../apps/customer/package.json', import.meta.url))('puppeteer-core')

const APP = process.env.APP || 'http://127.0.0.1:5174'
const BASE = process.env.BASE || 'http://localhost:8080'
const OUT = process.env.SHOTS || '/tmp/admin-crawl'
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
fs.mkdirSync(OUT, { recursive: true })

async function api(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let json; try { json = JSON.parse(t) } catch { json = t }
  return { status: r.status, ok: r.ok, json }
}
const first = (x) => (Array.isArray(x) ? x : x?.workers || x?.bookings || x?.customers || [])[0]

const PAGES = ['/dashboard', '/customers', '/customers/:cid', '/workers', '/workers/new', '/workers/:wid', '/workers/:wid/edit', '/worker-wallet',
  '/bookings', '/bookings/:bid', '/cancellations', '/services', '/extension-rules', '/campaigns', '/membership', '/home-banners', '/packages',
  '/service-areas', '/zones', '/zones/cities', '/zones/clusters', '/zones/apartments', '/zones/stores', '/zones/pricing', '/zones/surge',
  '/zones/coverage', '/zones/inventory', '/command-center', '/control-tower', '/live-ops', '/roster', '/shift-plans', '/training', '/equipment',
  '/salary-plans', '/incentive-plans', '/payroll', '/compensation-rules', '/payments', '/refunds', '/complaints', '/notifications', '/tickets',
  '/reports', '/analytics', '/activity', '/settings', '/admins', '/roles', '/approvals', '/organization']

async function crawl(browser, label, login, ids) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  let cur = ''
  const issues = {}
  const add = (kind, msg) => { (issues[cur] ||= []).push(`${kind}: ${String(msg).slice(0, 220)}`) }
  page.on('pageerror', (e) => add('CRASH', e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|Download the React|ERR_CERT_AUTHORITY_INVALID|status of 4\d\d/.test(m.text())) add('console', m.text()) })
  page.on('response', (r) => {
    const u = r.url()
    if (u.includes('/api/') && r.status() >= 400) add(`API ${r.status()}`, `${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`)
  })
  await page.goto(APP + '/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate((t, a) => { localStorage.setItem('hha_token', t); localStorage.setItem('hha_admin', JSON.stringify(a)) }, login.token, login.admin)
  const rows = []
  for (const tmpl of PAGES) {
    const path = tmpl.replace(':cid', ids.cid).replace(':wid', ids.wid).replace(':bid', ids.bid)
    cur = path
    const t0 = Date.now()
    await page.goto(APP + path, { waitUntil: 'networkidle0', timeout: 30000 }).catch((e) => add('NAV', e.message))
    await new Promise((r) => setTimeout(r, 1200))
    const info = await page.evaluate(() => {
      const txt = document.body.innerText || ''
      return {
        len: txt.trim().length, url: location.pathname,
        errText: (txt.match(/Something went wrong|Failed to load|Cannot read|is not a function|undefined is not|Error: [^\n]{0,80}|Could not load[^\n]{0,60}/) || [null])[0],
        loading: /^\s*(Loading…|Loading\.\.\.)\s*$/.test(txt.slice(0, 400)),
      }
    })
    if (info.errText) add('SCREEN', info.errText)
    if (info.len < 40) add('BLANK', `only ${info.len} chars of text`)
    if (info.url !== path && !(tmpl.includes('new') && info.url.startsWith('/workers'))) add('REDIRECT', `→ ${info.url}`)
    const file = `${OUT}/${label}_${path.replace(/[/:]/g, '_').replace(/^_/, '')}.png`
    await page.screenshot({ path: file }).catch(() => {})
    rows.push({ path, ms: Date.now() - t0, issues: issues[path] || [] })
  }
  await page.close()
  return rows
}

async function main() {
  const sup = (await api('POST', '/api/admin/login', { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } })).json
  const cust = first((await api('GET', '/api/admin/customers', { token: sup.token })).json)
  const wrk = first((await api('GET', '/api/admin/workers', { token: sup.token })).json)
  const bk = first((await api('GET', '/api/admin/bookings', { token: sup.token })).json)
  const ids = { cid: cust?.id || 1, wid: wrk?.id || 1, bid: bk?.id || 1 }
  // A zone manager for the zone that worker belongs to (or the first live zone).
  const zones = (await api('GET', '/api/admin/zones', { token: sup.token })).json
  const zid = wrk?.zone_id || zones[0]?.id
  const email = `crawl${Date.now().toString().slice(-6)}@e2e.test`
  await api('POST', '/api/admin/admins', { token: sup.token, body: { name: 'Crawl Manager', email, password: 'Mgr@12345', role: 'manager', scopeType: 'zone', scopeValues: [zid] } })
  const mgr = (await api('POST', '/api/admin/login', { body: { email, password: 'Mgr@12345' } })).json

  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
  const report = {}
  for (const [label, login] of [['super', sup], ['manager', mgr]]) {
    if (!login?.token) { console.log(`skip ${label}: no login`); continue }
    report[label] = await crawl(browser, label, login, ids)
  }
  await browser.close()
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  for (const [label, rows] of Object.entries(report)) {
    const bad = rows.filter((r) => r.issues.length)
    console.log(`\n== ${label}: ${rows.length - bad.length}/${rows.length} pages clean`)
    for (const r of bad) { console.log(`  ${r.path}`); for (const i of [...new Set(r.issues)].slice(0, 6)) console.log(`     ${i}`) }
  }
}
main().catch((e) => { console.error('ABORTED', e); process.exit(1) })
