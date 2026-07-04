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
        <div className="cf-deco" aria-hidden><i /><i /><i /><i /><i /><i /></div>
        <button className="cf-back" onClick={() => nav('/home', { replace: true })}>←</button>
        <div className="cf-seal">
          <svg className="cf-art" viewBox="0 0 220 210" width="164" height="157" aria-hidden>
            <defs>
              <linearGradient id="cfUni" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#7c6df7" /><stop offset="1" stopColor="#4a3fcf" />
              </linearGradient>
              <clipPath id="cfDisc"><circle cx="110" cy="100" r="90" /></clipPath>
            </defs>
            {/* scene disc — light so the violet uniform stands out */}
            <circle cx="110" cy="100" r="90" fill="#f1edff" />
            <g clipPath="url(#cfDisc)">
              {/* torso / uniform */}
              <path d="M20 214 C20 150 64 126 110 126 C156 126 200 150 200 214 Z" fill="url(#cfUni)" />
              {/* apron */}
              <path d="M86 146 H134 V214 H86 Z" fill="#eef0ff" />
              <path d="M95 146 h30 l-5 13 a10 10 0 0 1 -20 0 Z" fill="#dfe2ff" />
              {/* collar */}
              <path d="M90 142 L110 159 L130 142 L124 132 L96 132 Z" fill="#eef0ff" />
              {/* neck */}
              <rect x="102" y="104" width="16" height="24" rx="8" fill="#eeb892" />
              {/* head */}
              <circle cx="110" cy="82" r="32" fill="#f6c4a0" />
              {/* hair */}
              <path d="M78 82 a32 32 0 0 1 64 0 q-7 -18 -32 -18 q-25 0 -32 18 Z" fill="#39302b" />
              {/* happy face */}
              <path d="M95 80 q5 -6 10 0" stroke="#39302b" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M115 80 q5 -6 10 0" stroke="#39302b" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M99 90 q11 11 22 0" stroke="#b5654a" strokeWidth="3.4" fill="none" strokeLinecap="round" />
              <circle cx="89" cy="89" r="5" fill="#ff9e8a" opacity="0.55" />
              <circle cx="131" cy="89" r="5" fill="#ff9e8a" opacity="0.55" />
            </g>
            {/* disc ring */}
            <circle cx="110" cy="100" r="90" fill="none" stroke="#ffffff" strokeWidth="4" opacity="0.55" />
            {/* sparkles */}
            <path className="cf-spark s1" d="M200 50 l2.6 6.6 l6.6 2.6 l-6.6 2.6 l-2.6 6.6 l-2.6 -6.6 l-6.6 -2.6 l6.6 -2.6 Z" fill="#ffd36b" />
            <path className="cf-spark s2" d="M14 66 l2.4 6 l6 2.4 l-6 2.4 l-2.4 6 l-2.4 -6 l-6 -2.4 l6 -2.4 Z" fill="#7ef0d3" />
            <path className="cf-spark s3" d="M202 144 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" fill="#ff8fb0" />
          </svg>
          <span className="cf-emoji">👍</span>
        </div>
        <h1 className="cf-title">Booking Confirmed!</h1>
        <p className="cf-sub">{instant
          ? 'Your expert is being assigned right now'
          : 'Expert is dispatched and your OTP is sent 1 hour before your slot'}</p>
      </div>

      <div className="content cf-body pad-cta">
        <div className="cf-card">
          {/* OTP — shown for instant bookings; withheld until 1 h before a scheduled slot */}
          {b.service_otp ? (
            <div className="cf-otp-block">
              <div className="cf-otp-head">
                <div>
                  <div className="cf-otp-h">Check-in OTP</div>
                  <div className="cf-otp-s">Share with your expert to start the service</div>
                </div>
                <button className="cf-share" onClick={shareOtp}>↗ Share</button>
              </div>
              <div className="cf-otp-boxes">
                {String(b.service_otp).split('').map((d, i) => <span className="cf-otp-box" key={i}>{d}</span>)}
              </div>
            </div>
          ) : (
            <div className="cf-otp-pending">
              🔐 Your <b>check-in OTP</b> will be sent <b>1 hour before</b> your slot ({when}). You'll see it on the Track screen then — no need to wait here.
            </div>
          )}

          <div className="cf-div" />

          {/* when */}
          <div className="cf-line">
            <span className="cf-ic">🗓️</span>
            <span><b>{when}</b> · {b.duration || '60 min'} visit</span>
          </div>

          {/* address */}
          <div className="cf-line">
            <span className="cf-ic loc">📍</span>
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
