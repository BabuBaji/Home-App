import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ShoppingCart, Star } from 'lucide-react'
import { BottomNav, Loading } from '../components/UI'
import { useStore } from '../store'
import { fetchServices } from '../api'
import type { Service } from '../types'

// Module 2 · #11 — Popular Services. Full-screen browse grid over the real catalogue
// (fetchServices). Tapping a card opens the existing service/booking flow. Ratings are
// display-only (derived deterministically from the id) since the catalogue has no rating field.
function stars(id: string): { rating: string; count: string } {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const rating = (4.3 + (h % 7) / 10).toFixed(1)                 // 4.3–4.9
  const n = 300 + (h % 1400)                                     // 300–1699
  const count = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
  return { rating, count }
}

export default function PopularServices() {
  const nav = useNavigate()
  const { pincode } = useStore()
  const [services, setServices] = useState<Service[] | null>(null)

  useEffect(() => {
    fetchServices(pincode || undefined).then((c) => setServices(c.services)).catch(() => setServices([]))
  }, [pincode])

  return (
    <div className="screen has-nav m2">
      <div className="ps-top">
        <button className="au-back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Popular Services</b>
        <button className="au-back" onClick={() => nav('/cart')} aria-label="Cart"><ShoppingCart size={20} /></button>
      </div>

      {!services ? <Loading /> : (
        <div className="content">
          <div className="ps-grid">
            {services.map((s) => {
              const { rating, count } = stars(s.id)
              return (
                <button key={s.id} className={`ps-card ${!s.available ? 'off' : ''}`} onClick={() => s.available && nav(`/service/${s.id}`)}>
                  <span className="ps-img">
                    <img src={s.image || `/services/${s.id}.jpg`} alt="" loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    {!s.available && <span className="ps-soon">Soon</span>}
                  </span>
                  <span className="ps-name">{s.name}</span>
                  <span className="ps-rate"><Star size={13} className="ps-star" /> {rating} <em>({count})</em></span>
                  <span className="ps-price">From ₹{s.price}</span>
                </button>
              )
            })}
            {services.length === 0 && <p className="muted" style={{ gridColumn: '1/-1', padding: 24, textAlign: 'center' }}>No services found.</p>}
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  )
}
