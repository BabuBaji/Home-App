import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, BottomNav, Loading } from '../components/UI'
import { ServiceThumb } from '../serviceArt'
import { fetchBookings } from '../api'
import type { Booking } from '../types'

const ACTIVE = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']

/** Dedicated "Service History" — a clean flat list of the customer's past services
 *  (completed & cancelled), newest first. Tap a row to open its full booking detail. */
export default function History() {
  const nav = useNavigate()
  const [items, setItems] = useState<Booking[] | null>(null)

  useEffect(() => { fetchBookings().then(setItems).catch(() => setItems([])) }, [])
  if (!items) return <div className="screen has-nav"><Header title="Service History" back={false} /><Loading /><BottomNav /></div>

  const past = items
    .filter((b) => !ACTIVE.includes(b.status))
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())

  const dateLabel = (b: Booking) =>
    b.type === 'instant' || !b.date
      ? new Date(b.created).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : `${b.date}${b.time ? ', ' + b.time : ''}`

  return (
    <div className="screen has-nav">
      <Header title="Service History" back={false} />
      <div className="content">
        {past.length === 0 && (
          <div className="state"><div className="ico">🕘</div><h3>No service history yet</h3><p>Services you've completed will appear here.</p></div>
        )}

        <div className="hist-list">
          {past.map((b) => {
            const primary = b.items[0]
            const extra = b.items.length - 1
            return (
              <button key={b.id} className="hist-row" onClick={() => nav(`/booking/${b.id}`)}>
                <span className="hist-thumb">
                  <ServiceThumb service={{ id: primary.id, name: primary.name, image: `/services/${primary.id}.jpg` }} medallion={40} />
                </span>
                <span className="hist-main">
                  <span className="hist-name">{primary.name}{extra > 0 ? ` +${extra} more` : ''}</span>
                  <span className="hist-sub">{dateLabel(b)} · {b.pro_name || '—'}</span>
                </span>
                <span className="hist-right">
                  <span className="hist-price">₹{b.total}</span>
                  {b.status === 'cancelled'
                    ? <span className="status-chip cancelled">Cancelled</span>
                    : b.rating
                      ? <span className="hist-rate">⭐ {b.rating}</span>
                      : <span className="status-chip completed">Completed</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
