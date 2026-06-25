import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header, FooterCTA, Loading, useToast } from '../components/UI'
import { fetchBooking, cancelBookingApi } from '../api'
import type { Booking } from '../types'

const REASONS = ['Booked by mistake', 'Found a better price', 'Service no longer needed', 'Expert is taking too long', 'Want to change date/time', 'Other']

export default function Cancel() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [b, setB] = useState<Booking | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchBooking(Number(id)).then(setB).catch(() => {}) }, [id])
  if (!b) return <div className="screen"><Header title="Cancel Booking" /><Loading /></div>

  const fee = ['confirmed', 'worker_assigned'].includes(b.status) ? 0 : 50
  const refund = b.payment === 'cash' ? 0 : Math.max(0, b.total - fee)

  async function confirm() {
    if (!reason) return toast('Please select a reason')
    setBusy(true)
    try { await cancelBookingApi(Number(id), reason); toast('Booking cancelled'); setTimeout(() => nav(`/track/${id}`, { replace: true }), 600) }
    catch (e) { toast((e as Error).message); setBusy(false) }
  }

  return (
    <div className="screen">
      <Header title="Cancel Booking" />
      <div className="content pad-cta">
        <div className="card pad">
          <div className="bk-date">{b.ref}</div>
          <div className="bk-svcs">{b.items.map((i) => i.name).join(', ')}</div>
        </div>

        <h3 className="section-title">Why are you cancelling?</h3>
        <div className="card pad">
          {REASONS.map((r) => (
            <label key={r} className="reason-row">
              <span className="radio">{reason === r ? '✓' : ''}</span>
              <span className="grow">{r}</span>
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} hidden />
            </label>
          ))}
        </div>

        <div className="card pad mt">
          <div className="label">Refund Summary</div>
          <div className="kv"><span className="k">Amount paid</span><span className="v">₹{b.payment === 'cash' ? 0 : b.total}</span></div>
          <div className="kv"><span className="k">Cancellation fee</span><span className="v">₹{fee}</span></div>
          <div className="divider" />
          <div className="kv total"><span className="k">Refund to wallet</span><span className="v" style={{ color: 'var(--green)' }}>₹{refund}</span></div>
          {fee > 0 && <p className="muted sm" style={{ marginTop: 6 }}>A ₹{fee} fee applies as the expert is already on the way.</p>}
        </div>
      </div>
      <FooterCTA>
        <button className="btn full danger-btn" onClick={confirm} disabled={busy}>{busy ? 'Cancelling…' : 'Confirm Cancellation'}</button>
        <button className="btn-text full" onClick={() => nav(-1)}>Keep my booking</button>
      </FooterCTA>
    </div>
  )
}
