import { type ReactNode, useEffect, useState, createContext, useContext, useCallback } from 'react'
import { AlertTriangle, X, Search, TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react'

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

export function StatCard({ icon, tint, label, value, delta, sub, down }: { icon: ReactNode; tint: string; label: string; value: ReactNode; delta?: ReactNode; sub?: ReactNode; down?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-ico" style={{ background: `${tint}14`, color: tint }}>{icon}</div>
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <div className="stat-line">
          <strong className="stat-value">{value}</strong>
          {delta != null && <span className={'stat-delta' + (down ? ' down' : '')}>{down ? <TrendingDown size={12} /> : <TrendingUp size={12} />}{delta}</span>}
        </div>
        {sub && <span className="stat-sub">{sub}</span>}
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

/* ---------- pagination footer ---------- */
function pageWindow(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const lo = Math.max(2, page - 1), hi = Math.min(pages - 1, page + 1)
  if (lo > 2) out.push('…')
  for (let i = lo; i <= hi; i++) out.push(i)
  if (hi < pages - 1) out.push('…')
  out.push(pages)
  return out
}
export function Pagination({ page, pageSize, total, noun = 'items', onPage, onSize }: {
  page: number; pageSize: number; total: number; noun?: string; onPage: (p: number) => void; onSize?: (s: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="pager">
      <span className="pager-info">Showing {from} to {to} of {total} {noun}</span>
      <div className="pager-mid">
        <button className="pgbtn" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={15} /></button>
        {pageWindow(page, pages).map((p, i) => p === '…'
          ? <span key={'d' + i} className="pgbtn dots">…</span>
          : <button key={p} className={'pgbtn' + (p === page ? ' active' : '')} onClick={() => onPage(p)}>{p}</button>)}
        <button className="pgbtn" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={15} /></button>
      </div>
      <div className="pgsize">
        <select className="select" value={pageSize} onChange={(e) => onSize?.(Number(e.target.value))} disabled={!onSize}>
          {[5, 10, 20, 50].map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>
      </div>
    </div>
  )
}

/* ---------- summary bar list (right rail) ---------- */
export function SumBars({ rows }: { rows: { label: string; value: ReactNode; pct: number; color?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.pct))
  return (
    <div className="sumbars">
      {rows.map((r, i) => (
        <div key={i} className="sumbar">
          <span className="sumbar-label">{r.label}</span>
          <span className="sumbar-val">{r.value}</span>
          <span className="sumbar-track"><span className="sumbar-fill" style={{ width: `${Math.round((r.pct / max) * 100)}%`, ...(r.color ? { background: r.color } : {}) }} /></span>
        </div>
      ))}
    </div>
  )
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
