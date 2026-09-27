import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Star, Check, Wallet as WalletIcon, Zap, CalendarDays, MapPin, Repeat, Heart, Tag, X } from 'lucide-react'
import { Loading, useToast } from '../components/UI'
import PaymentSheet from '../components/PaymentSheet'
import AddressSheet from '../components/AddressSheet'
import Calendar, { startOfDay, fmtDate, slotLabel, isSlotDisabled, isZoneOpenNow, todayHoursLabel } from '../components/Calendar'
import { useStore } from '../store'
import {
  fetchService, fetchQuote, fetchSlots, fetchCoupons, validateCoupon, fetchWallet, fetchMe, createBookingApi,
  fetchServiceWorkers, createRecurring, setActivePackage, type SlotInfo,
} from '../api'
import type { ServiceDetail, Duration, Quote, Coupon, Address, CartItem } from '../types'
import { t, tDur, dateLocale } from '../i18n'
import { useAppConfig } from '../appConfig'

/*
 * THE booking flow. Every way into a booking ends up here:
 *   /booking/:serviceId   one service (from Service details, Rebook, recommendations, old /book + /configure links)
 *   /booking/cart         the services in the cart (a package from Home)
 *
 *   duration → when (now, or a date + slot, optionally repeating) → address (shown, changeable)
 *   → expert (favourites first; only when experts are listed for this service) → summary (price
 *   breakdown, coupon, wallet, note) → PaymentSheet → /confirmed/:id → /job/:id.
 *
 * All prices come from the server quote; the booking itself is priced again server-side.
 */
type Step = 'duration' | 'when' | 'address' | 'expert' | 'summary'
const TITLES: Record<Step, string> = {
  duration: 'Choose duration', when: 'When do you need it?', address: 'Service address', expert: 'Choose your expert', summary: 'Review & pay',
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

function groupSlots(slots: { h: number; label: string; disabled: boolean }[]) {
  const g = { Morning: [] as typeof slots, Afternoon: [] as typeof slots, Evening: [] as typeof slots, Night: [] as typeof slots }
  for (const s of slots) {
    if (s.h < 12) g.Morning.push(s); else if (s.h < 16) g.Afternoon.push(s); else if (s.h < 20) g.Evening.push(s); else g.Night.push(s)
  }
  return g
}
const nowAt = () => { const n = new Date(); return `${n.getHours()}:${String(n.getMinutes()).padStart(2, '0')}` }

// Leaving the flow to add a new address unmounts it; these few choices are restored on the way back.
const RESUME_KEY = 'hh_flow_resume'
interface Saved { key: string; durId?: string; mode: 'now' | 'schedule' | null; date: string; slot: number | null; freq: string; worker: string; note: string; added?: boolean }

export default function BookingFlow() {
  const { id } = useParams()
  const nav = useNavigate()
  const { promoCodes } = useAppConfig()
  const toast = useToast()
  const { pincode, zoneHours, cart, clearCart, setServiceLocation } = useStore()
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
  const [mode, setMode] = useState<'now' | 'schedule' | null>(saved?.mode ?? navState?.mode ?? null)
  const [date, setDate] = useState<Date>(saved?.date ? new Date(saved.date) : startOfDay(new Date()))
  const [slot, setSlot] = useState<number | null>(saved?.slot ?? null)
  const [slotData, setSlotData] = useState<SlotInfo[] | null>(null)
  const [freq, setFreq] = useState(saved?.freq || (navState?.freq && FREQ.some((f) => f.id === navState.freq) ? navState.freq : 'one-time'))
  const [worker, setWorker] = useState(saved?.worker || 'any')
  const [workers, setWorkers] = useState<SvcWorker[] | null>(null)
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
  const [step, setStep] = useState<Step>(saved ? 'address' : cartMode ? 'when' : 'duration')
  const [sheet, setSheet] = useState(false)
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
    const at = mode === 'now' ? nowAt() : slot !== null ? `${slot}:00` : undefined
    fetchQuote(items, coupon || undefined, pincode || undefined, at).then(setQuote).catch(() => {})
  }, [itemsKey, coupon, slot, mode, pincode])

  const slots = useMemo(() => (slotData || [])
    .filter((x) => !isSlotDisabled(date, x.hour))
    .map((x) => ({ h: x.hour, label: x.time, disabled: !x.available })), [slotData, date])
  const grouped = useMemo(() => groupSlots(slots), [slots])

  const openNow = isZoneOpenNow(zoneHours)
  const hoursLabel = todayHoursLabel(zoneHours)
  const orderTotal = quote?.total ?? (cartMode ? cart.reduce((n, c) => n + c.price, 0) : dur?.price ?? 0)
  const walletUsed = useWallet ? Math.min(wallet, orderTotal) : 0
  const payable = Math.max(0, orderTotal - walletUsed)
  const hasExperts = !cartMode && (workers?.length || 0) > 0
  const steps: Step[] = [...(cartMode ? [] : ['duration' as Step]), 'when', 'address', ...(hasExperts ? ['expert' as Step] : []), 'summary']

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
        {top(t('Your Booking'), () => nav('/home', { replace: true }))}
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

  const idx = Math.max(0, steps.indexOf(step))
  const back = () => { if (idx === 0) nav(-1); else setStep(steps[idx - 1]) }
  const next = () => setStep(steps[Math.min(steps.length - 1, idx + 1)])

  function continueWhen() {
    if (!mode) return toast(t('Choose Now or Schedule'))
    if (mode === 'now' && !openNow) return toast(t('Instant slots are not available right now — please Schedule for later'))
    if (mode === 'schedule' && slot === null) return toast(t('Pick a time slot'))
    next()
  }
  function continueAddress() {
    if (!addr) return toast(t('Add an address to continue'))
    next()
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

  const whenText = mode === 'now'
    ? t('Now (ASAP)')
    : `${date.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' })}${slot !== null ? `, ${slotLabel(slot)}` : ''}`
  const chosenWorker = workers?.find((w) => String(w.id) === worker)

  async function place(method: string, txnId?: string) {
    if (placing) return
    setPlacing(true)
    const cash = method === 'cash'
    try {
      const b = await createBookingApi({
        items,
        type: mode === 'now' ? 'instant' : 'schedule',
        ...(mode === 'now' ? { at: nowAt() } : { date: dateStr, time: slot !== null ? slotLabel(slot) : '', at: slot !== null ? `${slot}:00` : undefined }),
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
            items, startDate: dateStr, time: slot !== null ? slotLabel(slot) : '', freq,
            payment: !cash && (payable === 0 || method === 'wallet') ? 'wallet' : 'cash',
            addressId: addr?.id, pincode: addr?.pincode || pincode || undefined, lat: addr?.lat, lng: addr?.lng,
            ...(worker !== 'any' ? { workerId: Number(worker) } : {}),
          })
          toast(t('Repeat visits set up — manage them in Profile → Repeat bookings'))
        } catch (e) { toast(t('Booked, but repeat visits could not be set up: {msg}', { msg: (e as Error).message })) }
      }
      if (cartMode) { clearCart(); setActivePackage(null) }
      nav(`/confirmed/${b.id}`, { replace: true })
    } catch (e) { toast((e as Error).message); setPlacing(false); setSheet(false) }
  }
  const pay = () => { if (payable === 0) place('wallet'); else setSheet(true) }

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
      <div className="ps-top">
        <button className="au-back" onClick={back} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <b>{t(TITLES[step])}</b><span style={{ width: 42 }} />
      </div>
      <div className="bf-progress" aria-label={t('Step {n} of {total}', { n: idx + 1, total: steps.length })}>
        {steps.map((st, i) => <span key={st} className={i <= idx ? 'on' : ''} />)}
      </div>

      {/* 1 · Duration */}
      {step === 'duration' && s && dur && (<>
        <div className="content">
          {itemCards}
          <p className="sf-q">{t('How many hours do you need?')}</p>
          {s.durations.map((d) => (
            <button key={d.id} className={`sf-opt ${dur.id === d.id ? 'on' : ''}`} onClick={() => setDur(d)}>
              <div className="grow"><div className="sf-opt-t">{tDur(d.label)}</div></div>
              <div className="sf-opt-p">₹{d.price}{d.original && d.original > d.price ? <s className="muted" style={{ marginLeft: 6, fontWeight: 400, fontSize: 12 }}>₹{d.original}</s> : null}</div>
              <span className={`sf-radio ${dur.id === d.id ? 'on' : ''}`}>{dur.id === d.id && <Check size={13} />}</span>
            </button>
          ))}
        </div>
        <div className="au-foot"><button className="au-btn" onClick={next}>{t('Continue')}</button></div>
      </>)}

      {/* 2 · When */}
      {step === 'when' && (<>
        <div className="content">
          {itemCards}
          <button className={`sf-opt ${mode === 'now' ? 'on' : ''}`} onClick={() => (openNow ? setMode('now') : toast(t('Instant slots are not available right now — please Schedule for later')))} aria-disabled={!openNow} style={openNow ? undefined : { opacity: 0.6 }}>
            <span className="sf-freq-ic"><Zap size={16} /></span>
            <div className="grow">
              <div className="sf-opt-t">{t('Now')}</div>
              <div className="sf-opt-s">{openNow ? t('We assign the nearest available expert right away') : `${t('Instant slots are not available right now')}${hoursLabel ? ` · ${hoursLabel}` : ''}`}</div>
            </div>
            <span className={`sf-radio ${mode === 'now' ? 'on' : ''}`}>{mode === 'now' && <Check size={13} />}</span>
          </button>
          <button className={`sf-opt ${mode === 'schedule' ? 'on' : ''}`} onClick={() => setMode('schedule')}>
            <span className="sf-freq-ic"><CalendarDays size={16} /></span>
            <div className="grow"><div className="sf-opt-t">{t('Schedule')}</div><div className="sf-opt-s">{t('Pick a date and time')}</div></div>
            <span className={`sf-radio ${mode === 'schedule' ? 'on' : ''}`}>{mode === 'schedule' && <Check size={13} />}</span>
          </button>

          {mode === 'schedule' && (<>
            <div className="bf-lbl">{t('Select Date')}</div>
            <Calendar value={date} onChange={(d) => { setDate(d); setSlot(null) }} zh={zoneHours} />
            <div className="bf-lbl">{t('Available Slots')}</div>
            {slotData == null ? <div className="ad2-hint">{t('Loading slots…')}</div>
              : slots.length === 0 ? <div className="ad2-hint">{t('No slots left on this day — please pick another date.')}</div>
                : Object.entries(grouped).map(([g, list]) => list.length === 0 ? null : (
                  <div key={g} className="bf-slotgrp">
                    <div className="bf-slot-h">{t(g)}</div>
                    <div className="bf-slots">
                      {list.map((x) => (
                        <button key={x.h} className={`bf-slot ${slot === x.h ? 'on' : ''}`} disabled={x.disabled} onClick={() => setSlot(x.h)}>{x.label}</button>
                      ))}
                    </div>
                  </div>
                ))}
            <div className="bf-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Repeat size={14} /> {t('Repeat this visit')}</div>
            <div className="ord-chips" style={{ flexWrap: 'wrap' }}>
              {FREQ.map((f) => (
                <button key={f.id} className={`ord-chip ${freq === f.id ? 'active' : ''}`} onClick={() => setFreq(f.id)}>{t(f.label)}</button>
              ))}
            </div>
            {freq !== 'one-time' && <p className="ad2-hint">{t('Repeat visits are booked automatically and paid by wallet or cash. Manage them in Profile → Repeat bookings.')}</p>}
          </>)}
        </div>
        <div className="au-foot"><button className="au-btn" onClick={continueWhen} disabled={!mode || (mode === 'schedule' && slot === null)}>{t('Continue')}</button></div>
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
        <div className="au-foot"><button className="au-btn" onClick={next}>{t('Continue')}</button></div>
      </>)}

      {/* 5 · Summary + pay */}
      {step === 'summary' && (<>
        <div className="content">
          <div className="bf-lbl">{t('Service Details')}</div>
          {itemCards}
          <div className="bf-sumrow"><span>{t('When')}</span><b>{whenText} <button className="au-link" onClick={() => setStep('when')}>{t('Change')}</button></b></div>
          {mode === 'schedule' && freq !== 'one-time' && <div className="bf-sumrow"><span>{t('Repeat')}</span><b>{t(FREQ.find((f) => f.id === freq)!.label)}</b></div>}
          <div className="bf-sumrow"><span>{t('Address')}</span><b className="bf-addr">{addr?.line || '—'} <button className="au-link" onClick={() => setStep('address')}>{t('Change')}</button></b></div>
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
        <div className="au-foot">
          <button className="au-btn" onClick={pay} disabled={placing || !quote}>
            {placing ? t('Please wait…') : payable === 0 ? t('Confirm booking') : t('Pay ₹{amt}', { amt: payable })}
          </button>
        </div>
      </>)}

      <AddressSheet open={addrSheet} onClose={() => setAddrSheet(false)} onSelect={(a) => setAddr(a)} onAdd={addAddress} />
      <PaymentSheet open={sheet} amount={payable} onClose={() => setSheet(false)} onPaid={(m, txn) => { setSheet(false); place(m, txn) }} />
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
