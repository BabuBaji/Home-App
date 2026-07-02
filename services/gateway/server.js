// HomeHelp API Gateway
// --------------------
// The single public entry point for all three apps. It preserves the exact URL contract
// (/api/*, /api/admin/*, /api/worker/*, /socket.io) so no client changes are needed, and now
// routes EVERY path prefix to its owning microservice — there is no monolith fallthrough.
//
// It also hosts the socket.io realtime hub: services never hold sockets; they publish
// {room,event,payload} messages to a Redis pub/sub channel and the gateway relays them to the
// matching booking room. This is how the customer/admin apps still get live booking updates in
// a split backend.
import express from 'express'
import { createServer } from 'node:http'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { Server } from 'socket.io'
import Redis from 'ioredis'
import { REALTIME_CHANNEL } from '@homehelp/shared/realtime.js'

const PORT = Number(process.env.PORT || 8080)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const strip = (u) => (u || '').replace(/\/$/, '')

const U = {
  auth: strip(process.env.AUTH_URL || 'http://localhost:4002'),
  catalog: strip(process.env.CATALOG_URL || 'http://localhost:4001'),
  booking: strip(process.env.BOOKING_URL || 'http://localhost:4006'),
  dispatch: strip(process.env.DISPATCH_URL || 'http://localhost:4007'),
  payment: strip(process.env.PAYMENT_URL || 'http://localhost:4008'),
  wallet: strip(process.env.WALLET_URL || 'http://localhost:4009'),
  worker: strip(process.env.WORKER_URL || 'http://localhost:4004'),
  notification: strip(process.env.NOTIFICATION_URL || 'http://localhost:4003'),
  admin: strip(process.env.ADMIN_URL || 'http://localhost:4010'),
}

// Route a request URL to the owning service. Order matters: the most specific admin/worker
// sub-paths are matched before the broad prefixes.
function pickTarget(url) {
  const u = (url || '').split('?')[0]
  const p = (s) => u === s || u.startsWith(s + '/') || u.startsWith(s)

  // ----- admin panel (BFF + per-domain admin routes) -----
  if (p('/api/admin/services')) return U.catalog
  if (p('/api/admin/activity')) return U.notification
  if (p('/api/admin/notifications')) return U.notification
  if (/^\/api\/admin\/workers\/[^/]+\/wallet/.test(u)) return U.wallet
  if (p('/api/admin/workers')) return U.worker
  if (p('/api/admin/bookings')) return U.booking
  if (p('/api/admin/finance') || p('/api/admin/payments') || p('/api/admin/refunds')) return U.payment
  if (p('/api/admin/tickets') || p('/api/admin/complaints')) return U.notification
  if (p('/api/admin')) return U.admin

  // ----- worker app -----
  if (p('/api/worker/wallet')) return U.wallet
  if (p('/api/worker/jobs')) return U.dispatch
  if (p('/api/worker')) return U.worker

  // ----- customer identity / profile / wallet -----
  if (p('/api/auth') || p('/api/me') || p('/api/addresses') || p('/api/wallet')) return U.auth

  // ----- catalogue / pricing -----
  if (p('/api/services') || p('/api/quote') || p('/api/coupons') || p('/api/home') || p('/api/referral')) return U.catalog

  // ----- bookings / favourites / policy / support feed -----
  if (p('/api/bookings') || p('/api/favourites') || p('/api/policy') || p('/api/support') || p('/api/notifications')) return U.booking

  // ----- support tickets -----
  if (p('/api/tickets')) return U.notification

  // ----- payments (customer flow + gateway/payout webhooks) — covers /api/payment and /api/payments
  if (p('/api/payment')) return U.payment

  return null
}

const app = express()

app.get('/health', (_q, res) => res.json({ service: 'gateway', ok: true, upstreams: U }))

// Decide the upstream before proxying; 502 for unknown /api routes, pass through everything else.
app.use((req, res, next) => {
  const target = pickTarget(req.url)
  if (!target) {
    if (req.url.startsWith('/api')) return res.status(502).json({ error: 'No route for ' + req.url })
    return next()
  }
  req._target = target
  next()
})

const onError = (err, req, res) => {
  console.error('[gateway] upstream error:', req.url, err.message)
  if (res.writeHead && !res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Upstream service unavailable' }))
}

// One proxy, dynamic target chosen per-request. Body is streamed untouched (no express.json
// here) so payment webhook HMAC signatures verify over the exact bytes downstream.
const proxy = createProxyMiddleware({
  changeOrigin: true,
  logLevel: 'warn',
  target: U.catalog, // fallback; router() overrides per request
  router: (req) => req._target,
  onError,
})
app.use(proxy)

const httpServer = createServer(app)

/* ---------- socket.io hub ---------- */
const io = new Server(httpServer, { cors: { origin: '*' } })

io.on('connection', (socket) => {
  // Send the initial catalogue on connect (the monolith used to emit this).
  fetch(`${U.catalog}/api/services`)
    .then((r) => r.json())
    .then((d) => socket.emit('services:init', d.services || []))
    .catch(() => {})
  socket.on('booking:join', (id) => socket.join(`booking:${Number(id)}`))
  socket.on('booking:leave', (id) => socket.leave(`booking:${Number(id)}`))
})

// Relay realtime messages published by any service.
const sub = new Redis(REDIS_URL)
sub.subscribe(REALTIME_CHANNEL, (err) => {
  if (err) console.error('[gateway] realtime subscribe failed:', err.message)
  else console.log(`[gateway] relaying realtime on "${REALTIME_CHANNEL}"`)
})
sub.on('message', (_ch, msg) => {
  try {
    const { room, event, payload } = JSON.parse(msg)
    if (room) io.to(room).emit(event, payload)
    else io.emit(event, payload)
  } catch (e) { console.error('[gateway] bad realtime message:', e.message) }
})

httpServer.listen(PORT, () => {
  console.log(`[gateway] listening on http://localhost:${PORT}`)
  for (const [name, url] of Object.entries(U)) console.log(`[gateway]   ${name.padEnd(12)} → ${url}`)
})
