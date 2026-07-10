// ─────────────────────────────────────────────────────────────────────────────
// Zone Planning & Operations — data model, persistence and AI-style forecasting.
//
// Self-contained, localStorage-backed store so the whole module is fully
// interactive and persistent without backend changes. Every "AI" figure is
// deterministically computed from the zone's real configured inputs (apartments,
// occupancy, service mix), so nothing is fabricated at random — it's a transparent
// forecast the ops team can trust. Designed to swap to API endpoints later.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'

export type ZoneStatus = 'planning' | 'pending' | 'active' | 'inactive'

export interface Pincode {
  id: string; code: string; population: number; apartments: number; houses: number
  commercial: number; schools: number; hospitals: number
}
export interface Apartment {
  id: string; name: string; builder: string; pincode: string; clusterId: string | null
  lat: number; lng: number; towers: number; flats: number; occupied: number
  parking: boolean; lift: boolean; aov: number
  // Backend worker_sites id once provisioned to the worker app (geofence/attendance target).
  siteId?: number
}
export interface Cluster {
  id: string; name: string; manager: string; radiusKm: number; travelMin: number; color: string
}
export interface ServiceCfg {
  key: string; name: string; on: boolean; duration: number; price: number; peakPrice: number
  skill: string; sla: number
}
export interface Shift {
  id: string; name: string; start: string; end: string; workers: number; breakMin: number; peak: boolean
}
export interface InvItem { id: string; name: string; vendor: string; stock: number; reorder: number; unit: string }
export interface TeamRole { role: string; name: string }

export interface Zone {
  id: string; name: string; code: string; country: string; state: string; city: string
  lat: number; lng: number; radiusKm: number; timezone: string; workingHours: string
  manager: string; status: ZoneStatus
  pincodes: Pincode[]; apartments: Apartment[]; clusters: Cluster[]
  services: ServiceCfg[]; shifts: Shift[]; inventory: InvItem[]; team: TeamRole[]
  approved: boolean; createdAt: string
  // Backend catalog zones id once persisted, so workers can be onboarded into this zone.
  backendZoneId?: number
}

export const SERVICE_CATALOG: { key: string; name: string; duration: number; price: number; skill: string; sla: number }[] = [
  { key: 'sweep', name: 'Sweeping', duration: 30, price: 149, skill: 'Basic', sla: 30 },
  { key: 'mop', name: 'Mopping', duration: 30, price: 149, skill: 'Basic', sla: 30 },
  { key: 'bath', name: 'Bathroom Cleaning', duration: 45, price: 249, skill: 'Standard', sla: 45 },
  { key: 'kitchen', name: 'Kitchen Cleaning', duration: 60, price: 349, skill: 'Standard', sla: 60 },
  { key: 'laundry', name: 'Laundry', duration: 45, price: 199, skill: 'Basic', sla: 45 },
  { key: 'iron', name: 'Ironing', duration: 30, price: 149, skill: 'Basic', sla: 30 },
  { key: 'window', name: 'Window Cleaning', duration: 40, price: 299, skill: 'Standard', sla: 40 },
  { key: 'fan', name: 'Fan Cleaning', duration: 25, price: 199, skill: 'Basic', sla: 30 },
  { key: 'deep', name: 'Deep Cleaning', duration: 180, price: 1499, skill: 'Expert', sla: 120 },
  { key: 'fridge', name: 'Refrigerator Cleaning', duration: 45, price: 399, skill: 'Standard', sla: 45 },
  { key: 'sanitize', name: 'Home Sanitization', duration: 90, price: 999, skill: 'Expert', sla: 90 },
  { key: 'sofa', name: 'Sofa Cleaning', duration: 60, price: 699, skill: 'Standard', sla: 60 },
  { key: 'carpet', name: 'Carpet Cleaning', duration: 60, price: 599, skill: 'Standard', sla: 60 },
]

const CLUSTER_COLORS = ['#4F46E5', '#7C3AED', '#0EA5E9', '#22C55E', '#F59E0B', '#EC4899']
const uid = () => Math.random().toString(36).slice(2, 9)

export function defaultServices(): ServiceCfg[] {
  return SERVICE_CATALOG.map((s, i) => ({
    ...s, on: i < 6, peakPrice: Math.round(s.price * 1.25),
  }))
}
export function defaultShifts(): Shift[] {
  return [
    { id: uid(), name: 'Morning', start: '06:00', end: '12:00', workers: 0, breakMin: 30, peak: true },
    { id: uid(), name: 'Afternoon', start: '12:00', end: '17:00', workers: 0, breakMin: 30, peak: false },
    { id: uid(), name: 'Evening', start: '17:00', end: '22:00', workers: 0, breakMin: 30, peak: true },
    { id: uid(), name: 'Night', start: '22:00', end: '06:00', workers: 0, breakMin: 45, peak: false },
  ]
}
export function defaultInventory(): InvItem[] {
  return [
    { id: uid(), name: 'Cleaning Chemicals', vendor: 'CleanCo', stock: 0, reorder: 40, unit: 'L' },
    { id: uid(), name: 'Mops', vendor: 'ProKit', stock: 0, reorder: 25, unit: 'pcs' },
    { id: uid(), name: 'Buckets', vendor: 'ProKit', stock: 0, reorder: 25, unit: 'pcs' },
    { id: uid(), name: 'Vacuum Cleaners', vendor: 'Eureka', stock: 0, reorder: 8, unit: 'pcs' },
    { id: uid(), name: 'Gloves', vendor: 'SafeHands', stock: 0, reorder: 100, unit: 'pairs' },
    { id: uid(), name: 'Masks', vendor: 'SafeHands', stock: 0, reorder: 100, unit: 'pcs' },
    { id: uid(), name: 'Uniforms', vendor: 'ThreadWorks', stock: 0, reorder: 30, unit: 'sets' },
    { id: uid(), name: 'ID Cards', vendor: 'PrintHub', stock: 0, reorder: 30, unit: 'pcs' },
    { id: uid(), name: 'Cleaning Kits', vendor: 'ProKit', stock: 0, reorder: 30, unit: 'kits' },
  ]
}
export function emptyTeam(): TeamRole[] {
  return ['Operations Head', 'Zone Manager', 'Supervisor', 'Team Leader', 'Quality Inspector', 'Support Executive', 'HR'].map((role) => ({ role, name: '' }))
}

export function newZone(partial: Partial<Zone> = {}): Zone {
  return {
    id: uid(), name: '', code: '', country: 'India', state: '', city: '',
    lat: 17.4419, lng: 78.3915, radiusKm: 5, timezone: 'Asia/Kolkata', workingHours: '06:00–22:00',
    manager: '', status: 'planning',
    pincodes: [], apartments: [], clusters: [],
    services: defaultServices(), shifts: defaultShifts(), inventory: defaultInventory(), team: emptyTeam(),
    approved: false, createdAt: new Date().toISOString(), ...partial,
  }
}

// ── AI-style forecast: derived purely from the zone's configured inputs ──
export interface ZoneMetrics {
  apartments: number; flats: number; occupied: number; expectedCustomers: number
  dailyOrders: number; forecastMonthlyOrders: number; avgOrderValue: number
  dailyCapacity: number; workersRequired: number; backupWorkers: number
  supervisors: number; inspectors: number; coverage: number; utilization: number
  revenueForecast: number; cost: number; profit: number; avgDurationMin: number
}
export function computeMetrics(z: Zone): ZoneMetrics {
  const flats = z.apartments.reduce((a, x) => a + x.flats, 0)
  const occupied = z.apartments.reduce((a, x) => a + x.occupied, 0)
  // ~34% of occupied flats become active customers in a mature zone.
  const expectedCustomers = Math.round(occupied * 0.34)
  const onServices = z.services.filter((s) => s.on)
  const avgOrderValue = onServices.length ? Math.round(onServices.reduce((a, s) => a + s.price, 0) / onServices.length) : 0
  const avgDurationMin = onServices.length ? Math.round(onServices.reduce((a, s) => a + s.duration, 0) / onServices.length) : 45
  // ~18% of customers order on a given day.
  const dailyOrders = Math.round(expectedCustomers * 0.18)
  const forecastMonthlyOrders = dailyOrders * 30
  const travelMin = 20
  const jobsPerWorkerDay = Math.max(1, Math.floor((8 * 60) / (avgDurationMin + travelMin)))
  const workersRequired = Math.ceil(dailyOrders / jobsPerWorkerDay)
  const dailyCapacity = workersRequired * jobsPerWorkerDay
  const backupWorkers = Math.ceil(workersRequired * 0.15)
  const supervisors = Math.max(z.clusters.length, Math.ceil(workersRequired / 12))
  const inspectors = Math.ceil(workersRequired / 20)
  const plannedWorkers = z.shifts.reduce((a, s) => a + s.workers, 0)
  const coverage = workersRequired ? Math.min(100, Math.round((plannedWorkers / workersRequired) * 100)) : 0
  const utilization = dailyCapacity ? Math.min(100, Math.round((dailyOrders / dailyCapacity) * 100)) : 0
  const revenueForecast = forecastMonthlyOrders * avgOrderValue
  const cost = Math.round(revenueForecast * 0.62)
  const profit = revenueForecast - cost
  return {
    apartments: z.apartments.length, flats, occupied, expectedCustomers, dailyOrders, forecastMonthlyOrders,
    avgOrderValue, dailyCapacity, workersRequired, backupWorkers, supervisors, inspectors, coverage,
    utilization, revenueForecast, cost, profit, avgDurationMin,
  }
}

// ── Readiness checklist derivation ──
export interface CheckItem { key: string; label: string; done: boolean }
export function readiness(z: Zone): CheckItem[] {
  const m = computeMetrics(z)
  const inv = z.inventory.filter((i) => i.stock >= i.reorder).length
  return [
    { key: 'zone', label: 'Zone Created', done: !!(z.name && z.code && z.city) },
    { key: 'pincode', label: 'Pincodes Added', done: z.pincodes.length > 0 },
    { key: 'apartments', label: 'Apartments Added', done: z.apartments.length > 0 },
    { key: 'clusters', label: 'Clusters Mapped', done: z.clusters.length > 0 && z.apartments.some((a) => a.clusterId) },
    { key: 'services', label: 'Services Configured', done: z.services.some((s) => s.on) },
    { key: 'pricing', label: 'Pricing Configured', done: z.services.filter((s) => s.on).every((s) => s.price > 0) },
    { key: 'demand', label: 'Demand Forecast Generated', done: m.dailyOrders > 0 },
    { key: 'workforce', label: 'Workforce Planned', done: m.workersRequired > 0 },
    { key: 'shifts', label: 'Shifts Planned', done: z.shifts.some((s) => s.workers > 0) },
    { key: 'inventory', label: 'Inventory Ready', done: inv >= Math.ceil(z.inventory.length * 0.7) },
    { key: 'equipment', label: 'Equipment Available', done: z.inventory.filter((i) => ['Vacuum Cleaners', 'Mops', 'Buckets'].includes(i.name)).every((i) => i.stock > 0) },
    { key: 'sla', label: 'SLA Configured', done: z.services.filter((s) => s.on).every((s) => s.sla > 0) },
    { key: 'team', label: 'Team Assigned', done: z.team.filter((t) => t.name).length >= 3 },
    { key: 'approved', label: 'Management Approval', done: z.approved },
  ]
}
export const isReady = (z: Zone) => readiness(z).every((c) => c.done)

// ── AI recommendations (transparent, rule-based on the live metrics) ──
export interface Rec { kind: 'workers' | 'demand' | 'inventory' | 'revenue' | 'expansion' | 'shift'; title: string; body: string; tone: 'info' | 'warn' | 'good' }
export function recommendations(z: Zone): Rec[] {
  const m = computeMetrics(z)
  const out: Rec[] = []
  if (m.coverage < 100 && m.workersRequired > 0)
    out.push({ kind: 'workers', tone: 'warn', title: `Add ${Math.max(0, m.workersRequired - z.shifts.reduce((a, s) => a + s.workers, 0))} more workers`, body: `Planned coverage is ${m.coverage}% of the ${m.workersRequired} workers this demand needs.` })
  if (m.utilization > 85)
    out.push({ kind: 'demand', tone: 'warn', title: 'Demand outpacing capacity', body: `Utilization is ${m.utilization}% — add a shift or workers to protect SLA.` })
  const lowStock = z.inventory.filter((i) => i.stock < i.reorder)
  if (lowStock.length)
    out.push({ kind: 'inventory', tone: 'warn', title: `${lowStock.length} inventory items below reorder`, body: `Reorder ${lowStock.slice(0, 3).map((i) => i.name).join(', ')}${lowStock.length > 3 ? '…' : ''} before activation.` })
  if (m.profit > 0)
    out.push({ kind: 'revenue', tone: 'good', title: `₹${(m.profit / 100000).toFixed(1)}L monthly profit forecast`, body: `On ₹${(m.revenueForecast / 100000).toFixed(1)}L revenue at ${Math.round((m.profit / Math.max(1, m.revenueForecast)) * 100)}% margin.` })
  const under = z.apartments.filter((a) => a.occupied / Math.max(1, a.flats) < 0.5)
  if (under.length)
    out.push({ kind: 'expansion', tone: 'info', title: `${under.length} apartments still filling up`, body: 'Occupancy < 50% — demand will grow as these mature. Plan backup capacity.' })
  if (z.clusters.length && m.workersRequired > 0 && z.shifts.filter((s) => s.peak).every((s) => s.workers === 0))
    out.push({ kind: 'shift', tone: 'info', title: 'Load peak shifts first', body: 'Morning & evening are peak — staff them before off-peak windows.' })
  return out
}

// ── Seed data (demo zones at different lifecycle stages) ──
function seededZone(over: Partial<Zone>, aptCount: number): Zone {
  const z = newZone(over)
  const pins = ['500032', '500084', '500081']
  z.pincodes = pins.map((code, i) => ({
    id: uid(), code, population: 42000 + i * 9000, apartments: 18 + i * 6, houses: 240 + i * 40,
    commercial: 30 + i * 8, schools: 4 + i, hospitals: 2 + i,
  }))
  z.clusters = [
    { id: uid(), name: 'North Cluster', manager: 'R. Kumar', radiusKm: 2.5, travelMin: 15, color: CLUSTER_COLORS[0] },
    { id: uid(), name: 'South Cluster', manager: 'P. Mehta', radiusKm: 3, travelMin: 20, color: CLUSTER_COLORS[1] },
  ]
  const builders = ['My Home', 'Aparna', 'Prestige', 'Rajapushpa', 'Lodha', 'Brigade']
  z.apartments = Array.from({ length: aptCount }, (_, i) => {
    const flats = 120 + (i % 5) * 90
    return {
      id: uid(), name: `${builders[i % builders.length]} ${['Vihanga', 'Sarovar', 'Heights', 'Cyber', 'Zenith', 'Palazzo'][i % 6]}`,
      builder: builders[i % builders.length], pincode: pins[i % pins.length],
      clusterId: z.clusters[i % z.clusters.length].id, lat: 17.44 + (i % 7) * 0.004, lng: 78.39 + (i % 5) * 0.004,
      towers: 2 + (i % 5), flats, occupied: Math.round(flats * (0.55 + (i % 4) * 0.1)),
      parking: true, lift: true, aov: 320 + (i % 4) * 60,
    }
  })
  return z
}
function seed(): Zone[] {
  const active = seededZone({ name: 'Gachibowli', code: 'HYD-GCB', state: 'Telangana', city: 'Hyderabad', manager: 'Ananya Rao', status: 'active', approved: true, lat: 17.4401, lng: 78.3489 }, 14)
  active.services = active.services.map((s, i) => ({ ...s, on: i < 9 }))
  active.shifts = active.shifts.map((s) => ({ ...s, workers: s.name === 'Morning' ? 22 : s.name === 'Evening' ? 18 : s.name === 'Afternoon' ? 10 : 4 }))
  active.inventory = active.inventory.map((it) => ({ ...it, stock: it.reorder + 20 }))
  active.team = active.team.map((t, i) => ({ ...t, name: ['Vikram S.', 'Ananya Rao', 'Meena K.', 'Ravi T.', 'Sana P.', 'Karan M.', 'Divya N.'][i] }))

  const pending = seededZone({ name: 'Kondapur', code: 'HYD-KDP', state: 'Telangana', city: 'Hyderabad', manager: 'Rohit Verma', status: 'pending', lat: 17.4615, lng: 78.3676 }, 9)
  pending.services = pending.services.map((s, i) => ({ ...s, on: i < 7 }))
  pending.shifts = pending.shifts.map((s) => ({ ...s, workers: s.name === 'Morning' ? 12 : s.name === 'Evening' ? 9 : s.name === 'Afternoon' ? 5 : 0 }))
  pending.inventory = pending.inventory.map((it) => ({ ...it, stock: it.reorder + 5 }))
  pending.team = pending.team.map((t, i) => ({ ...t, name: i < 5 ? ['Vikram S.', 'Rohit Verma', 'Latha R.', 'Sunil P.', 'Neha J.'][i] : '' }))

  const planning = seededZone({ name: 'Kokapet', code: 'HYD-KKP', state: 'Telangana', city: 'Hyderabad', manager: '', status: 'planning', lat: 17.4108, lng: 78.3419 }, 4)
  planning.shifts = planning.shifts.map((s) => ({ ...s, workers: 0 }))
  planning.inventory = planning.inventory.map((it) => ({ ...it, stock: 0 }))
  planning.team = emptyTeam()

  return [active, pending, planning]
}

const KEY = 'hh_zones_v1'
function load(): Zone[] {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw) } catch { /* ignore */ }
  const s = seed(); save(s); return s
}
function save(z: Zone[]) { try { localStorage.setItem(KEY, JSON.stringify(z)) } catch { /* ignore */ } }

// Simple pub/sub so multiple mounted views stay in sync.
let cache: Zone[] | null = null
const subs = new Set<() => void>()
function get(): Zone[] { if (!cache) cache = load(); return cache }
function set(z: Zone[]) { cache = z; save(z); subs.forEach((f) => f()) }

export function useZones() {
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  const zones = get()
  const upsert = useCallback((z: Zone) => {
    const list = get(); const i = list.findIndex((x) => x.id === z.id)
    if (i >= 0) list[i] = z; else list.unshift(z)
    set([...list])
  }, [])
  const remove = useCallback((id: string) => set(get().filter((z) => z.id !== id)), [])
  const create = useCallback((over: Partial<Zone> = {}) => { const z = newZone(over); set([z, ...get()]); return z }, [])
  const reset = useCallback(() => { localStorage.removeItem(KEY); cache = null; set(load()) }, [])
  return { zones, upsert, remove, create, reset }
}
