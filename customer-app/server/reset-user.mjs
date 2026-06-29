// One-off: wipe a user (and their data) by phone so onboarding re-runs cleanly.
// Usage: node server/reset-user.mjs 9908787055
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const db = new DatabaseSync(join(__dirname, 'homehelp.db'))
const phone = process.argv[2]
if (!phone) { console.error('Pass a phone number'); process.exit(1) }

const u = db.prepare('SELECT id,name FROM users WHERE phone=?').get(phone)
if (!u) { console.log(`No user with phone ${phone}`); process.exit(0) }

for (const t of ['addresses', 'bookings', 'transactions', 'tickets'])
  db.prepare(`DELETE FROM ${t} WHERE user_id=?`).run(u.id)
db.prepare('DELETE FROM users WHERE id=?').run(u.id)
console.log(`Removed user #${u.id} (${u.name || 'no name'}) and all related rows for ${phone}.`)
