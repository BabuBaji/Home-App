import { useEffect, useState } from 'react'
import { CalendarClock, Check, PencilLine } from 'lucide-react'
import { fetchWorkerAvailability, reviewWorkerAvailability, fetchZones, type Zone } from '../api'
import type { WorkerAvailabilityState } from '../types'
import { Card, Badge, Loading, ErrorState, Modal, Field, Dropdown, useToast, shortDate } from '../components/UI'

/* Phase 11 — the worker's stated availability, and the admin's assignment.
 *
 * These are two different things and the panel keeps them visibly apart. What the worker asks for
 * lives in their profile; what governs their work is workers.shift_def_id / zone_id, which only an
 * admin writes. Approving adopts the request; modifying assigns something else and must say why.
 *
 * Of everything here only the hours cap binds on its own — dispatch stops offering work past it.
 * The rest informs this decision.
 */

// The worker app sends 'Mon'…'Sun'. This panel used to look up 'Monday'…'Sunday', so every day
// rendered "Off" no matter what the worker had actually set.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TONE: Record<string, string> = { Approved: 'green', Modified: 'amber', Pending: 'gray' }

export default function WorkerAvailability({ workerId }: { workerId: number }) {
  const toast = useToast()
  const [d, setD] = useState<WorkerAvailabilityState | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [err, setErr] = useState('')
  const [modOpen, setModOpen] = useState(false)
  const [draft, setDraft] = useState({ shiftDefId: '', zoneId: '', reason: '' })
  const [busy, setBusy] = useState(false)

  const load = () => {
    setErr('')
    fetchWorkerAvailability(workerId).then(setD).catch((e: Error) => setErr(e.message))
  }
  useEffect(load, [workerId])
  useEffect(() => { fetchZones().then(setZones).catch(() => {}) }, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  const a = d.availability
  const shiftName = (id: number | null) => d.shifts.find((s) => s.id === id)?.name || (id ? `#${id}` : 'None')
  const zoneName = (id: number | null) => zones.find((z) => z.id === id)?.name || (id ? `#${id}` : 'None')

  const approve = async () => {
    setBusy(true)
    try { await reviewWorkerAvailability(workerId, { approve: true }); toast('Approved as requested'); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const modify = async () => {
    if (!draft.reason.trim()) return
    setBusy(true)
    try {
      await reviewWorkerAvailability(workerId, {
        approve: false,
        shiftDefId: draft.shiftDefId ? Number(draft.shiftDefId) : null,
        zoneId: draft.zoneId ? Number(draft.zoneId) : null,
        reason: draft.reason.trim(),
      })
      toast('Assignment saved — the worker has been told'); setModOpen(false); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const differs = a.preferredShiftId !== d.assigned.shiftDefId

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <strong style={{ fontSize: 14 }}><CalendarClock size={15} style={{ verticalAlign: -2 }} /> Availability</strong>
            <div className="muted" style={{ fontSize: 12.5 }}>
              What the worker asked for, and what they're actually on. Only an admin sets the assignment.
            </div>
          </div>
          <Badge tone={TONE[a.status] || 'gray'}>{a.status}</Badge>
        </div>

        {a.status === 'Modified' && a.reason && (
          <div style={{ fontSize: 12.5, color: '#b45309', marginBottom: 10 }}>
            Changed by {a.reviewedBy}: {a.reason}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <strong style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--muted,#667085)' }}>Requested</strong>
            <div style={{ fontSize: 13, marginTop: 6 }}>Shift: {shiftName(a.preferredShiftId)}</div>
            <div style={{ fontSize: 13 }}>Area: {zoneName(a.preferredZoneId)}</div>
            <div style={{ fontSize: 13 }}>Hours: {a.shiftStart && a.shiftEnd ? `${a.shiftStart} – ${a.shiftEnd}` : 'Not set'}</div>
          </div>
          <div>
            <strong style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--muted,#667085)' }}>Assigned</strong>
            <div style={{ fontSize: 13, marginTop: 6, fontWeight: differs ? 600 : 400 }}>Shift: {shiftName(d.assigned.shiftDefId)}</div>
            <div style={{ fontSize: 13 }}>Zone: {zoneName(d.assigned.zoneId)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn" disabled={busy || a.preferredShiftId === null} onClick={approve}>
            <Check size={15} /> Approve as requested
          </button>
          <button className="btn line" disabled={busy} onClick={() => {
            setDraft({
              shiftDefId: d.assigned.shiftDefId ? String(d.assigned.shiftDefId) : '',
              zoneId: d.assigned.zoneId ? String(d.assigned.zoneId) : '',
              reason: '',
            })
            setModOpen(true)
          }}><PencilLine size={15} /> Assign something else…</button>
        </div>
        {a.preferredShiftId === null && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            The worker hasn't requested a shift — there's nothing to approve, but you can still assign one.
          </div>
        )}
      </Card>

      <Card>
        <strong style={{ fontSize: 14 }}>Working days</strong>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
          Their stated preference. It guides the roster; it does not stop them taking a job.
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          {DAYS.map((day) => {
            const on = a.availableDays?.[day] !== false && a.availableDays?.[day] !== undefined
            return (
              <div key={day} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>{day}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {on && a.shiftStart && <span className="muted" style={{ fontSize: 12 }}>{a.shiftStart} – {a.shiftEnd}</span>}
                  <Badge tone={on ? 'green' : 'gray'} dot={false}>{on ? 'Available' : 'Off'}</Badge>
                </span>
              </div>
            )
          })}
        </div>
        {a.weeklyOff.length > 0 && (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Weekly off: {a.weeklyOff.join(', ')}</div>
        )}
      </Card>

      <Card>
        <strong style={{ fontSize: 14 }}>Weekly hours limit</strong>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
          Set by the worker. This one does bite — past it, dispatch stops offering them jobs until they raise it.
        </div>
        {a.maxWeeklyHours
          ? (
            <div style={{ fontSize: 13 }}>
              <strong>{d.hoursThisWeek}h</strong> worked of their <strong>{a.maxWeeklyHours}h</strong> limit this week
              {d.hoursThisWeek >= a.maxWeeklyHours && <Badge tone="amber" dot={false}>At their limit — not being offered work</Badge>}
            </div>
          )
          : <div className="muted" style={{ fontSize: 13 }}>No limit set — {d.hoursThisWeek}h worked this week.</div>}
        {a.reviewedAt && <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Last reviewed {shortDate(a.reviewedAt)} by {a.reviewedBy}</div>}
      </Card>

      {modOpen && (
        <Modal title="Assign a shift and area" onClose={() => setModOpen(false)}
          footer={<>
            <button className="btn line" onClick={() => setModOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy || !draft.reason.trim()} onClick={modify}>Save assignment</button>
          </>}>
          <p style={{ fontSize: 13, marginTop: 0 }} className="muted">
            The worker asked for <strong>{shiftName(a.preferredShiftId)}</strong>
            {a.preferredZoneId ? <> in <strong>{zoneName(a.preferredZoneId)}</strong></> : null}.
            They'll be told what you assigned and why.
          </p>
          <Field label="Shift">
            <Dropdown value={draft.shiftDefId} width="100%" placeholder="No shift (flexible)"
              options={[{ value: '', label: 'No shift (flexible)' }, ...d.shifts.map((s) => ({ value: String(s.id), label: s.name }))]}
              onChange={(v) => setDraft({ ...draft, shiftDefId: v })} />
          </Field>
          <Field label="Zone">
            <Dropdown value={draft.zoneId} width="100%" placeholder="No zone"
              options={[{ value: '', label: 'No zone' }, ...zones.map((z) => ({ value: String(z.id), label: z.name }))]}
              onChange={(v) => setDraft({ ...draft, zoneId: v })} />
          </Field>
          <Field label="Why does this differ from what they asked for?">
            <textarea rows={3} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              placeholder="e.g. Morning is oversubscribed in this zone" />
          </Field>
        </Modal>
      )}
    </div>
  )
}
