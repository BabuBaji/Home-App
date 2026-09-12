import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MapPin, Bell, Info, Check } from 'lucide-react'
import { getCurrentPosition, reverseGeocodeFull, GeoError, type RevGeo } from '../geo'
import { ensureNotifPermission } from '../notify'
import { updateMe, fetchAddresses } from '../api'
import { useStore } from '../store'
import { useToast } from '../components/UI'

/* Module-1 #6 — Allow Permissions (Location & Notifications). "Allow & Continue" captures
   the exact live GPS fix (OS prompt), reverse-geocodes it to a full street-level address,
   and stores it as the profile's default address via the existing updateMe API. This screen
   is the FIRST writer of the user's location, so the backend creates the default address from
   the precise address (not the fallback city). Denial → falls back to the chosen city. */
export default function Permissions() {
  const nav = useNavigate()
  const { setUser } = useStore()
  const toast = useToast()
  const selectedCity = (useLocation().state as { city?: string } | null)?.city || 'Hyderabad'
  const [busy, setBusy] = useState(false)

  // "<street>, <locality>, <area>, <city> - <PIN>" from a reverse-geocode result.
  function streetLine(g: RevGeo): string {
    const parts = (g.sub || '').split(',').map((s) => s.trim()).filter(Boolean)
    const lead = parts.slice(0, 2).filter((p) => p && p !== g.area && p !== g.city)
    const place = [...lead, g.area, g.city].filter((v, i, a) => v && a.indexOf(v) === i).join(', ')
    return (place || g.label) + (g.pincode ? ` - ${g.pincode}` : '')
  }

  async function saveLocation(loc: string) {
    const { user: u } = await updateMe({ location: loc })
    setUser(u)
  }

  /* Where to go once the location is written. saveLocation only records the locality LINE — the
     backend's default address comes out with house/flat, floor and the home profile empty, and
     nothing else in the sign-in flow ever asks for them. So a first-time user is handed on to
     AddressDetails (prefilled from that default address, which it updates rather than duplicates).
     Anyone whose address already carries those fields skips it and lands on home as before. */
  async function goNext() {
    try {
      const addrs = await fetchAddresses()
      const def = addrs.find((a) => a.is_default) || addrs[0]
      if (def && !def.house && !def.apartment) {
        nav('/address-details', { replace: true, state: { edit: def } })
        return
      }
    } catch { /* address lookup failed — never block sign-in on it */ }
    nav('/home', { replace: true })
  }

  async function allow() {
    setBusy(true)
    try {
      const pos = await getCurrentPosition()                     // exact live GPS (OS prompt)
      let g = await reverseGeocodeFull(pos.lat, pos.lng)
      if (!g) g = await reverseGeocodeFull(pos.lat, pos.lng)      // retry once (Nominatim hiccup)
      const line = g ? streetLine(g) : `${pos.lat},${pos.lng}`    // full street address, else raw coords (backend geocodes)
      await saveLocation(line)
      try { localStorage.setItem('hh_geo', JSON.stringify({ lat: pos.lat, lng: pos.lng, ts: Date.now() })) } catch { /* ignore */ }
      toast(g ? `Location set: ${line}` : 'Location captured')
    } catch (e) {
      try { await saveLocation(selectedCity) } catch { /* ignore */ }   // fall back to the chosen city
      const denied = e instanceof GeoError && e.reason === 'permission'
      toast(denied ? 'Location off — using your city; set exact address later.' : 'Could not get GPS — using your city.')
    }
    try { await ensureNotifPermission() } catch { /* denied — continue */ }
    setBusy(false)
    await goNext()
  }

  async function notNow() {
    try { await saveLocation(selectedCity) } catch { /* ignore */ }
    await goNext()
  }

  return (
    <div className="auth auth-perm">
      <div className="content au-body">
        <h1 className="au-h1">Allow <span className="av">Permissions</span></h1>
        <p className="au-sub">To provide you the best service experience</p>

        <div className="ap-art" aria-hidden>
          <span className="ap-glow" />
          <div className="ap-phone">
            <span className="ap-notch" />
            <div className="ap-map"><MapPin size={38} className="ap-map-pin" fill="currentColor" strokeWidth={0} /></div>
          </div>
          <span className="ap-bell"><Bell size={24} /></span>
        </div>

        <div className="ap-card">
          <span className="ap-ic"><MapPin size={20} /></span>
          <div className="grow"><b>Location Access</b><small>Helps us find services near you and track your bookings</small></div>
          <span className="ap-tick"><Check size={13} /></span>
        </div>
        <div className="ap-card">
          <span className="ap-ic"><Bell size={20} /></span>
          <div className="grow"><b>Notifications</b><small>Stay updated on your bookings and offers</small></div>
          <span className="ap-tick muted"><Check size={13} /></span>
        </div>

        <p className="ap-note"><Info size={15} /> You can change these permissions anytime in settings.</p>
      </div>
      <div className="au-foot">
        <button className="au-btn" onClick={allow} disabled={busy}>{busy ? 'Getting your location…' : 'Allow & Continue'}</button>
        <button className="au-btn-text" onClick={notNow} disabled={busy}>Not Now</button>
      </div>
    </div>
  )
}
