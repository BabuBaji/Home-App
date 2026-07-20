// 91 · Notification Settings — real toggles persisted to /api/profile/notifications.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, CalendarCheck, Clock, RefreshCw, Tag, Wallet, Receipt, Megaphone } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { fetchNotifPrefs, updateNotifPrefs, type NotifPrefs } from '../../api'

export default function NotificationSettings() {
  const nav = useNavigate()
  const toast = useToast()
  const [p, setP] = useState<NotifPrefs | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => { fetchNotifPrefs().then(setP).catch(() => setP(null)) }, [])

  async function toggle(key: keyof NotifPrefs) {
    if (!p || busy) return
    const next = { ...p, [key]: !p[key] } as NotifPrefs
    // "All Notifications" off mutes everything; the server keeps each row's own value.
    setP(next); setBusy(key)
    try { setP(await updateNotifPrefs({ [key]: next[key] } as Partial<NotifPrefs>)) }
    catch (e) { setP(p); toast((e as Error).message) } finally { setBusy('') }
  }

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Notification Settings</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!p) return <div className="screen">{head}<Loading /></div>

  const Toggle = ({ on, k }: { on: boolean; k: keyof NotifPrefs }) => (
    <button className={`ws-sw ${on ? 'on' : ''}`} onClick={() => toggle(k)} role="switch" aria-checked={on}><i /></button>
  )
  const Row = ({ icon, t, d, k }: { icon: React.ReactNode; t: string; d: string; k: keyof NotifPrefs }) => (
    <div className="ws-row">
      <span className="ws-ico">{icon}</span>
      <span className="ws-main"><span className="ws-t">{t}</span><span className="ws-d">{d}</span></span>
      <Toggle on={p[k]} k={k} />
    </div>
  )

  return (
    <div className="screen">
      {head}
      <div className="content">
        <div className="ws-card">
          <Row icon={<Bell size={16} />} t="All Notifications" d="Enable or disable all notifications" k="all" />
        </div>

        <div className="ws-sec">Order &amp; Booking</div>
        <div className="ws-card">
          <Row icon={<CalendarCheck size={16} />} t="Booking Confirmations" d="Get notified on booking" k="bookingConfirm" />
          <Row icon={<Clock size={16} />} t="Booking Reminders" d="Reminders before your service" k="bookingReminder" />
          <Row icon={<RefreshCw size={16} />} t="Service Updates" d="Updates during the service" k="serviceUpdates" />
          <Row icon={<Tag size={16} />} t="Offers & Discounts" d="Latest offers and discounts" k="offers" />
        </div>

        <div className="ws-sec">Account &amp; Wallet</div>
        <div className="ws-card">
          <Row icon={<Wallet size={16} />} t="Wallet Transactions" d="Alerts for wallet activities" k="walletTxn" />
          <Row icon={<Receipt size={16} />} t="Payments & Refunds" d="Payments, refunds and invoices" k="payments" />
        </div>

        <div className="ws-sec">Marketing</div>
        <div className="ws-card">
          <Row icon={<Megaphone size={16} />} t="Promotional Messages" d="Marketing and promotional offers" k="marketing" />
        </div>
      </div>
    </div>
  )
}
