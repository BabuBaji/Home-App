import { useEffect, useState } from 'react'
import { HardHat, UserCheck, Clock, Plus, Star, Trash2 } from 'lucide-react'
import { fetchWorkers, createWorker, updateWorker, deleteWorker } from '../api'
import type { Worker } from '../types'
import { Card, StatCard, Loading, ErrorState, Empty, Badge, Avatar, SearchBox, Modal, Field, money, useToast } from '../components/UI'
import { useStore, can } from '../store'

const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Pune', 'Hyderabad', 'Chennai', 'Ahmedabad', 'Kolkata', 'Jaipur', 'Lucknow']

export default function Workers() {
  const toast = useToast()
  const { admin } = useStore()
  const [data, setData] = useState<{ stats: any; workers: Worker[] } | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState(''); const [status, setStatus] = useState('all'); const [city, setCity] = useState('all')
  const [edit, setEdit] = useState<Worker | 'new' | null>(null)

  const load = () => { setErr(''); fetchWorkers(q, status, city).then(setData).catch((e) => setErr(e.message)) }
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id) }, [q, status, city])

  if (err) return <ErrorState msg={err} onRetry={load} />
  const s = data?.stats

  async function setStatusOf(w: Worker, st: string) {
    try { await updateWorker(w.id, { status: st }); toast('Worker updated'); load() } catch (e: any) { toast(e.message, 'err') }
  }
  async function remove(w: Worker) {
    if (!confirm(`Delete ${w.name}?`)) return
    try { await deleteWorker(w.id); toast('Worker removed'); load() } catch (e: any) { toast(e.message, 'err') }
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="stat-row">
        <StatCard icon={<HardHat size={22} />} tint="#5b51e8" label="Total Workers" value={s?.total ?? '—'} />
        <StatCard icon={<UserCheck size={22} />} tint="#16a34a" label="Active" value={s?.active ?? '—'} />
        <StatCard icon={<Clock size={22} />} tint="#f5a524" label="Pending Approval" value={s?.pending ?? '—'} />
        <StatCard icon={<HardHat size={22} />} tint="#8085a3" label="Inactive" value={s?.inactive ?? '—'} />
      </div>

      <Card>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search pros…" />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All Status</option><option value="active">Active</option><option value="pending">Pending</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option>
          </select>
          <select className="select" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="all">All Cities</option>{CITIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <div className="spacer" />
          {can(admin?.role, 'manager') && <button className="btn" onClick={() => setEdit('new')}><Plus size={17} /> Add Worker</button>}
        </div>
        {!data ? <Loading /> : data.workers.length === 0 ? <Empty msg="No workers found." /> : (
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Worker</th><th>Phone</th><th>City</th><th>Services</th><th>Rating</th><th>Jobs</th><th>Earnings</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.workers.map((w) => (
                  <tr key={w.id}>
                    <td><div className="cell-user"><Avatar name={w.name} size={34} /><div><strong>{w.name} {w.verified && <span title="Verified" style={{ color: 'var(--green)' }}>✓</span>}</strong><small>{w.email}</small></div></div></td>
                    <td className="muted">{w.phone}</td>
                    <td>{w.city}</td>
                    <td><div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>{w.services.slice(0, 2).map((sv) => <span key={sv} className="badge violet">{sv}</span>)}{w.services.length > 2 && <span className="badge gray">+{w.services.length - 2}</span>}</div></td>
                    <td><span className="row" style={{ gap: 4 }}><Star size={13} fill="#f5a524" stroke="#f5a524" /> {w.rating}</span></td>
                    <td className="num">{w.jobs}</td>
                    <td className="num">{money(w.earnings)}</td>
                    <td>
                      {can(admin?.role, 'manager') ? (
                        <select className="select" style={{ padding: '5px 8px', fontSize: 12 }} value={w.status} onChange={(e) => setStatusOf(w, e.target.value)}>
                          <option value="active">Active</option><option value="pending">Pending</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option>
                        </select>
                      ) : <Badge>{w.status}</Badge>}
                    </td>
                    <td><div className="actions">
                      <span className="link" onClick={() => setEdit(w)}>Edit</span>
                      {can(admin?.role, 'admin') && <button className="iconbtn" style={{ width: 30, height: 30, color: 'var(--red)' }} onClick={() => remove(w)}><Trash2 size={15} /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {edit && <WorkerModal worker={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} toast={toast} />}
    </div>
  )
}

function WorkerModal({ worker, onClose, onSaved, toast }: { worker: Worker | null; onClose: () => void; onSaved: () => void; toast: (m: string, k?: 'ok' | 'err') => void }) {
  const [f, setF] = useState({
    name: worker?.name || '', phone: worker?.phone || '', email: worker?.email || '',
    city: worker?.city || 'Mumbai', services: (worker?.services || []).join(', '),
    status: worker?.status || 'pending', verified: worker?.verified || false,
  })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }))

  async function save() {
    if (!f.name.trim()) return toast('Name is required', 'err')
    setBusy(true)
    const body = { ...f, services: f.services.split(',').map((s) => s.trim()).filter(Boolean) }
    try {
      if (worker) await updateWorker(worker.id, body); else await createWorker(body)
      toast('Saved'); onSaved()
    } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  return (
    <Modal title={worker ? 'Edit Worker' : 'Add Worker'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="form-grid">
        <Field label="Full name"><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Rakesh Kumar" /></Field>
        <Field label="Phone"><input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 …" /></Field>
        <Field label="Email"><input value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="name@pros.homehelp.in" /></Field>
        <Field label="City"><select value={f.city} onChange={(e) => set('city', e.target.value)}>{CITIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Services (comma separated)"><input value={f.services} onChange={(e) => set('services', e.target.value)} placeholder="Cleaning, Bathroom" /></Field>
      <div className="form-grid">
        <Field label="Status"><select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="active">Active</option><option value="pending">Pending</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></Field>
        <Field label="Verified"><select value={f.verified ? '1' : '0'} onChange={(e) => set('verified', e.target.value === '1')}><option value="1">Yes</option><option value="0">No</option></select></Field>
      </div>
    </Modal>
  )
}
