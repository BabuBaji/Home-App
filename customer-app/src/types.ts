export interface Service {
  id: string
  name: string
  icon: string
  price: number
  category: string
  available: boolean
}

export interface Duration { id: string; label: string; minutes: number; price: number }
export interface Review { name: string; rating: number; text: string; date: string }

export interface ServiceDetail extends Service {
  description: string
  includes: string[]
  excludes: string[]
  durations: Duration[]
  rating: number
  reviewsCount: number
  reviews: Review[]
}

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
  service_otp: string
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
