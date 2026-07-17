import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Clock, Phone, Bell, Navigation } from 'lucide-react'
import { Loading } from '../../components/UI'
import { useJob, proName } from './useJob'

// Module 6 · #44 — On The Way. Distance/ETA come from the real travel calc on /api/bookings/:id
// (worker GPS ↔ customer). Vehicle is not tracked by the backend, so it is omitted (no fake value).
export default function OnTheWay() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b } = useJob(id)

  if (!b) return <div className="screen jt"><Loading /></div>

  const first = proName(b).split(' ')[0]
  const phone = b.pro?.phone

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>On The Way</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll">
        <div className="jt-otw-illo"><span className="jt-scooter">🛵</span></div>
        <h2 className="jt-otw-name">{proName(b)}</h2>
        <p className="jt-otw-sub">is on the way to your location</p>

        <div className="jt-card jt-otw-rows">
          <div className="jt-otw-line"><span className="jt-otw-ic"><MapPin size={17} /></span><span className="grow">Distance</span><b>{b.dist != null ? `${b.dist} km away` : 'Calculating…'}</b></div>
          <div className="jt-otw-line"><span className="jt-otw-ic"><Clock size={17} /></span><span className="grow">ETA</span><b>{b.eta != null ? `${b.eta} mins` : '—'}</b></div>
          {phone && <div className="jt-otw-line"><span className="jt-otw-ic"><Phone size={17} /></span><span className="grow">Phone</span><b>{phone}</b></div>}
        </div>

        <button className="jt-map-link" onClick={() => nav(`/job/${b.id}/map`)}><Navigation size={15} /> View live on map</button>

        <div className="jt-note"><Bell size={17} /> We'll notify you when {first} arrives</div>
      </div>

      <div className="jt-foot">
        <button className="jt-btn ghost" onClick={() => nav(`/job/${b.id}/chat`)}>Chat</button>
        <button className="jt-btn" onClick={() => { if (phone) window.location.href = `tel:${phone}`; else nav(`/job/${b.id}/call`) }}>Call</button>
      </div>
    </div>
  )
}
