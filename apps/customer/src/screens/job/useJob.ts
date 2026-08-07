import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchBooking, getSocket } from '../../api'
import type { Booking } from '../../types'

// Shared booking loader for the Module-6 live-job screens: fetches once, subscribes to the live
// booking room, and polls every 8s as a fallback so every screen reflects the real backend status.
// The socket matters because these screens auto-advance on status changes (see useAutoAdvance) —
// on the poll alone the customer would sit on a stale screen for up to 8s after the worker acts.
export function useJob(id: string | undefined, poll = true) {
  const bid = Number(id)
  const [b, setB] = useState<Booking | null>(null)
  useEffect(() => {
    if (!bid) return
    let stop = false
    const load = () => fetchBooking(bid).then((d) => { if (!stop) setB(d) }).catch(() => {})
    load()

    const s = getSocket()
    s.emit('booking:join', bid)
    const onUpd = (u: Booking) => { if (u.id === bid && !stop) setB((p) => (p ? { ...p, ...u } : u)) }
    // Rejoin + refetch after a dropped link or server restart, so the status never gets stuck.
    const onConnect = () => { s.emit('booking:join', bid); load() }
    s.on('booking:update', onUpd)
    s.on('connect', onConnect)

    const iv = poll ? setInterval(load, 8000) : null
    return () => {
      stop = true
      if (iv) clearInterval(iv)
      s.off('booking:update', onUpd); s.off('connect', onConnect); s.emit('booking:leave', bid)
    }
  }, [bid])
  return { b, bid, setB }
}

// Move the customer forward on their own as the worker drives the job: arrival opens the start-OTP
// screen, a verified OTP opens the live timer. Fires ONCE per booking+status per app session
// (sessionStorage) — without that guard, walking back to Booking Details (to cancel, say) would be
// bounced straight out again, trapping the back button.
export function useAutoAdvance(b: Booking | null, status: string, to: (id: number) => string) {
  const nav = useNavigate()
  useEffect(() => {
    if (!b || b.status !== status) return
    const key = `hh_adv_${b.id}_${status}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch { /* private mode — advance anyway, just without the once-only guard */ }
    nav(to(b.id), { replace: true })
  }, [b?.id, b?.status])
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
const DUR: Record<string, number> = { '30m': 30, '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }
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
