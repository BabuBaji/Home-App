import { useEffect, useState } from 'react'
import { Download, Plus, Wallet, ChevronRight, ArrowRight } from 'lucide-react'
import { fetchCustomers, adjustWallet, fetchPayments } from '../api'
import type { Customer } from '../types'
import { Card, StatCard, Badge, Avatar, SearchBox, Pagination, Field, Loading, ErrorState, useToast, money, shortDate } from '../components/UI'
import { Donut } from '../components/Charts'

/* ---------- static demo data (web visualization build) ---------- */

const QUICK_AMOUNTS = ['₹500', '₹1,000', '₹2,000', '₹5,000', '₹10,000', 'Other']

type Txn = { id: number; type: string; title: string; amount: number; created: string; ref?: string; customer: string }

const typeTone = (t: string): string => {
  const s = (t || '').toLowerCase()
  if (s === 'credit') return 'green'
  if (s === 'debit') return 'amber'
  return 'violet'
}
const typeLabel = (t: string): string => {
  const s = (t || '').toLowerCase()
  if (s === 'credit') return 'Added'
  if (s === 'debit') return 'Used'
  if (s === 'refund') return 'Refunded'
  return t || '—'
}

const TOPUP_METHODS = [
  { label: 'UPI', value: 560560, color: '#2e90fa' },
  { label: 'Cards', value: 311420, color: '#16a34a' },
  { label: 'Net Banking', value: 248250, color: '#f59e0b' },
  { label: 'Wallet', value: 87230, color: '#7c6df7' },
  { label: 'Others', value: 38220, color: '#98a2b3' },
]

const TOPUP_LEGEND = [
  { label: 'UPI', pct: '45%', amt: '(₹5,60,560)', color: '#2e90fa' },
  { label: 'Cards', pct: '25%', amt: '(₹3,11,420)', color: '#16a34a' },
  { label: 'Net Banking', pct: '20%', amt: '(₹2,48,250)', color: '#f59e0b' },
  { label: 'Wallet', pct: '7%', amt: '(₹87,230)', color: '#7c6df7' },
  { label: 'Others', pct: '3%', amt: '(₹38,220)', color: '#98a2b3' },
]

const SUMMARY_ROWS = [
  { label: 'Pending Amount', value: '₹1,25,340' },
  { label: 'On Hold', value: '₹45,680' },
  { label: 'Used This Month', value: '₹1,45,230' },
  { label: 'Expired / Inactive', value: '₹12,450' },
]

const QUICK_LINKS = [
  { title: 'Wallet Transactions', sub: 'View all transactions' },
  { title: 'Customer Wallets', sub: 'Manage customer wallets' },
  { title: 'Wallet Adjustments', sub: 'Add / Deduct manually' },
  { title: 'Bulk Add Funds', sub: 'Add funds to multiple customers' },
]

const HOW_IT_WORKS = [
  'Select a customer',
  'Enter amount & select payment method',
  'Confirm to add funds to wallet',
]

type Tab = 'funds' | 'transactions' | 'adjust'

export default function WorkerWallet() {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('funds')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 5

  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [txns, setTxns] = useState<Txn[] | null>(null)
  const [err, setErr] = useState('')

  // Add Funds form
  const [custId, setCustId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const loadTxns = () => fetchPayments().then((d: any) => setTxns(d.transactions || []))
  const load = () => {
    setErr('')
    Promise.all([fetchCustomers().then(setCustomers), loadTxns()]).catch((e: Error) => setErr(e.message))
  }
  useEffect(load, [])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!customers || !txns) return <Loading />

  const resetForm = () => { setCustId(''); setAmount(''); setMethod(''); setDesc('') }

  const pickChip = (a: string) => {
    if (a === 'Other') { setAmount(''); return }
    setAmount(a.replace(/[₹,]/g, ''))
  }

  const addFunds = async () => {
    const amt = Number(amount)
    if (!custId) { toast('Select a customer', 'err'); return }
    if (!(amt > 0)) { toast('Enter a valid amount', 'err'); return }
    setSaving(true)
    try {
      await adjustWallet(Number(custId), amt, desc)
      toast('Funds added', 'ok')
      resetForm()
      await Promise.all([fetchCustomers().then(setCustomers), loadTxns()])
    } catch (e) {
      toast((e as Error).message || 'Could not add funds', 'err')
    } finally {
      setSaving(false)
    }
  }

  // derived stat numbers
  const totalBalance = customers.reduce((a, c) => a + (c.wallet || 0), 0)
  const totalAdded = txns.filter((t) => (t.type || '').toLowerCase() === 'credit').reduce((a, t) => a + t.amount, 0)
  const totalUsed = txns.filter((t) => (t.type || '').toLowerCase() === 'debit').reduce((a, t) => a + t.amount, 0)
  const totalRefunds = txns.filter((t) => (t.type || '').toLowerCase() === 'refund').reduce((a, t) => a + t.amount, 0)
  const activeWallets = customers.filter((c) => (c.wallet || 0) > 0).length

  const STATS = [
    { icon: <Wallet size={22} />, tint: '#5b51e8', label: 'Total Wallet Balance', value: money(totalBalance), sub: 'across customers' },
    { icon: <Download size={22} />, tint: '#16a34a', label: 'Total Added', value: money(totalAdded), sub: 'recent transactions' },
    { icon: <Plus size={22} />, tint: '#f59e0b', label: 'Total Used', value: money(totalUsed), down: true, sub: 'recent transactions' },
    { icon: <Wallet size={22} />, tint: '#f04438', label: 'Total Refunds', value: money(totalRefunds), down: true, sub: 'recent transactions' },
    { icon: <Wallet size={22} />, tint: '#2e90fa', label: 'Active Wallets', value: activeWallets.toLocaleString('en-IN'), sub: 'with balance' },
  ]

  const ql = q.trim().toLowerCase()
  const filtered = txns.filter((t) =>
    !ql || String(t.id).includes(ql) || (t.ref || '').toLowerCase().includes(ql) || (t.customer || '').toLowerCase().includes(ql) || (t.title || '').toLowerCase().includes(ql))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* KPI row */}
      <div className="stat-row">
        {STATS.map((s) => (
          <StatCard key={s.label} icon={s.icon} tint={s.tint} label={s.label} value={s.value} sub={s.sub} down={(s as any).down} />
        ))}
      </div>

      <div className="cols">
        {/* MAIN COLUMN */}
        <div className="grid" style={{ gap: 16 }}>
          {/* Tabs + Add Funds panel */}
          <Card>
            <div className="tabs">
              <button className={'tab' + (tab === 'funds' ? ' active' : '')} onClick={() => setTab('funds')}>Add Funds</button>
              <button className={'tab' + (tab === 'transactions' ? ' active' : '')} onClick={() => setTab('transactions')}>Wallet Transactions</button>
              <button className={'tab' + (tab === 'adjust' ? ' active' : '')} onClick={() => setTab('adjust')}>Wallet Adjustment</button>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1.7fr 1fr', gap: 18, alignItems: 'start', marginTop: 18 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Add Funds to Wallet</h3>
                <p className="muted" style={{ fontSize: 13, margin: '4px 0 18px' }}>Add balance to customer's wallet</p>

                <div className="form-grid">
                  <Field label="Select Customer *">
                    <select value={custId} onChange={(e) => setCustId(e.target.value)}>
                      <option value="" disabled>Search by name, phone or email…</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''} · {money(c.wallet || 0)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Amount (₹) *">
                    <input type="text" placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </Field>
                  <Field label="Payment Method *">
                    <select value={method} onChange={(e) => setMethod(e.target.value)}>
                      <option value="" disabled>Select payment method</option>
                      <option value="upi">UPI</option>
                      <option value="card">Credit Card</option>
                      <option value="netbanking">Net Banking</option>
                      <option value="wallet">Wallet Balance</option>
                    </select>
                  </Field>
                  <Field label="Description (Optional)">
                    <input type="text" placeholder="e.g., Promotional bonus, Top-up, etc." value={desc} onChange={(e) => setDesc(e.target.value)} />
                  </Field>
                </div>

                <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '14px 0 18px' }}>
                  {QUICK_AMOUNTS.map((a) => <button key={a} className="chip" onClick={() => pickChip(a)}>{a}</button>)}
                </div>

                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <label className="row" style={{ gap: 8, alignItems: 'center', fontSize: 14 }}>
                    <input type="checkbox" defaultChecked /> Send SMS &amp; Email Notification
                  </label>
                  <div className="row" style={{ gap: 10 }}>
                    <button className="btn line" onClick={resetForm}>Reset</button>
                    <button className="btn" onClick={addFunds} disabled={saving}><Plus size={15} /> Add Funds</button>
                  </div>
                </div>
              </div>

              {/* How it works panel */}
              <div className="card" style={{ background: '#f4f3fe', padding: 18, borderRadius: 14, position: 'relative', overflow: 'hidden' }}>
                <strong style={{ fontSize: 15 }}>How it works</strong>
                <div className="minilist" style={{ marginTop: 14 }}>
                  {HOW_IT_WORKS.map((t, i) => (
                    <div key={i} className="mini-row" style={{ alignItems: 'flex-start' }}>
                      <span className="mini-ico" style={{ background: '#5b51e8', color: '#fff', borderRadius: '50%', flex: 'none' }}>{i + 1}</span>
                      <div className="mini-bd"><strong style={{ fontWeight: 500 }}>{t}</strong></div>
                    </div>
                  ))}
                </div>
                <Wallet size={70} style={{ position: 'absolute', right: 12, bottom: 10, color: '#5b51e8', opacity: 0.12 }} />
              </div>
            </div>
          </Card>

          {/* Recent Wallet Transactions */}
          <Card title="Recent Wallet Transactions" right={<span className="link">View All</span>}>
            <div className="toolbar">
              <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search by transaction, customer or ref…" />
              <div className="tb-spacer" />
            </div>
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Transaction ID</th><th>Customer</th><th>Type</th><th>Amount</th>
                    <th>Payment Method</th><th>Description</th><th>Date &amp; Time</th><th>Status</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((t) => (
                    <tr key={t.id}>
                      <td className="num">#WLT{t.id}</td>
                      <td>
                        <div className="cell-user">
                          <Avatar name={t.customer} size={32} />
                          <div><strong>{t.customer}</strong><small>{t.ref || ''}</small></div>
                        </div>
                      </td>
                      <td><Badge tone={typeTone(t.type)}>{typeLabel(t.type)}</Badge></td>
                      <td className="num">{money(t.amount)}</td>
                      <td>
                        <strong style={{ fontWeight: 500 }}>{t.title}</strong>
                      </td>
                      <td>{t.title}</td>
                      <td className="muted">{shortDate(t.created)}</td>
                      <td><Badge tone="green">Completed</Badge></td>
                      <td><span className="link">View</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="transactions" onPage={setPage} />
          </Card>
        </div>

        {/* RIGHT RAIL */}
        <div className="col-rail">
          <Card title="Wallet Summary" right={<span className="link">View Report</span>}>
            <div className="card" style={{ background: '#f4f3fe', padding: 16, borderRadius: 12, marginBottom: 14 }}>
              <small className="muted">Available Balance</small>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{money(totalBalance)}</div>
            </div>
            <div className="minilist">
              {SUMMARY_ROWS.map((r) => (
                <div key={r.label} className="mini-row">
                  <span className="mini-ico" style={{ background: '#5b51e81f', color: '#5b51e8' }}><Wallet size={15} /></span>
                  <div className="mini-bd"><strong style={{ fontWeight: 500 }}>{r.label}</strong></div>
                  <strong>{r.value}</strong>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Top Up Methods">
            <Donut data={TOPUP_METHODS} size={170} />
            <div className="minilist" style={{ marginTop: 10 }}>
              {TOPUP_LEGEND.map((r) => (
                <div key={r.label} className="mini-row">
                  <span className="dot" style={{ background: r.color }} />
                  <div className="mini-bd"><strong style={{ fontWeight: 500 }}>{r.label}</strong></div>
                  <span className="num"><strong>{r.pct}</strong> <small className="muted">{r.amt}</small></span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Quick Links">
            <div className="minilist">
              {QUICK_LINKS.map((l, i) => (
                <div key={l.title} className="mini-row link-row">
                  <span className="mini-ico"><Wallet size={16} /></span>
                  <div className="mini-bd"><strong>{l.title}</strong><small>{l.sub}</small></div>
                  {i === 3 ? <ArrowRight size={16} className="muted" /> : <ChevronRight size={16} className="muted" />}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
