import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, MapPin, Check } from 'lucide-react'

/* Module-1 #5 — Select City. Carries the chosen city forward to the Permission screen,
   which captures the exact GPS address and stores it as the profile's default address.
   City is only the fallback if the user denies location. No backend write here. */
const POPULAR = ['Bangalore', 'Mumbai', 'Delhi', 'Pune', 'Chennai', 'Kolkata', 'Ahmedabad']

export default function SelectCity() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const detected = 'Hyderabad'
  const [picked, setPicked] = useState('Hyderabad')

  const cities = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? POPULAR.filter((c) => c.toLowerCase().includes(s)) : POPULAR
  }, [q])

  function cont() {
    nav('/onboarding/permission', { state: { city: picked } })
  }

  return (
    <div className="auth">
      <div className="au-top">
        <button className="au-back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
      </div>
      <div className="content au-body">
        <h1 className="au-h1">Select your<br /><span className="av">city</span></h1>
        <p className="au-sub">Services available in your city</p>

        <div className="au-search">
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for your city" />
        </div>

        {!q && (
          <>
            <div className="au-eyebrow">Current Location</div>
            <button className={`au-city current ${picked === detected ? 'sel' : ''}`} onClick={() => setPicked(detected)}>
              <MapPin size={18} className="au-city-pin" />
              <b className="grow">{detected}</b>
              {picked === detected && <span className="au-tick"><Check size={14} /></span>}
            </button>
          </>
        )}

        <div className="au-eyebrow">{q ? 'Results' : 'Popular Cities'}</div>
        <div className="au-city-list">
          {cities.map((c) => (
            <button key={c} className={`au-city ${picked === c ? 'sel' : ''}`} onClick={() => setPicked(c)}>
              <b className="grow">{c}</b>
              <span className={`au-radio ${picked === c ? 'on' : ''}`}>{picked === c && <Check size={13} />}</span>
            </button>
          ))}
          {cities.length === 0 && <p className="au-empty">No city matches “{q}”.</p>}
        </div>
      </div>
      <div className="au-foot">
        <button className="au-btn" onClick={cont} disabled={!picked}>Continue</button>
      </div>
    </div>
  )
}
