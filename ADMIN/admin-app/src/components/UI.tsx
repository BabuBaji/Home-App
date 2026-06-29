import { type ReactNode, useEffect, useState, createContext, useContext, useCallback } from 'react'
import { AlertTriangle, X, Search, TrendingUp, TrendingDown } from 'lucide-react'

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'err') => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastHost({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; kind: string } | null>(null)
  const show = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => setT({ msg, kind }), [])
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), 2800); return () => clearTimeout(id) }, [t])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div className={'toast ' + t.kind}>{t.msg}</div>}
    </ToastCtx.Provider>
  )
}

/* ---------- generic states ---------- */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="center" style={{ padding: 60 }}><div className="spinner" /><span className="muted" style={{ marginLeft: 12 }}>{label}</span></div>
}
export function ErrorState({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <div className="ico"><AlertTriangle size={40} /></div>
      <h3>Something went wrong</h3>
      <p>{msg}</p>
      {onRetry && <button className="btn" style={{ maxWidth: 180 }} onClick={onRetry}>Retry</button>}
    </div>
  )
}
export function Empty({ msg }: { msg: string }) {
  return <div className="state small"><p className="muted">{msg}</p></div>
}

/* ---------- cards & stats ---------- */
export function Card({ title, right, children, className = '' }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={'card ' + className}>
      {(title || right) && <div className="card-head"><h3>{title}</h3><div>{right}</div></div>}
      {children}
    </section>
  )
}

export function StatCard({ icon, tint, label, value, sub, down }: { icon: ReactNode; tint: string; label: string; value: ReactNode; sub?: ReactNode; down?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-ico" style={{ background: `linear-gradient(145deg, ${tint}1f, ${tint}33)`, color: tint, boxShadow: `0 6px 14px ${tint}26` }}>{icon}</div>
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        {sub && <span className={'stat-sub' + (down ? ' down' : '')}>{down ? <TrendingDown size={11} /> : <TrendingUp size={11} />}{sub}</span>}
      </div>
    </div>
  )
}

/* ---------- badge ---------- */
const TONE: Record<string, string> = {
  active: 'green', completed: 'green', paid: 'green', resolved: 'green', verified: 'green', open: 'amber',
  pending: 'amber', in_progress: 'blue', on_the_way: 'blue', arrived: 'blue', worker_assigned: 'blue',
  confirmed: 'violet', cancelled: 'red', blocked: 'red', inactive: 'gray', suspended: 'red', refunded: 'gray',
  high: 'red', medium: 'amber', low: 'gray', closed: 'gray',
}
export function Badge({ children, tone, dot = true }: { children: ReactNode; tone?: string; dot?: boolean }) {
  const t = tone || TONE[String(children).toLowerCase().replace(/\s+/g, '_')] || 'gray'
  return <span className={'badge ' + t}>{dot && <i className="bdot" />}{String(children).replace(/_/g, ' ')}</span>
}

/* ---------- search input ---------- */
export function SearchBox({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="searchbox">
      <Search size={17} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

/* ---------- modal ---------- */
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={'modal' + (wide ? ' wide' : '')} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="iconbtn" onClick={onClose}><X size={20} /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- field ---------- */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}

/* ---------- avatar ---------- */
export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  const hue = [...(name || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  if (src) return <img className="avatar" src={src} width={size} height={size} alt={name} />
  return <span className="avatar" style={{ width: size, height: size, background: `hsl(${hue} 60% 90%)`, color: `hsl(${hue} 55% 35%)`, fontSize: size * 0.36 }}>{initials}</span>
}

export const money = (n: number) => '₹' + (n ?? 0).toLocaleString('en-IN')
export const shortDate = (s?: string | null) => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
