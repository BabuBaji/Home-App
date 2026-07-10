import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Info, Map as MapIcon, Building2, Sparkles, Gauge, IndianRupee, Clock3, Users, Rocket,
  Plus, ChevronLeft, ChevronRight, Check, Search, Trash2, ArrowLeft, CheckCircle2, Upload,
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
    pricingExtras: { gst: 18, convenienceFee: 19, minOrder: 149, discount: 0 },
    capacity: { maxOrders: 120, workersRequired: 25, minOnline: 8, maxEtaMin: 20, maxTravelKm: 5 },
    workingHours: { is247: false, days: Object.fromEntries(DAYS.map((d) => [d, { open: '08:00', close: '21:00', closed: false }])) },
    holidays: [],
    team: { teamLeaders: [], workers: [] },
    goLive: { enableBookings: true, instant: true, scheduled: true, autoAssign: true },
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
      <div className="zo-wiz">
        <div className="zo-steps">
          {STEPS.map((s, i) => (
            <div key={s.key} className={'zo-step' + (i === step ? ' on' : '') + (i < step ? ' done' : '')} onClick={() => setStep(i)}>
              <span className="zo-step-n">{i < step ? <Check size={14} /> : i + 1}</span>
              <div><div className="zo-step-t">{s.title}</div></div>
            </div>
          ))}
        </div>
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
      </div>
    </div>
  )
}

/* ───────── step panels ───────── */
const F = ({ label, children }: { label: string; children: ReactNode }) => <label className="zo-f"><span>{label}</span>{children}</label>
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
            <F label="Pincodes (comma separated)">
              <input value={cov.pincodes.join(', ')} onChange={(e) => patch({ coverage: { ...cov, pincodes: e.target.value.split(/[\s,]+/).map((x) => x.trim()).filter((x) => /^\d{6}$/.test(x)) } })} placeholder="500081, 500084, 500032" />
            </F>
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
    return (
      <div className="zo-fgrid three">
        <F label="Maximum Orders / Day"><input type="number" value={c.maxOrders} onChange={(e) => set({ maxOrders: +e.target.value })} /></F>
        <F label="Workers Required"><input type="number" value={c.workersRequired} onChange={(e) => set({ workersRequired: +e.target.value })} /></F>
        <F label="Minimum Online Workers"><input type="number" value={c.minOnline} onChange={(e) => set({ minOnline: +e.target.value })} /></F>
        <F label="Maximum ETA (mins)"><input type="number" value={c.maxEtaMin} onChange={(e) => set({ maxEtaMin: +e.target.value })} /></F>
        <F label="Maximum Travel Distance (km)"><input type="number" value={c.maxTravelKm} onChange={(e) => set({ maxTravelKm: +e.target.value })} /></F>
      </div>
    )
  }

  if (step === 'pricing') {
    const ex = cfg.pricingExtras!
    const setPrice = (k: string, v: number) => patch({ pricing: { ...(cfg.pricing || {}), [k]: v } })
    const enabled = p.services.filter((s) => (cfg.services || []).includes(s.id))
    return (
      <div>
        <p style={{ fontSize: 12, color: 'var(--zmut)', marginTop: -4, marginBottom: 12 }}>Leave a price to use the default. Override per zone as needed.</p>
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table className="zo-table"><thead><tr><th>Service</th><th>Default</th><th>Zone Price</th></tr></thead>
            <tbody>{enabled.map((s) => (
              <tr key={s.id} style={{ cursor: 'default' }}>
                <td><b>{s.name}</b></td><td style={{ color: 'var(--zmut)' }}>₹{s.price}</td>
                <td><input className="zo-mini" value={cfg.pricing?.[s.id] ?? s.price} onChange={(e) => setPrice(s.id, +e.target.value)} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="zo-fgrid three">
          <F label="Discount (%)"><input type="number" value={ex.discount} onChange={(e) => patch({ pricingExtras: { ...ex, discount: +e.target.value } })} /></F>
          <F label="GST (%)"><input type="number" value={ex.gst} onChange={(e) => patch({ pricingExtras: { ...ex, gst: +e.target.value } })} /></F>
          <F label="Convenience Fee (₹)"><input type="number" value={ex.convenienceFee} onChange={(e) => patch({ pricingExtras: { ...ex, convenienceFee: +e.target.value } })} /></F>
          <F label="Minimum Order (₹)"><input type="number" value={ex.minOrder} onChange={(e) => patch({ pricingExtras: { ...ex, minOrder: +e.target.value } })} /></F>
        </div>
      </div>
    )
  }

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

/* ───────── coverage map (leaflet radius) ───────── */
function CoverageMap({ cov, onChange }: { cov: NonNullable<ZoneConfig['coverage']>; onChange: (c: NonNullable<ZoneConfig['coverage']>) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = L.map(ref.current, { attributionControl: false }).setView([cov.lat, cov.lng], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    const marker = L.marker([cov.lat, cov.lng], { draggable: true }).addTo(map)
    const circle = L.circle([cov.lat, cov.lng], { radius: cov.radiusKm * 1000, color: '#4F46E5', fillColor: '#4F46E5', fillOpacity: 0.12 }).addTo(map)
    marker.on('move', (e) => { const ll = (e as unknown as { latlng: L.LatLng }).latlng; circle.setLatLng(ll) })
    marker.on('dragend', () => { const ll = marker.getLatLng(); onChangeRef.current({ ...covRef.current, lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5) }) })
    mapRef.current = map; markerRef.current = marker; circleRef.current = circle
    setTimeout(() => map.invalidateSize(), 200)
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const covRef = useRef(cov); covRef.current = cov
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange
  useEffect(() => {
    circleRef.current?.setRadius(cov.radiusKm * 1000)
    circleRef.current?.setLatLng([cov.lat, cov.lng]); markerRef.current?.setLatLng([cov.lat, cov.lng])
  }, [cov.radiusKm, cov.lat, cov.lng])
  return <div ref={ref} style={{ height: 360, width: '100%', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--zline)', background: '#eef0f4' }} />
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
