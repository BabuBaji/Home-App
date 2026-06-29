import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { fetchPaymentMethods, createOrder, chargePayment, fetchPaymentConfig, createPaymentsOrder, verifyPayment } from '../api'
import { useToast } from './UI'
import type { PaymentGroup } from '../types'
import { UPI_APPS, payByUpi, type UpiApp } from '../upi'
import { Upi } from '../upiNative'

interface Props {
  open: boolean
  amount: number
  onClose: () => void
  onPaid: (method: string, txnId: string) => void
}

// Load Razorpay Checkout once, on demand.
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

const PKG: Record<string, string | undefined> = {
  phonepe: 'com.phonepe.app',
  gpay: 'com.google.android.apps.nbu.paisa.user',
  paytm: 'net.one97.paytm',
}
const isUpiMethod = (m: string) => ['phonepe', 'gpay', 'paytm', 'bhim', 'upi'].includes(m)
const upiAppFor = (m: string): UpiApp =>
  UPI_APPS.find((a) => a.id === m) || UPI_APPS.find((a) => a.id === 'upi')!
const BRAND: Record<string, { bg: string; fg: string; label: string; border?: boolean }> = {
  phonepe: { bg: '#5f259f', fg: '#fff', label: 'Pe' },
  gpay: { bg: '#fff', fg: '#1a73e8', label: 'G', border: true },
  paytm: { bg: '#002970', fg: '#00b9f1', label: 'pay' },
}
// Full-screen brand theme for the in-app (demo) UPI pay screen.
const APP_THEME: Record<string, { bg: string; name: string }> = {
  phonepe: { bg: '#5f259f', name: 'PhonePe' },
  gpay: { bg: '#1a73e8', name: 'Google Pay' },
  paytm: { bg: '#012a72', name: 'Paytm' },
  bhim: { bg: '#0b8f3f', name: 'BHIM UPI' },
  upi: { bg: '#0b8f3f', name: 'UPI' },
}

export default function PaymentSheet({ open, amount, onClose, onPaid }: Props) {
  const toast = useToast()
  const [groups, setGroups] = useState<PaymentGroup[]>([])
  const [method, setMethod] = useState('phonepe')
  const [phase, setPhase] = useState<'select' | 'processing' | 'confirm' | 'done' | 'upiapp'>('select')
  const [provider, setProvider] = useState<'razorpay' | 'mock'>('mock')
  const [keyId, setKeyId] = useState<string | null>(null)
  const [upiMode, setUpiMode] = useState<'demo' | 'live'>('demo')
  const [upiCfg, setUpiCfg] = useState({ vpa: 'homehelp@upi', payeeName: 'HomeHelp Services' })
  const [icons, setIcons] = useState<Record<string, { installed: boolean; icon?: string }>>({})
  const [txnRef, setTxnRef] = useState('')

  // MIUI fallback: if still "processing" a direct UPI payment when we return, ask to confirm.
  useEffect(() => {
    function onVis() {
      if (document.visibilityState !== 'visible') return
      setTimeout(() => setPhase((p) => (p === 'processing' && provider !== 'razorpay' && isUpiMethod(method) ? 'confirm' : p)), 1200)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [method, provider])

  useEffect(() => {
    if (!open) return
    setPhase('select')
    fetchPaymentMethods().then((d) => setGroups(d.methods)).catch(() => {})
    fetchPaymentConfig().then((c) => {
      setProvider(c.provider); setKeyId(c.keyId); setUpiMode(c.upiMode || 'demo')
      if (c.upiVpa) setUpiCfg({ vpa: c.upiVpa, payeeName: c.payeeName || 'HomeHelp Services' })
    }).catch(() => {})
    if (Capacitor.isNativePlatform()) {
      Upi.appsInfo({ packages: Object.values(PKG).filter(Boolean) as string[] })
        .then((r) => setIcons(r.apps || {})).catch(() => {})
    }
  }, [open])

  if (!open) return null
  const cash = method === 'cash'

  // Primary path when Razorpay keys are configured — handles UPI (opens PhonePe/GPay with a REAL
  // merchant VPA), Cards, Net Banking and Wallets, and confirms server-side via the webhook.
  async function payViaRazorpay() {
    setPhase('processing')
    try {
      if (!(await loadRazorpay())) { toast('Could not load Razorpay'); setPhase('select'); return }
      const order = await createOrder(amount)
      const rzp = new (window as any).Razorpay({
        key: order.keyId || keyId, order_id: order.orderId, amount: amount * 100, currency: 'INR',
        name: 'HomeHelp', description: 'Service booking',
        // Nudge the customer's chosen UPI app to the front of the checkout.
        prefill: isUpiMethod(method) ? { method: 'upi' } : {},
        theme: { color: '#5b51e8' },
        handler: async (resp: any) => {
          try {
            await verifyPayment({ razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature })
            setPhase('done'); setTimeout(() => onPaid(method, resp.razorpay_payment_id), 650)
          } catch (e) { toast((e as Error).message); setPhase('select') }
        },
        modal: { ondismiss: () => setPhase('select') },
      })
      rzp.on('payment.failed', (r: any) => { toast(r?.error?.description || 'Payment failed'); setPhase('select') })
      rzp.open()
    } catch (e) { toast((e as Error).message); setPhase('select') }
  }

  // Direct UPI deep-link (only used when Razorpay is NOT configured) — needs a real upiVpa.
  async function payUpiDirect() {
    const app = upiAppFor(method)
    const ref = 'HH' + Date.now().toString().slice(-10)
    setTxnRef(ref); setPhase('processing'); toast(`Opening ${app.name}…`)
    createPaymentsOrder(amount, method).catch(() => {})
    let status = 'NOT_OPENED'
    try { status = (await payByUpi(app, { vpa: upiCfg.vpa, payeeName: upiCfg.payeeName, amount, note: `HomeHelp ${ref}`, txnRef: ref })).status } catch { status = 'NOT_OPENED' }
    if (status === 'SUCCESS') { setPhase('done'); setTimeout(() => onPaid(method, ref), 750); return }
    if (status === 'FAILURE') { toast('Payment failed in the UPI app.'); setPhase('select'); return }
    if (status === 'CANCELLED') { toast('Payment cancelled.'); setPhase('select'); return }
    if (status === 'NOT_OPENED') { toast(`Couldn't open ${app.name}.`); setPhase('select'); return }
    setPhase('confirm')
  }

  async function payMock() {
    setPhase('processing')
    try {
      const order = await createOrder(amount)
      await new Promise((r) => setTimeout(r, 1200))
      const res = await chargePayment(order.orderId, method, amount)
      setPhase('done'); setTimeout(() => onPaid(res.method, res.txnId), 700)
    } catch (e) { toast((e as Error).message); setPhase('select') }
  }

  function pay() {
    if (cash) { setPhase('done'); setTimeout(() => onPaid('cash', 'CASH'), 700); return }
    if (isUpiMethod(method)) {
      // live = open the real UPI app (needs a real registered VPA); demo = in-app pay screen.
      if (upiMode === 'live') return payUpiDirect()
      return setPhase('upiapp')
    }
    // Cards / Net Banking / Wallets go through Razorpay Checkout when keys are configured.
    if (provider === 'razorpay') return payViaRazorpay()
    return payMock()
  }

  function confirmPaid() { setPhase('done'); setTimeout(() => onPaid(method, txnRef || ('HH' + Date.now())), 600) }
  function payDemoUpi() { setPhase('done'); setTimeout(() => onPaid(method, 'UPI' + Date.now().toString().slice(-10)), 800) }

  function RowIcon({ id, emoji }: { id: string; emoji: string }) {
    const pkg = PKG[id]
    const real = pkg ? icons[pkg]?.icon : undefined
    if (real) return <img src={real} alt="" width={26} height={26} style={{ borderRadius: 6 }} />
    const b = BRAND[id]
    if (b) return <span style={{ width: 26, height: 26, borderRadius: 6, background: b.bg, color: b.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, border: b.border ? '1px solid #e5e7eb' : 'none' }}>{b.label}</span>
    return <span className="pm-ic">{emoji}</span>
  }

  const appName = upiAppFor(method).name

  return (
    <div className="pm-overlay" onClick={phase === 'select' ? onClose : undefined}>
      <div className="pm-sheet" onClick={(e) => e.stopPropagation()}>
        {phase === 'select' && (
          <>
            <div className="pm-head">
              <div>
                <div className="pm-amt">₹{amount}</div>
                <div className="muted sm">Choose a payment method</div>
              </div>
              <button className="pm-x" onClick={onClose}>✕</button>
            </div>
            <div className="pm-scroll">
              {groups.map((g) => (
                <div className="pm-group" key={g.group}>
                  <div className="pm-glabel">{g.group}{g.recommended && <span className="pm-rec">Recommended</span>}</div>
                  {g.options.map((o) => (
                    <button key={o.id} className={`pm-row ${method === o.id ? 'sel' : ''}`} onClick={() => setMethod(o.id)}>
                      <RowIcon id={o.id} emoji={o.icon} />
                      <span className="grow"><span className="pm-name">{o.name}</span>{o.sub && <span className="pm-sub">{provider !== 'razorpay' && PKG[o.id] && icons[PKG[o.id]!]?.installed === false ? 'Not installed' : o.sub}</span>}</span>
                      <span className="pm-radio">{method === o.id ? '●' : ''}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="pm-foot">
              <div className="pm-secure">🔒 100% secure payments{provider === 'razorpay' ? ' · Razorpay' : ''}</div>
              <button className="btn full" onClick={pay}>{cash ? `Confirm · ₹${amount}` : `Pay ₹${amount}`}</button>
            </div>
          </>
        )}

        {phase === 'processing' && (
          <div className="pm-state">
            <div className="spinner" />
            <h3>{cash ? 'Confirming…' : provider === 'razorpay' ? 'Opening secure checkout…' : isUpiMethod(method) ? `Opening ${appName}…` : 'Processing payment…'}</h3>
            <p className="muted">Please don't close the app</p>
          </div>
        )}

        {phase === 'confirm' && (
          <div className="pm-state">
            <div className="pm-tick" style={{ background: '#fff7e6', color: '#b45309' }}>⏳</div>
            <h3>Complete payment in {appName}</h3>
            <p className="muted">Pay ₹{amount} to {upiCfg.payeeName} ({upiCfg.vpa}), then confirm.</p>
            <button className="btn full" onClick={confirmPaid} style={{ marginTop: 12 }}>I've paid</button>
            <button className="btn full ghost" onClick={() => payUpiDirect()} style={{ marginTop: 8, background: 'transparent', color: '#5b51e8' }}>Reopen {appName}</button>
            <button className="btn full ghost" onClick={() => setPhase('select')} style={{ marginTop: 8, background: 'transparent', color: '#6b7280' }}>Cancel</button>
          </div>
        )}

        {phase === 'done' && (
          <div className="pm-state">
            <div className="pm-tick">✓</div>
            <h3>{cash ? 'Booking confirmed!' : 'Payment successful!'}</h3>
            <p className="muted">₹{amount} {cash ? 'to pay after service' : 'paid'}</p>
          </div>
        )}
      </div>

      {/* In-app UPI pay screen (demo) — looks like the chosen app, shows the amount, no real money. */}
      {phase === 'upiapp' && (() => {
        const t = APP_THEME[method] || APP_THEME.upi
        const initial = (upiCfg.payeeName || 'H').trim().charAt(0).toUpperCase()
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: t.bg, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px', color: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span onClick={() => setPhase('select')} style={{ fontSize: 26, lineHeight: 1, cursor: 'pointer' }}>‹</span>
              <RowIcon id={method} emoji="UPI" />
              <strong style={{ fontSize: 17 }}>{t.name}</strong>
            </div>
            <div style={{ background: '#fff', flex: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <span style={{ width: 44, height: 44, borderRadius: '50%', background: t.bg, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>{initial}</span>
                <div><div style={{ fontWeight: 700 }}>{upiCfg.payeeName}</div><div className="muted sm">{upiCfg.vpa}</div></div>
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#111' }}>₹{amount}</div>
              <div className="muted" style={{ marginTop: 4 }}>Message: Payment for HomeHelp service</div>
              <div style={{ marginTop: 16, padding: 12, background: '#f4f5f7', borderRadius: 12, fontSize: 13, color: '#6b7280' }}>
                🔒 Demo mode — this is a preview of the UPI payment. <b>No real money will be deducted.</b>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ borderTop: '1px solid #eee', paddingTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span className="muted">Total Payable</span><strong>₹{amount}</strong>
                </div>
                <button className="btn full" style={{ background: t.bg, color: '#fff' }} onClick={payDemoUpi}>Pay ₹{amount}</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
