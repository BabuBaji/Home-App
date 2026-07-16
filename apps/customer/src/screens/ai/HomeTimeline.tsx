// 106 · Home Timeline — a real activity feed merging bookings + wallet transactions
// (aiHome.timeline), grouped by day with filter chips.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, SlidersHorizontal, CheckCircle2, Clock, Info } from 'lucide-react'
import { BottomNav, Loading } from '../../components/UI'
import { fetchBookings, fetchWallet } from '../../api'
import { timeline, byDay, timeStr, type TimelineItem } from '../../aiHome'
import type { Booking, Transaction } from '../../types'

type Tab = 'All' | 'Services' | 'Reminders' | 'Payments'
const TABS: Tab[] = ['All', 'Services', 'Reminders', 'Payments']

export default function HomeTimeline() {
  const nav = useNavigate()
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [txns, setTxns] = useState<Transaction[]>([])
  const [tab, setTab] = useState<Tab>('All')

  useEffect(() => {
    fetchBookings().then(setBookings).catch(() => setBookings([]))
    fetchWallet().then((w) => setTxns(w.transactions)).catch(() => {})
  }, [])

  const groups = useMemo(() => {
    if (!bookings) return []
    const all = timeline(bookings, txns).filter((i) =>
      tab === 'All' ? true : tab === 'Payments' ? i.kind === 'payment' : tab === 'Reminders' ? i.kind === 'reminder' : i.kind === 'booking')
    return byDay(all)
  }, [bookings, txns, tab])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Home Timeline</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!bookings) return <div className="screen has-nav">{head}<Loading /><BottomNav /></div>

  const Icon = ({ s }: { s: TimelineItem['status'] }) =>
    s === 'ok' ? <CheckCircle2 size={15} /> : s === 'pending' ? <Clock size={15} /> : <Info size={15} />

  return (
    <div className="screen has-nav">
      {head}
      <div className="content">
        <div className="ord-chips">
          {TABS.map((t) => <button key={t} className={`ord-chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>

        {groups.length === 0 && <div className="state"><div className="ico">🕘</div><h3>Nothing here yet</h3><p>Your home activity will appear on this timeline.</p></div>}

        {groups.map((g) => (
          <section key={g.label} className="tl-day">
            <h2 className="tl-day-h">{g.label}</h2>
            <div className="tl-list">
              {g.items.map((it) => (
                <div key={it.id} className="tl-item">
                  <span className="tl-time">{timeStr(it.at)}</span>
                  <span className={`tl-dot ${it.status}`}><Icon s={it.status} /></span>
                  <div className="tl-main"><div className="tl-title">{it.title}</div><div className="tl-sub">{it.sub}</div></div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <BottomNav />
    </div>
  )
}
