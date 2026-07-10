import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, FooterCTA } from '../components/UI'
import AddressForm from '../components/AddressForm'
import { useStore } from '../store'
import { fetchAddresses } from '../api'
import type { Address } from '../types'

export default function AddressSelect() {
  const nav = useNavigate()
  const { addressLine, setAddressLine } = useStore()
  const [list, setList] = useState<Address[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)

  function load() {
    fetchAddresses().then((a) => {
      setList(a)
      const def = a.find((x) => x.is_default) || a[0]
      if (def) { setSel(def.id); setAddressLine(def.line) }
    }).catch(() => {})
  }
  useEffect(load, [])

  function pick(a: Address) { setSel(a.id); setAddressLine(a.line) }

  return (
    <div className="screen">
      <Header title="Select Address" />
      <div className="content pad-cta">
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
        {list.length === 0 && !adding && <div className="muted sm" style={{ padding: '4px 2px 8px' }}>No saved addresses yet — add one below.</div>}

        {!adding
          ? <button className="add-more" onClick={() => setAdding(true)}>+ Add new address</button>
          : <AddressForm onCancel={() => setAdding(false)} onSaved={(a) => { setAdding(false); setList((p) => [...p, a]); setSel(a.id); setAddressLine(a.line) }} />}
      </div>

      <FooterCTA>
        <button className="btn full" disabled={!addressLine} onClick={() => nav('/schedule')}>Continue</button>
      </FooterCTA>
    </div>
  )
}
