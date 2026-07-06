import { type ReactNode, useEffect, useState } from 'react'
import { Funnel, Download, Eye, Calendar, CreditCard, Smartphone, Wallet, Landmark } from 'lucide-react'
import { fetchRefunds, issueRefund } from '../api'
import { Card, StatCard, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, Modal, Field, useToast, money, shortDate } from '../components/UI'

type Refund = {
  id: number
  ref: string
  customer: string
  total: number
  refund: number | null
  cancel_fee: number | null
  cancel_reason: string | null
  payment: string | null
  payment_status: string | null
  created: string
}

function methodIcon(method: string): ReactNode {
  switch ((method || '').toLowerCase()) {
    case 'card':
    case 'credit card':
    case 'debit card':
      return <CreditCard size={16} />
    case 'upi':
      return <Smartphone size={16} />
    case 'wallet':
      return <Wallet size={16} />
    case 'netbanking':
    case 'net banking':
      return <Landmark size={16} />
    default:
      return <CreditCard size={16} />
  }
}

const refundTone = (s: string): 'green' | 'amber' | 'red' => {
  const v = (s || '').toLowerCase()
  if (v === 'refunded') return 'green'
  if (v === 'failed') return 'red'
  return 'amber'
}

const CSV_HEAD = ['Refund ID', 'Booking ID', 'Customer', 'Amount', 'Refunded', 'Payment Method', 'Reason', 'Status', 'Date']
const csvRow = (r: Refund) => [`#${r.id}`, r.ref, r.customer, r.total, r.refund ?? '', r.payment ?? '', r.cancel_reason ?? '', r.payment_status ?? '', r.created]
function downloadCsv(name: string, rows: Refund[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [CSV_HEAD.map(esc).join(','), ...rows.map((r) => csvRow(r).map(esc).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

export default function Refunds() {
  const toast = useToast()
  const [rows, setRows] = useState<Refund[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [method, setMethod] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const [active, setActive] = useState<Refund | null>(null)
  const [issuing, setIssuing] = useState(false)

  const load = () => { setErr(''); fetchRefunds().then(setRows).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const totalRefunds = rows.reduce((a, r) => a + (r.refund || 0), 0)
  const refundedRows = rows.filter((r) => (r.payment_status || '').toLowerCase() === 'refunded')
  const successful = refundedRows.reduce((a, r) => a + (r.refund || 0), 0)
  const pendingRows = rows.filter((r) => (r.payment_status || '').toLowerCase() !== 'refunded')
  const pending = pendingRows.reduce((a, r) => a + (r.total || 0), 0)
  const failed = rows.filter((r) => (r.payment_status || '').toLowerCase() === 'failed').reduce((a, r) => a + (r.total || 0), 0)
  // Real current-month refund total (not a copy of the all-time total).
  const now = new Date()
  const thisMonth = rows.reduce((a, r) => {
    const d = new Date(r.created)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() ? a + (r.refund || 0) : a
  }, 0)

  const ql = q.trim().toLowerCase()
  const filtered = rows.filter((r) => {
    if (status !== 'all' && (r.payment_status || '').toLowerCase() !== status) return false
    if (method !== 'all' && (r.payment || '').toLowerCase() !== method) return false
    if (ql && !(r.ref.toLowerCase().includes(ql) || (r.customer || '').toLowerCase().includes(ql))) return false
    return true
  })
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const doIssue = (r: Refund) => {
    setIssuing(true)
    issueRefund(r.id)
      .then(() => { toast('Refund issued', 'ok'); setActive(null); setIssuing(false); load() })
      .catch((e: Error) => { toast(e.message, 'err'); setIssuing(false) })
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<Download size={22} />} tint="#5b51e8" label="Total Refunds" value={money(totalRefunds)} sub="all time" />
        <StatCard icon={<CreditCard size={22} />} tint="#16a34a" label="Successful Refunds" value={money(successful)} sub="all time" />
        <StatCard icon={<Calendar size={22} />} tint="#f59e0b" label="Pending Refunds" value={money(pending)} sub="all time" />
        <StatCard icon={<Smartphone size={22} />} tint="#f04438" label="Failed Refunds" value={money(failed)} sub="all time" />
        <StatCard icon={<Wallet size={22} />} tint="#2e90fa" label="Refunds This Month" value={money(thisMonth)} sub="Monthly Total" />
      </div>

      <Card title="Refunds & Cancellations">
        <div className="toolbar">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search by Refund ID, Booking ID, Customer..." />
          <select className="select flt" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="all">All Status</option>
            <option value="refunded">Completed</option>
            <option value="cancelled">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <select className="select flt" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1) }}>
            <option value="all">All Payment Methods</option>
            <option value="card">Credit Card</option>
            <option value="card">Debit Card</option>
            <option value="upi">UPI</option>
            <option value="wallet">Wallet</option>
            <option value="netbanking">Net Banking</option>
          </select>
          <select className="select flt">
            <option>All Cities</option>
            <option>Mumbai</option>
            <option>Delhi</option>
            <option>Bangalore</option>
          </select>
          <button className="btn line"><Calendar size={16} /> Select Date Range</button>
          <div className="tb-spacer" />
          <button className="btn line"><Funnel size={16} /> Filters</button>
          <button className="btn line" onClick={() => downloadCsv('refunds.csv', filtered)}><Download size={16} /> Export</button>
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>REFUND ID</th>
                <th>BOOKING ID</th>
                <th>CUSTOMER</th>
                <th className="num">AMOUNT</th>
                <th>PAYMENT METHOD</th>
                <th>REASON</th>
                <th>DATE &amp; TIME</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id}>
                  <td><strong>#{r.id}</strong></td>
                  <td className="muted">{r.ref}</td>
                  <td>
                    <div className="cell-user">
                      <Avatar name={r.customer} size={34} />
                      <div>
                        <strong>{r.customer}</strong>
                        <span className="muted" style={{ display: 'block', fontSize: 12 }}>{money(r.refund || 0)} refunded</span>
                      </div>
                    </div>
                  </td>
                  <td className="num"><strong>{money(r.total)}</strong></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: '#5b51e81a', color: '#5b51e8' }}>{methodIcon(r.payment || '')}</span>
                      <div>
                        <strong>{r.payment || '—'}</strong>
                        <span className="muted" style={{ display: 'block', fontSize: 12 }}>{r.cancel_fee != null ? `Fee ${money(r.cancel_fee)}` : '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="muted" style={{ maxWidth: 180, whiteSpace: 'normal' }}>{r.cancel_reason || '—'}</td>
                  <td>
                    <strong>{shortDate(r.created)}</strong>
                  </td>
                  <td><Badge tone={refundTone(r.payment_status || '')}>{r.payment_status || '—'}</Badge></td>
                  <td>
                    <div className="actions">
                      <button className="iconbtn" title="View" onClick={() => setActive(r)}><Eye size={16} /></button>
                      <button className="iconbtn" title="Download" onClick={() => downloadCsv(`${r.ref}.csv`, [r])}><Download size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="refunds" onPage={setPage} />
      </Card>

      {active && (
        <Modal
          title={`Refund ${active.ref}`}
          onClose={() => setActive(null)}
          footer={
            (active.payment_status || '').toLowerCase() !== 'refunded' ? (
              <>
                <button className="btn line" onClick={() => setActive(null)}>Close</button>
                <button className="btn" onClick={() => doIssue(active)} disabled={issuing}>{issuing ? 'Issuing…' : 'Issue refund'}</button>
              </>
            ) : (
              <button className="btn line" onClick={() => setActive(null)}>Close</button>
            )
          }
        >
          <Field label="Booking ID"><input value={active.ref} readOnly /></Field>
          <Field label="Customer"><input value={active.customer} readOnly /></Field>
          <Field label="Booking Amount"><input value={money(active.total)} readOnly /></Field>
          <Field label="Refunded"><input value={money(active.refund || 0)} readOnly /></Field>
          <Field label="Cancellation Fee"><input value={active.cancel_fee != null ? money(active.cancel_fee) : '—'} readOnly /></Field>
          <Field label="Payment Method"><input value={active.payment || '—'} readOnly /></Field>
          <Field label="Reason"><input value={active.cancel_reason || '—'} readOnly /></Field>
          <Field label="Status"><input value={active.payment_status || '—'} readOnly /></Field>
          <Field label="Date"><input value={shortDate(active.created)} readOnly /></Field>
        </Modal>
      )}
    </div>
  )
}
