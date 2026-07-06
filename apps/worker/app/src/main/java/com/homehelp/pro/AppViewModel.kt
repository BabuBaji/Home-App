package com.homehelp.pro

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
import com.homehelp.pro.network.UploadDocBody
import com.homehelp.pro.network.WalletStateResponse
import com.homehelp.pro.network.WalletSummaryDto
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

data class Booking(
    val service: String,
    val customerName: String,
    val address: String,
    val timeInfo: String,
    val amount: Int,
    val status: String,
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
data class DocItem(val name: String, val status: String, val fileName: String = "")

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
    var bankStatus by mutableStateOf("Not Added")   // Not Added / Pending Verification / Approved / Rejected
        private set
    var bankRemarks by mutableStateOf("")
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
    val documents = mutableStateListOf(
        DocItem("Aadhaar Card", "Pending"),
        DocItem("PAN Card", "Pending"),
        DocItem("Passport Size Photo", "Pending"),
    )

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
        b.worker?.let { w ->
            workerName = w.name
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
            bankStatus = w.bankStatus
            bankRemarks = w.bankRemarks
            shiftStart = w.shiftStart
            shiftEnd = w.shiftEnd
            if (w.availableDays.isNotEmpty()) {
                availableDays.clear(); availableDays.putAll(w.availableDays)
            }
            if (w.jobPreferences.isNotEmpty()) {
                jobPreferences.clear(); jobPreferences.putAll(w.jobPreferences)
            }
            notifNewJobs = w.notifNewJobs
            notifPayments = w.notifPayments
            notifPromotions = w.notifPromotions
            notifRatings = w.notifRatings
        }
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
        if (b.earnings.isNotEmpty()) { earnings.clear(); earnings.addAll(b.earnings) }
        if (b.walletTxns.isNotEmpty()) { walletTxns.clear(); walletTxns.addAll(b.walletTxns) }
        if (b.documents.isNotEmpty()) {
            documents.clear()
            documents.addAll(b.documents.map { DocItem(it.name, it.status, it.fileName) })
        }
        // Restore any job the worker is mid-way through, so relaunching the app (or coming
        // back to Home) keeps the active/in-progress job visible instead of losing it.
        activeJob = b.activeJob
        jobStatus = b.jobStatus?.let { s -> runCatching { JobStatus.valueOf(s) }.getOrNull() } ?: JobStatus.NONE
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

    fun acceptJob() {
        jobStatus = JobStatus.ACCEPTED
        sync { api.acceptJob() }
    }

    fun rejectJob() {
        activeJob = null
        jobStatus = JobStatus.NONE
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
        sync { api.cancel(ReasonBody(reason)) }
    }

    // ---- wallet module ----
    private fun applyWalletSummary(s: WalletSummaryDto) {
        walletBalance = s.available
        pendingAmount = s.pending
        holdBalance = s.hold
        todayEarnings = s.todayEarnings
        weekEarnings = s.weekEarnings
        monthEarnings = s.monthEarnings
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

    var withdrawalReceipt by mutableStateOf<com.homehelp.pro.network.WithdrawalReceiptDto?>(null)
        private set
    fun loadWithdrawalReceipt(id: Int) = sync { withdrawalReceipt = api.withdrawalReceipt(id) }
    /** Id of the most recent withdrawal (for jumping straight to its receipt). */
    val lastWithdrawalId: Int get() = withdrawals.firstOrNull()?.id ?: 0

    // ---- profile persistence (called from the Save buttons) ----
    fun saveProfile() = sync { api.updateProfile(ProfileBody(workerName, workerPhone, workerEmail, workerCity)) }

    fun saveBank(chequePhoto: String = "") = sync {
        val w = api.updateBank(BankBody(bankHolder, bankName, bankAccount, bankIfsc, bankUpi, chequePhoto))
        bankStatus = w.bankStatus
        bankRemarks = w.bankRemarks
        bankUpi = w.bankUpi
    }

    fun saveAvailability() = sync {
        api.updateAvailability(AvailabilityBody(availableDays.toMap(), shiftStart, shiftEnd))
    }

    fun savePreferences() = sync { api.updatePreferences(PreferencesBody(jobPreferences.toMap())) }

    fun saveNotifications() = sync {
        api.updateNotifications(NotificationsBody(notifNewJobs, notifPayments, notifPromotions, notifRatings))
    }

    /** Record a picked document: flip to "Under Review" locally, then persist to the backend. */
    fun uploadDocument(name: String, fileName: String) {
        val i = documents.indexOfFirst { it.name == name }
        if (i >= 0) documents[i] = documents[i].copy(status = "Under Review", fileName = fileName)
        sync {
            val r = api.uploadDocument(UploadDocBody(name, fileName))
            if (r.documents.isNotEmpty()) {
                documents.clear()
                documents.addAll(r.documents.map { DocItem(it.name, it.status, it.fileName) })
            }
        }
    }

    // ---- dynamic data — empty until populated from the backend; grows as jobs complete ----
    val bookings = mutableStateListOf<Booking>()
    val earnings = mutableStateListOf<EarningEntry>()
    val walletTxns = mutableStateListOf<WalletTxn>()
}
