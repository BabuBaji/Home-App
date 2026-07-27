import { useEffect, useState } from 'react'
import { fetchBooking } from '../../api'
import type { Booking } from '../../types'

// Shared booking loader for the Module-6 live-job screens: fetches once + polls every 8s so
// every screen reflects the real backend status. No hardcoded data.
export function useJob(id: string | undefined, poll = true) {
  const bid = Number(id)
  const [b, setB] = useState<Booking | null>(null)
  useEffect(() => {
    if (!bid) return
    let stop = false
    const load = () => fetchBooking(bid).then((d) => { if (!stop) setB(d) }).catch(() => {})
    load()
    if (!poll) return () => { stop = true }
    const iv = setInterval(load, 8000)
    return () => { stop = true; clearInterval(iv) }
  }, [bid])
  return { b, bid, setB }
}

export const STATUS_IDX: Record<string, number> = {
  confirmed: 0, worker_assigned: 1, on_the_way: 2, arrived: 3, in_progress: 4, completed: 5, cancelled: 0,
}

// The 5-dot mini timeline shared by the tracking screens (matches the mock).
export const MINI_STEPS = ['Assigned', 'On the way', 'Started', 'In Progress', 'Completed']
// map booking status -> mini-step index reached
export const miniIdx = (status: string): number => {
  switch (status) {
    case 'confirmed': return 0
    case 'worker_assigned': return 0
    case 'on_the_way': return 1
    case 'arrived': return 1
    case 'in_progress': return 3
    case 'completed': return 4
    default: return 0
  }
}

export const proName = (b: Booking) => b.pro?.name || b.pro_name || 'Your Expert'
export const proInitial = (b: Booking) => (proName(b).trim()[0] || 'W').toUpperCase()
export const proPhone = (b: Booking) => b.pro?.phone || ''
export const proRating = (b: Booking) => b.pro?.rating ?? b.pro_rating ?? 4.7

export function fmtDateTime(b: Booking): string {
  if (b.type === 'instant') return 'Now (ASAP)'
  const parts = [b.date, b.time].filter(Boolean)
  return parts.length ? parts.join(', ') : 'Scheduled'
}

export const serviceNames = (b: Booking) => (b.items || []).map((i) => i.name).join(', ') || 'Home Service'

// Booked length in minutes — durationId first (authoritative), then the free-text label. Mirrors the
// server's rule. Shared by the live clock and the "ending soon" voice alert.
const DUR: Record<string, number> = { '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }
export function bookedMinutes(b: Booking): number {
  const id = b.items?.[0]?.durationId
  if (id && DUR[id]) return DUR[id]
  const s = String(b.duration || '')
  const n = parseInt(s, 10)
  if (!n) return 60
  return /h/i.test(s) && !/min/i.test(s) ? n * 60 : n
}

// Total service end time in ms (booked + approved extensions), or 0 if not started.
export function serviceEndMs(b: Booking): number {
  if (!b.started_at) return 0
  const total = bookedMinutes(b) + (b.extension_minutes || 0)
  return new Date(b.started_at).getTime() + total * 60000
}
