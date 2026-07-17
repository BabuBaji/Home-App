import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RotateCw, Star, MapPin } from 'lucide-react'
import { Loading } from '../../components/UI'
import LiveMap from '../../components/LiveMap'
import { useJob, proName, proRating } from './useJob'
import { WorkerAvatar } from './parts'

// Module 6 · #45 — Live Map Tracking. Real Leaflet/OSM map + OSRM road route from the shared
// LiveMap component, driven by the worker's live GPS on the booking. ETA/distance are real.
export default function LiveTrack() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b, setB } = useJob(id)

  if (!b) return <div className="screen jt"><Loading /></div>

  return (
    <div className="screen jt jt-map-screen">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Track Live</b>
        <button className="jt-ic" onClick={() => setB(null)} aria-label="Refresh"><RotateCw size={18} /></button>
      </div>

      <div className="jt-lt-body">
        <div className="jt-lt-worker">
          <WorkerAvatar b={b} size={44} />
          <div className="grow">
            <div className="jt-worker-name">{proName(b)}</div>
            <div className="jt-worker-sub"><Star size={12} className="jt-star" /> {proRating(b)}</div>
          </div>
          <div className="jt-lt-eta">
            <b>{b.eta != null ? `${b.eta} mins` : '—'}</b>
            <span>{b.dist != null ? `${b.dist} km away` : 'ETA'}</span>
          </div>
        </div>

        <div className="jt-lt-map">
          <LiveMap booking={b} />
        </div>

        <div className="jt-lt-loc">
          <span className="jt-lt-loc-ic"><MapPin size={18} /></span>
          <div><small>Your Location</small><div className="jt-lt-loc-addr">{b.address}</div></div>
        </div>
      </div>
    </div>
  )
}
