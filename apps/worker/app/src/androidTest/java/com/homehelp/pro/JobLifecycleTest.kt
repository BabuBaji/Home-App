package com.homehelp.pro

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The job state machine on the money path: NONE -> ACCEPTED -> ON_THE_WAY -> ARRIVED ->
 * IN_PROGRESS (only via the customer's OTP) -> COMPLETED.
 *
 * [otpStart_refusedWithoutAnActiveJob] pins the client-side half of the OTP gate. An end-to-end
 * run on 2026-09-09 showed the BACKEND does not enforce the other half: POST
 * /api/worker/jobs/end completes an 'arrived' booking and settles the wallet with no OTP at all.
 * The server-side guard belongs in the /jobs/end handler in services/dispatch/server.js.
 */
@RunWith(AndroidJUnit4::class)
class JobLifecycleTest {

    @get:Rule
    val rule = createComposeRule()

    @Test
    fun statuses_progressInOrder() {
        val order = listOf(
            JobStatus.NONE, JobStatus.REQUESTED, JobStatus.ACCEPTED, JobStatus.ON_THE_WAY,
            JobStatus.ARRIVED, JobStatus.IN_PROGRESS, JobStatus.COMPLETED,
        )
        // Screens and the backend both branch on this ordering, so reordering the enum silently
        // changes which screen a live job lands on.
        val ordinals = order.map { it.ordinal }
        assertEquals(ordinals.sorted(), ordinals)
    }

    @Test
    fun inProgress_sitsAfterArrived_soArrivingIsNotStarting() {
        assertTrue(
            "ARRIVED must precede IN_PROGRESS — arriving is not the same as starting",
            JobStatus.ARRIVED.ordinal < JobStatus.IN_PROGRESS.ordinal,
        )
        assertTrue(
            "COMPLETED must follow IN_PROGRESS — a job cannot finish before it starts",
            JobStatus.IN_PROGRESS.ordinal < JobStatus.COMPLETED.ordinal,
        )
    }

    @Test
    fun freshViewModel_hasNoActiveJob() {
        val v = AppViewModel()
        assertEquals(JobStatus.NONE, v.jobStatus)
        assertEquals(null, v.activeJob)
        assertEquals(false, v.isLoggedIn)
        assertEquals(false, v.isOnline)
    }

    @Test
    fun goOnline_flipsAvailability() {
        val v = AppViewModel()
        v.goOnline(true, pushState = false)
        assertEquals("going online must set availability", true, v.isOnline)
        v.goOnline(false, pushState = false)
        assertEquals("going offline with no job must clear availability", false, v.isOnline)
    }

    @Test
    fun otpStart_refusedWithoutAnActiveJob() {
        val v = AppViewModel()
        var error: String? = null
        v.verifyOtpAndStart("1234") { e -> error = e }
        rule.waitForIdle()
        // No job => the OTP path must refuse and must never move the state machine.
        assertNotNull("an OTP with no active job must report an error", error)
        assertNotEquals(JobStatus.IN_PROGRESS, v.jobStatus)
        assertEquals(JobStatus.NONE, v.jobStatus)
    }

    @Test
    fun blankOtp_neverStartsAJob() {
        val v = AppViewModel()
        var error: String? = null
        v.verifyOtpAndStart("") { e -> error = e }
        rule.waitForIdle()
        assertNotNull("a blank OTP must be refused", error)
        assertNotEquals(JobStatus.IN_PROGRESS, v.jobStatus)
    }
}
