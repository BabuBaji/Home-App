import { Fragment, useEffect, useState } from 'react'
import {
  IndianRupee, CalendarCheck, CircleCheck, Users, UserRound, XCircle,
  Funnel, Download, ShoppingBag, RefreshCcw, Gem, MailWarning,
  TrendingUp, CalendarDays, Star, ArrowDownRight, UserPlus,
} from 'lucide-react'
import { fetchAnalytics } from '../api'
import { Card, StatCard, Loading, ErrorState, Pagination, SumBars, money } from '../components/UI'
import { LineChart, Donut } from '../components/Charts'

type Series = { day?: string; date?: string; revenue: number; bookings: number; completed: number }
type StatusSplit = { status: string; n: number }
type TopWorker = { id: number; name: string; city: string; jobs: number; rating: number; earnings: number; status: string }
type AnalyticsData = { series: Series[]; statusSplit: StatusSplit[]; topWorkers: TopWorker[] }

const SUB = 'vs 15 Apr - 15 May 2025'

/* ----- typed static placeholders for values not yet in the analytics API ----- */
type Insight = { icon: React.ReactNode; tint: string; title: string; sub: string }
const INSIGHTS: Insight[] = [
  { icon: <TrendingUp size={16} />, tint: '#16a34a', title: 'Revenue is up by 18.6%', sub: 'compared to 15 Apr - 15 May 2025.' },
  { icon: <CalendarDays size={16} />, tint: '#2e90fa', title: 'Bookings are higher on weekends', sub: 'with Saturday being the peak day.' },
  { icon: <Star size={16} />, tint: '#f59e0b', title: 'Home Cleaning is the top', sub: 'performing service by revenue.' },
  { icon: <ArrowDownRight size={16} />, tint: '#f04438', title: 'Cancellation rate decreased', sub: 'by 1.2% compared to last period.' },
  { icon: <UserPlus size={16} />, tint: '#5b51e8', title: 'New customer sign-ups increased', sub: 'by 15.4% this period.' },
]

const REVENUE_BREAKDOWN: { label: string; value: number; color: string }[] = [
  { label: 'Home Cleaning', value: 1056210, color: '#5b51e8' },
  { label: 'Pest Control', value: 464890, color: '#2e90fa' },
  { label: 'Plumbing', value: 328550, color: '#16a34a' },
  { label: 'Electrical', value: 283610, color: '#f59e0b' },
  { label: 'Appliance Repair', value: 206300, color: '#f04438' },
  { label: 'Others', value: 148000, color: '#8085a3' },
]

const CHANNELS: { label: string; value: number; color: string }[] = [
  { label: 'In-App', value: 1568, color: '#5b51e8' },
  { label: 'Website', value: 975, color: '#2e90fa' },
  { label: 'Call Center', value: 677, color: '#16a34a' },
  { label: 'Walk-in', value: 370, color: '#f59e0b' },
  { label: 'Others', value: 252, color: '#8085a3' },
]

const NEW_RETURNING: { label: string; value: number; color: string }[] = [
  { label: 'New Customers', value: 1861, color: '#5b51e8' },
  { label: 'Returning Customers', value: 1126, color: '#2e90fa' },
]

const DEVICES: { label: string; value: number; color: string }[] = [
  { label: 'Mobile App', value: 2621, color: '#5b51e8' },
  { label: 'Mobile Web', value: 753, color: '#2e90fa' },
  { label: 'Desktop', value: 468, color: '#f59e0b' },
]

const TOP_CITIES: { label: string; value: React.ReactNode; pct: number; color?: string }[] = [
  { label: 'Mumbai', value: money(642180), pct: 642180, color: '#5b51e8' },
  { label: 'Bangalore', value: money(458320), pct: 458320, color: '#5b51e8' },
  { label: 'Delhi', value: money(328940), pct: 328940, color: '#5b51e8' },
  { label: 'Pune', value: money(245670), pct: 245670, color: '#5b51e8' },
  { label: 'Hyderabad', value: money(212450), pct: 212450, color: '#5b51e8' },
]

type ServiceRow = { name: string; revenue: number; bookings: number; completed: number; cancellations: number; cancelRate: number; rating: number }
const TOP_SERVICES: ServiceRow[] = [
  { name: 'Home Cleaning', revenue: 1056210, bookings: 1842, completed: 1532, cancellations: 128, cancelRate: 7.0, rating: 4.6 },
  { name: 'Pest Control', revenue: 464890, bookings: 642, completed: 518, cancellations: 64, cancelRate: 10.0, rating: 4.4 },
  { name: 'Plumbing', revenue: 328550, bookings: 486, completed: 402, cancellations: 36, cancelRate: 7.4, rating: 4.5 },
  { name: 'Electrical', revenue: 283610, bookings: 412, completed: 346, cancellations: 32, cancelRate: 7.8, rating: 4.3 },
  { name: 'Appliance Repair', revenue: 206300, bookings: 296, completed: 244, cancellations: 28, cancelRate: 9.5, rating: 4.2 },
]

const CUSTOMER_GROWTH: { day: string; value: number }[] = [
  { day: '10 May', value: 540 }, { day: '11 May', value: 620 }, { day: '12 May', value: 560 },
  { day: '13 May', value: 700 }, { day: '14 May', value: 760 }, { day: '15 May', value: 690 },
  { day: '16 May', value: 720 },
]

const HEAT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HEAT_ROWS = ['12 AM', '6 AM', '12 PM', '6 PM']
const HEAT: number[][] = [
  [0.15, 0.1, 0.2, 0.12, 0.18, 0.35, 0.3],
  [0.45, 0.5, 0.4, 0.55, 0.6, 0.8, 0.7],
  [0.7, 0.65, 0.75, 0.7, 0.85, 0.95, 0.9],
  [0.55, 0.6, 0.5, 0.65, 0.7, 0.85, 0.8],
]

function MonthSel() {
  return (
    <select className="select flt" defaultValue="month">
      <option value="month">This Month</option>
      <option value="week">This Week</option>
      <option value="quarter">This Quarter</option>
    </select>
  )
}

function pct(v: number, total: number) { return total ? Math.round((v / total) * 1000) / 10 : 0 }

function LegendList({ rows, fmt }: { rows: { label: string; value: number; color: string }[]; fmt?: (v: number) => string }) {
  const total = rows.reduce((s, r) => s + r.value, 0)
  return (
    <div className="legend" style={{ flex: 1 }}>
      {rows.map((r, i) => (
        <div key={i} className="legend-row">
          <span className="dot" style={{ background: r.color }} />
          <span className="legend-label">{r.label}</span>
          <span className="legend-val" style={{ marginLeft: 'auto' }}>{pct(r.value, total)}%</span>
          <span className="muted" style={{ fontSize: 12, marginLeft: 10, minWidth: 56, textAlign: 'right' }}>
            {fmt ? fmt(r.value) : `(${r.value.toLocaleString('en-IN')})`}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function Analytics() {
  const [d, setD] = useState<AnalyticsData | null>(null)
  const [err, setErr] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [city, setCity] = useState('')
  const [service, setService] = useState('')
  const [channel, setChannel] = useState('')
  const [device, setDevice] = useState('')
  const [dateRange, setDateRange] = useState('d')
  const load = () => { setErr(''); fetchAnalytics().then(setD).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  const series = d.series
  const totalServices = 12

  const exportCsv = () => {
    const header = 'date,revenue,bookings'
    const rows = series.map((r) => `${r.date ?? r.day ?? ''},${r.revenue},${r.bookings}`)
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'analytics.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid" style={{ gap: 14 }}>
      {/* 1. top six stat cards */}
      <div className="stat-row">
        <StatCard icon={<IndianRupee size={22} />} tint="#5b51e8" label="Total Revenue" value={money(2487560)} delta="18.6%" sub={SUB} />
        <StatCard icon={<CalendarCheck size={22} />} tint="#2e90fa" label="Total Bookings" value="3,842" delta="14.2%" sub={SUB} />
        <StatCard icon={<CircleCheck size={22} />} tint="#16a34a" label="Completed Bookings" value="3,106" delta="16.8%" sub={SUB} />
        <StatCard icon={<Users size={22} />} tint="#f59e0b" label="Active Customers" value="2,987" delta="12.5%" sub={SUB} />
        <StatCard icon={<UserRound size={22} />} tint="#7c6df7" label="Active Workers" value="1,245" delta="11.3%" sub={SUB} />
        <StatCard icon={<XCircle size={22} />} tint="#f04438" label="Cancellation Rate" value="8.6%" delta="1.2%" down sub={SUB} />
      </div>

      {/* 2. filter toolbar */}
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <select className="select flt" value={city} onChange={(e) => setCity(e.target.value)}><option value="">All Cities</option></select>
        <select className="select flt" value={service} onChange={(e) => setService(e.target.value)}><option value="">All Services</option></select>
        <select className="select flt" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">All Channels</option></select>
        <select className="select flt" value={device} onChange={(e) => setDevice(e.target.value)}><option value="">All Devices</option></select>
        <select className="select flt" value={dateRange} onChange={(e) => setDateRange(e.target.value)}><option value="d">16 May 2025 - 16 May 2025</option></select>
        <div className="tb-spacer" />
        <button className="btn line"><Funnel size={16} /> Filters</button>
        <button className="btn line" onClick={exportCsv}><Download size={16} /> Export</button>
      </div>

      {/* 3a. Overview Trend | Revenue Breakdown | Key Insights */}
      <div className="grid" style={{ gridTemplateColumns: '1.55fr 1.15fr 0.95fr' }}>
        <Card title="Overview Trend" right={<MonthSel />}>
          <div className="legend" style={{ flexDirection: 'row', gap: 16, marginBottom: 6 }}>
            <span className="legend-row" style={{ width: 'auto' }}><span className="dot" style={{ background: '#5b51e8' }} /> Revenue (₹)</span>
            <span className="legend-row" style={{ width: 'auto' }}><span className="dot" style={{ background: '#2e90fa' }} /> Bookings</span>
            <span className="legend-row" style={{ width: 'auto' }}><span className="dot" style={{ background: '#16a34a' }} /> Completed</span>
          </div>
          <LineChart data={series as unknown as Record<string, number>[]} keys={['revenue', 'bookings', 'completed']} colors={['#5b51e8', '#2e90fa', '#16a34a']} height={210} />
        </Card>

        <Card title="Revenue Breakdown" right={<MonthSel />}>
          <div className="donut-wrap">
            <Donut data={REVENUE_BREAKDOWN} size={180} />
          </div>
        </Card>

        <Card title="Key Insights">
          <div className="minilist">
            {INSIGHTS.map((it, i) => (
              <div key={i} className="mini-row">
                <span className="mini-ico" style={{ background: it.tint + '1f', color: it.tint }}>{it.icon}</span>
                <div className="mini-bd"><strong>{it.title}</strong><small>{it.sub}</small></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 3b. four small stat cards */}
      <div className="stat-row">
        <StatCard icon={<ShoppingBag size={22} />} tint="#5b51e8" label="Average Order Value" value={money(648)} delta="9.3%" sub={SUB} />
        <StatCard icon={<RefreshCcw size={22} />} tint="#2e90fa" label="Repeat Customer Rate" value="32.6%" delta="6.8%" sub={SUB} />
        <StatCard icon={<Gem size={22} />} tint="#16a34a" label="Customer Lifetime Value" value={money(2465)} delta="10.4%" sub={SUB} />
        <StatCard icon={<MailWarning size={22} />} tint="#f59e0b" label="No Show Rate" value="2.1%" delta="0.5%" down sub={SUB} />
      </div>

      {/* 3c. main charts row + right rail */}
      <div className="cols">
        <div className="grid" style={{ gap: 14 }}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Card title="Bookings by Channel" right={<MonthSel />}>
              <div className="donut-wrap">
                <Donut data={CHANNELS} size={150} />
                <LegendList rows={CHANNELS} />
              </div>
            </Card>

            <Card title="Customer Growth" right={<MonthSel />}>
              <div className="legend" style={{ marginBottom: 6 }}>
                <span className="legend-row" style={{ width: 'auto' }}><span className="dot" style={{ background: '#5b51e8' }} /> New Customers</span>
              </div>
              <LineChart data={CUSTOMER_GROWTH as unknown as Record<string, number>[]} keys={['value']} colors={['#5b51e8']} height={170} />
            </Card>

            <Card title="New vs Returning Customers" right={<MonthSel />}>
              <div className="donut-wrap">
                <Donut data={NEW_RETURNING} size={150} />
                <LegendList rows={NEW_RETURNING} />
              </div>
            </Card>
          </div>

          {/* Top Services Performance table */}
          <Card title="Top Services Performance">
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th><th>Service</th><th className="num">Revenue</th><th className="num">Bookings</th>
                    <th className="num">Completed</th><th className="num">Cancellations</th>
                    <th className="num">Cancellation Rate</th><th className="num">Avg. Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {TOP_SERVICES.map((s, i) => (
                    <tr key={s.name}>
                      <td className="num">{i + 1}</td>
                      <td><strong>{s.name}</strong></td>
                      <td className="num">{money(s.revenue)}</td>
                      <td className="num">{s.bookings.toLocaleString('en-IN')}</td>
                      <td className="num">{s.completed.toLocaleString('en-IN')}</td>
                      <td className="num">{s.cancellations}</td>
                      <td className="num">{s.cancelRate.toFixed(1)}%</td>
                      <td className="num"><span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>{s.rating} <Star size={13} fill="#f59e0b" stroke="#f59e0b" /></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={totalServices} noun="services" onPage={setPage} onSize={setPageSize} />
          </Card>
        </div>

        {/* right rail */}
        <div className="col-rail">
          <Card title="Top Cities by Revenue" right={<MonthSel />}>
            <SumBars rows={TOP_CITIES} />
          </Card>

          <Card title="Device Usage" right={<MonthSel />}>
            <div className="donut-wrap">
              <Donut data={DEVICES} size={140} />
              <LegendList rows={DEVICES} />
            </div>
          </Card>

          <Card title="Heatmap – Bookings by Day & Time" right={<MonthSel />}>
            <div style={{ display: 'grid', gridTemplateColumns: `48px repeat(${HEAT_DAYS.length}, 1fr)`, gap: 4 }}>
              {HEAT.map((row, r) => (
                <Fragment key={'r' + r}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>{HEAT_ROWS[r]}</span>
                  {row.map((v, c) => (
                    <span key={r + '-' + c} style={{ height: 22, borderRadius: 5, background: `rgba(91,81,232,${0.12 + v * 0.78})` }} />
                  ))}
                </Fragment>
              ))}
              <span />
              {HEAT_DAYS.map((day) => <span key={day} style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>{day}</span>)}
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
              <span>Low</span><span>High</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
