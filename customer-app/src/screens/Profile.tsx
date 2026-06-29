import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, BottomNav, useToast } from '../components/UI'
import { useStore } from '../store'
import { fetchMe, fetchBookings, fetchCoupons } from '../api'
import type { Address, Coupon } from '../types'

export default function Profile() {
  const nav = useNavigate()
  const toast = useToast()
  const { user, signOut } = useStore()
  const [addresses, setAddresses] = useState<Address[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [stats, setStats] = useState({ total: 0, completed: 0, saved: 0 })
  const [notif, setNotif] = useState({ offers: true, booking: true, whatsapp: false })
  const [open, setOpen] = useState<string>('')

  useEffect(() => {
    fetchMe().then(({ addresses }) => setAddresses(addresses)).catch(() => {})
    fetchCoupons().then(setCoupons).catch(() => {})
    fetchBookings().then((bs) => { const c = bs.filter((b) => b.status === 'completed'); setStats({ total: bs.length, completed: c.length, saved: c.reduce((s, b) => s + b.discount, 0) }) }).catch(() => {})
  }, [])

  function logout() { signOut(); toast('Logged out'); nav('/login', { replace: true }) }
  const toggle = (k: keyof typeof notif) => { setNotif((p) => ({ ...p, [k]: !p[k] })); toast('Preference updated') }

  return (
    <div className="screen has-nav">
      <Header title="Profile" back={false} right={<span>⚙</span>} />
      <div className="content">
        <div className="prof-head">
          <div className="ava-lg">{user?.provider === 'google' ? '🧑' : '👨🏻'}<span className="cam">📷</span></div>
          <div><h2>{user?.name}</h2>
            <div className="li">📞 {user?.phone || (user?.provider === 'google' ? 'Google account' : '—')}</div>
            <div className="li">✉ {user?.email}</div></div>
        </div>

        <div className="prof-2">
          <div className="card c" onClick={() => nav('/addresses')}><span className="pi">📍</span><div><div className="pt">Addresses</div><div className="pd">{addresses.length} saved</div></div></div>
          <div className="card c" onClick={() => nav('/wallet')}><span className="pi">👛</span><div><div className="pt">Wallet</div><div className="pd">₹{user?.wallet?.toLocaleString('en-IN')}</div></div></div>
        </div>

        {/* coupons */}
        <h3 className="section-title">Coupons & Offers</h3>
        {coupons.map((c) => (
          <div key={c.code} className="card coupon-card">
            <span className="cc-icon">🏷</span><div className="grow"><div className="cc-code">{c.code}</div><div className="muted sm">{c.label}</div></div>
            <button className="bk-btn" onClick={() => { navigator.clipboard?.writeText(c.code); toast(`${c.code} copied`) }}>Copy</button>
          </div>
        ))}

        {/* payment methods */}
        <h3 className="section-title">Payment Methods</h3>
        <div className="card pad">
          <div className="pm-row"><span>💳</span><div className="grow">HDFC Debit •••• 4821</div><span className="muted sm">Default</span></div>
          <button className="add-more" style={{ marginTop: 6 }} onClick={() => toast('Add payment method')}>+ Add UPI / payment method</button>
        </div>

        {/* notifications */}
        <h3 className="section-title">Notifications</h3>
        <div className="card pad">
          {([['offers', 'Offers & promotions'], ['booking', 'Booking updates'], ['whatsapp', 'WhatsApp alerts']] as const).map(([k, label]) => (
            <div className="notif-row" key={k}><span className="grow">{label}</span>
              <button className={`switch ${notif[k] ? 'on' : ''}`} onClick={() => toggle(k)}><span /></button></div>
          ))}
        </div>

        {/* account */}
        <h3 className="section-title">Account</h3>
        <div className="acc-list">
          <div className="acc-item" onClick={() => nav('/support')}><span className="ai">🎧</span><span className="at">Help & Support</span><span className="chev">›</span></div>
          <div className="acc-item" onClick={() => toast('Personal info')}><span className="ai">👤</span><span className="at">Personal Information</span><span className="chev">›</span></div>
          <div className="acc-item" onClick={() => toast('Opening T&C')}><span className="ai">📄</span><span className="at">Terms & Conditions</span><span className="chev">›</span></div>
          <div className="acc-item danger" onClick={logout}><span className="ai">⏻</span><span className="at">Logout</span><span className="chev">›</span></div>
        </div>

        <div className="stat-grid">
          <div><div className="sn">{stats.total}</div><div className="sl">Bookings</div></div>
          <div><div className="sn">{stats.completed}</div><div className="sl">Completed</div></div>
          <div><div className="sn">{user?.rating ?? 5}</div><div className="sl">Rating</div></div>
          <div><div className="sn">₹{stats.saved}</div><div className="sl">Saved</div></div>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
