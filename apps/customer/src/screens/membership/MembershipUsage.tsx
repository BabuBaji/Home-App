// 78 · Usage History (membership) — the member's real completed bookings, framed as plan usage
// with the discount each booking earned. Amounts are real; the "Plan Discount" attribution is
// presentational until the membership backend exists.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, SlidersHorizontal, ChevronRight } from 'lucide-react'
import { Loading } from '../../components/UI'
import { fetchBookings } from '../../api'
import { money } from '../../membership'
import type { Booking } from '../../types'

type Tab = 'All' | 'Bookings' | 'Add-ons' | 'Discounts'
const TABS: Tab[] = ['All', 'Bookings', 'Add-ons', 'Discounts']
const monthKey = (b: Booking) => { const d = new Date(b.completed_at || b.created); return `${d.getFullYear()}-${d.getMonth()}` }
const monthLabel = (b: Booking) => new Date(b.completed_at || b.created).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
const dm = (b: Booking) => { const d = new Date(b.completed_at || b.created); return { day: d.toLocaleDateString('en-IN', { day: '2-digit' }), mon: d.toLocaleDateString('en-IN', { month: 'short' }) } }
// Illustrative plan saving per booking (10% of total) — shown as what a membership would have saved.
const planSaving = (b: Booking) => Math.round((b.total || 0) * 0.1)

export default function MembershipUsage() {
  const nav = useNavigate()
  const [items, setItems] = useState<Booking[] | null>(null)
  const [tab, setTab] = useState<Tab>('All')

  useEffect(() => { fetchBookings().then(setItems).catch(() => setItems([])) }, [])

  const groups = useMemo(() => {
    if (!items) return []
    const past = items.filter((b) => b.status === 'completed' || b.status === 'cancelled')
      .sort((a, b) => +new Date(b.completed_at || b.created) - +new Date(a.completed_at || a.created))
    const out: { key: string; label: string; items: Booking[] }[] = []
    for (const b of past) { const k = monthKey(b); const g = out.find((x) => x.key === k); if (g) g.items.push(b); else out.push({ key: k, label: monthLabel(b), items: [b] }) }
    return out
  }, [items])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Usage History</h1></div>
      <button className="iconbtn" aria-label="Filter"><SlidersHorizontal size={18} /></button>
    </header>
  )
  if (!items) return <div className="screen">{head}<Loading /></div>

  return (
    <div className="screen">
      {head}
      <div className="content">
        <div className="ord-chips">
          {TABS.map((t) => <button key={t} className={`ord-chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>

        {(groups.length === 0 || tab === 'Add-ons') && (
          <div className="state"><div className="ico">🕘</div><h3>No {tab === 'Add-ons' ? 'add-on ' : ''}usage yet</h3><p>Your plan usage appears here.</p></div>
        )}

        {tab !== 'Add-ons' && groups.map((g) => (
          <section key={g.key} className="ord-month">
            <h2 className="ord-month-h">{g.label}</h2>
            <div className="uh-list">
              {g.items.map((b) => {
                const m = dm(b); const primary = b.items[0]
                return (
                  <button key={b.id} className="uh-row" onClick={() => nav(`/booking-details/${b.id}`)}>
                    <span className="uh-med"><span className="uh-med-d">{m.day}</span><span className="uh-med-m">{m.mon}</span></span>
                    <span className="uh-main">
                      <span className="uh-name">{primary?.name}</span>
                      {primary?.durationLabel && <span className="uh-sub">{primary.durationLabel}</span>}
                      <span className="uh-note saved">Gold Plan Discount</span>
                    </span>
                    <span className="uh-amt saved">− {money(planSaving(b))}</span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}

        <button className="mem-compare-link" onClick={() => nav('/history')}>View More History <ChevronRight size={15} /></button>
      </div>
    </div>
  )
}
