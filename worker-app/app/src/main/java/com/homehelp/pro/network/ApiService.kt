package com.homehelp.pro.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

interface ApiService {
    @GET("api/worker/health")
    suspend fun health(): Map<String, Any>

    @POST("api/worker/auth/request-otp")
    suspend fun requestOtp(@Body body: AuthRequest): Map<String, Any>

    @POST("api/worker/auth/verify")
    suspend fun verify(@Body body: AuthRequest): BootstrapResponse

    @GET("api/worker/bootstrap")
    suspend fun bootstrap(): BootstrapResponse

    // ---- worker profile ----
    @PUT("api/worker/profile")
    suspend fun updateProfile(@Body body: ProfileBody): WorkerDto

    @PUT("api/worker/bank")
    suspend fun updateBank(@Body body: BankBody): WorkerDto

    @PUT("api/worker/availability")
    suspend fun updateAvailability(@Body body: AvailabilityBody): WorkerDto

    @PUT("api/worker/preferences")
    suspend fun updatePreferences(@Body body: PreferencesBody): WorkerDto

    @PUT("api/worker/notifications")
    suspend fun updateNotifications(@Body body: NotificationsBody): WorkerDto

    @GET("api/worker/documents")
    suspend fun getDocuments(): List<DocumentDto>

    @POST("api/worker/documents/upload")
    suspend fun uploadDocument(@Body body: UploadDocBody): DocumentsResponse

    // ---- job lifecycle ----
    @GET("api/worker/jobs/available")
    suspend fun jobsAvailable(): Map<String, Any>

    @POST("api/worker/jobs/request")
    suspend fun requestJob(): RequestJobResponse

    @POST("api/worker/jobs/accept")
    suspend fun acceptJob(): StatusResponse

    @POST("api/worker/jobs/reject")
    suspend fun rejectJob(): StatusResponse

    @POST("api/worker/jobs/on-the-way")
    suspend fun onTheWay(): StatusResponse

    @POST("api/worker/jobs/arrived")
    suspend fun arrived(): StatusResponse

    @POST("api/worker/jobs/location")
    suspend fun reportLocation(@Body body: LatLngBody): StatusResponse

    @POST("api/worker/jobs/verify-otp")
    suspend fun verifyOtp(@Body body: OtpBody): StatusResponse

    @POST("api/worker/jobs/end")
    suspend fun endService(@Body body: EndBody): StatusResponse

    @POST("api/worker/jobs/settle")
    suspend fun settle(): SettleResponse

    @POST("api/worker/jobs/cancel")
    suspend fun cancel(@Body body: ReasonBody): StatusResponse

    // ---- wallet (legacy quick ops) ----
    @POST("api/worker/wallet/withdraw")
    suspend fun withdraw(@Body body: AmountBody): WalletOpResponse

    @POST("api/worker/wallet/add")
    suspend fun addMoney(@Body body: AmountBody): WalletOpResponse

    // ---- wallet module ----
    @GET("api/worker/wallet/state")
    suspend fun walletState(): WalletStateResponse

    @GET("api/worker/wallet/summary")
    suspend fun walletSummary(): WalletSummaryDto

    @GET("api/worker/wallet/earnings-breakup")
    suspend fun earningsBreakup(): List<BreakupItem>

    @GET("api/worker/wallet/deductions")
    suspend fun deductions(): DeductionsDto

    @GET("api/worker/wallet/history")
    suspend fun walletHistory(): List<LedgerEntry>

    @GET("api/worker/wallet/withdrawals")
    suspend fun withdrawals(): List<WithdrawalEntry>

    @GET("api/worker/wallet/withdrawals/{id}/receipt")
    suspend fun withdrawalReceipt(@Path("id") id: Int): WithdrawalReceiptDto

    @GET("api/worker/wallet/advances")
    suspend fun advances(): List<AdvanceEntry>

    @POST("api/worker/wallet/withdraw/request-otp")
    suspend fun requestWithdrawOtp(): OtpResponse

    @POST("api/worker/wallet/withdraw/request")
    suspend fun requestWithdrawal(@Body body: WithdrawBody): WalletStateResponse

    @GET("api/worker/wallet/advance/eligibility")
    suspend fun advanceEligibility(): AdvanceEligibilityDto

    @POST("api/worker/wallet/advance/request")
    suspend fun requestAdvance(@Body body: AdvanceBody): WalletStateResponse

    @GET("api/worker/wallet/payslip")
    suspend fun payslip(): PayslipDto

    @GET("api/worker/wallet/notifications")
    suspend fun walletNotifications(): NotificationsResponse

    @POST("api/worker/wallet/notifications/read")
    suspend fun markNotificationsRead(): NotificationsResponse
}
