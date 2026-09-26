import { useEffect, useState } from 'react'
import { Download, Eye, IndianRupee, Clock, Undo2, Gift } from 'lucide-react'
import { fetchPayments, runShaktiSettlement } from '../api'
import { Card, StatCard, Badge, SearchBox, Pagination, Loading, ErrorState, Modal, Field, money, shortDate, useToast, FilterTabs } from '../components/UI'

type Txn = { id: number; type: string; status?: string; title: string; amount: number; created: string; ref?: string; customer: string; paymentId?: string | null; refunded?: number; method?: string | null }
type Summary = { revenue: number; successful: number; pending: number; refunded: number; failed?: number }
type PaymentsData = { summary: Summary; transactions: Txn[] }

type Queue = 'paid' | 'pending' | 'failed' | 'refunded' | 'all'
const queueOf = (t: Txn): Exclude<Queue, 'all'> => {
  const s = (t.status || '').toUpperCase()
  if (s === 'PAID' || s === 'VERIFIED' || s === 'CLAIMED') return 'paid'
  if (s === 'FAILED') return 'failed'
  if (s.includes('REFUND')) return 'refunded'
  return 'pending'
}
const LABEL_OF = { paid: 'Paid', pending: 'Pending', failed: 'Failed', refunded: 'Refunded' } as const
const TONE_OF = { paid: 'green', pending: 'amber', failed: 'red', refunded: 'gray' } as const
const methodLabel = (m?: string | null) => (!m ? '—' : m.toLowerCase() === 'upi' ? 'UPI' : m.charAt(0).toUpperCase() + m.slice(1))

export default function Payments() {
  const toast = useToast()
  const [d, setD] = useState<PaymentsData | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [queue, setQueue] = useState<Queue>('all')
  const [method, setMethod] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [active, setActive] = useState<Txn | null>(null)
  const [settleOpen, setSettleOpen] = useState(false)
  const [settling, setSettling] = useState(false)

  const load = () => { setErr(''); fetchPayments().then(setD).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  useEffect(() => setPage(1), [queue, method, q])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  const runSettlement = () => {
    setSettling(true)
    runShaktiSettlement()
      .then((r) => { if (r.ok) { toast(`Settled ${r.month} — ${r.qualified} expert(s) credited`); setSettleOpen(false) } else toast(`Settlement failed: ${r.error || 'error'}`, 'err') })
      .catch((e: Error) => toast(e.message, 'err'))
      .finally(() => setSettling(false))
  }

  const sum = d.summary || { revenue: 0, successful: 0, pending: 0, refunded: 0 }
  const txns = d.transactions || []
  const count = (k: Queue) => (k === 'all' ? txns.length : txns.filter((t) => queueOf(t) === k).length)
  const methods = Array.from(new Set(txns.map((t) => (t.method || '').toLowerCase()).filter(Boolean))).sort()

  const ql = q.trim().toLowerCase()
  const filtered = txns
    .filter((t) => queue === 'all' || queueOf(t) === queue)
    .filter((t) => method === 'all' || (t.method || '').toLowerCase() === method)
    .filter((t) => !ql || [`txn${t.id}`, t.ref, t.customer, t.paymentId].some((v) => (v || '').toLowerCase().includes(ql)))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const exportCsv = () => {
    const head = ['Transaction ID', 'Gateway payment ID', 'Booking Ref', 'Customer', 'Method', 'Amount', 'Refunded', 'Status', 'Date']
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [head.join(',')]
    filtered.forEach((t) => lines.push([`TXN${t.id}`, t.paymentId || '', t.ref || '', t.customer || '', methodLabel(t.method), t.amount, t.refunded || 0, LABEL_OF[queueOf(t)], t.created || ''].map(esc).join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'transactions.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<IndianRupee size={22} />} tint="#5b51e8" label="Revenue collected" value={money(sum.revenue)} sub={`${sum.successful.toLocaleString('en-IN')} paid payments`} />
        <StatCard icon={<Clock size={22} />} tint="#f59e0b" label="Pending payments" value={sum.pending.toLocaleString('en-IN')} sub="awaiting payment" />
        <StatCard icon={<Undo2 size={22} />} tint="#2e90fa" label="Refunded to customers" value={money(sum.refunded)} sub="to card / UPI, all time" />
      </div>

      <Card>
        <div className="card-head lg">
          <h3>Transactions<span className="count">{txns.length.toLocaleString('en-IN')}</span></h3>
          <div className="head-actions">
            <button className="btn line" onClick={exportCsv}><Download size={15} /> Export</button>
            <button className="btn line" onClick={() => setSettleOpen(true)}><Gift size={15} /> Run bonus settlement</button>
          </div>
        </div>

        <FilterTabs value={queue} onChange={setQueue} tabs={[
          { key: 'all', label: 'All', count: count('all') },
          { key: 'paid', label: 'Paid', count: count('paid') },
          { key: 'pending', label: 'Pending', count: count('pending') },
          { key: 'failed', label: 'Failed', count: count('failed'), alert: true },
          { key: 'refunded', label: 'Refunded', count: count('refunded') },
        ]} />

        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search transaction, payment ID, booking or customer" />
          {methods.length > 1 && (
            <select className="select flt" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="all">All methods</option>
              {methods.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
            </select>
          )}
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Transaction</th><th>Customer</th><th>Booking</th><th>Method</th>
                <th className="num">Amount</th><th>Status</th><th>Date</th><th className="sticky-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((t) => {
                const k = queueOf(t)
                return (
                  <tr key={t.id}>
                    <td className="nowrap">
                      <button className="cell-link" onClick={() => setActive(t)}>
                        <strong>#TXN{t.id}</strong>
                        <small className="muted">{t.paymentId || (k === 'failed' ? t.title : 'no gateway ID yet')}</small>
                      </button>
                    </td>
                    <td className="nowrap">{t.customer}</td>
                    <td className="muted nowrap">{t.ref || '—'}</td>
                    <td className="nowrap">{methodLabel(t.method)}</td>
                    <td className="num"><strong>{money(t.amount)}</strong>{(t.refunded || 0) > 0 && k !== 'refunded' ? <small className="muted" style={{ display: 'block', fontSize: 12 }}>{money(t.refunded || 0)} refunded</small> : null}</td>
                    <td><Badge tone={TONE_OF[k]}>{LABEL_OF[k]}</Badge></td>
                    <td className="muted nowrap">{shortDate(t.created)}</td>
                    <td className="sticky-end"><button className="iconbtn" style={{ width: 30, height: 30 }} title="View" onClick={() => setActive(t)}><Eye size={16} /></button></td>
                  </tr>
                )
              })}
              {!pageRows.length && (
                <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: '36px 0' }}>{txns.length ? 'No transactions match these filters.' : 'No payments yet.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="transactions" onPage={setPage} onSize={(n) => { setPageSize(n); setPage(1) }} />
      </Card>

      {settleOpen && (
        <Modal title="Run Sitara bonus settlement" onClose={() => setSettleOpen(false)}
          footer={<>
            <button className="btn line" onClick={() => setSettleOpen(false)}>Cancel</button>
            <button className="btn" disabled={settling} onClick={runSettlement}>{settling ? 'Running…' : 'Run settlement'}</button>
          </>}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
            Credits each qualifying expert's monthly tier bonus (working days, plus Sundays for Gold) to their wallet.
            It runs automatically at the start of each month and is safe to run again — experts already paid for the month are skipped.
          </p>
        </Modal>
      )}

      {active && (
        <Modal title="Transaction Details" onClose={() => setActive(null)} footer={<button className="btn line" onClick={() => setActive(null)}>Close</button>}>
          <Field label="Transaction ID"><input className="input" value={`#TXN${active.id}`} readOnly /></Field>
          <Field label="Status"><div><Badge tone={TONE_OF[queueOf(active)]}>{LABEL_OF[queueOf(active)]}</Badge></div></Field>
          <Field label="Method"><input className="input" value={methodLabel(active.method)} readOnly /></Field>
          <Field label="Title"><input className="input" value={active.title} readOnly /></Field>
          <Field label="Amount"><input className="input" value={money(active.amount)} readOnly /></Field>
          <Field label="Gateway Payment ID"><input className="input" value={active.paymentId || '—'} readOnly /></Field>
          {(active.refunded ?? 0) > 0 && <Field label="Refunded to card/UPI"><input className="input" value={money(active.refunded || 0)} readOnly /></Field>}
          <Field label="Customer"><input className="input" value={active.customer || '—'} readOnly /></Field>
          <Field label="Booking Ref"><input className="input" value={active.ref || '—'} readOnly /></Field>
          <Field label="Created"><input className="input" value={shortDate(active.created)} readOnly /></Field>
        </Modal>
      )}
    </div>
  )
}
