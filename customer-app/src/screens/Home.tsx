import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Bell, MapPin, Gift, User, ChevronDown, Clock, Zap } from 'lucide-react'
import { BottomNav } from '../components/UI'
import { useStore } from '../store'
import { ServiceThumb } from '../serviceArt'
import { fetchServices, fetchBookings, fetchHome, fetchMe, fetchFavourites, addFavouriteApi, removeFavouriteApi } from '../api'
import type { Service, Booking, HomeContent, Address } from '../types'

const ACTIVE = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']

export default function Home() {
  const nav = useNavigate()
  const { user, setBookingType } = useStore()
  const [services, setServices] = useState<Service[]>([])
  const [cats, setCats] = useState<string[]>([])
  const [cat, setCat] = useState('All')
  const [q, setQ] = useState('')
  const [active, setActive] = useState<Booking | null>(null)
  const [home, setHome] = useState<HomeContent | null>(null)
  const [addr, setAddr] = useState<Address | null>(null)
  const [favs, setFavs] = useState<string[]>([])

  useEffect(() => {
    fetchServices().then((c) => { setServices(c.services); setCats(c.categories) }).catch(() => {})
    fetchBookings().then((bs) => setActive(bs.find((b) => ACTIVE.includes(b.status)) || null)).catch(() => {})
    fetchHome().then(setHome).catch(() => {})
    fetchMe().then(({ addresses }) => setAddr(addresses.find((a) => a.is_default) || addresses[0] || null)).catch(() => {})
    fetchFavourites().then(setFavs).catch(() => {})
  }, [])

  const addressLine = addr?.line || user?.location || user?.city || 'Set your location'
  const eta = home?.instantEta ?? 5

  const filtered = useMemo(() => services.filter((s) =>
    (cat === 'All' || (cat === '♥ Saved' ? favs.includes(s.id) : s.category === cat))
    && s.name.toLowerCase().includes(q.toLowerCase())), [services, cat, q, favs])

  function startBooking(mode: 'instant' | 'schedule') {
    setBookingType(mode)
    const first = services.find((s) => s.available) || services[0]
    if (first) nav(`/service/${first.id}`)
  }

  async function toggleFav(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const isFav = favs.includes(id)
    setFavs((p) => isFav ? p.filter((x) => x !== id) : [...p, id]) // optimistic
    try { setFavs(isFav ? await removeFavouriteApi(id) : await addFavouriteApi(id)) } catch { /* keep optimistic */ }
  }

  return (
    <div className="screen has-nav">
      <div className="content sn-home">
        {/* top bar */}
        <div className="sn-top">
          <button className="sn-loc" onClick={() => nav('/onboarding/location')}>
            <div className="sn-loc-h">home <ChevronDown size={15} /></div>
            <div className="sn-loc-a"><MapPin size={12} /> {addressLine}</div>
          </button>
          <div className="sn-top-actions">
            <button className="sn-icon" onClick={() => nav('/notifications')}><Bell size={19} /><span className="sn-dot" /></button>
            <button className="sn-gift" onClick={() => nav('/profile')}><Gift size={18} /><span className="sn-gift-amt">₹{home?.referral.reward ?? 150}</span></button>
            <button className="sn-avatar" onClick={() => nav('/profile')}><User size={18} /></button>
          </div>
        </div>

        {/* search */}
        <div className="sn-search">
          <Search size={18} className="sn-search-ic" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a service…" />
        </div>

        {/* hero: schedule + instant */}
        <div className="sn-hero">
          <button className="sn-hero-card schedule" onClick={() => startBooking('schedule')}>
            <span className="sn-clock"><Clock size={18} /></span>
            <div className="sn-hc-title">Schedule <span className="chev">›</span></div>
            <div className="sn-hc-sub">Pick your time</div>
          </button>
          <button className="sn-hero-card instant" onClick={() => startBooking('instant')}>
            <span className="sn-eta"><Zap size={13} /> {eta} mins</span>
            <div className="sn-hc-title">Instant <span className="chev">›</span></div>
            <div className="sn-hc-sub">Get now</div>
            <img className="sn-expert" alt="" loading="lazy" decoding="async" src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&q=80&auto=format&fit=crop"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          </button>
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

        {/* category filters */}
        <div className="cat-row">
          {['All', ...cats].map((c) => (
            <button key={c} className={`pill ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>

        <h2 className="sn-h2">{q || cat !== 'All' ? 'Services' : 'One Expert who can do it all'}</h2>

        {/* service photo grid */}
        <div className="sn-grid">
          {filtered.map((s) => (
            <button key={s.id} className={`sn-tile ${!s.available ? 'off' : ''}`} onClick={() => nav(`/service/${s.id}`)}>
              <div className="sn-thumb">
                <ServiceThumb service={s} medallion={58} />
                {!s.available && <span className="sn-soon">Soon</span>}
              </div>
              <span className="sn-tile-name">{s.name}</span>
              <span className="sn-tile-price">from ₹{s.price}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="muted" style={{ gridColumn: '1/-1', padding: 20, textAlign: 'center' }}>No services found.</p>}
        </div>

        {/* referral banner */}
        {home && (
          <div className="sn-refer">
            <div className="sn-refer-l">
              <div className="sn-refer-t">{home.referral.label}</div>
              <button className="sn-refer-btn" onClick={() => { navigator.clipboard?.writeText(home.referral.code) }}>Refer now</button>
            </div>
            <svg className="sn-refer-img" viewBox="0 0 124 104" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M15 18l1.8 4.6L21 24.4l-4.2 1.8L15 31l-1.8-4.8L9 24.4l4.2-1.8z" fill="#ffce33" />
              <circle cx="110" cy="24" r="3" fill="#ffce33" />
              <circle cx="100" cy="12" r="2" fill="#ffce33" />
              <g>
                <rect x="40" y="24" width="30" height="20" rx="3" fill="#56cc83" transform="rotate(-16 55 34)" />
                <rect x="55" y="22" width="30" height="20" rx="3" fill="#41c071" transform="rotate(12 70 32)" />
                <rect x="47" y="17" width="30" height="20" rx="3" fill="#74d99c" transform="rotate(-3 62 27)" />
                <text x="62" y="32" fontSize="11" fontWeight="800" fill="#0f5a31" textAnchor="middle">₹</text>
              </g>
              <ellipse cx="29" cy="84" rx="11" ry="10" fill="#e0a800" />
              <ellipse cx="29" cy="81" rx="11" ry="10" fill="#ffd24d" />
              <text x="29" y="85" fontSize="10" fontWeight="800" fill="#a9730a" textAnchor="middle">₹</text>
              <ellipse cx="99" cy="88" rx="10" ry="9" fill="#e0a800" />
              <ellipse cx="99" cy="85" rx="10" ry="9" fill="#ffd24d" />
              <text x="99" y="89" fontSize="9" fontWeight="800" fill="#a9730a" textAnchor="middle">₹</text>
              <path d="M36 56l8 42h36l8-42z" fill="#1f9d57" />
              <path d="M36 56l8 42h18V56z" fill="#18814a" />
              <rect x="31" y="50" width="62" height="14" rx="3" fill="#27b365" />
              <rect x="31" y="50" width="31" height="14" rx="3" fill="#1f9d57" />
              <rect x="57" y="50" width="10" height="48" fill="#ffd24d" />
              <path d="M62 50c-11-11-23-6-16 5z" fill="#ffd24d" />
              <path d="M62 50c11-11 23-6 16 5z" fill="#ffce33" />
              <circle cx="62" cy="50" r="4" fill="#ffe27a" />
            </svg>
          </div>
        )}

        {/* trust seal */}
        {home && (
          <div className="sn-trust">
            <div className="sn-seal">🏅</div>
            <h3>Experts Vetted for Quality</h3>
            <div className="sn-badges">
              {home.trust.map((b) => (
                <div className="sn-badge" key={b.label}><span className="sn-badge-ic">{b.icon}</span><span>{b.label}</span></div>
              ))}
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}

function statusLabel(s: string) {
  return ({ confirmed: 'Confirmed', worker_assigned: 'Expert assigned', on_the_way: 'On the way', arrived: 'Arrived', in_progress: 'In progress' } as any)[s] || s
}
