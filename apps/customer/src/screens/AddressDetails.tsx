import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useToast } from '../components/UI'
import { useStore } from '../store'
import { addAddressApi, updateAddressApi, updateMe } from '../api'
import type { Address } from '../types'

interface LocState { label?: string; name?: string; sub?: string; pincode?: string | null; lat?: number; lng?: number; edit?: Address }

// Step after the map picker (or Edit on a saved address): capture flat/floor/building/landmark +
// receiver phone against the pinned locality, then save it as the default address (drives zone/pricing).
export default function AddressDetails() {
  const nav = useNavigate()
  const toast = useToast()
  const { user, setUser } = useStore()
  const st = (useLocation().state || {}) as LocState
  const edit = st.edit

  const localityText = edit ? edit.line : (st.sub || st.label || '')
  const pincode = (edit ? edit.pincode : st.pincode) || (localityText.match(/\b\d{6}\b/) || [''])[0]
  const cityGuess = edit ? (edit.city || '') : ((st.label || '').replace(/\s*-\s*\d{6}\s*$/, '').split(',').map((s) => s.trim()).filter(Boolean).pop() || '')

  const [label, setLabel] = useState(edit?.label || 'Home')
  const [house, setHouse] = useState(edit?.house || '')
  const [floor, setFloor] = useState(edit?.floor || '')
  const [apartment, setApartment] = useState(edit?.apartment || st.name || '')
  const [landmark, setLandmark] = useState(edit?.landmark || '')
  const [phone, setPhone] = useState((edit?.receiver_phone || user?.phone || '').replace(/\D/g, '').slice(-10))
  // Home profile — house size + appliance/room counts, captured while adding the address.
  const [homeSize, setHomeSize] = useState(edit?.home_size || '')
  const [bedrooms, setBedrooms] = useState(edit?.bedrooms ?? 0)
  const [bathrooms, setBathrooms] = useState(edit?.bathrooms ?? 0)
  const [fans, setFans] = useState(edit?.fans ?? 0)
  const [acs, setAcs] = useState(edit?.acs ?? 0)
  const [saving, setSaving] = useState(false)

  // Picking a BHK size prefills bedroom/bathroom counts (only when still empty) as a sensible start.
  function pickSize(v: string) {
    setHomeSize(v)
    const n = parseInt(v) || 0
    if (n > 0) { setBedrooms((b) => b || n); setBathrooms((b) => b || n) }
  }

  // no location carried in → send back to the map
  useEffect(() => { if (!edit && !st.label && !st.lat) nav('/onboarding/location', { replace: true }) }, []) // eslint-disable-line
  if (!edit && !st.label && !st.lat) return null

  const canSave = !!house.trim() && !!apartment.trim() && phone.trim().length >= 10 && !!homeSize

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      const body = {
        label, house: house.trim(), floor: floor.trim(), apartment: apartment.trim(), landmark: landmark.trim(),
        street: edit ? (edit.street || '') : (st.label || '').split(' - ')[0], city: cityGuess, pincode,
        receiver_phone: phone.trim(), lat: edit ? edit.lat : st.lat, lng: edit ? edit.lng : st.lng,
        home_size: homeSize, bedrooms, bathrooms, fans, acs,
      }
      if (edit) await updateAddressApi(edit.id, body as Partial<Address>)
      else await addAddressApi({ ...body, makeDefault: true } as any)
      // reflect the (new/edited) default on the profile so the header + zone update immediately
      const { user: u } = await updateMe({ city: cityGuess, location: localityText })
      setUser(u)
      toast(edit ? 'Address updated' : 'Address saved')
      nav('/home', { replace: true })
    } catch (e) { toast((e as Error).message); setSaving(false) }
  }

  return (
    <div className="ad-screen">
      <div className="ad-top">
        <button className="mp-back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={20} /></button>
        <b>{edit ? 'Edit address details' : 'Add address details'}</b>
      </div>

      <div className="ad-body">
        <div className="ad-card">
          <div className="ad-h">Address details</div>
          <div className="ad-sub">Save address as</div>
          <div className="ad-labels">
            {['Home', 'Other'].map((l) => (
              <button key={l} className={label === l ? 'on' : ''} onClick={() => setLabel(l)}>{l}</button>
            ))}
          </div>
          <div className="ad-grid">
            <input className="ad-fld" placeholder="Flat/House No.*" value={house} onChange={(e) => setHouse(e.target.value)} />
            <input className="ad-fld" placeholder="Floor (Optional)" value={floor} onChange={(e) => setFloor(e.target.value)} />
          </div>
          <input className="ad-fld" placeholder="Apartment / Building name*" value={apartment} onChange={(e) => setApartment(e.target.value)} />
          <input className="ad-fld" placeholder="Nearby Landmark (Optional)" value={landmark} onChange={(e) => setLandmark(e.target.value)} />
        </div>

        <div className="ad-card">
          <div className="ad-h">Home profile</div>
          <div className="ad-sub">Helps us bring the right people & tools for your home.</div>
          <div className="ad-sub2">House size*</div>
          <div className="hp-sizes">
            {['1BHK', '2BHK', '3BHK', '4+ BHK'].map((s) => (
              <button key={s} className={homeSize === s ? 'on' : ''} onClick={() => pickSize(s)}>{s.replace('BHK', ' BHK')}</button>
            ))}
          </div>
          <div className="hp-steps">
            <Stepper label="Bedrooms" value={bedrooms} onChange={setBedrooms} />
            <Stepper label="Bathrooms" value={bathrooms} onChange={setBathrooms} />
            <Stepper label="Fans" value={fans} onChange={setFans} />
            <Stepper label="ACs" value={acs} onChange={setAcs} />
          </div>
        </div>

        <div className="ad-card">
          <div className="ad-loc-row">
            <div className="grow">
              <div className="ad-loc-label">Area/Sector/Locality*</div>
              <div className="ad-loc-text">{localityText || 'Selected on map'}</div>
            </div>
            <button className="ad-change" onClick={() => nav('/onboarding/location')}>Change</button>
          </div>
        </div>

        <div className="ad-card">
          <div className="ad-h">Receiver details</div>
          <div className="ad-sub">Our professional will reach out to you on this number.</div>
          <div className="ad-phone">
            <span className="ad-cc">+91</span>
            <input className="ad-fld phone" placeholder="Receiver's phone number*" inputMode="numeric" maxLength={10}
              value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
          </div>
        </div>
      </div>

      <div className="ad-foot">
        <button className="mp-confirm" onClick={save} disabled={!canSave || saving}>{saving ? 'Saving…' : 'Save address'}</button>
      </div>
    </div>
  )
}

// A compact −/+ counter row for a home-profile quantity (bedrooms, fans, ACs…).
function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="hp-row">
      <span className="hp-lbl">{label}</span>
      <div className="hp-step">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`decrease ${label}`}>−</button>
        <b>{value}</b>
        <button type="button" onClick={() => onChange(value + 1)} aria-label={`increase ${label}`}>+</button>
      </div>
    </div>
  )
}
