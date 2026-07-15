import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, HelpCircle, Check, Phone, Navigation } from 'lucide-react'
import { Loading, useToast } from '../components/UI'
import { fetchBooking } from '../api'
import type { Booking } from '../types'

// Module 5 · #41 — Booking Tracking. Timeline derived from the real booking status (fetchBooking,
// polled). Keeps the check-in OTP and links to the existing live-map Track (/track/:id). No backend change.
const IDX: Record<string, number> = { confirmed: 0, worker_assigned: 1, on_the_way: 2, arrived: 3, in_progress: 4, completed: 5, cancelled: 0 }
const STEPS = [
  { key: 'confirmed', title: 'Booking Confirmed', at: 0 },
  { key: 'payment', title: 'Payment Successful', at: 0 },
  { key: 'assigned', title: 'Worker Assigned', at: 1, worker: true },
  { key: 'otw', title: 'On the Way', at: 2, live: true },
  { key: 'arrived', title: 'Arrived', at: 3 },
  { key: 'started', title: 'Service Started', at: 4 },
]

function fmt(t?: string) {
  if (!t) return ''
  const d = new Date(t)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function BookingTracking() {
  const { id } = useParams()
  const bid = Number(id)
  const nav = useNavigate()
  const toast = useToast()
  const [b, setB] = useState<Booking | null>(null)

  useEffect(() => {
    const load = () => fetchBooking(bid).then(setB).catch(() => {})
    load()
    const iv = setInterval(load, 8000)
    return () => clearInterval(iv)
  }, [bid])

  if (!b) return <div className="screen m2"><div className="ps-top"><button className="au-back" onClick={() => nav(-1)}><ArrowLeft size={22} /></button><b>Track Booking</b><span style={{ width: 42 }} /></div><Loading /></div>

  const sidx = IDX[b.status] ?? 0
  const bookingId = b.ref || `BK${b.id}`
  const created = fmt(b.created)

  return (
    <div className="screen m2">
      <div className="ps-top">
        <button className="au-back" onClick={() => nav('/home')} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Track Booking</b><span style={{ width: 42 }} />
      </div>
      <div className="content">
        <div className="bt-idcard">
          <div><small>Booking ID</small><b>{bookingId}</b></div>
          <button className="bt-help" onClick={() => nav('/support')}><HelpCircle size={14} /> Help</button>
        </div>

        {b.service_otp && (
          <div className="bt-otp">
            <div className="grow"><b>Check-in OTP</b><small>Share with your expert to start the service</small></div>
            <div className="bt-otp-boxes">{String(b.service_otp).split('').map((d, i) => <span key={i}>{d}</span>)}</div>
          </div>
        )}

        <div className="bt-timeline">
          {STEPS.map((st, i) => {
            const done = sidx >= st.at
            const current = sidx === st.at && b.status !== 'completed'
            return (
              <div key={st.key} className={`bt-step ${done ? 'done' : ''} ${current ? 'cur' : ''} ${i === STEPS.length - 1 ? 'last' : ''}`}>
                <span className="bt-dot">{done ? <Check size={13} /> : <i />}</span>
                <div className="bt-step-main">
                  <div className="bt-step-t">{st.title}</div>
                  {st.worker && done && b.pro_name
                    ? <div className="bt-worker"><span className="bt-wava">{b.pro_name[0]}</span><span className="grow">{b.pro_name}</span><button className="bt-call" onClick={() => toast('Calling expert…')}><Phone size={15} /></button></div>
                    : <div className="bt-step-s">{done ? created : 'Pending'}</div>}
                  {st.live && done && <button className="bt-live" onClick={() => nav(`/track/${b.id}`)}><Navigation size={13} /> Live Tracking</button>}
                </div>
              </div>
            )
          })}
        </div>

        <div className={`bt-progress ${b.status === 'in_progress' ? 'active' : ''}`}>
          <b>{b.status === 'completed' ? 'Service Completed' : b.status === 'in_progress' ? 'Service in Progress' : 'Service will start soon'}</b>
          <small>{b.status === 'completed' ? 'Thanks for booking with HomeHelp.' : "We'll notify you once it's completed."}</small>
        </div>
      </div>
    </div>
  )
}
