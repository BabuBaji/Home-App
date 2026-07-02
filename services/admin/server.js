// HomeHelp Admin Service — SCAFFOLD (Phase 0)
// Owns admins/settings/complaints/audit_log and is the config source of record
// (/internal/settings). Full BFF + endpoints land in Phase 2i.
import express from 'express'
import { makePool, migrate } from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4010)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5440/admin'
const pool = makePool(DATABASE_URL)

async function init() {
  await migrate(pool, [
    // Schema added in Phase 1.
  ])
  console.log('[admin] Postgres ready')
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'admin', ok: true }))

init()
  .then(() => app.listen(PORT, () => console.log(`[admin] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[admin] failed to start:', e.message); process.exit(1) })
