export interface Service {
  id: string
  name: string
  icon: string
  price: number
  category: string
  available: boolean
  image?: string | null
}

export interface Duration { id: string; label: string; minutes: number; price: number; original?: number }
export interface Review { name: string; rating: number; text: string; date: string }

export interface Term { t: string; d: string }

export interface ServiceDetail extends Service {
  description: string
  headline?: string
  includes: string[]
  excludes: string[]
  note?: string
  terms?: Term[]
  durations: Duration[]
  rating: number
  reviewsCount: number
  reviews: Review[]
}

export interface Referral { code: string; reward: number; label: string }
export interface TrustBadge { icon: string; label: string }
export interface HomeContent { referral: Referral; trust: TrustBadge[]; instantEta: number }

export interface AppNotification { id: string; type: 'booking' | 'offer' | 'cashback'; title: string; body: string; time: string | null; bookingId?: number }

export interface PaymentOption { id: string; name: string; icon: string; sub?: string }
export interface PaymentGroup { group: string; recommended?: boolean; options: PaymentOption[] }
export interface ChargeResult { status: string; txnId: string; method: string; amount: number }

export interface CartItem {
  id: string
  name: string
  icon: string
  category: string
  durationId: string
  durationLabel: string
  price: number
}

export interface User {
  id: number
  phone: string | null
  name: string
  email: string
  provider?: string
  avatar?: string | null
  country?: string | null
  city?: string | null
  location?: string | null
  wallet: number
  rating: number
}

export interface Address {
  id: number
  user_id: number
  label: string
  line: string
  house?: string
  apartment?: string
  street?: string
  landmark?: string
  city?: string
  pincode?: string
  is_default: number
}

export interface Coupon { code: string; type: string; value: number; min: number; max?: number; label: string }
export interface Quote { items: CartItem[]; coupon: string | null; subtotal: number; fee: number; tax: number; discount: number; total: number }

export type BookingTypeId = 'instant' | 'schedule'
export type BookingStatus =
  | 'confirmed' | 'worker_assigned' | 'on_the_way' | 'arrived' | 'in_progress' | 'completed' | 'cancelled'

export interface Booking {
  id: number
  ref: string
  user_id: number
  type: BookingTypeId
  freq?: string
  note?: string
  date?: string
  time?: string
  address: string
  payment: string
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded'
  items: CartItem[]
  duration?: string
  subtotal: number
  fee: number
  tax: number
  discount: number
  coupon?: string
  total: number
  status: BookingStatus
  service_otp: string | null
  scheduled_at?: number | null   // ms epoch of the scheduled slot (null for instant)
  otp_released?: boolean         // false while a future scheduled booking is still waiting
  started_at?: string | null
  completed_at?: string | null   // when the worker ended the service (for actual duration)
  work_photo?: string | null     // worker's proof-of-work photo captured at completion
  cust_lat?: number | null
  cust_lng?: number | null
  pro_name: string
  pro_rating: number
  rating?: number
  review?: string
  photo?: string
  cancel_reason?: string
  cancel_fee?: number
  refund?: number
  created: string
  dist?: number
  eta?: number
  pos?: { lat: number; lng: number }
  serviceAvailable?: boolean
  pro?: {
    id: number; name: string; phone?: string; avatar?: string | null
    rating: number; servicesDone: number; reviewsCount: number
    services: string[]
    reviews: { rating: number; review: string; customer: string; created: string }[]
  }
}

export interface Transaction {
  id: number
  type: 'credit' | 'debit'
  title: string
  amount: number
  balance: number
  ref?: string
  created: string
}

export interface Ticket { id: number; category: string; message: string; status: string; ref: string; created: string }
