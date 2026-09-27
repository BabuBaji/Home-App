import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { fetchActivity, fetchActivityStats } from '../api'
import { Card, SearchBox, Pagination, Loading, ErrorState, shortDate, FilterTabs } from '../components/UI'

type Evt = {
  id: number; actor_type: string; actor_id: number | null; actor_name: string | null
  action: string; entity_type: string | null; entity_id: string | null; ref: string | null
  detail: string | null; meta: any; created: string
}
type Stats = { total: number; since: string; byActor: { actor_type: string; n: number }[]; byAction: { action: string; n: number }[] }
type Source = 'all' | 'customer' | 'worker' | 'admin' | 'system'

const SOURCE_LABEL: Record<string, string> = { customer: 'Customer', worker: 'Expert', admin: 'Admin', system: 'System' }
const PERIODS = [{ days: 1, label: 'Last 24 hours' }, { days: 7, label: 'Last 7 days' }, { days: 30, label: 'Last 30 days' }, { days: 0, label: 'All time' }]
const prettyAction = (a: string) => (a || '').replace(/^admin[._](?=\w+[._])/, '').replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bSos\b/g, 'SOS')
const timeOf = (s: string) => new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

export default function Activity() {
  const [rows, setRows] = useState<Evt[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [err, setErr] = useState('')
  const [source, setSource] = useState<Source>('all')
  const [days, setDays] = useState(7)
  const [action, setAction] = useState('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // The list and the tab counts come from the same period, so the numbers agree.
  const load = () => {
    setErr('')
    const since = days > 0 ? new Date(Date.now() - days * 864e5).toISOString() : ''
    fetchActivity({ actorType: source, limit: 500, ...(since ? { since } : {}) }).then((d) => setRows(d.items)).catch((e: Error) => setErr(e.message))
    fetchActivityStats(days).then(setStats).catch(() => {})
  }
  useEffect(load, [source, days])
  useEffect(() => setPage(1), [source, days, action, q])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const count = (t: string) => stats?.byActor.find((a) => a.actor_type === t)?.n || 0
  const actions = Array.from(new Set([...(stats?.byAction || []).map((a) => a.action), ...rows.map((r) => r.action)])).sort()

  const ql = q.trim().toLowerCase()
  const filtered = rows
    .filter((r) => action === 'all' || r.action === action)
    .filter((r) => !ql || [r.actor_name, r.detail, r.ref, r.action].some((v) => (v || '').toLowerCase().includes(ql)))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const capped = rows.length >= 500

  const exportCsv = () => {
    const cols = ['Time', 'Source', 'Actor', 'Action', 'Entity', 'Reference', 'Detail']
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [cols.join(',')].concat(
      filtered.map((r) => [r.created, SOURCE_LABEL[r.actor_type] || r.actor_type, r.actor_name || '', prettyAction(r.action), r.entity_type || '', r.ref || '', r.detail || ''].map(esc).join(','))
    )
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'activity.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <Card>
        <div className="card-head lg">
          <h3>Activity<span className="count">{(stats?.total ?? rows.length).toLocaleString('en-IN')} events</span></h3>
          <div className="head-actions">
            <select className="select flt" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
            </select>
            <button className="btn line" onClick={exportCsv}><Download size={15} /> Export</button>
          </div>
        </div>

        <FilterTabs value={source} onChange={setSource} tabs={[
          { key: 'all', label: 'All', count: stats?.total ?? rows.length },
          { key: 'admin', label: 'Admin', count: count('admin') },
          { key: 'worker', label: 'Expert', count: count('worker') },
          { key: 'customer', label: 'Customer', count: count('customer') },
          { key: 'system', label: 'System', count: count('system') },
        ]} />

        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search actor, action, reference or detail" />
          {actions.length > 1 && (
            <select className="select flt" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="all">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{prettyAction(a)}</option>)}
            </select>
          )}
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th>Time</th><th>Actor</th><th>Action</th><th>Detail</th><th>Reference</th>
            </tr></thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{shortDate(r.created)}<small className="muted" style={{ display: 'block', fontSize: 12 }}>{timeOf(r.created)}</small></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                      <span className={r.actor_name ? '' : 'muted'}>{r.actor_name || '—'}</span>
                      <span className={'req-tag' + (r.actor_type === 'worker' ? ' expert' : '')}>{SOURCE_LABEL[r.actor_type] || r.actor_type}</span>
                    </div>
                  </td>
                  <td className="nowrap" style={{ fontWeight: 600 }}>{prettyAction(r.action)}</td>
                  <td style={{ maxWidth: 360 }}>{r.detail || <span className="muted">—</span>}</td>
                  <td className="muted nowrap">{r.ref || (r.entity_type ? `${r.entity_type} #${r.entity_id}` : '—')}</td>
                </tr>
              ))}
              {!pageRows.length && (
                <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '36px 0' }}>
                  {rows.length ? 'No activity matches these filters.' : 'No activity in this period.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {capped && <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Showing the latest 500 events — narrow the period or source to see older ones.</p>}
        <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="events" onPage={setPage} onSize={(s) => { setPageSize(s); setPage(1) }} />
      </Card>
    </div>
  )
}
