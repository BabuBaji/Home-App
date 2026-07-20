import { useState } from 'react'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
export function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
export function fmtDate(d: Date) {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`
}

export default function Calendar({ value, onChange, zh }: { value: Date; onChange: (d: Date) => void; zh?: ZoneHours | null }) {
  const today = startOfDay(new Date())
  // a date is "closed" when the zone doesn't operate that weekday (no bookable hours)
  const isClosedDate = (date: Date) => !!zh && !zh.is247 && !!zh.days && allowedHours(zh, date).length === 0
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
          const closed = !past && isClosedDate(date)
          const selected = sameDay(date, value)
          const isToday = sameDay(date, today)
          return (
            <div
              key={d}
              className={`cal-day ${selected ? 'sel' : ''} ${past ? 'past' : ''} ${closed ? 'closed' : ''} ${isToday && !selected ? 'today' : ''}`}
              onClick={() => { if (!past && !closed) onChange(date) }}
              title={closed ? 'Closed this day' : undefined}
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
/** A date's open window in MINUTES from midnight. null → no window configured (unrestricted). */
export interface DayWindow { closed: boolean; openMin: number; closeMin: number; brStart: number | null; brEnd: number | null }
export function zoneWindow(zh: ZoneHours | null, date: Date): DayWindow | null {
  if (!zh || zh.is247 || !zh.days) return null   // 24×7 / unconfigured → caller treats as unrestricted
  const sp = (zh.specialHours || []).find((s) => s.date && s.date === _ymd(date))
  if (sp) return { closed: false, openMin: _minOf(sp.open) ?? 0, closeMin: _minOf(sp.close) ?? 1440, brStart: null, brEnd: null }
  const day = zh.days[_DOW[date.getDay()]]
  if (!day || day.closed) return { closed: true, openMin: 0, closeMin: 0, brStart: null, brEnd: null }
  return { closed: false, openMin: _minOf(day.open) ?? 0, closeMin: _minOf(day.close) ?? 1440, brStart: _minOf(day.brStart), brEnd: _minOf(day.brEnd) }
}
/** Is a minute-of-day inside the window and off-break? Mirrors booking/server.js withinWindow(). */
function _within(win: DayWindow, m: number): boolean {
  if (win.closed) return false
  if (m < win.openMin || m >= win.closeMin) return false
  if (win.brStart != null && win.brEnd != null && m >= win.brStart && m < win.brEnd) return false
  return true
}

export function allowedHours(zh: ZoneHours | null, date: Date): number[] {
  if (zh && zh.is247) return Array.from({ length: 24 }, (_, i) => i)
  if (!zh || !zh.days) return SLOT_HOURS   // no zone / no hours configured → default grid
  const win = zoneWindow(zh, date)
  if (!win || win.closed) return []
  const out: number[] = []
  for (let h = 0; h < 24; h++) if (_within(win, h * 60)) out.push(h)
  return out
}

/**
 * Is the zone open at THIS moment? (instant bookings need this.) True when unconfigured / 24×7.
 * Compares MINUTES, not whole hours: an hour-granular check reads a 14:02 close as "open until
 * 14:59", because the 14:00 slot still starts before the cutoff. That let instant look bookable
 * past close, and the customer only hit the wall at payment when the server (which is
 * minute-accurate) rejected it. Keep this in step with booking/server.js withinWindow().
 */
export function isZoneOpenNow(zh: ZoneHours | null): boolean {
  const now = new Date()
  const win = zoneWindow(zh, now)
  if (!win) return true                     // unconfigured / 24×7 → unrestricted
  return _within(win, now.getHours() * 60 + now.getMinutes())
}

/** Today's "6:00 AM – 9:00 PM" label for messaging (empty if closed today / unconfigured). */
export function todayHoursLabel(zh: ZoneHours | null): string {
  if (!zh || zh.is247 || !zh.days) return ''
  const now = new Date()
  const day = zh.days[_DOW[now.getDay()]]
  if (!day || day.closed) return ''
  const fmt = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}` }
  return `${fmt(day.open)} – ${fmt(day.close)}`
}
