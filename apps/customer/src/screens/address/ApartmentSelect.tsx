import { useEffect, useState } from 'react'
import { ArrowLeft, Search, Check, Building2 } from 'lucide-react'
import { searchPlaces, type Place } from '../../geo'
import { getCachedPosition } from '../../api'

// Module 3 · #18 — Apartment Selection (overlay). Predictive apartment/society search via the
// existing searchPlaces (Google Places → OSM). Selecting a result returns it to the Add form.
export default function ApartmentSelect({ initial, onDone, onClose }:
  { initial?: string; onDone: (v: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [sel] = useState(initial || '')
  const [results, setResults] = useState<Place[]>([])

  useEffect(() => {
    if (q.trim().length < 3) { setResults([]); return }
    const cached = getCachedPosition()
    const coords = cached ? { lat: cached.lat, lng: cached.lng } : null
    const t = setTimeout(() => searchPlaces(q, coords).then(setResults).catch(() => {}), 400)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="ad2-overlay m2">
      <div className="ps-top">
        <button className="au-back" onClick={onClose} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Apartment Selection</b><span style={{ width: 42 }} />
      </div>
      <div className="content">
        <div className="au-search"><Search size={18} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your apartment / society" /></div>
        <div className="au-eyebrow">Nearby Apartments</div>
        <div className="ad2-list">
          {results.map((p, i) => (
            <button key={i} className="ad2-opt" onClick={() => onDone(p.label)}>
              <span className="ad2-opt-ic"><Building2 size={16} /></span>
              <span className="grow"><b>{p.label}</b>{p.sub && <small className="ad2-opt-sub">{p.sub}</small>}</span>
              <span className={`au-radio ${sel === p.label ? 'on' : ''}`}>{sel === p.label && <Check size={13} />}</span>
            </button>
          ))}
          {results.length === 0 && (
            <p className="ad2-hint">{q.trim().length >= 3 ? 'No matches — try a different name.' : 'Search for your apartment or society.'}</p>
          )}
        </div>
        <button className="ad2-notlisted" onClick={() => onDone(q.trim())}><Building2 size={15} /> My apartment is not listed</button>
      </div>
    </div>
  )
}
