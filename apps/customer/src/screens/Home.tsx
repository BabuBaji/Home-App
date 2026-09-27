import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Wallet as WalletIcon, Zap, CalendarDays, ChevronDown, ChevronRight, Gift, ShoppingCart } from 'lucide-react'
import { BottomNav, useToast } from '../components/UI'
import AddressSheet from '../components/AddressSheet'
import { useStore } from '../store'
import ComingSoon from './ComingSoon'
import { fetchServices, fetchBookings, fetchMe, fetchWallet, fetchHomeBanners, fetchReferralEarnings, fetchInstantStatus, mediaUrl, isContinuable, type HomeBanner, type InstantStatus } from '../api'
import PackagesStrip from '../components/PackagesStrip'
import type { Service, Booking, Address } from '../types'
import { t, dateLocale } from '../i18n'
import { getBookMode, setBookMode, type BookMode } from '../bookMode'
import { shortAddress } from '../addressText'
import { useAppConfig } from '../appConfig'

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
  return h < 12 ? t('Good Morning') : h < 17 ? t('Good Afternoon') : t('Good Evening')
}


export default function Home() {
  const nav = useNavigate()
  const toast = useToast()
  const { user, pincode, serviceable, cart } = useStore()
  const { instantServiceId } = useAppConfig()
  // Instant open/closed and the next slot come from the server (India time + zone hours), never the
  // phone clock. Until it answers, Instant is shown as available.
  const [instantStatus, setInstantStatus] = useState<InstantStatus | null>(null)
  useEffect(() => { fetchInstantStatus(pincode || undefined).then(setInstantStatus).catch(() => {}) }, [pincode])
  const openNow = instantStatus?.open ?? true
  // Instant / Schedule chosen up front (like Snabbit); a service tapped after it goes straight to
  // duration & pay instead of the details page.
  const [bookMode, setMode] = useState<BookMode | null>(() => getBookMode())
  const [services, setServices] = useState<Service[]>([])
  const [referReward, setReferReward] = useState<number | null>(null)
  const touchX = useRef<number | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [cat, setCat] = useState('')          // '' = all categories
  const [bookings, setBookings] = useState<Booking[]>([])
  const [addr, setAddr] = useState<Address | null>(null)
  const [walletBal, setWalletBal] = useState<number | null>(null)
  const [banners, setBanners] = useState<HomeBanner[]>([])
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)   // manual interaction pauses the auto-rotate
  const [dir, setDir] = useState(1)             // 1 = forward, -1 = back (drives the slide-in)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const resume = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [scrolled, setScrolled] = useState(false)   // past the hero → collapse the header to white
  const [addrSheet, setAddrSheet] = useState(false) // saved-address picker, opened from the header

  useEffect(() => {
    fetchBookings().then(setBookings).catch(() => {})
    fetchMe().then(({ addresses }) => setAddr(addresses.find((a) => a.is_default) || addresses[0] || null)).catch(() => {})
    fetchWallet().then((w) => setWalletBal(typeof w?.available === 'number' ? w.available : null)).catch(() => {})
    fetchReferralEarnings().then((r) => setReferReward(r.reward || null)).catch(() => {})
  }, [])
  useEffect(() => {
    fetchServices(pincode || undefined).then((c) => { setServices(c.services); setCategories(c.categories || []) }).catch(() => {})
    // Dynamic hero slides — festival/promo banners + live offers + weather surge, for this zone.
    fetchHomeBanners(pincode || undefined).then(setBanners).catch(() => setBanners([]))
  }, [pincode])

  const cityLabel = addr?.city || user?.city || (user?.location || '').split(',').pop()?.trim() || user?.location || t('Set location')
  // Header address: the saved label ("Home"/"Work") reads as the title, with a SHORT "flat, building"
  // summary under it - the full street line is in the address sheet a tap away. Falls back to the
  // city alone when no address is saved yet, so a new user still sees something tappable.
  const addrTitle = addr?.label ? t(addr.label) : cityLabel
  // "flat, building" like Snabbit's header ("ag 12, kalpataru residency"), not "flat, city".
  const addrShort = useMemo(() => shortAddress(addr), [addr])
  const firstName = (user?.name || 'there').split(' ')[0]
  // Show every service, but order the ones offered in this zone first; the rest are rendered as
  // "Coming Soon" (not bookable) so the customer sees what will arrive rather than a blank gap.
  const svcList = useMemo(() => [...services].filter((s) => !cat || s.category === cat).sort((a, b) => Number(b.available) - Number(a.available)), [services, cat])
  // Only a genuinely live booking counts as "Continue Booking": an active status that hasn't gone
  // stale (see isContinuable — a job whose slot is >1 day past is abandoned, not continuable). Once
  // it's completed/cancelled or stale it drops out; future-scheduled bookings still show.
  const cont = useMemo(() => bookings.find((b) => isContinuable(b)) || null, [bookings])

  // The greeting is always the first slide; live banners rotate in after it.
  // Promo / offer / weather banners only — the greeting slide is gone now that the brand hero above
  // says hello; with no banners the carousel is hidden.
  const slides: Slide[] = banners
  const cur: Slide | undefined = slides[Math.min(active, slides.length - 1)] || slides[0]
  const raining = cur?.kind === 'weather' && cur?.reason === 'rain'

  // Keep the active index in range, and auto-rotate through the slides.
  useEffect(() => { if (active >= slides.length) setActive(0) }, [slides.length, active])
  useEffect(() => {
    if (slides.length < 2 || paused) return
    const id = setInterval(() => { setDir(1); setActive((i) => (i + 1) % slides.length) }, 5000)
    return () => clearInterval(id)
  }, [slides.length, paused])
  useEffect(() => () => { if (resume.current) clearTimeout(resume.current) }, [])

  // Any manual move pauses the carousel, then hands control back after a breather — so a swipe
  // isn't yanked away a moment later, but the hero still rotates if the screen is left alone.
  function holdAuto() {
    setPaused(true)
    if (resume.current) clearTimeout(resume.current)
    resume.current = setTimeout(() => setPaused(false), 8000)
  }
  function go(step: number) {
    if (slides.length < 2) return
    setDir(step)
    setActive((i) => (i + step + slides.length) % slides.length)
    holdAuto()
  }
  // Horizontal drags move the carousel; anything more vertical than horizontal is left alone so
  // the page keeps scrolling normally (the hero also sets touch-action: pan-y).
  function onSwipeStart(e: React.PointerEvent) { swipe.current = { x: e.clientX, y: e.clientY } }
  function onSwipeEnd(e: React.PointerEvent) {
    const s0 = swipe.current
    swipe.current = null
    if (!s0) return
    const dx = e.clientX - s0.x
    const dy = e.clientY - s0.y
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return   // a tap, or a vertical scroll
    go(dx < 0 ? 1 : -1)
  }

  // Status-bar icons: white over the purple header at the top, dark once it turns white on scroll.
  // (Capacitor Style.Dark = white icons, Style.Light = dark icons.)
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
    if (serviceable === false) { toast(t("We're not in your area yet — coming soon! 🚧")); return false }
    return true
  }
  function openService(s: Service) {
    if (!guardServiceable()) return
    if (!s.available) return toast(t('{name} is coming soon to your area 🚧', { name: s.name }))
    // Always show the service first (what's included, durations, prices); its Schedule / Book
    // Instant buttons lead on to the slot screen and Add to cart.
    nav(`/service/${s.id}`)
  }
  function pickMode(m: BookMode) {
    // Instant when nobody can come now → the schedule screen, which explains why (Pronto-style).
    if (m === 'now' && !openNow) m = 'schedule'
    setMode(m); setBookMode(m)
    // Open the booking straight away (Pronto-style) on the "any task" hourly service chosen in admin
    // (Settings ▸ instant_service_id, served by /api/app-config); first bookable service if it's missing.
    if (!guardServiceable()) return
    const first = services.find((x) => x.id === instantServiceId && x.available) || svcList.find((x) => x.available)
    if (first) nav(`/booking/${first.id}`, { state: { mode: m } })
    else document.getElementById('hd-all-services')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="screen has-nav m2 rain-sky">
      {/* top bar — matches the hero at the top, collapses to solid white on scroll */}
      <div className={`hd-top${scrolled ? ' solid' : ''}`}>
        <div className="hd-top-main">
        <button className="hd-loc" onClick={() => setAddrSheet(true)}>
          <span className="hd-loc-title"><b>{addrTitle}</b><ChevronDown size={18} /></span>
        </button>
        <div className="hd-top-r">
          {/* Icon-only — the balance is on the Wallet screen and at checkout. */}
          <button className="hd-wallet" onClick={() => nav('/wallet')}
            aria-label={walletBal != null ? t('Wallet · ₹{amt}', { amt: walletBal.toLocaleString('en-IN') }) : t('Wallet')}>
            <WalletIcon size={20} />
          </button>
          {/* Cart, only while it has something in it — the count on a badge. */}
          {cart.length > 0 && (
            <button className="hd-cart" onClick={() => nav('/booking/cart')} aria-label={t('Cart · {n} items', { n: cart.length })}>
              <ShoppingCart size={20} />
              <span className="hd-cart-n">{cart.length}</span>
            </button>
          )}
          {/* Refer & earn, with the reward on a badge (like Pronto's gift). */}
          <button className="hd-gift" onClick={() => nav('/refer')} aria-label={t('Refer and earn')}>
            <Gift size={20} />
            {referReward ? <span className="hd-gift-amt">₹{referReward}</span> : null}
          </button>
          <button className="hd-prof" onClick={() => nav('/profile')} aria-label={t('Profile')}>
            <User size={20} />
          </button>
        </div>
        </div>
        {/* one-line "flat, building" under the label - the full address is in the sheet */}
        {addrShort && (
          <button className="hd-loc-full" onClick={() => setAddrSheet(true)}>{addrShort}</button>
        )}
      </div>

      <div className="content hd-content" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 60)}>
        {serviceable === false ? <ComingSoon /> : (<>
          {/* Brand hero (Pronto-style): headline + expert, with Instant / Schedule cards riding its
              rounded bottom edge. The choice carries into the booking flow. */}
          <div className="hd-brand">
            <div className="hd-brand-top">
              <h1 className="hd-brand-h">{t('One expert, {n}+ home services', { n: Math.max(services.filter((x) => x.available).length, 1) })}</h1>
              <img className="hd-brand-img" src="/expert.jpg" alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            </div>
            <div className="hd-brand-cards">
              <button className={`hd-bcard${bookMode === 'now' ? ' on' : ''}${openNow ? '' : ' off'}`} onClick={() => pickMode('now')}>
                <b>{t('Get Instant Service')}</b>
                {!openNow && <small>{instantStatus?.reason === 'closed' && instantStatus.hours ? t('Available {hours}', { hours: instantStatus.hours }) : t('All partners busy')}</small>}
                <span className="hd-bcard-ic now"><Zap size={30} strokeWidth={2.2} /></span>
              </button>
              <button className={`hd-bcard${bookMode === 'schedule' ? ' on' : ''}`} onClick={() => pickMode('schedule')}>
                <b>{t('Schedule for Later')}</b>
                {/* Pronto's short form: "Today, 1 pm" — drop ":00" on the hour so it fits beside the icon. */}
                {instantStatus?.nextSlot && <span className="hd-bcard-pill">{instantStatus.nextSlot.label.replace(':00 ', ' ')}</span>}
                <span className="hd-bcard-ic sched"><CalendarDays size={30} strokeWidth={2} /></span>
              </button>
            </div>
          </div>

          {/* Slides under the cards, like Pronto's refer banner: slim card (art left, text right, ›),
              dots underneath, swipe or tap a dot to move. Tapping the card follows its link. */}
          {cur && (
            <div className="hd-promo"
              onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
              onTouchEnd={(e) => {
                const dx = e.changedTouches[0].clientX - (touchX.current ?? e.changedTouches[0].clientX)
                if (Math.abs(dx) > 40 && slides.length > 1) setActive((i) => (i + (dx < 0 ? 1 : slides.length - 1)) % slides.length)
                touchX.current = null
              }}>
              <button className="hd-promo-card" style={{ background: THEME[cur.theme] || THEME.purple }}
                onClick={() => { if (cur.ctaLink) nav(cur.ctaLink) }} aria-label={cur.title}>
                <span className="hd-promo-art">
                  {cur.image ? <img src={mediaUrl(cur.image)} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    : cur.kind === 'weather' ? <img src="/expert.jpg" alt="" />
                      : <span className="hd-promo-emoji" aria-hidden="true">{cur.emoji || '🎁'}</span>}
                </span>
                {raining && (
                  <span className="hd-skyrain" aria-hidden="true">
                    {drops.map((d, i) => (
                      <i key={i} className="rd" style={{ left: `${d.x}%`, height: d.h, opacity: d.o, animationDelay: `${d.delay}s`, animationDuration: `${d.dur}s` }} />
                    ))}
                  </span>
                )}
                <span className="hd-promo-txt">
                  {cur.kind === 'weather' ? (<>
                    <b>{cur.emoji} {cur.prob != null ? t('{p}% rain', { p: cur.prob }) : t('Rain')}</b>
                    <small>{t('+{p}% surge', { p: cur.pct ?? 0 })} · {t('book before it pours')}</small>
                  </>) : (<>
                    <b>{cur.title}</b>
                    {cur.subtitle && <small>{cur.subtitle}</small>}
                  </>)}
                </span>
                {cur.ctaLink && <span className="hd-promo-go" aria-hidden="true"><ChevronRight size={18} /></span>}
              </button>
              {slides.length > 1 && (
                <div className="hd-promo-dots">
                  {slides.map((sl, i) => (
                    <button key={sl.key} className={`hd-promo-dot${i === active ? ' on' : ''}`} onClick={() => setActive(i)} aria-label={t('Slide {n}', { n: i + 1 })} />
                  ))}
                </div>
              )}
            </div>
          )}


          {/* continue booking — shown here (in place of Quick Actions), only if one is in progress.
              The card is one live booking, so it goes straight to that job's tracking screen rather
              than via the list — `cont` is continuable by definition, which is the same branch the
              list's Continue button takes. */}
          {cont && (<>
            <div className="hd-sec-head"><h3>{t('Continue Booking')}</h3></div>
            <button className="hd-cont" onClick={() => nav(`/job/${cont.id}`)}>
              <span className="hd-cont-img">
                <img src={`/services/${cont.items[0]?.id}.jpg`} alt=""
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              </span>
              <span className="hd-cont-main">
                <b>{cont.items[0]?.name ? t(cont.items[0].name) : t('Booking')}{cont.items.length > 1 ? ` +${cont.items.length - 1}` : ''}</b>
                <small>{bkWhen(cont)}</small>
              </span>
              <span className="hd-cont-btn">{t('Track')}</span>
            </button>
          </>)}

          <PackagesStrip />

          {/* all services */}
          <div className="hd-sec-head" id="hd-all-services"><h3>{bookMode ? t('Choose a service') : t('All Services')}</h3></div>
          {categories.length > 1 && (
            <div className="hd-cats ord-chips">
              <button className={`ord-chip ${cat === '' ? 'active' : ''}`} onClick={() => setCat('')}>{t('All')}</button>
              {categories.map((c) => <button key={c} className={`ord-chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{t(c)}</button>)}
            </div>
          )}
          <div className="hd-pop hd-pop-all">
            {svcList.map((s) => (
              <button key={s.id} className={`hd-pop-card${s.available ? '' : ' soon'}`}
                onClick={() => openService(s)}>
                <span className="hd-pop-img">
                  <img src={s.image || `/services/${s.id}.jpg`} alt="" loading="lazy"
                    onError={(e) => { const im = e.currentTarget as HTMLImageElement; if (!im.src.endsWith('/expert.jpg')) im.src = '/expert.jpg'; else im.style.display = 'none' }} />
                  {!s.available && <span className="hd-pop-soon">{t('Coming Soon')}</span>}
                </span>
                <span className="hd-pop-name">{t(s.name)}</span>
                <span className="hd-pop-price">{s.available ? t('From ₹{price}', { price: s.price }) : t('Not available yet')}</span>
              </button>
            ))}
            {svcList.length === 0 && <p className="muted" style={{ padding: 12 }}>{t('Loading services…')}</p>}
          </div>

        </>)}
      </div>
      <AddressSheet open={addrSheet} onClose={() => setAddrSheet(false)} onSelect={setAddr} />
      <BottomNav />
    </div>
  )
}

function bkWhen(b: Booking) {
  if (b.date && b.time) return `${b.date}, ${b.time}`
  return new Date(b.created).toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' })
}
