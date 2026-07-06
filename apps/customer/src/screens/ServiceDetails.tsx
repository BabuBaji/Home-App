import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Loading, useToast } from '../components/UI'
import { useStore } from '../store'
import { ServiceHeroImg, ServiceThumb } from '../serviceArt'
import { fetchService, fetchServices } from '../api'
import type { ServiceDetail, Service } from '../types'

export default function ServiceDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useToast()
  const goBack = () => { if (loc.key === 'default') nav('/home'); else nav(-1) }
  const { setBookingType } = useStore()
  const [s, setS] = useState<ServiceDetail | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [openTerms, setOpenTerms] = useState(false)

  useEffect(() => {
    setOpenTerms(false)
    fetchService(id!).then(setS).catch(() => toast('Could not load service'))
    fetchServices().then((c) => setServices(c.services.filter((x) => x.available))).catch(() => {})
  }, [id])

  if (!s) return <div className="screen"><Loading /></div>

  function book(mode: 'instant' | 'schedule') {
    setBookingType(mode)
    nav(`/book/${s!.id}`)
  }

  function share() {
    const url = window.location.href
    const n = navigator as any
    if (n.share) { n.share({ title: s!.name, url }).catch(() => {}) }
    else if (n.clipboard) { n.clipboard.writeText(url); toast('Link copied') }
  }

  const orig = s.durations?.[0]?.original

  return (
    <div className="screen">
      <div className="content pad-cta no-pad">
        {/* hero image (clean, no text overlay) */}
        <div className="sd2-hero">
          <ServiceHeroImg service={s} />
          <button className="sd2-iconbtn back" onClick={goBack} aria-label="Back">←</button>
          <button className="sd2-iconbtn share" onClick={share} aria-label="Share">↗</button>
        </div>

        <div className="sd2-body">
          {/* name + price */}
          <h1 className="sd2-name">{s.name}</h1>
          <div className="sd2-price-row">
            <span className="sd2-price">₹{s.price}</span>
            {orig && orig > s.price && <span className="sd2-orig">₹{orig}</span>}
          </div>

          {/* rating */}
          <div className="sd2-rate-row">
            <span className="sd2-star">★</span>
            <span className="sd2-rate-val">{s.rating}</span>
            <span className="sd2-rate-count">({s.reviewsCount.toLocaleString()} ratings)</span>
          </div>

          {/* headline + description */}
          {s.headline && <h2 className="sd2-headline">{s.headline}</h2>}
          {s.description && <p className="sd2-desc">{s.description}</p>}

          {/* other services */}
          <div className="svc-chips">
            {services.map((x) => (
              <button key={x.id} className={`svc-chip ${x.id === s!.id ? 'sel' : ''}`} onClick={() => nav(`/service/${x.id}`, { replace: true })}>
                <span className="svc-chip-th" style={{ position: 'relative' }}>
                  <ServiceThumb service={x} medallion={28} />
                </span>
                <span className="svc-chip-name">{x.name}</span>
              </button>
            ))}
          </div>

          {/* includes */}
          <section className="incl-sec">
            <h3 className="incl-head">Includes</h3>
            <ul className="incl-list ok">
              {s.includes.map((i) => <li key={i}><span className="ic ok">✓</span>{i}</li>)}
            </ul>
          </section>

          {/* does not include */}
          {s.excludes.length > 0 && (
            <section className="incl-sec">
              <h3 className="incl-head">Does not include</h3>
              <ul className="incl-list no">
                {s.excludes.map((i) => <li key={i}><span className="ic no">✕</span>{i}</li>)}
              </ul>
            </section>
          )}

          {/* equipment note */}
          {s.note && (
            <div className="equip-note"><span className="equip-ic">🧹🪣</span><span>{s.note}</span></div>
          )}

          {/* terms & conditions */}
          {s.terms && s.terms.length > 0 && (
            <div className="info-card terms-card">
              <button className="terms-toggle" onClick={() => setOpenTerms((o) => !o)}>
                <span className="hi t">📄</span>
                <span className="grow">Terms &amp; Conditions</span>
                <span className={`terms-chev ${openTerms ? 'up' : ''}`}>⌄</span>
              </button>
              {openTerms && (
                <div className="terms-list">
                  {s.terms.map((t, i) => (
                    <div className="term" key={i}>
                      <div className="term-t">{i + 1}. {t.t}</div>
                      <div className="term-d">{t.d}</div>
                    </div>
                  ))}
                  <p className="terms-foot">By booking, you agree to HomeHelp's Terms &amp; Conditions and Privacy Policy.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="footer-cta sheet-cta">
        <button className="btn-outline half" onClick={() => book('schedule')}>Schedule</button>
        <button className="btn half" onClick={() => book('instant')}>Book Instant</button>
      </div>
    </div>
  )
}
