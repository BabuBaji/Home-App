import { useEffect, useState } from 'react'
import { Package, ShieldCheck, Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import { fetchEquipmentTypes, createEquipmentType, updateEquipmentType, deleteEquipmentType } from '../api'
import type { EquipmentType } from '../types'
import { StatCard, Card, Badge, Loading, ErrorState, Modal, Field, useToast, useConfirm } from '../components/UI'

/* Phase 9 — the kit catalogue.
 *
 * "Required" is the only opinionated field here, and it ships FALSE on everything: which items a
 * worker must hold before going live is company policy, not something to assume. Phase 12's
 * "Equipment Issued" check reads it, and says plainly when nothing is required rather than
 * quietly passing.
 */
export default function Equipment() {
  const toast = useToast()
  const confirm = useConfirm()
  const [types, setTypes] = useState<EquipmentType[] | null>(null)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', required: false })
  const [saving, setSaving] = useState(false)

  const load = () => { setErr(''); fetchEquipmentTypes().then((r) => setTypes(r.types)).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!types) return <Loading />

  const active = types.filter((t) => t.active)
  const required = active.filter((t) => t.required)
  const issuedTotal = types.reduce((n, t) => n + (t.issued || 0), 0)

  const save = async () => {
    if (!draft.name.trim()) return
    setSaving(true)
    try { await createEquipmentType(draft.name.trim(), draft.required); toast('Item added'); setAdding(false); setDraft({ name: '', required: false }); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setSaving(false) }
  }

  const toggle = async (t: EquipmentType, body: Partial<EquipmentType>) => {
    try { await updateEquipmentType(t.id, body); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  const remove = async (t: EquipmentType) => {
    if (!(await confirm({ title: `Delete "${t.name}"?`, message: 'Items that have been issued cannot be deleted — retire them instead.', confirmLabel: 'Delete', danger: true }))) return
    try { await deleteEquipmentType(t.id); toast('Item deleted'); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  return (
    <>
      <div className="stat-row">
        <StatCard icon={<Package size={18} />} tint="#eef0ff" label="Items" value={active.length} sub={`${types.length - active.length} retired`} />
        <StatCard icon={<ShieldCheck size={18} />} tint="#e7f7ee" label="Required to go live" value={required.length} sub={required.length ? required.map((t) => t.name).join(', ') : 'None — check not enforced'} />
        <StatCard icon={<Package size={18} />} tint="#fff6e6" label="Currently issued" value={issuedTotal} sub="Held by workers now" />
      </div>

      {required.length === 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 14, borderLeft: '3px solid #6366f1' }}>
          <strong>Nothing is marked required.</strong> Phase 12's "Equipment Issued" check passes automatically
          until you tick <em>Required</em> on the items a worker must hold before they can go live.
        </div>
      )}

      <Card title="Equipment catalogue" right={<button className="btn" onClick={() => setAdding(true)}><Plus size={16} /> Add item</button>}>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Item</th><th>Required to go live</th><th>Issued now</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong></td>
                  <td>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={t.required} onChange={(e) => toggle(t, { required: e.target.checked })} />
                      <span style={{ color: t.required ? '#15803d' : '#94a3b8', fontSize: 13 }}>{t.required ? 'Required' : 'Optional'}</span>
                    </label>
                  </td>
                  <td>{t.issued || 0}</td>
                  <td><Badge tone={t.active ? 'green' : 'gray'}>{t.active ? 'Active' : 'Retired'}</Badge></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="iconbtn" title={t.active ? 'Retire' : 'Reactivate'} onClick={() => toggle(t, { active: !t.active })}>
                      {t.active ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button className="iconbtn" title="Delete" onClick={() => remove(t)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {adding && (
        <Modal title="Add equipment" onClose={() => setAdding(false)}
          footer={<>
            <button className="btn line" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Add'}</button>
          </>}>
          <Field label="Item name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Safety Harness" /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} />
            <span>A worker must hold this before they can go live</span>
          </label>
        </Modal>
      )}
    </>
  )
}
