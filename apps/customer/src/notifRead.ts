// Read-state for the notification feed.
//
// The feed is synthesised per request (live bookings + promo cards) and the backend has no
// notion of "read", so we track it on the device against the feed's stable ids ("b12", "o1").
// Per-device rather than per-account: signing in elsewhere starts with everything unread.
const KEY = 'hh_notif_read'
const CAP = 200   // keep the list bounded; ids are dropped oldest-first

export function readIds(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    return new Set<string>(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }   // private mode / corrupt value
}

/** Mark ids read, newest last. Returns the resulting set. */
export function markRead(ids: string[]): Set<string> {
  const merged = [...readIds(), ...ids]
  const capped = merged.slice(-CAP)
  const set = new Set(capped)
  try { localStorage.setItem(KEY, JSON.stringify([...set])) } catch { /* non-fatal */ }
  return set
}

/** How many of these items the customer hasn't seen yet — what the bell badge shows. */
export function unreadCount(items: { id: string }[]): number {
  const read = readIds()
  return items.filter((n) => !read.has(n.id)).length
}
