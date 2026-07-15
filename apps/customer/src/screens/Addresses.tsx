import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Home as HomeIcon, Briefcase, MapPin, Pencil, Trash2, ArrowUpDown, Plus, Star } from 'lucide-react'
import { useToast } from '../components/UI'
import { fetchAddresses, deleteAddressApi } from '../api'
import type { Address } from '../types'

// Module 3 · #15 — My Addresses. Real address list via fetchAddresses; edit/delete/add use
// the existing APIs. UI redesigned to the mock. No backend change.
export function labelIcon(label: string) {
  const l = (label || '').toLowerCase()
  if (l.includes('home')) return HomeIcon
  if (l.includes('work') || l.includes('office')) return Briefcase
  return MapPin
}

export default function Addresses() {
  const nav = useNavigate()
  const toast = useToast()
  const [list, setList] = useState<Address[] | null>(null)
  useEffect(() => { fetchAddresses().then(setList).catch(() => setList([])) }, [])

  async function remove(id: number) {
    try { setList(await deleteAddressApi(id)); toast('Address removed') }
    catch (e) { toast((e as Error).message) }
  }

  return (
    <div className="screen m2">
      <div className="ps-top">
        <button className="au-back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>My Addresses</b>
        <button className="ad2-addnew" onClick={() => nav('/addresses/add')}><Plus size={15} /> Add New</button>
      </div>
      <div className="content">
        {list?.map((a) => {
          const Ic = labelIcon(a.label)
          return (
            <div key={a.id} className="ad2-card">
              <button className="ad2-body" onClick={() => nav('/addresses/default')}>
                <span className="ad2-ic"><Ic size={20} /></span>
                <div className="grow">
                  <div className="ad2-h"><b>{a.label}</b>{a.is_default ? <span className="ad2-def">Default</span> : null}</div>
                  <div className="ad2-line">{a.line}{a.pincode && !a.line.includes(a.pincode) ? ` ${a.pincode}` : ''}</div>
                  {a.landmark && <div className="ad2-lm">Landmark: {a.landmark}</div>}
                </div>
              </button>
              <div className="ad2-actions">
                <button className="ad2-edit" onClick={() => nav('/addresses/add', { state: { edit: a } })}><Pencil size={13} /> Edit</button>
                <button className="ad2-del" onClick={() => remove(a.id)}><Trash2 size={13} /> Delete</button>
              </div>
            </div>
          )
        })}
        {list && list.length === 0 && (
          <div className="state"><div className="ico"><MapPin size={44} /></div><h3>No saved addresses</h3><p>Add your home, work or any place.</p></div>
        )}
        {list && list.length > 0 && (<>
          <button className="ad2-reorder" onClick={() => nav('/addresses/saved')}><ArrowUpDown size={15} /> Reorder Addresses</button>
          <button className="ad2-reorder" onClick={() => nav('/addresses/default')}><Star size={15} /> Set Default Address</button>
        </>)}
      </div>
    </div>
  )
}
