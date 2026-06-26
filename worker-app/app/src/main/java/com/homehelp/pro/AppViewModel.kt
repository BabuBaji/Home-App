package com.homehelp.pro

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.homehelp.pro.network.AmountBody
import com.homehelp.pro.network.AuthRequest
import com.homehelp.pro.network.AvailabilityBody
import com.homehelp.pro.network.BankBody
import com.homehelp.pro.network.BootstrapResponse
import com.homehelp.pro.network.EndBody
import com.homehelp.pro.network.NotificationsBody
import com.homehelp.pro.network.OtpBody
import com.homehelp.pro.network.PreferencesBody
import com.homehelp.pro.network.ProfileBody
import com.homehelp.pro.network.ReasonBody
import com.homehelp.pro.network.RetrofitClient
import com.homehelp.pro.network.UploadDocBody
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Job lifecycle state machine — single source of truth for the workflow.
 * NONE -> REQUESTED -> ACCEPTED -> ON_THE_WAY -> ARRIVED -> IN_PROGRESS -> COMPLETED -> (settle) -> NONE
 * Any pre-completion state -> CANCELLED.
 */
enum class JobStatus { NONE, REQUESTED, ACCEPTED, ON_THE_WAY, ARRIVED, IN_PROGRESS, COMPLETED, CANCELLED }

data class Job(
    val id: String,
    val customerName: String,
    val initials: String,
    val customerPhone: String,
    val customerRating: Double,
    val services: List<String>,
    val dateTime: String,
    val durationHours: Int,
    val address: String,
    val area: String,
    val distanceKm: Double,
    val earnings: Int,
    val otp: String,
    val lat: Double,
    val lng: Double,
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

    // Live dashboard / wallet figures
    var todayEarnings by mutableIntStateOf(650)
        private set
    var todayJobs by mutableIntStateOf(4)
        private set
    val todayHours = 5.2
    var walletBalance by mutableIntStateOf(8450)
        private set
    var totalEarned by mutableIntStateOf(15680)
        private set
    var withdrawnTotal by mutableIntStateOf(7230)
        private set
    var pendingAmount by mutableIntStateOf(1200)
        private set

    // ---- editable profile state (Profile sub-screens) ----
    var workerName by mutableStateOf("Rahul Kumar")
    var workerPhone by mutableStateOf("+91 90000 12345")
    var workerEmail by mutableStateOf("rahul.kumar@email.com")
    var workerCity by mutableStateOf("Mumbai")
    var jobsCompleted by mutableIntStateOf(128)
        private set
    var workerRating by mutableStateOf(4.7)
        private set

    var bankName by mutableStateOf("HDFC Bank")
    var bankAccount by mutableStateOf("xxxx xxxx 1234")
    var bankIfsc by mutableStateOf("HDFC0001234")
    var bankHolder by mutableStateOf("Rahul Kumar")

    val availableDays = mutableStateMapOf(
        "Mon" to true, "Tue" to true, "Wed" to true,
        "Thu" to true, "Fri" to true, "Sat" to true, "Sun" to false,
    )
    var shiftStart by mutableStateOf("08:00 AM")
    var shiftEnd by mutableStateOf("08:00 PM")

    val jobPreferences = mutableStateMapOf(
        "Utensil Wash" to true, "Mopping" to true, "Sweeping" to true,
        "Dusting" to true, "Bathroom Cleaning" to true, "Laundry" to false,
        "Kitchen Cleaning" to true,
    )

    var notifNewJobs by mutableStateOf(true)
    var notifPayments by mutableStateOf(true)
    var notifPromotions by mutableStateOf(false)
    var notifRatings by mutableStateOf(true)

    // ---- verification documents ----
    val documents = mutableStateListOf(
        DocItem("Aadhaar Card", "Verified"),
        DocItem("PAN Card", "Verified"),
        DocItem("Police Verification", "Verified"),
        DocItem("Address Proof", "Pending"),
    )

    // ---- networking helpers ----
    /** Fire a backend call without blocking the UI; failures degrade to offline mode. */
    private fun sync(block: suspend () -> Unit) {
        viewModelScope.launch {
            try {
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
        // Remember the auth token so every later call is attached to this worker.
        b.token?.let { RetrofitClient.token = it }
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
        if (b.bookings.isNotEmpty()) { bookings.clear(); bookings.addAll(b.bookings) }
        if (b.earnings.isNotEmpty()) { earnings.clear(); earnings.addAll(b.earnings) }
        if (b.walletTxns.isNotEmpty()) { walletTxns.clear(); walletTxns.addAll(b.walletTxns) }
        if (b.documents.isNotEmpty()) {
            documents.clear()
            documents.addAll(b.documents.map { DocItem(it.name, it.status, it.fileName) })
        }
    }

    // ---- lifecycle transitions ----
    fun login(phone: String = "", otp: String = "") {
        isLoggedIn = true
        // Authenticate against the backend and hydrate state from the server.
        sync {
            val b = api.verify(AuthRequest(phone = phone.ifBlank { "9000012345" }, otp = otp.ifBlank { "1234" }))
            applyBootstrap(b)
        }
    }

    /** True when a real customer booking is waiting — drives the "New Job Request" notification. */
    var hasIncomingJob by mutableStateOf(false)
        private set
    private var pollingStarted = false

    fun goOnline(v: Boolean) {
        isOnline = v
        if (v) startJobPolling() else hasIncomingJob = false
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

    fun markArrived() {
        jobStatus = JobStatus.ARRIVED
        sync { api.arrived() }
    }

    /** OTP-gated start. Returns true if the OTP matches and service begins. */
    fun verifyOtpAndStart(input: String): Boolean {
        val job = activeJob ?: return false
        return if (input == job.otp) {
            jobStatus = JobStatus.IN_PROGRESS
            serviceStartMs = System.currentTimeMillis()
            serviceEndMs = 0L
            sync { api.verifyOtp(OtpBody(input)) }
            true
        } else false
    }

    fun endService(photo: String? = null) {
        jobStatus = JobStatus.COMPLETED
        serviceEndMs = System.currentTimeMillis()
        sync { api.endService(EndBody(photo)) }
    }

    /** Finish & submit -> credit earnings + wallet, push to history, reset lifecycle. */
    fun finishAndSettle() {
        val job = activeJob ?: return
        todayEarnings += job.earnings
        todayJobs += 1
        walletBalance += job.earnings
        totalEarned += job.earnings
        bookings.add(0, Booking(job.services.joinToString(", "), job.customerName, job.area,
            "${job.dateTime} • ${job.durationHours} hours", job.earnings, "Completed"))
        earnings.add(0, EarningEntry("Today • ${job.id}", job.earnings))
        walletTxns.add(0, WalletTxn("Job Payment", "${job.id} • ${job.customerName}", job.earnings, "Success", true))
        activeJob = null
        jobStatus = JobStatus.NONE
        // Persist the settlement server-side, then reconcile with the authoritative totals.
        sync {
            val r = api.settle()
            r.wallet?.let { wl ->
                walletBalance = wl.balance
                totalEarned = wl.totalEarned
                todayEarnings = wl.todayEarnings
                todayJobs = wl.todayJobs
            }
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

    // ---- wallet operations ----
    /** Returns null on success, or an error message. */
    fun withdraw(amount: Int): String? {
        if (amount <= 0) return "Enter a valid amount"
        if (amount > walletBalance) return "Amount exceeds available balance"
        walletBalance -= amount
        withdrawnTotal += amount
        walletTxns.add(0, WalletTxn("Withdraw to Bank", "A/c No. xxxx1234", amount, "Success", false))
        sync { api.withdraw(AmountBody(amount)) }
        return null
    }

    fun addMoney(amount: Int): String? {
        if (amount <= 0) return "Enter a valid amount"
        walletBalance += amount
        walletTxns.add(0, WalletTxn("Added to Wallet", "UPI • Instant", amount, "Success", true))
        sync { api.addMoney(AmountBody(amount)) }
        return null
    }

    // ---- profile persistence (called from the Save buttons) ----
    fun saveProfile() = sync { api.updateProfile(ProfileBody(workerName, workerPhone, workerEmail, workerCity)) }

    fun saveBank() = sync { api.updateBank(BankBody(bankHolder, bankName, bankAccount, bankIfsc)) }

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

    // ---- dynamic data (seeded, grows as jobs complete) ----
    val bookings = mutableStateListOf(
        Booking("Utensil Wash, Mopping, Dusting", "Priya Sharma", "Bandra West, Mumbai", "16 May 2025, 09:00 AM • 2 hours • 1.8 km", 297, "Upcoming"),
        Booking("Bathroom Cleaning, Laundry", "Rohan Verma", "Andheri West, Mumbai", "17 May 2025, 10:30 AM • 2.3 km", 349, "Upcoming"),
        Booking("Sweeping, Mopping, Dusting", "Sneha Iyer", "Bandra West, Mumbai", "18 May 2025, 08:00 AM • 2.0 km", 249, "Upcoming"),
        Booking("Bathroom Cleaning, Laundry", "Amit Shah", "Khar West, Mumbai", "15 May 2025, 02:00 PM • 1.5 hours", 199, "Completed"),
        Booking("Kitchen Cleaning", "Kavya Menon", "Santacruz West, Mumbai", "14 May 2025, 04:00 PM", 199, "Cancelled"),
    )

    val earnings = mutableStateListOf(
        EarningEntry("16 May 2025", 650),
        EarningEntry("15 May 2025", 810),
        EarningEntry("14 May 2025", 540),
        EarningEntry("13 May 2025", 620),
        EarningEntry("12 May 2025", 430),
        EarningEntry("11 May 2025", 590),
        EarningEntry("10 May 2025", 710),
    )

    val walletTxns = mutableStateListOf(
        WalletTxn("Job Payment", "16 May 2025, 11:00 AM", 297, "Success", true),
        WalletTxn("Withdraw to Bank", "A/c No. xxxx1234", 2700, "Success", false),
        WalletTxn("Job Payment", "12 May 2025, 06:30 PM", 349, "Success", true),
        WalletTxn("Incentive", "Performance Bonus", 50, "Success", true),
        WalletTxn("Pending Amount", "16 May 2025, 05:00 PM", 1200, "Pending", true),
    )
}
