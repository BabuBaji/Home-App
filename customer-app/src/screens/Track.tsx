import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header, FooterCTA, Loading, useToast } from '../components/UI'
import LiveMap from '../components/LiveMap'
import { fetchBooking, trackBooking, getSocket, completeBooking } from '../api'
import type { Booking } from '../types'

const STEPS = ['Confirmed', 'Assigned', 'On Way', 'Arrived', 'Started', 'Done']
const IDX: Record<string, number> = { confirmed: 0, worker_assigned: 1, on_the_way: 2, arrived: 3, in_progress: 4, completed: 5, cancelled: 0 }

export default function Track() {
  const { id } = useParams()
  const bid = Number(id)
  const nav = useNavigate()
  const toast = useToast()
  const [b, setB] = useState<Booking | null>(null)
  const [busy, setBusy] = useState(false)
  const [, force] = useState(0)

  // 1-second heartbeat so the live service timer re-renders
  useEffect(() => {
    const i = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    fetchBooking(bid).then((data) => {
      setB(data)
      const s = getSocket(); s.emit('booking:join', bid)
      // A future scheduled booking waits — don't dispatch the expert until its window opens.
      if (data.status === 'confirmed' && data.otp_released !== false) trackBooking(bid).catch(() => {})
    }).catch(() => toast('Could not load booking'))
    const s = getSocket()
    const onUpd = (u: Booking) => { if (u.id === bid) setB((p) => ({ ...p, ...u })) }
    // On (re)connect — e.g. after a dropped link or a server restart — rejoin the
    // booking room and refetch, so the live status/timer never gets stuck.
    const onConnect = () => { s.emit('booking:join', bid); fetchBooking(bid).then((d) => setB((p) => ({ ...p, ...d }))).catch(() => {}) }
    s.on('booking:update', onUpd)
    s.on('connect', onConnect)
    return () => { s.off('booking:update', onUpd); s.off('connect', onConnect); s.emit('booking:leave', bid) }
  }, [bid])

  // When the worker ends the service (photo uploaded), the booking flips to completed —
  // take the customer straight to the review/feedback page.
  useEffect(() => {
    if (b?.status === 'completed') { const t = setTimeout(() => nav(`/rate/${bid}`, { replace: true }), 700); return () => clearTimeout(t) }
  }, [b?.status])

  if (!b) return <div className="screen"><Header title="Track" /><Loading /></div>

  const idx = IDX[b.status]
  const heads: Record<string, { t: string; s: string; cls?: string }> = {
    confirmed: { t: 'Booking Confirmed', s: 'Assigning an expert near you…' },
    worker_assigned: { t: 'Expert Assigned', s: 'Your expert is getting ready' },
    on_the_way: { t: 'On the Way', s: 'Your expert is heading to you' },
    arrived: { t: 'Expert has Arrived', s: 'Share the OTP to start service' },
    in_progress: { t: 'Service in Progress', s: 'Your expert is at work' },
    completed: { t: 'Service Completed', s: 'Hope you had a great experience!' },
    cancelled: { t: 'Booking Cancelled', s: b.refund ? `₹${b.refund} refunded to wallet` : 'Booking was cancelled', cls: 'red' },
  }
  // future scheduled booking still waiting for its 1-hour-before window
  const schedStart = b.scheduled_at ?? null
  const scheduledWaiting = b.status === 'confirmed' && b.otp_released === false && schedStart != null
  const otpReleaseAt = schedStart != null ? schedStart - 60 * 60 * 1000 : null
  // No active worker provides this service → tell the customer instead of "assigning…".
  const noWorker = b.status === 'confirmed' && b.serviceAvailable === false
  const h = noWorker
    ? { t: 'No Service Found', s: 'No worker is available for this service in your area yet.', cls: 'red' as string | undefined }
    : scheduledWaiting
      ? { t: 'Booking Scheduled', s: 'Your expert will be dispatched near your slot', cls: undefined as string | undefined }
      : heads[b.status]
  const serving = b.status === 'in_progress' || b.status === 'completed'
  const posLeft = b.pos ? `${8 + b.pos.lng * 70}%` : '10%'
  const posTop = b.pos ? `${18 + b.pos.lat * 55}%` : '20%'

  // live service timer
  const DUR_MIN: Record<string, number> = { '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }
  const targetMin = DUR_MIN[b.items[0]?.durationId] ?? 60
  const startedMs = b.started_at ? new Date(b.started_at).getTime() : Date.now()
  const completedMs = b.completed_at ? new Date(b.completed_at).getTime() : null
  // Completed → show the REAL time the worker spent (completed_at − started_at);
  // fall back to the booked time only if timestamps are missing.
  const elapsedSec = b.status === 'completed'
    ? (b.started_at && completedMs ? Math.max(0, Math.round((completedMs - startedMs) / 1000)) : targetMin * 60)
    : Math.max(0, Math.floor((Date.now() - startedMs) / 1000))
  const targetSec = targetMin * 60
  const remainingSec = Math.max(0, targetSec - elapsedSec)
  const pct = Math.min(100, (elapsedSec / targetSec) * 100)
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
  }

  async function complete() { setBusy(true); try { await completeBooking(bid); nav(`/rate/${bid}`, { replace: true }) } catch (e) { toast((e as Error).message); setBusy(false) } }

  const phone = '+919876500000'
  const proPhone = b.pro?.phone || phone // the assigned worker's real number (else support line)
  const waMsg = encodeURIComponent(`Hi, regarding my HomeHelp booking ${b.ref}`)
  // Expected arrival clock time = now + ETA minutes (Rapido-style).
  const arriveBy = (mins: number) => new Date(Date.now() + mins * 60000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="screen">
      <Header title="Track Your Expert" />
      <div className="content pad-cta">
        <div className="track-status"><h2 className={h.cls}>{h.t}</h2><p>{h.s}</p></div>

        {noWorker && (
          <div className="card" style={{ border: '1px solid #f3c0c0', background: '#fff5f5' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 22 }}>🚫</span>
              <div>
                <div style={{ fontWeight: 700, color: '#c0392b', marginBottom: 2 }}>No worker found for this service</div>
                <div className="muted sm">No active expert currently offers “{b.items?.[0]?.name || 'this service'}”. We’ll auto-assign one the moment a matching expert is available. You can also cancel for a full refund.</div>
              </div>
            </div>
          </div>
        )}

        {scheduledWaiting && (
          <div className="card sched-card">
            <div className="sched-row">
              <span className="sched-ic">🗓️</span>
              <div><div className="sched-t">{b.date} · {b.time}</div><div className="sched-s">{b.duration || '60 min'} visit · no need to wait here</div></div>
            </div>
            <div className="sched-otp">🔐 Your <b>start OTP</b> will be sent <b>1 hour before</b> — in {until(otpReleaseAt!)}</div>
            <div className="sched-foot">⏳ Service begins in {until(schedStart!)}</div>
          </div>
        )}

        <div className="steps mini">
          {STEPS.map((st, i) => (
            <div key={st} style={{ display: 'contents' }}>
              <div className={`step ${i < idx ? 'done' : ''} ${i === idx && b.status !== 'completed' ? 'active' : ''}`}>
                <span className="dot">{i < idx || b.status === 'completed' ? '✓' : i + 1}</span><span className="lbl">{st}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`step-line ${i < idx ? 'done' : ''}`} />}
            </div>
          ))}
        </div>

        {b.status !== 'cancelled' && !scheduledWaiting && !noWorker && <LiveMap booking={b} />}

        {(b.status === 'on_the_way' || b.status === 'worker_assigned') && (
          b.eta != null ? (
            <div className="card" style={{ background: '#eef0ff', border: '1px solid #d7d3f7', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 26 }}>🛵</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#4840c4' }}>Arriving in ~{b.eta} min</div>
                <div className="muted sm">Reaches you by <b>{arriveBy(b.eta)}</b>{b.dist != null ? ` · ${b.dist} km away` : ''}</div>
              </div>
            </div>
          ) : (
            <div className="eta-bar"><div>🛵 {b.status === 'on_the_way' ? 'On the way' : 'Expert assigned'}</div><div>Finding the best route…</div></div>
          )
        )}
        {b.status === 'arrived' && <div className="eta-bar"><div>📍 Arrived</div><div>🕐 At your location</div></div>}
        {serving && <div className="eta-bar"><div>🧹 {b.status === 'completed' ? 'Completed' : 'In progress'}</div><div>🕐 {b.status === 'completed' ? 'Done' : 'Service running'}</div></div>}

        {b.status !== 'cancelled' && !scheduledWaiting && !noWorker && (
          <div className="card pro-card">
            <div className="ava">👩🏻</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pn">{b.pro?.name || b.pro_name}</div>
              <div className="pr">⭐ {b.pro?.rating ?? b.pro_rating} · <b>{(b.pro?.servicesDone ?? 0).toLocaleString('en-IN')} services done</b> · {b.pro?.reviewsCount ?? 0} reviews</div>
              {b.pro?.services && b.pro.services.length > 0 && <div className="pr" style={{ marginTop: 2 }}>🧰 {b.pro.services.join(' · ')}</div>}
              {b.pro?.phone && <div className="pr" style={{ marginTop: 2 }}>📞 {b.pro.phone}</div>}
            </div>
            <div className="pro-actions">
              <a className="circle-btn" href={`tel:${proPhone}`} aria-label="Call worker">📞</a>
              <button className="circle-btn" onClick={() => toast('Chat opening…')}>💬</button>
              <a className="circle-btn wa" href={`https://wa.me/${proPhone.replace(/[^0-9]/g, '')}?text=${waMsg}`} target="_blank">🟢</a>
            </div>
          </div>
        )}

        {!noWorker && b.pro?.reviews && b.pro.reviews.length > 0 && (
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>What customers say about {b.pro.name.split(' ')[0]}</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {b.pro.reviews.slice(0, 3).map((r, i) => (
                <div key={i} style={{ borderTop: i ? '1px solid #f0eef9' : 'none', paddingTop: i ? 10 : 0 }}>
                  <div style={{ fontSize: 13 }}>{'⭐'.repeat(Math.max(1, Math.min(5, r.rating || 5)))}</div>
                  {r.review && <div style={{ fontSize: 13, color: '#444', margin: '2px 0' }}>“{r.review}”</div>}
                  <div className="muted sm">— {r.customer}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card info-3">
          <div><div className="it">🧾 Booking</div><div className="iv">{b.ref}</div></div>
          <div><div className="it">📅 When</div><div className="iv">{b.type === 'instant' ? 'Now' : `${b.date}, ${b.time}`}</div></div>
          <div><div className="it">💳 Payment</div><div className="iv">{b.payment === 'cash' ? 'Cash' : b.payment.toUpperCase()} · {b.payment_status}</div></div>
        </div>

        {b.status === 'arrived' && (
          <div className="otp-box">
            <div className="ot">📋 Start Service OTP</div>
            <p className="muted sm">Read this code out to your expert — they enter it to start the service</p>
            <div className="otp-digits">{(b.service_otp ?? '').split('').map((d, i) => <span key={i}>{d}</span>)}</div>
            <p className="muted sm">⏳ Waiting for {b.pro_name} to start the service…</p>
          </div>
        )}
        {(b.status === 'in_progress' || b.status === 'completed') && (
          <div className="timer-card">
            <div className="tc-top">{b.status === 'completed' ? '✅ Service completed' : '🧹 Service in progress'}</div>
            <div className="tc-time">{fmt(elapsedSec)}</div>
            <div className="tc-sub">{b.status === 'completed' ? 'total service time' : `elapsed · ${targetMin} min booked`}</div>
            {b.status !== 'completed' && <div className="tc-bar"><span style={{ width: `${pct}%` }} /></div>}
            {b.status !== 'completed' && <div className="tc-remain">{remainingSec > 0 ? `${fmt(remainingSec)} remaining` : 'Booked time reached — you can mark it complete'}</div>}
          </div>
        )}
      </div>

      <FooterCTA>
        {['confirmed', 'worker_assigned', 'on_the_way'].includes(b.status) && (
          <div className="row-btns">
            <button className="btn-ghost" onClick={() => nav(`/reschedule/${bid}`)}>Reschedule</button>
            <button className="btn-ghost danger-ghost" onClick={() => nav(`/cancel/${bid}`)}>Cancel</button>
          </div>
        )}
        {b.status === 'arrived' && <button className="btn full" disabled>Waiting for expert to start…</button>}
        {b.status === 'in_progress' && <button className="btn full" onClick={complete} disabled={busy}>Mark Service Completed</button>}
        {(b.status === 'completed') && <button className="btn full" onClick={() => nav(`/rate/${bid}`)}>Rate your experience</button>}
        {(b.status === 'cancelled') && <button className="btn full" onClick={() => nav('/bookings', { replace: true })}>Go to My Bookings</button>}
      </FooterCTA>
    </div>
  )
}

// Compact "time remaining" until a future timestamp (re-rendered by the 1s heartbeat).
function until(ms: number) {
  const s = Math.max(0, Math.floor((ms - Date.now()) / 1000))
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m} min`
  return 'under a minute'
}
