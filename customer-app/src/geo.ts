import { Geolocation } from '@capacitor/geolocation'
import { Capacitor, registerPlugin } from '@capacitor/core'

export interface Place { label: string; sub?: string; lat: number; lng: number }

/** Typed reason so the UI can react ('permission' vs 'disabled' vs generic). */
export class GeoError extends Error {
  constructor(public reason: 'permission' | 'disabled' | 'unavailable', message: string) {
    super(message)
  }
}

// Native bridge (see android/.../LocationServicesPlugin.java) that reports and
// turns on the system location toggle via the in-app "Turn on location" dialog.
interface LocationServicesPlugin {
  check(): Promise<{ enabled: boolean }>
  requestEnable(): Promise<{ enabled: boolean }>
}
const LocationServices = registerPlugin<LocationServicesPlugin>('LocationServices')

/** Ask for app location permission. Returns true if granted.
 *  checkPermissions() can reject when location services are off, so stay tolerant. */
async function ensurePermission(): Promise<boolean> {
  try {
    let perm = await Geolocation.checkPermissions()
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      perm = await Geolocation.requestPermissions()
    }
    return perm.location === 'granted' || perm.coarseLocation === 'granted'
  } catch {
    try {
      const perm = await Geolocation.requestPermissions()
      return perm.location === 'granted' || perm.coarseLocation === 'granted'
    } catch {
      return true // don't block — let the position call surface the real failure
    }
  }
}

/** Make sure the system location toggle is on; pops the system dialog if not. */
export async function ensureLocationEnabled(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true
  try {
    const { enabled } = await LocationServices.check()
    if (enabled) return true
    const r = await LocationServices.requestEnable()
    return r.enabled
  } catch {
    return true // plugin missing — don't block the flow
  }
}

/**
 * Native GPS via Capacitor (falls back to browser geolocation on web).
 * Proactively requests permission and asks the OS to turn on location.
 */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  if (Capacitor.isNativePlatform()) {
    // Turn on the system location toggle FIRST (pops the in-app dialog); doing this
    // before checkPermissions avoids its "location services not enabled" rejection.
    const enabled = await ensureLocationEnabled()
    if (!(await ensurePermission())) throw new GeoError('permission', 'Location permission denied')
    if (!enabled) throw new GeoError('disabled', 'Location is turned off')
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 })
      return { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch {
      // GPS may not get a fix indoors — retry with a faster network/coarse fix.
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 })
      return { lat: pos.coords.latitude, lng: pos.coords.longitude }
    }
  }
  // browser fallback (web)
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new GeoError('unavailable', 'Geolocation not available'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => reject(err?.code === 1 ? new GeoError('permission', 'Location permission denied') : new GeoError('unavailable', 'Could not get location')),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  })
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
