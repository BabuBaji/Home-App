import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, CheckCircle2, Users, ShoppingBag, Star } from 'lucide-react'
import { fetchDashboard } from '../api'
import type { DashboardData } from '../types'
import { Card, StatCard, Badge, Loading, ErrorState, money, shortDate } from '../components/UI'
import { LineChart, BarChart, Donut } from '../components/Charts'

const CITY_COLORS = ['#5b51e8', '#16a34a', '#f59e0b', '#2e90fa', '#f04438', '#98a2b3']
const WORKER_COLORS = ['#16a34a', '#f59e0b', '#98a2b3']

/* ---------------- screen ---------------- */

export default function Dashboard() {
  const navigate = useNavigate()
  const [d, setD] = useState<DashboardData | null>(null)
  const [err, setErr] = useState('')
  const [range, setRange] = useState('7')
  const load = () => { setErr(''); fetchDashboard().then(setD).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  const s = d.stats
  const cityTotal = d.cityRows.reduce((a, c) => a + c.n, 0) || 1
  const cityRows = d.cityRows.map((c, i) => ({ label: c.city || '—', value: c.n, pct: Math.round((c.n / cityTotal) * 100), color: CITY_COLORS[i % CITY_COLORS.length] }))

  const wk = s.workers
  const workerRows = [
    { label: 'Active', value: wk.active, color: WORKER_COLORS[0] },
    { label: 'Pending', value: wk.pending, color: WORKER_COLORS[1] },
    { label: 'Inactive', value: wk.inactive, color: WORKER_COLORS[2] },
  ]
  const wkTotal = wk.total || 1

  const topServices = d.topServices.map((t) => ({ name: t.name, bookings: t.n }))
  const maxSvc = topServices[0]?.bookings || 1

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* ---- stat row ---- */}
      <div className="stat-row">
        <StatCard icon={<CalendarCheck size={22} />} tint="#5b51e8" label="Total Bookings" value={s.totalBookings.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<CheckCircle2 size={22} />} tint="#16a34a" label="Completed Bookings" value={s.completed.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<Users size={22} />} tint="#2e90fa" label="Active Workers" value={wk.active.toLocaleString('en-IN')} sub={`${wk.total} total`} />
        <StatCard icon={<ShoppingBag size={22} />} tint="#f59e0b" label="Total Revenue" value={money(s.revenue)} sub="all time" />
        <StatCard icon={<Star size={22} />} tint="#f59e0b" label="Customer Rating" value={s.avgRating || '—'} sub={`${s.customers} customers`} />
      </div>

      {/* ---- row: Bookings Overview + Recent Bookings ---- */}
      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
        <Card
          title="Bookings Overview"
          right={<select className="select" style={{ fontSize: 12.5, padding: '6px 12px' }} value={range} onChange={(e) => setRange(e.target.value)}><option value="7">7 Days</option><option value="30">30 Days</option><option value="90">90 Days</option></select>}
        >
          <div className="row" style={{ gap: 18, marginBottom: 6, fontSize: 12.5 }}>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#5b51e8' }} /> Bookings</span>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#16a34a' }} /> Completed</span>
          </div>
          <LineChart data={d.trend as any} keys={['total', 'completed']} height={230} />
        </Card>

        <Card title="Recent Bookings" right={<a className="muted" style={{ fontSize: 12.5, color: '#5b51e8', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/bookings')}>View All</a>}>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Booking ID</th><th>Customer</th><th>Service</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {d.recent.map((b) => (
                  <tr key={b.id}>
                    <td><strong className="num" style={{ fontSize: 13 }}>{b.ref}</strong></td>
                    <td>{b.customer}</td>
                    <td className="muted">{b.service}</td>
                    <td className="num">{money(b.total)}</td>
                    <td><Badge>{b.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ---- row: Bookings by City + Revenue Overview + Worker Summary ---- */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr 1fr' }}>
        <Card title="Bookings by City">
          <div className="row" style={{ gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <Donut size={170} data={cityRows.map((c) => ({ label: c.label, value: c.value, color: c.color }))} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 150 }}>
              {cityRows.map((c) => (
                <div key={c.label} className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                  <span className="row" style={{ gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: c.color }} />{c.label}</span>
                  <span><strong className="num">{c.pct}%</strong> <span className="muted">({c.value.toLocaleString('en-IN')})</span></span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card
          title="Revenue Overview"
          right={<select className="select" style={{ fontSize: 12.5, padding: '6px 12px' }} value={range} onChange={(e) => setRange(e.target.value)}><option value="7">7 Days</option><option value="30">30 Days</option><option value="90">90 Days</option></select>}
        >
          <div className="row" style={{ gap: 10, marginBottom: 4, alignItems: 'baseline' }}>
            <strong style={{ fontSize: 22, fontWeight: 700 }}>{money(s.revenue)}</strong>
            <span className="muted" style={{ fontSize: 12 }}>total revenue</span>
          </div>
          <BarChart data={d.trend as any} valueKey="revenue" labelKey="day" height={210} />
        </Card>

        <Card title="Worker Summary" right={<a className="muted" style={{ fontSize: 12.5, color: '#5b51e8', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/workers')}>View All</a>}>
          <div className="row" style={{ gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <Donut size={170} data={workerRows.map((w) => ({ label: w.label, value: w.value, color: w.color }))} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minWidth: 130 }}>
              {workerRows.map((w) => (
                <div key={w.label} className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                  <span className="row" style={{ gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: w.color }} />{w.label}</span>
                  <span><strong className="num">{w.value.toLocaleString('en-IN')}</strong> <span className="muted">({Math.round((w.value / wkTotal) * 100)}%)</span></span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ---- row: Recent Registrations + Top Services ---- */}
      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
        <Card title="Recent Registrations">
          <div className="row" style={{ gap: 22, marginBottom: 10, fontSize: 13.5 }}>
            <span style={{ fontWeight: 700, color: '#5b51e8', borderBottom: '2px solid #5b51e8', paddingBottom: 4 }}>Customers</span>
            <span className="muted">Workers</span>
          </div>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Mobile Number</th><th>City</th><th>Registered On</th><th>Status</th></tr></thead>
              <tbody>
                {d.registrations.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong></td>
                    <td className="muted">{u.phone ?? '—'}</td>
                    <td>{u.city ?? '—'}</td>
                    <td className="muted">{shortDate(u.created)}</td>
                    <td><Badge tone="green">Active</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Top Services" right={<select className="select" style={{ fontSize: 12.5, padding: '6px 12px' }} value={range} onChange={(e) => setRange(e.target.value)}><option value="7">7 Days</option><option value="30">30 Days</option><option value="90">90 Days</option></select>}>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Service</th><th>Bookings</th></tr></thead>
              <tbody>
                {topServices.map((t) => (
                  <tr key={t.name}>
                    <td><strong>{t.name}</strong></td>
                    <td>
                      <div className="row" style={{ gap: 10, justifyContent: 'space-between' }}>
                        <span className="num">{t.bookings.toLocaleString('en-IN')}</span>
                        <span style={{ flex: 1, maxWidth: 90, height: 7, background: 'var(--bg)', borderRadius: 4 }}>
                          <span style={{ display: 'block', width: `${(t.bookings / maxSvc) * 100}%`, height: '100%', borderRadius: 4, background: '#5b51e8' }} />
                        </span>
                      </div>
                    </td>
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
