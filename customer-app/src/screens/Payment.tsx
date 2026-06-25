import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, FooterCTA, useToast } from '../components/UI'
import { useStore } from '../store'
import { createBookingApi, fetchQuote, fetchPaymentConfig, createOrder, verifyPayment } from '../api'

// Load Razorpay's checkout script once, on demand.
let rzpLoading: Promise<boolean> | null = null
function loadRazorpay(): Promise<boolean> {
  if ((window as any).Razorpay) return Promise.resolve(true)
  if (rzpLoading) return rzpLoading
  rzpLoading = new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true)
    s.onerror = () => { rzpLoading = null; resolve(false) }
    document.body.appendChild(s)
  })
  return rzpLoading
}

const METHODS = [
  { id: 'upi', name: 'UPI', sub: 'GPay, PhonePe, Paytm', icon: 'UPI', group: 'rec' },
  { id: 'card', name: 'Credit / Debit Card', sub: 'Visa, Mastercard, Rupay', icon: '💳', group: 'other' },
  { id: 'wallet', name: 'HomeHelp Wallet', sub: 'Use your wallet balance', icon: '👛', group: 'other' },
  { id: 'cash', name: 'Cash on Service', sub: 'Pay the expert after service', icon: '💵', group: 'other' },
]

export default function Payment() {
  const nav = useNavigate()
  const toast = useToast()
  const { cart, bookingType, date, time, addressLine, coupon, payment, setPayment, note, clearCart, user } = useStore()
  const [total, setTotal] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [provider, setProvider] = useState<'razorpay' | 'mock'>('mock')

  useEffect(() => {
    fetchQuote(cart.map((x) => ({ id: x.id, durationId: x.durationId })), coupon || undefined)
      .then((q) => setTotal(q.total)).catch(() => {})
    fetchPaymentConfig().then((c) => setProvider(c.provider)).catch(() => {})
  }, [])

  const bookingPayload = (extra: Record<string, unknown> = {}) => ({
    items: cart.map((x) => ({ id: x.id, durationId: x.durationId })),
    type: bookingType, payment, coupon, note, address: addressLine,
    date: bookingType === 'schedule' ? date : null, time: bookingType === 'schedule' ? time : null,
    ...extra,
  })

  async function pay() {
    if (total == null) return
    const online = payment !== 'cash' && payment !== 'wallet'
    if (provider === 'razorpay' && online) return payWithRazorpay()
    // cash / wallet / mock → book directly (server marks paid or pending)
    setBusy(true)
    try {
      const b = await createBookingApi(bookingPayload())
      toast(payment === 'cash' ? 'Booking confirmed!' : 'Payment successful!')
      clearCart()
      setTimeout(() => nav(`/track/${b.id}`, { replace: true }), 700)
    } catch (e) { toast((e as Error).message); setBusy(false) }
  }

  async function payWithRazorpay() {
    setBusy(true)
    try {
      if (!(await loadRazorpay())) { toast('Could not load payment gateway'); setBusy(false); return }
      const order = await createOrder(total!)
      const rzp = new (window as any).Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: total! * 100,
        currency: 'INR',
        name: 'HomeHelp',
        description: cart.map((x) => x.name).join(', ').slice(0, 80) || 'Service booking',
        prefill: { name: user?.name || '', contact: user?.phone || '', email: user?.email || '' },
        theme: { color: '#5b51e8' },
        handler: async (resp: any) => {
          try {
            await verifyPayment({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            })
            const b = await createBookingApi(bookingPayload({ paymentId: resp.razorpay_payment_id }))
            toast('Payment successful!')
            clearCart()
            setTimeout(() => nav(`/track/${b.id}`, { replace: true }), 700)
          } catch (e) { toast((e as Error).message); setBusy(false) }
        },
        modal: { ondismiss: () => setBusy(false) },
      })
      rzp.on('payment.failed', (r: any) => { toast(r?.error?.description || 'Payment failed'); setBusy(false) })
      rzp.open()
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
