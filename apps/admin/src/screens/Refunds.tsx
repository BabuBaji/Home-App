import { type ReactNode, useEffect, useState } from 'react'
import { Download, Eye, Calendar, CreditCard, Smartphone, Wallet, Landmark } from 'lucide-react'
import { fetchRefunds, issueRefund } from '../api'
import { Card, StatCard, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, Modal, Field, useToast, money, shortDate, FilterTabs } from '../components/UI'

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

// Anything not paid back and not failed is still waiting (status 'cancelled' = refund pending).
type Queue = 'pending' | 'failed' | 'refunded' | 'all'
const queueOf = (s: string | null): Exclude<Queue, 'all'> => {
  const v = (s || '').toLowerCase()
  return v === 'refunded' ? 'refunded' : v === 'failed' ? 'failed' : 'pending'
}
const statusLabel = (s: string | null) => ({ refunded: 'Refunded', failed: 'Failed', pending: 'Pending' })[queueOf(s)]

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
  const [queue, setQueue] = useState<Queue>('pending')
  const [method, setMethod] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [active, setActive] = useState<Refund | null>(null)
  const [issuing, setIssuing] = useState(false)

  const load = () => { setErr(''); fetchRefunds().then(setRows).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const totalRefunds = rows.reduce((a, r) => a + (r.refund || 0), 0)
  const refundedRows = rows.filter((r) => (r.payment_status || '').toLowerCase() === 'refunded')
  const successful = refundedRows.reduce((a, r) => a + (r.refund || 0), 0)
  const pendingRows = rows.filter((r) => queueOf(r.payment_status) === 'pending')
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
    if (queue !== 'all' && queueOf(r.payment_status) !== queue) return false
    if (method !== 'all' && (r.payment || '').toLowerCase() !== method) return false
    if (ql && ![r.ref, r.customer, `#${r.id}`, r.cancel_reason].some((v) => (v || '').toLowerCase().includes(ql))) return false
    return true
  })
  const methods = Array.from(new Set(rows.map((r) => (r.payment || '').toLowerCase()).filter(Boolean))).sort()
  const count = (k: Queue) => (k === 'all' ? rows.length : rows.filter((r) => queueOf(r.payment_status) === k).length)
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const doIssue = (r: Refund) => {
    setIssuing(true)
    issueRefund(r.id)
      .then((res) => { toast(res.pending ? 'Sent for approval — a second admin must sign off' : 'Refund issued', 'ok'); setActive(null); setIssuing(false); load() })
      .catch((e: Error) => { toast(e.message, 'err'); setIssuing(false) })
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        {/* only the amounts someone has to act on, plus this month for context */}
        <StatCard icon={<Calendar size={22} />} tint="#f59e0b" label="Pending refunds" value={money(pending)} sub="waiting to be paid back" />
        <StatCard icon={<Smartphone size={22} />} tint="#f04438" label="Failed refunds" value={money(failed)} sub="need a retry or manual payout" />
        <StatCard icon={<Wallet size={22} />} tint="#2e90fa" label="Refunded this month" value={money(thisMonth)} sub={`${money(totalRefunds)} all time`} />
      </div>

      <Card>
        <div className="card-head lg">
          <h3>Refunds<span className="count">{rows.length.toLocaleString('en-IN')}</span></h3>
          <div className="head-actions">
            <button className="btn line" onClick={() => downloadCsv('refunds.csv', filtered)}><Download size={15} /> Export</button>
          </div>
        </div>

        <FilterTabs value={queue} onChange={(k) => { setQueue(k); setPage(1) }} tabs={[
          { key: 'pending', label: 'Pending', count: count('pending'), alert: true },
          { key: 'failed', label: 'Failed', count: count('failed'), alert: true },
          { key: 'refunded', label: 'Refunded', count: count('refunded') },
          { key: 'all', label: 'All', count: count('all') },
        ]} />

        <div className="toolbar">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search booking ID, customer or reason" />
          {methods.length > 1 && (
            <select className="select flt" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1) }}>
              <option value="all">All payment methods</option>
              {methods.map((m) => <option key={m} value={m}>{m.toUpperCase() === 'UPI' ? 'UPI' : m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
          )}
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Customer</th>
                <th className="num">Paid</th>
                <th className="num">Refund</th>
                <th>Method</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Date</th>
                <th className="sticky-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap"><strong>{r.ref}</strong><small className="muted" style={{ display: 'block', fontSize: 12 }}>Refund #{r.id}</small></td>
                  <td className="nowrap">{r.customer}</td>
                  <td className="num">{money(r.total)}</td>
                  <td className="num"><strong>{money(r.refund || 0)}</strong>{r.cancel_fee ? <small className="muted" style={{ display: 'block', fontSize: 12 }}>fee {money(r.cancel_fee)}</small> : null}</td>
                  <td className="nowrap"><span className="row" style={{ gap: 6, alignItems: 'center', color: 'var(--ink-2)' }}><span style={{ color: 'var(--muted)', display: 'inline-flex' }}>{methodIcon(r.payment || '')}</span>{r.payment ? (r.payment.toLowerCase() === 'upi' ? 'UPI' : r.payment.charAt(0).toUpperCase() + r.payment.slice(1)) : '—'}</span></td>
                  <td className="muted" style={{ maxWidth: 240, whiteSpace: 'normal' }}>{r.cancel_reason || '—'}</td>
                  <td><Badge tone={refundTone(r.payment_status || '')}>{statusLabel(r.payment_status)}</Badge></td>
                  <td className="muted nowrap">{shortDate(r.created)}</td>
                  <td className="sticky-end">
                    <div className="actions">
                      {queueOf(r.payment_status) !== 'refunded'
                        ? <button className="btn line" style={{ height: 30, fontSize: 12.5 }} onClick={() => setActive(r)}>Review</button>
                        : <button className="iconbtn" title="View" onClick={() => setActive(r)}><Eye size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!pageRows.length && (
                <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: '36px 0' }}>
                  {queue === 'pending' && !ql ? 'No refunds waiting — nothing to pay back.' : queue === 'failed' && !ql ? 'No failed refunds.' : 'No refunds match these filters.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="refunds" onPage={setPage} onSize={(n) => { setPageSize(n); setPage(1) }} />
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
          <Field label="Status"><input value={statusLabel(active.payment_status)} readOnly /></Field>
          <Field label="Date"><input value={shortDate(active.created)} readOnly /></Field>
        </Modal>
      )}
    </div>
  )
}
