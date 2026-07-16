// 98 · AI Recommendations — services that are due, computed from the customer's booking history +
// the live catalog (aiHome.recommendations). Book Now opens the real booking flow for that service.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, Bot } from 'lucide-react'
import { BottomNav, Loading } from '../../components/UI'
import { ServiceThumb } from '../../serviceArt'
import { fetchBookings, fetchServices } from '../../api'
import { useStore } from '../../store'
import { recommendations } from '../../aiHome'
import type { Booking, Service } from '../../types'

export default function AIRecommendations() {
  const nav = useNavigate()
  const { pincode } = useStore()
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [services, setServices] = useState<Service[] | null>(null)

  useEffect(() => {
    fetchBookings().then(setBookings).catch(() => setBookings([]))
    fetchServices(pincode || undefined).then((c) => setServices(c.services)).catch(() => setServices([]))
  }, [pincode])

  const recs = useMemo(() => (bookings && services) ? recommendations(bookings, services) : null, [bookings, services])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>AI Recommendations</h1></div>
      <button className="iconbtn" onClick={() => nav('/notifications')} aria-label="Notifications"><Bell size={18} /></button>
    </header>
  )
  if (!recs) return <div className="screen has-nav">{head}<Loading /><BottomNav /></div>

  return (
    <div className="screen has-nav">
      {head}
      <div className="content">
        <div className="air-hero">
          <div><div className="air-hero-t">AI says</div><div className="air-hero-b">Your home can be even better!</div><div className="air-hero-d">We found {recs.length} smart recommendations for you.</div></div>
          <span className="air-hero-bot"><Bot size={26} /></span>
        </div>

        <div className="hhs-tiles-h">Recommended for You</div>
        {recs.length === 0 ? (
          <div className="state"><div className="ico">✨</div><h3>You're all caught up</h3><p>No services are due right now.</p></div>
        ) : (
          <div className="air-list">
            {recs.map((r) => (
              <div key={r.service.id} className="air-card">
                <span className="air-thumb"><ServiceThumb service={{ id: r.service.id, name: r.service.name, image: `/services/${r.service.id}.jpg` }} medallion={30} /></span>
                <div className="air-main">
                  <div className="air-name">{r.service.name}</div>
                  <div className="air-note">{r.note}</div>
                </div>
                <button className="air-book" onClick={() => nav(`/service/${r.service.id}`)}>Book Now</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
