import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/UI'
import { useStore } from '../store'
import { updateMe } from '../api'
import { getCurrentPosition, reverseGeocode, nearbyPlaces, searchPlaces, type Place } from '../geo'

export default function LocationSelect() {
  const nav = useNavigate()
  const toast = useToast()
  const { setUser } = useStore()
  const [detecting, setDetecting] = useState(false)
  const [current, setCurrent] = useState<Place | null>(null)
  const [nearby, setNearby] = useState<Place[]>([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [sel, setSel] = useState<Place | null>(null)
  const [busy, setBusy] = useState(false)

  async function detect() {
    setDetecting(true)
    try {
      const { lat, lng } = await getCurrentPosition()
      const rev = await reverseGeocode(lat, lng).catch(() => ({ label: 'Current location', sub: '', raw: {} }))
      const cur: Place = { label: rev.label, sub: rev.sub, lat, lng }
      setCurrent(cur); setSel(cur)
      const city = (rev as any).raw?.address?.city || (rev as any).raw?.address?.state || rev.label.split(',').pop()?.trim() || ''
      setNearby(await nearbyPlaces(lat, lng, city))
    } catch (e) {
      toast('Could not get GPS location. Please allow location or search manually.')
    } finally { setDetecting(false) }
  }
  useEffect(() => { detect() }, [])

  // debounced search
  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    const t = setTimeout(() => { searchPlaces(q).then(setResults) }, 450)
    return () => clearTimeout(t)
  }, [q])

  async function confirm() {
    if (!sel) return toast('Select a location')
    setBusy(true)
    try {
      const city = sel.label.split(',').pop()?.trim() || sel.label
      const { user } = await updateMe({ city, location: sel.label })
      setUser(user); nav('/home', { replace: true })
    } catch (e) { toast((e as Error).message); setBusy(false) }
  }

  const Row = (p: Place, key: string, icon = '📍') => (
    <button key={key} className={`loc-row ${sel?.label === p.label ? 'sel' : ''}`} onClick={() => setSel(p)}>
      <span className="lr-ic">{icon}</span>
      <span className="grow"><span className="lr-l">{p.label}</span>{p.sub && <span className="lr-s">{p.sub}</span>}</span>
      <span className="radio">{sel?.label === p.label ? '✓' : ''}</span>
    </button>
  )

  return (
    <div className="screen">
      <div className="onb-hero">
        <div className="onb-step">Step 2 of 2</div>
        <h1>Your location</h1>
        <p>We'll find experts near you.</p>
      </div>
      <div className="content pad-cta">
        <button className="gps-btn" onClick={detect} disabled={detecting}>
          <span className="gps-ic">{detecting ? '⏳' : '🎯'}</span>
          <span className="grow"><b>{detecting ? 'Detecting your location…' : 'Use my current location'}</b><span className="muted sm">via GPS</span></span>
        </button>

        <div className="search" style={{ marginTop: 14 }}><span>🔍</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search area, street, city…" /></div>

        {q && results.length > 0 && (<><div className="label">Search results</div>{results.map((p, i) => Row(p, 'r' + i, '🔎'))}</>)}

        {!q && current && (<><div className="label">Current location</div>{Row(current, 'cur', '🎯')}</>)}
        {!q && nearby.length > 0 && (<><div className="label">Nearby</div>{nearby.map((p, i) => Row(p, 'n' + i))}</>)}

        {!q && !current && !detecting && <p className="muted center-text" style={{ marginTop: 20 }}>Allow location access or search for your area above.</p>}
      </div>
      <div className="footer-cta">
        <button className="btn full" onClick={confirm} disabled={busy || !sel}>{busy ? 'Saving…' : sel ? `Confirm · ${sel.label.split(',')[0]}` : 'Select a location'}</button>
      </div>
    </div>
  )
}
