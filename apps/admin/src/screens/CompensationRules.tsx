import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Plus, Pencil, Play, Pause, ChevronLeft, Trash2, History, Info } from 'lucide-react'
import {
  fetchRuleMeta, fetchIncentiveRules, fetchIncentiveRule, createIncentiveRule, versionIncentiveRule, patchIncentiveRule,
  fetchZones, fetchServices, type Zone,
} from '../api'
import type { RuleMeta, IncentiveRule, RuleVersion, RuleCondition, RuleSlab, AdminService } from '../types'
import { CITIES } from '../cities'
import { StatCard, Card, Badge, Loading, ErrorState, Field, Dropdown, useToast, shortDate } from '../components/UI'

/* Compensation Rule Engine — the authoring UI.
 *
 * Operations builds an incentive as config: who it applies to (scope), when it fires (trigger),
 * who qualifies (conditions), and what it pays (calculation). No code. Editing a live rule never
 * mutates it — Save creates a new version, and past payouts keep the version that paid them.
 *
 * Only the conditions the engine can actually evaluate are offered (the meta endpoint's field list),
 * so there is never a rule that silently never fires.
 */

const TRIGGER_LABEL: Record<string, string> = { job_completed: 'On each completed job', monthly_close: 'Monthly (payroll)' }
const SCOPE_LABEL: Record<string, string> = {
  company: 'Entire company', city: 'City', zone: 'Zone', service: 'Service',
  worker_category: 'Worker category', employment_type: 'Employment type', specific_workers: 'Specific workers',
}
const OP_LABEL: Record<string, string> = {
  gte: 'is at least (≥)', lte: 'is at most (≤)', gt: 'is more than (>)', lt: 'is less than (<)',
  eq: 'equals', neq: 'is not', in: 'is one of', between: 'is between',
}
const CALC_LABEL: Record<string, string> = { fixed: 'Fixed amount', per_job: 'Per completed job', slab: 'Slab by a number', percentage: '% of job value' }
const STACK_LABEL: Record<string, string> = {
  allow: 'Stacks — pays on top of others',
  highest_wins: 'Highest in its group wins',
  lowest_wins: 'Lowest in its group wins',
  exclusive: 'Only one in its group pays',
}
const STACK_HINT: Record<string, string> = {
  allow: 'Always pays, even when other rules also match the same job or month.',
  highest_wins: 'When several rules in this group match, only the one paying the most pays.',
  lowest_wins: 'When several rules in this group match, only the one paying the least pays.',
  exclusive: 'When several rules in this group match, only the highest-priority one pays (lowest priority number wins).',
}
const CATEGORIES = ['Regular', 'Premium', 'Expert', 'Senior']
const EMPLOYMENT = ['Full Time', 'Part Time', 'Contract', 'Freelance']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const rupee = (n: number) => '₹' + (n || 0).toLocaleString('en-IN')

type Draft = {
  name: string; category: string; description: string; priority: string
  trigger: string; effectiveFrom: string; effectiveTo: string
  scopeType: string; scopeValues: string[]; matchMode: 'all' | 'any'
  conditions: RuleCondition[]
  calcType: string
  amount: string; percent: string; perUnit: string; maxUnits: string
  slabMetric: string; slabs: RuleSlab[]
  stack: string; stackGroup: string
  budgetMonth: string
}
const emptyDraft = (meta: RuleMeta): Draft => ({
  name: '', category: 'Other', description: '', priority: '100',
  trigger: 'job_completed', effectiveFrom: '', effectiveTo: '',
  scopeType: 'company', scopeValues: [], matchMode: 'all',
  conditions: [],
  calcType: 'fixed',
  amount: '', percent: '', perUnit: '', maxUnits: '',
  slabMetric: meta.fields.find((f) => f.type === 'number' && f.triggers.includes('monthly_close'))?.key || 'completed_jobs', slabs: [],
  stack: 'allow', stackGroup: '',
  budgetMonth: '',
})

export default function CompensationRules() {
  const toast = useToast()
  const [meta, setMeta] = useState<RuleMeta | null>(null)
  const [rules, setRules] = useState<IncentiveRule[] | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [services, setServices] = useState<AdminService[]>([])
  const [err, setErr] = useState('')
  const [view, setView] = useState<'list' | 'build' | 'detail'>('list')
  const [editing, setEditing] = useState<IncentiveRule | null>(null)   // set when editing (→ new version)
  const [detail, setDetail] = useState<IncentiveRule | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setErr('')
    Promise.all([fetchRuleMeta(), fetchIncentiveRules()])
      .then(([m, r]) => { setMeta(m); setRules(r.rules) })
      .catch((e: Error) => setErr(e.message))
  }
  useEffect(load, [])
  useEffect(() => { fetchZones().then(setZones).catch(() => {}); fetchServices().then(setServices).catch(() => {}) }, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!meta || !rules) return <Loading />

  // fields valid for the draft's trigger
  const fieldsForTrigger = (trigger: string) => meta.fields.filter((f) => f.triggers.includes(trigger))
  const numberFieldsForTrigger = (trigger: string) => fieldsForTrigger(trigger).filter((f) => f.type === 'number')

  const scopeOptions = (type: string): { value: string; label: string }[] => {
    switch (type) {
      case 'city': return CITIES.map((c) => ({ value: c.city, label: c.city }))
      case 'zone': return zones.map((z) => ({ value: String(z.id), label: z.name }))
      case 'service': return services.map((s) => ({ value: s.name, label: s.name }))
      case 'worker_category': return CATEGORIES.map((c) => ({ value: c, label: c }))
      case 'employment_type': return EMPLOYMENT.map((c) => ({ value: c, label: c }))
      default: return []
    }
  }
  // value picker for a condition field (enum → dropdown options)
  const valueOptions = (field: string): { value: string; label: string }[] | null => {
    if (field === 'weekday') return DAYS.map((d) => ({ value: d, label: d }))
    if (field === 'worker_category') return CATEGORIES.map((c) => ({ value: c, label: c }))
    if (field === 'employment_type') return EMPLOYMENT.map((c) => ({ value: c, label: c }))
    if (field === 'service') return services.map((s) => ({ value: s.name, label: s.name }))
    if (field === 'gender') return [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }]
    return null
  }

  const openCreate = () => { setEditing(null); setDraft(emptyDraft(meta)); setView('build') }
  const openEdit = (r: IncentiveRule) => {
    const v = r.current
    if (!v) return
    setEditing(r)
    setDraft({
      name: r.name, category: r.category, description: r.description, priority: String(r.priority),
      trigger: v.trigger, effectiveFrom: v.effectiveFrom?.slice(0, 10) || '', effectiveTo: v.effectiveTo?.slice(0, 10) || '',
      scopeType: v.scopeType, scopeValues: v.scopeValues, matchMode: v.matchMode,
      conditions: v.conditions.map((c) => ({ ...c, value: String(c.value) })),
      calcType: v.calcType,
      amount: v.calc.amount ? String(v.calc.amount) : '',
      percent: v.calc.percent ? String(v.calc.percent) : '',
      perUnit: v.calc.perUnit ? String(v.calc.perUnit) : '',
      maxUnits: v.calc.maxUnits ? String(v.calc.maxUnits) : '',
      slabMetric: v.calc.slabMetric || 'completed_jobs',
      slabs: v.calc.slabs || [],
      stack: v.stack || 'allow', stackGroup: v.stackGroup || '',
      budgetMonth: v.budgetMonth ? String(v.budgetMonth) : '',
    })
    setView('build')
  }
  const openDetail = async (r: IncentiveRule) => {
    try { const full = await fetchIncentiveRule(r.id); setDetail(full.rule); setView('detail') }
    catch (e) { toast((e as Error).message, 'err') }
  }

  const toggleActive = async (r: IncentiveRule) => {
    try { await patchIncentiveRule(r.id, { active: !r.active }); toast(r.active ? 'Rule paused' : 'Rule activated'); load() }
    catch (e) { toast((e as Error).message, 'err') }
  }

  const save = async () => {
    if (!draft) return
    const num = (s: string) => (s === '' ? 0 : Number(s))
    const calc: Record<string, unknown> =
      draft.calcType === 'fixed' ? { amount: num(draft.amount) }
        : draft.calcType === 'percentage' ? { percent: num(draft.percent), base: 'job_total' }
          : draft.calcType === 'per_job' ? { perUnit: num(draft.perUnit), maxUnits: num(draft.maxUnits) }
            : { slabMetric: draft.slabMetric, slabs: draft.slabs }
    const body = {
      name: draft.name.trim(), category: draft.category, description: draft.description, priority: num(draft.priority),
      trigger: draft.trigger, effectiveFrom: draft.effectiveFrom || null, effectiveTo: draft.effectiveTo || null,
      scopeType: draft.scopeType, scopeValues: draft.scopeType === 'company' ? [] : draft.scopeValues,
      matchMode: draft.matchMode, conditions: draft.conditions, calcType: draft.calcType, calc,
      stack: draft.stack, stackGroup: draft.stack === 'allow' ? '' : draft.stackGroup.trim(),
      budgetMonth: num(draft.budgetMonth),
    }
    setSaving(true)
    try {
      if (editing) await versionIncentiveRule(editing.id, body)
      else await createIncentiveRule(body)
      toast(editing ? `Saved — new version created` : 'Rule created'); setView('list'); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setSaving(false) }
  }

  /* ---------------- LIST ---------------- */
  if (view === 'list') {
    const active = rules.filter((r) => r.active).length
    const spent = rules.reduce((n, r) => n + (r.spentThisMonth || 0), 0)
    return (
      <>
        <div className="stat-row">
          <StatCard icon={<Sparkles size={18} />} tint="#eef0ff" label="Rules" value={rules.length} sub={`${active} active`} />
          <StatCard icon={<Sparkles size={18} />} tint="#e7f7ee" label="Paid this month" value={rupee(spent)} sub="Across all rules" />
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 14, borderLeft: '3px solid #6366f1' }}>
          <strong>Author any incentive as config.</strong> Pick who it applies to, when it fires, who qualifies, and what it pays —
          no code. Editing a rule creates a new version; past payouts keep the version that paid them.
        </div>

        <Card title="Compensation rules" right={<button className="btn" onClick={openCreate}><Plus size={16} /> New rule</button>}>
          {rules.length === 0
            ? <div className="muted" style={{ fontSize: 13, padding: '8px 0' }}>No rules yet. Create one — e.g. “Deep Cleaning on weekends → ₹50 per job”.</div>
            : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Rule</th><th>Trigger</th><th>Scope</th><th>Pays</th><th>This month</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>{r.name}</strong>
                          <div className="muted" style={{ fontSize: 11.5 }}>{r.category} · v{r.current?.version ?? '—'}</div>
                        </td>
                        <td className="muted" style={{ fontSize: 12.5 }}>{TRIGGER_LABEL[r.current?.trigger || ''] || '—'}</td>
                        <td className="muted" style={{ fontSize: 12.5 }}>{SCOPE_LABEL[r.current?.scopeType || ''] || '—'}</td>
                        <td style={{ fontSize: 12.5 }}>{r.current ? calcSummary(r.current) : '—'}</td>
                        <td>{rupee(r.spentThisMonth || 0)}{r.current?.budgetMonth ? <span className="muted" style={{ fontSize: 11 }}> / {rupee(r.current.budgetMonth)}</span> : null}</td>
                        <td><Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Paused'}</Badge></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="iconbtn" title="History & payouts" onClick={() => openDetail(r)}><History size={16} /></button>
                          <button className="iconbtn" title="Edit (new version)" onClick={() => openEdit(r)}><Pencil size={16} /></button>
                          <button className="iconbtn" title={r.active ? 'Pause' : 'Activate'} onClick={() => toggleActive(r)}>{r.active ? <Pause size={16} /> : <Play size={16} />}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </>
    )
  }

  /* ---------------- DETAIL ---------------- */
  if (view === 'detail' && detail) {
    return (
      <>
        <button className="btn line" style={{ marginBottom: 14 }} onClick={() => { setDetail(null); setView('list') }}><ChevronLeft size={15} /> All rules</button>
        <Card>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div><strong style={{ fontSize: 16 }}>{detail.name}</strong> <Badge tone={detail.active ? 'green' : 'gray'}>{detail.active ? 'Active' : 'Paused'}</Badge>
              <div className="muted" style={{ fontSize: 12.5 }}>{detail.category} · code {detail.code} · priority {detail.priority}</div></div>
            <button className="btn" onClick={() => openEdit(detail)}><Pencil size={15} /> Edit (new version)</button>
          </div>
          {detail.current && <RuleReadout v={detail.current} zones={zones} />}
        </Card>

        <Card title="Versions">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Version</th><th>Trigger</th><th>Pays</th><th>By</th><th>When</th><th></th></tr></thead>
              <tbody>
                {(detail.versions || []).map((v) => (
                  <tr key={v.id}>
                    <td><strong>v{v.version}</strong> {v.isCurrent && <Badge tone="green" dot={false}>Current</Badge>}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{TRIGGER_LABEL[v.trigger]}</td>
                    <td style={{ fontSize: 12.5 }}>{calcSummary(v)}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{v.createdBy}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{shortDate(v.created)}</td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Recent payouts">
          {(detail.payouts || []).length === 0
            ? <div className="muted" style={{ fontSize: 13 }}>No payouts yet.</div>
            : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Worker</th><th>Amount</th><th>Month</th><th>Ref</th><th>Version</th><th>When</th></tr></thead>
                  <tbody>
                    {detail.payouts!.map((p) => (
                      <tr key={p.id}>
                        <td>#{p.workerId}</td><td>{rupee(p.amount)}</td><td>{p.month}</td>
                        <td className="muted" style={{ fontSize: 12 }}>{p.ref}</td>
                        <td className="muted" style={{ fontSize: 12 }}>{(detail.versions || []).find((v) => v.id === p.versionId)?.version ? `v${detail.versions!.find((v) => v.id === p.versionId)!.version}` : `#${p.versionId}`}</td>
                        <td className="muted" style={{ fontSize: 12 }}>{shortDate(p.created)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>

        {(detail.audit || []).length > 0 && (
          <Card title="Change history">
            <div style={{ display: 'grid', gap: 4 }}>
              {detail.audit!.map((a, i) => (
                <div key={i} style={{ fontSize: 12.5 }}><strong>{a.by}</strong> {a.action} — {a.detail} <span className="muted">· {shortDate(a.created)}</span></div>
              ))}
            </div>
          </Card>
        )}
      </>
    )
  }

  /* ---------------- BUILDER ---------------- */
  if (!draft) return null
  const d = draft
  const setD = (patch: Partial<Draft>) => setDraft({ ...d, ...patch })
  const condFields = fieldsForTrigger(d.trigger)
  const scopeOpts = scopeOptions(d.scopeType)

  return (
    <>
      <button className="btn line" style={{ marginBottom: 14 }} onClick={() => setView('list')}><ChevronLeft size={15} /> Cancel</button>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Card title={editing ? `Edit — ${editing.name} (saves as v${(editing.current?.version || 0) + 1})` : 'New compensation rule'}>
            <div style={grid2}>
              <Field label="Rule name *"><input value={d.name} onChange={(e) => setD({ name: e.target.value })} placeholder="e.g. Kitchen Weekend Bonus" /></Field>
              <Field label="Category"><Dropdown value={d.category} width="100%" options={meta.categories.map((c) => ({ value: c, label: c }))} onChange={(v) => setD({ category: v })} /></Field>
            </div>
            <Field label="Description"><input value={d.description} onChange={(e) => setD({ description: e.target.value })} placeholder="What is this incentive for?" /></Field>
            <div style={grid3}>
              <Field label="Priority"><input value={d.priority} onChange={(e) => setD({ priority: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="100" /></Field>
              <Field label="Effective from"><input type="date" value={d.effectiveFrom} onChange={(e) => setD({ effectiveFrom: e.target.value })} /></Field>
              <Field label="Effective to"><input type="date" value={d.effectiveTo} onChange={(e) => setD({ effectiveTo: e.target.value })} /></Field>
            </div>
          </Card>

          {/* WHEN */}
          <Card title="When does it fire?">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {meta.triggers.map((t) => {
                const on = d.trigger === t
                return (
                  <button key={t} onClick={() => setD({ trigger: t, conditions: [], calcType: t === 'monthly_close' ? 'fixed' : 'fixed' })}
                    style={{ textAlign: 'left', padding: 12, borderRadius: 10, cursor: 'pointer', background: on ? '#eef2ff' : '#fff', border: '1.5px solid ' + (on ? '#4f46e5' : 'var(--line,#e5e7eb)') }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{TRIGGER_LABEL[t]}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{t === 'job_completed' ? 'Paid to the wallet the moment a job is completed.' : 'Paid by the monthly payroll run.'}</div>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* WHO — scope */}
          <Card title="Who does it apply to?">
            <Field label="Apply to">
              <Dropdown value={d.scopeType} width="100%" options={meta.scopeTypes.map((s) => ({ value: s, label: SCOPE_LABEL[s] || s }))} onChange={(v) => setD({ scopeType: v, scopeValues: [] })} />
            </Field>
            {d.scopeType !== 'company' && d.scopeType !== 'specific_workers' && (
              <ChipPicker options={scopeOpts} selected={d.scopeValues} onChange={(vals) => setD({ scopeValues: vals })} empty={`No ${SCOPE_LABEL[d.scopeType]} options`} />
            )}
            {d.scopeType === 'specific_workers' && (
              <Field label="Worker IDs (comma-separated)">
                <input value={d.scopeValues.join(',')} onChange={(e) => setD({ scopeValues: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="e.g. 12, 34, 56" />
              </Field>
            )}
          </Card>

          {/* CONDITIONS — eligibility */}
          <Card title="Who qualifies?" right={
            <button className="btn line" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setD({ conditions: [...d.conditions, { field: condFields[0]?.key || '', op: 'gte', value: '' }] })}>+ Condition</button>
          }>
            {d.conditions.length === 0
              ? <div className="muted" style={{ fontSize: 12.5 }}>No conditions — everyone in scope qualifies. Add conditions to narrow it (e.g. weekend, rating ≥ 4.5).</div>
              : (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, fontSize: 12.5 }}>
                    Match
                    <Dropdown value={d.matchMode} width={90} options={[{ value: 'all', label: 'ALL' }, { value: 'any', label: 'ANY' }]} onChange={(v) => setD({ matchMode: v as 'all' | 'any' })} />
                    of these:
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {d.conditions.map((c, i) => {
                      const upd = (patch: Partial<RuleCondition>) => { const rows = [...d.conditions]; rows[i] = { ...rows[i], ...patch }; setD({ conditions: rows }) }
                      const opts = valueOptions(c.field)
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1.4fr 28px', gap: 8, alignItems: 'center' }}>
                          <Dropdown value={c.field} width="100%" options={condFields.map((f) => ({ value: f.key, label: f.label }))} onChange={(v) => upd({ field: v, value: '' })} />
                          <Dropdown value={c.op} width="100%" options={meta.operators.map((o) => ({ value: o, label: OP_LABEL[o] || o }))} onChange={(v) => upd({ op: v })} />
                          {opts && c.op !== 'in' && c.op !== 'between'
                            ? <Dropdown value={c.value} width="100%" placeholder="Select" options={opts} onChange={(v) => upd({ value: v })} />
                            : <input value={c.value} onChange={(e) => upd({ value: e.target.value })} placeholder={c.op === 'between' ? 'e.g. 16,20' : c.op === 'in' ? 'e.g. Sat,Sun' : 'value'} style={inpStyle} />}
                          <button className="iconbtn" onClick={() => setD({ conditions: d.conditions.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
          </Card>

          {/* CALC */}
          <Card title="What does it pay?">
            <Field label="Calculation">
              <Dropdown value={d.calcType} width="100%"
                options={meta.calcTypes
                  .filter((t) => (d.trigger === 'job_completed' ? t !== 'per_job' : t !== 'percentage'))
                  .map((t) => ({ value: t, label: CALC_LABEL[t] || t }))}
                onChange={(v) => setD({ calcType: v })} />
            </Field>
            {d.calcType === 'fixed' && <Field label="Amount (₹)"><input value={d.amount} onChange={(e) => setD({ amount: e.target.value.replace(/\D/g, '').slice(0, 7) })} placeholder="50" /></Field>}
            {d.calcType === 'percentage' && <Field label="% of the job's value"><input value={d.percent} onChange={(e) => setD({ percent: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="5" /></Field>}
            {d.calcType === 'per_job' && (
              <div style={grid2}>
                <Field label="₹ per completed job"><input value={d.perUnit} onChange={(e) => setD({ perUnit: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="30" /></Field>
                <Field label="Max jobs counted (0 = no cap)"><input value={d.maxUnits} onChange={(e) => setD({ maxUnits: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="10" /></Field>
              </div>
            )}
            {d.calcType === 'slab' && (
              <div>
                <Field label="Slab by">
                  <Dropdown value={d.slabMetric} width="100%" options={numberFieldsForTrigger(d.trigger).map((f) => ({ value: f.key, label: f.label }))} onChange={(v) => setD({ slabMetric: v })} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 28px', gap: 8, fontSize: 11, color: 'var(--muted,#667085)', marginTop: 6 }}>
                  <span>From</span><span>To</span><span>Pays ₹</span><span></span>
                </div>
                {d.slabs.map((s, i) => {
                  const upd = (patch: Partial<RuleSlab>) => { const rows = [...d.slabs]; rows[i] = { ...rows[i], ...patch }; setD({ slabs: rows }) }
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 28px', gap: 8, alignItems: 'center', marginTop: 6 }}>
                      <input value={s.from} onChange={(e) => upd({ from: Number(e.target.value.replace(/\D/g, '')) })} style={inpStyle} placeholder="1" />
                      <input value={s.to} onChange={(e) => upd({ to: Number(e.target.value.replace(/\D/g, '')) })} style={inpStyle} placeholder="5" />
                      <input value={s.amount} onChange={(e) => upd({ amount: Number(e.target.value.replace(/\D/g, '')) })} style={inpStyle} placeholder="50" />
                      <button className="iconbtn" onClick={() => setD({ slabs: d.slabs.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
                    </div>
                  )
                })}
                <button className="btn line" style={{ marginTop: 8, padding: '4px 10px', fontSize: 12 }} onClick={() => setD({ slabs: [...d.slabs, { from: 0, to: 0, amount: 0 }] })}>+ Slab</button>
              </div>
            )}
            <Field label="Monthly budget cap (₹, 0 = no cap)">
              <input value={d.budgetMonth} onChange={(e) => setD({ budgetMonth: e.target.value.replace(/\D/g, '').slice(0, 8) })} placeholder="0" />
            </Field>
            <div style={{ display: 'flex', gap: 8, fontSize: 12, background: '#eff6ff', color: '#1e40af', padding: 10, borderRadius: 10, marginTop: 4 }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Once a rule's monthly budget is reached it stops paying rather than overshoot. Leave 0 for no cap.</span>
            </div>
          </Card>

          {/* STACKING */}
          <Card title="Stacking — when more than one rule matches">
            <div style={grid2}>
              <Field label="How it combines">
                <Dropdown value={d.stack} width="100%" options={meta.stackModes.map((m) => ({ value: m, label: STACK_LABEL[m] || m }))} onChange={(v) => setD({ stack: v, stackGroup: v === 'allow' ? '' : d.stackGroup })} />
              </Field>
              <Field label="Stack group">
                <input value={d.stackGroup} disabled={d.stack === 'allow'} onChange={(e) => setD({ stackGroup: e.target.value.slice(0, 60) })}
                  placeholder={d.stack === 'allow' ? 'Not needed when stacking' : 'e.g. surge'} style={d.stack === 'allow' ? { ...inpStyle, background: '#f3f4f6', color: '#9ca3af' } : inpStyle} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, fontSize: 12, background: '#eff6ff', color: '#1e40af', padding: 10, borderRadius: 10, marginTop: 4 }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {STACK_HINT[d.stack] || ''}{' '}
                {d.stack !== 'allow' && (d.stackGroup.trim()
                  ? <>Only rules sharing the group “<strong>{d.stackGroup.trim()}</strong>” compete — give the rules you want to trade off the same group name.</>
                  : <span style={{ color: '#b45309' }}>Pick a stack group — a policy does nothing until two rules share a group.</span>)}
              </span>
            </div>
          </Card>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn line" onClick={() => setView('list')}>Cancel</button>
            <button className="btn" disabled={saving || !d.name.trim() || (d.stack !== 'allow' && !d.stackGroup.trim())} onClick={save}>{saving ? 'Saving…' : editing ? 'Save new version' : 'Create rule'}</button>
          </div>
        </div>

        {/* preview rail */}
        <div style={{ position: 'sticky', top: 12 }}>
          <Card>
            <strong style={{ fontSize: 14 }}>In plain English</strong>
            <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>{plainEnglish(d, meta)}</p>
            {editing && <div className="muted" style={{ fontSize: 11.5, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line,#eef0f4)' }}>Saving creates <strong>v{(editing.current?.version || 0) + 1}</strong>. Payouts already made keep their version.</div>}
          </Card>
        </div>
      </div>
    </>
  )
}

/* ---------- helpers ---------- */
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }
const inpStyle: React.CSSProperties = { width: '100%', border: '1px solid var(--line,#e5e7eb)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }

function calcSummary(v: RuleVersion): string {
  const c = v.calc || {}
  switch (v.calcType) {
    case 'fixed': return rupee(c.amount || 0)
    case 'percentage': return `${c.percent || 0}% of job value`
    case 'per_job': return `${rupee(c.perUnit || 0)}/job${c.maxUnits ? ` (max ${c.maxUnits})` : ''}`
    case 'slab': return `${(c.slabs || []).length} slabs by ${c.slabMetric}`
    default: return '—'
  }
}

function ChipPicker({ options, selected, onChange, empty }: { options: { value: string; label: string }[]; selected: string[]; onChange: (v: string[]) => void; empty: string }) {
  if (!options.length) return <div className="muted" style={{ fontSize: 12.5 }}>{empty}</div>
  const toggle = (val: string) => onChange(selected.includes(val) ? selected.filter((x) => x !== val) : [...selected, val])
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
      {options.map((o) => {
        const on = selected.includes(o.value)
        return (
          <button key={o.value} onClick={() => toggle(o.value)} style={{
            padding: '5px 10px', fontSize: 12.5, borderRadius: 999, cursor: 'pointer',
            border: '1px solid ' + (on ? '#4f46e5' : 'var(--line,#e5e7eb)'), background: on ? '#eef2ff' : '#fff', color: on ? '#4f46e5' : 'inherit', fontWeight: on ? 600 : 400,
          }}>{o.label}</button>
        )
      })}
    </div>
  )
}

function RuleReadout({ v, zones }: { v: RuleVersion; zones: Zone[] }) {
  const scopeVals = v.scopeType === 'zone' ? v.scopeValues.map((id) => zones.find((z) => String(z.id) === id)?.name || `#${id}`) : v.scopeValues
  return (
    <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
      <div><span className="muted">Fires:</span> {TRIGGER_LABEL[v.trigger]}</div>
      <div><span className="muted">Applies to:</span> {SCOPE_LABEL[v.scopeType]}{scopeVals.length ? `: ${scopeVals.join(', ')}` : ''}</div>
      {v.conditions.length > 0 && <div><span className="muted">Qualifies when {v.matchMode.toUpperCase()}:</span> {v.conditions.map((c) => `${c.field} ${OP_LABEL[c.op] || c.op} ${c.value}`).join(v.matchMode === 'all' ? ' AND ' : ' OR ')}</div>}
      <div><span className="muted">Pays:</span> {calcSummary(v)}</div>
      {v.stack && v.stack !== 'allow' && <div><span className="muted">Stacking:</span> {STACK_LABEL[v.stack] || v.stack}{v.stackGroup ? ` (group “${v.stackGroup}”)` : ''}</div>}
      {v.budgetMonth > 0 && <div><span className="muted">Budget:</span> {rupee(v.budgetMonth)}/month</div>}
    </div>
  )
}

function plainEnglish(d: Draft, _meta: RuleMeta): string {
  const scope = d.scopeType === 'company' ? 'every worker' : `workers by ${SCOPE_LABEL[d.scopeType].toLowerCase()}${d.scopeValues.length ? ` (${d.scopeValues.length} selected)` : ''}`
  const when = d.trigger === 'job_completed' ? 'on each completed job' : 'at the monthly payroll'
  const conds = d.conditions.length
    ? ` who, ${d.matchMode === 'all' ? 'when all hold' : 'when any holds'}, meet: ${d.conditions.map((c) => `${c.field} ${OP_LABEL[c.op] || c.op} ${c.value || '…'}`).join(d.matchMode === 'all' ? ' and ' : ' or ')}`
    : ''
  const pays = d.calcType === 'fixed' ? `${rupee(Number(d.amount) || 0)}`
    : d.calcType === 'percentage' ? `${d.percent || 0}% of the job value`
      : d.calcType === 'per_job' ? `${rupee(Number(d.perUnit) || 0)} per job${d.maxUnits ? ` up to ${d.maxUnits} jobs` : ''}`
        : `a slab amount by ${d.slabMetric}`
  const budget = Number(d.budgetMonth) > 0 ? `, capped at ${rupee(Number(d.budgetMonth))}/month` : ''
  const stack = d.stack !== 'allow' && d.stackGroup.trim()
    ? ` Within the “${d.stackGroup.trim()}” group, ${d.stack === 'exclusive' ? 'only the highest-priority rule pays' : d.stack === 'lowest_wins' ? 'only the lowest-paying rule pays' : 'only the highest-paying rule pays'}.`
    : ''
  return `Pay ${scope}${conds}, ${when}: ${pays}${budget}.${stack}`
}
