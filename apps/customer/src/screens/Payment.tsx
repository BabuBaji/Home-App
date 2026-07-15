import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, FooterCTA, useToast } from '../components/UI'
import { useStore } from '../store'
import { createBookingApi, fetchQuote, fetchPaymentConfig, createOrder, verifyPayment } from '../api'
import { RazorpayNative } from '../razorpayNative'
import { Capacitor } from '@capacitor/core'

// Load Razorpay's web checkout script once, on demand (browser fallback only).
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

// Payment options — a single UPI entry (opens the UPI apps via Razorpay, one selection), then the
// other rails. UPI is the priority/default.
const METHODS = [
  { id: 'upi', name: 'UPI', sub: 'PhonePe, Google Pay, Paytm & more', badge: 'UPI' },
  { id: 'razorpay', name: 'Cards / Net Banking / Wallets', sub: 'Visa, Mastercard, RuPay, NetBanking, Wallets', icon: '💳' },
  { id: 'wallet', name: 'HomeHelp Wallet', sub: 'Use your wallet balance', icon: '👛' },
  { id: 'cash', name: 'Cash on Service', sub: 'Pay the expert after service', icon: '💵' },
]
const VALID = METHODS.map((m) => m.id)

export default function Payment() {
  const nav = useNavigate()
  const toast = useToast()
  const { cart, bookingType, date, time, addressLine, coupon, payment, setPayment, note, clearCart, user, pincode } = useStore()
  const [total, setTotal] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [provider, setProvider] = useState<'razorpay' | 'mock'>('mock')
  const [demo, setDemo] = useState(false) // no Razorpay keys + upiMode==='demo' → simulate success (testing)
  const [preOrder, setPreOrder] = useState<Awaited<ReturnType<typeof createOrder>> | null>(null)

  useEffect(() => {
    // Default to UPI (priority) unless a valid method is already chosen.
    if (!VALID.includes(payment)) setPayment('upi')
    fetchQuote(cart.map((x) => ({ id: x.id, durationId: x.durationId })), coupon || undefined, pincode || undefined)
      .then((q) => setTotal(q.total)).catch(() => {})
    fetchPaymentConfig().then((c) => { setProvider(c.provider); setDemo(c.upiMode === 'demo') }).catch(() => {})
  }, [])

  // Pre-create the Razorpay order as soon as the amount is known, so tapping Pay opens the
  // checkout immediately instead of waiting on the order round-trip.
  useEffect(() => {
    if (total == null || provider !== 'razorpay') return
    let alive = true
    createOrder(total).then((o) => { if (alive) setPreOrder(o) }).catch(() => {})
    return () => { alive = false }
  }, [total, provider])

  const bookingPayload = (extra: Record<string, unknown> = {}) => ({
    items: cart.map((x) => ({ id: x.id, durationId: x.durationId })),
    type: bookingType, payment, coupon, note, address: addressLine, pincode: pincode || undefined,
    date: bookingType === 'schedule' ? date : null, time: bookingType === 'schedule' ? time : null,
    ...extra,
  })

  async function finishBooking(extra: Record<string, unknown> = {}, msg = 'Payment successful!') {
    const b = await createBookingApi(bookingPayload(extra))
    toast(msg); clearCart()
    setTimeout(() => nav(`/track/${b.id}`, { replace: true }), 300)
  }

  async function pay() {
    if (total == null) return
    // Wallet / cash book directly (server marks paid from wallet, or pay-after-service).
    if (payment === 'wallet' || payment === 'cash') {
      setBusy(true)
      try { await finishBooking({}, payment === 'cash' ? 'Booking confirmed!' : 'Payment successful!') }
      catch (e) { toast((e as Error).message); setBusy(false) }
      return
    }
    // UPI (single option) and Cards/Net Banking/Wallets both collect via Razorpay, verified
    // server-side. UPI preselects the UPI apps so the customer picks their app once, then it opens.
    const upiOnly = payment === 'upi'
    if (provider === 'razorpay') return payWithRazorpay(upiOnly)
    // No Razorpay keys yet → in demo mode simulate success so the flow is testable.
    if (demo) {
      setBusy(true)
      try { await finishBooking({}, 'Payment successful!') }
      catch (e) { toast((e as Error).message); setBusy(false) }
      return
    }
    toast('Online payments are not set up yet. Add Razorpay keys in Admin → Settings.')
  }

  async function payWithRazorpay(upiOnly = false) {
    setBusy(true)
    try {
      const order = preOrder || await createOrder(total!)
      // Native app → Razorpay native SDK; on the UPI screen, tapping PhonePe/GPay/Paytm fires the
      // real UPI intent and that app opens directly. Returns a verifiable payment id.
      if (Capacitor.isNativePlatform()) {
        try {
          const r = await RazorpayNative.open({
            key: order.keyId!, orderId: order.orderId, amount: total! * 100, currency: 'INR',
            name: 'HomeHelp', description: cart.map((x) => x.name).join(', ').slice(0, 80) || 'Service booking',
            contact: user?.phone || '', email: user?.email || '',
          })
          await verifyPayment({ razorpay_order_id: r.razorpay_order_id || order.orderId, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature })
          await finishBooking({ paymentId: r.razorpay_payment_id })
        } catch (e) { toast((e as Error).message || 'Payment cancelled'); setBusy(false) }
        return
      }
      // Browser fallback — web checkout.js
      if (!(await loadRazorpay())) { toast('Could not load payment gateway'); setBusy(false); return }
      const opts: any = {
        key: order.keyId, order_id: order.orderId, amount: total! * 100, currency: 'INR',
        name: 'HomeHelp', description: cart.map((x) => x.name).join(', ').slice(0, 80) || 'Service booking',
        // Don't force method:'upi' — it can hide UPI when the intent can't complete; the checkout
        // already shows UPI first for Indian accounts.
        prefill: { name: user?.name || '', contact: user?.phone || '', email: user?.email || '' },
        theme: { color: '#5b51e8' },
        handler: async (resp: any) => {
          try {
            await verifyPayment({ razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature })
            await finishBooking({ paymentId: resp.razorpay_payment_id })
          } catch (e) { toast((e as Error).message); setBusy(false) }
        },
        modal: { ondismiss: () => setBusy(false) },
      }
      const rzp = new (window as any).Razorpay(opts)
      rzp.on('payment.failed', (r: any) => { toast(r?.error?.description || 'Payment failed'); setBusy(false) })
      rzp.open()
    } catch (e) { toast((e as Error).message); setBusy(false) }
  }

  const Row = ({ id, name, sub, icon, badge }: { id: string; name: string; sub: string; icon?: string; badge?: string }) => {
    const active = payment === id
    return (
      <div className={`opt ${active ? 'active' : ''}`} onClick={() => setPayment(id)}>
        {badge
          ? <span style={{ width: 34, height: 34, borderRadius: 8, background: '#0b8f3f', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>{badge}</span>
          : <span className="oicon pay">{icon}</span>}
        <div className="obody"><h3 className="sm2">{name}</h3><p>{sub}</p></div>
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

        <div className="label">Pay by UPI</div>
        <Row {...METHODS[0]} />
        <div className="label">Other Payment Options</div>
        {METHODS.slice(1).map((m) => <Row key={m.id} {...m} />)}

        <div className="banner-soft"><span className="bi">🛡</span><div><div className="bt">100% Secure Payments</div><div className="bd">UPI, cards & wallet are encrypted and verified by Razorpay.</div></div></div>
      </div>

      <FooterCTA>
        <button className="btn full pay-btn" onClick={pay} disabled={busy || total === null}>
          {busy
            ? <><span className="pay-spin" aria-hidden /> Processing…</>
            : payment === 'cash'
              ? <><span className="pay-ic">✓</span> Confirm Booking · ₹{total}</>
              : <><span className="pay-ic secure">🔒</span> Pay ₹{total} <span className="pay-live" aria-hidden /></>}
        </button>
      </FooterCTA>
    </div>
  )
}
