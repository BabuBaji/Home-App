package com.homehelp.pro

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Divider
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.clickable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

@Composable
fun LoginScreen(vm: AppViewModel, nav: NavHostController) {
    var phone by remember { mutableStateOf("") }
    var otp by remember { mutableStateOf("") }
    var otpSent by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .background(Color.White)
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(40.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(36.dp).background(Purple, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Home, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(8.dp))
            Text("HomeHelp", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = TextDark)
            Text(" Pro", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Purple)
        }
        Spacer(Modifier.height(40.dp))
        Text("Hello Pro!", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextDark, modifier = Modifier.fillMaxWidth())
        Text("Login to continue", fontSize = 15.sp, color = TextGray, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(24.dp))

        OutlinedTextField(
            value = phone,
            onValueChange = { if (it.length <= 10 && it.all(Char::isDigit)) phone = it },
            leadingIcon = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Spacer(Modifier.width(8.dp))
                    Icon(Icons.Filled.Phone, contentDescription = null, tint = TextGray, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("+91", color = TextDark, fontWeight = FontWeight.Medium)
                }
            },
            placeholder = { Text("Enter mobile number") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
        )
        Spacer(Modifier.height(16.dp))

        if (otpSent) {
            OutlinedTextField(
                value = otp,
                onValueChange = { if (it.length <= 4 && it.all(Char::isDigit)) otp = it },
                placeholder = { Text("Enter 4-digit OTP") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            )
            Text("Enter the OTP sent to your mobile", color = TextGray, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
            if (vm.loginError != null) {
                Text(
                    vm.loginError!!,
                    color = Color(0xFFD92D20), fontSize = 13.sp, fontWeight = FontWeight.Medium,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
            }
            Spacer(Modifier.height(16.dp))
            PrimaryButton(if (vm.loggingIn) "Verifying…" else "Verify & Continue", enabled = otp.length == 4 && !vm.loggingIn) {
                vm.login(phone, otp)
            }
            // Navigate to Home ONLY after the backend confirms the worker is registered & active.
            LaunchedEffect(vm.isLoggedIn) {
                if (vm.isLoggedIn) nav.navigate(Routes.HOME) { popUpTo(Routes.LOGIN) { inclusive = true } }
            }
        } else {
            PrimaryButton("Get OTP", enabled = phone.length == 10) { otpSent = true }
        }

        Spacer(Modifier.height(40.dp))
        Box(
            Modifier.fillMaxWidth().height(180.dp).background(PurpleLight, RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text("🧹  House Help Professional", color = Purple, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(24.dp))
        Text(
            "By continuing, you agree to our",
            color = TextGray, fontSize = 12.sp, textAlign = TextAlign.Center,
        )
        Text(
            "Terms & Conditions & Privacy Policy",
            color = Purple, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun HomeScreen(vm: AppViewModel, nav: NavHostController) {
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val appCtx = LocalContext.current.applicationContext

    // Ask for notification permission (Android 13+) so background job alerts can show.
    val notifPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    // Start/stop the background "online" alert service as the worker toggles online.
    LaunchedEffect(vm.isOnline) {
        if (vm.isOnline) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(appCtx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            JobAlertService.start(appCtx)
        } else {
            JobAlertService.stop(appCtx)
        }
    }

    // Live 1-second tick that drives the "online today" timer while the worker is online.
    var nowMs by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(vm.isOnline) {
        while (vm.isOnline) { nowMs = System.currentTimeMillis(); delay(1000) }
    }
    var showGoalDialog by remember { mutableStateOf(false) }

    if (showGoalDialog) {
        GoalDialog(current = vm.dailyGoal, onDismiss = { showGoalDialog = false }) { g ->
            vm.updateDailyGoal(g); showGoalDialog = false
        }
    }

    // Time-of-day greeting + first name for the header.
    val greetHour = remember { java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY) }
    val greeting = when { greetHour < 12 -> "Good morning"; greetHour < 17 -> "Good afternoon"; else -> "Good evening" }
    val firstName = vm.workerName.trim().split(" ").firstOrNull().orEmpty().ifBlank { "Partner" }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = { HomeDrawer(vm, nav) { scope.launch { drawerState.close() } } },
    ) {
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        // Greeting header with earned tier badge + notifications bell.
        Column(Modifier.fillMaxWidth().background(Color.White)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Filled.Menu, contentDescription = "Menu", tint = TextDark,
                    modifier = Modifier.size(24.dp).clickable { scope.launch { drawerState.open() } },
                )
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(greeting, fontSize = 12.sp, color = TextGray)
                    Text(firstName, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextDark)
                }
                TierBadge(vm.tier)
                Spacer(Modifier.width(10.dp))
                Box {
                    Icon(
                        Icons.Filled.Notifications, contentDescription = "Notifications", tint = TextDark,
                        modifier = Modifier.size(24.dp).clickable { nav.navigate(Routes.P_NOTIFICATIONS) },
                    )
                    if (vm.unreadNotifications > 0) {
                        Box(
                            Modifier.align(Alignment.TopEnd).size(9.dp)
                                .background(RedCancel, RoundedCornerShape(50)),
                        )
                    }
                }
            }
            HairlineDivider()
        }

        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Active job — keep the in-progress service reachable from Home so the worker
            // can jump back to the timer / OTP / end-service screen after navigating away.
            vm.activeJob?.let { job ->
                val resumeRoute = when (vm.jobStatus) {
                    JobStatus.REQUESTED -> Routes.NEW_JOB
                    JobStatus.ACCEPTED -> Routes.JOB_DETAILS
                    JobStatus.ON_THE_WAY -> Routes.ON_THE_WAY
                    JobStatus.ARRIVED -> Routes.START_SERVICE
                    JobStatus.IN_PROGRESS -> Routes.IN_PROGRESS
                    else -> null
                }
                val label = when (vm.jobStatus) {
                    JobStatus.REQUESTED -> "New job request"
                    JobStatus.ACCEPTED -> "Job accepted"
                    JobStatus.ON_THE_WAY -> "On the way to customer"
                    JobStatus.ARRIVED -> "Arrived — start the service"
                    JobStatus.IN_PROGRESS -> "Service in progress"
                    else -> "Active job"
                }
                if (resumeRoute != null) {
                    Box(
                        Modifier.fillMaxWidth().background(GreenSuccess, RoundedCornerShape(16.dp))
                            .clickable { nav.navigate(resumeRoute) }
                            .padding(18.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("🛠", fontSize = 20.sp)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(label, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                Text("${job.services.joinToString(", ")} · tap to resume", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                            }
                        }
                    }
                }
            }

            // Online hero — the primary action, with a genuine live "online today" timer.
            val online = vm.isOnline
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = if (online) GreenLight else Color.White,
                border = BorderStroke(1.dp, if (online) GreenSuccess.copy(alpha = 0.35f) else Divider),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(18.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(9.dp).background(if (online) GreenSuccess else TextGray, RoundedCornerShape(50)))
                                Spacer(Modifier.width(8.dp))
                                Text(if (online) "You're Online" else "You're Offline", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = TextDark)
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                if (online) "Receiving job requests nearby" else "Go online to start receiving jobs",
                                fontSize = 13.sp, color = TextGray,
                            )
                        }
                        Switch(
                            checked = online,
                            onCheckedChange = { vm.goOnline(it) },
                            colors = SwitchDefaults.colors(checkedTrackColor = GreenSuccess, checkedThumbColor = Color.White),
                        )
                    }
                    if (online) {
                        Spacer(Modifier.height(14.dp)); HairlineDivider(); Spacer(Modifier.height(12.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column {
                                Text("Online today", fontSize = 12.sp, color = TextGray)
                                Text(fmtOnline(vm.onlineTodayMs(nowMs)), fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextDark)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("Jobs today", fontSize = 12.sp, color = TextGray)
                                Text("${vm.todayJobs}", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextDark)
                            }
                        }
                    }
                }
            }

            // Today's earnings + daily goal progress (goal is worker-set and persisted).
            Card {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                    Column {
                        Text("Today's Earnings", fontSize = 13.sp, color = TextGray)
                        Text("₹${vm.todayEarnings}", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = TextDark)
                    }
                    Text(
                        "Edit goal",
                        fontSize = 13.sp, color = Purple, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable { showGoalDialog = true }.padding(4.dp),
                    )
                }
                Spacer(Modifier.height(14.dp))
                val reached = vm.goalProgress >= 1f
                ProgressBar(vm.goalProgress, fill = if (reached) GreenSuccess else Purple, height = 10)
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("₹${vm.todayEarnings} of ₹${vm.dailyGoal} goal", fontSize = 12.sp, color = TextGray)
                    Text(
                        if (reached) "Goal reached 🎉" else "${(vm.goalProgress * 100).toInt()}%",
                        fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        color = if (reached) GreenSuccess else Purple,
                    )
                }
            }

            if (vm.isOnline && vm.activeJob == null) {
                val ctx = LocalContext.current
                if (vm.hasIncomingJob) {
                    // A real customer has booked — show the New Job Request notification.
                    Box(
                        Modifier.fillMaxWidth().background(Purple, RoundedCornerShape(16.dp))
                            .clickable {
                                vm.requestJob { found ->
                                    if (found) nav.navigate(Routes.NEW_JOB) else toast(ctx, "That job was just taken")
                                }
                            }
                            .padding(18.dp),
                    ) {
                        Column {
                            Text("🔔  New Job Request", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                            Text("A customer needs your service — tap to view", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                        }
                    }
                } else {
                    // Online and idle — waiting for a real booking (no fake/demo jobs).
                    Box(Modifier.fillMaxWidth().background(PurpleLight, RoundedCornerShape(16.dp)).padding(18.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("🟢", fontSize = 18.sp)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text("Waiting for job requests…", color = TextDark, fontWeight = FontWeight.SemiBold)
                                Text("You'll be notified when a customer books", color = TextGray, fontSize = 12.sp)
                            }
                        }
                    }
                    OutlineButton("🔄  Check for Jobs", modifier = Modifier.fillMaxWidth()) {
                        vm.requestJob { found ->
                            if (found) nav.navigate(Routes.NEW_JOB) else toast(ctx, "No new job requests right now")
                        }
                    }
                }
            }

            OutlineButton("🗺️  View Hyderabad Map", modifier = Modifier.fillMaxWidth()) {
                nav.navigate(Routes.HYDERABAD_MAP)
            }

            // Earnings snapshot — real period figures; hidden until there's something to show.
            if (vm.weekEarnings > 0 || vm.monthEarnings > 0 || vm.walletBalance > 0) {
                Card {
                    SectionTitle("Earnings")
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        MiniStat("₹${vm.weekEarnings}", "This Week", null)
                        MiniStat("₹${vm.monthEarnings}", "This Month", null)
                        MiniStat("₹${vm.walletBalance}", "Balance", null)
                    }
                }
            }

            // Performance + progress to the next tier (all derived from real figures).
            Card {
                SectionTitle("Performance")
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    MiniStat("${vm.workerRating} ★", "Rating", null)
                    MiniStat("${vm.jobsCompleted}", "Jobs Done", null)
                    MiniStat(vm.tier.label, "Tier", null)
                }
                val next = WorkerTier.next(vm.tier)
                if (next != null && vm.jobsToNextTier > 0) {
                    Spacer(Modifier.height(14.dp))
                    val span = (next.minJobs - vm.tier.minJobs).coerceAtLeast(1)
                    val tierProgress = ((vm.jobsCompleted - vm.tier.minJobs).toFloat() / span).coerceIn(0f, 1f)
                    ProgressBar(tierProgress, fill = Purple)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "${vm.jobsToNextTier} more jobs to ${next.label} ${next.emoji}",
                        fontSize = 12.sp, color = TextGray,
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
    }
}

// Slide-out menu opened by the Home top-bar hamburger. Quick links to the profile
// sub-screens plus logout — each closes the drawer first, then navigates.
@Composable
private fun HomeDrawer(vm: AppViewModel, nav: NavHostController, close: () -> Unit) {
    ModalDrawerSheet(drawerContainerColor = Color.White) {
        Column(Modifier.background(PurpleLight).fillMaxWidth().padding(20.dp)) {
            Text(vm.workerName.ifBlank { "HomeHelp Pro" }, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextDark)
            Text(vm.workerPhone.ifBlank { "Partner" }, fontSize = 13.sp, color = TextGray)
        }
        Spacer(Modifier.height(8.dp))

        fun go(route: String) { close(); nav.navigate(route) }
        DrawerLink(Icons.Filled.Person, "My Profile") { go(Routes.PROFILE) }
        DrawerLink(Icons.Filled.Home, "Personal Info") { go(Routes.P_PERSONAL) }
        DrawerLink(Icons.Filled.Description, "Documents") { go(Routes.P_DOCUMENTS) }
        DrawerLink(Icons.Filled.AccountBalance, "Bank Details") { go(Routes.P_BANK) }
        DrawerLink(Icons.Filled.CalendarMonth, "Availability") { go(Routes.P_AVAILABILITY) }
        DrawerLink(Icons.Filled.Tune, "Preferences") { go(Routes.P_PREFERENCES) }
        DrawerLink(Icons.Filled.Notifications, "Notification Settings") { go(Routes.P_NOTIFICATIONS) }
        DrawerLink(Icons.AutoMirrored.Filled.HelpOutline, "Help & Support") { go(Routes.P_HELP) }
        DrawerLink(Icons.Filled.Info, "About Us") { go(Routes.P_ABOUT) }
        Spacer(Modifier.height(8.dp)); HairlineDivider(); Spacer(Modifier.height(8.dp))
        DrawerLink(Icons.Filled.Logout, "Logout", tint = RedCancel) {
            close(); vm.logout(); nav.navigate(Routes.LOGIN) { popUpTo(Routes.HOME) { inclusive = true } }
        }
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun DrawerLink(icon: ImageVector, label: String, tint: Color = Purple, onClick: () -> Unit) {
    NavigationDrawerItem(
        icon = { Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp)) },
        label = { Text(label, color = if (tint == RedCancel) RedCancel else TextDark, fontWeight = FontWeight.Medium) },
        selected = false,
        onClick = onClick,
        colors = NavigationDrawerItemDefaults.colors(unselectedContainerColor = Color.White),
        modifier = Modifier.padding(horizontal = 12.dp),
    )
}

@Composable
private fun MiniStat(value: String, label: String, delta: String?) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = TextDark, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        Text(label, color = TextGray, fontSize = 12.sp)
        if (delta != null) Text(delta, color = GreenSuccess, fontSize = 11.sp, fontWeight = FontWeight.Medium)
    }
}

/** Format an elapsed-time span (ms) as a compact "Xh Ym" / "Ym" online-today label. */
private fun fmtOnline(ms: Long): String {
    val totalMin = (ms / 60000).toInt()
    val h = totalMin / 60
    val m = totalMin % 60
    return if (h > 0) "${h}h ${m}m" else "${m}m"
}

/** Dialog to set the worker's daily earnings target (₹). */
@Composable
private fun GoalDialog(current: Int, onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    var value by remember { mutableStateOf(current.toString()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Daily earnings goal", fontWeight = FontWeight.Bold, color = TextDark) },
        text = {
            Column {
                Text("Set a target to track your progress each day.", fontSize = 13.sp, color = TextGray)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = value,
                    onValueChange = { if (it.length <= 6 && it.all(Char::isDigit)) value = it },
                    leadingIcon = { Text("₹", color = TextDark, fontWeight = FontWeight.SemiBold) },
                    placeholder = { Text("1000") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(12.dp),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(value.toIntOrNull() ?: current) }) {
                Text("Save", color = Purple, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = TextGray) } },
    )
}
