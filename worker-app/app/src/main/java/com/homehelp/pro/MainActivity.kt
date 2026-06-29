package com.homehelp.pro

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CurrencyRupee
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // osmdroid requires a unique user-agent or OSM tile servers return 403.
        org.osmdroid.config.Configuration.getInstance().userAgentValue = packageName
        setContent {
            HomeHelpTheme {
                AppRoot()
            }
        }
    }
}

object Routes {
    const val LOGIN = "login"
    const val HOME = "home"
    const val BOOKINGS = "bookings"
    const val EARNINGS = "earnings"
    const val WALLET = "wallet"
    const val WITHDRAW = "wallet_withdraw"
    const val SALARY_ADVANCE = "wallet_advance"
    const val WALLET_HISTORY = "wallet_history"
    const val EARNINGS_BREAKUP = "wallet_breakup"
    const val DEDUCTIONS = "wallet_deductions"
    const val PAYSLIP = "wallet_payslip"
    const val WITHDRAW_RECEIPT = "wallet_receipt"
    const val PROFILE = "profile"
    const val NEW_JOB = "newjob"
    const val JOB_DETAILS = "jobdetails"
    const val ON_THE_WAY = "ontheway"
    const val HYDERABAD_MAP = "hyderabad_map"
    const val START_SERVICE = "startservice"
    const val IN_PROGRESS = "inprogress"
    const val JOB_COMPLETED = "jobcompleted"
    const val P_PERSONAL = "profile_personal"
    const val P_DOCUMENTS = "profile_documents"
    const val P_BANK = "profile_bank"
    const val P_AVAILABILITY = "profile_availability"
    const val P_PREFERENCES = "profile_preferences"
    const val P_NOTIFICATIONS = "profile_notifications"
    const val P_HELP = "profile_help"
    const val P_ABOUT = "profile_about"
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    Tab(Routes.HOME, "Home", Icons.Filled.Home),
    Tab(Routes.BOOKINGS, "Bookings", Icons.Filled.CalendarMonth),
    Tab(Routes.EARNINGS, "Earnings", Icons.Filled.CurrencyRupee),
    Tab(Routes.WALLET, "Wallet", Icons.Filled.AccountBalanceWallet),
    Tab(Routes.PROFILE, "Profile", Icons.Filled.Person),
)

@Composable
fun AppRoot() {
    val vm: AppViewModel = viewModel()
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val showBottomBar = route in tabs.map { it.route }

    Scaffold(
        containerColor = ScreenBg,
        bottomBar = { if (showBottomBar) BottomBar(nav, route) },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = Routes.LOGIN,
            modifier = Modifier.padding(padding).background(ScreenBg),
        ) {
            composable(Routes.LOGIN) { LoginScreen(vm, nav) }
            composable(Routes.HOME) { HomeScreen(vm, nav) }
            composable(Routes.BOOKINGS) { BookingsScreen(vm) }
            composable(Routes.EARNINGS) { EarningsScreen(vm) }
            composable(Routes.WALLET) { WalletScreen(vm, nav) }
            composable(Routes.WITHDRAW) { WithdrawScreen(vm, nav) }
            composable(Routes.SALARY_ADVANCE) { SalaryAdvanceScreen(vm, nav) }
            composable(Routes.WALLET_HISTORY) { WalletHistoryScreen(vm, nav) }
            composable(Routes.EARNINGS_BREAKUP) { EarningsBreakupScreen(vm, nav) }
            composable(Routes.DEDUCTIONS) { DeductionsScreen(vm, nav) }
            composable(Routes.PAYSLIP) { PayslipScreen(vm, nav) }
            composable(
                route = "${Routes.WITHDRAW_RECEIPT}/{id}",
                arguments = listOf(navArgument("id") { type = NavType.IntType }),
            ) { back -> WithdrawalReceiptScreen(vm, nav, back.arguments?.getInt("id") ?: 0) }
            composable(Routes.PROFILE) { ProfileScreen(vm, nav) }
            composable(Routes.NEW_JOB) { NewJobScreen(vm, nav) }
            composable(Routes.JOB_DETAILS) { JobDetailsScreen(vm, nav) }
            composable(Routes.ON_THE_WAY) { OnTheWayScreen(vm, nav) }
            composable(Routes.HYDERABAD_MAP) { HyderabadMapScreen(nav) }
            composable(Routes.START_SERVICE) { StartServiceScreen(vm, nav) }
            composable(Routes.IN_PROGRESS) { InProgressScreen(vm, nav) }
            composable(Routes.JOB_COMPLETED) { JobCompletedScreen(vm, nav) }
            composable(Routes.P_PERSONAL) { PersonalInfoScreen(vm, nav) }
            composable(Routes.P_DOCUMENTS) { DocumentsScreen(vm, nav) }
            composable(Routes.P_BANK) { BankDetailsScreen(vm, nav) }
            composable(Routes.P_AVAILABILITY) { AvailabilityScreen(vm, nav) }
            composable(Routes.P_PREFERENCES) { PreferencesScreen(vm, nav) }
            composable(Routes.P_NOTIFICATIONS) { NotificationsScreen(vm, nav) }
            composable(Routes.P_HELP) { HelpSupportScreen(nav) }
            composable(Routes.P_ABOUT) { AboutScreen(nav) }
        }
    }
}

@Composable
private fun BottomBar(nav: NavHostController, current: String?) {
  androidx.compose.foundation.layout.Column {
    HairlineDivider()
    NavigationBar(containerColor = Color.White) {
        tabs.forEach { tab ->
            NavigationBarItem(
                selected = current == tab.route,
                onClick = {
                    if (current != tab.route) {
                        nav.navigate(tab.route) {
                            popUpTo(Routes.HOME) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                },
                icon = { Icon(tab.icon, contentDescription = tab.label) },
                label = { Text(tab.label) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = Purple,
                    selectedTextColor = Purple,
                    indicatorColor = PurpleLight,
                    unselectedIconColor = TextGray,
                    unselectedTextColor = TextGray,
                ),
            )
        }
    }
  }
}
