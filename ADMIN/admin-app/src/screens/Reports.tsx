import { useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { fetchAnalytics, fetchAudit } from '../api'
import { Card, Loading, ErrorState, Empty, money, useToast } from '../components/UI'
import { BarChart } from '../components/Charts'

export default function Reports() {
  const toast = useToast()
  const [d, setD] = useState<any>(null)
  const [audit, setAudit] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  const load = () => { setErr(''); fetchAnalytics().then(setD).catch((e) => setErr(e.message)); fetchAudit().then(setAudit).catch(() => {}) }
  useEffect(load, [])
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

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="stat-row">
        <div className="stat"><div className="stat-ico" style={{ background: '#efeefe', color: 'var(--violet)' }}><FileText size={22} /></div><div className="stat-body"><span className="stat-label">Revenue (30d)</span><strong className="stat-value">{money(totalRev)}</strong></div></div>
        <div className="stat"><div className="stat-ico" style={{ background: '#e7f8ef', color: 'var(--green)' }}><FileText size={22} /></div><div className="stat-body"><span className="stat-label">Bookings (30d)</span><strong className="stat-value">{totalBk}</strong></div></div>
        <div className="stat" style={{ justifyContent: 'center' }}><button className="btn" onClick={exportCsv}><Download size={16} /> Export CSV</button></div>
      </div>
      <Card title="Revenue — last 30 days"><BarChart data={d.series} valueKey="revenue" labelKey="date" height={230} /></Card>
      <Card title="Admin Activity Log">
        {!audit ? <Loading /> : audit.length === 0 ? <Empty msg="No activity yet." /> : (
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Admin</th><th>Action</th><th>Target</th><th>Time</th></tr></thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}><td>{a.admin}</td><td><span className="badge violet">{a.action}</span></td><td className="muted">{a.target || '—'}</td><td className="muted">{new Date(a.created).toLocaleString('en-IN')}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
