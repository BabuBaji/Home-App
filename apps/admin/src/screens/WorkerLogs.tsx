import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Download, RotateCcw, Eye, Briefcase, Clock, CalendarClock, IndianRupee, Star, Cpu, Wifi, BatteryMedium, Radio } from 'lucide-react'
import { Card, Badge, Loading, ErrorState, Dropdown, SearchBox, Pagination, Modal } from '../components/UI'
import { fetchWorkerLogs } from '../api'
import type { WorkerLog, WorkerLogsData } from '../types'

/* Logs tab — the worker's full audit stream from the activity service. Every recorded event, each
 * categorised (Job Updates / Attendance / Leave & Shift / Earnings & Payouts / Feedback / System)
 * with its source (Worker App / Web Portal / System). Read-only; filter + export. */

const CAT: Record<string, { c: string; bg: string; Icon: typeof Briefcase }> = {
  'Job Updates': { c: '#0f8a4d', bg: '#e7f7ee', Icon: Briefcase },
  Attendance: { c: '#1d4ed8', bg: '#e8f0fe', Icon: Clock },
  'Leave & Shift': { c: '#be123c', bg: '#fdecef', Icon: CalendarClock },
  'Earnings & Payouts': { c: '#b45309', bg: '#fff4e5', Icon: IndianRupee },
  Feedback: { c: '#6d28d9', bg: '#f1ecfe', Icon: Star },
  System: { c: '#667085', bg: '#f2f4f7', Icon: Cpu },
}
const prettyAction = (a: string) => a.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const sourceTone = (s: string) => s === 'Worker App' ? 'green' : s === 'Web Portal' ? 'blue' : s === 'Customer App' ? 'amber' : 'gray'
const PAGE = 10

export default function WorkerLogs({ workerId }: { workerId: number }) {
  const [d, setD] = useState<WorkerLogsData | null>(null)
  const [err, setErr] = useState('')
  const [logType, setLogType] = useState('all')
  const [source, setSource] = useState('all')
  const [action, setAction] = useState('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [view, setView] = useState<WorkerLog | null>(null)

  const load = () => { fetchWorkerLogs(workerId).then((x) => { setD(x); setErr('') }).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [workerId])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  const actionOpts = [...new Set(d.items.map((l) => l.action))].sort()
  const sourceOpts = [...new Set(d.items.map((l) => l.source))].sort()
  const dq = q.trim().toLowerCase()
  const rows = d.items.filter((l) =>
    (logType === 'all' || l.logType === logType) && (source === 'all' || l.source === source) && (action === 'all' || l.action === action)
    && (!dq || `${l.action} ${l.description} ${l.performedBy} ${l.ref}`.toLowerCase().includes(dq)))
  const filterOn = logType !== 'all' || source !== 'all' || action !== 'all' || !!dq
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const cur = Math.min(page, pages)
  const pageRows = rows.slice((cur - 1) * PAGE, cur * PAGE)
  const reset = () => { setLogType('all'); setSource('all'); setAction('all'); setQ(''); setPage(1) }

  const exportCsv = () => {
    const head = ['Date & Time', 'Log Type', 'Action', 'Description', 'Source', 'Performed By']
    const body = rows.map((l) => [l.date ? new Date(l.date).toLocaleString() : '', l.logType, prettyAction(l.action), l.description, l.source, l.performedBy])
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `worker-${workerId}-logs.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const fmt = (v: string) => v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const th: CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--line,#eef0f4)', whiteSpace: 'nowrap', fontWeight: 600, textAlign: 'left' }
  const td: CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--line-2,#f4f4fa)', fontSize: 12.5, verticalAlign: 'top' }
  const typeChip = (t: string) => {
    const c = CAT[t] || CAT.System
    return <span className="row" style={{ gap: 6, alignItems: 'center', background: c.bg, color: c.c, padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}><c.Icon size={12} />{t}</span>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 290px', gap: 14, alignItems: 'start' }}>
      <Card>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: 15 }}>Activity Logs</strong>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>All activities and system events related to this worker.</div>
          </div>
          <button className="btn line sm" onClick={exportCsv}><Download size={14} /> Export Logs</button>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <Dropdown value={logType} width={160} onChange={(v) => { setLogType(v); setPage(1) }} options={[{ value: 'all', label: 'All Log Types' }, ...Object.keys(CAT).map((c) => ({ value: c, label: c }))]} />
          <Dropdown value={action} width={170} onChange={(v) => { setAction(v); setPage(1) }} options={[{ value: 'all', label: 'All Actions' }, ...actionOpts.map((a) => ({ value: a, label: prettyAction(a) }))]} />
          <Dropdown value={source} width={150} onChange={(v) => { setSource(v); setPage(1) }} options={[{ value: 'all', label: 'All Sources' }, ...sourceOpts.map((s) => ({ value: s, label: s }))]} />
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search logs…" />
          {filterOn && <button className="btn line" style={{ padding: '8px 12px', fontSize: 12.5 }} onClick={reset}><RotateCcw size={13} /> Reset</button>}
        </div>
        {d.items.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>No log entries recorded for this worker yet.</div>
        ) : rows.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>No logs match these filters.</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 820 }}>
                <thead><tr style={{ color: 'var(--muted,#667085)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {['Date & Time', 'Log Type', 'Action', 'Description', 'Source', 'Performed By', ''].map((h) => <th key={h} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>{pageRows.map((l) => (
                  <tr key={l.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(l.date)}</td>
                    <td style={td}>{typeChip(l.logType)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 600 }}>{prettyAction(l.action)}</td>
                    <td style={{ ...td, minWidth: 220 }}>{l.description || '—'}{l.ref && <span className="muted"> · {l.ref}</span>}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><Badge tone={sourceTone(l.source)} dot={false}>{l.source}</Badge></td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{l.performedBy || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}><button className="iconbtn" title="View detail" style={{ width: 28, height: 28, color: 'var(--violet,#5b51e8)' }} onClick={() => setView(l)}><Eye size={14} /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ marginTop: 12 }}><Pagination page={cur} pageSize={PAGE} total={rows.length} noun="logs" onPage={setPage} /></div>
          </>
        )}
      </Card>

      <div className="grid" style={{ gap: 14 }}>
        <Card title="Logs Summary">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '6px 0 10px', borderBottom: '1px solid var(--line-2,#f4f4fa)' }}>
            <span className="row" style={{ gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600 }}><Cpu size={15} style={{ color: 'var(--muted,#98a2b3)' }} />Total Logs</span>
            <strong style={{ fontSize: 15 }}>{d.summary.total}</strong>
          </div>
          {d.summary.categories.map((c) => {
            const st = CAT[c.label] || CAT.System
            return (
              <div key={c.label} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line-2,#f4f4fa)' }}>
                <span className="row" style={{ gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--ink-2,#475467)' }}><st.Icon size={14} style={{ color: st.c }} />{c.label}</span>
                <strong style={{ fontSize: 14 }}>{c.count}</strong>
              </div>
            )
          })}
        </Card>

        <Card title="Device & Session Info">
          {d.device.lastSeen || d.device.network || d.device.battery != null ? (
            <>
              <Info label="Status" value={<Badge tone={d.device.online ? 'green' : 'gray'} dot={false}>{d.device.online ? 'Online' : 'Offline'}</Badge>} />
              <Info label="Last Seen" value={d.device.lastSeen ? new Date(d.device.lastSeen).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'} icon={<Radio size={13} />} />
              <Info label="Network" value={d.device.network || '—'} icon={<Wifi size={13} />} />
              <Info label="Battery" value={d.device.battery != null ? `${d.device.battery}%` : '—'} icon={<BatteryMedium size={13} />} />
            </>
          ) : <div className="muted" style={{ fontSize: 12.5, padding: '6px 0' }}>No device heartbeat received yet. Populates once the worker's app reports in.</div>}
        </Card>
      </div>

      {view && (
        <Modal title={prettyAction(view.action)} onClose={() => setView(null)}>
          <div className="grid" style={{ gap: 2 }}>
            <Info label="Log Type" value={typeChip(view.logType)} />
            <Info label="Date & Time" value={fmt(view.date)} />
            <Info label="Source" value={<Badge tone={sourceTone(view.source)} dot={false}>{view.source}</Badge>} />
            <Info label="Performed By" value={view.performedBy || '—'} />
            {view.ref && <Info label="Reference" value={view.ref} />}
            <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--line-2,#f4f4fa)' }}>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>Description</div>
              <div style={{ fontSize: 13 }}>{view.description || '—'}</div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Info({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', gap: 12 }}>
      <span className="row" style={{ gap: 7, alignItems: 'center', fontSize: 12.5, color: 'var(--muted,#667085)' }}>{icon}{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
