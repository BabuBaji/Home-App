package com.homehelp.pro.network

import com.homehelp.pro.Booking
import com.homehelp.pro.EarningEntry
import com.homehelp.pro.Job
import com.homehelp.pro.WalletTxn

/** Worker profile as stored on the backend. Field names match the JSON 1:1. */
data class WorkerDto(
    val name: String = "",
    /** 'pending' | 'onboarding' | 'active' | … The app had no idea which; the wizard needs it. */
    val status: String = "",
    /** Rides along on bootstrap (workerDto spreads profile), so routing needs no extra call. */
    val onboarding: OnboardingMark? = null,
    val phone: String = "",
    val email: String = "",
    val city: String = "",
    val jobsCompleted: Int = 0,
    val rating: Double = 0.0,
    val bankName: String = "",
    val bankAccount: String = "",
    val bankIfsc: String = "",
    val bankHolder: String = "",
    val bankUpi: String = "",
    val bankAccountType: String = "",
    // Phase 2/3 — the worker's own profile. Previously admin-entered only; the app never saw them.
    val gender: String = "",
    val dob: String = "",
    val bloodGroup: String = "",
    val maritalStatus: String = "",
    val fatherName: String = "",
    val motherName: String = "",
    val emergencyName: String = "",
    val emergencyPhone: String = "",
    val address: String = "",           // current address
    val permanentAddress: String = "",
    val languages: String = "",
    val qualification: String = "",
    val experienceYears: String = "",
    val previousCompany: String = "",
    val avatar: String = "",
    val bankStatus: String = "Not Added",
    val bankRemarks: String = "",
    val bankRegisteredName: String = "",
    val bankNameMatch: Boolean? = null,
    val shiftStart: String = "",
    val shiftEnd: String = "",
    val availabilityState: String = "",
    val availableDays: Map<String, Boolean> = emptyMap(),
    val jobPreferences: Map<String, Boolean> = emptyMap(),
    val notifNewJobs: Boolean = true,
    val notifPayments: Boolean = true,
    val notifPromotions: Boolean = false,
    val notifRatings: Boolean = true,
)

data class WalletDto(
    val balance: Int = 0,
    val totalEarned: Int = 0,
    val withdrawnTotal: Int = 0,
    val pendingAmount: Int = 0,
    val todayEarnings: Int = 0,
    val todayJobs: Int = 0,
)

data class DocumentDto(
    val id: Int = 0,
    val name: String = "",
    val status: String = "",
    val fileName: String = "",
    val hasFile: Boolean = false,
    /** Why an admin sent it back. The worker cannot fix a document without being told. */
    val rejectReason: String = "",
)

/* ---------- wallet module ---------- */
/** Dashboard balances + period totals. */
data class WalletSummaryDto(
    val available: Int = 0,
    val pending: Int = 0,
    val hold: Int = 0,
    val todayEarnings: Int = 0,
    val todayJobs: Int = 0,
    val todayCompleted: Int = 0,
    val todayCancelled: Int = 0,
    val weekEarnings: Int = 0,
    val monthEarnings: Int = 0,
    // Prior periods (same window length as the one they compare against), so the wallet can show
    // "+15% vs yesterday" from real figures instead of a decorative arrow.
    val yesterdayEarnings: Int = 0,
    val lastWeekEarnings: Int = 0,
    val lastMonthEarnings: Int = 0,
    val totalEarned: Int = 0,
    val totalWithdrawn: Int = 0,
    val advanceOutstanding: Int = 0,
    val nextPayout: String = "",
    // Lifetime performance rates. Null when the worker has no history yet — the Home
    // Performance Overview renders "—" rather than a misleading 0%.
    val completionPct: Int? = null,
    val cancellationPct: Int? = null,
    val punctualityPct: Int? = null,
    val acceptancePct: Int? = null,
)

data class BreakupItem(val category: String = "", val amount: Int = 0)

data class DeductionsDto(
    val summary: List<BreakupItem> = emptyList(),
    val detail: List<DeductionEntry> = emptyList(),
    val total: Int = 0,
)
data class DeductionEntry(val category: String = "", val label: String = "", val amount: Int = 0, val date: String = "")

/** One row of the full wallet history. */
data class LedgerEntry(
    val id: Int = 0,
    val date: String = "",
    val time: String = "",
    val type: String = "",
    val refId: String = "",
    val amount: Int = 0,
    val isCredit: Boolean = true,
    val status: String = "",
    val method: String = "",
    val remarks: String = "",
)

data class WithdrawalEntry(
    val id: Int = 0,
    val amount: Int = 0,
    val method: String = "",
    val destination: String = "",
    val status: String = "",
    val remarks: String = "",
    val reference: String = "",
    val date: String = "",
)

/** Transaction receipt generated after a withdrawal. */
data class WithdrawalReceiptDto(
    val reference: String = "",
    val workerName: String = "",
    val workerId: String = "",
    val amount: Int = 0,
    val method: String = "",
    val destination: String = "",
    val status: String = "",
    val date: String = "",
    val time: String = "",
    val processedDate: String = "",
    val bankDetails: String = "",
    val note: String = "",
)

data class AdvanceEntry(
    val id: Int = 0,
    val amount: Int = 0,
    val status: String = "",
    val recovered: Int = 0,
    val remarks: String = "",
    val date: String = "",
)

data class AdvanceEligibilityDto(
    val eligible: Boolean = false,
    val maxAmount: Int = 0,
    val attendancePct: Int = 0,
    val rating: Double = 0.0,
    val completedJobs: Int = 0,
    val activePenalties: Int = 0,
    val reasons: List<String> = emptyList(),
)

data class PayslipDto(
    val workerName: String = "",
    val workerId: String = "",
    val month: String = "",
    val totalJobs: Int = 0,
    val grossEarnings: Int = 0,
    val bonuses: Int = 0,
    val deductions: Int = 0,
    val netPay: Int = 0,
    val withdrawals: Int = 0,
    val pending: Int = 0,
    val bankDetails: String = "",
    val breakup: List<BreakupItem> = emptyList(),
    val deductionBreakup: List<BreakupItem> = emptyList(),
)

/** Aggregated wallet state returned by /wallet/state and the action endpoints. */
data class WalletStateResponse(
    val ok: Boolean = true,
    val error: String? = null,
    val walletSummary: WalletSummaryDto? = null,
    val earningsBreakup: List<BreakupItem> = emptyList(),
    val deductions: DeductionsDto? = null,
    val history: List<LedgerEntry> = emptyList(),
    val withdrawals: List<WithdrawalEntry> = emptyList(),
    val advances: List<AdvanceEntry> = emptyList(),
)

/* ---------- wallet analytics (3_wallet.png) ---------- */

/** One day of the earnings trend. [date] is ISO (yyyy-MM-dd). */
data class TrendPoint(val date: String = "", val amount: Int = 0)

data class ServiceEarning(val service: String = "", val amount: Int = 0, val pct: Int = 0)

data class ServiceWiseDto(val total: Int = 0, val services: List<ServiceEarning> = emptyList())

/** Payout rules + where the money goes. [bankAccount] is already masked server-side. */
data class SettlementDto(
    val dailyTime: String = "",
    val frequency: String = "",
    val minPayout: Int = 0,
    val autoWithdraw: Boolean = false,
    val mode: String = "",
    val bankAccount: String = "",
    val bankName: String = "",
    val bankVerified: Boolean = false,
    val bankStatus: String = "",
)

/** Null when there aren't enough earning peers this month for a percentile to mean anything. */
data class LeaderboardDto(val rank: Int = 0, val of: Int = 0, val topPercent: Int = 0)

data class WalletAnalyticsResponse(
    val ok: Boolean = true,
    val trend: List<TrendPoint> = emptyList(),
    val serviceWise: ServiceWiseDto? = null,
    val settlement: SettlementDto? = null,
    val leaderboard: LeaderboardDto? = null,
)

/* ---------- wallet module: bank accounts · PIN · payout settings ---------- */

/** A payout destination. [accountMasked] is masked server-side; [account] is the raw number. */
data class BankAccount(
    val id: Int = 0,
    val holder: String = "",
    val bankName: String = "",
    val account: String = "",
    val accountMasked: String = "",
    val ifsc: String = "",
    val upi: String = "",
    val accountType: String = "Savings",
    val branch: String = "",
    val status: String = "Pending",
    val verified: Boolean = false,
    val isDefault: Boolean = false,
)

data class BankAccountsResponse(
    val ok: Boolean = true,
    val error: String? = null,
    val accounts: List<BankAccount> = emptyList(),
)

data class BankAccountBody(
    val holder: String? = null,
    val bankName: String? = null,
    val account: String? = null,
    val ifsc: String? = null,
    val upi: String? = null,
    val accountType: String? = null,
)

data class PayoutSettingsDto(
    val dailySettlement: Boolean = true,
    val weeklySettlement: Boolean = false,
    val minPayout: Int = 200,
    val settlementTime: String = "07:00 AM",
    val autoWithdraw: Boolean = false,
    val smsNotify: Boolean = true,
    val emailNotify: Boolean = false,
)

data class PayoutSettingsResponse(val ok: Boolean = true, val settings: PayoutSettingsDto? = null)

data class PinStatusResponse(val ok: Boolean = true, val isSet: Boolean = false, val locked: Boolean = false)
data class PinBody(val pin: String, val otp: String? = null)
data class PinResult(
    val ok: Boolean = false,
    val error: String? = null,
    val isSet: Boolean = false,
    val attemptsLeft: Int? = null,
    val lockedFor: Int? = null,
)

/** Withdrawal request body — the PIN is checked again server-side at this endpoint. */
data class WithdrawRequestBody(
    val amount: Int,
    val pin: String,
    val bankAccountId: Int? = null,
    val method: String = "bank",
)

data class WithdrawResult(
    val ok: Boolean = false,
    val error: String? = null,
    val withdrawalId: Int = 0,
    val reference: String = "",
    val status: String = "",
    val destination: String = "",
    val expectedCredit: String = "",
    val walletSummary: WalletSummaryDto? = null,
    val withdrawals: List<WithdrawalEntry> = emptyList(),
)

data class OtpResponse(val ok: Boolean = true, val devOtp: String = "")

data class NotificationItem(
    val id: Int = 0,
    val text: String = "",
    val kind: String = "info",
    val read: Boolean = false,
    val time: String = "",
    val date: String = "",
)
data class NotificationsResponse(val items: List<NotificationItem> = emptyList(), val unread: Int = 0)

/** Full app state returned by /auth/verify and /bootstrap. */
data class BootstrapResponse(
    val token: String? = null,
    val worker: WorkerDto? = null,
    val wallet: WalletDto? = null,
    val walletSummary: WalletSummaryDto? = null,
    val jobStatus: String? = null,
    val activeJob: Job? = null,
    val bookings: List<Booking> = emptyList(),
    val schedule: List<ScheduleItem> = emptyList(),
    val attendance: AttendanceDto? = null,
    val shift: ShiftInfo? = null,
    val leaves: List<LeaveItem> = emptyList(),
    val tickets: List<TicketItem> = emptyList(),
    val earnings: List<EarningEntry> = emptyList(),
    val walletTxns: List<WalletTxn> = emptyList(),
    val documents: List<DocumentDto> = emptyList(),
)

/** Today's attendance snapshot (check-in / check-out) + the worker's shift-plan status. */
data class AttendanceDto(
    val checkedIn: Boolean = false,
    val checkedOut: Boolean = false,
    val checkInAt: String = "",
    val checkOutAt: String = "",
    val status: String = "Not checked in",
    val attendedThisMonth: Int = 0,
    // Shift-plan context: which shift, its start window, and today's on-time / penalty / guarantee.
    val shiftId: Int? = null,
    val shiftName: String = "",
    val shiftStart: String = "",
    val shiftEnd: String = "",
    val graceMin: Int = 0,
    val onTime: Boolean = true,
    val lateMinutes: Int = 0,
    val penalty: Int = 0,
    val minGuarantee: Int = 0,
    // Assigned apartment (geofence): centre + radius the worker must stay within for the day.
    val siteName: String = "",
    val siteAddress: String = "",
    val siteLat: Double? = null,
    val siteLng: Double? = null,
    val geofenceM: Int = 300,
    val geoActive: Boolean = false,
    val geoOutside: Boolean = false,
    val geoBreaches: Int = 0,
)

data class GeofenceReportBody(val lat: Double, val lng: Double)

/** Result of reporting the worker's live location against their assigned-apartment radius. */
data class GeofenceStatus(
    val active: Boolean = false,
    val inside: Boolean = true,
    val distance: Int = 0,
    val radius: Int = 0,
    val siteName: String = "",
    val breaches: Int = 0,
    val justBreached: Boolean = false,
)

/** A selectable shift plan (min-guarantee model). */
data class ShiftDto(
    val id: Int = 0,
    val code: String = "",
    val name: String = "",
    val start: String = "",
    val end: String = "",
    val hours: Int = 8,
    val graceMin: Int = 15,
    val penalty: Int = 50,
    val minGuarantee: Int = 0,
)

/** The available shift plans + which one the worker has selected. */
data class ShiftInfo(
    /** What the ADMIN assigned — the shift whose minimum-earnings guarantee actually applies. */
    val selectedId: Int? = null,
    /** What the worker asked for. Pending until an admin approves it; a request is not a grant. */
    val requestedId: Int? = null,
    val shiftStatus: String = "Pending",
    val shifts: List<ShiftDto> = emptyList(),
)

data class SelectShiftBody(val shiftId: Int)

data class AttendanceBody(val lat: Double? = null, val lng: Double? = null)

/** "Are you coming in tomorrow?" — prompt state + the worker's stored answer for the target date. */
data class NextDayStatus(
    val forDate: String = "",
    val prompt: Boolean = false,
    val responded: Boolean = false,
    val coming: Boolean? = null,
    val note: String = "",
)

data class NextDayBody(val coming: Boolean, val note: String? = null)

data class StatusBody(val state: String)
data class TicketItem(val id: Int = 0, val subject: String = "", val message: String = "", val status: String = "Open", val created: String = "")
data class TicketBody(val subject: String, val message: String)
data class SosBody(val lat: Double? = null, val lng: Double? = null)
data class SosResponse(val ok: Boolean = true, val message: String = "")
data class LeaveBody(val fromDate: String, val toDate: String, val reason: String)
data class LeaveItem(
    val id: Int = 0,
    val fromDate: String = "",
    val toDate: String = "",
    val reason: String = "",
    val status: String = "Pending",
)

/** One row in Today's Schedule (timeline). All Strings default so a missing key never NPEs. */
data class ScheduleItem(
    val time: String = "",
    val service: String = "",
    val location: String = "",
    val durationMins: Int = 0,
    val customerName: String = "",
    val paymentStatus: String = "",
    val status: String = "",
    // Straight-line distance from the worker's last reported position, and a speed-based ETA
    // estimate. Both null when either side has no GPS fix yet — the app then renders "—".
    val distanceKm: Double? = null,
    val etaMins: Int? = null,
    /** Booking reference, and the worker's share of this job (not the customer's total). */
    val ref: String? = null,
    val earnings: Int = 0,
)

data class DocumentsResponse(val ok: Boolean = true, val documents: List<DocumentDto> = emptyList())

data class RequestJobResponse(val job: Job? = null, val jobStatus: String? = null)

data class StatusResponse(
    val ok: Boolean = true,
    val error: String? = null,
    val jobStatus: String? = null,
    val activeJob: Job? = null,
)

/* ---------- In-service job state: checklist · photos · extras · pause · chat ---------- */

/** One task on the job's checklist. Seeded server-side from the booked services. */
data class ChecklistTask(
    val id: Int = 0,
    val label: String = "",
    val service: String = "",
    val done: Boolean = false,
)

/** A worker-added extra service billed on top of the booking. */
data class JobExtra(val id: Long = 0, val name: String = "", val price: Int = 0)

/** One captured shot, keyed by its named slot ("Sink Area") so a retake replaces it. */
data class JobPhoto(val slot: String = "", val url: String = "", val at: String = "")

/**
 * The live working state of the active job. [pausedMs] is the total time the service has spent
 * paused (including any pause still running), which the in-progress timer subtracts so a pause
 * genuinely stops the clock.
 */
data class JobStateResponse(
    val ok: Boolean = true,
    val error: String? = null,
    val checklist: List<ChecklistTask> = emptyList(),
    /** The named shots this job requires, seeded server-side from the booked service. */
    val photoSlots: List<String> = emptyList(),
    val beforePhotos: List<JobPhoto> = emptyList(),
    val afterPhotos: List<JobPhoto> = emptyList(),
    val beforeNotes: String = "",
    val afterNotes: String = "",
    val signature: String? = null,
    val signed: Boolean = false,
    val customerRating: Int = 0,
    val customerNotes: String = "",
    val extras: List<JobExtra> = emptyList(),
    val paused: Boolean = false,
    val pausedMs: Long = 0,
    val extrasTotal: Int = 0,
)

data class ChecklistBody(val items: List<ChecklistTask>)
data class PhotoBody(val phase: String, val slot: String, val photo: String)
data class PhotoRemoveBody(val phase: String, val slot: String)
data class NotesBody(val phase: String, val text: String)
data class SignatureBody(val signature: String, val rating: Int, val notes: String)
data class ExtraBody(val name: String, val price: Int)
data class ExtraRemoveBody(val id: Long)
data class PauseBody(val reason: String? = null)
data class MessageBody(val text: String)

data class JobMessage(
    val id: Int = 0,
    val sender: String = "",
    val body: String = "",
    val created: String = "",
) {
    val fromWorker: Boolean get() = sender == "worker"
}

data class MessagesResponse(
    val ok: Boolean = true,
    val error: String? = null,
    val messages: List<JobMessage> = emptyList(),
)

data class SettleResponse(
    val ok: Boolean = true,
    val wallet: WalletDto? = null,
    val walletSummary: WalletSummaryDto? = null,
    val bookings: List<Booking> = emptyList(),
    val earnings: List<EarningEntry> = emptyList(),
    val walletTxns: List<WalletTxn> = emptyList(),
)

data class WalletOpResponse(
    val ok: Boolean = false,
    val error: String? = null,
    val wallet: WalletDto? = null,
    val walletTxns: List<WalletTxn> = emptyList(),
)

/* ---------- Refer & Earn / Insurance / Merch / Rewards ---------- */
data class ReferralItem(val amount: Int = 0, val label: String = "", val date: String = "")
data class ReferralDto(
    val code: String = "",
    val bonus: Int = 0,
    val lifetimeEarnings: Int = 0,
    val referrals: List<ReferralItem> = emptyList(),
    val shareMessage: String = "",
)
data class InsuranceDto(
    val activated: Boolean = false,
    val coverage: String = "",
    val policyNo: String = "",
    val helpline: String = "",
)
data class MerchProduct(val id: String = "", val name: String = "", val emoji: String = "", val price: Int = 0, val desc: String = "")
data class MerchResponse(val products: List<MerchProduct> = emptyList())
data class RewardItem(val label: String = "", val amount: Int = 0, val date: String = "")
data class RewardsDto(
    val goldCoins: Int = 0,
    val coinValue: Int = 0,
    val redCards: Int = 0,
    val cardValue: Int = 0,
    val coinItems: List<RewardItem> = emptyList(),
    val cardItems: List<RewardItem> = emptyList(),
)
data class ShaktiTier(val name: String = "", val amount: Int = 0, val days: Int = 0, val sundays: Int = 0)
data class ShaktiBonusDto(
    val tiers: List<ShaktiTier> = emptyList(),
    val workingDays: Int = 0,
    val sundays: Int = 0,
    val rating: Double = 0.0,
    val ratingTarget: Double = 4.5,
    val ratingMet: Boolean = false,
    val currentTier: String = "",
    val nextTier: String = "",
    val daysToNext: Int = 0,
    val sundaysToNext: Int = 0,
    val lastUpdated: String = "",
)
data class SimpleResult(val ok: Boolean = false, val error: String? = null, val message: String = "")
data class ClaimBody(val reason: String)
data class MerchOrderBody(val productId: String)

// ---- request bodies ----
data class AuthRequest(val phone: String, val otp: String? = null)
data class OtpBody(val otp: String)
data class EndBody(val photo: String? = null)
data class LatLngBody(val lat: Double, val lng: Double)
data class AmountBody(val amount: Int)
data class WithdrawBody(val amount: Int, val method: String, val otp: String)
data class AdvanceBody(val amount: Int)
data class ReasonBody(val reason: String)
/** Phase 2/3. Nulls are omitted by Gson, and the server allow-lists + merges, so a screen can
 *  send just the fields it owns without blanking the rest. */
data class ProfileBody(
    val name: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val city: String? = null,
    val gender: String? = null,
    val dob: String? = null,
    val bloodGroup: String? = null,
    val maritalStatus: String? = null,
    val fatherName: String? = null,
    val motherName: String? = null,
    val emergencyName: String? = null,
    val emergencyPhone: String? = null,
    val address: String? = null,
    val permanentAddress: String? = null,
    val languages: String? = null,
    val qualification: String? = null,
    val experienceYears: String? = null,
    val previousCompany: String? = null,
)
/** Short-lived signed URL for viewing a stored KYC document. */
data class SignedUrlResponse(val ok: Boolean = true, val url: String = "")

/** Phase 4: the canonical KYC document set, owned by the server (it validates uploads against it). */
data class DocTypeDto(val name: String = "", val required: Boolean = true, val hint: String = "")
data class DocTypesResponse(val ok: Boolean = true, val types: List<DocTypeDto> = emptyList())

/* ---------- Phase 6: service skills ----------
 * A CLAIM, not a capability. `status` is Pending/Approved/Rejected; only an admin approval puts
 * the service into the worker's live set (what dispatch matches on).
 */
data class SkillCert(val key: String = "", val fileName: String = "")
data class SkillDto(
    val level: String = "",
    val years: String = "",
    val status: String = "Pending",
    val reason: String = "",
    val certificate: SkillCert? = null,
)
data class SkillsResponse(
    val ok: Boolean = true,
    val skills: Map<String, SkillDto> = emptyMap(),
    val levels: List<String> = emptyList(),
    /** Services an admin has actually approved — these are the ones that bring work. */
    val approved: List<String> = emptyList(),
)
data class ServicesResponse(val ok: Boolean = true, val services: List<String> = emptyList(), val levels: List<String> = emptyList())
data class SkillsBody(val skills: Map<String, SkillClaim> = emptyMap())
data class SkillClaim(val level: String = "", val years: String = "")
/* ---------- Phase 7: training & assessment ----------
 * Only PUBLISHED modules ever reach the app — a module the admin hasn't written yet simply isn't
 * in the list. The quiz paper carries no answer key; it's scored on the server.
 */
data class TrainingModuleDto(
    val id: Int = 0,
    val key: String = "",
    val title: String = "",
    val body: String = "",
    val sort: Int = 0,
    val completed: Boolean = false,
    val completedAt: String? = null,
)
data class TrainingProgress(val completed: Int = 0, val total: Int = 0)
data class QuizAttemptDto(val id: Int = 0, val score: Int = 0, val total: Int = 0, val pct: Int = 0, val passed: Boolean = false, val created: String = "")
data class QuizState(
    val size: Int = 20,
    val passPct: Int = 80,
    val bank: Int = 0,
    val passed: Boolean = false,
    val passedAt: String? = null,
    val bestPct: Int? = null,
    val attempts: Int = 0,
    /** Each reason the quiz can't be sat right now, so the app can say which, not just grey out. */
    val modulesDone: Boolean = false,
    val ready: Boolean = false,
    val onCooldown: Boolean = false,
    val cooldownUntil: String? = null,
    val history: List<QuizAttemptDto> = emptyList(),
)
data class TrainingResponse(
    val ok: Boolean = true,
    val modules: List<TrainingModuleDto> = emptyList(),
    val progress: TrainingProgress = TrainingProgress(),
    val quiz: QuizState = QuizState(),
)
/** No correctIndex — that never leaves the server. */
data class QuizQuestionDto(val id: Int = 0, val question: String = "", val options: List<String> = emptyList())
data class QuizPaperResponse(val ok: Boolean = true, val passPct: Int = 80, val questions: List<QuizQuestionDto> = emptyList())
data class QuizSubmitBody(val answers: Map<String, Int> = emptyMap())
data class QuizResultResponse(
    val ok: Boolean = true,
    val score: Int = 0,
    val total: Int = 0,
    val pct: Int = 0,
    val passed: Boolean = false,
    val passPct: Int = 80,
    val progress: TrainingProgress = TrainingProgress(),
    val quiz: QuizState = QuizState(),
)

/* Phase 9: the kit an admin has issued. Read-only in the app — issuing is the admin's job, and a
 * worker ticking "I have a vacuum" would make the Go Live check meaningless. */
data class IssuedEquipmentDto(
    val id: Int = 0,
    val typeId: Int = 0,
    val name: String = "",
    val serial: String = "",
    val notes: String = "",
    val status: String = "issued",
    val issuedAt: String = "",
    val issuedBy: String = "",
    val returnedAt: String? = null,
)
data class EquipmentResponse(val ok: Boolean = true, val issued: List<IssuedEquipmentDto> = emptyList())

data class OnboardingMark(val submittedAt: String? = null)

/* The worker's 8-step onboarding wizard. Every step's `done` is DERIVED server-side from the same
 * data everything else reads — there is no stored "step 3 done" flag to fall out of sync. */
data class OnboardingStep(
    val key: String = "",
    val label: String = "",
    val done: Boolean = false,
    val detail: String = "",
    /** True when there's genuinely nothing to do (e.g. no training published yet). Never blocks. */
    val optional: Boolean = false,
)
data class OnboardingResponse(
    val ok: Boolean = true,
    val steps: List<OnboardingStep> = emptyList(),
    val completed: Int = 0,
    val total: Int = 0,
    val canSubmit: Boolean = false,
    val outstanding: List<String> = emptyList(),
    /** Set once the worker says they've finished. Not an approval — the admin still decides. */
    val submittedAt: String? = null,
    val live: Boolean = false,
)

data class BankBody(val bankHolder: String, val bankName: String, val bankAccount: String, val bankIfsc: String, val bankUpi: String = "", val chequePhoto: String = "", val bankAccountType: String = "")
data class IfscDto(val valid: Boolean = false, val ifsc: String = "", val bank: String = "", val branch: String = "", val city: String = "", val state: String = "", val error: String = "")
data class HeartbeatBody(val battery: Int? = null, val network: String? = null, val lat: Double? = null, val lng: Double? = null)
/* Phase 11: what the worker would LIKE. An admin approves it or assigns something else — only
 * maxWeeklyHours binds anything on its own (dispatch stops offering work past it). */
data class AvailabilityBody(
    val availableDays: Map<String, Boolean>,
    val shiftStart: String,
    val shiftEnd: String,
    /** Null = no self-imposed limit. */
    val maxWeeklyHours: Int? = null,
)
data class AvailabilityDto(
    val availableDays: Map<String, Boolean> = emptyMap(),
    /** Derived server-side from availableDays — never stored twice. */
    val weeklyOff: List<String> = emptyList(),
    val shiftStart: String = "",
    val shiftEnd: String = "",
    val preferredShiftId: Int? = null,
    val maxWeeklyHours: Int? = null,
    val preferredZoneId: Int? = null,
    val status: String = "Pending",
    val reason: String = "",
    val reviewedBy: String = "",
)
data class AssignedDto(val shiftDefId: Int? = null, val zoneId: Int? = null)
data class AvailabilityResponse(
    val ok: Boolean = true,
    val availability: AvailabilityDto = AvailabilityDto(),
    val shifts: List<ShiftDto> = emptyList(),
    /** What the admin actually assigned, shown beside the request so the gap is visible. */
    val assigned: AssignedDto = AssignedDto(),
    val hoursThisWeek: Double = 0.0,
)
data class PreferencesBody(val jobPreferences: Map<String, Boolean>)
data class NotificationsBody(
    val notifNewJobs: Boolean,
    val notifPayments: Boolean,
    val notifPromotions: Boolean,
    val notifRatings: Boolean,
)

/** Per-channel communication opt-in. Stored in the admin service; the worker service proxies it.
 *  Used for both the GET response and the PUT body (full state is sent). */
data class CommDto(
    val whatsapp: Boolean = true,
    val sms: Boolean = true,
    val email: Boolean = true,
    val push: Boolean = true,
    val promo: Boolean = true,
)
