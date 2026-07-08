import { useEffect, useState } from 'react'
import { Clock, Save, MapPin, Plus, Trash2 } from 'lucide-react'
import {
  fetchShiftDefs, updateShiftDef, fetchAttendance, fetchSites, createSite, updateSite, deleteSite,
  assignWorkerSite, fetchWorkers, type ShiftDef, type AttendanceRow, type Site,
} from '../api'
import type { Worker } from '../types'
import { Card, Badge, Loading, ErrorState, Field, Empty, useToast } from '../components/UI'

// Admin control for the min-guarantee shift PLANS the worker app offers, plus a daily
// attendance board (on-time / late / penalty) driven by those plans.
export default function Shifts() {
  const toast = useToast()
  const [defs, setDefs] = useState<ShiftDef[] | null>(null)
  const [att, setAtt] = useState<{ day: string; rows: AttendanceRow[] } | null>(null)
  const [day, setDay] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState<number | null>(null)
  const [sites, setSites] = useState<Site[] | null>(null)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [nf, setNf] = useState({ name: '', address: '', lat: '', lng: '', radius: '300' })
  const [asg, setAsg] = useState({ workerId: '', siteId: '' })

  const loadDefs = () => { setErr(''); fetchShiftDefs().then(setDefs).catch((e: Error) => setErr(e.message)) }
  const loadAtt = (d?: string) => fetchAttendance(d).then((r) => { setAtt(r); setDay(r.day) }).catch(() => {})
  const loadSites = () => fetchSites().then(setSites).catch(() => {})
  useEffect(loadDefs, [])
  useEffect(() => { loadAtt(); loadSites(); fetchWorkers('', 'all', 'all').then((d) => setWorkers(d.workers)).catch(() => {}) }, [])

  const patchSite = (id: number, k: keyof Site, v: string | number | boolean) =>
    setSites((ss) => ss!.map((s) => (s.id === id ? { ...s, [k]: v } : s)))
  const saveSite = (s: Site) => updateSite(s.id, { name: s.name, address: s.address, lat: Number(s.lat), lng: Number(s.lng), radius: Number(s.radius), active: s.active })
    .then(() => { toast(`${s.name} saved`, 'ok'); loadSites() }).catch((e: Error) => toast(e.message, 'err'))
  const addSite = () => {
    if (!nf.name || !nf.lat || !nf.lng) { toast('Name, lat and lng are required', 'err'); return }
    createSite({ name: nf.name, address: nf.address, lat: Number(nf.lat), lng: Number(nf.lng), radius: Number(nf.radius) || 300 })
      .then(() => { toast('Apartment added', 'ok'); setNf({ name: '', address: '', lat: '', lng: '', radius: '300' }); loadSites() })
      .catch((e: Error) => toast(e.message, 'err'))
  }
  const delSite = (s: Site) => deleteSite(s.id).then(() => { toast('Apartment removed', 'ok'); loadSites() }).catch((e: Error) => toast(e.message, 'err'))
  const doAssign = () => {
    if (!asg.workerId) { toast('Pick a worker', 'err'); return }
    assignWorkerSite(Number(asg.workerId), asg.siteId ? Number(asg.siteId) : null)
      .then(() => { toast('Apartment assigned', 'ok'); setAsg({ workerId: '', siteId: '' }); loadSites() })
      .catch((e: Error) => toast(e.message, 'err'))
  }

  if (err) return <ErrorState msg={err} onRetry={loadDefs} />
  if (!defs) return <Loading />

  const patch = (id: number, k: keyof ShiftDef, v: string | number | boolean) =>
    setDefs((ds) => ds!.map((d) => (d.id === id ? { ...d, [k]: v } : d)))

  const save = (d: ShiftDef) => {
    setSaving(d.id)
    updateShiftDef(d.id, {
      name: d.name, start: d.start, end: d.end, graceMin: Number(d.graceMin), penalty: Number(d.penalty),
      minGWeekday: Number(d.minGWeekday), minGWeekend: Number(d.minGWeekend), active: d.active,
    })
      .then(() => { toast(`${d.name} shift saved`, 'ok'); setSaving(null); loadDefs() })
      .catch((e: Error) => { toast(e.message, 'err'); setSaving(null) })
  }

  const num = (id: number, k: keyof ShiftDef, val: ShiftDef[keyof ShiftDef]) => (
    <input type="number" value={val as number} onChange={(e) => patch(id, k, Number(e.target.value))}
      style={inp} />
  )

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Card title="Shift Plans (Min-Guarantee)" right={<Badge tone="violet" dot={false}>Worker app · admin-controlled</Badge>}>
        <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 13 }}>
          Workers pick one of these shifts. Check-in is judged against the start time; a worker who checks in more than
          the grace window late is charged the penalty. If a day&apos;s job earnings fall below the minimum guarantee, the
          wallet tops up the difference on checkout.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {defs.map((d) => (
            <div key={d.id} style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 16, background: 'var(--card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, background: 'var(--violet-50, #efeafe)', color: '#6d28d9' }}>
                  <Clock size={18} />
                </span>
                <input value={d.name} onChange={(e) => patch(d.id, 'name', e.target.value)} style={{ ...inp, fontWeight: 700, fontSize: 15, flex: 1 }} />
                <Badge tone={d.active ? 'green' : 'gray'}>{d.active ? 'Active' : 'Off'}</Badge>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Start (HH:MM)"><input value={d.start} onChange={(e) => patch(d.id, 'start', e.target.value)} style={inp} /></Field>
                <Field label="End (HH:MM)"><input value={d.end} onChange={(e) => patch(d.id, 'end', e.target.value)} style={inp} /></Field>
                <Field label="Grace (min)">{num(d.id, 'graceMin', d.graceMin)}</Field>
                <Field label="Late penalty (₹)">{num(d.id, 'penalty', d.penalty)}</Field>
                <Field label="Min-G · weekday (₹)">{num(d.id, 'minGWeekday', d.minGWeekday)}</Field>
                <Field label="Min-G · weekend (₹)">{num(d.id, 'minGWeekend', d.minGWeekend)}</Field>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', fontSize: 13, color: 'var(--muted)' }}>
                <input type="checkbox" checked={d.active} onChange={(e) => patch(d.id, 'active', e.target.checked)} />
                Offer this shift to workers
              </label>
              <button onClick={() => save(d)} disabled={saving === d.id} style={btn}>
                <Save size={15} /> {saving === d.id ? 'Saving…' : 'Save'}
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Apartments (Geofence)" right={<Badge tone="violet" dot={false}>300 m radius default</Badge>}>
        <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 13 }}>
          Assign a worker an apartment for their shift. On check-in it becomes their geofence centre; the app
          alerts them if they move beyond the radius. If no apartment is assigned, the check-in spot is used.
        </p>
        {/* Assign a worker to an apartment */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 16 }}>
          <Field label="Worker">
            <select value={asg.workerId} onChange={(e) => setAsg({ ...asg, workerId: e.target.value })} style={inp}>
              <option value="">Select worker…</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="Apartment">
            <select value={asg.siteId} onChange={(e) => setAsg({ ...asg, siteId: e.target.value })} style={inp}>
              <option value="">— none —</option>
              {(sites || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <button onClick={doAssign} style={btn}><MapPin size={15} /> Assign</button>
        </div>
        {/* Apartment list (editable) */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                {['Name', 'Address', 'Lat', 'Lng', 'Radius (m)', 'Assigned', ''].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(sites || []).map((s) => (
                <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={td}><input value={s.name} onChange={(e) => patchSite(s.id, 'name', e.target.value)} style={inp} /></td>
                  <td style={td}><input value={s.address} onChange={(e) => patchSite(s.id, 'address', e.target.value)} style={inp} /></td>
                  <td style={td}><input type="number" value={s.lat} onChange={(e) => patchSite(s.id, 'lat', Number(e.target.value))} style={{ ...inp, width: 92 }} /></td>
                  <td style={td}><input type="number" value={s.lng} onChange={(e) => patchSite(s.id, 'lng', Number(e.target.value))} style={{ ...inp, width: 92 }} /></td>
                  <td style={td}><input type="number" value={s.radius} onChange={(e) => patchSite(s.id, 'radius', Number(e.target.value))} style={{ ...inp, width: 74 }} /></td>
                  <td style={td}>{s.assigned}</td>
                  <td style={{ ...td, display: 'flex', gap: 6 }}>
                    <button onClick={() => saveSite(s)} style={{ ...btn, padding: '6px 10px' }}><Save size={13} /></button>
                    <button onClick={() => delSite(s)} style={{ ...btn, padding: '6px 10px', background: '#ef4444' }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {/* Add new apartment */}
              <tr style={{ borderTop: '1px solid var(--line)' }}>
                <td style={td}><input placeholder="New apartment" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} style={inp} /></td>
                <td style={td}><input placeholder="Address" value={nf.address} onChange={(e) => setNf({ ...nf, address: e.target.value })} style={inp} /></td>
                <td style={td}><input placeholder="17.45" value={nf.lat} onChange={(e) => setNf({ ...nf, lat: e.target.value })} style={{ ...inp, width: 92 }} /></td>
                <td style={td}><input placeholder="78.43" value={nf.lng} onChange={(e) => setNf({ ...nf, lng: e.target.value })} style={{ ...inp, width: 92 }} /></td>
                <td style={td}><input value={nf.radius} onChange={(e) => setNf({ ...nf, radius: e.target.value })} style={{ ...inp, width: 74 }} /></td>
                <td style={td} />
                <td style={td}><button onClick={addSite} style={{ ...btn, padding: '6px 10px' }}><Plus size={13} /> Add</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Attendance"
        right={<input type="date" value={day} onChange={(e) => loadAtt(e.target.value)} style={{ ...inp, width: 'auto' }} />}
      >
        {!att ? <Loading /> : att.rows.length === 0 ? <Empty msg={`No check-ins on ${att.day}`} /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  {['Worker', 'Shift', 'Apartment', 'Check-in', 'Check-out', 'Status', 'Left area', 'Penalty', 'Min-G'].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {att.rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={td}>{r.workerName}</td>
                    <td style={td}>{r.shift}</td>
                    <td style={td}>{r.site || '—'}</td>
                    <td style={td}>{r.checkIn || '—'}</td>
                    <td style={td}>{r.checkOut || '—'}</td>
                    <td style={td}>
                      {r.onTime == null ? <Badge tone="gray">—</Badge>
                        : r.onTime ? <Badge tone="green">On time</Badge>
                          : <Badge tone="red">Late {r.lateMinutes}m</Badge>}
                    </td>
                    <td style={td}>{r.geoBreaches ? <Badge tone="red">{r.geoBreaches}×</Badge> : '—'}</td>
                    <td style={td}>{r.penalty ? `−₹${r.penalty}` : '—'}</td>
                    <td style={td}>{r.minG ? `₹${r.minG}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg, #fff)', color: 'inherit', fontSize: 13 }
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', borderRadius: 10, background: '#6d28d9', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px', whiteSpace: 'nowrap' }
