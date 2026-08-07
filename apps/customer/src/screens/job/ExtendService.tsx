import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, Star } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { fetchExtensions, approveExtension, declineExtension, createOrder, verifyPayment, fetchPaymentConfig, type BookingExtension } from '../../api'
import { RazorpayNative } from '../../razorpayNative'
import { useStore } from '../../store'
import { speak } from '../../notify'
import { Capacitor } from '@capacitor/core'
import { useJob, proName, proRating, serviceNames } from './useJob'

// Module 6 — Extend Your Service. The expert can ASK for more time; only this screen grants it.
// Nothing here shortens or rewrites the original booking: the extension is priced and shown as its
// own line, and the clock only moves once the customer has approved AND paid the extra amount
// through Razorpay (the same gateway the booking checkout uses).
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

// Load Razorpay's web checkout script once, on demand (browser fallback only; the native app uses
// the RazorpayNative plugin). Mirrors Payment.tsx so the two checkouts behave identically.
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

// Booked length in minutes — mirrors the server's rule (durationId first, then the label).
const DUR: Record<string, number> = { '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }
function bookedMinutes(b: { items?: { durationId?: string }[]; duration?: string }): number {
  const id = b.items?.[0]?.durationId
  if (id && DUR[id]) return DUR[id]
  const s = String(b.duration || '')
  const n = parseInt(s, 10)
  if (!n) return 60
  return /h/i.test(s) && !/min/i.test(s) ? n * 60 : n
}

export default function ExtendService() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { b } = useJob(id)
  const { user } = useStore()
  const [pending, setPending] = useState<BookingExtension | null>(null)
  const [granted, setGranted] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [provider, setProvider] = useState<'razorpay' | 'mock'>('mock')
  const [demo, setDemo] = useState(false) // no Razorpay keys + upiMode==='demo' → simulate success (testing)

  // Poll: the expert may cancel, or the request may be answered on another device.
  useEffect(() => {
    if (!b?.id) return
    let stop = false
    const load = () => fetchExtensions(b.id)
      .then((d) => { if (!stop) { setPending(d.pending); setGranted(d.extensionMinutes); setLoaded(true) } })
      .catch(() => setLoaded(true))
    load()
    const iv = setInterval(load, 8000)
    return () => { stop = true; clearInterval(iv) }
  }, [b?.id])

  // Which gateway is live — decides between a real Razorpay checkout and the demo simulation.
  useEffect(() => {
    fetchPaymentConfig().then((c) => { setProvider(c.provider); setDemo(c.upiMode === 'demo') }).catch(() => {})
  }, [])

  if (!b || !loaded) return <div className="screen jt"><Loading /></div>

  const startMs = b.started_at ? new Date(b.started_at).getTime() : 0
  const currentEndMs = startMs ? startMs + (bookedMinutes(b) + granted) * 60000 : 0
  const newEndMs = currentEndMs && pending ? currentEndMs + pending.minutes * 60000 : 0

  // Collect the extension charge through Razorpay. Returns a verified payment id, or null if the
  // customer cancelled / it couldn't proceed (in which case the extension is NOT approved). Mirrors
  // the booking checkout in Payment.tsx: native SDK in the app, checkout.js in the browser, and a
  // simulated success in demo mode so the flow is testable without live keys.
  async function payForExtension(amount: number): Promise<string | null> {
    if (provider !== 'razorpay') {
      if (demo) return 'MOCKEXT' + Date.now() // no keys, demo mode → settle a mock payment
      toast('Online payments are not set up yet. Add Razorpay keys in Admin → Settings.')
      return null
    }
    const desc = `Service extension +${pending!.minutes} min`
    const order = await createOrder(amount)
    // Native app → Razorpay native SDK (fires the real UPI intent so GPay/PhonePe open directly).
    if (Capacitor.isNativePlatform()) {
      try {
        const r = await RazorpayNative.open({
          key: order.keyId!, orderId: order.orderId, amount: amount * 100, currency: 'INR',
          name: 'HomeHelp', description: desc, contact: user?.phone || '', email: user?.email || '',
        })
        await verifyPayment({ razorpay_order_id: r.razorpay_order_id || order.orderId, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature })
        return r.razorpay_payment_id
      } catch (e) { toast((e as Error).message || 'Payment cancelled'); return null }
    }
    // Browser fallback — web checkout.js
    if (!(await loadRazorpay())) { toast('Could not load payment gateway'); return null }
    return new Promise<string | null>((resolve) => {
      const opts: any = {
        key: order.keyId, order_id: order.orderId, amount: amount * 100, currency: 'INR',
        name: 'HomeHelp', description: desc,
        prefill: { name: user?.name || '', contact: user?.phone || '', email: user?.email || '' },
        theme: { color: '#5b51e8' },
        handler: async (resp: any) => {
          try {
            await verifyPayment({ razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature })
            resolve(resp.razorpay_payment_id)
          } catch { toast('Payment verification failed'); resolve(null) }
        },
        modal: { ondismiss: () => resolve(null) },
      }
      const rzp = new (window as any).Razorpay(opts)
      rzp.on('payment.failed', (r: any) => { toast(r?.error?.description || 'Payment failed'); resolve(null) })
      rzp.open()
    })
  }

  async function decide(approve: boolean) {
    if (!pending || !b) return
    setBusy(true)
    try {
      if (!approve) {
        await declineExtension(b.id, pending.id)
        toast('Extension declined')
      } else if (pending.price > 0) {
        // Paid extension → collect through Razorpay first; only grant once it's paid & recorded.
        const paymentId = await payForExtension(pending.price)
        if (!paymentId) return // cancelled/failed — leave the request pending, don't approve
        await approveExtension(b.id, pending.id, { paymentId })
        toast(`Approved — ₹${pending.price} paid`)
      } else {
        // Free extension → nothing to charge.
        await approveExtension(b.id, pending.id)
        toast('Extra time approved')
      }
      // Announce the extension aloud. From here the live clock, the 5-minute heads-up and the
      // completion voice all follow the NEW end time (extension_minutes feeds serviceEndMs), so the
      // customer hears it confirmed now, then again before and after the extended service ends.
      const endTxt = newEndMs ? ` Your service will now be completed by ${clock(newEndMs)}.` : ''
      speak(`Your service has been extended by ${pending.minutes} minutes.${endTxt}`)
      setPending(null)
      nav(`/job/${b.id}/progress`)
    } catch (e) {
      const msg = (e as Error).message || 'Could not complete that'
      toast(msg)
    } finally { setBusy(false) }
  }

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(`/job/${b.id}/progress`)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Extend Your Service?</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll">
        {!pending ? (
          <div className="jt-card jt-center" style={{ padding: 28 }}>
            <Clock size={30} />
            <h3 style={{ margin: '12px 0 4px' }}>No request right now</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              {granted > 0
                ? `Your service was extended by ${granted} minutes.`
                : 'Your expert hasn’t asked for extra time.'}
            </p>
          </div>
        ) : (
          <>
            <div className="jt-card">
              <div className="jt-kv"><span>Current Booking</span><b>{serviceNames(b)}</b></div>
              <div className="jt-kv"><span>Original duration</span><b>{bookedMinutes(b)} mins</b></div>
              {granted > 0 && <div className="jt-kv"><span>Already extended</span><b>+{granted} mins</b></div>}
              {!!currentEndMs && <div className="jt-kv"><span>Current end time</span><b>{clock(currentEndMs)}</b></div>}
            </div>

            <div className="jt-card" style={{ borderColor: 'var(--brand, #6D4AFF)' }}>
              <div className="jt-kv"><span>Requested extension</span><b>+{pending.minutes} mins</b></div>
              {!!newEndMs && <div className="jt-kv"><span>New expected completion</span><b>{clock(newEndMs)}</b></div>}
              <div className="jt-kv">
                <span>Additional amount</span>
                <b>{pending.price > 0 ? `₹${pending.price}` : 'No charge'}</b>
              </div>
            </div>

            <div className="jt-card">
              <div className="jt-kv" style={{ alignItems: 'center' }}>
                <span>Your expert</span>
                <b>{proName(b)} <Star size={12} fill="#F5A623" strokeWidth={0} /> {proRating(b)}</b>
              </div>
              <div style={{ marginTop: 8 }}>
                <div className="muted" style={{ fontSize: 12 }}>Reason</div>
                <div style={{ fontSize: 14 }}>{pending.reasonLabel}</div>
                {!!pending.reasonText && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{pending.reasonText}</div>}
              </div>
            </div>

            {pending.price === 0 && (
              <p className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>
                This extra time is not being charged to you.
              </p>
            )}
          </>
        )}
      </div>

      {!!pending && (
        <div className="jt-foot" style={{ display: 'flex', gap: 10 }}>
          <button className="jt-btn ghost" disabled={busy} style={{ flex: 1 }} onClick={() => decide(false)}>Decline</button>
          <button className="jt-btn" disabled={busy} style={{ flex: 1.6 }} onClick={() => decide(true)}>
            {busy ? 'Please wait…' : pending.price > 0 ? `Approve ₹${pending.price}` : 'Approve'}
          </button>
        </div>
      )}
    </div>
  )
}
