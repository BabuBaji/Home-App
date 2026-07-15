import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { fetchPaymentMethods, createOrder, chargePayment, fetchPaymentConfig, createPaymentsOrder, verifyPayment } from '../api'
import { useToast } from './UI'
import type { PaymentGroup } from '../types'
import { UPI_APPS, payByUpi, type UpiApp } from '../upi'
import { Upi } from '../upiNative'
import { RazorpayNative } from '../razorpayNative'

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

// --- Brand logos (inline SVG, no external assets — render offline on-device) ---
const UpiLogo = ({ s = 26 }: { s?: number }) => (
  <svg viewBox="0 0 40 40" width={s} height={s} aria-hidden>
    <rect width="40" height="40" rx="9" fill="#fff" stroke="#e5e7eb" />
    <text x="20" y="18" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="11" fontWeight="800" fill="#e97730">UPI</text>
    <path d="M11 24 l8 0 -3 6 z" fill="#e97730" />
    <path d="M21 24 l8 0 -3 6 z" fill="#0d8a3f" />
  </svg>
)
const PhonePeLogo = ({ s = 18 }: { s?: number }) => (
  <svg viewBox="0 0 32 32" width={s} height={s} aria-hidden>
    <rect width="32" height="32" rx="7" fill="#5f259f" />
    <text x="16" y="21" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="13" fontWeight="700" fill="#fff">Pe</text>
  </svg>
)
const GPayLogo = ({ s = 18 }: { s?: number }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden style={{ background: '#fff', borderRadius: 6, border: '1px solid #eee', padding: 1 }}>
    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
    <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
  </svg>
)
const PaytmLogo = ({ s = 18 }: { s?: number }) => (
  <svg viewBox="0 0 44 24" width={(s * 44) / 24} height={s} aria-hidden>
    <rect width="44" height="24" rx="5" fill="#fff" stroke="#eee" />
    <text x="22" y="17" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="800">
      <tspan fill="#002970">pay</tspan><tspan fill="#00baf2">tm</tspan>
    </text>
  </svg>
)
const CardLogo = ({ s = 26 }: { s?: number }) => (
  <svg viewBox="0 0 40 40" width={s} height={s} aria-hidden>
    <rect width="40" height="40" rx="9" fill="#eef0ff" />
    <rect x="9" y="13" width="22" height="15" rx="2.5" fill="#5b51e8" />
    <rect x="9" y="16.5" width="22" height="3" fill="#3a32a8" />
    <rect x="12" y="23" width="7" height="2.4" rx="1" fill="#fff" opacity="0.9" />
  </svg>
)
const VisaMark = () => (
  <svg viewBox="0 0 40 24" width={26} height={16} aria-hidden><rect width="40" height="24" rx="3" fill="#fff" stroke="#eee" /><text x="20" y="17" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="12" fontStyle="italic" fontWeight="800" fill="#1a1f71">VISA</text></svg>
)
const McMark = () => (
  <svg viewBox="0 0 40 24" width={26} height={16} aria-hidden><rect width="40" height="24" rx="3" fill="#fff" stroke="#eee" /><circle cx="17" cy="12" r="7" fill="#eb001b" /><circle cx="24" cy="12" r="7" fill="#f79e1b" fillOpacity="0.85" /></svg>
)
const RupayMark = () => (
  <svg viewBox="0 0 44 24" width={30} height={16} aria-hidden><rect width="44" height="24" rx="3" fill="#fff" stroke="#eee" /><text x="22" y="16" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="10" fontWeight="800"><tspan fill="#097dc6">Ru</tspan><tspan fill="#f47b20">Pay</tspan></text></svg>
)

// Trailing mini-logo cluster shown next to a row's name (like the Razorpay checkout).
function BrandCluster({ id }: { id: string }) {
  const marks =
    id === 'upi' ? [<PhonePeLogo key="p" s={16} />, <GPayLogo key="g" s={16} />, <PaytmLogo key="t" s={16} />]
    : id === 'card' ? [<VisaMark key="v" />, <McMark key="m" />, <RupayMark key="r" />]
    : null
  if (!marks) return null
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>{marks}</span>
}

export default function PaymentSheet({ open, amount, onClose, onPaid }: Props) {
  const toast = useToast()
  const [groups, setGroups] = useState<PaymentGroup[]>([])
  const [method, setMethod] = useState('upi')
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

  // Primary path when Razorpay keys are configured — handles UPI (PhonePe/GPay/Paytm), Cards,
  // Net Banking and Wallets, and confirms server-side (HMAC verify) before the booking is placed.
  // UPI is the priority option, so a UPI selection restricts the checkout to UPI only.
  async function payViaRazorpay() {
    const upiOnly = isUpiMethod(method)
    setPhase('processing')
    try {
      const order = await createOrder(amount)
      // Native app → Razorpay native SDK fires the real UPI intent (PhonePe/GPay/Paytm open
      // directly) and returns a verifiable payment id. Web falls back to checkout.js.
      if (Capacitor.isNativePlatform()) {
        try {
          const r = await RazorpayNative.open({
            key: order.keyId || keyId || '', orderId: order.orderId, amount: amount * 100, currency: 'INR',
            name: 'HomeHelp', description: 'Service booking',
          })
          await verifyPayment({ razorpay_order_id: r.razorpay_order_id || order.orderId, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature })
          setPhase('done'); setTimeout(() => onPaid(method, r.razorpay_payment_id), 650)
        } catch (e) { toast((e as Error).message || 'Payment cancelled'); setPhase('select') }
        return
      }
      if (!(await loadRazorpay())) { toast('Could not load Razorpay'); setPhase('select'); return }
      const opts: any = {
        key: order.keyId || keyId, order_id: order.orderId, amount: amount * 100, currency: 'INR',
        name: 'HomeHelp', description: 'Service booking',
        prefill: upiOnly ? { method: 'upi' } : {},
        theme: { color: '#5b51e8' },
        handler: async (resp: any) => {
          try {
            await verifyPayment({ razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature })
            setPhase('done'); setTimeout(() => onPaid(method, resp.razorpay_payment_id), 650)
          } catch (e) { toast((e as Error).message); setPhase('select') }
        },
        modal: { ondismiss: () => setPhase('select') },
      }
      // UPI-first via prefill.method above. We deliberately do NOT hard-restrict to UPI-only —
      // inside the Android WebView that can yield zero eligible methods ("no appropriate payment
      // method found"). Razorpay renders its eligible methods with UPI preselected.
      const rzp = new (window as any).Razorpay(opts)
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
    // Verified path: when Razorpay keys are set, everything (UPI first, then cards / net banking /
    // wallets) is collected through Razorpay Checkout and confirmed server-side.
    if (provider === 'razorpay') return payViaRazorpay()
    // No keys configured yet — demo/testing fallbacks so the flow still works locally.
    if (isUpiMethod(method)) return setPhase('upiapp') // in-app demo UPI screen (no real money)
    return payMock()
  }

  function confirmPaid() { setPhase('done'); setTimeout(() => onPaid(method, txnRef || ('HH' + Date.now())), 600) }
  function payDemoUpi() { setPhase('done'); setTimeout(() => onPaid(method, 'UPI' + Date.now().toString().slice(-10)), 800) }

  function RowIcon({ id, emoji }: { id: string; emoji: string }) {
    const pkg = PKG[id]
    const real = pkg ? icons[pkg]?.icon : undefined
    if (real) return <img src={real} alt="" width={26} height={26} style={{ borderRadius: 6 }} />
    if (id === 'upi') return <UpiLogo />
    if (id === 'card') return <CardLogo />
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
                      <span className="grow"><span className="pm-name">{o.name}<BrandCluster id={o.id} /></span>{o.sub && <span className="pm-sub">{provider !== 'razorpay' && PKG[o.id] && icons[PKG[o.id]!]?.installed === false ? 'Not installed' : o.sub}</span>}</span>
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
