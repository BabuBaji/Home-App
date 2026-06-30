// Unified activity log — one append-only row per significant action across the
// customer app, worker app and admin panel. This is the system of record the admin
// uses to MONITOR everything that happens (state tables only keep the latest value;
// this keeps the full who-did-what-when timeline). logActivity never throws into a
// request flow — monitoring must never break a real action.
import { db } from './db.js'
import { _setActivityHook } from './admin-db.js'

db.exec(`
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_type TEXT NOT NULL,            -- customer | worker | admin | system
    actor_id   INTEGER,
    actor_name TEXT,
    action     TEXT NOT NULL,            -- dot.namespaced e.g. booking.create, job.accept
    entity_type TEXT,                    -- booking | worker | customer | payment | ticket | wallet | service
    entity_id  TEXT,
    ref        TEXT,                     -- human ref (booking ref, etc.)
    detail     TEXT,                     -- short human summary
    meta       TEXT,                     -- JSON blob of extra fields
    created    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activity_id      ON activity_log(id DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_entity  ON activity_log(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_activity_actor   ON activity_log(actor_type, actor_id);
  CREATE INDEX IF NOT EXISTS idx_activity_action  ON activity_log(action);
`)

const insert = db.prepare(`INSERT INTO activity_log
  (actor_type,actor_id,actor_name,action,entity_type,entity_id,ref,detail,meta,created)
  VALUES (@actor_type,@actor_id,@actor_name,@action,@entity_type,@entity_id,@ref,@detail,@meta,@created)`)

const safeParse = (s) => { try { return JSON.parse(s) } catch { return null } }

/** Record one activity event. Resilient: any failure is swallowed. */
export function logActivity(evt = {}) {
  try {
    insert.run({
      actor_type: evt.actorType || 'system',
      actor_id: evt.actorId != null ? Number(evt.actorId) : null,
      actor_name: evt.actorName || null,
      action: evt.action || 'event',
      entity_type: evt.entityType || null,
      entity_id: evt.entityId != null ? String(evt.entityId) : null,
      ref: evt.ref || null,
      detail: evt.detail || null,
      meta: evt.meta != null ? JSON.stringify(evt.meta) : null,
      created: new Date().toISOString(),
    })
  } catch { /* never break the caller */ }
}

/** Admin feed with filters + pagination. Returns { total, items }. */
export function listActivity({ actorType, action, entityType, entityId, q, since, limit = 100, offset = 0 } = {}) {
  let rows = db.prepare('SELECT * FROM activity_log ORDER BY id DESC').all()
  if (actorType && actorType !== 'all') rows = rows.filter((r) => r.actor_type === actorType)
  if (action && action !== 'all') rows = rows.filter((r) => r.action === action || r.action.startsWith(action))
  if (entityType && entityType !== 'all') rows = rows.filter((r) => r.entity_type === entityType)
  if (entityId != null && entityId !== '') rows = rows.filter((r) => String(r.entity_id) === String(entityId))
  if (since) rows = rows.filter((r) => r.created >= since)
  if (q) {
    const s = String(q).toLowerCase()
    rows = rows.filter((r) =>
      (r.actor_name || '').toLowerCase().includes(s) || (r.detail || '').toLowerCase().includes(s) ||
      (r.ref || '').toLowerCase().includes(s) || (r.action || '').toLowerCase().includes(s))
  }
  const total = rows.length
  const items = rows.slice(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 100))
    .map((r) => ({ ...r, meta: r.meta ? safeParse(r.meta) : null }))
  return { total, items }
}

/** Full chronological timeline for one booking (oldest first). */
export function bookingTimeline(bookingId) {
  return db.prepare("SELECT * FROM activity_log WHERE entity_type='booking' AND entity_id=? ORDER BY id ASC")
    .all(String(bookingId)).map((r) => ({ ...r, meta: r.meta ? safeParse(r.meta) : null }))
}

// Route admin audit-log writes into this unified feed (set after both modules load).
_setActivityHook(logActivity)

/** Rollup counts for the dashboard: events per actor_type + per action (last `sinceDays`). */
export function activityStats(sinceDays = 7) {
  const since = new Date(Date.now() - sinceDays * 864e5).toISOString()
  const byActor = db.prepare("SELECT actor_type, COUNT(*) n FROM activity_log WHERE created>=? GROUP BY actor_type").all(since)
  const byAction = db.prepare("SELECT action, COUNT(*) n FROM activity_log WHERE created>=? GROUP BY action ORDER BY n DESC LIMIT 12").all(since)
  const total = db.prepare('SELECT COUNT(*) n FROM activity_log').get().n
  return { total, since, byActor, byAction }
}
