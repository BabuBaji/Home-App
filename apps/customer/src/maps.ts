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
