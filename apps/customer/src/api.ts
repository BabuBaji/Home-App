import { io, type Socket } from 'socket.io-client'
import { getCurrentPosition } from './geo'
import type { Booking, Address, Transaction, User, ServiceDetail, Service, Coupon, Quote, Ticket, HomeContent, PaymentGroup, ChargeResult, AppNotification, Offer } from './types'

// Backend base URL. Resolved at startup from a small public config file so the apps
// can be repointed at a new tunnel/host WITHOUT rebuilding the APK. Falls back to the
// URL baked at build time (LAN IP via build-apk.ps1) if the config can't be fetched.
const CONFIG_URL = 'https://raw.githubusercontent.com/BabuBaji/Home-App/Baji/app-config.json'
export let API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export async function initApiBase(): Promise<void> {
  // Prefer the remote config so the app can be repointed at a new LAN IP / tunnel
  // WITHOUT rebuilding the APK. The build-time VITE_API_URL stays as the offline
  // fallback (already in API_BASE) if the config can't be fetched.
  try {
    const r = await fetch(CONFIG_URL + '?t=' + Date.now(), { cache: 'no-store' })
    if (r.ok) {
      const j = await r.json()
      if (j && j.apiBase) { API_BASE = String(j.apiBase).replace(/\/$/, ''); return }
    }
  } catch { /* keep the baked fallback */ }
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
const pinQ = (pincode?: string) => (pincode ? `?pincode=${encodeURIComponent(pincode)}` : '')
export const fetchServices = (pincode?: string) => req<{ categories: string[]; services: Service[] }>(`/api/services${pinQ(pincode)}`)
export const fetchService = (id: string, pincode?: string) => req<ServiceDetail>(`/api/services/${id}${pinQ(pincode)}`)
export const fetchHome = () => req<HomeContent>('/api/home')
export interface InvoiceInfo { name: string; gstin: string; address: string; state: string; sac: string; prefix: string; gstInclusive: boolean }
export const fetchInvoiceInfo = () => req<InvoiceInfo>('/api/invoice-info')
export const fetchOffers = (pincode?: string) => req<Offer[]>(`/api/offers${pinQ(pincode)}`)
import type { ZoneHours } from './components/Calendar'
// Working hours for the zone serving a pincode — the Schedule screen builds its slot grid from this.
export const fetchZoneHours = (pincode: string) => req<ZoneHours>(`/api/zone-hours?pincode=${encodeURIComponent(pincode)}`)
// Live service areas (for the "we are live in" coming-soon screen).
export const fetchLiveAreas = () => req<{ name: string; state: string; city: string }[]>('/api/zones')
// Authoritative bookable slots for a date: zone working hours + per-slot availability (capacity).
export interface SlotInfo { hour: number; time: string; booked: number; available: boolean }
export const fetchSlots = (date: string, pincode: string, services: string) =>
  req<{ serviceable: boolean; workerCount: number; slots: SlotInfo[]; closed: boolean }>(
    `/api/slots?date=${encodeURIComponent(date)}&pincode=${encodeURIComponent(pincode)}&services=${encodeURIComponent(services)}`)
// Google Maps JS key for the interactive map location picker.
export const fetchMapsKey = () => req<{ key: string }>('/api/maps-key')
export const fetchNotifications = () => req<AppNotification[]>('/api/notifications')

/* favourites */
export const fetchFavourites = () => req<string[]>('/api/favourites')
export const addFavouriteApi = (id: string) => req<string[]>(`/api/favourites/${id}`, { method: 'POST' })
export const removeFavouriteApi = (id: string) => req<string[]>(`/api/favourites/${id}`, { method: 'DELETE' })

/* coupons & quote */
export const fetchCoupons = () => req<Coupon[]>('/api/coupons')
export const validateCoupon = (code: string, subtotal: number) => req<{ code: string; discount: number; label: string }>('/api/coupons/validate', { method: 'POST', body: JSON.stringify({ code, subtotal }) })
export const fetchQuote = (items: { id: string; durationId: string }[], coupon?: string, pincode?: string, at?: string) => req<Quote>('/api/quote', { method: 'POST', body: JSON.stringify({ items, coupon, pincode, at }) })

/* me / addresses */
export const fetchMe = () => req<{ user: User; addresses: Address[] }>('/api/me')
export const updateMe = (patch: Partial<User>) => req<{ user: User }>('/api/me', { method: 'PATCH', body: JSON.stringify(patch) })
export const fetchAddresses = () => req<Address[]>('/api/addresses')
export const addAddressApi = (a: Partial<Address>) => req<Address>('/api/addresses', { method: 'POST', body: JSON.stringify(a) })
export const updateAddressApi = (id: number, a: Partial<Address>) => req<Address>(`/api/addresses/${id}`, { method: 'PATCH', body: JSON.stringify(a) })
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
export const fetchWallet = () => req<{ balance: number; cash: number; promo: number; points: number; total: number; status: string; cashback: number; transactions: Transaction[] }>('/api/wallet')
export const addMoney = (amount: number) => req<{ balance: number }>('/api/wallet/add', { method: 'POST', body: JSON.stringify({ amount }) })
// Credit the wallet after a verified gateway payment (server checks the signature before crediting).
export const walletTopup = (paymentId: string, amount: number) =>
  req<{ ok: boolean; balance: number | null; duplicate?: boolean }>('/api/payment/wallet/topup', { method: 'POST', body: JSON.stringify({ paymentId, amount }) })
// Apply a friend's referral code (once); the friend earns when you complete your first booking.
export const applyReferral = (code: string) =>
  req<{ ok: boolean; referrer: string; reward: number }>('/api/referral/apply', { method: 'POST', body: JSON.stringify({ code }) })

/* support */
export const fetchTickets = () => req<Ticket[]>('/api/tickets')
export const createTicket = (category: string, message: string) => req<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify({ category, message }) })

/* live location — captured once when the app opens, cached so bookings/maps use it
   instantly without re-prompting, and persisted to the user's profile so the assigned
   worker and the admin can see where the customer is. */
let lastPos: { lat: number; lng: number; ts: number } | null = (() => {
  try { return JSON.parse(localStorage.getItem('hh_geo') || 'null') } catch { return null }
})()
export function getCachedPosition() { return lastPos }
const POS_FRESH_MS = 30 * 60 * 1000 // treat a fix as current for 30 min
export async function captureLocationOnOpen(): Promise<void> {
  try {
    const pos = await getCurrentPosition()
    lastPos = { ...pos, ts: Date.now() }
    try { localStorage.setItem('hh_geo', JSON.stringify(lastPos)) } catch { /* ignore */ }
    // Store on the user's profile (best-effort) so worker/admin see the live location. The backend
    // reverse-geocodes raw "lat,lng" into a human-readable address before saving (see auth service).
    if (token) { try { await updateMe({ location: `${pos.lat},${pos.lng}` } as Partial<User>) } catch { /* ignore */ } }
  } catch { /* permission denied / no fix — keep any previous fix */ }
}

/* bookings */
// Attach the customer's GPS so the assigned worker sees their real location on the map.
// Prefer the fix captured when the app opened; fall back to a fresh read, then the server.
export const createBookingApi = async (payload: any) => {
  let coords: { lat?: number; lng?: number } = {}
  if (payload.lat == null) {
    const cached = getCachedPosition()
    if (cached && Date.now() - cached.ts < POS_FRESH_MS) coords = { lat: cached.lat, lng: cached.lng }
    // No fresh fix → don't block the booking on a GPS lock (slow, esp. right after payment).
    // Send without coords (the server falls back) and warm the cache in the background.
    else { captureLocationOnOpen() }
  }
  return req<Booking>('/api/bookings', { method: 'POST', body: JSON.stringify({ ...payload, ...coords }) })
}
export const fetchBookings = () => req<Booking[]>('/api/bookings')
export const fetchBooking = (id: number) => req<Booking>(`/api/bookings/${id}`)
export const trackBooking = (id: number) => req(`/api/bookings/${id}/track`, { method: 'POST' })
export const verifyServiceOtp = (id: number, otp: string) => req<Booking>(`/api/bookings/${id}/verify-otp`, { method: 'POST', body: JSON.stringify({ otp }) })
export const completeBooking = (id: number) => req<Booking>(`/api/bookings/${id}/complete`, { method: 'POST' })
export const rescheduleBookingApi = (id: number, date: string, time: string) => req<Booking>(`/api/bookings/${id}/reschedule`, { method: 'POST', body: JSON.stringify({ date, time }) })
export interface CancelQuote {
  allowed: boolean; model: 'instant' | 'scheduled'; stage: string; title: string; note: string
  paid: number; refund: number; fee: number; refundPct: number; workerComp: number
}
export const fetchCancelQuote = (id: number) => req<CancelQuote>(`/api/bookings/${id}/cancel-quote`)
export interface CancellationPolicy {
  travelFee: number; arrivalPct: number; commissionPct: number
  schedFullHrs: number; schedHalfHrs: number; schedHalfPct: number
}
export const fetchCancellationPolicy = () => req<CancellationPolicy>('/api/policy/cancellation')
export const cancelBookingApi = (id: number, reason: string) => req<Booking>(`/api/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) })
export const reviewBooking = (id: number, rating: number, review: string, photo?: string) => req<Booking>(`/api/bookings/${id}/review`, { method: 'POST', body: JSON.stringify({ rating, review, photo }) })
// Support chat — send the conversation so far; get the assistant's reply (or a fallback flag → use the offline bot).
export const sendSupportChat = (messages: { role: 'bot' | 'user'; text: string }[]) =>
  req<{ reply: string | null; fallback?: boolean }>('/api/support/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })) }),
  })

/* socket */
let socket: Socket | null = null
export function getSocket(): Socket {
  if (!socket) socket = API_BASE ? io(API_BASE, { transports: ['websocket', 'polling'] }) : io({ path: '/socket.io', transports: ['websocket', 'polling'] })
  return socket
}
