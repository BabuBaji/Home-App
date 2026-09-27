import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { fetchServiceDurations, saveServiceDurations, updateService, type ServiceDurationRow } from '../api'
import type { AdminService } from '../types'
import { Modal, Loading, Field, useToast } from '../components/UI'

/* Durations & prices + customer-facing copy for one service. What's saved here is exactly what the
 * customer app shows and charges (zone pricing and offers still apply on top). */
export default function ServicePricingModal({ service, onClose }: { service: AdminService; onClose: () => void }) {
  const toast = useToast()
  const [rows, setRows] = useState<ServiceDurationRow[] | null>(null)
  const [custom, setCustom] = useState(false)
  const [desc, setDesc] = useState('')
  const [inc, setInc] = useState('')
  const [exc, setExc] = useState('')
  const [anyTask, setAnyTask] = useState(false)
  const [check, setCheck] = useState('')
  const [photos, setPhotos] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchServiceDurations(service.id).then((r) => {
      setRows(r.durations); setCustom(r.custom)
      setDesc(r.description || ''); setInc((r.includes || []).join('\n')); setExc((r.excludes || []).join('\n'))
      setAnyTask(!!r.anyTask); setCheck((r.checklist || []).join('\n')); setPhotos((r.photoSlots || []).join('\n'))
    }).catch((e: Error) => { toast(e.message, 'err'); onClose() })
  }, [service.id])

  const set = (i: number, patch: Partial<ServiceDurationRow>) => setRows((p) => p!.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const add = () => setRows((p) => {
    const last = p![p!.length - 1]
    const minutes = (last?.minutes || 0) + 30
    return [...p!, { id: `${minutes}m`, label: minutes % 60 ? `${minutes / 60} hr` : `${minutes / 60} hr`, minutes, price: (last?.price || 0) + 50, original: null, active: true, sort: p!.length }]
  })
  const remove = (i: number) => setRows((p) => p!.filter((_, j) => j !== i))
  const lines = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean)

  async function save(resetDurations = false) {
    setSaving(true)
    try {
      await saveServiceDurations(service.id, resetDurations ? [] : rows!.map((r) => ({ ...r, original: r.original === null || String(r.original) === '' ? null : Number(r.original) })))
      await updateService(service.id, { description: desc, includes: lines(inc), excludes: lines(exc), any_task: anyTask, checklist: lines(check), photo_slots: lines(photos) })
      toast(resetDurations ? 'Durations reset to the default ladder' : 'Durations & details saved', 'ok')
      onClose()
    } catch (e) { toast((e as Error).message, 'err'); setSaving(false) }
  }

  return (
    <Modal title={`${service.name} — durations & prices`} onClose={onClose} wide
      footer={<>
        {custom && <button className="btn line" disabled={saving} onClick={() => save(true)} title="Remove the custom menu and use the built-in ±₹50 ladder">Reset durations to default</button>}
        <button className="btn line" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={saving || !rows} onClick={() => save(false)}>{saving ? 'Saving…' : 'Save'}</button>
      </>}>
      {!rows ? <Loading /> : (<>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
          {custom ? 'Custom menu — customers see exactly these rows.' : 'Using the built-in ladder (±₹50 per 30 min). Saving turns these rows into this service’s own menu.'}
          {' '}Zone prices and offers still apply on top.
        </p>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Label (shown to customer)</th><th>Minutes</th><th>Price ₹</th><th>Strike-through ₹</th><th>On</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><input value={r.label} onChange={(e) => set(i, { label: e.target.value })} style={{ width: 110 }} /></td>
                  <td><input type="number" min={5} step={5} value={r.minutes} onChange={(e) => set(i, { minutes: Number(e.target.value) })} style={{ width: 80 }} /></td>
                  <td><input type="number" min={0} value={r.price} onChange={(e) => set(i, { price: Number(e.target.value) })} style={{ width: 90 }} /></td>
                  <td><input type="number" min={0} value={r.original ?? ''} placeholder="auto" onChange={(e) => set(i, { original: e.target.value === '' ? null : Number(e.target.value) })} style={{ width: 90 }} /></td>
                  <td><input type="checkbox" checked={r.active !== false} onChange={(e) => set(i, { active: e.target.checked })} /></td>
                  <td><button className="iconbtn" title="Remove" style={{ color: 'var(--red)' }} onClick={() => remove(i)}><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn line" style={{ marginTop: 8 }} onClick={add}><Plus size={15} /> Add duration</button>

        <div style={{ marginTop: 18 }}>
          <Field label="Description"><textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <Field label="What's included (one per line)"><textarea rows={5} value={inc} onChange={(e) => setInc(e.target.value)} /></Field>
          <Field label="Not included (one per line)"><textarea rows={4} value={exc} onChange={(e) => setExc(e.target.value)} /></Field>
        </div>

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line, #eee)' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={anyTask} onChange={(e) => setAnyTask(e.target.checked)} style={{ marginTop: 3 }} />
            <span><b>Any expert can do this — the customer picks the tasks</b>
              <small className="muted" style={{ display: 'block', fontSize: 12 }}>For hourly help: every expert with at least one skill can be sent, without adding this service to their skills.</small></span>
          </label>
          <div style={{ marginTop: 12 }}>
            <Field label="Expert checklist (one step per line — blank = built-in)"><textarea rows={4} value={check} onChange={(e) => setCheck(e.target.value)} /></Field>
            <Field label="Photos the expert must take (one per line — blank = built-in)"><textarea rows={3} value={photos} onChange={(e) => setPhotos(e.target.value)} /></Field>
          </div>
        </div>
      </>)}
    </Modal>
  )
}
