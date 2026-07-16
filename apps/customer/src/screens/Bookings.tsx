// 58 · My Bookings — the Orders hub: filter chips + a short preview of each group.
// Tapping a chip (or "View All") opens the dedicated list screen for that group.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Headset } from 'lucide-react'
import { BottomNav, Loading } from '../components/UI'
import OrderCard from '../components/OrderCard'
import { fetchBookings } from '../api'
import { isActive, isUpcoming } from '../orders'
import type { Booking } from '../types'

type Group = 'Upcoming' | 'Active' | 'Completed' | 'Cancelled'
const GROUPS: Group[] = ['Upcoming', 'Active', 'Completed', 'Cancelled']
const ROUTE: Record<Group, string> = {
  Upcoming: '/bookings/upcoming', Active: '/bookings/active',
  Completed: '/bookings/completed', Cancelled: '/bookings/cancelled',
}
const PREVIEW = 1   // rows per section on the hub; the full list lives behind "View All"

const inGroup = (b: Booking, g: Group): boolean =>
  g === 'Completed' ? b.status === 'completed'
    : g === 'Cancelled' ? b.status === 'cancelled'
      : g === 'Active' ? isActive(b.status)
        : isUpcoming(b.status)

export default function Bookings() {
  const nav = useNavigate()
  const [items, setItems] = useState<Booking[] | null>(null)

  useEffect(() => { fetchBookings().then(setItems).catch(() => setItems([])) }, [])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav('/support')} aria-label="Help & Support"><Headset size={18} /></button>
      <div className="titles"><h1>My Bookings</h1></div>
      <button className="iconbtn" onClick={() => nav('/notifications')} aria-label="Notifications"><Bell size={18} /></button>
    </header>
  )

  if (!items) return <div className="screen has-nav">{head}<Loading /><BottomNav /></div>

  const sections = GROUPS.map((g) => ({ g, list: items.filter((b) => inGroup(b, g)) })).filter((s) => s.list.length > 0)

  return (
    <div className="screen has-nav">
      {head}
      <div className="content">
        <div className="ord-chips">
          <button className="ord-chip active">All</button>
          {GROUPS.map((g) => (
            <button key={g} className="ord-chip" onClick={() => nav(ROUTE[g])}>{g}</button>
          ))}
        </div>

        {sections.length === 0 && (
          <div className="state"><div className="ico">🗓</div><h3>No bookings yet</h3><p>Your bookings will show up here.</p></div>
        )}

        {sections.map(({ g, list }) => (
          <section key={g} className="ord-sec">
            <div className="ord-sec-head">
              <h2>{g}</h2>
              <button className="ord-viewall" onClick={() => nav(ROUTE[g])}>View All</button>
            </div>
            <div className="ord-list">
              {list.slice(0, PREVIEW).map((b) => (
                <OrderCard key={b.id} b={b} onClick={() => nav(`/booking-details/${b.id}`)} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <BottomNav />
    </div>
  )
}
