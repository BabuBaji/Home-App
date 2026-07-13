import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Search, LocateFixed, MapPin } from 'lucide-react'
import { useToast } from '../components/UI'
import { fetchMapsKey } from '../api'
import { loadGoogleMaps } from '../maps'
import { getCurrentPosition, reverseGeocodeFull, searchPlaces, placeDetails, GeoError, type Place } from '../geo'

const HYD = { lat: 17.4483, lng: 78.3915 } // default centre (Hyderabad) when GPS is unavailable

// Rapido/Pronto-style location picker: a live Google map with a fixed centre pin. Panning the map
// reverse-geocodes the pin's point (via our Google-backed endpoint) into an address + pincode.
export default function LocationSelect() {
  const nav = useNavigate()
  const toast = useToast()
  const initCentre = (useLocation().state as { center?: { lat: number; lng: number } } | null)?.center || null
  const mapDiv = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const revTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [ready, setReady] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [addr, setAddr] = useState<{ label: string; name: string; sub: string; pincode: string | null; lat: number; lng: number } | null>(null)
  const [resolving, setResolving] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])

  // reverse-geocode the current map centre (the pin sits at the centre)
  async function resolveCentre() {
    const m = mapRef.current
    if (!m) return
    const c = m.getCenter()
    if (!c) return
    const lat = c.lat(), lng = c.lng()
    setResolving(true)
    const g = await reverseGeocodeFull(lat, lng)
    setResolving(false)
    if (g) {
      const label = g.label || [g.area, g.city].filter(Boolean).join(', ') || 'Selected location'
      setAddr({ label, name: g.name, sub: g.sub, pincode: g.pincode, lat, lng })
    }
  }

  // init the map once
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { key } = await fetchMapsKey()
        const gmaps = await loadGoogleMaps(key)
        if (cancelled || !mapDiv.current) return
        // a search result passes an explicit centre; otherwise use the live GPS fix (fall back to Hyderabad)
        let centre = initCentre || HYD
        if (!initCentre) { try { centre = await getCurrentPosition() } catch { /* keep default centre */ } }
        if (cancelled || !mapDiv.current) return
        const map = new gmaps.Map(mapDiv.current, {
          center: centre, zoom: 17, disableDefaultUI: true, gestureHandling: 'greedy',
          clickableIcons: false, keyboardShortcuts: false,
        })
        mapRef.current = map
        setReady(true)
        map.addListener('idle', () => {
          if (revTimer.current) clearTimeout(revTimer.current)
          revTimer.current = setTimeout(resolveCentre, 350)
        })
      } catch (e) {
        setLoadErr((e as Error).message || 'Could not load the map')
      }
    })()
    return () => { cancelled = true; if (revTimer.current) clearTimeout(revTimer.current) }
  }, [])

  // debounced place search
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

  // Confirm → go to the address-details form, carrying the pinned point + resolved locality.
  function confirm() {
    if (!addr) return toast('Move the map to your location')
    nav('/address-details', { state: { label: addr.label, name: addr.name, sub: addr.sub, pincode: addr.pincode, lat: addr.lat, lng: addr.lng } })
  }

  const headline = resolving ? 'Locating…' : (addr ? (addr.name || addr.label.split(' - ')[0]) : 'Move the map to your spot')

  return (
    <div className="mp-screen">
      <div className="mp-top">
        <button className="mp-back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={20} /></button>
        <b>Confirm your location</b>
      </div>

      <div className="mp-search">
        <div className="mp-search-box">
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search locality, sector, area" />
        </div>
        {results.length > 0 && (
          <div className="mp-results">
            {results.map((p, i) => (
              <button key={i} className="mp-result" onClick={() => pickResult(p)}>
                <MapPin size={15} />
                <span className="grow"><b>{p.label}</b>{p.sub && <span className="mp-r-sub">{p.sub}</span>}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mp-map-wrap">
        <div ref={mapDiv} className="mp-map" />
        <div className="mp-pin" aria-hidden>
          {addr && (
            <div className="mp-pin-tip">
              <span>Set this as your location</span>
              <b>{addr.name || addr.label.split(' - ')[0].split(',')[0]}</b>
            </div>
          )}
          <MapPin size={42} className="mp-pin-ic" fill="currentColor" />
        </div>
        <button className="mp-locate" onClick={goToCurrent}><LocateFixed size={16} /> Go to current location</button>
        {!ready && !loadErr && <div className="mp-map-msg">Loading map…</div>}
        {loadErr && <div className="mp-map-msg err">{loadErr}</div>}
      </div>

      <div className="mp-sheet">
        <div className="mp-addr">
          <MapPin size={22} className="mp-addr-ic" />
          <div className="grow">
            <b>{headline}</b>
            <div className="mp-addr-sub">{addr?.sub || (addr?.pincode ? `Pincode ${addr.pincode}` : 'Pan the map to place the pin')}</div>
          </div>
        </div>
        <button className="mp-confirm" onClick={confirm} disabled={!addr}>Confirm location</button>
      </div>
    </div>
  )
}
