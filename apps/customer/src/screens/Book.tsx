import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Loading, useToast } from '../components/UI'
import PaymentSheet from '../components/PaymentSheet'
import Calendar, { startOfDay, fmtDate, sameDay, isZoneOpenNow, todayHoursLabel } from '../components/Calendar'
import type { ZoneHours } from '../components/Calendar'
import { useStore } from '../store'
import { fetchService, fetchQuote, createBookingApi, fetchZoneHours, fetchSlots, type SlotInfo } from '../api'
import type { ServiceDetail, Duration, Quote } from '../types'

// Part-of-day buckets for the schedule time grid.
const TOD: { key: string; label: string; test: (h: number) => boolean }[] = [
  { key: 'morning', label: 'Morning', test: (h) => h < 12 },
  { key: 'afternoon', label: 'Afternoon', test: (h) => h >= 12 && h < 17 },
  { key: 'evening', label: 'Evening', test: (h) => h >= 17 },
]
const ETA_MIN = 15  // instant "arrives in ~15 min"
// 12-hour label for a minutes-from-midnight value, e.g. 930 → "3:30 PM".
const fmt15 = (mins: number) => { const h = Math.floor(mins / 60), m = mins % 60; const ap = h < 12 ? 'AM' : 'PM'; const hh = (h % 12) || 12; return `${hh}:${String(m).padStart(2, '0')} ${ap}` }
const at24 = (mins: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
// Small PhonePe brand mark for the "Pay using" footer.
const PhonePeMini = () => (
  <svg viewBox="0 0 32 32" width={17} height={17} style={{ verticalAlign: 'middle', flex: '0 0 auto' }} aria-hidden>
    <rect width="32" height="32" rx="7" fill="#5f259f" />
    <text x="16" y="21" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="13" fontWeight="700" fill="#fff">Pe</text>
  </svg>
)

export default function Book() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { bookingType, setBookingType, payment, pincode } = useStore()
  const preDurationId = (useLocation().state as { durationId?: string } | null)?.durationId
  const instant = bookingType !== 'schedule'

  const [s, setS] = useState<ServiceDetail | null>(null)
  const [dur, setDur] = useState<Duration | null>(null)
  const [selDate, setSelDate] = useState<Date | null>(null)   // schedule: no date picked until the user chooses one
  const [showCal, setShowCal] = useState(false)
  const [slot, setSlot] = useState<number | null>(null)        // minutes from midnight (15-min granularity)
  const [tod, setTod] = useState('morning')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [sheet, setSheet] = useState(false)
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    fetchService(id!, pincode || undefined).then((d) => { setS(d); setDur(d.durations.find((x) => x.id === preDurationId) || d.durations[0]) }).catch(() => toast('Could not load service'))
  }, [id, pincode])

  // Live authoritative bill (server applies zone price, offers, membership, peak/surge, tax).
  useEffect(() => {
    if (!dur) return
    const now = new Date()
    const at = instant ? `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}` : (slot !== null ? at24(slot) : undefined)
    fetchQuote([{ id: id!, durationId: dur.id }], undefined, pincode || undefined, at).then(setQuote).catch(() => {})
  }, [dur, id, pincode, slot, instant])

  // Zone hours → instant "open now" check.
  const [zh, setZh] = useState<ZoneHours | null>(null)
  useEffect(() => {
    if (!pincode) { setZh(null); return }
    fetchZoneHours(pincode).then(setZh).catch(() => setZh(null))
  }, [pincode])
  const closedNow = instant && !isZoneOpenNow(zh)

  // Real bookable hours for the chosen date (zone hours + capacity) — only once a date is picked.
  const [slotData, setSlotData] = useState<{ slots: SlotInfo[]; closed: boolean; serviceable: boolean } | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const dateStr = selDate ? fmtDate(selDate) : ''
  useEffect(() => {
    if (instant || !pincode || !s || !selDate) { setSlotData(null); return }
    const ahead = Math.round((startOfDay(selDate).getTime() - startOfDay(new Date()).getTime()) / 86400000)
    const maxAhead = new Date().getHours() >= 20 ? 3 : 2   // rolling window; the next day releases at 8 PM
    if (ahead > maxAhead) { setSlotData(null); return }     // beyond the open window → locked
    setSlotsLoading(true)
    fetchSlots(dateStr, pincode, s.name).then(setSlotData).catch(() => setSlotData(null)).finally(() => setSlotsLoading(false))
  }, [dateStr, pincode, instant, s, selDate])

  const dayClosed = !!slotData?.closed
  const isTodaySel = selDate ? sameDay(selDate, startOfDay(new Date())) : false
  const nowMin = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() })()
  // Expand each available hour into four 15-minute slots (:00 :15 :30 :45).
  const allSlots = (slotData?.slots || []).flatMap((x) => [0, 15, 30, 45].map((m) => {
    const mins = x.hour * 60 + m
    const past = isTodaySel && mins <= nowMin + 30   // 30-min booking lead time for "today"
    return { mins, h: x.hour, label: fmt15(mins), disabled: !x.available || past, soldout: !x.available }
  }))
  const todSlots = allSlots.filter((x) => TOD.find((t) => t.key === tod)!.test(x.h))
  const bookableCount = allSlots.filter((x) => !x.disabled).length
  // Keep a valid slot selected within the active part-of-day.
  useEffect(() => {
    const firstOk = todSlots.find((x) => !x.disabled)
    if (slot === null || !allSlots.some((x) => x.mins === slot && !x.disabled)) setSlot(firstOk ? firstOk.mins : null)
  }, [slotData, selDate, tod]) // eslint-disable-line

  if (!s || !dur) return <div className="screen"><Loading /></div>

  const total = quote?.total ?? dur.price
  // Schedule date chips: exactly three — Today, Tomorrow, and the next day (by weekday). Further-out
  // dates are picked from the calendar.
  const chipDays = Array.from({ length: 3 }, (_, i) => { const d = startOfDay(new Date()); d.setDate(d.getDate() + i); return d })
  const chipLabel = (d: Date, i: number) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'long' }))
  const dateIsChip = selDate && chipDays.some((d) => sameDay(d, selDate))
  // Booking window: Today/Tomorrow/next day are open; further-out dates unlock at 8 PM daily.
  const maxOffset = new Date().getHours() >= 20 ? 3 : 2
  const daysAhead = selDate ? Math.round((startOfDay(selDate).getTime() - startOfDay(new Date()).getTime()) / 86400000) : 0
  const locked = !!selDate && daysAhead > maxOffset
  const lastOpen = startOfDay(new Date()); lastOpen.setDate(lastOpen.getDate() + maxOffset)
  const payLabel = payment === 'phonepe' ? 'PhonePe UPI' : payment === 'wallet' ? 'Wallet' : 'UPI'
  const showDetails = instant || !!selDate   // schedule: reveal duration/time only after a date is chosen

  async function onPaid(method: string, txnId: string) {
    if (placing) return
    setPlacing(true)
    try {
      const bnow = new Date()
      const bookAt = instant ? `${bnow.getHours()}:${String(bnow.getMinutes()).padStart(2, '0')}` : (slot !== null ? at24(slot) : undefined)
      const b = await createBookingApi({
        items: [{ id: s!.id, durationId: dur!.id }],
        type: instant ? 'instant' : 'schedule',
        payment: method, pincode: pincode || undefined,
        paymentId: txnId, // verified server-side
        at: bookAt,
        // No workerId → backend auto-assigns the nearest available expert.
        ...(instant ? {} : { date: fmtDate(selDate!), time: slot !== null ? fmt15(slot) : '' }),
      })
      nav(`/confirmed/${b.id}`, { replace: true })
    } catch (e) { toast((e as Error).message); setSheet(false); setPlacing(false) }
  }

  const startPay = () => {
    if (closedNow) { setBookingType('schedule'); return }
    if (!instant && !selDate) return toast('Please pick a date')
    if (!instant && slot === null) return toast('Please pick a time slot')
    setSheet(true)
  }

  return (
    <div className="screen">
      <div className="ps-top">
        <button className="au-back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>{instant ? 'Book Instant' : 'Schedule'}</b><span style={{ width: 42 }} />
      </div>

      <div className="content pad-cta bkx-scroll">
        {instant && (closedNow ? <h1 className="sheet-title">We're closed right now 🌙</h1> : <h1 className="sheet-title pink">Arrives in {ETA_MIN} min ⚡</h1>)}

        {closedNow && (
          <div className="note-box" style={{ background: '#fff4ec', borderColor: '#fed7aa', color: '#c2410c' }}>
            🌙 We're closed right now{todayHoursLabel(zh) ? ` · Hours ${todayHoursLabel(zh)}` : ''}. <b onClick={() => setBookingType('schedule')} style={{ textDecoration: 'underline', cursor: 'pointer' }}>Schedule for later</b>.
          </div>
        )}

        {/* SCHEDULE step 1 — pick a date (3 chips + calendar for future dates) */}
        {!instant && (
          <div className="bkx-card">
            <div className="bkx-sec">Select Date</div>
            <div className="bkx-dates">
              {chipDays.map((d, i) => (
                <button key={i} className={`bkx-date ${selDate && sameDay(d, selDate) ? 'sel' : ''}`} onClick={() => { setSelDate(d); setShowCal(false) }}>{chipLabel(d, i)}</button>
              ))}
              <button className={`bkx-date bkx-date-more ${selDate && !dateIsChip ? 'sel' : ''}`} onClick={() => setShowCal((v) => !v)}>
                📅 {selDate && !dateIsChip ? fmtDate(selDate) : 'Pick date'}
              </button>
            </div>
            {showCal && <div className="bkx-cal"><Calendar value={selDate ?? startOfDay(new Date())} onChange={(d) => { setSelDate(d); setShowCal(false) }} zh={zh} /></div>}
          </div>
        )}

        {/* SCHEDULE step 2 (revealed after a date) / INSTANT — duration */}
        {showDetails && (
          <div className={instant ? '' : 'bkx-card'}>
            <div className="bkx-sec">Select duration</div>
            <div className={`${instant ? 'durx-grid' : 'bkx-dur-scroll'} ${locked ? 'bkx-dim' : ''}`}>
              {s.durations.map((d) => (
                <button key={d.id} className={`durx ${dur.id === d.id ? 'sel' : ''}`} disabled={locked} onClick={() => setDur(d)}>
                  <span className="durx-label">{d.label}</span>
                  <span className="durx-price">₹{d.price} {d.original ? <s>₹{d.original}</s> : null}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SCHEDULE step 3 — start time (15-min slots, revealed after a date) */}
        {!instant && selDate && (
          <div className="bkx-card">
            <div className="bkx-sec">Select Start Time</div>
            <div className="bkx-tod">
              {TOD.map((t) => <button key={t.key} className={`bkx-tod-tab ${tod === t.key ? 'sel' : ''}`} onClick={() => setTod(t.key)}>{t.label}</button>)}
            </div>
            {locked ? (
              <div className="bkx-locked"><span className="bkx-lock">🔒</span><b>Slots open at 8 PM tonight</b><span className="muted">Booking is open up to {lastOpen.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Later dates release every day at 8 PM.</span></div>
            ) : slotsLoading ? (
              <div className="note-box">Checking availability…</div>
            ) : dayClosed ? (
              <div className="bkx-locked"><span className="bkx-lock">🔒</span><b>Not available on {selDate.toLocaleDateString('en-IN', { weekday: 'long' })}</b><span className="muted">Please pick another date</span></div>
            ) : bookableCount === 0 ? (
              <div className="bkx-locked"><span className="bkx-lock">🔒</span><b>Sold out for this day</b><span className="muted">Please try another date</span></div>
            ) : todSlots.length === 0 ? (
              <div className="note-box">No {TOD.find((t) => t.key === tod)!.label.toLowerCase()} slots — try another part of the day.</div>
            ) : (
              <div className="slot-grid bkx-slots">
                {todSlots.map((x) => (
                  <button key={x.mins} className={`slot ${slot === x.mins ? 'sel' : ''} ${x.soldout ? 'soldout' : ''}`} disabled={x.disabled} onClick={() => setSlot(x.mins)}>
                    {x.label}{x.soldout && <span className="slot-out">Sold out</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* schedule: gentle hint before a date is chosen */}
        {!instant && !selDate && (
          <div className="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 22 }}>Pick a date to choose your duration and time.</div>
        )}
      </div>

      {/* sticky pay footer */}
      <div className="footer-cta">
        <div className="paybar">
          <div className="pay-using">
            <span className="muted sm">Pay using</span>
            {/* layout lives in .pay-name (index.css): an inline style here used to override the
                stylesheet's display:block, which collapsed the label and method onto one line and
                ran the brand mark into the "Pay using" text. */}
            <span className="pay-name">{payment === 'wallet' ? <span className="pay-name-ic">👛</span> : <PhonePeMini />}<span className="pay-name-t">{payLabel}</span></span>
          </div>
          <button className="btn pay-now" onClick={startPay} disabled={placing || closedNow || (!instant && (!selDate || slot === null))}>
            {closedNow ? <span>Schedule →</span> : <><b>₹{total}</b><span>{placing ? 'Booking…' : 'Pay Now'} →</span></>}
          </button>
        </div>
      </div>

      <PaymentSheet open={sheet} amount={total} onClose={() => setSheet(false)} onPaid={onPaid} />
    </div>
  )
}
