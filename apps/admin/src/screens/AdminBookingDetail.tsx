import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, MessageCircle, CalendarClock, RefreshCw, XCircle,
  User, HardHat, Sparkles, Clock, MapPin, IndianRupee, ShieldCheck, KeyRound, Image as ImageIcon,
  LifeBuoy, StickyNote, CheckCircle2, AlertTriangle, ArrowUpCircle,
} from 'lucide-react'
import { Card, Badge, Avatar, Loading, ErrorState, Modal, Field, useToast, useConfirm, money, shortDate, MiniMap, parseLatLng } from '../components/UI'
import { fetchBooking, fetchCustomer, fetchWorkerDetail, fetchZones, fetchWorkers, updateBooking, type Zone } from '../api'

// The full operational lifecycle we display in the journey (some steps are derived, not yet tracked).
const JOURNEY = [
  { key: 'created', label: 'Booking Created' },
  { key: 'paid', label: 'Payment Completed' },
  { key: 'worker_assigned', label: 'Worker Assigned' },
  { key: 'on_the_way', label: 'On the Way' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'otp', label: 'OTP Verified' },
  { key: 'in_progress', label: 'Service Started' },
  { key: 'completed', label: 'Service Completed' },
  { key: 'closed', label: 'Closed' },
]
const REACHED: Record<string, number> = { confirmed: 1, worker_assigned: 2, on_the_way: 3, arrived: 4, in_progress: 6, completed: 8, cancelled: 8 }
const fmtDateTime = (v?: string | null) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

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
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{svcName} · {b.type === 'instant' ? 'Instant' : 'Scheduled'} · via {b.type === 'instant' ? 'Instant' : 'Customer App'}</div>
      </div>

      {/* tabs */}
      <div className="tabs">
        {(['overview', 'timeline', 'payment', 'evidence', 'support', 'activity'] as const).map((t) => (
          <button key={t} className={'tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>
            {{ overview: 'Overview', timeline: 'Job Timeline', payment: 'Payment & Settlement', evidence: 'Service Evidence', support: 'Support', activity: 'Activity Logs' }[t]}
          </button>
        ))}
      </div>

      {(tab === 'overview' || tab === 'timeline') && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {tab === 'overview' && <>
            <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><CalendarClock size={16} /> Booking Summary</span>}>
              <Row label="Booking ID" value={<b>{b.ref}</b>} />
              <Row label="Service" value={svcName} />
              <Row label="Type" value={b.type === 'instant' ? 'Instant' : 'Scheduled'} />
              <Row label="Date" value={b.date ? shortDate(b.date) : shortDate(b.created)} />
              <Row label="Time Slot" value={b.time || '—'} />
              <Row label="Duration" value={b.duration || (items[0]?.durationLabel) || '—'} />
              <Row label="Zone" value={derived.zone?.name || (b.zone_id ? `Zone ${b.zone_id}` : '—')} />
              <Row label="Amount Paid" value={<b>{money(b.total)}</b>} strong />
              <Row label="Created" value={fmtDateTime(b.created)} />
            </Card>

            <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><User size={16} /> Customer Details</span>} right={cust && <button className="btn line" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => nav(`/customers/${b.user_id}`)}>View Customer</button>}>
              <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <Avatar name={b.customer} size={40} />
                <div><div style={{ fontWeight: 700 }}>{b.customer}</div><div className="muted" style={{ fontSize: 12 }}>{custBookings} booking{custBookings === 1 ? '' : 's'}{custRating ? ` · ★ ${custRating}` : ''}</div></div>
              </div>
              <Row label="Phone" value={custPhone || 'Not available'} />
              <Row label="Email" value={custEmail || 'Not available'} />
              <Row label="Address" value={<span style={{ maxWidth: 200, display: 'inline-block' }}>{b.address || '—'}</span>} />
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn line" style={{ flex: 1, fontSize: 12 }} disabled={!custPhone} onClick={() => tel(custPhone)}><Phone size={13} /> Call</button>
                <button className="btn line" style={{ flex: 1, fontSize: 12 }} disabled={!custPhone} onClick={() => custPhone && window.open(`https://wa.me/${custPhone.replace(/\D/g, '')}`)}><MessageCircle size={13} /> WhatsApp</button>
              </div>
            </Card>

            <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><HardHat size={16} /> Worker Assignment</span>}>
              {b.pro_name ? <>
                <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <Avatar name={b.pro_name} size={40} />
                  <div><div style={{ fontWeight: 700 }}>{b.pro_name}</div><div className="muted" style={{ fontSize: 12 }}>{workerRating ? `★ ${workerRating}` : ''}{workerJobs ? ` · ${workerJobs} jobs` : ''}</div></div>
                </div>
                <Row label="Worker ID" value={b.worker_id ? `WRK-${b.worker_id}` : '—'} />
                <Row label="Current Status" value={<Badge>{b.status}</Badge>} />
                <Row label="Shift" value="Not tracked yet" />
                <Row label="Distance / ETA" value="Not tracked yet" />
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <button className="btn line" style={{ flex: 1, fontSize: 12 }} disabled={!workerPhone} onClick={() => tel(workerPhone)}><Phone size={13} /> Call</button>
                  <button className="btn line" style={{ flex: 1, fontSize: 12 }} onClick={() => nav(`/workers/${b.worker_id}`)}><User size={13} /> View</button>
                  <button className="btn line" style={{ flex: 1, fontSize: 12 }} onClick={openReassign}><RefreshCw size={13} /> Reassign</button>
                </div>
              </> : <div style={{ padding: '10px 0' }}><Badge tone="red" dot={false}>Unassigned</Badge><div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>No worker assigned yet.</div><button className="btn sm" style={{ marginTop: 10 }} onClick={openReassign}>Assign worker</button></div>}
            </Card>

            <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><Sparkles size={16} /> Service Details</span>}>
              <Row label="Service" value={<b>{svcName}</b>} />
              <Row label="Duration" value={b.duration || items[0]?.durationLabel || '—'} />
              <Row label="Items" value={items.length || 1} />
              <Row label="Frequency" value={b.freq || 'One-time'} />
              {b.note && <div style={{ marginTop: 8 }}><div className="muted" style={{ fontSize: 12 }}>Customer Instructions</div><div style={{ fontSize: 13, marginTop: 3 }}>“{b.note}”</div></div>}
            </Card>

            <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><Clock size={16} /> Booking Journey</span>}>
              <div style={{ display: 'grid', gap: 2 }}>
                {JOURNEY.map((step, i) => {
                  const done = b.status === 'cancelled' ? step.key === 'created' || step.key === 'paid' : i <= reached
                  const current = i === reached && derived.active
                  return (
                    <div key={step.key} className="row" style={{ gap: 10, alignItems: 'center', padding: '5px 0', opacity: done || current ? 1 : 0.45 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 50, display: 'grid', placeItems: 'center', background: current ? '#eef0ff' : done ? '#e7f7ee' : '#eeeef5', color: current ? '#5b51e8' : done ? '#0f8a4d' : '#9aa0ad', flex: 'none' }}>{done ? <CheckCircle2 size={12} /> : current ? '•' : ''}</span>
                      <span style={{ fontSize: 13, fontWeight: current ? 700 : 500 }}>{step.label}</span>
                      {current && <Badge tone="violet" dot={false}>Current</Badge>}
                    </div>
                  )
                })}
                {b.status === 'cancelled' && <div className="row" style={{ gap: 10, padding: '5px 0' }}><span style={{ width: 18, height: 18, borderRadius: 50, background: '#fdecec', color: '#d92d20', display: 'grid', placeItems: 'center', flex: 'none' }}><XCircle size={12} /></span><span style={{ fontSize: 13, fontWeight: 700, color: '#d92d20' }}>Cancelled{b.cancel_reason ? ` · ${b.cancel_reason}` : ''}</span></div>}
              </div>
            </Card>

            <Card title={<span className="row" style={{ gap: 8, alignItems: 'center' }}><MapPin size={16} /> Live Job Tracking</span>}>
              {workerPos || custPos ? <MiniMap lat={(workerPos || custPos)!.lat} lng={(workerPos || custPos)!.lng} label={b.address || ''} /> : <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>No live location for this booking yet.</div>}
            </Card>

            {/* Payment + SLA also on overview */}
            {paymentCard()}
            {slaCard()}
            {otpCard()}
            {evidenceCard()}
            {notesCard()}
          </>}

          {tab === 'timeline' && <Card title="Job Timeline">
            <div style={{ display: 'grid', gap: 2 }}>
              {JOURNEY.map((step, i) => {
                const done = b.status === 'cancelled' ? i < 2 : i <= reached
                const current = i === reached && derived.active
                const at = step.key === 'created' ? b.created : step.key === 'in_progress' ? b.started_at : step.key === 'completed' ? b.completed_at : null
                return (
                  <div key={step.key} className="row" style={{ gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--line-2,#f4f4fa)', opacity: done || current ? 1 : 0.45 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 50, display: 'grid', placeItems: 'center', background: current ? '#eef0ff' : done ? '#e7f7ee' : '#eeeef5', color: current ? '#5b51e8' : done ? '#0f8a4d' : '#9aa0ad', flex: 'none' }}>{done ? <CheckCircle2 size={13} /> : ''}</span>
                    <span style={{ fontSize: 13, fontWeight: current ? 700 : 500, flex: 1 }}>{step.label}{current && ' · Current'}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{at ? fmtDateTime(at) : ''}</span>
                  </div>
                )
              })}
            </div>
          </Card>}
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

  // ---- cards reused across tabs ----
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
        <Row label="Started At" value={fmtDateTime(b.started_at)} />
        <Row label="Completed At" value={fmtDateTime(b.completed_at)} />
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
