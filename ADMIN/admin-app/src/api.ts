import { io, type Socket } from 'socket.io-client'
import type {
  Admin, DashboardData, Customer, Worker, AdminBooking, AdminService,
  Complaint, Ticket, Settings,
} from './types'

export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

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
  if (res.status === 401) { clearToken(); clearAdmin() }
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
export const adjustWallet = (id: number, amount: number, note?: string) => req<{ balance: number }>(`/customers/${id}/wallet`, post('', { amount, note }))

/* workers */
export const fetchWorkers = (q = '', status = 'all', city = 'all') => req<{ stats: any; workers: Worker[] }>(`/workers?q=${encodeURIComponent(q)}&status=${status}&city=${city}`)
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
export const createService = (body: Record<string, unknown>) => req<{ ok: boolean; id: string }>('/services', post('', body))
export const updateService = (id: string, body: Record<string, unknown>) => req<{ ok: boolean }>(`/services/${id}`, patch(body))
export const deleteService = (id: string) => req<{ ok: boolean }>(`/services/${id}`, { method: 'DELETE' })

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

/* socket */
let socket: Socket | null = null
export function getSocket(): Socket {
  if (!socket) socket = API_BASE ? io(API_BASE, { transports: ['websocket', 'polling'] }) : io({ path: '/socket.io', transports: ['websocket', 'polling'] })
  return socket
}
