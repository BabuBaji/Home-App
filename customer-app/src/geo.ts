import { Geolocation } from '@capacitor/geolocation'

export interface Place { label: string; sub?: string; lat: number; lng: number }

/** Native GPS via Capacitor (falls back to browser geolocation on web). */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  try {
    const perm = await Geolocation.checkPermissions()
    if (perm.location !== 'granted') {
      const r = await Geolocation.requestPermissions()
      if (r.location !== 'granted') throw new Error('Location permission denied')
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch (e) {
    // browser fallback
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(e)
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000 },
      )
    })
  }
}

const NOMINATIM = 'https://nominatim.openstreetmap.org'

export async function reverseGeocode(lat: number, lng: number): Promise<{ label: string; sub: string; raw: any }> {
  const res = await fetch(`${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error('reverse geocode failed')
  const j = await res.json()
  const a = j.address || {}
  const area = a.suburb || a.neighbourhood || a.village || a.town || a.city_district || a.locality || ''
  const city = a.city || a.town || a.state_district || a.state || ''
  const label = [area, city].filter(Boolean).join(', ') || j.display_name?.split(',').slice(0, 2).join(',') || 'Current location'
  return { label, sub: j.display_name || '', raw: j }
}

/** Nearby places: query Nominatim around the coordinates. */
export async function nearbyPlaces(lat: number, lng: number, city: string): Promise<Place[]> {
  try {
    const q = encodeURIComponent(city || 'area')
    const res = await fetch(`${NOMINATIM}/search?format=jsonv2&q=${q}&limit=6&addressdetails=1`, { headers: { Accept: 'application/json' } })
    const list = await res.json()
    return (Array.isArray(list) ? list : []).map((r: any) => ({
      label: r.display_name.split(',').slice(0, 2).join(',').trim(),
      sub: r.display_name,
      lat: +r.lat, lng: +r.lon,
    }))
  } catch { return [] }
}

export async function searchPlaces(q: string): Promise<Place[]> {
  if (!q.trim()) return []
  try {
    const res = await fetch(`${NOMINATIM}/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=6&addressdetails=1&countrycodes=in,us,gb,ae,sg,au,ca`, { headers: { Accept: 'application/json' } })
    const list = await res.json()
    return (Array.isArray(list) ? list : []).map((r: any) => ({
      label: r.display_name.split(',').slice(0, 2).join(',').trim(),
      sub: r.display_name,
      lat: +r.lat, lng: +r.lon,
    }))
  } catch { return [] }
}
