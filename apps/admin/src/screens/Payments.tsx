import { useEffect, useState } from 'react'
import { Funnel, Download, MoreVertical, CreditCard, ArrowUpRight } from 'lucide-react'
import { fetchPayments } from '../api'
import { Card, StatCard, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, Modal, Field, money, shortDate } from '../components/UI'
import { Donut } from '../components/Charts'

type Txn = { id: number; type: string; title: string; amount: number; created: string; ref?: string; customer: string }
type Method = { method: string; n: number; amount: number }
type Summary = { revenue: number; successful: number; pending: number; refunded: number }
type PaymentsData = { summary: Summary; methods: Method[]; transactions: Txn[] }

const METHOD_COLORS = ['#16a34a', '#2e90fa', '#f59e0b', '#7c6df7', '#9aa0b4']
const txnTone = (t: string): string => {
  const s = (t || '').toLowerCase()
  if (s === 'credit' || s === 'refund') return 'blue'
  if (s === 'debit') return 'green'
  return 'gray'
}

export default function Payments() {
  const [d, setD] = useState<PaymentsData | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const [active, setActive] = useState<Txn | null>(null)

  const load = () => { setErr(''); fetchPayments().then(setD).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  const sum = d.summary || { revenue: 0, successful: 0, pending: 0, refunded: 0 }
  const methodTotal = (d.methods || []).reduce((a, m) => a + m.amount, 0) || 1
  const methods = (d.methods || []).map((m, i) => ({
    label: m.method ? m.method.charAt(0).toUpperCase() + m.method.slice(1) : 'Other',
    value: m.amount,
    color: METHOD_COLORS[i % METHOD_COLORS.length],
    pct: Math.round((m.amount / methodTotal) * 100) + '%',
    amount: money(m.amount),
  }))

  const types = Array.from(new Set((d.transactions || []).map((t) => t.type).filter(Boolean)))
  const statuses = Array.from(new Set((d.transactions || []).map((t) => (t as any).status).filter(Boolean)))

  const ql = q.trim().toLowerCase()
  const filtered = (d.transactions || [])
    .filter((t) => type === 'all' || t.type === type)
    .filter((t) => status === 'all' || (t as any).status === status)
    .filter((t) =>
      !ql || String(t.id).includes(ql) || (t.ref || '').toLowerCase().includes(ql) || (t.customer || '').toLowerCase().includes(ql) || (t.title || '').toLowerCase().includes(ql))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const exportCsv = () => {
    const head = ['Transaction ID', 'Booking Ref', 'Customer', 'Title', 'Amount', 'Type', 'Date']
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [head.join(',')]
    filtered.forEach((t) => lines.push([
      `TXN${t.id}`, t.ref || '', t.customer || '', t.title || '', t.amount, t.type, t.created || '',
    ].map(esc).join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'transactions.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<CreditCard size={22} />} tint="#5b51e8" label="Total Revenue" value={money(sum.revenue)} sub="paid bookings" />
        <StatCard icon={<CreditCard size={22} />} tint="#16a34a" label="Successful Payments" value={sum.successful.toLocaleString('en-IN')} sub="paid bookings" />
        <StatCard icon={<CreditCard size={22} />} tint="#f59e0b" label="Pending Payments" value={sum.pending.toLocaleString('en-IN')} sub="awaiting payment" />
        <StatCard icon={<CreditCard size={22} />} tint="#f04438" label="Transactions" value={(d.transactions || []).length.toLocaleString('en-IN')} sub="recent" />
        <StatCard icon={<CreditCard size={22} />} tint="#2e90fa" label="Refunds Issued" value={money(sum.refunded)} sub="all time" />
      </div>

      <div className="cols">
        <Card title="Transactions">
          <div className="toolbar">
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search by Transaction ID, Customer or Booking ID..." />
            <select className="select flt" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
              <option value="all">All Status</option>
              {statuses.map((s) => <option key={s} value={s}>{String(s).replace(/_/g, ' ')}</option>)}
            </select>
            <select className="select flt" value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}>
              <option value="all">All Types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="tb-spacer" />
            <button className="btn line"><Funnel size={16} /> Filters</button>
            <button className="btn line" onClick={exportCsv}><Download size={16} /> Export</button>
          </div>

          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>TRANSACTION ID</th>
                  <th>BOOKING REF</th>
                  <th>CUSTOMER</th>
                  <th className="num">AMOUNT</th>
                  <th>TYPE</th>
                  <th>DATE</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => (
                  <tr key={t.id}>
                    <td className="muted">#TXN{t.id}</td>
                    <td className="muted">{t.ref || '—'}</td>
                    <td>
                      <div className="cell-user">
                        <Avatar name={t.customer} size={30} />
                        <div>
                          <strong>{t.customer}</strong>
                          <small className="muted" style={{ display: 'block' }}>{t.title}</small>
                        </div>
                      </div>
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>{money(t.amount)}</td>
                    <td><Badge tone={txnTone(t.type)}>{t.type}</Badge></td>
                    <td><strong>{shortDate(t.created)}</strong></td>
                    <td><button className="iconbtn" onClick={() => setActive(t)}><MoreVertical size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="transactions" onPage={setPage} />
        </Card>

        <div className="col-rail">
          <Card title="Payment Summary">
            <div className="sumrow"><span className="lbl">Total Revenue</span><span className="val">{money(sum.revenue)}</span></div>
            <div className="sumrow"><span className="lbl">Successful</span><span className="val">{sum.successful.toLocaleString('en-IN')}</span></div>
            <div className="sumrow"><span className="lbl">Pending</span><span className="val">{sum.pending.toLocaleString('en-IN')}</span></div>
            <div className="sumrow"><span className="lbl">Refunded</span><span className="val">{money(sum.refunded)}</span></div>
          </Card>

          <Card title="Payment Methods">
            {methods.length ? (
              <>
                <Donut
                  size={150}
                  data={methods.map((m) => ({ label: m.label, value: m.value, color: m.color }))}
                />
                <div className="minilist" style={{ marginTop: 8 }}>
                  {methods.map((m) => (
                    <div key={m.label} className="mini-row" style={{ alignItems: 'center' }}>
                      <span className="bdot" style={{ background: m.color }} />
                      <div className="mini-bd" style={{ flex: 1 }}><strong>{m.label}</strong></div>
                      <span className="muted">{m.pct} ({m.amount})</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="muted">No payment data yet.</p>}
          </Card>

          <Card title="Recent Activity">
            <div className="minilist">
              {(d.transactions || []).slice(0, 5).map((t) => (
                <div key={t.id} className="mini-row">
                  <span className="mini-ico"><ArrowUpRight size={16} /></span>
                  <div className="mini-bd">
                    <strong>{t.title}</strong>
                    <small>{shortDate(t.created)}</small>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <strong>{money(t.amount)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {active && (
        <Modal title="Transaction Details" onClose={() => setActive(null)} footer={<button className="btn line" onClick={() => setActive(null)}>Close</button>}>
          <Field label="Transaction ID"><input className="input" value={`#TXN${active.id}`} readOnly /></Field>
          <Field label="Type"><div><Badge tone={txnTone(active.type)}>{active.type}</Badge></div></Field>
          <Field label="Title"><input className="input" value={active.title} readOnly /></Field>
          <Field label="Amount"><input className="input" value={money(active.amount)} readOnly /></Field>
          <Field label="Customer"><input className="input" value={active.customer || '—'} readOnly /></Field>
          <Field label="Booking Ref"><input className="input" value={active.ref || '—'} readOnly /></Field>
          <Field label="Created"><input className="input" value={shortDate(active.created)} readOnly /></Field>
        </Modal>
      )}
    </div>
  )
}
