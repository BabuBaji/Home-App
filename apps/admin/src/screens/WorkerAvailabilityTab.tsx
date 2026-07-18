import { useEffect, useState } from 'react'
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Clock, Coffee, Timer, AlertTriangle, CheckCircle2, Info as InfoIcon } from 'lucide-react'
import { Card, Badge, Loading, ErrorState, Modal, Dropdown, useToast, shortDate } from '../components/UI'
import { fetchAvailabilityOverview, fetchWorkerAvailability, createWorkerLeave, reviewWorkerLeave, reviewWorkerAvailability, fetchZones, type Zone } from '../api'
import type { AvailabilityOverview, WorkerAvailabilityState } from '../types'

/* Availability tab — schedule, week summary, month calendar, leaves and the change trail. Every
 * figure is derived server-side from real attendance / shift / leave rows. Actions: record a leave,
 * change the assigned shift (both persist and append to the change log). */

const ST: Record<string, { c: string; bg: string }> = {
  'On Duty': { c: '#0f8a4d', bg: '#e7f7ee' }, Leave: { c: '#b45309', bg: '#fff4e5' },
  Training: { c: '#6d28d9', bg: '#f1ecfe' }, 'Half Day': { c: '#1d4ed8', bg: '#e8f0fe' },
  'Weekly Off': { c: '#be123c', bg: '#fdecef' }, Absent: { c: '#98a2b3', bg: '#f4f4f7' }, Off: { c: '#98a2b3', bg: '#f4f4f7' },
}
const LEGEND = [['On Duty', '#0f8a4d'], ['Leave', '#b45309'], ['Training', '#6d28d9'], ['Half Day', '#1d4ed8'], ['Weekly Off', '#be123c']] as const
const shiftMonth = (m: string, delta: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + delta, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
const monthLabel = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }
const leaveTone = (s: string) => s === 'Approved' ? 'green' : s === 'Rejected' ? 'red' : 'amber'
const to12 = (hhmm?: string) => { const [h, m] = String(hhmm || '').split(':').map(Number); if (!Number.isFinite(h)) return String(hhmm || ''); const ap = h < 12 ? 'AM' : 'PM'; const hr = h % 12 || 12; return `${hr}:${String(m).padStart(2, '0')} ${ap}` }

function OverviewCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <div style={{ border: '1px solid var(--line,#eef0f4)', borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
      <div className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 8 }}><span style={{ color: 'var(--muted,#98a2b3)', display: 'flex' }}>{icon}</span><span className="muted" style={{ fontSize: 11.5 }}>{label}</span></div>
      <div style={{ fontSize: 13, fontWeight: 700, color: tone, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function WorkerAvailabilityTab({ workerId }: { workerId: number }) {
  const toast = useToast()
  const [month, setMonth] = useState('')
  const [d, setD] = useState<AvailabilityOverview | null>(null)
  const [err, setErr] = useState('')
  const [avail, setAvail] = useState<WorkerAvailabilityState | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ fromDate: '', toDate: '', leaveType: 'Personal', reason: '', status: 'Approved' })
  const [chgOpen, setChgOpen] = useState(false)
  const [chgBusy, setChgBusy] = useState(false)
  const [chgForm, setChgForm] = useState({ shiftDefId: '', zoneId: '', reason: '' })
  const [leaveActBusy, setLeaveActBusy] = useState<number | null>(null)

  const load = () => { fetchAvailabilityOverview(workerId, month || undefined).then((x) => { setD(x); setErr('') }).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [workerId, month])
  useEffect(() => { fetchWorkerAvailability(workerId).then(setAvail).catch(() => {}); fetchZones().then(setZones).catch(() => {}) }, [workerId])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  const submitLeave = async () => {
    if (!leaveForm.fromDate) return toast('Pick a start date')
    setLeaveBusy(true)
    try { await createWorkerLeave(workerId, leaveForm); toast('Leave recorded'); setLeaveOpen(false); setLeaveForm({ fromDate: '', toDate: '', leaveType: 'Personal', reason: '', status: 'Approved' }); load() }
    catch (e) { toast((e as Error).message) } finally { setLeaveBusy(false) }
  }
  const submitChange = async () => {
    if (!chgForm.reason.trim()) return toast('Say why the shift is changing')
    setChgBusy(true)
    try {
      await reviewWorkerAvailability(workerId, { approve: false, shiftDefId: chgForm.shiftDefId ? Number(chgForm.shiftDefId) : null, zoneId: chgForm.zoneId ? Number(chgForm.zoneId) : null, reason: chgForm.reason.trim() })
      toast('Availability updated'); setChgOpen(false); setChgForm({ shiftDefId: '', zoneId: '', reason: '' }); load()
    } catch (e) { toast((e as Error).message) } finally { setChgBusy(false) }
  }
  const actLeave = async (lid: number, approve: boolean) => {
    setLeaveActBusy(lid)
    try { await reviewWorkerLeave(workerId, lid, approve); toast(approve ? 'Leave approved' : 'Leave rejected'); load() }
    catch (e) { toast((e as Error).message) } finally { setLeaveActBusy(null) }
  }

  // Calendar grid: pad the first week so day 1 lands under its weekday (Mon-first).
  const cal = d.calendar
  const firstDow = new Date(cal[0].date + 'T00:00:00Z').getUTCDay()
  const lead = (firstDow + 6) % 7
  const cells: (typeof cal[number] | null)[] = [...Array(lead).fill(null), ...cal]
  while (cells.length % 7) cells.push(null)
  const weeks: (typeof cal[number] | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  const istToday = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
  const insightIcon = (t: string) => t === 'good' ? <CheckCircle2 size={15} color="#16a34a" /> : t === 'warn' ? <AlertTriangle size={15} color="#d97706" /> : <Clock size={15} color="#5b51e8" />

  const th: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--line,#eef0f4)', whiteSpace: 'nowrap', fontWeight: 600, textAlign: 'left' }
  const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid var(--line-2,#f4f4fa)', fontSize: 12.5, whiteSpace: 'nowrap' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 14, alignItems: 'start' }}>
      {/* ---- main column ---- */}
      <div className="grid" style={{ gap: 14 }}>
        <Card>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 15 }}>Availability Overview</strong>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Schedule, working hours, leaves and attendance.</div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn line sm" onClick={() => setChgOpen(true)}><CalendarClock size={14} /> Change Availability</button>
              <button className="btn sm" onClick={() => setLeaveOpen(true)}><CalendarPlus size={14} /> Create Leave Request</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <OverviewCard icon={<CheckCircle2 size={15} />} label="Today's Status" value={d.today.status} sub={d.today.status === 'On Duty' ? `Till ${to12(d.today.shiftEnd)}` : undefined} tone={d.today.status === 'On Duty' ? '#0f8a4d' : d.today.status === 'On Leave' ? '#b45309' : '#be123c'} />
            <OverviewCard icon={<Clock size={15} />} label="Today's Shift" value={`${to12(d.today.shift.start)} – ${to12(d.today.shift.end)}`} sub={`${d.today.shift.hours} Hours`} />
            <OverviewCard icon={<CalendarClock size={15} />} label="Next Shift" value={d.today.nextShift ? shortDate(d.today.nextShift.date) : '—'} sub={d.today.nextShift ? `${to12(d.today.nextShift.start)} – ${to12(d.today.nextShift.end)}` : undefined} />
            <OverviewCard icon={<Coffee size={15} />} label="Weekly Off" value={d.weeklyOff.join(', ') || '—'} />
            <OverviewCard icon={<Timer size={15} />} label="Overtime This Week" value={`${d.overtimeWeek} Hours`} tone={d.overtimeWeek !== '00:00' ? '#b45309' : undefined} />
            <OverviewCard icon={<AlertTriangle size={15} />} label="Late Arrivals" value={d.lateArrivalsWeek} sub="This Week" tone={d.lateArrivalsWeek ? '#be123c' : undefined} />
          </div>
        </Card>

        <Card>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <strong style={{ fontSize: 13.5 }}>Availability Calendar</strong>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => setMonth(shiftMonth(d.month, -1))}><ChevronLeft size={16} /></button>
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 120, textAlign: 'center' }}>{monthLabel(d.month)}</span>
              <button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => setMonth(shiftMonth(d.month, 1))}><ChevronRight size={16} /></button>
              <button className="btn line sm" style={{ marginLeft: 4 }} onClick={() => setMonth('')}>Today</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 620 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dn) => <div key={dn} style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted,#98a2b3)', textAlign: 'left', padding: '2px 6px' }}>{dn}</div>)}
              </div>
              <div className="grid" style={{ gap: 4 }}>
                {weeks.map((wk, wi) => (
                  <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                    {wk.map((cell, ci) => {
                      if (!cell) return <div key={ci} style={{ minHeight: 58, borderRadius: 8, background: 'var(--bg,#fafafd)' }} />
                      const s = ST[cell.status] || ST.Off
                      const isToday = cell.date === istToday
                      const day = Number(cell.date.slice(8))
                      return (
                        <div key={ci} style={{ minHeight: 58, borderRadius: 8, background: s.bg, border: isToday ? '1.5px solid #5b51e8' : '1px solid transparent', padding: '5px 7px' }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink,#101828)' }}>{day}</div>
                          <div style={{ fontSize: 10.5, fontWeight: 600, color: s.c, lineHeight: 1.3 }}>{cell.status}</div>
                          {cell.status === 'On Duty' && cell.start && <div style={{ fontSize: 9.5, color: s.c }}>{to12(cell.start)} – {to12(cell.end)}</div>}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
            {LEGEND.map(([l, c]) => <span key={l} className="row" style={{ gap: 5, alignItems: 'center', fontSize: 11.5, color: 'var(--muted,#667085)' }}><span style={{ width: 9, height: 9, borderRadius: 9, background: c }} />{l}</span>)}
          </div>
        </Card>

        <Card title="Recent Availability Changes">
          {d.recentChanges.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
                <thead><tr style={{ color: 'var(--muted,#667085)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {['Date', 'Type', 'From', 'To', 'Reason', 'Updated By', 'Status'].map((h) => <th key={h} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>{d.recentChanges.map((c, i) => (
                  <tr key={i}>
                    <td style={td}>{new Date(c.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{c.type}</td>
                    <td style={td}>{c.from || '—'}</td>
                    <td style={td}>{c.to || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal' }}>{c.reason || '—'}</td>
                    <td style={td}>{c.updatedBy || '—'}</td>
                    <td style={td}><Badge tone={leaveTone(c.status)} dot={false}>{c.status}</Badge></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="muted" style={{ fontSize: 13, padding: '10px 0' }}>No availability changes recorded yet.</div>}
        </Card>
      </div>

      {/* ---- sidebar ---- */}
      <div className="grid" style={{ gap: 14 }}>
        <Card title="This Week Summary" right={<span className="muted" style={{ fontSize: 11 }}>{d.weekSummary.rangeLabel}</span>}>
          {([['Scheduled Hours', d.weekSummary.scheduledHours], ['Completed Hours', d.weekSummary.completedHours], ['Overtime', d.weekSummary.overtime], ['Late Arrivals', d.weekSummary.lateArrivals], ['Leave Days', d.weekSummary.leaveDays], ['Weekly Off', d.weekSummary.weeklyOff]] as [string, React.ReactNode][]).map(([l, v], i, arr) => (
            <div key={l} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--line-2,#f4f4fa)' : 'none' }}>
              <span style={{ fontSize: 12.5, color: 'var(--muted,#667085)' }}>{l}</span><strong style={{ fontSize: 14 }}>{v}</strong>
            </div>
          ))}
        </Card>

        <Card title="Upcoming Leaves">
          {d.upcomingLeaves.length ? d.upcomingLeaves.map((l) => (
            <div key={l.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line-2,#f4f4fa)' }}>
              <span style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{l.type} Leave</div>
                <div className="muted" style={{ fontSize: 11 }}>{shortDate(l.from)}{l.to && l.to !== l.from ? ` – ${shortDate(l.to)}` : ''}{l.reason ? ` · ${l.reason}` : ''}</div>
                {l.status === 'Pending' && (
                  <div className="row" style={{ gap: 6, marginTop: 5 }}>
                    <button className="btn line" style={{ padding: '3px 9px', fontSize: 11 }} disabled={leaveActBusy === l.id} onClick={() => actLeave(l.id, true)}>Approve</button>
                    <button className="btn line" style={{ padding: '3px 9px', fontSize: 11, color: '#dc2626' }} disabled={leaveActBusy === l.id} onClick={() => actLeave(l.id, false)}>Reject</button>
                  </div>
                )}
              </span>
              <Badge tone={leaveTone(l.status)} dot={false}>{l.status}</Badge>
            </div>
          )) : <div className="muted" style={{ fontSize: 12.5, padding: '6px 0' }}>No upcoming leaves.</div>}
        </Card>

        <Card title="Availability Insights">
          {d.insights.map((ins, i) => (
            <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-start', padding: '6px 0' }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>{insightIcon(ins.tone)}</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-2,#475467)' }}>{ins.text}</span>
            </div>
          ))}
        </Card>
      </div>

      {leaveOpen && (
        <Modal title="Create Leave Request" onClose={() => setLeaveOpen(false)} footer={<>
          <button className="btn line" onClick={() => setLeaveOpen(false)}>Cancel</button>
          <button className="btn" disabled={leaveBusy} onClick={submitLeave}>{leaveBusy ? 'Saving…' : 'Save'}</button>
        </>}>
          <div className="grid" style={{ gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 5 }}><span style={{ fontSize: 12.5, color: 'var(--muted,#667085)' }}>From</span><input type="date" value={leaveForm.fromDate} onChange={(e) => setLeaveForm({ ...leaveForm, fromDate: e.target.value })} /></label>
              <label style={{ display: 'grid', gap: 5 }}><span style={{ fontSize: 12.5, color: 'var(--muted,#667085)' }}>To</span><input type="date" value={leaveForm.toDate} onChange={(e) => setLeaveForm({ ...leaveForm, toDate: e.target.value })} /></label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 5 }}><span style={{ fontSize: 12.5, color: 'var(--muted,#667085)' }}>Type</span>
                <Dropdown value={leaveForm.leaveType} width="100%" options={['Personal', 'Medical', 'Casual', 'Emergency'].map((t) => ({ value: t, label: t }))} onChange={(v) => setLeaveForm({ ...leaveForm, leaveType: v })} /></label>
              <label style={{ display: 'grid', gap: 5 }}><span style={{ fontSize: 12.5, color: 'var(--muted,#667085)' }}>Status</span>
                <Dropdown value={leaveForm.status} width="100%" options={['Approved', 'Pending'].map((t) => ({ value: t, label: t }))} onChange={(v) => setLeaveForm({ ...leaveForm, status: v })} /></label>
            </div>
            <label style={{ display: 'grid', gap: 5 }}><span style={{ fontSize: 12.5, color: 'var(--muted,#667085)' }}>Reason <span className="muted">(optional)</span></span><input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="e.g. Personal work" /></label>
          </div>
        </Modal>
      )}

      {chgOpen && (
        <Modal title="Change Availability" onClose={() => setChgOpen(false)} footer={<>
          <button className="btn line" onClick={() => setChgOpen(false)}>Cancel</button>
          <button className="btn" disabled={chgBusy} onClick={submitChange}>{chgBusy ? 'Saving…' : 'Save'}</button>
        </>}>
          <div className="grid" style={{ gap: 12 }}>
            <label style={{ display: 'grid', gap: 5 }}><span style={{ fontSize: 12.5, color: 'var(--muted,#667085)' }}>Shift</span>
              <Dropdown value={chgForm.shiftDefId} width="100%" placeholder="Flexible (no fixed shift)"
                options={[{ value: '', label: 'Flexible (no fixed shift)' }, ...(avail?.shifts || []).map((s) => ({ value: String(s.id), label: `${s.name} · ${to12(s.start)}–${to12(s.end)}` }))]}
                onChange={(v) => setChgForm({ ...chgForm, shiftDefId: v })} /></label>
            <label style={{ display: 'grid', gap: 5 }}><span style={{ fontSize: 12.5, color: 'var(--muted,#667085)' }}>Zone <span className="muted">(optional)</span></span>
              <Dropdown value={chgForm.zoneId} width="100%" placeholder="Unchanged"
                options={[{ value: '', label: 'Unchanged' }, ...zones.map((z) => ({ value: String(z.id), label: z.name }))]}
                onChange={(v) => setChgForm({ ...chgForm, zoneId: v })} /></label>
            <label style={{ display: 'grid', gap: 5 }}><span style={{ fontSize: 12.5, color: 'var(--muted,#667085)' }}>Reason</span><input value={chgForm.reason} onChange={(e) => setChgForm({ ...chgForm, reason: e.target.value })} placeholder="Why is the shift changing?" autoFocus /></label>
          </div>
        </Modal>
      )}
    </div>
  )
}
