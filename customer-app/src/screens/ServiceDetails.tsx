import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header, FooterCTA, Loading, useToast } from '../components/UI'
import { useStore } from '../store'
import { fetchService } from '../api'
import type { ServiceDetail, Duration } from '../types'

export default function ServiceDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { addToCart, inCart } = useStore()
  const [s, setS] = useState<ServiceDetail | null>(null)
  const [dur, setDur] = useState<Duration | null>(null)

  useEffect(() => {
    fetchService(id!).then((d) => { setS(d); setDur(d.durations[1] || d.durations[0]) }).catch(() => toast('Could not load service'))
  }, [id])

  if (!s || !dur) return <div className="screen"><Header title="Service" /><Loading /></div>

  function add(goNext: boolean) {
    addToCart({ id: s!.id, name: s!.name, icon: s!.icon, category: s!.category, durationId: dur!.id, durationLabel: dur!.label, price: dur!.price })
    if (goNext) nav('/cart'); else toast(`${s!.name} added to your booking`)
  }

  return (
    <div className="screen">
      <Header title={s.name} />
      <div className="content pad-cta">
        <div className="sd-hero">
          <span className="sd-emoji">{s.icon}</span>
          <div>
            <h2>{s.name}</h2>
            <div className="sd-rate">⭐ {s.rating} <span className="muted">· {s.reviewsCount} reviews</span></div>
          </div>
        </div>
        <p className="sd-desc">{s.description}</p>

        <h3 className="section-title">Choose duration</h3>
        <div className="dur-grid">
          {s.durations.map((d) => (
            <button key={d.id} className={`dur ${dur.id === d.id ? 'sel' : ''}`} onClick={() => setDur(d)}>
              <span className="dl">{d.label}</span>
              <span className="dp">₹{d.price}</span>
            </button>
          ))}
        </div>

        <div className="incl-2">
          <div className="card pad">
            <div className="incl-h ok">✓ What's included</div>
            <ul>{s.includes.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
          <div className="card pad">
            <div className="incl-h no">✕ Not included</div>
            <ul>{s.excludes.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        </div>

        <h3 className="section-title">Ratings & reviews</h3>
        <div className="card pad">
          <div className="rev-top"><span className="rev-big">{s.rating}</span><span className="muted">⭐ from {s.reviewsCount} reviews</span></div>
          {s.reviews.map((r, i) => (
            <div key={i} className="rev">
              <div className="rev-h"><b>{r.name}</b><span className="muted sm">{r.date}</span></div>
              <div className="rev-stars">{'★'.repeat(r.rating)}<span className="dim">{'★'.repeat(5 - r.rating)}</span></div>
              <p className="rev-t">{r.text}</p>
            </div>
          ))}
        </div>
      </div>

      <FooterCTA>
        <div className="sd-cta">
          <button className="btn-ghost sd-add" onClick={() => add(false)} disabled={inCart(s.id)}>
            {inCart(s.id) ? '✓ Added' : '+ Add to booking'}
          </button>
          <button className="btn sd-book" onClick={() => add(true)}>Book · ₹{dur.price}</button>
        </div>
      </FooterCTA>
    </div>
  )
}
