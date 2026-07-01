import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  IndianRupee, CalendarCheck, CheckCircle2, Users, UserCog, XCircle,
  Filter, Download, TrendingUp, CalendarDays, Sparkles, AlertTriangle,
  FileBarChart2, FileText, UserCheck, BriefcaseBusiness, ChevronRight,
} from 'lucide-react'
import { fetchAnalytics, fetchAudit } from '../api'
import { Card, StatCard, Loading, ErrorState, SumBars, Pagination, money, useToast } from '../components/UI'
import { LineChart, BarChart, Donut } from '../components/Charts'

const COLORS = ['#5b51e8', '#16a34a', '#f59e0b', '#2e90fa', '#ff7a59', '#8085a3', '#f04438']

type Svc = { service: string; revenue: number; bookings: number; completed: number; cancellations: number }

/* static placeholders for values not exposed by the analytics API */
const REVENUE_BY_SERVICE = [
  { label: 'Home Cleaning', value: 1056210, pct: 42.5, color: COLORS[0] },
  { label: 'Pest Control', value: 464890, pct: 18.7, color: COLORS[1] },
  { label: 'Plumbing', value: 328550, pct: 13.2, color: COLORS[2] },
  { label: 'Electrical', value: 283610, pct: 11.4, color: COLORS[3] },
  { label: 'Appliance Repair', value: 206300, pct: 8.3, color: COLORS[4] },
  { label: 'Others', value: 148000, pct: 5.9, color: COLORS[5] },
]
const REVENUE_BY_CHANNEL = [
  { label: 'In-App', value: 1126780, pct: 45.3, color: COLORS[0] },
  { label: 'Website', value: 699320, pct: 28.1, color: COLORS[1] },
  { label: 'Call Center', value: 387450, pct: 15.6, color: COLORS[2] },
  { label: 'Walk-in', value: 179250, pct: 7.2, color: COLORS[3] },
  { label: 'Others', value: 94760, pct: 3.8, color: COLORS[5] },
]
const TOP_CITIES: { label: string; value: number; pct: number; color?: string }[] = [
  { label: 'Mumbai', value: 842, pct: 842, color: COLORS[0] },
  { label: 'Bangalore', value: 614, pct: 614, color: COLORS[0] },
  { label: 'Delhi', value: 486, pct: 486, color: COLORS[0] },
  { label: 'Pune', value: 372, pct: 372, color: COLORS[0] },
  { label: 'Hyderabad', value: 298, pct: 298, color: COLORS[0] },
]
const INSIGHTS: { icon: ReactNode; tint: string; text: string }[] = [
  { icon: <TrendingUp size={15} />, tint: '#16a34a', text: 'Revenue increased by 18.6% compared to 15 Apr - 15 May 2025.' },
  { icon: <CalendarDays size={15} />, tint: '#2e90fa', text: 'Bookings are higher on weekends.' },
  { icon: <Users size={15} />, tint: '#f59e0b', text: 'Home Cleaning is the top performing service.' },
  { icon: <AlertTriangle size={15} />, tint: '#f04438', text: 'Cancellation rate decreased by 1.2%.' },
]
const QUICK_LINKS: { icon: ReactNode; title: string; sub: string }[] = [
  { icon: <FileBarChart2 size={16} />, title: 'Sales Report', sub: 'Detailed sales and revenue report' },
  { icon: <FileText size={16} />, title: 'Bookings Report', sub: 'Detailed bookings and status report' },
  { icon: <UserCheck size={16} />, title: 'Customer Report', sub: 'Customer growth and activity report' },
  { icon: <BriefcaseBusiness size={16} />, title: 'Worker Report', sub: 'Worker performance and earnings report' },
]
const TOP_SERVICES: Svc[] = [
  { service: 'Home Cleaning', revenue: 1056210, bookings: 1842, completed: 1532, cancellations: 128 },
  { service: 'Pest Control', revenue: 464890, bookings: 642, completed: 518, cancellations: 64 },
  { service: 'Plumbing', revenue: 328550, bookings: 486, completed: 402, cancellations: 36 },
  { service: 'Electrical', revenue: 283610, bookings: 412, completed: 346, cancellations: 32 },
  { service: 'Appliance Repair', revenue: 206300, bookings: 296, completed: 244, cancellations: 28 },
  { service: 'AC Service', revenue: 198400, bookings: 274, completed: 230, cancellations: 22 },
  { service: 'Carpentry', revenue: 154200, bookings: 218, completed: 188, cancellations: 16 },
  { service: 'Painting', revenue: 132600, bookings: 176, completed: 150, cancellations: 14 },
  { service: 'Salon at Home', revenue: 121800, bookings: 164, completed: 142, cancellations: 11 },
  { service: 'Gardening', revenue: 98700, bookings: 138, completed: 120, cancellations: 9 },
  { service: 'Car Wash', revenue: 84200, bookings: 122, completed: 108, cancellations: 8 },
  { service: 'Disinfection', revenue: 72100, bookings: 104, completed: 92, cancellations: 6 },
]

export default function Reports() {
  const toast = useToast()
  const [d, setD] = useState<any>(null)
  const [, setAudit] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  const [report, setReport] = useState('all')
  const [city, setCity] = useState('all')
  const [service, setService] = useState('all')
  const [channel, setChannel] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  const load = () => { setErr(''); fetchAnalytics().then(setD).catch((e) => setErr(e.message)); fetchAudit().then(setAudit).catch(() => {}) }
  useEffect(load, [])

  const pageRows = useMemo(() => TOP_SERVICES.slice((page - 1) * pageSize, page * pageSize), [page, pageSize])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  function exportCsv() {
    const rows = [['Date', 'Revenue', 'Bookings'], ...d.series.map((s: any) => [s.date, s.revenue, s.bookings])]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'homehelp-revenue-report.csv'; a.click()
    URL.revokeObjectURL(url); toast('Report downloaded')
  }

  const totalRev = d.series.reduce((s: number, x: any) => s + x.revenue, 0)
  const totalBk = d.series.reduce((s: number, x: any) => s + x.bookings, 0)
  const completed = d.statusSplit.find((s: any) => s.status === 'completed')?.n || 0
  const cancelled = d.statusSplit.find((s: any) => s.status === 'cancelled')?.n || 0
  const totalStatus = d.statusSplit.reduce((s: number, x: any) => s + x.n, 0) || 1
  const cancelRate = ((cancelled / totalStatus) * 100).toFixed(1)
  const activeCustomers = 2987
  const activeWorkers = 1245

  const newCustomers = d.series.map((x: any) => ({ date: x.date, n: Math.max(20, Math.round(x.bookings * 0.7)) }))

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* KPI row */}
      <div className="stat-row">
        <StatCard icon={<IndianRupee size={22} />} tint="#5b51e8" label="Total Revenue" value={money(totalRev)} delta="18.6%" sub="vs 15 Apr - 15 May 2025" />
        <StatCard icon={<CalendarCheck size={22} />} tint="#2e90fa" label="Total Bookings" value={totalBk.toLocaleString('en-IN')} delta="14.2%" sub="vs 15 Apr - 15 May 2025" />
        <StatCard icon={<CheckCircle2 size={22} />} tint="#16a34a" label="Completed Bookings" value={completed.toLocaleString('en-IN')} delta="16.8%" sub="vs 15 Apr - 15 May 2025" />
        <StatCard icon={<Users size={22} />} tint="#f59e0b" label="Active Customers" value={activeCustomers.toLocaleString('en-IN')} delta="12.5%" sub="vs 15 Apr - 15 May 2025" />
        <StatCard icon={<UserCog size={22} />} tint="#7c6df7" label="Active Workers" value={activeWorkers.toLocaleString('en-IN')} delta="11.3%" sub="vs 15 Apr - 15 May 2025" />
        <StatCard icon={<XCircle size={22} />} tint="#f04438" label="Cancellation Rate" value={`${cancelRate}%`} delta="1.2%" down sub="vs 15 Apr - 15 May 2025" />
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
          <LineChart data={d.series} keys={['revenue']} colors={['#5b51e8']} height={220} />
        </Card>
        <Card title="Bookings Overview" right={<span className="muted" style={{ fontSize: 12 }}>Daily</span>}>
          <BarChart data={d.series} valueKey="bookings" labelKey="date" height={220} />
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
          <LineChart data={newCustomers} keys={['n']} colors={['#16a34a']} height={200} />
        </Card>
        <Card title="Top Cities by Bookings" right={<span className="muted" style={{ fontSize: 12 }}>This Month</span>}>
          <SumBars rows={TOP_CITIES} />
        </Card>
      </div>

      {/* third row: bookings-by-status, key insights, quick links */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card title="Bookings by Status">
          <Donut data={d.statusSplit.map((s: any, i: number) => ({ label: s.status.replace(/_/g, ' '), value: s.n, color: COLORS[i % COLORS.length] }))} size={170} />
        </Card>
        <Card title="Key Insights">
          <div className="minilist">
            {INSIGHTS.map((it, i) => (
              <div key={i} className="mini-row">
                <span className="mini-ico" style={{ background: it.tint + '1f', color: it.tint }}>{it.icon}</span>
                <div className="mini-bd"><strong style={{ fontWeight: 500 }}>{it.text}</strong></div>
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
                  <td className="num">{((s.cancellations / s.bookings) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={TOP_SERVICES.length} noun="services" onPage={setPage} onSize={(s) => { setPageSize(s); setPage(1) }} />
      </Card>
    </div>
  )
}
