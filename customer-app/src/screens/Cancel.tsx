import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header, FooterCTA, Loading, useToast } from '../components/UI'
import { fetchBooking, fetchCancelQuote, cancelBookingApi, type CancelQuote } from '../api'
import type { Booking } from '../types'

const REASONS = ['Booked by mistake', 'Found a better price', 'Service no longer needed', 'Expert is taking too long', 'Want to change date/time', 'Other']

export default function Cancel() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [b, setB] = useState<Booking | null>(null)
  const [quote, setQuote] = useState<CancelQuote | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchBooking(Number(id)).then(setB).catch(() => {})
    fetchCancelQuote(Number(id)).then(setQuote).catch(() => {})
  }, [id])
  if (!b || !quote) return <div className="screen"><Header title="Cancel Booking" /><Loading /></div>

  const blocked = !quote.allowed

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

        {/* Policy banner — the engine tells us the stage + what it costs. */}
        <div className="card pad mt" style={{ borderLeft: `4px solid ${blocked ? 'var(--red, #e5484d)' : quote.fee > 0 ? '#f59e0b' : 'var(--green)'}` }}>
          <div className="label">{quote.title || 'Cancellation'}</div>
          <p className="muted sm" style={{ marginTop: 4 }}>{quote.note}</p>
          <button className="btn-text" style={{ padding: 0, marginTop: 6 }} onClick={() => nav('/cancellation-policy')}>View full cancellation policy ›</button>
        </div>

        {blocked ? (
          <div className="card pad mt">
            <p className="muted sm">This booking can’t be cancelled from here. If something’s wrong, please reach out to support and we’ll help.</p>
          </div>
        ) : (
          <>
            <h3 className="section-title">Why are you cancelling?</h3>
            <div className="card pad">
              {REASONS.map((r) => (
                <label key={r} className="reason-row">
                  <span className={`radio ${reason === r ? 'on' : ''}`}>{reason === r ? '✓' : ''}</span>
                  <span className="grow">{r}</span>
                  <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} hidden />
                </label>
              ))}
            </div>

            <div className="card pad mt">
              <div className="label">Refund Summary</div>
              <div className="kv"><span className="k">Amount paid</span><span className="v">₹{quote.paid}</span></div>
              <div className="kv"><span className="k">Cancellation fee</span><span className="v">₹{quote.fee}</span></div>
              <div className="divider" />
              <div className="kv total"><span className="k">Refund to wallet</span><span className="v" style={{ color: 'var(--green)' }}>₹{quote.refund}</span></div>
              {quote.paid === 0 && <p className="muted sm" style={{ marginTop: 6 }}>This was a cash booking, so there’s nothing to refund.</p>}
            </div>
          </>
        )}
      </div>
      <FooterCTA>
        {blocked
          ? <button className="btn full" onClick={() => nav('/support')}>Contact support</button>
          : <button className="btn full" onClick={confirm} disabled={busy}>{busy ? 'Cancelling…' : 'Confirm Cancellation'}</button>}
        <button className="btn-text full" onClick={() => nav(-1)}>Keep my booking</button>
      </FooterCTA>
    </div>
  )
}
