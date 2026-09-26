// Logs in to the admin panel as each built-in role and walks every menu item that role is shown.
// Reports, per role: where it lands, which menu items it sees, and any page that crashes, shows an
// error, or makes an API call the role is refused (a 403 means the menu offered a page the role
// can't actually use).
//
//   node infra/e2e/admin-roles-ui.mjs      # APP=http://127.0.0.1:5174 BASE=http://localhost:8080 SHOTS=dir
import { createRequire } from 'node:module'
import fs from 'node:fs'
const puppeteer = createRequire(new URL('../../apps/customer/package.json', import.meta.url))('puppeteer-core')
const APP = process.env.APP || 'http://127.0.0.1:5174'
const BASE = process.env.BASE || 'http://localhost:8080'
const OUT = process.env.SHOTS || '/tmp/admin-roles-ui'
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const RUN = Date.now().toString().slice(-5)
fs.mkdirSync(OUT, { recursive: true })
async function api(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let json; try { json = JSON.parse(t) } catch { json = t }
  return { status: r.status, ok: r.ok, json }
}
const ROLES = (process.env.ROLES || 'dispatcher,finance,safety,recruiter,trainer,marketing,auditor,support,manager,admin').split(',')

async function main() {
  const SUP = (await api('POST', '/api/admin/login', { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } })).json.token
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--ignore-certificate-errors'] })
  const created = []
  let bad = 0
  for (const role of ROLES) {
    const email = `ui-${role}-${RUN}@e2e.test`
    const mk = await api('POST', '/api/admin/admins', { token: SUP, body: { name: `UI ${role}`, email, password: 'Role@12345', role, scopeType: 'all', scopeValues: [] } })
    if (!mk.ok) { console.log(`${role}: could not create (${mk.status})`); bad++; continue }
    created.push(mk.json.admin?.id || mk.json.id)
    const login = (await api('POST', '/api/admin/login', { body: { email, password: 'Role@12345' } })).json
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    let cur = ''
    const issues = {}
    const add = (k, m) => { (issues[cur] ||= new Set()).add(`${k}: ${String(m).slice(0, 160)}`) }
    page.on('pageerror', (e) => add('CRASH', e.message))
    page.on('response', (r) => { const u = r.url(); if (u.includes('/api/') && (r.status() === 403 || r.status() >= 500)) add(`API ${r.status()}`, `${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]}`) })
    await page.goto(APP + '/login', { waitUntil: 'domcontentloaded' })
    await page.evaluate((t, a) => { localStorage.setItem('hha_token', t); localStorage.setItem('hha_admin', JSON.stringify(a)) }, login.token, login.admin)
    cur = '(landing)'
    await page.goto(APP + '/', { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, 1200))
    const landing = await page.evaluate(() => location.pathname)
    const nav = await page.evaluate(() => [...document.querySelectorAll('aside a[href], nav a[href], .sidebar a[href]')].map((a) => a.getAttribute('href')).filter((h) => h && h.startsWith('/')))
    const links = [...new Set(nav)]
    await page.screenshot({ path: `${OUT}/${role}_landing.png` }).catch(() => {})
    for (const href of links) {
      cur = href
      await page.goto(APP + href, { waitUntil: 'networkidle0', timeout: 30000 }).catch((e) => add('NAV', e.message))
      await new Promise((r) => setTimeout(r, 900))
      // The app's own error / no-access screens — not page text (a ticket may say "something went wrong").
      const info = await page.evaluate(() => ({ url: location.pathname, err: [...document.querySelectorAll('.state h3, .fd-state h3, .fd-noaccess, [data-error]')].map((e) => e.textContent.trim()).join(' | ') }))
      if (/went wrong|no access|denied|permission/i.test(info.err)) add('SCREEN', info.err.slice(0, 120))
      if (info.url !== href && !info.url.startsWith(href)) add('REDIRECT', `→ ${info.url}`)
    }
    const problems = Object.entries(issues).filter(([, v]) => v.size)
    if (problems.length) bad++
    console.log(`\n== ${role}: lands on ${landing}, ${links.length} menu items${problems.length ? `, ${problems.length} with problems` : ', all clean'}`)
    console.log(`   menu: ${links.join(' ')}`)
    for (const [p, v] of problems) { console.log(`   ${p}`); [...v].slice(0, 4).forEach((i) => console.log(`      ${i}`)) }
    await page.close()
  }
  await browser.close()
  for (const id of created) if (id) await api('DELETE', `/api/admin/admins/${id}`, { token: SUP })
  console.log(`\n${ROLES.length - bad}/${ROLES.length} roles clean`)
  process.exit(bad ? 1 : 0)
}
main().catch((e) => { console.error('ABORTED', e.message); process.exit(1) })
