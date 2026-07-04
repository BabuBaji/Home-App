export interface Admin {
  id: number; name: string; email: string; phone?: string
  role: 'super' | 'admin' | 'manager' | 'support'
  status: string; avatar?: string | null; last_login?: string | null; created: string
}

export interface DashboardData {
  stats: {
    totalBookings: number; completed: number; active: number; cancelled: number
    revenue: number; customers: number; avgRating: number
    workers: { total: number; active: number; pending: number; inactive: number }
  }
  trend: { day: string; total: number; completed: number; revenue: number }[]
  cityRows: { city: string; n: number }[]
  topServices: { name: string; n: number }[]
  recent: { id: number; ref: string; customer: string; total: number; status: string; created: string; service: string }[]
  registrations: { id: number; name: string; phone?: string; email?: string; city?: string; created: string }[]
}

export interface Customer {
  id: number; name: string; phone?: string; email?: string; city?: string; country?: string
  wallet: number; rating: number; status: string; bookings: number; spend: number
  lastOrder?: string | null; joined: string
}

export interface Worker {
  id: number; name: string; phone?: string; email?: string; city?: string
  services: string[]; avatar?: string | null; status: string; verified: boolean
  rating: number; jobs: number; earnings: number; joined: string
}

export interface AdminBooking {
  id: number; ref: string; customer: string; service: string; pro: string
  date?: string; time?: string; type: string; total: number
  payment: string; payment_status: string; status: string; created: string
}

export interface AdminService {
  id: string; name: string; icon: string; price: number; category: string
  available: boolean; sort: number; bookings: number
}

export interface Complaint {
  id: number; ref: string; customer: string; against?: string; booking_ref?: string
  category: string; message: string; priority: string; status: string; created: string
}

export interface Ticket {
  id: number; user_id: number; customer: string; category: string
  message: string; status: string; ref?: string; created: string
}

export interface Transaction {
  id: number; type: string; title: string; amount: number; created: string; ref?: string; customer: string
}

export type Settings = Record<string, string>
