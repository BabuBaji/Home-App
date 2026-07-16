import { useEffect, useState } from 'react'
import { Gift, Users, Plus, Pencil, Trash2, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { fetchIncentivePlans, createIncentivePlan, updateIncentivePlan, deleteIncentivePlan } from '../api'
import type { IncentivePlan, AttendanceTier } from '../types'
import { StatCard, Card, Badge, Loading, ErrorState, Modal, Field, useToast, useConfirm } from '../components/UI'

/* Incentive plans — each component a rule the admin sets. None is a named policy that does nothing:
 * per-job fires on the booking that credits earnings; the attendance tiers (Sitara/Shakti, folded
 * in) and quality bonus are computed by the payroll run from real attendance and real ratings.
 *
 * Referral, Peak Hour and Festival bonuses are recorded but paid manually — no automatic trigger
 * exists for them.
 */

// Days each tier needs. Ordered ascending; the worker earns the highest they reach.
type TierRow = { label: string; days: string; sundays: string; amount: string }
const SHAKTI_DEFAULTS: TierRow[] = [
  { label: 'Bronze', days: '25', sundays: '0', amount: '3500' },
  { label: 'Silver', days: '27', sundays: '0', amount: '4500' },
  { label: 'Gold', days: '28', sundays: '4', amount: '5500' },
]
const inp: React.CSSProperties = { width: '100%', border: '1px solid var(--line,#e5e7eb)', borderRadius: 8, padding: '7px 9px', fontSize: 13 }

type Draft = {
  name: string; perJobAmount: string
  qualityBonusAmount: string; qualityMinRating: string
  tiers: TierRow[]; tierMinRating: string
  peakHourAmount: string; referralAmount: string; festivalAmount: string
  estIncentiveMin: string; estIncentiveMax: string; notes: string
}
const EMPTY: Draft = {
  name: '', perJobAmount: '', qualityBonusAmount: '', qualityMinRating: '4.5',
  tiers: [], tierMinRating: '4.5',
  peakHourAmount: '', referralAmount: '', festivalAmount: '', estIncentiveMin: '', estIncentiveMax: '', notes: '',
}

export default function IncentivePlans() {
  const toast = useToast()
  const confirm = useConfirm()
  const [plans, setPlans] = useState<IncentivePlan[] | null>(null)
  const [err, setErr] = useState('')
  const [modal, setModal] = useState<null | 'add' | 'edit'>(null)
  const [editing, setEditing] = useState<IncentivePlan | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = () => { setErr(''); fetchIncentivePlans().then((r) => setPlans(r.plans)).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!plans) return <Loading />

  const active = plans.filter((p) => p.active)
  const assigned = plans.reduce((n, p) => n + (p.workers || 0), 0)

  const num = (v: string) => (v === '' ? 0 : Number(v))
  const save = async () => {
    if (!draft.name.trim()) { toast('Name required', 'err'); return }
    // Only rows the admin actually filled in (a name and an amount) become tiers.
    const tiers: AttendanceTier[] = draft.tiers
      .filter((t) => t.label.trim() && Number(t.amount) > 0)
      .map((t) => ({ label: t.label.trim(), days: num(t.days), sundays: num(t.sundays), amount: num(t.amount) }))
    const body = {
      name: draft.name.trim(),
      perJobAmount: num(draft.perJobAmount),
      qualityBonusAmount: num(draft.qualityBonusAmount),
      qualityMinRating: num(draft.qualityMinRating),
      attendanceTiers: tiers,
      tierMinRating: num(draft.tierMinRating),
      peakHourAmount: num(draft.peakHourAmount),
      referralAmount: num(draft.referralAmount),
      festivalAmount: num(draft.festivalAmount),
      estIncentiveMin: num(draft.estIncentiveMin),
      estIncentiveMax: num(draft.estIncentiveMax),
      notes: draft.notes,
    }
    setSaving(true)
    try {
      if (modal === 'edit' && editing) await updateIncentivePlan(editing.id, body)
      else await createIncentivePlan(body)
      toast('Saved'); setModal(null); setEditing(null); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setSaving(false) }
  }

  const remove = async (p: IncentivePlan) => {
    if (!(await confirm({ title: `Delete "${p.name}"?`, message: 'Plans with workers on them cannot be deleted — retire them instead.', confirmLabel: 'Delete', danger: true }))) return
    try { await deleteIncentivePlan(p.id); toast('Plan deleted'); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  const open = (p?: IncentivePlan) => {
    if (p) {
      setEditing(p)
      const str = (n: number) => (n ? String(n) : '')
      setDraft({
        name: p.name, perJobAmount: str(p.perJobAmount),
        qualityBonusAmount: str(p.qualityBonusAmount), qualityMinRating: String(p.qualityMinRating),
        tiers: (p.attendanceTiers || []).map((t) => ({ label: t.label, days: String(t.days), sundays: String(t.sundays), amount: String(t.amount) })),
        tierMinRating: String(p.tierMinRating ?? 4.5),
        peakHourAmount: str(p.peakHourAmount), referralAmount: str(p.referralAmount), festivalAmount: str(p.festivalAmount),
        estIncentiveMin: str(p.estIncentiveMin), estIncentiveMax: str(p.estIncentiveMax), notes: p.notes,
      }); setModal('edit')
    }
    else { setEditing(null); setDraft(EMPTY); setModal('add') }
  }

  return (
    <>
      <div className="stat-row">
        <StatCard icon={<Gift size={18} />} tint="#eef0ff" label="Plans" value={active.length} sub={`${plans.length - active.length} retired`} />
        <StatCard icon={<Users size={18} />} tint="#e7f7ee" label="Workers on a plan" value={assigned} sub="Earning incentives" />
      </div>

      {plans.length === 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 14, borderLeft: '3px solid #6366f1' }}>
          <strong>No incentive plans yet.</strong> Each component is a rule you set — a per-job amount, an
          attendance bonus above a threshold, a quality bonus above a rating. A plan with nothing switched on is refused.
        </div>
      )}

      <Card title="Incentive plans" right={<button className="btn" onClick={() => open()}><Plus size={16} /> Add plan</button>}>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Plan</th><th>Components</th><th>Workers</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong>{p.notes && <div className="muted" style={{ fontSize: 11.5 }}>{p.notes}</div>}</td>
                  <td>
                    <div style={{ display: 'grid', gap: 2 }}>
                      {p.components.length === 0 ? <span className="muted">None</span> : p.components.map((c) => (
                        <span key={c.key} style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <CheckCircle2 size={13} color="#16a34a" /> {c.detail}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{p.workers || 0}</td>
                  <td><Badge tone={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Retired'}</Badge></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="iconbtn" title="Edit" onClick={() => open(p)}><Pencil size={16} /></button>
                    <button className="iconbtn" title={p.active ? 'Retire' : 'Reactivate'} onClick={async () => {
                      try { await updateIncentivePlan(p.id, { active: !p.active }); load() } catch (e) { toast((e as Error).message, 'err') }
                    }}>{p.active ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                    <button className="iconbtn" title="Delete" onClick={() => remove(p)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="card" style={{ padding: 14, marginTop: 14 }}>
        <strong style={{ fontSize: 13 }}>Not offered</strong>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
          Referral, Peak Hour and Festival bonuses each need a trigger that doesn't exist yet
          (a referral graph, peak-hour windows, a festival calendar). Rather than a dropdown naming a
          bonus that never pays, they'll appear here once the mechanism behind them does.
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add incentive plan' : `Edit — ${editing?.name}`} wide onClose={() => { setModal(null); setEditing(null) }}
          footer={<>
            <button className="btn line" onClick={() => { setModal(null); setEditing(null) }}>Cancel</button>
            <button className="btn" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </>}>
          <Field label="Plan name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Standard Incentive Plan" /></Field>
          <p style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 10px' }}>Set an amount to switch a component on. Leave it at 0 to leave it off.</p>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ padding: 10, borderRadius: 10, border: '1px solid var(--line,#e5e7eb)' }}>
              <strong style={{ fontSize: 13 }}>Per Job Incentive</strong>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>A flat amount added to every completed job.</div>
              <Field label="₹ per job"><input value={draft.perJobAmount} onChange={(e) => setDraft({ ...draft, perJobAmount: e.target.value.replace(/\D/g, '').slice(0, 5) })} placeholder="0" /></Field>
            </div>
            <div style={{ padding: 10, borderRadius: 10, border: '1px solid var(--line,#e5e7eb)' }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 13 }}>Attendance Bonus (Sitara tiers)</strong>
                <div style={{ display: 'flex', gap: 6 }}>
                  {draft.tiers.length === 0 && (
                    <button className="btn line" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setDraft({ ...draft, tiers: SHAKTI_DEFAULTS.map((t) => ({ ...t })) })}>Use Bronze/Silver/Gold</button>
                  )}
                  <button className="btn line" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setDraft({ ...draft, tiers: [...draft.tiers, { label: '', days: '', sundays: '0', amount: '' }] })}>+ Tier</button>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 11.5, margin: '4px 0 8px' }}>
                Paid monthly by payroll — the worker earns the highest tier they reach that month by working days.
                Higher tiers can also require Sundays.
              </div>
              {draft.tiers.length === 0
                ? <div className="muted" style={{ fontSize: 12 }}>No tiers. Add one, or start from the Bronze/Silver/Gold defaults.</div>
                : (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.2fr 28px', gap: 8, fontSize: 11, color: 'var(--muted,#667085)' }}>
                      <span>Tier name</span><span>Working days</span><span>Sundays</span><span>₹ / month</span><span></span>
                    </div>
                    {draft.tiers.map((t, i) => {
                      const upd = (patch: Partial<TierRow>) => { const rows = [...draft.tiers]; rows[i] = { ...rows[i], ...patch }; setDraft({ ...draft, tiers: rows }) }
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.2fr 28px', gap: 8, alignItems: 'center' }}>
                          <input value={t.label} onChange={(e) => upd({ label: e.target.value })} placeholder="Bronze" style={inp} />
                          <input value={t.days} onChange={(e) => upd({ days: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="25" style={inp} />
                          <input value={t.sundays} onChange={(e) => upd({ sundays: e.target.value.replace(/\D/g, '').slice(0, 1) })} placeholder="0" style={inp} />
                          <input value={t.amount} onChange={(e) => upd({ amount: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="3500" style={inp} />
                          <button className="iconbtn" title="Remove tier" onClick={() => setDraft({ ...draft, tiers: draft.tiers.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
                        </div>
                      )
                    })}
                    <Field label="Minimum rating for any tier (1–5)">
                      <input value={draft.tierMinRating} onChange={(e) => setDraft({ ...draft, tierMinRating: e.target.value.replace(/[^\d.]/g, '').slice(0, 3) })} placeholder="4.5" style={{ maxWidth: 100 }} />
                    </Field>
                  </div>
                )}
            </div>
            <div style={{ padding: 10, borderRadius: 10, border: '1px solid var(--line,#e5e7eb)' }}>
              <strong style={{ fontSize: 13 }}>Quality Bonus</strong>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Paid monthly by payroll if the worker's rating meets the threshold.</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Field label="₹ / month"><input value={draft.qualityBonusAmount} onChange={(e) => setDraft({ ...draft, qualityBonusAmount: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="0" /></Field>
                <Field label="Minimum rating (1–5)"><input value={draft.qualityMinRating} onChange={(e) => setDraft({ ...draft, qualityMinRating: e.target.value.replace(/[^\d.]/g, '').slice(0, 3) })} placeholder="4.5" /></Field>
              </div>
            </div>

            {/* Paid manually — no automated trigger exists (peak-hour windows, a referral graph, a
                festival calendar). The plan records the amount; the admin pays it with Add Bonus. */}
            <div style={{ padding: 10, borderRadius: 10, border: '1px dashed var(--line,#cbd5e1)', background: '#fafbfc' }}>
              <strong style={{ fontSize: 13 }}>Paid manually <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>— recorded on the plan; you pay these with Add Bonus</span></strong>
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <Field label="Peak Hour ₹"><input value={draft.peakHourAmount} onChange={(e) => setDraft({ ...draft, peakHourAmount: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="0" /></Field>
                <Field label="Referral ₹"><input value={draft.referralAmount} onChange={(e) => setDraft({ ...draft, referralAmount: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="0" /></Field>
                <Field label="Festival ₹"><input value={draft.festivalAmount} onChange={(e) => setDraft({ ...draft, festivalAmount: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="0" /></Field>
              </div>
            </div>

            <div style={{ padding: 10, borderRadius: 10, border: '1px solid var(--line,#e5e7eb)' }}>
              <strong style={{ fontSize: 13 }}>Estimated monthly incentive <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>— your estimate, shown as a range on the summary</span></strong>
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <Field label="From ₹"><input value={draft.estIncentiveMin} onChange={(e) => setDraft({ ...draft, estIncentiveMin: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="2000" /></Field>
                <Field label="To ₹"><input value={draft.estIncentiveMax} onChange={(e) => setDraft({ ...draft, estIncentiveMax: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="3000" /></Field>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Leave blank to hide the estimate — a worker's actual incentives always show once they're earning.</div>
            </div>
          </div>
          <Field label="Notes (optional)"><input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  )
}
