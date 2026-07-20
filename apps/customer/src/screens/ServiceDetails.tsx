import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Share2, Star, Check, X } from 'lucide-react'
import { Share } from '@capacitor/share'
import { Loading, useToast } from '../components/UI'
import { isZoneOpenNow, todayHoursLabel } from '../components/Calendar'
import { useStore } from '../store'
import { fetchService, fetchServices } from '../api'
import { ServiceHeroImg } from '../serviceArt'
import type { ServiceDetail, Service } from '../types'

// Service Details — full-bleed hero photo, then name / price / rating / description /
// includes / excludes / duration / additional info, over a sticky Schedule + Book Instant bar.
// One layout for EVERY service: only the data below changes per service id.
export default function ServiceDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useToast()
  const { pincode, setBookingType, zoneHours } = useStore()
  const [s, setS] = useState<ServiceDetail | null>(null)
  const [siblings, setSiblings] = useState<Service[]>([])

  useEffect(() => { fetchService(id!, pincode || undefined).then(setS).catch(() => toast('Could not load service')) }, [id, pincode])
  // Other services in the same category → the side-scrolling row under the price.
  useEffect(() => {
    if (!s) return
    fetchServices(pincode || undefined).then((r) => setSiblings(r.services.filter((x) => x.category === s.category))).catch(() => setSiblings([]))
  }, [s?.category, pincode])

  const goBack = () => { if (loc.key === 'default') nav('/home'); else nav(-1) }
  const book = (type: 'instant' | 'schedule') => { setBookingType(type); nav(`/book/${s!.id}`) }

  // Instant needs an expert on shift NOW, so it follows the serving zone's working hours — each
  // zone sets its own shift in admin. Outside that window the CTA is disabled here rather than on
  // the next screen, so "not available" is known before tapping through. Unconfigured zone / no
  // pincode → open (isZoneOpenNow), matching the booking service, which only gates known zones.
  const instantOpen = isZoneOpenNow(zoneHours)
  const shiftLabel = todayHoursLabel(zoneHours)

  // Share the service. Capacitor's sheet on the phone; the Web Share API in a browser;
  // clipboard as the last resort so the button is never a dead end.
  const share = async () => {
    if (!s) return
    const text = `${s.name} on HomeHelp — from ₹${s.price}`
    try {
      await Share.share({ title: s.name, text, dialogTitle: 'Share service' })
      return
    } catch { /* not on a device, or the user dismissed the sheet */ }
    try {
      if (navigator.share) { await navigator.share({ title: s.name, text }); return }
      await navigator.clipboard.writeText(text)
      toast('Copied to clipboard')
    } catch { /* dismissed — stay silent */ }
  }

  if (!s) return <div className="screen m2"><Loading /></div>

  // Strikethrough only when a zone offer actually lowered the price.
  const orig = s.listPrice && s.listPrice > s.price ? s.listPrice : null
  const off = s.zoneDiscount || (orig ? Math.round((1 - s.price / orig) * 100) : 0)

  return (
    <div className="screen m2">
      <div className="content no-pad">
        <div className="sd2-hero">
          <ServiceHeroImg service={s} />
          <button className="sd2-iconbtn back" onClick={goBack} aria-label="Back"><ArrowLeft size={20} /></button>
          <button className="sd2-iconbtn share" onClick={share} aria-label="Share"><Share2 size={18} /></button>
        </div>

        <div className="sd2-body">
          {/* Name and rating share a row — rating sits right, not stacked under the name. */}
          <div className="sd2-title-row">
            <h1 className="sd2-name">{s.name}</h1>
            <div className="sd2-rate-inline">
              <Star size={15} className="sd2-star" fill="currentColor" />
              <b>{s.rating}</b>
              <span>({(s.reviewsCount ?? 0).toLocaleString()})</span>
            </div>
          </div>
          <div className="sd2-price-row">
            <span className="sd2-price">₹{s.price}</span>
            {orig && <span className="sd2-orig">₹{orig}</span>}
            {off > 0 && <span className="sd2-off">{off}% OFF</span>}
          </div>

          {siblings.length > 1 && (
            <div className="wi-chips">
              {siblings.map((c) => (
                <button key={c.id} className={`wi-chip ${c.id === s.id ? 'sel' : ''}`} onClick={() => c.id !== s.id && nav(`/service/${c.id}`)}>
                  <img src={c.image || `/services/${c.id}.jpg`} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          )}

          {s.headline && <h2 className="sd2-headline">{s.headline}</h2>}
          {s.description && <p className="sd2-desc">{s.description}</p>}

          {s.includes.length > 0 && (
            <section className="incl-sec">
              <h3 className="incl-head">The expert is trained to</h3>
              <ul className="wi-list">
                {s.includes.map((i) => <li key={i} className="wi-item"><span className="wi-ic ok"><Check size={13} /></span>{i}</li>)}
              </ul>
            </section>
          )}

          {s.excludes?.length > 0 && (
            <section className="incl-sec">
              <h3 className="incl-head">What is not included</h3>
              <ul className="wi-list">
                {s.excludes.map((i) => <li key={i} className="wi-item"><span className="wi-ic no"><X size={13} /></span>{i}</li>)}
              </ul>
            </section>
          )}

          {(s.note || s.terms?.length) && (
            <section className="incl-sec">
              <h3 className="incl-head">Additional information</h3>
              {s.note && <p className="sd2-desc">{s.note}</p>}
              {s.terms?.map((t) => (
                <div key={t.t} className="sd2-term">
                  <b>{t.t}</b>
                  <p>{t.d}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>

      <div className="au-foot wi-foot">
        {!instantOpen && (
          <div className="wi-closed-note">
            🌙 Instant slots are not available right now{shiftLabel ? ` · ${shiftLabel}` : ''} — use <b>Schedule</b> to book for later.
          </div>
        )}
        <button className="wi-schedule" onClick={() => book('schedule')}>Schedule</button>
        {/* aria-disabled, not `disabled`: a disabled button swallows the tap, so a customer who
            taps anyway gets no feedback at all. This keeps the tap and explains it in a toast. */}
        <button
          className={`wi-instant ${instantOpen ? '' : 'off'}`}
          aria-disabled={!instantOpen}
          onClick={() => (instantOpen ? book('instant') : toast('Instant slots are not available right now — please Schedule for later'))}
        >
          {instantOpen ? 'Book Instant' : 'Slots Unavailable'}
        </button>
      </div>
    </div>
  )
}
