import { useEffect, useState } from 'react'
import { IndianRupee, Users, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import { fetchSalaryPlans, createSalaryPlan, updateSalaryPlan, deleteSalaryPlan } from '../api'
import type { SalaryPlan, SalaryPlansState } from '../types'
import { StatCard, Card, Badge, Loading, ErrorState, Modal, Field, useToast, useConfirm } from '../components/UI'

/* Salary plans — named commission rates, assigned instead of typed per worker.
 *
 * Nothing is seeded: "Worker Level 1 = 20%" is this company's payroll, not something to assume.
 * Until a plan exists, workers fall back to the platform commission and Phase 12 flags them as
 * unconfigured, which is the honest state rather than a made-up default.
 *
 * A plan's rate is read by the wallet when it settles a job, so editing one changes what real
 * people take home — the form says so, and the server notifies everyone affected.
 */
export default function SalaryPlans() {
  const toast = useToast()
  const confirm = useConfirm()
  const [d, setD] = useState<SalaryPlansState | null>(null)
  const [err, setErr] = useState('')
  const [modal, setModal] = useState<null | 'add' | 'edit'>(null)
  const [editing, setEditing] = useState<SalaryPlan | null>(null)
  const [draft, setDraft] = useState({ name: '', commissionPercent: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = () => { setErr(''); fetchSalaryPlans().then(setD).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  const active = d.plans.filter((p) => p.active)
  const assigned = d.plans.reduce((n, p) => n + (p.workers || 0), 0)

  const save = async () => {
    const pct = Number(draft.commissionPercent)
    if (!draft.name.trim()) { toast('Name required', 'err'); return }
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) { toast('Commission must be a whole number between 0 and 100', 'err'); return }
    setSaving(true)
    try {
      if (modal === 'edit' && editing) await updateSalaryPlan(editing.id, { name: draft.name.trim(), commissionPercent: pct, notes: draft.notes })
      else await createSalaryPlan({ name: draft.name.trim(), commissionPercent: pct, notes: draft.notes })
      toast('Saved'); setModal(null); setEditing(null); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setSaving(false) }
  }

  const remove = async (p: SalaryPlan) => {
    if (!(await confirm({ title: `Delete "${p.name}"?`, message: 'Plans with workers on them cannot be deleted — retire them instead.', confirmLabel: 'Delete', danger: true }))) return
    try { await deleteSalaryPlan(p.id); toast('Plan deleted'); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  const pct = Number(draft.commissionPercent)
  const keeps = Number.isInteger(pct) && pct >= 0 && pct <= 100 ? 100 - pct : null

  return (
    <>
      <div className="stat-row">
        <StatCard icon={<IndianRupee size={18} />} tint="#eef0ff" label="Plans" value={active.length} sub={`${d.plans.length - active.length} retired`} />
        <StatCard icon={<Users size={18} />} tint="#e7f7ee" label="Workers on a plan" value={assigned} sub="The rest use the platform rate" />
        <StatCard icon={<IndianRupee size={18} />} tint="#fff6e6" label="Platform default" value={`${d.platformCommissionPercent}%`} sub="Applies when no plan is set" />
      </div>

      {d.plans.length === 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 14, borderLeft: '3px solid #6366f1' }}>
          <strong>No plans yet.</strong> These are your payroll rates, so they don't ship with defaults —
          create the levels you actually use. Until then every worker earns on the platform commission
          ({d.platformCommissionPercent}%) and shows as <em>Salary not configured</em> on the go-live checklist.
        </div>
      )}

      <Card title="Salary plans" right={<button className="btn" onClick={() => { setDraft({ name: '', commissionPercent: '', notes: '' }); setModal('add') }}><Plus size={16} /> Add plan</button>}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Plan</th><th>Type</th><th>Commission</th><th>Worker keeps</th><th>Workers</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {d.plans.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong>{p.notes && <div className="muted" style={{ fontSize: 11.5 }}>{p.notes}</div>}</td>
                  <td className="muted" style={{ fontSize: 12.5 }}>Per job</td>
                  <td>{p.commissionPercent}%</td>
                  <td style={{ color: '#15803d', fontWeight: 600 }}>{p.workerKeeps}%</td>
                  <td>{p.workers || 0}</td>
                  <td><Badge tone={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Retired'}</Badge></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="iconbtn" title="Edit" onClick={() => { setEditing(p); setDraft({ name: p.name, commissionPercent: String(p.commissionPercent), notes: p.notes }); setModal('edit') }}><Pencil size={16} /></button>
                    <button className="iconbtn" title={p.active ? 'Retire' : 'Reactivate'} onClick={async () => {
                      try { await updateSalaryPlan(p.id, { active: !p.active }); load() } catch (e) { toast((e as Error).message, 'err') }
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
        <strong style={{ fontSize: 13 }}>Not here yet</strong>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
          <strong>Fixed and Hybrid</strong> salaries need a monthly payroll run — offering them without one
          would leave a worker earning nothing per job and no salary either.
          <strong> Incentive plans</strong> (referral, attendance, peak hour, festival) need the bonuses
          themselves to exist first; a plan naming rules that don't run would be worse than none.
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add salary plan' : `Edit — ${editing?.name}`} onClose={() => { setModal(null); setEditing(null) }}
          footer={<>
            <button className="btn line" onClick={() => { setModal(null); setEditing(null) }}>Cancel</button>
            <button className="btn" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </>}>
          <Field label="Plan name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Worker Level 1" /></Field>
          <Field label="Platform commission %">
            <input value={draft.commissionPercent} onChange={(e) => setDraft({ ...draft, commissionPercent: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="20" />
          </Field>
          {keeps !== null && (
            <p style={{ fontSize: 13, margin: '4px 0 10px' }}>
              The worker keeps <strong style={{ color: '#15803d' }}>{keeps}%</strong> of every job.
            </p>
          )}
          <Field label="Notes (optional)"><input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="e.g. Standard starting rate" /></Field>
          {modal === 'edit' && (editing?.workers || 0) > 0 && (
            <p style={{ fontSize: 12.5, color: '#b45309' }}>
              {editing?.workers} worker(s) are on this plan. Changing the rate changes what they take home
              from their next job, and they'll be told.
            </p>
          )}
        </Modal>
      )}
    </>
  )
}
