import { useEffect, useState } from 'react'
import {
  Funnel, Download, Eye, MoreVertical, Calendar, Star, MessageSquare, Clock,
  IndianRupee, AlertTriangle, ChevronRight, CheckCircle2,
} from 'lucide-react'
import { fetchComplaints, updateComplaint } from '../api'
import type { Complaint } from '../types'
import { Card, StatCard, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, SumBars, shortDate, Modal, Field, useToast } from '../components/UI'
import { Donut } from '../components/Charts'

type Cat = { label: string; icon: typeof Star; color: string }
const CATS: Record<string, Cat> = {
  'Service Quality': { label: 'Service Quality', icon: Star, color: '#5b51e8' },
  Behavior: { label: 'Behavior', icon: MessageSquare, color: '#f59e0b' },
  Delay: { label: 'Delay', icon: Clock, color: '#2e90fa' },
  Overcharging: { label: 'Overcharging', icon: IndianRupee, color: '#16a34a' },
  Damage: { label: 'Damage', icon: AlertTriangle, color: '#e0427f' },
  'No Show': { label: 'No Show', icon: Calendar, color: '#7c6df7' },
  Unprofessional: { label: 'Unprofessional', icon: AlertTriangle, color: '#f04438' },
  Other: { label: 'Other', icon: MessageSquare, color: '#98a2b3' },
}
const catFor = (name: string): Cat => CATS[name] || { label: name || 'Other', icon: MessageSquare, color: '#98a2b3' }

const titleCase = (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export default function Complaints() {
  const [rows, setRows] = useState<Complaint[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [view, setView] = useState<Complaint | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [editStatus, setEditStatus] = useState('open')
  const [editPriority, setEditPriority] = useState('medium')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const load = (st = status) => { setErr(''); fetchComplaints(st, 'all').then(setRows).catch((e: Error) => setErr(e.message)) }
  useEffect(() => { load() }, [])
  if (err) return <ErrorState msg={err} onRetry={() => load()} />
  if (!rows) return <Loading />

  const cnt = (st: string) => rows.filter((c) => c.status === st).length
  const open = cnt('open'), inProgress = cnt('in_progress'), resolved = cnt('resolved'), closed = cnt('closed')

  const categories = Array.from(new Set(rows.map((c) => c.category).filter(Boolean)))

  const ql = q.trim().toLowerCase()
  const filtered = rows
    .filter((c) => category === 'all' || c.category === category)
    .filter((c) =>
      !ql || (c.ref || '').toLowerCase().includes(ql) || (c.customer || '').toLowerCase().includes(ql) || (c.against || '').toLowerCase().includes(ql) || (c.booking_ref || '').toLowerCase().includes(ql))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const STATUS_OPTS = ['open', 'in_progress', 'resolved', 'closed']
  const PRIORITY_OPTS = ['low', 'medium', 'high']
  const matchIn = (opts: string[], s: string, fb: string) => opts.find((o) => o === (s || '').toLowerCase()) || fb
  const openView = (c: Complaint) => { setView(c); setEditStatus(matchIn(STATUS_OPTS, c.status, 'open')); setEditPriority(matchIn(PRIORITY_OPTS, c.priority, 'medium')); setMenuFor(null) }

  const onStatusChange = (v: string) => { setStatus(v); setPage(1); load(v) }

  const quickResolve = (id: number) =>
    updateComplaint(id, { status: 'resolved' }).then(() => { toast('Complaint resolved'); setMenuFor(null); load() }).catch((e: Error) => toast(e.message, 'err'))

  const saveComplaint = () => {
    if (!view) return
    setSaving(true)
    updateComplaint(view.id, { status: editStatus, priority: editPriority })
      .then(() => { toast('Complaint updated'); setView(null); load() })
      .catch((e: Error) => toast(e.message, 'err'))
      .finally(() => setSaving(false))
  }

  const exportCsv = () => {
    const cols = ['Complaint ID', 'Booking ID', 'Customer', 'Against', 'Category', 'Priority', 'Status', 'Date']
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [cols.join(',')].concat(
      filtered.map((c) => [c.ref, c.booking_ref || '', c.customer, c.against || '', c.category || '', titleCase(c.priority), titleCase(c.status), shortDate(c.created)].map(esc).join(','))
    )
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'complaints.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const total = rows.length || 1
  const DONUT = [
    { label: 'Open', value: open, color: '#f59e0b' },
    { label: 'In Progress', value: inProgress, color: '#2e90fa' },
    { label: 'Resolved', value: resolved, color: '#16a34a' },
    { label: 'Closed', value: closed, color: '#98a2b3' },
  ]
  const STATUS_LEGEND = DONUT.map((s) => ({ ...s, pct: ((s.value / total) * 100).toFixed(1) + '%' }))

  const catCounts: Record<string, number> = {}
  rows.forEach((c) => { const k = c.category || 'Other'; catCounts[k] = (catCounts[k] || 0) + 1 })
  const CAT_COLORS = ['#5b51e8', '#f59e0b', '#2e90fa', '#16a34a', '#7c6df7', '#98a2b3']
  const CATEGORY_BARS = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([label, n], i) => ({ label, value: `${n} (${((n / total) * 100).toFixed(1)}%)`, pct: n, color: CAT_COLORS[i % CAT_COLORS.length] }))

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<MessageSquare size={22} />} tint="#5b51e8" label="Total Complaints" value={rows.length.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<Clock size={22} />} tint="#f59e0b" label="Open" value={open.toLocaleString('en-IN')} sub="awaiting action" />
        <StatCard icon={<AlertTriangle size={22} />} tint="#2e90fa" label="In Progress" value={inProgress.toLocaleString('en-IN')} sub="being handled" />
        <StatCard icon={<CheckCircle2 size={22} />} tint="#16a34a" label="Resolved" value={resolved.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<ChevronRight size={22} />} tint="#98a2b3" label="Closed" value={closed.toLocaleString('en-IN')} sub="all time" />
      </div>

      <div className="cols">
        <Card>
          <div className="toolbar">
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search by Complaint ID, Customer, Worker or Booking ID..." />
            <select className="select flt" value={status} onChange={(e) => onStatusChange(e.target.value)}>
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <select className="select flt" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }}>
              <option value="all">All Categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="btn line"><Calendar size={16} /> Select Date Range</button>
            <div className="tb-spacer" />
            <button className="btn line"><Funnel size={16} /> Filters</button>
            <button className="btn line" onClick={exportCsv}><Download size={16} /> Export</button>
          </div>

          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>COMPLAINT ID</th><th>BOOKING ID</th><th>CUSTOMER</th><th>AGAINST</th>
                  <th>CATEGORY</th><th>PRIORITY</th><th>STATUS</th><th>DATE</th><th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const cat = catFor(r.category)
                  const CatIcon = cat.icon
                  return (
                    <tr key={r.id}>
                      <td className="muted">{r.ref}</td>
                      <td className="muted">{r.booking_ref || '—'}</td>
                      <td>
                        <div className="cell-user">
                          <Avatar name={r.customer} size={34} />
                          <div><strong style={{ fontSize: 13 }}>{r.customer}</strong></div>
                        </div>
                      </td>
                      <td>
                        {r.against ? (
                          <div className="cell-user">
                            <Avatar name={r.against} size={30} />
                            <div><strong style={{ fontSize: 13 }}>{r.against}</strong><small className="muted" style={{ display: 'block' }}>Worker</small></div>
                          </div>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>
                        <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                          <CatIcon size={15} style={{ color: cat.color }} />
                          {cat.label}
                        </span>
                      </td>
                      <td><Badge>{titleCase(r.priority)}</Badge></td>
                      <td><Badge>{titleCase(r.status)}</Badge></td>
                      <td><strong style={{ fontSize: 13 }}>{shortDate(r.created)}</strong></td>
                      <td>
                        <div className="actions" style={{ position: 'relative' }}>
                          <button className="btn line" title="View" onClick={() => openView(r)}><Eye size={16} /></button>
                          <button className="btn line" title="More" onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}><MoreVertical size={16} /></button>
                          {menuFor === r.id && (
                            <div className="menu" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: '#fff', border: '1px solid #e6e6ef', borderRadius: 8, boxShadow: '0 8px 24px rgba(20,20,40,.12)', padding: 4, minWidth: 140 }}>
                              <button className="btn line" style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }} onClick={() => quickResolve(r.id)}>Resolve</button>
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
          <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="complaints" onPage={setPage} />
        </Card>

        <div className="col-rail">
          <Card title="Complaints by Status">
            <Donut size={150} data={DONUT} />
            <div className="minilist" style={{ marginTop: 12 }}>
              {STATUS_LEGEND.map((s) => (
                <div key={s.label} className="sumrow">
                  <span className="lbl"><i className="bdot" style={{ background: s.color, marginRight: 8 }} />{s.label}</span>
                  <span className="val">{s.value} ({s.pct})</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Complaints by Category">
            {CATEGORY_BARS.length ? <SumBars rows={CATEGORY_BARS} /> : <p className="muted">No complaints yet.</p>}
          </Card>
        </div>
      </div>

      {view && (
        <Modal
          title={`Complaint ${view.ref}`}
          onClose={() => setView(null)}
          footer={
            <>
              <button className="btn line" onClick={() => setView(null)}>Cancel</button>
              <button className="btn" disabled={saving} onClick={saveComplaint}>{saving ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Reference"><div className="muted">{view.ref}</div></Field>
            <Field label="Customer"><div>{view.customer}</div></Field>
            <Field label="Against"><div>{view.against || '—'}</div></Field>
            <Field label="Booking ID"><div className="muted">{view.booking_ref || '—'}</div></Field>
            <Field label="Category"><div>{catFor(view.category).label}</div></Field>
            <Field label="Created"><div className="muted">{shortDate(view.created)}</div></Field>
            <Field label="Message"><div>{view.message}</div></Field>
            <Field label="Status">
              <select className="select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </Field>
            <Field label="Priority">
              <select className="select" value={editPriority} onChange={(e) => setEditPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  )
}
