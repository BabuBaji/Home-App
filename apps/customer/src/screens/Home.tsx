import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, MapPin, Gift, User, ChevronDown, Clock, Zap, LayoutGrid, Sparkles, WashingMachine, Grip, Heart, ShieldCheck } from 'lucide-react'
import { Share } from '@capacitor/share'
import { BottomNav, useToast } from '../components/UI'
import { useStore } from '../store'
import { ServiceThumb } from '../serviceArt'
import { fetchServices, fetchBookings, fetchHome, fetchMe, fetchFavourites, addFavouriteApi, removeFavouriteApi, fetchOffers } from '../api'
import type { Service, Booking, HomeContent, Address, Offer } from '../types'

const ACTIVE = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']
// Where friends get the app — edit to your Play Store / website link.
const APP_LINK = 'https://homehelp.in'
// icon shown on each category pill (falls back to a generic grid icon for unknown categories)
const CAT_ICON: Record<string, typeof LayoutGrid> = { All: LayoutGrid, Cleaning: Sparkles, Laundry: WashingMachine, Others: Grip }

export default function Home() {
  const nav = useNavigate()
  const toast = useToast()
  const { user, setBookingType, pincode } = useStore()
  const [services, setServices] = useState<Service[]>([])
  const [cats, setCats] = useState<string[]>([])
  const [cat, setCat] = useState('All')
  const [q, setQ] = useState('')
  const [active, setActive] = useState<Booking | null>(null)
  const [home, setHome] = useState<HomeContent | null>(null)
  const [addr, setAddr] = useState<Address | null>(null)
  const [favs, setFavs] = useState<string[]>([])
  const [offers, setOffers] = useState<Offer[]>([])

  useEffect(() => {
    fetchBookings().then((bs) => setActive(bs.find((b) => ACTIVE.includes(b.status)) || null)).catch(() => {})
    fetchHome().then(setHome).catch(() => {})
    fetchMe().then(({ addresses }) => setAddr(addresses.find((a) => a.is_default) || addresses[0] || null)).catch(() => {})
    fetchFavourites().then(setFavs).catch(() => {})
  }, [])
  // Re-fetch the catalogue + zone offers whenever the pincode resolves, so both reflect the zone.
  useEffect(() => {
    fetchServices(pincode || undefined).then((c) => { setServices(c.services); setCats(c.categories) }).catch(() => {})
    fetchOffers(pincode || undefined).then(setOffers).catch(() => {})
  }, [pincode])

  const addressLine = addr?.line || user?.location || user?.city || 'Set your location'
  const eta = home?.instantEta ?? 5

  const filtered = useMemo(() => services.filter((s) =>
    (cat === 'All' || (cat === '♥ Saved' ? favs.includes(s.id) : s.category === cat))
    && s.name.toLowerCase().includes(q.toLowerCase())), [services, cat, q, favs])

  async function shareReferral() {
    const code = user?.referralCode || home?.referral.code || 'HOMEHELP150'
    const reward = home?.referral.reward ?? 150
    const text = `Get trusted home-service experts on HomeHelp — cleaning, laundry, kitchen & more, at your door. 🏠\nUse my code ${code} and we both earn ₹${reward}!\n\nDownload the app: ${APP_LINK}`
    try {
      await Share.share({ title: 'HomeHelp — home services on demand', text, url: APP_LINK, dialogTitle: 'Refer HomeHelp' })
    } catch {
      try { await navigator.clipboard?.writeText(`${text}`); toast('Referral message copied — paste it anywhere!') } catch { /* ignore */ }
    }
  }

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
      {/* fixed top bar — OUTSIDE the scroll area so content never bleeds above it */}
      <div className="sn-top">
        <button className="sn-loc" onClick={() => nav('/locations')}>
          <div className="sn-loc-h">home <ChevronDown size={15} /></div>
          <div className="sn-loc-a"><MapPin size={12} /> {addressLine}</div>
        </button>
        <div className="sn-top-actions">
          <button className="sn-icon" onClick={() => nav('/wallet')} aria-label="Wallet"><Wallet size={19} /></button>
          <button className="sn-gift" onClick={() => nav('/profile')}><Gift size={18} /><span className="sn-gift-amt">₹{home?.referral.reward ?? 150}</span></button>
          <button className="sn-avatar" onClick={() => nav('/profile')}><User size={18} /></button>
        </div>
      </div>

      <div className="content sn-home">
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
            <img className="sn-expert" alt="" loading="lazy" decoding="async" src="/expert.jpg"
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

        {/* zone offers carousel */}
        {offers.length > 0 && (
          <div className="sn-offers">
            {offers.map((o) => (
              <button key={o.id} className={`sn-offer ${o.type}`}
                onClick={() => { if (o.serviceId) nav(`/service/${o.serviceId}`) }}>
                <span className="sn-offer-badge">{o.badge}</span>
                <div className="sn-offer-body">
                  <div className="sn-offer-t">{o.title}</div>
                  {o.subtitle && <div className="sn-offer-s">{o.subtitle}</div>}
                  {o.code && <span className="sn-offer-code">Code · {o.code}</span>}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* category filters */}
        <div className="cat-row">
          {['All', ...cats].map((c) => {
            const Icon = c.startsWith('♥') ? Heart : (CAT_ICON[c] || LayoutGrid)
            return (
              <button key={c} className={`pill ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>
                <Icon size={15} /> {c}
              </button>
            )
          })}
        </div>

        <h2 className="sn-h2">{q || cat !== 'All' ? 'Services' : 'One Expert who can do it all'}</h2>
        {!(q || cat !== 'All') && <p className="sn-h2-sub">Trusted. Trained. Verified.</p>}

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
              <button className="sn-refer-btn" onClick={shareReferral}>Refer now</button>
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

        {/* trust banner */}
        <div className="trust-banner">
          <span className="tb-shield"><ShieldCheck size={22} /></span>
          <div className="tb-text">
            <div className="tb-title">Home care with complete trust</div>
            <div className="tb-sub">Background verified experts · Quality service · On-time · Affordable</div>
          </div>
          <svg className="tb-house" viewBox="0 0 96 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <ellipse cx="48" cy="73" rx="45" ry="6" fill="#d9ecd9" />
            <circle cx="85" cy="62" r="8" fill="#56cc83" />
            <rect x="83.5" y="62" width="3" height="11" rx="1" fill="#8a6a4a" />
            <rect x="26" y="36" width="44" height="35" rx="3" fill="#ffffff" stroke="#e6e1fb" strokeWidth="1.5" />
            <path d="M20 38L48 15l28 23z" fill="#6d5cf5" />
            <path d="M48 15l28 23H48z" fill="#5b51e8" />
            <rect x="42" y="52" width="12" height="19" rx="1.5" fill="#6d5cf5" />
            <rect x="31" y="43" width="10" height="10" rx="1.5" fill="#bcd0ff" />
            <rect x="55" y="43" width="10" height="10" rx="1.5" fill="#bcd0ff" />
            <circle cx="10" cy="30" r="2" fill="#ffce33" />
            <circle cx="88" cy="26" r="1.6" fill="#c9c2f7" />
          </svg>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

function statusLabel(s: string) {
  return ({ confirmed: 'Confirmed', worker_assigned: 'Expert assigned', on_the_way: 'On the way', arrived: 'Arrived', in_progress: 'In progress' } as any)[s] || s
}
