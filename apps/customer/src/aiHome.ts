// Derivations for the AI Home screens (Module 13). Everything here is COMPUTED from real data the
// app already has — bookings, transactions, the service catalog — rather than invented. Where a
// value cannot be derived (e.g. no bookings yet), the screens fall back to sensible neutral states.
import type { Booking, Transaction, Service } from './types'
import { t, dateLocale } from './i18n'

const DAY = 86400000
const daysSince = (iso?: string | null) => iso ? Math.floor((Date.now() - +new Date(iso)) / DAY) : Infinity

/** Completed bookings only, newest first. */
export const completed = (bookings: Booking[]) =>
  bookings.filter((b) => b.status === 'completed').sort((a, b) => +new Date(b.completed_at || b.created) - +new Date(a.completed_at || a.created))

/**
 * "Book again": the services this customer has actually had done, most recent first, with how long
 * ago that was and the duration they chose. Built only from their completed bookings — nothing is
 * suggested that they haven't booked before, and no "due" cadence is invented.
 */
export function bookAgain(bookings: Booking[], services: Service[]) {
  const seen = new Map<string, { days: number; durationId: string; times: number }>()
  for (const b of completed(bookings)) for (const it of b.items) {
    const d = daysSince(b.completed_at || b.created)
    const cur = seen.get(it.id)
    if (!cur) seen.set(it.id, { days: d, durationId: it.durationId, times: 1 })
    else cur.times += 1
  }
  return [...seen.entries()]
    .map(([id, v]) => ({ service: services.find((s) => s.id === id), ...v }))
    .filter((r): r is { service: Service; days: number; durationId: string; times: number } => !!r.service)
    .sort((a, b) => a.days - b.days)
}

/** Home Timeline: merge booking events + wallet transactions into a dated activity feed. */
export interface TimelineItem { id: string; kind: 'booking' | 'payment'; title: string; sub: string; at: string; status: 'ok' | 'pending' | 'info' }
export function timeline(bookings: Booking[], txns: Transaction[]): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const b of bookings) {
    const svc = b.items.map((i) => t(i.name)).join(', ')
    if (b.status === 'completed') items.push({ id: `bc${b.id}`, kind: 'booking', title: t('{service} Completed', { service: svc }), sub: b.pro_name ? t('by {name}', { name: b.pro_name }) : b.ref, at: b.completed_at || b.created, status: 'ok' })
    else if (b.status === 'cancelled') items.push({ id: `bx${b.id}`, kind: 'booking', title: t('{service} Cancelled', { service: svc }), sub: b.ref, at: b.created, status: 'info' })
    else items.push({ id: `bo${b.id}`, kind: 'booking', title: t('{service} Booked', { service: svc }), sub: b.ref, at: b.created, status: 'pending' })
  }
  for (const tx of txns) {
    const credit = tx.type === 'credit'
    items.push({ id: `t${tx.id}`, kind: 'payment', title: t(tx.title), sub: `${credit ? '+' : '-'}₹${tx.amount}${tx.ref ? ` · ${tx.ref}` : ''}`, at: tx.created, status: credit ? 'ok' : 'pending' })
  }
  return items.sort((a, b) => +new Date(b.at) - +new Date(a.at))
}

// Group timeline items by day label (Today / Yesterday / date).
export function byDay<T extends { at: string }>(items: T[]): { label: string; items: T[] }[] {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dayLabel = (iso: string) => {
    const d = new Date(iso); d.setHours(0, 0, 0, 0)
    const diff = Math.round((+today - +d) / DAY)
    if (diff === 0) return t('Today')
    if (diff === 1) return t('Yesterday')
    return new Date(iso).toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' })
  }
  const out: { label: string; items: T[] }[] = []
  for (const it of items) {
    const label = dayLabel(it.at)
    const g = out.find((x) => x.label === label)
    if (g) g.items.push(it); else out.push({ label, items: [it] })
  }
  return out
}

export const timeStr = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale(),
 { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
export const money = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`
