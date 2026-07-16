// HomeHelp Admin Service — core (identity + config + audit)
// ----------------------------------------------------------
// Owns admins/settings/audit_log on its own Postgres. It is:
//   • the admin identity provider — /api/admin/login + /api/admin/me (token `admin-<id>`),
//     which every other service calls (via @homehelp/shared makeAdminAuth) to authorize
//     their own /api/admin/* routes;
//   • the CONFIG service — the old global `settings` bus. /internal/settings serves the
//     unmasked values that shared/config.js getSetting() reads.
// The BFF aggregation endpoints (dashboard/analytics/customers/…) are added in Phase 2i.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import crypto from 'node:crypto'
import { makePool, migrate, nowIso, internalOnly, requireRole, requirePerm, publishEvent, tryGet, internalPost, internalPatch,
  PERMISSION_CATALOG, ALL_PERMISSIONS, SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS, isSystemRole, inScope } from '@homehelp/shared'
import { signToken, tokenSubject, assertJwtSecret } from '@homehelp/shared/jwt.js'

assertJwtSecret('admin') // refuse to boot without a signing secret rather than issue forgeable sessions

const PORT = Number(process.env.PORT || 4010)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5440/admin'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const U = {
  auth: (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, ''),
  booking: (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, ''),
  worker: (process.env.WORKER_URL || 'http://localhost:4004').replace(/\/$/, ''),
  payment: (process.env.PAYMENT_URL || 'http://localhost:4008').replace(/\/$/, ''),
  catalog: (process.env.CATALOG_URL || 'http://localhost:4001').replace(/\/$/, ''),
}

process.on('unhandledRejection', (e) => console.error('[admin] unhandledRejection:', e?.message || e))
const pool = makePool(DATABASE_URL)

/* ---------- password hashing (scrypt) ---------- */
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`
}
function verifyPw(pw, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  const test = crypto.scryptSync(pw, salt, 32).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'))
}

const DEFAULT_SETTINGS = {
  platform_name: 'HomeHelp', support_email: 'support@homehelp.in', support_phone: '+91 1800 200 3000',
  currency: 'INR', currency_symbol: '₹', timezone: 'GMT+5:30 (IST)',
  platform_fee: '20', tax_percent: '5',
  cancel_fee: '50', cancel_arrival_pct: '100', cancel_sched_full_hrs: '6',
  cancel_sched_half_hrs: '3', cancel_sched_half_pct: '50', commission_percent: '20',
  auto_assign: 'true', maintenance_mode: 'false', dispatch_timeout_min: '5',
  gst_inclusive: 'false',   // GST is added on top of the shown price (exclusive) — the market norm; toggle in Settings
  // Seller details printed on the customer tax invoice (edit to your registered company).
  company_name: 'HomeHelp Services Pvt. Ltd.', company_gstin: '36AABCH1234M1Z7',
  company_address: '3rd Floor, Cyber Heights, HITEC City, Hyderabad, Telangana 500081',
  company_state: 'Telangana', service_sac: '9987', invoice_prefix: 'INV',
  razorpay_key_id: '', razorpay_key_secret: '', google_maps_key: '', msg91_key: '',
  // India requires a DLT-registered template for transactional SMS, so a template id is as
  // essential as the key — without it MSG91 rejects the send. Empty = SMS disabled, and the
  // login flows fall back to disclosing the code (dev only; see DEV_OTP / WORKER_DEV_OTP).
  msg91_otp_template_id: '', msg91_sender_id: '', msg91_invite_template_id: '',
  firebase_server_key: '', smtp_host: '', smtp_user: '', smtp_pass: '',
  upi_vpa: '', upi_payee_name: '', upi_mode: 'demo',
  serviceable_pincodes: '', service_cities: '',
  razorpay_webhook_secret: '', payment_webhook_secret: '', payout_webhook_secret: '', payout_provider: '',
  razorpayx_account_number: '', payout_mode: 'IMPS',
  earnings_auto_release: 'true', advance_recovery_percent: '30', auto_approve_withdrawal_below: '2000', advance_max: '5000',
  // Payout policy. There is no auto-payout scheduler — payouts are still worker-requested and
  // admin-approved. These declare the ORG'S POLICY: min_payout_limit is enforced on every
  // withdrawal request, and payout_frequency/payout_day drive the estimated next-payout date
  // shown to workers and admins. 'on_demand' frequency = no schedule, so no estimate is shown.
  payout_frequency: 'weekly', payout_day: '4', min_payout_limit: '500',
}
const SECRET_KEYS = ['razorpay_key_secret', 'msg91_key', 'firebase_server_key', 'smtp_pass', 'google_maps_key',
  'razorpay_webhook_secret', 'payment_webhook_secret', 'payout_webhook_secret']

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT,
      pass_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'manager',
      status TEXT NOT NULL DEFAULT 'active', avatar TEXT, last_login TIMESTAMPTZ,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY, admin TEXT NOT NULL, action TEXT NOT NULL, target TEXT,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // RBAC. A role is a named bundle of permission keys (from @homehelp/shared PERMISSION_CATALOG).
    // The 4 system roles are seeded + reset to their canonical bundle on every boot (self-healing,
    // read-only in the UI); custom roles are freely editable and never touched by the seed.
    `CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY, key TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', rank INTEGER NOT NULL DEFAULT 0,
      is_system BOOLEAN NOT NULL DEFAULT false, active BOOLEAN NOT NULL DEFAULT true,
      landing TEXT NOT NULL DEFAULT '/dashboard', created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS role_permissions (
      role_key TEXT NOT NULL REFERENCES roles(key) ON DELETE CASCADE,
      perm TEXT NOT NULL, PRIMARY KEY (role_key, perm)
    )`,
    // Data scope. 'all' (default) = unrestricted; 'city' = scope_values are city names; 'zone' =
    // scope_values are zone ids. Resolved into req.admin.scope and enforced on the list endpoints.
    `ALTER TABLE admins ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'all'`,
    `ALTER TABLE admins ADD COLUMN IF NOT EXISTS scope_values JSONB NOT NULL DEFAULT '[]'::jsonb`,
    // Org hierarchy: who this admin reports to. A manager's effective scope rolls up the union of
    // their (transitive) reports' scopes, so a regional manager auto-sees their team's territory.
    `ALTER TABLE admins ADD COLUMN IF NOT EXISTS reports_to INTEGER`,
    // Approval matrix. One rule per registered action: whether it needs approval, above what ₹
    // threshold, who may approve (reviewer_perm) and how many approvers. Disabled by default, so
    // nothing changes until an admin turns a rule on.
    `CREATE TABLE IF NOT EXISTS approval_rules (
      action TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT false,
      threshold INTEGER NOT NULL DEFAULT 0, reviewer_perm TEXT NOT NULL DEFAULT '',
      min_approvers INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT NOT NULL DEFAULT '', updated TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // A queued action awaiting sign-off. params is everything needed to replay it; approvals holds
    // the checkers who have signed (for min_approvers). status: pending|approved|rejected|executed|failed.
    `CREATE TABLE IF NOT EXISTS approval_requests (
      id SERIAL PRIMARY KEY, action TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
      params JSONB NOT NULL DEFAULT '{}'::jsonb, amount INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_by TEXT NOT NULL DEFAULT '', requested_by_id INTEGER,
      approvals JSONB NOT NULL DEFAULT '[]'::jsonb,
      decided_by TEXT NOT NULL DEFAULT '', decided_at TIMESTAMPTZ, reason TEXT NOT NULL DEFAULT '',
      result JSONB, error TEXT NOT NULL DEFAULT '',
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ])
  // Seed / re-sync the four system roles. Their permission bundle is reset to canonical every boot,
  // so a new permission added to the catalog reaches them and no drift can strip their access.
  for (const r of SYSTEM_ROLES) {
    await pool.query(
      `INSERT INTO roles (key,name,description,rank,is_system,active,landing) VALUES ($1,$2,$3,$4,true,true,$5)
       ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, rank=EXCLUDED.rank, is_system=true, landing=EXCLUDED.landing`,
      [r.key, r.name, r.description, r.rank, r.landing])
    await pool.query('DELETE FROM role_permissions WHERE role_key=$1', [r.key])
    const perms = SYSTEM_ROLE_PERMISSIONS[r.key] || []
    for (const p of perms)
      await pool.query('INSERT INTO role_permissions (role_key,perm) VALUES ($1,$2) ON CONFLICT DO NOTHING', [r.key, p])
  }
  invalidatePerms()
  // Seed one approval rule per registered action, disabled — nothing needs sign-off until an admin
  // turns a rule on. ACTIONS is defined later in the module but evaluated before init() is called.
  for (const a of ACTION_KEYS)
    await pool.query('INSERT INTO approval_rules (action, reviewer_perm) VALUES ($1,$2) ON CONFLICT (action) DO NOTHING', [a, DEFAULT_REVIEWER_PERM])
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS))
    await pool.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [k, v])
  // Operator-provided integration keys from the environment override the (empty) defaults, so
  // secrets live in gitignored infra/.env rather than in source or a hand-entered DB row. Upserted
  // on every boot, so rotating a key in .env just needs a restart. Only non-empty values apply.
  const ENV_SETTINGS = {
    razorpay_key_id: process.env.RAZORPAY_KEY_ID,
    razorpay_key_secret: process.env.RAZORPAY_KEY_SECRET,
    razorpay_webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET,
    google_maps_key: process.env.GOOGLE_MAPS_KEY,
    msg91_key: process.env.MSG91_KEY,
    msg91_otp_template_id: process.env.MSG91_OTP_TEMPLATE_ID,
    msg91_sender_id: process.env.MSG91_SENDER_ID,
    upi_vpa: process.env.UPI_VPA,
    upi_payee_name: process.env.UPI_PAYEE_NAME,
    upi_mode: process.env.UPI_MODE,
  }
  for (const [k, v] of Object.entries(ENV_SETTINGS))
    if (v) await pool.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [k, v])
  const n = await pool.query('SELECT COUNT(*)::int AS n FROM admins')
  if (n.rows[0].n === 0) {
    const adminEmail = process.env.ADMIN_SEED_EMAIL || 'admin@homehelp.in'
    const adminPass = process.env.ADMIN_SEED_PASSWORD || 'admin123'
    const opsEmail = process.env.OPS_SEED_EMAIL || 'ops@homehelp.in'
    const opsPass = process.env.OPS_SEED_PASSWORD || 'ops12345'
    await pool.query('INSERT INTO admins (name,email,phone,pass_hash,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
      ['Super Admin', adminEmail, '+91 90000 00000', hashPw(adminPass), 'super', 'active'])
    await pool.query('INSERT INTO admins (name,email,phone,pass_hash,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
      ['Ops Manager', opsEmail, '+91 90000 11111', hashPw(opsPass), 'manager', 'active'])
    console.log(`[admin] seeded default admins (${adminEmail})`)
  }
  console.log('[admin] Postgres ready (admins, settings, audit_log)')
}

/* ---------- data helpers ---------- */
const publicAdmin = (a) => a && ({ id: a.id, name: a.name, email: a.email, phone: a.phone, role: a.role, status: a.status, avatar: a.avatar, last_login: a.last_login, created: a.created, scopeType: a.scope_type || 'all', scopeValues: a.scope_values || [], reportsTo: a.reports_to ?? null })

// Zones snapshot (id → city), cached briefly, used only to resolve a scoped admin's scope. A city
// contains zones (zones.city is a string), so this maps between the two geographic keys.
let zonesSnap = { at: 0, list: [] }
async function getZonesSnapshot() {
  if (Date.now() - zonesSnap.at < 60000 && zonesSnap.list.length) return zonesSnap.list
  const list = await tryGet(U.catalog, '/api/internal/zones', [])
  if (Array.isArray(list) && list.length) zonesSnap = { at: Date.now(), list }
  return zonesSnap.list
}
/** Resolve an admin's EFFECTIVE scope into { type, zoneIds, cities } — both keys populated so every
 *  service can filter whatever geographic column its rows carry. 'all' → unrestricted. Otherwise it
 *  rolls up: this admin's own territory PLUS the union of everyone reporting to them (transitively),
 *  so a manager automatically sees their whole team's scope. 'team' = pure roll-up (no own turf).
 *  Cycle-safe. `roster` (all admin rows) can be passed to avoid re-querying (used by the list). */
async function resolveScope(a, roster) {
  const type = a.scope_type || 'all'
  if (type === 'all') return { type: 'all', zoneIds: null, cities: null }
  const all = roster || (await pool.query('SELECT id, reports_to, scope_type, scope_values FROM admins')).rows
  const byId = new Map(all.map((r) => [r.id, r]))
  const children = new Map()
  for (const r of all) if (r.reports_to != null) { if (!children.has(r.reports_to)) children.set(r.reports_to, []); children.get(r.reports_to).push(r.id) }
  const cities = new Set(), zoneIds = new Set(), seen = new Set()
  const stack = [a.id]
  while (stack.length) {
    const id = stack.pop()
    if (seen.has(id)) continue
    seen.add(id)
    const node = id === a.id ? a : byId.get(id)
    if (node) {
      const st = node.scope_type || 'all'
      const vals = Array.isArray(node.scope_values) ? node.scope_values : []
      if (st === 'city') vals.forEach((c) => cities.add(String(c)))
      else if (st === 'zone') vals.forEach((z) => zoneIds.add(Number(z))) // 'all'/'team' add no turf of their own
    }
    for (const c of (children.get(id) || [])) stack.push(c)
  }
  if (!cities.size && !zoneIds.size) return { type, zoneIds: [], cities: [] } // e.g. a team lead with no scoped reports → sees nothing
  const zones = await getZonesSnapshot()
  for (const z of zones) if (cities.has(z.city)) zoneIds.add(z.id)        // cities → their zones
  for (const z of zones) if (zoneIds.has(z.id) && z.city) cities.add(z.city) // zones → their cities
  return { type, zoneIds: [...zoneIds], cities: [...cities] }
}

// Resolved permission keys per role, cached in-process. This is the ONE place authorization is
// computed; every service reads it through the /api/admin/me payload, so a role change here takes
// effect platform-wide on the next request. super always resolves to every key (drift-proof).
const permCache = new Map()
const invalidatePerms = (roleKey) => { if (roleKey) permCache.delete(roleKey); else permCache.clear() }
async function resolvePermissions(roleKey) {
  if (roleKey === 'super') return [...ALL_PERMISSIONS]
  if (permCache.has(roleKey)) return permCache.get(roleKey)
  const { rows } = await pool.query('SELECT perm FROM role_permissions WHERE role_key=$1', [roleKey])
  const perms = rows.map((r) => r.perm)
  permCache.set(roleKey, perms)
  return perms
}
/** publicAdmin + the resolved permission list — what /me and login return, and what every other
 *  service receives as req.admin (so requirePerm works uniformly across the platform). */
async function adminWithPerms(a) {
  if (!a) return a
  const [permissions, scope] = await Promise.all([resolvePermissions(a.role), resolveScope(a)])
  return { ...publicAdmin(a), permissions, scope }
}
async function getAdmin(id) { const { rows } = await pool.query('SELECT * FROM admins WHERE id=$1', [id]); return rows[0] || null }
async function getAdminByEmail(email) { const { rows } = await pool.query('SELECT * FROM admins WHERE email=$1', [String(email).toLowerCase()]); return rows[0] || null }
async function getSettings() {
  const { rows } = await pool.query('SELECT key,value FROM settings')
  const out = {}; for (const r of rows) out[r.key] = r.value; return out
}
async function getPublicSettings() {
  const s = await getSettings()
  for (const k of SECRET_KEYS) if (s[k]) s[k] = '••••••••' + String(s[k]).slice(-4)
  return s
}
async function logAudit(admin, action, target) {
  await pool.query('INSERT INTO audit_log (admin,action,target,created) VALUES ($1,$2,$3,$4)', [admin, action, target || null, nowIso()])
  publishEvent(REDIS_URL, 'admin.action', { actorType: 'admin', actorName: admin, action: 'admin.' + action, detail: target || null })
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'admin', ok: true }))

/* ---------- admin identity ---------- */
// Verifies a SIGNED token. Previously this parsed the id straight out of the string, so
// `Authorization: Bearer admin-1` was a full Super Admin session with no password — the scrypt
// login below was decorative, because its token could be typed by hand.
async function admin(req, res, next) {
  const id = tokenSubject(req.headers.authorization, 'admin')
  const a = Number.isFinite(id) ? await getAdmin(id) : null
  if (!a || a.status !== 'active') return res.status(401).json({ error: 'Not authenticated' })
  // Enrich with resolved permissions + scope, exactly as other services receive via /me — so
  // requirePerm and inScope work on the admin service's OWN routes too, not just the super bypass.
  req.admin = a
  req.admin.permissions = await resolvePermissions(a.role)
  req.admin.scope = await resolveScope(a)
  next()
}

app.post('/api/admin/login', async (req, res) => {
  const a = await getAdminByEmail(String(req.body?.email || '').trim())
  if (!a || !verifyPw(String(req.body?.password || ''), a.pass_hash)) return res.status(401).json({ error: 'Invalid email or password' })
  if (a.status !== 'active') return res.status(403).json({ error: 'Account disabled' })
  await pool.query('UPDATE admins SET last_login=now() WHERE id=$1', [a.id])
  await logAudit(a.email, 'login')
  res.json({ token: signToken('admin', a.id, { role: a.role }), admin: await adminWithPerms(a) })
})
app.get('/api/admin/me', admin, async (req, res) => res.json({ admin: await adminWithPerms(req.admin) }))

// Run the month-end Shakti Bonus settlement (delegates to the worker service, which credits
// each qualifying worker's tier bonus via the wallet — idempotent per worker/month).
app.post('/api/admin/shakti/settle', admin, async (req, res) => {
  try {
    const r = await internalPost(U.worker, '/internal/shakti/settle', { month: req.body?.month })
    publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: req.admin?.name || 'Admin', action: 'sitara.settle', entityType: 'system', entityId: 0, detail: `Ran Sitara Bonus settlement for ${r.month} — ${r.qualified} worker(s) qualified` })
    res.json(r)
  } catch (e) { res.status(502).json({ ok: false, error: e.message }) }
})

/* ---------- settings (config) ---------- */
app.get('/api/admin/settings', admin, async (_q, res) => res.json(await getPublicSettings()))
app.patch('/api/admin/settings', admin, requirePerm('settings.edit'), async (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    if (k === '__seeded') continue
    if (SECRET_KEYS.includes(k) && String(v).startsWith('••••')) continue // ignore unchanged masked secrets
    await pool.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [k, String(v)])
  }
  await logAudit(req.admin.email, 'settings.update')
  publishEvent(REDIS_URL, 'settings.updated', {})
  res.json(await getPublicSettings())
})

/* ---------- admins management ---------- */
app.get('/api/admin/admins', admin, requirePerm('admins.view'), async (_q, res) => {
  const roster = (await pool.query('SELECT * FROM admins ORDER BY id')).rows
  const out = []
  for (const a of roster) out.push({ ...publicAdmin(a), effectiveScope: await resolveScope(a, roster) })
  res.json(out)
})
// Validate a scope payload from the admin form. Returns { scopeType, scopeValues } or { error }.
// 'team' = no own territory; the effective scope rolls up from this admin's reports.
function readScope(b, fallback = { scope_type: 'all', scope_values: [] }) {
  if (b.scopeType === undefined && b.scopeValues === undefined) return { scopeType: fallback.scope_type, scopeValues: fallback.scope_values }
  const scopeType = String(b.scopeType || 'all')
  if (!['all', 'city', 'zone', 'team'].includes(scopeType)) return { error: 'Scope must be all, city, zone or team' }
  let scopeValues = Array.isArray(b.scopeValues) ? b.scopeValues : []
  if (scopeType === 'all' || scopeType === 'team') scopeValues = []
  else {
    scopeValues = scopeType === 'zone' ? scopeValues.map(Number).filter((n) => Number.isFinite(n)) : scopeValues.map(String).filter(Boolean)
    if (!scopeValues.length) return { error: `Pick at least one ${scopeType} for the scope` }
  }
  return { scopeType, scopeValues }
}
// Prevent reporting cycles: walking up from the proposed manager must never reach the admin itself.
async function reportsToCycles(adminId, managerId) {
  if (!managerId) return false
  if (Number(managerId) === Number(adminId)) return true
  let cur = Number(managerId), guard = 0
  while (cur != null && guard++ < 200) {
    if (Number(cur) === Number(adminId)) return true
    cur = (await pool.query('SELECT reports_to FROM admins WHERE id=$1', [cur])).rows[0]?.reports_to
  }
  return false
}
// Validate an optional reports_to on create/update. Returns { reportsTo } or { error }.
async function readReportsTo(b, adminId) {
  if (b.reportsTo === undefined) return { skip: true }
  if (b.reportsTo === null || b.reportsTo === '') return { reportsTo: null }
  const mgr = Number(b.reportsTo)
  if (!Number.isFinite(mgr)) return { error: 'Invalid manager' }
  if (!(await getAdmin(mgr))) return { error: 'That manager does not exist' }
  if (adminId && await reportsToCycles(adminId, mgr)) return { error: 'That would create a reporting cycle' }
  return { reportsTo: mgr }
}
// A new/edited admin must land on a role that actually exists and is active — otherwise they'd
// authenticate with an empty permission set and every screen would 403 with no explanation.
async function assertAssignableRole(roleKey) {
  const { rows } = await pool.query('SELECT active FROM roles WHERE key=$1', [roleKey])
  if (!rows[0]) return `Unknown role "${roleKey}"`
  if (!rows[0].active) return `Role "${roleKey}" is paused — pick an active role`
  return null
}
app.post('/api/admin/admins', admin, requirePerm('admins.create'), async (req, res) => {
  const b = req.body || {}
  if (!b.name || !b.email) return res.status(400).json({ error: 'Name and email required' })
  const roleKey = b.role || 'manager'
  const roleErr = await assertAssignableRole(roleKey)
  if (roleErr) return res.status(400).json({ error: roleErr })
  const scope = readScope(b)
  if (scope.error) return res.status(400).json({ error: scope.error })
  const rt = await readReportsTo(b, null)
  if (rt.error) return res.status(400).json({ error: rt.error })
  try {
    const { rows } = await pool.query(
      'INSERT INTO admins (name,email,phone,pass_hash,role,status,scope_type,scope_values,reports_to) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *',
      [b.name, String(b.email).toLowerCase(), b.phone || null, hashPw(b.password || process.env.NEW_ADMIN_DEFAULT_PASSWORD || 'changeme123'), roleKey, b.status || 'active', scope.scopeType, JSON.stringify(scope.scopeValues), rt.skip ? null : rt.reportsTo])
    await logAudit(req.admin.email, 'admin.create', b.email)
    res.status(201).json(publicAdmin(rows[0]))
  } catch { res.status(409).json({ error: 'Email already exists' }) }
})
app.patch('/api/admin/admins/:id', admin, requirePerm('admins.edit'), async (req, res) => {
  const a = await getAdmin(Number(req.params.id)); if (!a) return res.status(404).json({ error: 'Not found' })
  const b = req.body || {}
  if (b.role !== undefined && b.role !== a.role) {
    const roleErr = await assertAssignableRole(b.role)
    if (roleErr) return res.status(400).json({ error: roleErr })
  }
  const scope = readScope(b, a)
  if (scope.error) return res.status(400).json({ error: scope.error })
  const rt = await readReportsTo(b, a.id)
  if (rt.error) return res.status(400).json({ error: rt.error })
  const reportsTo = rt.skip ? a.reports_to : rt.reportsTo
  await pool.query('UPDATE admins SET name=$1,phone=$2,role=$3,status=$4,scope_type=$5,scope_values=$6::jsonb,reports_to=$7 WHERE id=$8',
    [b.name ?? a.name, b.phone ?? a.phone, b.role ?? a.role, b.status ?? a.status, scope.scopeType, JSON.stringify(scope.scopeValues), reportsTo, a.id])
  if (b.password) await pool.query('UPDATE admins SET pass_hash=$1 WHERE id=$2', [hashPw(b.password), a.id])
  await logAudit(req.admin.email, 'admin.update', a.email)
  res.json(publicAdmin(await getAdmin(a.id)))
})
app.delete('/api/admin/admins/:id', admin, requirePerm('admins.delete'), async (req, res) => {
  const id = Number(req.params.id)
  // Re-parent this admin's reports up to the deleted admin's own manager, so the tree stays intact.
  const gone = await getAdmin(id)
  await pool.query('UPDATE admins SET reports_to=$1 WHERE reports_to=$2', [gone?.reports_to ?? null, id])
  await pool.query('DELETE FROM admins WHERE id=$1', [id])
  await logAudit(req.admin.email, 'admin.delete', req.params.id)
  res.json({ ok: true })
})

/* ---------- roles & permissions (RBAC) ---------- */
const slugRole = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
const cleanPerms = (list) => [...new Set((Array.isArray(list) ? list : []).map(String))].filter((p) => ALL_PERMISSIONS.includes(p))

async function roleDto(r, counts) {
  const perms = r.key === 'super' ? [...ALL_PERMISSIONS] : (await pool.query('SELECT perm FROM role_permissions WHERE role_key=$1', [r.key])).rows.map((x) => x.perm)
  return {
    id: r.id, key: r.key, name: r.name, description: r.description || '', rank: r.rank,
    isSystem: r.is_system, active: r.active, landing: r.landing || '/dashboard',
    permissions: perms, users: counts[r.key] || 0, created: r.created,
  }
}
async function roleUserCounts() {
  const { rows } = await pool.query('SELECT role, COUNT(*)::int n FROM admins GROUP BY role')
  const out = {}; for (const r of rows) out[r.role] = r.n; return out
}

// The permission vocabulary that drives the matrix editor.
app.get('/api/admin/permissions', admin, requirePerm('roles.view'), (_q, res) => {
  res.json({ ok: true, catalog: PERMISSION_CATALOG })
})

app.get('/api/admin/roles', admin, requirePerm('roles.view'), async (_q, res) => {
  const counts = await roleUserCounts()
  const { rows } = await pool.query('SELECT * FROM roles ORDER BY rank DESC, name')
  res.json({ ok: true, roles: await Promise.all(rows.map((r) => roleDto(r, counts))) })
})

app.post('/api/admin/roles', admin, requirePerm('roles.manage'), async (req, res) => {
  const b = req.body || {}
  const name = String(b.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Role name required' })
  const key = b.key ? slugRole(b.key) : slugRole(name)
  if (!key) return res.status(400).json({ error: 'Could not derive a role key from the name' })
  if (isSystemRole(key)) return res.status(409).json({ error: 'That key is reserved by a system role' })
  const perms = cleanPerms(b.permissions)
  try {
    const r = (await pool.query(
      'INSERT INTO roles (key,name,description,rank,is_system,active,landing) VALUES ($1,$2,$3,0,false,$4,$5) RETURNING *',
      [key, name, String(b.description || ''), b.active !== false, String(b.landing || '/dashboard')])).rows[0]
    for (const p of perms) await pool.query('INSERT INTO role_permissions (role_key,perm) VALUES ($1,$2)', [key, p])
    invalidatePerms(key)
    await logAudit(req.admin.email, 'role.create', `${name} (${perms.length} perms)`)
    res.status(201).json({ ok: true, role: await roleDto(r, await roleUserCounts()) })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A role with that key already exists' })
    throw e
  }
})

app.patch('/api/admin/roles/:key', admin, requirePerm('roles.manage'), async (req, res) => {
  const key = String(req.params.key)
  const r = (await pool.query('SELECT * FROM roles WHERE key=$1', [key])).rows[0]
  if (!r) return res.status(404).json({ error: 'Role not found' })
  const b = req.body || {}
  // System roles are canonical baselines — reset to their bundle on every boot — so their name and
  // permission set are read-only. Only their `active` flag would be meaningful, and even that is
  // refused here to avoid an org locking itself out of the default roles.
  if (r.is_system) return res.status(400).json({ error: 'System roles cannot be edited — clone this into a custom role instead' })
  await pool.query('UPDATE roles SET name=$1, description=$2, active=$3, landing=$4 WHERE key=$5',
    [String(b.name || r.name).trim(), String(b.description ?? r.description), b.active !== undefined ? !!b.active : r.active, String(b.landing || r.landing), key])
  if (b.permissions !== undefined) {
    const perms = cleanPerms(b.permissions)
    await pool.query('DELETE FROM role_permissions WHERE role_key=$1', [key])
    for (const p of perms) await pool.query('INSERT INTO role_permissions (role_key,perm) VALUES ($1,$2)', [key, p])
  }
  invalidatePerms(key)
  await logAudit(req.admin.email, 'role.update', r.name)
  res.json({ ok: true, role: await roleDto((await pool.query('SELECT * FROM roles WHERE key=$1', [key])).rows[0], await roleUserCounts()) })
})

app.delete('/api/admin/roles/:key', admin, requirePerm('roles.manage'), async (req, res) => {
  const key = String(req.params.key)
  const r = (await pool.query('SELECT * FROM roles WHERE key=$1', [key])).rows[0]
  if (!r) return res.status(404).json({ error: 'Role not found' })
  if (r.is_system) return res.status(400).json({ error: 'System roles cannot be deleted' })
  const n = (await pool.query('SELECT COUNT(*)::int n FROM admins WHERE role=$1', [key])).rows[0].n
  if (n > 0) return res.status(409).json({ error: `${n} admin user(s) still have this role — reassign them first` })
  await pool.query('DELETE FROM roles WHERE key=$1', [key]) // role_permissions cascade
  invalidatePerms(key)
  await logAudit(req.admin.email, 'role.delete', r.name)
  res.json({ ok: true })
})

/* ---------- audit ---------- */
app.get('/api/admin/audit', admin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT $1', [Number(req.query.limit) || 30])
  res.json(rows)
})

/* ================= Approval matrix (maker-checker) =================
 * Sensitive actions can require a second admin's sign-off. Each registered action carries an
 * executor that PERFORMS it by replaying the same internal call the direct route would. submitAction
 * consults the matrix: rule off, or amount below threshold → execute now; otherwise queue a request.
 * A checker holding the reviewer permission (and who is NOT the requester) approves it, which runs
 * the executor. min_approvers lets an action need more than one sign-off.
 */
const ACTIONS = {
  'customer.wallet_adjust': {
    label: 'Customer wallet adjustment',
    perm: 'customers.edit', // the maker must be allowed to do this at all
    amountOf: (p) => Math.abs(Number(p.amount) || 0),
    summarize: (p, amt) => `${Number(p.amount) >= 0 ? 'Credit' : 'Debit'} ₹${amt} ${Number(p.amount) >= 0 ? 'to' : 'from'} customer #${p.userId} (${p.balance})`,
    execute: async (p) => {
      const amt = Number(p.amount) || 0
      const type = amt >= 0 ? 'credit' : 'debit'
      return internalPost(U.auth, `/api/internal/users/${p.userId}/wallet`, {
        type, balance: p.balance, admin: true, kind: type === 'credit' ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
        title: p.title, amount: Math.abs(amt),
      })
    },
  },
  'refund.issue': {
    label: 'Issue refund',
    perm: 'refunds.approve',
    amountOf: async (p) => { const b = await tryGet(U.booking, `/api/internal/bookings/${p.bookingId}`, null); return b ? (b.refund ?? b.total ?? 0) : 0 },
    summarize: (p, amt) => `Refund booking #${p.bookingId} — ₹${amt}`,
    execute: async (p) => { await internalPost(U.booking, `/api/internal/bookings/${p.bookingId}/refund`, {}); return { ok: true } },
  },
  'worker.pay_change': {
    label: 'Worker pay change',
    perm: 'workers.pay_edit',
    // Threshold on the fixed salary being set; a commission/plan/wallet-only change has amount 0
    // (so it needs approval only when the threshold is 0 = "approve all pay changes").
    amountOf: (p) => (Number(p.body?.salaryBasic) || 0) + (Number(p.body?.salaryAttendance) || 0) + (Number(p.body?.salaryAllowance) || 0),
    summarize: (p, amt) => `Change pay for worker #${p.workerId}${amt ? ` — salary ₹${amt}/mo` : ''}`,
    execute: (p) => internalPost(U.worker, `/internal/workers/${p.workerId}/pay`, { ...(p.body || {}), _actor: p.actor }),
  },
}
const ACTION_KEYS = Object.keys(ACTIONS)
const DEFAULT_REVIEWER_PERM = 'approvals.review'

async function ruleFor(action) {
  const r = (await pool.query('SELECT * FROM approval_rules WHERE action=$1', [action])).rows[0]
  return r || { action, enabled: false, threshold: 0, reviewer_perm: DEFAULT_REVIEWER_PERM, min_approvers: 1 }
}
const reviewerPermOf = (rule) => rule.reviewer_perm || DEFAULT_REVIEWER_PERM
const holdsPerm = (a, perm) => a?.role === 'super' || (a?.permissions || []).includes(perm)
const requestDto = (r, rule) => ({
  id: r.id, action: r.action, label: ACTIONS[r.action]?.label || r.action, summary: r.summary,
  amount: r.amount, status: r.status, requestedBy: r.requested_by, requestedById: r.requested_by_id,
  approvals: r.approvals || [], minApprovers: rule ? rule.min_approvers : 1, reviewerPerm: rule ? reviewerPermOf(rule) : DEFAULT_REVIEWER_PERM,
  decidedBy: r.decided_by, decidedAt: r.decided_at, reason: r.reason, error: r.error, created: r.created,
})

/** Run an approvable action: execute now, or queue for sign-off. Responds directly. */
async function submitAction(action, params, req, res) {
  const spec = ACTIONS[action]
  if (!spec) return res.status(400).json({ error: `Unknown action ${action}` })
  if (spec.perm && !holdsPerm(req.admin, spec.perm)) return res.status(403).json({ error: 'Insufficient permissions' })
  const amount = Math.round(Number(await spec.amountOf(params)) || 0)
  const rule = await ruleFor(action)
  const who = req.admin?.name || req.admin?.email || 'Admin'
  if (!(rule.enabled && amount >= (rule.threshold || 0))) {
    try {
      const result = await spec.execute(params)
      await logAudit(req.admin.email, action, spec.summarize(params, amount))
      return res.json({ ok: true, executed: true, result })
    } catch (e) { return res.status(e.status || 502).json({ error: e.error || e.message || 'Action failed' }) }
  }
  const summary = spec.summarize(params, amount)
  const r = (await pool.query(
    `INSERT INTO approval_requests (action, summary, params, amount, requested_by, requested_by_id)
     VALUES ($1,$2,$3::jsonb,$4,$5,$6) RETURNING *`,
    [action, summary, JSON.stringify(params), amount, who, req.admin.id])).rows[0]
  await logAudit(req.admin.email, 'approval.request', summary)
  publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'approval.request', entityType: 'approval', entityId: r.id, detail: `Requested approval: ${summary}` })
  return res.status(202).json({ ok: true, pending: true, request: requestDto(r, rule) })
}

// The matrix: every approvable action + its current rule.
app.get('/api/admin/approval-rules', admin, requirePerm('approvals.manage'), async (_q, res) => {
  const out = []
  for (const a of ACTION_KEYS) {
    const rule = await ruleFor(a)
    out.push({ action: a, label: ACTIONS[a].label, enabled: !!rule.enabled, threshold: rule.threshold || 0, reviewerPerm: reviewerPermOf(rule), minApprovers: rule.min_approvers || 1 })
  }
  res.json({ ok: true, actions: out, reviewerPerms: ['approvals.review', 'admins.edit', 'settings.edit'] })
})
app.patch('/api/admin/approval-rules/:action', admin, requirePerm('approvals.manage'), async (req, res) => {
  const action = req.params.action
  if (!ACTIONS[action]) return res.status(404).json({ error: 'Unknown action' })
  const b = req.body || {}
  const enabled = !!b.enabled
  const threshold = Math.max(0, Math.round(Number(b.threshold) || 0))
  const minApprovers = Math.max(1, Math.min(5, Math.round(Number(b.minApprovers) || 1)))
  const reviewerPerm = String(b.reviewerPerm || DEFAULT_REVIEWER_PERM)
  await pool.query(
    `INSERT INTO approval_rules (action, enabled, threshold, reviewer_perm, min_approvers, updated_by, updated)
     VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (action) DO UPDATE SET enabled=$2, threshold=$3, reviewer_perm=$4, min_approvers=$5, updated_by=$6, updated=now()`,
    [action, enabled, threshold, reviewerPerm, minApprovers, req.admin.email])
  await logAudit(req.admin.email, 'approval.rule', `${action} ${enabled ? `on ≥₹${threshold}, ${minApprovers} approver(s)` : 'off'}`)
  res.json({ ok: true })
})

// The inbox — pending first, or full history with ?status=all.
app.get('/api/admin/approvals', admin, requirePerm('approvals.review'), async (req, res) => {
  const rows = String(req.query.status) === 'all'
    ? (await pool.query(`SELECT * FROM approval_requests ORDER BY (status='pending') DESC, id DESC LIMIT 100`)).rows
    : (await pool.query(`SELECT * FROM approval_requests WHERE status='pending' ORDER BY id DESC LIMIT 100`)).rows
  const out = []
  for (const r of rows) out.push(requestDto(r, await ruleFor(r.action)))
  res.json({ ok: true, requests: out, meId: req.admin.id })
})
app.post('/api/admin/approvals/:id/approve', admin, requirePerm('approvals.review'), async (req, res) => {
  const r = (await pool.query('SELECT * FROM approval_requests WHERE id=$1', [Number(req.params.id)])).rows[0]
  if (!r) return res.status(404).json({ error: 'Request not found' })
  if (r.status !== 'pending') return res.status(409).json({ error: `Already ${r.status}` })
  if (r.requested_by_id === req.admin.id) return res.status(403).json({ error: 'You cannot approve your own request' })
  const spec = ACTIONS[r.action]; const rule = await ruleFor(r.action)
  if (!holdsPerm(req.admin, reviewerPermOf(rule))) return res.status(403).json({ error: 'You are not an approver for this action' })
  const approvals = Array.isArray(r.approvals) ? r.approvals : []
  if (approvals.some((a) => a.byId === req.admin.id)) return res.status(409).json({ error: 'You already approved this' })
  approvals.push({ by: req.admin.name || req.admin.email, byId: req.admin.id, at: nowIso() })
  const who = req.admin.name || req.admin.email
  if (approvals.length < (rule.min_approvers || 1)) { // needs more sign-offs
    await pool.query('UPDATE approval_requests SET approvals=$1::jsonb WHERE id=$2', [JSON.stringify(approvals), r.id])
    return res.json({ ok: true, request: requestDto({ ...r, approvals }, rule) })
  }
  try {
    const result = await spec.execute(r.params)
    await pool.query("UPDATE approval_requests SET status='executed', approvals=$1::jsonb, decided_by=$2, decided_at=now(), result=$3::jsonb WHERE id=$4",
      [JSON.stringify(approvals), who, JSON.stringify(result || {}), r.id])
    await logAudit(req.admin.email, 'approval.execute', r.summary)
    publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'approval.approve', entityType: 'approval', entityId: r.id, detail: `Approved & executed: ${r.summary}` })
    res.json({ ok: true, request: requestDto((await pool.query('SELECT * FROM approval_requests WHERE id=$1', [r.id])).rows[0], rule) })
  } catch (e) {
    await pool.query("UPDATE approval_requests SET status='failed', approvals=$1::jsonb, decided_by=$2, decided_at=now(), error=$3 WHERE id=$4",
      [JSON.stringify(approvals), who, String(e.error || e.message || 'failed'), r.id])
    res.status(502).json({ error: `Approved, but execution failed: ${e.error || e.message}` })
  }
})
app.post('/api/admin/approvals/:id/reject', admin, requirePerm('approvals.review'), async (req, res) => {
  const r = (await pool.query('SELECT * FROM approval_requests WHERE id=$1', [Number(req.params.id)])).rows[0]
  if (!r) return res.status(404).json({ error: 'Request not found' })
  if (r.status !== 'pending') return res.status(409).json({ error: `Already ${r.status}` })
  if (r.requested_by_id === req.admin.id) return res.status(403).json({ error: 'You cannot reject your own request' })
  const rule = await ruleFor(r.action)
  if (!holdsPerm(req.admin, reviewerPermOf(rule))) return res.status(403).json({ error: 'You are not an approver for this action' })
  await pool.query("UPDATE approval_requests SET status='rejected', decided_by=$1, decided_at=now(), reason=$2 WHERE id=$3",
    [req.admin.name || req.admin.email, String(req.body?.reason || ''), r.id])
  await logAudit(req.admin.email, 'approval.reject', r.summary)
  res.json({ ok: true })
})

// Refund entry point routed through the matrix (frontend calls this instead of the payment route).
app.post('/api/admin/actions/refund', admin, async (req, res) =>
  submitAction('refund.issue', { bookingId: Number(req.body?.bookingId) }, req, res))
// Worker pay change routed through the matrix (the worker service's PATCH /pay forwards here).
app.post('/api/admin/actions/worker-pay', admin, async (req, res) =>
  submitAction('worker.pay_change', { workerId: Number(req.body?.workerId), body: req.body?.body || {}, actor: req.admin?.name || req.admin?.email }, req, res))

/* ================= BFF aggregation (reads other services over internal HTTP) ================= */
// Live Ops control tower: real-time per-zone supply (workers) vs demand (open+active jobs).
app.get('/api/admin/live-ops', admin, async (req, res) => {
  const ACTIVE = ['worker_assigned', 'on_the_way', 'arrived', 'in_progress']
  const [zonesAll, wres, opsAll] = await Promise.all([
    tryGet(U.catalog, '/api/internal/zones', []),
    tryGet(U.worker, '/internal/workers', { workers: [] }),
    tryGet(U.booking, '/api/internal/ops', []),
  ])
  // Data scope: a City/Zone-scoped admin only sees their own zones' supply and demand. Filtering the
  // three source arrays up front means every count below (zoneRows, totals, unzoned) is scoped too.
  const scope = req.admin?.scope
  const zones = (zonesAll || []).filter((z) => inScope(scope, { zoneId: z.id, city: z.city }))
  const ops = (opsAll || []).filter((b) => inScope(scope, { zoneId: b.zone_id }))
  const workers = (wres.workers || []).filter((w) => inScope(scope, { zoneId: w.zone_id, city: w.city }))
  const zoneRows = (zones || []).map((z) => {
    const zw = workers.filter((w) => w.zone_id === z.id)
    const online = zw.filter((w) => w.status === 'active' && w.available).length
    const zb = (ops || []).filter((b) => b.zone_id === z.id)
    const open = zb.filter((b) => b.status === 'confirmed' && !b.worker_id).length
    const active = zb.filter((b) => ACTIVE.includes(b.status)).length
    const demand = open + active
    const health = z.status !== 'live' ? 'off'
      : demand === 0 ? 'idle'
      : online === 0 ? 'critical'
      : demand > online ? 'short' : 'healthy'
    return {
      id: z.id, name: z.name, state: z.state, city: z.city, status: z.status, pincodeCount: z.pincodeCount,
      supply: { assigned: zw.length, active: zw.filter((w) => w.status === 'active').length, online, onShift: zw.filter((w) => w.on_shift).length },
      demand: { open, active, total: demand }, health,
    }
  })
  const totals = {
    openJobs: (ops || []).filter((b) => b.status === 'confirmed' && !b.worker_id).length,
    activeJobs: (ops || []).filter((b) => ACTIVE.includes(b.status)).length,
    onlineWorkers: workers.filter((w) => w.status === 'active' && w.available).length,
    activeWorkers: workers.filter((w) => w.status === 'active').length,
    zonesLive: (zones || []).filter((z) => z.status === 'live').length,
    zonesTotal: (zones || []).length,
  }
  const unzoned = {
    open: (ops || []).filter((b) => !b.zone_id && b.status === 'confirmed' && !b.worker_id).length,
    active: (ops || []).filter((b) => !b.zone_id && ACTIVE.includes(b.status)).length,
  }
  res.json({ zones: zoneRows, unzoned, totals })
})

app.get('/api/admin/dashboard', admin, async (req, res) => {
  const [customersAll, bookingsAll, workersResp] = await Promise.all([
    tryGet(U.auth, '/api/internal/customers', []),
    tryGet(U.booking, '/api/internal/bookings', []),
    tryGet(U.worker, '/internal/workers', { stats: {}, workers: [] }),
  ])
  // Data scope: filter every source array up front, so every metric below is scoped. Worker stats
  // are recomputed from the filtered list (the internal /workers stats are global, unscoped).
  const scope = req.admin?.scope
  const customers = customersAll.filter((c) => inScope(scope, { city: c.city }))
  const bookings = bookingsAll.filter((b) => inScope(scope, { zoneId: b.zone_id }))
  const wList = (workersResp.workers || []).filter((w) => inScope(scope, { zoneId: w.zone_id, city: w.city }))
  const wCount = (...s) => wList.filter((w) => s.includes(w.status)).length
  const workers = { stats: { total: wList.length, active: wCount('active'), pending: wCount('pending', 'onboarding'), inactive: wCount('inactive', 'suspended') } }
  const ACTIVE = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']
  const isPaid = (b) => b.payment_status === 'paid' || b.status === 'completed'
  const revenue = bookings.filter(isPaid).reduce((s, b) => s + (b.total || 0), 0)
  const rated = customers.filter((c) => c.rating > 0)
  const avgRating = rated.length ? +(rated.reduce((a, c) => a + c.rating, 0) / rated.length).toFixed(1) : 0
  const nameById = new Map(customers.map((c) => [c.id, c.name]))
  const dayOf = (d) => String(d || '').slice(0, 10)

  // 7-day trend (oldest → newest) for the line/bar charts
  const trend = []
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i)
    const key = dt.toISOString().slice(0, 10)
    const day = bookings.filter((b) => dayOf(b.created) === key)
    trend.push({
      day: key,
      total: day.length,
      completed: day.filter((b) => b.status === 'completed').length,
      revenue: day.filter(isPaid).reduce((s, b) => s + (b.total || 0), 0),
    })
  }

  // bookings grouped by city (from the address tail)
  const cityCount = {}
  for (const b of bookings) { const c = (b.address || '').split(',').pop().trim() || 'Unknown'; cityCount[c] = (cityCount[c] || 0) + 1 }
  const cityRows = Object.entries(cityCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([city, n]) => ({ city, n }))

  // most-booked services (by line-item name)
  const svcCount = {}
  for (const b of bookings) for (const it of (b.items || [])) { const nm = it.name || 'Service'; svcCount[nm] = (svcCount[nm] || 0) + 1 }
  const topServices = Object.entries(svcCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, n]) => ({ name, n }))

  const recent = [...bookings]
    .sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 8)
    .map((b) => ({ id: b.id, ref: b.ref, customer: nameById.get(b.user_id) || 'Customer', total: b.total || 0, status: b.status, created: b.created, service: (b.items || []).map((i) => i.name).join(', ') }))

  const registrations = customers.slice(0, 8).map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, city: c.city, created: c.created }))

  res.json({
    stats: {
      totalBookings: bookings.length,
      completed: bookings.filter((b) => b.status === 'completed').length,
      active: bookings.filter((b) => ACTIVE.includes(b.status)).length,
      cancelled: bookings.filter((b) => b.status === 'cancelled').length,
      revenue,
      customers: customers.length,
      avgRating,
      workers: {
        total: workers.stats?.total || 0,
        active: workers.stats?.active || 0,
        pending: workers.stats?.pending || 0,
        inactive: workers.stats?.inactive || 0,
      },
    },
    trend, cityRows, topServices, recent, registrations,
  })
})

app.get('/api/admin/analytics', admin, async (req, res) => {
  const bookingsAll = await tryGet(U.booking, '/api/internal/bookings', [])
  const bookings = bookingsAll.filter((b) => inScope(req.admin?.scope, { zoneId: b.zone_id })) // data scope
  const revenue = bookings.filter((b) => b.payment_status === 'paid' || b.status === 'completed').reduce((s, b) => s + (b.total || 0), 0)
  const byDay = {}
  for (const b of bookings) { const d = String(b.created).slice(0, 10); byDay[d] = (byDay[d] || 0) + 1 }
  res.json({ totalRevenue: revenue, totalBookings: bookings.length, byDay })
})

// Reports screen (fetchInsights). Builds the full analytics contract the frontend expects;
// every field is a safe default so the screen renders cleanly even with zero data.
app.get('/api/admin/insights', admin, async (req, res) => {
  const [bookingsAll, customersAll, wResp] = await Promise.all([
    tryGet(U.booking, '/api/internal/bookings', []),
    tryGet(U.auth, '/api/internal/customers', []),
    tryGet(U.worker, '/internal/workers', { stats: {}, workers: [] }),
  ])
  // Data scope: filter every source array up front so all insights below are scoped.
  const scope = req.admin?.scope
  const bookings = bookingsAll.filter((b) => inScope(scope, { zoneId: b.zone_id }))
  const customers = customersAll.filter((c) => inScope(scope, { city: c.city }))
  const workers = (wResp.workers || []).filter((w) => inScope(scope, { zoneId: w.zone_id, city: w.city }))
  const isPaid = (b) => b.payment_status === 'paid' || b.status === 'completed'
  const paid = bookings.filter(isPaid)
  const revenue = paid.reduce((s, b) => s + (b.total || 0), 0)
  const totalBk = bookings.length
  const completed = bookings.filter((b) => b.status === 'completed').length
  const cancelled = bookings.filter((b) => b.status === 'cancelled').length
  const noShow = bookings.filter((b) => b.status === 'no_show').length
  const cancellationRate = totalBk ? Math.round((cancelled / totalBk) * 100) : 0
  const noShowRate = totalBk ? Math.round((noShow / totalBk) * 100) : 0
  const aov = paid.length ? Math.round(revenue / paid.length) : 0
  const bkByUser = {}
  for (const b of bookings) bkByUser[b.user_id] = (bkByUser[b.user_id] || 0) + 1
  const returning = Object.values(bkByUser).filter((n) => n > 1).length
  const newC = Object.values(bkByUser).filter((n) => n === 1).length
  const repeatRate = customers.length ? Math.round((returning / customers.length) * 100) : 0
  const clv = customers.length ? Math.round(revenue / customers.length) : 0
  const dayOf = (d) => String(d || '').slice(0, 10)
  const perItemRev = (b) => isPaid(b) ? (b.total || 0) / Math.max(1, (b.items || []).length) : 0

  const series = [], growth = []
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i)
    const key = dt.toISOString().slice(0, 10)
    const day = bookings.filter((b) => dayOf(b.created) === key)
    series.push({ date: key, revenue: day.filter(isPaid).reduce((s, b) => s + (b.total || 0), 0), bookings: day.length, completed: day.filter((b) => b.status === 'completed').length, cancelled: day.filter((b) => b.status === 'cancelled').length })
    growth.push({ date: key, n: customers.filter((c) => dayOf(c.created) === key).length })
  }

  const statusCount = {}
  for (const b of bookings) statusCount[b.status] = (statusCount[b.status] || 0) + 1
  const statusSplit = Object.entries(statusCount).map(([status, n]) => ({ status, n }))

  const svc = {}
  for (const b of bookings) for (const it of (b.items || [])) {
    const nm = it.name || 'Service'
    const s = svc[nm] || (svc[nm] = { service: nm, revenue: 0, bookings: 0, completed: 0, cancellations: 0, rs: 0, rc: 0 })
    s.bookings += 1; s.revenue += perItemRev(b)
    if (b.status === 'completed') s.completed += 1
    if (b.status === 'cancelled') s.cancellations += 1
    if (b.rating) { s.rs += b.rating; s.rc += 1 }
  }
  const topServices = Object.values(svc).map((s) => ({ service: s.service, revenue: Math.round(s.revenue), bookings: s.bookings, completed: s.completed, cancellations: s.cancellations, cancelRate: s.bookings ? Math.round((s.cancellations / s.bookings) * 100) : 0, rating: s.rc ? +(s.rs / s.rc).toFixed(1) : 0 })).sort((a, b) => b.revenue - a.revenue)
  const revenueByService = topServices.slice(0, 8).map((s) => ({ label: s.service, value: s.revenue }))

  const payBk = {}, payRev = {}
  for (const b of bookings) { const m = b.payment || 'other'; payBk[m] = (payBk[m] || 0) + 1; if (isPaid(b)) payRev[m] = (payRev[m] || 0) + (b.total || 0) }
  const bookingsByPayment = Object.entries(payBk).map(([label, value]) => ({ label, value }))
  const revenueByPayment = Object.entries(payRev).map(([label, value]) => ({ label, value: Math.round(value) }))

  const cityRev = {}, cityBk = {}
  for (const b of bookings) { const c = (b.address || '').split(',').pop().trim() || 'Unknown'; cityBk[c] = (cityBk[c] || 0) + 1; if (isPaid(b)) cityRev[c] = (cityRev[c] || 0) + (b.total || 0) }
  const topCitiesByRevenue = Object.entries(cityRev).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 6)
  const topCitiesByBookings = Object.entries(cityBk).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6)

  const newVsReturning = [{ label: 'New', value: newC }, { label: 'Returning', value: returning }]

  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0))
  for (const b of bookings) { const dt = new Date(b.created); if (!Number.isNaN(dt.getTime())) heatmap[dt.getDay()][dt.getHours()] += 1 }

  const insights = []
  if (topServices[0]) insights.push({ title: `${topServices[0].service} leads revenue`, sub: `₹${topServices[0].revenue} from ${topServices[0].bookings} bookings` })
  if (topCitiesByBookings[0]) insights.push({ title: `${topCitiesByBookings[0].label} is the top city`, sub: `${topCitiesByBookings[0].value} bookings` })
  insights.push({ title: `${cancellationRate}% cancellation rate`, sub: `${cancelled} of ${totalBk} bookings cancelled` })
  insights.push({ title: `₹${aov} average order value`, sub: `across ${paid.length} paid bookings` })
  if (repeatRate) insights.push({ title: `${repeatRate}% repeat customers`, sub: `${returning} booked more than once` })

  res.json({
    totals: { revenue, bookings: totalBk, completed, cancelled, cancellationRate, activeCustomers: customers.length, activeWorkers: workers.filter((w) => w.status === 'active').length, aov, repeatRate, clv, noShowRate },
    deltas: { revenue: null, bookings: null, completed: null, newCustomers: null, cancelRate: null },
    statusSplit, series, growth, revenueByService, topServices,
    bookingsByPayment, revenueByPayment, topCitiesByRevenue, topCitiesByBookings,
    newVsReturning, heatmap, insights,
  })
})

app.get('/api/admin/alerts', admin, async (_q, res) => {
  const workers = await tryGet(U.worker, '/internal/workers', { workers: [] })
  const pending = (workers.workers || []).filter((w) => w.status === 'pending')
  res.json([...pending.map((w) => ({ type: 'worker_pending', message: `${w.name} awaiting verification`, id: w.id }))])
})

/* ---------- customers (proxied to the auth service) ---------- */
app.get('/api/admin/customers', admin, async (req, res) => {
  const [customersAll, bookings] = await Promise.all([
    tryGet(U.auth, '/api/internal/customers', []),
    tryGet(U.booking, '/api/internal/bookings', []),
  ])
  // Customers are only city-tagged (no zone), so a scoped admin sees them by city (the coarse key).
  const customers = customersAll.filter((c) => inScope(req.admin?.scope, { city: c.city }))
  const cnt = {}, spend = {}
  for (const b of bookings) {
    cnt[b.user_id] = (cnt[b.user_id] || 0) + 1
    if (b.payment_status === 'paid' || b.status === 'completed') spend[b.user_id] = (spend[b.user_id] || 0) + (b.total || 0)
  }
  // Customers screen reads bookings/spend/joined per row (auth returns `created`, not `joined`).
  res.json(customers.map((c) => ({ ...c, bookings: cnt[c.id] || 0, spend: spend[c.id] || 0, joined: c.created })))
})
// Customer detail (View modal): { customer, addresses, bookings, transactions }.
app.get('/api/admin/customers/:id', admin, async (req, res) => {
  const id = Number(req.params.id)
  const [u, addresses, allBookings, transactions] = await Promise.all([
    tryGet(U.auth, `/api/internal/users/${id}`, null),
    tryGet(U.auth, `/api/internal/users/${id}/addresses`, []),
    tryGet(U.booking, '/api/internal/bookings', []),
    tryGet(U.auth, `/api/internal/users/${id}/transactions`, []),
  ])
  const customer = u?.user || null
  if (!customer) return res.status(404).json({ error: 'Not found' })
  // Data scope: a scoped admin can't open an out-of-scope customer by id. 404 (not 403) so they
  // can't probe which ids exist outside their scope.
  if (!inScope(req.admin?.scope, { city: customer.city })) return res.status(404).json({ error: 'Not found' })
  const bookings = allBookings.filter((b) => b.user_id === id)
    .map((b) => ({ id: b.id, ref: b.ref, service: (b.items || []).map((i) => i.name).join(', '), total: b.total, status: b.status, created: b.created }))
  res.json({ customer, addresses, bookings, transactions })
})
app.patch('/api/admin/customers/:id', admin, async (req, res) => {
  try { res.json(await internalPatch(U.auth, `/api/internal/users/${req.params.id}`, req.body || {})) } catch (e) { res.status(500).json({ error: e.message }) }
})
// Admin wallet adjustment — credit/debit any balance (cash/promo/points), bypasses wallet status.
// Routed through the approval matrix: executes immediately unless a rule requires sign-off, and now
// requires customers.edit (was ungated). Amount is signed (+credit / -debit).
app.post('/api/admin/customers/:id/wallet', admin, async (req, res) => {
  const amt = Number(req.body?.amount) || 0
  const balance = ['cash', 'promo', 'points'].includes(req.body?.balance) ? req.body.balance : 'cash'
  const title = req.body?.title || req.body?.note || (amt >= 0 ? 'Admin credit' : 'Admin debit')
  return submitAction('customer.wallet_adjust', { userId: Number(req.params.id), amount: amt, balance, title }, req, res)
})
// Admin sets wallet status: active / frozen / blocked / inactive.
app.post('/api/admin/customers/:id/wallet/status', admin, async (req, res) => {
  try { res.json(await internalPost(U.auth, `/api/internal/users/${req.params.id}/wallet-status`, { status: req.body?.status })) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

/* ---------- internal: config for other services ---------- */
app.get('/internal/settings', internalOnly, async (_q, res) => res.json(await getSettings()))
// Some services log admin-side audit entries through the admin service.
app.post('/internal/audit', internalOnly, async (req, res) => {
  const b = req.body || {}
  await logAudit(b.admin || 'system', b.action || 'action', b.target || null)
  res.json({ ok: true })
})

init()
  .then(() => app.listen(PORT, () => console.log(`[admin] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[admin] failed to start:', e.message); process.exit(1) });
