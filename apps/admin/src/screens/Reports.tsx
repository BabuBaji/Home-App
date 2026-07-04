import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  IndianRupee, CalendarCheck, CheckCircle2, Users, UserCog, XCircle,
  Filter, Download, TrendingUp, CalendarDays, Sparkles, AlertTriangle,
  FileBarChart2, FileText, UserCheck, BriefcaseBusiness, ChevronRight,
} from 'lucide-react'
import { fetchInsights, type Insights } from '../api'
import { Card, StatCard, Loading, ErrorState, SumBars, Pagination, money, useToast } from '../components/UI'
import { LineChart, BarChart, Donut } from '../components/Charts'

const COLORS = ['#5b51e8', '#16a34a', '#f59e0b', '#2e90fa', '#ff7a59', '#8085a3', '#f04438']
const withColors = (rows: { label: string; value: number }[]) => rows.map((r, i) => ({ ...r, color: COLORS[i % COLORS.length] }))

// Icon/tint styling for the Key Insights rows; the text comes from the API.
const INSIGHT_ICONS: { icon: ReactNode; tint: string }[] = [
  { icon: <TrendingUp size={15} />, tint: '#16a34a' },
  { icon: <CalendarDays size={15} />, tint: '#2e90fa' },
  { icon: <Users size={15} />, tint: '#f59e0b' },
  { icon: <AlertTriangle size={15} />, tint: '#f04438' },
  { icon: <TrendingUp size={15} />, tint: '#5b51e8' },
]
const QUICK_LINKS: { icon: ReactNode; title: string; sub: string }[] = [
  { icon: <FileBarChart2 size={16} />, title: 'Sales Report', sub: 'Detailed sales and revenue report' },
  { icon: <FileText size={16} />, title: 'Bookings Report', sub: 'Detailed bookings and status report' },
  { icon: <UserCheck size={16} />, title: 'Customer Report', sub: 'Customer growth and activity report' },
  { icon: <BriefcaseBusiness size={16} />, title: 'Worker Report', sub: 'Worker performance and earnings report' },
]

export default function Reports() {
  const toast = useToast()
  const [d, setD] = useState<Insights | null>(null)
  const [err, setErr] = useState('')
  const [report, setReport] = useState('all')
  const [city, setCity] = useState('all')
  const [service, setService] = useState('all')
  const [channel, setChannel] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  const load = () => { setErr(''); fetchInsights().then(setD).catch((e) => setErr(e.message)) }
  useEffect(load, [])

  const pageRows = useMemo(() => (d ? d.topServices.slice((page - 1) * pageSize, page * pageSize) : []), [d, page, pageSize])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  const t = d.totals
  const dl = d.deltas
  const dval = (v: number | null) => (v == null ? undefined : `${Math.abs(v)}%`)

  const REVENUE_BY_SERVICE = withColors(d.revenueByService)
  const REVENUE_BY_CHANNEL = withColors(d.revenueByPayment)
  const TOP_CITIES = d.topCitiesByBookings.map((c) => ({ label: c.label, value: c.value, pct: c.value, color: COLORS[0] }))
  const newCustomers = d.growth.map((g) => ({ date: g.date, n: g.n }))

  function exportCsv() {
    const rows = [['Date', 'Revenue', 'Bookings'], ...d!.series.map((s) => [s.date, s.revenue, s.bookings])]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'homehelp-revenue-report.csv'; a.click()
    URL.revokeObjectURL(url); toast('Report downloaded')
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* KPI row */}
      <div className="stat-row">
        <StatCard icon={<IndianRupee size={22} />} tint="#5b51e8" label="Total Revenue" value={money(t.revenue)} delta={dval(dl.revenue)} down={(dl.revenue ?? 0) < 0} sub="vs previous 15 days" />
        <StatCard icon={<CalendarCheck size={22} />} tint="#2e90fa" label="Total Bookings" value={t.bookings.toLocaleString('en-IN')} delta={dval(dl.bookings)} down={(dl.bookings ?? 0) < 0} sub="vs previous 15 days" />
        <StatCard icon={<CheckCircle2 size={22} />} tint="#16a34a" label="Completed Bookings" value={t.completed.toLocaleString('en-IN')} delta={dval(dl.completed)} down={(dl.completed ?? 0) < 0} sub="vs previous 15 days" />
        <StatCard icon={<Users size={22} />} tint="#f59e0b" label="Active Customers" value={t.activeCustomers.toLocaleString('en-IN')} delta={dval(dl.newCustomers)} down={(dl.newCustomers ?? 0) < 0} sub="vs previous 15 days" />
        <StatCard icon={<UserCog size={22} />} tint="#7c6df7" label="Active Workers" value={t.activeWorkers.toLocaleString('en-IN')} sub="vs previous 15 days" />
        <StatCard icon={<XCircle size={22} />} tint="#f04438" label="Cancellation Rate" value={`${t.cancellationRate}%`} delta={dval(dl.cancelRate)} down={(dl.cancelRate ?? 0) <= 0} sub="vs previous 15 days" />
      </div>

      {/* filter toolbar */}
      <div className="toolbar">
        <select className="select flt" value={report} onChange={(e) => setReport(e.target.value)}>
          <option value="all">All Reports</option><option value="sales">Sales</option><option value="bookings">Bookings</option><option value="customers">Customers</option>
        </select>
        <select className="select flt" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="all">All Cities</option><option>Mumbai</option><option>Bangalore</option><option>Delhi</option><option>Pune</option><option>Hyderabad</option>
        </select>
        <select className="select flt" value={service} onChange={(e) => setService(e.target.value)}>
          <option value="all">All Services</option><option>Home Cleaning</option><option>Pest Control</option><option>Plumbing</option><option>Electrical</option>
        </select>
        <select className="select flt" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="all">All Channels</option><option>In-App</option><option>Website</option><option>Call Center</option><option>Walk-in</option>
        </select>
        <div className="tb-spacer" />
        <button className="btn line"><Filter size={16} /> Filters</button>
        <button className="btn ghost" onClick={exportCsv}><Download size={16} /> Export</button>
      </div>

      {/* charts: 2 trend cards + revenue-by-service rail */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card title="Revenue Overview" right={<span className="muted" style={{ fontSize: 12 }}>Daily</span>}>
          <LineChart data={d.series as unknown as Record<string, number>[]} keys={['revenue']} colors={['#5b51e8']} height={220} />
        </Card>
        <Card title="Bookings Overview" right={<span className="muted" style={{ fontSize: 12 }}>Daily</span>}>
          <BarChart data={d.series as unknown as Record<string, number>[]} valueKey="bookings" labelKey="date" height={220} />
        </Card>
        <Card title="Revenue by Service">
          <Donut data={REVENUE_BY_SERVICE.map((s) => ({ label: s.label, value: s.value, color: s.color }))} size={170} />
        </Card>
      </div>

      {/* second chart row: channel donut, new customers, top cities + bookings-by-status rail */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card title="Revenue by Channel">
          <Donut data={REVENUE_BY_CHANNEL.map((s) => ({ label: s.label, value: s.value, color: s.color }))} size={170} />
        </Card>
        <Card title="New Customers" right={<span className="muted" style={{ fontSize: 12 }}>Daily</span>}>
          <LineChart data={newCustomers as unknown as Record<string, number>[]} keys={['n']} colors={['#16a34a']} height={200} />
        </Card>
        <Card title="Top Cities by Bookings" right={<span className="muted" style={{ fontSize: 12 }}>This Month</span>}>
          <SumBars rows={TOP_CITIES} />
        </Card>
      </div>

      {/* third row: bookings-by-status, key insights, quick links */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card title="Bookings by Status">
          <Donut data={d.statusSplit.map((s, i) => ({ label: s.status.replace(/_/g, ' '), value: s.n, color: COLORS[i % COLORS.length] }))} size={170} />
        </Card>
        <Card title="Key Insights">
          <div className="minilist">
            {d.insights.slice(0, 4).map((it, i) => (
              <div key={i} className="mini-row">
                <span className="mini-ico" style={{ background: INSIGHT_ICONS[i].tint + '1f', color: INSIGHT_ICONS[i].tint }}>{INSIGHT_ICONS[i].icon}</span>
                <div className="mini-bd"><strong style={{ fontWeight: 500 }}>{it.title}. {it.sub}</strong></div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Reports Quick Links">
          <div className="minilist">
            {QUICK_LINKS.map((it, i) => (
              <div key={i} className="mini-row link-row">
                <span className="mini-ico">{it.icon}</span>
                <div className="mini-bd"><strong>{it.title}</strong><small>{it.sub}</small></div>
                <ChevronRight size={16} className="muted" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Top services table */}
      <Card title="Top Services by Revenue" right={<Sparkles size={16} className="muted" />}>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>#</th><th>Service</th><th>Revenue</th><th>Bookings</th><th>Completed</th><th>Cancellations</th><th>Cancellation Rate</th></tr></thead>
            <tbody>
              {pageRows.map((s, i) => (
                <tr key={s.service}>
                  <td className="muted">{(page - 1) * pageSize + i + 1}</td>
                  <td><strong>{s.service}</strong></td>
                  <td className="num">{money(s.revenue)}</td>
                  <td className="num">{s.bookings.toLocaleString('en-IN')}</td>
                  <td className="num">{s.completed.toLocaleString('en-IN')}</td>
                  <td className="num">{s.cancellations}</td>
                  <td className="num">{s.cancelRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={d.topServices.length} noun="services" onPage={setPage} onSize={(s) => { setPageSize(s); setPage(1) }} />
      </Card>
    </div>
  )
}
