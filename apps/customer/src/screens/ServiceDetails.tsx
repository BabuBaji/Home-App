import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Star, Check, X } from 'lucide-react'
import { Loading, useToast } from '../components/UI'
import { useStore } from '../store'
import { fetchService, fetchServices } from '../api'
import type { ServiceDetail, Service } from '../types'

// Service Details — "What is included?" screen. Shows the trained-to (includes) and not-included
// (excludes) lists + related-service chips, then two CTAs: Schedule or Book Instant. Both go
// straight to the one-screen booking sheet (/book/:id) — no more configure/booking wizard.
export default function ServiceDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useToast()
  const { pincode, setBookingType } = useStore()
  const [s, setS] = useState<ServiceDetail | null>(null)
  const [siblings, setSiblings] = useState<Service[]>([])

  useEffect(() => { fetchService(id!, pincode || undefined).then(setS).catch(() => toast('Could not load service')) }, [id, pincode])
  // Related services in the same category → the chips at the top (tap to switch service).
  useEffect(() => {
    if (!s) return
    fetchServices(pincode || undefined).then((r) => setSiblings(r.services.filter((x) => x.category === s.category))).catch(() => setSiblings([]))
  }, [s?.category, pincode])

  const goBack = () => { if (loc.key === 'default') nav('/home'); else nav(-1) }
  const book = (type: 'instant' | 'schedule') => { setBookingType(type); nav(`/book/${s!.id}`) }
  if (!s) return <div className="screen m2"><Loading /></div>

  const chips = siblings.length > 1 ? siblings : []

  return (
    <div className="screen m2">
      <div className="ps-top">
        <button className="au-back" onClick={goBack} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>What is included?</b><span style={{ width: 42 }} />
      </div>

      <div className="content pad-cta">
        <div className="wi-hero">
          <img src={s.image || `/services/${s.id}.jpg`} alt={s.name} onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
        </div>
        <h1 className="wi-name">{s.name}</h1>
        <div className="sd-rate"><Star size={15} className="sd-star" /> <b>{s.rating}</b> <span>({(s.reviewsCount ?? 0).toLocaleString()} ratings)</span></div>

        {chips.length > 0 && (
          <div className="wi-chips">
            {chips.map((c) => (
              <button key={c.id} className={`wi-chip ${c.id === s.id ? 'sel' : ''}`} onClick={() => c.id !== s.id && nav(`/service/${c.id}`)}>
                <img src={c.image || `/services/${c.id}.jpg`} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="wi-sec">The expert is trained to</div>
        <ul className="wi-list">
          {s.includes.map((i) => <li key={i} className="wi-item"><span className="wi-ic ok"><Check size={13} /></span>{i}</li>)}
        </ul>

        {s.excludes && s.excludes.length > 0 && (
          <>
            <div className="wi-sec">What is not included</div>
            <ul className="wi-list">
              {s.excludes.map((i) => <li key={i} className="wi-item"><span className="wi-ic no"><X size={13} /></span>{i}</li>)}
            </ul>
          </>
        )}

        {s.note && (
          <div className="wi-note"><span className="wi-note-ic">🧹</span><span>{s.note}</span></div>
        )}
      </div>

      <div className="au-foot wi-foot">
        <button className="wi-schedule" onClick={() => book('schedule')}>Schedule</button>
        <button className="wi-instant" onClick={() => book('instant')}>Book Instant</button>
      </div>
    </div>
  )
}
