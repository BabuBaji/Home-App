import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MapPin, Bell, Info, Check } from 'lucide-react'
import { getCurrentPosition, reverseGeocodeFull, GeoError, type RevGeo } from '../geo'
import { ensureNotifPermission } from '../notify'
import { updateMe, fetchAddresses } from '../api'
import { useStore } from '../store'
import { useToast } from '../components/UI'
import { t } from '../i18n'

/* Module-1 #6 — Allow Permissions (Location & Notifications). "Allow & Continue" captures
   the exact live GPS fix (OS prompt), reverse-geocodes it to a full street-level address,
   and stores it as the profile's default address via the existing updateMe API. This screen
   is the FIRST writer of the user's location, so the backend creates the default address from
   the precise address (not the fallback city). Denial → falls back to the chosen city. */
export default function Permissions() {
  const nav = useNavigate()
  const { setUser } = useStore()
  const toast = useToast()
  const st = useLocation().state as { city?: string; back?: boolean } | null
  const selectedCity = st?.city || ''
  // Opened from Profile ▸ Privacy (not onboarding): return there instead of starting at Home.
  const done = () => (st?.back ? nav(-1) : nav('/home', { replace: true }))
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
      toast(g ? t('Location set: {line}', { line }) : t('Location captured'))
    } catch (e) {
      if (selectedCity) try { await saveLocation(selectedCity) } catch { /* ignore */ }   // fall back to the chosen city
      const denied = e instanceof GeoError && e.reason === 'permission'
      toast(denied ? t('Location off — using your city; set exact address later.') : t('Could not get GPS — using your city.'))
    }
    try { await ensureNotifPermission() } catch { /* denied — continue */ }
    setBusy(false)
    // opened from elsewhere (e.g. profile) → go back; first-time sign-in → flat details, then home
    if (st?.back) done(); else await goNext()
  }

  async function notNow() {
    if (selectedCity) try { await saveLocation(selectedCity) } catch { /* ignore */ }
    if (st?.back) done(); else await goNext()
  }

  return (
    <div className="auth auth-perm">
      <div className="content au-body">
        <h1 className="au-h1">{t('Allow')} <span className="av">{t('Permissions')}</span></h1>
        <p className="au-sub">{t('To provide you the best service experience')}</p>

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
          <div className="grow"><b>{t('Location Access')}</b><small>{t('Helps us find services near you and track your bookings')}</small></div>
          <span className="ap-tick"><Check size={13} /></span>
        </div>
        <div className="ap-card">
          <span className="ap-ic"><Bell size={20} /></span>
          <div className="grow"><b>{t('Notifications')}</b><small>{t('Stay updated on your bookings and offers')}</small></div>
          <span className="ap-tick muted"><Check size={13} /></span>
        </div>

        <p className="ap-note"><Info size={15} /> {t('You can change these permissions anytime in settings.')}</p>
      </div>
      <div className="au-foot">
        <button className="au-btn" onClick={allow} disabled={busy}>{busy ? t('Getting your location…') : t('Allow & Continue')}</button>
        <button className="au-btn-text" onClick={notNow} disabled={busy}>{t('Not Now')}</button>
      </div>
    </div>
  )
}
