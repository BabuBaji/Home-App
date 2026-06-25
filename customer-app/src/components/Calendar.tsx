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
