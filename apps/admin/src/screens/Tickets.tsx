import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Eye, MoreVertical, Siren, ArrowRight, CheckCircle2, XCircle, X } from 'lucide-react'
import { fetchTickets, updateTicket } from '../api'
import type { Ticket } from '../types'
import { useStore, has } from '../store'
import { Card, Badge, SearchBox, Pagination, Loading, ErrorState, shortDate, Modal, Field, useToast, FilterTabs } from '../components/UI'

const titleCase = (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const norm = (s: string) => (s || '').toLowerCase().replace(/\s+/g, '_')

// SOS alerts live in the tickets table too, but they're handled in the SOS app — not here.
const isSos = (t: Ticket) => !!t.sos_kind || /^#?SOS/i.test(t.ref || '')

// Working queues. Any status that isn't new or finished (acknowledged, in review, in progress…)
// is being worked on — it used to fall into no tab at all.
type Queue = 'open' | 'progress' | 'resolved' | 'closed' | 'all'
const queueOf = (s: string): Exclude<Queue, 'all'> => {
  const n = norm(s)
  if (n === 'resolved') return 'resolved'
  if (n === 'closed') return 'closed'
  if (n === 'open' || n === 'reopened' || n === 'new') return 'open'
  return 'progress'
}

// "Expert: Priya" → name + a Customer/Expert tag
const raisedBy = (t: Ticket) => ({ name: (t.customer || '').replace(/^Expert:\s*/, ''), expert: t.requester === 'worker' })
const lastUpdate = (t: Ticket) => [t.resolved_at, t.acknowledged_at, t.review_at, t.created].filter(Boolean).map((d) => new Date(d as string).getTime()).reduce((a, b) => Math.max(a, b), 0)
function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d < 30 ? `${d}d ago` : shortDate(new Date(ms).toISOString())
}
const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low']

export default function Tickets() {
  const nav = useNavigate()
  const { admin } = useStore()
  const [rows, setRows] = useState<Ticket[] | null>(null)
  const [err, setErr] = useState('')
  const [queue, setQueue] = useState<Queue>('open')
  const [category, setCategory] = useState('all')
  const [priority, setPriority] = useState('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [view, setView] = useState<Ticket | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [reply, setReply] = useState('')
  const [editStatus, setEditStatus] = useState('open')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const load = () => { setErr(''); fetchTickets().then(setRows).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  useEffect(() => { setPage(1); setSel(new Set()) }, [queue, category, priority, q])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const sosOpen = rows.filter((t) => isSos(t) && !['resolved', 'closed'].includes(queueOf(t.status))).length
  const tickets = rows.filter((t) => !isSos(t))
  const count = (k: Queue) => (k === 'all' ? tickets.length : tickets.filter((t) => queueOf(t.status) === k).length)

  const categories = Array.from(new Set(tickets.map((t) => t.category).filter(Boolean))).sort()
  const priorities = PRIORITY_ORDER.filter((p) => tickets.some((t) => norm(t.priority || '') === p))

  const ql = q.trim().toLowerCase()
  const filtered = tickets
    .filter((t) => queue === 'all' || queueOf(t.status) === queue)
    .filter((t) => category === 'all' || t.category === category)
    .filter((t) => priority === 'all' || norm(t.priority || '') === priority)
    .filter((t) => !ql || [t.ref, t.subject, t.message, t.customer, t.category].some((v) => (v || '').toLowerCase().includes(ql)))
    .sort((a, b) => lastUpdate(b) - lastUpdate(a))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const allOnPage = pageRows.length > 0 && pageRows.every((t) => sel.has(t.id))
  const toggleAll = () => setSel((s) => { const n = new Set(s); pageRows.forEach((t) => (allOnPage ? n.delete(t.id) : n.add(t.id))); return n })
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const STATUS_OPTS = ['open', 'in_progress', 'Resolved', 'closed']
  const matchStatus = (s: string) => STATUS_OPTS.find((o) => o.toLowerCase() === norm(s)) || (queueOf(s) === 'progress' ? 'in_progress' : 'open')
  const openView = (t: Ticket) => { setView(t); setReply(t.response || ''); setEditStatus(matchStatus(t.status)); setMenuFor(null) }

  const quick = (id: number, body: { status?: string; response?: string }, msg: string) =>
    updateTicket(id, body).then(() => { toast(msg); setMenuFor(null); load() }).catch((e: Error) => toast(e.message, 'err'))
  const bulk = (status: string, msg: string) =>
    Promise.all([...sel].map((id) => updateTicket(id, { status })))
      .then(() => { toast(`${sel.size} ${sel.size === 1 ? 'ticket' : 'tickets'} ${msg}`); setSel(new Set()); load() })
      .catch((e: Error) => toast(e.message, 'err'))

  const saveTicket = () => {
    if (!view) return
    setSaving(true)
    updateTicket(view.id, { status: editStatus, response: reply })
      .then(() => { toast('Ticket updated'); setView(null); load() })
      .catch((e: Error) => toast(e.message, 'err'))
      .finally(() => setSaving(false))
  }

  const exportCsv = (list: Ticket[]) => {
    const cols = ['Ticket ID', 'Subject', 'Raised by', 'Requester', 'Category', 'Priority', 'Status', 'Created', 'Updated']
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [cols.join(',')].concat(list.map((t) => {
      const r = raisedBy(t)
      return [t.ref || `#TKT${t.id}`, t.subject || t.message, r.name, r.expert ? 'Expert' : 'Customer', t.category || '', titleCase(t.priority || ''),
        titleCase(t.status), shortDate(t.created), new Date(lastUpdate(t)).toISOString()].map(esc).join(',')
    }))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'tickets.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const menuBtn = { width: '100%', justifyContent: 'flex-start', border: 'none' } as const

  return (
    <div className="grid" style={{ gap: 16 }}>

      {sosOpen > 0 && has(admin, 'safety.view') && (
        <div className="sos-banner" role="alert">
          <Siren size={16} />
          <span><strong>{sosOpen} open SOS {sosOpen === 1 ? 'alert' : 'alerts'}</strong> — handled in the SOS app, not in this list.</span>
          <div className="tb-spacer" />
          <button className="btn line" onClick={() => nav('/field/sos')}>Open SOS app <ArrowRight size={14} /></button>
        </div>
      )}

      <Card>
        <div className="card-head lg">
          <h3>Support tickets<span className="count">{tickets.length.toLocaleString('en-IN')}</span></h3>
          <div className="head-actions">
            <button className="btn line" onClick={() => exportCsv(filtered)}><Download size={15} /> Export</button>
          </div>
        </div>

        <FilterTabs value={queue} onChange={setQueue} tabs={[
          { key: 'open', label: 'Open', count: count('open'), alert: true },
          { key: 'progress', label: 'In progress', count: count('progress') },
          { key: 'resolved', label: 'Resolved', count: count('resolved') },
          { key: 'closed', label: 'Closed', count: count('closed') },
          { key: 'all', label: 'All', count: count('all') },
        ]} />

        {sel.size > 0 ? (
          <div className="bulkbar">
            <span>{sel.size} selected</span>
            <div className="tb-spacer" />
            <button className="btn line" onClick={() => bulk('Resolved', 'resolved')}><CheckCircle2 size={14} /> Resolve</button>
            <button className="btn line" onClick={() => bulk('closed', 'closed')}><XCircle size={14} /> Close</button>
            <button className="btn line" onClick={() => exportCsv(filtered.filter((t) => sel.has(t.id)))}><Download size={14} /> Export selected</button>
            <button className="btn line" onClick={() => setSel(new Set())}><X size={14} /> Clear</button>
          </div>
        ) : (
          <div className="toolbar">
            <SearchBox value={q} onChange={setQ} placeholder="Search ticket ID, subject or name" />
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
            <thead><tr>
              <th style={{ width: 36 }}><input type="checkbox" checked={allOnPage} onChange={toggleAll} /></th>
              <th>Ticket</th><th>Raised by</th><th>Category</th><th>Priority</th><th>Status</th><th>Updated</th>
              <th className="sticky-end">Actions</th>
            </tr></thead>
            <tbody>
              {pageRows.map((t) => {
                const r = raisedBy(t)
                const upd = lastUpdate(t)
                return (
                  <tr key={t.id}>
                    <td><input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} /></td>
                    <td style={{ maxWidth: 360 }}>
                      <button className="cell-link" onClick={() => openView(t)}>
                        <strong className="clamp1">{t.subject || t.message}</strong>
                        <small className="muted">{t.ref || `#TKT${t.id}`}{t.subject && t.message && t.message !== t.subject ? ` · ${t.message}` : ''}</small>
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                        <span>{r.name}</span>
                        <span className={'req-tag' + (r.expert ? ' expert' : '')}>{r.expert ? 'Expert' : 'Customer'}</span>
                      </div>
                    </td>
                    <td>{t.category || '—'}</td>
                    <td>{t.priority ? <Badge tone={norm(t.priority) === 'urgent' ? 'red' : undefined}>{titleCase(t.priority)}</Badge> : '—'}</td>
                    <td><Badge tone={queueOf(t.status) === 'progress' ? 'blue' : undefined}>{titleCase(t.status)}</Badge></td>
                    <td className="muted" title={new Date(upd).toLocaleString('en-IN')} style={{ whiteSpace: 'nowrap' }}>{ago(upd)}</td>
                    <td className="sticky-end">
                      <div className="actions" style={{ position: 'relative' }}>
                        <button className="iconbtn" style={{ width: 30, height: 30 }} title="View & reply" onClick={() => openView(t)}><Eye size={16} /></button>
                        <button className="iconbtn" style={{ width: 30, height: 30 }} title="More" onClick={() => setMenuFor(menuFor === t.id ? null : t.id)}><MoreVertical size={16} /></button>
                        {menuFor === t.id && (
                          <div className="menu" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: '#fff', border: '1px solid #e6e6ef', borderRadius: 8, boxShadow: '0 8px 24px rgba(20,20,40,.12)', padding: 4, minWidth: 140 }}>
                            <button className="btn line" style={menuBtn} onClick={() => quick(t.id, { status: 'Resolved' }, 'Ticket resolved')}>Resolve</button>
                            <button className="btn line" style={menuBtn} onClick={() => quick(t.id, { status: 'closed' }, 'Ticket closed')}>Close</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!pageRows.length && (
                <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: '36px 0' }}>
                  {queue === 'open' && !ql && category === 'all' && priority === 'all' ? 'No open tickets — the queue is clear.' : 'No tickets match these filters.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="tickets" onPage={setPage} onSize={(s) => { setPageSize(s); setPage(1) }} />
      </Card>

      {view && (
        <Modal
          title={`Ticket ${view.ref || `#TKT${view.id}`}`}
          onClose={() => setView(null)}
          footer={
            <>
              <button className="btn line" onClick={() => setView(null)}>Cancel</button>
              <button className="btn" disabled={saving} onClick={saveTicket}>{saving ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Raised by"><div>{raisedBy(view).name} <span className="muted">· {raisedBy(view).expert ? 'Expert' : 'Customer'}</span></div></Field>
            <Field label="Category"><div>{view.category || '—'}{view.priority ? <span className="muted"> · {titleCase(view.priority)} priority</span> : null}</div></Field>
            <Field label="Created"><div className="muted">{shortDate(view.created)}</div></Field>
            {view.subject && <Field label="Subject"><div>{view.subject}</div></Field>}
            <Field label="Message"><div>{view.message}</div></Field>
            {view.response && <Field label="Previous response"><div className="muted">{view.response}</div></Field>}
            <Field label="Reply">
              <textarea className="select" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a response…" />
            </Field>
            <Field label="Status">
              <select className="select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="Resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  )
}
