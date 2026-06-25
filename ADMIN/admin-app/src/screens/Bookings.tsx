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
