// HomeHelp Dispatch Service — SCAFFOLD (Phase 0)
// Owns `dispatch_offers`. Job matching + /api/worker/jobs/* lifecycle land in Phase 2e.
import express from 'express'
import { makePool, migrate } from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4007)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5437/dispatch'
const pool = makePool(DATABASE_URL)

async function init() {
  await migrate(pool, [
    // Schema added in Phase 1.
  ])
  console.log('[dispatch] Postgres ready')
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'dispatch', ok: true }))

init()
  .then(() => app.listen(PORT, () => console.log(`[dispatch] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[dispatch] failed to start:', e.message); process.exit(1) })
