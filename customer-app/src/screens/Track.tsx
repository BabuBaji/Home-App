import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header, FooterCTA, Loading, useToast } from '../components/UI'
import LiveMap from '../components/LiveMap'
import { fetchBooking, trackBooking, getSocket, verifyServiceOtp, completeBooking } from '../api'
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
  const [otpInput, setOtpInput] = useState('')
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
    s.on('booking:update', onUpd)
    return () => { s.off('booking:update', onUpd); s.emit('booking:leave', bid) }
  }, [bid])

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
  const h = scheduledWaiting
    ? { t: 'Booking Scheduled', s: 'Your expert will be dispatched near your slot', cls: undefined as string | undefined }
    : heads[b.status]
  const serving = b.status === 'in_progress' || b.status === 'completed'
  const posLeft = b.pos ? `${8 + b.pos.lng * 70}%` : '10%'
  const posTop = b.pos ? `${18 + b.pos.lat * 55}%` : '20%'

  // live service timer
  const DUR_MIN: Record<string, number> = { '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }
  const targetMin = DUR_MIN[b.items[0]?.durationId] ?? 60
  const startedMs = b.started_at ? new Date(b.started_at).getTime() : Date.now()
  const elapsedSec = b.status === 'completed' ? targetMin * 60 : Math.max(0, Math.floor((Date.now() - startedMs) / 1000))
  const targetSec = targetMin * 60
  const remainingSec = Math.max(0, targetSec - elapsedSec)
  const pct = Math.min(100, (elapsedSec / targetSec) * 100)
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
  }

  async function verify() {
    if (otpInput.length !== 4) return toast('Enter the 4-digit OTP')
    setBusy(true)
    try { setB(await verifyServiceOtp(bid, otpInput)); toast('OTP verified · service started') }
    catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }
  async function complete() { setBusy(true); try { await completeBooking(bid); nav(`/rate/${bid}`, { replace: true }) } catch (e) { toast((e as Error).message); setBusy(false) } }

  const phone = '+919876500000'
  const waMsg = encodeURIComponent(`Hi, regarding my HomeHelp booking ${b.ref}`)

  return (
    <div className="screen">
      <Header title="Track Your Expert" />
      <div className="content pad-cta">
        <div className="track-status"><h2 className={h.cls}>{h.t}</h2><p>{h.s}</p></div>

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

        {b.status !== 'cancelled' && !scheduledWaiting && <LiveMap booking={b} />}

        {(b.status === 'on_the_way' || b.status === 'worker_assigned') && <div className="eta-bar"><div>📍 {b.dist ?? 2.4} km away</div><div>🕐 {b.eta ?? 12} mins</div></div>}
        {b.status === 'arrived' && <div className="eta-bar"><div>📍 Arrived</div><div>🕐 Just now</div></div>}
        {serving && <div className="eta-bar"><div>🧹 {b.status === 'completed' ? 'Completed' : 'In progress'}</div><div>🕐 ~{b.eta ?? 28} min</div></div>}

        {b.status !== 'cancelled' && !scheduledWaiting && (
          <div className="card pro-card">
            <div className="ava">👩🏻</div>
            <div><div className="pn">{b.pro_name}</div><div className="pr">🏅 Verified Expert · ⭐ {b.pro_rating}</div></div>
            <div className="pro-actions">
              <a className="circle-btn" href={`tel:${phone}`}>📞</a>
              <button className="circle-btn" onClick={() => toast('Chat opening…')}>💬</button>
              <a className="circle-btn wa" href={`https://wa.me/${phone.replace('+', '')}?text=${waMsg}`} target="_blank">🟢</a>
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
            <p className="muted sm">Share this OTP with your expert to begin</p>
            <div className="otp-digits">{(b.service_otp ?? '').split('').map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="otp-entry-wrap">
              <p className="muted sm">Expert enters it here to start the service</p>
              <input className="otp-entry" value={otpInput} inputMode="numeric" placeholder="• • • •"
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </div>
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
        {b.status === 'arrived' && <button className="btn full" onClick={verify} disabled={busy || otpInput.length !== 4}>{busy ? 'Verifying…' : 'Verify OTP & Start Service'}</button>}
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
