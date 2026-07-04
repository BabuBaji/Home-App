import { useEffect, useState } from 'react'
import { Header, useToast } from '../components/UI'
import AddressForm from '../components/AddressForm'
import { fetchAddresses, setDefaultAddressApi, deleteAddressApi } from '../api'
import type { Address } from '../types'

export default function Addresses() {
  const toast = useToast()
  const [list, setList] = useState<Address[]>([])
  const [adding, setAdding] = useState(false)
  useEffect(() => { fetchAddresses().then(setList).catch(() => {}) }, [])

  async function makeDefault(id: number) { setList(await setDefaultAddressApi(id)); toast('Default address updated') }
  async function remove(id: number) { setList(await deleteAddressApi(id)); toast('Address removed') }

  return (
    <div className="screen">
      <Header title="My Addresses" />
      <div className="content">
        {list.map((a) => (
          <div key={a.id} className="card pad mt addr-manage">
            <div className="am-top">
              <div className="al">{a.label} {a.is_default ? <span className="def">Default</span> : null}</div>
              {!a.is_default && <button className="rm" onClick={() => remove(a.id)}>🗑</button>}
            </div>
            <div className="muted sm">{a.line}{a.pincode && !a.line.includes(a.pincode) ? ` - ${a.pincode}` : ''}</div>
            {!a.is_default && <button className="btn-text" onClick={() => makeDefault(a.id)}>Set as default</button>}
          </div>
        ))}
        {list.length === 0 && !adding && <div className="state"><div className="ico">📍</div><h3>No saved addresses</h3><p>Add your home, work or any place below.</p></div>}

        {!adding
          ? <button className="add-more" onClick={() => setAdding(true)}>+ Add new address</button>
          : <AddressForm onCancel={() => setAdding(false)} onSaved={(a) => { setAdding(false); setList((p) => [...p, a]) }} />}
      </div>
    </div>
  )
}
