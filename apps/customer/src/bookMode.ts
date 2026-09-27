// The Instant / Schedule choice made on Home, carried to the booking flow so it opens on the
// right step (Instant → straight to duration & pay; Schedule → date + slot first).
export type BookMode = 'now' | 'schedule'
const KEY = 'hh_book_mode'

export function getBookMode(): BookMode | null {
  try { const v = sessionStorage.getItem(KEY); return v === 'now' || v === 'schedule' ? v : null } catch { return null }
}
export function setBookMode(m: BookMode | null) {
  try { if (m) sessionStorage.setItem(KEY, m); else sessionStorage.removeItem(KEY) } catch { /* private mode */ }
}
