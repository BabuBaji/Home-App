// HomeHelp Notification Service
// -----------------------------
// The cross-cutting comms + audit service on its own Postgres. It owns:
//   activity_log  – unified who-did-what-when feed, fed by the Redis event bus
//   tickets       – customer support tickets (+ admin replies)
//   complaints    – admin complaints board
//   broadcasts    – admin announcements / push
// It CONSUMES every service's `activity` / `customer.login` / `admin.action` events and records
// them, so the admin Activity Monitor and booking timeline work without any service calling it.
import express from 'express'
import {
  makePool, migrate, nowIso, makeAdminAuth, requirePerm, internalOnly, subscribeEvents, tryGet, publishEvent, sendPush, inScope, internalPost,
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
async function statsActivity(days) {
  const since = new Date(Date.now() - (Number(days) || 7) * 864e5).toISOString()
  const byActor = (await pool.query('SELECT actor_type, COUNT(*)::int n FROM activity_log WHERE created>=$1 GROUP BY actor_type', [since])).rows
  const byAction = (await pool.query('SELECT action, COUNT(*)::int n FROM activity_log WHERE created>=$1 GROUP BY action ORDER BY n DESC LIMIT 12', [since])).rows
  const total = (await pool.query('SELECT COUNT(*)::int n FROM activity_log')).rows[0].n
  return { total, since, byActor, byAction }
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'notification', ok: true }))

/* ---------- activity (admin monitor) ---------- */
const listRoute = async (req, res) => { try { res.json(await listActivity(req.query)) } catch (e) { res.status(500).json({ error: e.message }) } }
const statsRoute = async (req, res) => { try { res.json(await statsActivity(req.query.days)) } catch (e) { res.status(500).json({ error: e.message }) } }
app.get('/api/admin/activity', adminAuth, listRoute)
app.get('/api/admin/activity/stats', adminAuth, statsRoute)
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
  const { rows } = await pool.query(
    `INSERT INTO tickets (user_id,category,subject,message,status,ref,priority,escalated,booking_id,booking_ref)
     VALUES ($1,'Safety','SOS during service',$2,'Open',$3,'urgent',true,$4,$5) RETURNING *`,
    [Number(b.userId), b.message || 'SOS', ref, b.bookingId || null, b.bookingRef || null])
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
  const bz = new Map((bookings || []).map((b) => [b.id, b.zone_id]))
  const wz = new Map((wres.workers || []).map((w) => [w.id, w]))
  const cc = new Map((customers || []).map((c) => [c.id, c.city]))
  return rows.filter((t) => {
    if (t.booking_id && bz.has(t.booking_id)) return inScope(scope, { zoneId: bz.get(t.booking_id) })
    if (t.requester === 'worker') { const w = wz.get(t.worker_id); return !!w && inScope(scope, { zoneId: w.zone_id, city: w.city }) }
    return inScope({ ...scope, zoneIds: [] }, { city: cc.get(t.user_id) || null })
  })
}
app.get('/api/admin/tickets', adminAuth, async (req, res) => {
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
app.get('/api/admin/tickets/booking/:bookingId', adminAuth, async (req, res) => {
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
app.get('/api/admin/tickets/:id', adminAuth, async (req, res) => {
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
app.get('/api/admin/complaints', adminAuth, async (req, res) => {
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

app.get('/api/admin/notifications', adminAuth, async (_q, res) => res.json((await pool.query('SELECT * FROM broadcasts ORDER BY id DESC')).rows))
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
  .catch((e) => { console.error('[notification] failed to start:', e.message); process.exit(1) });
