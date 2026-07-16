// 100 · Home Maintenance Calendar — a month calendar that marks the customer's real plan/booking
// dates, plus an "Upcoming Maintenance" list derived from active cleaning plans.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Wrench } from 'lucide-react'
import { BottomNav, Loading } from '../../components/UI'
import { fetchPlans, fetchBookings, type CleaningPlan } from '../../api'
import type { Booking } from '../../types'

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayDiff = (iso: string) => Math.ceil((+new Date(iso) - Date.now()) / 86400000)

export default function MaintenanceCalendar() {
  const nav = useNavigate()
  const [plans, setPlans] = useState<CleaningPlan[] | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })

  useEffect(() => {
    fetchPlans().then(setPlans).catch(() => setPlans([]))
    fetchBookings().then(setBookings).catch(() => {})
  }, [])

  // Dates (in this month) that have a plan or a scheduled booking → highlighted.
  const marked = useMemo(() => {
    const set = new Set<number>()
    const inMonth = (iso?: string | null) => { if (!iso) return; const d = new Date(iso); if (d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()) set.add(d.getDate()) }
    ;(plans || []).forEach((p) => inMonth(p.next_date))
    bookings.forEach((b) => inMonth(b.scheduled_at ? new Date(b.scheduled_at).toISOString() : b.date ? null : b.created))
    return set
  }, [plans, bookings, month])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Home Maintenance Calendar</h1></div>
      <button className="iconbtn" onClick={() => nav('/ai/planner')} aria-label="Plans"><CalendarDays size={18} /></button>
    </header>
  )
  if (!plans) return <div className="screen has-nav">{head}<Loading /><BottomNav /></div>

  const first = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const today = new Date()
  const isToday = (d: number) => today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth() && today.getDate() === d

  const upcoming = (plans.filter((p) => p.active && p.next_date) as (CleaningPlan & { next_date: string })[])
    .sort((a, b) => +new Date(a.next_date) - +new Date(b.next_date)).slice(0, 5)

  return (
    <div className="screen has-nav">
      {head}
      <div className="content">
        <div className="cal">
          <div className="cal-head">
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <span>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="cal-grid cal-wd">{WD.map((w) => <span key={w}>{w}</span>)}</div>
          <div className="cal-grid">
            {cells.map((d, i) => (
              <span key={i} className={`cal-cell ${d && marked.has(d) ? 'marked' : ''} ${d && isToday(d) ? 'today' : ''}`}>{d || ''}</span>
            ))}
          </div>
        </div>

        <div className="hhs-tiles-h">Upcoming Maintenance</div>
        {upcoming.length === 0 ? (
          <div className="state"><div className="ico">🛠️</div><h3>Nothing scheduled</h3><p>Add a plan to see upcoming maintenance.</p></div>
        ) : (
          <div className="ws-card">
            {upcoming.map((p) => {
              const dd = dayDiff(p.next_date)
              return (
                <div key={p.id} className="mc-row">
                  <span className="mc-date"><b>{new Date(p.next_date).getDate()}</b><small>{new Date(p.next_date).toLocaleDateString('en-IN', { month: 'short' })}</small></span>
                  <div className="mc-main"><div className="mc-t">{p.name}</div><div className="mc-d">{p.frequency}</div></div>
                  <span className="mc-in">{dd <= 0 ? 'Due Today' : dd === 1 ? 'Tomorrow' : `In ${dd} Days`}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
