import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, ChevronDown, Bell, Search, CalendarPlus, Tag, Sparkles, ClipboardList, User, Wallet as WalletIcon, Headset, Crown } from 'lucide-react'
import { BottomNav, useToast } from '../components/UI'
import { useStore } from '../store'
import ComingSoon from './ComingSoon'
import { fetchServices, fetchBookings, fetchMe, fetchNotifications, fetchWallet } from '../api'
import type { Service, Booking, Address } from '../types'

// Module 2 · #7 — Home Dashboard. UI redesigned to the mock; all booking data/flow
// (services, bookings, serviceable guard, service navigation) is preserved.
const ACTIVE = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']

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

  useEffect(() => {
    fetchBookings().then(setBookings).catch(() => {})
    fetchMe().then(({ addresses }) => setAddr(addresses.find((a) => a.is_default) || addresses[0] || null)).catch(() => {})
    fetchNotifications().then((n) => setNotifCount(n.length)).catch(() => {})
    fetchWallet().then((w) => setWalletBal(w.available)).catch(() => {})
  }, [])
  useEffect(() => {
    fetchServices(pincode || undefined).then((c) => setServices(c.services)).catch(() => {})
  }, [pincode])

  const cityLabel = addr?.city || user?.city || (user?.location || '').split(',').pop()?.trim() || user?.location || 'Set location'
  const firstName = (user?.name || 'there').split(' ')[0]
  const popular = useMemo(() => services.filter((s) => s.available).slice(0, 8), [services])
  const cont = useMemo(() => bookings.find((b) => ACTIVE.includes(b.status)) || bookings[0] || null, [bookings])

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
    <div className="screen has-nav m2">
      {/* top bar */}
      <div className="hd-top">
        <button className="hd-loc" onClick={() => nav('/locations')}>
          <MapPin size={16} /> <b>{cityLabel}</b> <ChevronDown size={15} />
        </button>
        <div className="hd-top-r">
          {/* wallet with the live available balance shown inline, like the notification count */}
          <button className="hd-wallet" onClick={() => nav('/wallet')} aria-label="Wallet">
            <WalletIcon size={18} />
            {walletBal !== null && <span className="hd-wallet-bal">₹{walletBal.toLocaleString('en-IN')}</span>}
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

      <div className="content hd-content">
        {serviceable === false ? <ComingSoon /> : (<>
          {/* greeting banner */}
          <div className="hd-hero">
            <div className="hd-hero-txt">
              <div className="hd-hi">{greeting()} 👋</div>
              <div className="hd-name">{firstName}</div>
              <div className="hd-sub">Let's make your home spotless today!</div>
            </div>
            <img className="hd-hero-img" src="/expert.jpg" alt=""
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          </div>

          {/* search */}
          <button className="hd-search" onClick={() => nav('/popular-services')}>
            <Search size={18} /> <span>Search for services</span>
          </button>

          {/* quick actions */}
          <div className="hd-sec-head"><h3>Quick Actions</h3><button className="hd-seeall" onClick={() => nav('/quick-actions')}>See All</button></div>
          <div className="hd-quick">
            {QUICK.map((q) => (
              <button key={q.key} className="hd-qa" onClick={q.on}>
                <span className={`hd-qa-ic qa-${q.key}`}><q.Icon size={22} /></span>
                <span className="hd-qa-l">{q.label}</span>
              </button>
            ))}
          </div>

          {/* popular services */}
          <div className="hd-sec-head"><h3>Popular Services</h3><button className="hd-seeall" onClick={() => nav('/popular-services')}>See All</button></div>
          <div className="hd-pop">
            {popular.map((s) => (
              <button key={s.id} className="hd-pop-card" onClick={() => openService(s)}>
                <span className="hd-pop-img">
                  <img src={s.image || `/services/${s.id}.jpg`} alt="" loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                </span>
                <span className="hd-pop-name">{s.name}</span>
                <span className="hd-pop-price">From ₹{s.price}</span>
              </button>
            ))}
            {popular.length === 0 && <p className="muted" style={{ padding: 12 }}>Loading services…</p>}
          </div>

          {/* continue booking */}
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
