import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Star, Check, Wallet as WalletIcon, MapPin, Repeat, Heart, Tag, X, Sunrise, Sun, Moon, Info, ArrowRight, CalendarDays, Phone, ChevronRight, ChevronDown, ChevronUp, Minus, Plus, Trash2 } from 'lucide-react'
import { Loading, useToast } from '../components/UI'
import PaymentSheet from '../components/PaymentSheet'
import AddressSheet from '../components/AddressSheet'
import { startOfDay, fmtDate, todayHoursLabel } from '../components/Calendar'
import { useStore } from '../store'
import {
  fetchService, fetchQuote, fetchInstantStatus, type InstantStatus, fetchSlots, fetchCoupons, validateCoupon, fetchWallet, fetchMe, createBookingApi,
  fetchServiceWorkers, createRecurring, setActivePackage, type SlotInfo,
} from '../api'
import type { ServiceDetail, Duration, Quote, Coupon, Address, CartItem } from '../types'
import { t, tDur, dateLocale } from '../i18n'
import { useAppConfig } from '../appConfig'
import { getBookMode } from '../bookMode'
import { shortAddress, fullAddress } from '../addressText'
import { getCartWhen, setCartWhen } from '../cartWhen'

/*
 * THE booking flow. Every way into a booking ends up here:
 *   /booking/:serviceId   one service (from Service details, Rebook, recommendations, old /book + /configure links)
 *   /booking/cart         the services in the cart (a package from Home)
 *
 *   One screen does the work: duration + when/address/expert rows + price, coupon, wallet → Pay
 *   → PaymentSheet → /confirmed/:id → /job/:id. Sensible defaults mean most bookings never leave it
 *   (Now when the zone is open, the default address, any expert). When / address / expert are
 *   detours opened from their row's Change — or automatically when Pay finds one missing — and each
 *   returns to the main screen. Schedule (from Home or the service page) opens on the slot picker.
 *
 * All prices come from the server quote; the booking itself is priced again server-side.
 */
type Step = 'duration' | 'when' | 'address' | 'expert' | 'summary'
const TITLES: Record<Step, string> = {
  duration: 'Choose duration', when: 'Schedule for later', address: 'Service address', expert: 'Choose your expert', summary: 'Book service',
}
interface SvcWorker { id: number; name: string; rating: number; jobs: number; km: number | null; favourite?: boolean }

const FREQ = [
  { id: 'one-time', label: 'One-time' },
  { id: 'daily', label: 'Daily' },
  { id: 'alternate', label: 'Alternate Days' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Bi-weekly' },
  { id: 'monthly', label: 'Monthly' },
]

type Part = 'Morning' | 'Afternoon' | 'Evening'
function groupSlots(slots: { h: number; label: string; disabled: boolean }[]) {
  const g: Record<Part, typeof slots> = { Morning: [], Afternoon: [], Evening: [] }
  for (const s of slots) { if (s.h < 12 * 60) g.Morning.push(s); else if (s.h < 16 * 60) g.Afternoon.push(s); else g.Evening.push(s) }
  return g
}
const PART_ICON = { Morning: Sunrise, Afternoon: Sun, Evening: Moon }
// Today, Tomorrow, then weekday names - the next 7 days as chips (Pronto-style).
function nextDays(n = 7) {
  const today = startOfDay(new Date())
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + i)
    return { d, label: i === 0 ? t('Today') : i === 1 ? t('Tomorrow') : d.toLocaleDateString(dateLocale(), { weekday: 'long' }) }
  })
}
// Slots are minutes-of-day on a half-hour grid. The server's label format ("01:30 PM") is what a
// booking stores and what capacity is counted by, so send exactly that.
// Duration in hours like Pronto's chips: "30 min" → "0.5 hr", "90 min" → "1.5 hr", "2 hrs" → "2 hr".
function hrLabel(label: string) {
  const m = String(label).match(/([\d.]+)\s*(hr|hour)?/i)
  if (!m) return label
  const hrs = parseFloat(m[1]) / (m[2] ? 1 : 60)
  return `${Number(hrs.toFixed(2))} hr`
}
const minAt = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
const serverTime = (m: number) => { const h = Math.floor(m / 60); return `${String(h % 12 || 12).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
const niceTime = (m: number) => { const h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` }

// Leaving the flow to add a new address unmounts it; these few choices are restored on the way back.
const RESUME_KEY = 'hh_flow_resume'
interface Saved { key: string; durId?: string; mode: 'now' | 'schedule' | null; date: string; slot: number | null; freq: string; worker: string; note: string; added?: boolean }

// /booking/hourly → /booking/cart (Add to cart) is the same route, so React would keep this screen's
// state (still on the slot step). Keying by the id makes each one a fresh screen: the cart always
// opens on My Cart.
export default function BookingFlowRoute() {
  const { id } = useParams()
  return <BookingFlow key={id} />
}

function BookingFlow() {
  const { id } = useParams()
  const nav = useNavigate()
  const { promoCodes } = useAppConfig()
  const toast = useToast()
  const { user, pincode, zoneHours, cart, clearCart, addToCart, removeFromCart, setServiceLocation } = useStore()
  const navState = useLocation().state as { durationId?: string; freq?: string; mode?: 'now' | 'schedule' } | null
  const cartMode = id === 'cart'
  const flowKey = cartMode ? 'cart' : String(id)

  // Read once (no side effects here — StrictMode calls initialisers twice); cleared after mount.
  const [saved] = useState<Saved | null>(() => {
    try {
      const raw = sessionStorage.getItem(RESUME_KEY)
      const v = raw ? JSON.parse(raw) as Saved : null
      return v && v.key === flowKey ? v : null
    } catch { return null }
  })
  useEffect(() => { try { sessionStorage.removeItem(RESUME_KEY) } catch { /* ignore */ } }, [])

  const [s, setS] = useState<ServiceDetail | null>(null)
  const [dur, setDur] = useState<Duration | null>(null)
  const cartWhen = cartMode ? getCartWhen() : null
  // Adding another service while the cart already has a visit booked: start on that day + slot, so
  // everything stays one visit (changing it here moves the whole cart's slot).
  const heldWhen = !cartMode && cart.length > 0 ? getCartWhen() : null
  const initMode = saved?.mode ?? (cartWhen ? cartWhen.mode : null) ?? navState?.mode ?? getBookMode() ?? null
  const [mode, setMode] = useState<'now' | 'schedule' | null>(initMode)
  const visit = cartWhen || heldWhen
  const [date, setDate] = useState<Date>(saved?.date ? new Date(saved.date) : visit ? new Date(visit.date) : startOfDay(new Date()))
  const [slot, setSlot] = useState<number | null>(saved?.slot ?? (visit?.mode === 'schedule' ? visit.min : null) ?? null)
  const [slotData, setSlotData] = useState<SlotInfo[] | null>(null)
  const [freq, setFreq] = useState(saved?.freq || cartWhen?.freq || (navState?.freq && FREQ.some((f) => f.id === navState.freq) ? navState.freq : 'one-time'))
  const [worker, setWorker] = useState(saved?.worker || 'any')
  const [workers, setWorkers] = useState<SvcWorker[] | null>(null)
  // My Cart: each item's duration menu (from the API) so the − / + stepper can move through it.
  const [itemDurs, setItemDurs] = useState<Record<string, Duration[]>>({})
  const [billOpen, setBillOpen] = useState(true)
  const cartIdsKey = cart.map((c) => c.id).join(',')
  useEffect(() => {
    if (!cartMode) return
    Promise.all(cart.map((c) => fetchService(c.id, pincode || undefined).then((d) => [c.id, d.durations] as const).catch(() => null)))
      .then((list) => setItemDurs(Object.fromEntries(list.filter(Boolean) as [string, Duration[]][])))
  }, [cartIdsKey, pincode])
  const [part, setPart] = useState<Part | null>(null)
  const [addrs, setAddrs] = useState<Address[] | null>(null)
  const [addr, setAddr] = useState<Address | null>(null)
  const [addrSheet, setAddrSheet] = useState(false)
  const [coupon, setCoupon] = useState('')
  const [code, setCode] = useState('')
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [showCoupons, setShowCoupons] = useState(false)
  useEffect(() => { if (!promoCodes) setCoupon('') }, [promoCodes])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [wallet, setWallet] = useState(0)
  // Off by default: on, a wallet that covered the total (welcome bonus, refunds) booked the job the
  // moment Pay was tapped — the customer never saw a payment step. They can still switch it on.
  const [useWallet, setUseWallet] = useState(false)
  const [note, setNote] = useState(saved?.note || '')
  // Main screen is 'summary'; Schedule opens on the slot picker so the time is picked first.
  // Instant and Schedule both open on the Pronto-style selection screen; Continue → Review & pay.
  const [step, setStep] = useState<Step>(saved || cartWhen ? 'summary' : 'when')
  const [sheet, setSheet] = useState(false)
  // "Pay using" remembers the last choice, so Pay goes straight to it (Razorpay, or cash).
  const [payPref, setPayPref] = useState<'online' | 'cash'>(() => { try { return localStorage.getItem('hh_last_pay') === 'cash' ? 'cash' : 'online' } catch { return 'online' } })
  const [autoPay, setAutoPay] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [loadErr, setLoadErr] = useState(false)

  // What is being booked: one service + duration, or the cart's items.
  const items: { id: string; durationId: string }[] = cartMode
    ? cart.map((c) => ({ id: c.id, durationId: c.durationId }))
    : s && dur ? [{ id: s.id, durationId: dur.id }] : []
  const names = cartMode ? cart.map((c) => c.name).join(',') : s?.name || ''

  useEffect(() => {
    if (cartMode) return
    fetchService(id!, pincode || undefined)
      .then((d) => { setS(d); setDur(d.durations.find((x) => x.id === (saved?.durId || navState?.durationId)) || d.durations[0] || null) })
      .catch(() => setLoadErr(true))
  }, [id, pincode])

  useEffect(() => {
    fetchCoupons().then(setCoupons).catch(() => {})
    fetchWallet().then((w) => setWallet(w.total)).catch(() => {})
    fetchMe().then(({ addresses }) => {
      setAddrs(addresses)
      // Just added one from here → that's the one they want.
      const pick = (saved?.added ? [...addresses].sort((a, b) => b.id - a.id)[0] : null) || addresses.find((a) => a.is_default) || addresses[0] || null
      setAddr(pick)
    }).catch(() => setAddrs([]))
  }, [])

  // Keep the app's pricing location on the address being booked for (zone prices, hours, experts).
  useEffect(() => {
    if (addr?.pincode && addr.pincode !== pincode) setServiceLocation(addr.pincode, addr.lat, addr.lng)
  }, [addr?.id])

  const dateStr = fmtDate(date)
  useEffect(() => {
    if (mode !== 'schedule' || !names) return
    setSlotData(null)
    fetchSlots(dateStr, pincode || '', names).then((r) => setSlotData(r.slots)).catch(() => setSlotData([]))
  }, [dateStr, pincode, names, mode])

  // Experts offering this service near the chosen address — saved favourites come first.
  useEffect(() => {
    if (cartMode || !s) return
    fetchServiceWorkers(s.name, addr?.lat, addr?.lng)
      .then((w) => setWorkers([...(w as SvcWorker[])].sort((a, b) => Number(!!b.favourite) - Number(!!a.favourite))))
      .catch(() => setWorkers([]))
  }, [s, addr?.id])

  const itemsKey = JSON.stringify(items)
  useEffect(() => {
    if (!items.length) return
    // Instant is priced at the server's current time ('now'), never the phone clock.
    const at = mode === 'now' ? 'now' : slot !== null ? minAt(slot) : undefined
    fetchQuote(items, coupon || undefined, pincode || undefined, at).then(setQuote).catch(() => {})
  }, [itemsKey, coupon, slot, mode, pincode])

  // The server marks today's already-started slots `past` (India time) — no phone-clock maths here.
  const slots = useMemo(() => (slotData || [])
    .filter((x) => !x.past)
    .map((x) => ({ h: x.min ?? x.hour * 60, label: x.time, disabled: !x.available })), [slotData])
  const grouped = useMemo(() => groupSlots(slots), [slots])
  // Open on the first part of the day that still has a free slot.
  useEffect(() => {
    // Keep the selected slot's part of day in view (e.g. the cart's existing visit).
    if (slot !== null) { const own = (['Morning', 'Afternoon', 'Evening'] as Part[]).find((k) => grouped[k].some((x) => x.h === slot)); if (own) { setPart(own); return } }
    if (part && grouped[part].some((x) => !x.disabled)) return
    const first = (['Morning', 'Afternoon', 'Evening'] as Part[]).find((k) => grouped[k].some((x) => !x.disabled))
    setPart(first || 'Morning')
  }, [grouped])

  // Is Instant possible right now? Asked of the server (India time + zone hours), not the phone.
  const [instantInfo, setInstantInfo] = useState<InstantStatus | null>(null)
  useEffect(() => { fetchInstantStatus(pincode || undefined).then(setInstantInfo).catch(() => {}) }, [pincode])
  const openNow = instantInfo?.open ?? true
  // Why Instant isn't possible — the server says which: outside working hours, or nobody free.
  const busyText = instantInfo?.reason === 'closed'
    ? t('Instant service is available {hours}. Please schedule this booking for later.', { hours: instantInfo.hours || t('during working hours') })
    : t('All our partners are busy right now. Please schedule this booking for later.')
  const hoursLabel = todayHoursLabel(zoneHours)
  const orderTotal = quote?.total ?? (cartMode ? cart.reduce((n, c) => n + c.price, 0) : dur?.price ?? 0)
  const walletUsed = useWallet ? Math.min(wallet, orderTotal) : 0
  const payable = Math.max(0, orderTotal - walletUsed)
  const hasExperts = !cartMode && (workers?.length || 0) > 0
  // Nothing chosen yet and the zone is open → Now, so an instant booking never needs the When screen.
  useEffect(() => { if (mode === null && openNow) setMode('now') }, [openNow])

  // ---------- empty / loading states ----------
  const top = (title: string, onBack: () => void) => (
    <div className="ps-top">
      <button className="au-back" onClick={onBack} aria-label={t('Back')}><ArrowLeft size={20} /></button>
      <b>{title}</b><span style={{ width: 42 }} />
    </div>
  )
  if (cartMode && cart.length === 0) {
    return (
      <div className="screen m2">
        {top(t('My Cart'), () => nav('/home', { replace: true }))}
        <div className="state"><div className="ico">🛒</div><h3>{t('Your cart is empty')}</h3><p>{t('Browse services and add them to your booking.')}</p>
          <button className="btn" style={{ maxWidth: 220 }} onClick={() => nav('/home', { replace: true })}>{t('Browse services')}</button></div>
      </div>
    )
  }
  if (loadErr) {
    return (
      <div className="screen m2">
        {top(t('Book a service'), () => nav(-1))}
        <div className="state"><div className="ico">⚠️</div><h3>{t('Could not load service')}</h3><p>{t('Please check your connection and try again.')}</p>
          <button className="btn" style={{ maxWidth: 220 }} onClick={() => nav('/home', { replace: true })}>{t('Browse services')}</button></div>
      </div>
    )
  }
  if (!cartMode && (!s || !dur)) return <div className="screen m2">{top(t('Book a service'), () => nav(-1))}<Loading /></div>

  // Detours (when / address / expert) always return to the main screen.
  const back = () => { if (step === 'summary') nav(-1); else setStep('summary') }
  const done = () => setStep('summary')

  const instant = mode === 'now' && openNow
  const slotWhen = (m: number) => ({ mode: 'schedule' as const, date: date.toISOString(), min: m, time: serverTime(m), label: `${date.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' })}, ${niceTime(m)}`, freq })
  function continueWhen() {
    // Pronto-style: the service goes into the cart (with its slot, or Instant); My Cart is checkout.
    if (!cartMode && s && dur) {
      if (!instant && slot === null) return toast(t('Pick a time slot'))
      addToCart({ id: s.id, name: s.name, icon: s.icon || '', category: s.category || '', durationId: dur.id, durationLabel: dur.label, price: dur.price, listPrice: dur.original })
      setCartWhen(instant ? { mode: 'now', date: '', min: 0, time: '', label: '', freq: 'one-time' } : slotWhen(slot!))
      return nav('/booking/cart')
    }
    if (instant) { setCartWhen({ mode: 'now', date: '', min: 0, time: '', label: '', freq: 'one-time' }); return done() }
    if (slot === null) return toast(t('Pick a time slot'))
    setMode('schedule'); setCartWhen(slotWhen(slot))
    done()
  }
  // My Cart tabs: Instant / Scheduled / Recurring.
  function pickTab(tab: 'now' | 'schedule' | 'recurring') {
    if (tab === 'now') {
      if (!openNow) return toast(busyText)
      setMode('now'); setFreq('one-time'); setCartWhen({ mode: 'now', date: '', min: 0, time: '', label: '', freq: 'one-time' }); return
    }
    setMode('schedule')
    setFreq(tab === 'recurring' ? (freq === 'one-time' ? 'weekly' : freq) : 'one-time')
    if (slot === null) setStep('when')
  }
  // − / + on a cart item: previous / next duration from that service's menu.
  function stepDuration(c: CartItem, dir: -1 | 1) {
    const list = itemDurs[c.id] || []
    const i = list.findIndex((d) => d.id === c.durationId)
    // − on the shortest duration removes the service (the button shows a bin there).
    if (dir === -1 && i <= 0) { removeFromCart(c.id); toast(t('{name} removed from cart', { name: t(c.name) })); return }
    const nd = list[i + dir]
    if (!nd) return
    addToCart({ ...c, durationId: nd.id, durationLabel: nd.label, price: nd.price, listPrice: nd.original })
  }

  function continueAddress() {
    if (!addr) return toast(t('Add an address to continue'))
    done()
  }
  function addAddress() {
    try {
      const v: Saved = { key: flowKey, durId: dur?.id, mode, date: date.toISOString(), slot, freq, worker, note, added: true }
      sessionStorage.setItem(RESUME_KEY, JSON.stringify(v))
    } catch { /* private mode — they'll just start the flow again */ }
    setAddrSheet(false)
    nav('/addresses/add', { state: { back: true, makeDefault: true } })
  }

  async function applyCoupon(cc?: string) {
    const c = (cc || code).trim().toUpperCase()
    if (!c) return
    try {
      const r = await validateCoupon(c, quote?.subtotal ?? orderTotal)
      setCoupon(r.code); setCode(''); setShowCoupons(false)
      toast(t('{code} applied · ₹{amt} off', { code: r.code, amt: r.discount }))
    } catch (e) { toast((e as Error).message) }
  }

  const whenText = !mode ? t('Choose a time') : mode === 'now'
    ? t('Now (ASAP)')
    : slot === null ? t('Pick a time slot') : `${date.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' })}${slot !== null ? `, ${niceTime(slot)}` : ''}`
  const chosenWorker = workers?.find((w) => String(w.id) === worker)

  async function place(method: string, txnId?: string) {
    if (placing) return
    setPlacing(true)
    const cash = method === 'cash'
    try { localStorage.setItem('hh_last_pay', cash ? 'cash' : 'online') } catch { /* private mode */ }
    try {
      const b = await createBookingApi({
        items,
        type: mode === 'now' ? 'instant' : 'schedule',
        ...(mode === 'now' ? {} : { date: dateStr, time: slot !== null ? serverTime(slot) : '', at: slot !== null ? minAt(slot) : undefined }),
        payment: !cash && payable === 0 ? 'wallet' : method,
        coupon: coupon || undefined,
        note: note.trim() || undefined,
        ...(addr ? { addressId: addr.id, pincode: addr.pincode || pincode || undefined, lat: addr.lat, lng: addr.lng } : { pincode: pincode || undefined }),
        ...(worker !== 'any' ? { workerId: Number(worker) } : {}),
        ...(txnId ? { paymentId: txnId } : {}),
        // The wallet slice the customer chose; the server debits it and expects the rest paid online.
        ...(!cash && payable > 0 && walletUsed > 0 ? { walletAmount: walletUsed } : {}),
      })
      // Repeat visits: this booking is the first; the plan books each next one a day ahead, paid by
      // wallet if this one was, else cash (nobody is there to finish an online checkout each time).
      if (mode === 'schedule' && freq !== 'one-time') {
        try {
          await createRecurring({
            items, startDate: dateStr, time: slot !== null ? serverTime(slot) : '', freq,
            payment: !cash && (payable === 0 || method === 'wallet') ? 'wallet' : 'cash',
            addressId: addr?.id, pincode: addr?.pincode || pincode || undefined, lat: addr?.lat, lng: addr?.lng,
            ...(worker !== 'any' ? { workerId: Number(worker) } : {}),
          })
          toast(t('Repeat visits set up — manage them in Profile → Repeat bookings'))
        } catch (e) { toast(t('Booked, but repeat visits could not be set up: {msg}', { msg: (e as Error).message })) }
      }
      if (cartMode) { clearCart(); setActivePackage(null); setCartWhen(null) }
      nav(`/confirmed/${b.id}`, { replace: true })
    } catch (e) { toast((e as Error).message); setPlacing(false); setSheet(false) }
  }
  const pay = () => {
    // Anything the defaults couldn't fill is asked for now, then Pay again from the main screen.
    if (!mode || (mode === 'now' && !openNow)) { toast(t('Choose when you need the service')); return setStep('when') }
    if (mode === 'schedule' && slot === null) { toast(t('Pick a time slot')); return setStep('when') }
    if (!addr) { toast(t('Add an address to continue')); return setStep('address') }
    if (payable === 0) place('wallet')
    else if (payPref === 'cash') place('cash')
    else { setAutoPay(true); setSheet(true) }
  }
  const changePayment = () => { setAutoPay(false); setSheet(true) }

  // ---------- shared bits ----------
  const cartItems: CartItem[] = cartMode ? cart : []
  const itemCards = cartMode ? (
    <div className="bf-svc" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      {cartItems.map((c) => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div><b>{t(c.name)}</b><small style={{ display: 'block' }}>{tDur(c.durationLabel || '')}</small></div><b>₹{c.price}</b>
        </div>
      ))}
    </div>
  ) : (
    <div className="bf-svc">
      <span className="bf-svc-img"><img src={s!.image || `/services/${s!.id}.jpg`} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /></span>
      <div><b>{t(s!.name)}</b><small>{tDur(dur!.label)} · ₹{dur!.price}</small></div>
    </div>
  )

  return (
    <div className="screen m2">
      <div className="ps-top bf-top">
        <button className="au-back" onClick={back} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <b>{step === 'summary' ? (cartMode ? t('My Cart') : t('Review & pay')) : step === 'when' && instant ? t('Get instant service') : t(TITLES[step])}</b><span style={{ width: 42 }} />
      </div>

      {/* 2 · When - Pronto-style: day chips, duration, part of day, slot grid. */}
      {step === 'when' && (<>
        {!instant && <div className="bf-daybar">
          {nextDays().map(({ d, label }) => (
            <button key={d.toISOString()} className={`bf-day ${fmtDate(d) === dateStr ? 'on' : ''}`} onClick={() => { setDate(d); setSlot(null) }}>{label}</button>
          ))}
        </div>}
        <div className="content bf-sched">
          {/* One note at most: Pronto's "busy" note wins; otherwise the cart's shared-visit note. */}
          {!instant && heldWhen && openNow && (
            <div className="bf-busy"><Info size={20} /><span>{t('Your cart is booked for {when}. This service is added to the same visit — changing the slot moves the whole visit.', { when: heldWhen.label })}</span></div>
          )}
          {!instant && !openNow && (
            <div className="bf-busy"><Info size={20} /><span>{busyText}</span></div>
          )}
          <div className="bf-card">
            {!cartMode && s && dur && (<>
              <div className="bf-card-h">{t('Service duration')}</div>
              <div className="bf-chiprow">
                {s.durations.map((d) => (
                  <button key={d.id} className={`bf-durchip ${dur.id === d.id ? 'on' : ''}`} onClick={() => setDur(d)}>
                    <b>{hrLabel(d.label)}</b>
                    <span>₹{d.price}{d.original && d.original > d.price ? <s>₹{d.original}</s> : null}</span>
                  </button>
                ))}
              </div>
            </>)}
            {/* From My Cart (Change slot / Scheduled tab): same duration row, for each cart item, so
                this screen looks the same whichever way it was opened. */}
            {cartMode && cart.map((c) => (itemDurs[c.id] || []).length > 0 && (
              <div key={c.id}>
                <div className="bf-card-h">{cart.length > 1 ? `${t(c.name)} · ` : ''}{t('Service duration')}</div>
                <div className="bf-chiprow">
                  {itemDurs[c.id].map((d) => (
                    <button key={d.id} className={`bf-durchip ${c.durationId === d.id ? 'on' : ''}`}
                      onClick={() => addToCart({ ...c, durationId: d.id, durationLabel: d.label, price: d.price, listPrice: d.original })}>
                      <b>{hrLabel(d.label)}</b>
                      <span>₹{d.price}{d.original && d.original > d.price ? <s>₹{d.original}</s> : null}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!instant && (<>
            <div className="bf-card-h" style={{ marginTop: cartMode && !cart.some((c) => (itemDurs[c.id] || []).length) ? 4 : 18 }}>{t('Service start time')}</div>
            <div className="bf-parts">
              {(['Morning', 'Afternoon', 'Evening'] as Part[]).map((k) => {
                const Ic = PART_ICON[k]
                const none = slotData != null && !grouped[k].some((x) => !x.disabled)
                return (
                  <button key={k} className={`bf-part ${part === k ? 'on' : ''}${none ? ' dim' : ''}`} onClick={() => setPart(k)}>
                    <Ic size={16} /> {t(k)}
                  </button>
                )
              })}
            </div>
            <div className="bf-slotbox">
              <div className="bf-slotbox-h">{t('Standard slots')} <span className="bf-slotbox-go"><ArrowRight size={13} /></span></div>
              {slotData == null ? <div className="ad2-hint">{t('Loading slots…')}</div>
                : !part || grouped[part].length === 0 ? <div className="ad2-hint">{t('No slots at this time of day - try another time or date.')}</div>
                  : (
                    <div className="bf-slotgrid">
                      {grouped[part].map((x) => (
                        <button key={x.h} className={`bf-slot ${slot === x.h ? 'on' : ''}`} disabled={x.disabled} onClick={() => {
                          setSlot(x.h); setMode('schedule')
                          // From My Cart the service is already added — picking a time applies it and goes back.
                          if (cartMode) { setCartWhen(slotWhen(x.h)); done() }
                        }}>{niceTime(x.h)}</button>
                      ))}
                    </div>
                  )}
            </div>
            </>)}
          </div>

          {!instant && <div className="bf-note"><small>{t('NOTE')}</small><p>{t('Professionals arrive within 30 minutes of the selected slot.')}</p></div>}
        </div>
        {!cartMode && <div className="au-foot"><button className="au-btn" onClick={continueWhen} disabled={!instant && slot === null}>{instant ? t('Continue · ₹{amt}', { amt: orderTotal }) : t('Add to cart')}</button></div>}
      </>)}

      {/* 3 · Address */}
      {step === 'address' && (<>
        <div className="content">
          <div className="bf-lbl">{t('The expert will come to')}</div>
          {addrs == null ? <Loading /> : addr ? (
            <div className="bf-worker on" style={{ cursor: 'default' }}>
              <span className="bf-wava"><MapPin size={18} /></span>
              <div className="grow"><b>{t(addr.label)}</b><small style={{ whiteSpace: 'normal' }}>{addr.house && !(addr.line || '').includes(addr.house) ? `${addr.house}, ${addr.line}` : addr.line}{addr.pincode && !(addr.line || '').includes(addr.pincode) ? `, ${addr.pincode}` : ''}</small></div>
              <button className="au-link" onClick={() => setAddrSheet(true)}>{t('Change')}</button>
            </div>
          ) : (
            <div className="state"><div className="ico">📍</div><h3>{t('No saved address')}</h3><p>{t('Add the address where you need the service.')}</p></div>
          )}
          <button className="au-link" style={{ marginTop: 12 }} onClick={addAddress}>+ {t('Add new address')}</button>
        </div>
        <div className="au-foot"><button className="au-btn" onClick={continueAddress} disabled={!addr}>{t('Continue')}</button></div>
      </>)}

      {/* 4 · Expert (optional) */}
      {step === 'expert' && (<>
        <div className="content">
          <p className="ad2-hint">{t('Optional — pick an expert you like, or let us assign the best available one.')}</p>
          <button className={`bf-worker any ${worker === 'any' ? 'on' : ''}`} onClick={() => setWorker('any')}>
            <span className="bf-wava any">✦</span>
            <div className="grow"><b>{t('Any available expert')}</b><small>{t("We'll assign the best available partner")}</small></div>
            <span className={`sf-radio ${worker === 'any' ? 'on' : ''}`}>{worker === 'any' && <Check size={13} />}</span>
          </button>
          {(workers || []).some((w) => w.favourite) && <div className="bf-lbl">{t('Your favourites')}</div>}
          {(workers || []).filter((w) => w.favourite).map((w) => <WorkerRow key={w.id} w={w} sel={worker} onPick={setWorker} />)}
          {(workers || []).some((w) => !w.favourite) && <div className="bf-lbl">{t('Experts near you')}</div>}
          {(workers || []).filter((w) => !w.favourite).map((w) => <WorkerRow key={w.id} w={w} sel={worker} onPick={setWorker} />)}
        </div>
        <div className="au-foot"><button className="au-btn" onClick={done}>{t('Continue')}</button></div>
      </>)}

      {/* My Cart (Pronto layout): booking type tabs, items with a duration stepper, coupons,
          booking details, bill details, Pay now. Everything priced by the server quote. */}
      {step === 'summary' && cartMode && (<>
        <div className="content mc">
          <div className="mc-tabs">
            {([['now', t('Instant')], ['schedule', t('Scheduled')], ['recurring', t('Recurring')]] as const).map(([k, label]) => {
              const on = k === 'now' ? mode === 'now' : k === 'recurring' ? mode === 'schedule' && freq !== 'one-time' : mode === 'schedule' && freq === 'one-time'
              return <button key={k} className={`mc-tab${on ? ' on' : ''}`} onClick={() => pickTab(k)}>{label}</button>
            })}
          </div>
          {mode === 'schedule' && freq !== 'one-time' && (
            <div className="mc-freq">
              {FREQ.filter((f) => f.id !== 'one-time').map((f) => (
                <button key={f.id} className={`mc-fchip${freq === f.id ? ' on' : ''}`} onClick={() => setFreq(f.id)}>{t(f.label)}</button>
              ))}
            </div>
          )}

          <div className="mc-h"><b>{t('Review booking')}</b><span>{cart.length === 1 ? t('1 service') : t('{n} services', { n: cart.length })}</span></div>
          <div className="mc-card">
            {cart.map((c) => {
              const list = itemDurs[c.id] || []
              const i = list.findIndex((d) => d.id === c.durationId)
              const mins = list[i]?.minutes ?? (parseInt(c.durationLabel, 10) || 0)
              return (
                <div key={c.id} className="mc-item">
                  <img className="mc-thumb" src={`/services/${c.id}.jpg`} alt="" onError={(e) => { const im = e.currentTarget as HTMLImageElement; if (!im.src.endsWith('/expert.jpg')) im.src = '/expert.jpg' }} />
                  <div className="mc-iname">{t(c.name)}</div>
                  <div className="mc-iprice">{c.listPrice && c.listPrice > c.price ? <s>₹{c.listPrice}</s> : null}<b>₹{c.price}</b></div>
                  <div className="mc-step">
                    <button onClick={() => stepDuration(c, -1)} aria-label={i <= 0 ? t('Remove') : t('Less time')}>{i <= 0 ? <Trash2 size={16} /> : <Minus size={16} />}</button>
                    <b>{mins}</b>
                    <button onClick={() => stepDuration(c, 1)} disabled={i < 0 || i >= list.length - 1} aria-label={t('More time')}><Plus size={16} /></button>
                    <small>{t('Minutes')}</small>
                  </div>
                </div>
              )
            })}
            <div className="mc-info"><Info size={16} /><span>{t('Slots may vary based on partner availability and the selected service.')}</span></div>
            <div className="mc-more">{t('Missed something?')} <button onClick={() => nav('/home')}>{t('Add more services.')}</button></div>
          </div>

          {promoCodes && (<>
            <button className="mc-card mc-row" onClick={() => setShowCoupons((v) => !v)}>
              <b>{coupon ? t('Coupon {code} applied', { code: coupon }) : t('View all coupons')}</b>{showCoupons ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </button>
            {showCoupons && (
              <div className="mc-card mc-coupons">
                {coupon && <div className="bf-coupon on"><Tag size={16} /><div className="grow"><b>{coupon}</b><small>{(quote?.discount || 0) > 0 ? t('You save ₹{amt}', { amt: quote!.discount }) : t('Applied')}</small></div><button className="au-link" onClick={() => setCoupon('')} aria-label={t('Remove coupon')}><X size={16} /></button></div>}
                <div className="bf-coupon-in"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('Enter coupon code')} /><button onClick={() => applyCoupon()}>{t('Apply')}</button></div>
                {coupons.map((c) => (
                  <div key={c.code} className="bf-coupon">
                    <div className="grow"><b>{c.code}</b><small>{c.label}</small>{c.min ? <small className="bf-cmin">{t('Min order ₹{amt}', { amt: c.min })}</small> : null}</div>
                    <button className="au-link" onClick={() => applyCoupon(c.code)}>{t('Apply')}</button>
                  </div>
                ))}
              </div>
            )}
          </>)}

          <div className="mc-h"><b>{t('Booking details')}</b></div>
          <div className="mc-card mc-details">
            <div className="mc-drow">
              <CalendarDays size={22} />
              <div className="grow">
                <span>{mode === 'now' ? t('Instant') : freq !== 'one-time' ? t('Repeats {f}, starting', { f: t(FREQ.find((f) => f.id === freq)!.label).toLowerCase() }) : t('Scheduled for')}</span>
                <b>{mode === 'now' ? t('Expert arrives as soon as possible') : slot === null ? t('Pick a time slot') : whenText}</b>
                {mode === 'schedule' && <button className="mc-link" onClick={() => setStep('when')}>{t('Change slot')}</button>}
              </div>
            </div>
            <button className="mc-drow" onClick={() => setAddrSheet(true)}>
              <MapPin size={22} />
              <div className="grow"><span>{t('Location')}</span><small className="mc-addr">{fullAddress(addr) || t('Add address')}</small></div>
              <ChevronRight size={20} />
            </button>
            <button className="mc-drow" onClick={() => nav('/profile')}>
              <Phone size={22} />
              <div className="grow"><span>{user?.name || t('You')}</span><small>{user?.phone ? `+91 ${user.phone}` : ''}</small></div>
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="mc-h"><b>{t('Bill details')}</b></div>
          <div className="mc-card mc-bill">
            <button className="mc-bill-top" onClick={() => setBillOpen((v) => !v)}>
              <div className="grow">
                <b>{t('To pay ₹{amt}', { amt: payable })}</b>
                {(() => { const saved = cart.reduce((n, c) => n + Math.max(0, (c.listPrice || c.price) - c.price), 0) + (quote?.discount || 0) + (quote?.memberDiscount || 0); return saved > 0 ? <small>{t('₹{amt} saved on the total!', { amt: saved })}</small> : null })()}
              </div>
              {billOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            {billOpen && (!quote ? <div className="ad2-hint">{t('Calculating price…')}</div> : (<>
              <div className="mc-brow"><span>{t('Item total')}</span><b>₹{quote.subtotal}</b></div>
              {(quote.discount || 0) > 0 && <div className="mc-brow disc"><span>{t('Discount')}{quote.coupon ? ` (${quote.coupon})` : ''}</span><b>−₹{quote.discount}</b></div>}
              {(quote.memberDiscount || 0) > 0 && <div className="mc-brow disc"><span>{t('Membership benefit')}</span><b>−₹{quote.memberDiscount}</b></div>}
              {(quote.peakSurcharge || 0) > 0 && <div className="mc-brow"><span>{t('Peak-hour surcharge')}</span><b>+₹{quote.peakSurcharge}</b></div>}
              {(quote.surgeAmount || 0) > 0 && <div className="mc-brow"><span>{t('Demand surge')}</span><b>+₹{quote.surgeAmount}</b></div>}
              <div className="mc-brow"><span>{t('GST & Service Fees')} <button className="mc-i" onClick={() => toast(t('GST ₹{g} · Platform fee ₹{f}', { g: quote.tax || 0, f: quote.fee || 0 }))} aria-label={t('Fee breakdown')}><Info size={14} /></button></span><b>₹{(quote.gstIncluded ? 0 : (quote.tax || 0)) + (quote.fee || 0)}</b></div>
              <div className="mc-brow total"><span>{t('To pay')}</span><b>₹{payable}</b></div>
            </>))}
          </div>
        </div>
        <div className="au-foot"><button className="au-btn mc-pay" onClick={pay} disabled={placing || !quote}>{placing ? t('Please wait…') : t('Pay now | ₹{amt}', { amt: payable })}</button></div>
      </>)}

      {/* 5 · Summary + pay */}
      {step === 'summary' && !cartMode && (<>
        <div className="content">
          {itemCards}
          {!cartMode && <button className="au-link" style={{ marginTop: 6 }} onClick={() => setStep('when')}>{t('Change duration')}</button>}
          <div className="bf-div" />
          <div className="bf-sumrow"><span>{t('When')}</span><b>{whenText} <button className="au-link" onClick={() => setStep('when')}>{t('Change')}</button></b></div>
          {mode === 'schedule' && (<>
            <div className="bf-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Repeat size={14} /> {t('Repeat this visit')}</div>
            <div className="ord-chips" style={{ flexWrap: 'wrap' }}>
              {FREQ.map((f) => (
                <button key={f.id} className={`ord-chip ${freq === f.id ? 'active' : ''}`} onClick={() => setFreq(f.id)}>{t(f.label)}</button>
              ))}
            </div>
            {freq !== 'one-time' && <p className="ad2-hint">{t('Repeat visits are booked automatically and paid by wallet or cash. Manage them in Profile → Repeat bookings.')}</p>}
          </>)}
          <div className="bf-sumrow"><span>{t('Address')}</span><b className="bf-addr"><span className="bf-addr-t">{shortAddress(addr) || t('Add address')}</span> <button className="au-link" onClick={() => setStep('address')}>{t('Change')}</button></b></div>
          {hasExperts && <div className="bf-sumrow"><span>{t('Expert')}</span><b>{chosenWorker ? chosenWorker.name : t('Any available')} <button className="au-link" onClick={() => setStep('expert')}>{t('Change')}</button></b></div>}

          <div className="bf-lbl">{t('Instructions for the expert (optional)')}</div>
          <textarea className="sf-ta" rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. Please focus more on kitchen and bathroom.')} />

          <div className="bf-div" />
          {/* coupon */}
          {!promoCodes ? null : coupon ? (
            <div className="bf-coupon on">
              <Tag size={16} />
              <div className="grow"><b>{coupon}</b><small>{(quote?.discount || 0) > 0 ? t('You save ₹{amt}', { amt: quote!.discount }) : t('Applied')}</small></div>
              <button className="au-link" onClick={() => setCoupon('')} aria-label={t('Remove coupon')}><X size={16} /></button>
            </div>
          ) : (<>
            <div className="bf-coupon-in"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('Enter coupon code')} /><button onClick={() => applyCoupon()}>{t('Apply')}</button></div>
            {coupons.length > 0 && <button className="au-link" onClick={() => setShowCoupons((v) => !v)}>{showCoupons ? t('Hide offers') : t('View available offers')}</button>}
            {showCoupons && coupons.map((c) => (
              <div key={c.code} className="bf-coupon">
                <div className="grow"><b>{c.code}</b><small>{c.label}</small>{c.min ? <small className="bf-cmin">{t('Min order ₹{amt}', { amt: c.min })}</small> : null}</div>
                <button className="au-link" onClick={() => applyCoupon(c.code)}>{t('Apply')}</button>
              </div>
            ))}
          </>)}

          <div className="bf-div" />
          {(quote?.surgeAmount || 0) > 0 && (
            <div className="note-box" style={{ background: '#eef4ff', borderColor: '#bcd0ff', color: '#1d4ed8', marginBottom: 10 }}>
              {quote?.surgeReason === 'rain'
                ? t('🌧️ Rain incoming — demand is high, so prices are up {p}% right now.', { p: quote?.surgePct ?? 0 })
                : t('⚡ High demand right now — prices are up {p}%.', { p: quote?.surgePct ?? 0 })}
            </div>
          )}
          <div className="bf-lbl">{t('Price Details')}</div>
          {!quote ? <div className="ad2-hint">{t('Calculating price…')}</div> : (<>
            <div className="bf-sumrow sm"><span>{t('Service Charges')}</span><b>₹{quote.subtotal}</b></div>
            {(quote.discount || 0) > 0 && <div className="bf-sumrow sm disc"><span>{t('Discount')}{quote.coupon ? ` (${quote.coupon})` : ''}</span><b>−₹{quote.discount}</b></div>}
            {(quote.memberDiscount || 0) > 0 && <div className="bf-sumrow sm disc"><span>{t('Membership benefit')}</span><b>−₹{quote.memberDiscount}</b></div>}
            {(quote.peakSurcharge || 0) > 0 && <div className="bf-sumrow sm"><span>{t('Peak-hour surcharge')}{quote.peakPct ? ` (+${quote.peakPct}%)` : ''}</span><b>+₹{quote.peakSurcharge}</b></div>}
            {(quote.surgeAmount || 0) > 0 && <div className="bf-sumrow sm"><span>{quote.surgeReason === 'rain' ? t('🌧️ Rain surge') : t('Demand surge')}{quote.surgePct ? ` (+${quote.surgePct}%)` : ''}</span><b>+₹{quote.surgeAmount}</b></div>}
            {(quote.fee || 0) > 0 && <div className="bf-sumrow sm"><span>{t('Platform Fee')}</span><b>₹{quote.fee}</b></div>}
            {(quote.tax || 0) > 0 && <div className="bf-sumrow sm"><span>{quote.gstIncluded ? t('Incl. GST') : 'GST'}{quote.gstPct ? ` (${quote.gstPct}%)` : ''}</span><b>₹{quote.tax}</b></div>}
            <div className="bf-sumrow total"><span>{t('Total Amount')}</span><b>₹{orderTotal}</b></div>
          </>)}

          {wallet > 0 && (<>
            <div className="bf-div" />
            <div className="bf-wtoggle">
              <span className="bf-wic"><WalletIcon size={18} /></span>
              <span className="grow">{t('Use wallet balance')} <small className="muted">(₹{wallet})</small></span>
              <button className={`sf-switch ${useWallet ? 'on' : ''}`} onClick={() => setUseWallet((u) => !u)} aria-label={t('Use wallet balance')} aria-pressed={useWallet}><span /></button>
            </div>
            {walletUsed > 0 && <div className="bf-sumrow sm disc"><span>{t('Wallet')}</span><b>−₹{walletUsed}</b></div>}
          </>)}
          <div className="bf-sumrow total"><span>{t('To pay')}</span><b>₹{payable}</b></div>
        </div>
        <div className="au-foot" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {payable > 0 && (
            <button className="bf-payusing" onClick={changePayment}>
              <small>{t('Pay using')}</small>
              <b>{payPref === 'cash' ? t('Cash after service') : t('UPI / Card')} ▴</b>
            </button>
          )}
          <button className="au-btn" style={{ flex: 1 }} onClick={pay} disabled={placing || !quote}>
            {placing ? t('Please wait…') : payable === 0 ? t('Confirm booking') : t('Pay ₹{amt}', { amt: payable })}
          </button>
        </div>
      </>)}

      <AddressSheet open={addrSheet} onClose={() => setAddrSheet(false)} onSelect={(a) => setAddr(a)} onAdd={addAddress} />
      <PaymentSheet open={sheet} amount={payable} autoStart={autoPay} onClose={() => { setSheet(false); setAutoPay(false) }}
        onPaid={(m, txn) => { setSheet(false); setAutoPay(false); setPayPref(m === 'cash' ? 'cash' : 'online'); place(m, txn) }} />
    </div>
  )
}

function WorkerRow({ w, sel, onPick }: { w: SvcWorker; sel: string; onPick: (id: string) => void }) {
  const id = String(w.id)
  return (
    <button className={`bf-worker ${sel === id ? 'on' : ''}`} onClick={() => onPick(id)}>
      <span className="bf-wava">{w.name[0]?.toUpperCase()}</span>
      <div className="grow">
        <b>{w.name}{w.favourite && <Heart size={12} fill="currentColor" style={{ marginLeft: 5, color: '#e11d48', verticalAlign: -1 }} aria-label={t('Favourite')} />}</b>
        <small><Star size={11} className="bf-star" /> {w.rating} {t('({n} jobs)', { n: w.jobs })}{w.km != null ? ` · ${t('{km} km away', { km: w.km })}` : ''}</small>
      </div>
      <span className={`sf-radio ${sel === id ? 'on' : ''}`}>{sel === id && <Check size={13} />}</span>
    </button>
  )
}
