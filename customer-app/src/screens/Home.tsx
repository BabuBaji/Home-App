import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomNav } from '../components/UI'
import { useStore } from '../store'
import { fetchServices, fetchBookings } from '../api'
import type { Service, Booking } from '../types'

const ACTIVE = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']

export default function Home() {
  const nav = useNavigate()
  const { user, cart } = useStore()
  const [services, setServices] = useState<Service[]>([])
  const [cats, setCats] = useState<string[]>([])
  const [cat, setCat] = useState('All')
  const [q, setQ] = useState('')
  const [active, setActive] = useState<Booking | null>(null)

  useEffect(() => {
    fetchServices().then((c) => { setServices(c.services); setCats(c.categories) }).catch(() => {})
    fetchBookings().then((bs) => setActive(bs.find((b) => ACTIVE.includes(b.status)) || null)).catch(() => {})
  }, [])

  const filtered = useMemo(() => services.filter((s) =>
    (cat === 'All' || s.category === cat) && s.name.toLowerCase().includes(q.toLowerCase())), [services, cat, q])

  return (
    <div className="screen has-nav">
      <div className="content home2">
        {/* location + bell */}
        <div className="loc-bar">
          <div className="loc">
            <span className="muted sm">📍 Current location</span>
            <div className="loc-line">Bandra West, Mumbai ▾</div>
          </div>
          <button className="iconbtn ghost" onClick={() => nav('/support')}>🎧</button>
        </div>

        {/* search */}
        <div className="search">
          <span>🔍</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a service…" />
        </div>

        {/* hero */}
        <div className="hero-banner">
          <div className="hb-text">
            <div className="sm">⚡ House help in 10 minutes</div>
            <div className="hb-title">Hi {user?.name?.split(' ')[0] || 'there'}, need help today?</div>
          </div>
          <div className="hb-emoji">🧹</div>
        </div>

        {/* active booking */}
        {active && (
          <div className="active-card" onClick={() => nav(`/track/${active.id}`)}>
            <span className="ac-dot" />
            <div className="grow">
              <div className="ac-t">Booking in progress · {statusLabel(active.status)}</div>
              <div className="ac-d">{active.items.map((i) => i.name).join(', ')}</div>
            </div>
            <span className="ac-go">Track ›</span>
          </div>
        )}

        {/* category chips */}
        <div className="cat-row">
          {['All', ...cats].map((c) => (
            <button key={c} className={`pill ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>

        <h3 className="section-title">{q || cat !== 'All' ? 'Services' : 'Popular services'}</h3>
        <div className="grid">
          {filtered.map((s) => (
            <button key={s.id} className={`card ${!s.available ? 'off' : ''}`} onClick={() => nav(`/service/${s.id}`)}>
              {!s.available && <span className="badge">Soon</span>}
              <span className="emoji">{s.icon}</span>
              <span className="cname">{s.name}</span>
              <span className="price">₹{s.price}/hr</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="muted" style={{ gridColumn: '1/-1', padding: 20, textAlign: 'center' }}>No services found.</p>}
        </div>

        <div className="trust">
          <span className="ti">👩‍🔧</span>
          <div><div className="tt">100% verified female experts</div><div className="td">Background checked • Trained • Insured</div></div>
        </div>
      </div>

      {cart.length > 0 && (
        <button className="cart-fab" onClick={() => nav('/cart')}>
          🛒 {cart.length} item{cart.length === 1 ? '' : 's'} · View booking →
        </button>
      )}
      <BottomNav />
    </div>
  )
}

function statusLabel(s: string) {
  return ({ confirmed: 'Confirmed', worker_assigned: 'Expert assigned', on_the_way: 'On the way', arrived: 'Arrived', in_progress: 'In progress' } as any)[s] || s
}
