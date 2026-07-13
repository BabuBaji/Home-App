import { useState } from 'react'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
export function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
export function fmtDate(d: Date) {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`
}

export default function Calendar({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const today = startOfDay(new Date())
  const [view, setView] = useState(new Date(value.getFullYear(), value.getMonth(), 1))
  const year = view.getFullYear()
  const month = view.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  // can't navigate to a month before the current month
  const canPrev = year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth())

  return (
    <div className="card cal">
      <div className="cal-head">
        <button onClick={() => canPrev && setView(new Date(year, month - 1, 1))} disabled={!canPrev}>‹</button>
        <span className="m">{MONTHS[month]} {year}</span>
        <button onClick={() => setView(new Date(year, month + 1, 1))}>›</button>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />
          const date = new Date(year, month, d)
          const past = date < today
          const selected = sameDay(date, value)
          const isToday = sameDay(date, today)
          return (
            <div
              key={d}
              className={`cal-day ${selected ? 'sel' : ''} ${past ? 'past' : ''} ${isToday && !selected ? 'today' : ''}`}
              onClick={() => { if (!past) onChange(date) }}
            >
              {d}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 12 hourly slots 08:00–19:00. On "today" the slots already past are disabled. */
export const SLOT_HOURS = Array.from({ length: 12 }, (_, i) => 8 + i)
export function slotLabel(h: number) {
  const ap = h >= 12 ? 'PM' : 'AM'
  const hh = h > 12 ? h - 12 : h
  return `${String(hh).padStart(2, '0')}:00 ${ap}`
}
export function isSlotDisabled(date: Date, h: number) {
  const now = new Date()
  return sameDay(date, startOfDay(now)) && h <= now.getHours()
}

/** A zone's working-hours config (from GET /api/zone-hours). null/is247 → all-day availability. */
export interface ZoneHours {
  is247: boolean
  days: Record<string, { open: string; close: string; closed: boolean; brStart?: string; brEnd?: string }> | null
  specialHours: { id?: string; label?: string; date?: string; open: string; close: string }[]
}
const _minOf = (t?: string) => { const m = /(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null }
const _DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']   // getDay() 0=Sun … 6=Sat
const _ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/**
 * Bookable hour-slots for a date, derived from the zone's working hours.
 * - no hours / not configured → the default 08:00–19:00 grid (backward compatible)
 * - 24×7 → every hour
 * - a special-hours entry for that exact date overrides the weekday schedule
 * - a closed day → [] (caller shows a "closed" message)
 * The daily break window is removed from the returned hours.
 */
export function allowedHours(zh: ZoneHours | null, date: Date): number[] {
  if (zh && zh.is247) return Array.from({ length: 24 }, (_, i) => i)
  if (!zh || !zh.days) return SLOT_HOURS   // no zone / no hours configured → default grid
  const sp = (zh.specialHours || []).find((s) => s.date && s.date === _ymd(date))
  let openMin: number, closeMin: number, brS: number | null = null, brE: number | null = null
  if (sp) { openMin = _minOf(sp.open) ?? 0; closeMin = _minOf(sp.close) ?? 1440 }
  else {
    const day = zh.days ? zh.days[_DOW[date.getDay()]] : null
    if (!day || day.closed) return []
    openMin = _minOf(day.open) ?? 0; closeMin = _minOf(day.close) ?? 1440
    brS = _minOf(day.brStart); brE = _minOf(day.brEnd)
  }
  const out: number[] = []
  for (let h = 0; h < 24; h++) {
    const m = h * 60
    if (m < openMin || m >= closeMin) continue
    if (brS != null && brE != null && m >= brS && m < brE) continue
    out.push(h)
  }
  return out
}
