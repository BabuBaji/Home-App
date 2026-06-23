import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Bell, MapPin, Gift, User, Wallet, Heart, ChevronDown, Clock, Zap } from 'lucide-react'
import { BottomNav } from '../components/UI'
import { useStore } from '../store'
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
            <img className="sn-expert" alt="" src="https://images.unsplash.com/photo-1628177142898-93e36e4e3a50?w=260&q=75&auto=format&fit=crop"
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
          {['All', ...(favs.length ? ['♥ Saved'] : []), ...cats].map((c) => (
            <button key={c} className={`pill ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>

        <h2 className="sn-h2">{q || cat !== 'All' ? 'Services' : 'One Expert who can do it all'}</h2>

        {/* service photo grid */}
        <div className="sn-grid">
          {filtered.map((s) => (
            <button key={s.id} className={`sn-tile ${!s.available ? 'off' : ''}`} onClick={() => nav(`/service/${s.id}`)}>
              <div className="sn-thumb">
                {s.image
                  ? <img alt="" loading="lazy" src={s.image} onError={(e) => { const t = e.currentTarget as HTMLImageElement; t.style.display = 'none'; (t.nextElementSibling as HTMLElement).style.display = 'grid' }} />
                  : null}
                <span className="sn-thumb-emoji" style={{ display: s.image ? 'none' : 'grid' }}>{s.icon}</span>
                <span className={`sn-fav ${favs.includes(s.id) ? 'on' : ''}`} onClick={(e) => toggleFav(e, s.id)}>
                  <Heart size={15} fill={favs.includes(s.id) ? 'currentColor' : 'none'} />
                </span>
                {!s.available && <span className="sn-soon">Soon</span>}
              </div>
              <span className="sn-tile-name">{s.name}</span>
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
            <span className="sn-refer-img">🎁💰</span>
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
