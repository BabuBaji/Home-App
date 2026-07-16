package com.homehelp.pro.network

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
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

    @GET("api/worker/ifsc/{code}")
    suspend fun ifscLookup(@Path("code") code: String): IfscDto

    @POST("api/worker/heartbeat")
    suspend fun heartbeat(@Body body: HeartbeatBody): Map<String, Any>

    @PUT("api/worker/availability")
    suspend fun updateAvailability(@Body body: AvailabilityBody): WorkerDto

    @POST("api/worker/attendance/checkin")
    suspend fun checkIn(@Body body: AttendanceBody): AttendanceDto

    @POST("api/worker/attendance/checkout")
    suspend fun checkOut(@Body body: AttendanceBody): AttendanceDto

    @GET("api/worker/shifts")
    suspend fun getShifts(): ShiftInfo

    @POST("api/worker/shift")
    suspend fun selectShift(@Body body: SelectShiftBody): AttendanceDto

    @POST("api/worker/geofence/report")
    suspend fun reportGeofence(@Body body: GeofenceReportBody): GeofenceStatus

    @POST("api/worker/status")
    suspend fun setStatus(@Body body: StatusBody): WorkerDto

    @GET("api/worker/leave")
    suspend fun getLeaves(): List<LeaveItem>

    @POST("api/worker/leave")
    suspend fun requestLeave(@Body body: LeaveBody): List<LeaveItem>

    @GET("api/worker/support")
    suspend fun getSupport(): List<TicketItem>

    @POST("api/worker/support")
    suspend fun raiseTicket(@Body body: TicketBody): List<TicketItem>

    @POST("api/worker/sos")
    suspend fun sos(@Body body: SosBody): SosResponse

    @PUT("api/worker/preferences")
    suspend fun updatePreferences(@Body body: PreferencesBody): WorkerDto

    @PUT("api/worker/notifications")
    suspend fun updateNotifications(@Body body: NotificationsBody): WorkerDto

    @GET("api/worker/documents")
    suspend fun getDocuments(): List<DocumentDto>

    // Multipart: the file's actual BYTES go up, not just its name. `name` identifies which KYC
    // document this is (Aadhaar Card, PAN Card…); `fileName` is only a display label.
    @Multipart
    @POST("api/worker/documents/upload")
    suspend fun uploadDocument(
        @Part("name") name: RequestBody,
        @Part("fileName") fileName: RequestBody,
        @Part file: MultipartBody.Part,
    ): DocumentsResponse

    @GET("api/worker/documents/{id}/url")
    suspend fun documentUrl(@Path("id") id: Int): SignedUrlResponse

    @GET("api/worker/documents/types")
    suspend fun documentTypes(): DocTypesResponse

    /* Phase 6 — service skills */
    @GET("api/worker/services")
    suspend fun serviceCatalogue(): ServicesResponse

    @GET("api/worker/skills")
    suspend fun getSkills(): SkillsResponse

    @PUT("api/worker/skills")
    suspend fun saveSkills(@Body body: SkillsBody): SkillsResponse

    @Multipart
    @POST("api/worker/skills/certificate")
    suspend fun uploadSkillCertificate(@Part("service") service: RequestBody, @Part file: MultipartBody.Part): SkillsResponse

    /* Phase 7 — training & assessment */
    @GET("api/worker/training")
    suspend fun getTraining(): TrainingResponse

    @POST("api/worker/training/{id}/complete")
    suspend fun completeModule(@Path("id") id: Int): TrainingResponse

    @GET("api/worker/training/quiz")
    suspend fun getQuizPaper(): QuizPaperResponse

    @POST("api/worker/training/quiz")
    suspend fun submitQuiz(@Body body: QuizSubmitBody): QuizResultResponse

    /* Phase 9 — equipment issued to me (read-only) */
    @GET("api/worker/equipment")
    suspend fun getEquipment(): EquipmentResponse

    // Profile photo. Public bucket (customers see it), so the DTO carries a stable URL.
    @Multipart
    @POST("api/worker/profile/photo")
    suspend fun uploadProfilePhoto(@Part file: MultipartBody.Part): WorkerDto

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

    // ---- in-service job state (checklist · photos · extras · pause · chat) ----
    @GET("api/worker/wallet/analytics")
    suspend fun walletAnalytics(): WalletAnalyticsResponse

    @GET("api/worker/jobs/state")
    suspend fun jobState(): JobStateResponse

    @POST("api/worker/jobs/checklist")
    suspend fun saveChecklist(@Body body: ChecklistBody): JobStateResponse

    @POST("api/worker/jobs/photos")
    suspend fun addJobPhoto(@Body body: PhotoBody): JobStateResponse

    @POST("api/worker/jobs/photos/remove")
    suspend fun removeJobPhoto(@Body body: PhotoRemoveBody): JobStateResponse

    @POST("api/worker/jobs/notes")
    suspend fun saveJobNotes(@Body body: NotesBody): JobStateResponse

    @POST("api/worker/jobs/signature")
    suspend fun saveSignature(@Body body: SignatureBody): JobStateResponse

    @POST("api/worker/jobs/extras")
    suspend fun addExtra(@Body body: ExtraBody): JobStateResponse

    @POST("api/worker/jobs/extras/remove")
    suspend fun removeExtra(@Body body: ExtraRemoveBody): JobStateResponse

    @POST("api/worker/jobs/pause")
    suspend fun pauseJob(@Body body: PauseBody): JobStateResponse

    @POST("api/worker/jobs/resume")
    suspend fun resumeJob(): JobStateResponse

    @GET("api/worker/jobs/messages")
    suspend fun jobMessages(): MessagesResponse

    @POST("api/worker/jobs/messages")
    suspend fun sendJobMessage(@Body body: MessageBody): StatusResponse

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

    @GET("api/worker/wallet/rewards")
    suspend fun walletRewards(): RewardsDto

    // ---- refer & earn / insurance / merch ----
    @GET("api/worker/referral")
    suspend fun referral(): ReferralDto

    @GET("api/worker/insurance")
    suspend fun insurance(): InsuranceDto

    @POST("api/worker/insurance/claim")
    suspend fun claimInsurance(@Body body: ClaimBody): SimpleResult

    @GET("api/worker/shakti-bonus")
    suspend fun shaktiBonus(): ShaktiBonusDto

    @GET("api/worker/merch")
    suspend fun merch(): MerchResponse

    @POST("api/worker/merch/order")
    suspend fun orderMerch(@Body body: MerchOrderBody): SimpleResult

    @GET("api/worker/wallet/notifications")
    suspend fun walletNotifications(): NotificationsResponse

    @POST("api/worker/wallet/notifications/read")
    suspend fun markNotificationsRead(): NotificationsResponse
}
