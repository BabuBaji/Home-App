package com.homehelp.pro.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT

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

    @POST("api/worker/jobs/verify-otp")
    suspend fun verifyOtp(@Body body: OtpBody): StatusResponse

    @POST("api/worker/jobs/end")
    suspend fun endService(@Body body: EndBody): StatusResponse

    @POST("api/worker/jobs/settle")
    suspend fun settle(): SettleResponse

    @POST("api/worker/jobs/cancel")
    suspend fun cancel(@Body body: ReasonBody): StatusResponse

    // ---- wallet ----
    @POST("api/worker/wallet/withdraw")
    suspend fun withdraw(@Body body: AmountBody): WalletOpResponse

    @POST("api/worker/wallet/add")
    suspend fun addMoney(@Body body: AmountBody): WalletOpResponse
}
