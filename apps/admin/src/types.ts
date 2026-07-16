export interface Admin {
  id: number; name: string; email: string; phone?: string
  // Role is now a free-form key (system role or a custom one). `permissions` is the resolved,
  // authoritative list the whole UI gates on; `role` is kept for display + the super fast-path.
  role: string
  permissions?: string[]
  // Data scope — 'all' (unrestricted), or 'city'/'zone' with scopeValues = city names / zone ids.
  scopeType?: 'all' | 'city' | 'zone'
  scopeValues?: (string | number)[]
  status: string; avatar?: string | null; last_login?: string | null; created: string
}

/* RBAC — a role is a named bundle of permission keys (see the server-owned catalog). */
export interface PermGroup { module: string; label: string; perms: { key: string; label: string }[] }
export interface Role {
  id: number; key: string; name: string; description: string; rank: number
  isSystem: boolean; active: boolean; landing: string
  permissions: string[]; users: number; created: string
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
  // Phase 1 (admin creates worker). employee_id is server-assigned (WKR1001…); `name` stays the
  // canonical display field and is derived from first+last.
  employee_id?: string; first_name?: string; last_name?: string; alternate_mobile?: string
  worker_category?: string; employment_type?: string; joining_date?: string
  recruiter?: string; referral_source?: string; invited_at?: string | null
  balance?: number; withdrawn?: number; hold?: number; pending?: number; advance_outstanding?: number
  last_lat?: number | null; last_lng?: number | null; shift_def_id?: number | null; site_id?: number | null
  // Organisational assignment. Recorded facts; dispatch matches on zone and does not read these.
  cluster_id?: number | null; store_id?: number | null; reporting_manager_id?: number | null
  // Coverage. These two DO change what dispatch offers (unlike cluster/store/manager).
  job_radius_km?: number | null; allow_outside_radius?: boolean
  salary_plan_id?: number | null; commission_percent?: number | null; wallet_enabled?: boolean
  profile?: {
    bank?: { bankName?: string; bankAccount?: string; bankIfsc?: string; bankUpi?: string; bankHolder?: string; bankAccountType?: string }
    bankVerification?: { status?: string; registeredName?: string; nameMatch?: boolean | null; reason?: string }
    personal?: { gender?: string; dob?: string; fatherName?: string; address?: string; aadhaar?: string; pan?: string; whatsapp?: string; emergencyName?: string; emergencyPhone?: string; languages?: string }
    skillLevels?: Record<string, string>
    // Phase 6: what the worker CLAIMS. Distinct from Worker.services, which is what dispatch
    // matches on — only an admin approval promotes a claim into that live set.
    skills?: Record<string, { level?: string; years?: string; status?: string; reason?: string; certificate?: { fileName?: string } | null }>
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
/** The canonical KYC set, from the server — lets the admin see what's MISSING, not just uploaded. */
export interface WorkerDocType { name: string; required: boolean; hint?: string }
export interface WorkerDetail extends Worker {
  documents?: WorkerDoc[]; documentTypes?: WorkerDocType[]; recentJobs?: WorkerJob[]; notes?: WorkerNote[]
  metrics?: WorkerMetrics; liveJob?: WorkerLiveJob | null; wallet?: WorkerWalletSummary | null
  activity?: ActivityItem[]; earningsTrend?: TrendPoint[]; timeline?: TimelineStep[]; device?: WorkerDevice; health?: WorkerHealth
  jobsPerformance?: JobsPerformance
}

/* Training & assessment (Phase 7). Content is admin-authored: a module starts as an empty
   unpublished draft and is invisible to workers until someone writes and publishes it. */
export interface TrainingModule {
  id: number; key: string; title: string; body: string; sort: number
  published: boolean; questions?: number; updated?: string
}
/** correctIndex is admin-only — the worker's paper is served without it and scored server-side. */
export interface TrainingQuestion {
  id: number; moduleId: number | null; question: string; options: string[]
  correctIndex: number; active: boolean
}
export interface TrainingAdminState {
  ok: boolean; quizSize: number; passPct: number
  /** Active questions whose module is published — the pool a paper is drawn from. */
  bank: number
  modules: TrainingModule[]; questions: TrainingQuestion[]
}
export interface QuizAttempt { id: number; score: number; total: number; pct: number; passed: boolean; created: string }
export interface WorkerTrainingState {
  ok: boolean
  modules: { id: number; key: string; title: string; sort: number; completed: boolean; completedAt: string | null }[]
  progress: { completed: number; total: number }
  quiz: {
    size: number; passPct: number; bank: number; passed: boolean; passedAt: string | null
    bestPct: number | null; attempts: number
    /** Each reason the quiz can't be sat right now, so the UI can explain rather than grey out. */
    modulesDone: boolean; ready: boolean; onCooldown: boolean; cooldownUntil: string | null
    history: QuizAttempt[]
  }
}

/* Phase 9 — equipment. `required` drives Phase 12's "Equipment Issued" check and defaults to false
   on every item: which kit a worker must hold before going live is the company's call. */
export interface EquipmentType { id: number; key: string; name: string; required: boolean; active: boolean; sort: number; issued?: number }
export interface IssuedEquipment {
  id: number; typeId: number; name: string; serial: string; notes: string
  status: 'issued' | 'returned'; issuedAt: string; issuedBy: string
  returnedAt: string | null; returnedBy: string
}
export interface WorkerEquipmentState { ok: boolean; types: EquipmentType[]; issued: IssuedEquipment[] }

/* Phase 10 — per-worker pay. commissionPercent null means "inherit the platform rate", which is
   every existing worker. The wallet reads this when it settles a job, so it moves real money. */
export interface WorkerPay {
  ok: boolean
  /** A hand-typed rate. Null when the worker is on a plan — the two are mutually exclusive. */
  commissionPercent: number | null
  salaryPlanId: number | null
  salaryPlan: SalaryPlan | null
  platformCommissionPercent: number
  effectiveCommissionPercent: number
  /** Where the effective rate came from, so the panel never implies a source it doesn't have. */
  commissionSource: 'plan' | 'manual' | 'platform'
  walletEnabled: boolean
  plans?: SalaryPlan[]
  incentivePlanId: number | null
  incentivePlan: IncentivePlan | null
  incentivePlans?: IncentivePlan[]
  salaryEffectiveFrom: string | null
  pfApplicable: boolean; esiApplicable: boolean; tdsApplicable: boolean
  salaryPaymentMode: 'bank' | 'upi'
  statutory: { pfPercent: number; pfWageCeiling: number; esiPercent: number; esiWageCeiling: number; tdsPercent: number }
  /** Set by the server when the caller lacks workers.pay_view — every amount above is withheld. */
  masked?: boolean
}

/* Job radius & coverage. allowOutsideRadius=true (the default and today's behaviour) leaves zone a
   soft preference so nobody in a quiet zone starves; false makes the zone a real filter and applies
   jobRadiusKm measured from the worker's assigned store. */
export interface WorkerCoverage {
  ok: boolean
  zoneId: number | null
  storeId: number | null
  jobRadiusKm: number | null
  allowOutsideRadius: boolean
}

/* Salary plans — a named commission rate an admin defines once and assigns, instead of typing a
   percentage per worker. NOT seeded: "Worker Level 1 = 20%" is the company's payroll policy.
   per_job only; fixed/hybrid need a monthly payroll run that doesn't exist. */
export interface SalaryPlan {
  id: number; name: string; salaryType: 'per_job' | 'fixed' | 'hybrid'; commissionPercent: number
  monthlyBasic: number; attendanceAllowance: number; otherAllowance: number; totalFixedPay: number
  notes: string; active: boolean; sort: number
  /** 100 - commission, or null on a fixed plan where there is no per-job share. */
  workerKeeps: number | null
  paysPerJob: boolean; paysMonthly: boolean
  workers?: number
}
export interface IncentiveComponent { key: string; label: string; detail: string; auto: boolean; on: boolean }
export interface AttendanceTier { label: string; days: number; sundays: number; amount: number }
export interface IncentivePlan {
  id: number; name: string; notes: string; active: boolean; sort: number
  perJobAmount: number
  qualityBonusAmount: number; qualityMinRating: number
  /** Sitara/Shakti attendance tiers, folded in. Worker earns the highest they reach that month. */
  attendanceTiers: AttendanceTier[]; tierMinRating: number
  /** Paid by the admin's manual-bonus action — no automated trigger exists for these. */
  peakHourAmount: number; referralAmount: number; festivalAmount: number
  /** The admin's own estimate of typical monthly incentives, shown as a range. 0 = not set. */
  estIncentiveMin: number; estIncentiveMax: number
  /** All six components; `on` = this plan funds it, `auto` = the system pays it. */
  components: IncentiveComponent[]
  workers?: number
}
export interface PayrollLine {
  workerId: number; name: string; basic: number; allowance: number
  incentives: { label: string; amount: number }[]
  deductions: { label: string; amount: number }[]
  gross: number; totalDeductions: number; net: number; note: string
}
export interface PayrollRun {
  id: number; month: string; status: 'draft' | 'approved'
  createdBy: string; approvedBy: string; created: string; approvedAt: string | null
  lines?: PayrollLine[]
  workers?: number; net?: number
  totals?: { workers: number; gross: number; deductions: number; net: number }
}
export interface SalaryPlansState { ok: boolean; platformCommissionPercent: number; plans: SalaryPlan[] }

/* Phase 11 — availability. A PREFERENCE (what the worker asked for) is distinct from the
   ASSIGNMENT (workers.shift_def_id / zone_id), which only an admin writes. weeklyOff is derived
   server-side from availableDays — one fact, one representation. */
export interface WorkerAvailability {
  /** Keys are 'Mon'…'Sun' — the worker app's vocabulary, not 'Monday'. */
  availableDays: Record<string, boolean>
  weeklyOff: string[]
  shiftStart: string; shiftEnd: string
  preferredShiftId: number | null
  /** The only preference that enforces: dispatch stops offering work past it. */
  maxWeeklyHours: number | null
  preferredZoneId: number | null
  status: 'Pending' | 'Approved' | 'Modified'
  reason: string; reviewedBy: string; reviewedAt: string | null
}
export interface WorkerAvailabilityState {
  ok: boolean
  availability: WorkerAvailability
  shifts: { id: number; name: string; start?: string; end?: string }[]
  assigned: { shiftDefId: number | null; zoneId: number | null }
  hoursThisWeek: number
}

/* Phase 8 — background verification.
   source 'document' items are DERIVED from the Phase 4 document review — there is no second tick
   for them, because two sources of truth for "Aadhaar verified" would drift. Only 'check' items
   (previous employer, criminal) are recorded here; neither exists anywhere else. */
export type BgStatus = 'pending' | 'clear' | 'flagged' | 'unreachable' | 'not_applicable'
export interface BackgroundItem {
  key: string; label: string; source: 'document' | 'check'; ok: boolean
  status: BgStatus; detail: string
  outcomes?: BgStatus[]; reference?: string; notes?: string
  checkedBy?: string; checkedAt?: string | null
  /** The worker's own claim, so whoever calls knows who to call. Not evidence of anything. */
  claim?: string
}
export interface BackgroundState { ok: boolean; worker: { id: number; name: string }; items: BackgroundItem[]; verified: boolean }

/* Phase 12 — final approval. Every item is computed from real state; none is a stored tick an
   admin can set directly. 'na' means there is nothing to satisfy (no training published, no
   equipment marked required, no email provider) — those never block. */
export type CheckState = 'ok' | 'no' | 'na'
export interface ChecklistItem { key: string; label: string; state: CheckState; detail: string }
export interface ApprovalRecord { id: number; admin: string; overridden: string[]; reason: string; created: string }
export interface GoLiveChecklist {
  ok: boolean
  worker: { id: number; name: string; status: string }
  items: ChecklistItem[]
  blocking: string[]
  ready: boolean
  live: boolean
  /** The worker saying "I've finished my part". Not an approval — Go Live stays the admin's call. */
  submittedAt: string | null
  history: ApprovalRecord[]
}

/* Compensation Rule Engine. A rule is authored as config (scope + conditions + calculation) and
   the engine pays it. Editing creates a new immutable version; payouts pin the version that paid. */
export interface RuleField { key: string; label: string; type: 'number' | 'string' | 'enum'; triggers: string[] }
export interface RuleMeta { triggers: string[]; scopeTypes: string[]; calcTypes: string[]; stackModes: string[]; operators: string[]; fields: RuleField[]; categories: string[] }
export interface RuleCondition { field: string; op: string; value: string }
export interface RuleSlab { from: number; to: number; amount: number }
export interface RuleCalc { amount?: number; percent?: number; base?: string; perUnit?: number; maxUnits?: number; slabMetric?: string; slabs?: RuleSlab[] }
export interface RuleVersion {
  id: number; ruleId: number; version: number; isCurrent: boolean; trigger: string
  effectiveFrom: string | null; effectiveTo: string | null
  scopeType: string; scopeValues: string[]; matchMode: 'all' | 'any'
  conditions: RuleCondition[]; calcType: string; calc: RuleCalc
  stack: string; stackGroup: string; budgetMonth: number; notes: string; createdBy: string; created: string
}
export interface RulePayout { id: number; workerId: number; amount: number; month: string; ref: string; detail: string; versionId: number; created: string }
export interface IncentiveRule {
  id: number; code: string; name: string; description: string; category: string
  priority: number; active: boolean; created: string
  current: RuleVersion | null
  spentThisMonth?: number
  versions?: RuleVersion[]
  payouts?: RulePayout[]
  audit?: { action: string; detail: string; by: string; created: string }[]
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
