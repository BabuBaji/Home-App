// Postgres pool factory + tiny migration helper shared by every data-owning service.
import pg from 'pg'

export function makePool(url) {
  const pool = new pg.Pool({ connectionString: url, max: 10 })
  pool.on('error', (e) => console.error('[db] pool error:', e.message))
  return pool
}

// Run a list of DDL / seed statements in order. Each should be idempotent
// (CREATE TABLE IF NOT EXISTS …, CREATE INDEX IF NOT EXISTS …).
export async function migrate(pool, statements) {
  for (const s of statements) {
    if (s && s.trim()) await pool.query(s)
  }
}

export const nowIso = () => new Date().toISOString()
