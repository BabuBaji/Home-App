import { useEffect, useState, type CSSProperties } from 'react'
import { Users, UserCheck, UserPlus, UserX, Star, Funnel, Plus, MoreVertical } from 'lucide-react'
import { fetchWorkers, fetchWorkerDetail, createWorker, updateWorker, deleteWorker, fetchServices, fetchZones, type Zone } from '../api'
import type { Worker, WorkerDetail } from '../types'
import { StatCard, Card, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, Modal, Field, useToast, useConfirm, shortDate } from '../components/UI'
import { useStore, can } from '../store'
import { CITIES } from '../cities'

type Stats = { total: number; active: number; pending: number; inactive: number }

type Draft = { name: string; phone: string; email: string; city: string; services: string[]; status: string; zone_id: number | null; designation: string }
const EMPTY_DRAFT: Draft = { name: '', phone: '', email: '', city: '', services: [], status: 'pending', zone_id: null, designation: 'Worker' }

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
  const [viewing, setViewing] = useState<Worker | null>(null)
  const [detail, setDetail] = useState<WorkerDetail | null>(null)
  // Open the details modal instantly with the list data, then enrich with documents + recent jobs.
  const openView = (w: Worker) => { setViewing(w); setDetail(null); fetchWorkerDetail(w.id).then(setDetail).catch(() => {}) }
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
      await createWorker({ name: draft.name, phone: draft.phone, email: draft.email, city: draft.city, services: draft.services, status: draft.status, zone_id: draft.zone_id, designation: draft.designation })
      toast('Worker added')
      setAddOpen(false); setDraft(EMPTY_DRAFT); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const saveEdit = async () => {
    if (!editing) return
    setBusy(true)
    try {
      await updateWorker(editing.id, { name: editDraft.name, phone: editDraft.phone, email: editDraft.email, city: editDraft.city, services: editDraft.services, status: editDraft.status, zone_id: editDraft.zone_id, designation: editDraft.designation })
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
    setEditDraft({ name: w.name, phone: w.phone || '', email: w.email || '', city: w.city || '', services: w.services || [], status: w.status, zone_id: w.zone_id ?? null, designation: w.designation || 'Worker' })
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
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); openView(w) }}>View</button>
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

      {viewing && (
        <Modal title="Worker Details" onClose={() => { setViewing(null); setDetail(null) }}>
          <div className="grid" style={{ gap: 12 }}>
            <div className="cell-user">
              <Avatar name={viewing.name} src={viewing.avatar} size={48} />
              <div><strong>{viewing.name}</strong><div className="muted" style={{ fontSize: 12 }}>{viewing.designation || 'Worker'} · ID {viewing.id}</div></div>
            </div>
            <div className="row" style={{ gap: 24 }}>
              <Field label="Mobile Number"><input value={viewing.phone || '—'} readOnly /></Field>
              <Field label="Email"><input value={viewing.email || '—'} readOnly /></Field>
            </div>
            <div className="row" style={{ gap: 24 }}>
              <Field label="City"><input value={viewing.city || '—'} readOnly /></Field>
              <Field label="Zone"><input value={zones.find((z) => z.id === viewing.zone_id)?.name || '—'} readOnly /></Field>
            </div>
            <Field label="Services"><input value={(viewing.services || []).join(', ') || '—'} readOnly /></Field>
            <div className="row" style={{ gap: 24 }}>
              <Field label="Status"><div><Badge tone={viewing.status === 'active' ? 'green' : viewing.status === 'pending' ? 'amber' : 'red'}>{viewing.status}</Badge></div></Field>
              <Field label="Verified"><div><Badge tone={viewing.verified ? 'green' : 'gray'} dot={false}>{viewing.verified ? 'Verified' : 'Unverified'}</Badge></div></Field>
              <Field label="Availability"><div><Badge tone={viewing.available ? 'green' : 'gray'} dot={false}>{viewing.available ? 'Online' : 'Offline'}</Badge></div></Field>
              <Field label="On Shift"><div><Badge tone={viewing.on_shift ? 'green' : 'gray'} dot={false}>{viewing.on_shift ? 'On shift' : 'Off'}</Badge></div></Field>
            </div>
            <div className="row" style={{ gap: 24 }}>
              <Field label="Jobs Completed"><input value={String(viewing.jobs)} readOnly /></Field>
              <Field label="Rating"><input value={viewing.rating ? String(viewing.rating) : '—'} readOnly /></Field>
              <Field label="Last Location"><input value={viewing.last_lat != null ? `${Number(viewing.last_lat).toFixed(4)}, ${Number(viewing.last_lng).toFixed(4)}` : '—'} readOnly /></Field>
            </div>
            <div className="row" style={{ gap: 24 }}>
              <Field label="Balance"><input value={`₹${viewing.balance ?? 0}`} readOnly /></Field>
              <Field label="Lifetime Earnings"><input value={`₹${viewing.earnings ?? 0}`} readOnly /></Field>
              <Field label="On Hold"><input value={`₹${viewing.hold ?? 0}`} readOnly /></Field>
            </div>
            <div className="row" style={{ gap: 24 }}>
              <Field label="Withdrawn"><input value={`₹${viewing.withdrawn ?? 0}`} readOnly /></Field>
              <Field label="Advance Outstanding"><input value={`₹${viewing.advance_outstanding ?? 0}`} readOnly /></Field>
            </div>
            <Field label="Bank / KYC">
              <div><Badge tone={viewing.bank_status === 'Verified' ? 'green' : viewing.bank_status === 'Rejected' ? 'red' : 'amber'} dot={false}>{viewing.bank_status || 'Pending'}</Badge></div>
            </Field>
            {(() => {
              const bank = detail?.profile?.bank || viewing.profile?.bank
              const bv = detail?.profile?.bankVerification || viewing.profile?.bankVerification
              return (
                <>
                  <Field label="Bank Account">
                    <input
                      value={bank?.bankAccount
                        ? `${bank.bankName || 'Bank'} ••••${String(bank.bankAccount).slice(-4)} · ${bank.bankIfsc || ''}`
                        : 'No bank account added'}
                      readOnly
                    />
                  </Field>
                  {bv?.registeredName && (
                    <Field label="Registered Name (as per bank)"><input value={bv.registeredName} readOnly /></Field>
                  )}
                </>
              )
            })()}

            {/* KYC documents (fetched on open) */}
            <Field label={`KYC Documents${detail?.documents ? ` (${detail.documents.length})` : ''}`}>
              {!detail ? <div className="muted" style={{ fontSize: 12 }}>Loading…</div>
                : (detail.documents && detail.documents.length > 0) ? (
                  <div className="grid" style={{ gap: 6 }}>
                    {detail.documents.map((d) => (
                      <div key={d.id} className="row" style={{ gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13 }}>{d.name}{d.fileName ? ` · ${d.fileName}` : ''}</span>
                        <Badge tone={d.status === 'Verified' ? 'green' : d.status === 'Rejected' ? 'red' : 'amber'} dot={false}>{d.status || 'Pending'}</Badge>
                      </div>
                    ))}
                  </div>
                ) : <div className="muted" style={{ fontSize: 12 }}>No documents uploaded.</div>}
            </Field>

            {/* Recent jobs (fetched on open) */}
            <Field label={`Recent Jobs${detail?.recentJobs ? ` (${detail.recentJobs.length})` : ''}`}>
              {!detail ? <div className="muted" style={{ fontSize: 12 }}>Loading…</div>
                : (detail.recentJobs && detail.recentJobs.length > 0) ? (
                  <div className="grid" style={{ gap: 6 }}>
                    {detail.recentJobs.map((j) => (
                      <div key={j.id} className="row" style={{ gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13 }}>{j.ref} · {j.service}{j.date ? ` · ${j.date}` : ''}</span>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 13 }}>₹{j.total}</span>
                          <Badge tone={j.status === 'completed' ? 'green' : j.status === 'cancelled' ? 'red' : 'blue'} dot={false}>{j.status}</Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : <div className="muted" style={{ fontSize: 12 }}>No recent jobs.</div>}
            </Field>

            <Field label="Joined On"><input value={shortDate(viewing.joined)} readOnly /></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

const MENU_ITEM: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }

function WorkerForm({ draft, onChange, services, zones }: { draft: Draft; onChange: (d: Draft) => void; services: string[]; zones: Zone[] }) {
  const set = (k: 'name' | 'phone' | 'email' | 'city' | 'status' | 'designation', v: string) => onChange({ ...draft, [k]: v })
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
