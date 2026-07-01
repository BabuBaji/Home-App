import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarCheck, Tag, Coins } from 'lucide-react'
import { Header, Loading } from '../components/UI'
import { fetchNotifications } from '../api'
import type { AppNotification } from '../types'

const ICONS = {
  booking: { Icon: CalendarCheck, cls: 'nt-booking' },
  offer: { Icon: Tag, cls: 'nt-offer' },
  cashback: { Icon: Coins, cls: 'nt-cash' },
}

function ago(t: string | null) {
  if (!t) return ''
  const diff = (Date.now() - new Date(t).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function Notifications() {
  const nav = useNavigate()
  const [items, setItems] = useState<AppNotification[] | null>(null)

  useEffect(() => { fetchNotifications().then(setItems).catch(() => setItems([])) }, [])

  if (!items) return <div className="screen"><Header title="Notifications" /><Loading /></div>

  return (
    <div className="screen">
      <Header title="Notifications" />
      <div className="content">
        {items.length === 0 && (
          <div className="state"><div className="ico"><Bell size={44} /></div><h3>No notifications</h3><p>You're all caught up!</p></div>
        )}
        {items.map((n) => {
          const m = ICONS[n.type] || ICONS.offer
          return (
            <button key={n.id} className="nt-row" onClick={() => n.bookingId && nav(`/track/${n.bookingId}`)}>
              <span className={`nt-ic ${m.cls}`}><m.Icon size={20} /></span>
              <div className="grow">
                <div className="nt-title">{n.title}</div>
                <div className="nt-body">{n.body}</div>
              </div>
              {n.time && <span className="nt-time">{ago(n.time)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
