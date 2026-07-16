import { useEffect, useState } from 'react'
import { IndianRupee, Users, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import { fetchSalaryPlans, createSalaryPlan, updateSalaryPlan, deleteSalaryPlan } from '../api'
import type { SalaryPlan, SalaryPlansState } from '../types'
import { StatCard, Card, Badge, Loading, ErrorState, Modal, Field, Dropdown, useToast, useConfirm } from '../components/UI'

/* Salary plans — named pay structures, assigned instead of typed per worker.
 *
 * Three types, all real:
 *  Per job  — commission only, nothing monthly.
 *  Fixed    — a monthly salary paid by the payroll run, no per-job share.
 *  Hybrid   — both: a monthly salary AND a per-job share.
 *
 * Nothing is seeded — the amounts are this company's payroll. A plan's numbers are read by the
 * wallet (per-job share) and the payroll run (monthly), so editing one changes real take-home; the
 * server notifies everyone affected.
 */

type Draft = { name: string; salaryType: 'per_job' | 'fixed' | 'hybrid'; commissionPercent: string; monthlyBasic: string; attendanceAllowance: string; otherAllowance: string; notes: string }
const EMPTY: Draft = { name: '', salaryType: 'per_job', commissionPercent: '20', monthlyBasic: '', attendanceAllowance: '', otherAllowance: '', notes: '' }

const TYPE_LABEL = { per_job: 'Per job', fixed: 'Fixed', hybrid: 'Hybrid' }

export default function SalaryPlans() {
  const toast = useToast()
  const confirm = useConfirm()
  const [d, setD] = useState<SalaryPlansState | null>(null)
  const [err, setErr] = useState('')
  const [modal, setModal] = useState<null | 'add' | 'edit'>(null)
  const [editing, setEditing] = useState<SalaryPlan | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = () => { setErr(''); fetchSalaryPlans().then(setD).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  const active = d.plans.filter((p) => p.active)
  const assigned = d.plans.reduce((n, p) => n + (p.workers || 0), 0)
  const monthly = active.filter((p) => p.paysMonthly).length

  const isMonthly = draft.salaryType !== 'per_job'
  const isPerJob = draft.salaryType !== 'fixed'

  const save = async () => {
    if (!draft.name.trim()) { toast('Name required', 'err'); return }
    const body = {
      name: draft.name.trim(),
      salaryType: draft.salaryType,
      commissionPercent: isPerJob ? Number(draft.commissionPercent || 0) : 0,
      monthlyBasic: isMonthly ? Number(draft.monthlyBasic || 0) : 0,
      attendanceAllowance: isMonthly ? Number(draft.attendanceAllowance || 0) : 0,
      otherAllowance: isMonthly ? Number(draft.otherAllowance || 0) : 0,
      notes: draft.notes,
    }
    setSaving(true)
    try {
      if (modal === 'edit' && editing) await updateSalaryPlan(editing.id, body)
      else await createSalaryPlan(body)
      toast('Saved'); setModal(null); setEditing(null); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setSaving(false) }
  }

  const remove = async (p: SalaryPlan) => {
    if (!(await confirm({ title: `Delete "${p.name}"?`, message: 'Plans with workers on them cannot be deleted — retire them instead.', confirmLabel: 'Delete', danger: true }))) return
    try { await deleteSalaryPlan(p.id); toast('Plan deleted'); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  const open = (p?: SalaryPlan) => {
    if (p) { setEditing(p); setDraft({ name: p.name, salaryType: p.salaryType, commissionPercent: String(p.commissionPercent), monthlyBasic: p.monthlyBasic ? String(p.monthlyBasic) : '', attendanceAllowance: p.attendanceAllowance ? String(p.attendanceAllowance) : '', otherAllowance: p.otherAllowance ? String(p.otherAllowance) : '', notes: p.notes }); setModal('edit') }
    else { setEditing(null); setDraft(EMPTY); setModal('add') }
  }

  const rupees = (n: number) => '₹' + n.toLocaleString('en-IN')
  const total = (Number(draft.monthlyBasic) || 0) + (Number(draft.attendanceAllowance) || 0) + (Number(draft.otherAllowance) || 0)

  return (
    <>
      <div className="stat-row">
        <StatCard icon={<IndianRupee size={18} />} tint="#eef0ff" label="Plans" value={active.length} sub={`${monthly} monthly · ${active.length - monthly} per-job`} />
        <StatCard icon={<Users size={18} />} tint="#e7f7ee" label="Workers on a plan" value={assigned} sub="The rest use the platform rate" />
        <StatCard icon={<IndianRupee size={18} />} tint="#fff6e6" label="Platform default" value={`${d.platformCommissionPercent}%`} sub="Applies when no plan is set" />
      </div>

      {d.plans.length === 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 14, borderLeft: '3px solid #6366f1' }}>
          <strong>No plans yet.</strong> These are your payroll structures, so they don't ship with defaults —
          create the levels you use. Until then every worker earns on the platform commission ({d.platformCommissionPercent}%)
          and shows as <em>Salary not configured</em> on the go-live checklist.
        </div>
      )}

      <Card title="Salary plans" right={<button className="btn" onClick={() => open()}><Plus size={16} /> Add plan</button>}>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Plan</th><th>Type</th><th>Monthly</th><th>Per job</th><th>Workers</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {d.plans.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong>{p.notes && <div className="muted" style={{ fontSize: 11.5 }}>{p.notes}</div>}</td>
                  <td><Badge tone={p.salaryType === 'per_job' ? 'gray' : p.salaryType === 'fixed' ? 'blue' : 'violet'} dot={false}>{TYPE_LABEL[p.salaryType]}</Badge></td>
                  <td>{p.paysMonthly ? rupees(p.totalFixedPay) : '—'}</td>
                  <td>{p.paysPerJob ? `${p.commissionPercent}% (keeps ${p.workerKeeps}%)` : '—'}</td>
                  <td>{p.workers || 0}</td>
                  <td><Badge tone={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Retired'}</Badge></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="iconbtn" title="Edit" onClick={() => open(p)}><Pencil size={16} /></button>
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
        <strong style={{ fontSize: 13 }}>How each type is paid</strong>
        <ul style={{ fontSize: 12.5, color: 'var(--muted,#667085)', margin: '6px 0 0', paddingLeft: 18 }}>
          <li><strong>Per job</strong> — a share of each completed job, credited immediately by the wallet.</li>
          <li><strong>Fixed</strong> — a monthly salary from the payroll run. No per-job share, so no double pay.</li>
          <li><strong>Hybrid</strong> — both: a monthly salary and a (usually higher-commission) per-job share.</li>
        </ul>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Fixed and hybrid workers are paid through <strong>Payroll</strong>, which an admin reviews and approves each month.</div>
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add salary plan' : `Edit — ${editing?.name}`} onClose={() => { setModal(null); setEditing(null) }}
          footer={<>
            <button className="btn line" onClick={() => { setModal(null); setEditing(null) }}>Cancel</button>
            <button className="btn" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </>}>
          <Field label="Plan name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Worker Level 1" /></Field>
          <Field label="Salary type">
            <Dropdown value={draft.salaryType} width="100%"
              options={[{ value: 'per_job', label: 'Per job — commission only' }, { value: 'fixed', label: 'Fixed — monthly salary' }, { value: 'hybrid', label: 'Hybrid — salary + per job' }]}
              onChange={(v) => setDraft({ ...draft, salaryType: v as Draft['salaryType'] })} />
          </Field>
          {isMonthly && (
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="Monthly basic (₹)"><input value={draft.monthlyBasic} onChange={(e) => setDraft({ ...draft, monthlyBasic: e.target.value.replace(/\D/g, '').slice(0, 8) })} placeholder="12000" /></Field>
              <Field label="Attendance bonus (₹/mo)"><input value={draft.attendanceAllowance} onChange={(e) => setDraft({ ...draft, attendanceAllowance: e.target.value.replace(/\D/g, '').slice(0, 8) })} placeholder="1000" /></Field>
              <Field label="Other allowance (₹)"><input value={draft.otherAllowance} onChange={(e) => setDraft({ ...draft, otherAllowance: e.target.value.replace(/\D/g, '').slice(0, 8) })} placeholder="500" /></Field>
            </div>
          )}
          {isMonthly && total > 0 && <p style={{ fontSize: 13, margin: '2px 0 8px' }}>Total fixed pay: <strong>{rupees(total)}</strong> / month</p>}
          {isPerJob && (
            <Field label="Commission % (platform's cut of each job)">
              <input value={draft.commissionPercent} onChange={(e) => setDraft({ ...draft, commissionPercent: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="20" />
            </Field>
          )}
          {isPerJob && draft.commissionPercent !== '' && Number(draft.commissionPercent) <= 100 && (
            <p style={{ fontSize: 13, margin: '2px 0 8px' }}>The worker keeps <strong style={{ color: '#15803d' }}>{100 - Number(draft.commissionPercent)}%</strong> of each job.</p>
          )}
          <Field label="Notes (optional)"><input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="e.g. Standard starting rate" /></Field>
          {modal === 'edit' && (editing?.workers || 0) > 0 && (
            <p style={{ fontSize: 12.5, color: '#b45309' }}>{editing?.workers} worker(s) are on this plan. Changing the numbers changes their pay, and they'll be told.</p>
          )}
        </Modal>
      )}
    </>
  )
}
