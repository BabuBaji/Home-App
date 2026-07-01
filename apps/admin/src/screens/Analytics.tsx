import { Fragment, useEffect, useState } from 'react'
import {
  IndianRupee, CalendarCheck, CircleCheck, Users, UserRound, XCircle,
  Funnel, Download, ShoppingBag, RefreshCcw, Gem, MailWarning,
  TrendingUp, CalendarDays, Star, ArrowDownRight, UserPlus,
} from 'lucide-react'
import { fetchInsights, type Insights } from '../api'
import { Card, StatCard, Loading, ErrorState, Pagination, SumBars, money } from '../components/UI'
import { LineChart, Donut } from '../components/Charts'

const SUB = 'vs previous 15 days'

// Icon/tint styling for the Key Insights rows; the text itself comes from the API.
const INSIGHT_ICONS = [
  { icon: <TrendingUp size={16} />, tint: '#16a34a' },
  { icon: <CalendarDays size={16} />, tint: '#2e90fa' },
  { icon: <Star size={16} />, tint: '#f59e0b' },
  { icon: <ArrowDownRight size={16} />, tint: '#f04438' },
  { icon: <UserPlus size={16} />, tint: '#5b51e8' },
]
const PIE_COLORS = ['#5b51e8', '#2e90fa', '#16a34a', '#f59e0b', '#f04438', '#8085a3']
const withColors = (rows: { label: string; value: number }[]) => rows.map((r, i) => ({ ...r, color: PIE_COLORS[i % PIE_COLORS.length] }))

// Device usage is not tracked in the backend yet, so this card has no DB source.
const DEVICES: { label: string; value: number; color: string }[] = []

const HEAT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HEAT_ROWS = ['12 AM', '6 AM', '12 PM', '6 PM']

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
  const [d, setD] = useState<Insights | null>(null)
  const [err, setErr] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [city, setCity] = useState('')
  const [service, setService] = useState('')
  const [channel, setChannel] = useState('')
  const [device, setDevice] = useState('')
  const [dateRange, setDateRange] = useState('d')
  const load = () => { setErr(''); fetchInsights().then(setD).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  const series = d.series
  const t = d.totals
  const dl = d.deltas
  const dval = (v: number | null) => (v == null ? undefined : `${Math.abs(v)}%`)

  const REVENUE_BREAKDOWN = withColors(d.revenueByService)
  const CHANNELS = withColors(d.bookingsByPayment)
  const NEW_RETURNING = withColors(d.newVsReturning)
  const TOP_CITIES = d.topCitiesByRevenue.map((c) => ({ label: c.label, value: money(c.value), pct: c.value, color: '#5b51e8' }))
  const TOP_SERVICES = d.topServices
  const CUSTOMER_GROWTH = d.growth.map((g) => ({ date: g.date, value: g.n }))
  const HEAT = d.heatmap
  const totalServices = TOP_SERVICES.length
  const pageServices = TOP_SERVICES.slice((page - 1) * pageSize, page * pageSize)

  const exportCsv = () => {
    const header = 'date,revenue,bookings,completed'
    const rows = series.map((r) => `${r.date},${r.revenue},${r.bookings},${r.completed}`)
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
        <StatCard icon={<IndianRupee size={22} />} tint="#5b51e8" label="Total Revenue" value={money(t.revenue)} delta={dval(dl.revenue)} down={(dl.revenue ?? 0) < 0} sub={SUB} />
        <StatCard icon={<CalendarCheck size={22} />} tint="#2e90fa" label="Total Bookings" value={t.bookings.toLocaleString('en-IN')} delta={dval(dl.bookings)} down={(dl.bookings ?? 0) < 0} sub={SUB} />
        <StatCard icon={<CircleCheck size={22} />} tint="#16a34a" label="Completed Bookings" value={t.completed.toLocaleString('en-IN')} delta={dval(dl.completed)} down={(dl.completed ?? 0) < 0} sub={SUB} />
        <StatCard icon={<Users size={22} />} tint="#f59e0b" label="Active Customers" value={t.activeCustomers.toLocaleString('en-IN')} delta={dval(dl.newCustomers)} down={(dl.newCustomers ?? 0) < 0} sub={SUB} />
        <StatCard icon={<UserRound size={22} />} tint="#7c6df7" label="Active Workers" value={t.activeWorkers.toLocaleString('en-IN')} sub={SUB} />
        <StatCard icon={<XCircle size={22} />} tint="#f04438" label="Cancellation Rate" value={`${t.cancellationRate}%`} delta={dval(dl.cancelRate)} down={(dl.cancelRate ?? 0) <= 0} sub={SUB} />
      </div>

      {/* 2. filter toolbar */}
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <select className="select flt" value={city} onChange={(e) => setCity(e.target.value)}><option value="">All Cities</option></select>
        <select className="select flt" value={service} onChange={(e) => setService(e.target.value)}><option value="">All Services</option></select>
        <select className="select flt" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">All Channels</option></select>
        <select className="select flt" value={device} onChange={(e) => setDevice(e.target.value)}><option value="">All Devices</option></select>
        <select className="select flt" value={dateRange} onChange={(e) => setDateRange(e.target.value)}><option value="d">Last 30 days</option></select>
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
            {d.insights.map((it, i) => (
              <div key={i} className="mini-row">
                <span className="mini-ico" style={{ background: (INSIGHT_ICONS[i]?.tint ?? '#5b51e8') + '1f', color: INSIGHT_ICONS[i]?.tint ?? '#5b51e8' }}>{INSIGHT_ICONS[i]?.icon ?? <TrendingUp size={16} />}</span>
                <div className="mini-bd"><strong>{it.title}</strong><small>{it.sub}</small></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 3b. four small stat cards */}
      <div className="stat-row">
        <StatCard icon={<ShoppingBag size={22} />} tint="#5b51e8" label="Average Order Value" value={money(t.aov)} sub={SUB} />
        <StatCard icon={<RefreshCcw size={22} />} tint="#2e90fa" label="Repeat Customer Rate" value={`${t.repeatRate}%`} sub={SUB} />
        <StatCard icon={<Gem size={22} />} tint="#16a34a" label="Customer Lifetime Value" value={money(t.clv)} sub={SUB} />
        <StatCard icon={<MailWarning size={22} />} tint="#f59e0b" label="No Show Rate" value={`${t.noShowRate}%`} sub={SUB} />
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
                  {pageServices.map((s, i) => (
                    <tr key={s.service}>
                      <td className="num">{(page - 1) * pageSize + i + 1}</td>
                      <td><strong>{s.service}</strong></td>
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
