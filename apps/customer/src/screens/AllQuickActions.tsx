// Quick Actions (Profile → Quick Actions) — every shortcut as a tappable grid. Each one opens a
// real, working screen; nothing here points at a placeholder feature.
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarPlus, Tag, ClipboardList, Headset, Crown, Wallet, Users, RotateCcw, MapPin, Bell, Repeat, History } from 'lucide-react'
import { useBack } from '../components/UI'
import { t } from '../i18n'

export default function AllQuickActions() {
  const nav = useNavigate()
  const back = useBack('/profile')

  const ACTIONS = [
    { key: 'book', label: 'Book Now', Icon: CalendarPlus, to: '/home' },
    { key: 'offers', label: 'Offers', Icon: Tag, to: '/offers' },
    { key: 'mybk', label: 'My Bookings', Icon: ClipboardList, to: '/bookings' },
    { key: 'ai', label: 'Book again', Icon: History, to: '/ai/recommendations' },
    { key: 'membership', label: 'Membership', Icon: Crown, to: '/membership' },
    { key: 'wallet', label: 'Wallet', Icon: Wallet, to: '/wallet' },
    { key: 'refer', label: 'Refer & Earn', Icon: Users, to: '/refer' },
    { key: 'scratch', label: 'Repeat bookings', Icon: Repeat, to: '/profile/repeat' },
    { key: 'refunds', label: 'Refunds', Icon: RotateCcw, to: '/wallet/refunds' },
    { key: 'address', label: 'Addresses', Icon: MapPin, to: '/addresses' },
    { key: 'notif', label: 'Notifications', Icon: Bell, to: '/notifications' },
    { key: 'help', label: 'Help', Icon: Headset, to: '/support' },
  ]

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={back} aria-label={t('Back')}><ArrowLeft size={18} /></button>
        <div className="titles"><h1>{t('Quick Actions')}</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content">
        <div className="aqa-grid">
          {ACTIONS.map((a) => (
            <button key={a.to} className="aqa" onClick={() => nav(a.to)}>
              <span className={`aqa-ic qa-${a.key}`}><a.Icon size={22} /></span>
              <span className="aqa-l">{t(a.label)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
