// Presentation helpers for the Orders screens (My Bookings / Upcoming / Active / Completed /
// Cancelled / Booking Details / Invoice / Receipt).
//
// Everything here DERIVES from fields the booking API already returns — nothing is invented or
// hardcoded. If a value is not knowable from the booking, these helpers return null and the UI
// omits that line rather than showing a placeholder.
import type { Booking, BookingStatus } from './types'

// Live (in-flight) statuses, in the order the job actually moves through them. This mirrors the
// BookingStatus union in types.ts and the STEPS list Track.tsx already renders.
export const LIVE_STATUSES: BookingStatus[] = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']
export const isLive = (s: BookingStatus) => (LIVE_STATUSES as string[]).includes(s)

// The one definition of the four groups, shared by the hub (58), the lists (59/61/62) and the
// Active screen (60) — otherwise a booking can show up under two tabs at once.
// Active = the expert is actually engaged. Upcoming = booked, nobody moving yet.
export const isActive = (s: BookingStatus) => isLive(s) && s !== 'confirmed'
export const isUpcoming = (s: BookingStatus) => s === 'confirmed'

// What the customer is told each live status means — the same vocabulary Track.tsx uses.
export const LIVE_LABEL: Record<string, string> = {
  confirmed: 'Confirmed', worker_assigned: 'Assigned', on_the_way: 'On the Way',
  arrived: 'Arrived', in_progress: 'In Progress',
}
export const STATUS_LABEL: Record<string, string> = {
  ...LIVE_LABEL, completed: 'Completed', cancelled: 'Cancelled',
}

// Minutes per duration id — mirrors DUR in services/catalog/catalog-data.js. Bookings persist
// durationId + durationLabel but not minutes, so the end time is resolved through this map.
const DUR_MIN: Record<string, number> = { '30m': 30, '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }

/** Total booked minutes across the booking's items, or null when no item maps to a known duration. */
export function bookingMinutes(b: Booking): number | null {
  const mins = b.items.reduce((sum, i) => sum + (DUR_MIN[i.durationId] ?? 0), 0)
  return mins > 0 ? mins : null
}

/** The booking's own duration wording, straight from the item the customer picked. */
export function durationLabel(b: Booking): string | null {
  const labels = b.items.map((i) => i.durationLabel).filter(Boolean)
  if (!labels.length) return null
  return labels.length === 1 ? labels[0] : `${labels.length} services`
}

/** When the job is (or was) meant to start: the scheduled slot, else when it was booked. */
export function startDate(b: Booking): Date {
  if (b.scheduled_at) return new Date(b.scheduled_at)
  if (b.started_at) return new Date(b.started_at)
  return new Date(b.created)
}

// en-IN renders "05:30 am"; the design shows "05:30 AM".
const time = (d: Date) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()

/** "10:00 AM – 12:00 PM" — only when the booked duration is known, else just the start time. */
export function timeRange(b: Booking): string {
  const s = startDate(b)
  const mins = bookingMinutes(b)
  if (!mins) return time(s)
  return `${time(s)} – ${time(new Date(s.getTime() + mins * 60000))}`
}

/**
 * "15 Jul 2026 · 05:30 AM – 06:30 AM" for the Date & Time row.
 *
 * Sourced from scheduled_at (types.ts calls it "ms epoch of the scheduled slot" — the
 * authoritative field) so this row cannot contradict the card above it. NOTE: bookings also carry
 * `date`/`time` display strings, and they can disagree with scheduled_at by the UTC→IST offset
 * (a slot stored as 00:00Z reads back as 05:30 IST). That mismatch is in the booking data, not here.
 */
export function scheduleDisplay(b: Booking): string {
  const d = startDate(b)
  const day = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${day} · ${timeRange(b)}`
}

/** Date medallion parts: MAY / 18 / Sun. */
export function medallion(b: Booking) {
  const d = statusDate(b) ?? startDate(b)
  return {
    month: d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
    day: d.toLocaleDateString('en-IN', { day: '2-digit' }),
    weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
  }
}

/** The date that defines this booking for its status (completed/cancelled fall back to created). */
export function statusDate(b: Booking): Date | null {
  if (b.status === 'completed' && b.completed_at) return new Date(b.completed_at)
  if (b.status === 'cancelled') return new Date(b.created)
  return b.scheduled_at ? new Date(b.scheduled_at) : null
}

const dayTime = (d: Date) =>
  `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}, ${time(d)}`

/**
 * The line under the price: the booked window while upcoming/active, or when it finished/was
 * cancelled. Returns null when the underlying timestamp is not present.
 */
export function whenLine(b: Booking): string | null {
  if (b.status === 'completed') return b.completed_at ? `Completed on ${dayTime(new Date(b.completed_at))}` : null
  if (b.status === 'cancelled') return `Cancelled on ${dayTime(new Date(b.created))}`
  if (b.status === 'in_progress') return b.started_at ? `Started at ${time(new Date(b.started_at))}` : null
  return timeRange(b)
}

/** Address split for the two-line card layout: "…Apartments, Banjara Hills" / "Hyderabad – 500034". */
export function addressLines(b: Booking): string[] {
  const raw = (b.address || '').trim()
  if (!raw) return []
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length <= 2) return [raw]
  return [parts.slice(0, -2).join(', '), parts.slice(-2).join(' – ')]
}

/** Month bucket key + label used to group a list ("May 2025"). */
export const monthKey = (b: Booking) => {
  const d = statusDate(b) ?? startDate(b)
  return `${d.getFullYear()}-${d.getMonth()}`
}
export const monthLabel = (b: Booking) => {
  const d = statusDate(b) ?? startDate(b)
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

/** Group bookings into month sections, newest month first. */
export function byMonth(list: Booking[]): { key: string; label: string; items: Booking[] }[] {
  const out: { key: string; label: string; items: Booking[] }[] = []
  for (const b of list) {
    const key = monthKey(b)
    const found = out.find((g) => g.key === key)
    if (found) found.items.push(b)
    else out.push({ key, label: monthLabel(b), items: [b] })
  }
  return out
}

/**
 * Progress through the live pipeline: "Step 2 of 5" + percent, derived from the booking's actual
 * status position in LIVE_STATUSES. Not a stored field — the status IS the progress.
 */
export function liveProgress(b: Booking): { step: number; total: number; pct: number; label: string } | null {
  const idx = LIVE_STATUSES.indexOf(b.status as BookingStatus)
  if (idx < 0) return null
  const step = idx + 1, total = LIVE_STATUSES.length
  return { step, total, pct: Math.round((step / total) * 100), label: LIVE_LABEL[b.status] || b.status }
}

/** Estimated completion = actual start + booked minutes. Null until the job has started. */
export function estimatedCompletion(b: Booking): string | null {
  const mins = bookingMinutes(b)
  if (!b.started_at || !mins) return null
  return time(new Date(new Date(b.started_at).getTime() + mins * 60000))
}

export const chipClass = (s: BookingStatus) =>
  s === 'completed' ? 'completed' : s === 'cancelled' ? 'cancelled' : 'upcoming'
