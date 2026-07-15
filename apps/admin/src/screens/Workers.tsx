import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, UserCheck, UserPlus, UserX, Star, Funnel, Plus, MoreVertical } from 'lucide-react'
import { fetchWorkers, createWorker, updateWorker, deleteWorker, fetchServices, fetchZones, type Zone } from '../api'
import type { Worker } from '../types'
import { StatCard, Card, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, Modal, Field, useToast, useConfirm, shortDate } from '../components/UI'
import { useStore, can } from '../store'
import { CITIES } from '../cities'

type Stats = { total: number; active: number; pending: number; inactive: number }

type Personal = { gender: string; dob: string; fatherName: string; address: string; aadhaar: string; pan: string; whatsapp: string; emergencyName: string; emergencyPhone: string; languages: string }
const EMPTY_PERSONAL: Personal = { gender: '', dob: '', fatherName: '', address: '', aadhaar: '', pan: '', whatsapp: '', emergencyName: '', emergencyPhone: '', languages: '' }
type Draft = { name: string; phone: string; email: string; city: string; services: string[]; status: string; zone_id: number | null; designation: string; personal: Personal }
const EMPTY_DRAFT: Draft = { name: '', phone: '', email: '', city: '', services: [], status: 'pending', zone_id: null, designation: 'Worker', personal: { ...EMPTY_PERSONAL } }

export default function Workers() {
  const { admin } = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const [data, setData] = useState<{ stats: Stats; workers: Worker[] } | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [city, setCity] = useState('all')
  const [service, setService] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const [menuId, setMenuId] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [editing, setEditing] = useState<Worker | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT)
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [allServices, setAllServices] = useState<string[]>([])
  const [zones, setZones] = useState<Zone[]>([])

  const load = () => { setErr(''); fetchWorkers(q, status, city).then(setData).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [q, status, city])
  // All bookable services → checkbox options for assigning a worker.
  useEffect(() => { fetchServices().then((s) => setAllServices(s.map((x) => x.name))).catch(() => {}) }, [])
  // Zones → the "assign worker to a service area" dropdown.
  useEffect(() => { fetchZones().then(setZones).catch(() => {}) }, [])

  useEffect(() => {
    if (menuId == null) return
    const h = () => setMenuId(null)
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [menuId])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!data) return <Loading />

  const stats = data.stats || { total: 0, active: 0, pending: 0, inactive: 0 }
  const sl = service.toLowerCase()
  const filtered = data.workers.filter((w) =>
    service === 'all' || (w.services || []).some((s) => s.toLowerCase() === sl))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const rated = data.workers.filter((w) => w.rating > 0)
  const avgRating = rated.length ? (rated.reduce((a, w) => a + w.rating, 0) / rated.length).toFixed(1) : '—'

  const addWorker = async () => {
    setBusy(true)
    try {
      await createWorker({ name: draft.name, phone: draft.phone, email: draft.email, city: draft.city, services: draft.services, status: draft.status, zone_id: draft.zone_id, designation: draft.designation, personal: draft.personal })
      toast('Worker added')
      setAddOpen(false); setDraft(EMPTY_DRAFT); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const saveEdit = async () => {
    if (!editing) return
    setBusy(true)
    try {
      await updateWorker(editing.id, { name: editDraft.name, phone: editDraft.phone, email: editDraft.email, city: editDraft.city, services: editDraft.services, status: editDraft.status, zone_id: editDraft.zone_id, designation: editDraft.designation, personal: editDraft.personal })
      toast('Worker updated')
      setEditing(null); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const doUpdate = async (id: number, body: Record<string, unknown>, msg: string) => {
    try { await updateWorker(id, body); toast(msg); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  const doDelete = async (w: Worker) => {
    if (!(await confirm({ title: `Delete worker "${w.name}"?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return
    try { await deleteWorker(w.id); toast('Worker deleted'); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  const openEdit = (w: Worker) => {
    setEditDraft({ name: w.name, phone: w.phone || '', email: w.email || '', city: w.city || '', services: w.services || [], status: w.status, zone_id: w.zone_id ?? null, designation: w.designation || 'Worker', personal: { ...EMPTY_PERSONAL, ...((w as { profile?: { personal?: Personal } }).profile?.personal || {}) } })
    setEditing(w)
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<Users size={22} />} tint="#5b51e8" label="Total Workers" value={stats.total.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<UserCheck size={22} />} tint="#16a34a" label="Active Workers" value={stats.active.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<UserPlus size={22} />} tint="#2e90fa" label="Pending Workers" value={stats.pending.toLocaleString('en-IN')} sub="awaiting approval" />
        <StatCard icon={<UserX size={22} />} tint="#f59e0b" label="Inactive Workers" value={stats.inactive.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<Star size={22} />} tint="#f59e0b" label="Avg. Rating" value={avgRating} sub="across workers" />
      </div>

      <Card>
        <div className="toolbar">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search worker by name, email or mobile…" />
          <div className="tb-spacer" />
          <select className="select flt" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select className="select flt" value={city} onChange={(e) => { setCity(e.target.value); setPage(1) }}>
            <option value="all">All Cities</option>
            {CITIES.map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}
          </select>
          <select className="select flt" value={service} onChange={(e) => { setService(e.target.value); setPage(1) }}>
            <option value="all">All Services</option>
            {allServices.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn line"><Funnel size={16} /> Filters</button>
          <button className="btn" onClick={() => { setDraft(EMPTY_DRAFT); setAddOpen(true) }}><Plus size={17} /> Add Worker</button>
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" /></th>
                <th>Worker</th>
                <th>Mobile Number</th>
                <th>Email</th>
                <th>City</th>
                <th>Role</th>
                <th>Services</th>
                <th className="num">Jobs Completed</th>
                <th>Rating</th>
                <th>Status</th>
                <th>Joined On</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((w) => {
                const svcCount = w.services?.length || 0
                return (
                  <tr key={w.id}>
                    <td><input type="checkbox" /></td>
                    <td>
                      <div className="cell-user">
                        <Avatar name={w.name} src={w.avatar} size={34} />
                        <div><strong>{w.name}</strong></div>
                      </div>
                    </td>
                    <td className="muted">{w.phone ?? '—'}</td>
                    <td className="muted">{w.email ?? '—'}</td>
                    <td>{w.city ?? '—'}</td>
                    <td><Badge tone={w.designation === 'Zone Manager' ? 'violet' : w.designation === 'Team Leader' ? 'green' : 'gray'} dot={false}>{w.designation || 'Worker'}</Badge></td>
                    <td>
                      {svcCount === 0 ? <span className="muted">—</span> : (
                        <span className="row" style={{ gap: 5 }}>
                          {(w.services || []).slice(0, 2).map((s) => <Badge key={s} tone="blue" dot={false}>{s}</Badge>)}
                          {svcCount > 2 && <span style={{ color: '#2e90fa', fontSize: 12, fontWeight: 700 }}>+{svcCount - 2}</span>}
                        </span>
                      )}
                    </td>
                    <td className="num">{w.jobs}</td>
                    <td>
                      <span className="row" style={{ gap: 4 }}>
                        <Star size={13} fill="#f59e0b" stroke="#f59e0b" /> {w.rating}
                      </span>
                    </td>
                    <td><Badge tone={w.status === 'active' ? 'green' : w.status === 'pending' ? 'amber' : 'red'}>{w.status}</Badge></td>
                    <td className="muted">{shortDate(w.joined)}</td>
                    <td>
                      <div className="actions" style={{ position: 'relative' }}>
                        <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={(e) => { e.stopPropagation(); setMenuId(menuId === w.id ? null : w.id) }}><MoreVertical size={16} /></button>
                        {menuId === w.id && (
                          <div className="menu" style={{ position: 'absolute', right: 0, top: 34, zIndex: 20, background: 'var(--card, #fff)', border: '1px solid var(--line, #e4e7ec)', borderRadius: 8, boxShadow: '0 8px 24px rgba(16,24,40,.12)', minWidth: 150, padding: 4 }} onClick={(e) => e.stopPropagation()}>
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); nav(`/workers/${w.id}`) }}>View</button>
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); openEdit(w) }}>Edit</button>
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); doUpdate(w.id, { status: 'active', verified: true }, 'Worker approved') }}>Approve</button>
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); doUpdate(w.id, { status: 'suspended' }, 'Worker suspended') }}>Suspend</button>
                            {can(admin?.role, 'admin') && (
                              <button className="menu-item" style={{ ...MENU_ITEM, color: '#d92d20' }} onClick={() => { setMenuId(null); doDelete(w) }}>Delete</button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="workers" onPage={setPage} />
      </Card>

      {addOpen && (
        <Modal title="Add Worker" onClose={() => setAddOpen(false)} footer={
          <>
            <button className="btn line" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy || !draft.name.trim()} onClick={addWorker}>Add Worker</button>
          </>
        }>
          <WorkerForm draft={draft} onChange={setDraft} services={allServices} zones={zones} />
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Worker" onClose={() => setEditing(null)} footer={
          <>
            <button className="btn line" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" disabled={busy || !editDraft.name.trim()} onClick={saveEdit}>Save Changes</button>
          </>
        }>
          <WorkerForm draft={editDraft} onChange={setEditDraft} services={allServices} zones={zones} />
        </Modal>
      )}

    </div>
  )
}

const MENU_ITEM: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }

function WorkerForm({ draft, onChange, services, zones }: { draft: Draft; onChange: (d: Draft) => void; services: string[]; zones: Zone[] }) {
  const set = (k: 'name' | 'phone' | 'email' | 'city' | 'status' | 'designation', v: string) => onChange({ ...draft, [k]: v })
  const setP = (k: keyof Personal, v: string) => onChange({ ...draft, personal: { ...draft.personal, [k]: v } })
  const toggleService = (name: string) => {
    const has = draft.services.includes(name)
    onChange({ ...draft, services: has ? draft.services.filter((s) => s !== name) : [...draft.services, name] })
  }
  return (
    <div className="grid" style={{ gap: 12 }}>
      <Field label="Name"><input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Full name" /></Field>
      <Field label="Mobile Number"><input value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="Phone" /></Field>
      <Field label="Email"><input value={draft.email} onChange={(e) => set('email', e.target.value)} placeholder="Email" /></Field>
      <Field label="City">
        <select value={draft.city} onChange={(e) => set('city', e.target.value)}>
          <option value="">— Select city —</option>
          {CITIES.map((c) => <option key={c.city} value={c.city}>{c.city} · {c.state}</option>)}
          {draft.city && !CITIES.some((c) => c.city === draft.city) && <option value={draft.city}>{draft.city}</option>}
        </select>
      </Field>
      <Field label="Role / Designation">
        <select value={draft.designation} onChange={(e) => set('designation', e.target.value)}>
          <option value="Worker">Worker</option>
          <option value="Team Leader">Team Leader</option>
          <option value="Zone Manager">Zone Manager</option>
        </select>
      </Field>
      <Field label="Service Zone (home area)">
        <select value={draft.zone_id ?? ''} onChange={(e) => onChange({ ...draft, zone_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">— Unassigned —</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}{z.city ? ` · ${z.city}` : ''} ({z.status})</option>)}
        </select>
      </Field>
      <div className="field">
        <span>Services{draft.services.length > 0 ? ` · ${draft.services.length} selected` : ''}</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
          {services.length === 0
            ? <span className="muted" style={{ fontSize: 13 }}>Loading services…</span>
            : services.map((name) => (
                <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={draft.services.includes(name)} onChange={() => toggleService(name)} />
                  <span>{name}</span>
                </label>
              ))}
        </div>
      </div>

      {/* Personal & KYC details (optional — stored on the worker profile) */}
      <div className="field"><span style={{ fontWeight: 600 }}>Personal & KYC details</span></div>
      <div className="row" style={{ gap: 12 }}>
        <Field label="Gender">
          <select value={draft.personal.gender} onChange={(e) => setP('gender', e.target.value)}>
            <option value="">—</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option>
          </select>
        </Field>
        <Field label="Date of Birth"><input type="date" value={draft.personal.dob} onChange={(e) => setP('dob', e.target.value)} /></Field>
      </div>
      <Field label="Father's Name"><input value={draft.personal.fatherName} onChange={(e) => setP('fatherName', e.target.value)} placeholder="Father's name" /></Field>
      <Field label="Home Address"><textarea value={draft.personal.address} onChange={(e) => setP('address', e.target.value)} placeholder="Residential address" rows={2} /></Field>
      <div className="row" style={{ gap: 12 }}>
        <Field label="Aadhaar Number"><input value={draft.personal.aadhaar} onChange={(e) => setP('aadhaar', e.target.value.replace(/[^0-9]/g, '').slice(0, 12))} placeholder="12-digit Aadhaar" /></Field>
        <Field label="PAN Number"><input value={draft.personal.pan} onChange={(e) => setP('pan', e.target.value.toUpperCase().slice(0, 10))} placeholder="ABCDE1234F" /></Field>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <Field label="WhatsApp Number"><input value={draft.personal.whatsapp} onChange={(e) => setP('whatsapp', e.target.value)} placeholder="WhatsApp (if different)" /></Field>
        <Field label="Languages Known"><input value={draft.personal.languages} onChange={(e) => setP('languages', e.target.value)} placeholder="e.g. Telugu, Hindi, English" /></Field>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <Field label="Emergency Contact Name"><input value={draft.personal.emergencyName} onChange={(e) => setP('emergencyName', e.target.value)} placeholder="Contact name" /></Field>
        <Field label="Emergency Contact Phone"><input value={draft.personal.emergencyPhone} onChange={(e) => setP('emergencyPhone', e.target.value)} placeholder="Contact phone" /></Field>
      </div>

      <Field label="Status">
        <select value={draft.status} onChange={(e) => set('status', e.target.value)}>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
      </Field>
    </div>
  )
}
