import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserCheck, UserX, HelpCircle, LogIn, Plane, AlertTriangle, RefreshCw } from 'lucide-react'
import { fetchShiftBoard, fetchShiftRequests, reviewWorkerAvailability, type ShiftBoard, type ShiftRequest } from '../api'
import { Card, Badge, Loading, StatCard, useToast } from '../components/UI'
import { useStore, has } from '../store'

/* Workforce ▸ Shift Confirmations — for a day, every expert on the roster or on a shift plan: did they
 * answer "coming", have they checked in, are they on leave, and did a no-show Red Card land. */
const istDate = (offsetDays: number) => new Date(Date.now() + 5.5 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10)
const clock = (d: string | null) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '')
const stamp = (d: string | null) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '')
const STATUS: Record<string, [string, string]> = {
  checked_in: ['Checked in', 'green'], done: ['Shift done', 'green'], coming: ['Confirmed coming', 'blue'],
  not_coming: ['Not coming', 'amber'], leave: ['On leave', 'gray'], no_reply: ['No reply', 'gray'], no_show: ['No-show', 'red'],
}

const acMsg = (r: unknown, fallback: string) => { const x = r as { approvalCenter?: boolean; message?: string } | null; return x?.approvalCenter && x.message ? x.message : fallback }
export default function ShiftConfirmations() {
  const nav = useNavigate()
  const toast = useToast()
  const [date, setDate] = useState(istDate(0))
  const [filter, setFilter] = useState('')
  const [b, setB] = useState<ShiftBoard | null>(null)
  const load = () => { setB(null); fetchShiftBoard(date).then(setB).catch((e: Error) => toast(e.message)) }
  useEffect(load, [date])
  const { admin } = useStore()
  const canApprove = has(admin, 'shifts.approve')
  const [reqs, setReqs] = useState<ShiftRequest[]>([])
  const [busy, setBusy] = useState(0)
  const loadReqs = () => { if (canApprove) fetchShiftRequests().then(setReqs).catch(() => {}) }
  useEffect(() => { loadReqs() }, [])
  async function decide(r: ShiftRequest, approve: boolean) {
    let reason = ''
    if (!approve) {
      const x = window.prompt(`Why is ${r.name}'s request rejected? (the expert sees this)`)
      if (x === null) return
      if (!x.trim()) return toast('Give a reason')
      reason = x.trim()
    }
    setBusy(r.workerId)
    try {
      // Reject keeps the expert on their current shift, with the reason.
      const resp = await reviewWorkerAvailability(r.workerId, approve ? { approve: true } : { approve: false, shiftDefId: r.currentShiftId, reason })
      toast(acMsg(resp, approve ? `${r.name} moved to ${r.requestedShift}` : 'Request rejected')); loadReqs(); load()
    } catch (e) { toast((e as Error).message) } finally { setBusy(0) }
  }

  const rows = (b?.experts || []).filter((e) => !filter || e.status === filter || (filter === 'checked_in' && e.status === 'done'))
  const pick = (k: string) => setFilter((f) => (f === k ? '' : k))

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="tabs">
          <button className={`tab ${date === istDate(-1) ? 'active' : ''}`} onClick={() => setDate(istDate(-1))}>Yesterday</button>
          <button className={`tab ${date === istDate(0) ? 'active' : ''}`} onClick={() => setDate(istDate(0))}>Today</button>
          <button className={`tab ${date === istDate(1) ? 'active' : ''}`} onClick={() => setDate(istDate(1))}>Tomorrow</button>
        </div>
        <input type="date" className="input" style={{ maxWidth: 170 }} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="btn line" onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      {reqs.length > 0 && (
        <Card title={`Shift change requests (${reqs.length})`} >
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Expert</th><th>Current shift</th><th>Requested shift</th><th>Approver</th><th /></tr></thead>
            <tbody>{reqs.map((r) => (
              <tr key={r.workerId}>
                <td><span className="link" onClick={() => nav(`/workers/${r.workerId}`)}>{r.name}</span><div className="muted" style={{ fontSize: 11 }}>{r.phone}</div></td>
                <td>{r.currentShift}</td>
                <td><b>{r.requestedShift}</b></td>
                <td>{r.mine ? <Badge tone="blue">You</Badge> : r.assignedTo ? <>{r.assignedTo.name}<div className="muted" style={{ fontSize: 11 }}>{r.assignedTo.roleName}</div></> : <span className="muted">Anyone in zone</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" style={{ padding: '4px 12px', marginRight: 6 }} disabled={busy === r.workerId} onClick={() => decide(r, true)}>Approve</button>
                  <button className="btn line" style={{ padding: '4px 12px', color: '#dc2626' }} disabled={busy === r.workerId} onClick={() => decide(r, false)}>Reject</button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}
      <div style={{ height: reqs.length ? 14 : 0 }} />

      <div className="stat-row">
        <div onClick={() => pick('coming')} style={{ cursor: 'pointer' }}><StatCard icon={<UserCheck size={20} />} tint="#2563eb" label="Confirmed coming" value={b?.coming ?? '—'} sub="not checked in yet" /></div>
        <div onClick={() => pick('checked_in')} style={{ cursor: 'pointer' }}><StatCard icon={<LogIn size={20} />} tint="#16a34a" label="Checked in" value={b?.checkedIn ?? '—'} /></div>
        <div onClick={() => pick('not_coming')} style={{ cursor: 'pointer' }}><StatCard icon={<UserX size={20} />} tint="#d97706" label="Not coming" value={b?.notComing ?? '—'} /></div>
        <div onClick={() => pick('leave')} style={{ cursor: 'pointer' }}><StatCard icon={<Plane size={20} />} tint="#64748b" label="On leave" value={b?.leave ?? '—'} /></div>
        <div onClick={() => pick('no_reply')} style={{ cursor: 'pointer' }}><StatCard icon={<HelpCircle size={20} />} tint="#94a3b8" label="No reply" value={b?.noReply ?? '—'} /></div>
        <div onClick={() => pick('no_show')} style={{ cursor: 'pointer' }}><StatCard icon={<AlertTriangle size={20} />} tint="#dc2626" label="No-show" value={b?.noShow ?? '—'} sub="Red Card given" /></div>
      </div>

      <Card title={`${b?.total ?? 0} experts scheduled${filter ? ` · ${STATUS[filter]?.[0] || filter}` : ''}`} right={filter ? <button className="btn line" onClick={() => setFilter('')}>Show all</button> : undefined}>
        {!b ? <Loading /> : rows.length === 0 ? <p className="muted">Nobody here.</p> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Expert</th><th>Shift</th><th>Answer</th><th>Check-in</th><th>Status</th><th>Red Card</th></tr></thead>
            <tbody>{rows.map((e) => {
              const [label, tone] = STATUS[e.status] || [e.status, 'gray']
              return (
                <tr key={e.workerId}>
                  <td><span className="link" onClick={() => nav(`/workers/${e.workerId}`)}>{e.name}</span><div className="muted" style={{ fontSize: 11 }}>{e.phone}{e.suspended ? ' · suspended' : ''}</div></td>
                  <td>{e.shift || '—'}<div className="muted" style={{ fontSize: 11 }}>{e.onRoster ? 'Roster' : 'Shift plan'}</div></td>
                  <td>
                    {e.answer === null ? <span className="muted">No reply</span> : e.answer ? 'Coming' : 'Not coming'}
                    {e.respondedAt && <div className="muted" style={{ fontSize: 11 }}>{stamp(e.respondedAt)}{e.note ? ` · ${e.note}` : ''}</div>}
                  </td>
                  <td>{e.checkIn ? <>{clock(e.checkIn)}{e.checkOut ? ` – ${clock(e.checkOut)}` : ''}{e.lateMinutes > 15 && <div style={{ fontSize: 11, color: '#d97706' }}>{e.lateMinutes} min late</div>}</> : e.leave ? e.leave : '—'}</td>
                  <td><Badge tone={tone}>{label}</Badge></td>
                  <td>{e.noShowCards ? <b style={{ color: '#dc2626' }}>+{e.noShowCards}</b> : '—'}</td>
                </tr>
              )
            })}</tbody>
          </table></div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Experts on the roster, or on a shift plan who confirmed “coming”, get a no-show Red Card if their shift ends with no check-in and no leave.
          Answering “not coming” or taking leave on such a day follows the cancellation rules in Reliability &amp; Penalties.
        </p>
      </Card>
    </div>
  )
}
