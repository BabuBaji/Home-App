import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Pencil, ChevronDown, ChevronLeft, ChevronRight, Star, StarHalf, Phone, Mail, Calendar,
  Wallet as WalletIcon, Briefcase, LayoutGrid, MapPin, BadgeCheck, Tag, Headphones, StickyNote, Activity,
  User, CalendarPlus, CreditCard, RotateCcw, CheckCircle2, Gift, Plus, Ban, Send, Users2, Clock, TrendingUp, Award,
  Search, XCircle, RefreshCw, Eye, Download, Home, Building2, Copy, Archive, MoreVertical, FileText, Funnel,
} from 'lucide-react'
import { fetchCustomer, updateCustomer, adjustWallet, setWalletStatus, addCustomerNote, addCustomerAddress, updateCustomerAddress, setCustomerAddressDefault, changeCustomerMembership } from '../api'
import { Card, Badge, Avatar, Loading, ErrorState, Modal, Field, useToast, money, shortDate } from '../components/UI'

const SEG_TONE: Record<string, string> = { New: 'blue', Repeat: 'green', Loyal: 'violet', VIP: 'amber', 'At Risk': 'red', Inactive: 'gray' }
const ACTIVE_STATUSES = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']
const dateTime = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const timeAgoDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const daysSince = (s?: string | null) => (s ? Math.max(0, Math.floor((Date.now() - Date.parse(s)) / 86400000)) : null)

function Stars({ rating, size = 15 }: { rating: number; size?: number }) {
  const full = Math.floor(rating + 1e-6); const half = rating - full >= 0.5
  return (
    <span style={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}>
      {[0, 1, 2, 3, 4].map((i) => i < full
        ? <Star key={i} size={size} fill="#f59e0b" stroke="#f59e0b" />
        : i === full && half ? <StarHalf key={i} size={size} fill="#f59e0b" stroke="#f59e0b" />
          : <Star key={i} size={size} fill="none" stroke="#d0d5dd" />)}
    </span>
  )
}

// lucide dropped brand icons, so the WhatsApp mark is an inline glyph. fill=currentColor lets the
// caller colour it via `style`/parent colour (so it works both standalone and in the Quick Actions list).
function WhatsAppIcon({ size = 16, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" style={style} aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.512 5.26l-.999 3.648 3.985-1.005-.001-.002zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
    </svg>
  )
}

type Ev = { icon: ReactNode; tint: string; title: ReactNode; sub?: string; time: string }
function buildActivity(bookings: any[], txns: any[]): Ev[] {
  const evs: Ev[] = []
  for (const t of txns) {
    const amt = money(t.amount || 0)
    if (t.kind === 'ADD_MONEY') evs.push({ icon: <WalletIcon size={15} />, tint: '#16a34a', title: `Wallet top-up of ${amt}`, time: t.created })
    else if (t.kind === 'WELCOME_BONUS') evs.push({ icon: <Gift size={15} />, tint: '#5b51e8', title: `Welcome bonus ${amt}`, time: t.created })
    else if (t.kind === 'REFUND' || /refund/i.test(t.title || '')) evs.push({ icon: <RotateCcw size={15} />, tint: '#f59e0b', title: `Refund of ${amt}`, sub: t.ref || '', time: t.created })
    else if (t.type === 'debit') evs.push({ icon: <CreditCard size={15} />, tint: '#2e90fa', title: `Payment of ${amt} completed`, sub: t.title || t.ref || '', time: t.created })
    else evs.push({ icon: <CreditCard size={15} />, tint: '#2e90fa', title: `${t.title || 'Credit'} ${amt}`, time: t.created })
  }
  for (const b of bookings) {
    evs.push({ icon: <CalendarPlus size={15} />, tint: '#5b51e8', title: 'Booking created', sub: b.service || b.ref, time: b.created })
    if (b.completed_at || b.status === 'completed') evs.push({ icon: <CheckCircle2 size={15} />, tint: '#16a34a', title: 'Booking completed', sub: b.service || b.ref, time: b.completed_at || b.created })
    if (b.rating) evs.push({ icon: <Star size={15} />, tint: '#f59e0b', title: `Review submitted · ${b.rating}★`, sub: b.review || b.service, time: b.completed_at || b.created })
  }
  return evs.filter((e) => e.time).sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
}

const TABS = [
  { key: 'overview', label: 'Overview', Icon: LayoutGrid },
  { key: 'bookings', label: 'Bookings', Icon: Calendar },
  { key: 'addresses', label: 'Addresses', Icon: MapPin },
  { key: 'wallet', label: 'Wallet & Payments', Icon: WalletIcon },
  { key: 'membership', label: 'Membership', Icon: Award },
  { key: 'offers', label: 'Offers & Coupons', Icon: Tag },
  { key: 'support', label: 'Support & Complaints', Icon: Headphones },
  { key: 'ratings', label: 'Ratings & Feedback', Icon: Star },
  { key: 'notes', label: 'Notes', Icon: StickyNote },
  { key: 'activity', label: 'Activity Logs', Icon: Activity },
] as const

export default function AdminCustomerDetail() {
  const { id } = useParams()
  const cid = Number(id)
  const nav = useNavigate()
  const toast = useToast()
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<string>('overview')
  const [moreOpen, setMoreOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editDraft, setEditDraft] = useState({ name: '', email: '', city: '', gender: '', language: '' })
  const [moneyOpen, setMoneyOpen] = useState(false)
  const [mBal, setMBal] = useState<'cash' | 'promo'>('cash')
  const [mAmt, setMAmt] = useState(''); const [mNote, setMNote] = useState('')
  const openMoney = (bal: 'cash' | 'promo') => { setMBal(bal); setMAmt(''); setMNote(''); setMoneyOpen(true) }
  const [noteOpen, setNoteOpen] = useState(false); const [noteText, setNoteText] = useState('')
  const [wAmt, setWAmt] = useState(''); const [wNote, setWNote] = useState(''); const [wBal, setWBal] = useState<'cash' | 'promo' | 'points'>('cash')

  const load = () => { setErr(''); fetchCustomer(cid).then(setD).catch((e: Error) => setErr(e.message)) }
  useEffect(() => { if (Number.isFinite(cid)) load() /* eslint-disable-next-line */ }, [cid])
  useEffect(() => {
    if (!moreOpen) return
    const h = () => setMoreOpen(false); window.addEventListener('click', h); return () => window.removeEventListener('click', h)
  }, [moreOpen])

  const m = useMemo(() => {
    if (!d) return null
    const c = d.customer || {}
    const bookings: any[] = d.bookings || []
    const txns: any[] = d.transactions || []
    const paid = bookings.filter((b) => b.payment_status === 'paid' || b.status === 'completed')
    const spend = paid.reduce((a, b) => a + (b.total || 0), 0)
    const cancelled = bookings.filter((b) => b.status === 'cancelled')
    const active = bookings.filter((b) => ACTIVE_STATUSES.includes(b.status))
    const refunds = txns.filter((t) => t.kind === 'REFUND' || /refund/i.test(t.title || '')).reduce((a, t) => a + (t.amount || 0), 0)
    const reviews = bookings.filter((b) => b.rating)
    const rating = c.rating || 0
    const firstBooking = bookings.length ? bookings.reduce((mn, b) => (Date.parse(b.created) < Date.parse(mn) ? b.created : mn), bookings[0].created) : null
    const lastEvent = [...bookings.map((b) => b.created), ...txns.map((t) => t.created)].filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null
    // service preference counts
    const svc: Record<string, number> = {}
    for (const b of bookings) for (const it of (b.items?.length ? b.items : [{ name: b.service }])) { const n = it?.name; if (n) svc[n] = (svc[n] || 0) + 1 }
    const topServices = Object.entries(svc).sort((a, b) => b[1] - a[1]).slice(0, 4)
    // current / upcoming
    const now = Date.now()
    const activeBooking = active.slice().sort((a, b) => Date.parse(b.created) - Date.parse(a.created))[0] || null
    const upcoming = bookings.filter((b) => b.status === 'confirmed' && b !== activeBooking)
      .sort((a, b) => Date.parse(a.created) - Date.parse(b.created))[0] || null
    // derived segment/tags
    const segment = c.segment || (bookings.length === 0 ? 'New' : bookings.length >= 5 ? 'Loyal' : 'Repeat')
    const tags: { label: string; tone: string }[] = [{ label: segment, tone: SEG_TONE[segment] || 'gray' }]
    if (spend >= 2000) tags.push({ label: 'High Spender', tone: 'amber' })
    if (bookings.length >= 3) tags.push({ label: 'Regular', tone: 'blue' })
    tags.push(rating >= 4 ? { label: 'No Issues', tone: 'green' } : rating > 0 ? { label: 'Needs Attention', tone: 'red' } : { label: 'New', tone: 'gray' })
    const defAddr = (d.addresses || []).find((a: any) => a.is_default) || (d.addresses || [])[0] || null
    return {
      c, bookings, txns, spend, cancelled, active, activeBooking, upcoming, refunds, reviews, rating, firstBooking, lastEvent,
      topServices, segment, tags, defAddr, activity: buildActivity(bookings, txns),
      referrals: d.referrals || { joined: 0, pending: 0 }, referredByName: d.referrals?.referredByName || null, notesList: d.notes || [],
    }
  }, [d])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d || !m) return <Loading />
  const { c } = m
  const blocked = (c.status || 'active') !== 'active'

  const doEdit = async () => {
    setBusy(true)
    try { await updateCustomer(cid, editDraft); toast('Profile updated'); setEditOpen(false); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }
  const doAddMoney = async () => {
    const amt = Number(mAmt); if (!amt) { toast('Enter an amount', 'err'); return }
    setBusy(true)
    try { const r = await adjustWallet(cid, amt, mNote || (mBal === 'promo' ? 'Bonus from admin' : 'Added by admin'), mBal); toast(r.pending ? 'Sent for approval' : mBal === 'promo' ? 'Bonus sent to customer' : 'Wallet credited'); setMoneyOpen(false); setMAmt(''); setMNote(''); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }
  const doNote = async () => {
    if (!noteText.trim()) return
    setBusy(true)
    try { await addCustomerNote(cid, noteText.trim()); toast('Note added'); setNoteOpen(false); setNoteText(''); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }
  const doBlock = async () => {
    const next = blocked ? 'active' : 'blocked'
    try { await updateCustomer(cid, { status: next }); toast(blocked ? 'Customer unblocked' : 'Customer blocked'); load() }
    catch (e) { toast((e as Error).message, 'err') }
  }
  const walletAdjust = async (sign: 1 | -1) => {
    const amt = Number(wAmt); if (!amt || amt <= 0) { toast('Enter a valid amount', 'err'); return }
    setBusy(true)
    try {
      const r = await adjustWallet(cid, sign * amt, wNote || (sign > 0 ? 'Admin credit' : 'Admin debit'), wBal)
      toast(r.pending ? 'Sent for approval' : `${sign > 0 ? 'Credited' : 'Debited'} ${wBal === 'points' ? amt + ' pts' : money(amt)}`)
      setWAmt(''); setWNote(''); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }
  const dialTo = () => { if (c.phone) window.location.href = `tel:${c.phone}` }
  const whatsApp = () => { if (c.phone) window.open(`https://wa.me/${String(c.phone).replace(/\D/g, '')}`, '_blank') }
  const openEdit = () => { setEditDraft({ name: c.name || '', email: c.email || '', city: c.city || '', gender: c.gender || '', language: c.language || '' }); setEditOpen(true) }
  const onComm = async (key: string, val: boolean) => {
    try { await updateCustomer(cid, { [`comm_${key}`]: val }); load() }
    catch (e) { toast((e as Error).message, 'err') }
  }

  const kpi = (icon: ReactNode, tint: string, label: string, value: ReactNode, action?: ReactNode) => (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center', color: '#667085', fontSize: 13, fontWeight: 600 }}>
        <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 8, background: `${tint}18`, color: tint, alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
        {label}
      </div>
      <strong style={{ fontSize: 24, lineHeight: 1 }}>{value}</strong>
      {action}
    </div>
  )

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="linkbtn" style={{ background: 'none', border: 'none', color: '#5b51e8', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={() => nav('/customers')}>
          <ArrowLeft size={16} /> Back to Customers
        </button>
        <div className="row" style={{ gap: 8, position: 'relative' }}>
          <button className="btn line" onClick={openEdit}><Pencil size={15} /> Edit Profile</button>
          <button className="btn line" onClick={(e) => { e.stopPropagation(); setMoreOpen((v) => !v) }}>More Actions <ChevronDown size={15} /></button>
          {moreOpen && (
            <div className="menu" style={MENU_BOX} onClick={(e) => e.stopPropagation()}>
              <button className="menu-item" style={MENU_ITEM} onClick={() => { setMoreOpen(false); setMoneyOpen(true) }}><Plus size={15} /> Add Money</button>
              <button className="menu-item" style={MENU_ITEM} onClick={() => { setMoreOpen(false); setNoteOpen(true) }}><StickyNote size={15} /> Add Note</button>
              <button className="menu-item" style={MENU_ITEM} onClick={() => { setMoreOpen(false); nav(`/bookings?q=${encodeURIComponent(c.phone || c.name)}`) }}><Calendar size={15} /> View Bookings</button>
              <div style={MENU_SEP} />
              <button className="menu-item" style={{ ...MENU_ITEM, color: '#e5484d' }} onClick={() => { setMoreOpen(false); doBlock() }}><Ban size={15} /> {blocked ? 'Unblock' : 'Block'} Customer</button>
            </div>
          )}
        </div>
      </div>

      {/* header + KPI */}
      <div className="card" style={{ padding: 20 }}>
        <div className="row" style={{ gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 16, alignItems: 'flex-start', flex: '1 1 300px', minWidth: 260 }}>
            <Avatar name={c.name || 'Customer'} size={72} />
            <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'nowrap' }}>
              <h2 style={{ margin: 0, fontSize: 22, whiteSpace: 'nowrap' }}>{c.name || c.phone || 'Unnamed Customer'}</h2>
              <Badge tone={blocked ? 'red' : 'green'}>{blocked ? (c.status || 'Inactive') : 'Active'}</Badge>
            </div>
            <div className="row" style={{ gap: 10, alignItems: 'center', margin: '8px 0', flexWrap: 'wrap' }}>
              <Badge tone={SEG_TONE[m.segment]} dot={false}>{m.segment}</Badge>
              <Stars rating={m.rating} />
              <strong style={{ fontSize: 14 }}>{m.rating ? m.rating.toFixed(1) : '—'}</strong>
              <span className="muted" style={{ fontSize: 13 }}>({m.reviews.length} Reviews)</span>
            </div>
            <div className="row" style={{ gap: 18, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: '#475467' }}>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Phone size={14} className="muted" />{c.phone || '—'}</span>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Mail size={14} className="muted" />{c.email || '—'}</span>
              {c.phone && <button className="iconbtn" title="WhatsApp" style={{ width: 26, height: 26, color: '#25D366' }} onClick={whatsApp}><WhatsAppIcon size={17} /></button>}
            </div>
            <div className="row" style={{ gap: 18, marginTop: 8, fontSize: 12.5, color: '#667085', flexWrap: 'wrap' }}>
              <span>Customer ID: <strong style={{ color: '#344054' }}>{c.displayId}</strong></span>
              <span>Joined on: <strong style={{ color: '#344054' }}>{dateTime(c.created)}</strong></span>
            </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 12, flex: '2 1 540px' }}>
            {kpi(<Calendar size={16} />, '#5b51e8', 'Total Bookings', m.bookings.length, <span className="muted" style={{ fontSize: 12 }}>All Time</span>)}
            {kpi(<CreditCard size={16} />, '#16a34a', 'Total Spent', money(m.spend), <span className="muted" style={{ fontSize: 12 }}>All Time</span>)}
            {kpi(<WalletIcon size={16} />, '#2e90fa', 'Wallet Balance', money(c.wallet || 0), <button className="linkbtn" style={LINK} onClick={() => setMoneyOpen(true)}>+ Add Money</button>)}
            {kpi(<Briefcase size={16} />, '#f59e0b', 'Active Bookings', m.active.length, <button className="linkbtn" style={LINK} onClick={() => setTab('bookings')}>View Details</button>)}
          </div>
        </div>
      </div>

      {/* tab bar — all tabs share the row and shrink to fit (no horizontal scroll) */}
      <div className="card" style={{ padding: '0 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)} title={label} style={{
              flex: '0 1 auto', minWidth: 0,
              display: 'inline-flex', gap: 5, alignItems: 'center', justifyContent: 'center',
              padding: '12px 8px', background: 'none', border: 'none',
              borderBottom: tab === key ? '2px solid #5b51e8' : '2px solid transparent', color: tab === key ? '#5b51e8' : '#667085',
              fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              <Icon size={14} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <Overview m={m} c={c} nav={nav} onNote={() => setNoteOpen(true)} onMoney={() => setMoneyOpen(true)} onBlock={doBlock} onCall={dialTo} onWa={whatsApp} onComm={onComm} blocked={blocked} goto={setTab} />}
      {tab === 'bookings' && <BookingsTab bookings={m.bookings} nav={nav} c={c} toast={toast} />}
      {tab === 'addresses' && <AddressesTab addresses={d.addresses || []} bookings={m.bookings} c={c} cid={cid} onChanged={load} toast={toast} />}
      {tab === 'wallet' && <WalletTab c={c} txns={m.txns} bookings={m.bookings} paymentMethods={d.paymentMethods || []} onAddMoney={() => openMoney('cash')} onSend={() => openMoney('promo')} goto={setTab} wAmt={wAmt} setWAmt={setWAmt} wNote={wNote} setWNote={setWNote} wBal={wBal} setWBal={setWBal} busy={busy} onAdjust={walletAdjust} onStatus={async (s: 'active' | 'frozen' | 'blocked') => { try { await setWalletStatus(cid, s); toast(`Wallet ${s}`); load() } catch (e) { toast((e as Error).message, 'err') } }} />}
      {tab === 'membership' && <MembershipTab membership={d.membership} plans={d.membershipPlans || []} ledger={d.membershipLedger || []} c={c} cid={cid} paymentMethods={d.paymentMethods || []} onChanged={load} toast={toast} nav={nav} goto={setTab} />}
      {tab === 'offers' && <OffersTab bookings={m.bookings} offers={d.offers || { totalOffers: 0, coupons: [] }} c={c} nav={nav} toast={toast} goto={setTab} />}
      {tab === 'support' && <SupportTab bookings={m.bookings} nav={nav} />}
      {tab === 'ratings' && <RatingsTab reviews={m.reviews} rating={m.rating} />}
      {tab === 'notes' && <NotesTab notes={d.notes || []} onAdd={() => setNoteOpen(true)} />}
      {tab === 'activity' && <ActivityTab activity={m.activity} />}

      {/* modals */}
      {editOpen && (
        <Modal title="Edit Profile" onClose={() => setEditOpen(false)} footer={<><button className="btn line" onClick={() => setEditOpen(false)}>Cancel</button><button className="btn" disabled={busy || !editDraft.name.trim()} onClick={doEdit}>Save</button></>}>
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Name"><input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></Field>
            <Field label="Email"><input value={editDraft.email} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} /></Field>
            <Field label="City"><input value={editDraft.city} onChange={(e) => setEditDraft({ ...editDraft, city: e.target.value })} /></Field>
            <div className="row" style={{ gap: 12 }}>
              <Field label="Gender"><select className="select" value={editDraft.gender} onChange={(e) => setEditDraft({ ...editDraft, gender: e.target.value })}><option value="">Not set</option><option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option></select></Field>
              <Field label="Preferred Language"><select className="select" value={editDraft.language} onChange={(e) => setEditDraft({ ...editDraft, language: e.target.value })}><option value="">Not set</option><option>English</option><option>Hindi</option><option>Telugu</option><option>Tamil</option><option>Kannada</option><option>Marathi</option><option>Bengali</option></select></Field>
            </div>
          </div>
        </Modal>
      )}
      {moneyOpen && (
        <Modal title={mBal === 'promo' ? 'Send to Customer' : 'Add Money'} onClose={() => setMoneyOpen(false)} footer={<><button className="btn line" onClick={() => setMoneyOpen(false)}>Cancel</button><button className="btn" disabled={busy || !mAmt.trim()} onClick={doAddMoney}>{mBal === 'promo' ? 'Send Bonus' : 'Add Money'}</button></>}>
          <div className="grid" style={{ gap: 12 }}>
            <Field label={mBal === 'promo' ? 'Current Promo Balance' : 'Current Cash Balance'}><input value={money(mBal === 'promo' ? (c.promoBalance || 0) : (c.wallet || 0))} readOnly /></Field>
            <Field label="Amount (₹)"><input type="number" value={mAmt} onChange={(e) => setMAmt(e.target.value)} placeholder="500" /></Field>
            <Field label="Note"><input value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder={mBal === 'promo' ? 'Reason for the bonus' : 'Reason / reference'} /></Field>
            {mBal === 'promo' && <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>Sent as promo credit — usable at checkout, not withdrawable.</p>}
          </div>
        </Modal>
      )}
      {noteOpen && (
        <Modal title="Add Note" onClose={() => setNoteOpen(false)} footer={<><button className="btn line" onClick={() => setNoteOpen(false)}>Cancel</button><button className="btn" disabled={busy || !noteText.trim()} onClick={doNote}>Save Note</button></>}>
          <Field label="Internal note (admins only)"><textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} placeholder="e.g. Prefers morning slots." style={{ resize: 'vertical' }} /></Field>
        </Modal>
      )}
    </div>
  )
}

/* ============================ Overview tab ============================ */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on} style={{
      width: 40, height: 22, borderRadius: 22, border: 'none', cursor: 'pointer', padding: 2,
      background: on ? '#16a34a' : '#cbd2da', transition: 'background .15s', display: 'inline-flex', justifyContent: on ? 'flex-end' : 'flex-start',
    }}><span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', display: 'block', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} /></button>
  )
}

function Overview({ m, c, nav, onNote, onMoney, onBlock, onCall, onWa, onComm, blocked, goto }: any) {
  const comm = c.comm || { whatsapp: true, sms: true, email: true, push: true, promo: true }
  const CHANNELS: [string, string][] = [['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['email', 'Email'], ['push', 'Push Notifications'], ['promo', 'Promotional Offers']]
  const info: [string, ReactNode][] = [
    ['Full Name', c.name || '—'],
    ['Mobile Number', <span className="row" style={{ gap: 8, alignItems: 'center' }}>{c.phone || '—'}{c.phone && <Badge tone="green" dot={false}>Verified</Badge>}</span>],
    ['Email Address', <span className="row" style={{ gap: 8, alignItems: 'center' }}>{c.email || '—'}{c.provider === 'google' && c.email ? <Badge tone="green" dot={false}>Verified</Badge> : c.email ? <Badge tone="gray" dot={false}>Unverified</Badge> : null}</span>],
    ['Date of Birth', c.dob ? shortDate(c.dob) : <span className="muted">Not set</span>],
    ['Gender', c.gender || <span className="muted">Not set</span>],
    ['Preferred Language', c.language || <span className="muted">Not set</span>],
    ['Registration Source', c.provider === 'google' ? 'Google' : c.provider === 'phone' ? 'Mobile App (OTP)' : (c.provider || '—')],
    ['Referred By', m.referredByName ?? <span className="muted">—</span>],
    ['Customer Segment', <Badge tone={SEG_TONE[m.segment]} dot={false}>{m.segment}</Badge>],
    ['Status', <Badge tone={blocked ? 'red' : 'green'}>{blocked ? (c.status || 'Inactive') : 'Active'}</Badge>],
  ]
  const totalBk = m.bookings.length
  const quick = [
    { label: 'Create New Booking', Icon: CalendarPlus, tint: '#5b51e8', on: () => nav(`/bookings?q=${encodeURIComponent(c.phone || c.name)}`) },
    { label: 'Call Customer', Icon: Phone, tint: '#2e90fa', on: onCall },
    { label: 'Send WhatsApp Message', Icon: WhatsAppIcon, tint: '#25D366', on: onWa },
    { label: 'Add Note', Icon: StickyNote, tint: '#f59e0b', on: onNote },
    { label: 'View All Bookings', Icon: Calendar, tint: '#5b51e8', on: () => goto('bookings') },
    { label: 'View Wallet & Payments', Icon: WalletIcon, tint: '#2e90fa', on: () => goto('wallet') },
    { label: 'Send Offer / Coupon', Icon: Tag, tint: '#7c3aed', on: () => nav('/campaigns') },
    { label: blocked ? 'Unblock Customer' : 'Block Customer', Icon: Ban, tint: '#e5484d', on: onBlock, danger: true },
  ]

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
        {/* Customer Information */}
        <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><User size={16} /> Customer Information</span>}>
          <div className="grid" style={{ gap: 10 }}>
            {info.map(([k, v], i) => (
              <div key={i} className="row" style={{ justifyContent: 'space-between', gap: 12, fontSize: 13.5 }}>
                <span className="muted">{k}</span><span style={{ textAlign: 'right', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Current & Upcoming */}
        <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><Clock size={16} /> Current &amp; Upcoming</span>}>
          <div className="grid" style={{ gap: 12 }}>
            {m.activeBooking ? <BookingMini b={m.activeBooking} accent="#16a34a" heading="Active Booking" nav={nav} /> : <Empty small>No active booking</Empty>}
            {m.upcoming && <BookingMini b={m.upcoming} accent="#2e90fa" heading="Upcoming Booking" nav={nav} />}
            <button className="btn line" style={{ width: '100%', justifyContent: 'center' }} onClick={() => goto('bookings')}>View All Bookings <ChevronRight size={15} /></button>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><Activity size={16} /> Recent Activity</span>} right={<button className="linkbtn" style={LINK} onClick={() => goto('activity')}>View All</button>}>
          <Timeline evs={m.activity.slice(0, 5)} />
          <button className="btn line" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => goto('activity')}>View All Activity <ChevronRight size={15} /></button>
        </Card>

        {/* Quick Actions */}
        <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><LayoutGrid size={16} /> Quick Actions</span>}>
          <div className="grid" style={{ gap: 8 }}>
            {quick.map((q, i) => (
              <button key={i} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '11px 12px', border: '1px solid var(--line)', borderRadius: 10, background: '#fff', cursor: 'pointer', color: q.danger ? '#e5484d' : 'inherit' }} onClick={q.on}>
                <span className="row" style={{ gap: 10, alignItems: 'center', fontSize: 13.5, fontWeight: 500 }}><q.Icon size={16} style={{ color: q.tint }} /> {q.label}</span>
                <ChevronRight size={15} className="muted" />
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
        {/* Spending Summary */}
        <Card title="Spending Summary">
          <div className="grid" style={{ gap: 9, fontSize: 13.5 }}>
            <Row k="Total Spent" v={<strong>{money(m.spend)}</strong>} />
            <Row k="Average Order Value" v={money(m.bookings.length ? Math.round(m.spend / Math.max(1, m.bookings.filter((b: any) => b.payment_status === 'paid' || b.status === 'completed').length || 1)) : 0)} />
            <Row k="Total Bookings" v={m.bookings.length} />
            <Row k="Cancelled Bookings" v={m.cancelled.length} />
            <Row k="Refunds" v={money(m.refunds)} />
          </div>
          <button className="btn line" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => goto('wallet')}>View Payment History <ChevronRight size={15} /></button>
        </Card>

        {/* Service Preferences */}
        <Card title="Service Preferences">
          {m.topServices.length === 0 ? <Empty small>No bookings yet</Empty> : (
            <div className="grid" style={{ gap: 12 }}>
              {m.topServices.map(([name, n]: [string, number]) => {
                const pct = Math.round((n / totalBk) * 100)
                return (
                  <div key={name} className="grid" style={{ gap: 5 }}>
                    <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}><span>{name}</span><span className="muted">{n} ({pct}%)</span></div>
                    <span style={{ height: 7, borderRadius: 6, background: '#eef0f4', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${pct}%`, background: '#16a34a', borderRadius: 6 }} /></span>
                  </div>
                )
              })}
            </div>
          )}
          <button className="btn line" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => goto('bookings')}>View All Services <ChevronRight size={15} /></button>
        </Card>

        {/* Communication Preferences (real, per-channel opt-in) */}
        <Card title="Communication Preferences">
          <div className="grid" style={{ gap: 11 }}>
            {CHANNELS.map(([key, label]) => {
              const noContact = (key === 'email' && !c.email) || ((key === 'whatsapp' || key === 'sms') && !c.phone)
              return (
                <div key={key} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13.5 }}>{label}{noContact && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>(no contact on file)</span>}</span>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <span className="muted" style={{ fontSize: 11.5, minWidth: 52, textAlign: 'right' }}>{comm[key] ? 'Enabled' : 'Disabled'}</span>
                    <Toggle on={!!comm[key]} onChange={(v) => onComm(key, v)} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Notes + Tags + Address rail */}
        <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
          <Card title="Notes" right={<button className="linkbtn" style={LINK} onClick={() => goto('notes')}>View All</button>}>
            <LatestNote m={m} />
          </Card>
          <Card title="Customer Tags">
            <div className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
              {m.tags.map((t: any, i: number) => <Badge key={i} tone={t.tone} dot={false}>{t.label}</Badge>)}
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Tags are derived automatically from activity, spend and ratings.</p>
          </Card>
          <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><MapPin size={15} /> Default Address</span>} right={<button className="linkbtn" style={LINK} onClick={() => goto('addresses')}>View All</button>}>
            {m.defAddr ? (
              <div style={{ fontSize: 13.5 }}>
                <div>{m.defAddr.line || [m.defAddr.house, m.defAddr.street, m.defAddr.city].filter(Boolean).join(', ')}</div>
                {m.defAddr.pincode && <div className="muted">{m.defAddr.city ? m.defAddr.city + ' — ' : ''}{m.defAddr.pincode}</div>}
                {m.defAddr.receiver_phone && <div className="muted">{m.defAddr.receiver_phone}</div>}
                <div style={{ marginTop: 6 }}><Badge tone="violet" dot={false}>Default</Badge></div>
              </div>
            ) : <Empty small>No address saved</Empty>}
          </Card>
        </div>
      </div>

      {/* bottom strip */}
      <div className="card" style={{ padding: 0 }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Strip Icon={Clock} label="Last Activity" value={timeAgoDate(m.lastEvent)} sub={c.city ? `${c.city}` : '—'} />
          <Strip Icon={TrendingUp} label="Lifetime Value" value={money(m.spend)} sub="All-time bookings" />
          <Strip Icon={Calendar} label="Customer Since" value={timeAgoDate(c.created)} sub={m.firstBooking ? `First booking ${shortDate(m.firstBooking)}` : 'No bookings yet'} />
          <Strip Icon={Users2} label="Total Referrals" value={(m.referrals?.joined ?? 0)} sub={`${m.referrals?.joined ?? 0} joined · ${m.referrals?.pending ?? 0} pending`} />
          <Strip Icon={BadgeCheck} label="Source" value={c.provider === 'google' ? 'Google' : 'Mobile App'} sub={c.country || 'IN'} />
        </div>
      </div>
    </div>
  )
}

function LatestNote({ m }: any) {
  const note = m.notesList?.[0]
  if (!note) return <Empty small>No notes yet</Empty>
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
      <div>{note.body}</div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>Added by {note.author || 'admin'} · {dateTime(note.created)}</div>
    </div>
  )
}

/* ============================ shared bits ============================ */
function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}><span className="muted">{k}</span><span style={{ fontWeight: 500 }}>{v}</span></div>
}
function Empty({ children, small }: { children: ReactNode; small?: boolean }) {
  return <div className="muted" style={{ textAlign: 'center', padding: small ? 16 : 28, fontSize: 13 }}>{children}</div>
}
function Strip({ Icon, label, value, sub }: any) {
  return (
    <div style={{ padding: 16, borderRight: '1px solid var(--line)', display: 'flex', gap: 12, alignItems: 'center' }}>
      <span style={{ display: 'inline-flex', width: 34, height: 34, borderRadius: 9, background: '#f2f4f7', color: '#475467', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={17} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="muted" style={{ fontSize: 11.5 }}>{label}</div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
        <div className="muted" style={{ fontSize: 11 }}>{sub}</div>
      </div>
    </div>
  )
}
function Timeline({ evs }: { evs: Ev[] }) {
  if (!evs.length) return <Empty small>No recent activity</Empty>
  return (
    <div style={{ position: 'relative', paddingLeft: 8 }}>
      {evs.map((e, i) => (
        <div key={i} className="row" style={{ gap: 12, alignItems: 'flex-start', padding: '8px 0' }}>
          <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: '50%', background: `${e.tint}18`, color: e.tint, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{e.icon}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{e.title}</div>
            {e.sub && <div className="muted" style={{ fontSize: 12 }}>{e.sub}</div>}
            <div className="muted" style={{ fontSize: 11.5 }}>{dateTime(e.time)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
function BookingMini({ b, accent, heading, nav }: any) {
  return (
    <div style={{ border: '1px solid var(--line)', borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: accent }} /><strong style={{ fontSize: 13 }}>{heading}</strong></div>
      <div className="grid" style={{ gap: 5, fontSize: 13 }}>
        <Row k="Booking ID" v={<span style={{ fontWeight: 600 }}>{b.ref}</span>} />
        <Row k="Service" v={b.service || '—'} />
        <Row k="Date & Time" v={b.date ? `${shortDate(b.date)}${b.time ? ', ' + b.time : ''}` : shortDate(b.created)} />
        <Row k="Worker" v={b.worker || <span className="muted">Unassigned</span>} />
        <Row k="Status" v={<Badge>{b.status}</Badge>} />
      </div>
      <button className="btn line" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => nav(`/bookings/${b.id}`)}>View Booking <ChevronRight size={14} /></button>
    </div>
  )
}

/* ============================ secondary tabs ============================ */
// Map a raw booking status to a display label + tone + coarse bucket used by the KPIs/pills.
const BSTATUS: Record<string, { label: string; tone: string; bucket: string }> = {
  completed: { label: 'Completed', tone: 'green', bucket: 'completed' },
  cancelled: { label: 'Cancelled', tone: 'red', bucket: 'cancelled' },
  in_progress: { label: 'In Progress', tone: 'blue', bucket: 'inprogress' },
  on_the_way: { label: 'In Progress', tone: 'blue', bucket: 'inprogress' },
  arrived: { label: 'In Progress', tone: 'blue', bucket: 'inprogress' },
  worker_assigned: { label: 'Upcoming', tone: 'amber', bucket: 'upcoming' },
  confirmed: { label: 'Upcoming', tone: 'amber', bucket: 'upcoming' },
}
const bStat = (s: string) => BSTATUS[s] || { label: s || '—', tone: 'gray', bucket: 'upcoming' }
const bMs = (b: any) => { const t = Date.parse(b.date || b.created || ''); return isNaN(t) ? Date.parse(b.created || '') || 0 : t }
const PAY_LABEL: Record<string, string> = { wallet: 'Wallet', upi: 'UPI', card: 'Card', cod: 'Cash', online: 'Online', razorpay: 'Online' }
const payLabel = (p?: string) => (p ? (PAY_LABEL[String(p).toLowerCase()] || p.toUpperCase()) : '—')

function BookingsTab({ bookings, nav, c, toast }: any) {
  const [q, setQ] = useState('')
  const [bucket, setBucket] = useState('all')
  const [svc, setSvc] = useState('all')
  const [wrk, setWrk] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [moreOpen, setMoreOpen] = useState(false)

  const services = useMemo(() => [...new Set(bookings.map((b: any) => b.service).filter(Boolean))] as string[], [bookings])
  const workers = useMemo(() => [...new Set(bookings.map((b: any) => b.worker).filter(Boolean))] as string[], [bookings])

  const counts = useMemo(() => {
    const k = { total: bookings.length, completed: 0, upcoming: 0, inprogress: 0, cancelled: 0 } as Record<string, number>
    for (const b of bookings) k[bStat(b.status).bucket]++
    return k
  }, [bookings])
  const pct = (n: number) => (counts.total ? Math.round((n / counts.total) * 100) : 0)

  const filtered = useMemo(() => bookings.filter((b: any) => {
    if (bucket !== 'all' && bStat(b.status).bucket !== bucket) return false
    if (q && !`${b.ref} ${b.service}`.toLowerCase().includes(q.toLowerCase())) return false
    if (svc !== 'all' && b.service !== svc) return false
    if (wrk !== 'all' && (b.worker || '') !== wrk) return false
    if (from && bMs(b) < Date.parse(from)) return false
    if (to && bMs(b) > Date.parse(to) + 86400000) return false
    return true
  }), [bookings, bucket, q, svc, wrk, from, to])

  useEffect(() => { setPage(1) }, [bucket, q, svc, wrk, from, to, pageSize])
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const reset = () => { setQ(''); setBucket('all'); setSvc('all'); setWrk('all'); setFrom(''); setTo('') }

  const exportCsv = () => {
    const head = ['Booking', 'Service', 'Worker', 'Date', 'Time', 'Amount', 'Payment', 'Status']
    const lines = filtered.map((b: any) => [b.ref, b.service || '', b.worker || 'Not Assigned', b.date || '', b.time || '', b.total || 0, `${b.payment_status || ''} ${payLabel(b.payment)}`.trim(), bStat(b.status).label])
    const csv = [head, ...lines].map((r) => r.map((x: string | number) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `${c.displayId || 'customer'}-bookings.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const bkpi = (icon: ReactNode, tint: string, label: string, value: ReactNode, sub: string) => (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center', color: '#667085', fontSize: 12.5, fontWeight: 600 }}>
        <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 8, background: `${tint}18`, color: tint, alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
        {label}
      </div>
      <strong style={{ fontSize: 22, lineHeight: 1 }}>{value}</strong>
      <span className="muted" style={{ fontSize: 11.5 }}>{sub}</span>
    </div>
  )

  const PILLS: [string, string, number][] = [
    ['all', 'All Bookings', counts.total], ['upcoming', 'Upcoming', counts.upcoming],
    ['inprogress', 'In Progress', counts.inprogress], ['completed', 'Completed', counts.completed], ['cancelled', 'Cancelled', counts.cancelled],
  ]

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Bookings</h2>
          <p className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>All bookings placed by {c.name || c.phone || 'this customer'}</p>
        </div>
        <div className="row" style={{ gap: 8, position: 'relative' }}>
          <button className="btn" onClick={() => { toast('Create the booking from the Bookings workspace'); nav(`/bookings?q=${encodeURIComponent(c.phone || c.name || '')}`) }}><Plus size={16} /> New Booking</button>
          <button className="btn line" onClick={(e) => { e.stopPropagation(); setMoreOpen((v) => !v) }}>More Actions <ChevronDown size={15} /></button>
          {moreOpen && (
            <div className="menu" style={MENU_BOX} onClick={(e) => e.stopPropagation()}>
              <button className="menu-item" style={MENU_ITEM} onClick={() => { setMoreOpen(false); exportCsv() }}><Download size={15} /> Export ({filtered.length})</button>
              <button className="menu-item" style={MENU_ITEM} onClick={() => { setMoreOpen(false); nav(`/bookings?q=${encodeURIComponent(c.phone || c.name || '')}`) }}><Calendar size={15} /> Open in Bookings</button>
            </div>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {bkpi(<Calendar size={15} />, '#5b51e8', 'Total Bookings', counts.total, 'All Time')}
        {bkpi(<CheckCircle2 size={15} />, '#16a34a', 'Completed', counts.completed, `${pct(counts.completed)}% of total`)}
        {bkpi(<Clock size={15} />, '#f59e0b', 'Upcoming', counts.upcoming, `${pct(counts.upcoming)}% of total`)}
        {bkpi(<RefreshCw size={15} />, '#2e90fa', 'In Progress', counts.inprogress, `${pct(counts.inprogress)}% of total`)}
        {bkpi(<XCircle size={15} />, '#e5484d', 'Cancelled', counts.cancelled, `${pct(counts.cancelled)}% of total`)}
      </div>

      <Card>
        {/* filter bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) repeat(3, minmax(130px, 1fr)) minmax(200px, 1.4fr) auto', gap: 10, alignItems: 'end', marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#98a2b3' }} />
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by booking ID…" style={{ width: '100%', height: 38, padding: '0 10px 0 32px', border: '1.5px solid var(--line)', borderRadius: 10, background: '#fcfcff' }} />
          </div>
          <select className="select" value={bucket} onChange={(e) => setBucket(e.target.value)}><option value="all">All Status</option><option value="upcoming">Upcoming</option><option value="inprogress">In Progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
          <select className="select" value={svc} onChange={(e) => setSvc(e.target.value)}><option value="all">All Services</option>{services.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <select className="select" value={wrk} onChange={(e) => setWrk(e.target.value)}><option value="all">All Workers</option>{workers.map((w) => <option key={w} value={w}>{w}</option>)}</select>
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ flex: 1, minWidth: 0, height: 38, border: '1.5px solid var(--line)', borderRadius: 10, padding: '0 8px', background: '#fcfcff' }} />
            <span className="muted">–</span>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} style={{ flex: 1, minWidth: 0, height: 38, border: '1.5px solid var(--line)', borderRadius: 10, padding: '0 8px', background: '#fcfcff' }} />
          </div>
          <button className="btn line" onClick={reset}><RefreshCw size={14} /> Reset</button>
        </div>

        {/* status pills */}
        <div className="row" style={{ gap: 4, borderBottom: '1px solid var(--line)', marginBottom: 10, flexWrap: 'wrap' }}>
          {PILLS.map(([k, label, n]) => (
            <button key={k} onClick={() => setBucket(k)} style={{
              display: 'inline-flex', gap: 6, alignItems: 'center', padding: '9px 12px', background: 'none', border: 'none',
              borderBottom: bucket === k ? '2px solid #5b51e8' : '2px solid transparent', color: bucket === k ? '#5b51e8' : '#667085',
              fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>{label}<span style={{ background: bucket === k ? '#5b51e8' : '#eef0f4', color: bucket === k ? '#fff' : '#667085', borderRadius: 10, padding: '0 7px', fontSize: 11 }}>{n}</span></button>
          ))}
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Booking Details</th><th>Service</th><th>Worker</th><th>Date &amp; Time</th><th className="num">Amount</th><th>Payment</th><th>Status</th><th style={{ width: 60 }}>Actions</th></tr></thead>
            <tbody>
              {pageRows.map((b: any) => {
                const st = bStat(b.status)
                const item = (b.items || [])[0] || {}
                return (
                  <tr key={b.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{b.ref}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{b.date ? shortDate(b.date) : shortDate(b.created)}{b.time ? `, ${b.time}` : ''}</div>
                      {c.phone && <div className="muted" style={{ fontSize: 11.5, display: 'flex', gap: 4, alignItems: 'center' }}><Phone size={11} />{c.phone}</div>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 18 }}>{item.icon || '🧹'}</span>
                        <div>
                          <div style={{ fontSize: 13.5 }}>{b.service || '—'}</div>
                          <div className="muted" style={{ fontSize: 11.5 }}>{[item.category, item.durationLabel].filter(Boolean).join(' · ') || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {b.worker ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <Avatar name={b.worker} size={30} />
                          <div>
                            <div style={{ fontSize: 13.5 }}>{b.worker}</div>
                            {b.workerRating ? <div style={{ display: 'flex', gap: 3, alignItems: 'center', fontSize: 11.5, color: '#f59e0b' }}><Star size={11} fill="#f59e0b" stroke="#f59e0b" />{Number(b.workerRating).toFixed(1)}</div> : null}
                          </div>
                        </div>
                      ) : <span className="muted">Not Assigned</span>}
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{b.date ? shortDate(b.date) : shortDate(b.created)}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{b.time || '—'}</div>
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>{money(b.total || 0)}</td>
                    <td>
                      <div className="row" style={{ gap: 5, alignItems: 'center', fontSize: 12.5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: b.payment_status === 'paid' ? '#16a34a' : '#f59e0b' }} />{b.payment_status === 'paid' ? 'Paid' : (b.payment_status || 'Pending')}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{payLabel(b.payment)}</div>
                    </td>
                    <td><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td>
                      <button className="iconbtn" style={{ width: 30, height: 30 }} title="View booking" onClick={() => nav(`/bookings/${b.id}`)}><Eye size={16} /></button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && <tr><td colSpan={8}><Empty>No bookings match these filters.</Empty></td></tr>}
            </tbody>
          </table>
        </div>

        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(filtered.length, page * pageSize)} of {filtered.length} bookings</span>
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <button className="iconbtn" style={{ width: 30, height: 30 }} disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 22, textAlign: 'center' }}>{page}</span>
            <button className="iconbtn" style={{ width: 30, height: 30 }} disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
            <select className="select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ height: 32 }}>{[10, 20, 50].map((s) => <option key={s} value={s}>{s} / page</option>)}</select>
          </div>
        </div>
      </Card>
    </div>
  )
}
// Address "type" is derived from the label (there's no separate type field).
const addrType = (label?: string) => {
  const l = String(label || '').toLowerCase()
  if (/work|office|shop/.test(l)) return 'Work'
  if (/home|house|flat|parent|apartment/.test(l)) return 'Home'
  return 'Other'
}
const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
// "Last used": the customer's most recent booking stamped with this address id (checkout stores
// address_id — exact). Falls back to a text match for legacy bookings placed before that existed,
// and to null (→ "Never Used") when nothing matches.
function lastUsedFor(a: any, bookings: any[]) {
  let hits = bookings.filter((b) => b.addressId != null && Number(b.addressId) === Number(a.id))
  if (!hits.length) {
    const pin = norm(a.pincode), house = norm(a.house), line = norm(a.line)
    hits = bookings.filter((b) => {
      const badr = norm(b.address)
      if (!badr) return false
      if (line && badr.includes(line)) return true
      if (pin && badr.includes(pin) && (!house || badr.includes(house))) return true
      return false
    })
  }
  hits.sort((x, y) => bMs(y) - bMs(x))
  const b = hits[0]
  return b ? { date: b.date || (b.created ? shortDate(b.created) : ''), time: b.time || '', service: b.service || '' } : null
}

type AddrDraft = { id?: number; label: string; house: string; street: string; city: string; pincode: string; receiver_phone: string }
const EMPTY_ADDR: AddrDraft = { label: 'Home', house: '', street: '', city: '', pincode: '', receiver_phone: '' }

function AddressesTab({ addresses, bookings, c, cid, onChanged, toast }: any) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [menuId, setMenuId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<AddrDraft | null>(null)

  useEffect(() => { if (menuId == null) return; const h = () => setMenuId(null); window.addEventListener('click', h); return () => window.removeEventListener('click', h) }, [menuId])
  useEffect(() => { setPage(1) }, [q, status, type, pageSize])

  const counts = useMemo(() => ({
    total: addresses.length,
    active: addresses.filter((a: any) => !a.archived).length,
    default: addresses.filter((a: any) => a.is_default).length,
    archived: addresses.filter((a: any) => a.archived).length,
  }), [addresses])

  const filtered = useMemo(() => addresses.filter((a: any) => {
    if (status === 'active' && a.archived) return false
    if (status === 'archived' && !a.archived) return false
    if (type !== 'all' && addrType(a.label) !== type) return false
    if (q && !`${a.label} ${a.line} ${a.city} ${a.pincode} ${a.receiver_phone}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [addresses, status, type, q])
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const reset = () => { setQ(''); setStatus('all'); setType('all') }

  const act = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true)
    try { await fn(); toast(ok); onChanged() } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false); setMenuId(null) }
  }
  const saveAddr = async () => {
    if (!edit) return
    const body = { label: edit.label, house: edit.house, street: edit.street, city: edit.city, pincode: edit.pincode, receiver_phone: edit.receiver_phone }
    await act(() => edit.id ? updateCustomerAddress(cid, edit.id, body) : addCustomerAddress(cid, body), edit.id ? 'Address updated' : 'Address added')
    setEdit(null)
  }
  const openEdit = (a: any) => setEdit({ id: a.id, label: a.label || 'Home', house: a.house || '', street: a.street || '', city: a.city || '', pincode: a.pincode || '', receiver_phone: a.receiver_phone || '' })
  const duplicate = (a: any) => setEdit({ label: `${a.label || 'Home'} (copy)`, house: a.house || '', street: a.street || '', city: a.city || '', pincode: a.pincode || '', receiver_phone: a.receiver_phone || '' })

  const TypeIcon = ({ t }: { t: string }) => t === 'Work' ? <Building2 size={18} /> : t === 'Home' ? <Home size={18} /> : <MapPin size={18} />

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Addresses</h2>
          <p className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>Manage all saved addresses for {c.name || c.phone || 'this customer'}</p>
        </div>
        <button className="btn" onClick={() => setEdit({ ...EMPTY_ADDR })}><Plus size={16} /> Add New Address</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {[
          [<MapPin size={15} />, '#5b51e8', 'Total Addresses', counts.total],
          [<Home size={15} />, '#16a34a', 'Active Addresses', counts.active],
          [<Star size={15} />, '#f59e0b', 'Default Address', counts.default],
          [<Archive size={15} />, '#e5484d', 'Archived Addresses', counts.archived],
        ].map(([icon, tint, label, val]: any, i) => (
          <div key={i} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="row" style={{ gap: 8, alignItems: 'center', color: '#667085', fontSize: 12.5, fontWeight: 600 }}>
              <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 8, background: `${tint}18`, color: tint, alignItems: 'center', justifyContent: 'center' }}>{icon}</span>{label}
            </div>
            <strong style={{ fontSize: 22, lineHeight: 1 }}>{val}</strong>
          </div>
        ))}
      </div>

      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) minmax(140px, 1fr) minmax(140px, 1fr) auto', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#98a2b3' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search addresses…" style={{ width: '100%', height: 38, padding: '0 10px 0 32px', border: '1.5px solid var(--line)', borderRadius: 10, background: '#fcfcff' }} />
          </div>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All Status</option><option value="active">Active</option><option value="archived">Archived</option></select>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}><option value="all">All Types</option><option value="Home">Home</option><option value="Work">Work</option><option value="Other">Other</option></select>
          <button className="btn line" onClick={reset}><RefreshCw size={14} /> Reset</button>
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Address Details</th><th>Type</th><th>Status</th><th>Default</th><th>Last Used</th><th style={{ width: 120 }}>Actions</th></tr></thead>
            <tbody>
              {pageRows.map((a: any) => {
                const t = addrType(a.label); const lu = lastUsedFor(a, bookings)
                return (
                  <tr key={a.id}>
                    <td>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <span style={{ display: 'inline-flex', width: 38, height: 38, borderRadius: 10, background: a.archived ? '#fdecec' : '#eef0ff', color: a.archived ? '#e5484d' : '#5b51e8', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><TypeIcon t={t} /></span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{a.label || 'Address'}{a.is_default && <span style={{ color: '#5b51e8', fontSize: 12, marginLeft: 6 }}>(Default)</span>}</div>
                          <div className="muted" style={{ fontSize: 12.5 }}>{a.line || [a.house, a.street, a.city, a.pincode].filter(Boolean).join(', ')}</div>
                          {a.receiver_phone && <div className="muted" style={{ fontSize: 11.5, display: 'flex', gap: 4, alignItems: 'center' }}><Phone size={11} />{a.receiver_phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td><Badge tone={t === 'Work' ? 'blue' : t === 'Home' ? 'violet' : 'gray'} dot={false}>{t}</Badge></td>
                    <td><Badge tone={a.archived ? 'gray' : 'green'}>{a.archived ? 'Archived' : 'Active'}</Badge></td>
                    <td>{a.is_default ? <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color: '#16a34a', fontSize: 13 }}><CheckCircle2 size={15} /> Yes</span> : <span className="muted" style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 13 }}><XCircle size={14} /> No</span>}</td>
                    <td>
                      {lu ? (
                        <div style={{ fontSize: 12.5 }}>
                          <div className="muted"><Calendar size={11} style={{ verticalAlign: -1 }} /> {lu.date}{lu.time ? `, ${lu.time}` : ''}</div>
                          {lu.service && <span style={{ background: '#f2f4f7', borderRadius: 6, padding: '2px 7px', fontSize: 11.5, display: 'inline-block', marginTop: 3 }}>{lu.service}</span>}
                        </div>
                      ) : <span className="muted" style={{ fontSize: 12.5 }}>Never Used</span>}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4, position: 'relative' }}>
                        <button className="iconbtn" style={{ width: 30, height: 30 }} title="Edit" onClick={() => openEdit(a)}><Pencil size={15} /></button>
                        <button className="iconbtn" style={{ width: 30, height: 30 }} title="Duplicate" onClick={() => duplicate(a)}><Copy size={15} /></button>
                        <button className="iconbtn" style={{ width: 30, height: 30 }} title="More" onClick={(e) => { e.stopPropagation(); setMenuId(menuId === a.id ? null : a.id) }}><MoreVertical size={15} /></button>
                        {menuId === a.id && (
                          <div className="menu" style={{ ...MENU_BOX, right: 0, top: 34 }} onClick={(e) => e.stopPropagation()}>
                            {!a.is_default && !a.archived && <button className="menu-item" style={MENU_ITEM} disabled={busy} onClick={() => act(() => setCustomerAddressDefault(cid, a.id), 'Set as default')}><Star size={15} /> Set as Default</button>}
                            {a.archived
                              ? <button className="menu-item" style={MENU_ITEM} disabled={busy} onClick={() => act(() => updateCustomerAddress(cid, a.id, { archived: false }), 'Address restored')}><RotateCcw size={15} /> Restore</button>
                              : <button className="menu-item" style={{ ...MENU_ITEM, color: '#e5484d' }} disabled={busy || a.is_default} onClick={() => act(() => updateCustomerAddress(cid, a.id, { archived: true }), 'Address archived')}><Archive size={15} /> Archive</button>}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && <tr><td colSpan={6}><Empty>No addresses match these filters.</Empty></td></tr>}
            </tbody>
          </table>
        </div>

        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(filtered.length, page * pageSize)} of {filtered.length} addresses</span>
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <button className="iconbtn" style={{ width: 30, height: 30 }} disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 22, textAlign: 'center' }}>{page}</span>
            <button className="iconbtn" style={{ width: 30, height: 30 }} disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
            <select className="select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ height: 32 }}>{[10, 20, 50].map((s) => <option key={s} value={s}>{s} / page</option>)}</select>
          </div>
        </div>
      </Card>

      {edit && (
        <Modal title={edit.id ? 'Edit Address' : 'Add New Address'} onClose={() => setEdit(null)} footer={<><button className="btn line" onClick={() => setEdit(null)}>Cancel</button><button className="btn" disabled={busy || !(edit.house || edit.street) || !edit.pincode} onClick={saveAddr}>{edit.id ? 'Save' : 'Add Address'}</button></>}>
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Label"><select className="select" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })}><option>Home</option><option>Work</option><option>Parents Home</option><option>Other</option></select></Field>
            <Field label="House / Flat / Building"><input value={edit.house} onChange={(e) => setEdit({ ...edit, house: e.target.value })} placeholder="Flat 404, Rainbow Vistas" /></Field>
            <Field label="Street / Area / Landmark"><input value={edit.street} onChange={(e) => setEdit({ ...edit, street: e.target.value })} placeholder="Road No 2, Erragadda" /></Field>
            <div className="row" style={{ gap: 12 }}>
              <Field label="City"><input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} placeholder="Hyderabad" /></Field>
              <Field label="Pincode"><input value={edit.pincode} onChange={(e) => setEdit({ ...edit, pincode: e.target.value })} placeholder="500018" /></Field>
            </div>
            <Field label="Receiver Phone"><input value={edit.receiver_phone} onChange={(e) => setEdit({ ...edit, receiver_phone: e.target.value })} placeholder="Optional" /></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}
// Classify a wallet ledger row into a display type (label + tone).
function txnMeta(t: any) {
  const kind = t.kind || ''
  if (t.type === 'credit') {
    if (kind === 'CASHBACK' || /cashback/i.test(t.title || '')) return { label: 'Cashback', tint: '#5b51e8' }
    if (kind === 'REFUND' || /refund/i.test(t.title || '')) return { label: 'Refund', tint: '#f59e0b' }
    return { label: 'Added', tint: '#16a34a' }
  }
  return { label: 'Used', tint: '#e5484d' }
}
const pmIcon = (kind: string) => kind === 'upi'
  ? <span style={{ fontWeight: 800, fontSize: 10, color: '#5b51e8' }}>UPI</span>
  : <CreditCard size={17} />

function WalletTab({ c, txns, bookings, paymentMethods, onAddMoney, onSend, goto, wAmt, setWAmt, wNote, setWNote, wBal, setWBal, busy, onAdjust, onStatus }: any) {
  const [sub, setSub] = useState<'overview' | 'methods'>('overview')
  const [typeF, setTypeF] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const kpi = useMemo(() => {
    const k = { added: 0, used: 0, cashback: 0, refunds: 0 }
    for (const t of txns) {
      const amt = t.amount || 0
      if (t.type === 'credit') {
        if (t.kind === 'CASHBACK' || /cashback/i.test(t.title || '')) k.cashback += amt
        else if (t.kind === 'REFUND' || /refund/i.test(t.title || '')) k.refunds += amt
        else k.added += amt
      } else k.used += amt
    }
    return k
  }, [txns])

  const filtered = useMemo(() => txns.filter((t: any) => typeF === 'all' || txnMeta(t).label === typeF), [txns, typeF])
  useEffect(() => { setPage(1) }, [typeF])
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const updated = txns[0]?.created

  const recentPayments = useMemo(() => bookings.filter((b: any) => b.payment_status === 'paid').slice(0, 4), [bookings])

  const wkpi = (icon: ReactNode, tint: string, label: string, value: ReactNode) => (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center', color: '#667085', fontSize: 12.5, fontWeight: 600 }}>
        <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: '50%', background: `${tint}18`, color: tint, alignItems: 'center', justifyContent: 'center' }}>{icon}</span>{label}
      </div>
      <strong style={{ fontSize: 20, lineHeight: 1 }}>{value}</strong>
      <span className="muted" style={{ fontSize: 11.5 }}>All Time</span>
    </div>
  )

  const PaymentMethodsList = ({ manage }: { manage?: boolean }) => (
    <Card title="Payment Methods" right={manage ? undefined : <button className="linkbtn" style={LINK} onClick={() => setSub('methods')}>Manage</button>}>
      <div className="grid" style={{ gap: 10 }}>
        {paymentMethods.map((p: any) => (
          <div key={p.id} className="row" style={{ gap: 10, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
            <span style={{ display: 'inline-flex', width: 40, height: 28, borderRadius: 6, background: '#f2f4f7', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{pmIcon(p.kind)}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.label || (p.kind === 'upi' ? 'UPI' : 'Card')}</div>
              <div className="muted" style={{ fontSize: 12 }}>{p.detail || ''}</div>
            </div>
            {p.is_primary ? <Badge tone="green" dot={false}>Default</Badge> : null}
          </div>
        ))}
        {paymentMethods.length === 0 && <Empty small>No saved payment methods</Empty>}
      </div>
    </Card>
  )

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* sub-tabs */}
      <div className="row" style={{ gap: 4, borderBottom: '1px solid var(--line)' }}>
        {(['overview', 'methods'] as const).map((k) => (
          <button key={k} onClick={() => setSub(k)} style={{ padding: '10px 14px', background: 'none', border: 'none', borderBottom: sub === k ? '2px solid #5b51e8' : '2px solid transparent', color: sub === k ? '#5b51e8' : '#667085', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>{k === 'overview' ? 'Wallet Overview' : 'Payment Methods'}</button>
        ))}
      </div>

      {sub === 'overview' && (
        <div className="grid" style={{ gap: 16 }}>
          {/* balance + KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(0, 2.4fr)', gap: 14, alignItems: 'stretch' }}>
            <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div className="muted" style={{ fontSize: 13 }}>Wallet Balance</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#5b51e8' }}>{money(c.wallet || 0)}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>Updated {updated ? `${shortDate(updated)}, ${new Date(updated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : '—'}</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" onClick={onAddMoney}><Plus size={15} /> Add Money</button>
                <button className="btn line" onClick={onSend}><Send size={15} /> Send to Customer</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {wkpi(<TrendingUp size={15} />, '#16a34a', 'Total Added', money(kpi.added))}
              {wkpi(<CreditCard size={15} />, '#f59e0b', 'Total Used', money(kpi.used))}
              {wkpi(<Gift size={15} />, '#5b51e8', 'Cashback Earned', money(kpi.cashback))}
              {wkpi(<RotateCcw size={15} />, '#2e90fa', 'Refunds Received', money(kpi.refunds))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#f5f7ff', border: '1px solid #e0e7ff', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: '#475467' }}>
            <BadgeCheck size={17} style={{ color: '#5b51e8', flexShrink: 0 }} /> Use wallet balance during booking checkout. Refunds are automatically added to wallet.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 16, alignItems: 'start' }}>
            {/* transactions */}
            <Card title="Wallet Transactions" right={
              <select className="select" value={typeF} onChange={(e) => setTypeF(e.target.value)} style={{ height: 32 }}>
                <option value="all">All Transactions</option><option value="Added">Added</option><option value="Used">Used</option><option value="Cashback">Cashback</option><option value="Refund">Refund</option>
              </select>
            }>
              <div className="tablewrap">
                <table className="tbl">
                  <thead><tr><th>Date &amp; Time</th><th>Type</th><th>Description</th><th className="num">Amount</th><th className="num">Balance</th><th>Reference ID</th></tr></thead>
                  <tbody>
                    {pageRows.map((t: any) => {
                      const meta = txnMeta(t)
                      return (
                        <tr key={t.id}>
                          <td><div style={{ fontSize: 13 }}>{shortDate(t.created)}</div><div className="muted" style={{ fontSize: 11.5 }}>{new Date(t.created).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div></td>
                          <td><span className="row" style={{ gap: 6, alignItems: 'center', fontSize: 13 }}><span style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: '50%', background: `${meta.tint}1f`, color: meta.tint, alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{t.type === 'credit' ? '+' : '−'}</span>{meta.label}</span></td>
                          <td><div style={{ fontSize: 13 }}>{t.title || '—'}</div><div className="muted" style={{ fontSize: 11.5 }}>{t.balance_type && t.balance_type !== 'cash' ? t.balance_type : (t.kind || '').replace(/_/g, ' ').toLowerCase()}</div></td>
                          <td className="num" style={{ color: meta.tint, fontWeight: 600 }}>{t.type === 'credit' ? '+' : '−'}{money(t.amount || 0)}</td>
                          <td className="num">{money(t.balance || 0)}</td>
                          <td className="muted" style={{ fontSize: 12 }}>{t.ref || `TXN${String(t.id).padStart(6, '0')}`}</td>
                        </tr>
                      )
                    })}
                    {filtered.length === 0 && <tr><td colSpan={6}><Empty>No transactions</Empty></td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
                <span className="muted" style={{ fontSize: 12.5 }}>Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(filtered.length, page * pageSize)} of {filtered.length} transactions</span>
                <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <button className="iconbtn" style={{ width: 30, height: 30 }} disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 22, textAlign: 'center' }}>{page}</span>
                  <button className="iconbtn" style={{ width: 30, height: 30 }} disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
                </div>
              </div>
            </Card>

            {/* right rail */}
            <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
              <PaymentMethodsList />
              <Card title="Recent Payments" right={<button className="linkbtn" style={LINK} onClick={() => goto('bookings')}>View All</button>}>
                <div className="grid" style={{ gap: 10 }}>
                  {recentPayments.map((b: any) => (
                    <div key={b.id} className="row" style={{ gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 18 }}>{(b.items || [])[0]?.icon || '🧹'}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{b.ref}</div>
                        <div className="muted" style={{ fontSize: 11.5 }}>{b.date ? shortDate(b.date) : shortDate(b.created)}{b.time ? `, ${b.time}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{money(b.total || 0)}</div>
                        <Badge tone="green" dot={false}>Paid</Badge>
                      </div>
                    </div>
                  ))}
                  {recentPayments.length === 0 && <Empty small>No payments yet</Empty>}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {sub === 'methods' && (
        <div className="grid" style={{ gap: 16 }}>
          <PaymentMethodsList manage />
          <Card title="Admin Wallet Controls">
            <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 14 }}>
              <span>Wallet status:</span>
              <Badge tone={(c.walletStatus || 'active') === 'active' ? 'green' : c.walletStatus === 'blocked' ? 'red' : 'gray'}>{(c.walletStatus || 'active').toUpperCase()}</Badge>
              <div style={{ flex: 1 }} />
              <button className="btn line" disabled={busy} onClick={() => onStatus('active')}>Activate</button>
              <button className="btn line" disabled={busy} onClick={() => onStatus('frozen')}>Freeze</button>
              <button className="btn line" disabled={busy} onClick={() => onStatus('blocked')}>Block</button>
            </div>
            <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="Balance"><select className="select" value={wBal} onChange={(e) => setWBal(e.target.value)}><option value="cash">Cash</option><option value="promo">Promo</option><option value="points">Reward Points</option></select></Field>
              <Field label={wBal === 'points' ? 'Points' : 'Amount (₹)'}><input type="number" value={wAmt} onChange={(e) => setWAmt(e.target.value)} placeholder={wBal === 'points' ? '100' : '500'} /></Field>
              <Field label="Note / reason"><input value={wNote} onChange={(e) => setWNote(e.target.value)} placeholder="Reason / reference" /></Field>
              <button className="btn" disabled={busy || !wAmt.trim()} onClick={() => onAdjust(1)}>Credit</button>
              <button className="btn line" disabled={busy || !wAmt.trim()} onClick={() => onAdjust(-1)}>Debit</button>
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Customers add and manage their own cards/UPI in the app; the list above is read-only for admins.</p>
          </Card>
        </div>
      )}
    </div>
  )
}
const hasFeat = (p: any, re: RegExp) => (p.features || []).some((f: string) => re.test(f))
const chk = (on: boolean) => on ? <CheckCircle2 size={16} style={{ color: '#16a34a' }} /> : <span className="muted">—</span>

const freeResched = (n: number) => (n >= 99 ? 'Unlimited' : n > 0 ? `${n} / month` : <span className="muted">—</span>)

function MembershipTab({ membership, plans, ledger, c, cid, paymentMethods, onChanged, toast, nav, goto }: any) {
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState<string | null>(null)   // plan key pending confirm
  const [changeMenu, setChangeMenu] = useState(false)
  const active = !!membership?.active
  const curKey = membership?.plan || null
  const defPm = (paymentMethods || []).find((p: any) => p.is_primary) || (paymentMethods || [])[0] || null
  const curPlan = plans.find((p: any) => p.key === curKey) || null
  const planName = curPlan?.name || membership?.planName || curKey
  const elite = plans.find((p: any) => /elite/i.test(p.key) || /elite/i.test(p.name))

  useEffect(() => { if (!changeMenu) return; const h = () => setChangeMenu(false); window.addEventListener('click', h); return () => window.removeEventListener('click', h) }, [changeMenu])

  const changeTo = async (planKey: string) => {
    setBusy(true)
    try { await changeCustomerMembership(cid, planKey); toast('Membership updated'); setPick(null); onChanged() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }
  const printInvoice = (l: any) => {
    const w = window.open('', '_blank', 'width=620,height=760'); if (!w) return
    w.document.write(`<html><head><title>Invoice TXN${String(l.id).padStart(6, '0')}</title><style>body{font-family:system-ui,Arial;padding:32px;color:#101828}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px 0;border-bottom:1px solid #eee}.r{text-align:right}.muted{color:#667085;font-size:12px}</style></head><body onload="window.print()"><h1>HomeHelp — Membership Invoice</h1><div class="muted">TXN${String(l.id).padStart(6, '0')} · ${new Date(l.created).toLocaleString('en-IN')}</div><table><tr><td>Customer</td><td class="r">${(c.name || c.phone || '')} (${c.displayId || ''})</td></tr><tr><td>Description</td><td class="r">${(l.detail || l.event || '').replace(/</g, '')}</td></tr><tr><td>Plan</td><td class="r">${((l.detail || '').split(' · ')[0]) || planName || ''}</td></tr><tr><td>Amount</td><td class="r">₹${(l.amount || 0).toLocaleString('en-IN')}</td></tr><tr><td>Status</td><td class="r">${l.event === 'cancelled' ? 'Cancelled' : 'Paid'}</td></tr></table></body></html>`)
    w.document.close()
  }

  // Compare rows mirror the mock; values come from the real plan fields / features.
  const rows: [string, (p: any) => ReactNode][] = [
    ['Monthly Price', (p) => <strong>{money(p.price)}</strong>],
    ['Discount on Services', (p) => `${p.discountPct || 0}%`],
    ['Priority Booking', (p) => chk(!!p.priorityBooking)],
    ['Free Reschedule', (p) => freeResched(p.freeCancellations)],
    ['Exclusive Offers', (p) => chk(hasFeat(p, /exclusive|offer/i))],
    ['Dedicated Support', (p) => chk(hasFeat(p, /support/i))],
    ['Wallet Cashback', (p) => p.cashbackPct ? `${p.cashbackPct}%` : <span className="muted">—</span>],
  ]

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Membership Overview</h2>
          <p className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>Manage customer membership and view plan details</p>
        </div>
        <div style={{ position: 'relative' }}>
          <button className="btn" onClick={(e) => { e.stopPropagation(); setChangeMenu((v) => !v) }}>Change Plan <ChevronDown size={15} /></button>
          {changeMenu && (
            <div className="menu" style={{ ...MENU_BOX, right: 0, top: 40 }} onClick={(e) => e.stopPropagation()}>
              {plans.map((p: any) => (
                <button key={p.key} className="menu-item" style={{ ...MENU_ITEM, ...(p.key === curKey ? { color: '#5b51e8', fontWeight: 700 } : {}) }} disabled={p.key === curKey} onClick={() => { setChangeMenu(false); setPick(p.key) }}>{p.name} · {money(p.price)}{p.key === curKey ? ' (current)' : ''}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.85fr) minmax(0, 2fr) minmax(240px, 0.95fr)', gap: 16, alignItems: 'start' }}>
        {/* Current plan */}
        <Card title="Current Plan">
          {active ? (
            <div className="grid" style={{ gap: 12 }}>
              <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', width: 44, height: 44, borderRadius: 12, background: '#eef0ff', color: '#5b51e8', alignItems: 'center', justifyContent: 'center' }}><Award size={22} /></span>
                <div>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}><strong style={{ fontSize: 16 }}>{planName}</strong><Badge tone={(membership.status === 'active') ? 'green' : 'amber'}>{membership.status === 'cancelled' ? 'Cancelling' : 'Active'}</Badge></div>
                  <div className="muted" style={{ fontSize: 12 }}>{curPlan?.tagline || `${membership.cycle || 'monthly'} · ${money(membership.price || 0)}`}</div>
                </div>
              </div>
              <div className="row" style={{ gap: 10, textAlign: 'center' }}>
                <div style={{ flex: 1, background: '#f9fafb', borderRadius: 10, padding: '8px 4px' }}><div className="muted" style={{ fontSize: 11 }}>Start Date</div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{shortDate(membership.startedAt)}</div></div>
                <div style={{ flex: 1, background: '#f9fafb', borderRadius: 10, padding: '8px 4px' }}><div className="muted" style={{ fontSize: 11 }}>Next Renewal</div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{shortDate(membership.renewsAt)}</div></div>
                <div style={{ flex: 1, background: '#f9fafb', borderRadius: 10, padding: '8px 4px' }}><div className="muted" style={{ fontSize: 11 }}>Auto Renewal</div><div style={{ fontSize: 12.5, fontWeight: 600, color: membership.autoRenew ? '#16a34a' : '#98a2b3' }}>{membership.autoRenew ? 'Enabled' : 'Off'}</div></div>
              </div>
              {curPlan && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Plan Benefits</div>
                  <div className="grid" style={{ gap: 5 }}>
                    {(curPlan.features || []).map((f: string, i: number) => <div key={i} className="row" style={{ gap: 7, alignItems: 'center', fontSize: 13 }}><CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0 }} />{f}</div>)}
                  </div>
                </div>
              )}
              <button className="btn line" style={{ width: '100%', justifyContent: 'center' }} onClick={() => nav('/membership')}>View Plan Details <ChevronRight size={14} /></button>
            </div>
          ) : <Empty>No active membership. Choose a plan from the table to enrol this customer.</Empty>}
        </Card>

        {/* Compare plans — fixed layout so all plan columns fit without a horizontal scrollbar */}
        <Card title="Choose / Compare Plan">
          <table className="tbl" style={{ fontSize: 12, tableLayout: 'fixed', width: '100%' }}>
            <colgroup><col style={{ width: '26%' }} />{plans.map((p: any) => <col key={p.key} />)}</colgroup>
            <thead>
              <tr>
                <th style={CMP_CELL}>Features</th>
                {plans.map((p: any) => (
                  <th key={p.key} style={{ ...CMP_CELL, textAlign: 'center', ...(p.key === curKey ? { background: '#f5f3ff' } : {}) }}>
                    <div style={{ fontWeight: 700 }}>{p.name}</div>
                    {p.popular && <div><span style={{ background: '#5b51e8', color: '#fff', borderRadius: 8, padding: '1px 6px', fontSize: 9 }}>POPULAR</span></div>}
                    {p.key === curKey && <div style={{ fontSize: 9, color: '#5b51e8', fontWeight: 700 }}>Current</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, render]) => (
                <tr key={label}>
                  <td className="muted" style={CMP_CELL}>{label}</td>
                  {plans.map((p: any) => <td key={p.key} style={{ ...CMP_CELL, textAlign: 'center', ...(p.key === curKey ? { background: '#f5f3ff' } : {}) }}>{render(p)}</td>)}
                </tr>
              ))}
              <tr>
                <td style={CMP_CELL} />
                {plans.map((p: any) => (
                  <td key={p.key} style={{ ...CMP_CELL, textAlign: 'center', ...(p.key === curKey ? { background: '#f5f3ff' } : {}) }}>
                    {p.key === curKey
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: '#5b51e8' }}>Current</span>
                      : <button className="btn line" style={{ padding: '5px 8px', fontSize: 11.5 }} disabled={busy} onClick={() => setPick(p.key)}>Select</button>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </Card>

        {/* Summary + upgrade */}
        <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
          <Card title="Membership Summary">
            <div className="grid" style={{ gap: 10, fontSize: 13.5 }}>
              <Row k="Plan Name" v={active ? planName : <span className="muted">None</span>} />
              <Row k="Status" v={<Badge tone={active ? 'green' : 'gray'}>{active ? 'Active' : 'None'}</Badge>} />
              <Row k="Member Since" v={active ? shortDate(membership.startedAt) : '—'} />
              <Row k="Next Renewal" v={active ? shortDate(membership.renewsAt) : '—'} />
              <Row k="Renewal Amount" v={active ? `${money(membership.price || 0)} / mo` : '—'} />
              <Row k="Payment Method" v={<span className="row" style={{ gap: 8, alignItems: 'center' }}>{defPm ? `${defPm.label}${defPm.detail ? ` · ${defPm.detail}` : ''}` : <span className="muted">—</span>}<button className="linkbtn" style={LINK} onClick={() => goto('wallet')}>Change</button></span>} />
              <Row k="Auto Renewal" v={<span className="row" style={{ gap: 8, alignItems: 'center' }}>{active ? <Badge tone={membership.autoRenew ? 'green' : 'gray'} dot={false}>{membership.autoRenew ? 'Enabled' : 'Off'}</Badge> : '—'}<button className="linkbtn" style={LINK} onClick={() => toast('Auto-renew is managed by the customer in-app')}>Manage</button></span>} />
            </div>
          </Card>
          {elite && curKey !== elite.key && (
            <div className="card" style={{ padding: 16, background: 'linear-gradient(135deg,#f5f3ff,#eef2ff)', border: '1px solid #e0e7ff' }}>
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <Gift size={22} style={{ color: '#7c3aed' }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 14 }}>Upgrade to {elite.name} Plan</strong>
                  <p className="muted" style={{ fontSize: 12, margin: '3px 0 0' }}>Get more discounts, unlimited reschedule and higher cashback.</p>
                </div>
              </div>
              <button className="linkbtn" style={{ ...LINK, marginTop: 8 }} onClick={() => setPick(elite.key)}>View {elite.name} Plan →</button>
            </div>
          )}
        </div>
      </div>

      {/* Transactions */}
      <Card title="Membership Transactions">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Date &amp; Time</th><th>Transaction ID</th><th>Description</th><th>Plan</th><th className="num">Amount</th><th>Payment Method</th><th>Status</th><th style={{ width: 50 }}>Invoice</th></tr></thead>
            <tbody>
              {(ledger || []).map((l: any) => {
                const paid = l.event !== 'cancelled'
                const viaWallet = /wallet/i.test(l.detail || '')
                return (
                  <tr key={l.id}>
                    <td><div style={{ fontSize: 13 }}>{shortDate(l.created)}</div><div className="muted" style={{ fontSize: 11.5 }}>{new Date(l.created).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div></td>
                    <td className="muted" style={{ fontSize: 12 }}>{`TXN${String(l.id).padStart(6, '0')}`}</td>
                    <td><div style={{ fontSize: 13, textTransform: 'capitalize' }}>{l.event}</div><div className="muted" style={{ fontSize: 11.5 }}>{l.detail || ''}</div></td>
                    <td>{(l.detail || '').split(' · ')[0] || '—'}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{l.amount ? money(l.amount) : '—'}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{!paid ? '—' : viaWallet ? 'Wallet Balance' : (defPm ? `${defPm.label} ${defPm.detail || ''}`.trim() : 'Card')}</td>
                    <td><Badge tone={paid ? 'green' : 'gray'}>{paid ? 'Paid' : 'Cancelled'}</Badge></td>
                    <td><button className="iconbtn" style={{ width: 30, height: 30 }} title="Invoice" onClick={() => printInvoice(l)}><FileText size={15} /></button></td>
                  </tr>
                )
              })}
              {(!ledger || ledger.length === 0) && <tr><td colSpan={8}><Empty>No membership transactions yet.</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {pick && (() => { const p = plans.find((x: any) => x.key === pick); return (
        <Modal title="Change Membership Plan" onClose={() => setPick(null)} footer={<><button className="btn line" onClick={() => setPick(null)}>Cancel</button><button className="btn" disabled={busy} onClick={() => changeTo(pick)}>Confirm &amp; Set Plan</button></>}>
          <p style={{ margin: 0, fontSize: 14 }}>Set <strong>{c.name || c.phone}</strong>'s membership to <strong>{p?.name}</strong> ({money(p?.price || 0)}/mo)?</p>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>This replaces any current plan and records a membership transaction. No charge is taken — this is an admin change.</p>
        </Modal>
      ) })()}
    </div>
  )
}
const discountText = (o: any) => o.discountType === 'percent' ? `${o.discountValue}% OFF${o.maxDiscount ? ` up to ${money(o.maxDiscount)}` : ''}` : `${money(o.discountValue)} OFF`
const discountMain = (o: any) => o.discountType === 'percent' ? `${o.discountValue}% OFF` : `${money(o.discountValue)} OFF`
const discountSub = (o: any) => o.discountType === 'percent' ? (o.maxDiscount ? `Up to ${money(o.maxDiscount)}` : '') : 'Flat'
const daysLeft = (d?: string | null) => { if (!d) return null; const n = Math.ceil((Date.parse(d) - Date.now()) / 86400000); return n }

function OffersTab({ bookings, offers, c, nav, toast, goto }: any) {
  const [q, setQ] = useState('')
  const [typeF, setTypeF] = useState('all')
  const [statusF, setStatusF] = useState('all')
  const [menuCode, setMenuCode] = useState<string | null>(null)
  const coupons: any[] = offers.coupons || []

  // This customer's redemptions come from their bookings (coupon + discount stamped at checkout).
  const history = useMemo(() => bookings.filter((b: any) => b.coupon).map((b: any) => ({ code: b.coupon, saved: b.discount || 0, date: b.created, ref: b.ref })).sort((a: any, b: any) => Date.parse(b.date) - Date.parse(a.date)), [bookings])
  const totalSaved = history.reduce((a: number, h: any) => a + h.saved, 0)
  const availableCount = coupons.filter((o) => o.status === 'Available').length

  const filtered = coupons.filter((o) => {
    if (statusF !== 'all' && o.status !== statusF) return false
    if (typeF !== 'all' && (typeF === 'percent' ? o.discountType !== 'percent' : o.discountType !== 'flat')) return false
    if (q && !`${o.name} ${o.code} ${o.subtitle}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })
  const copyCode = (code: string) => { navigator.clipboard?.writeText(code); toast(`Code ${code} copied`) }
  useEffect(() => { if (!menuCode) return; const h = () => setMenuCode(null); window.addEventListener('click', h); return () => window.removeEventListener('click', h) }, [menuCode])

  const OKPI = (icon: ReactNode, tint: string, label: string, value: ReactNode, sub: string) => (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center', color: '#667085', fontSize: 12.5, fontWeight: 600 }}>
        <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: '50%', background: `${tint}18`, color: tint, alignItems: 'center', justifyContent: 'center' }}>{icon}</span>{label}
      </div>
      <strong style={{ fontSize: 22, lineHeight: 1 }}>{value}</strong>
      <span className="muted" style={{ fontSize: 11.5 }}>{sub}</span>
    </div>
  )
  const CARD_TINTS = ['#16a34a', '#f59e0b', '#5b51e8', '#2e90fa']

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Offers &amp; Coupons</h2>
          <p className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>Manage offers, view available coupons and usage history</p>
        </div>
        <button className="btn" onClick={() => nav('/campaigns')}><Plus size={16} /> New Offer</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {OKPI(<Tag size={15} />, '#5b51e8', 'Total Offers', offers.totalOffers || 0, 'All Offers')}
        {OKPI(<Tag size={15} />, '#16a34a', 'Available Coupons', availableCount, 'Ready to Use')}
        {OKPI(<CheckCircle2 size={15} />, '#f59e0b', 'Used Coupons', history.length, 'Total Used')}
        {OKPI(<Gift size={15} />, '#e5484d', 'Total Savings', money(totalSaved), 'All Time')}
      </div>

      {/* Best offers carousel */}
      {coupons.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Best Offers for {c.name || c.phone || 'this customer'}</div>
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 6 }}>
            {coupons.slice(0, 6).map((o, i) => (
              <div key={o.code} style={{ minWidth: 250, flex: '0 0 250px', border: '1px solid var(--line)', borderRadius: 14, padding: 16, background: `${CARD_TINTS[i % 4]}0d` }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: CARD_TINTS[i % 4], textTransform: 'uppercase', letterSpacing: 0.4 }}>{o.name}</div>
                <div style={{ fontSize: 22, fontWeight: 800, margin: '6px 0 2px' }}>{o.bannerTitle || discountText(o)}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{o.subtitle || `Min order ${money(o.minSubtotal)}`}</div>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, background: '#fff', border: '1px dashed var(--line)', borderRadius: 6, padding: '3px 8px' }}>{o.code}</span>
                  <button className="linkbtn" style={LINK} onClick={() => copyCode(o.code)}>Copy Code</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
        {/* Available coupons */}
        <Card title="Available Coupons">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 2fr) minmax(120px, 1fr) minmax(120px, 1fr) auto', gap: 10, marginBottom: 12 }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#98a2b3' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search coupon code or name…" style={{ width: '100%', height: 38, padding: '0 10px 0 32px', border: '1.5px solid var(--line)', borderRadius: 10, background: '#fcfcff' }} />
            </div>
            <select className="select" value={typeF} onChange={(e) => setTypeF(e.target.value)}><option value="all">All Types</option><option value="percent">Percentage</option><option value="flat">Flat</option></select>
            <select className="select" value={statusF} onChange={(e) => setStatusF(e.target.value)}><option value="all">All Status</option><option value="Available">Available</option><option value="Used">Used</option><option value="Expired">Expired</option></select>
            <button className="btn line" onClick={() => { setQ(''); setTypeF('all'); setStatusF('all') }}><Funnel size={15} /> Filters</button>
          </div>
          <div className="tablewrap">
            <table className="tbl" style={{ tableLayout: 'fixed', width: '100%', fontSize: 12.5 }}>
              <colgroup><col style={{ width: '22%' }} /><col style={{ width: '11%' }} /><col style={{ width: '13%' }} /><col style={{ width: '10%' }} /><col style={{ width: '14%' }} /><col style={{ width: '11%' }} /><col style={{ width: '9%' }} /><col style={{ width: '10%' }} /></colgroup>
              <thead><tr><th>Coupon Details</th><th>Code</th><th>Discount</th><th className="num">Min Order</th><th>Valid Till</th><th>Usage</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((o) => {
                  const dl = daysLeft(o.validTill)
                  return (
                    <tr key={o.code}>
                      <td style={{ whiteSpace: 'normal' }}><div style={{ fontWeight: 600, fontSize: 13 }}>{o.name}</div><div className="muted" style={{ fontSize: 11.5 }}>{o.subtitle || '—'}</div></td>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11.5, background: '#eef0ff', color: '#5b51e8', borderRadius: 6, padding: '2px 6px' }}>{o.code}</span></td>
                      <td style={{ whiteSpace: 'normal' }}><div style={{ fontSize: 13 }}>{discountMain(o)}</div>{discountSub(o) && <div className="muted" style={{ fontSize: 11 }}>{discountSub(o)}</div>}</td>
                      <td className="num">{money(o.minSubtotal)}</td>
                      <td style={{ whiteSpace: 'normal' }}><div style={{ fontSize: 12.5 }}>{o.validTill ? shortDate(o.validTill) : 'No expiry'}</div>{dl != null && <div className="muted" style={{ fontSize: 11 }}>{dl > 0 ? `${dl} days left` : 'Expired'}</div>}</td>
                      <td style={{ whiteSpace: 'normal', fontSize: 12.5 }}>{o.usedByCustomer} / {o.perCustomerLimit || '∞'}<div className="muted" style={{ fontSize: 11 }}>Per Customer</div></td>
                      <td><Badge tone={o.status === 'Available' ? 'green' : o.status === 'Expired' ? 'red' : 'gray'}>{o.status}</Badge></td>
                      <td>
                        <div className="row" style={{ gap: 2, alignItems: 'center', position: 'relative' }}>
                          <button className="linkbtn" style={{ ...LINK, fontSize: 12.5 }} onClick={() => copyCode(o.code)}>Apply</button>
                          <button className="iconbtn" style={{ width: 26, height: 26 }} onClick={(e) => { e.stopPropagation(); setMenuCode(menuCode === o.code ? null : o.code) }}><MoreVertical size={15} /></button>
                          {menuCode === o.code && (
                            <div className="menu" style={{ ...MENU_BOX, right: 0, top: 30 }} onClick={(e) => e.stopPropagation()}>
                              <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuCode(null); copyCode(o.code) }}><Copy size={15} /> Copy code</button>
                              <button className="menu-item" style={MENU_ITEM} onClick={() => { setMenuCode(null); nav('/campaigns') }}><Eye size={15} /> View offer</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && <tr><td colSpan={8}><Empty>No coupons match these filters.</Empty></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Usage history */}
        <Card title="Coupon Usage History" right={history.length > 0 ? <button className="linkbtn" style={LINK} onClick={() => goto('bookings')}>View All</button> : undefined}>
          <div className="grid" style={{ gap: 12 }}>
            {history.slice(0, 5).map((h: any, i: number) => (
              <div key={i} className="row" style={{ gap: 10, alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 8, background: '#eef0ff', color: '#5b51e8', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Tag size={15} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{h.code}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{shortDate(h.date)} · {h.ref}</div>
                </div>
                <div style={{ textAlign: 'right', color: '#16a34a', fontSize: 13, fontWeight: 600 }}>-{money(h.saved)}<div className="muted" style={{ fontSize: 10.5 }}>Saved</div></div>
              </div>
            ))}
            {history.length === 0 && <Empty small>No coupons redeemed yet</Empty>}
          </div>
          {history.length > 0 && <button className="btn line" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => goto('bookings')}>View All Usage History <ChevronRight size={14} /></button>}
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#f5f7ff', border: '1px solid #e0e7ff', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: '#475467' }}>
        <BadgeCheck size={17} style={{ color: '#5b51e8', flexShrink: 0 }} /> Offers and coupons cannot be combined. Only one coupon can be applied per booking.
      </div>
    </div>
  )
}
function SupportTab({ bookings, nav }: any) {
  return (
    <Card title="Support & Complaints">
      <Empty>
        Complaints are tracked per booking. Open a booking to view or raise a ticket.
        {bookings.length > 0 && <div style={{ marginTop: 10 }}><button className="btn line" onClick={() => nav(`/bookings/${bookings[0].id}`)}>Open latest booking</button></div>}
      </Empty>
    </Card>
  )
}
function RatingsTab({ reviews, rating }: any) {
  return (
    <Card title={<span className="row" style={{ gap: 10, alignItems: 'center' }}>Ratings &amp; Feedback <Stars rating={rating} /> <strong>{rating ? rating.toFixed(1) : '—'}</strong></span>}>
      <div className="grid" style={{ gap: 12 }}>
        {reviews.map((b: any) => (
          <div key={b.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="row" style={{ gap: 8, alignItems: 'center' }}><Stars rating={b.rating} size={13} /> <strong style={{ fontSize: 13 }}>{b.service}</strong></span>
              <span className="muted" style={{ fontSize: 12 }}>{shortDate(b.completed_at || b.created)}</span>
            </div>
            {b.review && <p style={{ margin: '8px 0 0', fontSize: 13.5 }}>{b.review}</p>}
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{b.ref}</div>
          </div>
        ))}
        {reviews.length === 0 && <Empty>No reviews submitted yet</Empty>}
      </div>
    </Card>
  )
}
function NotesTab({ notes, onAdd }: any) {
  return (
    <Card title={`Notes (${notes.length})`} right={<button className="btn" onClick={onAdd}><Plus size={15} /> Add Note</button>}>
      <div className="grid" style={{ gap: 10 }}>
        {notes.map((n: any) => (
          <div key={n.id} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px', fontSize: 13.5 }}>
            <div>{n.body}</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>Added by {n.author || 'admin'} · {dateTime(n.created)}</div>
          </div>
        ))}
        {notes.length === 0 && <Empty>No notes yet</Empty>}
      </div>
    </Card>
  )
}
function ActivityTab({ activity }: any) {
  return <Card title={`Activity Logs (${activity.length})`}><Timeline evs={activity} /></Card>
}

const MENU_BOX: CSSProperties = { position: 'absolute', right: 0, top: 42, zIndex: 30, background: '#fff', border: '1px solid var(--line, #e4e7ec)', borderRadius: 10, boxShadow: '0 12px 28px rgba(16,24,40,.14)', minWidth: 190, padding: 5 }
const MENU_ITEM: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, color: 'inherit' }
const MENU_SEP: CSSProperties = { height: 1, background: 'var(--line, #eef0f3)', margin: '4px 2px' }
const LINK: CSSProperties = { background: 'none', border: 'none', color: '#5b51e8', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }
const CMP_CELL: CSSProperties = { padding: '9px 6px', verticalAlign: 'middle', wordBreak: 'break-word' }
