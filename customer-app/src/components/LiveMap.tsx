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

// Point at `frac` (0..1) of the total distance along a polyline (used by the demo sim).
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

// Real worker coordinates (lat/lng) vs. the old 0..1 progress proxy.
function realCoords(b: Booking): LL | null {
  return b.pos && Math.abs(b.pos.lat) > 1 && Math.abs(b.pos.lng) > 1 ? [b.pos.lat, b.pos.lng] : null
}

export default function LiveMap({ booking }: { booking: Booking }) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const proRef = useRef<L.Marker | null>(null)
  const remainRef = useRef<L.Polyline | null>(null) // worker → home route
  const homeRef = useRef<LL | null>(null)
  const routeRef = useRef<LL[]>([])
  const cumRef = useRef<number[]>([])
  const lastRoutedRef = useRef<LL | null>(null)
  const routingRef = useRef(false)

  // (re)fetch a real road route from `from` to home via OSRM and draw it.
  async function drawRoute(from: LL) {
    const home = homeRef.current, map = mapRef.current, line = remainRef.current
    if (!home || !map || !line || routingRef.current) return
    routingRef.current = true
    lastRoutedRef.current = from
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${home[1]},${home[0]}?overview=full&geometries=geojson`)
      const j = await r.json()
      const coords: LL[] = (j.routes?.[0]?.geometry?.coordinates || []).map((c: number[]) => [c[1], c[0]])
      if (coords.length > 1) {
        routeRef.current = coords
        const cum = [0]
        for (let i = 1; i < coords.length; i++) cum[i] = cum[i - 1] + haversine(coords[i - 1], coords[i])
        cumRef.current = cum
        line.setLatLngs(coords)
        map.fitBounds(L.latLngBounds(coords), { padding: [36, 36] })
      }
    } catch { /* keep last route */ } finally { routingRef.current = false }
  }

  // init the map once
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let home = HOME_FALLBACK
      try { home = await getCurrentPosition() } catch { /* keep fallback */ }
      if (cancelled || !elRef.current || mapRef.current) return

      const homeLL: LL = [home.lat, home.lng]
      homeRef.current = homeLL
      const real = realCoords(booking)
      const start: LL = real ?? [home.lat + 0.024, home.lng + 0.022] // worker pos, or ~3 km away

      const map = L.map(elRef.current, { zoomControl: false, attributionControl: false, dragging: true }).setView(homeLL, 14)
      mapRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      setTimeout(() => map.invalidateSize(), 200)

      const homeIcon = L.divIcon({ html: '<div class="lm-pin lm-home">🏠</div>', className: '', iconSize: [42, 42], iconAnchor: [21, 21] })
      const proIcon = L.divIcon({ html: '<div class="lm-pin lm-pro">🛵</div>', className: 'lm-pro-marker', iconSize: [44, 44], iconAnchor: [22, 22] })
      L.marker(homeLL, { icon: homeIcon }).addTo(map)
      proRef.current = L.marker(start, { icon: proIcon }).addTo(map)
      remainRef.current = L.polyline([start, homeLL], { color: '#5b51e8', weight: 6, opacity: 1 }).addTo(map)
      map.fitBounds(L.latLngBounds([start, homeLL]), { padding: [36, 36] })
      drawRoute(start)
    })()
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // react to live position / status changes
  useEffect(() => {
    const pro = proRef.current, home = homeRef.current
    if (!pro || !home) return

    if (SERVING.includes(booking.status)) {       // expert reached the customer
      pro.setLatLng(home)
      remainRef.current?.setLatLngs([home])
      return
    }

    const real = realCoords(booking)
    if (real) {                                   // REAL worker GPS from the worker app
      pro.setLatLng(real)
      const last = lastRoutedRef.current
      if (!last || haversine(last, real) > 0.12) drawRoute(real) // re-route when moved >120 m
      return
    }

    // demo fallback: animate along the precomputed route using the 0..1 proxy
    const route = routeRef.current
    if (route.length >= 2 && booking.pos) {
      const frac = Math.min(1, Math.max(0, (booking.pos.lat - 0.10) / 0.78))
      const pt = pointAlong(route, cumRef.current, frac)
      pro.setLatLng(pt)
      const idx = Math.max(1, Math.round(frac * (route.length - 1)))
      remainRef.current?.setLatLngs(route.slice(idx).length ? route.slice(idx) : [pt, home])
    }
  }, [booking.pos?.lat, booking.pos?.lng, booking.status])

  return <div className="map livemap" ref={elRef} />
}
