import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Tag, Check, X } from 'lucide-react'
import { Loading, useToast } from '../components/UI'
import PaymentSheet from '../components/PaymentSheet'
import Calendar, { startOfDay, fmtDate, sameDay, SLOT_HOURS, slotLabel, isSlotDisabled } from '../components/Calendar'
import { useStore } from '../store'
import { fetchService, fetchHome, fetchQuote, validateCoupon, createBookingApi } from '../api'
import type { ServiceDetail, Duration, Quote } from '../types'

export default function Book() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { bookingType } = useStore()
  const instant = bookingType !== 'schedule'

  const [s, setS] = useState<ServiceDetail | null>(null)
  const [dur, setDur] = useState<Duration | null>(null)
  const [eta, setEta] = useState(5)
  const [selDate, setSelDate] = useState<Date>(startOfDay(new Date()))
  const [slot, setSlot] = useState<number | null>(null)
  const [coupon, setCoupon] = useState('')
  const [code, setCode] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [sheet, setSheet] = useState(false)
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    fetchService(id!).then((d) => { setS(d); setDur(d.durations[0]) }).catch(() => toast('Could not load service'))
    fetchHome().then((h) => setEta(h.instantEta)).catch(() => {})
  }, [id])

  // recompute the bill whenever duration or coupon changes
  useEffect(() => {
    if (!dur) return
    fetchQuote([{ id: id!, durationId: dur.id }], coupon || undefined).then(setQuote).catch(() => {})
  }, [dur, coupon, id])

  // time slots for the chosen date (past slots on "today" are disabled)
  const slots = useMemo(() => SLOT_HOURS.map((h) => ({ h, label: slotLabel(h), disabled: isSlotDisabled(selDate, h) })), [selDate])
  const isToday = sameDay(selDate, startOfDay(new Date()))
  // when the date changes, keep a valid slot selected (first available)
  useEffect(() => {
    if (slot === null || isSlotDisabled(selDate, slot)) {
      const first = slots.find((x) => !x.disabled)
      setSlot(first ? first.h : null)
    }
  }, [selDate]) // eslint-disable-line

  if (!s || !dur) return <div className="screen"><Loading /></div>

  const total = quote?.total ?? dur.price

  async function applyCoupon() {
    const c = code.trim().toUpperCase()
    if (!c) return
    try {
      const r = await validateCoupon(c, dur!.price)
      setCoupon(r.code); toast(`${r.code} applied · ₹${r.discount} off`)
    } catch (e) { toast((e as Error).message) }
  }
  function clearCoupon() { setCoupon(''); setCode('') }

  async function onPaid(method: string, txnId: string) {
    if (placing) return
    setPlacing(true)
    try {
      const b = await createBookingApi({
        items: [{ id: s!.id, durationId: dur!.id }],
        type: instant ? 'instant' : 'schedule',
        payment: method, coupon: coupon || undefined,
        paymentId: txnId, // Razorpay payment id (verified server-side before the booking is accepted)
        ...(instant ? {} : { date: fmtDate(selDate), time: slot !== null ? slotLabel(slot) : '' }),
      })
      nav(`/confirmed/${b.id}`, { replace: true })
    } catch (e) { toast((e as Error).message); setSheet(false); setPlacing(false) }
  }

  return (
    <div className="screen">
      <button className="sheet-back" onClick={() => nav(-1)}><X size={18} /></button>
      <div className="content sheet-body pad-cta">
        {instant
          ? <h1 className="sheet-title pink">Arrives in {eta} min ⚡</h1>
          : <h1 className="sheet-title">Schedule your slot</h1>}

        {!instant && (
          <>
            <h3 className="incl-head">Pick a date</h3>
            <Calendar value={selDate} onChange={setSelDate} />
            <h3 className="incl-head" style={{ marginTop: 18 }}>Pick a time{isToday ? ' · today' : ''}</h3>
            {slots.every((x) => x.disabled) ? (
              <div className="note-box">No more slots today — pick another date above.</div>
            ) : (
              <div className="slot-grid">
                {slots.map((x) => (
                  <button key={x.h} className={`slot ${slot === x.h ? 'sel' : ''}`} disabled={x.disabled} onClick={() => setSlot(x.h)}>{x.label}</button>
                ))}
              </div>
            )}
            <div className="sched-when">
              <span className="sw-ic">📅</span>
              <span className="grow"><b>{fmtDate(selDate)}</b>{slot !== null ? ` · ${slotLabel(slot)}` : ''}</span>
              {slot !== null && <span className="sw-ok">✓</span>}
            </div>
          </>
        )}

        <h3 className="incl-head" style={{ marginTop: instant ? 0 : 22 }}>Select duration</h3>
        <div className="durx-grid">
          {s.durations.map((d) => (
            <button key={d.id} className={`durx ${dur.id === d.id ? 'sel' : ''}`} onClick={() => setDur(d)}>
              <span className="durx-label">{d.label}</span>
              <span className="durx-price">₹{d.price} {d.original ? <s>₹{d.original}</s> : null}</span>
            </button>
          ))}
        </div>

        {/* coupon */}
        <h3 className="incl-head" style={{ marginTop: 22 }}>Offers & Coupons</h3>
        {coupon ? (
          <div className="coupon-applied">
            <Tag size={18} />
            <span className="grow"><b>{coupon}</b> applied · you saved ₹{quote?.discount ?? 0}</span>
            <button onClick={clearCoupon}><X size={16} /></button>
          </div>
        ) : (
          <div className="coupon-input">
            <Tag size={18} className="ci-ic" />
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter coupon code (e.g. SAVE20, SNAB50)" />
            <button className="ci-apply" onClick={applyCoupon}>Apply</button>
          </div>
        )}

        {/* bill */}
        {quote && (
          <div className="bill">
            <div className="bill-row"><span>Item total</span><span>₹{quote.subtotal}</span></div>
            {quote.discount > 0 && <div className="bill-row disc"><span><Check size={14} /> Coupon discount</span><span>−₹{quote.discount}</span></div>}
            <div className="bill-row total"><span>To pay</span><span>₹{quote.total}</span></div>
          </div>
        )}
      </div>

      {/* pay bar */}
      <div className="footer-cta">
        <div className="paybar">
          <div className="pay-using">
            <span className="muted sm">Total payable</span>
            <span className="pay-name">₹{total}</span>
          </div>
          <button className="btn pay-now" onClick={() => { if (!instant && slot === null) return toast('Please pick a time slot'); setSheet(true) }} disabled={placing}>
            <b>₹{total}</b><span>{placing ? 'Booking…' : 'Pay Now'} →</span>
          </button>
        </div>
      </div>

      <PaymentSheet open={sheet} amount={total} onClose={() => setSheet(false)} onPaid={onPaid} />
    </div>
  )
}
