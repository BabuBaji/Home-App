import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/UI'
import { useStore } from '../store'
import { updateMe } from '../api'
import { COUNTRIES } from '../countries'

export default function CountrySelect() {
  const nav = useNavigate()
  const toast = useToast()
  const { user, setUser } = useStore()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(user?.country || 'IN')
  const [busy, setBusy] = useState(false)

  const list = COUNTRIES.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))

  async function next() {
    setBusy(true)
    try { const { user } = await updateMe({ country: sel }); setUser(user); nav('/onboarding/location', { replace: true }) }
    catch (e) { toast((e as Error).message); setBusy(false) }
  }

  return (
    <div className="screen">
      <div className="onb-hero">
        <div className="onb-step">Step 1 of 2</div>
        <h1>Where are you?</h1>
        <p>Select your country to personalise services &amp; pricing.</p>
      </div>
      <div className="content pad-cta">
        <div className="search"><span>🔍</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search country" /></div>
        {list.map((c) => (
          <button key={c.code} className={`country-row ${sel === c.code ? 'sel' : ''}`} onClick={() => setSel(c.code)}>
            <span className="cf">{c.flag}</span>
            <span className="grow cn2">{c.name}</span>
            <span className="cd">{c.dial}</span>
            <span className="radio">{sel === c.code ? '✓' : ''}</span>
          </button>
        ))}
      </div>
      <div className="footer-cta"><button className="btn full" onClick={next} disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button></div>
    </div>
  )
}
