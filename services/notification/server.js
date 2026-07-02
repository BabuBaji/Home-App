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
  makePool, migrate, nowIso, makeCustomerAuth, makeAdminAuth, internalOnly, subscribeEvents,
} from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4003)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5434/notification'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')

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
  const { rows } = await pool.query('INSERT INTO tickets (user_id,category,message,status,ref) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.user.id, req.body.category || 'General', req.body.message, 'Open', ref])
  await logEvent({ actorType: 'customer', actorId: req.user.id, actorName: req.user.name, action: 'support.ticket', entityType: 'ticket', entityId: rows[0].id, ref, detail: `Raised ticket: ${req.body.category || 'General'}` })
  res.status(201).json(rows[0])
})
app.get('/api/admin/tickets', adminAuth, async (_q, res) => res.json((await pool.query('SELECT * FROM tickets ORDER BY id DESC')).rows))
app.patch('/api/admin/tickets/:id', adminAuth, async (req, res) => {
  const b = req.body || {}
  const cur = (await pool.query('SELECT * FROM tickets WHERE id=$1', [Number(req.params.id)])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Not found' })
  await pool.query('UPDATE tickets SET status=$1, response=$2 WHERE id=$3', [b.status ?? cur.status, b.response ?? cur.response, cur.id])
  res.json((await pool.query('SELECT * FROM tickets WHERE id=$1', [cur.id])).rows[0])
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
app.get('/api/admin/notifications', adminAuth, async (_q, res) => res.json((await pool.query('SELECT * FROM broadcasts ORDER BY id DESC')).rows))
app.post('/api/admin/notifications/broadcast', adminAuth, async (req, res) => {
  const b = req.body || {}
  if (!b.title) return res.status(400).json({ error: 'Title required' })
  const { rows } = await pool.query('INSERT INTO broadcasts (type,title,body,audience,channel,sent,admin) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [b.type || 'announcement', b.title, b.body || null, b.audience || 'all', b.channel || 'in-app', 1, req.admin?.email || null])
  await logEvent({ actorType: 'admin', actorName: req.admin?.email, action: 'admin.broadcast', detail: `Broadcast: ${b.title}` })
  res.status(201).json(rows[0])
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
  .catch((e) => { console.error('[notification] failed to start:', e.message); process.exit(1) })
