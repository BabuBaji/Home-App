import { io, type Socket } from 'socket.io-client'
import type {
  Admin, DashboardData, Customer, Worker, WorkerDetail, WorkerNote, AdminBooking, AdminService,
  Complaint, Ticket, Settings, TrainingModule, TrainingQuestion, TrainingAdminState, WorkerTrainingState,
  EquipmentType, IssuedEquipment, WorkerEquipmentState, WorkerPay, GoLiveChecklist, BackgroundState, BgStatus, WorkerAvailabilityState,
} from './types'

// Backend base URL. Resolved at startup from a small public config file so the app
// can be repointed at a new tunnel/host WITHOUT rebuilding the APK. Falls back to the
// URL baked at build time (LAN IP via build-apk.ps1) if the config can't be fetched.
const CONFIG_URL = 'https://raw.githubusercontent.com/BabuBaji/Home-App/Baji/app-config.json'
export let API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export async function initApiBase(): Promise<void> {
  // Admin WEB panel (browser): use same-origin relative URLs so API calls go through the local
  // server's /api proxy to the gateway. This avoids CORS entirely and dodges the *.trycloudflare.com
  // HTTP/2 connection-coalescing misroute between two tunnels. Native (APK) has no same-origin
  // backend, so it resolves the absolute gateway URL from the public config.
  const isNative = !!((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())
  if (!isNative) { API_BASE = ''; return }
  try {
    const r = await fetch(CONFIG_URL + '?t=' + Date.now(), { cache: 'no-store' })
    if (r.ok) {
      const j = await r.json()
      if (j && j.apiBase) API_BASE = String(j.apiBase).replace(/\/$/, '')
    }
  } catch { /* keep the baked fallback */ }
}

let token = localStorage.getItem('hha_token') || ''
export function setToken(t: string) { token = t; localStorage.setItem('hha_token', t) }
export function clearToken() { token = ''; localStorage.removeItem('hha_token') }
export function getToken() { return token }

export function saveAdmin(a: Admin) { try { localStorage.setItem('hha_admin', JSON.stringify(a)) } catch { /* ignore */ } }
export function loadAdmin(): Admin | null { try { return JSON.parse(localStorage.getItem('hha_admin') || 'null') } catch { return null } }
export function clearAdmin() { localStorage.removeItem('hha_admin') }

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + '/api/admin' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
  })
  // A 401 means the session is gone (expired, or the signing secret rotated). Clearing the token
  // isn't enough: the route guard reads `admin` from the store, so without telling it, the panel
  // keeps rendering a logged-in shell while every request 401s — which looks like the app is broken
  // rather than like you need to sign in again.
  // A window event rather than an import: store.tsx already imports this module.
  if (res.status === 401) {
    const hadSession = !!token
    clearToken(); clearAdmin()
    // Only when we actually had a session — a 401 from the login form is a wrong password,
    // not an expiry, and shouldn't be reported as one.
    if (hadSession) window.dispatchEvent(new Event('hha:unauthorized'))
  }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || `Request failed (${res.status})`) }
  return res.json()
}
const post = (p: string, body?: unknown) => ({ method: 'POST', body: JSON.stringify(body ?? {}) } as RequestInit)
const patch = (body?: unknown) => ({ method: 'PATCH', body: JSON.stringify(body ?? {}) } as RequestInit)

/* auth */
export const login = (email: string, password: string) => req<{ token: string; admin: Admin }>('/login', post('', { email, password }))
export const fetchMe = () => req<{ admin: Admin }>('/me')

/* dashboard / analytics */
export const fetchDashboard = () => req<DashboardData>('/dashboard')
export const fetchAnalytics = () => req<any>('/analytics')
export const fetchAudit = () => req<any[]>('/audit')

export interface Insights {
  totals: { revenue: number; bookings: number; completed: number; cancelled: number; cancellationRate: number; activeCustomers: number; activeWorkers: number; aov: number; repeatRate: number; clv: number; noShowRate: number }
  deltas: { revenue: number | null; bookings: number | null; completed: number | null; newCustomers: number | null; cancelRate: number | null }
  statusSplit: { status: string; n: number }[]
  series: { date: string; revenue: number; bookings: number; completed: number; cancelled: number }[]
  growth: { date: string; n: number }[]
  revenueByService: { label: string; value: number }[]
  topServices: { service: string; revenue: number; bookings: number; completed: number; cancellations: number; cancelRate: number; rating: number }[]
  bookingsByPayment: { label: string; value: number }[]
  revenueByPayment: { label: string; value: number }[]
  topCitiesByRevenue: { label: string; value: number }[]
  topCitiesByBookings: { label: string; value: number }[]
  newVsReturning: { label: string; value: number }[]
  heatmap: number[][]
  insights: { title: string; sub: string }[]
}
export const fetchInsights = () => req<Insights>('/insights')
export const fetchAlerts = () => req<{ count: number; complaints: number; tickets: number }>('/alerts')

/* activity monitor (customer + worker + admin) */
export const fetchActivity = (params: Record<string, string | number> = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v)])).toString()
  return req<{ total: number; items: any[] }>(`/activity${qs ? '?' + qs : ''}`)
}
export const fetchActivityStats = (days = 7) => req<{ total: number; since: string; byActor: { actor_type: string; n: number }[]; byAction: { action: string; n: number }[] }>(`/activity/stats?days=${days}`)
export const fetchBookingTimeline = (id: number) => req<any[]>(`/bookings/${id}/timeline`)

/* customers */
export const fetchCustomers = (q = '', status = 'all') => req<Customer[]>(`/customers?q=${encodeURIComponent(q)}&status=${status}`)
export const fetchCustomer = (id: number) => req<any>(`/customers/${id}`)
export const createCustomer = (body: Record<string, unknown>) => req<{ ok: boolean; id: number }>('/customers', post('', body))
export const updateCustomer = (id: number, body: Record<string, unknown>) => req<{ ok: boolean }>(`/customers/${id}`, patch(body))
export const adjustWallet = (id: number, amount: number, note?: string, balance: 'cash' | 'promo' | 'points' = 'cash') => req<{ balance: number }>(`/customers/${id}/wallet`, post('', { amount, note, balance, title: note }))
export const setWalletStatus = (id: number, status: 'active' | 'frozen' | 'blocked' | 'inactive') => req<{ ok: boolean; status: string }>(`/customers/${id}/wallet/status`, post('', { status }))

/* workers */
export const fetchWorkers = (q = '', status = 'all', city = 'all') => req<{ stats: any; workers: Worker[] }>(`/workers?q=${encodeURIComponent(q)}&status=${status}&city=${city}`)
export const fetchWorkerDetail = (id: number) => req<WorkerDetail>(`/workers/${id}`)
export const fetchWorkerNotes = (id: number) => req<WorkerNote[]>(`/workers/${id}/notes`)
export const addWorkerNote = (id: number, note: string, author: string) => req<WorkerNote>(`/workers/${id}/notes`, post('', { note, author }))
export const createWorker = (body: Record<string, unknown>) => req<Worker>('/workers', post('', body))
export const updateWorker = (id: number, body: Record<string, unknown>) => req<Worker>(`/workers/${id}`, patch(body))
export const deleteWorker = (id: number) => req<{ ok: boolean }>(`/workers/${id}`, { method: 'DELETE' })

/* worker wallet */
export const fetchWorkerWallet = (id: number) => req<any>(`/workers/${id}/wallet`)
export const walletBonus = (id: number, body: Record<string, unknown>) => req<any>(`/workers/${id}/wallet/bonus`, post('', body))
export const walletPenalty = (id: number, body: Record<string, unknown>) => req<any>(`/workers/${id}/wallet/penalty`, post('', body))
export const walletHold = (id: number, body: Record<string, unknown>) => req<any>(`/workers/${id}/wallet/hold`, post('', body))
export const walletReleaseHold = (id: number, body: Record<string, unknown>) => req<any>(`/workers/${id}/wallet/release-hold`, post('', body))
export const walletReleasePending = (id: number, body: Record<string, unknown>) => req<any>(`/workers/${id}/wallet/release-pending`, post('', body))
export const approveWithdrawal = (id: number, wd: number) => req<any>(`/workers/${id}/wallet/withdrawals/${wd}/approve`, post(''))
export const rejectWithdrawal = (id: number, wd: number, reason: string) => req<any>(`/workers/${id}/wallet/withdrawals/${wd}/reject`, post('', { reason }))
export const approveAdvance = (id: number, adv: number) => req<any>(`/workers/${id}/wallet/advances/${adv}/approve`, post(''))
export const rejectAdvance = (id: number, adv: number, reason: string) => req<any>(`/workers/${id}/wallet/advances/${adv}/reject`, post('', { reason }))
export const generateWorkerPayslip = (id: number, month?: string) => req<any>(`/workers/${id}/wallet/payslip`, post('', { month }))
export const approveWorkerBank = (id: number) => req<any>(`/workers/${id}/bank/approve`, post(''))
export const rejectWorkerBank = (id: number, reason: string) => req<any>(`/workers/${id}/bank/reject`, post('', { reason }))
/* KYC documents. The URL is short-lived and signed — fetch it when the admin clicks View, never
   store it. A rejection must carry a reason: the worker is told why so they can re-upload. */
/* Invite: moves a created worker from 'pending' (can't log in) to 'onboarding' (can log in to
   complete their profile, still not dispatchable) and texts them. `delivery` reports what actually
   happened to the SMS — the status change succeeds even when sending doesn't. */
export const inviteWorker = (id: number) => req<{ ok: boolean; delivery: string; worker: Worker }>(`/workers/${id}/invite`, post(''))
/* Approving a skill ADDS the service to the worker's live set (what dispatch matches on);
   rejecting removes it. `level` may differ from what the worker claimed — that's the review. */
export const reviewWorkerSkill = (id: number, service: string, approve: boolean, level?: string, reason?: string) =>
  req<WorkerDetail>(`/workers/${id}/skills/review`, post('', { service, approve, level, reason }))
export const workerDocUrl = (id: number, docId: number) => req<{ ok: boolean; url: string }>(`/workers/${id}/documents/${docId}/url`)
export const reviewWorkerDoc = (id: number, docId: number, approve: boolean, reason?: string) =>
  req<any>(`/workers/${id}/documents/${docId}/review`, post('', { approve, reason }))
/* training & assessment (Phase 7). Modules ship as empty unpublished drafts — the content is the
   company's own policy, so an admin writes it here. A module can't be published until it has a
   body, and the quiz needs `quizSize` active questions in the bank before a worker can sit it. */
export const fetchTraining = () => req<TrainingAdminState>('/training')
export const createTrainingModule = (title: string, body = '') => req<{ ok: boolean; module: TrainingModule }>('/training/modules', post('', { title, body }))
export const updateTrainingModule = (id: number, body: Partial<TrainingModule>) => req<{ ok: boolean; module: TrainingModule }>(`/training/modules/${id}`, patch(body))
export const deleteTrainingModule = (id: number) => req<{ ok: boolean }>(`/training/modules/${id}`, { method: 'DELETE' })
export const createTrainingQuestion = (body: Partial<TrainingQuestion>) => req<{ ok: boolean; question: TrainingQuestion }>('/training/questions', post('', body))
export const updateTrainingQuestion = (id: number, body: Partial<TrainingQuestion>) => req<{ ok: boolean; question: TrainingQuestion }>(`/training/questions/${id}`, patch(body))
export const deleteTrainingQuestion = (id: number) => req<{ ok: boolean }>(`/training/questions/${id}`, { method: 'DELETE' })
/** One worker's progress — for the detail screen and Phase 12's checklist. */
export const fetchWorkerTraining = (id: number) => req<WorkerTrainingState>(`/workers/${id}/training`)

/* equipment (Phase 9) */
export const fetchEquipmentTypes = () => req<{ ok: boolean; types: EquipmentType[] }>('/equipment')
export const createEquipmentType = (name: string, required = false) => req<{ ok: boolean; type: EquipmentType }>('/equipment', post('', { name, required }))
export const updateEquipmentType = (id: number, body: Partial<EquipmentType>) => req<{ ok: boolean; type: EquipmentType }>(`/equipment/${id}`, patch(body))
export const deleteEquipmentType = (id: number) => req<{ ok: boolean }>(`/equipment/${id}`, { method: 'DELETE' })
export const fetchWorkerEquipment = (id: number) => req<WorkerEquipmentState>(`/workers/${id}/equipment`)
export const issueEquipment = (id: number, body: { typeId: number; serial?: string; notes?: string }) =>
  req<{ ok: boolean; issued: IssuedEquipment[] }>(`/workers/${id}/equipment`, post('', body))
export const returnEquipment = (id: number, eid: number) => req<{ ok: boolean; issued: IssuedEquipment[] }>(`/workers/${id}/equipment/${eid}/return`, post(''))

/* per-worker pay (Phase 10). The wallet reads commissionPercent when it settles a job — changing
   it changes what the worker is actually paid, so it isn't a display setting. */
export const fetchWorkerPay = (id: number) => req<WorkerPay>(`/workers/${id}/pay`)
export const updateWorkerPay = (id: number, body: { commissionPercent?: number | null; walletEnabled?: boolean }) =>
  req<WorkerPay>(`/workers/${id}/pay`, patch(body))

/* availability (Phase 11). The worker states a preference; this is where it becomes an assignment.
   Approving adopts what they asked for; modifying assigns something else and requires a reason —
   the worker is notified either way. */
export const fetchWorkerAvailability = (id: number) => req<WorkerAvailabilityState>(`/workers/${id}/availability`)
export const reviewWorkerAvailability = (id: number, body: { approve: boolean; shiftDefId?: number | null; zoneId?: number | null; reason?: string }) =>
  req<{ ok: boolean; availability: WorkerAvailabilityState['availability']; assigned: WorkerAvailabilityState['assigned'] }>(`/workers/${id}/availability/review`, post('', body))

/* background verification (Phase 8). The five document-backed points are DERIVED from the document
   review — verify a document once, on the Documents tab, and this follows. Only the previous
   employer and criminal check are recorded here; a flag must carry findings. */
export const fetchBackground = (id: number) => req<BackgroundState>(`/workers/${id}/background`)
export const recordBackgroundCheck = (id: number, key: string, body: { status: BgStatus; reference?: string; notes?: string }) =>
  req<BackgroundState>(`/workers/${id}/background/${key}`, post('', body))

/* final approval (Phase 12). goLiveWorker without a reason fails while checks are outstanding and
   returns needsOverride; pass a reason to waive them — it's recorded against the admin. */
export const fetchChecklist = (id: number) => req<GoLiveChecklist>(`/workers/${id}/checklist`)
export const goLiveWorker = (id: number, reason?: string) => req<GoLiveChecklist>(`/workers/${id}/go-live`, post('', { reason }))

export async function downloadWalletReport() {
  const res = await fetch(API_BASE + '/api/admin/wallet/report.csv', { headers: token ? { Authorization: 'Bearer ' + token } : {} })
  if (!res.ok) throw new Error('Could not export report')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'wallet-report.csv'; a.click()
  URL.revokeObjectURL(url)
}

/* bookings */
export const fetchBookings = (status = 'all', q = '') => req<AdminBooking[]>(`/bookings?status=${status}&q=${encodeURIComponent(q)}`)
export const fetchBooking = (id: number) => req<any>(`/bookings/${id}`)
export const updateBooking = (id: number, body: Record<string, unknown>) => req<any>(`/bookings/${id}`, patch(body))

/* services */
export const fetchServices = () => req<AdminService[]>('/services')
// Platform GST mode + seller info (public catalog endpoint, not under /api/admin) — used by the
// zone pricing wizard to preview GST amounts correctly for inclusive vs exclusive pricing.
export interface InvoiceInfo { name: string; gstin: string; address: string; state: string; sac: string; prefix: string; gstInclusive: boolean }
export const fetchInvoiceInfo = () => fetch(API_BASE + '/api/invoice-info', { headers: token ? { Authorization: 'Bearer ' + token } : {} }).then((r) => r.json() as Promise<InvoiceInfo>)
export const createService = (body: Record<string, unknown>) => req<{ ok: boolean; id: string }>('/services', post('', body))
export const updateService = (id: string, body: Record<string, unknown>) => req<{ ok: boolean }>(`/services/${id}`, patch(body))
export const deleteService = (id: string) => req<{ ok: boolean }>(`/services/${id}`, { method: 'DELETE' })

/* service zones (area-by-area onboarding) */
export interface Zone {
  id: number; name: string; state: string; city: string; pincodes: string
  status: 'planned' | 'live' | 'paused'; sla_minutes: number | null; created: string
  pincodeList: string[]; pincodeCount: number
}
export const fetchZones = () => req<Zone[]>('/zones')

/* live ops control tower */
export interface LiveOpsZone {
  id: number; name: string; state: string; city: string; status: string; pincodeCount: number
  supply: { assigned: number; active: number; online: number; onShift: number }
  demand: { open: number; active: number; total: number }
  health: 'off' | 'idle' | 'critical' | 'short' | 'healthy'
}
export interface LiveOps {
  zones: LiveOpsZone[]; unzoned: { open: number; active: number }
  totals: { openJobs: number; activeJobs: number; onlineWorkers: number; activeWorkers: number; zonesLive: number; zonesTotal: number }
}
export const fetchLiveOps = () => req<LiveOps>('/live-ops')

/* shifts / roster (WFM) */
export interface Shift { id: number; worker_id: number; worker_name: string; zone_id: number | null; weekday: number; start: string; end: string; on_now: boolean }
export const fetchShifts = () => req<Shift[]>('/shifts')
export const createShift = (body: Record<string, unknown>) => req<{ ok: boolean; added: number }>('/shifts', post('', body))
export const deleteShift = (id: number) => req<{ ok: boolean }>(`/shifts/${id}`, { method: 'DELETE' })

/* shift PLANS (min-guarantee) + attendance */
export interface ShiftDef { id: number; code: string; name: string; start: string; end: string; graceMin: number; penalty: number; minGWeekday: number; minGWeekend: number; active: boolean }
export interface AttendanceRow { workerId: number; workerName: string; shift: string; checkIn: string; checkOut: string; onTime: boolean | null; lateMinutes: number; penalty: number; minG: number; site?: string; geoBreaches?: number }
export const fetchShiftDefs = () => req<ShiftDef[]>('/shift-defs')
export const updateShiftDef = (id: number, body: Partial<ShiftDef>) => req<{ ok: boolean }>(`/shift-defs/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const fetchAttendance = (day?: string) => req<{ day: string; rows: AttendanceRow[] }>(`/attendance${day ? `?day=${day}` : ''}`)

/* apartments (geofence sites) */
export interface Site { id: number; name: string; address: string; lat: number; lng: number; radius: number; active: boolean; assigned: number }
export const fetchSites = () => req<Site[]>('/sites')
export const createSite = (body: Record<string, unknown>) => req<{ ok: boolean; id: number }>('/sites', post('', body))
export const updateSite = (id: number, body: Partial<Site>) => req<{ ok: boolean }>(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const deleteSite = (id: number) => req<{ ok: boolean }>(`/sites/${id}`, { method: 'DELETE' })
export const assignWorkerSite = (workerId: number, siteId: number | null) => req<{ ok: boolean }>(`/workers/${workerId}/site`, post('', { siteId }))

/* zone-operations entities (real catalog tables): cities/clusters/apartments/inventory/zone-pricing */
export const opList = <T = Record<string, unknown>>(path: string, zoneId?: number) => req<T[]>(`/${path}${zoneId != null ? `?zone_id=${zoneId}` : ''}`)
export const opCreate = (path: string, body: Record<string, unknown>) => req<Record<string, unknown>>(`/${path}`, post('', body))
export const opUpdate = (path: string, id: number, body: Record<string, unknown>) => req<Record<string, unknown>>(`/${path}/${id}`, patch(body))
export const opDelete = (path: string, id: number) => req<{ ok: boolean }>(`/${path}/${id}`, { method: 'DELETE' })
/* stores (dark-stores) with coverage/overlap guard */
export interface Store { id: number; zone_id: number | null; name: string; manager: string; address: string; pincode: string; lat: number | null; lng: number | null; radius_km: number; status: string }
export interface StoreNear { id: number; name: string; manager: string; lat: number; lng: number; radiusKm: number; status: string; distanceKm: number; overlapAreaKm2?: number }
export interface StoreCheck { nearby: StoreNear[]; coveredBy: StoreNear[]; overlaps: StoreNear[]; covered: boolean; overlapping: boolean; canOverride: boolean }
export interface StoreConflict extends StoreCheck { error: string }
export const fetchStores = (zoneId?: number) => opList<Store>('stores', zoneId)
export const checkStore = (lat: number, lng: number, radiusKm: number, excludeId?: number) =>
  req<StoreCheck>(`/stores/check?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}${excludeId ? `&exclude_id=${excludeId}` : ''}`)
export const updateStore = (id: number, body: Record<string, unknown>) => req<Store>(`/stores/${id}`, patch(body))
export const deleteStore = (id: number) => req<{ ok: boolean }>(`/stores/${id}`, { method: 'DELETE' })
// Returns the conflict body on 409 (covered/overlap) instead of throwing, so the UI can offer a super-admin override.
export async function createStore(body: Record<string, unknown>): Promise<{ ok: true; store: Store } | { ok: false; conflict: StoreConflict }> {
  const res = await fetch(API_BASE + '/api/admin/stores', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })
  if (res.status === 409) return { ok: false, conflict: await res.json() }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error || `Request failed (${res.status})`) }
  return { ok: true, store: await res.json() }
}

export const zoneMetrics = (id: number) => req<Record<string, any>>(`/zones/${id}/metrics`)
export const allZonesMetrics = () => req<Record<string, any>[]>('/zones-metrics')
export const opsOverview = () => req<Record<string, any>>('/ops-overview')

export const createZone = (body: Record<string, unknown>) => req<Zone>('/zones', post('', body))
export const updateZone = (id: number, body: Record<string, unknown>) => req<Zone>(`/zones/${id}`, patch(body))
export const deleteZone = (id: number) => req<{ ok: boolean }>(`/zones/${id}`, { method: 'DELETE' })

/* campaigns (Dynamic Pricing Engine): Zone / Customer / Coupon offers */
export interface CampaignRule { segment: string; max_usage: number; winback_days: number; vip_min_orders: number }
export interface CampaignCoupon { coupon_code: string; auto_apply: boolean; expiry: string | null; usage_limit: number; used_count: number }
export interface Campaign {
  campaign_id: number; campaign_name: string; campaign_type: 'zone' | 'customer' | 'coupon'
  discount_type: 'flat' | 'percent'; discount_value: number; max_discount: number; min_subtotal: number
  service_id: string; category: string; duration_id: string; priority: number; stackable: boolean
  starts: string | null; ends: string | null; status: 'active' | 'paused'
  banner_title: string; banner_subtitle: string
  zoneIds: number[]; rule: CampaignRule | null; coupon: CampaignCoupon | null; usedCount: number
}
export const fetchCampaigns = () => req<Campaign[]>('/campaigns')
export const createCampaign = (body: Record<string, unknown>) => req<{ ok: boolean; campaign_id: number }>('/campaigns', post('', body))
export const updateCampaign = (id: number, body: Record<string, unknown>) => req<{ ok: boolean }>(`/campaigns/${id}`, patch(body))
export const deleteCampaign = (id: number) => req<{ ok: boolean }>(`/campaigns/${id}`, { method: 'DELETE' })
export const campaignUsage = (id: number) => req<{ total: number; customers: number; recent: { customer_id: number; booking_id: number; created: string }[] }>(`/campaigns/${id}/usage`)

/* payments / refunds */
export const fetchPayments = () => req<any>('/payments')
export const fetchRefunds = () => req<any[]>('/refunds')
export const issueRefund = (id: number, amount?: number) => req<{ ok: boolean; amount: number }>(`/refunds/${id}`, post('', { amount }))

/* complaints */
export const fetchComplaints = (status = 'all', priority = 'all') => req<Complaint[]>(`/complaints?status=${status}&priority=${priority}`)
export const updateComplaint = (id: number, body: Record<string, unknown>) => req<Complaint>(`/complaints/${id}`, patch(body))

/* tickets */
export const fetchTickets = () => req<Ticket[]>('/tickets')
export const updateTicket = (id: number, body: { status?: string; response?: string }) => req<Ticket>(`/tickets/${id}`, patch(body))

/* notifications */
export const fetchNotifications = () => req<any[]>('/notifications')
export const broadcast = (body: Record<string, unknown>) => req<{ ok: boolean; sent: number }>('/notifications/broadcast', post('', body))

/* settings */
export const fetchSettings = () => req<Settings>('/settings')
export const updateSettings = (body: Settings) => req<Settings>('/settings', patch(body))

/* admin users */
export const fetchAdmins = () => req<Admin[]>('/admins')
export const createAdminUser = (body: Record<string, unknown>) => req<Admin>('/admins', post('', body))
export const updateAdminUser = (id: number, body: Record<string, unknown>) => req<Admin>(`/admins/${id}`, patch(body))
export const deleteAdminUser = (id: number) => req<{ ok: boolean }>(`/admins/${id}`, { method: 'DELETE' })

export const runShaktiSettlement = (month?: string) =>
  req<{ ok: boolean; month: string; qualified: number; error?: string }>('/shakti/settle', post('/shakti/settle', { month }))

/* socket */
let socket: Socket | null = null
export function getSocket(): Socket {
  if (!socket) socket = API_BASE ? io(API_BASE, { transports: ['websocket', 'polling'] }) : io({ path: '/socket.io', transports: ['websocket', 'polling'] })
  return socket
}
