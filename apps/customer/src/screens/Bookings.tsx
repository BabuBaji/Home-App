import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Headset } from 'lucide-react'
import { BottomNav, Loading } from '../components/UI'
import SupportChat from '../components/SupportChat'
import { ServiceThumb } from '../serviceArt'
import { fetchBookings } from '../api'
import type { Booking } from '../types'

type Tab = 'Upcoming' | 'Completed' | 'Cancelled'
const ACTIVE = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']
const LIVE_LABEL: Record<string, string> = { confirmed: 'Confirmed', worker_assigned: 'Assigned', on_the_way: 'On the Way', arrived: 'Arrived', in_progress: 'In Progress' }

export default function Bookings() {
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('Upcoming')
  const [items, setItems] = useState<Booking[] | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  const head = (
    <header className="appbar bk-appbar">
      <span className="iconbtn ghost" />
      <div className="titles"><h1>My Bookings</h1></div>
      <button className="help-btn" onClick={() => setShowHelp(true)} aria-label="Help"><Headset size={15} /> HELP</button>
    </header>
  )

  useEffect(() => { fetchBookings().then(setItems).catch(() => setItems([])) }, [])
  if (!items) return <div className="screen has-nav">{head}<Loading /><BottomNav />{showHelp && <SupportChat onClose={() => setShowHelp(false)} />}</div>

  const list = items.filter((b) => tab === 'Upcoming' ? ACTIVE.includes(b.status) : tab === 'Cancelled' ? b.status === 'cancelled' : b.status === 'completed')

  const chip = (b: Booking) => {
    const cls = b.status === 'completed' ? 'completed' : b.status === 'cancelled' ? 'cancelled' : 'upcoming'
    const label = b.status === 'completed' ? 'Completed' : b.status === 'cancelled' ? 'Cancelled' : (LIVE_LABEL[b.status] || b.status)
    return <span className={`status-chip ${cls}`}>{label}</span>
  }
  const dateLabel = (b: Booking) => b.type === 'instant' || !b.date
    ? new Date(b.created).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : `${b.date}, ${b.time}`

  return (
    <div className="screen has-nav">
      {head}
      <div className="content">
        <div className="tabs">{(['Upcoming', 'Completed', 'Cancelled'] as Tab[]).map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>

        {list.length === 0 && <div className="state"><div className="ico">🗓</div><h3>No {tab.toLowerCase()} bookings</h3><p>They'll show up here.</p></div>}

        <div className="bkc-list">
          {list.map((b) => {
            const primary = b.items[0]
            const extra = b.items.length - 1
            const live = ACTIVE.includes(b.status)
            return (
              <button key={b.id} className="bkc" onClick={() => nav(`/booking/${b.id}`)}>
                <span className="bkc-thumb"><ServiceThumb service={{ id: primary.id, name: primary.name, image: `/services/${primary.id}.jpg` }} medallion={38} /></span>
                <span className="bkc-main">
                  <span className="bkc-name">{primary.name}{extra > 0 ? ` +${extra}` : ''}</span>
                  <span className="bkc-date">{dateLabel(b)}</span>
                  <span className="bkc-meta">{b.status === 'cancelled' ? (b.cancel_reason || 'Cancelled') : (b.pro_name || 'Expert')} · ₹{b.total}</span>
                </span>
                <span className="bkc-right">
                  {chip(b)}
                  {b.rating ? <span className="bkc-rate">⭐ {b.rating}</span> : <span className="bkc-go">{live ? 'Track' : 'Details'} ›</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <BottomNav />
      {showHelp && <SupportChat onClose={() => setShowHelp(false)} />}
    </div>
  )
}
