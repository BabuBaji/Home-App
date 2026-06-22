import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, FooterCTA, useToast } from '../components/UI'
import { useStore } from '../store'
import { fetchQuote, fetchCoupons } from '../api'
import type { Quote, Coupon } from '../types'

export default function Summary() {
  const nav = useNavigate()
  const toast = useToast()
  const { cart, bookingType, date, time, addressLine, coupon, setCoupon } = useStore()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [code, setCode] = useState(coupon)
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [showCoupons, setShowCoupons] = useState(false)

  function refresh(c: string) {
    fetchQuote(cart.map((x) => ({ id: x.id, durationId: x.durationId })), c || undefined)
      .then((q) => { setQuote(q); if (c && !q.coupon) toast('Coupon not applicable'); })
      .catch((e) => toast((e as Error).message))
  }
  useEffect(() => { refresh(coupon); fetchCoupons().then(setCoupons).catch(() => {}) }, [])

  function apply(c: string) { setCode(c); setCoupon(c); refresh(c); setShowCoupons(false) }
  function removeCoupon() { setCode(''); setCoupon(''); refresh('') }

  if (!quote) return <div className="screen"><Header title="Booking Summary" /><div className="center"><div className="spinner" /></div></div>

  const when = bookingType === 'instant' ? 'Now · arrives in ~12 min' : `${date}, ${time}`

  return (
    <div className="screen">
      <Header title="Booking Summary" />
      <div className="content pad-cta">
        <div className="card pad">
          <div className="row first"><strong className="lg">Services ({cart.length})</strong><button className="btn-text" onClick={() => nav('/cart')}>Edit</button></div>
          {cart.map((c) => (
            <div className="row" key={c.id}><span className="rl"><span className="ri">{c.icon}</span><span>{c.name}<div className="muted sm">{c.durationLabel}</div></span></span><strong>₹{c.price}</strong></div>
          ))}
        </div>

        <div className="card pad mt">
          <div className="kv"><span className="k">When</span><span className="v">{when}</span></div>
          <div className="divider" />
          <div className="row first" style={{ alignItems: 'flex-start' }}>
            <span className="rl" style={{ alignItems: 'flex-start' }}><span className="ri">📍</span><span><b>Address</b><div className="muted sm addr">{addressLine}</div></span></span>
            <button className="btn-text" onClick={() => nav('/address')}>Change</button>
          </div>
        </div>

        {/* coupon */}
        <div className="card pad mt">
          {quote.coupon ? (
            <div className="coupon-applied">
              <span>🏷</span><div className="grow"><b>{quote.coupon} applied</b><div className="muted sm">You saved ₹{quote.discount}</div></div>
              <button className="rm" onClick={removeCoupon}>✕</button>
            </div>
          ) : (
            <div className="coupon-input">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter coupon code" />
              <button className="btn-text" onClick={() => apply(code)}>Apply</button>
            </div>
          )}
          <button className="view-coupons" onClick={() => setShowCoupons((v) => !v)}>{showCoupons ? 'Hide offers' : 'View available offers'} ▾</button>
          {showCoupons && coupons.map((c) => (
            <div key={c.code} className="coupon-opt" onClick={() => apply(c.code)}>
              <div><b>{c.code}</b><div className="muted sm">{c.label}</div></div><span className="apply-link">Apply</span>
            </div>
          ))}
        </div>

        <div className="card pad mt">
          <div className="label">Bill Details</div>
          <div className="kv"><span className="k">Item total</span><span className="v">₹{quote.subtotal}</span></div>
          <div className="kv"><span className="k">Platform fee</span><span className="v">₹{quote.fee}</span></div>
          <div className="kv"><span className="k">Taxes (GST)</span><span className="v">₹{quote.tax}</span></div>
          {quote.discount > 0 && <div className="kv"><span className="k" style={{ color: 'var(--green)' }}>Discount{quote.coupon ? ` (${quote.coupon})` : ''}</span><span className="v" style={{ color: 'var(--green)' }}>-₹{quote.discount}</span></div>}
          <div className="divider" />
          <div className="kv total"><span className="k">Total</span><span className="v">₹{quote.total}</span></div>
        </div>
      </div>

      <FooterCTA>
        <div className="sumbar"><div className="grow"><div className="cnt">₹{quote.total}</div>{quote.discount > 0 && <div className="sub" style={{ color: 'var(--green)' }}>Saved ₹{quote.discount}</div>}</div>
          <button className="btn" onClick={() => nav('/payment')}>Proceed to Pay →</button></div>
      </FooterCTA>
    </div>
  )
}
