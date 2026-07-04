import { type ReactNode, useEffect, useState, createContext, useContext, useCallback } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { ChevronLeft, House, CalendarDays, Wallet, User, AlertTriangle } from 'lucide-react'

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

/* ---------- Header ---------- */
export function Header({ title, subtitle, right, back = true }: {
  title: string; subtitle?: string; right?: ReactNode; back?: boolean
}) {
  const nav = useNavigate()
  return (
    <header className="appbar">
      {back ? <button className="iconbtn" onClick={() => nav(-1)}><ChevronLeft size={24} /></button> : <span className="iconbtn ghost" />}
      <div className="titles">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="iconbtn ghost">{right}</div>
    </header>
  )
}

/* ---------- Bottom nav ---------- */
const NAV = [
  { to: '/home', label: 'Home', Icon: House },
  { to: '/bookings', label: 'Bookings', Icon: CalendarDays },
  { to: '/wallet', label: 'Wallet', Icon: Wallet },
  { to: '/profile', label: 'Profile', Icon: User },
]
export function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav className="bottomnav">
      {NAV.map((n) => {
        const active = pathname.startsWith(n.to)
        return (
          <Link key={n.to} to={n.to} className={active ? 'active' : ''}>
            <span className="ni"><n.Icon size={22} strokeWidth={active ? 2.4 : 2} /></span>{n.label}
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
      <h3>Something went wrong</h3>
      <p>{msg}</p>
      <button className="btn" style={{ maxWidth: 200 }} onClick={onRetry}>Retry</button>
    </div>
  )
}
