// 88 · My Profile — real user (name/phone/email/avatar) + counts for addresses, payment methods
// and family. Rows route to the Module-12 sub-screens. Bottom nav kept (Profile is a tab).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Pencil, MapPin, CreditCard, Users, Bell, Globe, Shield, HelpCircle, Info, ChevronRight, LogOut, Zap } from 'lucide-react'
import { BottomNav, Loading } from '../../components/UI'
import { fetchMe, fetchSavedMethods, fetchFamily } from '../../api'
import { useStore } from '../../store'
import type { User } from '../../types'

export default function MyProfile() {
  const nav = useNavigate()
  const { t } = useTranslation()
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
      <div className="titles"><h1>{t('profile.title')}</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!user) return <div className="screen has-nav">{head}<Loading /><BottomNav /></div>

  const ROWS = [
    { icon: <Zap size={17} />, label: t('profile.quickActions'), to: '/quick-actions' },
    { icon: <MapPin size={17} />, label: t('profile.addresses'), sub: t('profile.saved', { count: counts.addr }), to: '/addresses' },
    { icon: <CreditCard size={17} />, label: t('profile.paymentMethods'), sub: t('profile.saved', { count: counts.pay }), to: '/profile/payment-methods' },
    { icon: <Users size={17} />, label: t('profile.familyMembers'), sub: t('profile.members', { count: counts.family }), to: '/profile/family' },
    { icon: <Bell size={17} />, label: t('profile.notificationSettings'), to: '/profile/notifications' },
    { icon: <Globe size={17} />, label: t('profile.language'), to: '/profile/language' },
    { icon: <Shield size={17} />, label: t('profile.privacy'), to: '/profile/privacy' },
    { icon: <HelpCircle size={17} />, label: t('profile.helpSupport'), to: '/support' },
    { icon: <Info size={17} />, label: t('profile.aboutUs'), to: '/profile/about' },
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
            <div className="mp-name">{user.name || t('profile.yourName')}</div>
            {user.phone && <div className="mp-line">+91 {user.phone}</div>}
            {user.email && <div className="mp-line">{user.email}</div>}
          </div>
          <button className="mp-edit" onClick={() => nav('/personal')} aria-label={t('common.edit')}><Pencil size={15} /></button>
        </div>

        <div className="ws-card">
          {ROWS.map((r) => (
            <button key={r.to} className="ws-row" onClick={() => nav(r.to)}>
              <span className="ws-ico">{r.icon}</span>
              <span className="ws-main"><span className="ws-t">{r.label}</span></span>
              {r.sub && <span className="mp-count">{r.sub}</span>}
              <ChevronRight size={17} className="ws-chev" />
            </button>
          ))}
          <button className="ws-row" onClick={() => nav('/profile/logout')}>
            <span className="ws-ico danger"><LogOut size={17} /></span>
            <span className="ws-main"><span className="ws-t danger">{t('common.logout')}</span></span>
            <ChevronRight size={17} className="ws-chev" />
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
