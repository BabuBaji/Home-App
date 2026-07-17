// "See All" for Home Quick Actions — every quick action as a tappable grid. Opening one navigates
// to its screen.
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarPlus, Tag, Sparkles, ClipboardList, Headset, Crown, Wallet, Users, Gift, RotateCcw, MapPin, Bell } from 'lucide-react'
import { BottomNav } from '../components/UI'
import { useStore } from '../store'

export default function AllQuickActions() {
  const nav = useNavigate()
  const { setBookingType } = useStore()

  const bookNow = () => { setBookingType('instant'); nav('/home') }
  const ACTIONS = [
    { key: 'book', label: 'Book Now', Icon: CalendarPlus, on: bookNow },
    { key: 'offers', label: 'Offers', Icon: Tag, on: () => nav('/offers') },
    { key: 'ai', label: 'AI Insights', Icon: Sparkles, on: () => nav('/ai-home') },
    { key: 'mybk', label: 'My Bookings', Icon: ClipboardList, on: () => nav('/bookings') },
    { key: 'membership', label: 'Membership', Icon: Crown, on: () => nav('/membership') },
    { key: 'wallet', label: 'Wallet', Icon: Wallet, on: () => nav('/wallet') },
    { key: 'refer', label: 'Refer & Earn', Icon: Users, on: () => nav('/refer') },
    { key: 'scratch', label: 'Scratch & Win', Icon: Gift, on: () => nav('/offers/scratch') },
    { key: 'refunds', label: 'Refunds', Icon: RotateCcw, on: () => nav('/wallet/refunds') },
    { key: 'address', label: 'Addresses', Icon: MapPin, on: () => nav('/addresses') },
    { key: 'notif', label: 'Notifications', Icon: Bell, on: () => nav('/notifications') },
    { key: 'help', label: 'Help', Icon: Headset, on: () => nav('/support') },
  ]

  return (
    <div className="screen has-nav">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Quick Actions</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content">
        <div className="aqa-grid">
          {ACTIONS.map((a) => (
            <button key={a.key} className="aqa" onClick={a.on}>
              <span className={`aqa-ic qa-${a.key}`}><a.Icon size={22} /></span>
              <span className="aqa-l">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
