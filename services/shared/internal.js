// Service-to-service HTTP helpers, guarded by a shared x-internal-key.
const INTERNAL_KEY = process.env.INTERNAL_KEY || ''

// Middleware: only allow calls carrying the internal key (when one is configured).
export function internalOnly(req, res, next) {
  if (!INTERNAL_KEY || req.headers['x-internal-key'] === INTERNAL_KEY) return next()
  res.status(403).json({ error: 'forbidden' })
}

export async function internalGet(baseUrl, path) {
  const r = await fetch(`${baseUrl}${path}`, { headers: { 'x-internal-key': INTERNAL_KEY } })
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`)
  return r.json()
}

export async function internalPost(baseUrl, path, body) {
  const r = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': INTERNAL_KEY },
    body: JSON.stringify(body || {}),
  })
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `POST ${path} → ${r.status}`) }
  return r.json()
}

export async function internalPatch(baseUrl, path, body) {
  const r = await fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': INTERNAL_KEY },
    body: JSON.stringify(body || {}),
  })
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `PATCH ${path} → ${r.status}`) }
  return r.json()
}

// Tolerant GET — returns `fallback` on any failure. Use for enrichment/aggregation where a
// missing upstream should degrade gracefully rather than fail the whole request.
export async function tryGet(baseUrl, path, fallback = null) {
  try { return await internalGet(baseUrl, path) } catch { return fallback }
}
