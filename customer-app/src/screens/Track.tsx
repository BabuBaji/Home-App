import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header, FooterCTA, Loading, useToast } from '../components/UI'
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

  useEffect(() => {
    fetchBooking(bid).then((data) => {
      setB(data)
      const s = getSocket(); s.emit('booking:join', bid)
      if (data.status === 'confirmed') trackBooking(bid).catch(() => {})
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
  const h = heads[b.status]
  const serving = b.status === 'in_progress' || b.status === 'completed'
  const posLeft = b.pos ? `${8 + b.pos.lng * 70}%` : '10%'
  const posTop = b.pos ? `${18 + b.pos.lat * 55}%` : '20%'

  async function verify() { setBusy(true); try { setB(await verifyServiceOtp(bid, b!.service_otp)); toast('OTP verified · service started') } catch (e) { toast((e as Error).message) } finally { setBusy(false) } }
  async function complete() { setBusy(true); try { await completeBooking(bid); nav(`/rate/${bid}`, { replace: true }) } catch (e) { toast((e as Error).message); setBusy(false) } }

  const phone = '+919876500000'
  const waMsg = encodeURIComponent(`Hi, regarding my HomeHelp booking ${b.ref}`)

  return (
    <div className="screen">
      <Header title="Track Your Expert" />
      <div className="content pad-cta">
        <div className="track-status"><h2 className={h.cls}>{h.t}</h2><p>{h.s}</p></div>

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

        {b.status !== 'cancelled' && (
          <div className="map">
            <svg viewBox="0 0 360 200" preserveAspectRatio="none"><path d="M 36 50 C 130 60,150 150,250 150 S 300 170,320 168" stroke="#5b3df0" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray={b.status === 'arrived' ? '8 8' : '0'} /></svg>
            {!serving && <div className="pro-pin" style={{ left: posLeft, top: posTop }}>🛵</div>}
            {serving && <div className="serving-zone">🧹</div>}
            <div className="home-pin">🏠</div>
          </div>
        )}

        {(b.status === 'on_the_way' || b.status === 'worker_assigned') && <div className="eta-bar"><div>📍 {b.dist ?? 2.4} km away</div><div>🕐 {b.eta ?? 12} mins</div></div>}
        {b.status === 'arrived' && <div className="eta-bar"><div>📍 Arrived</div><div>🕐 Just now</div></div>}
        {serving && <div className="eta-bar"><div>🧹 {b.status === 'completed' ? 'Completed' : 'In progress'}</div><div>🕐 ~{b.eta ?? 28} min</div></div>}

        {b.status !== 'cancelled' && (
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
          <div className="otp-box"><div className="ot">📋 Start Service OTP</div><p className="muted sm">Share this OTP with your expert to begin</p>
            <div className="otp-digits">{b.service_otp.split('').map((d, i) => <span key={i}>{d}</span>)}</div><p className="muted sm">Valid for 10:00 mins</p></div>
        )}
        {b.status === 'in_progress' && (
          <div className="otp-box light"><div className="ot">🕐 Estimated time left</div><div className="big-time">25 - 30 mins</div><p className="muted sm">We'll notify you when it's done.</p></div>
        )}
      </div>

      <FooterCTA>
        {['confirmed', 'worker_assigned', 'on_the_way'].includes(b.status) && (
          <div className="row-btns">
            <button className="btn-ghost" onClick={() => nav(`/reschedule/${bid}`)}>Reschedule</button>
            <button className="btn-ghost danger-ghost" onClick={() => nav(`/cancel/${bid}`)}>Cancel</button>
          </div>
        )}
        {b.status === 'arrived' && <button className="btn full" onClick={verify} disabled={busy}>{busy ? 'Verifying…' : 'Verify OTP & Start Service'}</button>}
        {b.status === 'in_progress' && <button className="btn full" onClick={complete} disabled={busy}>Mark Service Completed</button>}
        {(b.status === 'completed') && <button className="btn full" onClick={() => nav(`/rate/${bid}`)}>Rate your experience</button>}
        {(b.status === 'cancelled') && <button className="btn full" onClick={() => nav('/bookings', { replace: true })}>Go to My Bookings</button>}
      </FooterCTA>
    </div>
  )
}
