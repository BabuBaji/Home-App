import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, FooterCTA, useToast } from '../components/UI'
import { useStore } from '../store'
import { createBookingApi, fetchQuote } from '../api'

const METHODS = [
  { id: 'upi', name: 'UPI', sub: 'GPay, PhonePe, Paytm', icon: 'UPI', group: 'rec' },
  { id: 'card', name: 'Credit / Debit Card', sub: 'Visa, Mastercard, Rupay', icon: '💳', group: 'other' },
  { id: 'wallet', name: 'HomeHelp Wallet', sub: 'Use your wallet balance', icon: '👛', group: 'other' },
  { id: 'cash', name: 'Cash on Service', sub: 'Pay the expert after service', icon: '💵', group: 'other' },
]

export default function Payment() {
  const nav = useNavigate()
  const toast = useToast()
  const { cart, bookingType, date, time, addressLine, coupon, payment, setPayment, note, clearCart } = useStore()
  const [total, setTotal] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchQuote(cart.map((x) => ({ id: x.id, durationId: x.durationId })), coupon || undefined)
      .then((q) => setTotal(q.total)).catch(() => {})
  }, [])

  async function pay() {
    setBusy(true)
    try {
      const b = await createBookingApi({
        items: cart.map((x) => ({ id: x.id, durationId: x.durationId })),
        type: bookingType, payment, coupon, note, address: addressLine,
        date: bookingType === 'schedule' ? date : null, time: bookingType === 'schedule' ? time : null,
      })
      toast(payment === 'cash' ? 'Booking confirmed!' : 'Payment successful!')
      clearCart()
      setTimeout(() => nav(`/track/${b.id}`, { replace: true }), 700)
    } catch (e) { toast((e as Error).message); setBusy(false) }
  }

  const Row = ({ m }: { m: typeof METHODS[number] }) => {
    const active = payment === m.id
    return (
      <div className={`opt ${active ? 'active' : ''}`} onClick={() => setPayment(m.id)}>
        <span className="oicon pay" style={m.id === 'upi' ? { fontStyle: 'italic', fontWeight: 800 } : {}}>{m.id === 'upi' ? 'UPI⟫' : m.icon}</span>
        <div className="obody"><h3 className="sm2">{m.name}</h3><p>{m.sub}</p></div>
        <span className="radio">{active ? '✓' : ''}</span>
      </div>
    )
  }

  return (
    <div className="screen">
      <Header title="Payment" />
      <div className="content pad-cta">
        <div className="amount-banner">
          <div className="lbl">Amount to Pay</div>
          <div className="amt">₹{total ?? '—'}</div>
          <div className="det">{payment === 'cash' ? 'Pay after service' : 'Secured by 256-bit encryption'}</div>
        </div>

        <div className="label">Recommended</div>
        {METHODS.filter((m) => m.group === 'rec').map((m) => <Row key={m.id} m={m} />)}
        <div className="label">Other Payment Options</div>
        {METHODS.filter((m) => m.group === 'other').map((m) => <Row key={m.id} m={m} />)}

        <div className="banner-soft"><span className="bi">🛡</span><div><div className="bt">100% Secure Payments</div><div className="bd">UPI, cards & wallet are encrypted and safe.</div></div></div>
      </div>
      <FooterCTA>
        <button className="btn full" onClick={pay} disabled={busy || total === null}>
          {busy ? 'Processing…' : payment === 'cash' ? `Confirm Booking · ₹${total}` : `Pay ₹${total}`}
        </button>
      </FooterCTA>
    </div>
  )
}
