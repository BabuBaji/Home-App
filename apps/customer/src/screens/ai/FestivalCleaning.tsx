// 104 · Festival Cleaning Suggestions — curated service picks from the real catalog. Book opens the
// real booking flow.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, CalendarClock } from 'lucide-react'
import { BottomNav, Loading } from '../../components/UI'
import { ServiceThumb } from '../../serviceArt'
import { fetchServices } from '../../api'
import { useStore } from '../../store'
import type { Service } from '../../types'

// Services that best fit a festival deep-clean, in priority order.
const PICKS = ['deepclean', 'sofa', 'kitchen', 'window', 'bathroom', 'mopping']

export default function FestivalCleaning() {
  const nav = useNavigate()
  const { pincode } = useStore()
  const [services, setServices] = useState<Service[] | null>(null)
  useEffect(() => { fetchServices(pincode || undefined).then((c) => setServices(c.services)).catch(() => setServices([])) }, [pincode])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Festival Cleaning</h1></div>
      <button className="iconbtn" onClick={() => nav('/notifications')} aria-label="Notifications"><Bell size={18} /></button>
    </header>
  )
  if (!services) return <div className="screen has-nav">{head}<Loading /><BottomNav /></div>

  const recommended = PICKS.map((id) => services.find((s) => s.id === id)).filter(Boolean) as Service[]
  const list = recommended.length ? recommended : services.slice(0, 6)

  return (
    <div className="screen has-nav">
      {head}
      <div className="content">
        <div className="fes-hero">
          <div className="fes-hero-t">Prep your home for the celebrations!</div>
          <div className="fes-hero-d">AI curated suggestions for a cleaner, happier home.</div>
        </div>

        <div className="hhs-tiles-h">Recommended Services</div>
        <div className="air-list">
          {list.map((s) => (
            <div key={s.id} className="air-card">
              <span className="air-thumb"><ServiceThumb service={{ id: s.id, name: s.name, image: `/services/${s.id}.jpg` }} medallion={30} /></span>
              <div className="air-main"><div className="air-name">{s.name}</div><div className="air-note">{s.category} · Perfect before guests arrive</div></div>
              <button className="air-book" onClick={() => nav(`/service/${s.id}`)}>Book</button>
            </div>
          ))}
        </div>

        <div className="fes-tip">
          <CalendarClock size={18} />
          <div><div className="fes-tip-t">Best Time to Book</div><div className="fes-tip-d">Book 3-5 days in advance to get your preferred slot.</div></div>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
