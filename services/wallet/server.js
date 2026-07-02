// HomeHelp Wallet Service — SCAFFOLD (Phase 0)
// Owns worker earnings tables. Endpoints + event consumers land in Phase 2g.
import express from 'express'
import { makePool, migrate } from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4009)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5439/wallet'
const pool = makePool(DATABASE_URL)

async function init() {
  await migrate(pool, [
    // Schema added in Phase 1.
  ])
  console.log('[wallet] Postgres ready')
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'wallet', ok: true }))

init()
  .then(() => app.listen(PORT, () => console.log(`[wallet] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[wallet] failed to start:', e.message); process.exit(1) })
