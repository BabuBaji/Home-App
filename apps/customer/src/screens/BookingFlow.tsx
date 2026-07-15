import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Star, Check, Wallet as WalletIcon, Smartphone, CreditCard, Building2 } from 'lucide-react'
import { Loading, useToast } from '../components/UI'
import PaymentSheet from '../components/PaymentSheet'
import Calendar, { startOfDay, fmtDate, slotLabel, isSlotDisabled } from '../components/Calendar'
import { useStore } from '../store'
import { fetchService, fetchQuote, fetchSlots, fetchCoupons, validateCoupon, fetchWallet, fetchMe, createBookingApi, fetchServiceWorkers, getCachedPosition, type SlotInfo } from '../api'
import type { ServiceDetail, Duration, Quote, Coupon, Address } from '../types'

interface SvcWorker { id: number; name: string; rating: number; jobs: number; km: number | null }

// Module 5 · #32–#39 — Booking wizard. Real slots/quote/coupons/wallet + the existing
// createBooking + PaymentSheet. Worker selection is a UI preference (the backend auto-assigns
// the best available partner). No backend change.
type Step = 'date' | 'slot' | 'worker' | 'summary' | 'coupon' | 'wallet' | 'payment' | 'success'
const ORDER: Step[] = ['date', 'slot', 'worker', 'summary', 'coupon', 'wallet', 'payment', 'success']
const TITLES: Record<Step, string> = {
  date: 'Select Date', slot: 'Select Time Slot', worker: 'Worker Assignment', summary: 'Booking Summary',
  coupon: 'Coupon Selection', wallet: 'Wallet', payment: 'Payment Options', success: '',
}
function groupSlots(slots: { h: number; label: string; disabled: boolean }[]) {
  const g = { Morning: [] as any[], Afternoon: [] as any[], Evening: [] as any[], Night: [] as any[] }
  for (const s of slots) {
    if (s.h < 12) g.Morning.push(s); else if (s.h < 16) g.Afternoon.push(s); else if (s.h < 20) g.Evening.push(s); else g.Night.push(s)
  }
  return g
}

export default function BookingFlow() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { pincode } = useStore()
  const preDurationId = (useLocation().state as { durationId?: string } | null)?.durationId

  const [s, setS] = useState<ServiceDetail | null>(null)
  const [dur, setDur] = useState<Duration | null>(null)
  const [date, setDate] = useState<Date>(startOfDay(new Date()))
  const [slot, setSlot] = useState<number | null>(null)
  const [slotData, setSlotData] = useState<SlotInfo[] | null>(null)
  const [worker, setWorker] = useState('any')
  const [workers, setWorkers] = useState<SvcWorker[]>([])
  const [coupon, setCoupon] = useState('')
  const [code, setCode] = useState('')
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [wallet, setWallet] = useState(0)
  const [useWallet, setUseWallet] = useState(true)
  const [addr, setAddr] = useState<Address | null>(null)
  const [step, setStep] = useState<Step>('date')
  const [sheet, setSheet] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [payMethod, setPayMethod] = useState('upi')
  const [newId, setNewId] = useState<number | null>(null)

  useEffect(() => {
    fetchService(id!, pincode || undefined).then((d) => { setS(d); setDur(d.durations.find((x) => x.id === preDurationId) || d.durations[0]) }).catch(() => toast('Could not load service'))
    fetchCoupons().then(setCoupons).catch(() => {})
    fetchWallet().then((w) => setWallet(w.total)).catch(() => {})
    fetchMe().then(({ addresses }) => setAddr(addresses.find((a) => a.is_default) || addresses[0] || null)).catch(() => {})
  }, [id, pincode])

  const dateStr = fmtDate(date)
  useEffect(() => {
    if (!pincode || !s) return
    fetchSlots(dateStr, pincode, s.name).then((r) => setSlotData(r.slots)).catch(() => setSlotData([]))
  }, [dateStr, pincode, s])

  // Real workers offering this service (from the worker service), nearest first.
  useEffect(() => {
    if (!s) return
    const c = getCachedPosition()
    fetchServiceWorkers(s.name, c?.lat, c?.lng).then(setWorkers).catch(() => {})
  }, [s])

  useEffect(() => {
    if (!dur) return
    const at = slot !== null ? `${slot}:00` : undefined
    fetchQuote([{ id: id!, durationId: dur.id }], coupon || undefined, pincode || undefined, at).then(setQuote).catch(() => {})
  }, [dur, coupon, slot, id, pincode])

  // Show only slots from now onward for today (hide past hours); mark no-capacity slots disabled.
  const slots = useMemo(() => (slotData || [])
    .filter((x) => !isSlotDisabled(date, x.hour))
    .map((x) => ({ h: x.hour, label: x.time, disabled: !x.available })), [slotData, date])
  const grouped = useMemo(() => groupSlots(slots), [slots])
  const orderTotal = quote?.total ?? dur?.price ?? 0
  const walletUsed = useWallet ? Math.min(wallet, orderTotal) : 0
  const payable = Math.max(0, orderTotal - walletUsed)

  if (!s || !dur) return <div className="screen m2"><Loading /></div>

  const idx = ORDER.indexOf(step)
  const back = () => { if (idx === 0) nav(-1); else setStep(ORDER[idx - 1]) }
  const go = (st: Step) => setStep(st)

  async function applyCoupon(cc?: string) {
    const c = (cc || code).trim().toUpperCase()
    if (!c) return
    try { const r = await validateCoupon(c, dur!.price); setCoupon(r.code); setCode(''); toast(`${r.code} applied · ₹${r.discount} off`) }
    catch (e) { toast((e as Error).message) }
  }

  async function place(method: string, txnId?: string) {
    if (placing) return
    setPlacing(true)
    try {
      const b = await createBookingApi({
        items: [{ id: s!.id, durationId: dur!.id }],
        type: 'schedule', date: dateStr, time: slot !== null ? slotLabel(slot) : '',
        at: slot !== null ? `${slot}:00` : undefined,
        payment: payable === 0 ? 'wallet' : method, coupon: coupon || undefined, pincode: pincode || undefined,
        ...(worker !== 'any' ? { workerId: Number(worker) } : {}),
        ...(txnId ? { paymentId: txnId } : {}),
      })
      // Payment done → Payment Success (39) → Booking Confirmed (40) → Tracking (41).
      setNewId(b.id); go('success')
    } catch (e) { toast((e as Error).message); setPlacing(false); setSheet(false) }
  }

  function pay(method: string) {
    if (payable === 0) place('wallet')
    else { setPayMethod(method); setSheet(true) }
  }

  const serviceCard = (
    <div className="bf-svc">
      <span className="bf-svc-img"><img src={s.image || `/services/${s.id}.jpg`} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /></span>
      <div><b>{s.name}</b><small>{dur.label} · ₹{dur.price}</small></div>
    </div>
  )

  return (
    <div className="screen m2">
      {step !== 'success' && (
        <div className="ps-top">
          <button className="au-back" onClick={back} aria-label="Back"><ArrowLeft size={22} /></button>
          <b>{TITLES[step]}</b><span style={{ width: 42 }} />
        </div>
      )}

      {/* 32 Date */}
      {step === 'date' && (<>
        <div className="content">
          {serviceCard}
          <div className="bf-lbl">Select Date</div>
          <Calendar value={date} onChange={(d) => { setDate(d); setSlot(null) }} zh={null} />
        </div>
        <div className="au-foot"><button className="au-btn" onClick={() => go('slot')}>Continue</button></div>
      </>)}

      {/* 33 Slot */}
      {step === 'slot' && (<>
        <div className="content">
          {serviceCard}
          <div className="bf-row"><div className="bf-lbl">Selected Date</div><button className="au-link" onClick={() => go('date')}>Change</button></div>
          <div className="bf-date">{date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div className="bf-lbl">Available Slots</div>
          {slotData == null ? <div className="ad2-hint">Loading slots…</div> : (
            Object.entries(grouped).map(([g, list]) => list.length === 0 ? null : (
              <div key={g} className="bf-slotgrp">
                <div className="bf-slot-h">{g}</div>
                <div className="bf-slots">
                  {list.map((x: any) => (
                    <button key={x.h} className={`bf-slot ${slot === x.h ? 'on' : ''}`} disabled={x.disabled} onClick={() => setSlot(x.h)}>{x.label}</button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="au-foot"><button className="au-btn" onClick={() => slot === null ? toast('Pick a time slot') : go('worker')} disabled={slot === null}>Continue</button></div>
      </>)}

      {/* 34 Worker */}
      {step === 'worker' && (<>
        <div className="content">
          {serviceCard}
          {workers.length === 0 && <div className="ad2-hint">Finding workers for this service…</div>}
          {workers[0] && <>
            <div className="bf-lbl">Preferred Worker</div>
            <WorkerRow w={workers[0]} sel={worker} onPick={setWorker} />
          </>}
          {workers.length > 1 && <>
            <div className="bf-lbl">Other Available Workers</div>
            {workers.slice(1).map((w) => <WorkerRow key={w.id} w={w} sel={worker} onPick={setWorker} />)}
          </>}
          <button className={`bf-worker any ${worker === 'any' ? 'on' : ''}`} onClick={() => setWorker('any')}>
            <span className="bf-wava any">✦</span>
            <div className="grow"><b>Any available worker</b><small>We'll assign the best available partner</small></div>
            <span className={`sf-radio ${worker === 'any' ? 'on' : ''}`}>{worker === 'any' && <Check size={13} />}</span>
          </button>
        </div>
        <div className="au-foot"><button className="au-btn" onClick={() => go('summary')}>Continue</button></div>
      </>)}

      {/* 35 Summary */}
      {step === 'summary' && (<>
        <div className="content">
          <div className="bf-lbl">Service Details</div>
          <div className="bf-sum-svc">{serviceCard}<b className="bf-sum-p">₹{dur.price}</b></div>
          <div className="bf-sumrow"><span>Date</span><b>{date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</b></div>
          <div className="bf-sumrow"><span>Time</span><b>{slot !== null ? slotLabel(slot) : '—'}</b></div>
          <div className="bf-sumrow"><span>Worker</span><b>{worker === 'any' ? 'Any available' : (workers.find((w) => String(w.id) === worker)?.name || 'Any available')}</b></div>
          <div className="bf-sumrow"><span>Address</span><b className="bf-addr">{addr?.line || 'Set address'}</b></div>
          <div className="bf-div" />
          <div className="bf-lbl">Price Details</div>
          <div className="bf-sumrow sm"><span>Service Charges</span><b>₹{quote?.subtotal ?? dur.price}</b></div>
          {(quote?.discount || 0) > 0 && <div className="bf-sumrow sm disc"><span>Coupon ({coupon})</span><b>−₹{quote!.discount}</b></div>}
          {(quote?.fee || 0) > 0 && <div className="bf-sumrow sm"><span>Platform Fee</span><b>₹{quote!.fee}</b></div>}
          {(quote?.tax || 0) > 0 && <div className="bf-sumrow sm"><span>GST{quote!.gstPct ? ` (${quote!.gstPct}%)` : ''}</span><b>₹{quote!.tax}</b></div>}
          <div className="bf-div" />
          <div className="bf-sumrow total"><span>Total Amount</span><b>₹{orderTotal}</b></div>
        </div>
        <div className="au-foot"><button className="au-btn" onClick={() => go('coupon')}>Continue</button></div>
      </>)}

      {/* 36 Coupon */}
      {step === 'coupon' && (<>
        <div className="content">
          <div className="bf-coupon-in"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter coupon code" /><button onClick={() => applyCoupon()}>Apply</button></div>
          <div className="bf-lbl">Available Coupons</div>
          {coupons.map((c) => (
            <div key={c.code} className={`bf-coupon ${coupon === c.code ? 'on' : ''}`}>
              <div className="grow"><b>{c.code}</b><small>{c.label}</small>{c.min ? <small className="bf-cmin">Min order ₹{c.min}</small> : null}</div>
              {coupon === c.code ? <span className="bf-capplied"><Check size={16} /></span> : <button className="au-link" onClick={() => applyCoupon(c.code)}>Apply</button>}
            </div>
          ))}
          {coupons.length === 0 && <p className="ad2-hint">No coupons available right now.</p>}
          <div className="bf-div" />
          <div className="bf-sumrow"><span>Total Amount</span><b>₹{quote?.subtotal ?? dur.price}</b></div>
          {(quote?.discount || 0) > 0 && <div className="bf-sumrow disc"><span>Discount ({coupon})</span><b>− ₹{quote!.discount}</b></div>}
          <div className="bf-sumrow total"><span>Payable Amount</span><b>₹{orderTotal}</b></div>
        </div>
        <div className="au-foot"><button className="au-btn" onClick={() => go('wallet')}>Continue</button></div>
      </>)}

      {/* 37 Wallet */}
      {step === 'wallet' && (<>
        <div className="content">
          <div className="bf-wcard"><div><small>Available Balance</small><b>₹{wallet}</b></div><span className="bf-wic"><WalletIcon size={22} /></span></div>
          <div className="bf-wtoggle"><span className="grow">Use wallet balance</span><button className={`sf-switch ${useWallet ? 'on' : ''}`} onClick={() => setUseWallet((u) => !u)}><span /></button></div>
          {useWallet && (<>
            <div className="bf-lbl">Amount to use</div>
            <div className="bf-wamt">₹{walletUsed}</div>
            <div className="bf-whint">(Max usable ₹{Math.min(wallet, orderTotal)})</div>
          </>)}
          <div className="bf-div" />
          <div className="bf-sumrow total"><span>Remaining to pay</span><b>₹{payable}</b></div>
        </div>
        <div className="au-foot"><button className="au-btn" onClick={() => go('payment')}>Continue to Payment</button></div>
      </>)}

      {/* 38 Payment */}
      {step === 'payment' && (<>
        <div className="content">
          <div className="bf-payrow"><span>Amount to Pay</span><b>₹{payable}</b></div>
          <div className="bf-payrow sm"><span>Order Total</span><b>₹{orderTotal}</b></div>
          {walletUsed > 0 && <div className="bf-payrow sm disc"><span>Wallet Discount</span><b>− ₹{walletUsed}</b></div>}
          <div className="bf-div" />
          <div className="bf-lbl">{payable === 0 ? 'Paying via wallet' : 'Recommended'}</div>
          <button className={`bf-pay ${payMethod === 'upi' ? 'on' : ''}`} onClick={() => setPayMethod('upi')}>
            <span className="bf-pay-ic upi"><Smartphone size={18} /></span>
            <div className="grow"><b>UPI</b><small>Pay using any UPI app</small></div>
            <span className={`sf-radio ${payMethod === 'upi' ? 'on' : ''}`}>{payMethod === 'upi' && <Check size={13} />}</span>
          </button>
          <div className="bf-lbl">Other Options</div>
          {[['card', 'Credit / Debit Card', 'Visa, MasterCard, RuPay', CreditCard], ['netbanking', 'Net Banking', 'All major banks', Building2], ['phonepe', 'PhonePe Wallet', 'Pay using PhonePe balance', WalletIcon], ['gpay', 'Google Pay', 'Pay using GPay', Smartphone]].map(([mid, name, sub, Ic]: any) => (
            <button key={mid} className={`bf-pay ${payMethod === mid ? 'on' : ''}`} onClick={() => setPayMethod(mid)}>
              <span className="bf-pay-ic"><Ic size={18} /></span>
              <div className="grow"><b>{name}</b><small>{sub}</small></div>
              <span className={`sf-radio ${payMethod === mid ? 'on' : ''}`}>{payMethod === mid && <Check size={13} />}</span>
            </button>
          ))}
        </div>
        <div className="au-foot"><button className="au-btn" onClick={() => pay(payMethod)} disabled={placing}>{placing ? 'Please wait…' : `Pay ₹${payable}`}</button></div>
      </>)}

      {/* 39 Payment Success */}
      {step === 'success' && (
        <div className="content bf-success">
          <div className="bf-succ-ic"><Check size={44} /></div>
          <h1>Payment Successful!</h1>
          <p>₹{payable} paid successfully</p>
          <div className="bf-succ-card">
            <div className="bf-payrow sm"><span>Order Total</span><b>₹{orderTotal}</b></div>
            {walletUsed > 0 && <div className="bf-payrow sm disc"><span>Wallet Discount</span><b>− ₹{walletUsed}</b></div>}
            <div className="bf-payrow"><span>Amount Paid</span><b>₹{payable}</b></div>
            <div className="bf-div" />
            <div className="bf-payrow sm"><span>Payment Method</span><b>{payable === 0 ? 'Wallet Balance' : payMethod.toUpperCase()}</b></div>
          </div>
          <button className="au-btn" onClick={() => nav(`/confirmed/${newId}`, { replace: true })} style={{ marginTop: 20 }}>Continue</button>
        </div>
      )}

      <PaymentSheet open={sheet} amount={payable} onClose={() => setSheet(false)} onPaid={(m, t) => { setSheet(false); place(m, t) }} />
    </div>
  )
}

function WorkerRow({ w, sel, onPick }: { w: SvcWorker; sel: string; onPick: (id: string) => void }) {
  const id = String(w.id)
  return (
    <button className={`bf-worker ${sel === id ? 'on' : ''}`} onClick={() => onPick(id)}>
      <span className="bf-wava">{w.name[0]?.toUpperCase()}</span>
      <div className="grow"><b>{w.name}</b><small><Star size={11} className="bf-star" /> {w.rating} ({w.jobs} jobs){w.km != null ? ` · ${w.km} km away` : ''}</small></div>
      <span className={`sf-radio ${sel === id ? 'on' : ''}`}>{sel === id && <Check size={13} />}</span>
    </button>
  )
}
