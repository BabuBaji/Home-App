// HomeHelp API Gateway
// --------------------
// The single public entry point for all three apps. It preserves the existing URL
// contract (/api/*, /api/admin/*, /api/worker/*, /socket.io) so no client changes are
// needed, and uses the strangler-fig pattern: catalogue traffic is peeled off to the new
// Catalog service, while everything else still flows to the legacy monolith.
import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'

const PORT = Number(process.env.PORT || 8080)
const MONOLITH_URL = (process.env.MONOLITH_URL || 'http://localhost:4000').replace(/\/$/, '')
const CATALOG_URL = (process.env.CATALOG_URL || 'http://localhost:4001').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')
const ACTIVITY_URL = (process.env.ACTIVITY_URL || 'http://localhost:4003').replace(/\/$/, '')

const app = express()

app.get('/health', (_q, res) => res.json({ service: 'gateway', ok: true, upstreams: { auth: AUTH_URL, activity: ACTIVITY_URL, catalog: CATALOG_URL, monolith: MONOLITH_URL } }))

const onError = (name) => (err, _req, res) => {
  console.error(`[gateway] ${name} upstream error:`, err.message)
  if (res.writeHead && !res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: `${name} service unavailable` }))
}

// 1) Customer auth/login → Auth service. Plain string = prefix match (covers sub-paths).
const toAuth = createProxyMiddleware('/api/auth', {
  target: AUTH_URL, changeOrigin: true, logLevel: 'warn', onError: onError('auth'),
})
app.use(toAuth)

// 2) Catalogue endpoints → Catalog service (prefix match on both bases).
const toCatalog = createProxyMiddleware(['/api/services', '/api/admin/services'], {
  target: CATALOG_URL, changeOrigin: true, logLevel: 'warn', onError: onError('catalog'),
})
app.use(toCatalog)

// 2b) Activity monitor → Activity service.
const toActivity = createProxyMiddleware('/api/admin/activity', {
  target: ACTIVITY_URL, changeOrigin: true, logLevel: 'warn', onError: onError('activity'),
})
app.use(toActivity)

// 3) Everything else → monolith (including websockets for socket.io).
const toMonolith = createProxyMiddleware({
  target: MONOLITH_URL, changeOrigin: true, ws: true, logLevel: 'warn', onError: onError('monolith'),
})
app.use(toMonolith)

const server = app.listen(PORT, () => {
  console.log(`[gateway] listening on http://localhost:${PORT}`)
  console.log(`[gateway]   catalogue  → ${CATALOG_URL}`)
  console.log(`[gateway]   everything → ${MONOLITH_URL}`)
})
// Proxy websocket upgrades (socket.io) to the monolith.
server.on('upgrade', toMonolith.upgrade)
