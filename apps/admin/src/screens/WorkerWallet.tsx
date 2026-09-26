import { useEffect, useState } from 'react'
import { Download, Plus, Wallet, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { fetchCustomers, adjustWallet, fetchWalletTxns, type WalletTxn } from '../api'
import type { Customer } from '../types'
import { Card, StatCard, Badge, SearchBox, Pagination, Field, Loading, ErrorState, Modal, useToast, money, shortDate, FilterTabs } from '../components/UI'

// Customer wallets: the real ledger (auth `transactions`) plus a manual credit / deduct.
const QUICK_AMOUNTS = [100, 250, 500, 1000, 2000]
type Queue = 'all' | 'credit' | 'debit'
const isCredit = (t: WalletTxn) => (t.type || '').toLowerCase() === 'credit'

export default function WorkerWallet() {
  const toast = useToast()
  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [txns, setTxns] = useState<WalletTxn[] | null>(null)
  const [err, setErr] = useState('')
  const [queue, setQueue] = useState<Queue>('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // add / deduct form
  const [open, setOpen] = useState(false)
  const [dir, setDir] = useState<'credit' | 'debit'>('credit')
  const [custQ, setCustQ] = useState('')
  const [custId, setCustId] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setErr('')
    Promise.all([fetchCustomers().then(setCustomers), fetchWalletTxns().then(setTxns)]).catch((e: Error) => setErr(e.message))
  }
  useEffect(load, [])
  useEffect(() => setPage(1), [queue, q])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!customers || !txns) return <Loading />

  const now = new Date()
  const inMonth = (iso: string) => { const d = new Date(iso); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() }
  const totalBalance = customers.reduce((a, c) => a + (c.wallet || 0), 0)
  const withBalance = customers.filter((c) => (c.wallet || 0) > 0).length
  const addedMonth = txns.filter((t) => isCredit(t) && inMonth(t.created)).reduce((a, t) => a + t.amount, 0)
  const usedMonth = txns.filter((t) => !isCredit(t) && inMonth(t.created)).reduce((a, t) => a + t.amount, 0)

  const nameOf = (t: WalletTxn) => t.customer || `Customer #${t.user_id}`
  const ql = q.trim().toLowerCase()
  const filtered = txns
    .filter((t) => queue === 'all' || (queue === 'credit') === isCredit(t))
    .filter((t) => !ql || [nameOf(t), t.phone, t.title, t.ref, `wlt${t.id}`].some((v) => (v || '').toLowerCase().includes(ql)))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const cq = custQ.trim().toLowerCase()
  const matches = cq ? customers.filter((c) => (c.name || '').toLowerCase().includes(cq) || (c.phone || '').includes(cq) || (c.email || '').toLowerCase().includes(cq)).slice(0, 6) : []
  const picked = customers.find((c) => c.id === custId) || null

  const openForm = (d: 'credit' | 'debit' = 'credit') => { setDir(d); setCustQ(''); setCustId(null); setAmount(''); setNote(''); setOpen(true) }
  const submit = async () => {
    const amt = Number(amount)
    if (!picked) { toast('Pick a customer', 'err'); return }
    if (!(amt > 0)) { toast('Enter a valid amount', 'err'); return }
    if (dir === 'debit' && amt > (picked.wallet || 0)) { toast(`${picked.name || 'This customer'} only has ${money(picked.wallet || 0)}`, 'err'); return }
    setSaving(true)
    try {
      const res = await adjustWallet(picked.id, dir === 'credit' ? amt : -amt, note.trim() || undefined)
      toast(res.pending ? 'Sent for approval — a second admin must sign off' : dir === 'credit' ? `${money(amt)} added` : `${money(amt)} deducted`, 'ok')
      setOpen(false)
      load()
    } catch (e) {
      toast((e as Error).message || 'Could not update the wallet', 'err')
    } finally {
      setSaving(false)
    }
  }

  const exportCsv = () => {
    const head = ['ID', 'Customer', 'Phone', 'Type', 'Description', 'Amount', 'Balance after', 'Ref', 'Date']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [head.join(','), ...filtered.map((t) => [`WLT${t.id}`, nameOf(t), t.phone || '', isCredit(t) ? 'Added' : 'Used', t.title, t.amount, t.balance, t.ref || '', t.created].map(esc).join(','))]
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = 'wallet-transactions.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<Wallet size={22} />} tint="#5b51e8" label="Balance held" value={money(totalBalance)} sub={`${withBalance.toLocaleString('en-IN')} wallets with balance`} />
        <StatCard icon={<ArrowDownLeft size={22} />} tint="#16a34a" label="Added this month" value={money(addedMonth)} sub="top-ups, refunds & credits" />
        <StatCard icon={<ArrowUpRight size={22} />} tint="#f59e0b" label="Used this month" value={money(usedMonth)} sub="spent on bookings & deductions" />
      </div>

      <Card>
        <div className="card-head lg">
          <h3>Wallet transactions<span className="count">{txns.length.toLocaleString('en-IN')}</span></h3>
          <div className="head-actions">
            <button className="btn line" onClick={exportCsv}><Download size={15} /> Export</button>
            <button className="btn line" onClick={() => openForm('debit')}>Deduct</button>
            <button className="btn" onClick={() => openForm('credit')}><Plus size={16} /> Add funds</button>
          </div>
        </div>

        <FilterTabs value={queue} onChange={setQueue} tabs={[
          { key: 'all', label: 'All', count: txns.length },
          { key: 'credit', label: 'Added', count: txns.filter(isCredit).length },
          { key: 'debit', label: 'Used', count: txns.filter((t) => !isCredit(t)).length },
        ]} />

        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search customer, phone, description or ref" />
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Customer</th><th>Description</th><th>Type</th><th className="num">Amount</th><th className="num">Balance after</th><th>Date</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((t) => (
                <tr key={t.id}>
                  <td className="nowrap">
                    <strong className={t.customer ? '' : 'muted-name'} style={{ display: 'block', fontWeight: 600 }}>{nameOf(t)}</strong>
                    <small className="muted" style={{ fontSize: 12 }}>{t.phone || `#WLT${t.id}`}</small>
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    <span style={{ display: 'block' }}>{t.title}</span>
                    {t.ref && <small className="muted" style={{ fontSize: 12 }}>{t.ref}</small>}
                  </td>
                  <td><Badge tone={isCredit(t) ? 'green' : 'amber'}>{isCredit(t) ? 'Added' : 'Used'}</Badge></td>
                  <td className="num"><strong style={{ color: isCredit(t) ? 'var(--green)' : 'var(--ink)' }}>{isCredit(t) ? '+' : '−'}{money(t.amount)}</strong></td>
                  <td className="num muted">{money(t.balance)}{t.balance_type && t.balance_type !== 'cash' ? <small style={{ display: 'block', fontSize: 11.5 }}>{t.balance_type} balance</small> : null}</td>
                  <td className="muted nowrap">{shortDate(t.created)}</td>
                </tr>
              ))}
              {!pageRows.length && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: '36px 0' }}>{txns.length ? 'No transactions match these filters.' : 'No wallet activity yet.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="transactions" onPage={setPage} onSize={(n) => { setPageSize(n); setPage(1) }} />
      </Card>

      {open && (
        <Modal title={dir === 'credit' ? 'Add funds to a wallet' : 'Deduct from a wallet'} onClose={() => setOpen(false)}
          footer={<>
            <button className="btn line" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" disabled={saving} onClick={submit}>{saving ? 'Saving…' : dir === 'credit' ? `Add ${amount ? money(Number(amount) || 0) : 'funds'}` : `Deduct ${amount ? money(Number(amount) || 0) : ''}`}</button>
          </>}>
          <div className="seg" style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 8, background: 'var(--line-2)', marginBottom: 14 }}>
            {(['credit', 'debit'] as const).map((k) => (
              <button key={k} className={'btn' + (dir === k ? '' : ' line')} style={{ height: 30, border: dir === k ? undefined : 'none', background: dir === k ? undefined : 'transparent' }} onClick={() => setDir(k)}>
                {k === 'credit' ? 'Add' : 'Deduct'}
              </button>
            ))}
          </div>
          <Field label="Customer">
            {picked ? (
              <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid var(--line-strong)', borderRadius: 8, padding: '8px 12px' }}>
                <div>
                  <strong style={{ display: 'block' }}>{picked.name || `Customer #${picked.id}`}</strong>
                  <small className="muted">{picked.phone || '—'} · balance {money(picked.wallet || 0)}</small>
                </div>
                <button className="btn line" style={{ height: 28, fontSize: 12.5 }} onClick={() => { setCustId(null); setCustQ('') }}>Change</button>
              </div>
            ) : (
              <>
                <input autoFocus value={custQ} onChange={(e) => setCustQ(e.target.value)} placeholder="Search name, mobile or email" />
                {matches.length > 0 && (
                  <div className="minilist" style={{ border: '1px solid var(--line)', borderRadius: 8, marginTop: 6, padding: 4 }}>
                    {matches.map((c) => (
                      <button key={c.id} className="menu-item" style={{ display: 'flex', width: '100%', justifyContent: 'space-between', padding: '7px 10px', border: 0, background: 'none', cursor: 'pointer', borderRadius: 6, textAlign: 'left' }} onClick={() => setCustId(c.id)}>
                        <span><strong style={{ fontWeight: 600 }}>{c.name || `Customer #${c.id}`}</strong> <span className="muted">{c.phone}</span></span>
                        <span className="muted">{money(c.wallet || 0)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {cq && !matches.length && <small className="muted">No customer matches “{custQ}”.</small>}
              </>
            )}
          </Field>
          <Field label="Amount (₹)">
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="Enter amount" />
          </Field>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '-4px 0 12px' }}>
            {QUICK_AMOUNTS.map((a) => <button key={a} className={'chip' + (Number(amount) === a ? ' active' : '')} onClick={() => setAmount(String(a))}>{money(a)}</button>)}
          </div>
          <Field label="Note (shown in the customer's wallet history)">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={dir === 'credit' ? 'e.g. Goodwill credit for delayed booking' : 'e.g. Reversal of duplicate credit'} />
          </Field>
        </Modal>
      )}
    </div>
  )
}
