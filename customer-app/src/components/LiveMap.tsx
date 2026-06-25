import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getCurrentPosition } from '../geo'
import type { Booking } from '../types'

// Fallback home if GPS is denied (HITEC City, Hyderabad).
const HOME_FALLBACK = { lat: 17.4448, lng: 78.3498 }
const SERVING = ['arrived', 'in_progress', 'completed']

type LL = [number, number]

function haversine(a: LL, b: LL) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1])
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Point at `frac` (0..1) of the total distance along a polyline.
function pointAlong(route: LL[], cum: number[], frac: number): LL {
  if (route.length < 2) return route[0] || [0, 0]
  const target = cum[cum.length - 1] * Math.min(1, Math.max(0, frac))
  for (let i = 1; i < route.length; i++) {
    if (cum[i] >= target) {
      const seg = cum[i] - cum[i - 1] || 1
      const t = (target - cum[i - 1]) / seg
      return [route[i - 1][0] + (route[i][0] - route[i - 1][0]) * t, route[i - 1][1] + (route[i][1] - route[i - 1][1]) * t]
    }
  }
  return route[route.length - 1]
}

export default function LiveMap({ booking }: { booking: Booking }) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const proRef = useRef<L.Marker | null>(null)
  const doneRef = useRef<L.Polyline | null>(null)
  const routeRef = useRef<LL[]>([])
  const cumRef = useRef<number[]>([])

  // init the map once
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let home = HOME_FALLBACK
      try { home = await getCurrentPosition() } catch { /* keep fallback */ }
      if (cancelled || !elRef.current || mapRef.current) return

      const start: LL = [home.lat + 0.024, home.lng + 0.022] // expert ~3 km away
      const homeLL: LL = [home.lat, home.lng]

      const map = L.map(elRef.current, { zoomControl: false, attributionControl: false, dragging: true }).setView(homeLL, 14)
      mapRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      setTimeout(() => map.invalidateSize(), 200)

      const homeIcon = L.divIcon({ html: '<div class="lm-pin lm-home">🏠</div>', className: '', iconSize: [42, 42], iconAnchor: [21, 21] })
      const proIcon = L.divIcon({ html: '<div class="lm-pin lm-pro">🛵</div>', className: 'lm-pro-marker', iconSize: [44, 44], iconAnchor: [22, 22] })
      L.marker(homeLL, { icon: homeIcon }).addTo(map)
      proRef.current = L.marker(start, { icon: proIcon }).addTo(map)

      // real road route via OSRM (free, no key)
      try {
        const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${homeLL[1]},${homeLL[0]}?overview=full&geometries=geojson`)
        const j = await r.json()
        const coords: LL[] = (j.routes?.[0]?.geometry?.coordinates || []).map((c: number[]) => [c[1], c[0]])
        if (!cancelled && coords.length > 1) {
          routeRef.current = coords
          const cum = [0]
          for (let i = 1; i < coords.length; i++) cum[i] = cum[i - 1] + haversine(coords[i - 1], coords[i])
          cumRef.current = cum
          L.polyline(coords, { color: '#c8c3f0', weight: 6, opacity: 1 }).addTo(map)        // remaining route
          doneRef.current = L.polyline([coords[0]], { color: '#5b51e8', weight: 6, opacity: 1 }).addTo(map) // travelled
          map.fitBounds(L.latLngBounds(coords), { padding: [36, 36] })
        }
      } catch { /* no route — markers only */ }
      place()
    })()
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // move the expert along the route as the booking progresses
  useEffect(place, [booking.pos?.lat, booking.status])

  function place() {
    const pro = proRef.current, route = routeRef.current
    if (!pro || route.length < 2) return
    // server emits pos.lat in 0.10..0.88 as a progress proxy; serving => arrived home
    const frac = SERVING.includes(booking.status) ? 1
      : booking.pos ? Math.min(1, Math.max(0, (booking.pos.lat - 0.10) / 0.78)) : 0
    const idx = Math.max(1, Math.round(frac * (route.length - 1)))
    const pt = pointAlong(route, cumRef.current, frac)
    pro.setLatLng(pt)
    doneRef.current?.setLatLngs(route.slice(0, idx + 1).concat([pt]))
  }

  return <div className="map livemap" ref={elRef} />
}
