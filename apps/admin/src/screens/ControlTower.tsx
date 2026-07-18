import { useEffect, useState } from 'react'
import {
  Radio, Phone, UserCog, CalendarClock, AlertTriangle, StickyNote, Ban, RefreshCw, Timer, Zap, Flag,
} from 'lucide-react'
import { Card, StatCard, Badge, Loading, ErrorState, Modal, Field, Dropdown, useToast, useConfirm } from '../components/UI'
import { fetchControlTower, updateBooking } from '../api'
import type { ControlTowerData, CTJob } from '../types'
import { useStore, has } from '../store'

/* Control Tower — the Executive console. Every LIVE job with the actions to intervene one-by-one:
 * call the pro or customer, reassign, reschedule, escalate, leave an operational note, or cancel.
 * Live data, auto-refreshing, scope-aware. Actions need liveops.act. */

const SLA: Record<string, { c: string; label: string }> = {
  onTime: { c: '#16a34a', label: 'On time' }, atRisk: { c: '#f59e0b', label: 'At risk' }, breached: { c: '#ef4444', label: 'Breached' },
}
const statusTone = (s: string): 'red' | 'amber' | 'blue' | 'green' =>
  s === 'confirmed' ? 'red' : s === 'in_progress' ? 'green' : 'blue'
const label = (s: string) => s.replace(/_/g, ' ')

export default function ControlTower() {
  const toast = useToast()
  const confirm = useConfirm()
  const { admin } = useStore()
  const canAct = has(admin, 'liveops.act')

  const [data, setData] = useState<ControlTowerData | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [modal, setModal] = useState<{ job: CTJob; mode: 'reassign' | 'reschedule' | 'escalate' | 'note' } | null>(null)
  const [f, setF] = useState({ workerId: '', date: '', time: '', reason: '', note: '' })

  const load = () => fetchControlTower().then((d) => { setData(d); setErr('') }).catch((e: Error) => setErr(e.message))
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id) }, [])

  if (err && !data) return <ErrorState msg={err} onRetry={load} />
  if (!data) return <Loading />

  const jobs = data.jobs
  const escalated = jobs.filter((j) => j.escalated).length
  const breached = jobs.filter((j) => j.sla === 'breached').length
  const unassigned = jobs.filter((j) => !j.workerId).length

  const act = async (job: CTJob, body: Record<string, unknown>, msg: string) => {
    setBusy(job.id)
    try { await updateBooking(job.id, body); toast(msg); setModal(null); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(null) }
  }
  const open = (job: CTJob, mode: 'reassign' | 'reschedule' | 'escalate' | 'note') => {
    setF({ workerId: job.workerId ? String(job.workerId) : '', date: job.date || '', time: job.time || '', reason: job.escalateReason || '', note: job.adminNote || '' })
    setModal({ job, mode })
  }
  const cancelJob = async (job: CTJob) => {
    if (!(await confirm({ title: `Cancel ${job.ref}?`, message: 'This cancels the live job. It cannot be undone.', confirmLabel: 'Cancel job', danger: true }))) return
    act(job, { status: 'cancelled' }, 'Job cancelled')
  }
  const submitModal = () => {
    if (!modal) return
    const { job, mode } = modal
    if (mode === 'reassign') { const p = data.pros.find((x) => String(x.id) === f.workerId); if (!p) return toast('Pick a pro', 'err'); act(job, { workerId: p.id, workerName: p.name }, `Reassigned to ${p.name}`) }
    else if (mode === 'reschedule') act(job, { date: f.date, time: f.time }, 'Rescheduled')
    else if (mode === 'escalate') act(job, { escalated: true, escalateReason: f.reason.trim() }, 'Escalated')
    else if (mode === 'note') act(job, { adminNote: f.note.trim() }, 'Note saved')
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#0f8a4d' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', boxShadow: '0 0 0 4px rgba(22,163,74,.18)' }} /> LIVE
        </span>
        <span className="muted" style={{ fontSize: 12 }}>Every active job · auto-refreshing</span>
        <button className="btn line sm" style={{ marginLeft: 'auto' }} onClick={load}><RefreshCw size={13} /> Refresh</button>
      </div>

      <div className="stat-row">
        <StatCard icon={<Zap size={18} />} tint="#eef0ff" label="Live jobs" value={jobs.length} sub="in progress" />
        <StatCard icon={<Radio size={18} />} tint={unassigned ? '#fff4e5' : '#eef0ff'} label="Unassigned" value={unassigned} sub="need a pro" />
        <StatCard icon={<Timer size={18} />} tint={breached ? '#fdecec' : '#e7f7ee'} label="SLA breached" value={breached} sub="over target" />
        <StatCard icon={<Flag size={18} />} tint={escalated ? '#fdecec' : '#e7f7ee'} label="Escalated" value={escalated} sub="flagged" />
      </div>

      <Card title="Live jobs" right={<span className="muted" style={{ fontSize: 12 }}>{jobs.length} active{!canAct && ' · view only'}</span>}>
        {jobs.length === 0
          ? <div className="muted" style={{ fontSize: 13, padding: '8px 0' }}>No live jobs right now. Active bookings appear here the moment they're placed.</div>
          : (
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr><th>Job</th><th>Customer</th><th>Pro</th><th>Zone</th><th>Status</th><th style={{ textAlign: 'right' }}>Age</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {jobs.map((j) => {
                    const s = SLA[j.sla]
                    return (
                      <tr key={j.id} style={j.escalated ? { boxShadow: 'inset 3px 0 0 #ef4444' } : undefined}>
                        <td>
                          <strong style={{ fontSize: 13 }}>{j.ref}</strong>
                          {j.escalated && <Badge tone="red" dot={false} > escalated</Badge>}
                          <div className="muted" style={{ fontSize: 11.5 }}>{j.service}{j.date ? ` · ${j.date}${j.time ? ' ' + j.time : ''}` : ''}</div>
                          {j.adminNote && <div style={{ fontSize: 11, color: '#b97400' }}><StickyNote size={10} style={{ verticalAlign: -1 }} /> {j.adminNote}</div>}
                          {j.escalated && j.escalateReason && <div style={{ fontSize: 11, color: '#d92d20' }}>⚑ {j.escalateReason}</div>}
                        </td>
                        <td>
                          <div>{j.customer}</div>
                          {j.customerPhone && <a href={`tel:${j.customerPhone}`} className="muted" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {j.customerPhone}</a>}
                        </td>
                        <td>
                          {j.worker ? (
                            <>
                              <div>{j.worker}</div>
                              {j.workerPhone && <a href={`tel:${j.workerPhone}`} className="muted" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {j.workerPhone}</a>}
                            </>
                          ) : <Badge tone="red" dot={false}>Unassigned</Badge>}
                        </td>
                        <td className="muted">{j.zone}</td>
                        <td><Badge tone={statusTone(j.status)} dot={false}>{label(j.status)}</Badge></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <strong style={{ color: s.c }}>{j.ageMin}m</strong>
                          <div style={{ fontSize: 10.5, color: s.c }}>{s.label}</div>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {canAct ? (
                            <div style={{ display: 'inline-flex', gap: 4 }}>
                              <Act title="Reassign pro" onClick={() => open(j, 'reassign')} busy={busy === j.id}><UserCog size={15} /></Act>
                              <Act title="Reschedule" onClick={() => open(j, 'reschedule')} busy={busy === j.id}><CalendarClock size={15} /></Act>
                              {j.escalated
                                ? <Act title="Clear escalation" onClick={() => act(j, { escalated: false }, 'Escalation cleared')} busy={busy === j.id} color="#16a34a"><AlertTriangle size={15} /></Act>
                                : <Act title="Escalate" onClick={() => open(j, 'escalate')} busy={busy === j.id} color="#d92d20"><AlertTriangle size={15} /></Act>}
                              <Act title="Operational note" onClick={() => open(j, 'note')} busy={busy === j.id}><StickyNote size={15} /></Act>
                              <Act title="Cancel job" onClick={() => cancelJob(j)} busy={busy === j.id} color="#d92d20"><Ban size={15} /></Act>
                            </div>
                          ) : <span className="muted" style={{ fontSize: 11.5 }}>view only</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      {modal && (
        <Modal
          title={{ reassign: `Reassign ${modal.job.ref}`, reschedule: `Reschedule ${modal.job.ref}`, escalate: `Escalate ${modal.job.ref}`, note: `Note — ${modal.job.ref}` }[modal.mode]}
          onClose={() => setModal(null)}
          footer={<>
            <button className="btn line" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn" disabled={busy === modal.job.id} onClick={submitModal}>{busy === modal.job.id ? 'Saving…' : 'Save'}</button>
          </>}
        >
          {modal.mode === 'reassign' && (
            <Field label="Assign to pro">
              <Dropdown value={f.workerId} width="100%" placeholder="Pick a pro"
                options={data.pros.map((p) => ({ value: String(p.id), label: `${p.name}${p.available ? '' : ' (busy)'}` }))}
                onChange={(v) => setF({ ...f, workerId: v })} />
            </Field>
          )}
          {modal.mode === 'reschedule' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
              <Field label="Time"><input value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} placeholder="e.g. 3:00 PM" /></Field>
            </div>
          )}
          {modal.mode === 'escalate' && (
            <Field label="Reason"><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Why is this being escalated?" autoFocus /></Field>
          )}
          {modal.mode === 'note' && (
            <Field label="Operational note"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Add a note visible to the ops team" autoFocus /></Field>
          )}
        </Modal>
      )}
    </div>
  )
}

function Act({ title, onClick, busy, color, children }: { title: string; onClick: () => void; busy?: boolean; color?: string; children: React.ReactNode }) {
  return (
    <button className="iconbtn" title={title} onClick={onClick} disabled={busy} style={{ width: 30, height: 30, color: color || 'var(--ink-2)' }}>{children}</button>
  )
}
