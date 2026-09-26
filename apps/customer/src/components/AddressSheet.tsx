import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Plus, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useToast } from './UI'
import { useStore } from '../store'
import { fetchAddresses, setDefaultAddressApi, deleteAddressApi, updateMe } from '../api'
import type { Address } from '../types'
import { t } from '../i18n'

// Saved-address picker for the Home header. A bottom sheet rather than a route push: the header
// only carries a short "flat, city" summary, so the full text has to be one tap away without
// losing the screen underneath. Picking a row makes it the default address, which is what the
// rest of the app reads (pincode -> zone pricing + the serviceability gate).
export default function AddressSheet({ open, onClose, onSelect, onAdd }: {
  open: boolean
  onClose: () => void
  onSelect: (a: Address) => void
  /** Override "Add address" (the booking flow adds one and comes straight back). */
  onAdd?: () => void
}) {
  const nav = useNavigate()
  const toast = useToast()
  const { setUser, setServiceLocation } = useStore()
  const [list, setList] = useState<Address[] | null>(null)
  const [menu, setMenu] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  // Re-read on every open — the list changes from the add/edit screens this sheet links out to.
  useEffect(() => {
    if (!open) return
    setMenu(null)
    fetchAddresses().then(setList).catch(() => setList([]))
  }, [open])

  if (!open) return null

  async function select(a: Address) {
    if (busy) return
    if (a.is_default) return onClose()          // already selected — nothing to change
    setBusy(true)
    try {
      await setDefaultAddressApi(a.id)
      const { user: u } = await updateMe({ city: a.city || '', location: a.line })
      setUser(u)
      if (a.pincode) setServiceLocation(a.pincode, a.lat, a.lng)   // drives zone pricing + the "coming soon" gate
      onSelect(a)
      onClose()
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  async function remove(a: Address) {
    setMenu(null)
    try { setList(await deleteAddressApi(a.id)); toast(t('Address removed')) }
    catch (e) { toast((e as Error).message) }
  }

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="as-sheet" onClick={(e) => e.stopPropagation()}>
        <span className="as-grab" aria-hidden />
        <div className="as-head">
          <b>{t('Saved Address')}</b>
          <button className="as-add" onClick={() => { onClose(); if (onAdd) onAdd(); else nav('/onboarding/location') }}>
            <Plus size={15} /> {t('Add address')}
          </button>
        </div>

        <div className="as-list">
          {list?.map((a) => (
            <div key={a.id} className={`as-row${a.is_default ? ' sel' : ''}`}>
              <button className="as-pick" onClick={() => select(a)} disabled={busy}>
                <span className="as-ic"><MapPin size={17} /></span>
                <span className="as-txt">
                  <span className="as-h">
                    {a.label}
                    {a.is_default && <span className="as-badge">{t('SELECTED')}</span>}
                  </span>
                  <span className="as-line">
                    {a.line}{a.pincode && !(a.line || '').includes(a.pincode) ? `, ${a.pincode}` : ''}
                  </span>
                </span>
              </button>
              <div className="as-menuwrap">
                <button className="as-more" onClick={() => setMenu(menu === a.id ? null : a.id)} aria-label={t('More options')}>
                  <MoreVertical size={18} />
                </button>
                {menu === a.id && (
                  <div className="ad2-menu as-menu">
                    <button onClick={() => { setMenu(null); onClose(); nav('/address-details', { state: { edit: a } }) }}>
                      <Pencil size={14} /> {t('Edit')}
                    </button>
                    {/* the selected address has no delete — removing it would leave the app with no
                        address to price against until the customer picks another */}
                    {!a.is_default && (
                      <button className="danger" onClick={() => remove(a)}><Trash2 size={14} /> {t('Delete')}</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {list && list.length === 0 && (
            <div className="as-empty">{t('No saved addresses yet — add one to get started.')}</div>
          )}
        </div>
      </div>
    </div>
  )
}
