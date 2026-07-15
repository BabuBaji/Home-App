import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Search, LocateFixed, MapPin } from 'lucide-react'
import { useToast } from '../../components/UI'
import { fetchMapsKey } from '../../api'
import { loadGoogleMaps } from '../../maps'
import { getCurrentPosition, reverseGeocodeFull, searchPlaces, placeDetails, GeoError, type Place } from '../../geo'

export interface PickedLocation { label: string; name: string; sub: string; pincode: string | null; city: string; lat: number; lng: number }

// Module 3 · #17 — Select on Map (overlay). Reuses the app's Google-map picker: pan a fixed
// centre pin, reverse-geocode it, confirm. Returns the location to the Add Address form.
const HYD = { lat: 17.4483, lng: 78.3915 }

export default function MapPicker({ onDone, onClose }: { onDone: (loc: PickedLocation) => void; onClose: () => void }) {
  const toast = useToast()
  const mapDiv = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const revTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ready, setReady] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [addr, setAddr] = useState<PickedLocation | null>(null)
  const [resolving, setResolving] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])

  async function resolveCentre() {
    const m = mapRef.current; if (!m) return
    const c = m.getCenter(); if (!c) return
    const lat = c.lat(), lng = c.lng()
    setResolving(true)
    const g = await reverseGeocodeFull(lat, lng)
    setResolving(false)
    if (g) setAddr({ label: g.label || [g.area, g.city].filter(Boolean).join(', ') || 'Selected location', name: g.name, sub: g.sub, pincode: g.pincode, city: g.city, lat, lng })
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { key } = await fetchMapsKey()
        const gmaps = await loadGoogleMaps(key)
        if (cancelled || !mapDiv.current) return
        let centre = HYD
        try { centre = await getCurrentPosition() } catch { /* keep default */ }
        if (cancelled || !mapDiv.current) return
        const map = new gmaps.Map(mapDiv.current, { center: centre, zoom: 17, disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false, keyboardShortcuts: false })
        mapRef.current = map
        setReady(true)
        map.addListener('idle', () => { if (revTimer.current) clearTimeout(revTimer.current); revTimer.current = setTimeout(resolveCentre, 350) })
      } catch (e) { setLoadErr((e as Error).message || 'Could not load the map') }
    })()
    return () => { cancelled = true; if (revTimer.current) clearTimeout(revTimer.current) }
  }, [])

  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    const t = setTimeout(() => { searchPlaces(q).then(setResults).catch(() => {}) }, 400)
    return () => clearTimeout(t)
  }, [q])

  async function pickResult(p: Place) {
    setQ(''); setResults([])
    let { lat, lng } = p
    if ((!lat || !lng) && p.placeId) { const d = await placeDetails(p.placeId); if (d?.lat && d?.lng) { lat = d.lat; lng = d.lng } }
    if (lat && lng) mapRef.current?.panTo({ lat, lng })
  }
  async function goToCurrent() {
    try { mapRef.current?.panTo(await getCurrentPosition()) }
    catch (e) { toast(e instanceof GeoError && e.reason === 'permission' ? 'Allow location permission to use this' : 'Could not get your location') }
  }

  const headline = resolving ? 'Locating…' : (addr ? (addr.name || addr.label.split(' - ')[0]) : 'Move the map to your spot')

  return (
    <div className="ad2-overlay m2">
      <div className="ps-top">
        <button className="au-back" onClick={onClose} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Select on Map</b><span style={{ width: 42 }} />
      </div>

      <div className="mp-search">
        <div className="mp-search-box"><Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for area, street or landmark" />
        </div>
        {results.length > 0 && (
          <div className="mp-results">
            {results.map((p, i) => (
              <button key={i} className="mp-result" onClick={() => pickResult(p)}>
                <MapPin size={15} /><span className="grow"><b>{p.label}</b>{p.sub && <span className="mp-r-sub">{p.sub}</span>}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mp-map-wrap">
        <div ref={mapDiv} className="mp-map" />
        <div className="mp-radius" aria-hidden><span /><span /></div>
        <div className="mp-pin" aria-hidden>
          {addr && <div className="mp-pin-tip"><span>Set this as your location</span><b>{addr.name || addr.label.split(' - ')[0].split(',')[0]}</b></div>}
          <MapPin size={42} className="mp-pin-ic" fill="currentColor" />
        </div>
        <button className="mp-locate" onClick={goToCurrent}><LocateFixed size={16} /> Go to current location</button>
        {!ready && !loadErr && <div className="mp-map-msg">Loading map…</div>}
        {loadErr && <div className="mp-map-msg err">{loadErr}</div>}
      </div>

      <div className="ad2-mapsheet">
        <div className="ad2-mapaddr">
          <MapPin size={20} className="ad2-mapaddr-ic" />
          <div className="grow"><b>{headline}</b><div className="ad2-mapaddr-sub">{addr?.label || (addr?.pincode ? `Pincode ${addr.pincode}` : 'Pan the map to place the pin')}</div></div>
        </div>
        <button className="au-btn" onClick={() => addr && onDone(addr)} disabled={!addr}>Use This Location</button>
      </div>
    </div>
  )
}
