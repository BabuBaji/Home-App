import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, UserCheck, UserPlus, Repeat2, UserX, Star, StarHalf, Funnel, Plus, MoreVertical, MoreHorizontal,
  Phone, Mail, MapPin, Download, Send, User, Pencil, CalendarPlus, MessageCircle, Wallet as WalletIcon,
  StickyNote, Ban, Eye, RefreshCw, X,
} from 'lucide-react'
import { fetchCustomers, fetchCustomer, createCustomer, updateCustomer, adjustWallet, setWalletStatus, addCustomerNote } from '../api'
import type { Customer } from '../types'
import { StatCard, Card, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, Modal, Field, useToast, money, shortDate, MiniMap, parseLatLng } from '../components/UI'

type AddDraft = { name: string; phone: string; email: string; city: string }
const EMPTY_ADD: AddDraft = { name: '', phone: '', email: '', city: '' }
type EditDraft = { name: string; email: string; city: string }

const SEGMENTS = ['New', 'Repeat', 'Loyal', 'VIP', 'At Risk', 'Inactive'] as const
const SEG_TONE: Record<string, string> = { New: 'blue', Repeat: 'green', Loyal: 'violet', VIP: 'amber', 'At Risk': 'red', Inactive: 'gray' }
const shortTime = (s?: string | null) => (s ? new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '')

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating + 1e-6)
  const half = rating - full >= 0.5
  return (
    <span style={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}>
      {[0, 1, 2, 3, 4].map((i) =>
        i < full ? <Star key={i} size={14} fill="#f59e0b" stroke="#f59e0b" />
          : i === full && half ? <StarHalf key={i} size={14} fill="#f59e0b" stroke="#f59e0b" />
            : <Star key={i} size={14} fill="none" stroke="#d0d5dd" />)}
      <span style={{ marginLeft: 5, fontWeight: 600, fontSize: 13, color: rating > 0 ? 'inherit' : '#98a2b3' }}>{rating.toFixed(1)}</span>
    </span>
  )
}

function exportCsv(rows: Customer[]) {
  const head = ['Name', 'Mobile', 'Email', 'City', 'Zone', 'Bookings', 'Last Booking', 'Total Spent', 'Segment', 'Rating', 'Status', 'Joined']
  const lines = rows.map((c) => [c.name, c.phone || '', c.email || '', c.city || '', c.zone || '', c.bookings,
    c.lastBooking ? shortDate(c.lastBooking) : '', c.spend, c.segment || '', (c.rating || 0).toFixed(1), c.status || 'active', shortDate(c.joined)])
  const csv = [head, ...lines].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = 'customers.csv'; a.click(); URL.revokeObjectURL(url)
}

export default function Customers() {
  const toast = useToast()
  const nav = useNavigate()
  const [rows, setRows] = useState<Customer[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [city, setCity] = useState('all')
  const [zone, setZone] = useState('all')
  const [segment, setSegment] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sel, setSel] = useState<Set<number>>(new Set())

  const [menuId, setMenuId] = useState<number | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addDraft, setAddDraft] = useState<AddDraft>(EMPTY_ADD)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: '', email: '', city: '' })
  const [funds, setFunds] = useState<Customer | null>(null)
  const [fundAmount, setFundAmount] = useState('')
  const [fundNote, setFundNote] = useState('')
  const [noteFor, setNoteFor] = useState<Customer | null>(null)
  const [noteText, setNoteText] = useState('')
  const [viewing, setViewing] = useState<any>(null)
  const [wallet, setWallet] = useState<any>(null)
  const [wAmt, setWAmt] = useState('')
  const [wNote, setWNote] = useState('')
  const [wBal, setWBal] = useState<'cash' | 'promo' | 'points'>('cash')
  const [busy, setBusy] = useState(false)

  const load = () => { setErr(''); fetchCustomers(q, status).then(setRows).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [q, status])

  useEffect(() => {
    if (menuId == null && !moreOpen) return
    const h = () => { setMenuId(null); setMoreOpen(false) }
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [menuId, moreOpen])

  const cities = useMemo(() => [...new Set((rows || []).map((c) => c.city).filter(Boolean) as string[])].sort(), [rows])
  const zones = useMemo(() => [...new Set((rows || []).map((c) => c.zone).filter(Boolean) as string[])].sort(), [rows])

  const filtered = useMemo(() => (rows || []).filter((c) => {
    if (city !== 'all' && (c.city || '') !== city) return false
    if (zone !== 'all' && (c.zone || '') !== zone) return false
    if (segment !== 'all' && (c.segment || '') !== segment) return false
    return true
  }), [rows, city, zone, segment])

  useEffect(() => { setPage(1) }, [city, zone, segment, q, status, pageSize])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const total = rows.length
  const active = rows.filter((c) => (c.status || 'active') === 'active').length
  const newCount = rows.filter((c) => (c.segment || (c.bookings === 0 ? 'New' : '')) === 'New').length
  const repeat = rows.filter((c) => c.bookings >= 2).length
  const inactive = rows.filter((c) => (c.status || 'active') !== 'active').length
  const rated = rows.filter((c) => c.rating > 0)
  const avgRating = rated.length ? (rated.reduce((a, c) => a + c.rating, 0) / rated.length).toFixed(1) : '—'

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const pageIds = pageRows.map((c) => c.id)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => sel.has(id))
  const toggleAll = () => setSel((s) => { const n = new Set(s); if (allOnPage) pageIds.forEach((id) => n.delete(id)); else pageIds.forEach((id) => n.add(id)); return n })
  const toggleOne = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const activeChips: { label: string; clear: () => void }[] = []
  if (status !== 'all') activeChips.push({ label: `Status: ${status[0].toUpperCase() + status.slice(1)}`, clear: () => setStatus('all') })
  if (city !== 'all') activeChips.push({ label: `City: ${city}`, clear: () => setCity('all') })
  if (zone !== 'all') activeChips.push({ label: `Zone: ${zone}`, clear: () => setZone('all') })
  if (segment !== 'all') activeChips.push({ label: `Segment: ${segment}`, clear: () => setSegment('all') })
  if (q.trim()) activeChips.push({ label: `Search: “${q.trim()}”`, clear: () => setQ('') })
  const clearAll = () => { setStatus('all'); setCity('all'); setZone('all'); setSegment('all'); setQ('') }

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
      const res = await adjustWallet(funds.id, amt, fundNote)
      toast(res.pending ? 'Sent for approval — a second admin must sign off' : 'Wallet updated')
      setFunds(null); setFundAmount(''); setFundNote(''); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const saveNote = async () => {
    if (!noteFor || !noteText.trim()) return
    setBusy(true)
    try { await addCustomerNote(noteFor.id, noteText.trim()); toast('Note added'); setNoteFor(null); setNoteText('') }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const openEdit = (c: Customer) => { setEditDraft({ name: c.name, email: c.email || '', city: c.city || '' }); setEditing(c) }
  const openView = async (c: Customer) => { setMenuId(null); try { setViewing(await fetchCustomer(c.id)) } catch (e) { toast((e as Error).message, 'err') } }
  const openWallet = async (c: Customer) => {
    setMenuId(null); setWAmt(''); setWNote(''); setWBal('cash')
    try { setWallet(await fetchCustomer(c.id)) } catch (e) { toast((e as Error).message, 'err') }
  }
  const refreshWallet = async (id: number) => { try { setWallet(await fetchCustomer(id)) } catch { /* ignore */ } }
  const walletAdjust = async (sign: 1 | -1) => {
    const id = wallet?.customer?.id
    const amt = Number(wAmt)
    if (!id || !amt || isNaN(amt) || amt <= 0) { toast('Enter a valid amount', 'err'); return }
    setBusy(true)
    try {
      const res = await adjustWallet(id, sign * amt, wNote || (sign > 0 ? 'Admin credit' : 'Admin debit'), wBal)
      toast(res.pending ? 'Sent for approval — a second admin must sign off' : `${sign > 0 ? 'Credited' : 'Debited'} ${wBal === 'points' ? amt + ' pts' : money(amt)} · ${wBal}`)
      setWAmt(''); setWNote(''); await refreshWallet(id); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }
  const walletStatus = async (st: 'active' | 'frozen' | 'blocked') => {
    const id = wallet?.customer?.id
    if (!id) return
    setBusy(true)
    try { await setWalletStatus(id, st); toast(`Wallet ${st}`); await refreshWallet(id) }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  // Row actions that leave the screen or hit the OS (call / whatsapp / navigate).
  const dialTo = (p?: string) => { if (p) window.location.href = `tel:${p}` }
  const whatsApp = (p?: string) => { if (p) window.open(`https://wa.me/${p.replace(/\D/g, '')}`, '_blank') }
  const viewBookings = (c: Customer) => nav(`/bookings?q=${encodeURIComponent(c.phone || c.name)}`)
  const createBooking = (c: Customer) => { toast('Opening Bookings — create the job for this customer here'); nav(`/bookings?q=${encodeURIComponent(c.phone || c.name)}`) }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<Users size={22} />} tint="#5b51e8" label="Total Customers" value={total.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<UserCheck size={22} />} tint="#16a34a" label="Active Customers" value={active.toLocaleString('en-IN')} sub="status active" />
        <StatCard icon={<UserPlus size={22} />} tint="#2e90fa" label="New Customers" value={newCount.toLocaleString('en-IN')} sub="no repeat yet" />
        <StatCard icon={<Repeat2 size={22} />} tint="#f59e0b" label="Repeat Customers" value={repeat.toLocaleString('en-IN')} sub="2+ bookings" />
        <StatCard icon={<UserX size={22} />} tint="#e5484d" label="Inactive Customers" value={inactive.toLocaleString('en-IN')} sub="blocked / inactive" />
        <StatCard icon={<Star size={22} />} tint="#f59e0b" label="Avg. Rating" value={avgRating} sub="across rated" />
      </div>

      <Card>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search customer by name, mobile or email…" />
          <div className="tb-spacer" />
          <select className="select flt" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
            <option value="inactive">Inactive</option>
          </select>
          <select className="select flt" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="all">All Cities</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="select flt" value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="all">All Zones</option>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <select className="select flt" value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="all">All Segments</option>
            {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn line" onClick={() => toast('More filters coming soon')}><Funnel size={16} /> Filters</button>
          <button className="btn" onClick={() => { setAddDraft(EMPTY_ADD); setAddOpen(true) }}><Plus size={17} /> Add Customer</button>
        </div>

        {(activeChips.length > 0 || sel.size > 0) && (
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '2px 0 12px' }}>
            {activeChips.length > 0 && <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Active Filters:</span>}
            {activeChips.map((ch, i) => (
              <span key={i} className="badge violet" style={{ cursor: 'pointer', gap: 6 }} onClick={ch.clear}>{ch.label}<X size={12} /></span>
            ))}
            {activeChips.length > 0 && <button className="linkbtn" style={{ fontSize: 12, color: '#e5484d', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }} onClick={clearAll}>Clear All</button>}
            <div className="tb-spacer" />
            {sel.size > 0 && <span className="muted" style={{ fontSize: 12 }}>{sel.size} selected</span>}
            <button className="btn line" onClick={() => exportCsv(sel.size ? filtered.filter((c) => sel.has(c.id)) : filtered)}><Download size={15} /> Export</button>
            <button className="btn line" onClick={() => nav('/notifications')}><Send size={15} /> Send Notification</button>
            <div style={{ position: 'relative' }}>
              <button className="btn line" onClick={(e) => { e.stopPropagation(); setMoreOpen((v) => !v) }}><MoreHorizontal size={15} /> More Actions</button>
              {moreOpen && (
                <div className="menu" style={MENU_BOX} onClick={(e) => e.stopPropagation()}>
                  <button className="menu-item" style={MENU_ITEM} onClick={() => { setMoreOpen(false); load() }}><RefreshCw size={15} /> Refresh</button>
                  <button className="menu-item" style={MENU_ITEM} onClick={() => { setMoreOpen(false); exportCsv(filtered) }}><Download size={15} /> Export all ({filtered.length})</button>
                  {sel.size > 0 && <button className="menu-item" style={MENU_ITEM} onClick={() => { setMoreOpen(false); setSel(new Set()) }}><X size={15} /> Clear selection</button>}
                </div>
              )}
            </div>
          </div>
        )}
        {activeChips.length === 0 && sel.size === 0 && (
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn line" onClick={() => exportCsv(filtered)}><Download size={15} /> Export</button>
            <button className="btn line" onClick={() => nav('/notifications')}><Send size={15} /> Send Notification</button>
          </div>
        )}

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allOnPage} onChange={toggleAll} /></th>
                <th>Customer</th>
                <th>Contact</th>
                <th>Location</th>
                <th className="num">Bookings</th>
                <th>Last Booking</th>
                <th className="num">Total Spent</th>
                <th>Segment</th>
                <th>Rating</th>
                <th>Status</th>
                <th>Joined On</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => {
                const seg = c.segment || (c.bookings === 0 ? 'New' : 'Repeat')
                const blocked = (c.status || 'active') !== 'active'
                return (
                  <tr key={c.id}>
                    <td><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggleOne(c.id)} /></td>
                    <td>
                      <div className="cell-user">
                        <Avatar name={c.name || 'Customer'} size={36} />
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ display: 'block' }}>{c.name || <span className="muted">Profile Incomplete</span>}</strong>
                          <Badge tone={SEG_TONE[seg]} dot={false}>{seg}</Badge>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'grid', gap: 2, fontSize: 13 }}>
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Phone size={13} className="muted" />{c.phone || <span className="muted">—</span>}</span>
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#667085' }}><Mail size={13} />{c.email || '—'}</span>
                      </div>
                    </td>
                    <td>
                      {c.city || c.zone ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <MapPin size={14} className="muted" style={{ marginTop: 2, flexShrink: 0 }} />
                          <div style={{ display: 'grid', gap: 1, fontSize: 13 }}>
                            <span>{c.city || '—'}</span>
                            {c.zone && <span className="muted" style={{ fontSize: 12 }}>{c.zone}</span>}
                          </div>
                        </div>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="num">
                      <strong>{c.bookings}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>All Time</div>
                    </td>
                    <td>
                      {c.lastBooking ? (
                        <div style={{ display: 'grid', gap: 1, fontSize: 13 }}>
                          <span>{shortDate(c.lastBooking)}</span>
                          <span className="muted" style={{ fontSize: 12 }}>{shortTime(c.lastBooking)}</span>
                        </div>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="num">{money(c.spend)}</td>
                    <td><Badge tone={SEG_TONE[seg]}>{seg}</Badge></td>
                    <td><Stars rating={c.rating || 0} /></td>
                    <td><Badge tone={blocked ? 'red' : 'green'}>{blocked ? (c.status || 'Inactive') : 'Active'}</Badge></td>
                    <td className="muted">{shortDate(c.joined)}</td>
                    <td>
                      <div className="actions" style={{ position: 'relative' }}>
                        <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={(e) => { e.stopPropagation(); setMenuId(menuId === c.id ? null : c.id) }}><MoreVertical size={18} /></button>
                        {menuId === c.id && (
                          <div className="menu" style={{ ...MENU_BOX, right: 0, top: 34 }} onClick={(e) => e.stopPropagation()}>
                            <button className="menu-item" style={MENU_ITEM} onClick={() => openView(c)}><User size={15} /> View Customer</button>
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); openEdit(c) }}><Pencil size={15} /> Edit Profile</button>
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); createBooking(c) }}><CalendarPlus size={15} /> Create Booking</button>
                            <div style={MENU_SEP} />
                            <button className="menu-item" style={MENU_ITEM} disabled={!c.phone} onClick={() => { setMenuId(null); dialTo(c.phone) }}><Phone size={15} /> Call</button>
                            <button className="menu-item" style={MENU_ITEM} disabled={!c.phone} onClick={() => { setMenuId(null); whatsApp(c.phone) }}><MessageCircle size={15} /> WhatsApp</button>
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); viewBookings(c) }}><Eye size={15} /> View Bookings</button>
                            <button className="menu-item" style={MENU_ITEM} onClick={() => openWallet(c)}><WalletIcon size={15} /> Wallet &amp; Payments</button>
                            <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuId(null); setNoteText(''); setNoteFor(c) }}><StickyNote size={15} /> Add Note</button>
                            <div style={MENU_SEP} />
                            <button className="menu-item" style={{ ...MENU_ITEM, color: '#e5484d' }} onClick={() => { setMenuId(null); toggleBlock(c) }}><Ban size={15} /> {blocked ? 'Unblock' : 'Block'} Customer</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {pageRows.length === 0 && <tr><td colSpan={12} className="muted" style={{ textAlign: 'center', padding: 28 }}>No customers match these filters.</td></tr>}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="customers" onPage={setPage} onSize={setPageSize} />
      </Card>

      {addOpen && (
        <Modal title="Add Customer" onClose={() => setAddOpen(false)} footer={
          <>
            <button className="btn line" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy || addDraft.phone.trim().length < 6} onClick={addCustomer}>Add Customer</button>
          </>
        }>
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Name"><input value={addDraft.name} onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })} placeholder="Full name" /></Field>
            <Field label="Mobile Number"><input value={addDraft.phone} onChange={(e) => setAddDraft({ ...addDraft, phone: e.target.value })} placeholder="10-digit mobile" /></Field>
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

      {noteFor && (
        <Modal title={`Add Note — ${noteFor.name || 'Customer'}`} onClose={() => setNoteFor(null)} footer={
          <>
            <button className="btn line" onClick={() => setNoteFor(null)}>Cancel</button>
            <button className="btn" disabled={busy || !noteText.trim()} onClick={saveNote}>Save Note</button>
          </>
        }>
          <Field label="Internal note (visible to admins only)">
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} placeholder="e.g. Prefers morning slots; called about a refund on 12 Jul." style={{ resize: 'vertical' }} />
          </Field>
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

            {(() => {
              const pos = parseLatLng(viewing.customer?.location)
              return pos
                ? <div className="field"><span>Live Location</span><MiniMap lat={pos.lat} lng={pos.lng} label={viewing.customer?.city || ''} /></div>
                : <Field label="Live Location"><input value="Not shared yet" readOnly /></Field>
            })()}

            {(viewing.notes || []).length > 0 && (
              <div className="field"><span>Admin Notes ({viewing.notes.length})</span>
                <div className="grid" style={{ gap: 6, marginTop: 4 }}>
                  {viewing.notes.map((n: any) => (
                    <div key={n.id} style={{ background: '#f9fafb', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
                      <div>{n.body}</div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{n.author || 'admin'} · {shortDate(n.created)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

      {wallet && (
        <Modal title={`Wallet — ${wallet.customer?.name || ''}`} onClose={() => setWallet(null)} wide>
          <div className="grid" style={{ gap: 14 }}>
            <div className="stat-row">
              <StatCard icon={<span>💵</span>} tint="#16a34a" label="Cash Balance" value={money(wallet.customer?.wallet || 0)} sub="added / refunds" />
              <StatCard icon={<span>🎁</span>} tint="#5b51e8" label="Promo Balance" value={money(wallet.customer?.promoBalance || 0)} sub="cashback / referral" />
              <StatCard icon={<span>⭐</span>} tint="#f59e0b" label="Reward Points" value={(wallet.customer?.rewardPoints || 0).toLocaleString('en-IN')} sub="loyalty" />
            </div>

            <div className="row" style={{ gap: 12, alignItems: 'center' }}>
              <span>Wallet status:</span>
              <Badge tone={(wallet.customer?.walletStatus || 'active') === 'active' ? 'green' : wallet.customer?.walletStatus === 'blocked' ? 'red' : undefined}>{(wallet.customer?.walletStatus || 'active').toUpperCase()}</Badge>
              <div className="tb-spacer" />
              <button className="btn line" disabled={busy} onClick={() => walletStatus('active')}>Activate</button>
              <button className="btn line" disabled={busy} onClick={() => walletStatus('frozen')}>Freeze</button>
              <button className="btn line" disabled={busy} onClick={() => walletStatus('blocked')}>Block</button>
            </div>

            <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="Balance"><select className="select" value={wBal} onChange={(e) => setWBal(e.target.value as 'cash' | 'promo' | 'points')}><option value="cash">Cash</option><option value="promo">Promo</option><option value="points">Reward Points</option></select></Field>
              <Field label={wBal === 'points' ? 'Points' : 'Amount (₹)'}><input type="number" value={wAmt} onChange={(e) => setWAmt(e.target.value)} placeholder={wBal === 'points' ? '100' : '500'} /></Field>
              <Field label="Note / reason"><input value={wNote} onChange={(e) => setWNote(e.target.value)} placeholder="Reason / reference" /></Field>
              <button className="btn" disabled={busy || !wAmt.trim()} onClick={() => walletAdjust(1)}>Credit</button>
              <button className="btn line" disabled={busy || !wAmt.trim()} onClick={() => walletAdjust(-1)}>Debit</button>
            </div>

            <div className="field"><span>Transactions ({(wallet.transactions || []).length})</span></div>
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr><th>Title</th><th>Kind</th><th>Balance</th><th className="num">Amount</th><th className="num">Bal After</th><th>Date</th></tr></thead>
                <tbody>
                  {(wallet.transactions || []).slice(0, 40).map((t: any) => (
                    <tr key={t.id}>
                      <td>{t.title || '—'}</td>
                      <td className="muted">{t.kind || t.type}</td>
                      <td className="muted">{t.balance_type || 'cash'}</td>
                      <td className="num" style={{ color: t.type === 'credit' ? '#16a34a' : '#e5484d' }}>{t.type === 'credit' ? '+' : '-'}{money(t.amount || 0)}</td>
                      <td className="num">{money(t.balance || 0)}</td>
                      <td className="muted">{shortDate(t.created)}</td>
                    </tr>
                  ))}
                  {(!wallet.transactions || wallet.transactions.length === 0) && <tr><td colSpan={6} className="muted">No transactions</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

const MENU_BOX: CSSProperties = { position: 'absolute', zIndex: 30, background: '#fff', border: '1px solid var(--line, #e4e7ec)', borderRadius: 10, boxShadow: '0 12px 28px rgba(16,24,40,.14)', minWidth: 190, padding: 5, top: 40 }
const MENU_ITEM: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, color: 'inherit' }
const MENU_SEP: CSSProperties = { height: 1, background: 'var(--line, #eef0f3)', margin: '4px 2px' }
