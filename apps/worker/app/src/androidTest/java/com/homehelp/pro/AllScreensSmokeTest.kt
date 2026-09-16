package com.homehelp.pro

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.printToString
import androidx.navigation.compose.rememberNavController
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Every navigable screen in the worker app, composed once each.
 *
 * Generated from the NavHost graph in MainActivity.kt, so it covers the real destination list
 * rather than a hand-picked subset. The bar is "composes without throwing": screens legitimately
 * render empty when there is no active job or no loaded data (they guard on null rather than
 * crashing), so asserting on content here would test the fixture, not the app. Any exception
 * during composition or layout propagates out of setContent/waitForIdle and fails the test.
 *
 * Run with a device/emulator attached:
 *   cd apps/worker && ./gradlew.bat connectedDebugAndroidTest
 */
@RunWith(AndroidJUnit4::class)
class AllScreensSmokeTest {

    @get:Rule
    val rule = createComposeRule()

    /*
     * NOTE — AttendanceScreen requests ACCESS_FINE_LOCATION from a LaunchedEffect the moment it
     * composes (check-in is geo-stamped). If the permission is not already held, the system
     * dialog takes over the window and the Compose rule reports "No compose hierarchies found"
     * — a harness artifact, not a defect.
     *
     * GrantPermissionRule is NOT used here: on this ColorOS device its internal `pm grant` fails
     * with "Failed to grant permissions", which broke every test in the class rather than one.
     * Grant it from the host before running instead:
     *
     *   adb shell pm grant com.homehelp.pro android.permission.ACCESS_FINE_LOCATION
     */

    private fun composes(content: @Composable () -> Unit) {
        rule.setContent { content() }
        rule.waitForIdle()
        rule.onRoot().printToString(maxDepth = 3)
    }

    @Test
    fun loginScreen_composes() {
        composes { LoginScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun homeScreen_composes() {
        composes { HomeScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun bookingsScreen_composes() {
        composes { BookingsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun scheduleScreen_composes() {
        composes { ScheduleScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun attendanceScreen_composes() {
        composes { AttendanceScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun leaveScreen_composes() {
        composes { LeaveScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun performanceScreen_composes() {
        composes { PerformanceScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun earningsScreen_composes() {
        composes { EarningsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun walletDashboardScreen_composes() {
        composes { WalletDashboardScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun withdrawMoneyScreen_composes() {
        composes { WithdrawMoneyScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun withdrawPinScreen_composes() {
        composes { WithdrawPinScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun confirmWithdrawalScreen_composes() {
        composes { ConfirmWithdrawalScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun withdrawalSuccessScreen_composes() {
        composes { WithdrawalSuccessScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun withdrawalHistoryScreen_composes() {
        composes { WithdrawalHistoryScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun walletPinSetScreen_composes() {
        composes { WalletPinSetScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun bankAccountsScreen_composes() {
        composes { BankAccountsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun addBankAccountScreen_composes() {
        composes { AddBankAccountScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun manageBankAccountScreen_composes() {
        composes { ManageBankAccountScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun payoutSettingsScreen_composes() {
        composes { PayoutSettingsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun payoutScheduleScreen_composes() {
        composes { PayoutScheduleScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun walletHelpScreen_composes() {
        composes { WalletHelpScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun salaryAdvanceScreen_composes() {
        composes { SalaryAdvanceScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun walletHistoryScreen_composes() {
        composes { WalletHistoryScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun transactionsScreen_composes() {
        composes { TransactionsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun transactionDetailScreen_composes() {
        composes { TransactionDetailScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun earningsBreakupScreen_composes() {
        composes { EarningsBreakupScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun earningsBreakdownScreen_composes() {
        composes { EarningsBreakdownScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun earningsAnalyticsScreen_composes() {
        composes { EarningsAnalyticsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun incentiveProgressScreen_composes() {
        composes { IncentiveProgressScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun incentiveHistoryScreen_composes() {
        composes { IncentiveHistoryScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun monthlyTrendScreen_composes() {
        composes { MonthlyTrendScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun myShiftsScreen_composes() {
        composes { MyShiftsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun deductionsScreen_composes() {
        composes { DeductionsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun payslipScreen_composes() {
        composes { PayslipScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun profileScreen_composes() {
        composes { ProfileScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun newJobScreen_composes() {
        composes { NewJobScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun jobDetailsScreen_composes() {
        composes { JobDetailsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun onTheWayScreen_composes() {
        composes { OnTheWayScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun arrivedScreen_composes() {
        composes { ArrivedScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun startServiceScreen_composes() {
        composes { StartServiceScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun inProgressScreen_composes() {
        composes { InProgressScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun jobCompletedScreen_composes() {
        composes { JobCompletedScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun jobChatScreen_composes() {
        composes { JobChatScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun addExtraServiceScreen_composes() {
        composes { AddExtraServiceScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun beforePhotosScreen_composes() {
        composes { BeforePhotosScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun afterPhotosScreen_composes() {
        composes { AfterPhotosScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun customerSignScreen_composes() {
        composes { CustomerSignScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun personalInfoScreen_composes() {
        composes { PersonalInfoScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun documentsScreen_composes() {
        composes { DocumentsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun skillsScreen_composes() {
        composes { SkillsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun trainingScreen_composes() {
        composes { TrainingScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun equipmentScreen_composes() {
        composes { EquipmentScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun onboardingScreen_composes() {
        composes { OnboardingScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun bankDetailsScreen_composes() {
        composes { BankDetailsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun availabilityScreen_composes() {
        composes { AvailabilityScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun preferencesScreen_composes() {
        composes { PreferencesScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun notificationsScreen_composes() {
        composes { NotificationsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun commPreferencesScreen_composes() {
        composes { CommPreferencesScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun helpSupportScreen_composes() {
        composes { HelpSupportScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun rateCardScreen_composes() {
        composes { RateCardScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun referEarnScreen_composes() {
        composes { ReferEarnScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun claimInsuranceScreen_composes() {
        composes { ClaimInsuranceScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun merchStoreScreen_composes() {
        composes { MerchStoreScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun rewardsScreen_composes() {
        composes { RewardsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun shaktiBonusScreen_composes() {
        composes { ShaktiBonusScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun settingsScreen_composes() {
        composes { SettingsScreen(AppViewModel(), rememberNavController()) }
    }

    @Test
    fun hyderabadMapScreen_composes() {
        composes { HyderabadMapScreen(rememberNavController()) }
    }

    @Test
    fun aboutScreen_composes() {
        composes { AboutScreen(rememberNavController()) }
    }
}
