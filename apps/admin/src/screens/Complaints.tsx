import { useEffect, useState } from 'react'
import {
  Download, Eye, MoreVertical, Calendar, Star, MessageSquare, Clock,
  IndianRupee, AlertTriangle, CheckCircle2, XCircle, X,
} from 'lucide-react'
import { fetchComplaints, updateComplaint } from '../api'
import type { Complaint } from '../types'
import { Card, Badge, SearchBox, Pagination, Loading, ErrorState, shortDate, Modal, Field, useToast, FilterTabs } from '../components/UI'

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

type Queue = 'open' | 'in_progress' | 'resolved' | 'closed' | 'all'
const queueOf = (s: string): Exclude<Queue, 'all'> => {
  const n = (s || '').toLowerCase().replace(/\s+/g, '_')
  return n === 'resolved' || n === 'closed' || n === 'in_progress' ? n : 'open'
}
const PRIORITY_ORDER = ['high', 'medium', 'low']

export default function Complaints() {
  const [rows, setRows] = useState<Complaint[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [queue, setQueue] = useState<Queue>('open')
  const [category, setCategory] = useState('all')
  const [priority, setPriority] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [view, setView] = useState<Complaint | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [editStatus, setEditStatus] = useState('open')
  const [editPriority, setEditPriority] = useState('medium')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const load = () => { setErr(''); fetchComplaints('all', 'all').then(setRows).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  useEffect(() => { setPage(1); setSel(new Set()) }, [queue, category, priority, q])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const count = (k: Queue) => (k === 'all' ? rows.length : rows.filter((c) => queueOf(c.status) === k).length)
  const categories = Array.from(new Set(rows.map((c) => c.category).filter(Boolean))).sort()
  const priorities = PRIORITY_ORDER.filter((p) => rows.some((c) => (c.priority || '').toLowerCase() === p))

  const ql = q.trim().toLowerCase()
  const filtered = rows
    .filter((c) => queue === 'all' || queueOf(c.status) === queue)
    .filter((c) => category === 'all' || c.category === category)
    .filter((c) => priority === 'all' || (c.priority || '').toLowerCase() === priority)
    .filter((c) => !ql || [c.ref, c.customer, c.against, c.booking_ref, c.message].some((v) => (v || '').toLowerCase().includes(ql)))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const allOnPage = pageRows.length > 0 && pageRows.every((c) => sel.has(c.id))
  const toggleAll = () => setSel((s) => { const n = new Set(s); pageRows.forEach((c) => (allOnPage ? n.delete(c.id) : n.add(c.id))); return n })
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const STATUS_OPTS = ['open', 'in_progress', 'resolved', 'closed']
  const PRIORITY_OPTS = ['low', 'medium', 'high']
  const matchIn = (opts: string[], s: string, fb: string) => opts.find((o) => o === (s || '').toLowerCase()) || fb
  const openView = (c: Complaint) => { setView(c); setEditStatus(matchIn(STATUS_OPTS, c.status, 'open')); setEditPriority(matchIn(PRIORITY_OPTS, c.priority, 'medium')); setMenuFor(null) }

  const quick = (id: number, status: string, msg: string) =>
    updateComplaint(id, { status }).then(() => { toast(msg); setMenuFor(null); load() }).catch((e: Error) => toast(e.message, 'err'))
  const bulk = (status: string, msg: string) =>
    Promise.all([...sel].map((id) => updateComplaint(id, { status })))
      .then(() => { toast(`${sel.size} ${sel.size === 1 ? 'complaint' : 'complaints'} ${msg}`); setSel(new Set()); load() })
      .catch((e: Error) => toast(e.message, 'err'))

  const saveComplaint = () => {
    if (!view) return
    setSaving(true)
    updateComplaint(view.id, { status: editStatus, priority: editPriority })
      .then(() => { toast('Complaint updated'); setView(null); load() })
      .catch((e: Error) => toast(e.message, 'err'))
      .finally(() => setSaving(false))
  }

  const exportCsv = (list: Complaint[]) => {
    const cols = ['Complaint ID', 'Booking ID', 'Customer', 'Against', 'Category', 'Priority', 'Status', 'Date', 'Message']
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [cols.join(',')].concat(
      list.map((c) => [c.ref, c.booking_ref || '', c.customer, c.against || '', c.category || '', titleCase(c.priority), titleCase(c.status), shortDate(c.created), c.message].map(esc).join(','))
    )
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'complaints.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const menuBtn = { width: '100%', justifyContent: 'flex-start', border: 'none' } as const

  return (
    <div className="grid" style={{ gap: 16 }}>
      <Card>
        <div className="card-head lg">
          <h3>Complaints<span className="count">{rows.length.toLocaleString('en-IN')}</span></h3>
          <div className="head-actions">
            <button className="btn line" onClick={() => exportCsv(filtered)}><Download size={15} /> Export</button>
          </div>
        </div>

        <FilterTabs value={queue} onChange={setQueue} tabs={[
          { key: 'open', label: 'Open', count: count('open'), alert: true },
          { key: 'in_progress', label: 'In progress', count: count('in_progress') },
          { key: 'resolved', label: 'Resolved', count: count('resolved') },
          { key: 'closed', label: 'Closed', count: count('closed') },
          { key: 'all', label: 'All', count: count('all') },
        ]} />

        {sel.size > 0 ? (
          <div className="bulkbar">
            <span>{sel.size} selected</span>
            <div className="tb-spacer" />
            <button className="btn line" onClick={() => bulk('resolved', 'resolved')}><CheckCircle2 size={14} /> Resolve</button>
            <button className="btn line" onClick={() => bulk('closed', 'closed')}><XCircle size={14} /> Close</button>
            <button className="btn line" onClick={() => exportCsv(filtered.filter((c) => sel.has(c.id)))}><Download size={14} /> Export selected</button>
            <button className="btn line" onClick={() => setSel(new Set())}><X size={14} /> Clear</button>
          </div>
        ) : (
          <div className="toolbar">
            <SearchBox value={q} onChange={setQ} placeholder="Search complaint ID, customer, expert or booking" />
            <select className="select flt" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {priorities.length > 1 && (
              <select className="select flt" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="all">All priorities</option>
                {priorities.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
              </select>
            )}
          </div>
        )}

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allOnPage} onChange={toggleAll} /></th>
                <th>Complaint</th><th>Customer</th><th>Against</th><th>Category</th><th>Priority</th><th>Status</th><th>Date</th>
                <th className="sticky-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const cat = catFor(r.category)
                const CatIcon = cat.icon
                return (
                  <tr key={r.id}>
                    <td><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td style={{ maxWidth: 320 }}>
                      <button className="cell-link" onClick={() => openView(r)}>
                        <strong className="clamp1">{r.message || cat.label}</strong>
                        <small className="muted">{r.ref}{r.booking_ref ? ` · Booking ${r.booking_ref}` : ''}</small>
                      </button>
                    </td>
                    <td className="nowrap">{r.customer}</td>
                    <td className="nowrap">{r.against || <span className="muted">—</span>}</td>
                    <td>
                      <span className="row nowrap" style={{ gap: 6, alignItems: 'center' }}>
                        <CatIcon size={14} style={{ color: 'var(--muted)' }} />
                        {cat.label}
                      </span>
                    </td>
                    <td><Badge>{titleCase(r.priority)}</Badge></td>
                    <td><Badge>{titleCase(r.status)}</Badge></td>
                    <td className="muted nowrap">{shortDate(r.created)}</td>
                    <td className="sticky-end">
                      <div className="actions" style={{ position: 'relative' }}>
                        <button className="iconbtn" style={{ width: 30, height: 30 }} title="View" onClick={() => openView(r)}><Eye size={16} /></button>
                        <button className="iconbtn" style={{ width: 30, height: 30 }} title="More" onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}><MoreVertical size={16} /></button>
                        {menuFor === r.id && (
                          <div className="menu" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: '#fff', border: '1px solid #e6e6ef', borderRadius: 8, boxShadow: '0 8px 24px rgba(20,20,40,.12)', padding: 4, minWidth: 140 }}>
                            <button className="btn line" style={menuBtn} onClick={() => quick(r.id, 'resolved', 'Complaint resolved')}>Resolve</button>
                            <button className="btn line" style={menuBtn} onClick={() => quick(r.id, 'closed', 'Complaint closed')}>Close</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!pageRows.length && (
                <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: '36px 0' }}>
                  {!rows.length ? 'No complaints yet.' : queue === 'open' && !ql && category === 'all' && priority === 'all' ? 'No open complaints — the queue is clear.' : 'No complaints match these filters.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="complaints" onPage={setPage} onSize={(s) => { setPageSize(s); setPage(1) }} />
      </Card>

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
