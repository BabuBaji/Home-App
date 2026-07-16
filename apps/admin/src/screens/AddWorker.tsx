import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  UserPlus, Building2, IndianRupee, Send, Check, ChevronRight, Info, Mail, Smartphone, MapPin, Briefcase, BadgeCheck, Gift, Landmark, Layers, Eye,
} from 'lucide-react'
import {
  createWorker, inviteWorker, fetchZones, fetchStores, fetchShiftDefs, fetchSalaryPlans, fetchIncentivePlans, fetchAdmins, fetchServices, opList,
  type Zone, type Store, type ShiftDef,
} from '../api'
import type { SalaryPlan, IncentivePlan, Admin, AdminService } from '../types'
import { CITIES } from '../cities'
import { Card, Badge, Field, Dropdown, Loading, useToast } from '../components/UI'

/* Add New Worker — the admin's 4-step wizard.
 *
 * The split is the point: the admin enters what only they know (who this is, where they work, what
 * they're paid) and the worker fills in their own personal details, documents, bank and skills from
 * the app. That keeps this screen to ~15 fields instead of forty, and stops an admin typing
 * someone else's blood group.
 *
 * Everything here is backed by real behaviour: salary plans move money through the wallet (per job)
 * and the payroll run (monthly), incentive components fire on real events and real ratings.
 * Referral / Peak Hour / Festival bonuses stay out — their triggers don't exist, and a component
 * that never fires is worse than one that isn't offered.
 */

type Step = 1 | 2 | 3 | 4
const STEPS: [Step, string, string][] = [
  [1, 'Basic Information', 'Enter basic details'],
  [2, 'Operational Assignment', 'Assign zone, shift & services'],
  [3, 'Salary & Plan', 'Select salary plan'],
  [4, 'Review & Invite', 'Review and send invitation'],
]

const CATEGORIES = ['Regular', 'Premium', 'Expert', 'Senior']
const EMPLOYMENT = ['Full Time', 'Part Time', 'Contract', 'Freelance']
const REFERRAL = ['Walk-in', 'Referral', 'Job Portal', 'Agency', 'Social Media', 'Other']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TYPE_LABEL: Record<string, string> = { per_job: 'Per job', fixed: 'Fixed', hybrid: 'Hybrid' }
const YESNO = [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]
const rupee = (n: number) => '₹' + (n || 0).toLocaleString('en-IN')

type Draft = {
  first_name: string; last_name: string; phone: string; alternate_mobile: string; email: string
  worker_category: string; employment_type: string; joining_date: string; referral_source: string
  city: string; zone_id: string; cluster_id: string; store_id: string
  reporting_manager_id: string; shift_def_id: string; weekly_off: string[]
  services: string[]; salary_plan_id: string; wallet_enabled: boolean
  job_radius_km: string; allow_outside_radius: boolean
  incentive_plan_id: string; salary_effective_from: string
  pf_applicable: boolean; esi_applicable: boolean; tds_applicable: boolean; salary_payment_mode: 'bank' | 'upi'
  // UI-only: which salary type the plan dropdown is filtered to. The plan itself carries the type;
  // this just drives the three cards. Not sent to the server.
  salary_type: 'per_job' | 'fixed' | 'hybrid'
  salary_basic: string; salary_attendance: string; salary_allowance: string
}

const today = () => new Date().toISOString().slice(0, 10)

const empty: Draft = {
  first_name: '', last_name: '', phone: '', alternate_mobile: '', email: '',
  worker_category: '', employment_type: '', joining_date: today(), referral_source: '',
  city: '', zone_id: '', cluster_id: '', store_id: '',
  reporting_manager_id: '', shift_def_id: '', weekly_off: [],
  services: [], salary_plan_id: '', wallet_enabled: true,
  job_radius_km: '', allow_outside_radius: true,
  incentive_plan_id: '', salary_effective_from: today(),
  pf_applicable: false, esi_applicable: false, tds_applicable: false, salary_payment_mode: 'bank',
  salary_type: 'fixed',
  salary_basic: '', salary_attendance: '', salary_allowance: '',
}

export default function AddWorker() {
  const toast = useToast()
  const nav = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [d, setD] = useState<Draft>(empty)
  const [busy, setBusy] = useState(false)

  const [zones, setZones] = useState<Zone[]>([])
  const [clusters, setClusters] = useState<{ id: number; name: string; zone_id?: number }[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [shifts, setShifts] = useState<ShiftDef[]>([])
  const [plans, setPlans] = useState<SalaryPlan[]>([])
  const [incPlans, setIncPlans] = useState<IncentivePlan[]>([])
  const [platformPct, setPlatformPct] = useState(20)
  const [admins, setAdmins] = useState<Admin[]>([])
  const [services, setServices] = useState<AdminService[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchZones().catch(() => []),
      opList<{ id: number; name: string; zone_id?: number }>('clusters').catch(() => []),
      fetchStores().catch(() => []),
      fetchShiftDefs().catch(() => []),
      fetchSalaryPlans().catch(() => ({ plans: [], platformCommissionPercent: 20 })),
      fetchIncentivePlans().catch(() => ({ plans: [] })),
      fetchAdmins().catch(() => []),
      fetchServices().catch(() => []),
    ]).then(([z, c, s, sh, sp, ip, ad, sv]) => {
      setZones(z); setClusters(c); setStores(s); setShifts(sh)
      setPlans((sp.plans || []).filter((p) => p.active)); setPlatformPct(sp.platformCommissionPercent ?? 20)
      setIncPlans((ip.plans || []).filter((p) => p.active))
      setAdmins(ad); setServices(sv)
      setLoaded(true)
    })
  }, [])

  // Picking a plan pre-fills the Salary Details amounts (the admin can then adjust them for this
  // worker). Runs only on a plan change, so hand-edits aren't clobbered on re-render. MUST sit
  // above the early return below — every hook has to run in the same order on every render, and a
  // hook after a conditional `return` violates that and crashes ("rendered more hooks…").
  useEffect(() => {
    const p = plans.find((x) => String(x.id) === d.salary_plan_id)
    if (!p) return
    setD((prev) => ({
      ...prev,
      salary_basic: p.monthlyBasic ? String(p.monthlyBasic) : '',
      salary_attendance: p.attendanceAllowance ? String(p.attendanceAllowance) : '',
      salary_allowance: p.otherAllowance ? String(p.otherAllowance) : '',
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.salary_plan_id])

  if (!loaded) return <Loading />

  const set = (k: keyof Draft, v: unknown) => setD((p) => ({ ...p, [k]: v }))
  const zoneName = zones.find((z) => String(z.id) === d.zone_id)?.name || '--'
  const planObj = plans.find((p) => String(p.id) === d.salary_plan_id)
  const salaryTotal = (Number(d.salary_basic) || 0) + (Number(d.salary_attendance) || 0) + (Number(d.salary_allowance) || 0)

  // Only what the server actually requires. Everything else the worker supplies later.
  const step1Ok = !!(d.first_name.trim() && d.phone.trim().length >= 10 && d.worker_category && d.employment_type && d.joining_date)
  const step2Ok = !!(d.city && d.zone_id)
  const canAdvance = step === 1 ? step1Ok : step === 2 ? step2Ok : true

  const payload = () => ({
    first_name: d.first_name.trim(), last_name: d.last_name.trim(),
    phone: d.phone.trim(), alternate_mobile: d.alternate_mobile.trim() || null,
    email: d.email.trim() || null,
    worker_category: d.worker_category, employment_type: d.employment_type,
    joining_date: d.joining_date, referral_source: d.referral_source || null,
    city: d.city, zone_id: d.zone_id ? Number(d.zone_id) : null,
    cluster_id: d.cluster_id ? Number(d.cluster_id) : null,
    store_id: d.store_id ? Number(d.store_id) : null,
    reporting_manager_id: d.reporting_manager_id ? Number(d.reporting_manager_id) : null,
    shift_def_id: d.shift_def_id ? Number(d.shift_def_id) : null,
    weekly_off: d.weekly_off,
    services: d.services,
    salary_plan_id: d.salary_plan_id ? Number(d.salary_plan_id) : null,
    wallet_enabled: d.wallet_enabled,
    job_radius_km: d.job_radius_km ? Number(d.job_radius_km) : null,
    allow_outside_radius: d.allow_outside_radius,
    incentive_plan_id: d.incentive_plan_id ? Number(d.incentive_plan_id) : null,
    salary_effective_from: d.salary_effective_from || null,
    salary_basic: d.salary_type !== 'per_job' && d.salary_basic !== '' ? Number(d.salary_basic) : null,
    salary_attendance: d.salary_type !== 'per_job' && d.salary_attendance !== '' ? Number(d.salary_attendance) : null,
    salary_allowance: d.salary_type !== 'per_job' && d.salary_allowance !== '' ? Number(d.salary_allowance) : null,
    pf_applicable: d.pf_applicable, esi_applicable: d.esi_applicable, tds_applicable: d.tds_applicable,
    salary_payment_mode: d.salary_payment_mode,
    status: 'pending',
  })

  const save = async (invite: boolean) => {
    if (!step1Ok) { setStep(1); toast('Fill in the required basics first', 'err'); return }
    setBusy(true)
    try {
      const w = await createWorker(payload())
      if (invite) {
        const r = await inviteWorker(w.id)
        toast(`${w.name} created and invited — ${r.delivery}`)
      } else {
        toast(`${w.name} saved as a draft — they can't sign in until you invite them`)
      }
      nav(`/workers/${w.id}`)
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const zoneClusters = clusters.filter((c) => !d.zone_id || !c.zone_id || String(c.zone_id) === d.zone_id)
  const zoneStores = stores.filter((s) => !d.zone_id || s.zone_id == null || String(s.zone_id) === d.zone_id)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 14 }}>
        {/* Stepper */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {STEPS.map(([n, label, sub], i) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <button onClick={() => setStep(n)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', minWidth: 0 }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: step === n ? '#4f46e5' : step > n ? '#dcfce7' : '#f1f5f9',
                    color: step === n ? '#fff' : step > n ? '#16a34a' : '#64748b', fontSize: 12.5, fontWeight: 700,
                  }}>{step > n ? <Check size={15} /> : n}</span>
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: step === n ? 700 : 500, whiteSpace: 'nowrap' }}>{label}</div>
                    <div className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{sub}</div>
                  </span>
                </button>
                {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: 'var(--line,#e5e7eb)', margin: '0 8px' }} />}
              </div>
            ))}
          </div>
        </Card>

        {step === 1 && (
          <Card>
            <SectionHead icon={<UserPlus size={16} />} title="Basic Information" sub="Enter basic details to create the worker profile." />
            <div style={grid4}>
              <Field label="First Name *"><input value={d.first_name} onChange={(e) => set('first_name', e.target.value)} placeholder="Enter first name" /></Field>
              <Field label="Last Name"><input value={d.last_name} onChange={(e) => set('last_name', e.target.value)} placeholder="Enter last name" /></Field>
              <Field label="Mobile Number *">
                <input value={d.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit number" />
              </Field>
              <Field label="Alternate Mobile">
                <input value={d.alternate_mobile} onChange={(e) => set('alternate_mobile', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Optional" />
              </Field>
            </div>
            <div style={grid4}>
              <Field label="Email Address"><input value={d.email} onChange={(e) => set('email', e.target.value)} placeholder="Optional" /></Field>
              <Field label="Worker Category *">
                <Dropdown value={d.worker_category} width="100%" placeholder="Select category" options={CATEGORIES.map((c) => ({ value: c, label: c }))} onChange={(v) => set('worker_category', v)} />
              </Field>
              <Field label="Employment Type *">
                <Dropdown value={d.employment_type} width="100%" placeholder="Select type" options={EMPLOYMENT.map((c) => ({ value: c, label: c }))} onChange={(v) => set('employment_type', v)} />
              </Field>
              <Field label="Worker ID">
                <input value="Auto-generated" disabled style={{ background: '#f8fafc', color: '#94a3b8' }} />
              </Field>
            </div>
            <div style={grid4}>
              <Field label="Joining Date *"><input type="date" value={d.joining_date} onChange={(e) => set('joining_date', e.target.value)} /></Field>
              <Field label="Recruiter / Added By">
                <input value="You" disabled style={{ background: '#f8fafc', color: '#94a3b8' }} />
              </Field>
              <Field label="Referral Source">
                <Dropdown value={d.referral_source} width="100%" placeholder="Select source" options={REFERRAL.map((c) => ({ value: c, label: c }))} onChange={(v) => set('referral_source', v)} />
              </Field>
              <Field label="Status">
                <div style={{ paddingTop: 6 }}>
                  <Badge tone="amber" dot={false}>Pending Onboarding</Badge>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>They can't sign in until invited</div>
                </div>
              </Field>
            </div>
          </Card>
        )}

        {step === 2 && (
          <>
            <Card>
              <SectionHead icon={<Building2 size={16} />} title="Initial Operational Assignment" sub="Assign the initial work setup for this worker." />
              <div style={grid4}>
                <Field label="City *">
                  <Dropdown value={d.city} width="100%" placeholder="Select city" options={CITIES.map((c) => ({ value: c.city, label: c.city }))} onChange={(v) => set('city', v)} />
                </Field>
                <Field label="Zone *">
                  <Dropdown value={d.zone_id} width="100%" placeholder="Select zone" options={zones.map((z) => ({ value: String(z.id), label: z.name }))} onChange={(v) => set('zone_id', v)} />
                </Field>
                <Field label="Cluster">
                  <Dropdown value={d.cluster_id} width="100%" placeholder="Select cluster (optional)" options={[{ value: '', label: 'None' }, ...zoneClusters.map((c) => ({ value: String(c.id), label: c.name }))]} onChange={(v) => set('cluster_id', v)} />
                </Field>
                <Field label="Store">
                  <Dropdown value={d.store_id} width="100%" placeholder="Select store (optional)" options={[{ value: '', label: 'None' }, ...zoneStores.map((s) => ({ value: String(s.id), label: s.name }))]} onChange={(v) => set('store_id', v)} />
                </Field>
              </div>
              <div style={grid4}>
                <Field label="Reporting Manager">
                  <Dropdown value={d.reporting_manager_id} width="100%" placeholder="Select manager (optional)" options={[{ value: '', label: 'None' }, ...admins.map((a) => ({ value: String(a.id), label: a.name }))]} onChange={(v) => set('reporting_manager_id', v)} />
                </Field>
                <Field label="Initial Shift">
                  <Dropdown value={d.shift_def_id} width="100%" placeholder="Select shift (optional)" options={[{ value: '', label: 'No shift (flexible)' }, ...shifts.map((s) => ({ value: String(s.id), label: s.name }))]} onChange={(v) => set('shift_def_id', v)} />
                </Field>
                <Field label="Weekly Off">
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingTop: 4 }}>
                    {DAYS.map((day) => {
                      const on = d.weekly_off.includes(day)
                      return (
                        <button key={day} onClick={() => set('weekly_off', on ? d.weekly_off.filter((x) => x !== day) : [...d.weekly_off, day])}
                          style={{
                            padding: '4px 8px', fontSize: 11.5, borderRadius: 8, cursor: 'pointer',
                            border: '1px solid ' + (on ? '#4f46e5' : 'var(--line,#e5e7eb)'),
                            background: on ? '#eef2ff' : '#fff', color: on ? '#4f46e5' : '#64748b', fontWeight: on ? 600 : 400,
                          }}>{day}</button>
                      )
                    })}
                  </div>
                </Field>
                <div style={{ alignSelf: 'end', paddingBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 8, fontSize: 11.5, color: '#4f46e5', background: '#eef2ff', padding: 10, borderRadius: 10 }}>
                    <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>The worker can change their availability from the app afterwards — it comes back to you for approval.</span>
                  </div>
                </div>
              </div>
              {/* This box used to promise "jobs only within the assigned zone(s)" — which dispatch
                  did not do: zone ranked jobs, it never filtered them. Rather than leave a false
                  promise on screen, it now states the actual rule and points at the toggle that
                  changes it. */}
              <div style={{ display: 'flex', gap: 8, fontSize: 12, background: d.allow_outside_radius ? '#f0fdf4' : '#eef2ff', color: d.allow_outside_radius ? '#166534' : '#3730a3', padding: 10, borderRadius: 10, marginTop: 6 }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  {d.allow_outside_radius
                    ? 'Jobs in this zone are offered first, but the worker can still be offered nearby jobs elsewhere when their zone is quiet. Restrict this under Job Radius & Coverage below.'
                    : 'This worker will only be offered jobs inside this zone.'}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                Cluster, store and reporting manager are recorded for your own operations — jobs are matched on <strong>zone</strong>.
                A job radius is measured from the assigned store.
              </div>
            </Card>

            <Card>
              <SectionHead icon={<BadgeCheck size={16} />} title="Service Assignment" sub="Select the services this worker can perform." n={2} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {services.map((s) => {
                  const on = d.services.includes(s.name)
                  return (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={on} onChange={() => set('services', on ? d.services.filter((x) => x !== s.name) : [...d.services, s.name])} />
                      {s.name}
                    </label>
                  )
                })}
              </div>
              {/* This is the live capability set dispatch matches on — assigning it here IS the
                  approval, so it should be a deliberate act, not a default. */}
              <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                This is what dispatch matches jobs against. Anything the worker later claims in the app still needs your approval.
              </div>
            </Card>

            <Card>
              <SectionHead icon={<MapPin size={16} />} title="Job Radius & Coverage" sub="How far from their store this worker is offered jobs." n={3} />
              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>
                <Field label="Job Radius (from store)">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input value={d.job_radius_km} onChange={(e) => set('job_radius_km', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="No limit" style={{ flex: 1 }} />
                    <span className="muted" style={{ fontSize: 12.5 }}>KM</span>
                  </div>
                </Field>
                <Field label="Allow jobs outside the zone / radius">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 6 }}>
                    <input type="checkbox" checked={d.allow_outside_radius} onChange={(e) => set('allow_outside_radius', e.target.checked)} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{d.allow_outside_radius ? 'Yes' : 'No'}</span>
                  </div>
                </Field>
              </div>
              {/* Both states are real and both have a cost. Say which is which. */}
              <div style={{ display: 'flex', gap: 8, fontSize: 12, background: '#eff6ff', color: '#1e40af', padding: 10, borderRadius: 10, marginTop: 4 }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  {d.allow_outside_radius
                    ? 'Yes — their zone and radius rank jobs but do not restrict them. When their zone is quiet they can still be offered nearby work, so they are not left idle.'
                    : d.job_radius_km
                      ? `No — they are offered jobs only inside their zone AND within ${d.job_radius_km} km of their store. They will be offered nothing when their zone is quiet.`
                      : 'No — they are offered jobs only inside their zone. Set a radius to also limit the distance from their store.'}
                </span>
              </div>
              {!d.allow_outside_radius && d.job_radius_km && !d.store_id && (
                <div style={{ display: 'flex', gap: 8, fontSize: 12, background: '#fffbeb', color: '#92400e', padding: 10, borderRadius: 10, marginTop: 8 }}>
                  <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>The radius is measured from the assigned store, and no store is selected — pick one above or the radius will not apply.</span>
                </div>
              )}
            </Card>
          </>
        )}

        {step === 3 && (() => {
          const plan = plans.find((p) => String(p.id) === d.salary_plan_id)
          const inc = incPlans.find((p) => String(p.id) === d.incentive_plan_id)
          // The three cards filter the plan list by type; picking a type clears a plan of a
          // different type so the two never disagree.
          const typePlans = plans.filter((p) => p.salaryType === d.salary_type)
          const TYPE_CARDS: { type: Draft['salary_type']; icon: React.ReactNode; title: string; blurb: string }[] = [
            { type: 'fixed', icon: <Landmark size={18} />, title: 'Fixed Salary', blurb: 'Monthly fixed salary paid irrespective of job count' },
            { type: 'per_job', icon: <Briefcase size={18} />, title: 'Per Job', blurb: 'Pay based on number of jobs completed' },
            { type: 'hybrid', icon: <Layers size={18} />, title: 'Hybrid', blurb: 'Combination of fixed salary + per-job payments' },
          ]
          return (
            <>
              <Card>
                <SectionHead icon={<IndianRupee size={16} />} title="Salary Plan" sub="Select the salary structure and plan for this worker." />

                {/* Top: Salary Type on the left, plan + effective-from on the right (mock layout) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Salary Type <span style={{ color: '#dc2626' }}>*</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {TYPE_CARDS.map((c) => {
                        const on = d.salary_type === c.type
                        return (
                          <button key={c.type} onClick={() => { set('salary_type', c.type); if (plan && plan.salaryType !== c.type) set('salary_plan_id', '') }}
                            style={{
                              textAlign: 'left', padding: 14, borderRadius: 12, cursor: 'pointer', background: on ? '#eef2ff' : '#fff',
                              border: '1.5px solid ' + (on ? '#4f46e5' : 'var(--line,#e5e7eb)'), position: 'relative',
                            }}>
                            <span style={{ display: 'inline-grid', placeItems: 'center', width: 34, height: 34, borderRadius: 9, background: on ? '#4f46e5' : '#f1f5f9', color: on ? '#fff' : '#64748b', marginBottom: 8 }}>{c.icon}</span>
                            {on && <span style={{ position: 'absolute', top: 12, right: 12, color: '#4f46e5' }}><Check size={16} /></span>}
                            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{c.title}</div>
                            <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.4, marginTop: 2 }}>{c.blurb}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <Field label="Salary Plan">
                      <Dropdown value={d.salary_plan_id} width="100%"
                        disabled={typePlans.length === 0}
                        placeholder={typePlans.length ? 'Select Salary Plan (optional)' : 'No saved plans — enter amounts below'}
                        options={[{ value: '', label: 'None — enter amounts manually' }, ...typePlans.map((p) => ({ value: String(p.id), label: p.name }))]}
                        onChange={(v) => set('salary_plan_id', v)} />
                    </Field>
                    <button onClick={() => nav('/salary-plans')} style={{ background: 'none', border: 0, color: '#4f46e5', fontSize: 12, cursor: 'pointer', padding: '4px 0 8px' }}>+ Create New Plan</button>
                    {d.salary_type !== 'per_job' && (
                      <Field label="Effective From *">
                        <input type="date" value={d.salary_effective_from} onChange={(e) => set('salary_effective_from', e.target.value)} />
                      </Field>
                    )}
                  </div>
                </div>

                {/* Salary Details — editable ₹ fields, pre-filled from the plan, overridable per worker */}
                {d.salary_type !== 'per_job' && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line,#eef0f4)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Salary Details <span className="muted" style={{ fontWeight: 400 }}>({TYPE_LABEL[d.salary_type]})</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) minmax(0, 1.1fr)', gap: 12, alignItems: 'end' }}>
                      <RupeeField label="Monthly Basic Salary" required value={d.salary_basic} onChange={(v) => set('salary_basic', v)} />
                      <RupeeField label="Attendance Bonus (Monthly)" value={d.salary_attendance} onChange={(v) => set('salary_attendance', v)} />
                      <RupeeField label="Other Allowance (Monthly)" value={d.salary_allowance} onChange={(v) => set('salary_allowance', v)} />
                      <div style={{ background: '#eef2ff', borderRadius: 10, padding: '10px 12px' }}>
                        <div className="muted" style={{ fontSize: 11 }}>Total Fixed Pay (Monthly)</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: '#4f46e5', marginTop: 2 }}>{rupee(salaryTotal)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 12, background: '#eff6ff', color: '#1e40af', padding: 10, borderRadius: 10, marginTop: 12 }}>
                      <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>Fixed salary is paid every month as per the payroll cycle. Picking a plan pre-fills these amounts — you can adjust them for this worker.</span>
                    </div>
                  </div>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={d.wallet_enabled} onChange={(e) => set('wallet_enabled', e.target.checked)} />
                  <span style={{ fontSize: 13 }}>Wallet enabled <span className="muted">— when off, they earn but can't withdraw</span></span>
                </label>
              </Card>

              <Card>
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <SectionHead icon={<Gift size={16} />} title="Incentive Plan" sub="Select the incentive / bonus plan for this worker." />
                  {inc && (
                    <button onClick={() => nav('/incentive-plans')} className="btn line" style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Eye size={14} /> View Plan Details
                    </button>
                  )}
                </div>
                {incPlans.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    No incentive plans yet. Create one under <em>Incentive Plans</em> to add per-job, attendance or quality bonuses.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
                    <div>
                      <Field label="Incentive Plan">
                        <Dropdown value={d.incentive_plan_id} width="100%" placeholder="None"
                          options={[{ value: '', label: 'None' }, ...incPlans.map((p) => ({ value: String(p.id), label: p.name }))]}
                          onChange={(v) => set('incentive_plan_id', v)} />
                      </Field>
                      <button onClick={() => nav('/incentive-plans')} style={{ background: 'none', border: 0, color: '#4f46e5', fontSize: 12, cursor: 'pointer', padding: '4px 0 0' }}>+ Create New Plan</button>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted,#667085)', marginBottom: 6 }}>
                        {inc ? 'Incentive Components (Included in Plan)' : 'Pick a plan to see its components'}
                      </div>
                      {inc && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          {/* All six, as the mockup draws them. A component the plan funds shows a
                              green tick; one it doesn't is greyed. The 'auto' ones pay themselves,
                              the rest the admin pays with Add Bonus — the tooltip says which. */}
                          {inc.components.map((c) => (
                            <div key={c.key} title={c.on ? c.detail + (c.auto ? '' : ' (paid manually)') : 'Not funded by this plan'}
                              style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', color: c.on ? 'inherit' : '#cbd5e1' }}>
                              <BadgeCheck size={14} color={c.on ? '#16a34a' : '#cbd5e1'} /> {c.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>

              <Card>
                <SectionHead icon={<IndianRupee size={16} />} title="Deductions & Others" sub="Statutory deductions apply your configured rates." />
                <div style={grid4}>
                  <Field label="PF Applicable">
                    <Dropdown value={d.pf_applicable ? 'yes' : 'no'} width="100%" options={YESNO} onChange={(v) => set('pf_applicable', v === 'yes')} />
                  </Field>
                  <Field label="ESI Applicable">
                    <Dropdown value={d.esi_applicable ? 'yes' : 'no'} width="100%" options={YESNO} onChange={(v) => set('esi_applicable', v === 'yes')} />
                  </Field>
                  <Field label="TDS Applicable">
                    <Dropdown value={d.tds_applicable ? 'yes' : 'no'} width="100%" options={YESNO} onChange={(v) => set('tds_applicable', v === 'yes')} />
                  </Field>
                  <Field label="Salary Payment Mode">
                    <Dropdown value={d.salary_payment_mode} width="100%" options={[{ value: 'bank', label: 'Bank Account' }, { value: 'upi', label: 'UPI' }]} onChange={(v) => set('salary_payment_mode', v as 'bank' | 'upi')} />
                  </Field>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 12, background: '#eff6ff', color: '#1e40af', padding: 10, borderRadius: 10, marginTop: 4 }}>
                  <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Deductions will be applied as per company policy and applicable laws.</span>
                </div>
              </Card>
            </>
          )
        })()}

        {step === 4 && (
          <Card>
            <SectionHead icon={<Send size={16} />} title="Review & Send Invitation" sub="Check this over before inviting them." />
            <div style={{ display: 'grid', gap: 2 }}>
              <Review label="Worker Name" value={[d.first_name, d.last_name].filter(Boolean).join(' ') || '--'} icon={<UserPlus size={14} />} />
              <Review label="Mobile" value={d.phone || '--'} icon={<Smartphone size={14} />} />
              <Review label="Email" value={d.email || 'Not given'} icon={<Mail size={14} />} />
              <Review label="Category" value={d.worker_category || '--'} icon={<Briefcase size={14} />} />
              <Review label="Employment" value={d.employment_type || '--'} icon={<Briefcase size={14} />} />
              <Review label="City / Zone" value={`${d.city || '--'} / ${zoneName}`} icon={<MapPin size={14} />} />
              <Review label="Shift" value={shifts.find((s) => String(s.id) === d.shift_def_id)?.name || 'No shift (flexible)'} icon={<Building2 size={14} />} />
              <Review label="Weekly Off" value={d.weekly_off.length ? d.weekly_off.join(', ') : 'Not set'} icon={<Building2 size={14} />} />
              <Review label="Services" value={d.services.length ? d.services.join(', ') : 'None yet'} icon={<BadgeCheck size={14} />} />
              <Review label="Coverage" value={d.allow_outside_radius ? 'Zone preferred; nearby jobs allowed' : `Restricted to zone${d.job_radius_km ? ` + ${d.job_radius_km} km of store` : ''}`} icon={<MapPin size={14} />} />
              <Review label="Salary Plan" value={planObj ? `${planObj.name} · ${TYPE_LABEL[planObj.salaryType]}${planObj.paysMonthly ? ` · ${rupee(planObj.totalFixedPay)}/mo` : ` · keeps ${planObj.workerKeeps}%`}` : `Platform default (${platformPct}% commission)`} icon={<IndianRupee size={14} />} />
              <Review label="Incentive Plan" value={incPlans.find((p) => String(p.id) === d.incentive_plan_id)?.name || 'None'} icon={<Gift size={14} />} />
              <Review label="Deductions" value={[d.pf_applicable && 'PF', d.esi_applicable && 'ESI', d.tds_applicable && 'TDS'].filter(Boolean).join(', ') || 'None'} icon={<IndianRupee size={14} />} />
              <Review label="Wallet" value={d.wallet_enabled ? 'Enabled' : 'Disabled'} icon={<IndianRupee size={14} />} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn line" disabled={busy} onClick={() => save(false)}>Save as Draft</button>
              <button className="btn" disabled={busy || !step1Ok} onClick={() => save(true)}>
                <Send size={15} /> {busy ? 'Working…' : 'Save & Send Invitation'}
              </button>
            </div>
            {/* An invite is an SMS to a real person. Say what the button does before it's pressed. */}
            <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              <strong>Save as Draft</strong> creates them as Pending — no message is sent and they can't sign in.
              <strong> Save &amp; Send Invitation</strong> texts them a link and lets them sign in to complete their own profile.
            </div>
          </Card>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn line" onClick={() => (step === 1 ? nav('/workers') : setStep((step - 1) as Step))}>
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 4 && (
            <button className="btn" disabled={!canAdvance} onClick={() => setStep((step + 1) as Step)}>
              Save &amp; Next <ChevronRight size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Summary rail. Step 3 swaps to a Salary Summary, matching the mockup. */}
      <div style={{ display: 'grid', gap: 14, position: 'sticky', top: 12 }}>
        {step === 3 ? (
          <>
            <Card>
              <strong style={{ fontSize: 14 }}>Salary Summary</strong>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                <Summary label="Salary Type" value={planObj ? TYPE_LABEL[planObj.salaryType] : TYPE_LABEL[d.salary_type]} />
                {planObj?.paysMonthly && <Summary label="Monthly Basic Salary" value={rupee(planObj.monthlyBasic)} />}
                {planObj?.paysMonthly && planObj.attendanceAllowance > 0 && <Summary label="Attendance Bonus" value={rupee(planObj.attendanceAllowance)} />}
                {planObj?.paysMonthly && planObj.otherAllowance > 0 && <Summary label="Other Allowance" value={rupee(planObj.otherAllowance)} />}
                {planObj?.paysMonthly && (
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--line,#eef0f4)' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>Total Fixed Pay (Monthly)</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#4f46e5' }}>{rupee(planObj.totalFixedPay)}</span>
                  </div>
                )}
                {planObj?.paysPerJob && <Summary label="Worker keeps" value={`${planObj.workerKeeps}% per job`} />}
                {(() => {
                  const inc = incPlans.find((p) => String(p.id) === d.incentive_plan_id)
                  const fixed = planObj?.paysMonthly ? planObj.totalFixedPay : 0
                  const hasEst = inc && (inc.estIncentiveMin > 0 || inc.estIncentiveMax > 0)
                  return (
                    <>
                      <Summary label="Incentive Plan" value={inc?.name || 'None'} />
                      {/* The estimate is the ADMIN's own figure, set on the plan — shown as a range,
                          labelled Est. Nothing here is computed by us: a new worker has no history to
                          average, so any number we invented would be fiction. Blank plan estimate → no lines. */}
                      {hasEst && <Summary label="Average Incentive (Est.)" value={`${rupee(inc!.estIncentiveMin)} – ${rupee(inc!.estIncentiveMax)}`} />}
                      {hasEst && planObj?.paysMonthly && (
                        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', marginTop: 4, borderRadius: 8, background: '#f0fdf4' }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#166534' }}>Total Earning Potential (Est.)</span>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#166534' }}>{rupee(fixed + inc!.estIncentiveMin)} – {rupee(fixed + inc!.estIncentiveMax)}</span>
                        </div>
                      )}
                    </>
                  )
                })()}
                <Summary label="Deductions" value={[d.pf_applicable && 'PF', d.esi_applicable && 'ESI', d.tds_applicable && 'TDS'].filter(Boolean).join(', ') || 'None'} />
              </div>
            </Card>

            <Card>
              <strong style={{ fontSize: 14 }}>Plan Features</strong>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {(planObj?.paysMonthly
                  ? ['Salary is credited to the worker\'s wallet by payroll', 'Deductions apply your configured statutory rates', 'Attendance and quality bonuses are checked each month']
                  : ['A per-job share is credited by the wallet as jobs complete', 'Any per-job incentive is added on top of the share']
                ).map((f) => (
                  <div key={f} style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
                    <BadgeCheck size={15} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} /> {f}
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', gap: 8 }}>
                <Info size={15} color="#4f46e5" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: 'var(--muted,#667085)', lineHeight: 1.5 }}>
                  You can change the salary and incentive plan any time from the worker's profile after onboarding.
                </div>
              </div>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <strong style={{ fontSize: 14 }}>Onboarding Summary</strong>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                <Summary label="Worker Name" value={[d.first_name, d.last_name].filter(Boolean).join(' ')} />
                <Summary label="Mobile Number" value={d.phone} />
                <Summary label="Zone" value={zoneName === '--' ? '' : zoneName} />
                <Summary label="Worker Category" value={d.worker_category} />
                <Summary label="Employment Type" value={d.employment_type} />
                <Summary label="Store" value={stores.find((x) => String(x.id) === d.store_id)?.name} />
                <Summary label="Initial Shift" value={shifts.find((x) => String(x.id) === d.shift_def_id)?.name} />
                <Summary label="Weekly Off" value={d.weekly_off.join(', ')} />
                <Summary label="Job Radius" value={d.job_radius_km ? `${d.job_radius_km} KM` : (d.allow_outside_radius ? 'No limit' : 'Zone only')} />
                <Summary label="Salary Plan" value={planObj ? `${planObj.name} (${TYPE_LABEL[planObj.salaryType]})` : undefined} />
                {planObj?.paysMonthly && <Summary label="Monthly Pay" value={rupee(planObj.totalFixedPay)} />}
                <Summary label="Incentive Plan" value={incPlans.find((p) => String(p.id) === d.incentive_plan_id)?.name} />
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>Status</span>
                  <Badge tone="amber" dot={false}>Pending Onboarding</Badge>
                </div>
              </div>
            </Card>

            <Card>
              <strong style={{ fontSize: 14 }}>What happens next?</strong>
              <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
                <Next n={1} title="Invitation is sent" body="They get an SMS with a link to the app." />
                <Next n={2} title="Worker completes registration" body="They fill in their personal details, documents, bank and skills themselves." />
                <Next n={3} title="You verify and approve" body="Documents, background, skills, training — all on their profile." />
                <Next n={4} title="Worker goes live" body="Once the checklist is clear, they can be assigned jobs." />
              </div>
            </Card>

            <Card>
              <strong style={{ fontSize: 13 }}>Worth knowing</strong>
              <ul style={{ fontSize: 12, color: 'var(--muted,#667085)', paddingLeft: 16, margin: '6px 0 0' }}>
                <li>The mobile number is their login — make sure it's right. It can't be shared with another worker.</li>
                <li>They complete their own personal details, so you don't need them here.</li>
              </ul>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

const grid4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 4 }

function SectionHead({ icon, title, sub, n }: { icon: React.ReactNode; title: string; sub: string; n?: number }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: '#eef2ff', color: '#4f46e5', display: 'grid', placeItems: 'center' }}>
        {n ?? icon}
      </span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12 }}>{sub}</div>
      </div>
    </div>
  )
}

function RupeeField({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="field" style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, color: 'var(--muted,#667085)', marginBottom: 5 }}>{label}{required && <span style={{ color: '#dc2626' }}> *</span>}</span>
      <span style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--line,#e5e7eb)', borderRadius: 9, background: '#fff', overflow: 'hidden' }}>
        <span style={{ padding: '9px 10px', color: '#94a3b8', background: '#f8fafc', borderRight: '1px solid var(--line,#e5e7eb)' }}>₹</span>
        <input value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="0"
          style={{ border: 0, outline: 'none', padding: '9px 11px', fontSize: 13, width: '100%', background: 'transparent' }} />
      </span>
    </label>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ padding: 10, borderRadius: 10, background: accent ? '#eef2ff' : '#f8fafc', border: '1px solid var(--line,#eef0f4)' }}>
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: accent ? '#4f46e5' : 'inherit', marginTop: 2 }}>{value}</div>
    </div>
  )
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
      <span className="muted" style={{ fontSize: 12.5 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: strong ? 700 : 500, color: strong ? '#4f46e5' : 'inherit' }}>{value}</span>
    </div>
  )
}

function Summary({ label, value }: { label: string; value?: string }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: 12.5 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: value ? 600 : 400, color: value ? 'inherit' : '#cbd5e1' }}>{value || '--'}</span>
    </div>
  )
}

function Review({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line,#eef0f4)' }}>
      <span style={{ color: '#94a3b8' }}>{icon}</span>
      <span className="muted" style={{ fontSize: 12.5, width: 130 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function Next({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <span style={{ width: 20, height: 20, borderRadius: 999, background: '#eef2ff', color: '#4f46e5', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{n}</span>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</div>
        <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  )
}
