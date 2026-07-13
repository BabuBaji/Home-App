import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Plus, LocateFixed, ChevronRight, MapPin, Trash2 } from 'lucide-react'
import { useToast } from '../components/UI'
import { useStore } from '../store'
import { fetchAddresses, setDefaultAddressApi, deleteAddressApi, updateMe } from '../api'
import { searchPlaces, placeDetails, type Place } from '../geo'
import type { Address } from '../types'

// Address hub shown when changing location: search + Add address + Use current location + the saved
// addresses (with the default flagged and an Edit action), Rapido/Swiggy-style.
export default function SearchLocation() {
  const nav = useNavigate()
  const toast = useToast()
  const { user, setUser } = useStore()
  const [list, setList] = useState<Address[]>([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [busy, setBusy] = useState(false)
  // swipe-to-delete state for the saved-address rows
  const [swipe, setSwipe] = useState<{ id: number; dx: number } | null>(null)
  const startX = useRef(0)
  const moved = useRef(false)
  const [confirmDel, setConfirmDel] = useState<Address | null>(null)

  useEffect(() => { fetchAddresses().then(setList).catch(() => {}) }, [])

  useEffect(() => {
    if (q.trim().length < 3) { setResults([]); return }
    const t = setTimeout(() => { searchPlaces(q).then(setResults).catch(() => {}) }, 400)
    return () => clearTimeout(t)
  }, [q])

  async function pickSearch(p: Place) {
    let { lat, lng } = p
    if ((!lat || !lng) && p.placeId) { const d = await placeDetails(p.placeId); if (d?.lat && d?.lng) { lat = d.lat; lng = d.lng } }
    nav('/onboarding/location', lat && lng ? { state: { center: { lat, lng } } } : undefined)
  }

  async function selectSaved(a: Address) {
    if (busy) return
    setBusy(true)
    try {
      await setDefaultAddressApi(a.id)
      const { user: u } = await updateMe({ city: a.city || '', location: a.line })
      setUser(u)
      nav('/home', { replace: true })
    } catch (e) { toast((e as Error).message); setBusy(false) }
  }

  async function doDelete(a: Address) {
    setConfirmDel(null)
    setBusy(true)
    try {
      const rest = await deleteAddressApi(a.id)
      setList(rest)
      toast('Address deleted')
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  const mobileOf = (a: Address) => a.receiver_phone || (user?.phone || '').replace(/\D/g, '').slice(-10)

  return (
    <div className="sl-screen">
      <div className="ad-top">
        <button className="mp-back" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={20} /></button>
        <b>Search your location</b>
      </div>

      <div className="sl-body">
        <div className="sl-search">
          <div className="mp-search-box">
            <Search size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search locality, sector, area" />
          </div>
          {results.length > 0 && (
            <div className="mp-results">
              {results.map((p, i) => (
                <button key={i} className="mp-result" onClick={() => pickSearch(p)}>
                  <MapPin size={15} /><span className="grow"><b>{p.label}</b>{p.sub && <span className="mp-r-sub">{p.sub}</span>}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="sl-actions">
          <button className="sl-action" onClick={() => nav('/onboarding/location')}>
            <Plus size={20} className="sl-a-ic" /><span className="grow">Add address</span><ChevronRight size={18} className="sl-chev" />
          </button>
          <div className="sl-div" />
          <button className="sl-action" onClick={() => nav('/onboarding/location', { state: { useCurrent: true } })}>
            <LocateFixed size={20} className="sl-a-ic" /><span className="grow">Use current location</span><ChevronRight size={18} className="sl-chev" />
          </button>
        </div>

        {list.length > 0 && <div className="sl-label">SAVED ADDRESSES · swipe a card to delete</div>}
        {list.map((a) => {
          const dx = swipe?.id === a.id ? swipe.dx : 0
          return (
            <div key={a.id} className="sl-swipe">
              <div className="sl-swipe-bg" style={{ opacity: Math.min(1, Math.abs(dx) / 90) }}>
                <Trash2 size={22} /><Trash2 size={22} />
              </div>
              <div
                className="sl-addr"
                style={{ transform: `translateX(${dx}px)`, transition: swipe?.id === a.id ? 'none' : 'transform .2s ease' }}
                onTouchStart={(e) => { startX.current = e.touches[0].clientX; moved.current = false; setSwipe({ id: a.id, dx: 0 }) }}
                onTouchMove={(e) => { const d = e.touches[0].clientX - startX.current; if (Math.abs(d) > 6) moved.current = true; setSwipe({ id: a.id, dx: d }) }}
                onTouchEnd={() => { const d = swipe?.id === a.id ? swipe.dx : 0; setSwipe(null); if (Math.abs(d) > 100) setConfirmDel(a) }}
                onClick={() => { if (!moved.current) selectSaved(a) }}
              >
                <div className="sl-addr-ic"><MapPin size={20} /></div>
                <div className="grow">
                  <div className="sl-addr-h">{a.label}{a.is_default ? <span className="sl-badge">Currently selected</span> : null}</div>
                  <div className="sl-addr-line">{a.line}</div>
                  <div className="sl-addr-mob">Mobile:{mobileOf(a)}</div>
                  <button className="sl-edit" onClick={(e) => { e.stopPropagation(); nav('/address-details', { state: { edit: a } }) }}>EDIT</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {confirmDel && (
        <div className="cf-backdrop" onClick={() => setConfirmDel(null)}>
          <div className="cf-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cf-title">Delete this address?</div>
            <div className="cf-text">{confirmDel.line}</div>
            <div className="cf-btns">
              <button className="cf-cancel" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="cf-del" onClick={() => doDelete(confirmDel)} disabled={busy}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
