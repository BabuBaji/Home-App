import { Fragment, useMemo, useState, type ReactNode } from 'react'
import {
  Globe, Building2, CheckCircle2, Layers, HardHat, UserCheck, Gauge, Boxes,
  TrendingUp, IndianRupee, MapPin, Plus, ChevronLeft, ChevronRight, Check, Brain, Wand2, Zap,
  Package, Users, CalendarClock, ClipboardCheck, ShieldCheck, Trash2, Sparkles, AlertTriangle,
  Truck, Rocket, ArrowLeft,
} from 'lucide-react'
import { MiniMap, useToast } from '../components/UI'
import { createSite, updateSite, deleteSite } from '../api'
import {
  useZones, computeMetrics, readiness, isReady, recommendations,
  type Zone, type ZoneStatus, type Pincode, type Apartment,
} from '../zones/store'
import '../zones/zones.css'

/* ── tiny inline sparkline (deterministic modelled trend) ── */
function series(v: number, seed: number): number[] {
  const out: number[] = []
  for (let i = 0; i < 8; i++) {
    const wobble = Math.sin((i + seed) * 1.3) * 0.12 + Math.cos((i + seed) * 0.7) * 0.06
    out.push(Math.max(0, v * (0.62 + (i / 7) * 0.38 + wobble)))
  }
  return out
}
function Spark({ data, up }: { data: number[]; up: boolean }) {
  const w = 78, h = 30
  const max = Math.max(...data, 1), min = Math.min(...data, 0), rng = max - min || 1
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / rng) * (h - 5) - 2] as const)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const color = up ? '#22C55E' : '#EF4444'
  const last = pts[pts.length - 1]
  return (
    <svg className="zo-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity=".10" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />
    </svg>
  )
}

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const compact = (n: number) => n >= 1e7 ? '₹' + (n / 1e7).toFixed(2) + 'Cr' : n >= 1e5 ? '₹' + (n / 1e5).toFixed(1) + 'L' : inr(n)

function Kpi({ icon, label, value, trend, up, seed, sval }: {
  icon: ReactNode; label: string; value: ReactNode; trend: string; up?: boolean; seed: number; sval: number
}) {
  return (
    <div className="zo-kpi" style={{ animationDelay: `${seed * 40}ms` }}>
      <div className="zo-kpi-h">
        <div className="zo-kpi-ico" style={{ background: 'var(--zg)' }}>{icon}</div>
        <span className={'zo-trend ' + (up === undefined ? 'flat' : up ? 'up' : 'down')}>
          {up !== undefined && <TrendingUp size={11} style={up ? {} : { transform: 'scaleY(-1)' }} />}{trend}
        </span>
      </div>
      <div className="zo-kpi-label">{label}</div>
      <div className="zo-kpi-val">{value}</div>
      <div className="zo-kpi-foot">
        <span style={{ fontSize: 11, color: 'var(--zmut)', fontWeight: 600 }}>8-wk trend</span>
        <Spark data={series(sval, seed)} up={up ?? true} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════ MAIN ═══════════════════════════════════ */
export default function ZoneOps() {
  const { zones, upsert, create } = useZones()
  const [openId, setOpenId] = useState<string | null>(null)
  const open = zones.find((z) => z.id === openId) || null

  if (open) return <ZoneSetup zone={open} onBack={() => setOpenId(null)} upsert={upsert} />
  return <ZoneDashboard zones={zones} onOpen={setOpenId} onNew={() => { const z = create(); setOpenId(z.id) }} />
}

/* ═══════════════════════════════════ DASHBOARD ═══════════════════════════════════ */
function ZoneDashboard({ zones, onOpen, onNew }: { zones: Zone[]; onOpen: (id: string) => void; onNew: () => void }) {
  const agg = useMemo(() => {
    const cities = new Set(zones.map((z) => z.city).filter(Boolean)).size
    let apartments = 0, workersReq = 0, assigned = 0, capacity = 0, orders = 0, revenue = 0
    zones.forEach((z) => {
      const m = computeMetrics(z)
      apartments += m.apartments; workersReq += m.workersRequired; capacity += m.dailyCapacity
      orders += m.forecastMonthlyOrders; revenue += m.revenueForecast
      assigned += z.shifts.reduce((a, s) => a + s.workers, 0)
    })
    const coverage = workersReq ? Math.round((assigned / workersReq) * 100) : 0
    return {
      cities, zones: zones.length, active: zones.filter((z) => z.status === 'active').length,
      planning: zones.filter((z) => z.status === 'planning').length, pending: zones.filter((z) => z.status === 'pending').length,
      apartments, workersReq, assigned, coverage, capacity, orders, revenue,
    }
  }, [zones])

  const recs = useMemo(() => zones.flatMap((z) => recommendations(z).slice(0, 2).map((r) => ({ ...r, zone: z.name }))).slice(0, 6), [zones])

  return (
    <div className="zo">
      <div className="zo-top">
        <div>
          <h2>Zone Planning & Operations</h2>
          <p>Design, forecast and activate an operational zone before onboarding workers · Control Tower</p>
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="zo-btn" onClick={onNew}><Plus size={17} /> New Zone</button>
      </div>

      {/* KPI grid */}
      <div className="zo-kpis" style={{ marginBottom: 16 }}>
        <Kpi seed={0} icon={<Globe size={20} />} label="Total Cities" value={agg.cities} sval={agg.cities} trend="+1" up />
        <Kpi seed={1} icon={<Layers size={20} />} label="Total Zones" value={agg.zones} sval={agg.zones} trend={`${agg.zones}`} up />
        <Kpi seed={2} icon={<CheckCircle2 size={20} />} label="Active Zones" value={agg.active} sval={agg.active} trend="live" up />
        <Kpi seed={3} icon={<Wand2 size={20} />} label="Planning Zones" value={agg.planning} sval={agg.planning || 1} trend="in setup" />
        <Kpi seed={4} icon={<ClipboardCheck size={20} />} label="Pending Approval" value={agg.pending} sval={agg.pending || 1} trend="review" up={false} />
        <Kpi seed={5} icon={<Building2 size={20} />} label="Total Apartments" value={agg.apartments} sval={agg.apartments} trend="+12%" up />
        <Kpi seed={6} icon={<HardHat size={20} />} label="Workers Required" value={agg.workersReq} sval={agg.workersReq} trend="forecast" up />
        <Kpi seed={7} icon={<UserCheck size={20} />} label="Workers Assigned" value={agg.assigned} sval={agg.assigned} trend={`${agg.coverage}%`} up={agg.coverage >= 80} />
        <Kpi seed={8} icon={<Gauge size={20} />} label="Coverage %" value={agg.coverage + '%'} sval={agg.coverage} trend={agg.coverage >= 100 ? 'full' : 'gap'} up={agg.coverage >= 100} />
        <Kpi seed={9} icon={<Zap size={20} />} label="Daily Capacity" value={agg.capacity} sval={agg.capacity} trend="jobs/day" up />
        <Kpi seed={10} icon={<TrendingUp size={20} />} label="Forecasted Orders" value={agg.orders.toLocaleString('en-IN')} sval={agg.orders} trend="+18%" up />
        <Kpi seed={11} icon={<IndianRupee size={20} />} label="Revenue Forecast" value={compact(agg.revenue)} sval={agg.revenue} trend="/mo" up />
      </div>

      <div className="zo-grid" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        {/* Zones table */}
        <div className="zo-panel">
          <div className="zo-panel-h"><h3>Operational Zones</h3><span className="sub">{zones.length} zones · click to open the setup workspace</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="zo-table">
              <thead><tr><th>Zone</th><th>City</th><th>Apartments</th><th>Coverage</th><th>Readiness</th><th>Status</th></tr></thead>
              <tbody>
                {zones.map((z) => {
                  const m = computeMetrics(z); const ready = readiness(z); const done = ready.filter((c) => c.done).length
                  return (
                    <tr key={z.id} onClick={() => onOpen(z.id)}>
                      <td><div className="zo-zname">{z.name || 'Untitled zone'}</div><div className="zo-zcode">{z.code || '—'}</div></td>
                      <td>{z.city || '—'}</td>
                      <td>{m.apartments}</td>
                      <td>
                        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                          <span className="zo-bar"><span style={{ width: `${m.coverage}%` }} /></span>
                          <b style={{ fontSize: 12 }}>{m.coverage}%</b>
                        </div>
                      </td>
                      <td><b style={{ fontSize: 12 }}>{done}/{ready.length}</b></td>
                      <td><span className={'zo-chip ' + z.status}><i />{z.status}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI recommendations */}
        <div className="zo-panel">
          <div className="zo-panel-h">
            <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Brain size={17} style={{ color: 'var(--zv)' }} /> AI Recommendations</h3>
          </div>
          <div className="zo-recs">
            {recs.length === 0 && <div className="zo-empty"><div className="e">✨</div><p>Zones look healthy. Add a zone to see AI insights.</p></div>}
            {recs.map((r, i) => (
              <div key={i} className={'zo-rec ' + r.tone}>
                <span className="zo-rec-ic">{r.kind === 'inventory' ? <Package size={17} /> : r.kind === 'workers' ? <HardHat size={17} /> : r.kind === 'revenue' ? <IndianRupee size={17} /> : r.kind === 'demand' ? <TrendingUp size={17} /> : r.kind === 'shift' ? <CalendarClock size={17} /> : <Sparkles size={17} />}</span>
                <div>
                  <b>{r.title}</b>
                  <p>{r.body} <span style={{ color: 'var(--zi)', fontWeight: 700 }}>· {r.zone}</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════ SETUP WIZARD ═══════════════════════════════════ */
const STEPS = [
  { key: 'location', title: 'Location', sub: 'Country · State · City', Icon: Globe },
  { key: 'zone', title: 'Zone Details', sub: 'Code · radius · manager', Icon: MapPin },
  { key: 'pincodes', title: 'Pincodes', sub: 'Coverage & demand', Icon: Layers },
  { key: 'apartments', title: 'Apartments', sub: 'Import & map', Icon: Building2 },
  { key: 'clusters', title: 'Clusters', sub: 'Group apartments', Icon: Boxes },
  { key: 'services', title: 'Services', sub: 'Catalogue & skills', Icon: Sparkles },
  { key: 'pricing', title: 'Pricing & SLA', sub: 'Price · peak · SLA', Icon: IndianRupee },
  { key: 'demand', title: 'Demand Forecast', sub: 'AI prediction', Icon: Brain },
  { key: 'workforce', title: 'Workforce', sub: 'Auto-calculated', Icon: HardHat },
  { key: 'shifts', title: 'Shift Planning', sub: 'Coverage windows', Icon: CalendarClock },
  { key: 'inventory', title: 'Inventory', sub: 'Stock & reorder', Icon: Package },
  { key: 'equipment', title: 'Equipment', sub: 'Kits & tools', Icon: Truck },
  { key: 'team', title: 'Zone Team', sub: 'Assign roles', Icon: Users },
  { key: 'readiness', title: 'Readiness & Activation', sub: 'Checklist · approve', Icon: Rocket },
] as const

function ZoneSetup({ zone, onBack, upsert }: { zone: Zone; onBack: () => void; upsert: (z: Zone) => void }) {
  const [z, setZ] = useState<Zone>(zone)
  const [step, setStep] = useState(0)
  const [provisioning, setProvisioning] = useState(false)
  const toast = useToast()
  const patch = (u: Partial<Zone>) => { const nz = { ...z, ...u }; setZ(nz); upsert(nz) }
  const m = computeMetrics(z)
  const checks = readiness(z)
  const ready = isReady(z)
  const cur = STEPS[step]

  // ── Map to the worker app: push each apartment to worker_sites (geofence/attendance). ──
  const provisionApts = async (): Promise<Apartment[] | null> => {
    setProvisioning(true)
    try {
      const apts = [...z.apartments]
      for (let i = 0; i < apts.length; i++) {
        const a = apts[i]
        const radius = Math.round((z.clusters.find((c) => c.id === a.clusterId)?.radiusKm || 0.3) * 1000) || 300
        const body = { name: a.name || `${z.name || 'Zone'} Apt ${i + 1}`, address: [z.name, a.pincode].filter(Boolean).join(' · '), lat: a.lat, lng: a.lng, radius }
        if (a.siteId) await updateSite(a.siteId, body)
        else { const r = await createSite(body); apts[i] = { ...a, siteId: r.id } }
      }
      setProvisioning(false); return apts
    } catch {
      setProvisioning(false); toast('Provisioning failed — is the backend running?', 'err'); return null
    }
  }
  const syncNow = async () => {
    if (!z.apartments.length) { toast('Add apartments first', 'err'); return }
    const apts = await provisionApts()
    if (apts) { const nz = { ...z, apartments: apts }; setZ(nz); upsert(nz); toast(`Provisioned ${apts.length} apartments → worker sites`, 'ok') }
  }
  const activate = async () => {
    const apts = await provisionApts()
    const nz: Zone = { ...z, ...(apts ? { apartments: apts } : {}), status: 'active' }
    setZ(nz); upsert(nz)
    toast('Zone activated — apartments are live in the worker app; onboarding can begin 🚀', 'ok')
  }

  return (
    <div className="zo">
      <div className="zo-top">
        <button className="zo-btn line" onClick={onBack}><ArrowLeft size={16} /> Zones</button>
        <div>
          <h2>{z.name || 'New Zone'} <span className={'zo-chip ' + z.status} style={{ verticalAlign: 'middle', marginLeft: 6 }}><i />{z.status}</span></h2>
          <p>{[z.city, z.state, z.country].filter(Boolean).join(', ') || 'Set up the zone step by step'} · {checks.filter((c) => c.done).length}/{checks.length} ready</p>
        </div>
      </div>

      <div className="zo-wiz">
        {/* stepper */}
        <div className="zo-steps">
          {STEPS.map((s, i) => {
            const done = stepDone(s.key, z, checks)
            return (
              <div key={s.key} className={'zo-step' + (i === step ? ' on' : '') + (done ? ' done' : '')} onClick={() => setStep(i)}>
                <span className="zo-step-n">{done && i !== step ? <Check size={14} /> : i + 1}</span>
                <div><div className="zo-step-t">{s.title}</div><div className="zo-step-s">{s.sub}</div></div>
              </div>
            )
          })}
        </div>

        {/* panel */}
        <div>
          <div className="zo-panel zo-wrap">
            <div className="zo-panel-h">
              <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><cur.Icon size={18} style={{ color: 'var(--zv)' }} /> {cur.title}</h3>
              <span className="sub">Step {step + 1} of {STEPS.length}</span>
            </div>
            <StepPanel step={cur.key} z={z} m={m} patch={patch} checks={checks} ready={ready} toast={toast}
              onProvision={syncNow} provisioning={provisioning} onActivate={activate} />
          </div>
          <div className="zo-wiz-foot">
            <button className="zo-btn line" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}><ChevronLeft size={16} /> Back</button>
            <span style={{ fontSize: 12, color: 'var(--zmut)', fontWeight: 700 }}>{cur.title}</span>
            <button className="zo-btn" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>Next <ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  )
}

function stepDone(key: string, z: Zone, checks: ReturnType<typeof readiness>): boolean {
  const find = (k: string) => checks.find((c) => c.key === k)?.done
  switch (key) {
    case 'location': return !!(z.country && z.state && z.city)
    case 'zone': return !!find('zone')
    case 'pincodes': return !!find('pincode')
    case 'apartments': return !!find('apartments')
    case 'clusters': return !!find('clusters')
    case 'services': return !!find('services')
    case 'pricing': return !!(find('pricing') && find('sla'))
    case 'demand': return !!find('demand')
    case 'workforce': return !!find('workforce')
    case 'shifts': return !!find('shifts')
    case 'inventory': return !!find('inventory')
    case 'equipment': return !!find('equipment')
    case 'team': return !!find('team')
    case 'readiness': return z.status === 'active'
    default: return false
  }
}

/* ── field helpers ── */
const F = ({ label, children }: { label: string; children: ReactNode }) => <label className="zo-f"><span>{label}</span>{children}</label>
const uid = () => Math.random().toString(36).slice(2, 9)

function MTile({ l, v, s }: { l: string; v: ReactNode; s?: string }) {
  return <div className="zo-mtile"><div className="l">{l}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>
}

/* ═══════════════════ STEP PANELS ═══════════════════ */
function StepPanel({ step, z, m, patch, checks, ready, toast, onProvision, provisioning, onActivate }: {
  step: string; z: Zone; m: ReturnType<typeof computeMetrics>; patch: (u: Partial<Zone>) => void
  checks: ReturnType<typeof readiness>; ready: boolean; toast: (s: string, k?: 'ok' | 'err') => void
  onProvision: () => void; provisioning: boolean; onActivate: () => void
}) {
  /* ---- LOCATION ---- */
  if (step === 'location') return (
    <div className="zo-fgrid three">
      <F label="Country"><select value={z.country} onChange={(e) => patch({ country: e.target.value })}><option>India</option><option>UAE</option><option>Singapore</option></select></F>
      <F label="State"><select value={z.state} onChange={(e) => patch({ state: e.target.value })}><option value="">Select state</option>{['Telangana', 'Karnataka', 'Maharashtra', 'Delhi', 'Tamil Nadu'].map((s) => <option key={s}>{s}</option>)}</select></F>
      <F label="City"><select value={z.city} onChange={(e) => patch({ city: e.target.value })}><option value="">Select city</option>{['Hyderabad', 'Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Pune'].map((s) => <option key={s}>{s}</option>)}</select></F>
    </div>
  )

  /* ---- ZONE DETAILS ---- */
  if (step === 'zone') return (
    <div className="zo-grid" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
      <div className="zo-fgrid">
        <F label="Zone Name"><input value={z.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Gachibowli" /></F>
        <F label="Zone Code"><input value={z.code} onChange={(e) => patch({ code: e.target.value.toUpperCase() })} placeholder="HYD-GCB" /></F>
        <F label="Coverage Radius (km)"><input type="number" value={z.radiusKm} onChange={(e) => patch({ radiusKm: Number(e.target.value) })} /></F>
        <F label="Operations Manager"><input value={z.manager} onChange={(e) => patch({ manager: e.target.value })} placeholder="Assign manager" /></F>
        <F label="Latitude"><input type="number" value={z.lat} onChange={(e) => patch({ lat: Number(e.target.value) })} /></F>
        <F label="Longitude"><input type="number" value={z.lng} onChange={(e) => patch({ lng: Number(e.target.value) })} /></F>
        <F label="Timezone"><input value={z.timezone} onChange={(e) => patch({ timezone: e.target.value })} /></F>
        <F label="Working Hours"><input value={z.workingHours} onChange={(e) => patch({ workingHours: e.target.value })} /></F>
        <F label="Status"><select value={z.status} onChange={(e) => patch({ status: e.target.value as ZoneStatus })}><option value="planning">Planning</option><option value="pending">Pending Approval</option><option value="active">Active</option><option value="inactive">Inactive</option></select></F>
      </div>
      <div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--zink)' }}>Zone Center · {z.radiusKm} km radius</span>
        <div style={{ marginTop: 8 }}><MiniMap lat={z.lat} lng={z.lng} height={240} label={z.name} /></div>
      </div>
    </div>
  )

  /* ---- PINCODES ---- */
  if (step === 'pincodes') {
    const addPin = () => patch({ pincodes: [...z.pincodes, { id: uid(), code: '', population: 0, apartments: 0, houses: 0, commercial: 0, schools: 0, hospitals: 0 }] })
    const upd = (id: string, u: Partial<Pincode>) => patch({ pincodes: z.pincodes.map((p) => p.id === id ? { ...p, ...u } : p) })
    return (
      <div>
        <div className="zo-panel-h" style={{ marginTop: -6 }}>
          <span className="sub">Population, structures and demand score per pincode</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="zo-btn ghost" onClick={() => toast('CSV import — connect a bulk upload endpoint', 'ok')}><Package size={15} /> Import CSV</button>
            <button className="zo-btn" onClick={addPin}><Plus size={15} /> Add Pincode</button>
          </div>
        </div>
        {z.pincodes.length === 0 ? <Empty emoji="📮" text="No pincodes yet. Add one or import a CSV to map coverage." /> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="zo-table">
              <thead><tr><th>Pincode</th><th>Population</th><th>Apts</th><th>Houses</th><th>Comm.</th><th>Expected Orders</th><th>Demand</th></tr></thead>
              <tbody>
                {z.pincodes.map((p) => {
                  const orders = Math.round((p.apartments * 40 + p.houses) * 0.18)
                  const demand = Math.min(100, Math.round((orders / 220) * 100))
                  return (
                    <tr key={p.id} style={{ cursor: 'default' }}>
                      <td><input className="zo-mini" style={{ width: 90, textAlign: 'left' }} value={p.code} onChange={(e) => upd(p.id, { code: e.target.value })} placeholder="500032" /></td>
                      <td><input className="zo-mini" value={p.population} onChange={(e) => upd(p.id, { population: Number(e.target.value) })} /></td>
                      <td><input className="zo-mini" style={{ width: 56 }} value={p.apartments} onChange={(e) => upd(p.id, { apartments: Number(e.target.value) })} /></td>
                      <td><input className="zo-mini" style={{ width: 56 }} value={p.houses} onChange={(e) => upd(p.id, { houses: Number(e.target.value) })} /></td>
                      <td><input className="zo-mini" style={{ width: 56 }} value={p.commercial} onChange={(e) => upd(p.id, { commercial: Number(e.target.value) })} /></td>
                      <td><b>{orders.toLocaleString('en-IN')}</b></td>
                      <td><div className="row" style={{ alignItems: 'center', gap: 8 }}><span className="zo-bar" style={{ minWidth: 70 }}><span style={{ width: `${demand}%` }} /></span><b style={{ fontSize: 12 }}>{demand}</b></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  /* ---- APARTMENTS ---- */
  if (step === 'apartments') {
    const add = () => patch({ apartments: [...z.apartments, { id: uid(), name: '', builder: '', pincode: z.pincodes[0]?.code || '', clusterId: z.clusters[0]?.id || null, lat: z.lat, lng: z.lng, towers: 1, flats: 100, occupied: 60, parking: true, lift: true, aov: 340 }] })
    const upd = (id: string, u: Partial<Apartment>) => patch({ apartments: z.apartments.map((a) => a.id === id ? { ...a, ...u } : a) })
    const del = (id: string) => {
      const a = z.apartments.find((x) => x.id === id)
      if (a?.siteId) deleteSite(a.siteId).catch(() => {})
      patch({ apartments: z.apartments.filter((x) => x.id !== id) })
    }
    const synced = z.apartments.filter((a) => a.siteId).length
    return (
      <div>
        <div className="zo-panel-h" style={{ marginTop: -6 }}>
          <div className="row" style={{ gap: 16 }}>
            <MTileInline l="Apartments" v={z.apartments.length} /><MTileInline l="Occupied" v={m.occupied.toLocaleString('en-IN')} /><MTileInline l="Exp. Customers" v={m.expectedCustomers.toLocaleString('en-IN')} /><MTileInline l="Synced → Worker App" v={`${synced}/${z.apartments.length}`} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="zo-btn ghost" disabled={provisioning || !z.apartments.length} onClick={onProvision}>{provisioning ? 'Syncing…' : <><Truck size={15} /> Sync to worker app</>}</button>
            <button className="zo-btn" onClick={add}><Plus size={15} /> Add Apartment</button>
          </div>
        </div>
        {z.apartments.length === 0 ? <Empty emoji="🏢" text="No apartments yet. Add towers/flats to drive the demand forecast." /> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="zo-table">
              <thead><tr><th>Apartment</th><th>Builder</th><th>Pincode</th><th>Cluster</th><th>Flats</th><th>Occupied</th><th>AOV</th><th>Worker Site</th><th></th></tr></thead>
              <tbody>
                {z.apartments.map((a) => (
                  <tr key={a.id} style={{ cursor: 'default' }}>
                    <td><input className="zo-mini" style={{ width: 130, textAlign: 'left' }} value={a.name} onChange={(e) => upd(a.id, { name: e.target.value })} placeholder="Name" /></td>
                    <td><input className="zo-mini" style={{ width: 90, textAlign: 'left' }} value={a.builder} onChange={(e) => upd(a.id, { builder: e.target.value })} /></td>
                    <td><input className="zo-mini" style={{ width: 72, textAlign: 'left' }} value={a.pincode} onChange={(e) => upd(a.id, { pincode: e.target.value })} /></td>
                    <td>
                      <select className="zo-mini" style={{ width: 110, textAlign: 'left' }} value={a.clusterId || ''} onChange={(e) => upd(a.id, { clusterId: e.target.value || null })}>
                        <option value="">Unassigned</option>{z.clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td><input className="zo-mini" style={{ width: 56 }} value={a.flats} onChange={(e) => upd(a.id, { flats: Number(e.target.value) })} /></td>
                    <td><input className="zo-mini" style={{ width: 56 }} value={a.occupied} onChange={(e) => upd(a.id, { occupied: Number(e.target.value) })} /></td>
                    <td><input className="zo-mini" style={{ width: 56 }} value={a.aov} onChange={(e) => upd(a.id, { aov: Number(e.target.value) })} /></td>
                    <td>{a.siteId ? <span className="zo-chip active"><i />site #{a.siteId}</span> : <span className="zo-chip planning"><i />not synced</span>}</td>
                    <td><button className="zo-btn line" style={{ padding: 7 }} onClick={() => del(a.id)}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  /* ---- CLUSTERS ---- */
  if (step === 'clusters') {
    const colors = ['#4F46E5', '#7C3AED', '#0EA5E9', '#22C55E', '#F59E0B', '#EC4899']
    const add = () => patch({ clusters: [...z.clusters, { id: uid(), name: `Cluster ${z.clusters.length + 1}`, manager: '', radiusKm: 2.5, travelMin: 15, color: colors[z.clusters.length % colors.length] }] })
    return (
      <div>
        <div className="zo-panel-h" style={{ marginTop: -6 }}><span className="sub">Group apartments into clusters for efficient routing</span><button className="zo-btn" onClick={add}><Plus size={15} /> Add Cluster</button></div>
        <div className="zo-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
          {z.clusters.map((c) => {
            const apts = z.apartments.filter((a) => a.clusterId === c.id)
            const need = Math.ceil(apts.reduce((s, a) => s + a.occupied, 0) * 0.34 * 0.18 / 8)
            return (
              <div key={c.id} className="zo-panel" style={{ padding: 14, borderLeft: `4px solid ${c.color}` }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <input className="zo-mini" style={{ width: 130, textAlign: 'left', fontWeight: 700 }} value={c.name} onChange={(e) => patch({ clusters: z.clusters.map((x) => x.id === c.id ? { ...x, name: e.target.value } : x) })} />
                  <span className="zo-chip planning" style={{ background: c.color + '20', color: c.color }}><i />{apts.length} apts</span>
                </div>
                <input className="zo-mini" style={{ width: '100%', textAlign: 'left', marginTop: 8 }} placeholder="Cluster manager" value={c.manager} onChange={(e) => patch({ clusters: z.clusters.map((x) => x.id === c.id ? { ...x, manager: e.target.value } : x) })} />
                <div className="zo-mtiles" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginTop: 10, gap: 8 }}>
                  <MTile l="Radius" v={c.radiusKm + 'km'} /><MTile l="Travel" v={c.travelMin + 'm'} /><MTile l="Workers" v={need} />
                </div>
              </div>
            )
          })}
          {z.clusters.length === 0 && <Empty emoji="🗺️" text="No clusters yet." />}
        </div>
      </div>
    )
  }

  /* ---- SERVICES ---- */
  if (step === 'services') {
    const toggle = (key: string) => patch({ services: z.services.map((s) => s.key === key ? { ...s, on: !s.on } : s) })
    return (
      <div>
        <div className="zo-panel-h" style={{ marginTop: -6 }}><span className="sub">{z.services.filter((s) => s.on).length} of {z.services.length} services enabled for this zone</span></div>
        <div className="zo-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 10 }}>
          {z.services.map((s) => (
            <div key={s.key} className={'zo-srv' + (s.on ? ' on' : '')}>
              <span className="zo-srv-ic">{SERVICE_EMOJI[s.key] || '🧽'}</span>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 13.5 }}>{s.name}</b>
                <div style={{ fontSize: 11.5, color: 'var(--zmut)' }}>{s.duration}min · {s.skill} skill · SLA {s.sla}m</div>
              </div>
              <b style={{ fontSize: 13, color: 'var(--zi)' }}>{inr(s.price)}</b>
              <button className={'zo-toggle' + (s.on ? ' on' : '')} onClick={() => toggle(s.key)}><span /></button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  /* ---- PRICING & SLA ---- */
  if (step === 'pricing') {
    const on = z.services.filter((s) => s.on)
    const upd = (key: string, u: Partial<typeof z.services[0]>) => patch({ services: z.services.map((s) => s.key === key ? { ...s, ...u } : s) })
    return (
      <div>
        <div className="zo-panel-h" style={{ marginTop: -6 }}><span className="sub">Base price, peak-hour price and SLA per enabled service</span></div>
        {on.length === 0 ? <Empty emoji="💰" text="Enable services first to configure pricing." /> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="zo-table">
              <thead><tr><th>Service</th><th>Duration</th><th>Base Price</th><th>Peak Price</th><th>SLA (min)</th><th>Skill</th></tr></thead>
              <tbody>
                {on.map((s) => (
                  <tr key={s.key} style={{ cursor: 'default' }}>
                    <td><b>{s.name}</b></td>
                    <td>{s.duration} min</td>
                    <td><input className="zo-mini" value={s.price} onChange={(e) => upd(s.key, { price: Number(e.target.value) })} /></td>
                    <td><input className="zo-mini" value={s.peakPrice} onChange={(e) => upd(s.key, { peakPrice: Number(e.target.value) })} /></td>
                    <td><input className="zo-mini" style={{ width: 56 }} value={s.sla} onChange={(e) => upd(s.key, { sla: Number(e.target.value) })} /></td>
                    <td><span className="zo-chip planning"><i />{s.skill}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  /* ---- DEMAND FORECAST (AI) ---- */
  if (step === 'demand') {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const peak = [0.2, 0.35, 0.75, 0.95, 0.7, 0.4, 0.3, 0.35, 0.55, 0.85, 1, 0.6] // 12 two-hourly slots
    const hourly = peak.map((p) => Math.round(m.dailyOrders * p / 3))
    return (
      <div>
        <div className="zo-hero" style={{ marginBottom: 16 }}>
          <div className="row" style={{ alignItems: 'center', gap: 10 }}><Brain size={20} /><b style={{ fontSize: 15 }}>AI Demand Forecast</b></div>
          <p style={{ margin: '6px 0 0', opacity: .9, fontSize: 13 }}>Modelled from {m.occupied.toLocaleString('en-IN')} occupied flats across {m.apartments} apartments and your service mix.</p>
        </div>
        <div className="zo-mtiles" style={{ marginBottom: 16 }}>
          <MTile l="Daily Demand" v={m.dailyOrders} s="orders/day" /><MTile l="Weekly Demand" v={(m.dailyOrders * 7).toLocaleString('en-IN')} s="orders/wk" />
          <MTile l="Monthly Demand" v={m.forecastMonthlyOrders.toLocaleString('en-IN')} s="orders/mo" /><MTile l="Avg Order Value" v={inr(m.avgOrderValue)} s={`${m.avgDurationMin}min avg`} />
        </div>
        <div className="zo-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Hourly demand curve</span>
            <div className="row" style={{ alignItems: 'flex-end', gap: 5, height: 120, marginTop: 10 }}>
              {hourly.map((h, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', height: `${(h / Math.max(...hourly, 1)) * 96 + 6}px`, borderRadius: '6px 6px 0 0', background: peak[i] >= 0.85 ? 'var(--zg)' : 'linear-gradient(180deg,#c7c3f5,#a5a0ee)' }} />
                  <span style={{ fontSize: 8.5, color: 'var(--zmut)' }}>{6 + i * 2}h</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Weekly heat map</span>
            <div className="zo-heat" style={{ marginTop: 10 }}>
              {days.map((d, r) => (
                <Fragment key={d}>
                  <span className="hl">{d}</span>
                  {peak.map((p, c) => {
                    const v = Math.min(1, p * (r >= 5 ? 1.15 : 0.9))
                    return <div key={d + c} className="zo-cell" style={{ background: `rgba(79,70,229,${0.12 + v * 0.8})` }} />
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ---- WORKFORCE ---- */
  if (step === 'workforce') return (
    <div>
      <div className="zo-hero" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'center', gap: 10 }}><Wand2 size={20} /><b style={{ fontSize: 15 }}>Auto-calculated Workforce Plan</b></div>
        <p style={{ margin: '6px 0 0', opacity: .9, fontSize: 13 }}>{m.dailyOrders} orders/day ÷ ~{Math.max(1, Math.floor(480 / (m.avgDurationMin + 20)))} jobs/worker (incl. travel) → the plan below.</p>
      </div>
      <div className="zo-mtiles" style={{ marginBottom: 12 }}>
        <MTile l="Workers Required" v={m.workersRequired} s="front-line" /><MTile l="Backup Workers" v={m.backupWorkers} s="15% buffer" />
        <MTile l="Supervisors" v={m.supervisors} s="1 per ~12" /><MTile l="Quality Inspectors" v={m.inspectors} s="1 per ~20" />
      </div>
      <div className="zo-mtiles">
        <MTile l="Daily Capacity" v={m.dailyCapacity} s="jobs/day" /><MTile l="Utilization" v={m.utilization + '%'} s="demand/capacity" />
        <MTile l="Revenue Forecast" v={compact(m.revenueForecast)} s="/month" /><MTile l="Profit Forecast" v={compact(m.profit)} s={`${Math.round((m.profit / Math.max(1, m.revenueForecast)) * 100)}% margin`} />
      </div>
    </div>
  )

  /* ---- SHIFTS ---- */
  if (step === 'shifts') {
    const upd = (id: string, w: number) => patch({ shifts: z.shifts.map((s) => s.id === id ? { ...s, workers: Math.max(0, w) } : s) })
    const total = z.shifts.reduce((a, s) => a + s.workers, 0)
    const slot = (t: string) => Number(t.split(':')[0])
    return (
      <div>
        <div className="zo-panel-h" style={{ marginTop: -6 }}>
          <span className="sub">Staff each shift · {total} planned vs {m.workersRequired} required ({m.coverage}% coverage)</span>
          <button className="zo-btn ghost" onClick={() => {
            const req = m.workersRequired; const w = { Morning: 0.4, Evening: 0.3, Afternoon: 0.2, Night: 0.1 } as Record<string, number>
            patch({ shifts: z.shifts.map((s) => ({ ...s, workers: Math.round(req * (w[s.name] || 0.25)) })) })
          }}><Zap size={15} /> Auto-distribute</button>
        </div>
        <div className="zo-tl">
          {z.shifts.map((s) => {
            const left = (slot(s.start) / 24) * 100
            const width = (((slot(s.end) - slot(s.start) + 24) % 24 || 24) / 24) * 100
            return (
              <div key={s.id} className="zo-tl-row" style={{ gridTemplateColumns: '110px 1fr 150px' }}>
                <div><b style={{ fontSize: 13 }}>{s.name}</b><div style={{ fontSize: 10.5, color: 'var(--zmut)' }}>{s.start}–{s.end}{s.peak ? ' · peak' : ''}</div></div>
                <div style={{ position: 'relative', height: 34, background: '#F1F0FB', borderRadius: 9 }}>
                  <div className="zo-tl-bar" style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, opacity: s.peak ? 1 : 0.7 }}>{s.workers} workers</div>
                </div>
                <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  <button className="zo-btn line" style={{ padding: '6px 10px' }} onClick={() => upd(s.id, s.workers - 1)}>−</button>
                  <input className="zo-mini" style={{ width: 52, textAlign: 'center' }} value={s.workers} onChange={(e) => upd(s.id, Number(e.target.value))} />
                  <button className="zo-btn line" style={{ padding: '6px 10px' }} onClick={() => upd(s.id, s.workers + 1)}>+</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  /* ---- INVENTORY / EQUIPMENT ---- */
  if (step === 'inventory' || step === 'equipment') {
    const equip = ['Vacuum Cleaners', 'Mops', 'Buckets', 'Cleaning Kits']
    const rows = z.inventory.filter((i) => step === 'equipment' ? equip.includes(i.name) : !equip.includes(i.name))
    const upd = (id: string, stock: number) => patch({ inventory: z.inventory.map((i) => i.id === id ? { ...i, stock: Math.max(0, stock) } : i) })
    return (
      <div>
        <div className="zo-panel-h" style={{ marginTop: -6 }}>
          <span className="sub">{step === 'equipment' ? 'Tools & kits' : 'Consumables & supplies'} · set opening stock vs reorder level</span>
          <button className="zo-btn ghost" onClick={() => patch({ inventory: z.inventory.map((i) => (rows.some((r) => r.id === i.id) ? { ...i, stock: i.reorder + 15 } : i)) })}><Package size={15} /> Stock to par</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="zo-table">
            <thead><tr><th>Item</th><th>Vendor</th><th>Stock</th><th>Reorder</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((i) => {
                const low = i.stock < i.reorder
                return (
                  <tr key={i.id} style={{ cursor: 'default' }}>
                    <td><b>{i.name}</b> <span style={{ color: 'var(--zmut)', fontSize: 11 }}>({i.unit})</span></td>
                    <td>{i.vendor}</td>
                    <td><input className="zo-mini" value={i.stock} onChange={(e) => upd(i.id, Number(e.target.value))} /></td>
                    <td>{i.reorder}</td>
                    <td>{low ? <span className="zo-chip pending"><i />low stock</span> : <span className="zo-chip active"><i />ready</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  /* ---- TEAM ---- */
  if (step === 'team') return (
    <div>
      <div className="zo-panel-h" style={{ marginTop: -6 }}><span className="sub">Assign the zone leadership before activation</span></div>
      <div className="zo-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
        {z.team.map((t, i) => (
          <div key={t.role} className="zo-srv" style={{ borderColor: t.name ? '#DDD6FE' : 'var(--zline)', background: t.name ? '#FBFAFF' : '#fff' }}>
            <span className="zo-srv-ic" style={{ background: t.name ? '#DCFCE7' : '#EDE9FE', color: t.name ? '#15803D' : 'var(--zv)' }}>{t.name ? <UserCheck size={18} /> : <Users size={18} />}</span>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 12.5 }}>{t.role}</b>
              <input className="zo-mini" style={{ width: '100%', textAlign: 'left', marginTop: 4 }} placeholder="Assign person" value={t.name} onChange={(e) => patch({ team: z.team.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x) })} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  /* ---- READINESS & ACTIVATION ---- */
  if (step === 'readiness') {
    const doneN = checks.filter((c) => c.done).length
    return (
      <div>
        <div className="zo-hero" style={{ marginBottom: 16, background: ready ? 'linear-gradient(125deg,#065F46,#22C55E)' : undefined }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="row" style={{ alignItems: 'center', gap: 10 }}><Rocket size={20} /><b style={{ fontSize: 16 }}>{ready ? 'Zone is ready to activate' : 'Zone Readiness Checklist'}</b></div>
              <p style={{ margin: '6px 0 0', opacity: .92, fontSize: 13 }}>{doneN}/{checks.length} items complete{ready ? ' — worker onboarding can begin.' : ' — finish the remaining items to activate.'}</p>
            </div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 32, fontWeight: 800 }}>{Math.round((doneN / checks.length) * 100)}%</div><div style={{ fontSize: 11, opacity: .9 }}>ready</div></div>
          </div>
        </div>

        <div className="zo-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {checks.map((c) => (
            <div key={c.key} className={'zo-check' + (c.done ? ' done' : '')}>
              <span className="zo-check-b">{c.done ? <Check size={15} /> : <AlertTriangle size={14} />}</span>
              <b>{c.label}</b>
              <div style={{ flex: 1 }} />
              <span className={'zo-chip ' + (c.done ? 'active' : 'pending')}><i />{c.done ? 'done' : 'pending'}</span>
            </div>
          ))}
        </div>

        <div className="zo-panel" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <label className="row" style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={z.approved} onChange={(e) => patch({ approved: e.target.checked })} style={{ width: 18, height: 18, accentColor: '#4F46E5' }} />
            <div><b style={{ fontSize: 13.5 }}>Management Approval</b><div style={{ fontSize: 12, color: 'var(--zmut)' }}>Ops head sign-off to activate this zone</div></div>
          </label>
          <div style={{ flex: 1 }} />
          <button className="zo-btn" disabled={!ready || z.status === 'active' || provisioning} onClick={onActivate} style={{ padding: '13px 24px', fontSize: 15 }}>
            <ShieldCheck size={18} /> {z.status === 'active' ? 'Zone Activated' : provisioning ? 'Provisioning…' : 'Activate & Provision'}
          </button>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--zmut)', fontSize: 12, marginTop: 12 }}>
          {!ready ? 'Activate unlocks once every checklist item is complete.'
            : `Activating provisions this zone's ${z.apartments.length} apartments as worker geofence sites — worker onboarding can then begin.`}
        </p>
      </div>
    )
  }

  return null
}

const SERVICE_EMOJI: Record<string, string> = {
  sweep: '🧹', mop: '🧽', bath: '🚿', kitchen: '🍳', laundry: '🧺', iron: '👕', window: '🪟',
  fan: '🌀', deep: '✨', fridge: '❄️', sanitize: '🧴', sofa: '🛋️', carpet: '🧶',
}

function MTileInline({ l, v }: { l: string; v: ReactNode }) {
  return <div><div style={{ fontSize: 11, color: 'var(--zmut)', fontWeight: 600 }}>{l}</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--zink)' }}>{v}</div></div>
}
function Empty({ emoji, text }: { emoji: string; text: string }) {
  return <div className="zo-empty"><div className="e">{emoji}</div><p>{text}</p></div>
}
