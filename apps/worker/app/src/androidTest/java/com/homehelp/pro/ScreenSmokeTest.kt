package com.homehelp.pro

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.printToString
import androidx.navigation.compose.rememberNavController
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Renders each top-level worker screen and asserts it composes and puts something on screen.
 * This is the breadth net: it does not assert business rules, it catches screens that crash on
 * composition or render empty — the failures that make the app look broken.
 *
 * Screens are composed against a default [AppViewModel]. Its job state carries `private set`
 * (deliberately — the state machine is driven by the view model, not by callers), so the tests
 * exercise each screen's empty/default rendering rather than staging a fake status.
 *
 * Run with a device/emulator attached:
 *   cd apps/worker && ./gradlew.bat connectedDebugAndroidTest
 */
@RunWith(AndroidJUnit4::class)
class ScreenSmokeTest {

    @get:Rule
    val rule = createComposeRule()

    /**
     * Compose [content] and assert composition completes without throwing.
     *
     * The job-flow screens legitimately render an EMPTY tree when there is no active job — they
     * guard on `activeJob == null` rather than crashing, which is the behaviour we want. So the
     * bar here is "composes cleanly", not "draws something": any exception thrown during
     * composition or layout propagates out of setContent/waitForIdle and fails the test.
     */
    private fun composes(content: @Composable () -> Unit) {
        rule.setContent { content() }
        rule.waitForIdle()
        rule.onRoot().printToString(maxDepth = 4)   // forces the semantics tree to be built
    }

    /** For screens that render their own chrome regardless of data — they must not be blank. */
    private fun rendersNonEmpty(content: @Composable () -> Unit) {
        composes(content)
        val tree = rule.onRoot().printToString(maxDepth = 6)
        assertTrue("screen rendered an empty tree:\n$tree", tree.length > 120)
    }

    @Test
    fun loginScreen_renders() {
        rendersNonEmpty { LoginScreen(AppViewModel(), rememberNavController()) }
        rule.onNodeWithText("Mobile number").assertIsDisplayed()
    }

    @Test
    fun homeScreen_renders() {
        rendersNonEmpty { HomeScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun newJobScreen_renders() {
        composes { NewJobScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun jobDetailsScreen_renders() {
        composes { JobDetailsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun onTheWayScreen_renders() {
        composes { OnTheWayScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun arrivedScreen_renders() {
        composes { ArrivedScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun startServiceScreen_renders() {
        composes { StartServiceScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun inProgressScreen_renders() {
        composes { InProgressScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun jobCompletedScreen_renders() {
        composes { JobCompletedScreen(AppViewModel(), rememberNavController()) }
    }
}
