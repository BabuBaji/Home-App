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

const app = express()

app.get('/health', (_q, res) => res.json({ service: 'gateway', ok: true, upstreams: { catalog: CATALOG_URL, monolith: MONOLITH_URL } }))

const onError = (name) => (err, _req, res) => {
  console.error(`[gateway] ${name} upstream error:`, err.message)
  if (res.writeHead && !res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: `${name} service unavailable` }))
}

// 1) Catalogue endpoints → Catalog service (paths preserved).
const toCatalog = createProxyMiddleware(['/api/services', '/api/services/**', '/api/admin/services', '/api/admin/services/**'], {
  target: CATALOG_URL, changeOrigin: true, logLevel: 'warn', onError: onError('catalog'),
})
app.use(toCatalog)

// 2) Everything else → monolith (including websockets for socket.io).
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
