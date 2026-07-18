import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, UserCheck, UserPlus, UserX, Star, Funnel, Plus, MoreVertical } from 'lucide-react'
import { fetchWorkers, updateWorker, deleteWorker, inviteWorker, fetchServices } from '../api'
import type { Worker } from '../types'
import { StatCard, Card, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, useToast, useConfirm, shortDate } from '../components/UI'
import { useStore, has } from '../store'
import { CITIES } from '../cities'

type Stats = { total: number; active: number; onboarding: number; pending: number; inactive: number }

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
  const nav = useNavigate()
  const [allServices, setAllServices] = useState<string[]>([])

  const load = () => { setErr(''); fetchWorkers(q, status, city).then(setData).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [q, status, city])
  // All bookable services → options for the service filter.
  useEffect(() => { fetchServices().then((s) => setAllServices(s.map((x) => x.name))).catch(() => {}) }, [])

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

  const doUpdate = async (id: number, body: Record<string, unknown>, msg: string) => {
    try { await updateWorker(id, body); toast(msg); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  // The invite always flips them to 'onboarding' (so they can sign in); the SMS may or may not go
  // out. Report which — otherwise an admin assumes the worker was texted and waits for nothing.
  const doInvite = async (w: Worker) => {
    try {
      const r = await inviteWorker(w.id)
      toast(r.delivery === 'sent'
        ? `Invite sent to ${w.name}`
        : `${w.name} can now sign in — but no SMS went out (${r.delivery}). Tell them to log in with ${w.phone}.`,
      r.delivery === 'sent' ? undefined : 'err')
      load()
    } catch (e) { toast((e as Error).message, 'err') }
  }

  const doDelete = async (w: Worker) => {
    if (!(await confirm({ title: `Delete worker "${w.name}"?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return
    try { await deleteWorker(w.id); toast('Worker deleted'); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  // Edit opens the same full wizard as Add (prefilled), not a thin modal.
  const openEdit = (w: Worker) => nav(`/workers/${w.id}/edit`)

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
          {/* The wizard, not the old modal: it captures category, employment type, joining date,
              zone, shift and salary plan — the fields the go-live checklist actually gates on. */}
          <button className="btn" onClick={() => nav('/workers/new')}><Plus size={17} /> Add Worker</button>
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
                    {/* 'onboarding' is in-progress, not a failure — red would read as suspended. */}
                    <td><Badge tone={w.status === 'active' ? 'green' : w.status === 'onboarding' ? 'blue' : w.status === 'pending' ? 'amber' : 'red'}>{w.status}</Badge></td>
                    <td className="muted">{shortDate(w.joined)}</td>
                    <td>
                      <div className="actions" style={{ position: 'relative' }}>
                        <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={(e) => { e.stopPropagation(); setMenuId(menuId === w.id ? null : w.id) }}><MoreVertical size={16} /></button>
                        {menuId === w.id && (
                          <div className="menu" style={{ position: 'absolute', right: 0, top: 34, zIndex: 20, background: 'var(--card, #fff)', border: '1px solid var(--line, #e4e7ec)', borderRadius: 8, boxShadow: '0 8px 24px rgba(16,24,40,.12)', minWidth: 150, padding: 4 }} onClick={(e) => e.stopPropagation()}>
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); nav(`/workers/${w.id}`) }}>View</button>
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); openEdit(w) }}>Edit</button>
                            {/* Only offered while they can't get in yet — an invite is what lets a
                                pending worker sign in and complete their own profile. */}
                            {w.status === 'pending' && (
                              <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); doInvite(w) }}>Send invite</button>
                            )}
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); doUpdate(w.id, { status: 'active', verified: true }, 'Worker approved') }}>Approve</button>
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); doUpdate(w.id, { status: 'suspended' }, 'Worker suspended') }}>Suspend</button>
                            {has(admin, 'workers.delete') && (
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


    </div>
  )
}

const MENU_ITEM: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }

