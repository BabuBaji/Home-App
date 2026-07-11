import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Info, Map as MapIcon, Building2, Sparkles, Gauge, IndianRupee, Clock3, Users, Rocket,
  Plus, ChevronLeft, ChevronRight, Check, Search, Trash2, ArrowLeft, CheckCircle2, Upload,
  Store, Factory, MapPin, Maximize2, Layers, Hash, GripVertical,
} from 'lucide-react'
import { useToast } from '../components/UI'
import { fetchZones, createZone, updateZone, fetchWorkers, fetchServices, opList } from '../api'
import ZoneDashboard from './ZoneDashboard'
import ZoneAdminDashboard from './ZoneAdminDashboard'
import '../zones/zones.css'

/* ───────── types ───────── */
import type { Apt, Person, ZoneConfig, BZone } from '../zones/types'

/* ───────── constants ───────── */
type Svc = { id: string; name: string; price: number; category?: string }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const APT_SUGGEST = ['Rainbow Vistas', 'Brigade Metropolis', 'Kalpataru Residency', 'My Home Bhooja', 'Mantri Celestia', 'Aparna Sarovar', 'Prestige High Fields']
const uid = () => Math.random().toString(36).slice(2, 9)

function defaultConfig(): ZoneConfig {
  return {
    coverage: { mode: 'radius', radiusKm: 5, lat: 17.4419, lng: 78.3915, pincodes: [] },
    apartments: [],
    services: [],
    pricing: {},
    pricingExtras: { gst: 18, convenienceFee: 19, minOrder: 149, discount: 0, includeGst: true, useDefault: false },
    capacity: {
      maxOrders: 120, workersRequired: 25, minOnline: 8, maxEtaMin: 20, maxTravelKm: 5,
      maxConcurrentPerWorker: 2, bufferWorkers: 3, utilizationTarget: 80,
      jobStartWindowMin: 30, jobCompletionSlaMin: 60, graceTimeMin: 10, cancellationThreshold: 15,
    },
    workingHours: { is247: false, days: Object.fromEntries(DAYS.map((d) => [d, { open: '08:00', close: '21:00', closed: false }])) },
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

  const load = () => { setLoading(true); fetchZones().then((z) => setZones(z as unknown as BZone[])).catch(() => toast('Could not load zones', 'err')).finally(() => setLoading(false)) }
  useEffect(load, [])

  if (mode === 'wizard') return <ZoneWizard zone={editing} onDone={() => { setMode('list'); setEditing(null); load() }} onCancel={() => { setMode(editing ? 'dashboard' : 'list') }} />
  if (mode === 'dashboard' && editing) return <ZoneDashboard zone={editing} onBack={() => { setMode('list'); setEditing(null); load() }} onEdit={() => setMode('wizard')} />

  const openWizard = () => { setEditing(null); setMode('wizard') }
  const openZone = (z: BZone) => { setEditing(z); setMode('dashboard') }
  return (
    <div className="zo">
      <div className="zo-top">
        <div><h2>Zone Operations</h2><p>{zones.length} zones · {zones.filter((z) => z.status === 'live').length} active</p></div>
        <div className="spacer" style={{ flex: 1 }} />
        <div className="zo-seg">
          <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Dashboard</button>
          <button className={tab === 'zones' ? 'on' : ''} onClick={() => setTab('zones')}>All Zones</button>
        </div>
        <button className="zo-btn" onClick={openWizard}><Plus size={17} /> Create Zone</button>
      </div>
      {loading ? <div className="zo-empty"><div className="spinner" /><p style={{ marginTop: 10 }}>Loading zones…</p></div>
        : tab === 'overview' ? <ZoneAdminDashboard zones={zones} onCreate={openWizard} onOpenZone={openZone} />
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
      const svc: Svc[] = (list as unknown as Svc[]).map((s) => ({ id: s.id, name: s.name, price: s.price, category: s.category }))
      setServices(svc)
      // New zone with nothing chosen yet → enable the first few real services + seed their prices.
      setCfg((c) => (!zone && (!c.services || c.services.length === 0))
        ? { ...c, services: svc.slice(0, 4).map((s) => s.id), pricing: Object.fromEntries(svc.map((s) => [s.id, s.price])) }
        : { ...c, pricing: { ...Object.fromEntries(svc.map((s) => [s.id, s.price])), ...(c.pricing || {}) } })
    }).catch(() => {})
  }, [zone])

  const patch = (u: Partial<ZoneConfig>) => setCfg((c) => ({ ...c, ...u }))
  const body = (goLive = false) => ({
    name: name.trim(), code: code.trim(), city, state,
    status: goLive ? 'live' : (status === 'Inactive' ? 'paused' : 'planned'),
    pincodes: (cfg.coverage?.pincodes || []).join(','),
    slaMinutes: cfg.capacity?.maxEtaMin || null, config: cfg,
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

  const checklist = [
    { label: 'Basic information', ok: !!(name && code && city) },
    { label: 'Coverage area', ok: (cfg.coverage?.mode === 'pincodes' ? (cfg.coverage.pincodes.length > 0) : (cfg.coverage?.radiusKm || 0) > 0) },
    { label: 'Apartments added', ok: (cfg.apartments?.length || 0) > 0 },
    { label: 'Services selected', ok: (cfg.services?.length || 0) > 0 },
    { label: 'Pricing added', ok: (cfg.services || []).every((k) => (cfg.pricing?.[k] || 0) > 0) },
    { label: 'Capacity set', ok: (cfg.capacity?.workersRequired || 0) > 0 },
    { label: 'Working hours set', ok: !!cfg.workingHours },
    { label: 'Team assigned', ok: !!cfg.team?.manager },
  ]
  const ready = checklist.every((c) => c.ok)

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
        {STEPS.map((s, i) => (
          <button key={s.key} className={'zo-hstep' + (i === step ? ' on' : '') + (i < step ? ' done' : '')} onClick={() => setStep(i)}>
            <span className="n">{i < step ? <Check size={13} /> : i + 1}</span>
            <span className="t">{s.title}</span>
          </button>
        ))}
      </div>
      <div className="zo-wiz2">
        <div>
          <div className="zo-panel zo-wrap">
            <div className="zo-panel-h">
              <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><cur.Icon size={18} style={{ color: 'var(--zv)' }} /> {cur.title}</h3>
              <span className="sub">Step {step + 1} / {STEPS.length}</span>
            </div>
            <WizStep step={cur.key} {...{ name, setName, code, setCode, city, setCity, state, setState, status, setStatus, cfg, patch, checklist, ready, toast, cities, services }} />
          </div>
          <div className="zo-wiz-foot">
            <button className="zo-btn line" disabled={step === 0 || saving} onClick={() => setStep((s) => Math.max(0, s - 1))}><ChevronLeft size={16} /> Back</button>
            <span style={{ fontSize: 12, color: 'var(--zmut)', fontWeight: 700 }}>{saving ? 'Saving…' : cur.title}</span>
            {step < STEPS.length - 1
              ? <button className="zo-btn" disabled={saving} onClick={next}>Next <ChevronRight size={16} /></button>
              : <button className="zo-btn" disabled={saving || !ready} onClick={goLive}><Rocket size={16} /> Go Live</button>}
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
}

function WizStep(p: StepProps) {
  const { step, cfg, patch, toast } = p

  if (step === 'basic') return (
    <div className="zo-fgrid">
      <F label="Zone Name *"><input value={p.name} onChange={(e) => p.setName(e.target.value)} placeholder="e.g. Madhapur" /></F>
      <F label="Zone Code *"><input value={p.code} onChange={(e) => p.setCode(e.target.value.toUpperCase())} placeholder="MDP001" /></F>
      <F label="City"><select value={p.city} onChange={(e) => { const c = p.cities.find((x) => x.name === e.target.value); p.setCity(e.target.value); if (c) p.setState(c.state) }}><option value="">Select city</option>{p.cities.map((c) => <option key={c.name}>{c.name}</option>)}</select></F>
      <F label="State"><input value={p.state} readOnly placeholder="Auto-filled from city" /></F>
      <F label="Status"><select value={p.status} onChange={(e) => p.setStatus(e.target.value)}><option>Active</option><option>Inactive</option></select></F>
      <label className="zo-f" style={{ gridColumn: '1 / -1' }}><span>Description</span>
        <input value={cfg.description || ''} onChange={(e) => patch({ description: e.target.value })} placeholder="Short description of this zone" />
      </label>
    </div>
  )

  if (step === 'coverage') {
    const cov = cfg.coverage!
    return (
      <div className="zo-grid" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <div>
          <div className="zo-seg" style={{ marginBottom: 12 }}>
            <button className={cov.mode === 'radius' ? 'on' : ''} onClick={() => patch({ coverage: { ...cov, mode: 'radius' } })}>Radius</button>
            <button className={cov.mode === 'pincodes' ? 'on' : ''} onClick={() => patch({ coverage: { ...cov, mode: 'pincodes' } })}>Select Pincodes</button>
          </div>
          <CoverageMap cov={cov} onChange={(c) => patch({ coverage: c })} />
        </div>
        <div>
          {cov.mode === 'radius' ? (
            <>
              <F label={`Coverage Radius — ${cov.radiusKm} km`}>
                <input type="range" min={1} max={15} step={0.5} value={cov.radiusKm} onChange={(e) => patch({ coverage: { ...cov, radiusKm: +e.target.value } })} />
              </F>
              <div className="zo-fgrid" style={{ marginTop: 12 }}>
                <F label="Latitude"><input type="number" value={cov.lat} onChange={(e) => patch({ coverage: { ...cov, lat: +e.target.value } })} /></F>
                <F label="Longitude"><input type="number" value={cov.lng} onChange={(e) => patch({ coverage: { ...cov, lng: +e.target.value } })} /></F>
              </div>
              <p style={{ fontSize: 12, color: 'var(--zmut)', marginTop: 10 }}>Drag the marker or edit lat/lng. The circle shows the serviceable radius.</p>
            </>
          ) : (
            <PincodeField cov={cov} patch={patch} />
          )}
        </div>
      </div>
    )
  }

  if (step === 'apartments') {
    const apts = cfg.apartments || []
    const add = (name: string) => { if (!name.trim()) return; patch({ apartments: [...apts, { id: uid(), name: name.trim(), type: 'Apartment', units: 200 }] }) }
    const del = (id: string) => patch({ apartments: apts.filter((a) => a.id !== id) })
    const selected = new Set(apts.map((a) => a.name))
    return (
      <div>
        <div className="zo-panel-h" style={{ marginTop: -6 }}>
          <span className="sub">Select societies/apartments in this zone, or add manually</span>
          <CsvBtn onRows={(rows) => { const add2 = rows.map((r) => ({ id: uid(), name: r.name || r.apartment || '', type: r.type || 'Apartment', units: +r.units || 0, pincode: r.pincode || '' })).filter((a) => a.name); if (add2.length) { patch({ apartments: [...apts, ...add2] }); toast(`Imported ${add2.length} apartments`, 'ok') } }} />
        </div>
        <div style={{ marginBottom: 12 }}><ManualAdd placeholder="Add apartment / locality name…" onAdd={add} /></div>
        <div className="zo-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 10, marginBottom: 14 }}>
          {APT_SUGGEST.map((s) => {
            const on = selected.has(s)
            return (
              <div key={s} className={'zo-checkrow' + (on ? ' on' : '')} onClick={() => on ? del(apts.find((a) => a.name === s)!.id) : add(s)}>
                <span className="zo-cb">{on && <Check size={13} />}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{s}</span>
              </div>
            )
          })}
        </div>
        {apts.filter((a) => !APT_SUGGEST.includes(a.name)).length > 0 && (
          <div className="zo-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 10 }}>
            {apts.filter((a) => !APT_SUGGEST.includes(a.name)).map((a) => (
              <div key={a.id} className="zo-checkrow on">
                <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{a.name}</span>
                <button className="zo-btn line" style={{ padding: 6 }} onClick={() => del(a.id)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--zmut)', marginTop: 12 }}>{apts.length} apartments selected</p>
      </div>
    )
  }

  if (step === 'services') {
    const on = new Set(cfg.services || [])
    const toggle = (k: string) => { const n = new Set(on); n.has(k) ? n.delete(k) : n.add(k); patch({ services: [...n] }) }
    return (
      <div className="zo-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 10 }}>
        {p.services.length === 0 && <p className="sub">Loading services from catalogue…</p>}
        {p.services.map((s) => (
          <div key={s.id} className={'zo-checkrow' + (on.has(s.id) ? ' on' : '')} onClick={() => toggle(s.id)}>
            <span className="zo-cb">{on.has(s.id) && <Check size={13} />}</span>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.name}</div>{s.category && <div style={{ fontSize: 11, color: 'var(--zmut)' }}>{s.category}</div>}</div>
            <b style={{ fontSize: 13, color: 'var(--zi)' }}>₹{cfg.pricing?.[s.id] ?? s.price}</b>
          </div>
        ))}
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
    const setDay = (d: string, u: Partial<{ open: string; close: string; closed: boolean }>) => patch({ workingHours: { ...wh, days: { ...wh.days, [d]: { ...wh.days[d], ...u } } } })
    const hols = cfg.holidays || []
    return (
      <div className="zo-grid" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <div>
          <label className="zo-checkrow" style={{ marginBottom: 12 }} onClick={() => patch({ workingHours: { ...wh, is247: !wh.is247 } })}>
            <span className="zo-cb">{wh.is247 && <Check size={13} />}</span><b style={{ fontSize: 13.5 }}>Open 24×7</b>
          </label>
          {!wh.is247 && DAYS.map((d) => (
            <div key={d} className="zo-daysrow">
              <b style={{ fontSize: 13 }}>{d}</b>
              <input className="zo-mini" style={{ width: '100%', textAlign: 'left' }} type="time" value={wh.days[d].open} disabled={wh.days[d].closed} onChange={(e) => setDay(d, { open: e.target.value })} />
              <input className="zo-mini" style={{ width: '100%', textAlign: 'left' }} type="time" value={wh.days[d].close} disabled={wh.days[d].closed} onChange={(e) => setDay(d, { close: e.target.value })} />
              <button className={'zo-chip ' + (wh.days[d].closed ? 'inactive' : 'active')} onClick={() => setDay(d, { closed: !wh.days[d].closed })}><i />{wh.days[d].closed ? 'Closed' : 'Open'}</button>
            </div>
          ))}
        </div>
        <div>
          <div className="zo-panel-h" style={{ marginBottom: 8 }}><h3 style={{ fontSize: 14 }}>Holidays</h3></div>
          <ManualAdd placeholder="Holiday name…" onAdd={(n) => patch({ holidays: [...hols, { date: new Date().toISOString().slice(0, 10), name: n }] })} />
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hols.map((h, i) => (
              <div key={i} className="zo-checkrow on"><span style={{ flex: 1, fontSize: 13 }}>🗓️ {h.name}</span><button className="zo-btn line" style={{ padding: 6 }} onClick={() => patch({ holidays: hols.filter((_, x) => x !== i) })}><Trash2 size={13} /></button></div>
            ))}
            {hols.length === 0 && <p style={{ fontSize: 12, color: 'var(--zmut)' }}>No holidays added.</p>}
          </div>
        </div>
      </div>
    )
  }

  if (step === 'team') return <TeamStep cfg={cfg} patch={patch} />

  if (step === 'review') return (
    <div>
      <div className="zo-hero" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'center', gap: 10 }}><Rocket size={20} /><b style={{ fontSize: 16 }}>{p.ready ? 'Ready to go live' : 'Complete the checklist to go live'}</b></div>
        <p style={{ margin: '6px 0 0', opacity: .92, fontSize: 13 }}>{p.checklist.filter((c) => c.ok).length}/{p.checklist.length} items complete.</p>
      </div>
      <div className="zo-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {p.checklist.map((c) => (
          <div key={c.label} className={'zo-check' + (c.ok ? ' done' : '')}>
            <span className="zo-check-b">{c.ok ? <Check size={15} /> : '•'}</span><b>{c.label}</b>
          </div>
        ))}
      </div>
    </div>
  )

  return null
}

/* ───────── team step (async worker fetch) ───────── */
function TeamStep({ cfg, patch }: { cfg: ZoneConfig; patch: (u: Partial<ZoneConfig>) => void }) {
  const [people, setPeople] = useState<Person[]>([])
  const [q, setQ] = useState('')
  useEffect(() => { fetchWorkers('', 'all', 'all').then((r) => setPeople((r.workers || []).map((w: { id: number; name: string }) => ({ id: w.id, name: w.name })))).catch(() => {}) }, [])
  const team = cfg.team || { teamLeaders: [], workers: [] }
  const filtered = people.filter((w) => w.name.toLowerCase().includes(q.toLowerCase()))
  const inList = (arr: Person[], id: number) => arr.some((x) => x.id === id)
  const toggle = (key: 'teamLeaders' | 'workers', pn: Person) => {
    const arr = team[key]; const nx = inList(arr, pn.id) ? arr.filter((x) => x.id !== pn.id) : [...arr, pn]
    patch({ team: { ...team, [key]: nx } })
  }
  return (
    <div className="zo-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div>
        <F label="Zone Manager">
          <select value={team.manager?.id || ''} onChange={(e) => { const pn = people.find((x) => x.id === +e.target.value); patch({ team: { ...team, manager: pn } }) }}>
            <option value="">Select manager</option>{people.map((pp) => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
          </select>
        </F>
        {team.manager && <div className="zo-person" style={{ marginTop: 10 }}><span className="av">{team.manager.name.slice(0, 2).toUpperCase()}</span><div><b style={{ fontSize: 13.5 }}>{team.manager.name}</b><div style={{ fontSize: 11.5, color: 'var(--zmut)' }}>Zone Manager · assigned</div></div></div>}
        <div style={{ marginTop: 14 }}><b style={{ fontSize: 12.5 }}>Team Leaders ({team.teamLeaders.length})</b>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>{team.teamLeaders.map((tl) => <span key={tl.id} className="zo-chip active" onClick={() => toggle('teamLeaders', tl)} style={{ cursor: 'pointer' }}><i />{tl.name} ✕</span>)}</div>
        </div>
        <div style={{ marginTop: 14 }}><b style={{ fontSize: 12.5 }}>Workers ({team.workers.length})</b>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>{team.workers.map((w) => <span key={w.id} className="zo-chip planning" onClick={() => toggle('workers', w)} style={{ cursor: 'pointer' }}><i />{w.name} ✕</span>)}</div>
        </div>
      </div>
      <div>
        <div className="searchbox" style={{ marginBottom: 10 }}><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" /></div>
        <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.slice(0, 40).map((pn) => (
            <div key={pn.id} className="zo-person">
              <span className="av">{pn.name.slice(0, 2).toUpperCase()}</span>
              <b style={{ fontSize: 13.5, flex: 1 }}>{pn.name}</b>
              <button className="zo-btn line" style={{ padding: '6px 10px' }} onClick={() => toggle('teamLeaders', pn)}>{inList(team.teamLeaders, pn.id) ? '✓ Lead' : 'Lead'}</button>
              <button className="zo-btn" style={{ padding: '6px 10px' }} onClick={() => toggle('workers', pn)}>{inList(team.workers, pn.id) ? '✓ Added' : 'Add'}</button>
            </div>
          ))}
          {filtered.length === 0 && <p style={{ fontSize: 12, color: 'var(--zmut)' }}>No people found.</p>}
        </div>
      </div>
    </div>
  )
}

/* ───────── pricing step (service + add-on pricing) ───────── */
const DISCOUNTS = [0, 5, 10, 15, 20, 25, 30, 40, 50]
const DiscountSelect = ({ v, onChange }: { v: number; onChange: (n: number) => void }) => (
  <select className={'zo-disc' + (v > 0 ? ' on' : '')} value={v} onChange={(e) => onChange(+e.target.value)}>
    {DISCOUNTS.map((n) => <option key={n} value={n}>{n === 0 ? 'No Discount' : `${n}% Off`}</option>)}
  </select>
)
// Services carry no duration in the catalogue, so show a category-based "Avg." estimate.
const DUR_RULES: [RegExp, string][] = [
  [/laundry|wash/i, '48 hrs'], [/paint/i, '3 hrs'],
  [/deep|sofa|carpet|mattress|kitchen|fridge/i, '60 mins'],
  [/bathroom|toilet|window|balcony/i, '45 mins'],
  [/fan|light|switch|electr/i, '30 mins'], [/plumb|tap|leak/i, '40 mins'],
]
const estDuration = (name: string, cat?: string) => {
  const t = `${name} ${cat || ''}`
  for (const [re, d] of DUR_RULES) if (re.test(t)) return d
  return '45 mins'
}

function PricingStep({ cfg, patch, services }: { cfg: ZoneConfig; patch: (u: Partial<ZoneConfig>) => void; services: Svc[] }) {
  const [tab, setTab] = useState<'service' | 'addon'>('service')
  const ex = cfg.pricingExtras!
  const useDefault = !!ex.useDefault
  const discounts = cfg.discounts || {}
  const custom = cfg.customServices || []
  const addons = cfg.addons || []
  const setExtra = (u: Partial<typeof ex>) => patch({ pricingExtras: { ...ex, ...u } })
  const setPrice = (k: string, v: number) => patch({ pricing: { ...(cfg.pricing || {}), [k]: v } })
  const setDiscount = (k: string, v: number) => patch({ discounts: { ...discounts, [k]: v } })
  const enabled = services.filter((s) => (cfg.services || []).includes(s.id))
  const rows: Svc[] = [...enabled, ...custom]
  const isCustom = (id: string) => id.startsWith('custom-')

  const addCustom = () => patch({ customServices: [...custom, { id: 'custom-' + uid(), name: 'New Service', price: 199 }] })
  const editCustom = (id: string, u: Partial<{ name: string; price: number }>) => patch({ customServices: custom.map((c) => c.id === id ? { ...c, ...u } : c) })
  const delCustom = (id: string) => patch({ customServices: custom.filter((c) => c.id !== id) })
  const addAddon = () => patch({ addons: [...addons, { id: 'ad-' + uid(), name: 'New Add-on', price: 99, discount: 0 }] })
  const editAddon = (id: string, u: Partial<{ name: string; price: number; discount: number }>) => patch({ addons: addons.map((a) => a.id === id ? { ...a, ...u } : a) })
  const delAddon = (id: string) => patch({ addons: addons.filter((a) => a.id !== id) })

  return (
    <div className="zo-price">
      <p style={{ fontSize: 12.5, color: 'var(--zmut)', margin: '-4px 0 14px' }}>Set service prices for this zone. You can override default prices.</p>
      <div className="zo-pricebar">
        <div className="zo-seg">
          <button className={tab === 'service' ? 'on' : ''} onClick={() => setTab('service')}>Service Pricing</button>
          <button className={tab === 'addon' ? 'on' : ''} onClick={() => setTab('addon')}>Add-on Pricing</button>
        </div>
        {tab === 'service' && (
          <div className="zo-usedef">
            <button type="button" className={'zo-toggle' + (useDefault ? ' on' : '')} onClick={() => setExtra({ useDefault: !useDefault })}><span /></button>
            <span>Use Default Prices</span>
          </div>
        )}
      </div>

      {tab === 'service' ? (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="zo-table zo-ptable">
              <thead><tr><th style={{ width: 44 }}>#</th><th>Service</th><th>Duration (Avg.)</th><th>Base Price (₹)</th><th>Your Price (₹)</th><th>Discount / Offer</th></tr></thead>
              <tbody>
                {rows.map((s, i) => {
                  const cust = isCustom(s.id)
                  return (
                    <tr key={s.id} style={{ cursor: 'default' }}>
                      <td className="zo-grip"><GripVertical size={14} /><span>{i + 1}</span></td>
                      <td>{cust
                        ? <div className="row" style={{ gap: 6, alignItems: 'center' }}><input className="zo-mini" style={{ width: 150, textAlign: 'left' }} value={s.name} onChange={(e) => editCustom(s.id, { name: e.target.value })} /><button className="zo-iconbtn" onClick={() => delCustom(s.id)}><Trash2 size={13} /></button></div>
                        : <b>{s.name}</b>}</td>
                      <td style={{ color: 'var(--zmut)' }}>{estDuration(s.name, s.category)}</td>
                      <td style={{ color: 'var(--zmut)' }}>{cust ? <input className="zo-mini" value={s.price} onChange={(e) => editCustom(s.id, { price: +e.target.value })} /> : s.price}</td>
                      <td><input className="zo-mini" disabled={useDefault} value={useDefault ? s.price : (cfg.pricing?.[s.id] ?? s.price)} onChange={(e) => setPrice(s.id, +e.target.value)} /></td>
                      <td><DiscountSelect v={discounts[s.id] || 0} onChange={(n) => setDiscount(s.id, n)} /></td>
                    </tr>
                  )
                })}
                {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--zmut)', padding: 20 }}>No services selected. Go back to the Services step to add some.</td></tr>}
              </tbody>
            </table>
          </div>
          <button className="zo-btn ghost" style={{ marginTop: 12 }} onClick={addCustom}><Plus size={15} /> Add Custom Service</button>
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
        <div className="zo-fgrid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', alignItems: 'start' }}>
          <FH label="Convenience Fee (Customer)" hint="Charged to the customer per order">
            <select value={ex.convenienceFee} onChange={(e) => setExtra({ convenienceFee: +e.target.value })}>
              {[0, 10, 19, 25, 49].map((n) => <option key={n} value={n}>{n === 0 ? 'Free' : `₹${n}`}</option>)}
            </select>
          </FH>
          <FH label="Minimum Order Amount" hint="Smallest cart value allowed">
            <input type="number" value={ex.minOrder} onChange={(e) => setExtra({ minOrder: +e.target.value })} />
          </FH>
          <FH label="GST" hint="Tax applied on services">
            <select value={ex.gst} onChange={(e) => setExtra({ gst: +e.target.value })}>
              {[0, 5, 12, 18, 28].map((n) => <option key={n} value={n}>{n}%</option>)}
            </select>
          </FH>
          <label className="zo-gstchk" onClick={() => setExtra({ includeGst: !(ex.includeGst !== false) })}>
            <span className="zo-cb">{ex.includeGst !== false && <Check size={13} />}</span>
            <span>Include GST in price shown to customer</span>
          </label>
        </div>
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
