import { useEffect, useState } from 'react'
import { CalendarCheck, CheckCircle2, Clock, CalendarClock, XCircle, Funnel, Download, Eye, MoreVertical } from 'lucide-react'
import { fetchBookings, fetchBooking, updateBooking, fetchWorkers } from '../api'
import type { AdminBooking } from '../types'
import { Card, StatCard, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, Modal, Field, useToast, money, shortDate, MiniMap, parseLatLng } from '../components/UI'
import { useStore, can } from '../store'

const ONGOING = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress']
const UPCOMING = ['confirmed', 'worker_assigned']
const STATUSES = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled']

function TabPill({ n, active }: { n: number; active: boolean }) {
  return (
    <span style={{
      marginLeft: 8, padding: '1px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700,
      background: active ? '#eef0ff' : '#eeeef5',
      color: active ? '#5b51e8' : '#6b7090',
    }}>{n.toLocaleString('en-IN')}</span>
  )
}

const paymentTone = (p: string): string => {
  const s = (p || '').toLowerCase()
  if (s === 'paid') return 'green'
  if (s === 'pending') return 'amber'
  if (s === 'refunded') return 'gray'
  if (s === 'failed') return 'red'
  return 'blue'
}

export default function Bookings() {
  const { admin } = useStore()
  const toast = useToast()
  const [rows, setRows] = useState<AdminBooking[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [tab, setTab] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [status, setStatus] = useState('all')
  const [service, setService] = useState('all')
  const [worker, setWorker] = useState('all')
  const [city, setCity] = useState('all')

  const [modal, setModal] = useState<null | 'view' | 'more'>(null)
  const [active, setActive] = useState<AdminBooking | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [workerList, setWorkerList] = useState<string[]>([])
  const [assignTo, setAssignTo] = useState('')
  const [changeStatus, setChangeStatus] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => { setErr(''); fetchBookings(status, q).then(setRows).catch((e: Error) => setErr(e.message)) }
  useEffect(() => { setErr(''); fetchBookings(status, q).then(setRows).catch((e: Error) => setErr(e.message)) }, [status, q])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const counts = {
    all: rows.length,
    ongoing: rows.filter((b) => ONGOING.includes(b.status)).length,
    upcoming: rows.filter((b) => UPCOMING.includes(b.status)).length,
    completed: rows.filter((b) => b.status === 'completed').length,
    cancelled: rows.filter((b) => b.status === 'cancelled').length,
  }

  const TABS: { label: string; count: number; filter: (b: AdminBooking) => boolean }[] = [
    { label: 'All Bookings', count: counts.all, filter: () => true },
    { label: 'On Going', count: counts.ongoing, filter: (b) => ONGOING.includes(b.status) },
    { label: 'Upcoming', count: counts.upcoming, filter: (b) => UPCOMING.includes(b.status) },
    { label: 'Completed', count: counts.completed, filter: (b) => b.status === 'completed' },
    { label: 'Cancelled', count: counts.cancelled, filter: (b) => b.status === 'cancelled' },
  ]

  const services = Array.from(new Set(rows.map((b) => b.service).filter(Boolean)))
  const workers = Array.from(new Set(rows.map((b) => b.pro).filter(Boolean)))

  const ql = q.trim().toLowerCase()
  const filtered = rows.filter(TABS[tab].filter)
    .filter((b) => service === 'all' || b.service === service)
    .filter((b) => worker === 'all' || b.pro === worker)
    .filter((b) => city === 'all' || (b as any).city === city)
    .filter((b) =>
      !ql || b.ref.toLowerCase().includes(ql) || b.customer.toLowerCase().includes(ql) || (b.pro || '').toLowerCase().includes(ql) || (b.service || '').toLowerCase().includes(ql))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const cities = Array.from(new Set(rows.map((b) => (b as any).city).filter(Boolean)))

  const exportCsv = () => {
    const head = ['Booking ID', 'Customer', 'Worker', 'Service', 'Type', 'Date', 'Time', 'Amount', 'Status', 'Payment']
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [head.join(',')]
    filtered.forEach((b) => lines.push([
      b.ref, b.customer, b.pro || 'Unassigned', b.service || '', b.type || '',
      b.date || b.created || '', b.time || '', b.total, b.status, b.payment_status || b.payment || '',
    ].map(esc).join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'bookings.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const openView = (b: AdminBooking) => {
    setActive(b); setDetail(null); setDetailLoading(true); setModal('view')
    fetchBooking(b.id).then((d) => { setDetail(d); setDetailLoading(false) }).catch((e: Error) => { toast(e.message, 'err'); setDetailLoading(false) })
  }

  const openMore = (b: AdminBooking) => {
    setActive(b); setAssignTo(''); setChangeStatus(b.status); setModal('more')
    if (!workerList.length) fetchWorkers().then((r) => setWorkerList((r.workers || []).map((w: any) => w.name))).catch(() => {})
  }

  const close = () => { setModal(null); setActive(null); setDetail(null); setSaving(false) }

  const doUpdate = (body: Record<string, unknown>, msg: string) => {
    if (!active) return
    setSaving(true)
    updateBooking(active.id, body)
      .then(() => { toast(msg, 'ok'); close(); load() })
      .catch((e: Error) => { toast(e.message, 'err'); setSaving(false) })
  }

  const assignWorker = () => { if (!assignTo) { toast('Select a worker', 'err'); return } doUpdate({ pro_name: assignTo }, 'Worker assigned') }
  const applyStatus = () => { if (!changeStatus) { toast('Select a status', 'err'); return } doUpdate({ status: changeStatus }, 'Status updated') }
  const cancelBooking = () => { if (!window.confirm('Cancel this booking?')) return; doUpdate({ status: 'cancelled' }, 'Booking cancelled') }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<CalendarCheck size={22} />} tint="#5b51e8" label="Total Bookings" value={counts.all.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<CheckCircle2 size={22} />} tint="#16a34a" label="Completed Bookings" value={counts.completed.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<Clock size={22} />} tint="#2e90fa" label="On Going Bookings" value={counts.ongoing.toLocaleString('en-IN')} sub="currently active" />
        <StatCard icon={<CalendarClock size={22} />} tint="#f59e0b" label="Upcoming Bookings" value={counts.upcoming.toLocaleString('en-IN')} sub="scheduled" />
        <StatCard icon={<XCircle size={22} />} tint="#f04438" label="Cancelled Bookings" value={counts.cancelled.toLocaleString('en-IN')} sub="all time" />
      </div>

      <Card>
        <div className="toolbar">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search by Booking ID, Customer, Worker or Service..." />
          <select className="select flt" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="all">All Status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="select flt" value={service} onChange={(e) => { setService(e.target.value); setPage(1) }}>
            <option value="all">All Services</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select flt" value={worker} onChange={(e) => { setWorker(e.target.value); setPage(1) }}>
            <option value="all">All Workers</option>
            {workers.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <select className="select flt" value={city} onChange={(e) => { setCity(e.target.value); setPage(1) }}>
            <option value="all">All Cities</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="tb-spacer" />
          <button className="btn line"><Funnel size={16} /> Filters</button>
          <button className="btn line" onClick={exportCsv}><Download size={16} /> Export</button>
        </div>

        <div className="tabs">
          {TABS.map((t, i) => (
            <button key={t.label} className={'tab' + (tab === i ? ' active' : '')} onClick={() => { setTab(i); setPage(1) }}>
              {t.label}<TabPill n={t.count} active={tab === i} />
            </button>
          ))}
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>BOOKING ID</th>
                <th>CUSTOMER</th>
                <th>WORKER</th>
                <th>SERVICE</th>
                <th>DATE &amp; TIME</th>
                <th>AMOUNT</th>
                <th>STATUS</th>
                <th>PAYMENT</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{r.ref}</td>
                  <td><div className="cell-user"><Avatar name={r.customer} size={34} /><div><strong>{r.customer}</strong></div></div></td>
                  <td>{r.pro ? <div className="cell-user"><Avatar name={r.pro} size={34} /><div><strong>{r.pro}</strong></div></div> : <span className="muted">Unassigned</span>}</td>
                  <td><strong>{r.service || '—'}</strong>{r.type && <small style={{ display: 'block', color: '#6b7090' }}>{r.type}</small>}</td>
                  <td><strong>{r.date ? shortDate(r.date) : shortDate(r.created)}</strong>{r.time && <small style={{ display: 'block', color: '#6b7090' }}>{r.time}</small>}</td>
                  <td className="num">{money(r.total)}</td>
                  <td><Badge>{r.status}</Badge></td>
                  <td><Badge tone={paymentTone(r.payment_status)}>{r.payment_status || r.payment || '—'}</Badge></td>
                  <td>
                    <div className="actions">
                      <button className="iconbtn" style={{ width: 30, height: 30 }} title="View" onClick={() => openView(r)}><Eye size={16} /></button>
                      <button className="iconbtn" style={{ width: 30, height: 30 }} title="More" onClick={() => openMore(r)}><MoreVertical size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="bookings" onPage={setPage} onSize={(s) => { setPageSize(s); setPage(1) }} />
      </Card>

      {modal === 'view' && active && (
        <Modal title="Booking Details" onClose={close} footer={<button className="btn line" onClick={close}>Close</button>}>
          {detailLoading || !detail ? <Loading /> : (
            <>
              <Field label="Booking ID"><input className="input" value={detail.ref || active.ref} readOnly /></Field>
              <Field label="Customer"><input className="input" value={detail.customer || active.customer} readOnly /></Field>
              <Field label="Worker"><input className="input" value={detail.pro_name || detail.pro || active.pro || 'Unassigned'} readOnly /></Field>
              <Field label="Status"><div><Badge>{detail.status || active.status}</Badge></div></Field>
              <Field label="Payment"><div><Badge tone={paymentTone(detail.payment_status || detail.payment)}>{detail.payment_status || detail.payment || '—'}</Badge></div></Field>
              <Field label="Date & Time"><input className="input" value={`${shortDate(detail.date || detail.created)}${detail.time ? ' · ' + detail.time : ''}`} readOnly /></Field>
              <Field label="Address"><input className="input" value={detail.address || '—'} readOnly /></Field>
              {Array.isArray(detail.items) && detail.items.length > 0 && (
                <Field label="Items">
                  <div className="minilist">
                    {detail.items.map((it: any, i: number) => (
                      <div key={i} className="mini-row">
                        <div className="mini-bd" style={{ flex: 1 }}><strong>{it.name || it.title || it.service}</strong>{it.qty != null && <small> × {it.qty}</small>}</div>
                        {it.price != null && <span className="muted">{money(it.price)}</span>}
                      </div>
                    ))}
                  </div>
                </Field>
              )}
              <Field label="Total"><input className="input" value={money(detail.total ?? active.total)} readOnly /></Field>

              {(detail.status === 'completed' || detail.work_photo || detail.photo || detail.started_at) && (
                <div className="field">
                  <span>Service Completion</span>
                  <div className="grid" style={{ gap: 8 }}>
                    <div className="row" style={{ gap: 24 }}>
                      <div><small className="muted">Started</small><div>{detail.started_at ? new Date(detail.started_at).toLocaleString('en-IN') : '—'}</div></div>
                      <div><small className="muted">Completed</small><div>{detail.completed_at ? new Date(detail.completed_at).toLocaleString('en-IN') : '—'}</div></div>
                    </div>
                    {detail.rating != null && (
                      <div><small className="muted">Customer Rating</small><div>{'★'.repeat(Number(detail.rating) || 0)}{'☆'.repeat(Math.max(0, 5 - (Number(detail.rating) || 0)))} {detail.review ? `· "${detail.review}"` : ''}</div></div>
                    )}
                    {(detail.work_photo || detail.photo)
                      ? <div className="grid" style={{ gap: 10 }}>
                          {detail.work_photo && (
                            <div><small className="muted">Worker Proof of Work</small><a href={detail.work_photo} target="_blank" rel="noreferrer"><img src={detail.work_photo} alt="Worker proof of work" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', background: '#f4f4fa', borderRadius: 12, border: '1px solid var(--line)', marginTop: 4 }} /></a></div>
                          )}
                          {detail.photo && (
                            <div><small className="muted">Customer Review Photo</small><a href={detail.photo} target="_blank" rel="noreferrer"><img src={detail.photo} alt="Customer photo" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', background: '#f4f4fa', borderRadius: 12, border: '1px solid var(--line)', marginTop: 4 }} /></a></div>
                          )}
                        </div>
                      : <div className="muted" style={{ fontSize: 12 }}>No proof photo uploaded by the worker.</div>}
                  </div>
                </div>
              )}

              {(() => {
                const pos = parseLatLng({ lat: detail.cust_lat, lng: detail.cust_lng })
                return pos ? <div className="field"><span>Customer Location</span><MiniMap lat={pos.lat} lng={pos.lng} label={detail.address || ''} /></div> : null
              })()}
            </>
          )}
        </Modal>
      )}

      {modal === 'more' && active && (
        <Modal title={`Manage Booking · ${active.ref}`} onClose={close} footer={<button className="btn line" onClick={close}>Close</button>}>
          <Field label="Assign Worker">
            <select className="select" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">Select worker…</option>
              {workerList.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </Field>
          <button className="btn" onClick={assignWorker} disabled={saving || !can(admin?.role, 'manager')} style={{ marginBottom: 12 }}>Assign</button>

          <Field label="Change Status">
            <select className="select" value={changeStatus} onChange={(e) => setChangeStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <button className="btn" onClick={applyStatus} disabled={saving || !can(admin?.role, 'manager')} style={{ marginBottom: 12 }}>Update Status</button>

          <button className="btn line" onClick={cancelBooking} disabled={saving || !can(admin?.role, 'manager')} style={{ color: 'var(--red)' }}>Cancel Booking</button>
        </Modal>
      )}
    </div>
  )
}
