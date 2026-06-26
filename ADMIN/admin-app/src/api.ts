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

/* customers */
export const fetchCustomers = (q = '', status = 'all') => req<Customer[]>(`/customers?q=${encodeURIComponent(q)}&status=${status}`)
export const fetchCustomer = (id: number) => req<any>(`/customers/${id}`)
export const updateCustomer = (id: number, body: Record<string, unknown>) => req<{ ok: boolean }>(`/customers/${id}`, patch(body))
export const adjustWallet = (id: number, amount: number, note?: string) => req<{ balance: number }>(`/customers/${id}/wallet`, post('', { amount, note }))

/* workers */
export const fetchWorkers = (q = '', status = 'all', city = 'all') => req<{ stats: any; workers: Worker[] }>(`/workers?q=${encodeURIComponent(q)}&status=${status}&city=${city}`)
export const createWorker = (body: Record<string, unknown>) => req<Worker>('/workers', post('', body))
export const updateWorker = (id: number, body: Record<string, unknown>) => req<Worker>(`/workers/${id}`, patch(body))
export const deleteWorker = (id: number) => req<{ ok: boolean }>(`/workers/${id}`, { method: 'DELETE' })

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
export const updateTicket = (id: number, status: string) => req<Ticket>(`/tickets/${id}`, patch({ status }))

/* notifications */
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
