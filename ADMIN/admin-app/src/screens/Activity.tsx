import { useEffect, useState } from 'react'
import { Activity as ActivityIcon, Users, HardHat, UserCog, Cpu, Funnel, Download } from 'lucide-react'
import { fetchActivity, fetchActivityStats } from '../api'
import { Card, StatCard, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, Empty, SumBars, shortDate } from '../components/UI'
import { Donut } from '../components/Charts'

type Evt = {
  id: number; actor_type: string; actor_id: number | null; actor_name: string | null
  action: string; entity_type: string | null; entity_id: string | null; ref: string | null
  detail: string | null; meta: any; created: string
}
type Stats = { total: number; since: string; byActor: { actor_type: string; n: number }[]; byAction: { action: string; n: number }[] }

const ACTOR_TONE: Record<string, string> = { customer: 'blue', worker: 'violet', admin: 'amber', system: 'gray' }
const prettyAction = (a: string) => (a || '').replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const timeOf = (s: string) => new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

export default function Activity() {
  const [rows, setRows] = useState<Evt[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [err, setErr] = useState('')
  const [actor, setActor] = useState('all')
  const [action, setAction] = useState('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const load = () => {
    setErr('')
    fetchActivity({ actorType: actor, limit: 500 }).then((d) => setRows(d.items)).catch((e: Error) => setErr(e.message))
    fetchActivityStats(7).then(setStats).catch(() => {})
  }
  // refetch from server when the actor filter changes (server-side filter)
  useEffect(load, [actor])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const actorCount = (t: string) => stats?.byActor.find((a) => a.actor_type === t)?.n || 0
  const actions = Array.from(new Set(rows.map((r) => r.action))).sort()

  const TABS: { k: string; label: string; n: number }[] = [
    { k: 'all', label: 'All', n: stats?.total ?? rows.length },
    { k: 'customer', label: 'Customer', n: actorCount('customer') },
    { k: 'worker', label: 'Worker', n: actorCount('worker') },
    { k: 'admin', label: 'Admin', n: actorCount('admin') },
    { k: 'system', label: 'System', n: actorCount('system') },
  ]

  const ql = q.trim().toLowerCase()
  const filtered = rows
    .filter((r) => action === 'all' || r.action === action)
    .filter((r) => !ql || (r.actor_name || '').toLowerCase().includes(ql) || (r.detail || '').toLowerCase().includes(ql) || (r.ref || '').toLowerCase().includes(ql) || (r.action || '').toLowerCase().includes(ql))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const exportCsv = () => {
    const cols = ['Time', 'Actor Type', 'Actor', 'Action', 'Entity', 'Reference', 'Detail']
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [cols.join(',')].concat(
      filtered.map((r) => [r.created, r.actor_type, r.actor_name || '', r.action, r.entity_type || '', r.ref || '', r.detail || ''].map(esc).join(','))
    )
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'activity.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const ACTOR_COLORS: Record<string, string> = { customer: '#2e90fa', worker: '#5b51e8', admin: '#f59e0b', system: '#98a2b3' }
  const DONUT = (stats?.byActor || []).map((a) => ({ label: prettyAction(a.actor_type), value: a.n, color: ACTOR_COLORS[a.actor_type] || '#98a2b3' }))
  const totalEvents = stats?.total || 1
  const TOP_ACTIONS = (stats?.byAction || []).slice(0, 6).map((a, i) => ({
    label: prettyAction(a.action), value: `${a.n}`, pct: a.n,
    color: ['#5b51e8', '#2e90fa', '#16a34a', '#f59e0b', '#ef4444', '#98a2b3'][i % 6],
  }))

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<ActivityIcon size={22} />} tint="#5b51e8" label="Total Events" value={(stats?.total ?? rows.length).toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<Users size={22} />} tint="#2e90fa" label="Customer App" value={actorCount('customer').toLocaleString('en-IN')} sub="last 7 days" />
        <StatCard icon={<HardHat size={22} />} tint="#5b51e8" label="Worker App" value={actorCount('worker').toLocaleString('en-IN')} sub="last 7 days" />
        <StatCard icon={<UserCog size={22} />} tint="#f59e0b" label="Admin Panel" value={actorCount('admin').toLocaleString('en-IN')} sub="last 7 days" />
        <StatCard icon={<Cpu size={22} />} tint="#98a2b3" label="System" value={actorCount('system').toLocaleString('en-IN')} sub="last 7 days" />
      </div>

      <div className="cols">
        <Card>
          <div className="toolbar">
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search by actor, action, reference or detail…" />
            <div className="tb-spacer" />
            <select className="select flt" value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }}>
              <option value="all">All Actions</option>
              {actions.map((a) => <option key={a} value={a}>{prettyAction(a)}</option>)}
            </select>
            <button className="btn line"><Funnel size={16} /> Filters</button>
            <button className="btn line" onClick={exportCsv}><Download size={16} /> Export</button>
          </div>

          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.k} className={'tab' + (actor === t.k ? ' active' : '')} onClick={() => { setActor(t.k); setPage(1) }}>
                {t.label}
                <span style={{
                  marginLeft: 8, padding: '1px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  background: actor === t.k ? '#eef0ff' : '#eeeef5',
                  color: actor === t.k ? '#5b51e8' : '#6b7090',
                }}>{t.n.toLocaleString('en-IN')}</span>
              </button>
            ))}
          </div>

          <div className="tablewrap">
            <table className="tbl">
              <thead><tr>
                <th>Time</th><th>Source</th><th>Actor</th><th>Action</th><th>Detail</th><th>Reference</th>
              </tr></thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(r.created)}<br /><span style={{ fontSize: 12 }}>{timeOf(r.created)}</span></td>
                    <td><Badge tone={ACTOR_TONE[r.actor_type] || 'gray'}>{r.actor_type}</Badge></td>
                    <td>
                      <div className="cell-user">
                        <Avatar name={r.actor_name || r.actor_type} size={34} />
                        <div><strong style={{ display: 'block' }}>{r.actor_name || '—'}</strong></div>
                      </div>
                    </td>
                    <td><Badge tone={ACTOR_TONE[r.actor_type] || 'gray'} dot={false}>{prettyAction(r.action)}</Badge></td>
                    <td style={{ maxWidth: 320 }}>{r.detail || '—'}</td>
                    <td className="muted">{r.ref || (r.entity_type ? `${r.entity_type} #${r.entity_id}` : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <Empty msg="No activity matches your filters yet." />}
          </div>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="events" onPage={setPage} onSize={(s) => { setPageSize(s); setPage(1) }} />
        </Card>

        <div className="col-rail">
          <Card title="Events by Source">
            {DONUT.length ? (
              <div className="row" style={{ alignItems: 'center', gap: 16 }}>
                <Donut data={DONUT} />
                <div className="grid" style={{ gap: 8, flex: 1 }}>
                  {DONUT.map((d) => (
                    <div key={d.label} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="sumbar-label"><i className="bdot" style={{ background: d.color, marginRight: 7 }} />{d.label}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{d.value} ({((d.value / totalEvents) * 100).toFixed(1)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="muted">No activity yet.</p>}
          </Card>
          <Card title="Top Actions (7 days)">
            {TOP_ACTIONS.length ? <SumBars rows={TOP_ACTIONS} /> : <p className="muted">No activity yet.</p>}
          </Card>
        </div>
      </div>
    </div>
  )
}
