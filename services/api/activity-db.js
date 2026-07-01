// Activity/Notifications is now its OWN microservice (services/activity) with its own
// Postgres DB. This module is a thin HTTP client to it, so all existing call sites keep
// working unchanged: writes are fire-and-forget (monitoring must never block or break a
// real request), reads are awaited. The monolith uses the service's /internal endpoints
// (shared key) so it doesn't have to forward a user token.
import { _setActivityHook } from './admin-db.js'

const ACTIVITY_URL = (process.env.ACTIVITY_URL || 'http://localhost:4003').replace(/\/$/, '')
const INTERNAL_KEY = process.env.INTERNAL_KEY || 'hh-internal-dev'
const HDRS = { 'Content-Type': 'application/json', 'x-internal-key': INTERNAL_KEY }

/** Record one activity event — fire-and-forget; never throws into the request flow. */
export function logActivity(evt = {}) {
  fetch(`${ACTIVITY_URL}/internal/events`, { method: 'POST', headers: HDRS, body: JSON.stringify(evt) })
    .catch(() => { /* monitoring must never break the caller */ })
}

/** Admin feed with filters + pagination → { total, items }. */
export async function listActivity(params = {}) {
  try {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString()
    const r = await fetch(`${ACTIVITY_URL}/internal/list${qs ? '?' + qs : ''}`, { headers: HDRS })
    return r.ok ? r.json() : { total: 0, items: [] }
  } catch { return { total: 0, items: [] } }
}

/** Rollup counts for the dashboard. */
export async function activityStats(sinceDays = 7) {
  try {
    const r = await fetch(`${ACTIVITY_URL}/internal/stats?days=${Number(sinceDays) || 7}`, { headers: HDRS })
    return r.ok ? r.json() : { total: 0, since: null, byActor: [], byAction: [] }
  } catch { return { total: 0, since: null, byActor: [], byAction: [] } }
}

/** Full chronological timeline for one booking (oldest first). */
export async function bookingTimeline(bookingId) {
  try {
    const r = await fetch(`${ACTIVITY_URL}/internal/timeline/${encodeURIComponent(String(bookingId))}`, { headers: HDRS })
    return r.ok ? r.json() : []
  } catch { return [] }
}

// Route admin audit-log writes into the unified activity feed (mirrors admin actions).
_setActivityHook(logActivity)
