import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Check } from 'lucide-react'
import { useToast } from '../components/UI'
import { fetchAddresses, setDefaultAddressApi } from '../api'
import { labelIcon } from './Addresses'
import type { Address } from '../types'

// Module 3 · #21 — Default Address. Pick which saved address is the booking default via the
// existing setDefaultAddressApi. No backend change.
export default function DefaultAddress() {
  const nav = useNavigate()
  const toast = useToast()
  const [list, setList] = useState<Address[] | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchAddresses().then((l) => { setList(l); setSel((l.find((a) => a.is_default) || l[0])?.id ?? null) }).catch(() => setList([]))
  }, [])

  async function save() {
    if (sel == null) return
    setSaving(true)
    try { await setDefaultAddressApi(sel); toast('Default address set'); nav(-1) }
    catch (e) { toast((e as Error).message); setSaving(false) }
  }

  return (
    <div className="screen m2">
      <div className="ps-top">
        <button className="au-back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Default Address</b><span style={{ width: 42 }} />
      </div>
      <div className="content au-body">
        <div className="ad2-hero"><span className="ad2-hero-ic"><MapPin size={40} /></span></div>
        <h2 className="ad2-title">Select Default Address</h2>
        <p className="ad2-desc">This address will be used for all your bookings by default</p>

        <div className="ad2-radios">
          {list?.map((a) => {
            const Ic = labelIcon(a.label)
            return (
              <button key={a.id} className={`ad2-radio-row ${sel === a.id ? 'on' : ''}`} onClick={() => setSel(a.id)}>
                <span className="ad2-rr-ic"><Ic size={18} /></span>
                <div className="grow"><b>{a.label}</b><small>{a.line}{a.pincode && !a.line.includes(a.pincode) ? ` - ${a.pincode}` : ''}</small></div>
                <span className={`au-radio ${sel === a.id ? 'on' : ''}`}>{sel === a.id && <Check size={13} />}</span>
              </button>
            )
          })}
          {list && list.length === 0 && <p className="ad2-hint">No addresses yet — add one first.</p>}
        </div>
      </div>
      <div className="au-foot">
        <button className="au-btn" onClick={save} disabled={saving || sel == null}>{saving ? 'Saving…' : 'Set as Default'}</button>
      </div>
    </div>
  )
}
