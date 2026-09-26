import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Check } from 'lucide-react'
import { fetchLiveAreas } from '../api'
import { t } from '../i18n'

/* Module-1 #5 — Select City. Carries the chosen city forward to the Permission screen,
   which captures the exact GPS address and stores it as the profile's default address.
   City is only the fallback if the user denies location. No backend write here. */
// Cities we're expanding to — listed after the live ones, so nobody is silently dropped into a city
// they didn't pick.
const EXPANSION = ['Hyderabad', 'Bangalore', 'Mumbai', 'Delhi', 'Pune', 'Chennai', 'Kolkata', 'Ahmedabad']

export default function SelectCity() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [live, setLive] = useState<string[]>([])
  const [picked, setPicked] = useState('')

  // The cities we actually serve come from the live zones; with only one, it's preselected.
  useEffect(() => {
    fetchLiveAreas().then((zs) => {
      const cs = [...new Set(zs.map((z) => z.city).filter(Boolean))]
      setLive(cs)
      if (cs.length === 1) setPicked((p) => p || cs[0])
    }).catch(() => {})
  }, [])

  const cities = useMemo(() => {
    const all = [...live, ...EXPANSION.filter((c) => !live.includes(c))]
    const s = q.trim().toLowerCase()
    return s ? all.filter((c) => c.toLowerCase().includes(s)) : all
  }, [q, live])

  function cont() {
    nav('/onboarding/permission', { state: { city: picked } })
  }

  return (
    <div className="auth">
      <div className="au-top">
        <button className="au-back" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={20} /></button>
      </div>
      <div className="content au-body">
        <h1 className="au-h1">{t('Select your')}<br /><span className="av">{t('city')}</span></h1>
        <p className="au-sub">{t('Services available in your city')}</p>

        <div className="au-search">
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search for your city')} />
        </div>

        <div className="au-eyebrow">{q ? t('Results') : t('Cities')}</div>
        <div className="au-city-list">
          {cities.map((c) => (
            <button key={c} className={`au-city ${picked === c ? 'sel' : ''}`} onClick={() => setPicked(c)}>
              <b className="grow">{c}</b>
              {!live.includes(c) && <small className="au-soon">{t('Coming soon')}</small>}
              <span className={`au-radio ${picked === c ? 'on' : ''}`}>{picked === c && <Check size={13} />}</span>
            </button>
          ))}
          {cities.length === 0 && <p className="au-empty">{t('No city matches “{q}”.', { q })}</p>}
        </div>
      </div>
      <div className="au-foot">
        <button className="au-btn" onClick={cont} disabled={!picked}>{t('Continue')}</button>
      </div>
    </div>
  )
}
