import { useEffect, useState } from 'react'
import { IndianRupee, CheckCircle2, Clock, RotateCcw } from 'lucide-react'
import { fetchPayments } from '../api'
import { Card, StatCard, Loading, ErrorState, Empty, Badge, Avatar, money, shortDate } from '../components/UI'
import { Donut } from '../components/Charts'

const COLORS: Record<string, string> = { upi: '#5b51e8', wallet: '#16a34a', cash: '#f5a524', card: '#2e90fa', phonepe: '#ff7a59', netbanking: '#f04438' }

export default function Payments() {
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState('')
  const load = () => { setErr(''); fetchPayments().then(setData).catch((e) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!data) return <Loading />
  const s = data.summary

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="stat-row">
        <StatCard icon={<IndianRupee size={22} />} tint="#5b51e8" label="Total Revenue" value={money(s.revenue)} />
        <StatCard icon={<CheckCircle2 size={22} />} tint="#16a34a" label="Successful" value={s.successful} />
        <StatCard icon={<Clock size={22} />} tint="#f5a524" label="Pending" value={s.pending} />
        <StatCard icon={<RotateCcw size={22} />} tint="#f04438" label="Refunded" value={money(s.refunded)} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <Card title="Transactions">
          {data.transactions.length === 0 ? <Empty msg="No transactions yet." /> : (
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr><th>Customer</th><th>Description</th><th>Type</th><th>Amount</th><th>Ref</th><th>Date</th></tr></thead>
                <tbody>
                  {data.transactions.map((t: any) => (
                    <tr key={t.id}>
                      <td><div className="cell-user"><Avatar name={t.customer} size={30} /><strong>{t.customer}</strong></div></td>
                      <td>{t.title}</td>
                      <td><Badge tone={t.type === 'credit' ? 'green' : 'gray'}>{t.type}</Badge></td>
                      <td className="num" style={{ color: t.type === 'credit' ? 'var(--green)' : 'var(--ink)', fontWeight: 600 }}>{t.type === 'credit' ? '+' : '−'}{money(t.amount)}</td>
                      <td className="muted">{t.ref || '—'}</td>
                      <td className="muted">{shortDate(t.created)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Payment Methods">
          <Donut data={data.methods.map((m: any) => ({ label: m.method || 'other', value: m.amount, color: COLORS[m.method] || '#8085a3' }))} />
        </Card>
      </div>
    </div>
  )
}
