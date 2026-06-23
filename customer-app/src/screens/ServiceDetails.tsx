import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loading, useToast } from '../components/UI'
import { useStore } from '../store'
import { fetchService, fetchServices } from '../api'
import type { ServiceDetail, Service } from '../types'

export default function ServiceDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
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

  return (
    <div className="screen">
      <button className="sheet-back overlay" onClick={() => nav(-1)}>✕</button>
      <div className="content pad-cta no-pad">
        {/* hero */}
        <div className="sd2-hero">
          {s.image
            ? <img className="sd2-img" alt="" src={s.image} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            : <div className="sd2-img sd2-emoji">{s.icon}</div>}
          <div className="sd2-fade" />
          <div className="sd2-meta">
            <span className="sd2-eta">⚡ Arrives in 5 min</span>
            <h1 className="sd2-name">{s.name}</h1>
            <div className="sd2-row">
              <span className="sd2-rate">⭐ {s.rating} <span className="dim">({s.reviewsCount})</span></span>
              <span className="sd2-dot">·</span>
              <span className="sd2-price">from ₹{s.price}</span>
            </div>
          </div>
        </div>

        <div className="sd2-body">
          {s.description && <p className="sd2-desc">{s.description}</p>}

          {/* other services */}
          <div className="svc-chips">
            {services.map((x) => (
              <button key={x.id} className={`svc-chip ${x.id === s!.id ? 'sel' : ''}`} onClick={() => nav(`/service/${x.id}`, { replace: true })}>
                <span className="svc-chip-th">
                  {x.image ? <img alt="" src={x.image} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} /> : <span>{x.icon}</span>}
                </span>
                <span className="svc-chip-name">{x.name}</span>
              </button>
            ))}
          </div>

          {/* trained to */}
          <div className="info-card">
            <h3 className="incl-head"><span className="hi ok">✓</span> The expert is trained to</h3>
            <ul className="incl-list ok">
              {s.includes.map((i) => <li key={i}><span className="ic ok">✓</span>{i}</li>)}
            </ul>
          </div>

          {/* not included */}
          {s.excludes.length > 0 && (
            <div className="info-card">
              <h3 className="incl-head"><span className="hi no">✕</span> What is not included</h3>
              <ul className="incl-list no">
                {s.excludes.map((i) => <li key={i}><span className="ic no">✕</span>{i}</li>)}
              </ul>
            </div>
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
