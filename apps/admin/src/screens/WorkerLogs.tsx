import { useEffect, useState, type CSSProperties } from 'react'
import { RefreshCw } from 'lucide-react'
import { Card, Badge, Loading, ErrorState, Dropdown, SearchBox } from '../components/UI'
import { fetchWorkerLogs } from '../api'
import type { WorkerLog } from '../types'

/* Logs tab — the worker's full audit stream from the activity service. Read-only; every recorded
 * event (KYC reviews, availability/leave changes, skill reviews, dispatch, notes, SOS, …). */

const actorTone = (t: string) => t === 'admin' ? 'blue' : t === 'worker' ? 'green' : t === 'customer' ? 'amber' : 'gray'
const prettyAction = (a: string) => a.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export default function WorkerLogs({ workerId }: { workerId: number }) {
  const [logs, setLogs] = useState<WorkerLog[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [actor, setActor] = useState('all')

  const load = () => { fetchWorkerLogs(workerId).then((r) => { setLogs(r.items); setErr('') }).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [workerId])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!logs) return <Loading />

  const actorOpts = [...new Set(logs.map((l) => l.actorType).filter(Boolean))].sort()
  const dq = q.trim().toLowerCase()
  const rows = logs.filter((l) => (actor === 'all' || l.actorType === actor) && (!dq || `${l.action} ${l.detail} ${l.actorName} ${l.ref}`.toLowerCase().includes(dq)))
  const th: CSSProperties = { padding: '8px 12px', borderBottom: '1px solid var(--line,#eef0f4)', whiteSpace: 'nowrap', fontWeight: 600, textAlign: 'left' }
  const td: CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--line-2,#f4f4fa)', fontSize: 12.5, verticalAlign: 'top' }

  return (
    <Card title="System Logs" right={<button className="btn line sm" onClick={load}><RefreshCw size={13} /> Refresh</button>}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Dropdown value={actor} width={160} onChange={setActor}
          options={[{ value: 'all', label: 'All Sources' }, ...actorOpts.map((a) => ({ value: a, label: prettyAction(a) }))]} />
        <div style={{ marginLeft: 'auto' }}><SearchBox value={q} onChange={setQ} placeholder="Search logs…" /></div>
      </div>
      {logs.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>No log entries recorded for this worker yet.</div>
      ) : rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>No logs match these filters.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
            <thead><tr style={{ color: 'var(--muted,#667085)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {['Time', 'Source', 'Event', 'Details'].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>{rows.map((l) => (
              <tr key={l.id}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{l.created ? new Date(l.created).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <Badge tone={actorTone(l.actorType)} dot={false}>{l.actorType || 'system'}</Badge>
                  {l.actorName && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{l.actorName}</div>}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 600 }}>{prettyAction(l.action)}</td>
                <td style={td}>{l.detail || '—'}{l.ref && <span className="muted" style={{ fontSize: 11 }}> · {l.ref}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Showing {rows.length} of {logs.length} log entr{logs.length === 1 ? 'y' : 'ies'}</div>
        </div>
      )}
    </Card>
  )
}
