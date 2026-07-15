import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, MoreVertical, Lightbulb, Star, Pencil, Trash2, MapPin } from 'lucide-react'
import { useToast } from '../components/UI'
import { fetchAddresses, deleteAddressApi, setDefaultAddressApi } from '../api'
import { labelIcon } from './Addresses'
import type { Address } from '../types'

// Module 3 · #20 — Saved Addresses. Compact list with a per-card menu (set default / edit / delete)
// using the existing APIs. Reorder is a visual tip (drag-reorder not persisted). No backend change.
export default function SavedAddresses() {
  const nav = useNavigate()
  const toast = useToast()
  const [list, setList] = useState<Address[] | null>(null)
  const [menu, setMenu] = useState<number | null>(null)
  useEffect(() => { fetchAddresses().then(setList).catch(() => setList([])) }, [])

  async function makeDefault(id: number) { try { setList(await setDefaultAddressApi(id)); setMenu(null); toast('Default updated') } catch (e) { toast((e as Error).message) } }
  async function remove(id: number) { try { setList(await deleteAddressApi(id)); setMenu(null); toast('Address removed') } catch (e) { toast((e as Error).message) } }

  return (
    <div className="screen m2">
      <div className="ps-top">
        <button className="au-back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Saved Addresses</b>
        <button className="ad2-addnew" onClick={() => nav('/addresses/add')}><Plus size={15} /> Add New</button>
      </div>
      <div className="content">
        {list?.map((a) => {
          const Ic = labelIcon(a.label)
          return (
            <div key={a.id} className="ad2-scard">
              <span className="ad2-sic"><Ic size={18} /></span>
              <div className="grow">
                <div className="ad2-h"><b>{a.label}</b>{a.is_default ? <span className="ad2-def">Default</span> : null}</div>
                <div className="ad2-sline">{a.line}{a.pincode && !a.line.includes(a.pincode) ? ` - ${a.pincode}` : ''}</div>
              </div>
              <div className="ad2-menuwrap">
                <button className="ad2-more" onClick={() => setMenu(menu === a.id ? null : a.id)} aria-label="More"><MoreVertical size={18} /></button>
                {menu === a.id && (
                  <div className="ad2-menu">
                    {!a.is_default && <button onClick={() => makeDefault(a.id)}><Star size={14} /> Set as default</button>}
                    <button onClick={() => nav('/addresses/add', { state: { edit: a } })}><Pencil size={14} /> Edit</button>
                    {!a.is_default && <button className="danger" onClick={() => remove(a.id)}><Trash2 size={14} /> Delete</button>}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {list && list.length === 0 && (
          <div className="state"><div className="ico"><MapPin size={44} /></div><h3>No saved addresses</h3><p>Add your home, work or any place.</p></div>
        )}
        {list && list.length > 0 && (
          <div className="ad2-tip"><Lightbulb size={16} /> Tip: Long press and drag to reorder addresses</div>
        )}
      </div>
    </div>
  )
}
