package com.homehelp.pro

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.compose.runtime.mutableLongStateOf
import com.homehelp.pro.network.ChecklistBody
import com.homehelp.pro.network.ChecklistTask
import com.homehelp.pro.network.ExtraBody
import com.homehelp.pro.network.ExtraRemoveBody
import com.homehelp.pro.network.JobExtra
import com.homehelp.pro.network.JobMessage
import com.homehelp.pro.network.JobStateResponse
import com.homehelp.pro.network.JobPhoto
import com.homehelp.pro.network.MessageBody
import com.homehelp.pro.network.NotesBody
import com.homehelp.pro.network.SignatureBody
import com.homehelp.pro.network.PauseBody
import com.homehelp.pro.network.PhotoBody
import com.homehelp.pro.network.PhotoRemoveBody
import com.homehelp.pro.network.AdvanceBody
import com.homehelp.pro.network.AdvanceEligibilityDto
import com.homehelp.pro.network.AdvanceEntry
import com.homehelp.pro.network.AmountBody
import com.homehelp.pro.network.AuthRequest
import com.homehelp.pro.network.LatLngBody
import com.homehelp.pro.network.AvailabilityBody
import com.homehelp.pro.network.BankBody
import com.homehelp.pro.network.BootstrapResponse
import com.homehelp.pro.network.BreakupItem
import com.homehelp.pro.network.ClaimBody
import com.homehelp.pro.network.InsuranceDto
import com.homehelp.pro.network.MerchOrderBody
import com.homehelp.pro.network.MerchProduct
import com.homehelp.pro.network.ReferralDto
import com.homehelp.pro.network.RewardsDto
import com.homehelp.pro.network.ShaktiBonusDto
import com.homehelp.pro.network.DeductionEntry
import com.homehelp.pro.network.EndBody
import com.homehelp.pro.network.LedgerEntry
import com.homehelp.pro.network.NotificationItem
import com.homehelp.pro.network.NotificationsBody
import com.homehelp.pro.network.OtpBody
import com.homehelp.pro.network.PayslipDto
import com.homehelp.pro.network.PreferencesBody
import com.homehelp.pro.network.ProfileBody
import com.homehelp.pro.network.ReasonBody
import com.homehelp.pro.network.RetrofitClient
import com.homehelp.pro.network.BankAccount
import com.homehelp.pro.network.BankAccountBody
import com.homehelp.pro.network.PayoutSettingsDto
import com.homehelp.pro.network.PinBody
import com.homehelp.pro.network.WithdrawRequestBody
import com.homehelp.pro.network.WithdrawResult
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import com.homehelp.pro.network.LeaderboardDto
import com.homehelp.pro.network.ServiceWiseDto
import com.homehelp.pro.network.SettlementDto
import com.homehelp.pro.network.TrendPoint
import com.homehelp.pro.network.WalletStateResponse
import com.homehelp.pro.network.WalletSummaryDto
import com.homehelp.pro.network.SkillDto
import com.homehelp.pro.network.SkillClaim
import com.homehelp.pro.network.SkillsBody
import com.homehelp.pro.network.TrainingModuleDto
import com.homehelp.pro.network.TrainingProgress
import com.homehelp.pro.network.QuizState
import com.homehelp.pro.network.QuizQuestionDto
import com.homehelp.pro.network.QuizSubmitBody
import com.homehelp.pro.network.QuizResultResponse
import com.homehelp.pro.network.IssuedEquipmentDto
import com.homehelp.pro.network.WorkerDto
import com.homehelp.pro.network.WithdrawBody
import com.homehelp.pro.network.WithdrawalEntry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Job lifecycle state machine — single source of truth for the workflow.
 * NONE -> REQUESTED -> ACCEPTED -> ON_THE_WAY -> ARRIVED -> IN_PROGRESS -> COMPLETED -> (settle) -> NONE
 * Any pre-completion state -> CANCELLED.
 */
enum class JobStatus { NONE, REQUESTED, ACCEPTED, ON_THE_WAY, ARRIVED, IN_PROGRESS, COMPLETED, CANCELLED }

/**
 * Partner performance tier, earned from real completed-job count + rating. Higher tiers
 * signal reliability to customers (mirrors the "Pro/Elite" ladders in Snabbit/Pronto).
 * [minJobs]/[minRating] are the thresholds to REACH this tier.
 */
enum class WorkerTier(val label: String, val emoji: String, val minJobs: Int, val minRating: Double) {
    BRONZE("Bronze", "🥉", 0, 0.0),
    SILVER("Silver", "🥈", 25, 4.0),
    GOLD("Gold", "🥇", 75, 4.5),
    PLATINUM("Platinum", "💎", 150, 4.7);

    companion object {
        /** Highest tier whose thresholds the worker currently satisfies. */
        fun of(jobs: Int, rating: Double): WorkerTier =
            entries.last { jobs >= it.minJobs && rating >= it.minRating }
        fun next(current: WorkerTier): WorkerTier? =
            entries.getOrNull(current.ordinal + 1)
    }
}

data class Job(
    val id: String,
    val customerName: String,
    val initials: String,
    val customerAvatar: String = "",
    val customerType: String = "Residential",
    val note: String = "",
    val customerPhone: String,
    val customerRating: Double,
    val services: List<String>,
    val dateTime: String,
    val durationHours: Int,
    // Booked service length in MINUTES (authoritative, from the backend). Drives the
    // "service time completed" popup + timer freeze. Defaults to 60 if the server omits it.
    val durationMinutes: Int = 60,
    val address: String,
    val area: String,
    val distanceKm: Double,
    val earnings: Int,
    val otp: String,
    val lat: Double,
    val lng: Double,
    // Server timestamp (ISO-8601, UTC) when the service started. The live timer is
    // anchored to this so the worker app and customer app show the SAME elapsed time.
    val startedAt: String? = null,
    val completedAt: String? = null,
)

// Nullable String fields are defensive: this is deserialized from JSON by Gson, which bypasses
// Kotlin's constructor and will inject null for any key the backend omits — a non-null String
// field would then NPE-crash the Bookings UI. Keep these nullable and render with `?: ""`.
data class Booking(
    val service: String? = null,
    val customerName: String? = null,
    val address: String? = null,
    val timeInfo: String? = null,
    val amount: Int = 0,
    val status: String? = null,
    // Booking reference (e.g. "#HH12345") — matches the wallet ledger's Job Earnings label,
    // so the Earnings calendar can resolve each ledger entry to its real service name.
    // Kept LAST so existing positional Booking(...) constructions stay valid.
    val ref: String? = null,
)

data class EarningEntry(val date: String, val amount: Int, val paid: Boolean = true)

data class WalletTxn(
    val title: String,
    val subtitle: String,
    val amount: Int,
    val status: String,
    val isCredit: Boolean,
)

/** A verification document and its current review status. */
data class DocItem(val name: String, val status: String, val fileName: String = "", val rejectReason: String = "")

class AppViewModel : ViewModel() {

    private val api = RetrofitClient.api

    /** True once we've successfully reached the backend at least once this session. */
    var backendConnected by mutableStateOf(false)
        private set

    var isLoggedIn by mutableStateOf(false)
        private set
    var isOnline by mutableStateOf(false)
        private set
    var jobStatus by mutableStateOf(JobStatus.NONE)
        private set
    var activeJob by mutableStateOf<Job?>(null)
        private set

    // Wall-clock stamps for the actual time the worker spent on the job (start → end),
    // shown on the Job Completed screen and mirrored to the customer/admin.
    var serviceStartMs by mutableStateOf(0L)
        private set
    var serviceEndMs by mutableStateOf(0L)
        private set

    // ---- online-session tracking (genuine "online today" timer) ----
    // Wall-clock ms the worker went online for the current stretch (0 when offline), plus
    // the total online time already accumulated today. Live display = accum + (now - since).
    var onlineSinceMs by mutableStateOf(0L)
        private set
    private var onlineAccumMs by mutableStateOf(0L)

    /** Total time online today in ms, including the stretch currently in progress. */
    fun onlineTodayMs(nowMs: Long): Long =
        onlineAccumMs + if (isOnline && onlineSinceMs > 0) (nowMs - onlineSinceMs) else 0L

    // ---- daily earnings goal (worker-set, persisted) ----
    var dailyGoal by mutableIntStateOf(1000)
        private set
    fun updateDailyGoal(v: Int) { dailyGoal = v.coerceIn(100, 100000); Session.dailyGoal = dailyGoal }
    /** Progress toward today's goal, 0f..1f. */
    val goalProgress: Float get() = if (dailyGoal <= 0) 0f else (todayEarnings.toFloat() / dailyGoal).coerceIn(0f, 1f)

    // Live dashboard / wallet figures — all start empty and are filled from the backend
    // (bootstrap / wallet summary). No seeded/fake values are ever shown.
    var todayEarnings by mutableIntStateOf(0)
        private set
    var todayJobs by mutableIntStateOf(0)
        private set
    var todayCompleted by mutableIntStateOf(0)
        private set
    var todayCancelled by mutableIntStateOf(0)
        private set
    // Lifetime performance rates from the backend; null until it reports history, so the
    // Home Performance Overview can show "—" instead of a misleading 0%.
    var completionPct by mutableStateOf<Int?>(null)
        private set
    var cancellationPct by mutableStateOf<Int?>(null)
        private set
    var punctualityPct by mutableStateOf<Int?>(null)
        private set
    var acceptancePct by mutableStateOf<Int?>(null)
        private set
    var walletBalance by mutableIntStateOf(0)
        private set
    var totalEarned by mutableIntStateOf(0)
        private set
    var withdrawnTotal by mutableIntStateOf(0)
        private set
    var pendingAmount by mutableIntStateOf(0)
        private set

    // ---- wallet module: balances, periods, queues ----
    var holdBalance by mutableIntStateOf(0)
        private set
    var weekEarnings by mutableIntStateOf(0)
        private set
    var monthEarnings by mutableIntStateOf(0)
        private set
    var advanceOutstanding by mutableIntStateOf(0)
        private set
    var nextPayout by mutableStateOf("—")
        private set

    val earningsBreakup = mutableStateListOf<BreakupItem>()
    val deductionSummary = mutableStateListOf<BreakupItem>()
    val deductionDetail = mutableStateListOf<DeductionEntry>()
    var deductionTotal by mutableIntStateOf(0)
        private set
    // ─── Wallet analytics (3_wallet.png): trend · service split · settlement · leaderboard ───
    var yesterdayEarnings by mutableIntStateOf(0)
        private set
    var lastWeekEarnings by mutableIntStateOf(0)
        private set
    var lastMonthEarnings by mutableIntStateOf(0)
        private set
    val earningsTrend = mutableStateListOf<TrendPoint>()
    var serviceWise by mutableStateOf<ServiceWiseDto?>(null)
        private set
    var settlement by mutableStateOf<SettlementDto?>(null)
        private set
    var leaderboard by mutableStateOf<LeaderboardDto?>(null)
        private set

    /** Percentage change vs the previous period, or null when there's no base to compare with. */
    fun changePct(now: Int, before: Int): Int? =
        if (before <= 0) null else Math.round(((now - before) * 100f) / before)

    fun loadWalletAnalytics() {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                val r = api.walletAnalytics()
                earningsTrend.clear(); earningsTrend.addAll(r.trend)
                serviceWise = r.serviceWise
                settlement = r.settlement
                leaderboard = r.leaderboard
                backendConnected = true
            } catch (e: Exception) { backendConnected = false }
        }
    }

    // ─── Wallet module: bank accounts · payout settings · PIN · withdrawal ───────────────
    val bankAccounts = mutableStateListOf<BankAccount>()
    var payoutSettings by mutableStateOf(PayoutSettingsDto())
        private set
    var pinIsSet by mutableStateOf(false)
        private set
    var walletBusy by mutableStateOf(false)
        private set
    var walletError by mutableStateOf<String?>(null)
        private set
    /** The result of the last withdrawal — drives the success screen. */
    var lastWithdrawal by mutableStateOf<WithdrawResult?>(null)
        private set

    fun clearWalletError() { walletError = null }

    val defaultBank: BankAccount? get() = bankAccounts.firstOrNull { it.isDefault } ?: bankAccounts.firstOrNull()

    private fun bankCall(block: suspend () -> List<BankAccount>) {
        walletBusy = true; walletError = null
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                val list = block()
                bankAccounts.clear(); bankAccounts.addAll(list)
                backendConnected = true
            } catch (e: Exception) {
                walletError = httpMessage(e) ?: "Couldn't reach the server"
                backendConnected = false
            }
            walletBusy = false
        }
    }

    /** Surfaces the server's own message (e.g. "That account is already added") instead of a generic error. */
    private fun httpMessage(e: Exception): String? = runCatching {
        val he = e as? retrofit2.HttpException ?: return@runCatching null
        val body = he.response()?.errorBody()?.string() ?: return@runCatching null
        Regex("""\"error\"\s*:\s*\"([^\"]+)\"""").find(body)?.groupValues?.get(1)
    }.getOrNull()

    fun loadBankAccounts() = bankCall { api.bankAccounts().accounts }
    fun addBankAccount(holder: String, bankName: String, account: String, ifsc: String, upi: String, type: String) =
        bankCall { api.addBankAccount(BankAccountBody(holder, bankName, account, ifsc, upi, type)).accounts }
    fun updateBankAccount(id: Int, holder: String, bankName: String, upi: String, type: String) =
        bankCall { api.updateBankAccount(id, BankAccountBody(holder = holder, bankName = bankName, upi = upi, accountType = type)).accounts }
    fun makeBankDefault(id: Int) = bankCall { api.makeBankDefault(id).accounts }
    fun deleteBankAccount(id: Int) = bankCall { api.deleteBankAccount(id).accounts }

    fun loadPayoutSettings() {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                api.payoutSettings().settings?.let { payoutSettings = it }
                backendConnected = true
            } catch (e: Exception) { backendConnected = false }
        }
    }

    fun savePayoutSettings(next: PayoutSettingsDto) {
        payoutSettings = next            // optimistic; the server reply is adopted below
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                api.savePayoutSettings(next).settings?.let { payoutSettings = it }
                backendConnected = true
            } catch (e: Exception) { backendConnected = false }
        }
    }

    fun loadPinStatus() {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                pinIsSet = api.pinStatus().isSet
                backendConnected = true
            } catch (e: Exception) { backendConnected = false }
        }
    }

    /** Sets or resets the wallet PIN. [otp] is required by the server when a PIN already exists. */
    fun setWalletPin(pin: String, otp: String? = null, onDone: (Boolean, String?) -> Unit) {
        walletBusy = true
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                val r = api.setPin(PinBody(pin, otp))
                pinIsSet = r.isSet
                onDone(r.ok, r.error)
            } catch (e: Exception) { onDone(false, httpMessage(e) ?: "Couldn't reach the server") }
            walletBusy = false
        }
    }

    fun verifyWalletPin(pin: String, onDone: (Boolean, String?) -> Unit) {
        walletBusy = true
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                val r = api.verifyPin(PinBody(pin))
                onDone(r.ok, r.error)
            } catch (e: Exception) { onDone(false, httpMessage(e) ?: "Couldn't reach the server") }
            walletBusy = false
        }
    }

    fun requestWithdrawalWithPin(amount: Int, pin: String, bankAccountId: Int?, onDone: (Boolean, String?) -> Unit) {
        walletBusy = true
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                val r = api.requestWithdrawalPin(WithdrawRequestBody(amount, pin, bankAccountId))
                if (r.ok) {
                    lastWithdrawal = r
                    r.walletSummary?.let { applyWalletSummary(it) }
                    withdrawals.clear(); withdrawals.addAll(r.withdrawals)
                }
                onDone(r.ok, r.error)
            } catch (e: Exception) { onDone(false, httpMessage(e) ?: "Couldn't reach the server") }
            walletBusy = false
        }
    }

    val walletHistory = mutableStateListOf<LedgerEntry>()
    val withdrawals = mutableStateListOf<WithdrawalEntry>()
    val advances = mutableStateListOf<AdvanceEntry>()
    val notifications = mutableStateListOf<NotificationItem>()
    var unreadNotifications by mutableIntStateOf(0)
        private set

    var advanceEligibility by mutableStateOf<AdvanceEligibilityDto?>(null)
        private set
    var payslip by mutableStateOf<PayslipDto?>(null)
        private set

    // ---- editable profile state (Profile sub-screens) — empty until the backend loads it ----
    var workerName by mutableStateOf("")
    /* 'onboarding' until an admin approves them; 'active' means dispatchable. The app used to have
     * no idea, so an onboarding worker saw a home built around jobs they cannot accept. */
    var workerStatus by mutableStateOf("")
        private set
    var workerPhone by mutableStateOf("")
    var workerEmail by mutableStateOf("")
    var workerCity by mutableStateOf("")
    var jobsCompleted by mutableIntStateOf(0)
        private set
    var workerRating by mutableStateOf(0.0)
        private set

    /** Current earned performance tier (derived from real jobs + rating). */
    val tier: WorkerTier get() = WorkerTier.of(jobsCompleted, workerRating)
    /** Jobs still needed to reach the next tier, or 0 if already at the top / rating-gated. */
    val jobsToNextTier: Int
        get() = WorkerTier.next(tier)?.let { (it.minJobs - jobsCompleted).coerceAtLeast(0) } ?: 0

    var bankName by mutableStateOf("")
    var bankAccount by mutableStateOf("")
    var bankIfsc by mutableStateOf("")
    var bankHolder by mutableStateOf("")
    var bankUpi by mutableStateOf("")
    var bankAccountType by mutableStateOf("")       // savings / current — sent to the payout gateway
    var bankStatus by mutableStateOf("Not Added")   // Not Added / Pending Verification / Approved / Rejected
        private set
    var bankRemarks by mutableStateOf("")
        private set
    // The account-holder name the bank has on record (from the penny-drop check) + whether it
    // matches what the worker typed. null = not checked yet / couldn't determine.
    var bankRegisteredName by mutableStateOf("")
        private set
    var bankNameMatch by mutableStateOf<Boolean?>(null)
        private set
    // Bank + branch resolved from the IFSC (auto-fills bank name; confirms the IFSC is a real code).
    var bankBranch by mutableStateOf("")
        private set
    var ifscBank by mutableStateOf("")          // bank the IFSC actually belongs to (for cross-check)
        private set
    var ifscError by mutableStateOf("")
        private set
    var ifscChecking by mutableStateOf(false)
        private set
    val bankApproved: Boolean get() = bankStatus == "Approved"

    // Selectable options only — nothing is pre-selected for the worker. The backend
    // overwrites these with the worker's real saved choices on load.
    val availableDays = mutableStateMapOf(
        "Mon" to false, "Tue" to false, "Wed" to false,
        "Thu" to false, "Fri" to false, "Sat" to false, "Sun" to false,
    )
    var shiftStart by mutableStateOf("")
    var shiftEnd by mutableStateOf("")

    val jobPreferences = mutableStateMapOf(
        "Utensil Wash" to false, "Mopping" to false, "Sweeping" to false,
        "Dusting" to false, "Bathroom Cleaning" to false, "Laundry" to false,
        "Kitchen Cleaning" to false,
    )

    var notifNewJobs by mutableStateOf(true)
    var notifPayments by mutableStateOf(true)
    var notifPromotions by mutableStateOf(false)
    var notifRatings by mutableStateOf(true)

    // ---- verification documents ----
    // The required-document checklist. Statuses start as "Pending" and are replaced by the
    // backend's real review status on load (no document is shown as verified until it is).
    // Phase 4. Seeded from the SERVER's list (loadDocumentTypes) rather than hardcoded here — the
    // server validates uploads against the same list, so a second copy would drift. These three are
    // only a first paint for an offline start; the real set replaces them on load.
    val documents = mutableStateListOf(
        DocItem("Aadhaar Front", "Missing"),
        DocItem("Aadhaar Back", "Missing"),
        DocItem("PAN Card", "Missing"),
    )
    /** name -> required?  Drives the Required/Optional pill and the completion counter. */
    val documentRequired = mutableStateMapOf<String, Boolean>()
    val documentHints = mutableStateMapOf<String, String>()

    /** Required documents the worker still hasn't had approved. Empty = KYC done. */
    val pendingRequiredDocs: List<String>
        get() = documents.filter { documentRequired[it.name] != false && it.status != "Verified" }.map { it.name }

    /**
     * Pull the canonical document set, then overlay what this worker has actually uploaded.
     * A type with no row yet is "Missing" — the app used to invent its own three-item list and
     * show them all as "Pending", implying they'd been submitted when nothing had.
     */
    fun loadDocumentTypes() = sync {
        val types = api.documentTypes().types
        if (types.isNotEmpty()) {
            documentRequired.clear(); documentHints.clear()
            types.forEach { documentRequired[it.name] = it.required; documentHints[it.name] = it.hint }
            val mine = api.getDocuments().associateBy { it.name }
            documents.clear()
            documents.addAll(types.map { t ->
                val d = mine[t.name]
                DocItem(t.name, d?.status?.ifBlank { "Missing" } ?: "Missing", d?.fileName ?: "", d?.rejectReason ?: "")
            })
        }
    }

    /** True only when every required document has been reviewed and approved — drives the
     *  verified badge on the Home profile header. */
    val isKycVerified: Boolean
        get() = documents.isNotEmpty() && documents.all { it.status == "Approved" }

    // ---- networking helpers ----
    /** Fire a backend call without blocking the UI; failures degrade to offline mode. */
    private fun sync(block: suspend () -> Unit) {
        viewModelScope.launch {
            try {
                // Resolve the live backend URL from the public config before any call
                // (cheap no-op after the first success), so the app reaches the current host.
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                block()
                backendConnected = true
            } catch (e: Exception) {
                // Backend unreachable — app keeps working on optimistic local state.
                backendConnected = false
            }
        }
    }

    /** Apply the server's full state snapshot onto local observable state. */
    private fun applyBootstrap(b: BootstrapResponse) {
        // Remember the auth token so every later call is attached to this worker, and
        // persist it so the session survives the app process being killed/backgrounded.
        b.token?.let { RetrofitClient.token = it; Session.token = it }
        b.worker?.let { applyWorker(it) }
        b.wallet?.let { wl ->
            walletBalance = wl.balance
            totalEarned = wl.totalEarned
            withdrawnTotal = wl.withdrawnTotal
            pendingAmount = wl.pendingAmount
            todayEarnings = wl.todayEarnings
            todayJobs = wl.todayJobs
        }
        b.walletSummary?.let { applyWalletSummary(it) }
        if (b.bookings.isNotEmpty()) { bookings.clear(); bookings.addAll(b.bookings) }
        schedule.clear(); schedule.addAll(b.schedule)
        b.attendance?.let { attendance = it }
        b.shift?.let { shifts.clear(); shifts.addAll(it.shifts); selectedShiftId = it.selectedId; requestedShiftId = it.requestedId; shiftStatus = it.shiftStatus }
        leaves.clear(); leaves.addAll(b.leaves)
        tickets.clear(); tickets.addAll(b.tickets)
        if (b.earnings.isNotEmpty()) { earnings.clear(); earnings.addAll(b.earnings) }
        if (b.walletTxns.isNotEmpty()) { walletTxns.clear(); walletTxns.addAll(b.walletTxns) }
        if (b.documents.isNotEmpty()) {
            documents.clear()
            documents.addAll(b.documents.map { DocItem(it.name, it.status, it.fileName, it.rejectReason) })
        }
        // Restore any job the worker is mid-way through, so relaunching the app (or coming
        // back to Home) keeps the active/in-progress job visible instead of losing it.
        activeJob = b.activeJob
        jobStatus = b.jobStatus?.let { s -> runCatching { JobStatus.valueOf(s) }.getOrNull() } ?: JobStatus.NONE
        // Re-hydrate the in-service working state (ticks/photos/extras/pause) for a job that was
        // already running when the app was killed — this is what makes it survive a restart.
        if (activeJob != null) loadJobState()
    }

    // ---- lifecycle transitions ----
    // Login is gated by the backend: only a number the admin has onboarded AND marked
    // active is allowed in. We do NOT flip isLoggedIn optimistically — we wait for the
    // server, surface its rejection message, and stay on the login screen on failure.
    var loginError by mutableStateOf<String?>(null)
        private set
    var loggingIn by mutableStateOf(false)
        private set
    fun clearLoginError() { loginError = null }

    /** True once the backend has actually issued a code — the OTP field only appears after this. */
    var otpRequested by mutableStateOf(false)
        private set
    var requestingOtp by mutableStateOf(false)
        private set
    /** Only populated in demo mode (WORKER_DEV_OTP set server-side); pre-fills the field. */
    var devOtp by mutableStateOf<String?>(null)
        private set

    /**
     * Ask the backend to issue a login code. This has to happen for real — the server stores the
     * code hashed and compares it on verify, so a locally-flipped "OTP sent" flag would leave the
     * worker typing a code that was never issued.
     */
    fun requestLoginOtp(phone: String) {
        val p = phone.trim()
        loginError = null
        requestingOtp = true
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                val r = api.requestOtp(AuthRequest(phone = p))
                backendConnected = true
                otpRequested = true
                devOtp = r["devOtp"] as? String
            } catch (e: retrofit2.HttpException) {
                loginError = httpErrorMessage(e)   // surfaces the server's rate-limit message
            } catch (e: Exception) {
                loginError = "Could not reach the server. Check your connection and try again."
            } finally { requestingOtp = false }
        }
    }

    fun login(phone: String, otp: String) {
        val p = phone.trim()
        loginError = null
        loggingIn = true
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                val b = api.verify(AuthRequest(phone = p, otp = otp.trim()))
                Session.phone = p
                applyBootstrap(b)
                loadDailyGoal()
                backendConnected = true
                isLoggedIn = true        // only now is the worker really logged in
            } catch (e: retrofit2.HttpException) {
                loginError = httpErrorMessage(e)
                isLoggedIn = false
            } catch (e: Exception) {
                loginError = "Could not reach the server. Check your connection and try again."
                isLoggedIn = false
            } finally {
                loggingIn = false
            }
        }
    }

    /**
     * DEBUG ONLY — headless auto-login for on-device UI verification when ADB input injection is
     * blocked (e.g. HyperOS). Does the two-step demo auth (request-otp → verify) so `am start` can
     * drive the app without anyone tapping. Never called outside a BuildConfig.DEBUG intent path.
     */
    fun debugLogin(phone: String, otp: String, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                api.requestOtp(AuthRequest(phone = phone))
                val b = api.verify(AuthRequest(phone = phone, otp = otp))
                Session.phone = phone
                applyBootstrap(b)
                loadDailyGoal()
                backendConnected = true
                isLoggedIn = true
                onDone(true)
            } catch (e: Exception) { onDone(false) }
        }
    }

    private fun httpErrorMessage(e: retrofit2.HttpException): String =
        try {
            val body = e.response()?.errorBody()?.string()
            val msg = body?.let { org.json.JSONObject(it).optString("error") }
            if (!msg.isNullOrBlank()) msg else "Login failed (${e.code()}). Contact the admin."
        } catch (_: Exception) { "Login failed. Please contact the admin." }

    /** Restore a persisted session on app launch so the worker stays logged in across
     *  process death. Re-hydrates from the backend using the saved token. */
    fun restoreSession() {
        val saved = Session.token
        if (saved.isNullOrBlank()) return
        RetrofitClient.token = saved
        isLoggedIn = true
        loadDailyGoal()
        sync {
            val b = api.bootstrap()
            applyBootstrap(b)
        }
    }

    /** Re-pull the backend snapshot (bookings, wallet, earnings, active job) without a re-login.
     *  Called whenever the app returns to the foreground so a job the worker completed — or that
     *  was completed/assigned server-side — shows up right away instead of after a full relaunch. */
    fun refresh() {
        if (!isLoggedIn) return
        sync { applyBootstrap(api.bootstrap()) }
    }

    /** Report device battery %, network type and last GPS so the admin status strip shows live values. */
    fun sendHeartbeat(battery: Int?, network: String?, lat: Double?, lng: Double?) {
        if (!isLoggedIn) return
        viewModelScope.launch { runCatching { api.heartbeat(com.homehelp.pro.network.HeartbeatBody(battery, network, lat, lng)) } }
    }

    /** Clear the session and return to the login screen. */
    fun logout() {
        Session.clear()
        RetrofitClient.token = null
        isLoggedIn = false
        isOnline = false
        onlineSinceMs = 0L
        onlineAccumMs = 0L
    }

    /** Load the worker's persisted daily goal (called once the session is ready). */
    fun loadDailyGoal() { dailyGoal = Session.dailyGoal }

    /** True when a real customer booking is waiting — drives the "New Job Request" notification. */
    var hasIncomingJob by mutableStateOf(false)
        private set
    private var pollingStarted = false

    fun goOnline(v: Boolean) {
        if (v == isOnline) return
        val now = System.currentTimeMillis()
        if (v) {
            onlineSinceMs = now
            startJobPolling()
        } else {
            // Bank the just-finished online stretch into today's total.
            if (onlineSinceMs > 0) onlineAccumMs += now - onlineSinceMs
            onlineSinceMs = 0L
            hasIncomingJob = false
        }
        isOnline = v
    }

    // While online and idle, poll the backend for a real waiting booking. When one
    // appears, raise the in-app notification flag the Home screen reacts to.
    private fun startJobPolling() {
        if (pollingStarted) return
        pollingStarted = true
        viewModelScope.launch {
            while (true) {
                if (isOnline && activeJob == null) {
                    try {
                        val r = api.jobsAvailable()
                        hasIncomingJob = (r["available"] == true)
                        backendConnected = true
                    } catch (e: Exception) { backendConnected = false }
                } else if (!isOnline) {
                    hasIncomingJob = false
                }
                delay(5000)
            }
        }
    }

    /**
     * Pull the next REAL customer booking. Calls back with true if one was opened,
     * false if there are no pending jobs (no demo/fake jobs are ever shown).
     */
    fun requestJob(onResult: (Boolean) -> Unit = {}) {
        viewModelScope.launch {
            try {
                val r = api.requestJob()
                backendConnected = true
                if (r.job != null) {
                    activeJob = r.job
                    jobStatus = JobStatus.REQUESTED
                    hasIncomingJob = false
                    onResult(true)
                } else {
                    hasIncomingJob = false
                    onResult(false)
                }
            } catch (e: Exception) {
                backendConnected = false
                onResult(false)
            }
        }
    }

    // Wall-clock stamp when the worker accepted the current job. Drives the in-app "start within
    // 15 min" countdown. The backend independently enforces the same window (+₹15 on-time bonus /
    // −₹15 late-start penalty), so this is purely to inform the worker.
    var jobAcceptedAtMs by mutableStateOf(0L)
        private set
    val startWindowMinutes = 15

    fun acceptJob() {
        jobStatus = JobStatus.ACCEPTED
        jobAcceptedAtMs = System.currentTimeMillis()
        clearJobState()          // never inherit the previous job's ticks/photos/extras
        sync { api.acceptJob() }
        loadJobState()           // seeds the checklist for this job's services
    }

    fun rejectJob() {
        activeJob = null
        jobStatus = JobStatus.NONE
        jobAcceptedAtMs = 0L
        sync { api.rejectJob() }
    }

    fun startOnTheWay() {
        jobStatus = JobStatus.ON_THE_WAY
        sync { api.onTheWay() }
    }

    /** Push the worker's live GPS to the backend so the customer's map shows the real
     *  expert position + an accurate ETA. Fire-and-forget; never blocks the UI. */
    fun reportLocation(lat: Double, lng: Double) {
        sync { api.reportLocation(LatLngBody(lat, lng)) }
    }

    fun markArrived() {
        jobStatus = JobStatus.ARRIVED
        sync { api.arrived() }
    }

    /** OTP-gated start. Returns true if the OTP matches and service begins.
     *  We adopt the server's job snapshot from the response so the live timer anchors to
     *  the SERVER's started_at (the same value the customer app uses) — otherwise the two
     *  timers drift by the request round-trip / local-clock difference. */
    fun verifyOtpAndStart(input: String): Boolean {
        val job = activeJob ?: return false
        if (input != job.otp) return false
        jobStatus = JobStatus.IN_PROGRESS
        jobAcceptedAtMs = 0L                           // start window met — hide the countdown banner
        serviceStartMs = System.currentTimeMillis()   // optimistic fallback until the server replies
        serviceEndMs = 0L
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                val r = api.verifyOtp(OtpBody(input))
                r.activeJob?.let { activeJob = it }    // now carries the server started_at
                backendConnected = true
            } catch (e: Exception) { backendConnected = false }
        }
        return true
    }

    // ─── In-service job state: checklist · before/after photos · extras · pause ───────────
    // All server-owned (dispatch `job_state`, keyed by booking), so ticks, photos and extras
    // survive navigation, process death and reinstalls. Every mutator posts and adopts the
    // server's reply as the new truth rather than editing local copies optimistically.

    var checklist by mutableStateOf<List<ChecklistTask>>(emptyList())
        private set
    /** The named shots this job requires (step 5/7), seeded server-side from the booked service. */
    var photoSlots by mutableStateOf<List<String>>(emptyList())
        private set
    var beforePhotos by mutableStateOf<List<JobPhoto>>(emptyList())
        private set
    var afterPhotos by mutableStateOf<List<JobPhoto>>(emptyList())
        private set
    var beforeNotes by mutableStateOf("")
        private set
    var afterNotes by mutableStateOf("")
        private set
    var signature by mutableStateOf<String?>(null)
        private set
    var customerSigned by mutableStateOf(false)
        private set
    var customerRating by mutableIntStateOf(0)
        private set
    var customerNotes by mutableStateOf("")
        private set
    var extras by mutableStateOf<List<JobExtra>>(emptyList())
        private set
    var extrasTotal by mutableIntStateOf(0)
        private set
    var jobPaused by mutableStateOf(false)
        private set
    /** Total time the service has been paused, including a pause still in flight. */
    var pausedMs by mutableLongStateOf(0L)
        private set
    var jobStateLoading by mutableStateOf(false)
        private set
    /**
     * When [pausedMs] was last read from the server. [pausedMs] already counts an in-flight pause
     * up to that instant, so a live timer must measure the running pause from here — not from now —
     * or it would double-count it.
     */
    var stateAtMs by mutableLongStateOf(0L)
        private set

    val checklistDone: Int get() = checklist.count { it.done }

    /** Total paused time as of [nowMs], extending an in-flight pause in real time. */
    fun pausedMsAt(nowMs: Long): Long =
        pausedMs + if (jobPaused && stateAtMs > 0) (nowMs - stateAtMs).coerceAtLeast(0L) else 0L

    private fun adopt(s: JobStateResponse) {
        stateAtMs = System.currentTimeMillis()
        checklist = s.checklist
        photoSlots = s.photoSlots
        beforePhotos = s.beforePhotos
        afterPhotos = s.afterPhotos
        beforeNotes = s.beforeNotes
        afterNotes = s.afterNotes
        signature = s.signature
        customerSigned = s.signed
        customerRating = s.customerRating
        customerNotes = s.customerNotes
        extras = s.extras
        extrasTotal = s.extrasTotal
        jobPaused = s.paused
        pausedMs = s.pausedMs
    }

    /** Pulls the active job's working state. Safe to call when there's no active job (409 → no-op). */
    fun loadJobState() {
        if (activeJob == null) return
        jobStateLoading = true
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                adopt(api.jobState())
                backendConnected = true
            } catch (e: Exception) { backendConnected = false }
            jobStateLoading = false
        }
    }

    private fun mutateState(block: suspend () -> JobStateResponse) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                adopt(block())
                backendConnected = true
            } catch (e: Exception) { backendConnected = false }
        }
    }

    fun toggleTask(id: Int) {
        val next = checklist.map { if (it.id == id) it.copy(done = !it.done) else it }
        checklist = next                                    // instant tick; server reply confirms
        mutateState { api.saveChecklist(ChecklistBody(next)) }
    }

    fun addJobPhoto(phase: String, slot: String, dataUrl: String) =
        mutateState { api.addJobPhoto(PhotoBody(phase, slot, dataUrl)) }
    fun removeJobPhoto(phase: String, slot: String) =
        mutateState { api.removeJobPhoto(PhotoRemoveBody(phase, slot)) }
    fun saveJobNotes(phase: String, text: String) = mutateState { api.saveJobNotes(NotesBody(phase, text)) }
    fun saveSignature(dataUrl: String, rating: Int, notes: String) =
        mutateState { api.saveSignature(SignatureBody(dataUrl, rating, notes)) }

    /** How many of the required slots have a shot for this phase — drives "Photos Required (2/3)". */
    fun photosDone(phase: String): Int {
        val taken = (if (phase == "after") afterPhotos else beforePhotos).map { it.slot }.toSet()
        return photoSlots.count { it in taken }
    }
    fun photoFor(phase: String, slot: String): JobPhoto? =
        (if (phase == "after") afterPhotos else beforePhotos).firstOrNull { it.slot == slot }
    fun addExtra(name: String, price: Int) = mutateState { api.addExtra(ExtraBody(name, price)) }
    fun removeExtra(id: Long) = mutateState { api.removeExtra(ExtraRemoveBody(id)) }
    fun pauseJob(reason: String?) = mutateState { api.pauseJob(PauseBody(reason)) }
    fun resumeJob() = mutateState { api.resumeJob() }

    // ─── Customer chat (module: Chat / Call Customer) ─────────────────────────────────────
    val messages = mutableStateListOf<JobMessage>()
    var chatSending by mutableStateOf(false)
        private set

    fun loadMessages() {
        if (activeJob == null) return
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                val r = api.jobMessages()
                messages.clear(); messages.addAll(r.messages)
                backendConnected = true
            } catch (e: Exception) { backendConnected = false }
        }
    }

    fun sendMessage(text: String) {
        val body = text.trim()
        if (body.isEmpty() || activeJob == null) return
        chatSending = true
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { RetrofitClient.refreshBaseUrl() }
                api.sendJobMessage(MessageBody(body))
                val r = api.jobMessages()
                messages.clear(); messages.addAll(r.messages)
                backendConnected = true
            } catch (e: Exception) { backendConnected = false }
            chatSending = false
        }
    }

    /** Clears per-job working state so a finished job never bleeds into the next one. */
    private fun clearJobState() {
        checklist = emptyList(); photoSlots = emptyList()
        beforePhotos = emptyList(); afterPhotos = emptyList()
        beforeNotes = ""; afterNotes = ""; signature = null; customerSigned = false
        customerRating = 0; customerNotes = ""
        extras = emptyList(); extrasTotal = 0; jobPaused = false; pausedMs = 0L
        messages.clear(); beforePhoto = null
    }

    // Before-photo captured on arrival (module: Start Job → Before Photos). Held locally and
    // attached to the completion payload; cleared when a new job starts.
    var beforePhoto: String? = null
        private set
    fun setBeforePhoto(dataUrl: String) { beforePhoto = dataUrl }

    // Worker's rating of the customer after a job (module: Customer Rating). Captured locally.
    var lastCustomerRating by mutableIntStateOf(0)
        private set
    fun rateCustomer(stars: Int, comment: String) {
        lastCustomerRating = stars.coerceIn(0, 5)
    }

    fun endService(photo: String? = null) {
        jobStatus = JobStatus.COMPLETED
        serviceEndMs = System.currentTimeMillis()
        sync { api.endService(EndBody(photo)) }
    }

    /** Finish & submit. Earnings are credited only after the CUSTOMER confirms the job on
     *  their app (System verifies -> Pending -> quality check -> Available), so we do NOT
     *  credit balances optimistically here — we just push to history, reset the lifecycle,
     *  and reconcile wallet figures from the server. */
    fun finishAndSettle() {
        val job = activeJob ?: return
        bookings.add(0, Booking(job.services.joinToString(", "), job.customerName, job.area,
            "${job.dateTime} • ${job.durationHours} hours", job.earnings, "Completed"))
        activeJob = null
        jobStatus = JobStatus.NONE
        jobAcceptedAtMs = 0L
        clearJobState()
        // Reconcile with the authoritative server totals (earnings stay 0 until the customer confirms).
        sync {
            val r = api.settle()
            r.walletSummary?.let { applyWalletSummary(it) }
        }
    }

    fun cancelJobWithReason(reason: String) {
        val job = activeJob
        if (job != null) {
            bookings.add(0, Booking(job.services.joinToString(", "), job.customerName, job.area,
                "${job.dateTime} • $reason", job.earnings, "Cancelled"))
        }
        activeJob = null
        jobStatus = JobStatus.NONE
        jobAcceptedAtMs = 0L
        clearJobState()
        sync { api.cancel(ReasonBody(reason)) }
    }

    // ---- wallet module ----
    private fun applyWalletSummary(s: WalletSummaryDto) {
        walletBalance = s.available
        pendingAmount = s.pending
        holdBalance = s.hold
        todayEarnings = s.todayEarnings
        todayJobs = s.todayJobs
        todayCompleted = s.todayCompleted
        todayCancelled = s.todayCancelled
        completionPct = s.completionPct
        cancellationPct = s.cancellationPct
        punctualityPct = s.punctualityPct
        acceptancePct = s.acceptancePct
        weekEarnings = s.weekEarnings
        monthEarnings = s.monthEarnings
        yesterdayEarnings = s.yesterdayEarnings
        lastWeekEarnings = s.lastWeekEarnings
        lastMonthEarnings = s.lastMonthEarnings
        totalEarned = s.totalEarned
        withdrawnTotal = s.totalWithdrawn
        advanceOutstanding = s.advanceOutstanding
        nextPayout = s.nextPayout
    }

    private fun applyWalletState(r: WalletStateResponse) {
        r.walletSummary?.let { applyWalletSummary(it) }
        if (r.earningsBreakup.isNotEmpty()) { earningsBreakup.clear(); earningsBreakup.addAll(r.earningsBreakup) }
        r.deductions?.let { d ->
            deductionSummary.clear(); deductionSummary.addAll(d.summary)
            deductionDetail.clear(); deductionDetail.addAll(d.detail)
            deductionTotal = d.total
        }
        if (r.history.isNotEmpty()) { walletHistory.clear(); walletHistory.addAll(r.history) }
        withdrawals.clear(); withdrawals.addAll(r.withdrawals)
        advances.clear(); advances.addAll(r.advances)
    }

    /** Pull the whole wallet snapshot (dashboard, breakup, deductions, history, queues). */
    fun refreshWallet() = sync { applyWalletState(api.walletState()) }

    fun refreshNotifications() = sync {
        val n = api.walletNotifications()
        notifications.clear(); notifications.addAll(n.items); unreadNotifications = n.unread
    }
    fun markNotificationsRead() = sync {
        val n = api.markNotificationsRead()
        notifications.clear(); notifications.addAll(n.items); unreadNotifications = n.unread
    }

    /** Step 1 of withdrawal: ask the backend to "send" an OTP. Returns the dev OTP for the demo. */
    fun requestWithdrawOtp(onResult: (String?) -> Unit) {
        viewModelScope.launch {
            try { onResult(api.requestWithdrawOtp().devOtp); backendConnected = true }
            catch (e: Exception) { backendConnected = false; onResult(null) }
        }
    }

    /** Step 2: submit the withdrawal. onResult(null) on success, else an error message. */
    fun submitWithdrawal(amount: Int, method: String, otp: String, onResult: (String?) -> Unit) {
        if (amount <= 0) { onResult("Enter a valid amount"); return }
        if (amount > walletBalance) { onResult("Amount exceeds available balance"); return }
        viewModelScope.launch {
            try {
                val r = api.requestWithdrawal(WithdrawBody(amount, method, otp))
                backendConnected = true
                if (r.ok) { applyWalletState(r); onResult(null) } else onResult(r.error ?: "Withdrawal failed")
            } catch (e: Exception) { backendConnected = false; onResult("Network error — please retry") }
        }
    }

    fun loadAdvanceEligibility() = sync { advanceEligibility = api.advanceEligibility() }

    fun submitAdvance(amount: Int, onResult: (String?) -> Unit) {
        viewModelScope.launch {
            try {
                val r = api.requestAdvance(AdvanceBody(amount))
                backendConnected = true
                if (r.ok) { applyWalletState(r); onResult(null) } else onResult(r.error ?: "Request failed")
            } catch (e: Exception) { backendConnected = false; onResult("Network error — please retry") }
        }
    }

    fun loadPayslip() = sync { payslip = api.payslip() }

    // ---- Refer & Earn / Insurance / Merch / Rewards / Language (additive modules) ----
    var referral by mutableStateOf<ReferralDto?>(null)
        private set
    fun loadReferral() = sync { referral = api.referral() }

    var insurance by mutableStateOf<InsuranceDto?>(null)
        private set
    fun loadInsurance() = sync { insurance = api.insurance() }
    fun claimInsurance(reason: String, onDone: (String) -> Unit) {
        viewModelScope.launch {
            try { onDone(api.claimInsurance(ClaimBody(reason)).message.ifBlank { "Claim submitted." }) }
            catch (e: Exception) { onDone("Couldn't submit. Please try again.") }
        }
    }

    val merch = mutableStateListOf<MerchProduct>()
    fun loadMerch() = sync { val r = api.merch(); merch.clear(); merch.addAll(r.products) }
    fun orderMerch(id: String, onDone: (String) -> Unit) {
        viewModelScope.launch {
            try { onDone(api.orderMerch(MerchOrderBody(id)).message.ifBlank { "Order placed." }) }
            catch (e: Exception) { onDone("Couldn't place the order. Please try again.") }
        }
    }

    var rewards by mutableStateOf<RewardsDto?>(null)
        private set
    fun loadRewards() = sync { rewards = api.walletRewards() }

    var shaktiBonus by mutableStateOf<ShaktiBonusDto?>(null)
        private set
    fun loadShaktiBonus() = sync { shaktiBonus = api.shaktiBonus() }

    var withdrawalReceipt by mutableStateOf<com.homehelp.pro.network.WithdrawalReceiptDto?>(null)
        private set
    fun loadWithdrawalReceipt(id: Int) = sync { withdrawalReceipt = api.withdrawalReceipt(id) }
    /** Id of the most recent withdrawal (for jumping straight to its receipt). */
    val lastWithdrawalId: Int get() = withdrawals.firstOrNull()?.id ?: 0

    // ---- profile persistence (called from the Save buttons) ----
    /**
     * Hydrate every worker-scoped field from a WorkerDto. Extracted from applyBootstrap so the
     * profile/photo/bank saves — which all return the same DTO — refresh state through ONE path
     * instead of each repeating the field list and drifting.
     */
    private fun applyWorker(w: WorkerDto) {
        workerName = w.name
        if (w.status.isNotBlank()) workerStatus = w.status
        onboardingSubmittedAt = w.onboarding?.submittedAt
        workerPhone = w.phone
        workerEmail = w.email
        workerCity = w.city
        if (w.jobsCompleted > 0) jobsCompleted = w.jobsCompleted
        if (w.rating > 0) workerRating = w.rating
        bankName = w.bankName
        bankAccount = w.bankAccount
        bankIfsc = w.bankIfsc
        bankHolder = w.bankHolder
        bankUpi = w.bankUpi
        bankAccountType = w.bankAccountType
        bankStatus = w.bankStatus
        bankRemarks = w.bankRemarks
        bankRegisteredName = w.bankRegisteredName
        bankNameMatch = w.bankNameMatch
        // Phase 2/3
        gender = w.gender
        dob = w.dob
        bloodGroup = w.bloodGroup
        maritalStatus = w.maritalStatus
        fatherName = w.fatherName
        motherName = w.motherName
        emergencyName = w.emergencyName
        emergencyPhone = w.emergencyPhone
        currentAddress = w.address
        permanentAddress = w.permanentAddress
        languages = w.languages
        qualification = w.qualification
        experienceYears = w.experienceYears
        previousCompany = w.previousCompany
        avatarUrl = w.avatar.orEmpty()
        shiftStart = w.shiftStart
        shiftEnd = w.shiftEnd
        if (w.availabilityState.isNotBlank()) availabilityState = w.availabilityState
        if (w.availableDays.isNotEmpty()) { availableDays.clear(); availableDays.putAll(w.availableDays) }
        if (w.jobPreferences.isNotEmpty()) { jobPreferences.clear(); jobPreferences.putAll(w.jobPreferences) }
        notifNewJobs = w.notifNewJobs
        notifPayments = w.notifPayments
        notifPromotions = w.notifPromotions
        notifRatings = w.notifRatings
    }

    /* ---- Phase 6: service skills ----
     * `skills` is what the worker CLAIMS; `approvedServices` is what an admin has granted and what
     * actually brings work. They are separate on purpose — claiming a skill does not make you
     * dispatchable for it, and the screen says so rather than implying otherwise.
     */
    val serviceCatalogue = mutableStateListOf<String>()
    val skillLevels = mutableStateListOf<String>()
    val skills = mutableStateMapOf<String, SkillDto>()
    val approvedServices = mutableStateListOf<String>()
    var savingSkills by mutableStateOf(false)
        private set
    var skillsError by mutableStateOf<String?>(null)
    fun clearSkillsError() { skillsError = null }

    fun loadSkills() = sync {
        val cat = api.serviceCatalogue()
        serviceCatalogue.clear(); serviceCatalogue.addAll(cat.services)
        skillLevels.clear(); skillLevels.addAll(cat.levels)
        val s = api.getSkills()
        skills.clear(); skills.putAll(s.skills)
        approvedServices.clear(); approvedServices.addAll(s.approved)
    }

    /** Claim/withdraw skills. Any edit to an approved skill sends it back for review — the server
     *  enforces that; this just reflects whatever comes back. */
    fun saveSkills(claims: Map<String, SkillClaim>, onDone: () -> Unit = {}) {
        skillsError = null
        savingSkills = true
        viewModelScope.launch {
            try {
                val r = withContext(Dispatchers.IO) { api.saveSkills(SkillsBody(claims)) }
                skills.clear(); skills.putAll(r.skills)
                approvedServices.clear(); approvedServices.addAll(r.approved)
                backendConnected = true
                onDone()
            } catch (e: retrofit2.HttpException) { skillsError = httpErrorMessage(e) }
            catch (e: Exception) { skillsError = "Could not save. Check your connection and try again." }
            finally { savingSkills = false }
        }
    }

    fun uploadSkillCertificate(ctx: android.content.Context, service: String, uri: android.net.Uri) {
        skillsError = null
        savingSkills = true
        viewModelScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } }
                    ?: throw IllegalStateException("Could not read that file")
                if (bytes.size > 8 * 1024 * 1024) throw IllegalStateException("File is too large (max 8 MB)")
                val mime = ctx.contentResolver.getType(uri) ?: "application/octet-stream"
                val part = MultipartBody.Part.createFormData("file", "certificate", bytes.toRequestBody(mime.toMediaTypeOrNull()))
                val r = withContext(Dispatchers.IO) {
                    api.uploadSkillCertificate(service.toRequestBody("text/plain".toMediaTypeOrNull()), part)
                }
                skills.clear(); skills.putAll(r.skills)
            } catch (e: retrofit2.HttpException) { skillsError = httpErrorMessage(e) }
            catch (e: Exception) { skillsError = e.message ?: "Upload failed." }
            finally { savingSkills = false }
        }
    }

    /* ---- Phase 7: training & assessment ----
     * Modules are written by the admin; unpublished ones simply aren't in the list, so an empty
     * list means "nothing published yet", not an error. The paper carries no answer key and the
     * score comes back from the server — there is nothing to check locally.
     */
    val trainingModules = mutableStateListOf<TrainingModuleDto>()
    var trainingProgress by mutableStateOf(TrainingProgress())
        private set
    var quizState by mutableStateOf(QuizState())
        private set
    var quizPaper by mutableStateOf<List<QuizQuestionDto>>(emptyList())
        private set
    var quizResult by mutableStateOf<QuizResultResponse?>(null)
    var loadingQuiz by mutableStateOf(false)
        private set
    var trainingError by mutableStateOf<String?>(null)
    fun clearTrainingError() { trainingError = null }

    private fun applyTraining(modules: List<TrainingModuleDto>, progress: TrainingProgress, quiz: QuizState) {
        trainingModules.clear(); trainingModules.addAll(modules)
        trainingProgress = progress
        quizState = quiz
    }

    fun loadTraining() = sync {
        val t = api.getTraining()
        applyTraining(t.modules, t.progress, t.quiz)
    }

    fun completeModule(id: Int) {
        trainingError = null
        viewModelScope.launch {
            try {
                val t = withContext(Dispatchers.IO) { api.completeModule(id) }
                applyTraining(t.modules, t.progress, t.quiz)
                backendConnected = true
            } catch (e: retrofit2.HttpException) { trainingError = httpErrorMessage(e) }
            catch (e: Exception) { trainingError = "Could not save your progress. Check your connection." }
        }
    }

    /** Fetch a paper. The server refuses with a clear reason (modules unread, cooldown, bank too
     *  small) — show that rather than a generic failure. */
    fun startQuiz(onReady: () -> Unit = {}) {
        trainingError = null
        loadingQuiz = true
        quizResult = null
        viewModelScope.launch {
            try {
                val p = withContext(Dispatchers.IO) { api.getQuizPaper() }
                quizPaper = p.questions
                backendConnected = true
                onReady()
            } catch (e: retrofit2.HttpException) { trainingError = httpErrorMessage(e) }
            catch (e: Exception) { trainingError = "Could not load the assessment. Check your connection." }
            finally { loadingQuiz = false }
        }
    }

    fun submitQuiz(answers: Map<Int, Int>, onDone: () -> Unit = {}) {
        trainingError = null
        loadingQuiz = true
        viewModelScope.launch {
            try {
                val r = withContext(Dispatchers.IO) { api.submitQuiz(QuizSubmitBody(answers.mapKeys { it.key.toString() })) }
                quizResult = r
                trainingProgress = r.progress
                quizState = r.quiz
                quizPaper = emptyList()
                onDone()
            } catch (e: retrofit2.HttpException) { trainingError = httpErrorMessage(e) }
            catch (e: Exception) { trainingError = "Could not submit. Check your connection and try again." }
            finally { loadingQuiz = false }
        }
    }

    /* ---- Onboarding wizard ----
     * Step completion is computed by the server from real data; the app renders it and nothing more.
     * Submitting says "I've done my part" — it is not an approval, and the screen says so.
     */
    val onboardingSteps = mutableStateListOf<com.homehelp.pro.network.OnboardingStep>()
    var onboardingDone by mutableStateOf(0)
        private set
    var onboardingTotal by mutableStateOf(0)
        private set
    var canSubmitOnboarding by mutableStateOf(false)
        private set
    var onboardingSubmittedAt by mutableStateOf<String?>(null)
        private set
    var submittingOnboarding by mutableStateOf(false)
        private set
    var onboardingError by mutableStateOf<String?>(null)
    fun clearOnboardingError() { onboardingError = null }

    private fun applyOnboarding(r: com.homehelp.pro.network.OnboardingResponse) {
        onboardingSteps.clear(); onboardingSteps.addAll(r.steps)
        onboardingDone = r.completed
        onboardingTotal = r.total
        canSubmitOnboarding = r.canSubmit
        onboardingSubmittedAt = r.submittedAt
    }

    fun loadOnboarding() = sync { applyOnboarding(api.getOnboarding()) }

    fun submitOnboarding(onDone: () -> Unit = {}) {
        onboardingError = null
        submittingOnboarding = true
        viewModelScope.launch {
            try {
                applyOnboarding(withContext(Dispatchers.IO) { api.submitOnboarding() })
                backendConnected = true
                onDone()
            } catch (e: retrofit2.HttpException) { onboardingError = httpErrorMessage(e) }
            catch (e: Exception) { onboardingError = "Could not submit. Check your connection and try again." }
            finally { submittingOnboarding = false }
        }
    }

    /* ---- Phase 9: equipment ----
     * Read-only. An admin issues the kit; a worker ticking "I have a vacuum" would make Phase 12's
     * Go Live check worthless. The app just shows what's on their record.
     */
    val equipment = mutableStateListOf<IssuedEquipmentDto>()
    fun loadEquipment() = sync {
        val r = api.getEquipment()
        equipment.clear(); equipment.addAll(r.issued)
    }

    /* ---- Phase 2/3: the worker's own profile ----
     * These were admin-entered and invisible to the app. Held as plain state and sent together;
     * the server allow-lists and MERGES, so sending a subset never blanks the rest. */
    var gender by mutableStateOf("")
    var dob by mutableStateOf("")
    var bloodGroup by mutableStateOf("")
    var maritalStatus by mutableStateOf("")
    var fatherName by mutableStateOf("")
    var motherName by mutableStateOf("")
    var emergencyName by mutableStateOf("")
    var emergencyPhone by mutableStateOf("")
    var currentAddress by mutableStateOf("")
    var permanentAddress by mutableStateOf("")
    var languages by mutableStateOf("")
    var qualification by mutableStateOf("")
    var experienceYears by mutableStateOf("")
    var previousCompany by mutableStateOf("")
    var avatarUrl by mutableStateOf("")
        private set

    var savingProfile by mutableStateOf(false)
        private set
    var profileError by mutableStateOf<String?>(null)
    fun clearProfileError() { profileError = null }

    fun saveProfile(onDone: () -> Unit = {}) {
        profileError = null
        savingProfile = true
        viewModelScope.launch {
            try {
                val w = withContext(Dispatchers.IO) {
                    api.updateProfile(ProfileBody(
                        name = workerName, phone = workerPhone, email = workerEmail, city = workerCity,
                        gender = gender, dob = dob, bloodGroup = bloodGroup, maritalStatus = maritalStatus,
                        fatherName = fatherName, motherName = motherName,
                        emergencyName = emergencyName, emergencyPhone = emergencyPhone,
                        address = currentAddress, permanentAddress = permanentAddress, languages = languages,
                        qualification = qualification, experienceYears = experienceYears, previousCompany = previousCompany,
                    ))
                }
                applyWorker(w)
                backendConnected = true
                onDone()
            } catch (e: retrofit2.HttpException) {
                profileError = httpErrorMessage(e)
            } catch (e: Exception) {
                profileError = "Could not save. Check your connection and try again."
            } finally { savingProfile = false }
        }
    }

    /** Upload a profile photo (public bucket — customers see it on their job screen). */
    fun uploadPhoto(ctx: android.content.Context, uri: android.net.Uri) {
        profileError = null
        savingProfile = true
        viewModelScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } }
                    ?: throw IllegalStateException("Could not read that image")
                if (bytes.size > 8 * 1024 * 1024) throw IllegalStateException("Image is too large (max 8 MB)")
                val mime = ctx.contentResolver.getType(uri) ?: "image/jpeg"
                val part = MultipartBody.Part.createFormData("file", "avatar.jpg", bytes.toRequestBody(mime.toMediaTypeOrNull()))
                val w = withContext(Dispatchers.IO) { api.uploadProfilePhoto(part) }
                applyWorker(w)
                backendConnected = true
            } catch (e: retrofit2.HttpException) {
                profileError = httpErrorMessage(e)
            } catch (e: Exception) {
                profileError = e.message ?: "Could not upload the photo."
            } finally { savingProfile = false }
        }
    }

    /** Resolve bank + branch from the IFSC (auto-fills the bank name and confirms the code is real).
     *  Only the penny-drop on save can prove the ACCOUNT NUMBER itself — this just validates the IFSC. */
    fun lookupIfsc(code: String) {
        val c = code.trim().uppercase()
        if (!Regex("^[A-Z]{4}0[A-Z0-9]{6}$").matches(c)) { bankBranch = ""; ifscError = ""; return }
        viewModelScope.launch {
            ifscChecking = true; ifscError = ""
            try {
                val r = api.ifscLookup(c)
                if (r.valid) { ifscBank = r.bank; bankBranch = listOf(r.branch, r.city).filter { it.isNotBlank() }.joinToString(", "); ifscError = "" }
                else { bankBranch = ""; ifscBank = ""; ifscError = r.error.ifBlank { "IFSC not found" } }
            } catch (e: Exception) { bankBranch = ""; ifscBank = ""; ifscError = "Could not verify IFSC" }
            finally { ifscChecking = false }
        }
    }

    fun saveBank(name: String, account: String, ifsc: String, upi: String, chequePhoto: String = "", accountType: String = "") = sync {
        val w = api.updateBank(BankBody(workerName, name, account, ifsc, upi, chequePhoto, accountType))
        bankName = w.bankName
        bankAccount = w.bankAccount
        bankIfsc = w.bankIfsc
        bankUpi = w.bankUpi
        bankAccountType = w.bankAccountType
        bankStatus = w.bankStatus
        bankRemarks = w.bankRemarks
        bankRegisteredName = w.bankRegisteredName
        bankNameMatch = w.bankNameMatch
        // Verification (penny-drop) runs asynchronously after this call returns, so the immediate
        // response is "Pending Verification". Poll the snapshot a few times so the final result
        // (Approved / Rejected) appears on the screen without the worker reopening it.
        var tries = 0
        while (bankStatus == "Pending Verification" && tries < 6) {
            tries++
            delay(1500)
            runCatching { applyBootstrap(api.bootstrap()) }
        }
    }

    /* ---- Phase 11: availability ----
     * These are PREFERENCES. An admin approves them or assigns something else, so the screen shows
     * the review status and what was actually assigned rather than implying the request took effect.
     */
    var maxWeeklyHours by mutableStateOf("")
    var hoursThisWeek by mutableStateOf(0.0)
        private set
    var availabilityStatus by mutableStateOf("Pending")
        private set
    var availabilityReason by mutableStateOf("")
        private set
    var assignedShiftId by mutableStateOf<Int?>(null)
        private set
    var availabilityError by mutableStateOf<String?>(null)
    fun clearAvailabilityError() { availabilityError = null }

    fun loadAvailability() = sync {
        val r = api.getAvailability()
        availableDays.clear(); availableDays.putAll(r.availability.availableDays)
        shiftStart = r.availability.shiftStart
        shiftEnd = r.availability.shiftEnd
        maxWeeklyHours = r.availability.maxWeeklyHours?.toString() ?: ""
        availabilityStatus = r.availability.status
        availabilityReason = r.availability.reason
        assignedShiftId = r.assigned.shiftDefId
        hoursThisWeek = r.hoursThisWeek
    }

    /** The server validates (at least one day, HH:MM, 1..90 hours) and reports why on rejection. */
    fun saveAvailability(onDone: () -> Unit = {}) {
        availabilityError = null
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    api.updateAvailability(AvailabilityBody(
                        availableDays.toMap(), shiftStart, shiftEnd,
                        maxWeeklyHours.trim().toIntOrNull(),
                    ))
                }
                backendConnected = true
                loadAvailability()
                onDone()
            } catch (e: retrofit2.HttpException) { availabilityError = httpErrorMessage(e) }
            catch (e: Exception) { availabilityError = "Could not save. Check your connection and try again." }
        }
    }

    /* ---- shift plans (min-guarantee) ----
     * `selectedShiftId` is the shift an ADMIN assigned — it's what the earnings guarantee hangs on.
     * `requestedShiftId` is what the worker asked for. Picking a shift only requests it: the app
     * must not show it as selected before an admin approves, or a worker will count on a guarantee
     * they haven't been given.
     */
    val shifts = mutableStateListOf<com.homehelp.pro.network.ShiftDto>()
    var selectedShiftId by mutableStateOf<Int?>(null)
        private set
    var requestedShiftId by mutableStateOf<Int?>(null)
        private set
    var shiftStatus by mutableStateOf("Pending")
        private set

    fun loadShifts() = sync {
        val r = api.getShifts()
        shifts.clear(); shifts.addAll(r.shifts)
        selectedShiftId = r.selectedId
        requestedShiftId = r.requestedId
        shiftStatus = r.shiftStatus
    }

    /** Ask for a shift. The admin grants it — this does NOT assign it. */
    fun selectShift(id: Int, onDone: () -> Unit = {}) {
        requestedShiftId = id
        shiftStatus = "Pending"
        viewModelScope.launch {
            try {
                attendance = api.selectShift(com.homehelp.pro.network.SelectShiftBody(id))
                backendConnected = true
                runCatching { loadShiftsNow() }
            } catch (_: Exception) {}
            onDone()
        }
    }

    private suspend fun loadShiftsNow() {
        val r = withContext(Dispatchers.IO) { api.getShifts() }
        shifts.clear(); shifts.addAll(r.shifts)
        selectedShiftId = r.selectedId
        requestedShiftId = r.requestedId
        shiftStatus = r.shiftStatus
    }

    // ---- geofence (assigned-apartment radius) ----
    var geofence by mutableStateOf<com.homehelp.pro.network.GeofenceStatus?>(null)
        private set
    // Non-null while an "you left your assigned area" alert should be shown app-wide.
    var geofenceAlert by mutableStateOf<String?>(null)
        private set
    fun dismissGeofenceAlert() { geofenceAlert = null }
    /** Report the worker's live location; raises an alert the first time they leave the radius. */
    fun reportGeofence(lat: Double, lng: Double) {
        viewModelScope.launch {
            try {
                val g = api.reportGeofence(com.homehelp.pro.network.GeofenceReportBody(lat, lng))
                geofence = g
                if (g.justBreached) {
                    geofenceAlert = "You've left ${g.siteName.ifBlank { "your assigned apartment" }}. " +
                        "You're ${g.distance} m away (allowed ${g.radius} m). Please return to your assigned area."
                }
            } catch (_: Exception) {}
        }
    }

    // ---- attendance (check-in / check-out) ----
    var attendance by mutableStateOf(com.homehelp.pro.network.AttendanceDto())
        private set
    fun checkIn(lat: Double?, lng: Double?, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            try { attendance = api.checkIn(com.homehelp.pro.network.AttendanceBody(lat, lng)); backendConnected = true } catch (_: Exception) {}
            onDone()
        }
    }
    fun checkOut(lat: Double?, lng: Double?, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            try { attendance = api.checkOut(com.homehelp.pro.network.AttendanceBody(lat, lng)); backendConnected = true } catch (_: Exception) {}
            onDone()
        }
    }

    // ---- availability state (Available | Busy | Break | Offline | Leave) ----
    var availabilityState by mutableStateOf("Offline")
        private set
    fun changeAvailabilityState(state: String) {
        availabilityState = state
        val online = state == "Available"
        if (online != isOnline) goOnline(online)
        sync { runCatching { api.setStatus(com.homehelp.pro.network.StatusBody(state)) } }
    }

    // ---- leave requests ----
    val leaves = mutableStateListOf<com.homehelp.pro.network.LeaveItem>()
    fun submitLeave(fromDate: String, toDate: String, reason: String, onDone: (String?) -> Unit) {
        if (fromDate.isBlank()) { onDone("Pick a date"); return }
        viewModelScope.launch {
            try {
                val list = api.requestLeave(com.homehelp.pro.network.LeaveBody(fromDate, toDate.ifBlank { fromDate }, reason))
                leaves.clear(); leaves.addAll(list); backendConnected = true; onDone(null)
            } catch (e: Exception) { onDone("Couldn't submit. Please try again.") }
        }
    }

    // ---- support tickets + SOS ----
    val tickets = mutableStateListOf<com.homehelp.pro.network.TicketItem>()
    fun submitTicket(subject: String, message: String, onDone: (String?) -> Unit) {
        if (subject.isBlank() && message.isBlank()) { onDone("Describe your issue"); return }
        viewModelScope.launch {
            try {
                val list = api.raiseTicket(com.homehelp.pro.network.TicketBody(subject.ifBlank { "Support request" }, message))
                tickets.clear(); tickets.addAll(list); backendConnected = true; onDone(null)
            } catch (e: Exception) { onDone("Couldn't submit. Please try again.") }
        }
    }
    fun sendSos(lat: Double?, lng: Double?, onDone: (String) -> Unit) {
        viewModelScope.launch {
            try { val r = api.sos(com.homehelp.pro.network.SosBody(lat, lng)); onDone(r.message.ifBlank { "Help is on the way." }) }
            catch (e: Exception) { onDone("Alert sent. If urgent, call emergency services.") }
        }
    }

    fun savePreferences() = sync { api.updatePreferences(PreferencesBody(jobPreferences.toMap())) }

    fun saveNotifications() = sync {
        api.updateNotifications(NotificationsBody(notifNewJobs, notifPayments, notifPromotions, notifRatings))
    }

    /** Record a picked document: flip to "Under Review" locally, then persist to the backend. */
    /** Set while a document is uploading, so the row can show progress instead of lying about status. */
    var uploadingDoc by mutableStateOf<String?>(null)
        private set
    var uploadError by mutableStateOf<String?>(null)
        private set
    fun clearUploadError() { uploadError = null }

    /**
     * Upload a KYC document's actual BYTES. Reads the picked content Uri and posts it as multipart.
     *
     * This previously sent only {name, fileName} — two strings — and flipped the row to
     * "Under Review" locally, which was a lie the next refresh silently overwrote. The status
     * shown now is whatever the server says.
     */
    fun uploadDocument(ctx: android.content.Context, name: String, fileName: String, uri: android.net.Uri) {
        uploadError = null
        uploadingDoc = name
        viewModelScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) {
                    ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                } ?: throw IllegalStateException("Could not read that file")
                // 8 MB is the server's limit — fail here with a clear message rather than upload
                // for 30s and have it rejected.
                if (bytes.size > 8 * 1024 * 1024) throw IllegalStateException("File is too large (max 8 MB)")
                val mime = ctx.contentResolver.getType(uri) ?: "application/octet-stream"
                val part = MultipartBody.Part.createFormData(
                    "file", fileName, bytes.toRequestBody(mime.toMediaTypeOrNull()),
                )
                val plain = "text/plain".toMediaTypeOrNull()
                val r = withContext(Dispatchers.IO) {
                    api.uploadDocument(name.toRequestBody(plain), fileName.toRequestBody(plain), part)
                }
                backendConnected = true
                if (r.documents.isNotEmpty()) {
                    documents.clear()
                    documents.addAll(r.documents.map { DocItem(it.name, it.status, it.fileName, it.rejectReason) })
                }
            } catch (e: retrofit2.HttpException) {
                uploadError = httpErrorMessage(e)   // e.g. wrong file type, too large, storage down
            } catch (e: Exception) {
                uploadError = e.message ?: "Upload failed. Please try again."
            } finally { uploadingDoc = null }
        }
    }

    // ---- dynamic data — empty until populated from the backend; grows as jobs complete ----
    val bookings = mutableStateListOf<Booking>()
    val schedule = mutableStateListOf<com.homehelp.pro.network.ScheduleItem>()
    val earnings = mutableStateListOf<EarningEntry>()
    val walletTxns = mutableStateListOf<WalletTxn>()
}
