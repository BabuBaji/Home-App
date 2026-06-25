import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, BottomNav, Loading, useToast } from '../components/UI'
import { fetchBookings } from '../api'
import { useStore } from '../store'
import type { Booking } from '../types'

type Tab = 'Upcoming' | 'Completed' | 'Cancelled'
const ACTIVE = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']

export default function Bookings() {
  const nav = useNavigate()
  const toast = useToast()
  const { setBookingType } = useStore()
  const [tab, setTab] = useState<Tab>('Upcoming')
  const [items, setItems] = useState<Booking[] | null>(null)

  useEffect(() => { fetchBookings().then(setItems).catch(() => setItems([])) }, [])
  if (!items) return <div className="screen has-nav"><Header title="My Bookings" back={false} /><Loading /><BottomNav /></div>

  const list = items.filter((b) => tab === 'Upcoming' ? ACTIVE.includes(b.status) : tab === 'Cancelled' ? b.status === 'cancelled' : b.status === 'completed')

  function rebook(b: Booking) {
    setBookingType('instant'); nav(`/book/${b.items[0].id}`)
  }
  function invoice(b: Booking) {
    const lines = [
      'HomeHelp — Tax Invoice', '====================', `Booking: ${b.ref}`, `Date: ${new Date(b.created).toLocaleString('en-IN')}`,
      `Status: ${b.status}`, '', 'Services:', ...b.items.map((i) => `  ${i.name} (${i.durationLabel}) - Rs.${i.price}`), '',
      `Item total: Rs.${b.subtotal}`, `Platform fee: Rs.${b.fee}`, `Taxes: Rs.${b.tax}`, `Discount: -Rs.${b.discount}`, `TOTAL: Rs.${b.total}`,
      `Payment: ${b.payment.toUpperCase()} (${b.payment_status})`, '', 'Thank you for choosing HomeHelp!',
    ].join('\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Invoice-${b.ref.replace('#', '')}.txt`; a.click()
    toast('Invoice downloaded')
  }

  const chip = (s: string) => s === 'completed' ? <span className="status-chip completed">Completed</span>
    : s === 'cancelled' ? <span className="status-chip cancelled">Cancelled</span>
      : <span className="status-chip upcoming">{({ confirmed: 'Confirmed', worker_assigned: 'Assigned', on_the_way: 'On the Way', arrived: 'Arrived', in_progress: 'In Progress' } as any)[s]}</span>

  return (
    <div className="screen has-nav">
      <Header title="My Bookings" back={false} />
      <div className="content">
        <div className="tabs">{(['Upcoming', 'Completed', 'Cancelled'] as Tab[]).map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>

        {list.length === 0 && <div className="state"><div className="ico">🗓</div><h3>No {tab.toLowerCase()} bookings</h3><p>They'll show up here.</p></div>}

        {list.map((b) => {
          const live = ACTIVE.includes(b.status)
          return (
            <div key={b.id} className="card bk-card">
              <div className="bk-top">
                <div><div className="bk-date">{b.type === 'instant' ? new Date(b.created).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' · Instant' : `${b.date}, ${b.time}`}</div>
                  <div className="bk-svcs">{b.items.map((i) => i.name).join(', ')}</div></div>
                {chip(b.status)}
              </div>
              <div className="bk-mid"><span className="ava-sm">{b.pro_name?.[0]}</span><span className="pn">{b.status === 'cancelled' ? (b.cancel_reason || 'Cancelled') : b.pro_name}</span><span className="price">₹{b.total}</span>{b.rating ? <span className="rt">⭐ {b.rating}</span> : null}</div>
              <div className="bk-actions">
                {live && <button className="bk-btn primary" onClick={() => nav(`/track/${b.id}`)}>Track</button>}
                {b.status === 'completed' && !b.rating && <button className="bk-btn primary" onClick={() => nav(`/rate/${b.id}`)}>Rate</button>}
                {b.status !== 'cancelled' && b.status !== 'confirmed' && <button className="bk-btn" onClick={() => invoice(b)}>Invoice</button>}
                {!live && <button className="bk-btn" onClick={() => rebook(b)}>Rebook</button>}
                {live && <button className="bk-btn" onClick={() => nav(`/cancel/${b.id}`)}>Cancel</button>}
              </div>
            </div>
          )
        })}

        <div className="banner-soft help" onClick={() => nav('/support')} style={{ cursor: 'pointer' }}>
          <span className="bi">🎧</span><div className="grow"><div className="bt">Need help with a booking?</div><div className="bd">Raise a support request.</div></div><span>›</span>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
