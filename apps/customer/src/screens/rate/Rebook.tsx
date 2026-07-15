import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarCheck } from 'lucide-react'
import { Loading } from '../../components/UI'
import { useJob, serviceNames } from '../job/useJob'

// Module 7 · #56 — Rebook This Service. Summary is real booking data; "Rebook Same Service" re-enters
// the real booking flow for the same service id.
export default function Rebook() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b } = useJob(id, false)

  if (!b) return <div className="screen jt"><Loading /></div>
  const sid = b.items?.[0]?.id
  const when = [b.date, b.time].filter(Boolean).join(', ') || 'Flexible'
  const duration = b.items?.[0]?.durationLabel || b.duration || '—'

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Rebook This Service</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll jt-center">
        <div className="rb-illo"><CalendarCheck size={38} /></div>
        <h2 className="jt-done-title">Glad you loved our service!</h2>
        <p className="jt-done-sub">Would you like to book again?</p>

        <div className="jt-card jt-details rb-details">
          <div className="jt-row"><span className="jt-row-l">Service</span><span className="jt-row-v">{serviceNames(b)}</span></div>
          <div className="jt-row"><span className="jt-row-l">Date</span><span className="jt-row-v">{when}</span></div>
          <div className="jt-row"><span className="jt-row-l">Duration</span><span className="jt-row-v">{duration}</span></div>
          <div className="jt-row col"><span className="jt-row-l">Address</span><span className="jt-row-v">{b.address}</span></div>
        </div>
      </div>

      <div className="jt-foot col">
        <button className="jt-btn" onClick={() => sid ? nav(`/booking/${sid}`) : nav('/home')}>Rebook Same Service</button>
        <button className="jt-btn ghost" onClick={() => nav('/home')}>Choose Another Service</button>
        <button className="jt-btn text" onClick={() => nav('/home')}>Back to Home</button>
      </div>
    </div>
  )
}
