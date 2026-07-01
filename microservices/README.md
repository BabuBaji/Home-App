# HomeHelp — Microservices (proof of concept)

This is **step 1** of migrating the HomeHelp backend from a modular monolith to
microservices, using the **strangler-fig pattern**: put a gateway in front, then peel
services off the monolith one at a time. Nothing in the existing apps has to change — the
gateway preserves the exact URL contract (`/api/*`, `/api/admin/*`, `/api/worker/*`, `/socket.io`).

## Architecture

```
                        ┌───────────────────────────┐
   Customer / Admin /   │      API Gateway :8080     │
   Worker apps ────────▶│  (single entry point)      │
                        └───────┬───────────┬────────┘
                                │           │
      /api/services*, /api/admin/services*  │  everything else (+ socket.io ws)
                                │           │
                                ▼           ▼
                   ┌────────────────┐   ┌──────────────────────────┐
                   │ Catalog svc    │   │  Monolith (customer-app) │
                   │  :4001         │   │  :4000  (legacy)         │
                   │  → Postgres    │   │  → SQLite                │
                   └────────────────┘   └──────────────────────────┘
                          ▲                        │
                          └── service-to-service ──┘
                              (admin auth /api/admin/me,
                               booking counts /api/internal/…)
```

- **API Gateway** (`gateway/`) — Express + `http-proxy-middleware`. Routes catalogue
  traffic to the Catalog service and everything else (including websockets) to the monolith.
- **Catalog service** (`catalog-service/`) — owns the service catalogue on its **own
  Postgres DB**. Serves `GET /api/services`, `GET /api/services/:id`, and admin CRUD
  under `/api/admin/services`.
- **Monolith** — the current `customer-app/server`, unchanged except one small internal
  endpoint (`/api/internal/service-booking-counts`) that the Catalog service calls.

### Service-to-service patterns demonstrated
- **Delegated auth** — the Catalog service validates admin tokens by calling the
  monolith's `GET /api/admin/me` (it doesn't own the admin identity — Auth service will, later).
- **Data federation** — the admin catalogue list enriches each service with a live
  booking count fetched from the monolith over HTTP.
- **Own database per service** — Catalog uses Postgres; the monolith keeps SQLite.

## Run it

Prereqs: **Docker Desktop**, and the monolith running on the host:

```bash
# 1) start the legacy monolith on :4000 (as usual)
cd customer-app && npm run dev

# 2) from the repo root, bring up Postgres + Catalog + Gateway
docker compose up --build
```

Then hit the **gateway** instead of the monolith:

```bash
curl http://localhost:8080/health                     # gateway
curl http://localhost:8080/api/services               # served by Catalog service → Postgres
curl http://localhost:8080/api/dashboard -H '...'      # still the monolith
```

Point the apps at the gateway to use the microservices path:
- Admin/customer web (Vite dev): change the proxy target from `http://localhost:4000` to `http://localhost:8080`.
- Installed apps: set `apiBase` to the gateway URL.

### Run without Docker (quick local test)
```bash
# needs a local Postgres reachable at DATABASE_URL
cd microservices/catalog-service && npm install && \
  DATABASE_URL=postgres://homehelp:homehelp@localhost:5432/catalog MONOLITH_URL=http://localhost:4000 npm start
cd microservices/gateway && npm install && \
  CATALOG_URL=http://localhost:4001 MONOLITH_URL=http://localhost:4000 npm start
```

## Known boundaries (documented next steps)
This is a **proof**, so a few things are intentionally deferred:

1. **Booking pricing still reads the monolith's SQLite copy of services.** So an admin
   price edit via the Catalog service won't change booking pricing until the Booking
   service calls the Catalog service for prices. *(Next: extract Booking service; have it
   fetch prices from Catalog.)*
2. **Realtime `services:update` socket events** are still emitted by the monolith only.
3. **The monolith is not yet containerized** (it uses `better-sqlite3`/native SQLite). It
   runs on the host; the gateway reaches it via `host.docker.internal`. *(Next: migrate
   its data to Postgres and containerize it too.)*
4. **Coupons/pricing math** remain in the monolith (they belong to a future Pricing service).

## Roadmap (remaining services)
`Auth` · `Catalog ✅` · `Booking/Dispatch` · `Worker` · `Payments/Wallet` · `Admin/Analytics` · `Notifications/Activity`
— extracted one at a time, each with its own DB, coordinated by events (a message broker) for cross-service reactions.
