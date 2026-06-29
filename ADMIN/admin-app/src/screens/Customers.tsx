import { useEffect, useState } from 'react'
import { Users, UserCheck, UserPlus, Ban } from 'lucide-react'
import { fetchCustomers, fetchCustomer, updateCustomer, adjustWallet } from '../api'
import type { Customer } from '../types'
import { Card, StatCard, Loading, ErrorState, Empty, Badge, Avatar, SearchBox, Modal, Field, money, shortDate, useToast } from '../components/UI'

export default function Customers() {
  const toast = useToast()
  const [rows, setRows] = useState<Customer[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [open, setOpen] = useState<number | null>(null)

  const load = () => { setErr(''); fetchCustomers(q, status).then(setRows).catch((e) => setErr(e.message)) }
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id) }, [q, status])

  if (err) return <ErrorState msg={err} onRetry={load} />

  const total = rows?.length || 0
  const active = rows?.filter((r) => r.status === 'active').length || 0
  const blocked = rows?.filter((r) => r.status === 'blocked').length || 0
  const newest = rows?.filter((r) => Date.now() - new Date(r.joined).getTime() < 7 * 864e5).length || 0

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="stat-row">
        <StatCard icon={<Users size={22} />} tint="#5b51e8" label="Total Customers" value={total} />
        <StatCard icon={<UserCheck size={22} />} tint="#16a34a" label="Active" value={active} />
        <StatCard icon={<UserPlus size={22} />} tint="#2e90fa" label="New (7 days)" value={newest} />
        <StatCard icon={<Ban size={22} />} tint="#f04438" label="Blocked" value={blocked} />
      </div>

      <Card>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search by name, phone or email…" />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All Status</option><option value="active">Active</option><option value="blocked">Blocked</option>
          </select>
        </div>
        {!rows ? <Loading /> : rows.length === 0 ? <Empty msg="No customers found." /> : (
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Customer</th><th>Phone</th><th>City</th><th>Bookings</th><th>Total Spend</th><th>Wallet</th><th>Status</th><th>Joined</th><th></th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><div className="cell-user"><Avatar name={c.name} size={34} /><div><strong>{c.name}</strong><small>{c.email || '—'}</small></div></div></td>
                    <td className="muted">{c.phone || '—'}</td>
                    <td>{c.city || '—'}</td>
                    <td className="num">{c.bookings}</td>
                    <td className="num">{money(c.spend)}</td>
                    <td className="num">{money(c.wallet)}</td>
                    <td><Badge>{c.status}</Badge></td>
                    <td className="muted">{shortDate(c.joined)}</td>
                    <td><span className="link" onClick={() => setOpen(c.id)}>View</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open != null && <CustomerModal id={open} onClose={() => setOpen(null)} onChange={load} toast={toast} />}
    </div>
  )
}

function CustomerModal({ id, onClose, onChange, toast }: { id: number; onClose: () => void; onChange: () => void; toast: (m: string, k?: 'ok' | 'err') => void }) {
  const [data, setData] = useState<any>(null)
  const [amt, setAmt] = useState('')
  const load = () => fetchCustomer(id).then(setData).catch(() => {})
  useEffect(() => { load() }, [id])

  async function toggleBlock() {
    const next = data.customer.status === 'blocked' ? 'active' : 'blocked'
    try { await updateCustomer(id, { status: next }); toast(next === 'blocked' ? 'Customer blocked' : 'Customer unblocked'); load(); onChange() } catch (e: any) { toast(e.message, 'err') }
  }
  async function addFunds() {
    const n = Number(amt); if (!n) return
    try { await adjustWallet(id, n, 'Admin credit'); toast('Wallet updated'); setAmt(''); load(); onChange() } catch (e: any) { toast(e.message, 'err') }
  }

  return (
    <Modal title="Customer Details" onClose={onClose} wide
      footer={data && <>
        <button className="btn ghost danger" onClick={toggleBlock} style={{ color: data.customer.status === 'blocked' ? 'var(--green)' : 'var(--red)' }}>
          {data.customer.status === 'blocked' ? 'Unblock' : 'Block'} customer
        </button>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </>}>
      {!data ? <Loading /> : (
        <div>
          <div className="row" style={{ gap: 14, marginBottom: 18 }}>
            <Avatar name={data.customer.name} size={56} />
            <div>
              <h3 style={{ fontSize: 18 }}>{data.customer.name || 'Guest'} <Badge>{data.customer.status}</Badge></h3>
              <p className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>{data.customer.phone || '—'} · {data.customer.email || 'no email'} · {data.customer.city || '—'}</p>
            </div>
          </div>
          <div className="stat-row" style={{ marginBottom: 18 }}>
            <div className="stat"><div className="stat-body"><span className="stat-label">Wallet</span><strong className="stat-value">{money(data.customer.wallet)}</strong></div></div>
            <div className="stat"><div className="stat-body"><span className="stat-label">Bookings</span><strong className="stat-value">{data.bookings.length}</strong></div></div>
            <div className="stat"><div className="stat-body"><span className="stat-label">Addresses</span><strong className="stat-value">{data.addresses.length}</strong></div></div>
          </div>

          <Field label="Adjust wallet (₹, use negative to deduct)">
            <div className="row">
              <input value={amt} onChange={(e) => setAmt(e.target.value)} type="number" placeholder="e.g. 500" style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 11, padding: '11px 13px' }} />
              <button className="btn sm" onClick={addFunds}>Apply</button>
            </div>
          </Field>

          <h4 style={{ margin: '14px 0 8px', fontSize: 14 }}>Recent Bookings</h4>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Ref</th><th>Service</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {data.bookings.slice(0, 6).map((b: any) => (
                  <tr key={b.id}><td className="muted">{b.ref}</td><td>{b.items.map((i: any) => i.name).join(', ')}</td><td className="num">{money(b.total)}</td><td><Badge>{b.status}</Badge></td><td className="muted">{shortDate(b.created)}</td></tr>
                ))}
                {data.bookings.length === 0 && <tr><td colSpan={5}><Empty msg="No bookings yet." /></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}
