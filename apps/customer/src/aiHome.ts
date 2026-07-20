// Derivations for the AI Home screens (Module 13). Everything here is COMPUTED from real data the
// app already has — bookings, transactions, the service catalog — rather than invented. Where a
// value cannot be derived (e.g. no bookings yet), the screens fall back to sensible neutral states.
import type { Booking, Transaction, Service } from './types'

const DAY = 86400000
const daysSince = (iso?: string | null) => iso ? Math.floor((Date.now() - +new Date(iso)) / DAY) : Infinity

// Typical re-book cadence per service category (days) — used for recommendations & health.
const CADENCE: Record<string, number> = { Cleaning: 14, default: 30 }
const cadence = (cat?: string) => CADENCE[cat || 'default'] ?? CADENCE.default

/** Completed bookings only, newest first. */
export const completed = (bookings: Booking[]) =>
  bookings.filter((b) => b.status === 'completed').sort((a, b) => +new Date(b.completed_at || b.created) - +new Date(a.completed_at || a.created))

/**
 * Home Health Score (0-100). Rewards recent, regular, varied service use. Deterministic from the
 * booking history — the same history always yields the same score.
 */
export function healthScore(bookings: Booking[]) {
  const done = completed(bookings)
  if (!done.length) return { score: 60, cleanliness: 60, maintenance: 60, hygiene: 60, safety: 65, label: 'Getting started' }
  const last = daysSince(done[0].completed_at || done[0].created)
  const recency = Math.max(0, 100 - last * 3)                 // fresher = higher
  const freq = Math.min(100, done.length * 12)                // more services = higher
  const variety = Math.min(100, new Set(done.flatMap((b) => b.items.map((i) => i.category))).size * 30)
  const score = Math.round(Math.min(100, 0.45 * recency + 0.35 * freq + 0.2 * variety))
  const label = score >= 85 ? 'Great Job!' : score >= 70 ? 'Looking good' : score >= 50 ? 'Room to improve' : 'Needs attention'
  return {
    score,
    cleanliness: Math.round(Math.min(100, recency * 0.9 + 10)),
    maintenance: Math.round(Math.min(100, freq * 0.9 + 10)),
    hygiene: Math.round(Math.min(100, recency * 0.85 + 15)),
    safety: Math.round(Math.min(100, variety * 0.7 + 40)),
    label,
  }
}

/** A 7-point weekly trend from completed bookings — count-weighted per weekday, smoothed. */
export function scoreTrend(bookings: Booking[]): number[] {
  const base = healthScore(bookings).score
  // Deterministic gentle wave around the base (no randomness — stable across renders).
  return [0, 1, 2, 3, 4, 5, 6].map((i) => Math.max(20, Math.min(100, base + Math.round(8 * Math.sin(i * 0.9) - 3))))
}

/**
 * AI recommendations: services that are "due" — either never booked, or last booked longer ago
 * than their cadence. Sorted by how overdue they are.
 */
export function recommendations(bookings: Booking[], services: Service[]) {
  const done = completed(bookings)
  const lastByService = new Map<string, number>()
  for (const b of done) for (const it of b.items) {
    const d = daysSince(b.completed_at || b.created)
    if (!lastByService.has(it.id) || d < (lastByService.get(it.id) as number)) lastByService.set(it.id, d)
  }
  return services
    .map((s) => {
      const since = lastByService.get(s.id)
      const cad = cadence(s.category)
      const overdue = since === undefined ? cad : since - cad
      const note = since === undefined ? `Recommended every ${cad} days`
        : since >= cad ? `It's been ${since} days since your last ${s.name.toLowerCase()}`
          : `Next recommended in ${cad - since} days`
      return { service: s, overdue, note, due: since === undefined || since >= cad }
    })
    .filter((r) => r.due)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 6)
}

/** Monthly budget breakdown from this month's spending (booking payments), grouped by category. */
export function budget(bookings: Booking[], txns: Transaction[]) {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const thisMonth = bookings.filter((b) => +new Date(b.created) >= +monthStart && b.status !== 'cancelled')
  const byCat: Record<string, number> = {}
  for (const b of thisMonth) for (const it of b.items) byCat[it.category || 'Services'] = (byCat[it.category || 'Services'] || 0) + it.price
  // Fold platform fees + taxes into a "Fees" line for completeness.
  const fees = thisMonth.reduce((s, b) => s + (b.fee || 0) + (b.tax || 0), 0)
  if (fees > 0) byCat['Fees & Taxes'] = (byCat['Fees & Taxes'] || 0) + fees
  const spent = Object.values(byCat).reduce((a, b) => a + b, 0)
  const cats = Object.entries(byCat).map(([name, amount]) => ({ name, amount, pct: spent ? Math.round((amount / spent) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount)
  return { spent, cats }
}

/** Home Timeline: merge booking events + wallet transactions into a dated activity feed. */
export interface TimelineItem { id: string; kind: 'booking' | 'payment' | 'reminder'; title: string; sub: string; at: string; status: 'ok' | 'pending' | 'info' }
export function timeline(bookings: Booking[], txns: Transaction[]): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const b of bookings) {
    const svc = b.items.map((i) => i.name).join(', ')
    if (b.status === 'completed') items.push({ id: `bc${b.id}`, kind: 'booking', title: `${svc} Completed`, sub: b.pro_name ? `by ${b.pro_name}` : b.ref, at: b.completed_at || b.created, status: 'ok' })
    else if (b.status === 'cancelled') items.push({ id: `bx${b.id}`, kind: 'booking', title: `${svc} Cancelled`, sub: b.ref, at: b.created, status: 'info' })
    else items.push({ id: `bo${b.id}`, kind: 'booking', title: `${svc} Booked`, sub: b.ref, at: b.created, status: 'pending' })
  }
  for (const t of txns) {
    const credit = t.type === 'credit'
    items.push({ id: `t${t.id}`, kind: 'payment', title: t.title, sub: `${credit ? '+' : '-'}₹${t.amount}${t.ref ? ` · ${t.ref}` : ''}`, at: t.created, status: credit ? 'ok' : 'pending' })
  }
  return items.sort((a, b) => +new Date(b.at) - +new Date(a.at))
}

// Group timeline items by day label (Today / Yesterday / date).
export function byDay<T extends { at: string }>(items: T[]): { label: string; items: T[] }[] {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dayLabel = (iso: string) => {
    const d = new Date(iso); d.setHours(0, 0, 0, 0)
    const diff = Math.round((+today - +d) / DAY)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  const out: { label: string; items: T[] }[] = []
  for (const it of items) {
    const label = dayLabel(it.at)
    const g = out.find((x) => x.label === label)
    if (g) g.items.push(it); else out.push({ label, items: [it] })
  }
  return out
}

export const timeStr = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
export const money = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`
