import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarClock } from 'lucide-react'
import { BottomNav, Loading } from '../components/UI'
import { fetchBookings } from '../api'
import type { Booking } from '../types'

// Module 2 · #12 — Continue Booking. Lists the customer's resumable bookings (real data
// via fetchBookings); "Continue" opens the existing track/detail flow. No backend change.
const ACTIVE = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']

function when(b: Booking) {
  if (b.date && b.time) return `${b.date}, ${b.time}`
  return new Date(b.created).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ContinueBooking() {
  const nav = useNavigate()
  const [items, setItems] = useState<Booking[] | null>(null)

  useEffect(() => { fetchBookings().then(setItems).catch(() => setItems([])) }, [])

  const list = (items || []).filter((b) => b.status !== 'cancelled' && b.status !== 'completed')
  const resume = (b: Booking) => nav(ACTIVE.includes(b.status) ? `/track/${b.id}` : `/booking/${b.id}`)

  return (
    <div className="screen has-nav m2">
      <div className="ps-top">
        <button className="au-back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Continue Booking</b>
        <span style={{ width: 42 }} />
      </div>

      {!items ? <Loading /> : (
        <div className="content">
          {list.length === 0 ? (
            <div className="state"><div className="ico"><CalendarClock size={44} /></div><h3>Nothing to continue</h3><p>Your active bookings will appear here.</p></div>
          ) : (
            <div className="cb-list">
              {list.map((b) => (
                <div key={b.id} className="cb-row">
                  <span className="cb-img">
                    <img src={`/services/${b.items[0]?.id}.jpg`} alt=""
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  </span>
                  <div className="cb-main">
                    <b>{b.items[0]?.name || 'Booking'}{b.items.length > 1 ? ` +${b.items.length - 1}` : ''}</b>
                    <small className="cb-when">{when(b)}</small>
                    <small className="cb-meta">{b.items.length} {b.items.length === 1 ? 'Service' : 'Services'}</small>
                  </div>
                  <button className="cb-btn" onClick={() => resume(b)}>Continue</button>
                </div>
              ))}
            </div>
          )}
          <button className="cb-all" onClick={() => nav('/bookings')}>View All Bookings</button>
        </div>
      )}
      <BottomNav />
    </div>
  )
}
