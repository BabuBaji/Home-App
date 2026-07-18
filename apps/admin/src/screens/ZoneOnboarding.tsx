import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Info, Map as MapIcon, Building2, Sparkles, Gauge, IndianRupee, Clock3, Users, Rocket,
  Plus, ChevronLeft, ChevronRight, Check, Search, Trash2, ArrowLeft, CheckCircle2, Upload,
  Store, Factory, MapPin, Maximize2, Layers, Hash, GripVertical, Pencil, ShieldCheck,
  Droplets, UtensilsCrossed, Wind, Shirt, Fan, Sofa, Grid3x3,
} from 'lucide-react'
import { useToast, useConfirm, Dropdown } from '../components/UI'
import { fetchZones, createZone, updateZone, deleteZone, fetchWorkers, fetchServices, fetchInvoiceInfo, opList, API_BASE } from '../api'
import ZoneDashboard from './ZoneDashboard'
import ZoneAdminDashboard from './ZoneAdminDashboard'
import '../zones/zones.css'

/* ───────── types ───────── */
import type { Apt, Person, ZoneConfig, BZone } from '../zones/types'

/* ───────── constants ───────── */
type Svc = { id: string; name: string; price: number; category?: string; desc?: string; image?: string; durationMin?: number; gstPct?: number }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const uid = () => Math.random().toString(36).slice(2, 9)
// Maps a service to a crisp vector icon + pastel tile (stored emoji icons are corrupted & photos aren't hosted).
function serviceVisual(name: string): { Icon: typeof Sparkles; bg: string; fg: string } {
  const n = (name || '').toLowerCase()
  if (/mop|sweep/.test(n)) return { Icon: Sparkles, bg: '#EDE9FE', fg: '#6D28D9' }
  if (/bath|toilet/.test(n)) return { Icon: Droplets, bg: '#DBEAFE', fg: '#2563EB' }
  if (/kitchen|dish|utensil/.test(n)) return { Icon: UtensilsCrossed, bg: '#FEF3C7', fg: '#B45309' }
  if (/dust/.test(n)) return { Icon: Wind, bg: '#EDE9FE', fg: '#7C3AED' }
  if (/laundr|wash|iron|cloth/.test(n)) return { Icon: Shirt, bg: '#DCFCE7', fg: '#047857' }
  if (/fan/.test(n)) return { Icon: Fan, bg: '#CCFBF1', fg: '#0D9488' }
  if (/window|glass|grill/.test(n)) return { Icon: Grid3x3, bg: '#FCE7F3', fg: '#DB2777' }
  if (/sofa|upholster/.test(n)) return { Icon: Sofa, bg: '#FFEDD5', fg: '#EA580C' }
  if (/deep|saniti/.test(n)) return { Icon: Sparkles, bg: '#D1FAE5', fg: '#059669' }
  return { Icon: Sparkles, bg: '#F1F5F9', fg: '#475569' }
}
// Real service photo (hosted by catalog at /api/services-media) with a graceful icon-tile fallback.
function ServiceThumb({ name, image }: { name: string; image?: string }) {
  const v = serviceVisual(name)
  const [err, setErr] = useState(false)
  const src = image ? API_BASE + image.replace('/services/', '/api/services-media/') : ''
  if (src && !err) return <img src={src} alt="" onError={() => setErr(true)} style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover', flex: 'none' }} />
  return <span style={{ width: 38, height: 38, borderRadius: 10, background: v.bg, color: v.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><v.Icon size={19} /></span>
}

function defaultConfig(): ZoneConfig {
  return {
    coverage: { mode: 'radius', radiusKm: 5, lat: 17.4419, lng: 78.3915, pincodes: [] },
    apartments: [],
    services: [],
    pricing: {},
    pricingExtras: { gst: 18, convenienceFee: 19, minOrder: 149, discount: 0, includeGst: true, useDefault: false },
    peakHours: { enabled: false, upliftPct: 15, windows: [] },
    capacity: {
      maxOrders: 120, workersRequired: 25, minOnline: 8, maxEtaMin: 20, maxTravelKm: 5,
      maxConcurrentPerWorker: 2, bufferWorkers: 3, utilizationTarget: 80,
      jobStartWindowMin: 30, jobCompletionSlaMin: 60, graceTimeMin: 10, cancellationThreshold: 15,
    },
    workingHours: { is247: false, days: Object.fromEntries(DAYS.map((d) => [d, { open: '06:00', close: '21:00', closed: false, brStart: '13:00', brEnd: '14:00' }])), breakTime: { enabled: false, start: '13:00', end: '14:00' }, specialHours: [] },
    holidays: [],
    team: { teamLeaders: [], workers: [] },
    goLive: { enableBookings: true, instant: true, scheduled: true, autoAssign: true },
    zoneType: 'Residential',
  }
}

/* ═══════════════════════════════════ ROOT ═══════════════════════════════════ */
export default function ZoneOnboarding() {
  const [zones, setZones] = useState<BZone[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'list' | 'wizard' | 'dashboard'>('list')
  const [tab, setTab] = useState<'overview' | 'zones'>('overview')
  const [editing, setEditing] = useState<BZone | null>(null)
  const toast = useToast()
  const confirm = useConfirm()

  const load = () => { setLoading(true); fetchZones().then((z) => setZones(z as unknown as BZone[])).catch(() => toast('Could not load zones', 'err')).finally(() => setLoading(false)) }
  useEffect(load, [])

  if (mode === 'wizard') return <ZoneWizard zone={editing} onDone={() => { setMode('list'); setEditing(null); load() }} onCancel={() => { setMode(editing ? 'dashboard' : 'list') }} />
  if (mode === 'dashboard' && editing) return <ZoneDashboard zone={editing} onBack={() => { setMode('list'); setEditing(null); load() }} onEdit={() => setMode('wizard')} />

  const openWizard = () => { setEditing(null); setMode('wizard') }
  const openZone = (z: BZone) => { setEditing(z); setMode('dashboard') }
  const del = async (z: BZone) => {
    if (!(await confirm({ title: `Delete zone "${z.name}"?`, message: 'This permanently removes the zone and its setup. This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return
    deleteZone(z.id).then(() => { toast('Zone deleted', 'ok'); load() }).catch((e: Error) => toast(e.message, 'err'))
  }
  return (
    <div className="zo">
      <div className="zo-top">
        <p style={{ margin: 0, color: 'var(--zmut)', fontSize: 12.5, fontWeight: 600 }}>{zones.length} zones · {zones.filter((z) => z.status === 'live').length} active</p>
        <div className="spacer" style={{ flex: 1 }} />
        <div className="zo-seg">
          <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Dashboard</button>
          <button className={tab === 'zones' ? 'on' : ''} onClick={() => setTab('zones')}>All Zones</button>
        </div>
        <button className="zo-btn" onClick={openWizard}><Plus size={17} /> Create Zone</button>
      </div>
      {loading ? <div className="zo-empty"><div className="spinner" /><p style={{ marginTop: 10 }}>Loading zones…</p></div>
        : tab === 'overview' ? <ZoneAdminDashboard zones={zones} onCreate={openWizard} onOpenZone={openZone} onViewAllZones={() => setTab('zones')} />
        : zones.length === 0 ? <div className="zo-empty"><div className="e">🗺️</div><p>No zones yet. Create your first operational zone.</p></div>
          : (
            <div className="zo-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
              {zones.map((z) => {
                const apts = z.config?.apartments?.length || 0
                const svc = z.config?.services?.length || 0
                const live = z.status === 'live'
                return (
                  <div key={z.id} className="zo-zcard" onClick={() => { setEditing(z); setMode('dashboard') }}>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--zink)' }}>{z.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--zmut)', fontWeight: 700 }}>{z.code || '—'} · {z.city || '—'}</div>
                      </div>
                      <span className={'zo-chip ' + (live ? 'active' : z.status === 'paused' ? 'inactive' : 'planning')}><i />{live ? 'Active' : z.status === 'paused' ? 'Inactive' : 'Draft'}</span>
                    </div>
                    <div className="zo-mtiles" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginTop: 12, gap: 8 }}>
                      <div className="zo-mtile" style={{ padding: 10 }}><div className="l">Apartments</div><div className="v" style={{ fontSize: 17 }}>{apts}</div></div>
                      <div className="zo-mtile" style={{ padding: 10 }}><div className="l">Services</div><div className="v" style={{ fontSize: 17 }}>{svc}</div></div>
                      <div className="zo-mtile" style={{ padding: 10 }}><div className="l">Pincodes</div><div className="v" style={{ fontSize: 17 }}>{z.pincodeList?.length || 0}</div></div>
                    </div>
                    <div className="row" style={{ gap: 8, marginTop: 12 }}>
                      <button className="zo-btn" style={{ flex: 1, padding: '8px 12px' }} onClick={(e) => { e.stopPropagation(); setEditing(z); setMode('dashboard') }}>Dashboard</button>
                      <button className="zo-btn ghost" style={{ padding: '8px 12px' }} onClick={(e) => { e.stopPropagation(); setEditing(z); setMode('wizard') }}>Edit</button>
                      <button className="zo-btn ghost" title="Delete zone" style={{ padding: '8px 10px', color: '#EF4444' }} onClick={(e) => { e.stopPropagation(); del(z) }}><Trash2 size={15} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
    </div>
  )
}

/* ═══════════════════════════════════ WIZARD ═══════════════════════════════════ */
const STEPS = [
  { key: 'basic', title: 'Basic Information', Icon: Info },
  { key: 'coverage', title: 'Coverage Area', Icon: MapIcon },
  { key: 'apartments', title: 'Apartments / Localities', Icon: Building2 },
  { key: 'services', title: 'Services', Icon: Sparkles },
  { key: 'capacity', title: 'Capacity & SLA', Icon: Gauge },
  { key: 'pricing', title: 'Pricing', Icon: IndianRupee },
  { key: 'hours', title: 'Working Hours', Icon: Clock3 },
  { key: 'team', title: 'Assign Team', Icon: Users },
  { key: 'review', title: 'Review & Go Live', Icon: Rocket },
] as const

function ZoneWizard({ zone, onDone, onCancel }: { zone: BZone | null; onDone: () => void; onCancel: () => void }) {
  const toast = useToast()
  const [id, setId] = useState<number | null>(zone?.id ?? null)
  const [name, setName] = useState(zone?.name || '')
  const [code, setCode] = useState(zone?.code || '')
  const [city, setCity] = useState(zone?.city || '')
  const [state, setState] = useState(zone?.state || '')
  const [status, setStatus] = useState(zone?.status === 'live' ? 'Active' : zone?.status === 'paused' ? 'Inactive' : 'Active')
  const [cfg, setCfg] = useState<ZoneConfig>({ ...defaultConfig(), ...(zone?.config || {}) })
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [cities, setCities] = useState<{ name: string; state: string }[]>([])
  const [services, setServices] = useState<Svc[]>([])
  useEffect(() => { opList<{ name: string; state: string }>('cities').then(setCities).catch(() => {}) }, [])
  useEffect(() => {
    fetchServices().then((list) => {
      const svc: Svc[] = (list as unknown as Svc[]).map((s) => ({ id: s.id, name: s.name, price: s.price, category: s.category, desc: s.desc, image: s.image, durationMin: s.durationMin, gstPct: s.gstPct }))
      setServices(svc)
      // New zone → enable the first few services. We do NOT seed cfg.pricing: "Your Price" falls back
      // to the live catalogue base price, and only an explicit per-zone override is stored in cfg.pricing.
      setCfg((c) => (!zone && (!c.services || c.services.length === 0))
        ? { ...c, services: svc.slice(0, 4).map((s) => s.id) }
        : c)
    }).catch(() => {})
  }, [zone])

  const patch = (u: Partial<ZoneConfig>) => setCfg((c) => ({ ...c, ...u }))
  // Status on save: "Go Live" publishes; editing an ALREADY-published zone must NOT demote it back to
  // draft — the Active/Inactive toggle controls live vs paused. Only a never-published draft stays 'planned'.
  const wasPublished = zone?.status === 'live' || zone?.status === 'paused'
  const body = (goLive = false) => ({
    name: name.trim(), code: code.trim(), city, state,
    status: goLive ? 'live' : wasPublished ? (status === 'Inactive' ? 'paused' : 'live') : 'planned',
    pincodes: (cfg.coverage?.pincodes || []).join(','),
    slaMinutes: cfg.capacity?.maxEtaMin || null, config: { ...cfg, pricing: {} },  // base always from catalogue; only per-zone discounts are stored
  })
  const save = async (goLive = false): Promise<boolean> => {
    if (!name.trim()) { toast('Zone name is required', 'err'); setStep(0); return false }
    setSaving(true)
    try {
      if (id) await updateZone(id, body(goLive))
      else { const z = await createZone(body(goLive)) as unknown as BZone; setId(z.id) }
      setSaving(false); return true
    } catch { setSaving(false); toast('Save failed — check backend / admin role', 'err'); return false }
  }
  const next = async () => { if (await save()) setStep((s) => Math.min(STEPS.length - 1, s + 1)) }
  const goLive = async () => { if (await save(true)) setDone(true) }
  // Auto-save: persist the current step's edits before moving to any other step (Back / step-tabs / Edit links).
  const goToStep = async (i: number) => {
    const t = Math.max(0, Math.min(STEPS.length - 1, i))
    if (t === step) return
    if (name.trim() && await save()) toast('Saved ✓', 'ok')   // only savable once the zone has a name; otherwise just navigate
    setStep(t)
  }

  const checklist = [
    { label: 'Basic information', ok: !!(name && code && city) },
    { label: 'Coverage area', ok: (cfg.coverage?.pincodes?.length || 0) > 0 && (cfg.coverage?.radiusKm || 0) > 0 },
    { label: 'Apartments added', ok: (cfg.apartments?.length || 0) > 0 },
    { label: 'Services selected', ok: (cfg.services?.length || 0) > 0 },
    { label: 'Pricing added', ok: (cfg.services || []).every((k) => (cfg.pricing?.[k] ?? services.find((s) => s.id === k)?.price ?? 0) > 0) },
    { label: 'Capacity set', ok: (cfg.capacity?.workersRequired || 0) > 0 },
    { label: 'Working hours set', ok: !!cfg.workingHours },
    { label: 'Team assigned', ok: !!cfg.team?.manager },
  ]
  const ready = checklist.every((c) => c.ok)
  const missing = checklist.filter((c) => !c.ok).map((c) => c.label)

  if (done) return (
    <div className="zo">
      <div className="zo-panel" style={{ maxWidth: 520, margin: '40px auto' }}>
        <div className="zo-success">
          <div className="ring"><CheckCircle2 size={54} /></div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Zone Created Successfully!</h2>
          <p style={{ color: 'var(--zmut)', marginTop: 8 }}><b>{name}</b> is now live. Customers in this area can book services.</p>
          <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 22 }}>
            <button className="zo-btn" onClick={onDone}>Go to Zones</button>
            <button className="zo-btn ghost" onClick={() => { setDone(false); setStep(0); setId(null); setName(''); setCode(''); setCfg(defaultConfig()) }}>Create Another Zone</button>
          </div>
        </div>
      </div>
    </div>
  )

  const cur = STEPS[step]
  return (
    <div className="zo">
      <div className="zo-top">
        <button className="zo-btn line" onClick={onCancel}><ArrowLeft size={16} /> Zones</button>
        <div><h2>{name || 'New Zone'} {zone && <span className="zo-chip active" style={{ marginLeft: 6 }}><i />editing</span>}</h2><p>Zone Creation Wizard · step {step + 1} of {STEPS.length}</p></div>
      </div>
      <div className="zo-hsteps">
        {STEPS.map((s, i) => {
          const done = i < step, current = i === step
          return (
            <button key={s.key} className={'zo-hstep' + (current ? ' current' : '') + (done ? ' done' : '')} onClick={() => goToStep(i)}>
              <span className="zo-hstep-top">
                <span className={'zo-hstep-bar' + (i === 0 ? ' hide' : '') + (i <= step ? ' fill' : '')} />
                <span className="n">{done ? <Check size={14} /> : i + 1}</span>
                <span className={'zo-hstep-bar' + (i === STEPS.length - 1 ? ' hide' : '') + (i < step ? ' fill' : '')} />
              </span>
              <span className="t">{s.title}</span>
            </button>
          )
        })}
      </div>
      <div className="zo-wiz2">
        <div>
          <div className="zo-panel zo-wrap">
            <div className="zo-panel-h">
              <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><cur.Icon size={18} style={{ color: 'var(--zv)' }} /> {cur.title}</h3>
              <span className="sub">Step {step + 1} / {STEPS.length}</span>
            </div>
            <WizStep step={cur.key} {...{ name, setName, code, setCode, city, setCity, state, setState, status, setStatus, cfg, patch, checklist, ready, toast, cities, services, goTo: (k: string) => goToStep(STEPS.findIndex((s) => s.key === k)) }} />
          </div>
          <div className="zo-wiz-foot">
            <button className="zo-btn line" disabled={step === 0 || saving} onClick={() => goToStep(step - 1)}><ChevronLeft size={16} /> Back</button>
            <span style={{ fontSize: 12, fontWeight: 700, color: (step === STEPS.length - 1 && !ready) ? '#B45309' : 'var(--zmut)' }}>
              {saving ? 'Saving…' : (step === STEPS.length - 1 && !ready ? `${checklist.length - missing.length}/${checklist.length} ready — complete: ${missing.join(', ')}` : cur.title)}
            </span>
            {step < STEPS.length - 1
              ? <button className="zo-btn" disabled={saving} onClick={next}>Next <ChevronRight size={16} /></button>
              : <button className="zo-btn" disabled={saving || !ready} title={ready ? 'Publish this zone live' : 'Complete first: ' + missing.join(', ')} onClick={goLive}><Rocket size={16} /> Go Live</button>}
          </div>
        </div>
        <ZoneSummary name={name} code={code} city={city} state={state} status={status} cfg={cfg} step={step} saving={saving} ready={ready} onNext={next} onGoLive={goLive} />
      </div>
    </div>
  )
}

/* ───────── zone summary rail ───────── */
function ZoneSummary({ name, code, city, state, status, cfg, step, saving, ready, onNext, onGoLive }: {
  name: string; code: string; city: string; state: string; status: string
  cfg: ZoneConfig; step: number; saving: boolean; ready: boolean; onNext: () => void; onGoLive: () => void
}) {
  const cov = cfg.coverage
  // Serviceable area: πr² for a radius zone, ~4 km² per pincode otherwise. Reach is an estimate
  // from area density (~620 households/km²) plus mapped apartment units.
  const areaKm2 = cov?.mode === 'pincodes' ? cov.pincodes.length * 4 : cov ? Math.PI * cov.radiusKm * cov.radiusKm : 0
  const units = (cfg.apartments || []).reduce((a, x) => a + (x.units || 0), 0)
  const reach = Math.round(areaKm2 * 620) + units * 2
  const apts = cfg.apartments?.length || 0
  const svc = cfg.services?.length || 0
  const nextStep = STEPS[step + 1]
  const inactive = status === 'Inactive'
  const rows = [
    { Icon: Building2, l: 'Zone Name', v: name || '—' },
    { Icon: Hash, l: 'Zone Code', v: code || '—' },
    { Icon: MapPin, l: 'City', v: [city, state].filter(Boolean).join(', ') || '—' },
    { Icon: Maximize2, l: 'Area Size', v: areaKm2 ? `${areaKm2.toFixed(1)} km²` : '—' },
    { Icon: Users, l: 'Estimated Reach', v: reach ? `${reach.toLocaleString('en-IN')} Customers` : '—' },
    { Icon: Layers, l: 'Apartments / Localities', v: `${apts} Added` },
    { Icon: Sparkles, l: 'Services', v: `${svc} Selected` },
  ]
  return (
    <aside className="zo-sum">
      <h3>Zone Summary</h3>
      {rows.map((r) => (
        <div key={r.l} className="zo-sum-row">
          <span className="zo-sum-ic"><r.Icon size={16} /></span>
          <div><div className="l">{r.l}</div><div className="v">{r.v}</div></div>
        </div>
      ))}
      <div className="zo-sum-row">
        <span className="zo-sum-ic" style={{ background: inactive ? '#F1F5F9' : '#DCFCE7', color: inactive ? '#64748B' : '#15803D' }}><CheckCircle2 size={16} /></span>
        <div><div className="l">Status</div><div style={{ marginTop: 3 }}><span className={'zo-chip ' + (inactive ? 'inactive' : 'active')}><i />{status}</span></div></div>
      </div>
      <div className="zo-next">
        {nextStep ? (
          <>
            <div className="k">Next Step</div>
            <div className="d">Define the <b>{nextStep.title.toLowerCase()}</b> for this zone.</div>
            <button className="zo-btn" style={{ width: '100%', justifyContent: 'center' }} disabled={saving} onClick={onNext}>Continue <ChevronRight size={15} /></button>
          </>
        ) : (
          <>
            <div className="k">Ready to launch</div>
            <div className="d">{ready ? 'All checks complete — you can go live.' : 'Complete the checklist to go live.'}</div>
            <button className="zo-btn" style={{ width: '100%', justifyContent: 'center' }} disabled={saving || !ready} onClick={onGoLive}><Rocket size={15} /> Go Live</button>
          </>
        )}
      </div>
    </aside>
  )
}

/* ───────── step panels ───────── */
const F = ({ label, children }: { label: string; children: ReactNode }) => <label className="zo-f"><span>{label}</span>{children}</label>
const FH = ({ label, children, hint, req }: { label: string; children: ReactNode; hint?: string; req?: boolean }) => (
  <label className="zo-f"><span>{label}{req && <b className="req"> *</b>}</span>{children}{hint && <small className="zo-hint">{hint}</small>}</label>
)
type StepProps = {
  step: string
  name: string; setName: (v: string) => void; code: string; setCode: (v: string) => void
  city: string; setCity: (v: string) => void; state: string; setState: (v: string) => void
  status: string; setStatus: (v: string) => void
  cfg: ZoneConfig; patch: (u: Partial<ZoneConfig>) => void
  checklist: { label: string; ok: boolean }[]; ready: boolean
  toast: (s: string, k?: 'ok' | 'err') => void
  cities: { name: string; state: string }[]
  services: Svc[]
  goTo: (key: string) => void
}

/* ───────── review helpers ───────── */
function ReviewCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--zline)', borderRadius: 14, background: '#fff', padding: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <b style={{ fontSize: 13.5, color: 'var(--zink)' }}>{title}</b>
        <button onClick={onEdit} style={{ border: 'none', background: 'transparent', color: '#6D28D9', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Pencil size={12} /> Edit</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>{children}</div>
    </div>
  )
}
function RRow({ l, children }: { l: string; children: ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
      <span style={{ fontSize: 12, color: 'var(--zmut)', flex: 'none' }}>{l}</span>
      <span style={{ fontSize: 12.5, color: 'var(--zink)', fontWeight: 600, textAlign: 'right' }}>{children}</span>
    </div>
  )
}
// Maps each readiness-checklist label to the wizard step that satisfies it (for click-to-jump).
const CHECK_STEP: Record<string, string> = {
  'Basic information': 'basic', 'Coverage area': 'coverage', 'Apartments added': 'apartments',
  'Services selected': 'services', 'Pricing added': 'pricing', 'Capacity set': 'capacity',
  'Working hours set': 'hours', 'Team assigned': 'team',
}

function WizStep(p: StepProps) {
  const { step, cfg, patch, toast } = p
  // Real apartment suggestions from the catalog backend, scoped to the selected city.
  // Falls back to no chips (manual/CSV only) when the city has no saved apartments.
  const [aptSuggest, setAptSuggest] = useState<string[]>([])
  const [spDraft, setSpDraft] = useState({ label: '', date: '', open: '10:00', close: '18:00' })
  const [spOpen, setSpOpen] = useState(false)
  const [aptTab, setAptTab] = useState<'manual' | 'bulk'>('manual')
  const [aptQ, setAptQ] = useState('')
  const [aptEdit, setAptEdit] = useState<string | null>(null)
  // Zone pincode drives the coverage centre: on a full 6-digit pincode, geocode it and recentre the map.
  const setZonePincode = (raw: string) => {
    const pin = raw.replace(/\D/g, '').slice(0, 6)
    patch({ coverage: { ...cfg.coverage!, mode: 'radius', pincodes: pin ? [pin] : [] } })
    if (/^\d{6}$/.test(pin)) geocodePincode(pin).then((g) => { if (g) patch({ coverage: { ...cfg.coverage!, mode: 'radius', pincodes: [pin], lat: g.lat, lng: g.lng } }) })
  }
  useEffect(() => {
    opList<{ name?: string; city?: string }>('apartments')
      .then((rows) => {
        const names = rows
          .filter((r) => !p.city || !r.city || String(r.city).toLowerCase() === p.city.toLowerCase())
          .map((r) => r.name)
          .filter((n): n is string => !!n)
        setAptSuggest([...new Set(names)])
      })
      .catch(() => setAptSuggest([]))
  }, [p.city])

  if (step === 'basic') return (
    <div className="zo-fgrid">
      <F label="Zone Name *"><input value={p.name} onChange={(e) => p.setName(e.target.value)} placeholder="e.g. Madhapur" /></F>
      <F label="Zone Code *"><input value={p.code} onChange={(e) => p.setCode(e.target.value.toUpperCase())} placeholder="MDP001" /></F>
      <F label="City"><select value={p.city} onChange={(e) => { const c = p.cities.find((x) => x.name === e.target.value); p.setCity(e.target.value); if (c) p.setState(c.state) }}><option value="">Select city</option>{p.cities.map((c) => <option key={c.name}>{c.name}</option>)}</select></F>
      <F label="State"><input value={p.state} readOnly placeholder="Auto-filled from city" /></F>
      <F label="Pincode"><input value={cfg.coverage?.pincodes?.[0] || ''} onChange={(e) => setZonePincode(e.target.value)} placeholder="e.g. 500081 — centres the coverage map" inputMode="numeric" /></F>
      <F label="Status"><select value={p.status} onChange={(e) => p.setStatus(e.target.value)}><option>Active</option><option>Inactive</option></select></F>
      <label className="zo-f" style={{ gridColumn: '1 / -1' }}><span>Description</span>
        <input value={cfg.description || ''} onChange={(e) => patch({ description: e.target.value })} placeholder="Short description of this zone" />
      </label>
    </div>
  )

  if (step === 'coverage') {
    const cov = cfg.coverage!
    const pin = cov.pincodes?.[0] || ''
    return (
      <div className="zo-grid" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <div>
          <CoverageMap cov={{ ...cov, mode: 'radius' }} onChange={(c) => patch({ coverage: { ...c, mode: 'radius' } })} />
        </div>
        <div>
          <F label="Zone Pincode">
            <input value={pin} onChange={(e) => setZonePincode(e.target.value)} placeholder="e.g. 500081" inputMode="numeric" />
          </F>
          <F label={`Coverage Radius — ${cov.radiusKm} km`}>
            <input type="range" min={1} max={15} step={0.5} value={cov.radiusKm} onChange={(e) => patch({ coverage: { ...cov, mode: 'radius', radiusKm: +e.target.value } })} />
          </F>
          <div className="zo-fgrid" style={{ marginTop: 12 }}>
            <F label="Latitude"><input type="number" value={cov.lat} onChange={(e) => patch({ coverage: { ...cov, mode: 'radius', lat: +e.target.value } })} /></F>
            <F label="Longitude"><input type="number" value={cov.lng} onChange={(e) => patch({ coverage: { ...cov, mode: 'radius', lng: +e.target.value } })} /></F>
          </div>
          <p style={{ fontSize: 12, color: 'var(--zmut)', marginTop: 10 }}>Enter the pincode to centre the map, then drag the marker or slide the radius to set the serviceable area.</p>
        </div>
      </div>
    )
  }

  if (step === 'apartments') {
    const apts = cfg.apartments || []
    const updateApt = (id: string, u: Partial<Apt>) => patch({ apartments: apts.map((a) => a.id === id ? { ...a, ...u } : a) })
    const del = (id: string) => patch({ apartments: apts.filter((a) => a.id !== id) })
    const addApt = () => { const id = uid(); patch({ apartments: [...apts, { id, name: aptQ.trim(), type: 'Apartment', cluster: '', units: 0 }] }); setAptEdit(id); setAptQ('') }
    const filtered = aptQ ? apts.filter((a) => (a.name + ' ' + (a.type || '') + ' ' + (a.cluster || '')).toLowerCase().includes(aptQ.toLowerCase())) : apts
    const totalUnits = apts.reduce((s, a) => s + (a.units || 0), 0)
    return (
      <div>
        <div style={{ fontSize: 12.5, color: 'var(--zmut)', marginBottom: 12 }}>Add all apartments, societies and localities that fall under this zone.</div>
        <div className="zo-seg" style={{ marginBottom: 14 }}>
          <button className={aptTab === 'manual' ? 'on' : ''} onClick={() => setAptTab('manual')}>Add Manually</button>
          <button className={aptTab === 'bulk' ? 'on' : ''} onClick={() => setAptTab('bulk')}>Bulk Upload</button>
        </div>

        {aptTab === 'bulk' ? (
          <div style={{ border: '1px dashed var(--zline)', borderRadius: 12, padding: 22, textAlign: 'center' }}>
            <Upload size={22} style={{ color: '#6D28D9' }} />
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>Upload a CSV of apartments / localities</div>
            <div style={{ fontSize: 12, color: 'var(--zmut)', margin: '4px 0 14px' }}>Columns: <b>name, type, cluster, units, pincode</b></div>
            <div style={{ display: 'inline-flex' }}><CsvBtn onRows={(rows) => { const add2 = rows.map((r) => ({ id: uid(), name: r.name || r.apartment || '', type: r.type || 'Apartment', cluster: r.cluster || '', units: +r.units || 0, pincode: r.pincode || '' })).filter((a) => a.name); if (add2.length) { patch({ apartments: [...apts, ...add2] }); toast(`Imported ${add2.length} apartments`, 'ok'); setAptTab('manual') } }} /></div>
          </div>
        ) : (
          <>
            <div className="row" style={{ gap: 8, marginBottom: 12 }}>
              <div className="searchbox" style={{ flex: 1 }}><Search size={16} /><input value={aptQ} onChange={(e) => setAptQ(e.target.value)} list="apt-suggest" placeholder="Search apartment, society or locality" onKeyDown={(e) => { if (e.key === 'Enter' && aptQ.trim()) addApt() }} /></div>
              <datalist id="apt-suggest">{aptSuggest.map((s) => <option key={s} value={s} />)}</datalist>
              <button className="zo-btn" onClick={addApt}><Plus size={15} /> Add</button>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--zink)', marginBottom: 8 }}>Selected Apartments / Localities ({apts.length})</div>
            <div className="tablewrap" style={{ overflowX: 'auto' }}>
              <table className="zo-table" style={{ width: '100%' }}>
                <thead><tr><th>Name</th><th>Type</th><th>Cluster (Optional)</th><th>Total Units</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {filtered.map((a) => {
                    const ed = aptEdit === a.id
                    const isApt = (a.type || 'Apartment') !== 'Locality'
                    return (
                      <tr key={a.id}>
                        <td>
                          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                            <span style={{ width: 30, height: 30, borderRadius: 8, background: isApt ? '#EDE9FE' : '#DCFCE7', color: isApt ? '#6D28D9' : '#047857', display: 'grid', placeItems: 'center', flex: 'none' }}>{isApt ? <Building2 size={15} /> : <MapPin size={15} />}</span>
                            {ed ? <input className="zo-edit" style={{ minWidth: 130 }} value={a.name} onChange={(e) => updateApt(a.id, { name: e.target.value })} placeholder="Name" autoFocus /> : <b style={{ fontSize: 13 }}>{a.name || '—'}</b>}
                          </div>
                        </td>
                        <td>{ed ? <Dropdown value={a.type || 'Apartment'} options={['Apartment', 'Society', 'Locality', 'Villa', 'Gated Community']} onChange={(v) => updateApt(a.id, { type: v })} width={160} /> : <span style={{ fontSize: 12.5, color: 'var(--zmut)' }}>{a.type || 'Apartment'}</span>}</td>
                        <td>{ed ? <input className="zo-edit" value={a.cluster || ''} onChange={(e) => updateApt(a.id, { cluster: e.target.value })} placeholder="Cluster" /> : <span style={{ fontSize: 12.5, color: 'var(--zmut)' }}>{a.cluster || '—'}</span>}</td>
                        <td>{ed ? <input className="zo-edit" type="number" value={a.units || 0} onChange={(e) => updateApt(a.id, { units: +e.target.value })} style={{ width: 100 }} /> : <span style={{ fontSize: 12.5 }}>{a.units ? a.units.toLocaleString('en-IN') : '–'}</span>}</td>
                        <td>
                          <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                            <button title={ed ? 'Done' : 'Edit'} onClick={() => setAptEdit(ed ? null : a.id)} style={{ border: 'none', background: 'transparent', color: ed ? '#16A34A' : '#6D28D9', cursor: 'pointer', padding: 4 }}>{ed ? <Check size={16} /> : <Pencil size={15} />}</button>
                            <button title="Delete" onClick={() => { del(a.id); if (ed) setAptEdit(null) }} style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer', padding: 4 }}><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--zmut)', fontSize: 12.5, padding: 18 }}>{apts.length === 0 ? 'No apartments yet — type a name and click Add, or use Bulk Upload.' : 'No matches.'}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, fontSize: 12.5, fontWeight: 600 }}>
              <span>Total Apartments / Localities: <b style={{ color: '#6D28D9' }}>{apts.length}</b></span>
              <span>Total Units: <b style={{ color: '#6D28D9' }}>{totalUnits.toLocaleString('en-IN')}</b></span>
            </div>
            <div style={{ marginTop: 14, background: '#F5F3FF', border: '1px solid #E9D5FF', borderRadius: 12, padding: 12, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--zmut)' }}>
              <span style={{ color: '#6D28D9', flex: 'none' }}>💡</span> Add all major apartments and localities in this zone to get accurate coverage and better order assignment.
            </div>
          </>
        )}
      </div>
    )
  }

  if (step === 'services') {
    const on = new Set(cfg.services || [])
    const toggle = (k: string) => { const n = new Set(on); n.has(k) ? n.delete(k) : n.add(k); patch({ services: [...n] }) }
    return (
      <div>
        <div style={{ fontSize: 12.5, color: 'var(--zmut)', marginBottom: 12 }}>Select the services that will be available in this zone.</div>
        <div className="row" style={{ gap: 8, marginBottom: 14 }}>
          <button className="zo-btn line" onClick={() => patch({ services: p.services.map((s) => s.id) })}>Select All</button>
          <button className="zo-btn line" onClick={() => patch({ services: [] })}>Clear All</button>
        </div>
        <div className="tablewrap" style={{ overflowX: 'auto' }}>
          <table className="zo-table" style={{ width: '100%' }}>
            <thead><tr><th>Service</th><th style={{ textAlign: 'right' }}>Available in Zone</th></tr></thead>
            <tbody>
              {p.services.length === 0 && <tr><td colSpan={2} className="sub" style={{ padding: 16 }}>Loading services from catalogue…</td></tr>}
              {p.services.map((s) => {
                const checked = on.has(s.id)
                return (
                  <tr key={s.id} onClick={() => toggle(s.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                        <ServiceThumb name={s.name} image={s.image} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--zink)' }}>{s.name}</div>
                          {s.desc && <div style={{ fontSize: 11.5, color: 'var(--zmut)', marginTop: 1 }}>{s.desc}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ width: 22, height: 22, borderRadius: 6, border: checked ? 'none' : '2px solid #cbd5e1', background: checked ? '#4F46E5' : '#fff', display: 'inline-grid', placeItems: 'center', color: '#fff', verticalAlign: 'middle' }}>{checked && <Check size={14} />}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14, background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 12, padding: 12, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--zmut)' }}>
          <Info size={15} style={{ color: '#4338CA', flex: 'none' }} /> <span><b style={{ color: '#4338CA' }}>Note:</b> You can enable/disable services for this zone anytime.</span>
        </div>
      </div>
    )
  }

  if (step === 'capacity') {
    const c = cfg.capacity!
    const set = (u: Partial<typeof c>) => patch({ capacity: { ...c, ...u } })
    const zt = cfg.zoneType || 'Residential'
    const opt = (n: number, unit: string) => <option key={n} value={n}>{n} {unit}</option>
    const ZONE_TYPES = [
      { key: 'Residential' as const, Icon: Building2, sub: 'Apartments, Flats, Societies' },
      { key: 'Commercial' as const, Icon: Store, sub: 'Offices, Shops, Complexes' },
      { key: 'Industrial' as const, Icon: Factory, sub: 'Factories, Warehouses, etc.' },
    ]
    return (
      <div className="zo-cap">
        {/* ── Capacity Settings ── */}
        <div className="zo-sech"><h4>Capacity Settings</h4></div>
        <div className="zo-fgrid three">
          <FH label="Maximum Orders Per Day" req hint="Maximum number of orders that can be accepted per day">
            <input type="number" value={c.maxOrders} onChange={(e) => set({ maxOrders: +e.target.value })} />
          </FH>
          <FH label="Workers Required" req hint="Recommended number of workers for this zone">
            <input type="number" value={c.workersRequired} onChange={(e) => set({ workersRequired: +e.target.value })} />
          </FH>
          <FH label="Minimum Online Workers" req hint="Minimum workers should be online to accept instant orders">
            <input type="number" value={c.minOnline} onChange={(e) => set({ minOnline: +e.target.value })} />
          </FH>
          <FH label="Maximum Concurrent Orders Per Worker" hint="Max orders a worker can handle at a time">
            <input type="number" value={c.maxConcurrentPerWorker ?? 2} onChange={(e) => set({ maxConcurrentPerWorker: +e.target.value })} />
          </FH>
          <FH label="Buffer Workers (Optional)" hint="Extra workers kept as buffer for demand spikes">
            <input type="number" value={c.bufferWorkers ?? 0} onChange={(e) => set({ bufferWorkers: +e.target.value })} />
          </FH>
          <FH label="Utilization Target" hint="Target daily utilization for this zone">
            <select value={c.utilizationTarget ?? 80} onChange={(e) => set({ utilizationTarget: +e.target.value })}>
              {[60, 65, 70, 75, 80, 85, 90, 95].map((n) => <option key={n} value={n}>{n}%</option>)}
            </select>
          </FH>
        </div>

        {/* ── SLA / Service Level ── */}
        <div className="zo-sech" style={{ marginTop: 22 }}><h4>SLA / Service Level</h4></div>
        <div className="zo-fgrid three">
          <FH label="Maximum ETA for Customer" req hint="Maximum promised arrival time">
            <select value={c.maxEtaMin} onChange={(e) => set({ maxEtaMin: +e.target.value })}>
              {[10, 15, 20, 30, 45, 60].map((n) => opt(n, 'mins'))}
            </select>
          </FH>
          <FH label="Maximum Travel Distance" req hint="Maximum distance worker can travel">
            <select value={c.maxTravelKm} onChange={(e) => set({ maxTravelKm: +e.target.value })}>
              {[2, 3, 5, 7, 10, 15].map((n) => opt(n, 'KM'))}
            </select>
          </FH>
          <FH label="Job Start Window" req hint="Time window to start the job after arrival">
            <select value={c.jobStartWindowMin ?? 30} onChange={(e) => set({ jobStartWindowMin: +e.target.value })}>
              {[15, 20, 30, 45, 60].map((n) => opt(n, 'mins'))}
            </select>
          </FH>
          <FH label="Job Completion SLA" req hint="Average time to complete standard service">
            <select value={c.jobCompletionSlaMin ?? 60} onChange={(e) => set({ jobCompletionSlaMin: +e.target.value })}>
              {[30, 45, 60, 90, 120, 180].map((n) => opt(n, 'mins'))}
            </select>
          </FH>
          <FH label="Grace Time for Delay" hint="Additional time before marking delay">
            <select value={c.graceTimeMin ?? 10} onChange={(e) => set({ graceTimeMin: +e.target.value })}>
              {[5, 10, 15, 20, 30].map((n) => opt(n, 'mins'))}
            </select>
          </FH>
          <FH label="Cancellation Threshold" hint="If daily cancellations exceed this threshold">
            <select value={c.cancellationThreshold ?? 15} onChange={(e) => set({ cancellationThreshold: +e.target.value })}>
              {[5, 10, 15, 20, 25, 30].map((n) => <option key={n} value={n}>{n}%</option>)}
            </select>
          </FH>
        </div>

        <div className="zo-note"><Info size={15} /><span>These limits help maintain quality of service and ensure timely delivery to customers.</span></div>

        {/* ── Zone Type ── */}
        <div className="zo-sech" style={{ marginTop: 22 }}><h4>Zone Type <span className="opt">(Optional)</span></h4></div>
        <div className="zo-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {ZONE_TYPES.map(({ key, Icon, sub }) => (
            <div key={key} className={'zo-ztype' + (zt === key ? ' on' : '')} onClick={() => patch({ zoneType: key })}>
              <span className="radio">{zt === key && <span className="dot" />}</span>
              <span className="ic"><Icon size={20} /></span>
              <div><b>{key}</b><div className="s">{sub}</div></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'pricing') return <PricingStep cfg={cfg} patch={patch} services={p.services} />

  if (step === 'hours') {
    const wh = cfg.workingHours!
    const setDay = (d: string, u: Partial<{ open: string; close: string; closed: boolean; brStart: string; brEnd: string }>) => patch({ workingHours: { ...wh, days: { ...wh.days, [d]: { ...wh.days[d], ...u } } } })
    const sp = wh.specialHours || []
    const addSp = () => { if (!spDraft.label.trim()) return; patch({ workingHours: { ...wh, specialHours: [...sp, { id: uid(), label: spDraft.label.trim(), date: spDraft.date || undefined, open: spDraft.open, close: spDraft.close }] } }); setSpDraft({ label: '', date: '', open: '10:00', close: '18:00' }); setSpOpen(false) }
    const delSp = (id: string) => patch({ workingHours: { ...wh, specialHours: sp.filter((s) => s.id !== id) } })
    return (
      <div>
        <p style={{ fontSize: 12.5, color: 'var(--zmut)', margin: '-4px 0 16px' }}>Set the working days and time slots for this zone.</p>

        {/* ── Select Working Days ── */}
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <b style={{ fontSize: 13.5, color: 'var(--zink)' }}>Select Working Days</b>
          <label className="zo-dchk" onClick={() => patch({ workingHours: { ...wh, is247: !wh.is247 } })}>
            <span className="zo-cb sm">{wh.is247 && <Check size={12} />}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>24 × 7 Operations</span>
            <Info size={13} style={{ color: 'var(--zmut)' }} />
          </label>
        </div>
        <div className="zo-daypick">
          {DAYS.map((d) => {
            const on = wh.is247 || !wh.days[d].closed
            return (
              <label key={d} className={'zo-dchip' + (on ? ' on' : '')} onClick={() => !wh.is247 && setDay(d, { closed: !wh.days[d].closed })} style={wh.is247 ? { opacity: .55, cursor: 'not-allowed' } : undefined}>
                <span className="zo-cb sm">{on && <Check size={12} />}</span>{d}
              </label>
            )
          })}
        </div>

        {/* ── Set Working Hours table ── */}
        {!wh.is247 && (
          <>
            <b style={{ fontSize: 13.5, color: 'var(--zink)', display: 'block', margin: '20px 0 8px' }}>Set Working Hours</b>
            <div style={{ overflowX: 'auto', border: '1px solid var(--zline)', borderRadius: 14 }}>
              <table className="zo-table zo-whtable">
                <thead><tr><th style={{ width: 70 }}>Day</th><th>Working Hours</th><th>Break (Optional)</th><th style={{ width: 130 }}>Status</th></tr></thead>
                <tbody>
                  {DAYS.map((d) => {
                    const day = wh.days[d]
                    const off = day.closed
                    return (
                      <tr key={d} style={{ cursor: 'default' }}>
                        <td><b>{d}</b></td>
                        <td>
                          <div className="zo-timepair">
                            <input className="zo-mini" type="time" value={day.open} disabled={off} onChange={(e) => setDay(d, { open: e.target.value })} />
                            <span className="to">to</span>
                            <input className="zo-mini" type="time" value={day.close} disabled={off} onChange={(e) => setDay(d, { close: e.target.value })} />
                          </div>
                        </td>
                        <td>
                          <div className="zo-timepair">
                            <input className="zo-mini" type="time" value={day.brStart ?? '13:00'} disabled={off} onChange={(e) => setDay(d, { brStart: e.target.value })} />
                            <span className="to">to</span>
                            <input className="zo-mini" type="time" value={day.brEnd ?? '14:00'} disabled={off} onChange={(e) => setDay(d, { brEnd: e.target.value })} />
                          </div>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 9, alignItems: 'center' }}>
                            <button type="button" className={'zo-toggle' + (off ? '' : ' on')} onClick={() => setDay(d, { closed: !off })}><span /></button>
                            <span className={'zo-chip ' + (off ? 'inactive' : 'active')} style={{ padding: '3px 9px' }}>{off ? 'Closed' : 'Active'}</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="zo-note" style={{ marginTop: 14 }}><Info size={15} /><span>Orders will be accepted only within the working hours. You can add break time if workers are not available.</span></div>
          </>
        )}

        {/* ── Special Hours ── */}
        <div style={{ marginTop: 22, borderTop: '1px solid var(--zline)', paddingTop: 16 }}>
          <b style={{ fontSize: 13.5, color: 'var(--zink)' }}>Special Hours <span style={{ color: 'var(--zmut)', fontWeight: 600 }}>(Optional)</span></b>
          <p style={{ fontSize: 12, color: 'var(--zmut)', margin: '3px 0 12px' }}>Add special working hours for specific dates (festivals, events, maintenance etc.)</p>
          {sp.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {sp.map((s) => (
                <div key={s.id} className="zo-checkrow on"><span style={{ flex: 1, fontSize: 13 }}>✨ <b>{s.label}</b>{s.date ? ` · ${s.date}` : ''} · {s.open}–{s.close}</span><button className="zo-btn line" style={{ padding: 6 }} onClick={() => delSp(s.id)}><Trash2 size={13} /></button></div>
              ))}
            </div>
          )}
          {spOpen ? (
            <div style={{ border: '1px solid var(--zline)', borderRadius: 12, padding: 12 }}>
              <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input className="zo-mini" style={{ flex: 1, minWidth: 150, textAlign: 'left' }} placeholder="Label (e.g. Diwali)" value={spDraft.label} onChange={(e) => setSpDraft({ ...spDraft, label: e.target.value })} />
                <input className="zo-mini" type="date" style={{ width: 150, textAlign: 'left' }} value={spDraft.date} onChange={(e) => setSpDraft({ ...spDraft, date: e.target.value })} />
              </div>
              <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
                <input className="zo-mini" type="time" value={spDraft.open} onChange={(e) => setSpDraft({ ...spDraft, open: e.target.value })} />
                <span style={{ fontSize: 12, color: 'var(--zmut)' }}>to</span>
                <input className="zo-mini" type="time" value={spDraft.close} onChange={(e) => setSpDraft({ ...spDraft, close: e.target.value })} />
                <span style={{ flex: 1 }} />
                <button className="zo-btn line" style={{ padding: '7px 14px' }} onClick={() => { setSpOpen(false); setSpDraft({ label: '', date: '', open: '10:00', close: '18:00' }) }}>Cancel</button>
                <button className="zo-btn" style={{ padding: '7px 16px' }} onClick={addSp} disabled={!spDraft.label.trim()}>Add</button>
              </div>
            </div>
          ) : (
            <button className="zo-btn ghost" onClick={() => setSpOpen(true)}><Plus size={15} /> Add Special Hours</button>
          )}
        </div>
      </div>
    )
  }

  if (step === 'team') return <TeamStep cfg={cfg} patch={patch} />

  if (step === 'review') {
    const svcName = (k: string) => p.services.find((s) => s.id === k)?.name || k
    const svcNames = (cfg.services || []).map(svcName)
    const priceOf = (k: string) => p.services.find((s) => s.id === k)?.price ?? 0
    const priced = (cfg.services || []).filter((k) => priceOf(k) > 0)
    const prices = priced.map(priceOf)
    const pDiscounts = cfg.discounts || {}
    const pUseDefault = !!cfg.pricingExtras?.useDefault
    const effPrice = (k: string) => Math.round(priceOf(k) * (1 - (pUseDefault ? 0 : (pDiscounts[k] || 0)) / 100))
    const effPrices = priced.map(effPrice)
    const discountedCount = pUseDefault ? 0 : priced.filter((k) => (pDiscounts[k] || 0) > 0).length
    const areaKm2 = cfg.coverage?.mode !== 'pincodes' && cfg.coverage?.radiusKm ? +(Math.PI * cfg.coverage.radiusKm ** 2).toFixed(1) : null
    const pins = cfg.coverage?.pincodes || []
    const pinStr = pins.length ? pins.slice(0, 4).join(', ') + (pins.length > 4 ? ` +${pins.length - 4} more` : '') : '—'
    const units = (cfg.apartments || []).reduce((a, x) => a + (x.units || 0), 0)
    const estReach = Math.round((areaKm2 ? areaKm2 * 620 : 0) + units)   // households ≈ area density + mapped apartment units
    const cap = cfg.capacity
    const px = cfg.pricingExtras
    const wh = cfg.workingHours
    const days = wh ? Object.entries(wh.days || {}) : []
    const openDays = days.filter(([, d]) => !d.closed).map(([k]) => k)
    const firstOpen = days.map(([, d]) => d).find((d) => !d.closed)
    const fmtDays = (ds: string[]) => ds.length >= 6 ? `${ds[0]} – ${ds[ds.length - 1]}` : ds.join(', ') || '—'
    const tm = cfg.team || { teamLeaders: [], workers: [] }
    const statusOn = p.status === 'Active'
    return (
      <div>
        <div style={{ fontSize: 12.5, color: 'var(--zmut)', marginBottom: 14 }}>Review everything below. Use <b>Edit</b> on any section to jump back and change it, then <b>Go Live</b> when ready.</div>
        <div className="zo-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12, alignItems: 'start' }}>
          <ReviewCard title="Basic Information" onEdit={() => p.goTo('basic')}>
            <RRow l="Zone Name">{p.name || '—'}</RRow>
            <RRow l="Zone Code">{p.code || '—'}</RRow>
            <RRow l="City">{[p.city, p.state].filter(Boolean).join(', ') || '—'}</RRow>
            <RRow l="Area Size">{areaKm2 ? `${areaKm2} km²` : '—'}</RRow>
            <RRow l="Status"><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: statusOn ? '#ECFDF5' : '#F1F5F9', color: statusOn ? '#047857' : '#475569' }}>{p.status}</span></RRow>
          </ReviewCard>

          <ReviewCard title="Coverage Area" onEdit={() => p.goTo('coverage')}>
            <RRow l="Coverage">{cfg.coverage?.mode === 'pincodes' ? `${pins.length} pincodes` : `${cfg.coverage?.radiusKm || 0} km radius`}</RRow>
            <RRow l="Apartments / Societies">{(cfg.apartments?.length || 0)} Added</RRow>
            <RRow l="Pincodes">{pinStr}</RRow>
            <RRow l="Estimated Reach"><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: '#ECFDF5', color: '#047857' }}>~{estReach.toLocaleString('en-IN')} households</span></RRow>
          </ReviewCard>

          <ReviewCard title="Services" onEdit={() => p.goTo('services')}>
            <RRow l="Total Services">{svcNames.length} Selected</RRow>
            <div>
              <div style={{ fontSize: 12, color: 'var(--zmut)', marginBottom: 4 }}>Services Included</div>
              <div style={{ fontSize: 12.5, color: 'var(--zink)', fontWeight: 600, lineHeight: 1.5 }}>
                {svcNames.length ? svcNames.slice(0, 5).join(', ') + (svcNames.length > 5 ? ` +${svcNames.length - 5} more` : '') : '—'}
              </div>
            </div>
          </ReviewCard>

          <ReviewCard title="Capacity & SLA" onEdit={() => p.goTo('capacity')}>
            <RRow l="Max Orders / Day">{cap?.maxOrders ?? '—'}</RRow>
            <RRow l="Workers Required">{cap?.workersRequired ?? '—'}{cap?.minOnline ? ` (Min. Online: ${cap.minOnline})` : ''}</RRow>
            <RRow l="SLA - ETA">{cap?.maxEtaMin ? `${cap.maxEtaMin} mins` : '—'}</RRow>
            <RRow l="Cancellation Threshold">{cap?.cancellationThreshold != null ? `${cap.cancellationThreshold}%` : '—'}</RRow>
          </ReviewCard>

          <ReviewCard title="Pricing" onEdit={() => p.goTo('pricing')}>
            <RRow l="Total Services Priced">{priced.length} Services</RRow>
            <RRow l="Price Range">{prices.length ? `₹${Math.min(...prices)} - ₹${Math.max(...prices)}` : '—'}</RRow>
            {discountedCount > 0 && <RRow l="Discounts Applied">{discountedCount} of {priced.length} services</RRow>}
            {discountedCount > 0 && <RRow l="Effective Range"><span style={{ color: '#16A34A', fontWeight: 700 }}>₹{Math.min(...effPrices)} - ₹{Math.max(...effPrices)}</span></RRow>}
            <RRow l="Convenience Fee">{px?.convenienceFee != null ? `₹${px.convenienceFee}` : '—'}</RRow>
            <RRow l="Peak Surcharge">{cfg.peakHours?.enabled && cfg.peakHours.windows.length ? <span style={{ color: '#B45309', fontWeight: 700 }}>+{cfg.peakHours.upliftPct}% · {cfg.peakHours.windows.length} window{cfg.peakHours.windows.length > 1 ? 's' : ''}</span> : '—'}</RRow>
          </ReviewCard>

          <ReviewCard title="Working Hours" onEdit={() => p.goTo('hours')}>
            <RRow l="Availability">{wh?.is247 ? '24×7' : 'Scheduled'}</RRow>
            <RRow l="Working Days">{fmtDays(openDays)}</RRow>
            <RRow l="Working Hours">{wh?.is247 ? 'All day' : firstOpen ? `${firstOpen.open} - ${firstOpen.close}` : '—'}</RRow>
            <RRow l="Break Time">{wh?.is247 ? '—' : (firstOpen?.brStart && firstOpen?.brEnd ? `${firstOpen.brStart} - ${firstOpen.brEnd}` : (wh?.breakTime?.enabled ? `${wh.breakTime.start} - ${wh.breakTime.end}` : '—'))}</RRow>
            <RRow l="Special Hours">{(wh?.specialHours?.length || 0) ? `${wh!.specialHours!.length} Added` : '—'}</RRow>
          </ReviewCard>

          <ReviewCard title="Assigned Team" onEdit={() => p.goTo('team')}>
            <RRow l="Zone Manager">{tm.manager?.name || '—'}</RRow>
            <RRow l="Team Leaders">{tm.teamLeaders?.length || 0}</RRow>
            <RRow l="Backup Manager">{tm.backupManager?.name || '—'}</RRow>
            <RRow l="Support Contact">{tm.supportContact?.name || '—'}</RRow>
          </ReviewCard>

          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 14, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, color: '#B45309', marginBottom: 10 }}><ShieldCheck size={16} /> Go Live Readiness</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {p.checklist.map((c) => {
                const key = CHECK_STEP[c.label]
                return (
                  <button key={c.label} onClick={() => key && p.goTo(key)} title={key ? (c.ok ? `Edit: ${c.label}` : `Complete: ${c.label}`) : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.ok ? 'var(--zink)' : '#B45309', fontWeight: c.ok ? 400 : 600, background: 'transparent', border: 'none', padding: '2px 0', width: '100%', textAlign: 'left', cursor: key ? 'pointer' : 'default' }}>
                    <CheckCircle2 size={15} style={{ color: c.ok ? '#16A34A' : '#CBD5E1', flex: 'none' }} />
                    <span style={{ flex: 1 }}>{c.label}</span>
                    {!c.ok && key && <span style={{ fontSize: 11, fontWeight: 700 }}>Fix ›</span>}
                  </button>
                )
              })}
              <div className="row" style={{ gap: 8, alignItems: 'center', fontSize: 12.5, fontWeight: 700, color: p.ready ? '#15803D' : 'var(--zmut)', marginTop: 2 }}>
                <CheckCircle2 size={15} style={{ color: p.ready ? '#16A34A' : '#CBD5E1', flex: 'none' }} /> {p.ready ? 'Zone is ready to go live' : 'Complete all items to go live'}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}

/* ───────── team step — role-based hierarchy (managers / leads / workers auto-lookup) ───────── */
const initials = (n: string) => n.split(/\s+/).map((x) => x[0] || '').slice(0, 2).join('').toUpperCase()
const ROLE_TONE: Record<string, { bg: string; fg: string }> = {
  'Zone Manager': { bg: '#EEF2FF', fg: '#4338CA' },
  'Team Leader': { bg: '#ECFDF5', fg: '#047857' },
  'Worker': { bg: '#F1F5F9', fg: '#475569' },
}
function RoleBadge({ role }: { role?: string }) {
  const t = ROLE_TONE[role || 'Worker'] || ROLE_TONE.Worker
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>{role || 'Worker'}</span>
}
function PAvatar({ name }: { name: string }) {
  return <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#EDE9FE', color: '#6D28D9', display: 'grid', placeItems: 'center', fontSize: 11.5, fontWeight: 800, flex: 'none' }}>{initials(name)}</span>
}
function PersonRow({ p, badge, onRemove }: { p: Person; badge?: string; onRemove?: () => void }) {
  return (
    <div className="row" style={{ alignItems: 'center', gap: 12, padding: '8px 12px', border: '1px solid var(--zline)', borderRadius: 12, background: '#fff' }}>
      <PAvatar name={p.name} />
      <b style={{ fontSize: 12.5, minWidth: 110 }}>{p.name}</b>
      <span style={{ fontSize: 12, color: 'var(--zmut)', minWidth: 116 }}>{p.phone || '—'}</span>
      <span style={{ fontSize: 12, color: 'var(--zmut)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email || '—'}</span>
      <RoleBadge role={badge || p.role} />
      {onRemove && <button onClick={onRemove} title="Remove" style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer', padding: 4, display: 'grid', placeItems: 'center' }}><Trash2 size={15} /></button>}
    </div>
  )
}
// Consistent width for every team picker so labels, hints, and controls line up in one column.
const PICK_W = 360
const personOpts = (pool: Person[]) => pool.map((p) => ({ value: String(p.id), label: `${p.name}${p.phone ? ' · ' + p.phone : ''}` }))
function SinglePick({ label, hint, optional, value, pool, onPick }: {
  label: string; hint: string; optional?: boolean; value?: Person; pool: Person[]; onPick: (p?: Person) => void
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--zink)' }}>{label}{optional && <span style={{ color: 'var(--zmut)', fontWeight: 600 }}> (Optional)</span>}</div>
      <div style={{ fontSize: 12, color: 'var(--zmut)', margin: '2px 0 8px' }}>{hint}</div>
      {!pool.length ? (
        <p style={{ fontSize: 12, color: 'var(--zmut)', margin: 0 }}>No eligible people yet — set a worker’s role to “{label}” on the <b>Workers</b> page.</p>
      ) : value ? (
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}><PersonRow p={value} /></div>
          <div style={{ width: 170 }}><Dropdown value={String(value.id)} width={170} options={personOpts(pool)} onChange={(v) => onPick(pool.find((x) => x.id === +v))} placeholder="Change…" /></div>
          <button className="zo-btn line" style={{ padding: '9px 12px' }} onClick={() => onPick(undefined)}>Clear</button>
        </div>
      ) : (
        <div style={{ maxWidth: PICK_W }}>
          <Dropdown value="" options={personOpts(pool)} onChange={(v) => onPick(pool.find((x) => x.id === +v))} placeholder={`Select ${label.toLowerCase()}…`} />
        </div>
      )}
    </div>
  )
}
function MultiPick({ label, hint, addLabel, badge, items, pool, onAdd, onRemove }: {
  label: string; hint: string; addLabel: string; badge: string; items: Person[]; pool: Person[]
  onAdd: (id: number) => void; onRemove: (id: number) => void
}) {
  const avail = pool.filter((p) => !items.some((x) => x.id === p.id))
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--zink)' }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--zmut)', margin: '2px 0 8px' }}>{hint}</div>
      <div style={{ maxWidth: PICK_W }}>
        <Dropdown value="" disabled={!avail.length} options={personOpts(avail)} onChange={(v) => v && onAdd(+v)} placeholder={avail.length ? `＋ ${addLabel}` : 'None available'} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, maxWidth: 640 }}>
        {items.map((p) => <PersonRow key={p.id} p={p} badge={badge} onRemove={() => onRemove(p.id)} />)}
        {items.length === 0 && <p style={{ fontSize: 12, color: 'var(--zmut)', margin: '2px 0 0' }}>None added yet.</p>}
      </div>
    </div>
  )
}
function TeamStep({ cfg, patch }: { cfg: ZoneConfig; patch: (u: Partial<ZoneConfig>) => void }) {
  const [people, setPeople] = useState<Person[]>([])
  useEffect(() => {
    fetchWorkers('', 'all', 'all')
      .then((r) => setPeople((r.workers || []).map((w: { id: number; name: string; phone?: string; email?: string; designation?: string }) =>
        ({ id: w.id, name: w.name, phone: w.phone, email: w.email, role: w.designation || 'Worker' }))))
      .catch(() => {})
  }, [])
  const team = cfg.team || { teamLeaders: [], workers: [] }
  const setTeam = (u: Partial<NonNullable<ZoneConfig['team']>>) => patch({ team: { ...team, ...u } })
  const managers = people.filter((p) => p.role === 'Zone Manager')
  const leads = people.filter((p) => p.role === 'Team Leader')
  const workerPool = people.filter((p) => p.role === 'Worker')
  const addTo = (key: 'teamLeaders' | 'workers', id: number, pool: Person[]) => { const pn = pool.find((x) => x.id === id); if (pn && !team[key].some((x) => x.id === id)) setTeam({ [key]: [...team[key], pn] }) }
  const rmFrom = (key: 'teamLeaders' | 'workers', id: number) => setTeam({ [key]: team[key].filter((x) => x.id !== id) })
  return (
    <div style={{ maxWidth: 780 }}>
      <SinglePick label="Zone Manager" hint="Oversees daily operations and performance for this zone." value={team.manager} pool={managers} onPick={(p) => setTeam({ manager: p })} />
      <MultiPick label="Team Leaders" hint="Supervise the workers in this zone." addLabel="Add Team Leader" badge="Team Leader" items={team.teamLeaders} pool={leads} onAdd={(id) => addTo('teamLeaders', id, leads)} onRemove={(id) => rmFrom('teamLeaders', id)} />
      <MultiPick label="Field Workers" hint="Service pros who fulfil bookings in this zone." addLabel="Add Worker" badge="Worker" items={team.workers} pool={workerPool} onAdd={(id) => addTo('workers', id, workerPool)} onRemove={(id) => rmFrom('workers', id)} />
      <SinglePick label="Backup Manager" hint="Steps in when the zone manager is unavailable." optional value={team.backupManager} pool={managers} onPick={(p) => setTeam({ backupManager: p })} />
      <SinglePick label="Support Contact for Escalations" hint="Notified for critical issues in this zone." optional value={team.supportContact} pool={people} onPick={(p) => setTeam({ supportContact: p })} />
      <div style={{ background: '#F5F3FF', border: '1px solid #E9D5FF', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 800, color: '#6D28D9', marginBottom: 6 }}><Info size={14} /> About Team Roles</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--zmut)', lineHeight: 1.7 }}>
          <li><b>Zone Manager:</b> Full control over zone operations, workers, and performance.</li>
          <li><b>Team Leader:</b> Manages assigned workers and views zone operations.</li>
          <li><b>Backup Manager:</b> Notified if the zone manager is unavailable.</li>
        </ul>
      </div>
    </div>
  )
}

/* ───────── pricing step (service + add-on pricing) ───────── */
const DISCOUNTS = [0, 5, 10, 15, 20, 25, 30, 40, 50]
const DiscountSelect = ({ v, onChange, disabled }: { v: number; onChange: (n: number) => void; disabled?: boolean }) => (
  <Dropdown value={String(v)} width={150} disabled={disabled}
    options={DISCOUNTS.map((n) => ({ value: String(n), label: n === 0 ? 'No Discount' : `${n}% Off` }))}
    onChange={(x) => onChange(+x)} />
)
// Standard service durations (minutes) → H:MM label. 60→"1 hr", 90→"1:30 hr", 180→"3 hr".
const DURATION_PRESETS = [60, 90, 120, 150, 180]
const fmtDur = (m?: number) => {
  if (!m) return '—'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}:${String(r).padStart(2, '0')} hr` : `${h} hr`
}

function PricingStep({ cfg, patch, services }: { cfg: ZoneConfig; patch: (u: Partial<ZoneConfig>) => void; services: Svc[] }) {
  const [tab, setTab] = useState<'service' | 'addon'>('service')
  const ex = cfg.pricingExtras!
  const discounts = cfg.discounts || {}
  const custom = cfg.customServices || []
  const addons = cfg.addons || []
  const setExtra = (u: Partial<typeof ex>) => patch({ pricingExtras: { ...ex, ...u } })
  const setDiscount = (k: string, v: number) => patch({ discounts: { ...discounts, [k]: v } })
  const enabled = services.filter((s) => (cfg.services || []).includes(s.id))
  const rows: Svc[] = [...enabled, ...custom]
  const isCustom = (id: string) => id.startsWith('custom-')
  const [bulkDisc, setBulkDisc] = useState(0)
  // Platform GST mode drives how the preview splits tax: exclusive → GST added on top of Your Price;
  // inclusive → Your Price already contains GST (back it out). Falls back to exclusive (the default).
  const [gstIncl, setGstIncl] = useState(false)
  useEffect(() => { fetchInvoiceInfo().then((i) => setGstIncl(!!i.gstInclusive)).catch(() => {}) }, [])
  const applyAll = (n: number) => patch({ discounts: Object.fromEntries(rows.map((s) => [s.id, n])) })
  const peak = cfg.peakHours || { enabled: false, upliftPct: 15, windows: [] }
  const setPeak = (u: Partial<typeof peak>) => patch({ peakHours: { ...peak, ...u } })
  const [pkDraft, setPkDraft] = useState({ start: '18:00', end: '21:00' })
  const addPeak = () => { if (!pkDraft.start || !pkDraft.end) return; setPeak({ windows: [...peak.windows, { id: uid(), start: pkDraft.start, end: pkDraft.end }] }); setPkDraft({ start: '18:00', end: '21:00' }) }
  const delPeak = (id: string) => setPeak({ windows: peak.windows.filter((w) => w.id !== id) })

  const addCustom = () => patch({ customServices: [...custom, { id: 'custom-' + uid(), name: 'New Service', price: 199, durationMin: 60 }] })
  const editCustom = (id: string, u: Partial<{ name: string; price: number; durationMin: number }>) => patch({ customServices: custom.map((c) => c.id === id ? { ...c, ...u } : c) })
  const delCustom = (id: string) => patch({ customServices: custom.filter((c) => c.id !== id) })
  const addAddon = () => patch({ addons: [...addons, { id: 'ad-' + uid(), name: 'New Add-on', price: 99, discount: 0 }] })
  const editAddon = (id: string, u: Partial<{ name: string; price: number; discount: number }>) => patch({ addons: addons.map((a) => a.id === id ? { ...a, ...u } : a) })
  const delAddon = (id: string) => patch({ addons: addons.filter((a) => a.id !== id) })

  return (
    <div className="zo-price">
      <p style={{ fontSize: 12.5, color: 'var(--zmut)', margin: '-4px 0 14px' }}>Base prices come from the <b>Services</b> catalogue. Apply a per-zone offer to individual services or to all — <b>Your Price</b> and <b>GST</b> update automatically. GST is charged {gstIncl ? 'inclusive of' : 'on top of'} Your Price (set in <b>Settings</b>).</p>
      <div className="zo-pricebar">
        <div className="zo-seg">
          <button className={tab === 'service' ? 'on' : ''} onClick={() => setTab('service')}>Service Pricing</button>
          <button className={tab === 'addon' ? 'on' : ''} onClick={() => setTab('addon')}>Add-on Pricing</button>
        </div>
        {tab === 'service' && (
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--zink)' }}>Zone offer:</span>
            <div style={{ width: 140 }}><Dropdown value={String(bulkDisc)} width={140} options={DISCOUNTS.map((n) => ({ value: String(n), label: n === 0 ? 'No Discount' : `${n}% Off` }))} onChange={(v) => setBulkDisc(+v)} /></div>
            <button className="zo-btn line" style={{ padding: '8px 16px', fontSize: 13 }} onClick={() => applyAll(bulkDisc)}>Apply to all</button>
          </div>
        )}
      </div>

      {tab === 'service' ? (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="zo-table zo-ptable">
              <thead><tr><th style={{ width: 44 }}>#</th><th>Service</th><th>Duration (Avg.)</th><th>Base Price (₹)</th><th>Discount / Offer</th><th>Your Price (₹)</th><th>GST</th><th>Price incl. GST (₹)</th></tr></thead>
              <tbody>
                {rows.map((s, i) => {
                  const cust = isCustom(s.id)
                  const disc = discounts[s.id] || 0
                  const base = s.price
                  const your = Math.round(base * (1 - disc / 100))
                  // GST recomputes on the discounted "Your Price". Exclusive: tax = your × rate (added on top).
                  // Inclusive: Your Price already includes tax, so back it out → taxable = your ÷ (1+rate).
                  const rate = s.gstPct ?? 18
                  const gst = gstIncl ? your - Math.round(your / (1 + rate / 100)) : Math.round(your * rate / 100)
                  const incl = gstIncl ? your : your + gst
                  return (
                    <tr key={s.id} style={{ cursor: 'default' }}>
                      <td><div className="zo-grip"><GripVertical size={14} /><span>{i + 1}</span></div></td>
                      <td>{cust
                        ? <div className="row" style={{ gap: 6, alignItems: 'center' }}><input className="zo-mini" style={{ width: 150, textAlign: 'left' }} value={s.name} onChange={(e) => editCustom(s.id, { name: e.target.value })} /><button className="zo-iconbtn" onClick={() => delCustom(s.id)}><Trash2 size={13} /></button></div>
                        : <b>{s.name}</b>}</td>
                      <td style={{ color: 'var(--zmut)' }}>{cust
                        ? <Dropdown value={String(s.durationMin ?? 60)} width={112} options={DURATION_PRESETS.map((m) => ({ value: String(m), label: fmtDur(m) }))} onChange={(v) => editCustom(s.id, { durationMin: +v })} />
                        : fmtDur(s.durationMin)}</td>
                      <td style={{ color: 'var(--zmut)' }}>{cust ? <input className="zo-mini" value={s.price} onChange={(e) => editCustom(s.id, { price: +e.target.value })} /> : `₹${base}`}</td>
                      <td><DiscountSelect v={disc} onChange={(n) => setDiscount(s.id, n)} /></td>
                      <td>{disc > 0
                        ? <span><b style={{ color: '#16A34A' }}>₹{your}</b> <span style={{ color: 'var(--zmut)', textDecoration: 'line-through', fontSize: 12, marginLeft: 4 }}>₹{base}</span></span>
                        : <b>₹{base}</b>}</td>
                      <td style={{ color: 'var(--zmut)', whiteSpace: 'nowrap' }}>{gstIncl ? '' : '+'}₹{gst} <span style={{ fontSize: 11 }}>({rate}%)</span></td>
                      <td><b>₹{incl}</b></td>
                    </tr>
                  )
                })}
                {rows.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--zmut)', padding: 20 }}>No services selected. Go back to the Services step to add some.</td></tr>}
              </tbody>
            </table>
          </div>
          <button className="zo-btn ghost" style={{ marginTop: 12 }} onClick={addCustom}><Plus size={15} /> Add Custom Service</button>

          <div style={{ marginTop: 18, border: '1px solid var(--zline)', borderRadius: 14, padding: 14 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--zink)' }}>Peak-Hour Surcharge</div>
                <div style={{ fontSize: 12, color: 'var(--zmut)', marginTop: 2 }}>Add a % uplift during busy windows — applied to a booking whose slot falls in any window.</div>
              </div>
              <button type="button" className={'zo-toggle' + (peak.enabled ? ' on' : '')} onClick={() => setPeak({ enabled: !peak.enabled })}><span /></button>
            </div>
            {peak.enabled && (
              <div style={{ marginTop: 12 }}>
                <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>Uplift</span>
                  <div style={{ width: 120 }}><Dropdown value={String(peak.upliftPct)} width={120} options={[5, 10, 15, 20, 25, 30, 40, 50].map((n) => ({ value: String(n), label: `+${n}%` }))} onChange={(v) => setPeak({ upliftPct: +v })} /></div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--zink)', marginBottom: 8 }}>Peak windows</div>
                <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                  <input className="zo-mini" type="time" value={pkDraft.start} onChange={(e) => setPkDraft({ ...pkDraft, start: e.target.value })} />
                  <span style={{ fontSize: 12, color: 'var(--zmut)' }}>to</span>
                  <input className="zo-mini" type="time" value={pkDraft.end} onChange={(e) => setPkDraft({ ...pkDraft, end: e.target.value })} />
                  <button className="zo-btn" style={{ padding: '7px 10px' }} onClick={addPeak}><Plus size={14} /> Add window</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {peak.windows.map((w) => (
                    <div key={w.id} className="zo-checkrow on"><span style={{ flex: 1, fontSize: 13 }}>⏰ {w.start} – {w.end} <span style={{ color: 'var(--zmut)' }}>· +{peak.upliftPct}%</span></span><button className="zo-btn line" style={{ padding: 6 }} onClick={() => delPeak(w.id)}><Trash2 size={13} /></button></div>
                  ))}
                  {peak.windows.length === 0 && <p style={{ fontSize: 12, color: 'var(--zmut)', margin: 0 }}>No peak windows yet — add one above.</p>}
                </div>
              </div>
            )}
          </div>
          <div className="zo-note" style={{ marginTop: 16 }}><Info size={15} /><span>Prices are applicable for this zone only. Customers will see prices based on their location (zone).</span></div>
        </>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="zo-table zo-ptable">
              <thead><tr><th>Add-on</th><th>Price (₹)</th><th>Discount / Offer</th><th style={{ width: 44 }}></th></tr></thead>
              <tbody>
                {addons.map((a) => (
                  <tr key={a.id} style={{ cursor: 'default' }}>
                    <td><input className="zo-mini" style={{ width: 220, textAlign: 'left' }} value={a.name} onChange={(e) => editAddon(a.id, { name: e.target.value })} /></td>
                    <td><input className="zo-mini" value={a.price} onChange={(e) => editAddon(a.id, { price: +e.target.value })} /></td>
                    <td><DiscountSelect v={a.discount || 0} onChange={(n) => editAddon(a.id, { discount: n })} /></td>
                    <td><button className="zo-iconbtn" onClick={() => delAddon(a.id)}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
                {addons.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--zmut)', padding: 20 }}>No add-ons yet. Add extras like “Deep clean”, “Extra room”, etc.</td></tr>}
              </tbody>
            </table>
          </div>
          <button className="zo-btn ghost" style={{ marginTop: 12 }} onClick={addAddon}><Plus size={15} /> Add Add-on</button>
        </>
      )}

      {/* Payment & Charges */}
      <div className="zo-paycard">
        <div className="zo-sech"><h4>Payment &amp; Charges</h4></div>
        <div className="zo-fgrid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', alignItems: 'start' }}>
          <FH label="Convenience Fee (Customer)" hint="Charged to the customer per order">
            <select value={ex.convenienceFee} onChange={(e) => setExtra({ convenienceFee: +e.target.value })}>
              {[0, 10, 19, 25, 49].map((n) => <option key={n} value={n}>{n === 0 ? 'Free' : `₹${n}`}</option>)}
            </select>
          </FH>
          <FH label="Minimum Order Amount" hint="Smallest cart value allowed">
            <input type="number" value={ex.minOrder} onChange={(e) => setExtra({ minOrder: +e.target.value })} />
          </FH>
        </div>
        <div className="zo-note" style={{ marginTop: 14 }}><Info size={15} /><span>GST is set per service on the <b>Services</b> page. Whether prices show GST-inclusive or exclusive is a platform setting (Settings → General).</span></div>
      </div>
    </div>
  )
}

/* ───────── coverage map (leaflet radius) ───────── */
// Geocode an Indian pincode → centroid, via OSM Nominatim (no API key). Cached so
// re-renders / re-visits don't re-hit the API. Structured postalcode lookup first,
// free-form query as a fallback for pincodes Nominatim doesn't index structurally.
const pinCache = new Map<string, { lat: number; lng: number } | null>()
async function geocodePincode(pin: string): Promise<{ lat: number; lng: number } | null> {
  if (pinCache.has(pin)) return pinCache.get(pin)!
  const pick = (j: unknown) => (Array.isArray(j) && j[0] ? { lat: +(j[0] as { lat: string }).lat, lng: +(j[0] as { lon: string }).lon } : null)
  try {
    let j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&postalcode=${encodeURIComponent(pin)}`)).json()
    let res = pick(j)
    if (!res) { j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(pin + ', India')}`)).json(); res = pick(j) }
    pinCache.set(pin, res); return res
  } catch { return null }
}

function CoverageMap({ cov, onChange }: { cov: NonNullable<ZoneConfig['coverage']>; onChange: (c: NonNullable<ZoneConfig['coverage']>) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const pinLayerRef = useRef<L.LayerGroup | null>(null)
  const covRef = useRef(cov); covRef.current = cov
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange
  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = L.map(ref.current, { attributionControl: false }).setView([cov.lat, cov.lng], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    const marker = L.marker([cov.lat, cov.lng], { draggable: true }).addTo(map)
    const circle = L.circle([cov.lat, cov.lng], { radius: cov.radiusKm * 1000, color: '#4F46E5', fillColor: '#4F46E5', fillOpacity: 0.12 }).addTo(map)
    marker.on('move', (e) => { const ll = (e as unknown as { latlng: L.LatLng }).latlng; circle.setLatLng(ll) })
    marker.on('dragend', () => { const ll = marker.getLatLng(); onChangeRef.current({ ...covRef.current, lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5) }) })
    mapRef.current = map; markerRef.current = marker; circleRef.current = circle
    pinLayerRef.current = L.layerGroup().addTo(map)
    setTimeout(() => map.invalidateSize(), 200)
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Radius mode: keep the draggable marker + circle in sync with lat/lng/radius.
  useEffect(() => {
    if (cov.mode === 'pincodes') return
    circleRef.current?.setRadius(cov.radiusKm * 1000)
    circleRef.current?.setLatLng([cov.lat, cov.lng]); markerRef.current?.setLatLng([cov.lat, cov.lng])
  }, [cov.radiusKm, cov.lat, cov.lng, cov.mode])
  // Pincodes mode: geocode each entered pincode and plot it; radius mode: show the drag marker.
  useEffect(() => {
    const map = mapRef.current, marker = markerRef.current, circle = circleRef.current, pinLayer = pinLayerRef.current
    if (!map || !marker || !circle || !pinLayer) return
    if (cov.mode !== 'pincodes') {
      pinLayer.clearLayers()
      if (!map.hasLayer(marker)) marker.addTo(map)
      if (!map.hasLayer(circle)) circle.addTo(map)
      return
    }
    if (map.hasLayer(marker)) map.removeLayer(marker)
    if (map.hasLayer(circle)) map.removeLayer(circle)
    let cancelled = false
    ;(async () => {
      pinLayer.clearLayers()
      if (!cov.pincodes.length) return
      const found: [number, number][] = []
      for (const p of cov.pincodes) {
        const g = await geocodePincode(p)
        if (cancelled) return
        if (!g) continue
        found.push([g.lat, g.lng])
        L.circle([g.lat, g.lng], { radius: 2000, color: '#4F46E5', weight: 1.5, fillColor: '#4F46E5', fillOpacity: 0.12 }).addTo(pinLayer)
        L.marker([g.lat, g.lng]).bindTooltip(p, { direction: 'top' }).addTo(pinLayer)
      }
      if (cancelled || !found.length) return
      map.fitBounds(L.latLngBounds(found).pad(0.4), { maxZoom: 14 })
      // Reflect the covered pincodes' centroid into the stored zone centre (guarded to avoid loops).
      const clat = found.reduce((a, f) => a + f[0], 0) / found.length
      const clng = found.reduce((a, f) => a + f[1], 0) / found.length
      if (Math.abs(clat - covRef.current.lat) > 1e-4 || Math.abs(clng - covRef.current.lng) > 1e-4)
        onChangeRef.current({ ...covRef.current, lat: +clat.toFixed(5), lng: +clng.toFixed(5) })
    })()
    return () => { cancelled = true }
  }, [cov.mode, cov.pincodes.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} style={{ height: 360, width: '100%', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--zline)', background: '#eef0f4' }} />
}

/* ───────── pincode field (raw text kept locally so partial typing isn't filtered away) ───────── */
function PincodeField({ cov, patch }: { cov: NonNullable<ZoneConfig['coverage']>; patch: (u: Partial<ZoneConfig>) => void }) {
  // The stored `cov.pincodes` only keeps valid 6-digit codes. If we bound the input directly
  // to that, every partial keystroke ("5", "50"…) would be filtered out and the field would
  // snap back to empty — making it impossible to type. So hold the raw text locally and derive
  // the validated list on each change.
  const [text, setText] = useState(cov.pincodes.join(', '))
  return (
    <F label="Pincodes (comma separated)">
      <input
        value={text}
        onChange={(e) => {
          const raw = e.target.value
          setText(raw)
          patch({ coverage: { ...cov, pincodes: raw.split(/[\s,]+/).map((x) => x.trim()).filter((x) => /^\d{6}$/.test(x)) } })
        }}
        placeholder="500081, 500084, 500032"
      />
    </F>
  )
}

/* ───────── small helpers ───────── */
function ManualAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('')
  return (
    <div className="row" style={{ gap: 8 }}>
      <input className="zo-mini" style={{ flex: 1, textAlign: 'left', padding: '10px 12px' }} value={v} placeholder={placeholder}
        onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v); setV('') } }} />
      <button className="zo-btn" onClick={() => { if (v.trim()) { onAdd(v); setV('') } }}><Plus size={15} /> Add</button>
    </div>
  )
}
function CsvBtn({ onRows }: { onRows: (rows: Record<string, string>[]) => void }) {
  const id = useMemo(() => 'zc-' + Math.random().toString(36).slice(2, 7), [])
  const parse = (t: string) => {
    const lines = t.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim()); if (lines.length < 2) return []
    const h = lines[0].split(',').map((x) => x.trim().toLowerCase())
    return lines.slice(1).map((l) => { const c = l.split(','); const o: Record<string, string> = {}; h.forEach((k, i) => o[k] = (c[i] || '').trim()); return o })
  }
  return (
    <>
      <input id={id} type="file" accept=".csv" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) { onRows(parse(await f.text())); e.target.value = '' } }} />
      <label htmlFor={id} className="zo-btn ghost" style={{ cursor: 'pointer' }}><Upload size={15} /> Bulk Upload</label>
    </>
  )
}
