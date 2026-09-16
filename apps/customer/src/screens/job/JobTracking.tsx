import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Share2, MoreVertical, Check, Phone, Star, ChevronRight, MessageCircle,
  MapPin, BadgeCheck, ShieldCheck, Headset, Bike, CalendarClock, XCircle, ShieldQuestion,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { Loading, useToast } from '../../components/UI'
import { pushBackHandler } from '../../backStack'
import { useJob, useAutoAdvance, proName, proRating, serviceNames, fmtDateTime } from './useJob'
import { WorkerAvatar } from './parts'
import { isLive } from '../../orders'
import type { Booking } from '../../types'

// Module 6 · #42 — Booking Details / Worker Assigned. All real booking data (ref, service, date,
// full address, assigned worker) polled from /api/bookings/:id. Hub for the live-job screens, with
// working Share, an actions menu (Reschedule / Cancel / Policy / Help), Chat, Call and View on Map.
export default function JobTracking() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { b } = useJob(id)
  const [menu, setMenu] = useState(false)

  // The worker marking arrival takes the customer straight to the start OTP — no tapping the
  // status card. Cancel is still reachable: this fires once, so coming back here stays put.
  useAutoAdvance(b, 'arrived', (bid) => `/job/${bid}/otp`)

  // Android hardware back closes the menu instead of leaving the screen.
  useEffect(() => { if (menu) return pushBackHandler(() => setMenu(false)) }, [menu])

  if (!b) return <div className="screen jt"><Loading /></div>

  const jobs = b.pro?.jobs ?? b.pro?.servicesDone ?? 0
  const assigned = !!(b.pro?.name || (b.pro_name && b.pro_name.trim()))
  const verified = !!b.pro?.verified
  const live = isLive(b.status)
  const started = b.status === 'in_progress'   // service running now
  // Cancel is only valid BEFORE the service starts — once the worker begins, you can't cancel it.
  const cancellable = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived'].includes(b.status)
  // Tapping Call opens the device dialer with the worker's real number; falls back to the in-app
  // call screen when no number is on file yet (not assigned).
  const call = () => { const ph = b.pro?.phone; if (ph) window.location.href = `tel:${ph}`; else nav(`/job/${b.id}/call`) }
  const chat = () => nav(`/job/${b.id}/chat`)
  const go = (to: string) => { setMenu(false); nav(to) }

  async function share() {
    setMenu(false)
    if (!b) return
    const text = [
      `HomeHelp booking ${b.ref}`,
      serviceNames(b),
      fmtDateTime(b),
      fullAddress(b) ? `At: ${fullAddress(b)}` : '',
    ].filter(Boolean).join('\n')
    try {
      if (Capacitor.isNativePlatform()) await Share.share({ title: `HomeHelp ${b.ref}`, text, dialogTitle: 'Share booking' })
      else if (navigator.share) await navigator.share({ title: `HomeHelp ${b.ref}`, text })
      else { await navigator.clipboard.writeText(text); toast('Booking details copied') }
    } catch { /* user dismissed the sheet — not an error */ }
  }

  const arr = arrivalFor(b)
  const addr = addressParts(b)

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Booking Details</b>
        <div className="jt-top-r">
          <button className="jt-ic round" onClick={share} aria-label="Share booking"><Share2 size={18} /></button>
          <button className="jt-ic round" onClick={() => setMenu(true)} aria-label="More options"><MoreVertical size={18} /></button>
        </div>

        {menu && (
          <div className="jt-menu" onClick={(e) => e.stopPropagation()}>
            {cancellable && b.type === 'schedule' && (
              <button className="jt-mi" onClick={() => go(`/reschedule/${b.id}`)}><CalendarClock size={16} /> Reschedule Booking</button>
            )}
            {started && (
              <button className="jt-mi" onClick={() => go(`/job/${b.id}/progress`)}><Bike size={16} /> View Live Progress</button>
            )}
            {cancellable && (
              <button className="jt-mi danger" onClick={() => go(`/cancel/${b.id}`)}><XCircle size={16} /> Cancel Booking</button>
            )}
            <button className="jt-mi" onClick={share}><Share2 size={16} /> Share Booking</button>
            <button className="jt-mi" onClick={() => go('/cancellation-policy')}><ShieldQuestion size={16} /> Cancellation Policy</button>
            <button className="jt-mi" onClick={() => go('/support')}><Headset size={16} /> Get Help</button>
          </div>
        )}
      </div>

      <div className="content jt-scroll">
        {/* hero */}
        <div className="jt-hero">
          <div className="jt-hero-ava">
            <WorkerAvatar b={b} size={66} />
            {assigned && <span className="jt-hero-check"><Check size={14} strokeWidth={3} /></span>}
          </div>
          <h2>{assigned ? 'Worker Assigned!' : 'Confirming your expert…'}</h2>
          <p>{assigned
            ? `Great! ${proName(b).split(' ')[0]} has been assigned to your service.`
            : 'Your booking is confirmed. We are assigning the best expert near you — this usually takes a moment.'}</p>
          <span className="jt-badge-confirm"><ShieldCheck size={15} /> Your booking is confirmed</span>
        </div>

        {/* Order: expert → where → what was booked. Who is coming (or already working) is what the
            customer opens this screen for, so it leads; the reference/service rows are the detail
            you check last and sit below the address. */}
        {/* worker — compact single row: avatar + info (→ profile) + small chat/call icons */}
        {assigned ? (
          <div className="jt-card jt-worker2">
            <button className="jt-worker2-ava" onClick={() => nav(`/job/${b.id}/worker`)} aria-label="View worker profile">
              <WorkerAvatar b={b} size={46} />
              <span className="jt-online" />
            </button>
            <button className="jt-worker2-main" onClick={() => nav(`/job/${b.id}/worker`)}>
              <div className="jt-worker2-name">{proName(b)}{verified && <BadgeCheck size={15} className="jt-vcheck" />}</div>
              <div className="jt-worker2-sub"><Star size={12} className="jt-star" /> {proRating(b)} · {jobs} jobs{verified ? ' · Verified' : ''}</div>
            </button>
            <button className="jt-wmini ghost" onClick={chat} aria-label="Chat with worker"><MessageCircle size={17} /></button>
            <button className="jt-wmini" onClick={call} aria-label="Call worker"><Phone size={17} /></button>
          </div>
        ) : (
          <div className="jt-card jt-worker pending">
            <span className="jt-ava jt-ava-init" style={{ width: 50, height: 50, fontSize: 20 }}>…</span>
            <div className="jt-worker-main">
              <div className="jt-worker-name">Assigning your expert…</div>
              <div className="jt-worker-sub">Finding someone near you</div>
            </div>
          </div>
        )}

        {/* where */}
        <div className="jt-card jt-details">
          <div className="jt-addr">
            <span className="jt-addr-ic"><MapPin size={16} /></span>
            <div className="jt-addr-main">
              <div className="jt-addr-k">Address</div>
              {addr.flat && <div className="jt-addr-primary">{addr.flat}</div>}
              <div className="jt-addr-line">{addr.area || '—'}</div>
              {addr.landmark && <div className="jt-addr-land">Near {addr.landmark}</div>}
            </div>
          </div>
          {/* No map button here at any stage — the address card says where the service is, and that
              is all this screen needs to say. While the expert is travelling, the live status card
              below ("Worker is on the way") still opens the map, so the route isn't orphaned. */}
        </div>

        {/* what was booked — reference/service/timing, below the address */}
        <div className="jt-card jt-details">
          <Row label="Booking ID" value={b.ref} />
          <Row label="Service" value={serviceNames(b)} />
          <Row label="Date & Time" value={fmtDateTime(b)} />
          {/* Approved extra time was invisible here, and this is the screen the Home "Track" button
              lands on — so a customer who had just paid for more time saw no sign of it. */}
          {!!b.extension_minutes && (
            <Row label="Extra time" value={`+${b.extension_minutes} min${b.extension_total ? ` · ₹${b.extension_total}` : ''}`} />
          )}
        </div>

        {/* live status card */}
        {arr && (
          <button className="jt-arrival" onClick={() => nav(`/job/${b.id}/${arr.path}`)}>
            <span className="jt-arrival-ic">{arr.icon}</span>
            <span className="jt-arrival-main">
              <span className="jt-arrival-t">{arr.title}</span>
              <span className="jt-arrival-s">{arr.sub}</span>
            </span>
            <ChevronRight size={20} className="jt-arrival-chev" />
          </button>
        )}

        {/* progress stepper */}
        <StepTimeline status={b.status} />

        {/* safety */}
        <div className="jt-safety">
          <div className="jt-safety-head"><ShieldCheck size={15} /> Your safety is our priority</div>
          <div className="jt-safety-items">
            <span><BadgeCheck size={13} /> Background Verified</span>
            <span><Headset size={13} /> Support Available</span>
            <span><ShieldCheck size={13} /> Quality Assured</span>
          </div>
        </div>
      </div>

      {/* Footer depends on the stage: a running service can't be cancelled — show its live timer
          instead. Before it starts, Chat + Cancel; once completed, the summary. */}
      <div className="jt-foot">
        {started ? (
          <button className="jt-btn" onClick={() => nav(`/job/${b.id}/progress`)}><Bike size={16} /> View Live Progress</button>
        ) : b.status === 'completed' ? (
          <button className="jt-btn" onClick={() => nav(`/job/${b.id}/completed`)}><Check size={16} /> View Summary</button>
        ) : cancellable ? (
          <>
            <button className="jt-btn ghost" onClick={chat}><MessageCircle size={16} /> Chat with Worker</button>
            <button className="jt-btn danger" onClick={() => nav(`/cancel/${b.id}`)}><XCircle size={16} /> Cancel Booking</button>
          </>
        ) : (
          <button className="jt-btn" onClick={call}><Phone size={16} /> Call Worker</button>
        )}
      </div>

      {menu && <div className="jt-menu-back" onClick={() => setMenu(false)} />}
    </div>
  )
}

/* ---------- address ---------- */
// Split the booking address into a flat/building primary line and the area line, using the full
// structured address when the booking service resolved one, else the plain stored text.
function addressParts(b: Booking): { flat: string; area: string; landmark: string } {
  const a = b.addr
  if (a && (a.house || a.apartment || a.floor)) {
    const flat = [a.house, a.apartment, a.floor && `Floor ${a.floor}`].filter(Boolean).join(', ')
    const area = a.line || [a.street, a.city, a.pincode].filter(Boolean).join(', ') || b.address || ''
    return { flat, area, landmark: a.landmark || '' }
  }
  return { flat: '', area: (a?.line || b.address || ''), landmark: a?.landmark || '' }
}
// One-line full address for the share sheet.
function fullAddress(b: Booking): string {
  const p = addressParts(b)
  return [p.flat, p.area, p.landmark && `Near ${p.landmark}`].filter(Boolean).join(', ')
}

/* ---------- live status card ---------- */
function arrivalFor(b: Booking): { icon: JSX.Element; title: string; sub: string; path: string } | null {
  const eta = b.eta
  const etaText = eta ? `Estimated arrival in ${eta}–${eta + 3} mins` : 'Estimated arrival in 12–15 mins'
  switch (b.status) {
    case 'worker_assigned': return { icon: <Bike size={20} />, title: 'Worker is getting ready', sub: 'Preparing to head to your location', path: 'otw' }
    case 'on_the_way': return { icon: <Bike size={20} />, title: 'Worker is on the way', sub: etaText, path: 'map' }
    case 'arrived': return { icon: <MapPin size={20} />, title: 'Worker has arrived', sub: 'Share your start OTP to begin', path: 'otp' }
    case 'in_progress': return { icon: <Check size={20} />, title: 'Service in progress', sub: 'Your service is underway', path: 'progress' }
    case 'completed': return { icon: <Check size={20} />, title: 'Service completed', sub: 'View your service summary', path: 'completed' }
    default: return null
  }
}

/* ---------- big numbered stepper (Booked → Completed) ---------- */
const BIG_STEPS = ['Booked', 'Assigned', 'On the way', 'In Progress', 'Completed']
const bigStepIdx = (status: string): number => (
  { confirmed: 0, worker_assigned: 1, on_the_way: 2, arrived: 2, in_progress: 3, completed: 4 }[status] ?? 0
)
function StepTimeline({ status }: { status: string }) {
  const cur = bigStepIdx(status)
  const done = status === 'completed'
  return (
    <div className="jt-steps">
      {BIG_STEPS.map((s, i) => {
        const isDone = done || i < cur
        const isCur = !done && i === cur
        return (
          <div key={s} className={`jt-step ${isDone ? 'done' : ''} ${isCur ? 'cur' : ''}`}>
            <span className="jt-step-dot">{isDone ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
            <span className="jt-step-lbl">{s}</span>
          </div>
        )
      })}
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="jt-row">
      <span className="jt-row-l">{label}</span>
      <span className="jt-row-v">{value || '—'}</span>
    </div>
  )
}
