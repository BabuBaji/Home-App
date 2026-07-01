// HomeHelp Activity / Notifications Service
// -----------------------------------------
// Owns the unified, append-only activity log on its OWN Postgres DB. Every other service
// (currently the monolith) reports events here via POST /internal/events (fire-and-forget),
// and the admin Activity Monitor reads from here. This is the cross-cutting "who-did-what-when"
// system of record — a natural first domain to peel out of the monolith.
import express from 'express'
import pg from 'pg'

const PORT = Number(process.env.PORT || 4003)
const MONOLITH_URL = (process.env.MONOLITH_URL || 'http://localhost:4000').replace(/\/$/, '')
const INTERNAL_KEY = process.env.INTERNAL_KEY || ''
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5434/activity'

const pool = new pg.Pool({ connectionString: DATABASE_URL })

async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS activity_log (
    id BIGSERIAL PRIMARY KEY,
    actor_type TEXT NOT NULL,
    actor_id BIGINT,
    actor_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    ref TEXT,
    detail TEXT,
    meta JSONB,
    created TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id)')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_log(actor_type, actor_id)')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action)')
  console.log('[activity] Postgres ready (activity_log)')
}

/* ---------- auth: admin reads delegated to the monolith; internal writes via shared key ---------- */
async function adminAuth(req, res, next) {
  try {
    const r = await fetch(`${MONOLITH_URL}/api/admin/me`, { headers: { authorization: req.headers.authorization || '' } })
    if (!r.ok) return res.status(401).json({ error: 'Not authenticated' })
    req.admin = (await r.json()).admin
    next()
  } catch { res.status(502).json({ error: 'Auth service unavailable' }) }
}
const internalOnly = (req, res, next) =>
  (!INTERNAL_KEY || req.headers['x-internal-key'] === INTERNAL_KEY) ? next() : res.status(403).json({ error: 'forbidden' })

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'activity', ok: true }))

/* ---------- ingest (fire-and-forget from any service) ---------- */
app.post('/internal/events', internalOnly, async (req, res) => {
  const e = req.body || {}
  try {
    await pool.query(
      `INSERT INTO activity_log (actor_type,actor_id,actor_name,action,entity_type,entity_id,ref,detail,meta,created)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb, COALESCE($10::timestamptz, now()))`,
      [e.actorType || 'system', e.actorId != null ? Number(e.actorId) : null, e.actorName || null,
       e.action || 'event', e.entityType || null, e.entityId != null ? String(e.entityId) : null,
       e.ref || null, e.detail || null, e.meta != null ? JSON.stringify(e.meta) : null, e.created || null],
    )
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/* ---------- reads (shared logic; exposed to the admin via gateway AND to the
   monolith via an internal key so it can proxy without forwarding a user token) ---------- */
async function listActivity(query) {
  const { actorType, action, entityType, entityId, q, since } = query
  const limit = Math.min(500, Number(query.limit) || 100)
  const offset = Number(query.offset) || 0
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
const listRoute = async (req, res) => { try { res.json(await listActivity(req.query)) } catch (e) { res.status(500).json({ error: e.message }) } }
const statsRoute = async (req, res) => { try { res.json(await statsActivity(req.query.days)) } catch (e) { res.status(500).json({ error: e.message }) } }

app.get('/api/admin/activity', adminAuth, listRoute)          // admin app via gateway
app.get('/api/admin/activity/stats', adminAuth, statsRoute)
app.get('/internal/list', internalOnly, listRoute)            // monolith proxy
app.get('/internal/stats', internalOnly, statsRoute)

// Booking timeline — served internally (the monolith's /bookings/:id/timeline route calls this).
app.get('/internal/timeline/:bookingId', internalOnly, async (req, res) => {
  const rows = (await pool.query("SELECT * FROM activity_log WHERE entity_type='booking' AND entity_id=$1 ORDER BY id ASC", [String(req.params.bookingId)])).rows
  res.json(rows)
})

init()
  .then(() => app.listen(PORT, () => console.log(`[activity] service on http://localhost:${PORT} (monolith: ${MONOLITH_URL})`)))
  .catch((e) => { console.error('[activity] failed to start:', e.message); process.exit(1) })
