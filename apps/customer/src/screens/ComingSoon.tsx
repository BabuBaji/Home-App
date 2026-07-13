import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin } from 'lucide-react'
import { fetchLiveAreas } from '../api'

// Cities we're expanding to (shown as "coming soon" alongside the live ones).
const EXPANSION = ['Mumbai', 'Bangalore', 'Delhi', 'Pune', 'Chennai']

// Shown when the chosen location isn't in a live service zone — a friendly "not available yet"
// screen listing the cities/areas we DO serve. Embedded in Home, and standalone from the map picker.
export default function ComingSoon({ standalone }: { standalone?: boolean }) {
  const nav = useNavigate()
  const [byCity, setByCity] = useState<Record<string, string[]>>({})
  const [sel, setSel] = useState('')

  useEffect(() => {
    fetchLiveAreas().then((zs) => {
      const m: Record<string, string[]> = {}
      zs.forEach((z) => { (m[z.city] = m[z.city] || []).push(z.name) })
      setByCity(m)
      setSel(Object.keys(m)[0] || 'Hyderabad')
    }).catch(() => setSel('Hyderabad'))
  }, [])

  const liveCities = Object.keys(byCity)
  const cities = [...liveCities, ...EXPANSION.filter((c) => !liveCities.includes(c))]
  const selAreas = byCity[sel] || []
  const selLive = liveCities.includes(sel)

  const content = (
    <div className="cs">
      <div className="cs-hero">
        <div className="cs-hero-glow" />
        <div className="cs-hero-emoji">🌇</div>
      </div>
      <h1 className="cs-title">Not available in your area yet</h1>
      <p className="cs-sub">Launching new areas super fast.<br />We'll be there very soon.</p>

      <h2 className="cs-live-h">We are live in</h2>
      <div className="cs-card">
        <div className="cs-cities">
          {cities.map((c) => {
            const live = liveCities.includes(c)
            return (
              <button key={c} className={`cs-city${sel === c ? ' on' : ''}${live ? '' : ' soon'}`} onClick={() => setSel(c)}>
                <div className="cs-city-ill">{live ? '🏙️' : '🏗️'}</div>
                <div className="cs-city-name">{c}</div>
              </button>
            )
          })}
        </div>
        <div className="cs-areas-box">
          {selLive ? (
            <>
              <div className="cs-areas-h">Serving {selAreas.length} area{selAreas.length !== 1 ? 's' : ''} in {sel}</div>
              <div className="cs-areas">{selAreas.map((a) => <span key={a} className="cs-area"><MapPin size={13} /> {a}</span>)}</div>
            </>
          ) : (
            <div className="cs-areas-h">Coming soon to {sel} 🚀</div>
          )}
        </div>
      </div>

      <button className="cs-change" onClick={() => nav('/locations')}>Change location</button>
    </div>
  )

  if (!standalone) return content
  return (
    <div className="screen">
      <div className="cs-top">
        <button className="mp-back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={20} /></button>
      </div>
      <div className="content">{content}</div>
    </div>
  )
}
