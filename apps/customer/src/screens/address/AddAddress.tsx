import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, ChevronRight, MapPin } from 'lucide-react'
import { useToast } from '../../components/UI'
import { addAddressApi, updateAddressApi, setDefaultAddressApi } from '../../api'
import type { Address } from '../../types'
import MapPicker, { type PickedLocation } from './MapPicker'
import ApartmentSelect from './ApartmentSelect'
import LandmarkSelect from './LandmarkSelect'

// Module 3 · #16 — Add Address. Address type, full address (from the map picker), house/flat/floor,
// pincode, landmark, set-as-default. Saves through the existing addAddressApi/updateAddressApi.
// The map/apartment/landmark screens render as full-screen overlays. No backend change.
export default function AddAddress() {
  const nav = useNavigate()
  const toast = useToast()
  const edit = ((useLocation().state || {}) as { edit?: Address }).edit

  const [label, setLabel] = useState(edit?.label || 'Home')
  const [full, setFull] = useState(edit?.line || '')
  const [house, setHouse] = useState([edit?.house, edit?.floor].filter(Boolean).join(', '))
  const [pincode, setPincode] = useState(edit?.pincode || '')
  const [landmark, setLandmark] = useState(edit?.landmark || '')
  const [apartment, setApartment] = useState(edit?.apartment || '')
  const [city, setCity] = useState(edit?.city || '')
  const [lat, setLat] = useState<number | undefined>(edit?.lat)
  const [lng, setLng] = useState<number | undefined>(edit?.lng)
  const [makeDefault, setMakeDefault] = useState(!!edit?.is_default)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<null | 'map' | 'apartment' | 'landmark'>(null)

  function onMapDone(loc: PickedLocation) {
    setFull(loc.label); setCity(loc.city); setPincode(loc.pincode || ''); setLat(loc.lat); setLng(loc.lng)
    if (loc.name) setApartment(loc.name)
    setStep('apartment')          // mock flow 17 → 18
  }

  async function save() {
    if (!full.trim() && !house.trim()) return toast('Add your address (Select on Map or type it)')
    setSaving(true)
    try {
      const body: any = { label, line: full.trim(), house: house.trim(), apartment: apartment.trim(), landmark: landmark.trim(), city: city.trim(), pincode: pincode.trim(), lat, lng }
      if (edit) {
        await updateAddressApi(edit.id, body)
        if (makeDefault && !edit.is_default) await setDefaultAddressApi(edit.id)
      } else {
        await addAddressApi({ ...body, makeDefault })
      }
      toast(edit ? 'Address updated' : 'Address saved')
      nav('/addresses', { replace: true })
    } catch (e) { toast((e as Error).message); setSaving(false) }
  }

  if (step === 'map') return <MapPicker onDone={onMapDone} onClose={() => setStep(null)} />
  if (step === 'apartment') return <ApartmentSelect initial={apartment} onDone={(v) => { if (v) setApartment(v); setStep(null) }} onClose={() => setStep(null)} />
  if (step === 'landmark') return <LandmarkSelect initial={landmark} onDone={(v) => { setLandmark(v); setStep(null) }} onClose={() => setStep(null)} />

  return (
    <div className="screen m2">
      <div className="ps-top">
        <button className="au-back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>{edit ? 'Edit Address' : 'Add Address'}</b><span style={{ width: 42 }} />
      </div>
      <div className="content au-body">
        <div className="ad2-lbl">Address Type</div>
        <div className="ad2-seg">
          {['Home', 'Work', 'Other'].map((l) => (
            <button key={l} className={label === l ? 'on' : ''} onClick={() => setLabel(l)}>{l}</button>
          ))}
        </div>

        <div className="ad2-lbl">Full Address</div>
        <textarea className="ad2-ta" rows={2} value={full} onChange={(e) => setFull(e.target.value)} placeholder="Select on Map or type your full address" />

        <div className="ad2-lbl">House / Flat / Floor</div>
        <input className="ad2-in" value={house} onChange={(e) => setHouse(e.target.value)} placeholder="Flat 101, 1st Floor" />

        <div className="ad2-lbl">Pincode</div>
        <input className="ad2-in" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="500034" />

        <div className="ad2-lbl">Landmark <em>(Optional)</em></div>
        <button className="ad2-pick" onClick={() => setStep('landmark')}>
          <MapPin size={16} /><span className="grow">{landmark || 'Add a nearby landmark'}</span><ChevronRight size={16} />
        </button>

        <button className="au-btn ad2-map-btn" onClick={() => setStep('map')}>Select on Map</button>

        <label className="ad2-check">
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
          <span className="ad2-check-box" /> Set as default address
        </label>
      </div>
      <div className="au-foot">
        <button className="au-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : (edit ? 'Update Address' : 'Save Address')}</button>
      </div>
    </div>
  )
}
