// HomeHelp Payment Service — SCAFFOLD (Phase 0)
// Owns payments/settlements/payouts/wallet_ledger/webhook_events. Logic lands in Phase 2f.
// NOTE: keeps the raw body so webhook HMAC signatures verify over the exact bytes.
import express from 'express'
import { makePool, migrate } from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4008)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5438/payment'
const pool = makePool(DATABASE_URL)

async function init() {
  await migrate(pool, [
    // Schema added in Phase 1.
  ])
  console.log('[payment] Postgres ready')
}

const app = express()
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf } }))
app.get('/health', (_q, res) => res.json({ service: 'payment', ok: true }))

init()
  .then(() => app.listen(PORT, () => console.log(`[payment] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[payment] failed to start:', e.message); process.exit(1) })
