// HomeHelp Notification Service — SCAFFOLD (Phase 0)
// Will absorb the existing activity service (activity_log) and add tickets/broadcasts +
// event consumers in Phase 2h. Owns activity_log/tickets/broadcasts.
import express from 'express'
import { makePool, migrate } from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4003)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5434/notification'
const pool = makePool(DATABASE_URL)

async function init() {
  await migrate(pool, [
    // Schema added in Phase 1 / Phase 2h.
  ])
  console.log('[notification] Postgres ready')
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'notification', ok: true }))

init()
  .then(() => app.listen(PORT, () => console.log(`[notification] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[notification] failed to start:', e.message); process.exit(1) })
