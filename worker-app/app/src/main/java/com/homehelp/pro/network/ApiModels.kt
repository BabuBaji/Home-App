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
    val shiftStart: String = "",
    val shiftEnd: String = "",
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

/** Full app state returned by /auth/verify and /bootstrap. */
data class BootstrapResponse(
    val token: String? = null,
    val worker: WorkerDto? = null,
    val wallet: WalletDto? = null,
    val jobStatus: String? = null,
    val activeJob: Job? = null,
    val bookings: List<Booking> = emptyList(),
    val earnings: List<EarningEntry> = emptyList(),
    val walletTxns: List<WalletTxn> = emptyList(),
    val documents: List<DocumentDto> = emptyList(),
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

// ---- request bodies ----
data class AuthRequest(val phone: String, val otp: String? = null)
data class OtpBody(val otp: String)
data class EndBody(val photo: String? = null)
data class AmountBody(val amount: Int)
data class ReasonBody(val reason: String)
data class ProfileBody(val name: String, val phone: String, val email: String, val city: String)
data class UploadDocBody(val name: String, val fileName: String)
data class BankBody(val bankHolder: String, val bankName: String, val bankAccount: String, val bankIfsc: String)
data class AvailabilityBody(val availableDays: Map<String, Boolean>, val shiftStart: String, val shiftEnd: String)
data class PreferencesBody(val jobPreferences: Map<String, Boolean>)
data class NotificationsBody(
    val notifNewJobs: Boolean,
    val notifPayments: Boolean,
    val notifPromotions: Boolean,
    val notifRatings: Boolean,
)
