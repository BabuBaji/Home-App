import { useEffect, useState } from 'react'
import { fetchBookings, fetchBooking, updateBooking, fetchWorkers } from '../api'
import type { AdminBooking } from '../types'
import { Card, Loading, ErrorState, Empty, Badge, Avatar, SearchBox, Modal, Field, money, shortDate, useToast } from '../components/UI'
import { useStore, can } from '../store'

const TABS = [
  { k: 'all', label: 'All' }, { k: 'ongoing', label: 'On-Going' }, { k: 'upcoming', label: 'Upcoming' },
  { k: 'completed', label: 'Completed' }, { k: 'cancelled', label: 'Cancelled' },
]
const STATUSES = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled']

// Status banner styling for the Manage modal — "completed" shows the proof photo + review,
// anything else surfaces the live stage (in progress, on the way, etc.).
const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  confirmed: { label: '🕓 Awaiting worker', bg: '#FFF4E5', fg: '#B26A00' },
  worker_assigned: { label: '👷 Expert assigned', bg: '#EEF0FF', fg: '#4338CA' },
  on_the_way: { label: '🚗 On the way to customer', bg: '#EEF0FF', fg: '#4338CA' },
  arrived: { label: '📍 Expert arrived', bg: '#EEF0FF', fg: '#4338CA' },
  in_progress: { label: '🧹 Service in progress', bg: '#E6F7EE', fg: '#0F7B43' },
  completed: { label: '✅ Service completed', bg: '#E6F7EE', fg: '#0F7B43' },
  cancelled: { label: '❌ Booking cancelled', bg: '#FDECEC', fg: '#C62828' },
}

// Human-readable elapsed time between two ISO timestamps (the worker's real on-site duration).
function actualDuration(startedAt?: string, endedAt?: string): string | null {
  if (!startedAt || !endedAt) return null
  const sec = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000))
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m} min ${s}s`
  return `${s}s`
}

export default function Bookings() {
  const toast = useToast()
  const [rows, setRows] = useState<AdminBooking[] | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('all'); const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  const load = () => { setErr(''); fetchBookings(tab, q).then(setRows).catch((e) => setErr(e.message)) }
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id) }, [tab, q])

  if (err) return <ErrorState msg={err} onRetry={load} />

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="chips">
        {TABS.map((t) => <button key={t.k} className={'chip' + (tab === t.k ? ' active' : '')} onClick={() => setTab(t.k)}>{t.label}</button>)}
      </div>
      <Card>
        <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Search by ref, customer or service…" /></div>
        {!rows ? <Loading /> : rows.length === 0 ? <Empty msg="No bookings found." /> : (
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Ref</th><th>Customer</th><th>Service</th><th>Pro</th><th>Schedule</th><th>Amount</th><th>Payment</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td className="muted">{b.ref}</td>
                    <td><div className="cell-user"><Avatar name={b.customer} size={30} /><strong>{b.customer}</strong></div></td>
                    <td>{b.service}</td>
                    <td>{b.pro}</td>
                    <td className="muted">{b.type === 'instant' ? 'Instant' : `${b.date || '—'} ${b.time || ''}`}</td>
                    <td className="num">{money(b.total)}</td>
                    <td><span style={{ textTransform: 'capitalize' }}>{b.payment}</span> <Badge>{b.payment_status}</Badge></td>
                    <td><Badge>{b.status}</Badge></td>
                    <td><span className="link" onClick={() => setOpen(b.id)}>Manage</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open != null && <BookingModal id={open} onClose={() => setOpen(null)} onChange={load} toast={toast} />}
    </div>
  )
}

function BookingModal({ id, onClose, onChange, toast }: { id: number; onClose: () => void; onChange: () => void; toast: (m: string, k?: 'ok' | 'err') => void }) {
  const { admin } = useStore()
  const [b, setB] = useState<any>(null)
  const [pros, setPros] = useState<string[]>([])
  const load = () => fetchBooking(id).then(setB).catch(() => {})
  useEffect(() => { load(); fetchWorkers('', 'active').then((d) => setPros(d.workers.map((w) => w.name))).catch(() => {}) }, [id])

  async function change(body: Record<string, unknown>) {
    try { await updateBooking(id, body); toast('Booking updated'); load(); onChange() } catch (e: any) { toast(e.message, 'err') }
  }
  const editable = can(admin?.role, 'manager')

  return (
    <Modal title="Manage Booking" onClose={onClose} wide footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
      {!b ? <Loading /> : (
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
            <div><h3 style={{ fontSize: 18 }}>{b.ref}</h3><p className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>{b.customer} · {shortDate(b.created)}</p></div>
            <Badge>{b.status}</Badge>
          </div>
          <div className="stat-row" style={{ marginBottom: 18 }}>
            <div className="stat"><div className="stat-body"><span className="stat-label">Total</span><strong className="stat-value">{money(b.total)}</strong></div></div>
            <div className="stat"><div className="stat-body"><span className="stat-label">Payment</span><strong className="stat-value" style={{ fontSize: 16, textTransform: 'capitalize' }}>{b.payment}</strong><span className="stat-sub">{b.payment_status}</span></div></div>
            <div className="stat"><div className="stat-body"><span className="stat-label">Type</span><strong className="stat-value" style={{ fontSize: 16, textTransform: 'capitalize' }}>{b.type}</strong></div></div>
          </div>

          <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Items</h4>
          <div className="tablewrap" style={{ marginBottom: 16 }}>
            <table className="tbl"><thead><tr><th>Service</th><th>Duration</th><th>Price</th></tr></thead>
              <tbody>{b.items.map((i: any, k: number) => <tr key={k}><td>{i.icon} {i.name}</td><td className="muted">{i.durationLabel || '—'}</td><td className="num">{money(i.price)}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13 }}><strong>Address:</strong> {b.address}</p>

          {/* Live service stage */}
          {(() => { const m = STATUS_META[b.status] || { label: b.status, bg: '#eee', fg: '#333' }; return (
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: m.bg, color: m.fg, fontWeight: 600 }}>
              {m.label}
              {b.started_at && <span style={{ fontWeight: 400, marginLeft: 8 }}>· started {shortDate(b.started_at)}</span>}
            </div>
          ) })()}

          {/* Booked (estimated) vs actual time the worker spent on site */}
          {(b.started_at || b.duration) && (
            <div className="stat-row" style={{ marginTop: 12 }}>
              <div className="stat"><div className="stat-body"><span className="stat-label">Booked time</span><strong className="stat-value" style={{ fontSize: 16 }}>{b.duration || b.items?.[0]?.durationLabel || '—'}</strong><span className="stat-sub">estimated</span></div></div>
              <div className="stat"><div className="stat-body"><span className="stat-label">Actual time taken</span><strong className="stat-value" style={{ fontSize: 16, color: b.completed_at ? '#0F7B43' : undefined }}>{actualDuration(b.started_at, b.completed_at) || (b.started_at ? 'in progress…' : 'not started')}</strong><span className="stat-sub">{b.completed_at ? 'worker on-site' : 'live'}</span></div></div>
            </div>
          )}

          {/* Proof-of-work photo captured by the worker at completion */}
          {b.work_photo && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>📷 Proof of work — by {b.pro_name}</h4>
              <img src={b.work_photo} alt="Proof of work" style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 10, border: '1px solid #eee' }} />
            </div>
          )}

          {/* Customer rating & review (shown once the customer has rated) */}
          {b.rating ? (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Customer review</h4>
              <div style={{ fontSize: 20, letterSpacing: 2 }}>
                <span style={{ color: '#F5A623' }}>{'★'.repeat(b.rating)}</span>
                <span style={{ color: '#ddd' }}>{'★'.repeat(Math.max(0, 5 - b.rating))}</span>
                <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>{b.rating}/5</span>
              </div>
              {b.review && <p style={{ margin: '6px 0 0' }}>{b.review}</p>}
              {b.photo && <img src={b.photo} alt="Customer photo" style={{ maxWidth: 180, borderRadius: 8, marginTop: 8, border: '1px solid #eee' }} />}
            </div>
          ) : b.status === 'completed' ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>Service completed — awaiting customer review.</p>
          ) : (
            <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>Proof photo &amp; review appear here once the service is completed.</p>
          )}

          {editable && (
            <div className="form-grid" style={{ marginTop: 14 }}>
              <Field label="Assign professional">
                <select value={b.pro_name} onChange={(e) => change({ pro_name: e.target.value })}>
                  <option value={b.pro_name}>{b.pro_name}</option>
                  {pros.filter((p) => p !== b.pro_name).map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Update status">
                <select value={b.status} onChange={(e) => change({ status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </Field>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
