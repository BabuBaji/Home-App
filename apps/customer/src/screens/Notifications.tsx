import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, CalendarCheck, Tag, Coins } from 'lucide-react'
import { Loading } from '../components/UI'
import { fetchNotifications } from '../api'
import type { AppNotification } from '../types'

// Module 2 · #14 — Notifications. UI redesigned to the mock; data via fetchNotifications.
// "Mark all as read" is a local visual state (no backend notion of read yet).
const ICONS = {
  booking: { Icon: CalendarCheck, cls: 'nt-booking' },
  offer: { Icon: Tag, cls: 'nt-offer' },
  cashback: { Icon: Coins, cls: 'nt-cash' },
}

function ago(t: string | null) {
  if (!t) return ''
  const diff = (Date.now() - new Date(t).getTime()) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 172800) return 'Yesterday'
  return `${Math.floor(diff / 86400)}d ago`
}

export default function Notifications() {
  const nav = useNavigate()
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [read, setRead] = useState<Set<string>>(new Set())

  function load() { fetchNotifications().then(setItems).catch(() => setItems([])) }
  useEffect(() => { load() }, [])

  if (!items) return <div className="screen m2"><div className="ps-top"><button className="au-back" onClick={() => nav(-1)}><ArrowLeft size={22} /></button><b>Notifications</b><span style={{ width: 42 }} /></div><Loading /></div>

  return (
    <div className="screen m2">
      <div className="ps-top">
        <button className="au-back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Notifications</b>
        <button className="nt2-mark" onClick={() => setRead(new Set(items.map((n) => n.id)))}>Mark all as read</button>
      </div>

      <div className="content">
        {items.length === 0 && (
          <div className="state"><div className="ico"><Bell size={44} /></div><h3>No notifications</h3><p>You're all caught up!</p></div>
        )}

        <div className="nt2-list">
          {items.map((n) => {
            const m = ICONS[n.type] || ICONS.offer
            const isRead = read.has(n.id)
            return (
              <button key={n.id} className={`nt2-row ${isRead ? 'read' : ''}`} onClick={() => n.bookingId && nav(`/track/${n.bookingId}`)}>
                <span className={`nt2-ic ${m.cls}`}><m.Icon size={20} /></span>
                <span className="nt2-main">
                  <span className="nt2-title">{n.title}{!isRead && <i className="nt2-dot" />}</span>
                  <span className="nt2-body">{n.body}</span>
                </span>
                {n.time && <span className="nt2-time">{ago(n.time)}</span>}
              </button>
            )
          })}
        </div>

        {items.length > 0 && <button className="cb-all" onClick={load}>View All Notifications</button>}
      </div>
    </div>
  )
}
