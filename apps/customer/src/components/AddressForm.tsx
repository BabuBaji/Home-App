import { useEffect, useRef, useState } from 'react'
import { useToast } from './UI'
import { addAddressApi, getCachedPosition } from '../api'
import { searchPlaces, placeDetails, checkServiceable, getCurrentPosition, reverseGeocode, GeoError, type Place } from '../geo'
import type { Address } from '../types'

const EMPTY = { label: 'Home', house: '', apartment: '', street: '', landmark: '', city: '', pincode: '' }
type Srv = { serviceable: boolean; reason: string } | null

/** Rich "add address" form: predictive search → auto-fill (lat/lng+pincode), GPS detect,
 *  live service-area check, manual fields. Shared by the booking flow and My Addresses. */
export default function AddressForm({ onSaved, onCancel }: { onSaved: (a: Address) => void; onCancel: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState(false)
  const [srv, setSrv] = useState<Srv>(null)
  const [detecting, setDetecting] = useState(false)
  const [saving, setSaving] = useState(false)

  // debounced predictive search (Google Places → OSM on the backend)
  useEffect(() => {
    if (picked || q.trim().length < 3) { setResults([]); return }
    setSearching(true)
    const cached = getCachedPosition()
    const coords = cached ? { lat: cached.lat, lng: cached.lng } : null
    const t = setTimeout(async () => { setResults(await searchPlaces(q, coords)); setSearching(false) }, 400)
    return () => clearTimeout(t)
  }, [q, picked])

  // re-check the service area whenever the pincode/city changes (debounced)
  const srvTimer = useRef<any>(null)
  useEffect(() => {
    const pin = form.pincode.trim()
    if (srvTimer.current) clearTimeout(srvTimer.current)
    if (!pin && !form.city.trim()) { setSrv(null); return }
    srvTimer.current = setTimeout(async () => {
      setSrv(await checkServiceable(pin || undefined, form.city.trim() || undefined))
    }, 500)
    return () => srvTimer.current && clearTimeout(srvTimer.current)
  }, [form.pincode, form.city])

  async function choosePlace(p: Place) {
    setPicked(true); setResults([]); setQ(p.label)
    let pincode = p.pincode || ''
    let full = p.sub || p.label
    if (p.placeId) {
      const d = await placeDetails(p.placeId)
      if (d) { pincode = (d.pincode as string) || pincode; full = d.sub || full }
    }
    const parts = full.split(',').map((s) => s.trim()).filter(Boolean)
    const cityGuess = parts.length >= 3 ? parts[parts.length - 3] : (parts[1] || '')
    setForm((f) => ({ ...f, apartment: p.label, street: parts.slice(0, 2).join(', '), city: cityGuess.replace(/\d{6}/, '').trim(), pincode }))
  }

  async function detect() {
    setDetecting(true)
    try {
      const { lat, lng } = await getCurrentPosition()
      const rev = await reverseGeocode(lat, lng).catch(() => ({ label: 'Current location', sub: '', raw: {} as any }))
      const a = (rev as any).raw?.address || {}
      const pincode = a.postcode || (rev.sub.match(/\b\d{6}\b/) || [''])[0] || ''
      const city = a.city || a.town || a.state_district || a.state || ''
      setPicked(true); setQ(rev.label)
      setForm((f) => ({ ...f, apartment: rev.label, street: rev.sub.split(',').slice(0, 2).join(', '), city, pincode }))
      toast('Location detected')
    } catch (e) {
      const reason = e instanceof GeoError ? e.reason : 'unavailable'
      toast(reason === 'permission' ? 'Allow location permission, or enter the address below.'
        : reason === 'disabled' ? 'Turn on GPS, or enter the address below.'
        : 'Could not detect location. Enter the address below.')
    } finally { setDetecting(false) }
  }

  async function save() {
    if (!form.house && !form.street) return toast('Enter at least house & street')
    if (srv && !srv.serviceable) return toast("Sorry, we don't serve this area yet")
    setSaving(true)
    try {
      const a = await addAddressApi(form)
      toast('Address saved')
      onSaved(a)
    } catch (e) { toast((e as Error).message); setSaving(false) }
  }

  const F = (k: keyof typeof form, ph: string, half = false) => (
    <input className={`fld ${half ? 'half' : ''}`} placeholder={ph} value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
  )
  const notServiceable = !!srv && !srv.serviceable

  return (
    <div className="card pad mt">
      <div className="am-form-head">
        <div className="label normal">New address</div>
        <button className="detect-chip" onClick={detect} disabled={detecting}>{detecting ? '⏳ Detecting…' : '📍 Use GPS'}</button>
      </div>

      {/* predictive search: apartment / area / street */}
      <div className="search" style={{ marginBottom: 6 }}>
        <span>🔍</span>
        <input value={q} onChange={(e) => { setQ(e.target.value); setPicked(false) }} placeholder="Search apartment, area, street…" />
      </div>
      {!picked && q.trim().length >= 3 && (
        <div className="ac-list">
          {searching && <div className="ac-empty">Searching…</div>}
          {!searching && results.length === 0 && <div className="ac-empty">No matches</div>}
          {results.map((p, i) => (
            <button key={i} className="loc-row" onClick={() => choosePlace(p)}>
              <span className="lr-ic">📍</span>
              <span className="grow"><span className="lr-l">{p.label}</span>{p.sub && <span className="lr-s">{p.sub}</span>}</span>
            </button>
          ))}
        </div>
      )}

      {srv && (srv.serviceable
        ? <div className="srv-ok">✓ Great! We serve this area{form.pincode ? ` (${form.pincode})` : ''}.</div>
        : <div className="srv-no">🚫 Sorry, we don’t serve {form.pincode || 'this area'} yet.</div>)}

      <div className="lbl-row">
        {['Home', 'Work', 'Other'].map((l) => (
          <button key={l} className={form.label === l ? 'on' : ''} onClick={() => setForm({ ...form, label: l })}>{l}</button>
        ))}
      </div>
      <div className="fld-grid">
        {F('house', 'House / Flat no.', true)}{F('apartment', 'Apartment / Building', true)}
        {F('street', 'Street / Area')}
        {F('landmark', 'Landmark (optional)')}
        {F('city', 'City', true)}{F('pincode', 'Pincode', true)}
      </div>
      <div className="row-btns">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn" onClick={save} disabled={notServiceable || saving}>{saving ? 'Saving…' : 'Save address'}</button>
      </div>
    </div>
  )
}
