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
  id: number; name: string; phone?: string; email?: string; city?: string; zone_id?: number | null
  services: string[]; avatar?: string | null; status: string; verified: boolean
  rating: number; jobs: number; earnings: number; joined: string; designation?: string
  bank_status?: string; available?: boolean; on_shift?: boolean
  balance?: number; withdrawn?: number; hold?: number; pending?: number; advance_outstanding?: number
  last_lat?: number | null; last_lng?: number | null; shift_def_id?: number | null; site_id?: number | null
  profile?: {
    bank?: { bankName?: string; bankAccount?: string; bankIfsc?: string; bankUpi?: string; bankHolder?: string; bankAccountType?: string }
    bankVerification?: { status?: string; registeredName?: string; nameMatch?: boolean | null; reason?: string }
    personal?: { gender?: string; dob?: string; fatherName?: string; address?: string; aadhaar?: string; pan?: string; whatsapp?: string; emergencyName?: string; emergencyPhone?: string; languages?: string }
    skillLevels?: Record<string, string>
    availability?: { availableDays?: Record<string, boolean>; shiftStart?: string; shiftEnd?: string }
  }
}

export interface WorkerDoc {
  id: number; name: string; fileName?: string; status?: string; created?: string
  // hasFile is false for rows predating the storage pipeline — they have no object to preview.
  hasFile?: boolean; mime?: string; sizeBytes?: number
  reviewedBy?: string; reviewedAt?: string | null; rejectReason?: string
}
export interface WorkerJob { id: number; ref: string; service: string; status: string; total: number; date?: string; time?: string }
export interface WorkerMetrics {
  totalJobs: number; completed: number; cancelled: number; todayJobs: number; weekJobs: number
  monthJobs: number; completedToday?: number; completedWeek?: number; completedMonth?: number
  cancellationPct: number; completionPct: number; acceptanceRate?: number
  onTimePct?: number; onTimeSamples?: number; todayEarnings: number
  trends?: { weekJobs: number; completion: number; cancellation: number; rating: number } | null
}
export interface WorkerDevice { battery?: number | null; network?: string | null; idleMins?: number | null; lastSeen?: string | null }
export interface WorkerHealth { riskScore: number; level: string; attendanceRisk: number; burnoutRisk: number; lateProbability: number; complaintProbability: number; suggestion: string }
export interface WorkerLiveJob { id: number; ref: string; service: string; status: string; total: number; apartment?: string; otpStatus?: string; startedAt?: string; date?: string; time?: string }
export interface WorkerWalletSummary {
  available?: number; totalEarned?: number; totalWithdrawn?: number; hold?: number
  weekEarnings?: number; monthEarnings?: number; todayEarnings?: number; advanceOutstanding?: number
  // Payout policy from settings — nextPayout is an estimate off the configured schedule ('' = on-demand).
  nextPayout?: string; nextPayoutEst?: number; payoutFrequency?: string; minPayoutLimit?: number
}
export interface WorkerNote { id: number; note: string; author?: string; created?: string }
export interface ActivityItem { id: number; action: string; detail?: string; ref?: string; created?: string }
export interface TrendPoint { date: string; amount: number }
export interface TimelineStep { action: string; detail?: string; created?: string }
export interface JobPerfSummary {
  totalJobs: number; completed: number; completedPct: number; cancelled: number; cancelledPct: number
  noShow: number; noShowPct: number; onTimeArrivals: number; onTimePct: number; avgRating: number; totalEarnings: number
}
export interface JobSegment { key?: string; label?: string; service?: string; count: number; pct: number }
export interface JobPerfMetrics {
  acceptanceRate: number; acceptanceDelta: number | null; onTimeArrival: number; onTimeDelta: number | null
  cancellationRate: number; cancellationDelta: number | null; customerRating: number; ratingDelta: number | null
  jobsPerDay: number; jobsPerDayDelta: number | null; earningsPerDay: number; earningsPerDayDelta: number | null
}
export interface JobRow {
  id: number; ref: string; service: string; customer: string; date: string; time: string; created: string
  amount: number; status: string; acceptance: string; onTime: string; rating: number | null; earnings: number
}
export interface JobsPerformance {
  summary: JobPerfSummary
  byStatus: { total: number; segments: JobSegment[] }
  byService: { total: number; segments: JobSegment[] }
  metrics: JobPerfMetrics
  trend: { date: string; value: number }[]
  jobs: JobRow[]
}
export interface WalletTxn {
  id: number; ts: number; date: string; time: string; type: string; refId: string
  amount: number; isCredit: boolean; status: string; method: string; remarks: string
  // Quotable id for support: the real gateway reference on payouts, else a derived ledger id.
  reference?: string
  // Who credited it: 'System' for platform-calculated rows, an admin's name for a manual bonus.
  source?: string
}
export interface WalletWithdrawal {
  id: number; amount: number; method: string; destination: string; status: string; remarks: string; reference: string; date: string
  // payoutId = our ledger id; reference = gateway payout id; utr = the bank's transfer number.
  payoutId?: string; utr?: string; time?: string
}
export interface WalletState {
  walletSummary: WorkerWalletSummary & { totalEarned?: number; totalWithdrawn?: number }
  earningsBreakup: { category: string; amount: number }[]
  history: WalletTxn[]
  withdrawals: WalletWithdrawal[]
  advances?: unknown[]
}
export interface WorkerDetail extends Worker {
  documents?: WorkerDoc[]; recentJobs?: WorkerJob[]; notes?: WorkerNote[]
  metrics?: WorkerMetrics; liveJob?: WorkerLiveJob | null; wallet?: WorkerWalletSummary | null
  activity?: ActivityItem[]; earningsTrend?: TrendPoint[]; timeline?: TimelineStep[]; device?: WorkerDevice; health?: WorkerHealth
  jobsPerformance?: JobsPerformance
}

export interface AdminBooking {
  id: number; ref: string; customer: string; service: string; pro: string
  date?: string; time?: string; type: string; total: number
  payment: string; payment_status: string; status: string; created: string
}

export interface AdminService {
  id: string; name: string; icon: string; price: number; category: string
  available: boolean; sort: number; bookings: number; durationMin?: number; gstPct?: number
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
