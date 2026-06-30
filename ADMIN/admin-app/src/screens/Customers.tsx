import { useEffect, useState, type CSSProperties } from 'react'
import { Users, UserCheck, UserPlus, Repeat, Star, Funnel, Plus, MoreVertical } from 'lucide-react'
import { fetchCustomers, fetchCustomer, createCustomer, updateCustomer, adjustWallet } from '../api'
import type { Customer } from '../types'
import { StatCard, Card, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, Modal, Field, useToast, money, shortDate } from '../components/UI'

type AddDraft = { name: string; phone: string; email: string; city: string }
const EMPTY_ADD: AddDraft = { name: '', phone: '', email: '', city: '' }
type EditDraft = { name: string; email: string; city: string }

export default function Customers() {
  const toast = useToast()
  const [rows, setRows] = useState<Customer[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [city, setCity] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)

  const [menuId, setMenuId] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addDraft, setAddDraft] = useState<AddDraft>(EMPTY_ADD)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: '', email: '', city: '' })
  const [funds, setFunds] = useState<Customer | null>(null)
  const [fundAmount, setFundAmount] = useState('')
  const [fundNote, setFundNote] = useState('')
  const [viewing, setViewing] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  const load = () => { setErr(''); fetchCustomers(q, status).then(setRows).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [q, status])

  useEffect(() => {
    if (menuId == null) return
    const h = () => setMenuId(null)
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [menuId])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const total = rows.length
  const active = rows.filter((c) => (c.status || 'active') === 'active').length
  const newCount = rows.filter((c) => c.bookings === 0).length
  const repeat = rows.filter((c) => c.bookings > 1).length
  const rated = rows.filter((c) => c.rating > 0)
  const avgRating = rated.length ? (rated.reduce((a, c) => a + c.rating, 0) / rated.length).toFixed(1) : '—'

  const filtered = rows.filter((c) => {
    if (city !== 'all' && (c.city || '').toLowerCase() !== city) return false
    return true
  })
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const addCustomer = async () => {
    setBusy(true)
    try {
      await createCustomer({ name: addDraft.name, phone: addDraft.phone, email: addDraft.email, city: addDraft.city })
      toast('Customer added')
      setAddOpen(false); setAddDraft(EMPTY_ADD); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const saveEdit = async () => {
    if (!editing) return
    setBusy(true)
    try {
      await updateCustomer(editing.id, { name: editDraft.name, email: editDraft.email, city: editDraft.city })
      toast('Customer updated')
      setEditing(null); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const toggleBlock = async (c: Customer) => {
    const next = (c.status || 'active') === 'active' ? 'blocked' : 'active'
    try { await updateCustomer(c.id, { status: next }); toast(next === 'blocked' ? 'Customer blocked' : 'Customer unblocked'); load() }
    catch (e) { toast((e as Error).message, 'err') }
  }

  const addFunds = async () => {
    if (!funds) return
    const amt = Number(fundAmount)
    if (!amt || isNaN(amt)) { toast('Enter a valid amount', 'err'); return }
    setBusy(true)
    try {
      await adjustWallet(funds.id, amt, fundNote)
      toast('Wallet updated')
      setFunds(null); setFundAmount(''); setFundNote(''); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const openEdit = (c: Customer) => { setEditDraft({ name: c.name, email: c.email || '', city: c.city || '' }); setEditing(c) }

  const openView = async (c: Customer) => {
    setMenuId(null)
    try { setViewing(await fetchCustomer(c.id)) } catch (e) { toast((e as Error).message, 'err') }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<Users size={22} />} tint="#5b51e8" label="Total Customers" value={total.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<UserCheck size={22} />} tint="#16a34a" label="Active Customers" value={active.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<UserPlus size={22} />} tint="#2e90fa" label="New Customers" value={newCount.toLocaleString('en-IN')} sub="no bookings yet" />
        <StatCard icon={<Repeat size={22} />} tint="#f59e0b" label="Repeat Customers" value={repeat.toLocaleString('en-IN')} sub="2+ bookings" />
        <StatCard icon={<Star size={22} />} tint="#f59e0b" label="Avg. Rating" value={avgRating} sub="across customers" />
      </div>

      <Card>
        <div className="toolbar">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search customer by name, mobile or email…" />
          <div className="tb-spacer" />
          <select className="select flt" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select className="select flt" value={city} onChange={(e) => { setCity(e.target.value); setPage(1) }}>
            <option value="all">All Cities</option>
            <option value="mumbai">Mumbai</option>
            <option value="delhi">Delhi</option>
            <option value="bangalore">Bangalore</option>
          </select>
          <button className="btn line"><Funnel size={16} /> Filters</button>
          <button className="btn" onClick={() => { setAddDraft(EMPTY_ADD); setAddOpen(true) }}><Plus size={17} /> Add Customer</button>
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" /></th>
                <th>Customer</th>
                <th>Mobile Number</th>
                <th>Email</th>
                <th>City</th>
                <th className="num">Total Bookings</th>
                <th className="num">Total Spent</th>
                <th>Status</th>
                <th>Joined On</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => (
                <tr key={c.id}>
                  <td><input type="checkbox" /></td>
                  <td><div className="cell-user"><Avatar name={c.name} size={34} /><div><strong>{c.name}</strong></div></div></td>
                  <td className="muted">{c.phone ?? '—'}</td>
                  <td className="muted">{c.email ?? '—'}</td>
                  <td>{c.city ?? '—'}</td>
                  <td className="num">{c.bookings}</td>
                  <td className="num">{money(c.spend)}</td>
                  <td><Badge tone={(c.status || 'active') === 'active' ? 'green' : 'red'}>{(c.status || 'active') === 'active' ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="muted">{shortDate(c.joined)}</td>
                  <td><div className="actions" style={{ position: 'relative' }}>
                    <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={(e) => { e.stopPropagation(); setMenuId(menuId === c.id ? null : c.id) }}><MoreVertical size={18} /></button>
                    {menuId === c.id && (
                      <div className="menu" style={{ position: 'absolute', right: 0, top: 34, zIndex: 20, background: 'var(--card, #fff)', border: '1px solid var(--line, #e4e7ec)', borderRadius: 8, boxShadow: '0 8px 24px rgba(16,24,40,.12)', minWidth: 150, padding: 4 }} onClick={(e) => e.stopPropagation()}>
                        <button className="menu-item" style={MENU_ITEM} onClick={() => openView(c)}>View</button>
                        <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); openEdit(c) }}>Edit</button>
                        <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); toggleBlock(c) }}>{(c.status || 'active') === 'active' ? 'Block' : 'Unblock'}</button>
                        <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); setFundAmount(''); setFundNote(''); setFunds(c) }}>Add funds</button>
                      </div>
                    )}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="customers" onPage={setPage} />
      </Card>

      {addOpen && (
        <Modal title="Add Customer" onClose={() => setAddOpen(false)} footer={
          <>
            <button className="btn line" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy || !addDraft.name.trim()} onClick={addCustomer}>Add Customer</button>
          </>
        }>
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Name"><input value={addDraft.name} onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })} placeholder="Full name" /></Field>
            <Field label="Mobile Number"><input value={addDraft.phone} onChange={(e) => setAddDraft({ ...addDraft, phone: e.target.value })} placeholder="Phone" /></Field>
            <Field label="Email"><input value={addDraft.email} onChange={(e) => setAddDraft({ ...addDraft, email: e.target.value })} placeholder="Email" /></Field>
            <Field label="City"><input value={addDraft.city} onChange={(e) => setAddDraft({ ...addDraft, city: e.target.value })} placeholder="City" /></Field>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Customer" onClose={() => setEditing(null)} footer={
          <>
            <button className="btn line" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" disabled={busy || !editDraft.name.trim()} onClick={saveEdit}>Save Changes</button>
          </>
        }>
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Name"><input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></Field>
            <Field label="Email"><input value={editDraft.email} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} /></Field>
            <Field label="City"><input value={editDraft.city} onChange={(e) => setEditDraft({ ...editDraft, city: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {funds && (
        <Modal title={`Add Funds — ${funds.name}`} onClose={() => setFunds(null)} footer={
          <>
            <button className="btn line" onClick={() => setFunds(null)}>Cancel</button>
            <button className="btn" disabled={busy || !fundAmount.trim()} onClick={addFunds}>Add Funds</button>
          </>
        }>
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Current Balance"><input value={money(funds.wallet)} readOnly /></Field>
            <Field label="Amount (₹)"><input type="number" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} placeholder="500" /></Field>
            <Field label="Note"><input value={fundNote} onChange={(e) => setFundNote(e.target.value)} placeholder="Reason / reference" /></Field>
          </div>
        </Modal>
      )}

      {viewing && (
        <Modal title="Customer Details" onClose={() => setViewing(null)} wide>
          <div className="grid" style={{ gap: 12 }}>
            <div className="cell-user"><Avatar name={viewing.customer?.name || ''} size={48} /><div><strong>{viewing.customer?.name}</strong></div></div>
            <div className="row" style={{ gap: 24 }}>
              <Field label="Mobile Number"><input value={viewing.customer?.phone || '—'} readOnly /></Field>
              <Field label="Email"><input value={viewing.customer?.email || '—'} readOnly /></Field>
            </div>
            <div className="row" style={{ gap: 24 }}>
              <Field label="City"><input value={viewing.customer?.city || '—'} readOnly /></Field>
              <Field label="Wallet Balance"><input value={money(viewing.customer?.wallet || 0)} readOnly /></Field>
            </div>

            <Field label={`Addresses (${(viewing.addresses || []).length})`}>
              <input value={(viewing.addresses || []).map((a: any) => a.line || a.address || a.label).filter(Boolean).join(' • ') || '—'} readOnly />
            </Field>

            <div className="field"><span>Recent Bookings ({(viewing.bookings || []).length})</span></div>
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr><th>Ref</th><th>Service</th><th className="num">Total</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {(viewing.bookings || []).slice(0, 8).map((b: any) => (
                    <tr key={b.id}>
                      <td className="muted">{b.ref || b.id}</td>
                      <td>{b.service || '—'}</td>
                      <td className="num">{money(b.total || 0)}</td>
                      <td><Badge>{b.status}</Badge></td>
                      <td className="muted">{shortDate(b.created)}</td>
                    </tr>
                  ))}
                  {(!viewing.bookings || viewing.bookings.length === 0) && <tr><td colSpan={5} className="muted">No bookings</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="field"><span>Recent Transactions ({(viewing.transactions || []).length})</span></div>
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr><th>Title</th><th>Type</th><th className="num">Amount</th><th>Date</th></tr></thead>
                <tbody>
                  {(viewing.transactions || []).slice(0, 8).map((t: any) => (
                    <tr key={t.id}>
                      <td>{t.title || '—'}</td>
                      <td className="muted">{t.type}</td>
                      <td className="num">{money(t.amount || 0)}</td>
                      <td className="muted">{shortDate(t.created)}</td>
                    </tr>
                  ))}
                  {(!viewing.transactions || viewing.transactions.length === 0) && <tr><td colSpan={4} className="muted">No transactions</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

const MENU_ITEM: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }
