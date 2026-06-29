import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, FooterCTA, useToast } from '../components/UI'
import { useStore } from '../store'
import { createBookingApi, fetchQuote, fetchPaymentConfig, createOrder, verifyPayment, createPaymentsOrder } from '../api'
import { UPI_APPS, payByUpi } from '../upi'
import { Upi } from '../upiNative'
import { Capacitor } from '@capacitor/core'

// Load Razorpay's checkout script once, on demand (used for Card when keys are configured).
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

// Brand-coloured fallback badges (used when the real app icon isn't available, e.g. web preview).
const BRAND: Record<string, { bg: string; fg: string; label: string; border?: boolean }> = {
  phonepe: { bg: '#5f259f', fg: '#fff', label: 'Pe' },
  gpay: { bg: '#fff', fg: '#1a73e8', label: 'G', border: true },
  paytm: { bg: '#002970', fg: '#00b9f1', label: 'pay' },
  upi: { bg: '#0b8f3f', fg: '#fff', label: 'UPI' },
}
const OTHER = [
  { id: 'razorpay', name: 'Cards / Net Banking / Wallets', sub: 'Visa, Mastercard, RuPay, NetBanking, Wallets', icon: '💳' },
  { id: 'wallet', name: 'HomeHelp Wallet', sub: 'Use your wallet balance', icon: '👛' },
  { id: 'cash', name: 'Cash on Service', sub: 'Pay the expert after service', icon: '💵' },
]

export default function Payment() {
  const nav = useNavigate()
  const toast = useToast()
  const { cart, bookingType, date, time, addressLine, coupon, payment, setPayment, note, clearCart, user } = useStore()
  const [total, setTotal] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [provider, setProvider] = useState<'razorpay' | 'mock'>('mock')
  const [upiCfg, setUpiCfg] = useState({ vpa: 'homehelp@upi', payeeName: 'HomeHelp Services' })
  const [confirmFor, setConfirmFor] = useState<string | null>(null) // UPI app id awaiting confirmation
  const [icons, setIcons] = useState<Record<string, { installed: boolean; icon?: string; label?: string }>>({})

  useEffect(() => {
    fetchQuote(cart.map((x) => ({ id: x.id, durationId: x.durationId })), coupon || undefined)
      .then((q) => setTotal(q.total)).catch(() => {})
    fetchPaymentConfig().then((c) => { setProvider(c.provider); if (c.upiVpa) setUpiCfg({ vpa: c.upiVpa, payeeName: c.payeeName || 'HomeHelp Services' }) }).catch(() => {})
    // Read the real installed UPI app icons (PhonePe/GPay/Paytm) from the device.
    if (Capacitor.isNativePlatform()) {
      const pkgs = UPI_APPS.map((a) => a.pkg).filter(Boolean) as string[]
      Upi.appsInfo({ packages: pkgs }).then((r) => setIcons(r.apps || {})).catch(() => {})
    }
  }, [])

  // Real app icon when available, otherwise a brand-coloured badge.
  function PayIcon({ id, pkg }: { id: string; pkg?: string }) {
    const real = pkg ? icons[pkg]?.icon : undefined
    if (real) return <img src={real} alt="" width={34} height={34} style={{ borderRadius: 8 }} />
    const b = BRAND[id]
    if (!b) return <span className="oicon pay">💳</span>
    return (
      <span style={{ width: 34, height: 34, borderRadius: 8, background: b.bg, color: b.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: id === 'upi' ? 11 : 15, border: b.border ? '1px solid #e5e7eb' : 'none' }}>{b.label}</span>
    )
  }

  const bookingPayload = (extra: Record<string, unknown> = {}) => ({
    items: cart.map((x) => ({ id: x.id, durationId: x.durationId })),
    type: bookingType, payment, coupon, note, address: addressLine,
    date: bookingType === 'schedule' ? date : null, time: bookingType === 'schedule' ? time : null,
    ...extra,
  })

  async function finishBooking(extra: Record<string, unknown> = {}, msg = 'Payment successful!') {
    const b = await createBookingApi(bookingPayload(extra))
    toast(msg); clearCart()
    setTimeout(() => nav(`/track/${b.id}`, { replace: true }), 700)
  }

  async function pay() {
    if (total == null) return
    if (UPI_APPS.some((a) => a.id === payment)) return payViaUpi()
    // Razorpay handles Cards / Net Banking / Wallets / UPI when keys are configured.
    if (payment === 'razorpay') {
      if (provider === 'razorpay') return payWithRazorpay()
      // No Razorpay keys → don't fake success. Steer the user to UPI.
      toast('Card / Net Banking needs Razorpay setup. Please pay using a UPI app above.')
      return
    }
    // wallet / cash → book directly (server marks paid or pending)
    setBusy(true)
    try { await finishBooking({}, payment === 'cash' ? 'Booking confirmed!' : 'Payment successful!') }
    catch (e) { toast((e as Error).message); setBusy(false) }
  }

  // Open the selected UPI app DIRECTLY (PhonePe/GPay/Paytm via the native plugin) with the
  // amount prefilled. The launch never waits on the backend (order is recorded in the
  // background). When the app returns a real result we act on it; for the chooser path
  // (unknown result) we ask the customer to confirm.
  async function payViaUpi() {
    const app = UPI_APPS.find((a) => a.id === payment)
    if (!app || total == null) return
    setBusy(true)
    toast(`Opening ${app.name}…`)
    const txnRef = 'HH' + Date.now().toString().slice(-10)
    createPaymentsOrder(total, payment).catch(() => {}) // fire-and-forget order record
    let status = 'NOT_OPENED'
    try {
      status = (await payByUpi(app, { vpa: upiCfg.vpa, payeeName: upiCfg.payeeName, amount: total, note: `HomeHelp ${txnRef}`, txnRef })).status
    } catch { status = 'NOT_OPENED' }

    if (status === 'SUCCESS') { try { await finishBooking({}, 'Payment successful!') } catch (e) { toast((e as Error).message); setBusy(false) }; return }
    setBusy(false)
    if (status === 'FAILURE') { toast('Payment failed in the UPI app.'); return }
    if (status === 'CANCELLED') { toast('Payment cancelled.'); return }
    if (status === 'NOT_OPENED') { toast(`Couldn't open ${app.name}. Make sure it's installed.`); return }
    setConfirmFor(app.id) // OPENED / SUBMITTED / UNKNOWN → ask the customer to confirm
  }

  async function confirmUpiPaid() {
    setConfirmFor(null); setBusy(true)
    try { await finishBooking({}, 'Payment received!') }
    catch (e) { toast((e as Error).message); setBusy(false) }
  }

  async function payWithRazorpay() {
    setBusy(true)
    try {
      if (!(await loadRazorpay())) { toast('Could not load payment gateway'); setBusy(false); return }
      const order = await createOrder(total!)
      const rzp = new (window as any).Razorpay({
        key: order.keyId, order_id: order.orderId, amount: total! * 100, currency: 'INR',
        name: 'HomeHelp', description: cart.map((x) => x.name).join(', ').slice(0, 80) || 'Service booking',
        prefill: { name: user?.name || '', contact: user?.phone || '', email: user?.email || '' },
        theme: { color: '#5b51e8' },
        handler: async (resp: any) => {
          try {
            await verifyPayment({ razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature })
            await finishBooking({ paymentId: resp.razorpay_payment_id })
          } catch (e) { toast((e as Error).message); setBusy(false) }
        },
        modal: { ondismiss: () => setBusy(false) },
      })
      rzp.on('payment.failed', (r: any) => { toast(r?.error?.description || 'Payment failed'); setBusy(false) })
      rzp.open()
    } catch (e) { toast((e as Error).message); setBusy(false) }
  }

  const Row = ({ id, name, sub, icon, pkg, useIcon }: { id: string; name: string; sub: string; icon?: string; pkg?: string; useIcon?: boolean }) => {
    const active = payment === id
    return (
      <div className={`opt ${active ? 'active' : ''}`} onClick={() => setPayment(id)}>
        {useIcon ? <span style={{ display: 'inline-flex' }}><PayIcon id={id} pkg={pkg} /></span> : <span className="oicon pay">{icon}</span>}
        <div className="obody"><h3 className="sm2">{name}</h3><p>{sub}</p></div>
        <span className="radio">{active ? '✓' : ''}</span>
      </div>
    )
  }

  const confirmApp = UPI_APPS.find((a) => a.id === confirmFor)

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
        {UPI_APPS.map((a) => <Row key={a.id} id={a.id} name={a.name} sub={icons[a.pkg || '']?.installed === false ? 'Not installed' : a.sub} pkg={a.pkg} useIcon />)}
        <div className="label">Other Payment Options</div>
        {OTHER.map((m) => <Row key={m.id} id={m.id} name={m.name} sub={m.sub} icon={m.icon} />)}

        <div className="banner-soft"><span className="bi">🛡</span><div><div className="bt">100% Secure Payments</div><div className="bd">UPI, cards & wallet are encrypted and safe.</div></div></div>
      </div>

      {confirmApp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end', zIndex: 50 }} onClick={() => setConfirmFor(null)}>
          <div style={{ background: '#fff', width: '100%', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Complete payment in {confirmApp.name}</h3>
            <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: 14 }}>
              Pay <b>₹{total}</b> to <b>{upiCfg.payeeName}</b> ({upiCfg.vpa}) in {confirmApp.name}, then come back and tap “I’ve paid”.
            </p>
            <button className="btn full" disabled={busy} onClick={confirmUpiPaid}>{busy ? 'Confirming…' : "I've paid"}</button>
            <button className="btn full ghost" style={{ marginTop: 8, background: 'transparent', color: '#5b51e8' }} onClick={() => payViaUpi()}>Reopen {confirmApp.name}</button>
            <button className="btn full ghost" style={{ marginTop: 8, background: 'transparent', color: '#6b7280' }} onClick={() => setConfirmFor(null)}>Cancel</button>
          </div>
        </div>
      )}

      <FooterCTA>
        <button className="btn full" onClick={pay} disabled={busy || total === null}>
          {busy ? 'Processing…' : payment === 'cash' ? `Confirm Booking · ₹${total}` : `Pay ₹${total}`}
        </button>
      </FooterCTA>
    </div>
  )
}
