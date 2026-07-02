# HomeHelp — Microservices Architecture

HomeHelp is a **pure microservices** system: there is **no monolith**. Every domain is its own
deployable service with its **own database**, fronted by a single API gateway, and coordinated
by a **Redis event bus** (async reactions) plus service-to-service HTTP (synchronous reads).

## Architecture

```
 customer / admin (web, socket.io)          worker (native, REST)
                    │                                 │
                    ▼                                 ▼
        ┌───────────────────────  API Gateway :8080  ───────────────────────┐
        │  reverse-proxy by path prefix  +  socket.io hub (Redis-relayed)    │
        └──┬─────┬───────┬────────┬────────┬────────┬───────┬────────┬───────┘
        auth  catalog  booking  dispatch  payment  wallet  worker  notif   admin
        4002   4001     4006     4007      4008     4009    4004    4003    4010
          │      │        │        │         │        │       │       │       │
        each → its own Postgres DB          └──────── Redis Streams (events) ─┘
```

| Service | Owns | Responsibilities |
|---|---|---|
| **gateway** (8080) | — | single entry point; routes every prefix to its service; hosts the socket.io hub, relaying `booking:update` / `services:update` etc. published to Redis by services |
| **auth** (4002) | users, addresses, transactions, auth_identities | customer identity/login, profile, addresses, customer wallet; internal user/wallet API |
| **catalog** (4001) | services | catalogue, pricing/quote, coupons, home content; admin service CRUD |
| **booking** (4006) | bookings, favourites | booking lifecycle, cancellation policy, favourites, notifications feed; emits `booking.*` |
| **dispatch** (4007) | dispatch_offers | job matching + `/api/worker/jobs/*` lifecycle; orchestrates worker + booking |
| **payment** (4008) | payments, settlements, payouts, wallet_ledger, webhook_events | customer payments, Razorpay/UPI, signed webhooks, finance panel |
| **wallet** (4009) | worker_income/deductions/withdrawals/advances/payslips/notifications | worker earnings ledger; settles on `booking.completed` |
| **worker** (4004) | workers, worker_documents | worker identity/profile/KYC + balance snapshot; admin worker panel |
| **notification** (4003) | activity_log, tickets, complaints, broadcasts | unified activity feed (consumes all events), support, announcements |
| **admin** (4010) | admins, settings, audit_log | admin identity + RBAC, config source-of-record, BFF dashboards/analytics |

### Patterns
- **Database per service** — 9 Postgres instances; no cross-service SQL. Cross-domain reads are
  internal HTTP calls guarded by `x-internal-key`; cross-domain reactions are events.
- **Event bus (Redis Streams)** — e.g. `booking.completed` → wallet credits the worker + payment
  records the settlement + notification logs it, each in its own consumer group (fan-out).
- **Realtime** — services publish `{room,event,payload}` to a Redis pub/sub channel; the gateway's
  socket.io hub relays it to the booking room. Services never hold sockets.
- **Config** — the admin service owns `settings`; `@homehelp/shared` `getSetting()` reads it (cached).
- **Shared lib** — `services/shared` (`@homehelp/shared`): event bus, realtime, internal HTTP,
  admin/customer auth middleware, pg pool, config cache. Bundled into each image at build time.

## Run it

```bash
docker compose -f infra/docker-compose.yml up --build      # whole stack (Redis + 9 DBs + 10 services)
curl http://localhost:8080/health                          # gateway + all upstreams
```

Then everything is reached through the gateway, e.g.:
```bash
curl http://localhost:8080/api/services                    # catalog
curl -X POST http://localhost:8080/api/admin/login -H 'content-type: application/json' \
  -d '{"email":"admin@homehelp.in","password":"admin123"}'  # admin (admin-<id> token)
```

Apps point at the gateway (`:8080`): customer/admin via `VITE_API_URL` (or the runtime
`app-config.json`), worker via `RetrofitClient.kt`. `infra/scripts/go-live.ps1` brings the stack
up and tunnels the **gateway** publicly.

### Import existing monolith data (optional, one-time)
```bash
cd infra/migrate && npm install && node index.js           # services/api/homehelp.db → per-service Postgres
```

## Events (publisher → consumers)
- `booking.created` (booking) → dispatch, notification
- `booking.completed` (booking) → wallet (credit worker), payment (record settlement), notification
- `booking.cancelled` (booking) → wallet (comp), notification
- `payment.succeeded` (booking/payment) → payment (record), booking (mark paid), notification
- `payout.completed` (payment) → wallet (mark paid)
- `job.accepted` (dispatch), `customer.login` (auth), `admin.action` (admin), `activity` (all) → notification
- `settings.updated` (admin) → config caches
```
