import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react'

/* Small building blocks shared by the Field app tabs. Everything is prefixed `fd-` in field.css so
   none of it leaks into the desktop panel. */

export function timeAgo(iso?: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} d ago`
}

export const fmtAge = (min: number) => (min < 60 ? `${min}m` : min < 1440 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${Math.floor(min / 1440)}d`)

export const telHref = (phone?: string | null) => (phone ? 'tel:' + String(phone).replace(/[^\d+]/g, '') : '')
export const mapHref = (lat?: number | null, lng?: number | null) =>
  lat != null && lng != null ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : ''

export const pretty = (s: string) => s.replace(/[_.-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** Polls `fn` every `ms` while the tab is visible; `reload()` forces a refetch. Keeps the last good
 *  data on a failed refresh so a flaky network doesn't blank the screen. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const alive = useRef(true)
  const seq = useRef(0)

  const reload = useCallback(async (silent = false) => {
    const my = ++seq.current
    if (!silent) setRefreshing(true)
    try {
      const d = await fnRef.current()
      if (!alive.current || my !== seq.current) return
      setData(d); setError('')
    } catch (e) {
      if (!alive.current || my !== seq.current) return
      setError((e as Error).message || 'Could not load')
    } finally {
      if (alive.current && my === seq.current) { setLoading(false); setRefreshing(false) }
    }
  }, [])

  useEffect(() => {
    alive.current = true
    setLoading(true)
    reload(true)
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') reload(true) }, ms)
    const onVis = () => { if (document.visibilityState === 'visible') reload(true) }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive.current = false; window.clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, refreshing, reload }
}

export function Header({ title, sub, onRefresh, refreshing, children }: { title: string; sub?: ReactNode; onRefresh?: () => void; refreshing?: boolean; children?: ReactNode }) {
  return (
    <header className="fd-head">
      <div className="fd-head-row">
        <div style={{ minWidth: 0 }}>
          <h1>{title}</h1>
          {sub && <div className="fd-head-sub">{sub}</div>}
        </div>
        {onRefresh && (
          <button className="fd-iconbtn" onClick={onRefresh} aria-label="Refresh" disabled={refreshing}>
            <RefreshCw size={20} className={refreshing ? 'fd-spin' : ''} />
          </button>
        )}
      </div>
      {children}
    </header>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="fd-state"><Loader2 size={28} className="fd-spin" /><p>{label}</p></div>
}

export function ErrorBox({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div className="fd-state fd-state-err">
      <AlertTriangle size={30} />
      <h3>Couldn't load</h3>
      <p>{msg}</p>
      {onRetry && <button className="fd-btn fd-btn-primary" onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function EmptyBox({ icon, title, msg }: { icon: ReactNode; title: string; msg?: string }) {
  return (
    <div className="fd-state">
      <div className="fd-state-ico">{icon}</div>
      <h3>{title}</h3>
      {msg && <p>{msg}</p>}
    </div>
  )
}

/** A bottom sheet — the phone-native replacement for a desktop modal. */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div className="fd-sheet-scrim" onClick={onClose}>
      <div className="fd-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="fd-sheet-grip" />
        <div className="fd-sheet-head">
          <h2>{title}</h2>
          <button className="fd-iconbtn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="fd-sheet-body">{children}</div>
        {footer && <div className="fd-sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}
