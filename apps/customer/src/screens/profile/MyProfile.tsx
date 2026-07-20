// 88 · My Profile — real user (name/phone/email/avatar) + counts for addresses, payment methods
// and family. Rows route to the Module-12 sub-screens. Bottom nav kept (Profile is a tab).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, MapPin, CreditCard, Users, Bell, Globe, Shield, HelpCircle, Info, ChevronRight, LogOut, Zap } from 'lucide-react'
import { BottomNav, Loading } from '../../components/UI'
import { fetchMe, fetchSavedMethods, fetchFamily } from '../../api'
import { useStore } from '../../store'
import type { User } from '../../types'

export default function MyProfile() {
  const nav = useNavigate()
  const { user: stored } = useStore()
  const [user, setUser] = useState<User | null>(stored)
  const [counts, setCounts] = useState<{ addr: number; pay: number; family: number }>({ addr: 0, pay: 0, family: 0 })

  useEffect(() => {
    fetchMe().then(({ user, addresses }) => { setUser(user); setCounts((c) => ({ ...c, addr: addresses.length })) }).catch(() => {})
    fetchSavedMethods().then((m) => setCounts((c) => ({ ...c, pay: m.length }))).catch(() => {})
    fetchFamily().then((f) => setCounts((c) => ({ ...c, family: f.length }))).catch(() => {})
  }, [])

  const head = (
    <header className="appbar ord-appbar">
      <span className="iconbtn ghost" />
      <div className="titles"><h1>My Profile</h1></div>
      <button className="iconbtn" onClick={() => nav('/personal')} aria-label="Edit profile"><Pencil size={17} /></button>
    </header>
  )
  if (!user) return <div className="screen has-nav">{head}<Loading /><BottomNav /></div>

  const ROWS = [
    { icon: <Zap size={17} />, t: 'Quick Actions', to: '/quick-actions' },
    { icon: <Pencil size={17} />, t: 'Edit Profile', to: '/personal' },
    { icon: <MapPin size={17} />, t: 'Addresses', sub: `${counts.addr} Saved`, to: '/addresses' },
    { icon: <CreditCard size={17} />, t: 'Payment Methods', sub: `${counts.pay} Saved`, to: '/profile/payment-methods' },
    { icon: <Users size={17} />, t: 'Family Members', sub: `${counts.family} Member${counts.family === 1 ? '' : 's'}`, to: '/profile/family' },
    { icon: <Bell size={17} />, t: 'Notification Settings', to: '/profile/notifications' },
    { icon: <Globe size={17} />, t: 'Language', to: '/profile/language' },
    { icon: <Shield size={17} />, t: 'Privacy', to: '/profile/privacy' },
    { icon: <HelpCircle size={17} />, t: 'Help & Support', to: '/support' },
    { icon: <Info size={17} />, t: 'About Us', to: '/profile/about' },
  ]

  return (
    <div className="screen has-nav">
      {head}
      <div className="content">
        <div className="mp-hero">
          <span className="mp-av">
            {user.avatar
              ? <img src={user.avatar} alt="" />
              : (
                // Clean illustrated avatar (dummy pic) when the user has no photo — bundled, offline-safe.
                <svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden="true">
                  <circle cx="40" cy="40" r="40" fill="#efeaff" />
                  <circle cx="40" cy="32" r="14" fill="#6d5cf5" />
                  <path d="M14 70a26 26 0 0 1 52 0 40 40 0 0 1-52 0Z" fill="#6d5cf5" />
                </svg>
              )}
          </span>
          <div className="mp-hero-main">
            <div className="mp-name">{user.name || 'Your name'}</div>
            {user.phone && <div className="mp-line">+91 {user.phone}</div>}
            {user.email && <div className="mp-line">{user.email}</div>}
          </div>
          <button className="mp-edit" onClick={() => nav('/personal')} aria-label="Edit"><Pencil size={15} /></button>
        </div>

        <div className="ws-card">
          {ROWS.map((r) => (
            <button key={r.t} className="ws-row" onClick={() => nav(r.to)}>
              <span className="ws-ico">{r.icon}</span>
              <span className="ws-main"><span className="ws-t">{r.t}</span></span>
              {r.sub && <span className="mp-count">{r.sub}</span>}
              <ChevronRight size={17} className="ws-chev" />
            </button>
          ))}
          <button className="ws-row" onClick={() => nav('/profile/logout')}>
            <span className="ws-ico danger"><LogOut size={17} /></span>
            <span className="ws-main"><span className="ws-t danger">Logout</span></span>
            <ChevronRight size={17} className="ws-chev" />
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
