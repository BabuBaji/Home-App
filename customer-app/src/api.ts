import { io, type Socket } from 'socket.io-client'
import { getCurrentPosition } from './geo'
import type { Booking, Address, Transaction, User, ServiceDetail, Service, Coupon, Quote, Ticket, HomeContent, PaymentGroup, ChargeResult, AppNotification } from './types'

// Backend base URL. A runtime override saved in localStorage (set via the login
// screen's "Server settings") wins over the value baked in at build time, so the
// app can follow the dev machine to a new IP without a rebuild.
const storedApi = (() => { try { return localStorage.getItem('hh_api') || '' } catch { return '' } })()
export const API_BASE = (storedApi || import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
export function getApiBase() { return API_BASE }
/** Persist a new backend URL (caller should reload the app so it takes effect everywhere). */
export function setApiBase(url: string) {
  const u = (url || '').trim().replace(/\/$/, '')
  try { if (u) localStorage.setItem('hh_api', u); else localStorage.removeItem('hh_api') } catch { /* ignore */ }
}

let token = localStorage.getItem('hh_token') || ''
export function setToken(t: string) { token = t; localStorage.setItem('hh_token', t) }
export function clearToken() { token = ''; localStorage.removeItem('hh_token') }
export function getToken() { return token }

/* cache the signed-in user so the app hydrates instantly on launch (no network wait) */
export function saveUser(u: User) { try { localStorage.setItem('hh_user', JSON.stringify(u)) } catch { /* ignore */ } }
export function loadUser(): User | null { try { return JSON.parse(localStorage.getItem('hh_user') || 'null') } catch { return null } }
export function clearUser() { localStorage.removeItem('hh_user') }

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
  })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || `Request failed (${res.status})`) }
  return res.json()
}

/* auth */
export const requestOtp = (phone: string) => req<{ ok: boolean; devOtp: string }>('/api/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) })
export const verifyOtp = (phone: string, otp: string) => req<{ token: string; user: User }>('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, otp }) })
export const googleAuth = (p: { credential?: string; demo?: boolean }) => req<{ token: string; user: User }>('/api/auth/google', { method: 'POST', body: JSON.stringify(p) })

/* catalogue */
export const fetchServices = () => req<{ categories: string[]; services: Service[] }>('/api/services')
export const fetchService = (id: string) => req<ServiceDetail>(`/api/services/${id}`)
export const fetchHome = () => req<HomeContent>('/api/home')
export const fetchNotifications = () => req<AppNotification[]>('/api/notifications')

/* favourites */
export const fetchFavourites = () => req<string[]>('/api/favourites')
export const addFavouriteApi = (id: string) => req<string[]>(`/api/favourites/${id}`, { method: 'POST' })
export const removeFavouriteApi = (id: string) => req<string[]>(`/api/favourites/${id}`, { method: 'DELETE' })

/* coupons & quote */
export const fetchCoupons = () => req<Coupon[]>('/api/coupons')
export const validateCoupon = (code: string, subtotal: number) => req<{ code: string; discount: number; label: string }>('/api/coupons/validate', { method: 'POST', body: JSON.stringify({ code, subtotal }) })
export const fetchQuote = (items: { id: string; durationId: string }[], coupon?: string) => req<Quote>('/api/quote', { method: 'POST', body: JSON.stringify({ items, coupon }) })

/* me / addresses */
export const fetchMe = () => req<{ user: User; addresses: Address[] }>('/api/me')
export const updateMe = (patch: Partial<User>) => req<{ user: User }>('/api/me', { method: 'PATCH', body: JSON.stringify(patch) })
export const fetchAddresses = () => req<Address[]>('/api/addresses')
export const addAddressApi = (a: Partial<Address>) => req<Address>('/api/addresses', { method: 'POST', body: JSON.stringify(a) })
export const setDefaultAddressApi = (id: number) => req<Address[]>(`/api/addresses/${id}/default`, { method: 'PATCH' })
export const deleteAddressApi = (id: number) => req<Address[]>(`/api/addresses/${id}`, { method: 'DELETE' })

/* payment gateway */
export const fetchPaymentMethods = () => req<{ methods: PaymentGroup[] }>('/api/payment/methods')
export const fetchPaymentConfig = () => req<{ provider: 'razorpay' | 'mock'; keyId: string | null; upiVpa: string; payeeName: string; upiMode: 'demo' | 'live' }>('/api/payment/config')
// Create a finance payment order (orderId is used as the UPI transaction reference).
export const createPaymentsOrder = (amount: number, mode: string, bookingId?: number) =>
  req<{ ok: boolean; orderId: string; paymentId: string; amount: number; mode: string; status: string }>('/api/payments/order', { method: 'POST', body: JSON.stringify({ amount, mode, bookingId }) })
export const createOrder = (amount: number) => req<{ provider: 'razorpay' | 'mock'; orderId: string; amount: number; currency: string; keyId?: string }>('/api/payment/order', { method: 'POST', body: JSON.stringify({ amount }) })
export const verifyPayment = (p: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => req<{ ok: boolean; txnId: string }>('/api/payment/verify', { method: 'POST', body: JSON.stringify(p) })
export const chargePayment = (orderId: string, method: string, amount: number) => req<ChargeResult>('/api/payment/charge', { method: 'POST', body: JSON.stringify({ orderId, method, amount }) })

/* wallet */
export const fetchWallet = () => req<{ balance: number; cashback: number; transactions: Transaction[] }>('/api/wallet')
export const addMoney = (amount: number) => req<{ balance: number }>('/api/wallet/add', { method: 'POST', body: JSON.stringify({ amount }) })

/* support */
export const fetchTickets = () => req<Ticket[]>('/api/tickets')
export const createTicket = (category: string, message: string) => req<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify({ category, message }) })

/* bookings */
// Attach the customer's live GPS so the assigned worker sees their real location on the
// map. Best-effort — if the fix isn't available the booking still goes through.
export const createBookingApi = async (payload: any) => {
  let coords: { lat?: number; lng?: number } = {}
  if (payload.lat == null) { try { coords = await getCurrentPosition() } catch { /* no fix — server falls back */ } }
  return req<Booking>('/api/bookings', { method: 'POST', body: JSON.stringify({ ...payload, ...coords }) })
}
export const fetchBookings = () => req<Booking[]>('/api/bookings')
export const fetchBooking = (id: number) => req<Booking>(`/api/bookings/${id}`)
export const trackBooking = (id: number) => req(`/api/bookings/${id}/track`, { method: 'POST' })
export const verifyServiceOtp = (id: number, otp: string) => req<Booking>(`/api/bookings/${id}/verify-otp`, { method: 'POST', body: JSON.stringify({ otp }) })
export const completeBooking = (id: number) => req<Booking>(`/api/bookings/${id}/complete`, { method: 'POST' })
export const rescheduleBookingApi = (id: number, date: string, time: string) => req<Booking>(`/api/bookings/${id}/reschedule`, { method: 'POST', body: JSON.stringify({ date, time }) })
export const cancelBookingApi = (id: number, reason: string) => req<Booking>(`/api/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) })
export const reviewBooking = (id: number, rating: number, review: string, photo?: string) => req<Booking>(`/api/bookings/${id}/review`, { method: 'POST', body: JSON.stringify({ rating, review, photo }) })

/* socket */
let socket: Socket | null = null
export function getSocket(): Socket {
  if (!socket) socket = API_BASE ? io(API_BASE, { transports: ['websocket', 'polling'] }) : io({ path: '/socket.io', transports: ['websocket', 'polling'] })
  return socket
}
