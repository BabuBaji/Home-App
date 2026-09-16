import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, MessageCircle, CalendarClock, RefreshCw, XCircle,
  User, HardHat, Sparkles, Clock, MapPin, IndianRupee, ShieldCheck, KeyRound, Image as ImageIcon,
  LifeBuoy, StickyNote, CheckCircle2, AlertTriangle, ArrowUpCircle, CalendarCheck, PlayCircle, PauseCircle, Flag, HelpCircle,
} from 'lucide-react'
import { Card, Badge, Avatar, Loading, ErrorState, Modal, Field, useToast, useConfirm, money, shortDate, MiniMap, parseLatLng } from '../components/UI'
import { fetchBooking, fetchCustomer, fetchWorkerDetail, fetchZones, fetchWorkers, fetchSettlement, fetchEvidence, fetchBookingActivity, fetchBookingTickets, fetchTicketDetail, postTicketMessage, updateTicket, createBookingComplaint, issueRefund, updateBooking, API_BASE, type Zone, type Settlement, type Evidence, type BookingActivity } from '../api'

const REACHED: Record<string, number> = { confirmed: 1, worker_assigned: 2, on_the_way: 3, arrived: 4, in_progress: 6, completed: 8, cancelled: 8 }
// Job-timeline lifecycle: current level per status (steps below it are done, the matching one is live).
const CUR_LV: Record<string, number> = { confirmed: 3, worker_assigned: 5, on_the_way: 5, arrived: 7, in_progress: 8, completed: 99, cancelled: -1 }
const fmtDateTime = (v?: string | null) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const timeOnly = (v?: string | null) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—')
// Rupees with 2 decimals — settlement lines (gateway fee etc.) are sub-rupee, so whole-rupee money() would hide them.
const rs = (n: number) => '₹' + (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 13 }}>
      <span className="muted">{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
const slaTone = (s: string) => (s === 'Met' || s === 'On track' ? 'green' : s === 'At Risk' ? 'amber' : s === 'Breached' ? 'red' : 'gray')

export default function AdminBookingDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const [b, setB] = useState<any>(null)
  const [cust, setCust] = useState<any>(null)
  const [worker, setWorker] = useState<any>(null)
  const [settle, setSettle] = useState<Settlement | null>(null)
  const [ev, setEv] = useState<Evidence | null>(null)
  const [seller, setSeller] = useState<any>(null)
  const [tks, setTks] = useState<{ tickets: any[]; counts: any } | null>(null)
  const [selTk, setSelTk] = useState<number | null>(null)
  const [tkDetail, setTkDetail] = useState<any>(null)
  const [tkMsg, setTkMsg] = useState('')
  const [tkTab, setTkTab] = useState<'conversation' | 'resolution' | 'notes'>('conversation')
  const [activity, setActivity] = useState<{ activities: BookingActivity[]; counts: any } | null>(null)
  const [aMod, setAMod] = useState('all')
  const [aRole, setARole] = useState('all')
  const [aAct, setAAct] = useState('all')
  const [aFrom, setAFrom] = useState('')
  const [aTo, setATo] = useState('')
  const [aPage, setAPage] = useState(1)
  const [zones, setZones] = useState<Zone[]>([])
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<'overview' | 'timeline' | 'payment' | 'evidence' | 'support' | 'activity'>('overview')

  const [modal, setModal] = useState<null | 'reassign' | 'reschedule'>(null)
  const [workerList, setWorkerList] = useState<{ id: number; name: string }[]>([])
  const [assignTo, setAssignTo] = useState('')
  const [reDate, setReDate] = useState('')
  const [reTime, setReTime] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setErr('')
    fetchBooking(Number(id)).then((bk) => {
      setB(bk)
      if (bk.user_id) fetchCustomer(bk.user_id).then(setCust).catch(() => {})
      if (bk.worker_id) fetchWorkerDetail(bk.worker_id).then(setWorker).catch(() => {})
    }).catch((e: Error) => setErr(e.message))
    fetchSettlement(Number(id)).then(setSettle).catch(() => {})
    fetchEvidence(Number(id)).then(setEv).catch(() => {})
    fetchBookingTickets(Number(id)).then((r) => { setTks(r); setSelTk((cur) => cur ?? (r.tickets[0]?.id ?? null)) }).catch(() => {})
    fetchBookingActivity(Number(id)).then(setActivity).catch(() => {})
  }
  useEffect(() => {
    load(); fetchZones().then(setZones).catch(() => {})
    fetch(`${API_BASE}/api/invoice-info`).then((r) => r.json()).then(setSeller).catch(() => {})
  }, [id])
  useEffect(() => { if (selTk) fetchTicketDetail(selTk).then(setTkDetail).catch(() => {}); else setTkDetail(null) }, [selTk])

  const derived = useMemo(() => {
    if (!b) return null
    const active = b.status !== 'cancelled' && b.status !== 'completed'
    const zone = zones.find((z) => z.id === b.zone_id)
    let scheduledAt: Date | null = null
    if (b.date && b.time) { const d = new Date(`${b.date} ${b.time}`); if (!isNaN(d.getTime())) scheduledAt = d }
    const delayMin = active && scheduledAt && !b.started_at ? Math.max(0, Math.round((Date.now() - scheduledAt.getTime()) / 60000)) : 0
    const assignmentSla = b.pro_name ? 'Met' : active ? 'At Risk' : '—'
    const arrivalSla = !active ? (b.status === 'completed' ? 'Met' : '—') : b.started_at || ['arrived', 'in_progress'].includes(b.status) ? 'Met' : delayMin === 0 ? 'On track' : delayMin <= 10 ? 'At Risk' : 'Breached'
    const serviceSla = b.status === 'completed' ? 'Met' : 'Pending'
    return { active, zone, scheduledAt, delayMin, assignmentSla, arrivalSla, serviceSla }
  }, [b, zones])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!b || !derived) return <Loading />

  const custPhone: string = cust?.customer?.phone || ''
  const custEmail: string = cust?.customer?.email || ''
  const custRating: number = cust?.customer?.rating || 0
  const custBookings: number = (cust?.bookings || []).length
  const items: any[] = Array.isArray(b.items) ? b.items : []
  const svcName = b.service || items.map((i) => i.name).join(', ') || 'Service'
  const workerPhone: string = worker?.phone || ''
  const workerRating: number = worker?.rating || b.pro_rating || 0
  const workerJobs: number = worker?.jobsCompleted ?? worker?.jobs ?? 0
  const margin = Math.max(0, (b.total || 0) - (b.worker_comp || 0))
  const marginPct = b.total ? Math.round((margin / b.total) * 1000) / 10 : 0
  const reached = REACHED[b.status] ?? 0
  const payMethod = b.payment === 'wallet' ? 'HomeHelp Wallet' : b.payment === 'razorpay' || b.payment === 'card' || b.payment === 'upi' ? 'Razorpay' : b.payment || '—'
  const durMin = b.started_at && b.completed_at ? Math.max(0, Math.round((new Date(b.completed_at).getTime() - new Date(b.started_at).getTime()) / 60000)) : 0
  const totalDuration = durMin ? `${durMin}m` : (b.duration || items[0]?.durationLabel || '—')

  const openReassign = () => { setAssignTo(''); setModal('reassign'); if (!workerList.length) fetchWorkers().then((r) => setWorkerList((r.workers || []).map((w: any) => ({ id: w.id, name: w.name })))).catch(() => {}) }
  const doUpdate = (body: Record<string, unknown>, msg: string) => {
    setSaving(true)
    updateBooking(Number(id), body).then(() => { toast(msg, 'ok'); setModal(null); setSaving(false); load() }).catch((e: Error) => { toast(e.message, 'err'); setSaving(false) })
  }
  const reassign = () => { if (!assignTo) return toast('Select a worker', 'err'); doUpdate({ workerId: Number(assignTo), workerName: workerList.find((w) => String(w.id) === assignTo)?.name || '' }, 'Worker reassigned') }
  const reschedule = () => { if (!reDate && !reTime) return toast('Set a date or time', 'err'); doUpdate({ date: reDate || b.date, time: reTime || b.time }, 'Booking rescheduled') }
  const escalate = () => doUpdate({ escalated: true, escalateReason: 'Flagged from Booking Details' }, 'Booking escalated')
  const reopen = async () => { if (!(await confirm({ title: 'Reopen this service?', message: 'Moves the booking back to in-progress so the worker can resume/redo it.', confirmLabel: 'Reopen' }))) return; doUpdate({ status: 'in_progress' }, 'Service reopened') }
  const mediaAbs = (u: string) => (!u ? '' : u.startsWith('http') ? u : `${API_BASE}${u}`)
  const exportActivity = () => {
    if (!activity) return
    const rows = ['Date & Time,Performed By,Role,Module,Action,Details']
    activity.activities.forEach((a) => rows.push([new Date(a.at).toLocaleString('en-IN'), a.name, a.role, a.module, a.actionType, a.details].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob)
    const el = document.createElement('a'); el.href = url; el.download = `${String(b.ref).replace('#', '')}-activity.csv`; el.click(); URL.revokeObjectURL(url)
  }
  const reloadTickets = () => { if (selTk) fetchTicketDetail(selTk).then(setTkDetail).catch(() => {}); fetchBookingTickets(Number(id)).then(setTks).catch(() => {}) }
  const sendTkMsg = (internal = false) => { const body = tkMsg.trim(); if (!body || !selTk) return; postTicketMessage(selTk, { body, internal }).then(() => { setTkMsg(''); reloadTickets() }).catch((e: Error) => toast(e.message, 'err')) }
  const setTkStatus = (status: string) => { if (!selTk) return; updateTicket(selTk, { status }).then(() => { toast('Ticket updated', 'ok'); reloadTickets() }).catch((e: Error) => toast(e.message, 'err')) }
  const escalateTk = () => { if (!selTk) return; updateTicket(selTk, { escalated: true, status: 'Escalated' }).then(() => { toast('Ticket escalated', 'ok'); reloadTickets() }).catch((e: Error) => toast(e.message, 'err')) }
  const newComplaint = () => {
    createBookingComplaint({ bookingId: Number(id), bookingRef: b.ref, userId: b.user_id, category: 'General', subject: 'Complaint on this booking', message: 'Complaint raised from admin.', priority: 'medium', raisedBy: 'Admin', source: 'admin' })
      .then((t) => { toast('Complaint created', 'ok'); fetchBookingTickets(Number(id)).then((r) => { setTks(r); setSelTk(t.id) }) }).catch((e: Error) => toast(e.message, 'err'))
  }
  const cancel = async () => { if (!(await confirm({ title: 'Cancel this booking?', message: 'The customer is notified and refunded per policy.', confirmLabel: 'Cancel booking', danger: true }))) return; doUpdate({ status: 'cancelled' }, 'Booking cancelled') }
  const doRefund = async () => {
    if (!(await confirm({ title: 'Create a refund for this booking?', message: 'Routed through the approval matrix — it may execute now or queue for sign-off.', confirmLabel: 'Create refund' }))) return
    issueRefund(b.id).then((r: any) => { toast(r?.executed ? 'Refund issued' : 'Refund queued for approval', 'ok'); load() }).catch((e: Error) => toast(e.message, 'err'))
  }
  // Generate a real PDF via a print-optimised HTML window (browser "Save as PDF") — no PDF lib needed.
  const exportDoc = (type: 'invoice' | 'receipt' | 'payout' | 'all') => {
    if (!settle) return
    const co = { name: seller?.name || 'HomeHelp Services Pvt. Ltd.', gstin: seller?.gstin || '', address: seller?.address || '', sac: seller?.sac || '9987' }
    const c = settle.customer, p = settle.payout
    const base = items[0]?.price ?? c.subtotal, addons = Math.max(0, c.subtotal - base)
    const esc = (v: any) => String(v ?? '').replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch] || ch))
    const inr = (n: number) => '₹' + (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const dt = (v?: string | null) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
    const dateOnly = b.date ? shortDate(b.date) : shortDate(b.created)
    const head = (title: string, no: string, when: string) => `<div class="head"><div><div class="brand">${esc(co.name)}</div><div class="muted">${esc(co.address)}</div>${co.gstin ? `<div class="muted">GSTIN: ${esc(co.gstin)}</div>` : ''}</div><div class="title"><h1>${title}</h1><div class="muted">${esc(no)}</div><div class="muted">${esc(when)}</div></div></div>`
    const invoice = `<div class="doc">${head('TAX INVOICE', settle.documents.invoice, dateOnly)}
      <div class="grid2"><div class="box"><b>Billed To</b>${esc(b.customer)}<br>${esc(custPhone)}<br>${esc(b.address)}</div><div class="box"><b>Booking</b>${esc(b.ref)} · ${esc(svcName)}<br>${esc(dateOnly)} ${esc(b.time || '')}<br>Zone: ${esc(derived!.zone?.name || '—')}</div></div>
      <table><thead><tr><th>Description</th><th>SAC</th><th class="r">Amount</th></tr></thead><tbody>
      <tr><td>${esc(svcName)} (${esc(b.duration || '1 session')})</td><td>${esc(co.sac)}</td><td class="r">${inr(base)}</td></tr>
      ${addons ? `<tr><td>Add-ons</td><td>${esc(co.sac)}</td><td class="r">${inr(addons)}</td></tr>` : ''}</tbody></table>
      <div class="tot"><table>
      <tr><td>Subtotal</td><td class="r">${inr(c.subtotal)}</td></tr>
      ${c.discount ? `<tr><td>Discount${c.coupon ? ` (${esc(c.coupon)})` : ''}</td><td class="r">− ${inr(c.discount)}</td></tr>` : ''}
      ${c.fee ? `<tr><td>Platform Fee</td><td class="r">${inr(c.fee)}</td></tr>` : ''}
      <tr><td>CGST</td><td class="r">${inr(c.tax / 2)}</td></tr><tr><td>SGST</td><td class="r">${inr(c.tax / 2)}</td></tr>
      <tr class="grand"><td>Total</td><td class="r">${inr(c.total)}</td></tr></table></div>
      <div class="foot">Computer-generated tax invoice · ${esc(co.name)}${co.gstin ? ` · GSTIN ${esc(co.gstin)}` : ''}</div></div>`
    const receipt = `<div class="doc">${head('PAYMENT RECEIPT', settle.documents.receipt, dt(settle.paidAt))}
      <div class="grid2"><div class="box"><b>Received From</b>${esc(b.customer)}<br>${esc(custPhone)}</div><div class="box"><b>For Booking</b>${esc(b.ref)} · ${esc(svcName)}</div></div>
      <table><tbody><tr><td>Amount Received</td><td class="r"><b>${inr(b.total)}</b></td></tr><tr><td>Payment Method</td><td class="r">${esc(payMethod)}</td></tr><tr><td>Payment Status</td><td class="r">${esc(b.payment_status || '—')}</td></tr><tr><td>Transaction ID</td><td class="r">${esc(settle.txns[0]?.txnId || '—')}</td></tr></tbody></table>
      <div class="foot">Received with thanks · ${esc(co.name)}</div></div>`
    const payout = `<div class="doc">${head('WORKER PAYOUT SLIP', settle.documents.payoutSlip, dt(p.paidAt))}
      <div class="grid2"><div class="box"><b>Paid To</b>${esc(p.workerName || '—')}${p.workerId ? `<br>WRK-${p.workerId}` : ''}</div><div class="box"><b>For Booking</b>${esc(b.ref)} · ${esc(svcName)}</div></div>
      <table><tbody><tr><td>Base Payout</td><td class="r">${inr(p.amount)}</td></tr>${p.incentive ? `<tr><td>Incentive</td><td class="r">${inr(p.incentive)}</td></tr>` : ''}<tr class="grand"><td>Total Payout</td><td class="r">${inr(p.total)}</td></tr><tr><td>Status</td><td class="r">${esc(p.status)}</td></tr><tr><td>Transaction ID</td><td class="r">${esc(p.txnId)}</td></tr></tbody></table>
      <div class="foot">Worker payout slip · ${esc(co.name)}</div></div>`
    const parts = type === 'all' ? [invoice, receipt, payout] : type === 'invoice' ? [invoice] : type === 'receipt' ? [receipt] : [payout]
    const css = `*{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}body{margin:0;color:#1c2033}.doc{max-width:760px;margin:0 auto;padding:40px}.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #5b51e8;padding-bottom:16px;margin-bottom:16px}.brand{font-size:19px;font-weight:800;color:#5b51e8}.muted{color:#6b7090;font-size:12px}.title{text-align:right}.title h1{margin:0;font-size:20px;letter-spacing:1px}.grid2{display:flex;justify-content:space-between;gap:24px;margin:14px 0}.box{flex:1;font-size:12.5px;line-height:1.5}.box b{display:block;margin-bottom:4px;font-size:10.5px;text-transform:uppercase;color:#6b7090}table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13px}th,td{padding:9px 10px;border-bottom:1px solid #eceaf6;text-align:left}th{background:#f6f6fe;font-size:10.5px;text-transform:uppercase;color:#6b7090}td.r,th.r{text-align:right}.tot{display:flex;justify-content:flex-end}.tot table{width:300px}.tot td{border:none;padding:5px 10px}.grand td{font-weight:800;font-size:15px;border-top:2px solid #1c2033;padding-top:8px}.foot{margin-top:28px;font-size:11px;color:#6b7090;text-align:center;border-top:1px solid #eceaf6;padding-top:12px}.pagebreak{page-break-after:always}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`
    const w = window.open('', '_blank', 'width=880,height=1000')
    if (!w) { toast('Allow pop-ups to download the document', 'err'); return }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(String(b.ref).replace('#', ''))}-${type}</title><style>${css}</style></head><body onload="setTimeout(function(){window.print()},250)">${parts.join('<div class="pagebreak"></div>')}</body></html>`)
    w.document.close()
  }

  const tel = (p: string) => p && window.open(`tel:${p}`)
  const custPos = parseLatLng({ lat: b.cust_lat, lng: b.cust_lng })
  const workerPos = parseLatLng({ lat: b.worker_lat, lng: b.worker_lng })

  // ---------- Job-timeline steps ----------
  const curLv = CUR_LV[b.status] ?? 3
  type Step = { icon: ReactNode; label: string; desc: string; at: string | null; lv: number; extra?: string; optional?: boolean }
  const steps: Step[] = [
    { icon: <CalendarCheck size={15} />, label: 'Booking Created', desc: 'Booking created by customer from mobile app', at: b.created, lv: 1 },
    { icon: <IndianRupee size={15} />, label: 'Payment Completed', desc: `Payment of ${money(b.total)} completed via ${payMethod}`, at: b.created, lv: 2 },
    { icon: <User size={15} />, label: 'Worker Assigned', desc: b.pro_name ? `${b.pro_name} assigned by Auto Dispatch` : 'Awaiting worker assignment', at: null, lv: 3 },
    { icon: <User size={15} />, label: 'Worker Accepted', desc: 'Worker accepted the job', at: null, lv: 4 },
    { icon: <MapPin size={15} />, label: 'On the Way', desc: 'Worker started from current location', at: null, lv: 5 },
    { icon: <MapPin size={15} />, label: 'Arrived at Location', desc: 'Worker reached customer location', at: null, lv: 6 },
    { icon: <KeyRound size={15} />, label: 'OTP Verified (Start)', desc: 'Start OTP verified by customer', at: b.started_at, lv: 7, extra: b.service_otp ? `OTP: ${b.service_otp}` : '' },
    { icon: <PlayCircle size={15} />, label: 'Service Started', desc: 'Service in progress', at: b.started_at, lv: 8, extra: b.duration ? `Duration: ${b.duration}` : '' },
    { icon: <PauseCircle size={15} />, label: 'Service Paused', desc: 'If worker pauses the service', at: null, lv: 9, optional: true },
    { icon: <PlayCircle size={15} />, label: 'Service Resumed', desc: 'If worker resumes the service', at: null, lv: 10, optional: true },
    { icon: <KeyRound size={15} />, label: 'OTP Verified (Completion)', desc: 'Completion OTP verified by customer', at: null, lv: 11 },
    { icon: <CheckCircle2 size={15} />, label: 'Service Completed', desc: 'Worker marked the service as completed', at: b.completed_at, lv: 12 },
    { icon: <CheckCircle2 size={15} />, label: 'Customer Confirmed', desc: 'Customer confirmed the service & rated', at: b.rating ? b.completed_at : null, lv: 13 },
    { icon: <Flag size={15} />, label: 'Closed', desc: 'Booking closed successfully', at: null, lv: 14 },
  ]
  const stepState = (s: Step): 'done' | 'current' | 'pending' => {
    if (b.status === 'cancelled') return s.lv <= 2 ? 'done' : 'pending'
    if (s.optional) return 'pending'
    if (s.lv < curLv) return 'done'
    if (s.lv === curLv && derived.active) return 'current'
    return 'pending'
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* header */}
      <div>
        <button className="btn line sm" onClick={() => nav('/bookings')} style={{ marginBottom: 10 }}><ArrowLeft size={14} /> Back to Bookings</button>
        <div className="row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>Booking {b.ref}</h2>
          <Badge>{b.status}</Badge>
          <Badge tone={(b.payment_status || '').toLowerCase() === 'paid' ? 'green' : 'amber'}>{b.payment_status || b.payment || '—'}</Badge>
          {b.escalated && <Badge tone="red">Escalated</Badge>}
          <div className="row" style={{ gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button className="btn line sm" disabled={!custPhone} onClick={() => tel(custPhone)}><Phone size={14} /> Call Customer</button>
            <button className="btn line sm" disabled={!workerPhone} onClick={() => tel(workerPhone)}><Phone size={14} /> Call Worker</button>
            <button className="btn line sm" onClick={() => { setReDate(''); setReTime(''); setModal('reschedule') }}><CalendarClock size={14} /> Reschedule</button>
            <button className="btn line sm" onClick={openReassign}><RefreshCw size={14} /> Reassign</button>
            <button className="btn line sm" disabled={b.escalated} onClick={escalate}><ArrowUpCircle size={14} /> {b.escalated ? 'Escalated' : 'Escalate'}</button>
            <button className="btn line sm" style={{ color: 'var(--red)' }} onClick={cancel}><XCircle size={14} /> Cancel</button>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{svcName} · {b.date ? shortDate(b.date) : shortDate(b.created)}{b.time ? `, ${b.time}` : ''}</div>
      </div>

      {/* tabs */}
      <div className="tabs">
        {(['overview', 'timeline', 'payment', 'evidence', 'support', 'activity'] as const).map((t) => (
          <button key={t} className={'tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>
            {{ overview: 'Overview', timeline: 'Job Timeline', payment: 'Payment & Settlement', evidence: 'Service Evidence', support: 'Support', activity: 'Activity Logs' }[t]}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {summaryCard()}{customerCard()}{workerCard()}{serviceCard()}
          {journeyCard()}{trackingCard()}{paymentCard()}{slaCard()}{otpCard()}{evidenceCard()}{notesCard()}
        </div>
      )}

      {tab === 'timeline' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2.1fr) minmax(280px, 1fr)', gap: 16, alignItems: 'start' }}>
          <div className="grid" style={{ gap: 16 }}>
            {/* KPI strip */}
            <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              {[
                { ic: <CalendarCheck size={18} />, tint: '#5b51e8', label: 'Total Duration', val: totalDuration },
                { ic: <PlayCircle size={18} />, tint: '#2e90fa', label: 'Actual Start', val: timeOnly(b.started_at) },
                { ic: <CheckCircle2 size={18} />, tint: '#16a34a', label: 'Completed At', val: timeOnly(b.completed_at) },
                { ic: <CheckCircle2 size={18} />, tint: '#f59e0b', label: 'Customer Confirmed', val: b.rating ? timeOnly(b.completed_at) : '—' },
                { ic: <Flag size={18} />, tint: b.status === 'completed' ? '#16a34a' : '#98a2b3', label: 'Status', val: b.status },
              ].map((k) => (
                <div key={k.label} className="card" style={{ padding: '12px 14px' }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center', color: k.tint }}>{k.ic}<span className="muted" style={{ fontSize: 12, color: 'var(--muted)' }}>{k.label}</span></div>
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4, textTransform: 'capitalize' }}>{k.val}</div>
                </div>
              ))}
            </div>

            {/* Service extensions — extra time the worker asked for and the customer granted. Only
                rendered when the booking actually has requests, so untouched bookings look unchanged. */}
            {Array.isArray(b.extensions) && b.extensions.length > 0 && (
              <Card
                title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><Clock size={16} /> Service Extensions</span>}
                right={
                  <span className="muted" style={{ fontSize: 12 }}>
                    {b.extension_minutes || 0} min added · ₹{b.extension_total || 0} charged
                  </span>
                }
              >
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Requested</th><th>By</th><th>Extra time</th>
                        <th>Customer ₹</th><th>Paid via</th><th>Worker ₹</th><th>Reason</th><th>Status</th><th>Decided</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.extensions.map((x: any) => (
                        <tr key={x.id}>
                          <td>{fmtDateTime(x.created)}</td>
                          <td style={{ textTransform: 'capitalize' }}>{x.requestedBy}</td>
                          <td><b>+{x.minutes} min</b></td>
                          {/* A ₹0 charge is a deliberate outcome (worker overran their own estimate),
                              not missing data — say so rather than showing a bare 0. */}
                          <td>{x.price > 0 ? `₹${x.price}` : <span className="muted">not charged</span>}</td>
                          <td>{x.paymentMethod ? <span style={{ textTransform: 'uppercase' }}>{x.paymentMethod}</span> : <span className="muted">—</span>}</td>
                          <td>{x.payout > 0 ? `₹${x.payout}` : <span className="muted">—</span>}</td>
                          <td style={{ fontSize: 12.5 }}>{x.reasonLabel}{x.reasonText ? ` — ${x.reasonText}` : ''}</td>
                          <td>
                            <Badge tone={x.status === 'approved' ? 'green' : x.status === 'declined' ? 'red' : 'amber'} dot={false}>
                              {x.status}
                            </Badge>
                          </td>
                          <td>{x.decided ? fmtDateTime(x.decided) : <span className="muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Extensions are billed separately from the booking — the original service price is never rewritten.
                  Worker payouts are credited when the job completes.
                </div>
              </Card>
            )}

            {/* vertical timeline */}
            <Card title="Job Timeline">
              <div style={{ position: 'relative' }}>
                {steps.map((s, i) => {
                  const st = stepState(s)
                  const dotBg = st === 'done' ? '#16a34a' : st === 'current' ? '#5b51e8' : '#fff'
                  const dotBd = st === 'done' ? '#16a34a' : st === 'current' ? '#5b51e8' : '#d5d7e3'
                  return (
                    <div key={i} className="row" style={{ gap: 12, alignItems: 'stretch' }}>
                      {/* rail */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flex: 'none' }}>
                        <span style={{ width: 18, height: 18, borderRadius: 50, background: dotBg, border: `2px solid ${dotBd}`, display: 'grid', placeItems: 'center', color: '#fff', marginTop: 14, flex: 'none' }}>{st === 'done' && <CheckCircle2 size={11} />}</span>
                        {i < steps.length - 1 && <span style={{ flex: 1, width: 2, background: st === 'done' ? '#bfe6cd' : '#eceaf6', minHeight: 20 }} />}
                      </div>
                      {/* body */}
                      <div className="row" style={{ flex: 1, gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: i < steps.length - 1 ? '1px solid var(--line-2,#f4f4fa)' : 'none', opacity: st === 'pending' ? 0.5 : 1 }}>
                        <span style={{ width: 32, height: 32, borderRadius: 9, background: st === 'current' ? '#eef0ff' : '#f4f4fa', color: st === 'current' ? '#5b51e8' : '#6b7090', display: 'grid', placeItems: 'center', flex: 'none' }}>{s.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: st === 'current' ? '#5b51e8' : 'var(--ink)' }}>{s.label}</div>
                          <div className="muted" style={{ fontSize: 12.5 }}>{s.desc}</div>
                        </div>
                        <div style={{ textAlign: 'right', flex: 'none' }}>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.at ? fmtDateTime(s.at) : '—'}</div>
                          {s.extra && <div style={{ fontSize: 12, fontWeight: 700, color: st === 'current' ? '#5b51e8' : '#0f8a4d', marginTop: 2 }}>{s.extra}</div>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* legend */}
              <div className="row" style={{ gap: 16, marginTop: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                {[['#16a34a', 'Completed'], ['#5b51e8', 'In Progress'], ['#d5d7e3', 'Pending'], ['#f04438', 'Cancelled'], ['#7c3aed', 'Rescheduled']].map(([c, l]) => (
                  <span key={l} className="row" style={{ gap: 6, alignItems: 'center' }}><i style={{ width: 9, height: 9, borderRadius: 50, background: c, display: 'inline-block' }} />{l}</span>
                ))}
              </div>
            </Card>
          </div>

          {/* sidebar */}
          <div className="grid" style={{ gap: 16 }}>
            {summaryCard()}{customerCard()}{workerCard()}{keyInfoCard()}{needHelpCard()}
          </div>
        </div>
      )}

      {tab === 'payment' && (
        <div className="grid" style={{ gap: 16 }}>
          {/* KPI strip */}
          <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="card" style={{ padding: '14px 16px' }}><div className="row" style={{ gap: 8, color: '#16a34a' }}><IndianRupee size={17} /><span className="muted" style={{ fontSize: 12 }}>Customer Paid</span></div><div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{money(b.total)}</div><div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>Paid via {payMethod}</div></div>
            <div className="card" style={{ padding: '14px 16px' }}><div className="row" style={{ gap: 8, color: '#f59e0b' }}><CheckCircle2 size={17} /><span className="muted" style={{ fontSize: 12 }}>Payment Status</span></div><div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, textTransform: 'capitalize' }}>{b.payment_status || '—'}</div><div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{fmtDateTime(b.created)}</div></div>
            <div className="card" style={{ padding: '14px 16px' }}><div className="row" style={{ gap: 8, color: '#5b51e8' }}><KeyRound size={17} /><span className="muted" style={{ fontSize: 12 }}>Payment Method</span></div><div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{payMethod}</div>{settle && <div className="row" style={{ gap: 6, marginTop: 4, alignItems: 'center' }}><span className="muted" style={{ fontSize: 11 }}>{settle.txns[0]?.txnId}</span></div>}</div>
            <div className="card" style={{ padding: '14px 16px' }}><div className="row" style={{ gap: 8, color: '#2e90fa' }}><ImageIcon size={17} /><span className="muted" style={{ fontSize: 12 }}>Invoice</span></div><div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{settle?.documents.invoice || '—'}</div><button className="btn line" style={{ fontSize: 11, padding: '4px 8px', marginTop: 6 }} onClick={() => exportDoc('invoice')}>View Invoice</button></div>
            <div className="card" style={{ padding: '14px 16px' }}><div className="row" style={{ gap: 8, color: '#ec4899' }}><ImageIcon size={17} /><span className="muted" style={{ fontSize: 12 }}>Receipt</span></div><div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{settle?.documents.receipt || '—'}</div><button className="btn line" style={{ fontSize: 11, padding: '4px 8px', marginTop: 6 }} onClick={() => exportDoc('receipt')}>View Receipt</button></div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2.4fr) minmax(280px, 1fr)', gap: 16, alignItems: 'start' }}>
            <div className="grid" style={{ gap: 16 }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {priceBreakdownCard()}{settlementSummaryCard()}{payoutCard()}
              </div>
              {txnHistoryCard()}
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>{refundCard()}{documentsCard()}</div>
            </div>
            <div className="grid" style={{ gap: 16 }}>{customerCard()}{workerCard()}{summaryCard()}{needHelpCard()}</div>
          </div>
        </div>
      )}
      {tab === 'evidence' && (!ev ? <Loading /> : (() => {
        const done = ev.checklist.filter((t) => t.completed).length
        const pct = ev.checklist.length ? Math.round((done / ev.checklist.length) * 100) : 0
        const schedMin = (() => { const d = String(b.duration || items[0]?.durationLabel || ''); const h = /(\d+)\s*h/i.exec(d); const m = /(\d+)\s*m/i.exec(d); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0) || 60 })()
        const durTxt = ev.durationMin != null ? `${Math.floor(ev.durationMin / 60)}h ${String(ev.durationMin % 60).padStart(2, '0')}m` : '—'
        const ext = ev.durationMin != null ? ev.durationMin - schedMin : 0
        const acts = [ev.beforeAt && [ev.beforeAt, 'Before photos uploaded'], ev.checkIn.at && [ev.checkIn.at, 'Start verification (OTP verified)'], b.started_at && [b.started_at, 'Service started'], ev.afterAt && [ev.afterAt, 'After photos uploaded'], ev.checkOut.at && [ev.checkOut.at, 'End verification (OTP verified)'], b.rating && [b.completed_at, 'Customer confirmed & rated']].filter(Boolean) as [string, string][]
        const verifyBlock = (title: string, v: Evidence['checkIn']) => (
          <div style={{ marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}><b style={{ fontSize: 13 }}><CheckCircle2 size={13} style={{ color: '#16a34a', verticalAlign: -2 }} /> {title}</b>{v.verified ? <Badge tone="green" dot={false}>Verified</Badge> : <Badge tone="amber" dot={false}>Pending</Badge>}</div>
            <Row label="Verified By" value="Customer" />
            <Row label="OTP" value={v.otp || '—'} />
            <Row label="Verified At" value={fmtDateTime(v.at) || '—'} />
          </div>
        )
        return (
        <div className="grid" style={{ gap: 16 }}>
          {/* KPI strip */}
          <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="card" style={{ padding: '12px 14px' }}><div className="row" style={{ gap: 8, alignItems: 'center' }}><Avatar name={ev.worker.name} size={30} /><div><div className="muted" style={{ fontSize: 11 }}>Worker</div><div style={{ fontWeight: 700, fontSize: 13 }}>{ev.worker.name || '—'}</div>{ev.worker.rating > 0 && <div className="muted" style={{ fontSize: 11 }}>★ {ev.worker.rating}</div>}</div></div></div>
            <div className="card" style={{ padding: '12px 14px' }}><div className="muted" style={{ fontSize: 11 }}>Check-in (Start)</div><div style={{ fontWeight: 800, fontSize: 16 }}>{timeOnly(ev.checkIn.at)}</div>{ev.checkIn.otp && <Badge tone="green" dot={false}>OTP {ev.checkIn.otp}</Badge>}</div>
            <div className="card" style={{ padding: '12px 14px' }}><div className="muted" style={{ fontSize: 11 }}>Check-out (End)</div><div style={{ fontWeight: 800, fontSize: 16 }}>{timeOnly(ev.checkOut.at)}</div>{ev.checkOut.otp && <Badge tone="green" dot={false}>OTP {ev.checkOut.otp}</Badge>}</div>
            <div className="card" style={{ padding: '12px 14px' }}><div className="muted" style={{ fontSize: 11 }}>Actual Duration</div><div style={{ fontWeight: 800, fontSize: 16 }}>{durTxt}</div>{ext > 0 && <Badge tone="amber" dot={false}>+{ext}m Extension</Badge>}</div>
            <div className="card" style={{ padding: '12px 14px' }}><div className="muted" style={{ fontSize: 11 }}>Service Status</div><div style={{ fontWeight: 800, fontSize: 15, color: b.status === 'completed' ? '#16a34a' : 'var(--ink)', textTransform: 'capitalize' }}>{b.status}</div>{b.rating > 0 && <div className="muted" style={{ fontSize: 11 }}>Customer confirmed</div>}</div>
            <div className="card" style={{ padding: '12px 14px' }}><div className="muted" style={{ fontSize: 11 }}>Location</div><div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{ev.location.address || '—'}</div></div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2.6fr) minmax(260px, 1fr)', gap: 16, alignItems: 'start' }}>
            <div className="grid" style={{ gap: 16 }}>
              {/* photos */}
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                {([['Before Service Photos', ev.beforePhotos, ev.beforeAt], ['After Service Photos', ev.afterPhotos, ev.afterAt]] as const).map(([title, photos, at]) => (
                  <Card key={title} title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><ImageIcon size={16} /> {title}</span>} right={<span className="muted" style={{ fontSize: 12 }}>{photos.length} Photos</span>}>
                    {photos.length ? <>
                      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
                        {photos.map((ph, i) => <a key={i} href={mediaAbs(ph.url)} target="_blank" rel="noreferrer"><img src={mediaAbs(ph.url)} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} onError={(e) => ((e.currentTarget as HTMLImageElement).style.opacity = '0.2')} /></a>)}
                      </div>
                      {at && <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Uploaded at {fmtDateTime(at)}</div>}
                    </> : <div className="muted" style={{ fontSize: 13, padding: '14px 0' }}>No photos captured.</div>}
                  </Card>
                ))}
              </div>

              {/* checklist + verification */}
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><Sparkles size={16} /> Service Checklist</span>}>
                  {ev.checklist.length ? <>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead><tr style={{ color: 'var(--muted)', fontSize: 11 }}><th style={{ textAlign: 'left', padding: '4px 6px' }}>Task</th><th style={{ padding: '4px 6px' }}>Required</th><th style={{ padding: '4px 6px' }}>Done</th></tr></thead>
                      <tbody>{ev.checklist.map((t, i) => (
                        <tr key={i}><td style={{ padding: '6px' }}>{i + 1}. {t.task}</td><td style={{ padding: '6px', textAlign: 'center' }}>{t.required ? <CheckCircle2 size={14} style={{ color: '#16a34a' }} /> : '—'}</td><td style={{ padding: '6px', textAlign: 'center' }}>{t.completed ? <CheckCircle2 size={14} style={{ color: '#16a34a' }} /> : <span style={{ color: '#d5d7e3' }}>○</span>}</td></tr>
                      ))}</tbody>
                    </table>
                    <div style={{ height: 8, background: '#eceaf6', borderRadius: 6, marginTop: 10, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: '#16a34a' }} /></div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{done}/{ev.checklist.length} Completed · {pct}%</div>
                  </> : <div className="muted" style={{ fontSize: 13, padding: '14px 0' }}>No checklist captured for this service.</div>}
                </Card>
                <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><ShieldCheck size={16} /> Service Verification</span>}>
                  {verifyBlock('Start Verification (Check-in)', ev.checkIn)}
                  {verifyBlock('End Verification (Check-out)', ev.checkOut)}
                  <div className="row" style={{ gap: 16, marginTop: 4, fontSize: 12 }}>
                    <div><div className="muted">Actual</div><b>{durTxt}</b></div>
                    <div><div className="muted">Scheduled</div><b>{Math.floor(schedMin / 60)}h {String(schedMin % 60).padStart(2, '0')}m</b></div>
                    {ext > 0 && <div><div className="muted">Extension</div><b style={{ color: '#b97400' }}>+{ext}m</b></div>}
                  </div>
                </Card>
              </div>

              {/* materials + notes + feedback */}
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                <Card title="Materials / Equipment Used"><div className="muted" style={{ fontSize: 13, padding: '6px 0' }}>{ev.materials || 'No additional materials used for this service.'}</div></Card>
                <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><StickyNote size={16} /> Worker Notes</span>}>{ev.workerNotes ? <div style={{ fontSize: 13 }}>{ev.workerNotes}<div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Submitted at {fmtDateTime(b.completed_at)}</div></div> : <div className="muted" style={{ fontSize: 13 }}>No notes from the worker.</div>}</Card>
                <Card title="Customer Feedback">{ev.feedback.rating > 0 ? <><Row label="Rating" value={<b style={{ color: '#f5b301' }}>{'★'.repeat(ev.feedback.rating)}{'☆'.repeat(Math.max(0, 5 - ev.feedback.rating))} {ev.feedback.rating.toFixed(1)}</b>} />{ev.feedback.review && <div style={{ fontSize: 13, marginTop: 4 }}>“{ev.feedback.review}”</div>}<div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Submitted {fmtDateTime(b.completed_at)}</div></> : <div className="muted" style={{ fontSize: 13 }}>No feedback yet.</div>}</Card>
              </div>

              {/* bottom actions */}
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                <Card title="Need Adjustment or Issue?"><div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Raise a complaint or request an adjustment for this booking.</div><button className="btn line" onClick={() => nav('/support')}><LifeBuoy size={14} /> Create Support Ticket</button></Card>
                <Card title="Reopen Service"><div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>If the customer reported an issue, you can reopen this service.</div><button className="btn line" onClick={reopen}><RefreshCw size={14} /> Reopen Booking</button></Card>
              </div>
            </div>

            {/* sidebar */}
            <div className="grid" style={{ gap: 16 }}>
              <Card title="Service Summary">
                <Row label="Service" value={ev.summary.service || svcName} />
                <Row label="Duration" value={ev.summary.duration || '—'} />
                <Row label="Quantity" value={`${ev.summary.qty} Session`} />
                <Row label="Add-ons" value="None" />
                {ev.instructions && <div style={{ marginTop: 8, background: '#f6f6fe', borderRadius: 8, padding: '8px 10px' }}><div className="muted" style={{ fontSize: 11 }}>Customer Instructions</div><div style={{ fontSize: 12.5, marginTop: 3 }}>{ev.instructions}</div></div>}
                <div style={{ marginTop: 8 }}><div className="muted" style={{ fontSize: 11 }}>Service Location</div><div style={{ fontSize: 12.5 }}>{ev.location.address || '—'}</div></div>
              </Card>
              <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><ImageIcon size={16} /> Evidence Information</span>}>
                <Row label="Photos by" value={ev.worker.name ? `${ev.worker.name}${ev.worker.id ? ` (WRK-${ev.worker.id})` : ''}` : '—'} />
                <Row label="Device" value={ev.device || 'Not captured'} />
                <Row label="Total Photos" value={`${ev.beforePhotos.length + ev.afterPhotos.length} (${ev.beforePhotos.length} + ${ev.afterPhotos.length})`} />
                <Row label="Network" value={ev.network || 'Not captured'} />
                <Row label="Location Captured" value={ev.location.lat != null ? <Badge tone="green" dot={false}>Yes</Badge> : 'No'} />
                {ev.location.lat != null && <Row label="Geo" value={`${ev.location.lat}, ${ev.location.lng}`} />}
              </Card>
              <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><Clock size={16} /> Activity Log</span>}>
                {acts.length ? <div style={{ display: 'grid', gap: 8 }}>{acts.map(([at, label], i) => <div key={i} className="row" style={{ gap: 8, fontSize: 12.5 }}><span className="muted" style={{ minWidth: 62 }}>{timeOnly(at)}</span><span>{label}</span></div>)}</div> : <div className="muted" style={{ fontSize: 13 }}>No activity recorded.</div>}
              </Card>
            </div>
          </div>
        </div>
        )
      })())}
      {tab === 'support' && (() => {
        const cnt = tks?.counts || { total: 0, open: 0, resolved: 0, reopened: 0, escalated: 0 }
        const t = tkDetail
        const prTone = (p: string) => (p === 'high' ? 'red' : p === 'low' ? 'gray' : 'amber')
        const stTone = (s: string) => { const x = (s || '').toLowerCase(); return x === 'resolved' || x === 'closed' ? 'green' : x === 'escalated' ? 'red' : x === 'reopened' ? 'amber' : 'blue' }
        const steps: [string, string | null][] = t ? [['Raised', t.created], ['Acknowledged', t.acknowledged_at], ['Under Review', t.review_at], ['Resolved', t.resolved_at]] : []
        return (
        <div className="grid" style={{ gap: 16 }}>
          {/* KPI strip */}
          <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            {[['Total Tickets', cnt.total, '#5b51e8', 'All Time'], ['Open', cnt.open, cnt.open ? '#f59e0b' : '#16a34a', 'issues'], ['Resolved', cnt.resolved, '#16a34a', 'this booking'], ['Reopened', cnt.reopened, cnt.reopened ? '#f04438' : '#98a2b3', 'this booking'], ['Escalated', cnt.escalated, cnt.escalated ? '#f04438' : '#98a2b3', 'this booking']].map(([l, v, c, sub]) => (
              <div key={l as string} className="card" style={{ padding: '12px 14px' }}><div className="muted" style={{ fontSize: 11 }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800, color: c as string }}>{v as number}</div><div className="muted" style={{ fontSize: 11 }}>{sub}</div></div>
            ))}
            <div className="card" style={{ padding: '12px 14px' }}><div className="muted" style={{ fontSize: 11 }}>Customer Rating</div><div style={{ fontSize: 18, fontWeight: 800, color: '#f5b301' }}>{b.rating ? `${'★'.repeat(b.rating)} ${b.rating.toFixed(1)}` : '—'}</div></div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'minmax(230px, 0.8fr) minmax(0, 2fr) minmax(240px, 1fr)', gap: 16, alignItems: 'start' }}>
            {/* left: ticket list + quick actions */}
            <div className="grid" style={{ gap: 16 }}>
              <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><LifeBuoy size={16} /> Support Tickets ({cnt.total})</span>}>
                {tks && tks.tickets.length ? tks.tickets.map((tk: any) => (
                  <button key={tk.id} onClick={() => setSelTk(tk.id)} style={{ display: 'block', width: '100%', textAlign: 'left', border: selTk === tk.id ? '1.5px solid var(--violet,#5b51e8)' : '1px solid var(--line)', background: selTk === tk.id ? '#f6f6fe' : '#fff', borderRadius: 10, padding: '10px 12px', marginBottom: 8, cursor: 'pointer' }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 11 }}>{tk.ref}</span><Badge tone={stTone(tk.status)} dot={false}>{tk.status}</Badge></div>
                    <div style={{ fontWeight: 700, fontSize: 13, margin: '3px 0' }}>{tk.subject}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{tk.raised_by || 'Customer'} · {fmtDateTime(tk.created)}</div>
                  </button>
                )) : <div className="muted" style={{ fontSize: 13, padding: '10px 0' }}>No tickets for this booking.</div>}
              </Card>
              <Card title="Quick Actions">
                <div className="grid" style={{ gap: 6 }}>
                  <button className="btn" style={{ justifyContent: 'flex-start' }} onClick={newComplaint}><LifeBuoy size={14} /> Create Complaint</button>
                  <button className="btn line" style={{ justifyContent: 'flex-start' }} disabled={!custPhone} onClick={() => tel(custPhone)}><Phone size={14} /> Call Customer</button>
                  <button className="btn line" style={{ justifyContent: 'flex-start' }} disabled={!workerPhone} onClick={() => tel(workerPhone)}><Phone size={14} /> Call Worker</button>
                  <button className="btn line" style={{ justifyContent: 'flex-start' }} disabled={!custPhone} onClick={() => custPhone && window.open(`https://wa.me/${custPhone.replace(/\D/g, '')}`)}><MessageCircle size={14} /> WhatsApp Customer</button>
                  <button className="btn line" style={{ justifyContent: 'flex-start' }} onClick={() => selTk ? (setTkTab('notes')) : toast('Select a ticket first', 'err')}><StickyNote size={14} /> Add Internal Note</button>
                </div>
              </Card>
            </div>

            {/* center: ticket detail */}
            {!t ? <Card title="Ticket"><div className="muted" style={{ fontSize: 13, padding: '20px 0' }}>{tks && tks.tickets.length ? 'Select a ticket to view the conversation.' : 'No tickets yet. Create a complaint to start.'}</div></Card> : (
              <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}>Ticket {t.ref} <Badge tone={stTone(t.status)} dot={false}>{t.status}</Badge></span>}
                right={<select className="select" style={{ height: 30, fontSize: 12 }} value={t.status} onChange={(e) => setTkStatus(e.target.value)}>{['Open', 'Acknowledged', 'Under Review', 'Resolved', 'Reopened', 'Closed'].map((s) => <option key={s} value={s}>{s}</option>)}</select>}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{t.subject}</div>
                <div className="row" style={{ gap: 20, flexWrap: 'wrap', fontSize: 12.5, marginBottom: 12 }}>
                  <div><div className="muted" style={{ fontSize: 11 }}>Priority</div><Badge tone={prTone(t.priority)} dot={false}>{t.priority}</Badge></div>
                  <div><div className="muted" style={{ fontSize: 11 }}>Raised By</div><b>{t.raised_by || 'Customer'}</b></div>
                  <div><div className="muted" style={{ fontSize: 11 }}>Reported At</div><b>{fmtDateTime(t.created)}</b></div>
                  {t.resolved_at && <div><div className="muted" style={{ fontSize: 11 }}>Resolved At</div><b>{fmtDateTime(t.resolved_at)}</b></div>}
                  {t.resolved_by && <div><div className="muted" style={{ fontSize: 11 }}>Resolved By</div><b>{t.resolved_by}</b></div>}
                </div>
                {/* stepper */}
                <div className="row" style={{ gap: 4, marginBottom: 14 }}>
                  {steps.map(([label, at], i) => (
                    <div key={label} className="row" style={{ gap: 4, flex: 1, alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', flex: 'none' }}>
                        <span style={{ width: 22, height: 22, borderRadius: 50, display: 'grid', placeItems: 'center', margin: '0 auto', background: at ? '#16a34a' : '#eeeef5', color: at ? '#fff' : '#9aa0ad' }}>{at ? <CheckCircle2 size={13} /> : i + 1}</span>
                        <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 3 }}>{label}</div>
                        <div className="muted" style={{ fontSize: 9.5 }}>{at ? fmtDateTime(at).split(',')[1] : ''}</div>
                      </div>
                      {i < steps.length - 1 && <div style={{ flex: 1, height: 2, background: steps[i + 1][1] ? '#bfe6cd' : '#eceaf6' }} />}
                    </div>
                  ))}
                </div>
                {/* sub-tabs */}
                <div className="tabs" style={{ marginBottom: 10 }}>
                  {(['conversation', 'resolution', 'notes'] as const).map((st) => <button key={st} className={'tab' + (tkTab === st ? ' active' : '')} onClick={() => setTkTab(st)}>{{ conversation: 'Conversation', resolution: 'Resolution Details', notes: `Internal Notes (${(t.notes || []).length})` }[st]}</button>)}
                </div>
                {tkTab === 'conversation' && <>
                  <div style={{ display: 'grid', gap: 10, maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
                    {(t.messages || []).map((m: any) => {
                      const mine = m.sender_type === 'admin'
                      const bg = m.sender_type === 'worker' ? '#eef4ff' : mine ? '#e7f7ee' : '#fdf0f0'
                      return (
                        <div key={m.id} className="row" style={{ gap: 8, flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
                          <Avatar name={m.sender_name} size={30} />
                          <div style={{ background: bg, borderRadius: 12, padding: '9px 12px', maxWidth: '75%' }}>
                            <div className="row" style={{ gap: 8, justifyContent: 'space-between', marginBottom: 3 }}><b style={{ fontSize: 12.5 }}>{m.sender_name} <span className="muted" style={{ fontWeight: 400, textTransform: 'capitalize' }}>({m.sender_type})</span></b><span className="muted" style={{ fontSize: 10.5 }}>{fmtDateTime(m.created)}</span></div>
                            <div style={{ fontSize: 13 }}>{m.body}</div>
                            <div className="muted" style={{ fontSize: 10, marginTop: 3 }}>Source: {m.source === 'admin' ? 'Admin' : 'In-App'}</div>
                          </div>
                        </div>
                      )
                    })}
                    {(!t.messages || !t.messages.length) && <div className="muted" style={{ fontSize: 13 }}>No messages yet.</div>}
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 12 }}>
                    <input className="input" style={{ flex: 1 }} placeholder="Type a message…" value={tkMsg} onChange={(e) => setTkMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendTkMsg(false) }} />
                    <button className="btn" onClick={() => sendTkMsg(false)} disabled={!tkMsg.trim()}>Send</button>
                  </div>
                </>}
                {tkTab === 'resolution' && <div style={{ fontSize: 13 }}>{t.response || <span className="muted">No resolution summary recorded. Change status to Resolved and add a closing message.</span>}</div>}
                {tkTab === 'notes' && <>
                  <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                    {(t.notes || []).map((n: any) => <div key={n.id} style={{ background: '#f6f6fe', borderRadius: 8, padding: '8px 10px' }}><div className="row" style={{ justifyContent: 'space-between' }}><b style={{ fontSize: 12 }}>{n.sender_name}</b><span className="muted" style={{ fontSize: 10.5 }}>{fmtDateTime(n.created)}</span></div><div style={{ fontSize: 12.5, marginTop: 2 }}>{n.body}</div></div>)}
                    {(!t.notes || !t.notes.length) && <div className="muted" style={{ fontSize: 13 }}>No internal notes.</div>}
                  </div>
                  <div className="row" style={{ gap: 8 }}><input className="input" style={{ flex: 1 }} placeholder="Add an internal note (admin-only)…" value={tkMsg} onChange={(e) => setTkMsg(e.target.value)} /><button className="btn line" onClick={() => sendTkMsg(true)} disabled={!tkMsg.trim()}>Add Note</button></div>
                </>}
              </Card>
            )}

            {/* right: complaint info + related + escalation */}
            <div className="grid" style={{ gap: 16 }}>
              {t && <Card title="Complaint Information">
                <Row label="Issue Category" value={t.category || '—'} />
                <Row label="Sub Category" value={t.subcategory || '—'} />
                <Row label="Severity" value={<Badge tone={prTone(t.severity)} dot={false}>{t.severity}</Badge>} />
                <Row label="Impact" value={<span style={{ textTransform: 'capitalize' }}>{t.impact}</span>} />
                {b.rating > 0 && <Row label="Customer Satisfaction" value={`${'★'.repeat(b.rating)} ${b.rating.toFixed(1)}`} />}
                {b.review && <Row label="Feedback" value={b.review} />}
              </Card>}
              <Card title="Related Details">
                <Row label="Worker" value={b.pro_name || '—'} />
                {b.worker_id && <Row label="Worker ID" value={`WRK-${b.worker_id}`} />}
                <Row label="Service" value={svcName} />
                <Row label="Service Date" value={b.date ? shortDate(b.date) : shortDate(b.created)} />
                {ev?.checkIn.at && <Row label="Start Time" value={`${timeOnly(ev.checkIn.at)} (Actual)`} />}
                <Row label="Scheduled Time" value={b.time || '—'} />
                <Row label="Job Duration" value={ev?.durationMin != null ? `${Math.floor(ev.durationMin / 60)}h ${String(ev.durationMin % 60).padStart(2, '0')}m` : '—'} />
                <Row label="Amount Paid" value={<span>{money(b.total)} <Badge tone={(b.payment_status || '').toLowerCase() === 'paid' ? 'green' : 'amber'}>{b.payment_status || '—'}</Badge></span>} />
              </Card>
              {t && <Card title="Escalation & Follow-up">
                <Row label="Escalated" value={t.escalated ? <Badge tone="red">Yes</Badge> : 'No'} />
                {t.escalate_reason && <Row label="Reason" value={t.escalate_reason} />}
                <button className="btn line sm" style={{ marginTop: 8 }} disabled={t.escalated} onClick={escalateTk}><ArrowUpCircle size={13} /> {t.escalated ? 'Escalated' : 'Escalate Ticket'}</button>
              </Card>}
            </div>
          </div>
        </div>
        )
      })()}
      {tab === 'activity' && (!activity ? <Loading /> : (() => {
        const roleColor: Record<string, string> = { system: '#5b51e8', admin: '#5b51e8', worker: '#16a34a', customer: '#f59e0b', auto: '#9333ea' }
        const modIcon = (m: string) => ({ Bookings: <CalendarCheck size={13} />, Payments: <IndianRupee size={13} />, Dispatch: <User size={13} />, Jobs: <PlayCircle size={13} />, Workflow: <RefreshCw size={13} />, Support: <LifeBuoy size={13} />, Notes: <StickyNote size={13} /> } as Record<string, ReactNode>)[m] || <Clock size={13} />
        const modules = Array.from(new Set(activity.activities.map((a) => a.module)))
        const actions = Array.from(new Set(activity.activities.map((a) => a.actionType)))
        const filtered = activity.activities.filter((a) => (aMod === 'all' || a.module === aMod) && (aRole === 'all' || a.role === aRole) && (aAct === 'all' || a.actionType === aAct) && (!aFrom || a.at.slice(0, 10) >= aFrom) && (!aTo || a.at.slice(0, 10) <= aTo))
        const aSize = 25
        const pageRows = filtered.slice((aPage - 1) * aSize, aPage * aSize)
        const c = activity.counts
        const reset = () => { setAMod('all'); setARole('all'); setAAct('all'); setAFrom(''); setATo(''); setAPage(1) }
        const th: CSSProperties = { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--line)', fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap' }
        const td: CSSProperties = { padding: '12px', borderBottom: '1px solid var(--line-2,#f4f4fa)', fontSize: 12.5, verticalAlign: 'middle' }
        return (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2.6fr) minmax(240px, 1fr)', gap: 16, alignItems: 'start' }}>
          <div className="grid" style={{ gap: 16 }}>
            {/* filters card */}
            <Card>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 14, alignItems: 'end' }}>
                <div><label className="muted" style={{ fontSize: 11, display: 'block', marginBottom: 6, fontWeight: 600 }}>Date Range</label><div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 6, alignItems: 'center' }}><input type="date" className="input" style={{ width: '100%', minWidth: 0, height: 38, border: '1.5px solid var(--line)', borderRadius: 10, padding: '0 8px', background: '#fcfcff' }} value={aFrom} onChange={(e) => setAFrom(e.target.value)} /><span className="muted">–</span><input type="date" className="input" style={{ width: '100%', minWidth: 0, height: 38, border: '1.5px solid var(--line)', borderRadius: 10, padding: '0 8px', background: '#fcfcff' }} value={aTo} onChange={(e) => setATo(e.target.value)} /></div></div>
                <div><label className="muted" style={{ fontSize: 11, display: 'block', marginBottom: 6, fontWeight: 600 }}>Module</label><select className="select" style={{ width: '100%' }} value={aMod} onChange={(e) => { setAMod(e.target.value); setAPage(1) }}><option value="all">All Modules</option>{modules.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
                <div><label className="muted" style={{ fontSize: 11, display: 'block', marginBottom: 6, fontWeight: 600 }}>Performed By</label><select className="select" style={{ width: '100%' }} value={aRole} onChange={(e) => { setARole(e.target.value); setAPage(1) }}><option value="all">All Users</option>{['system', 'admin', 'worker', 'customer', 'auto'].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select></div>
                <div><label className="muted" style={{ fontSize: 11, display: 'block', marginBottom: 6, fontWeight: 600 }}>Action Type</label><select className="select" style={{ width: '100%' }} value={aAct} onChange={(e) => { setAAct(e.target.value); setAPage(1) }}><option value="all">All Actions</option>{actions.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <button className="btn" onClick={() => setAPage(1)}><Sparkles size={14} /> Apply Filters</button>
                <button className="btn line" onClick={reset}><RefreshCw size={14} /> Reset</button>
              </div>
              <div className="row" style={{ gap: 18, marginTop: 16, flexWrap: 'wrap', fontSize: 12.5, alignItems: 'center' }}>
                <b>Total Activities: {c.total}</b>
                {(['system', 'admin', 'worker', 'customer', 'auto'] as const).map((r) => <span key={r} className="row" style={{ gap: 6, alignItems: 'center' }}><i style={{ width: 9, height: 9, borderRadius: 50, background: roleColor[r], display: 'inline-block' }} /><span style={{ textTransform: 'capitalize' }}>{r} ({c[r]})</span></span>)}
              </div>
            </Card>

            {/* table card */}
            <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><Clock size={16} /> Activity Logs</span>} right={<button className="btn line sm" onClick={exportActivity}>Export Logs</button>}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                  <thead><tr>{['', 'Date & Time', 'Performed By', 'Module', 'Action', 'Details', 'IP Address'].map((h, i) => <th key={i} style={{ ...th, ...(i === 0 ? { width: 28, padding: 0 } : {}) }}>{h}</th>)}</tr></thead>
                  <tbody>{pageRows.map((a, i) => (
                    <tr key={i}>
                      <td style={{ width: 28, padding: 0, position: 'relative' }}>
                        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: '#eceaf6', transform: 'translateX(-50%)' }} />
                        <div style={{ position: 'relative', display: 'grid', placeItems: 'center', height: '100%', minHeight: 46 }}><span style={{ width: 16, height: 16, borderRadius: 50, background: roleColor[a.role] || '#98a2b3', border: '3px solid #fff', boxShadow: '0 0 0 1.5px #eceaf6', flex: 'none' }} /></div>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDateTime(a.at)}</td>
                      <td style={td}><div className="row" style={{ gap: 8, alignItems: 'center' }}><Avatar name={a.name} size={30} /><div><div style={{ fontWeight: 600 }}>{a.name}</div><div className="muted" style={{ fontSize: 11, textTransform: 'capitalize' }}>{a.role}</div></div></div></td>
                      <td style={td}><span className="row" style={{ gap: 6, alignItems: 'center' }}><span style={{ color: 'var(--muted)' }}>{modIcon(a.module)}</span>{a.module}</span></td>
                      <td style={td}><Badge tone={a.actionType.includes('Update') || a.actionType.includes('Auto') ? 'blue' : a.actionType === 'Payment' ? 'green' : a.actionType === 'Cancellation' || a.actionType === 'Escalation' ? 'red' : a.actionType === 'Assignment' ? 'violet' : 'gray'} dot={false}>{a.actionType}</Badge></td>
                      <td style={{ ...td, maxWidth: 340 }}>{a.details}</td>
                      <td style={{ ...td, color: 'var(--muted)', fontSize: 11.5 }}>—</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>Showing {filtered.length ? (aPage - 1) * aSize + 1 : 0} to {Math.min(aPage * aSize, filtered.length)} of {filtered.length} activities</span>
                <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <button className="btn line sm" disabled={aPage === 1} onClick={() => setAPage(aPage - 1)}>‹ Prev</button>
                  {Array.from({ length: Math.max(1, Math.ceil(filtered.length / aSize)) }, (_, p) => <button key={p} className={'btn ' + (aPage === p + 1 ? '' : 'line') + ' sm'} onClick={() => setAPage(p + 1)}>{p + 1}</button>)}
                  <button className="btn line sm" disabled={aPage * aSize >= filtered.length} onClick={() => setAPage(aPage + 1)}>Next ›</button>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>IP address isn't captured for these derived lifecycle events yet — that's a follow-up when the apps log request IPs.</div>
            </Card>
          </div>
          <div className="grid" style={{ gap: 16 }}>{summaryCard()}{customerCard()}{workerCard()}{notesCard()}</div>
        </div>
        )
      })())}

      {/* modals */}
      {modal === 'reassign' && (
        <Modal title="Reassign Worker" onClose={() => setModal(null)} footer={<><button className="btn line" onClick={() => setModal(null)}>Cancel</button><button className="btn" disabled={saving} onClick={reassign}>{saving ? 'Saving…' : 'Reassign'}</button></>}>
          <Field label="Worker"><select className="select" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}><option value="">Select worker…</option>{workerList.map((w) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}</select></Field>
        </Modal>
      )}
      {modal === 'reschedule' && (
        <Modal title="Reschedule Booking" onClose={() => setModal(null)} footer={<><button className="btn line" onClick={() => setModal(null)}>Cancel</button><button className="btn" disabled={saving} onClick={reschedule}>{saving ? 'Saving…' : 'Reschedule'}</button></>}>
          <Field label="New date"><input type="date" className="input" value={reDate} onChange={(e) => setReDate(e.target.value)} /></Field>
          <Field label="New time"><input className="input" placeholder="e.g. 11:00 AM" value={reTime} onChange={(e) => setReTime(e.target.value)} /></Field>
          <div className="muted" style={{ fontSize: 12 }}>Current: {b.date} · {b.time || '—'}</div>
        </Modal>
      )}
    </div>
  )

  // ---------- reusable cards ----------
  function summaryCard() {
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><CalendarClock size={16} /> Booking Summary</span>}>
        <Row label="Booking ID" value={<b>{b.ref}</b>} />
        <Row label="Service" value={svcName} />
        <Row label="Date" value={b.date ? shortDate(b.date) : shortDate(b.created)} />
        <Row label="Time Slot" value={b.time || '—'} />
        <Row label="Duration" value={b.duration || items[0]?.durationLabel || '—'} />
        <Row label="Zone" value={derived!.zone?.name || (b.zone_id ? `Zone ${b.zone_id}` : '—')} />
        <Row label="Amount Paid" value={<b>{money(b.total)}</b>} strong />
        <Row label="Booking Source" value={b.type === 'instant' ? 'Instant · Customer App' : 'Customer App'} />
      </Card>
    )
  }
  function customerCard() {
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><User size={16} /> Customer Details</span>} right={cust && <button className="btn line" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => nav(`/customers/${b.user_id}`)}>View Customer</button>}>
        <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <Avatar name={b.customer} size={40} />
          <div><div style={{ fontWeight: 700 }}>{b.customer}{custBookings >= 3 && <Badge tone="amber" dot={false}>Loyal</Badge>}</div><div className="muted" style={{ fontSize: 12 }}>{custBookings} booking{custBookings === 1 ? '' : 's'}{custRating ? ` · ★ ${custRating}` : ''}</div></div>
        </div>
        <Row label="Phone" value={custPhone || 'Not available'} />
        <Row label="Email" value={custEmail || 'Not available'} />
        <Row label="Address" value={<span style={{ maxWidth: 200, display: 'inline-block' }}>{b.address || '—'}</span>} />
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="btn line" style={{ flex: 1, fontSize: 12 }} disabled={!custPhone} onClick={() => tel(custPhone)}><Phone size={13} /> Call</button>
          <button className="btn line" style={{ flex: 1, fontSize: 12 }} disabled={!custPhone} onClick={() => custPhone && window.open(`https://wa.me/${custPhone.replace(/\D/g, '')}`)}><MessageCircle size={13} /> WhatsApp</button>
        </div>
      </Card>
    )
  }
  function workerCard() {
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><HardHat size={16} /> Worker Details</span>} right={b.worker_id ? <button className="btn line" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => nav(`/workers/${b.worker_id}`)}>View Worker</button> : undefined}>
        {b.pro_name ? <>
          <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <Avatar name={b.pro_name} size={40} />
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{b.pro_name}</div><div className="muted" style={{ fontSize: 12 }}>{workerPhone || 'Phone not available'}</div></div>
            {workerRating > 0 && <Badge tone="amber" dot={false}>★ {workerRating}</Badge>}
          </div>
          <Row label="Current Status" value={<Badge>{b.status}</Badge>} />
          {workerJobs > 0 && <Row label="Jobs Completed" value={workerJobs} />}
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn line" style={{ flex: 1, fontSize: 12 }} disabled={!workerPhone} onClick={() => tel(workerPhone)}><Phone size={13} /> Call</button>
            <button className="btn line" style={{ flex: 1, fontSize: 12 }} onClick={openReassign}><RefreshCw size={13} /> Reassign</button>
          </div>
        </> : <div style={{ padding: '8px 0' }}><Badge tone="red" dot={false}>Unassigned</Badge><button className="btn sm" style={{ marginTop: 10, display: 'block' }} onClick={openReassign}>Assign worker</button></div>}
      </Card>
    )
  }
  function serviceCard() {
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><Sparkles size={16} /> Service Details</span>}>
        <Row label="Service" value={<b>{svcName}</b>} />
        <Row label="Duration" value={b.duration || items[0]?.durationLabel || '—'} />
        <Row label="Items" value={items.length || 1} />
        <Row label="Frequency" value={b.freq || 'One-time'} />
        {b.note && <div style={{ marginTop: 8 }}><div className="muted" style={{ fontSize: 12 }}>Customer Instructions</div><div style={{ fontSize: 13, marginTop: 3 }}>“{b.note}”</div></div>}
      </Card>
    )
  }
  function keyInfoCard() {
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><Sparkles size={16} /> Key Information</span>}>
        <Row label="Assignment Type" value={b.pro_name ? 'Auto Dispatch' : 'Unassigned'} />
        <Row label="Assigned At" value="Not tracked yet" />
        <Row label="Accepted At" value="Not tracked yet" />
        <Row label="Current Status" value={<Badge>{b.status}</Badge>} />
        <Row label="ETA" value="Not tracked yet" />
        <Row label="Distance" value="Not tracked yet" />
      </Card>
    )
  }
  function needHelpCard() {
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><HelpCircle size={16} /> Need Help?</span>}>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Facing an issue with this booking?</div>
        <button className="btn line" style={{ width: '100%' }} onClick={() => nav('/support')}><LifeBuoy size={14} /> Create Support Ticket</button>
      </Card>
    )
  }
  function journeyCard() {
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><Clock size={16} /> Booking Journey</span>}>
        <div style={{ display: 'grid', gap: 2 }}>
          {['Created', 'Assigned', 'On the Way', 'Arrived', 'In Service', 'Completed'].map((label, i) => {
            const lvls = [1, 2, 3, 4, 6, 8]
            const done = b.status === 'cancelled' ? i === 0 : lvls[i] <= reached
            const current = lvls[i] === reached && derived!.active
            return (
              <div key={label} className="row" style={{ gap: 10, alignItems: 'center', padding: '5px 0', opacity: done || current ? 1 : 0.45 }}>
                <span style={{ width: 18, height: 18, borderRadius: 50, display: 'grid', placeItems: 'center', background: current ? '#eef0ff' : done ? '#e7f7ee' : '#eeeef5', color: current ? '#5b51e8' : done ? '#0f8a4d' : '#9aa0ad', flex: 'none' }}>{done ? <CheckCircle2 size={12} /> : ''}</span>
                <span style={{ fontSize: 13, fontWeight: current ? 700 : 500 }}>{label}</span>
                {current && <Badge tone="violet" dot={false}>Current</Badge>}
              </div>
            )
          })}
          {b.status === 'cancelled' && <div className="row" style={{ gap: 10, padding: '5px 0', color: '#d92d20', fontWeight: 700, fontSize: 13 }}><XCircle size={14} /> Cancelled{b.cancel_reason ? ` · ${b.cancel_reason}` : ''}</div>}
        </div>
      </Card>
    )
  }
  function trackingCard() {
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><MapPin size={16} /> Live Job Tracking</span>}>
        {workerPos || custPos ? <MiniMap lat={(workerPos || custPos)!.lat} lng={(workerPos || custPos)!.lng} label={b.address || ''} /> : <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>No live location for this booking yet.</div>}
      </Card>
    )
  }
  function paymentCard() {
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><IndianRupee size={16} /> Payment & Price Breakdown</span>}>
        <Row label="Service Price" value={money(b.subtotal)} />
        {(b.discount || 0) > 0 && <Row label="Discount" value={<span style={{ color: '#0f8a4d' }}>− {money(b.discount)}</span>} />}
        {b.coupon && <Row label={`Coupon (${b.coupon})`} value="applied" />}
        {(b.fee || 0) > 0 && <Row label="Convenience Fee" value={`+ ${money(b.fee)}`} />}
        {(b.tax || 0) > 0 && <Row label="GST / Tax" value={`+ ${money(b.tax)}`} />}
        <div style={{ borderTop: '1px solid var(--line)', margin: '4px 0' }} />
        <Row label="Customer Paid" value={<b>{money(b.total)}</b>} strong />
        <Row label="Company Margin" value={<b>{money(margin)} ({marginPct}%)</b>} strong />
        {(b.refund || 0) > 0 && <Row label="Refunded" value={<span style={{ color: '#d92d20' }}>{money(b.refund)}</span>} />}
      </Card>
    )
  }
  function priceBreakdownCard() {
    if (!settle) return <Card title="Price & Charges Breakdown"><Loading /></Card>
    const c = settle.customer
    const base = items[0]?.price ?? c.subtotal
    const addons = Math.max(0, c.subtotal - base)
    const halfGst = c.tax / 2
    const gstPct = c.subtotal ? Math.round((c.tax / c.subtotal) * 1000) / 10 : 0
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><IndianRupee size={16} /> Price & Charges Breakdown (Customer View)</span>}>
        <Row label={`Service Price (${svcName})`} value={<b>{money(base)}</b>} strong />
        <div style={{ paddingLeft: 12 }}>
          <Row label={`Duration (${b.duration || items[0]?.durationLabel || '1 session'})`} value={money(base)} />
          <Row label="Add-ons" value={money(addons)} />
        </div>
        <div style={{ borderTop: '1px solid var(--line)', margin: '4px 0' }} />
        <Row label="Subtotal" value={money(c.subtotal)} strong />
        {c.discount > 0 && <Row label={c.coupon ? `Coupon Discount (${c.coupon})` : 'Zone Discount'} value={<span style={{ color: '#0f8a4d' }}>− {money(c.discount)}</span>} />}
        <Row label="Platform Fee" value={money(c.fee || 0)} />
        <Row label={`CGST (${(gstPct / 2).toFixed(1)}%)`} value={rs(halfGst)} />
        <Row label={`SGST (${(gstPct / 2).toFixed(1)}%)`} value={rs(halfGst)} />
        <div style={{ background: '#f6f6fe', borderRadius: 8, padding: '0 8px', margin: '4px 0' }}><Row label="Total Paid by Customer" value={<b>{money(c.total)}</b>} strong /></div>
        {c.discount > 0 && <div style={{ marginTop: 8, color: '#0f8a4d', fontSize: 12.5, fontWeight: 600 }}>🎉 Customer saved {money(c.discount)} on this booking</div>}
      </Card>
    )
  }
  function settlementSummaryCard() {
    if (!settle) return <Card title="Settlement Summary"><Loading /></Card>
    const s = settle.settlement
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><Sparkles size={16} /> Settlement Summary (Internal)</span>}>
        <Row label="Total Collected from Customer" value={money(s.collected)} />
        {s.pgFee > 0 && <Row label={`Payment Gateway Fee (${s.pgFeePct}%)`} value={<span style={{ color: '#d92d20' }}>− {rs(s.pgFee)}</span>} />}
        {s.pgGst > 0 && <Row label={`GST on PG Fee (${s.pgGstPct}%)`} value={<span style={{ color: '#d92d20' }}>− {rs(s.pgGst)}</span>} />}
        <div style={{ background: '#f6f6fe', borderRadius: 8, padding: '0 8px', margin: '4px 0' }}><Row label="Net Collection" value={<b>{rs(s.net)}</b>} strong /></div>
        <Row label="Worker Payout" value={<span style={{ color: '#d92d20' }}>− {money(s.workerPayout)}</span>} />
        {s.incentive > 0 && <Row label="Worker Incentive" value={<span style={{ color: '#d92d20' }}>− {money(s.incentive)}</span>} />}
        {s.opsCost > 0 && <Row label="Other Operational Cost" value={<span style={{ color: '#d92d20' }}>− {rs(s.opsCost)}</span>} />}
        {s.mktgCost > 0 && <Row label="Marketing & Platform Charges" value={<span style={{ color: '#d92d20' }}>− {rs(s.mktgCost)}</span>} />}
        <div style={{ background: '#eef7f0', borderRadius: 8, padding: '0 8px', margin: '4px 0' }}><Row label="Company Margin (This Booking)" value={<b>{rs(s.companyMargin)}</b>} strong /></div>
        <Row label="Margin %" value={<b style={{ color: '#0f8a4d' }}>{s.marginPct}%</b>} />
      </Card>
    )
  }
  function payoutCard() {
    if (!settle) return <Card title="Payout to Worker"><Loading /></Card>
    const p = settle.payout
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><HardHat size={16} /> Payout to Worker</span>}>
        <Row label="Worker Name" value={p.workerName || '—'} />
        {p.workerId && <Row label="Worker ID" value={`WRK-${p.workerId}`} />}
        <Row label="Payout Type" value={b.payment === 'wallet' ? 'Wallet' : 'Bank / Wallet'} />
        <Row label="Payout Amount" value={money(p.amount)} />
        {p.incentive > 0 && <Row label="Commission / Incentive" value={money(p.incentive)} />}
        <div style={{ borderTop: '1px solid var(--line)', margin: '4px 0' }} />
        <Row label="Total Payout" value={<b>{money(p.total)}</b>} strong />
        <Row label="Payout Status" value={<Badge tone={p.status === 'paid' ? 'green' : 'amber'}>{p.status}</Badge>} />
        {p.paidAt && <Row label="Paid At" value={fmtDateTime(p.paidAt)} />}
        <Row label="Transaction ID" value={<span style={{ fontSize: 12 }}>{p.txnId}</span>} />
        {p.workerId && <button className="btn line sm" style={{ marginTop: 8 }} onClick={() => nav(`/workers/${p.workerId}`)}>View Worker</button>}
      </Card>
    )
  }
  function txnHistoryCard() {
    if (!settle) return <Card title="Payment Transaction History"><Loading /></Card>
    const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid var(--line-2,#f4f4fa)', fontSize: 12.5, whiteSpace: 'nowrap' }
    return (
      <Card title="Payment Transaction History">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead><tr style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>{['Date & Time', 'Type', 'Status', 'Amount', 'Method', 'Transaction ID'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>{h}</th>)}</tr></thead>
            <tbody>{settle.txns.map((t, i) => (
              <tr key={i}>
                <td style={td}>{fmtDateTime(t.at)}</td><td style={td}>{t.type}</td>
                <td style={td}><Badge tone="green" dot={false}>{t.status}</Badge></td>
                <td style={{ ...td, fontWeight: 700, color: t.amount < 0 ? '#d92d20' : 'var(--ink)' }}>{t.amount < 0 ? '− ' : ''}{rs(Math.abs(t.amount))}</td>
                <td style={{ ...td, textTransform: 'capitalize' }}>{t.method}</td><td style={{ ...td, fontSize: 11 }}>{t.txnId}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    )
  }
  function refundCard() {
    return (
      <Card title="Refund & Adjustments">
        {settle && settle.refund.amount > 0 ? <Row label="Refunded" value={<span style={{ color: '#d92d20' }}>{money(settle.refund.amount)}{settle.refund.status ? ` · ${settle.refund.status}` : ''}</span>} /> : <div className="muted" style={{ fontSize: 13, padding: '8px 0' }}>No refunds or adjustments for this booking.</div>}
        <button className="btn line sm" style={{ marginTop: 8 }} onClick={doRefund}>Create Refund</button>
      </Card>
    )
  }
  function documentsCard() {
    const docs: [string, string, 'invoice' | 'receipt' | 'payout'][] = settle ? [['Tax Invoice', settle.documents.invoice, 'invoice'], ['Payment Receipt', settle.documents.receipt, 'receipt'], ['Worker Payout Slip', settle.documents.payoutSlip, 'payout']] : []
    return (
      <Card title="Invoice & Documents">
        {docs.map(([label, ref, type]) => (
          <div key={label} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line-2,#f4f4fa)' }}>
            <div><div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div><div className="muted" style={{ fontSize: 11 }}>{ref}.pdf</div></div>
            <button className="btn line" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => exportDoc(type)}>Download</button>
          </div>
        ))}
        <button className="btn line sm" style={{ marginTop: 10, width: '100%' }} onClick={() => exportDoc('all')}>Download All (PDF)</button>
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Opens a print-ready view — use your browser's “Save as PDF”.</div>
      </Card>
    )
  }
  function slaCard() {
    const oh = derived!.delayMin > 0 ? { level: derived!.delayMin > 10 ? 'Attention Required' : 'Watch', msg: `Worker ETA exceeds scheduled arrival by ${derived!.delayMin} minutes.` } : null
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><ShieldCheck size={16} /> SLA & Operational Health</span>}>
        <Row label="Assignment SLA" value={<Badge tone={slaTone(derived!.assignmentSla)} dot={false}>{derived!.assignmentSla}</Badge>} />
        <Row label="Arrival SLA" value={<Badge tone={slaTone(derived!.arrivalSla)} dot={false}>{derived!.arrivalSla}</Badge>} />
        <Row label="Service SLA" value={<Badge tone={slaTone(derived!.serviceSla)} dot={false}>{derived!.serviceSla}</Badge>} />
        {derived!.delayMin > 0 && <Row label="Current Delay" value={<span style={{ color: '#d92d20', fontWeight: 700 }}>{derived!.delayMin} min</span>} />}
        {oh && (
          <div style={{ marginTop: 10, background: '#fff8ec', border: '1px solid #fce4b6', borderRadius: 10, padding: '10px 12px' }}>
            <div className="row" style={{ gap: 6, alignItems: 'center', color: '#b97400', fontWeight: 700, fontSize: 12.5 }}><AlertTriangle size={14} /> {oh.level}</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>{oh.msg}</div>
            {!b.escalated && <button className="btn line sm" style={{ marginTop: 8 }} onClick={escalate}><ArrowUpCircle size={13} /> Escalate</button>}
          </div>
        )}
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>SLA is derived from the schedule + live status. Fine-grained targets are a backend follow-up.</div>
      </Card>
    )
  }
  function otpCard() {
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><KeyRound size={16} /> OTP & Service Verification</span>}>
        <Row label="Start OTP" value={b.service_otp ? <span><b>{b.service_otp}</b> {b.started_at ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Pending</Badge>}</span> : '—'} />
        <Row label="Started At" value={fmtDateTime(b.started_at) || '—'} />
        <Row label="Completed At" value={fmtDateTime(b.completed_at) || '—'} />
        {b.rating != null && b.rating > 0 && <Row label="Customer Rating" value={`${'★'.repeat(b.rating)}${'☆'.repeat(Math.max(0, 5 - b.rating))}`} />}
      </Card>
    )
  }
  function evidenceCard() {
    const imgs = [b.work_photo && { label: 'Worker Proof of Work', src: b.work_photo }, b.photo && { label: 'Customer Review Photo', src: b.photo }].filter(Boolean) as { label: string; src: string }[]
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><ImageIcon size={16} /> Service Evidence</span>}>
        {imgs.length ? <div className="grid" style={{ gap: 10 }}>{imgs.map((im) => <div key={im.label}><div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{im.label}</div><a href={im.src} target="_blank" rel="noreferrer"><img src={im.src} alt={im.label} style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} /></a></div>)}</div>
          : <div className="muted" style={{ fontSize: 13, padding: '14px 0' }}>No photos uploaded yet.{b.review && <div style={{ marginTop: 8, color: 'var(--ink)' }}>Review: “{b.review}”</div>}</div>}
      </Card>
    )
  }
  function supportCard() {
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><LifeBuoy size={16} /> Support & Complaints</span>}>
        <div className="muted" style={{ fontSize: 13, padding: '10px 0' }}>No complaint linked to this booking.</div>
        <button className="btn line sm" onClick={() => nav('/support')}>Open Support</button>
      </Card>
    )
  }
  function notesCard() {
    return (
      <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><StickyNote size={16} /> Notes & Activity</span>}>
        {b.admin_note ? <div style={{ fontSize: 13 }}>{b.admin_note}</div> : <div className="muted" style={{ fontSize: 13 }}>No admin notes.</div>}
        <div style={{ marginTop: 10, display: 'grid', gap: 6, fontSize: 12.5 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Booking created</span><span className="muted">{fmtDateTime(b.created)}</span></div>
          {b.started_at && <div className="row" style={{ justifyContent: 'space-between' }}><span>Service started</span><span className="muted">{fmtDateTime(b.started_at)}</span></div>}
          {b.completed_at && <div className="row" style={{ justifyContent: 'space-between' }}><span>Service completed</span><span className="muted">{fmtDateTime(b.completed_at)}</span></div>}
          {b.escalated && <div className="row" style={{ justifyContent: 'space-between', color: '#d92d20' }}><span>Escalated{b.escalate_reason ? ` · ${b.escalate_reason}` : ''}</span></div>}
        </div>
      </Card>
    )
  }
}
