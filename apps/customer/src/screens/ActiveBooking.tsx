// 60 · Active Booking — the job happening right now: live status, expert, progress, ETA.
// Track Live / Chat / Call hand off to the existing Module 6 job screens; nothing new is invented.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Phone, Star } from 'lucide-react'
import { Loading } from '../components/UI'
import OrderCard, { WorkerAvatar } from '../components/OrderCard'
import { fetchBookings } from '../api'
import { estimatedCompletion, isActive, liveProgress, LIVE_LABEL, medallion, durationLabel, whenLine } from '../orders'
import type { Booking } from '../types'

const money = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`
// Newest first — the job that started most recently is the one the customer means by "active".
const when = (b: Booking) => new Date(b.started_at || b.scheduled_at || b.created).getTime()

export default function ActiveBooking() {
  const nav = useNavigate()
  const [items, setItems] = useState<Booking[] | null>(null)
  useEffect(() => { fetchBookings().then(setItems).catch(() => setItems([])) }, [])

  const active = (items || []).filter((b) => isActive(b.status)).sort((a, b) => when(b) - when(a))
  const b = active[0]

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Active Booking</h1></div>
      {b?.pro_name
        ? <button className="iconbtn" onClick={() => nav(`/job/${b.id}/call`)} aria-label="Call expert"><Phone size={18} /></button>
        : <span className="iconbtn ghost" />}
    </header>
  )

  if (!items) return <div className="screen">{head}<Loading /></div>
  if (!b) return (
    <div className="screen">{head}
      <div className="state"><div className="ico">🧹</div><h3>No active booking</h3><p>Your in-progress job will show here.</p></div>
    </div>
  )

  const m = medallion(b)
  const dur = durationLabel(b)
  const prog = liveProgress(b)
  const eta = estimatedCompletion(b)
  const sub = whenLine(b)

  return (
    <div className="screen">
      {head}
      <div className="content pad-cta">
        {/* summary */}
        <div className="ord-card static">
          <span className="ord-med">
            <span className="ord-med-m">{m.month}</span>
            <span className="ord-med-d">{m.day}</span>
            <span className="ord-med-w">{m.weekday}</span>
          </span>
          <span className="ord-body">
            <span className="ord-title">{b.items.map((i) => i.name).join(', ')}</span>
            <span className="ord-sub">{dur && <>{dur} • </>}{money(b.total)}</span>
            <span className="ord-live"><i className="ord-dot" />{LIVE_LABEL[b.status] || b.status}</span>
            {sub && <span className="ord-when">{sub}</span>}
          </span>
        </div>

        {/* expert */}
        {b.pro_name && (
          <div className="ord-pro">
            <WorkerAvatar name={b.pro_name} src={b.pro?.avatar} size={44} />
            <div className="ord-pro-main">
              <div className="ord-pro-name">{b.pro_name}</div>
              <div className="ord-pro-meta">
                {b.pro_rating ? <><span className="ord-rate">{b.pro_rating}<Star size={11} className="ord-star" /></span></> : null}
                {b.pro?.reviewsCount ? <span className="muted"> ({b.pro.reviewsCount} reviews)</span> : null}
              </div>
              {b.started_at && (
                <div className="ord-pro-since">On-site since {new Date(b.started_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
              )}
            </div>
            <button className="ord-call" onClick={() => nav(`/job/${b.id}/call`)} aria-label="Call expert"><Phone size={16} /></button>
          </div>
        )}

        {/* progress — derived from where the booking sits in the live pipeline */}
        {prog && (
          <div className="ord-block">
            <div className="ord-block-h">Service Progress</div>
            <div className="ord-prog-line">Step {prog.step} of {prog.total} · {prog.label}</div>
            <div className="ord-bar"><i style={{ width: `${prog.pct}%` }} /></div>
            <div className="ord-prog-pct">{prog.pct}%</div>
          </div>
        )}

        {eta && (
          <div className="ord-block">
            <div className="ord-block-h">Estimated Completion</div>
            <div className="ord-eta">{eta}</div>
          </div>
        )}

        {active.length > 1 && (
          <section className="ord-sec">
            <div className="ord-sec-head"><h2>Other active</h2></div>
            <div className="ord-list">
              {active.slice(1).map((o) => <OrderCard key={o.id} b={o} onClick={() => nav(`/booking-details/${o.id}`)} />)}
            </div>
          </section>
        )}
      </div>

      <div className="bd-foot col">
        <button className="btn full" onClick={() => nav(`/job/${b.id}/map`)}>Track Live</button>
        {b.pro_name && <button className="btn ghost full" onClick={() => nav(`/job/${b.id}/chat`)}>Chat with Worker</button>}
      </div>
    </div>
  )
}
