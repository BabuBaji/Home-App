import { useEffect, useState } from 'react'
import { CalendarCheck, CheckCircle2, Activity, IndianRupee, Users, Star } from 'lucide-react'
import { fetchDashboard } from '../api'
import type { DashboardData } from '../types'
import { Card, StatCard, Loading, ErrorState, Badge, Avatar, money, shortDate } from '../components/UI'
import { LineChart, BarChart, Donut } from '../components/Charts'

const CITY_COLORS = ['#5b51e8', '#16a34a', '#f5a524', '#2e90fa', '#f04438', '#ff7a59']

export default function Dashboard() {
  const [d, setD] = useState<DashboardData | null>(null)
  const [err, setErr] = useState('')
  const load = () => { setErr(''); fetchDashboard().then(setD).catch((e) => setErr(e.message)) }
  useEffect(load, [])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />
  const s = d.stats

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="stat-row">
        <StatCard icon={<CalendarCheck size={22} />} tint="#5b51e8" label="Total Bookings" value={s.totalBookings.toLocaleString('en-IN')} sub={`${d.trend[d.trend.length - 1]?.total ?? 0} today`} />
        <StatCard icon={<CheckCircle2 size={22} />} tint="#16a34a" label="Completed" value={s.completed.toLocaleString('en-IN')} sub={`${s.totalBookings ? Math.round((s.completed / s.totalBookings) * 100) : 0}% rate`} />
        <StatCard icon={<Activity size={22} />} tint="#2e90fa" label="Active Now" value={s.active.toLocaleString('en-IN')} sub="in progress" />
        <StatCard icon={<IndianRupee size={22} />} tint="#f5a524" label="Total Revenue" value={money(s.revenue)} sub={`avg ${money(s.completed ? Math.round(s.revenue / s.completed) : 0)}`} />
        <StatCard icon={<Users size={22} />} tint="#ff7a59" label="Customers" value={s.customers.toLocaleString('en-IN')} sub="registered" />
        <StatCard icon={<Star size={22} />} tint="#f04438" label="Avg Rating" value={s.avgRating.toFixed(2)} sub="of 5.0" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
        <Card title="Bookings Overview" right={<span className="muted" style={{ fontSize: 12.5 }}>Last 7 days</span>}>
          <LineChart data={d.trend as any} keys={['total', 'completed']} />
          <div className="row" style={{ gap: 18, marginTop: 8, fontSize: 12.5 }}>
            <span className="row" style={{ gap: 6 }}><span className="dot" style={{ width: 10, height: 10, borderRadius: 3, background: '#5b51e8' }} /> Total</span>
            <span className="row" style={{ gap: 6 }}><span className="dot" style={{ width: 10, height: 10, borderRadius: 3, background: '#16a34a' }} /> Completed</span>
          </div>
        </Card>
        <Card title="Recent Bookings">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {d.recent.map((b) => (
              <div key={b.id} className="row" style={{ justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="cell-user">
                  <Avatar name={b.customer} size={34} />
                  <div><strong>{b.customer}</strong><small>{b.service} · {b.ref}</small></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong className="num" style={{ fontSize: 13.5 }}>{money(b.total)}</strong>
                  <div><Badge>{b.status}</Badge></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr 1fr' }}>
        <Card title="Bookings by City">
          <Donut data={d.cityRows.map((c, i) => ({ label: c.city, value: c.n, color: CITY_COLORS[i % CITY_COLORS.length] }))} />
        </Card>
        <Card title="Revenue Overview" right={<span className="muted" style={{ fontSize: 12.5 }}>Last 7 days</span>}>
          <BarChart data={d.trend as any} valueKey="revenue" labelKey="day" />
        </Card>
        <Card title="Worker Summary">
          <Donut size={150} data={[
            { label: 'Active', value: s.workers.active, color: '#16a34a' },
            { label: 'Pending', value: s.workers.pending, color: '#f5a524' },
            { label: 'Inactive', value: s.workers.inactive, color: '#8085a3' },
          ]} />
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
        <Card title="Recent Registrations">
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Customer</th><th>Phone</th><th>City</th><th>Joined</th></tr></thead>
              <tbody>
                {d.registrations.map((u) => (
                  <tr key={u.id}>
                    <td><div className="cell-user"><Avatar name={u.name} size={32} /><strong>{u.name || 'Guest'}</strong></div></td>
                    <td className="muted">{u.phone || '—'}</td>
                    <td>{u.city || '—'}</td>
                    <td className="muted">{shortDate(u.created)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Top Services">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {d.topServices.map((t, i) => {
              const max = d.topServices[0]?.n || 1
              return (
                <div key={t.name}>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}><span>{t.name}</span><strong className="num">{t.n}</strong></div>
                  <div style={{ height: 7, background: 'var(--bg)', borderRadius: 4 }}><div style={{ width: `${(t.n / max) * 100}%`, height: '100%', borderRadius: 4, background: CITY_COLORS[i % CITY_COLORS.length] }} /></div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
