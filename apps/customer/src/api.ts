import { io, type Socket } from 'socket.io-client'
import { getCurrentPosition } from './geo'
import type { Booking, Address, Transaction, User, ServiceDetail, Service, Coupon, Quote, Ticket, HomeContent, PaymentGroup, ChargeResult, AppNotification, Offer } from './types'

// Backend base URL. Resolved at startup from a small public config file so the apps
// can be repointed at a new tunnel/host WITHOUT rebuilding the APK. Falls back to the
// URL baked at build time (LAN IP via build-apk.ps1) if the config can't be fetched.
const CONFIG_URL = 'https://raw.githubusercontent.com/BabuBaji/Home-App/Baji/app-config.json'
export let API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export async function initApiBase(): Promise<void> {
  // In the browser dev server, keep API_BASE empty so requests go to relative /api and
  // are handled by the Vite proxy -> localhost:8080. (The PC can't reach its own LAN IP
  // via the Docker-published port, so we must NOT switch dev to the LAN IP.)
  if (import.meta.env.DEV) return
  // Packaged app: the LAN IP baked at build time (VITE_API_URL via build-apk.ps1) wins.
  // We do NOT trust the remote config here because GitHub's raw CDN serves a stale copy
  // for several minutes after a push, which would point the app at a dead IP. Rebuild
  // (build-apk.ps1 auto-detects the current Wi-Fi IP) to repoint.
  if (API_BASE) return
  // Only when nothing was baked, fall back to the remote config.
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

/* Self-heal on an expired/invalid session: the store registers a handler that signs the user out
 * (so the app returns to /login) instead of dead-ending on "Not authenticated" (e.g. at payment). */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) { onUnauthorized = fn }

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
  })
  // A 401 while we THOUGHT we were signed in means a stale/invalid token — clear it and bounce to
  // login. Guarded on `token` so the login screen's own calls (no token) never trigger a loop.
  if (res.status === 401 && token) {
    clearToken(); clearUser()
    onUnauthorized?.()
    throw new Error('Your session expired — please sign in again.')
  }
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
// Live surge for the customer's zone — drives the "rain incoming" heads-up on Home.
export interface ZoneSurge { active: boolean; pct: number; reason: string; prob: number | null }
export const fetchZoneSurge = (pincode: string) => req<ZoneSurge>(`/api/surge?pincode=${encodeURIComponent(pincode)}`)
// Dynamic Home hero slides — scheduled festival/promo banners + live offers + weather surge.
export interface HomeBanner {
  key: string; kind: 'festival' | 'promo' | 'announcement' | 'offer' | 'weather'
  title: string; subtitle: string; emoji: string; theme: string
  ctaLabel: string; ctaLink: string; priority: number; image?: string
  pct?: number; prob?: number | null; reason?: string
}
export const fetchHomeBanners = (pincode?: string) => req<HomeBanner[]>(`/api/home-banners${pinQ(pincode)}`)
// Absolute URL for a stored media path (banner images), so <img> can load it directly.
export const mediaUrl = (path: string) => (!path ? '' : path.startsWith('http') ? path : `${API_BASE}${path}`)
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
export const deleteAccount = () => req<{ ok: boolean }>('/api/me', { method: 'DELETE' })

/* profile · notifications */
export interface NotifPrefs {
  all: boolean; bookingConfirm: boolean; bookingReminder: boolean; serviceUpdates: boolean
  offers: boolean; walletTxn: boolean; payments: boolean; marketing: boolean
}
export const fetchNotifPrefs = () => req<NotifPrefs>('/api/profile/notifications')
export const updateNotifPrefs = (patch: Partial<NotifPrefs>) => req<NotifPrefs>('/api/profile/notifications', { method: 'PATCH', body: JSON.stringify(patch) })

/* profile · language */
export const fetchLanguage = () => req<{ language: string }>('/api/profile/language')
export const updateLanguage = (language: string) => req<{ language: string }>('/api/profile/language', { method: 'PATCH', body: JSON.stringify({ language }) })

/* profile · family members */
export interface FamilyMember { id: number; name: string; relation: string | null; phone: string | null; is_primary: boolean }
export const fetchFamily = () => req<FamilyMember[]>('/api/family')
export const addFamily = (m: { name: string; relation?: string; phone?: string; is_primary?: boolean }) => req<FamilyMember>('/api/family', { method: 'POST', body: JSON.stringify(m) })
export const updateFamily = (id: number, m: Partial<FamilyMember>) => req<FamilyMember>(`/api/family/${id}`, { method: 'PATCH', body: JSON.stringify(m) })
export const removeFamily = (id: number) => req<{ ok: boolean }>(`/api/family/${id}`, { method: 'DELETE' })

/* profile · saved payment methods (display data only — never full card numbers) */
export interface SavedMethod { id: number; kind: string; label: string; detail: string | null; is_primary: boolean }
export const fetchSavedMethods = () => req<SavedMethod[]>('/api/payment-methods')
export const addSavedMethod = (m: { kind: string; label: string; detail?: string; is_primary?: boolean }) => req<SavedMethod>('/api/payment-methods', { method: 'POST', body: JSON.stringify(m) })
export const setPrimaryMethod = (id: number) => req<SavedMethod>(`/api/payment-methods/${id}`, { method: 'PATCH', body: JSON.stringify({ is_primary: true }) })
export const removeSavedMethod = (id: number) => req<{ ok: boolean }>(`/api/payment-methods/${id}`, { method: 'DELETE' })
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
export interface WalletSummary {
  balance: number; cash: number; promo: number; points: number; total: number
  status: string; cashback: number; transactions: Transaction[]
  // Cash spends anywhere; Promo is locked to bookings — that is the available/locked split.
  available: number; locked: number; hideBalance: boolean
  // Add Money amount chips, configured by admin (`wallet_topup_presets`). Empty = no chips.
  topupPresets: number[]
}
export const fetchWallet = () => req<WalletSummary>('/api/wallet')
export const addMoney = (amount: number) => req<{ balance: number }>('/api/wallet/add', { method: 'POST', body: JSON.stringify({ amount }) })

/* wallet · cashback (Promo is the cashback purse: credits earned, debits spent) */
export interface CashbackEntry { id: number; title: string; amount: number; created: string; kind: string | null; state: 'earned' | 'used' | 'expired' }
export interface CashbackInfo { lifetime: number; usable: number; expired: number; history: CashbackEntry[] }
export const fetchCashback = () => req<CashbackInfo>('/api/wallet/cashback')

/* wallet · referral earnings */
export interface ReferralEntry { id: number; title: string; amount: number; created: string; ref?: string }
export interface ReferralInfo { code: string; reward: number; total: number; successful: number; earned: number; history: ReferralEntry[] }
export const fetchReferralEarnings = () => req<ReferralInfo>('/api/wallet/referrals')

/* wallet · gift cards */
export interface GiftCard { id: number; code: string; label: string | null; amount: number; balance: number; expires: string | null; created: string }
export interface GiftCardInfo { balance: number; active: number; cards: GiftCard[] }
export const fetchGiftCards = () => req<GiftCardInfo>('/api/wallet/gift-cards')
export const redeemGiftCard = (code: string) => req<{ ok: boolean; card: GiftCard }>('/api/wallet/gift-cards', { method: 'POST', body: JSON.stringify({ code }) })

/* wallet · refund history (booking side of a refund; the ledger has the money side) */
export interface RefundEntry { id: number; ref: string; amount: number; status: 'completed' | 'pending' | 'failed'; title: string; serviceId: string | null; reason: string | null; created: string }
export const fetchRefunds = () => req<RefundEntry[]>('/api/refunds')

/* wallet · settings */
export interface WalletSettings {
  autoTopup: boolean; autoTopupAmount: number; autoTopupThreshold: number
  notifyTxn: boolean; notifyLowBalance: boolean; hideBalance: boolean
}
export const fetchWalletSettings = () => req<WalletSettings>('/api/wallet/settings')
export const updateWalletSettings = (patch: Partial<WalletSettings>) =>
  req<WalletSettings>('/api/wallet/settings', { method: 'PATCH', body: JSON.stringify(patch) })
// Credit the wallet after a verified gateway payment (server checks the signature before crediting).
export const walletTopup = (paymentId: string, amount: number) =>
  req<{ ok: boolean; balance: number | null; duplicate?: boolean }>('/api/payment/wallet/topup', { method: 'POST', body: JSON.stringify({ paymentId, amount }) })
// Apply a friend's referral code (once); the friend earns when you complete your first booking.
export const applyReferral = (code: string) =>
  req<{ ok: boolean; referrer: string; reward: number }>('/api/referral/apply', { method: 'POST', body: JSON.stringify({ code }) })

/* support */
export const fetchTickets = () => req<Ticket[]>('/api/tickets')
export const createTicket = (category: string, message: string, extra?: { subcategory?: string; subject?: string }) =>
  req<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify({ category, message, ...extra }) })
export const escalateTicket = (id: number, reason: string, contact: string) =>
  req<Ticket>(`/api/tickets/${id}/escalate`, { method: 'POST', body: JSON.stringify({ reason, contact }) })

/* AI Home (Module 13) · reminders + cleaning plans */
export interface HomeReminder { id: number; kind: string; next_date: string | null; frequency_days: number | null; enabled: boolean; config: Record<string, unknown> }
export const fetchReminders = () => req<HomeReminder[]>('/api/reminders')
export const saveReminder = (kind: string, r: { next_date?: string | null; frequency_days?: number | null; enabled?: boolean; config?: Record<string, unknown> }) =>
  req<HomeReminder>(`/api/reminders/${kind}`, { method: 'PUT', body: JSON.stringify(r) })

export interface CleaningPlan { id: number; service_id: string; name: string; frequency: string; next_date: string | null; active: boolean }
export const fetchPlans = () => req<CleaningPlan[]>('/api/plans')
export const addPlan = (p: { service_id: string; name: string; frequency: string; next_date?: string | null }) => req<CleaningPlan>('/api/plans', { method: 'POST', body: JSON.stringify(p) })
export const updatePlan = (id: number, patch: { active?: boolean }) => req<CleaningPlan>(`/api/plans/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const removePlan = (id: number) => req<{ ok: boolean }>(`/api/plans/${id}`, { method: 'DELETE' })

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
// Real customer reviews for a service (from reviewed bookings). Public/read-only.
export const fetchServiceReviews = (serviceId: string) =>
  req<{ name: string; rating: number; text: string; date: string; pro: string }[]>(`/api/bookings/service-reviews?serviceId=${encodeURIComponent(serviceId)}`)
// Real workers offering a service (from the worker service), with distance from the customer.
export const fetchServiceWorkers = (service: string, lat?: number, lng?: number) =>
  req<{ id: number; name: string; rating: number; jobs: number; online: boolean; km: number | null }[]>(
    `/api/bookings/service-workers?service=${encodeURIComponent(service)}${lat != null && lng != null ? `&lat=${lat}&lng=${lng}` : ''}`)
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
