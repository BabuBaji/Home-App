package com.homehelp.pro.network

import com.homehelp.pro.Booking
import com.homehelp.pro.EarningEntry
import com.homehelp.pro.Job
import com.homehelp.pro.WalletTxn

/** Worker profile as stored on the backend. Field names match the JSON 1:1. */
data class WorkerDto(
    val name: String = "",
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
    val bankStatus: String = "Not Added",
    val bankRemarks: String = "",
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
    val name: String = "",
    val status: String = "",
    val fileName: String = "",
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
    val weekEarnings: Int = 0,
    val monthEarnings: Int = 0,
    val totalWithdrawn: Int = 0,
    val advanceOutstanding: Int = 0,
    val nextPayout: String = "",
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
    val leaves: List<LeaveItem> = emptyList(),
    val tickets: List<TicketItem> = emptyList(),
    val earnings: List<EarningEntry> = emptyList(),
    val walletTxns: List<WalletTxn> = emptyList(),
    val documents: List<DocumentDto> = emptyList(),
)

/** Today's attendance snapshot (check-in / check-out). */
data class AttendanceDto(
    val checkedIn: Boolean = false,
    val checkedOut: Boolean = false,
    val checkInAt: String = "",
    val checkOutAt: String = "",
    val status: String = "Not checked in",
)

data class AttendanceBody(val lat: Double? = null, val lng: Double? = null)

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
)

data class DocumentsResponse(val ok: Boolean = true, val documents: List<DocumentDto> = emptyList())

data class RequestJobResponse(val job: Job? = null, val jobStatus: String? = null)

data class StatusResponse(
    val ok: Boolean = true,
    val error: String? = null,
    val jobStatus: String? = null,
    val activeJob: Job? = null,
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
data class ProfileBody(val name: String, val phone: String, val email: String, val city: String)
data class UploadDocBody(val name: String, val fileName: String)
data class BankBody(val bankHolder: String, val bankName: String, val bankAccount: String, val bankIfsc: String, val bankUpi: String = "", val chequePhoto: String = "")
data class AvailabilityBody(val availableDays: Map<String, Boolean>, val shiftStart: String, val shiftEnd: String)
data class PreferencesBody(val jobPreferences: Map<String, Boolean>)
data class NotificationsBody(
    val notifNewJobs: Boolean,
    val notifPayments: Boolean,
    val notifPromotions: Boolean,
    val notifRatings: Boolean,
)
