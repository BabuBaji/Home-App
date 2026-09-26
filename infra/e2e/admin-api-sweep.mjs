// Calls every read (GET) endpoint the admin panel uses — parsed from apps/admin/src/api.ts — as the
// super admin and a zone manager, and reports missing routes (404 "No route"), server errors (5xx)
// and unexpected refusals.   node infra/e2e/admin-api-sweep.mjs
import fs from 'node:fs'
const BASE = process.env.BASE || 'http://localhost:8080'
const src = fs.readFileSync(new URL('../../apps/admin/src/api.ts', import.meta.url), 'utf8')
async function api(method, path, token, body) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let json; try { json = JSON.parse(t) } catch { json = t }
  return { status: r.status, json }
}
const first = (x) => (Array.isArray(x) ? x : x?.workers || x?.bookings || [])[0]
// export const name = (args) => req<T>(`path` | 'path' [, opts])
const re = /export const (\w+) = \(([^)]*)\) =>\s*req<[\s\S]*?>\(\s*([`'])([^`']+)\3\s*(,[^)]*)?\)/g
const gets = []
for (const m of src.matchAll(re)) if (!m[5] || !/method|post\(|patch\(|put\(/.test(m[5])) gets.push({ name: m[1], path: m[4] })

const sup = (await api('POST', '/api/admin/login', null, { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' })).json.token
const w = first((await api('GET', '/api/admin/workers', sup)).json), c = first((await api('GET', '/api/admin/customers', sup)).json), b = first((await api('GET', '/api/admin/bookings', sup)).json)
const zones = (await api('GET', '/api/admin/zones', sup)).json
const campaign = first((await api('GET', '/api/admin/campaigns', sup)).json)
const run = (await api('GET', '/api/admin/payroll', sup)).json
const email = `sweep${Date.now().toString().slice(-6)}@e2e.test`
await api('POST', '/api/admin/admins', sup, { name: 'Sweep Mgr', email, password: 'Mgr@12345', role: 'manager', scopeType: 'zone', scopeValues: [w?.zone_id || zones[0].id] })
const mgr = (await api('POST', '/api/admin/login', null, { email, password: 'Mgr@12345' })).json.token
const fill = (p) => p
  .replace(/\$\{encodeURIComponent\([^}]*\)\}/g, '').replace(/\$\{(status|priority|city|q|day[^}]*)\}/g, '')
  .replace(/\$\{days\}/, '7').replace(/\$\{(workerId|id)\}/g, (_, k) => String(k === 'workerId' ? w.id : null))
const idFor = (name) => /Customer/.test(name) ? c.id : /Booking|Settlement|Evidence|booking/i.test(name) ? b.id : /zone/i.test(name) ? zones[0].id
  : /campaign/i.test(name) ? campaign?.campaign_id : /Payroll/.test(name) ? (first(run)?.id ?? 1) : w.id
const out = { missing: [], errors: [], refused: [] }
for (const g of gets) {
  let p = g.path.replace(/\$\{id\}/g, String(idFor(g.name))).replace(/\$\{bookingId\}/g, String(b.id))
  p = fill(p).replace(/\$\{[^}]+\}/g, '1')
  if (!p.startsWith('/api')) p = '/api/admin' + (p.startsWith('/') ? p : '/' + p)
  for (const [who, tok] of [['super', sup], ['manager', mgr]]) {
    const r = await api('GET', p, tok)
    const line = `${who.padEnd(7)} ${r.status} ${g.name} GET ${p}  ${typeof r.json === 'string' ? r.json.slice(0, 80) : JSON.stringify(r.json).slice(0, 80)}`
    if (r.status === 404 && /No route|Cannot GET/.test(JSON.stringify(r.json))) out.missing.push(line)
    else if (r.status >= 500) out.errors.push(line)
    else if (who === 'super' && r.status >= 400) out.refused.push(line)
  }
}
console.log(`${gets.length} read endpoints × 2 roles`)
for (const [k, v] of Object.entries(out)) { console.log(`\n${k}: ${v.length}`); v.forEach((l) => console.log('  ' + l)) }
