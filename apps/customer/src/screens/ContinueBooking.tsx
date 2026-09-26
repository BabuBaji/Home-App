import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarClock } from 'lucide-react'
import { Loading } from '../components/UI'
import { fetchBookings, isContinuable } from '../api'
import { bookingPath } from '../orders'
import type { Booking } from '../types'
import { t, dateLocale } from '../i18n'

// Module 2 · #12 — Continue Booking. Lists the customer's resumable bookings (real data
// via fetchBookings); "Continue" opens the existing track/detail flow. No backend change.

function when(b: Booking) {
  if (b.date && b.time) return `${b.date}, ${b.time}`
  return new Date(b.created).toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ContinueBooking() {
  const nav = useNavigate()
  const [items, setItems] = useState<Booking[] | null>(null)

  useEffect(() => { fetchBookings().then(setItems).catch(() => setItems([])) }, [])

  const list = (items || []).filter((b) => isContinuable(b))
  const resume = (b: Booking) => nav(bookingPath(b))

  return (
    <div className="screen m2">
      <div className="ps-top">
        <button className="au-back" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <b>{t('Continue Booking')}</b>
        <span style={{ width: 42 }} />
      </div>

      {!items ? <Loading /> : (
        <div className="content">
          {list.length === 0 ? (
            <div className="state"><div className="ico"><CalendarClock size={44} /></div><h3>{t('Nothing to continue')}</h3><p>{t('Your active bookings will appear here.')}</p></div>
          ) : (
            <div className="cb-list">
              {list.map((b) => (
                <div key={b.id} className="cb-row">
                  <span className="cb-img">
                    <img src={`/services/${b.items[0]?.id}.jpg`} alt=""
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  </span>
                  <div className="cb-main">
                    <b>{t(b.items[0]?.name || 'Booking')}{b.items.length > 1 ? ` +${b.items.length - 1}` : ''}</b>
                    <small className="cb-when">{when(b)}</small>
                    <small className="cb-meta">{b.items.length === 1 ? t('1 Service') : t('{n} Services', { n: b.items.length })}</small>
                  </div>
                  <button className="cb-btn" onClick={() => resume(b)}>{t('Continue')}</button>
                </div>
              ))}
            </div>
          )}
          <button className="cb-all" onClick={() => nav('/bookings')}>{t('View All Bookings')}</button>

        </div>
      )}
    </div>
  )
}
