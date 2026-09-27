import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Share2, Star, Check, X } from 'lucide-react'
import { Share } from '@capacitor/share'
import { Loading, useToast } from '../components/UI'
import { useStore } from '../store'
import { fetchService, fetchServices } from '../api'
import { ServiceHeroImg } from '../serviceArt'
import type { ServiceDetail, Service } from '../types'
import { t } from '../i18n'

// Service Details — full-bleed hero photo, then name / price / rating / description /
// includes / excludes / duration / additional info, over a sticky Schedule + Book Instant bar.
// One layout for EVERY service: only the data below changes per service id.
export default function ServiceDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useToast()
  const { pincode } = useStore()
  const [s, setS] = useState<ServiceDetail | null>(null)
  const [siblings, setSiblings] = useState<Service[]>([])

  useEffect(() => { fetchService(id!, pincode || undefined).then(setS).catch(() => toast(t('Could not load service'))) }, [id, pincode])
  // Other services in the same category → the side-scrolling row under the price.
  useEffect(() => {
    if (!s) return
    fetchServices(pincode || undefined).then((r) => setSiblings(r.services.filter((x) => x.category === s.category))).catch(() => setSiblings([]))
  }, [s?.category, pincode])

  const goBack = () => { if (loc.key === 'default') nav('/home'); else nav(-1) }

  // Share the service. Capacitor's sheet on the phone; the Web Share API in a browser;
  // clipboard as the last resort so the button is never a dead end.
  const share = async () => {
    if (!s) return
    const text = t('{name} on HomeHelp — from ₹{price}', { name: t(s.name), price: s.price })
    try {
      await Share.share({ title: t(s.name), text, dialogTitle: t('Share service') })
      return
    } catch { /* not on a device, or the user dismissed the sheet */ }
    try {
      if (navigator.share) { await navigator.share({ title: t(s.name), text }); return }
      await navigator.clipboard.writeText(text)
      toast(t('Copied to clipboard'))
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
          <button className="sd2-iconbtn back" onClick={goBack} aria-label={t('Back')}><ArrowLeft size={20} /></button>
          <button className="sd2-iconbtn share" onClick={share} aria-label={t('Share')}><Share2 size={18} /></button>
        </div>

        <div className="sd2-body">
          {/* Name and rating share a row — rating sits right, not stacked under the name. */}
          <div className="sd2-title-row">
            <h1 className="sd2-name">{t(s.name)}</h1>
            <div className="sd2-rate-inline">
              <Star size={15} className="sd2-star" fill="currentColor" />
              <b>{s.rating}</b>
              <span>({(s.reviewsCount ?? 0).toLocaleString()})</span>
            </div>
          </div>
          <div className="sd2-price-row">
            <span className="sd2-price">₹{s.price}</span>
            {orig && <span className="sd2-orig">₹{orig}</span>}
            {off > 0 && <span className="sd2-off">{t('{n}% OFF', { n: off })}</span>}
          </div>

          {siblings.length > 1 && (
            <div className="wi-chips">
              {siblings.map((c) => (
                <button key={c.id} className={`wi-chip ${c.id === s.id ? 'sel' : ''}`} onClick={() => c.id !== s.id && nav(`/service/${c.id}`)}>
                  <img src={c.image || `/services/${c.id}.jpg`} alt="" onError={(e) => { const im = e.currentTarget as HTMLImageElement; if (!im.src.endsWith('/expert.jpg')) im.src = '/expert.jpg'; else im.style.visibility = 'hidden' }} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          )}

          {s.headline && <h2 className="sd2-headline">{s.headline}</h2>}
          {s.description && <p className="sd2-desc">{s.description}</p>}

          {s.includes.length > 0 && (
            <section className="incl-sec">
              <h3 className="incl-head">{t('The expert is trained to')}</h3>
              <ul className="wi-list">
                {s.includes.map((i) => <li key={i} className="wi-item"><span className="wi-ic ok"><Check size={13} /></span>{i}</li>)}
              </ul>
            </section>
          )}

          {s.excludes?.length > 0 && (
            <section className="incl-sec">
              <h3 className="incl-head">{t('What is not included')}</h3>
              <ul className="wi-list">
                {s.excludes.map((i) => <li key={i} className="wi-item"><span className="wi-ic no"><X size={13} /></span>{i}</li>)}
              </ul>
            </section>
          )}

          {(s.note || s.terms?.length) && (
            <section className="incl-sec">
              <h3 className="incl-head">{t('Additional information')}</h3>
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

      {/* Instant opens the flow on duration & pay; Schedule opens it on the date + slot picker. */}
      <div className="au-foot wi-foot">
        <button className="wi-schedule" onClick={() => nav(`/booking/${s.id}`, { state: { mode: 'schedule' } })}>{t('Schedule')}</button>
        <button className="wi-instant" onClick={() => nav(`/booking/${s.id}`, { state: { mode: 'now' } })}>{t('Book Instant')}</button>
      </div>
    </div>
  )
}
