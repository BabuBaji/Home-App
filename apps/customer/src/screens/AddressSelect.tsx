import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, FooterCTA, useToast } from '../components/UI'
import { useStore } from '../store'
import { fetchAddresses, addAddressApi } from '../api'
import type { Address } from '../types'

const EMPTY = { label: 'Home', house: '', apartment: '', street: '', landmark: '', city: '', pincode: '' }

export default function AddressSelect() {
  const nav = useNavigate()
  const toast = useToast()
  const { addressLine, setAddressLine } = useStore()
  const [list, setList] = useState<Address[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY)

  function load() {
    fetchAddresses().then((a) => {
      setList(a)
      const def = a.find((x) => x.is_default) || a[0]
      if (def) { setSel(def.id); setAddressLine(def.line) }
    }).catch(() => {})
  }
  useEffect(load, [])

  function pick(a: Address) { setSel(a.id); setAddressLine(a.line) }

  async function save() {
    if (!form.house && !form.street) return toast('Enter at least house & street')
    try {
      const a = await addAddressApi(form)
      toast('Address saved'); setAdding(false); setForm(EMPTY)
      setList((p) => [...p, a]); setSel(a.id); setAddressLine(a.line)
    } catch (e) { toast((e as Error).message) }
  }

  function useCurrent() {
    const line = '221B, Baker Street, Bandra West, Mumbai - 400050'
    setAddressLine(line); setSel(-1); toast('Using current location')
  }

  const F = (k: keyof typeof form, ph: string, half = false) => (
    <input className={`fld ${half ? 'half' : ''}`} placeholder={ph} value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
  )

  return (
    <div className="screen">
      <Header title="Select Address" />
      <div className="content pad-cta">
        <button className="cur-loc" onClick={useCurrent}>
          <span className="ci">📍</span><div className="grow"><b>Use current location</b><div className="muted sm">Bandra West, Mumbai</div></div><span>›</span>
        </button>

        {sel === -1 && <div className="sel-note">✓ Using current location</div>}

        <h3 className="section-title">Saved addresses</h3>
        {list.map((a) => (
          <div key={a.id} className={`addr-card ${sel === a.id ? 'sel' : ''}`} onClick={() => pick(a)}>
            <span className="radio">{sel === a.id ? '✓' : ''}</span>
            <div className="grow">
              <div className="al">{a.label} {a.is_default ? <span className="def">Default</span> : null}</div>
              <div className="muted sm">{a.line}</div>
            </div>
          </div>
        ))}

        {!adding ? (
          <button className="add-more" onClick={() => setAdding(true)}>+ Add new address</button>
        ) : (
          <div className="card pad mt">
            <div className="label normal">New address</div>
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
              <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn" onClick={save}>Save address</button>
            </div>
          </div>
        )}
      </div>

      <FooterCTA>
        <button className="btn full" disabled={!addressLine} onClick={() => nav('/schedule')}>Continue</button>
      </FooterCTA>
    </div>
  )
}
