import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Star, Sparkles, Droplets, ShieldCheck, BadgeCheck, Wrench } from 'lucide-react'
import { Loading, useToast } from '../components/UI'
import { useStore } from '../store'
import { fetchService } from '../api'
import type { ServiceDetail } from '../types'

// Module 4 · #23 — Service Details. Real service data via fetchService; "Select Duration"
// starts the booking config wizard. UI redesigned to the mock. No backend change.
const BULLET_ICONS = [Sparkles, Droplets, ShieldCheck, BadgeCheck, Wrench]

export default function ServiceDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useToast()
  const { pincode } = useStore()
  const [s, setS] = useState<ServiceDetail | null>(null)

  useEffect(() => { fetchService(id!, pincode || undefined).then(setS).catch(() => toast('Could not load service')) }, [id, pincode])
  const goBack = () => { if (loc.key === 'default') nav('/home'); else nav(-1) }
  if (!s) return <div className="screen m2"><Loading /></div>

  return (
    <div className="screen m2">
      <div className="ps-top">
        <button className="au-back" onClick={goBack} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Service Details</b><span style={{ width: 42 }} />
      </div>
      <div className="content">
        <h1 className="sd-name">{s.name}</h1>
        <div className="sd-rate"><Star size={15} className="sd-star" /> <b>{s.rating}</b> <span>({(s.reviewsCount ?? 0).toLocaleString()} ratings)</span></div>
        {s.description && <p className="sd-desc">{s.description}</p>}

        <ul className="sd-bullets">
          {s.includes.slice(0, 6).map((i, idx) => {
            const Ic = BULLET_ICONS[idx % BULLET_ICONS.length]
            return <li key={i}><span className="sd-b-ic"><Ic size={16} /></span>{i}</li>
          })}
        </ul>

        <div className="sd-photo">
          <img src={s.image || `/services/${s.id}.jpg`} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        </div>
      </div>
      <div className="au-foot sd-foot">
        <div className="sd-from"><small>Starting from</small><b>₹{s.price}</b></div>
        <button className="au-btn sd-cta" onClick={() => nav(`/configure/${s.id}`)}>Select Duration</button>
      </div>
    </div>
  )
}
