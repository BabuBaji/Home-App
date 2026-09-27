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
import { inScope } from '@homehelp/shared/scope.js'

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

  // ----- membership plan CATALOG (config) lives in catalog, NOT the auth membership-instance API.
  // Checked first: '/api/membership-plans' would otherwise prefix-match the '/api/membership' rule.
  if (p('/api/admin/membership-plans') || p('/api/membership-plans') || p('/api/admin/pricing-rules')) return U.catalog

  // ----- admin panel (BFF + per-domain admin routes) -----
  if (p('/api/admin/services') || p('/api/admin/zones') || p('/api/admin/cities') || p('/api/admin/clusters') || p('/api/admin/apartments') || p('/api/admin/inventory') || p('/api/admin/zone-pricing') || p('/api/admin/extension-rules') || p('/api/admin/campaigns') || p('/api/admin/ops-overview') || p('/api/admin/stores') || p('/api/admin/surge') || p('/api/admin/banners') || p('/api/admin/packages')) return U.catalog
  if (p('/api/admin/activity')) return U.notification
  if (p('/api/admin/notifications')) return U.notification
  if (/^\/api\/admin\/workers\/[^/]+\/wallet/.test(u)) return U.wallet
  if (p('/api/admin/workers') || p('/api/admin/shifts') || p('/api/admin/shift-defs') || p('/api/admin/attendance') || p('/api/admin/next-day-availability') || p('/api/admin/sites') || p('/api/admin/training') || p('/api/admin/equipment') || p('/api/admin/salary-plans') || p('/api/admin/incentive-plans') || p('/api/admin/payroll') || p('/api/admin/incentive-rules')) return U.worker
  if (p('/api/admin/bookings')) return U.booking
  if (p('/api/admin/finance') || p('/api/admin/payments') || p('/api/admin/refunds')) return U.payment
  if (p('/api/admin/tickets') || p('/api/admin/complaints') || p('/api/admin/sos')) return U.notification
  if (p('/api/admin')) return U.admin

  // ----- worker app -----
  if (p('/api/worker/wallet')) return U.wallet
  if (p('/api/worker/jobs')) return U.dispatch
  if (p('/api/worker')) return U.worker

  // ----- customer identity / profile / wallet -----
  // /api/payment-methods must be listed here (before the /api/payment rule) so it reaches auth,
  // which owns saved payment methods, rather than the payment service.
  if (p('/api/auth') || p('/api/me') || p('/api/addresses') || p('/api/wallet')
    || p('/api/family') || p('/api/payment-methods') || p('/api/profile')
    || p('/api/reminders') || p('/api/plans') || p('/api/membership')) return U.auth

  // ----- catalogue / pricing / address search -----
  if (p('/api/app-config') || p('/api/services') || p('/api/quote') || p('/api/coupons') || p('/api/offers') || p('/api/home') || p('/api/referral') || p('/api/places') || p('/api/geocode') || p('/api/reverse-geocode') || p('/api/maps-key') || p('/api/serviceable') || p('/api/eta') || p('/api/zones') || p('/api/zone-hours') || p('/api/invoice-info') || p('/api/surge') || p('/api/home-banners') || p('/api/banner-media') || p('/api/packages')) return U.catalog

  // ----- bookings / favourites / policy / support feed -----
  // The job chat is the one /api/bookings path the booking service does NOT own: the messages live
  // in the dispatch DB alongside the worker half. Must be tested BEFORE the general rule below.
  if (/^\/api\/bookings\/[^/]+\/messages\b/.test(u)) return U.dispatch
  if (/^\/api\/bookings\/[^/]+\/call\b/.test(u)) return U.dispatch // masked call bridge
  if (p('/api/bookings') || p('/api/refunds') || p('/api/slots') || p('/api/favourites') || p('/api/favourite-experts') || p('/api/recurring') || p('/api/policy') || p('/api/support') || p('/api/notifications')) return U.booking

  // ----- support tickets -----
  if (p('/api/tickets') || p('/api/push')) return U.notification

  // ----- payments (customer flow + gateway/payout webhooks) — covers /api/payment and /api/payments
  if (p('/api/payment')) return U.payment

  return null
}

const app = express()

// CORS — the apps run in a Capacitor webview (origin http://localhost) and browsers, so every
// cross-origin request needs these headers + a preflight response. Set here at the single entry
// point so all proxied services are covered (the old monolith did app.use(cors())).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization, x-internal-key')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

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

// Maintenance mode (Settings ▸ General). The gateway polls the public app-config and, while it's on,
// answers customer-app requests with 503 so the app shows its maintenance screen and no new bookings
// or payments start. Admin, expert-app and payment/payout webhook traffic still flows, so the team
// can work and in-flight payments settle. Fails open: if the config can't be read, nothing is held.
let maintenance = false
async function pollMaintenance() {
  try {
    const r = await fetch(U.catalog + '/api/app-config', { signal: AbortSignal.timeout(3000) })
    if (r.ok) maintenance = !!(await r.json()).maintenance
  } catch { /* keep last known */ }
}
pollMaintenance(); setInterval(pollMaintenance, 10000).unref()
const HOLD_EXEMPT = (u) => u.startsWith('/api/admin') || u.startsWith('/api/worker') || u.startsWith('/api/app-config') || /^\/api\/payments?\/[^?]*webhook/.test(u)
app.use((req, res, next) => {
  if (!maintenance || !req.url.startsWith('/api') || HOLD_EXEMPT(req.url.split('?')[0])) return next()
  res.status(503).json({ error: "HomeHelp is down for scheduled maintenance. We'll be back shortly.", maintenance: true })
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
  xfwd: true,        // forward X-Forwarded-For/Host/Proto so services can see the real client IP
  logLevel: 'warn',
  target: U.catalog, // fallback; router() overrides per request
  router: (req) => req._target,
  onProxyRes: (proxyRes, req) => {
    proxyRes.headers['access-control-allow-origin'] = req.headers.origin || '*'
    proxyRes.headers['access-control-allow-credentials'] = 'true'
    proxyRes.headers['vary'] = 'Origin'
  },
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
  // Admin control-tower room — receives ops broadcasts (e.g. SOS) in real time. Joining needs a
  // valid admin token: the room carries names, phone numbers and locations. The admin's role,
  // permissions and data scope are kept on the socket so each alert is delivered only to the
  // admins it concerns (see the relay below).
  socket.on('admin:join', async (token) => {
    try {
      const r = await fetch(`${U.admin}/api/admin/me`, { headers: { authorization: `Bearer ${String(token || '')}` } })
      if (!r.ok) return socket.emit('admin:denied')
      socket.data.admin = (await r.json()).admin
      socket.join('admin')
    } catch { socket.emit('admin:denied') }
  })
  socket.on('admin:leave', () => socket.leave('admin'))
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
    if (room === 'admin' && event === 'sos') return deliverSos(payload)
    if (room) io.to(room).emit(event, payload)
    else io.emit(event, payload)
  } catch (e) { console.error('[gateway] bad realtime message:', e.message) }
})

/* An SOS reaches: super admins; anyone holding safety.view whose scope covers where it happened
   (the safety desk has scope 'all', a zone/hub manager their own area). Admins without the
   permission — finance, marketing, trainers… — never see it. */
function deliverSos(p) {
  const ids = io.sockets.adapter.rooms.get('admin')
  if (!ids) return
  for (const id of ids) {
    const sock = io.sockets.sockets.get(id)
    const a = sock?.data?.admin
    if (!a) continue
    const perms = Array.isArray(a.permissions) ? a.permissions : []
    const ok = a.role === 'super' || (perms.includes('safety.view') && inScope(a.scope, { zoneId: p?.zoneId ?? null, storeId: p?.storeId ?? null, city: p?.city ?? null }))
    if (ok) sock.emit('sos', p)
  }
}

httpServer.listen(PORT, () => {
  console.log(`[gateway] listening on http://localhost:${PORT}`)
  for (const [name, url] of Object.entries(U)) console.log(`[gateway]   ${name.padEnd(12)} → ${url}`)
});
