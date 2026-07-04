import { useEffect, useState } from 'react'
import { Headphones, Mail, Loader, CheckCircle2, XCircle, Funnel, Download, Eye, MoreVertical } from 'lucide-react'
import { fetchTickets, updateTicket } from '../api'
import type { Ticket } from '../types'
import { Card, StatCard, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, SumBars, shortDate, Modal, Field, useToast } from '../components/UI'
import { Donut } from '../components/Charts'

const titleCase = (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const norm = (s: string) => (s || '').toLowerCase().replace(/\s+/g, '_')

export default function Tickets() {
  const [rows, setRows] = useState<Ticket[] | null>(null)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [view, setView] = useState<Ticket | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [reply, setReply] = useState('')
  const [editStatus, setEditStatus] = useState('open')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const load = () => { setErr(''); fetchTickets().then(setRows).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const cnt = (st: string) => rows.filter((t) => norm(t.status) === st).length
  const open = cnt('open'), inProgress = cnt('in_progress'), resolved = cnt('resolved'), closed = cnt('closed')

  const TABS: { k: string; label: string; n: number }[] = [
    { k: 'all', label: 'All', n: rows.length },
    { k: 'open', label: 'Open', n: open },
    { k: 'in_progress', label: 'In Progress', n: inProgress },
    { k: 'resolved', label: 'Resolved', n: resolved },
    { k: 'closed', label: 'Closed', n: closed },
  ]

  const categories = Array.from(new Set(rows.map((t) => t.category).filter(Boolean)))

  const ql = q.trim().toLowerCase()
  const filtered = rows
    .filter((t) => status === 'all' || norm(t.status) === status)
    .filter((t) => category === 'all' || t.category === category)
    .filter((t) => !ql || (t.ref || '').toLowerCase().includes(ql) || (t.message || '').toLowerCase().includes(ql) || (t.customer || '').toLowerCase().includes(ql) || (t.category || '').toLowerCase().includes(ql))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const STATUS_OPTS = ['open', 'in_progress', 'Resolved', 'closed']
  const matchStatus = (s: string) => STATUS_OPTS.find((o) => o.toLowerCase() === norm(s)) || 'open'
  const openView = (t: Ticket) => { setView(t); setReply((t as any).response || ''); setEditStatus(matchStatus(t.status)); setMenuFor(null) }

  const quick = (id: number, body: { status?: string; response?: string }, msg: string) =>
    updateTicket(id, body).then(() => { toast(msg); setMenuFor(null); load() }).catch((e: Error) => toast(e.message, 'err'))

  const saveTicket = () => {
    if (!view) return
    setSaving(true)
    updateTicket(view.id, { status: editStatus, response: reply })
      .then(() => { toast('Ticket updated'); setView(null); load() })
      .catch((e: Error) => toast(e.message, 'err'))
      .finally(() => setSaving(false))
  }

  const exportCsv = () => {
    const cols = ['Ticket ID', 'Subject', 'Customer', 'Category', 'Created At', 'Status']
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [cols.join(',')].concat(
      filtered.map((t) => [t.ref || `#TKT${t.id}`, t.message, t.customer, t.category || '', shortDate(t.created), titleCase(t.status)].map(esc).join(','))
    )
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'tickets.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const total = rows.length || 1
  const DONUT = [
    { label: 'Open', value: open, color: '#f59e0b' },
    { label: 'In Progress', value: inProgress, color: '#2e90fa' },
    { label: 'Resolved', value: resolved, color: '#16a34a' },
    { label: 'Closed', value: closed, color: '#98a2b3' },
  ]
  const DONUT_PCT: Record<string, string> = Object.fromEntries(DONUT.map((d) => [d.label, ((d.value / total) * 100).toFixed(1) + '%']))

  const catCounts: Record<string, number> = {}
  rows.forEach((t) => { const k = t.category || 'Other'; catCounts[k] = (catCounts[k] || 0) + 1 })
  const CAT_COLORS = ['#2e90fa', '#16a34a', '#f59e0b', '#5b51e8', '#98a2b3']
  const TOP_CATEGORIES = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([label, n], i) => ({ label, value: `${n} (${((n / total) * 100).toFixed(1)}%)`, pct: n, color: CAT_COLORS[i % CAT_COLORS.length] }))

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<Headphones size={22} />} tint="#5b51e8" label="Total Tickets" value={rows.length.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<Mail size={22} />} tint="#f59e0b" label="Open" value={open.toLocaleString('en-IN')} sub="awaiting action" />
        <StatCard icon={<Loader size={22} />} tint="#2e90fa" label="In Progress" value={inProgress.toLocaleString('en-IN')} sub="being handled" />
        <StatCard icon={<CheckCircle2 size={22} />} tint="#16a34a" label="Resolved" value={resolved.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<XCircle size={22} />} tint="#98a2b3" label="Closed" value={closed.toLocaleString('en-IN')} sub="all time" />
      </div>

      <div className="cols">
        <Card>
          <div className="toolbar">
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search by Ticket ID, Subject, Customer or Email…" />
            <div className="tb-spacer" />
            <select className="select flt" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
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
            <button className="btn line"><Funnel size={16} /> Filters</button>
            <button className="btn line" onClick={exportCsv}><Download size={16} /> Export</button>
          </div>

          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.k} className={'tab' + (status === t.k ? ' active' : '')} onClick={() => { setStatus(t.k); setPage(1) }}>
                {t.label}
                <span style={{
                  marginLeft: 8, padding: '1px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  background: status === t.k ? '#eef0ff' : '#eeeef5',
                  color: status === t.k ? '#5b51e8' : '#6b7090',
                }}>{t.n.toLocaleString('en-IN')}</span>
              </button>
            ))}
          </div>

          <div className="tablewrap">
            <table className="tbl">
              <thead><tr>
                <th>Ticket ID</th><th>Subject</th><th>Customer</th><th>Category</th>
                <th>Created At</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {pageRows.map((t) => (
                  <tr key={t.id}>
                    <td className="muted">{t.ref || `#TKT${t.id}`}</td>
                    <td style={{ maxWidth: 280 }}>
                      <strong style={{ fontSize: 13, display: 'block' }}>{t.message}</strong>
                    </td>
                    <td>
                      <div className="cell-user">
                        <Avatar name={t.customer} size={34} />
                        <div><strong style={{ display: 'block' }}>{t.customer}</strong></div>
                      </div>
                    </td>
                    <td><Badge>{t.category || '—'}</Badge></td>
                    <td className="muted">{shortDate(t.created)}</td>
                    <td><Badge>{titleCase(t.status)}</Badge></td>
                    <td>
                      <div className="actions" style={{ position: 'relative' }}>
                        <button className="btn line" title="View" onClick={() => openView(t)}><Eye size={16} /></button>
                        <button className="btn line" title="More" onClick={() => setMenuFor(menuFor === t.id ? null : t.id)}><MoreVertical size={16} /></button>
                        {menuFor === t.id && (
                          <div className="menu" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: '#fff', border: '1px solid #e6e6ef', borderRadius: 8, boxShadow: '0 8px 24px rgba(20,20,40,.12)', padding: 4, minWidth: 140 }}>
                            <button className="btn line" style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }} onClick={() => quick(t.id, { status: 'Resolved' }, 'Ticket resolved')}>Resolve</button>
                            <button className="btn line" style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }} onClick={() => quick(t.id, { status: 'closed' }, 'Ticket closed')}>Close</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="tickets" onPage={setPage} onSize={(s) => { setPageSize(s); setPage(1) }} />
        </Card>

        <div className="col-rail">
          <Card title="Tickets by Status">
            <div className="row" style={{ alignItems: 'center', gap: 16 }}>
              <Donut data={DONUT} />
              <div className="grid" style={{ gap: 8, flex: 1 }}>
                {DONUT.map((d) => (
                  <div key={d.label} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="sumbar-label"><i className="bdot" style={{ background: d.color, marginRight: 7 }} />{d.label}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{d.value} ({DONUT_PCT[d.label]})</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <Card title="Top Categories">
            {TOP_CATEGORIES.length ? <SumBars rows={TOP_CATEGORIES} /> : <p className="muted">No tickets yet.</p>}
          </Card>
        </div>
      </div>

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
            <Field label="Customer"><div>{view.customer}</div></Field>
            <Field label="Category"><div>{view.category || '—'}</div></Field>
            <Field label="Reference"><div className="muted">{view.ref || `#TKT${view.id}`}</div></Field>
            <Field label="Created"><div className="muted">{shortDate(view.created)}</div></Field>
            <Field label="Message"><div>{view.message}</div></Field>
            {(view as any).response && <Field label="Previous Response"><div className="muted">{(view as any).response}</div></Field>}
            <Field label="Reply">
              <textarea className="select" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a response…" />
            </Field>
            <Field label="Status">
              <select className="select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
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
