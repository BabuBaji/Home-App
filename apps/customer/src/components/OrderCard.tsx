// The booking row shared by My Bookings (58), Upcoming (59), Completed (61) and Cancelled (62).
// Date medallion · service + price + when + address · worker + status pill.
import { Star } from 'lucide-react'
import type { Booking } from '../types'
import { addressLines, chipClass, durationLabel, medallion, STATUS_LABEL, whenLine } from '../orders'

const money = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`

/** Worker avatar — the real photo when the expert has one, else their initial. */
export function WorkerAvatar({ name, src, size = 26 }: { name?: string; src?: string | null; size?: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  if (src) return <img className="ord-av" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
  return <span className="ord-av ord-av-ph" style={{ width: size, height: size, fontSize: size * 0.42 }}>{initial}</span>
}

export default function OrderCard({ b, onClick }: { b: Booking; onClick: () => void }) {
  const m = medallion(b)
  const dur = durationLabel(b)
  const when = whenLine(b)
  const addr = addressLines(b)
  const primary = b.items[0]
  const extra = b.items.length - 1

  return (
    <button className="ord-card" onClick={onClick}>
      <span className="ord-med">
        <span className="ord-med-m">{m.month}</span>
        <span className="ord-med-d">{m.day}</span>
        <span className="ord-med-w">{m.weekday}</span>
      </span>

      <span className="ord-body">
        <span className="ord-title">{primary?.name}{extra > 0 ? ` +${extra}` : ''}</span>
        <span className="ord-sub">
          {dur && <>{dur} • </>}{money(b.total)}
        </span>
        {when && <span className="ord-when">{when}</span>}
        {addr.map((line, i) => <span key={i} className="ord-addr">{line}</span>)}

        <span className="ord-foot">
          <span className="ord-worker">
            {b.pro_name ? (
              <>
                <WorkerAvatar name={b.pro_name} src={b.pro?.avatar} />
                <span className="ord-worker-name">{b.pro_name}</span>
                {b.pro_rating ? (
                  <span className="ord-rate">{b.pro_rating}<Star size={11} className="ord-star" /></span>
                ) : null}
              </>
            ) : (
              <span className="ord-worker-name muted">Expert not assigned yet</span>
            )}
          </span>
          <span className={`status-chip ${chipClass(b.status)}`}>{STATUS_LABEL[b.status] || b.status}</span>
        </span>
      </span>
    </button>
  )
}
