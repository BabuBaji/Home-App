import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Pencil, ChevronDown, ChevronRight, Star, StarHalf, Phone, Mail, MessageCircle, Calendar,
  Wallet as WalletIcon, Briefcase, LayoutGrid, MapPin, BadgeCheck, Tag, Headphones, StickyNote, Activity,
  User, CalendarPlus, CreditCard, RotateCcw, CheckCircle2, Gift, Plus, Ban, Send, Users2, Clock, TrendingUp, Award,
} from 'lucide-react'
import { fetchCustomer, updateCustomer, adjustWallet, setWalletStatus, addCustomerNote } from '../api'
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
  const [mAmt, setMAmt] = useState(''); const [mNote, setMNote] = useState('')
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
    try { const r = await adjustWallet(cid, amt, mNote); toast(r.pending ? 'Sent for approval' : 'Wallet credited'); setMoneyOpen(false); setMAmt(''); setMNote(''); load() }
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
              {c.phone && <button className="iconbtn" title="WhatsApp" style={{ width: 26, height: 26, color: '#16a34a' }} onClick={whatsApp}><MessageCircle size={15} /></button>}
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
      {tab === 'bookings' && <BookingsTab bookings={m.bookings} nav={nav} />}
      {tab === 'addresses' && <AddressesTab addresses={d.addresses || []} />}
      {tab === 'wallet' && <WalletTab c={c} txns={m.txns} wAmt={wAmt} setWAmt={setWAmt} wNote={wNote} setWNote={setWNote} wBal={wBal} setWBal={setWBal} busy={busy} onAdjust={walletAdjust} onStatus={async (s: 'active' | 'frozen' | 'blocked') => { try { await setWalletStatus(cid, s); toast(`Wallet ${s}`); load() } catch (e) { toast((e as Error).message, 'err') } }} />}
      {tab === 'membership' && <MembershipTab membership={d.membership} nav={nav} />}
      {tab === 'offers' && <OffersTab bookings={m.bookings} />}
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
        <Modal title="Add Money" onClose={() => setMoneyOpen(false)} footer={<><button className="btn line" onClick={() => setMoneyOpen(false)}>Cancel</button><button className="btn" disabled={busy || !mAmt.trim()} onClick={doAddMoney}>Add Money</button></>}>
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Current Balance"><input value={money(c.wallet || 0)} readOnly /></Field>
            <Field label="Amount (₹)"><input type="number" value={mAmt} onChange={(e) => setMAmt(e.target.value)} placeholder="500" /></Field>
            <Field label="Note"><input value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder="Reason / reference" /></Field>
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
    { label: 'Send WhatsApp Message', Icon: MessageCircle, tint: '#16a34a', on: onWa },
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
function BookingsTab({ bookings, nav }: any) {
  return (
    <Card title={`Bookings (${bookings.length})`}>
      <div className="tablewrap">
        <table className="tbl">
          <thead><tr><th>Ref</th><th>Service</th><th>Date</th><th>Worker</th><th className="num">Total</th><th>Payment</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {bookings.map((b: any) => (
              <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/bookings/${b.id}`)}>
                <td style={{ fontWeight: 600 }}>{b.ref}</td>
                <td>{b.service || '—'}</td>
                <td className="muted">{b.date ? shortDate(b.date) : shortDate(b.created)}</td>
                <td>{b.worker || <span className="muted">—</span>}</td>
                <td className="num">{money(b.total || 0)}</td>
                <td><Badge tone={b.payment_status === 'paid' ? 'green' : 'amber'} dot={false}>{b.payment_status || '—'}</Badge></td>
                <td><Badge>{b.status}</Badge></td>
                <td><ChevronRight size={15} className="muted" /></td>
              </tr>
            ))}
            {bookings.length === 0 && <tr><td colSpan={8}><Empty>No bookings</Empty></td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
function AddressesTab({ addresses }: any) {
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
      {addresses.map((a: any) => (
        <Card key={a.id} title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><MapPin size={15} /> {a.label || 'Address'}{a.is_default && <Badge tone="violet" dot={false}>Default</Badge>}</span>}>
          <div style={{ fontSize: 13.5 }}>
            <div>{a.line || [a.house, a.apartment, a.street, a.city].filter(Boolean).join(', ')}</div>
            {a.pincode && <div className="muted">{a.city ? a.city + ' — ' : ''}{a.pincode}</div>}
            {a.receiver_phone && <div className="muted" style={{ marginTop: 4 }}><Phone size={12} /> {a.receiver_phone}</div>}
            {(a.bedrooms || a.bathrooms || a.home_size) ? <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{a.home_size || ''} {a.bedrooms ? `· ${a.bedrooms} bed` : ''} {a.bathrooms ? `· ${a.bathrooms} bath` : ''}</div> : null}
          </div>
        </Card>
      ))}
      {addresses.length === 0 && <Card><Empty>No addresses saved</Empty></Card>}
    </div>
  )
}
function WalletTab({ c, txns, wAmt, setWAmt, wNote, setWNote, wBal, setWBal, busy, onAdjust, onStatus }: any) {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <MiniStat tint="#16a34a" label="Cash Balance" value={money(c.wallet || 0)} sub="added / refunds" />
        <MiniStat tint="#5b51e8" label="Promo Balance" value={money(c.promoBalance || 0)} sub="cashback / referral" />
        <MiniStat tint="#f59e0b" label="Reward Points" value={(c.rewardPoints || 0).toLocaleString('en-IN')} sub="loyalty" />
      </div>
      <Card title="Adjust Wallet">
        <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 12 }}>
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
      </Card>
      <Card title={`Transactions (${txns.length})`}>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Title</th><th>Kind</th><th>Balance</th><th className="num">Amount</th><th className="num">Bal After</th><th>Date</th></tr></thead>
            <tbody>
              {txns.slice(0, 60).map((t: any) => (
                <tr key={t.id}>
                  <td>{t.title || '—'}</td>
                  <td className="muted">{t.kind || t.type}</td>
                  <td className="muted">{t.balance_type || 'cash'}</td>
                  <td className="num" style={{ color: t.type === 'credit' ? '#16a34a' : '#e5484d' }}>{t.type === 'credit' ? '+' : '-'}{money(t.amount || 0)}</td>
                  <td className="num">{money(t.balance || 0)}</td>
                  <td className="muted">{shortDate(t.created)}</td>
                </tr>
              ))}
              {txns.length === 0 && <tr><td colSpan={6}><Empty>No transactions</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
function MembershipTab({ membership, nav }: any) {
  if (!membership?.active) return (
    <Card title="Membership">
      <Empty>No active membership. <button className="linkbtn" style={LINK} onClick={() => nav('/membership')}>View plans</button></Empty>
    </Card>
  )
  return (
    <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><Award size={16} /> Active Membership</span>}>
      <div className="grid" style={{ gap: 9, fontSize: 14 }}>
        <Row k="Plan" v={<Badge tone="violet" dot={false}>{membership.planKey}</Badge>} />
        <Row k="Billing Cycle" v={membership.cycle || '—'} />
        <Row k="Discounted bookings this month" v={membership.usedThisMonth ?? 0} />
      </div>
    </Card>
  )
}
function OffersTab({ bookings }: any) {
  const used = bookings.filter((b: any) => b.coupon).map((b: any) => ({ coupon: b.coupon, ref: b.ref, discount: b.discount || 0, date: b.created }))
  return (
    <Card title={`Coupons Redeemed (${used.length})`}>
      <div className="tablewrap">
        <table className="tbl">
          <thead><tr><th>Coupon</th><th>Booking</th><th className="num">Discount</th><th>Date</th></tr></thead>
          <tbody>
            {used.map((u: any, i: number) => (
              <tr key={i}><td><Badge tone="violet" dot={false}>{u.coupon}</Badge></td><td className="muted">{u.ref}</td><td className="num">-{money(u.discount)}</td><td className="muted">{shortDate(u.date)}</td></tr>
            ))}
            {used.length === 0 && <tr><td colSpan={4}><Empty>No coupons redeemed yet</Empty></td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
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
function MiniStat({ tint, label, value, sub }: any) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, color: tint }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, margin: '4px 0' }}>{value}</div>
      <div className="muted" style={{ fontSize: 11.5 }}>{sub}</div>
    </div>
  )
}

const MENU_BOX: CSSProperties = { position: 'absolute', right: 0, top: 42, zIndex: 30, background: '#fff', border: '1px solid var(--line, #e4e7ec)', borderRadius: 10, boxShadow: '0 12px 28px rgba(16,24,40,.14)', minWidth: 190, padding: 5 }
const MENU_ITEM: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, color: 'inherit' }
const MENU_SEP: CSSProperties = { height: 1, background: 'var(--line, #eef0f3)', margin: '4px 2px' }
const LINK: CSSProperties = { background: 'none', border: 'none', color: '#5b51e8', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }
