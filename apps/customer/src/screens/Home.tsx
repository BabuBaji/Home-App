import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, ChevronDown, Bell, CalendarPlus, Tag, Sparkles, ClipboardList, User, Wallet as WalletIcon, Headset, Crown } from 'lucide-react'
import { BottomNav, useToast } from '../components/UI'
import { useStore } from '../store'
import ComingSoon from './ComingSoon'
import { fetchServices, fetchBookings, fetchMe, fetchNotifications, fetchWallet, fetchHomeBanners, mediaUrl, isContinuable, type HomeBanner } from '../api'
import type { Service, Booking, Address } from '../types'

// Hero slide backgrounds — all start at the app-bar purple (#5b63d6) so the header stays seamless,
// then diverge into the theme colour lower down. Kept dark enough for white text + status icons.
const THEME: Record<string, string> = {
  purple:  'linear-gradient(to bottom, #5b63d6 0%, #4a3fb0 62%, #2e2a6b 100%)',
  rain:    'linear-gradient(to bottom, #5b63d6 0%, #4a3fb0 62%, #2e2a6b 100%)',
  night:   'linear-gradient(to bottom, #5b63d6 0%, #35357e 55%, #14133f 100%)',
  festive: 'linear-gradient(to bottom, #5b63d6 0%, #7a3fae 52%, #b8329a 100%)',
  sunset:  'linear-gradient(to bottom, #5b63d6 0%, #8f3fb0 48%, #d9488a 100%)',
}
type Slide = HomeBanner & { greetingName?: string }

// Module 2 · #7 — Home Dashboard. UI redesigned to the mock; all booking data/flow
// (services, bookings, serviceable guard, service navigation) is preserved.

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'
}

export default function Home() {
  const nav = useNavigate()
  const toast = useToast()
  const { user, setBookingType, pincode, serviceable } = useStore()
  const [services, setServices] = useState<Service[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [addr, setAddr] = useState<Address | null>(null)
  const [notifCount, setNotifCount] = useState(0)
  const [walletBal, setWalletBal] = useState<number | null>(null)
  const [banners, setBanners] = useState<HomeBanner[]>([])
  const [active, setActive] = useState(0)
  const [scrolled, setScrolled] = useState(false)   // past the hero → collapse the header to white

  useEffect(() => {
    fetchBookings().then(setBookings).catch(() => {})
    fetchMe().then(({ addresses }) => setAddr(addresses.find((a) => a.is_default) || addresses[0] || null)).catch(() => {})
    fetchNotifications().then((n) => setNotifCount(n.length)).catch(() => {})
    fetchWallet().then((w) => setWalletBal(typeof w?.available === 'number' ? w.available : null)).catch(() => {})
  }, [])
  useEffect(() => {
    fetchServices(pincode || undefined).then((c) => setServices(c.services)).catch(() => {})
    // Dynamic hero slides — festival/promo banners + live offers + weather surge, for this zone.
    fetchHomeBanners(pincode || undefined).then(setBanners).catch(() => setBanners([]))
  }, [pincode])

  const cityLabel = addr?.city || user?.city || (user?.location || '').split(',').pop()?.trim() || user?.location || 'Set location'
  const firstName = (user?.name || 'there').split(' ')[0]
  const svcList = useMemo(() => services.filter((s) => s.available), [services])
  // Only a genuinely live booking counts as "Continue Booking": an active status that hasn't gone
  // stale (see isContinuable — a job whose slot is >1 day past is abandoned, not continuable). Once
  // it's completed/cancelled or stale it drops out; future-scheduled bookings still show.
  const cont = useMemo(() => bookings.find((b) => isContinuable(b)) || null, [bookings])

  // The greeting is always the first slide; live banners rotate in after it.
  const slides: Slide[] = useMemo(() => [
    { key: 'greeting', kind: 'announcement', title: firstName, subtitle: "Let's make your home spotless today!", emoji: '', theme: 'purple', ctaLabel: '', ctaLink: '', priority: 0, greetingName: firstName },
    ...banners,
  ], [banners, firstName])
  const cur = slides[Math.min(active, slides.length - 1)] || slides[0]
  const raining = cur.kind === 'weather' && cur.reason === 'rain'

  // Keep the active index in range, and auto-rotate through the slides.
  useEffect(() => { if (active >= slides.length) setActive(0) }, [slides.length, active])
  useEffect(() => {
    if (slides.length < 2) return
    const id = setInterval(() => setActive((i) => (i + 1) % slides.length), 5000)
    return () => clearInterval(id)
  }, [slides.length])

  // Status-bar icons: white over the dark hero at the top; dark once the header collapses to white
  // on scroll. (Capacitor Style.Dark = white icons, Style.Light = dark icons.)
  useEffect(() => {
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => StatusBar.setStyle({ style: scrolled ? Style.Light : Style.Dark }).catch(() => {})).catch(() => {})
  }, [scrolled])
  useEffect(() => () => { import('@capacitor/status-bar').then(({ StatusBar, Style }) => StatusBar.setStyle({ style: Style.Light }).catch(() => {})).catch(() => {}) }, [])
  // Deterministic raindrop field (index-derived, so it never reshuffles on re-render).
  // x spans 0–112% so drops also sweep in from the right edge as they slant left across the screen.
  const drops = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    x: (i * 1.7 + (i % 5) * 4.3) % 114,
    delay: ((i % 11) * 0.11 + (i % 3) * 0.06).toFixed(2),
    dur: (0.42 + (i % 6) * 0.1).toFixed(2),
    h: 16 + (i % 5) * 8,
    o: 0.55 + (i % 4) * 0.14,
  })), [])

  function guardServiceable(): boolean {
    if (serviceable === false) { toast("We're not in your area yet — coming soon! 🚧"); return false }
    return true
  }
  function bookNow() { if (guardServiceable()) { setBookingType('schedule'); nav('/popular-services') } }
  function openService(s: Service) { if (guardServiceable()) nav(`/service/${s.id}`) }

  const QUICK = [
    { key: 'book', label: 'Book Now', Icon: CalendarPlus, on: bookNow },
    { key: 'offers', label: 'Offers', Icon: Tag, on: () => nav('/offers') },
    { key: 'ai', label: 'AI Insights', Icon: Sparkles, on: () => nav('/ai-home') },
    { key: 'membership', label: 'Membership', Icon: Crown, on: () => nav('/membership') },
    { key: 'mybk', label: 'My Bookings', Icon: ClipboardList, on: () => nav('/bookings') },
    { key: 'help', label: 'Help', Icon: Headset, on: () => nav('/support') },
  ]

  return (
    <div className="screen has-nav m2 rain-sky">
      {/* top bar — matches the hero at the top, collapses to solid white on scroll */}
      <div className={`hd-top${scrolled ? ' solid' : ''}`}>
        <button className="hd-loc" onClick={() => nav('/locations')}>
          <MapPin size={16} /> <b>{cityLabel}</b> <ChevronDown size={15} />
        </button>
        <div className="hd-top-r">
          {/* wallet with the live available balance shown inline, like the notification count */}
          <button className="hd-wallet" onClick={() => nav('/wallet')} aria-label="Wallet">
            <WalletIcon size={18} />
            {walletBal != null && <span className="hd-wallet-bal">₹{walletBal.toLocaleString('en-IN')}</span>}
          </button>
          <button className="hd-bell" onClick={() => nav('/notifications')} aria-label="Notifications">
            <Bell size={20} />
            {notifCount > 0 && <span className="hd-badge">{notifCount > 9 ? '9+' : notifCount}</span>}
          </button>
          <button className="hd-prof" onClick={() => nav('/profile')} aria-label="Profile">
            {firstName && firstName !== 'there' ? firstName[0].toUpperCase() : <User size={19} />}
          </button>
        </div>
      </div>

      <div className="content hd-content" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 60)}>
        {serviceable === false ? <ComingSoon /> : (<>
          {/* dynamic hero carousel — greeting + festival/promo banners + live offers + weather surge */}
          <div className={`hd-hero rainy${cur.key === 'greeting' || cur.kind === 'weather' ? '' : ' hd-hero-promo'}${cur.image ? ' hd-hero-photo' : ''}`} style={{ background: THEME[cur.theme] || THEME.purple }}>
            {cur.image && (
              <div className="hd-hero-bg" aria-hidden="true">
                <img src={mediaUrl(cur.image)} alt="" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
              </div>
            )}
            {raining && (
              <div className="hd-skyrain" aria-hidden="true">
                {drops.map((d, i) => (
                  <i key={i} className="rd" style={{ left: `${d.x}%`, height: d.h, opacity: d.o, animationDelay: `${d.delay}s`, animationDuration: `${d.dur}s` }} />
                ))}
              </div>
            )}
            <div className="hd-hero-txt">
              {cur.key === 'greeting' ? (<>
                <div className="hd-hi">{greeting()} 👋</div>
                <div className="hd-name">{firstName}</div>
                <div className="hd-sub">{cur.subtitle}</div>
              </>) : cur.kind === 'weather' ? (<>
                <div className="hd-hi">{greeting()} 👋</div>
                <div className="hd-name">{firstName}</div>
                <div className="hd-sub">Rainy day out there — perfect time for a spotless home ☔</div>
                <div className="hd-hero-surge"><b>{cur.emoji} {cur.prob != null ? `${cur.prob}% rain` : 'Rain'}</b> · +{cur.pct}% surge</div>
              </>) : (<>
                <div className="hd-hi">{cur.kind === 'offer' ? 'OFFER' : cur.kind.toUpperCase()}</div>
                <div className="hd-name">{cur.title}</div>
                {cur.subtitle && <div className="hd-sub">{cur.subtitle}</div>}
                {cur.ctaLabel && cur.ctaLink && (
                  <button className="hd-hero-cta" onClick={() => nav(cur.ctaLink)}>{cur.ctaLabel} →</button>
                )}
              </>)}
            </div>
            {cur.kind === 'weather' || cur.key === 'greeting'
              ? <img className="hd-hero-img" src="/expert.jpg" alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              : cur.emoji && !cur.image && <span className="hd-hero-emoji" aria-hidden="true">{cur.emoji}</span>}
            {slides.length > 1 && (
              <div className="hd-dots">
                {slides.map((s, i) => (
                  <button key={s.key} className={`hd-dot${i === active ? ' on' : ''}`} onClick={() => setActive(i)} aria-label={`Slide ${i + 1}`} />
                ))}
              </div>
            )}
          </div>

          {/* continue booking — shown here (in place of Quick Actions), only if one is in progress */}
          {cont && (<>
            <div className="hd-sec-head"><h3>Continue Booking</h3></div>
            <button className="hd-cont" onClick={() => nav('/continue-booking')}>
              <span className="hd-cont-img">
                <img src={`/services/${cont.items[0]?.id}.jpg`} alt=""
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              </span>
              <span className="hd-cont-main">
                <b>{cont.items[0]?.name || 'Booking'}{cont.items.length > 1 ? ` +${cont.items.length - 1}` : ''}</b>
                <small>{bkWhen(cont)}</small>
              </span>
              <span className="hd-cont-btn">View</span>
            </button>
          </>)}

          {/* all services */}
          <div className="hd-sec-head"><h3>All Services</h3></div>
          <div className="hd-pop hd-pop-all">
            {svcList.map((s) => (
              <button key={s.id} className="hd-pop-card" onClick={() => openService(s)}>
                <span className="hd-pop-img">
                  <img src={s.image || `/services/${s.id}.jpg`} alt="" loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                </span>
                <span className="hd-pop-name">{s.name}</span>
                <span className="hd-pop-price">From ₹{s.price}</span>
              </button>
            ))}
            {svcList.length === 0 && <p className="muted" style={{ padding: 12 }}>Loading services…</p>}
          </div>

        </>)}
      </div>
      <BottomNav />
    </div>
  )
}

function bkWhen(b: Booking) {
  if (b.date && b.time) return `${b.date}, ${b.time}`
  return new Date(b.created).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
