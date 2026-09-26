// 59 · Upcoming   60 · Active   61 · Completed   62 · Cancelled bookings
// One list screen, month-grouped, driven by the :status route param.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, SlidersHorizontal, Check } from 'lucide-react'
import { Loading } from '../components/UI'
import OrderCard from '../components/OrderCard'
import { pushBackHandler } from '../backStack'
import { fetchBookings } from '../api'
import { byMonth, isUpcoming, isActive, bookingPath } from '../orders'
import type { Booking } from '../types'
import { t } from '../i18n'

type Kind = 'upcoming' | 'active' | 'completed' | 'cancelled'
const TITLE: Record<Kind, string> = {
  upcoming: 'Upcoming Bookings', active: 'Active Bookings', completed: 'Completed Bookings', cancelled: 'Cancelled Bookings',
}
const EMPTY: Record<Kind, string> = {
  upcoming: 'No upcoming bookings', active: 'No active bookings', completed: 'No completed bookings', cancelled: 'No cancelled bookings',
}
const belongs = (b: Booking, k: Kind) =>
  k === 'completed' ? b.status === 'completed' : k === 'cancelled' ? b.status === 'cancelled' : k === 'active' ? isActive(b.status) : isUpcoming(b.status)

// Newest first, by the date each group is actually keyed on.
const when = (b: Booking) => new Date(b.completed_at || b.scheduled_at || b.created).getTime()

export default function OrdersList() {
  const { status } = useParams()
  const nav = useNavigate()
  const kind: Kind = status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : status === 'active' ? 'active' : 'upcoming'
  const [items, setItems] = useState<Booking[] | null>(null)
  const [sort, setSort] = useState<'new' | 'old'>('new')
  const [showSort, setShowSort] = useState(false)

  useEffect(() => { fetchBookings().then(setItems).catch(() => setItems([])) }, [])
  useEffect(() => { if (showSort) return pushBackHandler(() => setShowSort(false)) }, [showSort])

  const groups = useMemo(() => {
    if (!items) return []
    const list = items.filter((b) => belongs(b, kind))
      .sort((a, b) => sort === 'new' ? when(b) - when(a) : when(a) - when(b))
    return byMonth(list)
  }, [items, kind, sort])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => (window.history.state?.idx > 0 ? nav(-1) : nav('/bookings'))} aria-label={t('Back')}><ArrowLeft size={18} /></button>
      <div className="titles"><h1>{t(TITLE[kind])}</h1></div>
      <button className="iconbtn" onClick={() => setShowSort(true)} aria-label={t('Sort')}><SlidersHorizontal size={18} /></button>
    </header>
  )

  if (!items) return <div className="screen">{head}<Loading /></div>

  return (
    <div className="screen">
      {head}
      <div className="content">
        {groups.length === 0 && (
          <div className="state"><div className="ico">🗓</div><h3>{t(EMPTY[kind])}</h3><p>{t("They'll show up here.")}</p></div>
        )}
        {groups.map((g) => (
          <section key={g.key} className="ord-month">
            <h2 className="ord-month-h">{g.label}</h2>
            <div className="ord-list">
              {g.items.map((b) => (
                <OrderCard key={b.id} b={b} onClick={() => nav(bookingPath(b))} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {showSort && (
        <div className="sheet-wrap" onClick={() => setShowSort(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-h">{t('Sort by')}</div>
            {([['new', 'Newest first'], ['old', 'Oldest first']] as const).map(([v, label]) => (
              <button key={v} className="sheet-row" onClick={() => { setSort(v); setShowSort(false) }}>
                <span>{t(label)}</span>{sort === v && <Check size={16} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
