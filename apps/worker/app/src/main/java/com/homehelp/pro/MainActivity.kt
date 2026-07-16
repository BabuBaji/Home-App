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
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Restore any persisted login so the worker stays signed in across app restarts.
        Session.init(applicationContext)
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
    const val SCHEDULE = "schedule"
    const val ATTENDANCE = "attendance"
    const val LEAVE = "leave"
    const val PERFORMANCE = "performance"
    const val SETTINGS = "settings"
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
    const val JOB_CHAT = "jobchat"
    const val JOB_EXTRAS = "jobextras"
    const val BEFORE_PHOTOS = "beforephotos"
    const val AFTER_PHOTOS = "afterphotos"
    const val CUSTOMER_SIGN = "customersign"
    const val P_PERSONAL = "profile_personal"
    const val P_DOCUMENTS = "profile_documents"
    const val P_BANK = "profile_bank"
    const val P_SKILLS = "profile_skills"
    const val P_TRAINING = "profile_training"
    const val P_AVAILABILITY = "profile_availability"
    const val P_PREFERENCES = "profile_preferences"
    const val P_NOTIFICATIONS = "profile_notifications"
    const val P_HELP = "profile_help"
    const val P_ABOUT = "profile_about"
    const val RATE_CARD = "ratecard"
    const val REFER = "refer"
    const val INSURANCE = "insurance"
    const val MERCH = "merch"
    const val REWARDS = "rewards"
    const val LANGUAGE = "language"
    const val SHAKTI = "shakti"
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    Tab(Routes.HOME, "Home", Icons.Filled.Home),
    Tab(Routes.BOOKINGS, "Bookings", Icons.Filled.CalendarMonth),
    Tab(Routes.EARNINGS, "Earnings", Icons.Filled.CurrencyRupee),
    Tab(Routes.WALLET, "Wallet", Icons.Filled.AccountBalanceWallet),
    Tab(Routes.PROFILE, "Profile", Icons.Filled.Person),
)

val TAB_ROUTES = setOf(Routes.HOME, Routes.BOOKINGS, Routes.EARNINGS, Routes.WALLET, Routes.PROFILE)

/**
 * Navigate to a destination. For the five bottom-nav tabs, use the SAME single-top /
 * save-and-restore-state options the bottom bar uses — so reaching a tab from anywhere (e.g. the
 * drawer's "Monthly Earnings") keeps the back stack consistent and tapping Home afterwards works.
 * Detail screens are pushed normally.
 */
fun NavHostController.navigateApp(route: String) {
    if (route in TAB_ROUTES) {
        navigate(route) {
            popUpTo(Routes.HOME) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    } else {
        navigate(route)
    }
}

@Composable
fun AppRoot() {
    val vm: AppViewModel = viewModel()
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route

    // Resume a saved session once per launch so a logged-in worker isn't sent to Login.
    androidx.compose.runtime.LaunchedEffect(Unit) { if (Session.isLoggedIn) vm.restoreSession() }
    // Re-pull backend data every time the app comes to the foreground, so a completed job /
    // updated earnings appear immediately instead of only after a full relaunch.
    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    val hbCtx = androidx.compose.ui.platform.LocalContext.current
    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val obs = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                vm.refresh()
                val (batt, net) = readDeviceState(hbCtx)
                val loc = lastKnownLoc(hbCtx)
                vm.sendHeartbeat(batt, net, loc?.first, loc?.second)
            }
        }
        lifecycleOwner.lifecycle.addObserver(obs)
        onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
    }
    val startDestination = if (Session.isLoggedIn) Routes.HOME else Routes.LOGIN

    // App-wide side drawer, reachable via the ☰ menu on every screen's header.
    val drawerState = androidx.compose.material3.rememberDrawerState(androidx.compose.material3.DrawerValue.Closed)
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val drawerReady = route != null && route != Routes.LOGIN

    androidx.compose.material3.ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = drawerReady,
        drawerContent = { if (drawerReady) HomeDrawer(vm, nav) { scope.launch { drawerState.close() } } },
    ) {
    val headerInitials = vm.workerName.trim().split(Regex("\\s+"))
        .mapNotNull { it.firstOrNull()?.toString() }.take(2).joinToString("").uppercase()
    androidx.compose.runtime.CompositionLocalProvider(
        LocalDrawerOpen provides { scope.launch { drawerState.open() } },
        LocalNav provides nav,
        LocalWalletBalance provides vm.walletBalance,
        LocalWorkerInitials provides headerInitials,
    ) {
    // Premium floating bottom navigation (Home · Bookings · online-toggle FAB · Wallet ·
    // Profile), shown only on the five top-level tab routes. The ☰ drawer, Home
    // Quick-Actions grid and header chips remain fully available.
    Scaffold(
        containerColor = ScreenBg,
        bottomBar = { if (route in TAB_ROUTES) FloatingBottomNav(nav, route, vm) },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = startDestination,
            modifier = Modifier.padding(padding).background(ScreenBg),
        ) {
            composable(Routes.LOGIN) { LoginScreen(vm, nav) }
            composable(Routes.HOME) { HomeScreen(vm, nav) }
            composable(Routes.BOOKINGS) { BookingsScreen(vm, nav) }
            composable(Routes.SCHEDULE) { ScheduleScreen(vm, nav) }
            composable(Routes.ATTENDANCE) { AttendanceScreen(vm, nav) }
            composable(Routes.LEAVE) { LeaveScreen(vm, nav) }
            composable(Routes.PERFORMANCE) { PerformanceScreen(vm, nav) }
            composable(Routes.EARNINGS) { EarningsScreen(vm, nav) }
            composable(Routes.WALLET) { WalletDashboardScreen(vm, nav) }
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
            composable(Routes.JOB_CHAT) { JobChatScreen(vm, nav) }
            composable(Routes.JOB_EXTRAS) { AddExtraServiceScreen(vm, nav) }
            composable(Routes.BEFORE_PHOTOS) { BeforePhotosScreen(vm, nav) }
            composable(Routes.AFTER_PHOTOS) { AfterPhotosScreen(vm, nav) }
            composable(Routes.CUSTOMER_SIGN) { CustomerSignScreen(vm, nav) }
            composable(Routes.P_PERSONAL) { PersonalInfoScreen(vm, nav) }
            composable(Routes.P_DOCUMENTS) { DocumentsScreen(vm, nav) }
            composable(Routes.P_SKILLS) { SkillsScreen(vm, nav) }
            composable(Routes.P_TRAINING) { TrainingScreen(vm, nav) }
            composable(Routes.P_BANK) { BankDetailsScreen(vm, nav) }
            composable(Routes.P_AVAILABILITY) { AvailabilityScreen(vm, nav) }
            composable(Routes.P_PREFERENCES) { PreferencesScreen(vm, nav) }
            composable(Routes.P_NOTIFICATIONS) { NotificationsScreen(vm, nav) }
            composable(Routes.P_HELP) { HelpSupportScreen(vm, nav) }
            composable(Routes.P_ABOUT) { AboutScreen(nav) }
            composable(Routes.RATE_CARD) { RateCardScreen(vm, nav) }
            composable(Routes.REFER) { ReferEarnScreen(vm, nav) }
            composable(Routes.INSURANCE) { ClaimInsuranceScreen(vm, nav) }
            composable(Routes.MERCH) { MerchStoreScreen(vm, nav) }
            composable(Routes.REWARDS) { RewardsScreen(vm, nav) }
            composable(Routes.SHAKTI) { ShaktiBonusScreen(vm, nav) }
            composable(Routes.SETTINGS) { SettingsScreen(vm, nav) }
        }
    }

    // ── Geofence monitor: while checked in with an assigned apartment, poll the worker's
    // location and alert (dialog + heads-up notification) the first time they leave the radius. ──
    val geoCtx = androidx.compose.ui.platform.LocalContext.current
    androidx.compose.runtime.LaunchedEffect(vm.attendance.checkedIn, vm.attendance.siteLat) {
        while (vm.attendance.checkedIn && vm.attendance.siteLat != null) {
            lastKnownLoc(geoCtx)?.let { vm.reportGeofence(it.first, it.second) }
            kotlinx.coroutines.delay(20_000)
        }
    }
    vm.geofenceAlert?.let { msg ->
        androidx.compose.runtime.LaunchedEffect(msg) { JobAlertService.notifyGeofence(geoCtx, msg) }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { vm.dismissGeofenceAlert() },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = { vm.dismissGeofenceAlert() }) { Text("OK", color = Purple) }
            },
            title = { Text("⚠  Left your assigned area", fontWeight = androidx.compose.ui.text.font.FontWeight.Bold) },
            text = { Text(msg) },
        )
    }
    }
    }
}

/** Best-effort last known location (lat,lng) for the geofence monitor; null without permission/fix. */
private fun lastKnownLoc(ctx: android.content.Context): Pair<Double, Double>? = try {
    if (androidx.core.content.ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
        null
    } else {
        val lm = ctx.getSystemService(android.content.Context.LOCATION_SERVICE) as android.location.LocationManager
        val loc = lm.getLastKnownLocation(android.location.LocationManager.GPS_PROVIDER)
            ?: lm.getLastKnownLocation(android.location.LocationManager.NETWORK_PROVIDER)
            ?: lm.getLastKnownLocation(android.location.LocationManager.PASSIVE_PROVIDER)
        loc?.let { it.latitude to it.longitude }
    }
} catch (_: Exception) { null }

/** Read battery % and coarse network type for the admin status strip. */
private fun readDeviceState(ctx: android.content.Context): Pair<Int?, String?> {
    val battery = try {
        val bm = ctx.getSystemService(android.content.Context.BATTERY_SERVICE) as android.os.BatteryManager
        bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY).takeIf { it in 0..100 }
    } catch (_: Exception) { null }
    val network = try {
        val cm = ctx.getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        when {
            caps == null -> "Offline"
            caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) -> "WiFi"
            caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile"
            caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
            else -> "Online"
        }
    } catch (_: Exception) { null }
    return Pair(battery, network)
}

@Composable
private fun BottomBar(nav: NavHostController, current: String?) {
  androidx.compose.foundation.layout.Column {
    HairlineDivider()
    NavigationBar(containerColor = Color.White) {
        tabs.forEach { tab ->
            NavigationBarItem(
                selected = current == tab.route,
                onClick = { if (current != tab.route) nav.navigateApp(tab.route) },
                icon = { Icon(tab.icon, contentDescription = tab.label) },
                label = { Text(tr(tab.label)) },
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
