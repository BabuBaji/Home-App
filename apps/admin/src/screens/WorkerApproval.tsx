import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, MinusCircle, Rocket, Package, Wallet, Undo2, ShieldQuestion as ShieldSearch } from 'lucide-react'
import {
  fetchChecklist, goLiveWorker, fetchWorkerPay, updateWorkerPay,
  fetchWorkerEquipment, issueEquipment, returnEquipment,
  fetchBackground, recordBackgroundCheck,
} from '../api'
import type { GoLiveChecklist, WorkerPay, WorkerEquipmentState, CheckState, BackgroundState, BackgroundItem, BgStatus } from '../types'
import { Card, Badge, Loading, ErrorState, Modal, Field, Dropdown, useToast, useConfirm, shortDate } from '../components/UI'

/* Phase 12 — final approval, plus the Phase 9/10 setup it depends on.
 *
 * Every checklist item is computed from real state, so nothing here is a tick an admin can set
 * directly. Three states, not two: 'na' means there is nothing to satisfy (no training published,
 * no equipment required, no email provider) and never blocks — requiring someone to pass an exam
 * that doesn't exist would wedge Go Live shut for a reason nobody chose.
 */

const BG_OUTCOME_LABEL: Record<string, string> = {
  clear: 'Clear', flagged: 'Flagged', unreachable: 'Could not reach them', not_applicable: 'Not applicable (no previous employer)',
}

const ICON: Record<CheckState, JSX.Element> = {
  ok: <CheckCircle2 size={17} color="#16a34a" />,
  no: <XCircle size={17} color="#dc2626" />,
  na: <MinusCircle size={17} color="#94a3b8" />,
}

export default function WorkerApproval({ workerId, onChanged }: { workerId: number; onChanged?: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [c, setC] = useState<GoLiveChecklist | null>(null)
  const [pay, setPay] = useState<WorkerPay | null>(null)
  const [eq, setEq] = useState<WorkerEquipmentState | null>(null)
  const [bg, setBg] = useState<BackgroundState | null>(null)
  const [bgFor, setBgFor] = useState<BackgroundItem | null>(null)
  const [bgDraft, setBgDraft] = useState({ status: '', reference: '', notes: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueDraft, setIssueDraft] = useState({ typeId: '', serial: '', notes: '' })
  const [commission, setCommission] = useState('')

  const load = () => {
    setErr('')
    Promise.all([fetchChecklist(workerId), fetchWorkerPay(workerId), fetchWorkerEquipment(workerId), fetchBackground(workerId)])
      .then(([a, b, d, g]) => {
        setC(a); setPay(b); setEq(d); setBg(g)
        setCommission(b.commissionPercent === null ? '' : String(b.commissionPercent))
      })
      .catch((e: Error) => setErr(e.message))
  }
  useEffect(load, [workerId])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!c || !pay || !eq) return <Loading />

  const outstanding = c.items.filter((i) => i.state === 'no')

  const doGoLive = async (why?: string) => {
    setBusy(true)
    try {
      await goLiveWorker(workerId, why)
      toast(`${c.worker.name} is live`)
      setOverrideOpen(false); setReason(''); load(); onChanged?.()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const savePay = async (body: { commissionPercent?: number | null; walletEnabled?: boolean }) => {
    try { const p = await updateWorkerPay(workerId, body); setPay(p); setCommission(p.commissionPercent === null ? '' : String(p.commissionPercent)); load(); toast('Saved') }
    catch (e) { toast((e as Error).message, 'err') }
  }

  const saveCommission = () => {
    const raw = commission.trim()
    if (raw === '') return savePay({ commissionPercent: null })
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 0 || n > 100) { toast('Commission must be a whole number between 0 and 100', 'err'); return }
    savePay({ commissionPercent: n })
  }

  const doIssue = async () => {
    if (!issueDraft.typeId) return
    try {
      await issueEquipment(workerId, { typeId: Number(issueDraft.typeId), serial: issueDraft.serial, notes: issueDraft.notes })
      toast('Issued'); setIssueOpen(false); setIssueDraft({ typeId: '', serial: '', notes: '' }); load()
    } catch (e) { toast((e as Error).message, 'err') }
  }

  const doReturn = async (eid: number, name: string) => {
    if (!(await confirm({ title: `Mark ${name} returned?`, message: 'It stays on the record as returned rather than disappearing.', confirmLabel: 'Mark returned' }))) return
    try { await returnEquipment(workerId, eid); toast('Marked returned'); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  const saveBg = async () => {
    if (!bgFor || !bgDraft.status) return
    try {
      await recordBackgroundCheck(workerId, bgFor.key, {
        status: bgDraft.status as BgStatus, reference: bgDraft.reference, notes: bgDraft.notes,
      })
      toast('Recorded'); setBgFor(null); load()
    } catch (e) { toast((e as Error).message, 'err') }
  }

  const held = eq.issued.filter((e) => e.status === 'issued')
  const issuable = eq.types.filter((t) => !held.some((h) => h.typeId === t.id))

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <strong style={{ fontSize: 15 }}>Final approval</strong>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {c.live
                ? 'This worker is live and can be assigned jobs.'
                : outstanding.length === 0
                  ? 'Everything checks out — this worker is ready to go live.'
                  : `${outstanding.length} check${outstanding.length === 1 ? '' : 's'} outstanding.`}
            </div>
          </div>
          {c.live
            ? <Badge tone="green">Live</Badge>
            : outstanding.length === 0
              ? <button className="btn" disabled={busy} onClick={() => doGoLive()}><Rocket size={16} /> Go Live</button>
              : <button className="btn line" disabled={busy} onClick={() => setOverrideOpen(true)}><Rocket size={16} /> Go Live anyway…</button>}
        </div>

        <div style={{ display: 'grid', gap: 2 }}>
          {c.items.map((i) => (
            <div key={i.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0', borderTop: '1px solid var(--line,#eef0f4)' }}>
              <span style={{ marginTop: 1 }}>{ICON[i.state]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: i.state === 'no' ? 600 : 500, color: i.state === 'na' ? '#94a3b8' : 'inherit' }}>{i.label}</div>
                {i.detail && <div className="muted" style={{ fontSize: 12 }}>{i.detail}</div>}
              </div>
              {i.state === 'na' && <span className="muted" style={{ fontSize: 11 }}>Not enforced</span>}
            </div>
          ))}
        </div>

        {c.history.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line,#eef0f4)' }}>
            <strong style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--muted,#667085)' }}>Approval history</strong>
            {c.history.map((h) => (
              <div key={h.id} style={{ fontSize: 12.5, marginTop: 6 }}>
                <span style={{ fontWeight: 600 }}>{h.admin}</span> · {shortDate(h.created)}
                {h.overridden.length > 0
                  ? <div style={{ color: '#b45309' }}>Overrode {h.overridden.length} check{h.overridden.length === 1 ? '' : 's'}: {h.reason}</div>
                  : <div className="muted">Approved with every check satisfied</div>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div>
            <strong style={{ fontSize: 14 }}><ShieldSearch size={15} style={{ verticalAlign: -2 }} /> Background verification</strong>
            <div className="muted" style={{ fontSize: 12.5 }}>
              The first five follow the Documents tab — verify a document there and it lands here.
              The last two are checks someone performs and records.
            </div>
          </div>
          {/* A count, not a verdict. Go Live gates on the two recorded checks here; the five
              document points have their own lines on the checklist above, so a bare "Incomplete"
              badge beside a green "Background Verified" would read as a contradiction. */}
          {bg && <Badge tone={bg.verified ? 'green' : 'gray'} dot={false}>{bg.items.filter((i) => i.ok).length} of {bg.items.length} clear</Badge>}
        </div>
        {!bg ? <div className="muted" style={{ fontSize: 13 }}>Loading…</div> : (
          <div style={{ display: 'grid', gap: 2 }}>
            {bg.items.map((i) => (
              <div key={i.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0', borderTop: '1px solid var(--line,#eef0f4)' }}>
                <span style={{ marginTop: 1 }}>{i.ok ? ICON.ok : i.status === 'flagged' ? ICON.no : ICON.na}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                    {i.label}
                    {i.source === 'document' && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>from document</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12, color: i.status === 'flagged' ? '#b91c1c' : undefined }}>{i.detail}</div>
                  {i.notes && i.source === 'check' && <div className="muted" style={{ fontSize: 12 }}>{i.notes}</div>}
                  {i.reference && <div className="muted" style={{ fontSize: 11.5 }}>Ref {i.reference}</div>}
                  {/* The worker's own claim — who to call, not proof of anything. */}
                  {i.claim && <div className="muted" style={{ fontSize: 11.5 }}>Worker states: {i.claim}</div>}
                </div>
                {i.source === 'check'
                  ? <button className="btn line" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => { setBgFor(i); setBgDraft({ status: i.status === 'pending' ? '' : i.status, reference: i.reference || '', notes: i.notes || '' }) }}>
                      {i.status === 'pending' ? 'Record' : 'Update'}
                    </button>
                  : <span className="muted" style={{ fontSize: 11 }}>Documents tab</span>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <strong style={{ fontSize: 14 }}><Wallet size={15} style={{ verticalAlign: -2 }} /> Pay</strong>
            <div className="muted" style={{ fontSize: 12.5 }}>
              This is read when a job is settled — changing it changes what the worker is actually paid.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label={`Commission % (blank = platform default, ${pay.platformCommissionPercent}%)`}>
            <input value={commission} onChange={(e) => setCommission(e.target.value)} placeholder={String(pay.platformCommissionPercent)} style={{ width: 120 }} />
          </Field>
          <button className="btn line" onClick={saveCommission}>Save</button>
          <div style={{ fontSize: 12.5, paddingBottom: 8 }}>
            The worker keeps <strong>{100 - pay.effectiveCommissionPercent}%</strong> of each job
            {pay.commissionPercent === null && <span className="muted"> (inherited)</span>}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={pay.walletEnabled} onChange={(e) => savePay({ walletEnabled: e.target.checked })} />
          <span style={{ fontSize: 13 }}>
            Wallet enabled — <span className="muted">when off, withdrawals are blocked. Earnings still accrue; it holds money in, it doesn't take it away.</span>
          </span>
        </label>
      </Card>

      <Card>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}><Package size={15} style={{ verticalAlign: -2 }} /> Equipment</strong>
          <button className="btn line" disabled={!issuable.length} onClick={() => setIssueOpen(true)}>Issue item</button>
        </div>
        {eq.issued.length === 0
          ? <div className="muted" style={{ fontSize: 13 }}>Nothing issued yet.</div>
          : (
            <table className="table">
              <thead><tr><th>Item</th><th>Serial</th><th>Issued</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {eq.issued.map((e) => (
                  <tr key={e.id}>
                    <td><strong>{e.name}</strong>{e.notes && <div className="muted" style={{ fontSize: 11.5 }}>{e.notes}</div>}</td>
                    <td>{e.serial || '—'}</td>
                    <td>{shortDate(e.issuedAt)}<div className="muted" style={{ fontSize: 11.5 }}>by {e.issuedBy}</div></td>
                    <td><Badge tone={e.status === 'issued' ? 'green' : 'gray'}>{e.status === 'issued' ? 'Issued' : 'Returned'}</Badge></td>
                    <td style={{ textAlign: 'right' }}>
                      {e.status === 'issued' && <button className="iconbtn" title="Mark returned" onClick={() => doReturn(e.id, e.name)}><Undo2 size={16} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      {overrideOpen && (
        <Modal title="Go live with checks outstanding" onClose={() => setOverrideOpen(false)}
          footer={<>
            <button className="btn line" onClick={() => setOverrideOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy || !reason.trim()} onClick={() => doGoLive(reason.trim())}>
              {busy ? 'Working…' : 'Override and go live'}
            </button>
          </>}>
          <p style={{ fontSize: 13.5, marginTop: 0 }}>
            These checks are not satisfied. Going live anyway is recorded against your name.
          </p>
          <ul style={{ fontSize: 13, paddingLeft: 18 }}>
            {outstanding.map((i) => <li key={i.key}><strong>{i.label}</strong>{i.detail ? ` — ${i.detail}` : ''}</li>)}
          </ul>
          <Field label="Why is this being overridden?">
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Police verification delayed at the station; regional manager approved a provisional start" />
          </Field>
        </Modal>
      )}

      {bgFor && (
        <Modal title={`${bgFor.label} — record the outcome`} onClose={() => setBgFor(null)}
          footer={<>
            <button className="btn line" onClick={() => setBgFor(null)}>Cancel</button>
            <button className="btn" disabled={!bgDraft.status} onClick={saveBg}>Save</button>
          </>}>
          {bgFor.claim && (
            <p style={{ fontSize: 13, marginTop: 0 }} className="muted">
              The worker states their previous employer was <strong>{bgFor.claim}</strong>. That's their
              claim — this record is whether anyone confirmed it.
            </p>
          )}
          <Field label="Outcome">
            <Dropdown value={bgDraft.status} width="100%" placeholder="Select an outcome"
              options={(bgFor.outcomes || []).map((o) => ({ value: o, label: BG_OUTCOME_LABEL[o] || o }))}
              onChange={(v) => setBgDraft({ ...bgDraft, status: v })} />
          </Field>
          <Field label="Reference / case number (optional)">
            <input value={bgDraft.reference} onChange={(e) => setBgDraft({ ...bgDraft, reference: e.target.value })} placeholder="e.g. PCC-2026-88213" />
          </Field>
          <Field label={bgDraft.status === 'flagged' ? 'What was found? (required to flag)' : 'Notes'}>
            <textarea rows={3} value={bgDraft.notes} onChange={(e) => setBgDraft({ ...bgDraft, notes: e.target.value })}
              placeholder={bgDraft.status === 'flagged' ? 'An unexplained flag is unactionable — whoever decides whether to override it needs to know why.' : 'Who you spoke to, what they said…'} />
          </Field>
          {bgDraft.status === 'flagged' && (
            <p style={{ fontSize: 12.5, color: '#b45309' }}>
              A flag blocks Go Live. It can still be overridden with a reason — a flag isn't automatically disqualifying.
            </p>
          )}
          {bgDraft.status === 'unreachable' && (
            <p style={{ fontSize: 12.5, color: '#b45309' }}>
              This does not satisfy the check: if nobody answered, the check didn't happen. Go Live will need an override.
            </p>
          )}
        </Modal>
      )}

      {issueOpen && (
        <Modal title="Issue equipment" onClose={() => setIssueOpen(false)}
          footer={<>
            <button className="btn line" onClick={() => setIssueOpen(false)}>Cancel</button>
            <button className="btn" disabled={!issueDraft.typeId} onClick={doIssue}>Issue</button>
          </>}>
          <Field label="Item">
            <Dropdown value={issueDraft.typeId} width="100%" placeholder="Select an item"
              options={issuable.map((t) => ({ value: String(t.id), label: t.required ? `${t.name} (required)` : t.name }))}
              onChange={(v) => setIssueDraft({ ...issueDraft, typeId: v })} />
          </Field>
          <Field label="Serial / asset number (optional)">
            <input value={issueDraft.serial} onChange={(e) => setIssueDraft({ ...issueDraft, serial: e.target.value })} />
          </Field>
          <Field label="Notes (optional)">
            <input value={issueDraft.notes} onChange={(e) => setIssueDraft({ ...issueDraft, notes: e.target.value })} placeholder="e.g. Size M" />
          </Field>
        </Modal>
      )}
    </div>
  )
}
