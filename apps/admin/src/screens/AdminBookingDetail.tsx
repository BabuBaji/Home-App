import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, MessageCircle, CalendarClock, RefreshCw, XCircle,
  User, HardHat, Sparkles, Clock, MapPin, IndianRupee, ShieldCheck, KeyRound, Image as ImageIcon,
  LifeBuoy, StickyNote, CheckCircle2, AlertTriangle, ArrowUpCircle, CalendarCheck, PlayCircle, PauseCircle, Flag, HelpCircle,
} from 'lucide-react'
import { Card, Badge, Avatar, Loading, ErrorState, Modal, Field, useToast, useConfirm, money, shortDate, MiniMap, parseLatLng } from '../components/UI'
import { fetchBooking, fetchCustomer, fetchWorkerDetail, fetchZones, fetchWorkers, updateBooking, type Zone } from '../api'

const REACHED: Record<string, number> = { confirmed: 1, worker_assigned: 2, on_the_way: 3, arrived: 4, in_progress: 6, completed: 8, cancelled: 8 }
// Job-timeline lifecycle: current level per status (steps below it are done, the matching one is live).
const CUR_LV: Record<string, number> = { confirmed: 3, worker_assigned: 5, on_the_way: 5, arrived: 7, in_progress: 8, completed: 99, cancelled: -1 }
const fmtDateTime = (v?: string | null) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const timeOnly = (v?: string | null) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—')

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
  }
  useEffect(() => { load(); fetchZones().then(setZones).catch(() => {}) }, [id])

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
  const cancel = async () => { if (!(await confirm({ title: 'Cancel this booking?', message: 'The customer is notified and refunded per policy.', confirmLabel: 'Cancel booking', danger: true }))) return; doUpdate({ status: 'cancelled' }, 'Booking cancelled') }

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

      {tab === 'payment' && <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>{paymentCard()}{settlementCard()}</div>}
      {tab === 'evidence' && <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>{evidenceCard()}{otpCard()}</div>}
      {tab === 'support' && <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>{supportCard()}{notesCard()}</div>}
      {tab === 'activity' && <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 16 }}>{notesCard()}</div>}

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
  function settlementCard() {
    return (
      <Card title="Settlement (Internal)">
        <Row label="Worker Payout" value={money(b.worker_comp || 0)} />
        <Row label="Worker Incentive" value="Not tracked yet" />
        <Row label="Payment Gateway Fee" value="Not tracked yet" />
        <Row label="Settled" value={<Badge tone={b.settled ? 'green' : 'gray'}>{b.settled ? 'Settled' : 'Pending'}</Badge>} />
        <div style={{ borderTop: '1px solid var(--line)', margin: '4px 0' }} />
        <Row label="Company Margin" value={<b>{money(margin)} ({marginPct}%)</b>} strong />
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
