import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loading, useToast } from '../components/UI'
import { fetchBooking, fetchMe } from '../api'
import type { Booking, Address } from '../types'

export default function Confirmed() {
  const { id } = useParams()
  const bid = Number(id)
  const nav = useNavigate()
  const toast = useToast()
  const [b, setB] = useState<Booking | null>(null)
  const [addr, setAddr] = useState<Address | null>(null)

  useEffect(() => {
    fetchBooking(bid).then(setB).catch(() => toast('Could not load booking'))
    fetchMe().then(({ addresses }) => setAddr(addresses.find((a) => a.is_default) || addresses[0] || null)).catch(() => {})
  }, [bid])

  if (!b) return <div className="screen"><Loading /></div>

  const instant = b.type === 'instant'
  const when = instant ? 'Now' : `${b.date || 'Scheduled'}, ${b.time || ''}`.trim()
  const cashback = Math.min(50, Math.max(10, Math.round(b.total * 0.2)))
  const addrLabel = addr?.label || 'Home'
  const addrLine = b.address || addr?.line || ''

  function shareOtp() {
    const msg = `My HomeHelp check-in OTP is ${b!.service_otp}. Share it with the expert to start the service.`
    const n: any = navigator
    if (n.share) n.share({ title: 'HomeHelp OTP', text: msg }).catch(() => {})
    else { n.clipboard?.writeText(msg); toast('OTP copied — share it with your expert') }
  }

  return (
    <div className="screen cf-screen">
      <div className="cf-top">
        <button className="cf-back" onClick={() => nav('/home', { replace: true })}>←</button>
        <div className="cf-seal">
          <span className="cf-seal-badge">✓</span>
        </div>
        <h1 className="cf-title">Booking Confirmed!</h1>
        <p className="cf-sub">{instant
          ? 'Your expert is being assigned right now'
          : 'Expert will be assigned 15 min before your scheduled time'}</p>
      </div>

      <div className="content cf-body pad-cta">
        <div className="cf-card">
          {/* OTP */}
          <div className="cf-otp-row">
            <div>
              <div className="cf-otp-h">Check-in OTP</div>
              <div className="cf-otp-s">Share with expert to start service</div>
            </div>
            <div className="cf-otp-boxes">
              {String(b.service_otp).split('').map((d, i) => <span className="cf-otp-box" key={i}>{d}</span>)}
            </div>
          </div>

          <div className="cf-share-row">
            <span className="muted sm">Booked for someone else?</span>
            <button className="cf-share" onClick={shareOtp}>🟢 Share OTP ›</button>
          </div>

          <div className="cf-div" />

          {/* when */}
          <div className="cf-line">
            <span className="cf-ic">🗓️</span>
            <span><b>{when}</b> · {b.duration || '60 min'} visit</span>
          </div>

          {/* address */}
          <div className="cf-line">
            <span className="cf-ic">📍</span>
            <span><b>{addrLabel}</b> | {addrLine}</span>
          </div>

          {/* cashback */}
          <div className="cf-cashback">
            <span className="cf-cb-ic">🪙</span>
            <span>₹{cashback} Cashback will be credited after service</span>
          </div>

          {/* tip */}
          <div className="cf-tip">
            <span className="cf-tip-ic">🐾</span>
            <span>Kindly keep pets secure and away during the service</span>
          </div>
        </div>

        <div className="cf-summary">
          <span className="grow">{b.items.map((i) => i.name).join(', ')}</span>
          <b>₹{b.total}</b>
        </div>
      </div>

      <div className="footer-cta cf-cta">
        <button className="btn-outline half" onClick={() => nav('/bookings', { replace: true })}>My Bookings</button>
        <button className="btn half" onClick={() => nav(`/track/${b.id}`, { replace: true })}>Track Expert →</button>
      </div>
    </div>
  )
}
