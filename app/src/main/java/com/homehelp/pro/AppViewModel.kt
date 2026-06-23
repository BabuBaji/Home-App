package com.homehelp.pro

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel

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

class AppViewModel : ViewModel() {

    var isLoggedIn by mutableStateOf(false)
        private set
    var isOnline by mutableStateOf(false)
    var jobStatus by mutableStateOf(JobStatus.NONE)
        private set
    var activeJob by mutableStateOf<Job?>(null)
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

    // A rotating pool of incoming jobs so the workflow feels real on repeat runs.
    private val jobPool = listOf(
        Job("JOB1201", "Priya Sharma", "PS", "+91 98765 43210", 4.7,
            listOf("Utensil Wash", "Mopping", "Dusting"), "16 May 2025, 09:00 AM", 2,
            "221B, Baker Street, Bandra West, Mumbai - 400050", "Bandra West, Mumbai", 1.8, 297, "4721"),
        Job("JOB1202", "Rohan Verma", "RV", "+91 99203 11882", 4.5,
            listOf("Bathroom Cleaning", "Laundry"), "16 May 2025, 11:30 AM", 2,
            "14, Lokhandwala Complex, Andheri West, Mumbai - 400053", "Andheri West, Mumbai", 2.3, 349, "5630"),
        Job("JOB1203", "Sneha Iyer", "SI", "+91 98191 55470", 4.8,
            listOf("Sweeping", "Mopping", "Dusting"), "16 May 2025, 02:00 PM", 2,
            "Hill Road, Bandra West, Mumbai - 400050", "Bandra West, Mumbai", 2.0, 249, "8125"),
        Job("JOB1204", "Arjun Nair", "AN", "+91 90045 77310", 4.6,
            listOf("Kitchen Cleaning", "Utensil Wash"), "16 May 2025, 04:30 PM", 3,
            "Hiranandani Gardens, Powai, Mumbai - 400076", "Powai, Mumbai", 3.1, 399, "6204"),
    )
    private var jobIndex by mutableIntStateOf(0)

    // ---- lifecycle transitions ----
    fun login() { isLoggedIn = true }

    fun goOnline(v: Boolean) { isOnline = v }

    fun requestJob() {
        activeJob = jobPool[jobIndex % jobPool.size]
        jobIndex++
        jobStatus = JobStatus.REQUESTED
    }

    fun acceptJob() { jobStatus = JobStatus.ACCEPTED }

    fun rejectJob() {
        activeJob = null
        jobStatus = JobStatus.NONE
    }

    fun startOnTheWay() { jobStatus = JobStatus.ON_THE_WAY }

    fun markArrived() { jobStatus = JobStatus.ARRIVED }

    /** OTP-gated start. Returns true if the OTP matches and service begins. */
    fun verifyOtpAndStart(input: String): Boolean {
        val job = activeJob ?: return false
        return if (input == job.otp) {
            jobStatus = JobStatus.IN_PROGRESS
            true
        } else false
    }

    fun endService() { jobStatus = JobStatus.COMPLETED }

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
    }

    fun cancelJobWithReason(reason: String) {
        val job = activeJob
        if (job != null) {
            bookings.add(0, Booking(job.services.joinToString(", "), job.customerName, job.area,
                "${job.dateTime} • $reason", job.earnings, "Cancelled"))
        }
        activeJob = null
        jobStatus = JobStatus.NONE
    }

    // ---- wallet operations ----
    /** Returns null on success, or an error message. */
    fun withdraw(amount: Int): String? {
        if (amount <= 0) return "Enter a valid amount"
        if (amount > walletBalance) return "Amount exceeds available balance"
        walletBalance -= amount
        withdrawnTotal += amount
        walletTxns.add(0, WalletTxn("Withdraw to Bank", "A/c No. xxxx1234", amount, "Success", false))
        return null
    }

    fun addMoney(amount: Int): String? {
        if (amount <= 0) return "Enter a valid amount"
        walletBalance += amount
        walletTxns.add(0, WalletTxn("Added to Wallet", "UPI • Instant", amount, "Success", true))
        return null
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
