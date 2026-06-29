import { useEffect, useState } from 'react'
import { IndianRupee, CalendarCheck, TrendingUp, Trophy } from 'lucide-react'
import { fetchAnalytics } from '../api'
import { Card, StatCard, Loading, ErrorState, Badge, Avatar, money } from '../components/UI'
import { LineChart, Donut } from '../components/Charts'

const COLORS = ['#5b51e8', '#16a34a', '#f59e0b', '#3b82f6', '#ef4444', '#ff7a59', '#8085a3']

export default function Analytics() {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState('')
  const load = () => { setErr(''); fetchAnalytics().then(setD).catch((e) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  const totalRev = d.series.reduce((s: number, x: any) => s + x.revenue, 0)
  const totalBk = d.series.reduce((s: number, x: any) => s + x.bookings, 0)
  const peak = Math.max(...d.series.map((x: any) => x.revenue))
  const completed = d.statusSplit.find((s: any) => s.status === 'completed')?.n || 0
  const totalStatus = d.statusSplit.reduce((s: number, x: any) => s + x.n, 0)

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="stat-row">
        <StatCard icon={<IndianRupee size={22} />} tint="#5b51e8" label="Revenue (30 days)" value={money(totalRev)} sub={`peak ${money(peak)}`} />
        <StatCard icon={<CalendarCheck size={22} />} tint="#16a34a" label="Bookings (30 days)" value={totalBk} sub={`${Math.round(totalBk / 30)}/day avg`} />
        <StatCard icon={<TrendingUp size={22} />} tint="#3b82f6" label="Completion Rate" value={`${totalStatus ? Math.round((completed / totalStatus) * 100) : 0}%`} sub={`${completed} completed`} />
        <StatCard icon={<Trophy size={22} />} tint="#ff7a59" label="Top Pro Jobs" value={d.topWorkers[0]?.jobs ?? 0} sub={d.topWorkers[0]?.name || '—'} />
      </div>

      <Card title="Revenue Trend" right={<span className="muted" style={{ fontSize: 12 }}>Last 30 days</span>}>
        <LineChart data={d.series} keys={['revenue']} colors={['#5b51e8']} height={190} />
      </Card>

      <div className="grid" style={{ gridTemplateColumns: '0.9fr 1.5fr' }}>
        <Card title="Bookings by Status">
          <Donut data={d.statusSplit.map((s: any, i: number) => ({ label: s.status.replace(/_/g, ' '), value: s.n, color: COLORS[i % COLORS.length] }))} />
        </Card>
        <Card title="Top Performing Workers">
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Worker</th><th>City</th><th>Jobs</th><th>Rating</th><th>Earnings</th><th>Status</th></tr></thead>
              <tbody>
                {d.topWorkers.map((w: any, i: number) => (
                  <tr key={w.id}>
                    <td><div className="cell-user">
                      <span className="rank" style={{ background: i < 3 ? COLORS[i] + '22' : 'var(--bg)', color: i < 3 ? COLORS[i] : 'var(--muted)' }}>{i + 1}</span>
                      <Avatar name={w.name} size={30} /><strong>{w.name}</strong>
                    </div></td>
                    <td>{w.city}</td><td className="num">{w.jobs}</td>
                    <td><span className="row" style={{ gap: 3 }}>⭐ {w.rating}</span></td>
                    <td className="num">{money(w.earnings)}</td><td><Badge>{w.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
