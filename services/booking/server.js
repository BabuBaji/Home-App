// HomeHelp Booking Service — SCAFFOLD (Phase 0)
// Owns `bookings` + `favourites`. Full lifecycle/endpoints land in Phase 2c.
import express from 'express'
import { makePool, migrate } from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4006)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5436/booking'
const pool = makePool(DATABASE_URL)

async function init() {
  await migrate(pool, [
    // Schema added in Phase 1.
  ])
  console.log('[booking] Postgres ready')
}

const app = express()
app.use(express.json({ limit: '6mb' }))
app.get('/health', (_q, res) => res.json({ service: 'booking', ok: true }))

init()
  .then(() => app.listen(PORT, () => console.log(`[booking] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[booking] failed to start:', e.message); process.exit(1) })
