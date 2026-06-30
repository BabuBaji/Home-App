import { useEffect, useState, type CSSProperties } from 'react'
import { Users, UserCheck, UserPlus, UserX, Star, Funnel, Plus, MoreVertical, Sparkles, Briefcase, Wrench, Hammer, Paintbrush } from 'lucide-react'
import { fetchWorkers, createWorker, updateWorker, deleteWorker } from '../api'
import type { Worker } from '../types'
import { StatCard, Card, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, Modal, Field, useToast, shortDate } from '../components/UI'
import { useStore, can } from '../store'

const SVC_ICONS = [Sparkles, Briefcase, Wrench, Hammer, Paintbrush]

type Stats = { total: number; active: number; pending: number; inactive: number }

type Draft = { name: string; phone: string; email: string; city: string; services: string; status: string }
const EMPTY_DRAFT: Draft = { name: '', phone: '', email: '', city: '', services: '', status: 'pending' }

export default function Workers() {
  const { admin } = useStore()
  const toast = useToast()
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
  const [viewing, setViewing] = useState<Worker | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => { setErr(''); fetchWorkers(q, status, city).then(setData).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [q, status, city])

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

  const parseServices = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

  const addWorker = async () => {
    setBusy(true)
    try {
      await createWorker({ name: draft.name, phone: draft.phone, email: draft.email, city: draft.city, services: parseServices(draft.services), status: draft.status })
      toast('Worker added')
      setAddOpen(false); setDraft(EMPTY_DRAFT); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const saveEdit = async () => {
    if (!editing) return
    setBusy(true)
    try {
      await updateWorker(editing.id, { name: editDraft.name, phone: editDraft.phone, email: editDraft.email, city: editDraft.city, services: parseServices(editDraft.services), status: editDraft.status })
      toast('Worker updated')
      setEditing(null); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const doUpdate = async (id: number, body: Record<string, unknown>, msg: string) => {
    try { await updateWorker(id, body); toast(msg); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  const doDelete = async (w: Worker) => {
    if (!window.confirm(`Delete worker "${w.name}"? This cannot be undone.`)) return
    try { await deleteWorker(w.id); toast('Worker deleted'); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  const openEdit = (w: Worker) => {
    setEditDraft({ name: w.name, phone: w.phone || '', email: w.email || '', city: w.city || '', services: (w.services || []).join(', '), status: w.status })
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
            <option>Mumbai</option><option>Delhi</option><option>Bangalore</option>
          </select>
          <select className="select flt" value={service} onChange={(e) => { setService(e.target.value); setPage(1) }}>
            <option value="all">All Services</option>
            <option>Cleaning</option><option>Plumbing</option><option>Electrical</option>
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
                    <td>
                      <div className="row" style={{ gap: 8, color: '#2e90fa' }}>
                        {SVC_ICONS.slice(0, Math.min(svcCount, 3)).map((Ic, i) => <Ic key={i} size={16} />)}
                        {svcCount > 3 && <span style={{ color: '#2e90fa', fontSize: 12, fontWeight: 600 }}>+{svcCount - 3}</span>}
                        {svcCount === 0 && <span className="muted">—</span>}
                      </div>
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
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); setViewing(w) }}>View</button>
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
          <WorkerForm draft={draft} onChange={setDraft} />
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Worker" onClose={() => setEditing(null)} footer={
          <>
            <button className="btn line" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" disabled={busy || !editDraft.name.trim()} onClick={saveEdit}>Save Changes</button>
          </>
        }>
          <WorkerForm draft={editDraft} onChange={setEditDraft} />
        </Modal>
      )}

      {viewing && (
        <Modal title="Worker Details" onClose={() => setViewing(null)}>
          <div className="grid" style={{ gap: 12 }}>
            <div className="cell-user"><Avatar name={viewing.name} src={viewing.avatar} size={48} /><div><strong>{viewing.name}</strong></div></div>
            <Field label="Mobile Number"><input value={viewing.phone || '—'} readOnly /></Field>
            <Field label="Email"><input value={viewing.email || '—'} readOnly /></Field>
            <Field label="City"><input value={viewing.city || '—'} readOnly /></Field>
            <Field label="Services"><input value={(viewing.services || []).join(', ') || '—'} readOnly /></Field>
            <Field label="Status"><div><Badge tone={viewing.status === 'active' ? 'green' : viewing.status === 'pending' ? 'amber' : 'red'}>{viewing.status}</Badge></div></Field>
            <div className="row" style={{ gap: 24 }}>
              <Field label="Jobs Completed"><input value={String(viewing.jobs)} readOnly /></Field>
              <Field label="Rating"><input value={String(viewing.rating)} readOnly /></Field>
            </div>
            <Field label="Joined On"><input value={shortDate(viewing.joined)} readOnly /></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

const MENU_ITEM: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }

function WorkerForm({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const set = (k: keyof Draft, v: string) => onChange({ ...draft, [k]: v })
  return (
    <div className="grid" style={{ gap: 12 }}>
      <Field label="Name"><input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Full name" /></Field>
      <Field label="Mobile Number"><input value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="Phone" /></Field>
      <Field label="Email"><input value={draft.email} onChange={(e) => set('email', e.target.value)} placeholder="Email" /></Field>
      <Field label="City"><input value={draft.city} onChange={(e) => set('city', e.target.value)} placeholder="City" /></Field>
      <Field label="Services"><input value={draft.services} onChange={(e) => set('services', e.target.value)} placeholder="Cleaning, Plumbing" /></Field>
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
