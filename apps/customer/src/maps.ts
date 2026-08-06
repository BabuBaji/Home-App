import 'leaflet/dist/leaflet.css'

// Lazily load the Google Maps JS SDK exactly once. The key is fetched from the backend
// (/api/maps-key) so it isn't baked into the bundle. Resolves with the `google.maps` namespace.
let mapsPromise: Promise<any> | null = null

export function loadGoogleMaps(key: string): Promise<any> {
  const w = window as any
  if (w.google?.maps) return Promise.resolve(w.google.maps)
  if (mapsPromise) return mapsPromise
  mapsPromise = new Promise((resolve, reject) => {
    if (!key) { mapsPromise = null; reject(new Error('Map key not configured')); return }
    const cb = '__gmapsReady'
    w[cb] = () => { resolve(w.google.maps); delete w[cb] }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=${cb}&loading=async`
    s.async = true
    s.defer = true
    s.onerror = () => { mapsPromise = null; reject(new Error('Failed to load Google Maps')) }
    document.head.appendChild(s)
  })
  return mapsPromise
}

/** A minimal, provider-agnostic map for the "pan a fixed centre pin" location picker. */
export interface PickerMap {
  usingGoogle: boolean
  getCenter(): { lat: number; lng: number }
  panTo(c: { lat: number; lng: number }): void
  onIdle(cb: () => void): void
}

/**
 * Build the location-picker map. Uses Google Maps when a key is configured (rich Indian POIs),
 * and otherwise falls back to a keyless OpenStreetMap (Leaflet) map — so location selection works
 * even when no Google Maps key is set. Both back the same fixed-centre-pin UX; panning is
 * reverse-geocoded by the backend (Google → OSM), so the fallback is fully functional.
 */
export async function loadPickerMap(el: HTMLElement, center: { lat: number; lng: number }, key: string): Promise<PickerMap> {
  if (key) {
    const g = await loadGoogleMaps(key)
    const map = new g.Map(el, { center, zoom: 17, disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false, keyboardShortcuts: false })
    return {
      usingGoogle: true,
      getCenter: () => { const c = map.getCenter(); return { lat: c.lat(), lng: c.lng() } },
      panTo: (c) => map.panTo(c),
      onIdle: (cb) => map.addListener('idle', cb),
    }
  }
  const mod = await import('leaflet')
  const L: any = (mod as any).default ?? mod
  const map = L.map(el, { center: [center.lat, center.lng], zoom: 17, zoomControl: false, attributionControl: false })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
  // Leaflet needs a size recheck once its container has been laid out.
  setTimeout(() => map.invalidateSize(), 120)
  return {
    usingGoogle: false,
    getCenter: () => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng } },
    panTo: (c) => map.panTo([c.lat, c.lng]),
    onIdle: (cb) => map.on('moveend', cb),
  }
}
