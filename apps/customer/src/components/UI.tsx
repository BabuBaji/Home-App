import { type ReactNode, useEffect, useState, createContext, useContext, useCallback } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { House, CalendarDays, Tag, UserRound, AlertTriangle, ArrowLeft } from 'lucide-react'
import { t } from '../i18n'

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastHost({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('')
  const show = useCallback((m: string) => setMsg(m), [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 2600)
    return () => clearTimeout(t)
  }, [msg])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  )
}

/* ---------- Back ---------- */
/** Go back one screen — or Home when the screen was opened directly (deep link, notification tap),
 *  where there is no in-app history to return to. */
export function useBack(fallback = '/home') {
  const nav = useNavigate()
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) nav(-1); else nav(fallback, { replace: true })
  }, [nav, fallback])
}

/* ---------- Header ---------- */
export function Header({ title, subtitle, right, back = true }: {
  title: string; subtitle?: string; right?: ReactNode; back?: boolean
}) {
  const goBack = useBack()
  return (
    <header className="appbar">
      {back ? <button className="iconbtn" onClick={goBack} aria-label={t('Back')}><ArrowLeft size={20} /></button> : <span className="iconbtn ghost" />}
      <div className="titles">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="iconbtn ghost">{right}</div>
    </header>
  )
}

/* ---------- Bottom nav ---------- */
// The four top-level tabs. Shown only on each tab's own root screen (Home, the Bookings list,
// Offers, Profile); deeper screens and flows carry a Back button instead. `match` lists the
// paths that light a tab up.
const NAV = [
  { to: '/home', label: 'Home', Icon: House, match: ['/home'] },
  { to: '/bookings', label: 'Bookings', Icon: CalendarDays, match: ['/bookings', '/history'] },
  { to: '/offers', label: 'Offers', Icon: Tag, match: ['/offers'] },
  { to: '/profile', label: 'Profile', Icon: UserRound, match: ['/profile'] },
]
export function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav className="bottomnav" aria-label={t('Main')}>
      {NAV.map((n) => {
        const active = n.match.some((m) => pathname === m || pathname.startsWith(m + '/'))
        return (
          <Link key={n.to} to={n.to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
            <span className="ni"><n.Icon size={22} strokeWidth={active ? 2.4 : 2} /></span>{t(n.label)}
          </Link>
        )
      })}
    </nav>
  )
}

/* ---------- sticky footer CTA ---------- */
export function FooterCTA({ children }: { children: ReactNode }) {
  return <div className="footer-cta">{children}</div>
}

/* ---------- generic states ---------- */
export function Loading() {
  return <div className="center"><div className="spinner" /></div>
}
export function ErrorState({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="state">
      <div className="ico"><AlertTriangle size={42} /></div>
      <h3>{t('Something went wrong')}</h3>
      <p>{msg}</p>
      <button className="btn" style={{ maxWidth: 200 }} onClick={onRetry}>{t('Retry')}</button>
    </div>
  )
}
