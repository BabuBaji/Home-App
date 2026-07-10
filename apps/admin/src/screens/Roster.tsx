import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { fetchShifts, createShift, deleteShift, fetchWorkers, fetchZones, type Shift, type Zone } from '../api'
import type { Worker } from '../types'
import { Card, Badge, Loading, ErrorState, Modal, Field, useToast } from '../components/UI'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Roster() {
  const toast = useToast()
  const [shifts, setShifts] = useState<Shift[] | null>(null)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState<{ worker_id: string; zone_id: string; weekdays: number[]; start: string; end: string }>(
    { worker_id: '', zone_id: '', weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' })

  const load = () => { setErr(''); fetchShifts().then(setShifts).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  useEffect(() => {
    fetchWorkers('', 'all', 'all').then((d) => setWorkers(d.workers)).catch(() => {})
    fetchZones().then(setZones).catch(() => {})
  }, [])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!shifts) return <Loading />

  const zoneName = (id: number | null) => (id ? (zones.find((z) => z.id === id)?.name || `#${id}`) : 'Any zone')
  const toggleDay = (d: number) => setF((s) => ({ ...s, weekdays: s.weekdays.includes(d) ? s.weekdays.filter((x) => x !== d) : [...s.weekdays, d] }))

  const save = () => {
    if (!f.worker_id) { toast('Pick an expert', 'err'); return }
    if (f.weekdays.length === 0) { toast('Pick at least one day', 'err'); return }
    setSaving(true)
    createShift({ worker_id: Number(f.worker_id), zone_id: f.zone_id ? Number(f.zone_id) : null, weekdays: f.weekdays, start: f.start, end: f.end })
      .then((r) => { toast(`${r.added} shift(s) added`, 'ok'); setModal(false); setSaving(false); load() })
      .catch((e: Error) => { toast(e.message, 'err'); setSaving(false) })
  }
  const remove = (s: Shift) => { deleteShift(s.id).then(() => { toast('Shift removed', 'ok'); load() }).catch((e: Error) => toast(e.message, 'err')) }

  const onNow = shifts.filter((s) => s.on_now).length

  return (
    <div className="grid" style={{ gap: 16 }}>
      <Card>
        <div style={{ padding: '2px 4px 12px', color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
          Roster experts into <b>shifts</b> per zone &amp; time window — the standby supply that powers instant service.
          <b> {onNow}</b> expert{onNow === 1 ? '' : 's'} on shift right now (IST). This feeds the Live Ops on-shift supply.
        </div>
        <div className="toolbar">
          <div className="tb-spacer" />
          <button className="btn" onClick={() => setModal(true)}><Plus size={16} /> Add Shift</button>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Expert</th><th>Zone</th><th>Day</th><th>Time</th><th>Now</th><th></th></tr></thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.worker_name}</strong></td>
                  <td>{zoneName(s.zone_id)}</td>
                  <td>{DAYS[s.weekday]}</td>
                  <td>{s.start}–{s.end}</td>
                  <td>{s.on_now ? <Badge tone="green">On shift</Badge> : <span className="muted">—</span>}</td>
                  <td><button className="iconbtn" style={{ color: 'var(--red)' }} title="Remove" onClick={() => remove(s)}><Trash2 size={16} /></button></td>
                </tr>
              ))}
              {shifts.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>No shifts yet. Click “Add Shift” to roster an expert.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {modal && (
        <Modal
          title="Add Shift"
          onClose={() => { setModal(false); setSaving(false) }}
          footer={<><button className="btn line" onClick={() => setModal(false)}>Cancel</button><button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add Shift'}</button></>}
        >
          <Field label="Expert">
            <select value={f.worker_id} onChange={(e) => setF({ ...f, worker_id: e.target.value })}>
              <option value="">— Select expert —</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}{w.city ? ` · ${w.city}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Zone">
            <select value={f.zone_id} onChange={(e) => setF({ ...f, zone_id: e.target.value })}>
              <option value="">Any zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}{z.city ? ` · ${z.city}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Days">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DAYS.map((d, i) => (
                <button key={d} type="button" onClick={() => toggleDay(i)} className={f.weekdays.includes(i) ? 'btn' : 'btn line'} style={{ padding: '4px 10px', fontSize: 13 }}>{d}</button>
              ))}
            </div>
          </Field>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Start"><input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
            <Field label="End"><input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}
