import { useEffect, useState } from 'react'
import {
  Wallet, Clock, Lock, Coins, Plus, Minus, Download, FileText, Check, X, RotateCcw, Landmark,
} from 'lucide-react'
import {
  fetchWorkers, fetchWorkerWallet, walletBonus, walletPenalty, walletHold, walletReleaseHold,
  walletReleasePending, approveWithdrawal, rejectWithdrawal, approveAdvance, rejectAdvance,
  generateWorkerPayslip, downloadWalletReport, approveWorkerBank, rejectWorkerBank,
} from '../api'
import type { Worker } from '../types'
import { Card, StatCard, Loading, ErrorState, Empty, Badge, Avatar, SearchBox, Modal, Field, money, useToast } from '../components/UI'
import { useStore, can } from '../store'

const INCOME = ['Tips', 'Attendance Bonus', 'Peak Hour Bonus', 'Festival Bonus', 'Performance Bonus', 'Referral Bonus', 'Customer Rating Bonus']
const PENALTIES = ['Penalty', 'Hostel Rent', 'Meal Charges', 'Uniform Charges', 'Equipment Charges', 'Late Arrival Deduction', 'Damage Deduction', 'Other Deductions']

const statusTone = (s: string): string => {
  if (['Paid', 'Success', 'Cleared'].includes(s)) return 'green'
  if (['Rejected', 'Failed', 'Hold'].includes(s)) return 'red'
  return 'amber'
}
const bankTone = (s?: string): string =>
  s === 'Approved' ? 'green' : s === 'Rejected' ? 'red' : s === 'Pending Verification' ? 'amber' : 'gray'

export default function WorkerWallet() {
  const toast = useToast()
  const { admin } = useStore()
  const isManager = can(admin?.role, 'manager')
  const [q, setQ] = useState('')
  const [workers, setWorkers] = useState<Worker[]>([])
  const [sel, setSel] = useState<Worker | null>(null)
  const [w, setW] = useState<any>(null)
  const [err, setErr] = useState('')
  const [dialog, setDialog] = useState<null | { kind: string }>(null)

  useEffect(() => {
    const id = setTimeout(() => { fetchWorkers(q).then((d) => setWorkers(d.workers)).catch((e) => setErr(e.message)) }, 250)
    return () => clearTimeout(id)
  }, [q])

  const loadWallet = (worker: Worker) => {
    setSel(worker); setW(null); setErr('')
    fetchWorkerWallet(worker.id).then(setW).catch((e) => setErr(e.message))
  }
  const reload = () => sel && fetchWorkerWallet(sel.id).then(setW).catch((e) => setErr(e.message))

  async function run(fn: () => Promise<any>, msg: string) {
    try { const res = await fn(); if (res?.summary) setW(res); else reload(); toast(msg) }
    catch (e: any) { toast(e.message, 'err') }
  }

  if (err && !sel) return <ErrorState msg={err} onRetry={() => location.reload()} />

  const s = w?.summary
  const pendingWd = (w?.withdrawals || []).filter((x: any) => ['Requested', 'Processing', 'Approved'].includes(x.status))
  const pendingAdv = (w?.advances || []).filter((x: any) => x.status === 'Requested')

  return (
    <div className="grid" style={{ gap: 18 }}>
      <Card>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search a worker to open their wallet…" />
          <div className="spacer" />
          <button className="btn ghost" onClick={() => downloadWalletReport().catch((e) => toast(e.message, 'err'))}><Download size={16} /> Export CSV</button>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Worker</th><th>City</th><th>Earnings</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {workers.map((x) => (
                <tr key={x.id} className={sel?.id === x.id ? 'active-row' : ''}>
                  <td><div className="cell-user"><Avatar name={x.name} size={32} /><div><strong>{x.name}</strong><small>{x.phone}</small></div></div></td>
                  <td>{x.city}</td>
                  <td className="num">{money(x.earnings)}</td>
                  <td><Badge tone={x.status === 'active' ? 'green' : undefined}>{x.status}</Badge></td>
                  <td><span className="link" onClick={() => loadWallet(x)}>Open Wallet →</span></td>
                </tr>
              ))}
              {workers.length === 0 && <tr><td colSpan={5}><Empty msg="No workers found." /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {sel && (
        <Card title={`${sel.name} — Wallet`} right={<small className="muted">Next payout: {s?.nextPayout || '—'}</small>}>
          {!w ? <Loading /> : (
            <div className="grid" style={{ gap: 16 }}>
              <div className="stat-row">
                <StatCard icon={<Wallet size={22} />} tint="#16a34a" label="Available" value={money(s.available)} />
                <StatCard icon={<Clock size={22} />} tint="#f5a524" label="Pending (QC)" value={money(s.pending)} />
                <StatCard icon={<Lock size={22} />} tint="#dc2626" label="On Hold" value={money(s.hold)} />
                <StatCard icon={<Coins size={22} />} tint="#5b51e8" label="Advance Due" value={money(s.advanceOutstanding)} />
              </div>

              {/* Bank & KYC verification */}
              <div className="card" style={{ background: 'var(--bg-soft, #f8f9fc)', padding: 14, borderRadius: 12 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong className="row" style={{ gap: 8, alignItems: 'center' }}><Landmark size={17} /> Bank &amp; KYC</strong>
                  <Badge tone={bankTone(w.bank?.status)}>{w.bank?.status || 'Not Added'}</Badge>
                </div>
                {!w.bank || w.bank.status === 'Not Added' ? (
                  <Empty msg="Worker has not added a bank account yet." />
                ) : (
                  <>
                    <div className="form-grid">
                      <div><small className="muted">Account Holder</small><div>{w.bank.holder || '—'}</div></div>
                      <div><small className="muted">Bank</small><div>{w.bank.bankName || '—'}</div></div>
                      <div><small className="muted">Account No.</small><div>{w.bank.account || '—'}</div></div>
                      <div><small className="muted">IFSC</small><div>{w.bank.ifsc || '—'}</div></div>
                      <div><small className="muted">UPI</small><div>{w.bank.upi || '—'}</div></div>
                      <div><small className="muted">Cheque/Passbook</small><div>{w.bank.cheque ? '✓ Attached' : '—'}</div></div>
                    </div>
                    {w.bank.status === 'Rejected' && w.bank.remarks && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 6 }}>Reason: {w.bank.remarks}</div>}
                    {isManager && w.bank.status !== 'Approved' && (
                      <div className="row" style={{ gap: 8, marginTop: 10 }}>
                        <button className="btn" onClick={() => run(() => approveWorkerBank(sel.id), 'Bank approved')}><Check size={15} /> Approve Bank</button>
                        <button className="btn ghost" onClick={() => { const r = prompt('Reason for rejection?') || 'Details could not be verified'; run(() => rejectWorkerBank(sel.id, r), 'Bank rejected') }}><X size={15} /> Reject</button>
                      </div>
                    )}
                    {isManager && w.bank.status === 'Approved' && (
                      <div className="row" style={{ gap: 8, marginTop: 10 }}>
                        <button className="btn ghost" onClick={() => { const r = prompt('Reason for revoking approval?') || 'Re-verification required'; run(() => rejectWorkerBank(sel.id, r), 'Bank approval revoked') }}><X size={15} /> Revoke</button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {isManager && (
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => setDialog({ kind: 'bonus' })}><Plus size={15} /> Add Bonus</button>
                  <button className="btn ghost" onClick={() => setDialog({ kind: 'penalty' })}><Minus size={15} /> Add Penalty</button>
                  <button className="btn ghost" onClick={() => setDialog({ kind: 'hold' })}><Lock size={15} /> Hold</button>
                  <button className="btn ghost" onClick={() => run(() => walletReleaseHold(sel.id, {}), 'Hold released')}><RotateCcw size={15} /> Release Hold</button>
                  <button className="btn ghost" onClick={() => run(() => walletReleasePending(sel.id, {}), 'Pending cleared to Available')}><Check size={15} /> Clear Pending</button>
                  <button className="btn ghost" onClick={() => run(() => generateWorkerPayslip(sel.id), 'Payslip generated')}><FileText size={15} /> Generate Payslip</button>
                </div>
              )}

              {/* Approval queues */}
              <div className="form-grid">
                <div>
                  <h4 className="muted" style={{ margin: '4px 0' }}>Withdrawal Requests</h4>
                  {pendingWd.length === 0 ? <Empty msg="No pending withdrawals." /> : (
                    <table className="tbl"><tbody>
                      {pendingWd.map((x: any) => (
                        <tr key={x.id}>
                          <td><strong>{money(x.amount)}</strong><br /><small className="muted">{x.method} • {x.destination}</small></td>
                          <td><Badge tone={statusTone(x.status)}>{x.status}</Badge></td>
                          {isManager && <td><div className="actions">
                            <button className="iconbtn" style={{ color: 'var(--green)' }} title="Approve & pay" onClick={() => run(() => approveWithdrawal(sel.id, x.id), 'Withdrawal approved')}><Check size={16} /></button>
                            <button className="iconbtn" style={{ color: 'var(--red)' }} title="Reject & refund" onClick={() => run(() => rejectWithdrawal(sel.id, x.id, 'Rejected by admin'), 'Withdrawal rejected')}><X size={16} /></button>
                          </div></td>}
                        </tr>
                      ))}
                    </tbody></table>
                  )}
                </div>
                <div>
                  <h4 className="muted" style={{ margin: '4px 0' }}>Salary Advance Requests</h4>
                  {pendingAdv.length === 0 ? <Empty msg="No pending advances." /> : (
                    <table className="tbl"><tbody>
                      {pendingAdv.map((x: any) => (
                        <tr key={x.id}>
                          <td><strong>{money(x.amount)}</strong><br /><small className="muted">{x.date}</small></td>
                          <td><Badge tone={statusTone(x.status)}>{x.status}</Badge></td>
                          {isManager && <td><div className="actions">
                            <button className="iconbtn" style={{ color: 'var(--green)' }} title="Approve & credit" onClick={() => run(() => approveAdvance(sel.id, x.id), 'Advance approved')}><Check size={16} /></button>
                            <button className="iconbtn" style={{ color: 'var(--red)' }} title="Reject" onClick={() => run(() => rejectAdvance(sel.id, x.id, 'Rejected by admin'), 'Advance rejected')}><X size={16} /></button>
                          </div></td>}
                        </tr>
                      ))}
                    </tbody></table>
                  )}
                </div>
              </div>

              {/* Breakup + deductions */}
              <div className="form-grid">
                <div>
                  <h4 className="muted" style={{ margin: '4px 0' }}>Earnings Breakup</h4>
                  <table className="tbl"><tbody>
                    {(w.earningsBreakup || []).map((b: any) => (
                      <tr key={b.category}><td>{b.category}</td><td className="num" style={{ color: 'var(--green)' }}>{money(b.amount)}</td></tr>
                    ))}
                  </tbody></table>
                </div>
                <div>
                  <h4 className="muted" style={{ margin: '4px 0' }}>Deductions <span style={{ color: 'var(--red)' }}>({money(w.deductions?.total || 0)})</span></h4>
                  <table className="tbl"><tbody>
                    {(w.deductions?.summary || []).map((b: any) => (
                      <tr key={b.category}><td>{b.category}</td><td className="num" style={{ color: b.amount ? 'var(--red)' : 'var(--muted)' }}>{b.amount ? '- ' + money(b.amount) : '—'}</td></tr>
                    ))}
                  </tbody></table>
                </div>
              </div>

              {/* History */}
              <div>
                <h4 className="muted" style={{ margin: '4px 0' }}>Transaction History</h4>
                <div className="tablewrap">
                  <table className="tbl">
                    <thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {(w.history || []).map((t: any) => (
                        <tr key={t.id}>
                          <td className="muted">{t.date}<br /><small>{t.time}</small></td>
                          <td>{t.type}{t.remarks && <><br /><small className="muted">{t.remarks}</small></>}</td>
                          <td className="muted">{t.refId || '—'}</td>
                          <td className="muted">{t.method}</td>
                          <td className="num" style={{ color: t.isCredit ? 'var(--green)' : 'var(--red)' }}>{(t.isCredit ? '+' : '-') + money(t.amount)}</td>
                          <td><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                        </tr>
                      ))}
                      {(w.history || []).length === 0 && <tr><td colSpan={6}><Empty msg="No transactions." /></td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {dialog && sel && (
        <AmountDialog
          kind={dialog.kind}
          onClose={() => setDialog(null)}
          onSubmit={async (amount, category, reason) => {
            const body = { amount, category, reason, label: reason }
            const fn =
              dialog.kind === 'bonus' ? () => walletBonus(sel.id, body)
                : dialog.kind === 'penalty' ? () => walletPenalty(sel.id, body)
                  : () => walletHold(sel.id, { amount, reason })
            await run(fn, dialog.kind === 'bonus' ? 'Bonus added' : dialog.kind === 'penalty' ? 'Penalty added' : 'Amount held')
            setDialog(null)
          }}
        />
      )}
    </div>
  )
}

function AmountDialog({ kind, onClose, onSubmit }: { kind: string; onClose: () => void; onSubmit: (amount: number, category: string, reason: string) => Promise<void> }) {
  const title = kind === 'bonus' ? 'Add Bonus / Incentive' : kind === 'penalty' ? 'Add Penalty / Charge' : 'Hold Payment'
  const cats = kind === 'bonus' ? INCOME : kind === 'penalty' ? PENALTIES : []
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(cats[0] || '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function go() {
    const amt = parseInt(amount, 10)
    if (!amt || amt <= 0) return
    setBusy(true)
    try { await onSubmit(amt, category, reason) } finally { setBusy(false) }
  }

  return (
    <Modal title={title} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={go}>{busy ? 'Saving…' : 'Confirm'}</button></>}>
      <div className="form-grid">
        <Field label="Amount (₹)"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" /></Field>
        {cats.length > 0 && <Field label="Category"><select value={category} onChange={(e) => setCategory(e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</select></Field>}
      </div>
      <Field label={kind === 'hold' ? 'Reason (shown to worker)' : 'Reason / note (shown to worker)'}>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === 'hold' ? 'Customer complaint under review' : 'e.g. Diwali festival bonus'} />
      </Field>
    </Modal>
  )
}
