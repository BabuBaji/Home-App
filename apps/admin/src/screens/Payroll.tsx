import { useEffect, useState } from 'react'
import { Wallet, Users, CheckCircle2, Play, ChevronLeft, AlertTriangle } from 'lucide-react'
import { fetchPayrollRuns, fetchPayrollRun, buildPayroll, approvePayroll } from '../api'
import type { PayrollRun } from '../types'
import { StatCard, Card, Badge, Loading, ErrorState, useToast, useConfirm, shortDate } from '../components/UI'

/* Payroll — the monthly run that pays fixed and hybrid salaries.
 *
 * A run is a DRAFT the admin reviews line by line, and only APPROVAL moves money. This credits real
 * rupees to real people every month; a wrong rate is far cheaper to catch in a draft than to claw
 * back after it's paid. Each line credits once, keyed on the run, so a re-approve or a redelivered
 * event cannot pay anyone twice.
 */

const rupees = (n: number) => '₹' + (n || 0).toLocaleString('en-IN')
const prevMonth = () => {
  // The month just ended is the usual one to pay. Computed on a copy so we don't mutate now().
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Payroll() {
  const toast = useToast()
  const confirm = useConfirm()
  const [runs, setRuns] = useState<PayrollRun[] | null>(null)
  const [onMonthly, setOnMonthly] = useState(0)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<PayrollRun | null>(null)
  const [month, setMonth] = useState(prevMonth())
  const [busy, setBusy] = useState(false)

  const load = () => {
    setErr('')
    fetchPayrollRuns().then((r) => { setRuns(r.runs); setOnMonthly(r.workersOnMonthlySalary) }).catch((e: Error) => setErr(e.message))
  }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!runs) return <Loading />

  const build = async () => {
    setBusy(true)
    try { const r = await buildPayroll(month); setOpen(r.run); load(); toast(`Draft built for ${month}`) }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const view = async (id: number) => {
    try { const r = await fetchPayrollRun(id); setOpen(r.run) } catch (e) { toast((e as Error).message, 'err') }
  }

  const approve = async (run: PayrollRun) => {
    const net = run.totals?.net || 0
    if (!(await confirm({
      title: `Approve ${run.month} payroll?`,
      message: `This credits ${rupees(net)} to ${run.totals?.workers || 0} worker(s) now. It cannot be undone.`,
      confirmLabel: 'Approve & pay',
    }))) return
    setBusy(true)
    try { const r = await approvePayroll(run.id); setOpen(r.run); load(); toast(`${run.month} approved — ${rupees(net)} paid`) }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  // Detail view of one run.
  if (open) {
    const t = open.totals || { workers: 0, gross: 0, deductions: 0, net: 0 }
    const notes = (open.lines || []).filter((l) => l.note)
    return (
      <>
        <button className="btn line" style={{ marginBottom: 14 }} onClick={() => { setOpen(null); load() }}><ChevronLeft size={15} /> All runs</button>
        <Card>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <strong style={{ fontSize: 16 }}>Payroll — {open.month}</strong>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {open.status === 'approved'
                  ? `Approved by ${open.approvedBy} on ${shortDate(open.approvedAt)}`
                  : `Draft by ${open.createdBy}. Nothing is paid until you approve it.`}
              </div>
            </div>
            {open.status === 'approved'
              ? <Badge tone="green"><CheckCircle2 size={12} style={{ verticalAlign: -1 }} /> Approved & paid</Badge>
              : <button className="btn" disabled={busy || !(open.lines || []).length} onClick={() => approve(open)}><Play size={15} /> Approve &amp; pay</button>}
          </div>

          <div className="stat-row" style={{ marginBottom: 14 }}>
            <StatCard icon={<Users size={18} />} tint="#eef0ff" label="Workers" value={t.workers} />
            <StatCard icon={<Wallet size={18} />} tint="#e7f7ee" label="Gross" value={rupees(t.gross)} />
            <StatCard icon={<Wallet size={18} />} tint="#fdecec" label="Deductions" value={rupees(t.deductions)} />
            <StatCard icon={<Wallet size={18} />} tint="#fff6e6" label="Net payable" value={rupees(t.net)} />
          </div>

          {notes.length > 0 && (
            <div style={{ display: 'flex', gap: 8, fontSize: 12.5, background: '#fffbeb', color: '#92400e', padding: 10, borderRadius: 10, marginBottom: 12 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{notes.map((l) => <div key={l.workerId}><strong>{l.name}:</strong> {l.note}</div>)}</div>
            </div>
          )}

          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Worker</th><th>Basic</th><th>Allowance</th><th>Incentives</th><th>Deductions</th><th style={{ textAlign: 'right' }}>Net</th></tr></thead>
              <tbody>
                {(open.lines || []).map((l) => (
                  <tr key={l.workerId}>
                    <td><strong>{l.name}</strong></td>
                    <td>{rupees(l.basic)}</td>
                    <td>{rupees(l.allowance)}</td>
                    <td>{l.incentives.length ? l.incentives.map((i) => <div key={i.label} style={{ fontSize: 12, color: '#15803d' }}>+{rupees(i.amount)} {i.label}</div>) : <span className="muted">—</span>}</td>
                    <td>{l.deductions.length ? l.deductions.map((x) => <div key={x.label} style={{ fontSize: 12, color: '#b91c1c' }}>−{rupees(x.amount)} {x.label}</div>) : <span className="muted">—</span>}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{rupees(l.net)}</td>
                  </tr>
                ))}
                {!(open.lines || []).length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>No workers on a monthly salary this month.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <div className="stat-row">
        <StatCard icon={<Users size={18} />} tint="#eef0ff" label="On a monthly salary" value={onMonthly} sub="Fixed & hybrid workers" />
        <StatCard icon={<Wallet size={18} />} tint="#e7f7ee" label="Runs" value={runs.length} sub={`${runs.filter((r) => r.status === 'approved').length} approved`} />
      </div>

      <Card title="Run payroll" right={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line,#e5e7eb)' }} />
          <button className="btn" disabled={busy} onClick={build}>Build draft</button>
        </div>
      }>
        {onMonthly === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: '8px 0' }}>
            No workers are on a fixed or hybrid salary plan yet, so there's nothing for payroll to pay.
            Per-job workers are paid by the wallet as they complete jobs.
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12.5 }}>Pick a month and build a draft. You review every line before anything is paid.</div>
        )}
      </Card>

      {runs.length > 0 && (
        <Card title="Recent runs">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Month</th><th>Workers</th><th>Net</th><th>Status</th><th>By</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.month}</strong></td>
                    <td>{r.workers || 0}</td>
                    <td>{rupees(r.net || 0)}</td>
                    <td><Badge tone={r.status === 'approved' ? 'green' : 'amber'}>{r.status === 'approved' ? 'Approved' : 'Draft'}</Badge></td>
                    <td className="muted" style={{ fontSize: 12 }}>{r.status === 'approved' ? r.approvedBy : r.createdBy}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn line" style={{ padding: '3px 12px', fontSize: 12 }} onClick={() => view(r.id)}>{r.status === 'approved' ? 'View' : 'Review'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}
