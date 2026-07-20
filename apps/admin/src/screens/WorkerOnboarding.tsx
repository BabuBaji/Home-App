import { useEffect, useState } from 'react'
import { Check, Circle, MinusCircle, ChevronRight, Send, Rocket } from 'lucide-react'
import { fetchChecklist, inviteWorker } from '../api'
import type { GoLiveChecklist, WorkerDetail } from '../types'
import { Card, Badge, Loading, ErrorState, useToast, shortDate } from '../components/UI'

/* The admin's 10-step onboarding wizard.
 *
 * A guide, not a gate. Every step's state is read from the Phase 12 checklist — the same source
 * the Go Live decision uses — so this can't tell a happier story than the approval screen does.
 * Steps deep-link to the tab that does the work rather than duplicating it: a second place to
 * verify a document is a second thing to keep in sync.
 *
 * Several steps are the WORKER's to complete. They're marked as such, because an admin staring at
 * an incomplete step they cannot action is how people conclude the tool is broken.
 */

type Owner = 'admin' | 'worker'
type Step = {
  n: number
  label: string
  owner: Owner
  /** Checklist keys this step covers. Empty = not represented on the checklist (e.g. Invite). */
  keys: string[]
  tab?: string
  hint: string
}

const STEPS: Step[] = [
  { n: 1, label: 'Basic Worker Information', owner: 'admin', keys: [], hint: 'Name, phone, category — set when the worker was created' },
  { n: 2, label: 'Verification & Invitation', owner: 'admin', keys: ['mobile_verified'], hint: 'Invite them; they verify their number by signing in' },
  { n: 3, label: 'Document & Background Verification', owner: 'admin', keys: ['aadhaar_verified', 'pan_verified', 'police_verified', 'medical_verified', 'background_verified'], tab: 'docs', hint: 'Review each document; record the employer and criminal checks' },
  { n: 4, label: 'Skill Approval', owner: 'admin', keys: ['skills_approved'], tab: 'skills', hint: 'Approve what they claimed — this is what dispatch matches on' },
  { n: 5, label: 'Zone & Service Assignment', owner: 'admin', keys: ['zone_assigned'], tab: 'avail', hint: 'Without a zone, dispatch cannot place them' },
  { n: 6, label: 'Shift & Availability', owner: 'admin', keys: ['shift_assigned'], tab: 'avail', hint: 'Approve the shift they asked for, or assign another' },
  { n: 7, label: 'Equipment Allocation', owner: 'admin', keys: ['equipment_issued'], tab: 'approval', hint: 'Issue whatever you have marked as required' },
  // bank_verified lives here rather than under "waiting on the worker": the worker enters their
  // details, but VERIFYING them is the admin's (or the penny-drop API's) job, and every blocking
  // check needs somewhere in this list that an admin can act on.
  { n: 8, label: 'Salary, Wallet & Bank', owner: 'admin', keys: ['salary_configured', 'wallet_enabled', 'bank_verified'], tab: 'approval', hint: 'Their commission and where they get paid' },
  { n: 9, label: 'Review Checklist', owner: 'admin', keys: [], tab: 'approval', hint: 'Everything outstanding, in one place' },
  { n: 10, label: 'Go Live', owner: 'admin', keys: [], tab: 'approval', hint: 'Make them dispatchable' },
]

// Genuinely the worker's to do, in their app. Bank Verified is deliberately NOT here — entering
// bank details is theirs, but verifying them is not, and an admin shouldn't be told to wait on it.
const WORKER_STEPS = ['Training Completed', 'Assessment Passed']

export default function WorkerOnboarding({ w, onTab, onChanged }: { w: WorkerDetail; onTab: (t: string) => void; onChanged?: () => void }) {
  const toast = useToast()
  const [c, setC] = useState<GoLiveChecklist | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => { setErr(''); fetchChecklist(w.id).then(setC).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [w.id])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!c) return <Loading />

  const byKey = Object.fromEntries(c.items.map((i) => [i.key, i]))

  /** A step is done when every checklist item it covers is satisfied or not enforced. */
  const stateOf = (s: Step): 'ok' | 'no' | 'na' | 'info' => {
    if (s.n === 1) return 'ok' // the worker exists, so this happened
    if (s.n === 2 && w.status === 'pending') return 'no'
    if (s.n === 9) return c.ready ? 'ok' : 'no'
    if (s.n === 10) return c.live ? 'ok' : 'no'
    if (!s.keys.length) return 'info'
    const states = s.keys.map((k) => byKey[k]?.state).filter(Boolean)
    if (!states.length) return 'info'
    if (states.every((x) => x === 'na')) return 'na'
    return states.every((x) => x === 'ok' || x === 'na') ? 'ok' : 'no'
  }

  const detailOf = (s: Step) => {
    const bad = s.keys.map((k) => byKey[k]).filter((i) => i && i.state === 'no')
    if (bad.length) return bad.map((i) => i.detail || i.label).join(' · ')
    return s.hint
  }

  const invite = async () => {
    setBusy(true)
    try { const r = await inviteWorker(w.id); toast(`Invite sent — ${r.delivery}`); load(); onChanged?.() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const nextStep = STEPS.find((s) => stateOf(s) === 'no')

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: 15 }}>Onboarding</strong>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {c.live
                ? `${w.name} is live.`
                : nextStep
                  ? <>Next: <strong>{nextStep.label}</strong></>
                  : 'Everything is done — go live on step 10.'}
            </div>
          </div>
          {/* The worker saying they've finished their part. Not an approval — just a signal that
              there's something worth looking at. */}
          {c.submittedAt
            ? <Badge tone="green"><Send size={11} style={{ verticalAlign: -1 }} /> Worker submitted {shortDate(c.submittedAt)}</Badge>
            : <Badge tone="gray" dot={false}>Worker hasn't submitted yet</Badge>}
        </div>
      </Card>

      <Card>
        <div style={{ display: 'grid', gap: 2 }}>
          {STEPS.map((s) => {
            const st = stateOf(s)
            const clickable = !!s.tab || (s.n === 2 && w.status === 'pending')
            return (
              <div key={s.n}
                onClick={() => { if (s.n === 2 && w.status === 'pending') return; if (s.tab) onTab(s.tab) }}
                style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0',
                  borderTop: '1px solid var(--line,#eef0f4)', cursor: clickable && s.tab ? 'pointer' : 'default',
                }}>
                <span style={{
                  width: 26, height: 26, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center',
                  background: st === 'ok' ? '#dcfce7' : st === 'na' ? '#f1f5f9' : '#eef2ff',
                  color: st === 'ok' ? '#16a34a' : st === 'na' ? '#94a3b8' : '#4f46e5',
                  fontSize: 12, fontWeight: 700,
                }}>
                  {st === 'ok' ? <Check size={14} /> : st === 'na' ? <MinusCircle size={14} /> : s.n}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: st === 'no' ? 600 : 500 }}>
                    {s.label}
                    {st === 'na' && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>not enforced</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{detailOf(s)}</div>
                  {s.n === 2 && w.status === 'pending' && (
                    <button className="btn" style={{ marginTop: 6, padding: '3px 10px', fontSize: 12 }} disabled={busy} onClick={(e) => { e.stopPropagation(); invite() }}>
                      Send invite
                    </button>
                  )}
                  {s.n === 10 && !c.live && (
                    <button className="btn line" style={{ marginTop: 6, padding: '3px 10px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); onTab('approval') }}>
                      <Rocket size={13} /> Go to approval
                    </button>
                  )}
                </div>
                {s.tab && <ChevronRight size={16} color="#cbd5e1" style={{ marginTop: 4 }} />}
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <strong style={{ fontSize: 13 }}>Waiting on the worker</strong>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
          These are theirs to do in the app — you can't action them here.
        </div>
        <div style={{ display: 'grid', gap: 2 }}>
          {WORKER_STEPS.map((label) => {
            const i = c.items.find((x) => x.label === label)
            if (!i) return null
            return (
              <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}>
                {i.state === 'ok' ? <Check size={15} color="#16a34a" /> : i.state === 'na' ? <MinusCircle size={15} color="#94a3b8" /> : <Circle size={15} color="#cbd5e1" />}
                <span style={{ fontSize: 13, flex: 1 }}>{label}</span>
                <span className="muted" style={{ fontSize: 11.5 }}>{i.detail}</span>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
