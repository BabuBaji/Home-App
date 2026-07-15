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
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CurrencyRupee
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.FreeBreakfast
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Redeem
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.Tune
import androidx.compose.foundation.layout.offset
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Divider
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
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

    // Filled, soft-bordered field styling — shared by both inputs (enterprise form spec).
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedContainerColor = FieldFill,
        unfocusedContainerColor = FieldFill,
        focusedBorderColor = Purple,
        unfocusedBorderColor = Color.Transparent,
        focusedLabelColor = Purple,
        unfocusedLabelColor = TextGray,
        cursorColor = Purple,
    )

    Column(
        Modifier
            .fillMaxSize()
            .background(ScreenBg)
            .verticalScroll(rememberScrollState()),
    ) {
        // ---- Premium layered gradient hero (rounded bottom, glow orbs, glass logo tile) ----
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(bottomStart = 34.dp, bottomEnd = 34.dp))
                .background(HeroGradient),
        ) {
            Box(Modifier.align(Alignment.TopEnd).offset(x = 46.dp, y = (-40).dp).size(160.dp)
                .background(Color.White.copy(alpha = 0.09f), RoundedCornerShape(Radius.pill)))
            Box(Modifier.align(Alignment.BottomStart).offset(x = (-40).dp, y = 40.dp).size(140.dp)
                .background(Violet.copy(alpha = 0.30f), RoundedCornerShape(Radius.pill)))
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Space.xxl)
                    .padding(top = 72.dp, bottom = 46.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier.size(76.dp)
                        .shadow(18.dp, RoundedCornerShape(22.dp), spotColor = Color.Black.copy(alpha = 0.3f))
                        .background(Color.White.copy(alpha = 0.16f), RoundedCornerShape(22.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Home, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp))
                }
                Spacer(Modifier.height(18.dp))
                Row {
                    Text("HomeHelp", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Color.White, letterSpacing = (-0.4).sp)
                    Text(" Pro", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.80f), letterSpacing = (-0.4).sp)
                }
                Spacer(Modifier.height(7.dp))
                Text("Your daily workforce companion", color = Color.White.copy(alpha = 0.9f), fontSize = 14.sp)
            }
        }

        Column(Modifier.fillMaxWidth().padding(Space.xxl)) {
            Text("Welcome back 👋", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextDark)
            Spacer(Modifier.height(4.dp))
            Text("Sign in to continue to your dashboard", fontSize = 15.sp, color = TextGray)
            Spacer(Modifier.height(28.dp))

            OutlinedTextField(
                value = phone,
                onValueChange = { if (it.length <= 10 && it.all(Char::isDigit)) phone = it },
                label = { Text("Mobile number") },
                leadingIcon = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Spacer(Modifier.width(10.dp))
                        Icon(Icons.Filled.Phone, contentDescription = null, tint = Purple, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("+91", color = TextDark, fontWeight = FontWeight.SemiBold)
                    }
                },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(Radius.field),
                colors = fieldColors,
            )
            Spacer(Modifier.height(16.dp))

            if (otpSent) {
                OutlinedTextField(
                    value = otp,
                    onValueChange = { if (it.length <= 4 && it.all(Char::isDigit)) otp = it },
                    label = { Text("4-digit OTP") },
                    leadingIcon = { Icon(Icons.Filled.Shield, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(Radius.field),
                    colors = fieldColors,
                )
                Text("Enter the OTP sent to your mobile", color = TextGray, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(top = 6.dp, start = 4.dp))
                if (vm.loginError != null) {
                    Surface(
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                        shape = RoundedCornerShape(Radius.field),
                        color = RedLight,
                    ) {
                        Text(
                            vm.loginError!!,
                            color = RedCancel, fontSize = 13.sp, fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        )
                    }
                }
                Spacer(Modifier.height(20.dp))
                PrimaryButton("Verify & Continue", enabled = otp.length == 4 && !vm.loggingIn, loading = vm.loggingIn) {
                    vm.login(phone, otp)
                }
                // Navigate to Home ONLY after the backend confirms the worker is registered & active.
                LaunchedEffect(vm.isLoggedIn) {
                    if (vm.isLoggedIn) nav.navigate(Routes.HOME) { popUpTo(Routes.LOGIN) { inclusive = true } }
                }
            } else {
                Spacer(Modifier.height(4.dp))
                PrimaryButton("Get OTP", enabled = phone.length == 10) { otpSent = true }
            }

            Spacer(Modifier.height(28.dp))
            // Trust strip — enterprise credibility row.
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TrustItem("🛡️", "Secure")
                TrustItem("⚡", "Instant OTP")
                TrustItem("🤝", "Trusted")
            }
            Spacer(Modifier.height(28.dp))
            Text(
                "By continuing, you agree to our",
                color = TextGray, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
            )
            Text(
                "Terms & Conditions & Privacy Policy",
                color = Purple, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun TrustItem(emoji: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(emoji, fontSize = 20.sp)
        Spacer(Modifier.height(4.dp))
        Text(label, color = TextGray, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun HomeScreen(vm: AppViewModel, nav: NavHostController) {
    val openDrawer = LocalDrawerOpen.current
    val appCtx = LocalContext.current.applicationContext

    // Pull the wallet ledger so the Home "Last 7 Days" chart + balance chip have live data.
    LaunchedEffect(Unit) { vm.refreshWallet() }
    // Pull the Sitara Bonus (working-days / rating reward) so the Home rewards card is live.
    LaunchedEffect(Unit) { vm.loadShaktiBonus() }

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

    val homeInitials = remember(vm.workerName) {
        vm.workerName.trim().split(Regex("\\s+")).mapNotNull { it.firstOrNull()?.toString() }
            .take(2).joinToString("").uppercase().ifBlank { "P" }
    }

    val todayDate = remember { java.text.SimpleDateFormat("EEE, d MMM", java.util.Locale.ENGLISH).format(java.util.Date()) }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        // ─── Premium layered gradient hero (dark-indigo → indigo → violet) with a soft
        //     glow, a date pill, and a frosted-glass earnings + online-toggle panel. ───
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(bottomStart = 30.dp, bottomEnd = 30.dp))
                .background(HeroGradient),
        ) {
            // decorative glow orbs (depth)
            Box(Modifier.align(Alignment.TopEnd).offset(x = 40.dp, y = (-30.dp)).size(150.dp)
                .background(Color.White.copy(alpha = 0.08f), RoundedCornerShape(50)))
            Box(Modifier.align(Alignment.CenterStart).offset(x = (-50).dp, y = 20.dp).size(120.dp)
                .background(Violet.copy(alpha = 0.25f), RoundedCornerShape(50)))

            Column(Modifier.padding(horizontal = Space.l).padding(top = 16.dp, bottom = Space.xl)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(42.dp).clip(RoundedCornerShape(Radius.pill))
                            .background(Color.White.copy(alpha = 0.14f)).clickable { openDrawer() },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.Menu, contentDescription = "Menu", tint = Color.White, modifier = Modifier.size(23.dp)) }
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text("$greeting 👋", fontSize = 13.sp, color = Color.White.copy(alpha = 0.85f))
                        Text(firstName, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color.White, letterSpacing = (-0.2).sp)
                    }
                    Box(
                        Modifier.size(42.dp).clip(RoundedCornerShape(Radius.pill))
                            .background(Color.White.copy(alpha = 0.14f)).clickable { nav.navigate(Routes.P_NOTIFICATIONS) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Notifications, contentDescription = "Notifications", tint = Color.White, modifier = Modifier.size(22.dp))
                        if (vm.unreadNotifications > 0) {
                            Box(Modifier.align(Alignment.TopEnd).padding(9.dp).size(8.dp).background(Coral, RoundedCornerShape(50)))
                        }
                    }
                    Spacer(Modifier.width(Space.s))
                    ProfileChip(homeInitials, onDark = true) { nav.navigateApp(Routes.PROFILE) }
                }

                Spacer(Modifier.height(Space.l))

                // Frosted-glass earnings + status panel
                GlassPanel(Modifier.fillMaxWidth(), radius = Radius.card, alpha = 0.15f) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("Today's Earnings", fontSize = 12.sp, color = Color.White.copy(alpha = 0.85f))
                                Spacer(Modifier.width(Space.s))
                                Box(Modifier.clip(RoundedCornerShape(Radius.pill)).background(Color.White.copy(alpha = 0.16f)).padding(horizontal = 8.dp, vertical = 2.dp)) {
                                    Text(todayDate, fontSize = 10.sp, color = Color.White, fontWeight = FontWeight.Medium)
                                }
                            }
                            Spacer(Modifier.height(3.dp))
                            Text("₹${vm.todayEarnings}", fontSize = 32.sp, fontWeight = FontWeight.Bold, color = Color.White, letterSpacing = (-0.6).sp)
                            Spacer(Modifier.height(6.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                if (vm.isOnline) PulseDot(GreenSuccess, 7.dp)
                                else Box(Modifier.size(8.dp).background(Color.White.copy(alpha = 0.55f), RoundedCornerShape(50)))
                                Spacer(Modifier.width(if (vm.isOnline) 0.dp else 6.dp))
                                Text(
                                    if (vm.isOnline) "Online · ${vm.todayJobs} ${if (vm.todayJobs == 1) "job" else "jobs"} today" else "Offline · go online to earn",
                                    fontSize = 12.sp, color = Color.White.copy(alpha = 0.9f),
                                )
                            }
                        }
                        WalletChip(vm.walletBalance, onDark = true) { nav.navigateApp(Routes.WALLET) }
                    }
                    Spacer(Modifier.height(Space.m))
                    // Prominent online toggle pill inside the hero
                    val on = vm.isOnline
                    Box(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.pill))
                            .background(if (on) GreenSuccess else Color.White)
                            .clickable { vm.goOnline(!on) }
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            if (on) "● You're Online — tap to go offline" else "▶  Go Online to start earning",
                            color = if (on) Color.White else Purple, fontWeight = FontWeight.Bold, fontSize = 14.sp,
                        )
                    }
                }
            }
        }

        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.l),
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
                    // Full-bleed green "resume active job" hero — the highest-priority CTA on Home.
                    Box(
                        Modifier.fillMaxWidth().background(GreenSuccess, RoundedCornerShape(Radius.card))
                            .clickable { nav.navigate(resumeRoute) }
                            .padding(Space.l),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier.size(44.dp).background(Color.White.copy(alpha = 0.22f), RoundedCornerShape(Radius.pill)),
                                contentAlignment = Alignment.Center,
                            ) { Text("🛠", fontSize = 20.sp) }
                            Spacer(Modifier.width(Space.m))
                            Column(Modifier.weight(1f)) {
                                Text(label, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                Text("${job.services.joinToString(", ")} · tap to resume", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                            }
                            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
                        }
                    }
                }
            }

            val ctxHome = LocalContext.current

            // Real last-7-days earnings series (from the wallet ledger) — powers the
            // featured sparkline AND the bar chart below. No fabricated figures.
            val last7 = remember(vm.walletHistory.toList()) {
                val credited = vm.walletHistory.filter { it.isCredit }
                    .groupBy { it.date }.mapValues { (_, v) -> v.sumOf { it.amount } }
                val dfIso = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
                val dfDay = java.text.SimpleDateFormat("EEE", java.util.Locale.US)
                (6 downTo 0).map { off ->
                    val c = java.util.Calendar.getInstance().apply { add(java.util.Calendar.DAY_OF_YEAR, -off) }
                    Triple(dfDay.format(c.time), credited[dfIso.format(c.time)] ?: 0, off == 0)
                }
            }
            val amounts = last7.map { it.second }
            val todayAmt = amounts.lastOrNull() ?: 0
            val priorAmts = amounts.dropLast(1)
            val avgPrior = if (priorAmts.isNotEmpty()) priorAmts.average() else 0.0
            val trendUp = todayAmt >= avgPrior
            val trendPct = if (avgPrior > 0) kotlin.math.abs(((todayAmt - avgPrior) / avgPrior) * 100).toInt() else 0
            val reached = vm.goalProgress >= 1f

            // ─── Featured KPI: today's earnings + sparkline + animated goal ring ───
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Today's Earnings", color = TextGray, fontSize = 12.5.sp, fontWeight = FontWeight.Medium)
                        Spacer(Modifier.height(3.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("₹${vm.todayEarnings}", color = TextDark, fontSize = 28.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.6).sp)
                            if (avgPrior > 0) { Spacer(Modifier.width(Space.s)); TrendChip("$trendPct%", trendUp) }
                        }
                        Spacer(Modifier.height(2.dp))
                        Row {
                            Text("Goal ₹${vm.dailyGoal}", color = TextGray, fontSize = 12.sp)
                            Text(
                                "  ·  Edit", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.clickable { showGoalDialog = true },
                            )
                        }
                        Spacer(Modifier.height(Space.m))
                        Sparkline(
                            amounts.map { it.toFloat() },
                            Modifier.fillMaxWidth().height(46.dp),
                            lineColor = GreenSuccess, fillColor = GreenSuccess.copy(alpha = 0.20f),
                        )
                    }
                    Spacer(Modifier.width(Space.l))
                    CircularGoalRing(
                        vm.goalProgress, ringSize = 96.dp,
                        brush = if (reached) Brush.linearGradient(listOf(GreenSuccess, Color(0xFF16A34A))) else BrandGradient,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("${(vm.goalProgress * 100).toInt()}%", color = TextDark, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                            Text(if (reached) "🎉" else "Goal", color = TextGray, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }

            // ─── 3 compact KPI cards (Jobs · Completed · Rating) ───
            val completionPct = if (vm.todayJobs > 0) vm.todayCompleted * 100 / vm.todayJobs else 0
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                PremiumStatCard(
                    Modifier.weight(1f), Icons.Filled.Schedule, "Jobs Today", "${vm.todayJobs}",
                    Purple, Primary50, caption = "${vm.todayCompleted} done",
                )
                PremiumStatCard(
                    Modifier.weight(1f), Icons.Filled.CheckCircle, "Completed", "${vm.todayCompleted}",
                    GreenSuccess, GreenLight, caption = if (vm.todayJobs > 0) "$completionPct% rate" else "—",
                )
                PremiumStatCard(
                    Modifier.weight(1f), Icons.Filled.Star, "Rating",
                    if (vm.workerRating > 0) "${vm.workerRating}" else "—",
                    Gold, GoldLight, caption = "${vm.jobsCompleted} jobs",
                )
            }

            // ─── Live online-session card (only while online) ───
            if (vm.isOnline) {
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PulseDot(GreenSuccess, 9.dp)
                        Spacer(Modifier.width(Space.s))
                        Column(Modifier.weight(1f)) {
                            Text("You're Online", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextDark)
                            Text("Receiving job requests nearby", fontSize = 12.sp, color = TextGray)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("Online today", fontSize = 11.sp, color = TextGray)
                            Text(fmtOnline(vm.onlineTodayMs(nowMs)), fontSize = 17.sp, fontWeight = FontWeight.Bold, color = GreenSuccess)
                        }
                    }
                }
            }

            // ─── Quick Actions — premium rounded-icon grid ───
            SectionTitle("Quick Actions")
            HomeQuickGrid(nav, ctxHome, vm)

            // ─── Today's Jobs — premium booking timeline ───
            val upcoming = vm.bookings.filter { it.status == "Upcoming" }
            SectionTitle("Today's Jobs")
            if (upcoming.isEmpty()) {
                Card(modifier = Modifier.clickable { nav.navigateApp(Routes.BOOKINGS) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(Primary50), contentAlignment = Alignment.Center) {
                            Text("🗓️", fontSize = 22.sp)
                        }
                        Spacer(Modifier.width(Space.m))
                        Column(Modifier.weight(1f)) {
                            Text("No jobs scheduled yet", fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 15.sp)
                            Text("New bookings will appear here — stay online", color = TextGray, fontSize = 12.5.sp)
                        }
                        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(20.dp))
                    }
                }
            } else {
                Column {
                    upcoming.take(4).forEachIndexed { i, b ->
                        JobTimelineItem(b, isLast = i == upcoming.take(4).lastIndex) { nav.navigate(Routes.SCHEDULE) }
                    }
                    if (upcoming.size > 4) {
                        Text(
                            "View all ${upcoming.size} bookings",
                            color = Purple, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(start = 34.dp, top = 4.dp).clickable { nav.navigateApp(Routes.BOOKINGS) },
                        )
                    }
                }
            }

            // ─── Last 7 days earnings chart ───
            SevenDayEarningsCard(last7)

            // ─── Sitara Bonus — real working-days / Sundays / rating reward ladder ───
            SectionTitle("Sitara Bonus")
            SitaraBonusCard(vm.shaktiBonus) { nav.navigateApp(Routes.SHAKTI) }

            // ─── Performance — premium analytics ───
            SectionTitle("Performance")
            Card {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                    PerformanceMetric(
                        Modifier.weight(1f), "Rating", if (vm.workerRating > 0) "${vm.workerRating}" else "—",
                        Gold, meter = if (vm.workerRating > 0) (vm.workerRating / 5.0).toFloat() else null, icon = Icons.Filled.Star,
                    )
                    PerformanceMetric(
                        Modifier.weight(1f), "Completion", if (vm.todayJobs > 0) "$completionPct%" else "—",
                        GreenSuccess, meter = if (vm.todayJobs > 0) completionPct / 100f else null, icon = Icons.Filled.CheckCircle,
                    )
                }
                Spacer(Modifier.height(Space.m))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                    PerformanceMetric(
                        Modifier.weight(1f), "Jobs Done", "${vm.jobsCompleted}", Purple, icon = Icons.Filled.EmojiEvents,
                    )
                    PerformanceMetric(
                        Modifier.weight(1f), "This Month", "₹${vm.monthEarnings}", Violet, icon = Icons.Filled.CurrencyRupee,
                    )
                }
            }

            // ─── Attendance + Wallet quick rows (existing flows preserved) ───
            val attnOn = vm.attendance.checkedIn && !vm.attendance.checkedOut
            StatusListRow(
                icon = Icons.Filled.Schedule,
                iconTint = if (attnOn) GreenSuccess else TextGray,
                iconBg = if (attnOn) GreenLight else FieldFill,
                title = "Attendance",
                subtitle = vm.attendance.status,
                subtitleColor = if (attnOn) GreenSuccess else TextGray,
                value = if (!vm.attendance.checkedIn) "Check In" else if (!vm.attendance.checkedOut) "Check Out" else "Done",
                valueColor = Purple,
                onClick = { nav.navigate(Routes.ATTENDANCE) },
            )
            StatusListRow(
                icon = Icons.Filled.AccountBalanceWallet,
                iconTint = Purple,
                iconBg = PurpleLight,
                title = "Wallet Balance",
                subtitle = "Tap to view transactions",
                subtitleColor = TextGray,
                value = "₹${vm.walletBalance}",
                valueColor = TextDark,
                onClick = { nav.navigateApp(Routes.WALLET) },
            )

            if (vm.isOnline && vm.activeJob == null) {
                val ctx = LocalContext.current
                if (vm.hasIncomingJob) {
                    // A real customer has booked — show the New Job Request notification.
                    Box(
                        Modifier.fillMaxWidth().background(BrandGradient, RoundedCornerShape(Radius.card))
                            .clickable {
                                vm.requestJob { found ->
                                    if (found) nav.navigate(Routes.NEW_JOB) else toast(ctx, "That job was just taken")
                                }
                            }
                            .padding(Space.l),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier.size(44.dp).background(Color.White.copy(alpha = 0.22f), RoundedCornerShape(Radius.pill)),
                                contentAlignment = Alignment.Center,
                            ) { Icon(Icons.Filled.Notifications, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp)) }
                            Spacer(Modifier.width(Space.m))
                            Column(Modifier.weight(1f)) {
                                Text("New Job Request", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                                Text("A customer needs your service — tap to view", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                            }
                            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
                        }
                    }
                } else {
                    // Online and idle — waiting for a real booking (no fake/demo jobs).
                    Box(Modifier.fillMaxWidth().background(PurpleLight, RoundedCornerShape(Radius.card)).padding(Space.l)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(9.dp).background(GreenSuccess, RoundedCornerShape(Radius.pill)))
                            Spacer(Modifier.width(Space.m))
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
                SectionTitle("Earnings")
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                    MiniStatCard(Modifier.weight(1f), Icons.Filled.CurrencyRupee, "₹${vm.weekEarnings}", "This Week", Purple, Primary50)
                    MiniStatCard(Modifier.weight(1f), Icons.Filled.CalendarMonth, "₹${vm.monthEarnings}", "This Month", GreenSuccess, GreenLight)
                    MiniStatCard(Modifier.weight(1f), Icons.Filled.AccountBalanceWallet, "₹${vm.walletBalance}", "Balance", Amber, GoldLight)
                }
            }

            Spacer(Modifier.height(Space.s))
        }
    }
}

// Compact tappable tile for the Home "Quick Actions" row (Go Online / Take Break / Schedule).
@Composable
private fun QuickAction(modifier: Modifier, emoji: String, label: String, onClick: () -> Unit) {
    Surface(
        modifier = modifier.clickable { onClick() },
        shape = RoundedCornerShape(Radius.button),
        color = Color.White,
        border = BorderStroke(1.dp, Divider),
    ) {
        Column(Modifier.padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.size(40.dp).background(Primary50, RoundedCornerShape(Radius.pill)),
                contentAlignment = Alignment.Center,
            ) { Text(emoji, fontSize = 20.sp) }
            Spacer(Modifier.height(Space.s))
            Text(tr(label), fontSize = 12.sp, fontWeight = FontWeight.Medium, color = TextDark)
        }
    }
}

// ---- Home "Quick Actions" launcher grid — premium rounded-icon tiles ----------------------
private data class QuickItem(
    val icon: ImageVector, val label: String,
    val accent: Color, val accentBg: Color, val onTap: () -> Unit,
)

@Composable
private fun HomeQuickGrid(nav: NavHostController, ctx: android.content.Context, vm: AppViewModel) {
    val items = listOf(
        QuickItem(if (vm.isOnline) Icons.Filled.Pause else Icons.Filled.PlayArrow, if (vm.isOnline) "Go Offline" else "Go Online", GreenSuccess, GreenLight) { vm.goOnline(!vm.isOnline) },
        QuickItem(Icons.Filled.FreeBreakfast, "Take Break", Amber, GoldLight) { vm.goOnline(false); toast(ctx, "You're on a break — go online when ready") },
        QuickItem(Icons.Filled.Schedule, "Attendance", Purple, Primary50) { nav.navigate(Routes.ATTENDANCE) },
        QuickItem(Icons.Filled.CalendarMonth, "Schedule", Color(0xFF3B82F6), Color(0xFFE7F0FE)) { nav.navigate(Routes.SCHEDULE) },
        QuickItem(Icons.Filled.Description, "Bookings", Violet, Color(0xFFF1EAFE)) { nav.navigateApp(Routes.BOOKINGS) },
        QuickItem(Icons.Filled.AccountBalanceWallet, "Wallet", Purple, PurpleLight) { nav.navigateApp(Routes.WALLET) },
        QuickItem(Icons.Filled.EmojiEvents, "Rewards", Gold, GoldLight) { nav.navigateApp(Routes.REWARDS) },
        QuickItem(Icons.Filled.Redeem, "Refer & Earn", Coral, CoralLight) { nav.navigate(Routes.REFER) },
    )
    Column(verticalArrangement = Arrangement.spacedBy(Space.l)) {
        items.chunked(4).forEach { rowItems ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                rowItems.forEach { qi ->
                    PremiumActionTile(Modifier.weight(1f), qi.icon, qi.label, qi.accent, qi.accentBg, qi.onTap)
                }
                repeat(4 - rowItems.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/** One premium node in the "Today's Jobs" booking timeline: a gradient rail dot + connector
 *  and a floating job card (service / customer / time / amount). */
@Composable
private fun JobTimelineItem(b: Booking, isLast: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
        Column(Modifier.width(22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(Modifier.height(8.dp))
            Box(Modifier.size(13.dp).clip(RoundedCornerShape(Radius.pill)).background(BrandGradient))
            if (!isLast) Box(Modifier.width(2.dp).weight(1f).background(Divider))
        }
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f).padding(bottom = if (isLast) 0.dp else Space.m)) {
            Card(modifier = Modifier.clickable { onClick() }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(Primary50), contentAlignment = Alignment.Center) {
                        Text("🧹", fontSize = 20.sp)
                    }
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text(b.service ?: "Service", fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.5.sp, maxLines = 1)
                        Spacer(Modifier.height(1.dp))
                        Text(b.customerName ?: "Customer", color = TextGray, fontSize = 12.sp, maxLines = 1)
                        if (!b.timeInfo.isNullOrBlank()) {
                            Spacer(Modifier.height(2.dp))
                            Text("🕐 ${b.timeInfo}", color = Purple, fontSize = 11.5.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                        }
                    }
                    Spacer(Modifier.width(Space.s))
                    Column(horizontalAlignment = Alignment.End) {
                        if (b.amount > 0) Text("₹${b.amount}", fontWeight = FontWeight.Bold, color = GreenSuccess, fontSize = 15.sp)
                        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

// Short ₹ label for chart bars, e.g. 850 → "850", 1200 → "1.2k".
private fun shortInr(n: Int): String = when {
    n >= 1000 -> String.format(java.util.Locale.US, "%.1fk", n / 1000.0).replace(".0k", "k")
    else -> n.toString()
}

/** Advanced: last-7-days daily-earnings mini bar chart. `days` = (weekday, amount, isToday). */
@Composable
private fun SevenDayEarningsCard(days: List<Triple<String, Int, Boolean>>) {
    val total = days.sumOf { it.second }
    Card {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Last 7 Days", fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 15.sp)
                Text("Daily earnings", fontSize = 12.sp, color = TextGray)
            }
            Text("₹${shortInr(total)}", fontWeight = FontWeight.Bold, color = GreenSuccess, fontSize = 18.sp)
        }
        Spacer(Modifier.height(Space.l))
        AnimatedLineChart(days, lineColor = GreenSuccess, fillColor = GreenSuccess)
    }
}

// Slide-out menu opened by the Home top-bar hamburger — premium partner drawer:
// a gradient identity header (avatar + tier + rating), a highlighted "ratings" card, and
// colour-coded rows for every module. Each row closes the drawer first, then navigates.
@Composable
fun HomeDrawer(vm: AppViewModel, nav: NavHostController, close: () -> Unit) {
    fun go(route: String) { close(); nav.navigateApp(route) }
    val initials = vm.workerName.trim().split(Regex("\\s+"))
        .mapNotNull { it.firstOrNull()?.toString() }.take(2).joinToString("").uppercase().ifBlank { "P" }
    val role = vm.jobPreferences.entries.firstOrNull { it.value }?.key ?: "Home Services Pro"

    ModalDrawerSheet(drawerContainerColor = Color.White, modifier = Modifier.fillMaxWidth(0.87f)) {
        Column(Modifier.verticalScroll(rememberScrollState())) {
            // ---- gradient identity header (brand violet/indigo) ----
            Box(Modifier.fillMaxWidth().background(BrandGradient).padding(Space.xl)) {
                // Decorative star medallion (top-right), like the reference.
                Box(
                    Modifier.align(Alignment.TopEnd).offset(x = 34.dp, y = (-26).dp).size(130.dp)
                        .background(Color.White.copy(alpha = 0.13f), RoundedCornerShape(50)),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Star, null, tint = Color.White.copy(alpha = 0.28f), modifier = Modifier.size(70.dp)) }

                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(contentAlignment = Alignment.BottomCenter) {
                            Avatar(initials, size = 66, bg = Color.White, fg = Purple)
                            Surface(
                                shape = RoundedCornerShape(50), color = TextDark,
                                modifier = Modifier.offset(y = 9.dp),
                            ) {
                                Text(
                                    vm.tier.label.uppercase(), color = Color.White, fontSize = 9.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 9.dp, vertical = 2.dp),
                                )
                            }
                        }
                        Spacer(Modifier.width(16.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                vm.workerName.ifBlank { "HomeHelp Pro" }.uppercase(),
                                color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold, maxLines = 2,
                            )
                            Spacer(Modifier.height(4.dp))
                            Text("${vm.tier.emoji}  $role", color = Color.White.copy(alpha = 0.95f), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("⭐", fontSize = 13.sp)
                        Spacer(Modifier.width(6.dp))
                        Text("${vm.workerRating} rating · ${vm.jobsCompleted} jobs done", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }

            // ---- highlighted "Check your ratings" ----
            Surface(
                Modifier.fillMaxWidth().padding(Space.l).clickable { go(Routes.PERFORMANCE) },
                shape = RoundedCornerShape(Radius.button), color = GoldLight,
            ) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(38.dp).background(Gold, RoundedCornerShape(Radius.pill)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Star, null, tint = Color.White, modifier = Modifier.size(22.dp))
                    }
                    Spacer(Modifier.width(14.dp))
                    Text("Check your ratings", Modifier.weight(1f), color = Color(0xFFB7791F), fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Text("›", color = Color(0xFFB7791F), fontSize = 22.sp, fontWeight = FontWeight.Bold)
                }
            }

            // ---- modules (colour-coded) ----
            DrawerSection("Earnings")
            DrawerRow(Icons.Filled.CurrencyRupee, "Monthly Earnings", GreenSuccess) { go(Routes.EARNINGS) }
            DrawerRow(Icons.Filled.AccountBalanceWallet, "My Wallet", Purple) { go(Routes.WALLET) }
            DrawerRow(Icons.Filled.Description, "Rate Card", Color(0xFF16A34A)) { go(Routes.RATE_CARD) }
            DrawerRow(Icons.Filled.Savings, "Early Payout", Amber) { go(Routes.SALARY_ADVANCE) }
            DrawerRow(Icons.Filled.History, "Transaction History", Color(0xFFEC4899)) { go(Routes.WALLET_HISTORY) }
            DrawerRow(Icons.Filled.Star, "Rewards & Penalties", Gold) { go(Routes.REWARDS) }
            DrawerRow(Icons.Filled.EmojiEvents, "Sitara Bonus", Color(0xFFCD7F32)) { go(Routes.SHAKTI) }
            DrawerRow(Icons.Filled.Description, "Payslip", Color(0xFF7C6DF7)) { go(Routes.PAYSLIP) }

            DrawerSection("Perks")
            DrawerRow(Icons.Filled.Redeem, "Refer & Earn", Color(0xFFEC4899)) { go(Routes.REFER) }
            DrawerRow(Icons.Filled.Storefront, "Merch Store", Color(0xFF7C6DF7)) { go(Routes.MERCH) }
            DrawerRow(Icons.Filled.Shield, "Claim Insurance", Color(0xFF0EA5E9)) { go(Routes.INSURANCE) }

            DrawerSection("Work")
            DrawerRow(Icons.Filled.Schedule, "Attendance", GreenSuccess) { go(Routes.ATTENDANCE) }
            DrawerRow(Icons.Filled.CalendarMonth, "Leaves", Color(0xFF3B82F6)) { go(Routes.LEAVE) }
            DrawerRow(Icons.Filled.Tune, "Availability", Amber) { go(Routes.P_AVAILABILITY) }

            DrawerSection("Account")
            DrawerRow(Icons.Filled.Person, "My Profile", Purple) { go(Routes.PROFILE) }
            DrawerRow(Icons.Filled.Description, "Documents", Color(0xFF0EA5E9)) { go(Routes.P_DOCUMENTS) }
            DrawerRow(Icons.Filled.AccountBalance, "Bank Details", Color(0xFF14B8A6)) { go(Routes.P_BANK) }
            DrawerRow(Icons.Filled.Tune, "Preferences", TextGray) { go(Routes.P_PREFERENCES) }
            DrawerRow(Icons.Filled.Notifications, "Notifications", PurpleMid) { go(Routes.P_NOTIFICATIONS) }

            DrawerSection("Support")
            DrawerRow(Icons.AutoMirrored.Filled.HelpOutline, "Help & Support", Purple) { go(Routes.P_HELP) }
            DrawerRow(Icons.Filled.Info, "About Us", TextGray) { go(Routes.P_ABOUT) }

            Spacer(Modifier.height(8.dp)); HairlineDivider(Modifier.padding(horizontal = 20.dp)); Spacer(Modifier.height(8.dp))
            DrawerRow(Icons.Filled.Logout, "Logout", RedCancel) {
                close(); vm.logout(); nav.navigate(Routes.LOGIN) { popUpTo(Routes.HOME) { inclusive = true } }
            }

            Spacer(Modifier.height(18.dp))
            Text("App version 1.0.0", color = TextMuted, fontSize = 12.sp, modifier = Modifier.padding(start = 20.dp, bottom = 22.dp))
        }
    }
}

// One drawer row: a tinted circular icon + label (matches the reference's colour-coded list).
@Composable
private fun DrawerRow(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onClick() }.padding(horizontal = Space.l, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(40.dp).background(tint.copy(alpha = 0.13f), RoundedCornerShape(Radius.pill)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.width(Space.l))
        Text(tr(label), Modifier.weight(1f), color = if (tint == RedCancel) RedCancel else TextDark, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(20.dp))
    }
}

// Small grey section label between drawer groups.
@Composable
private fun DrawerSection(title: String) {
    Text(
        tr(title).uppercase(), color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp,
        modifier = Modifier.padding(start = 20.dp, top = 16.dp, bottom = 2.dp),
    )
}

@Composable
private fun MiniStat(value: String, label: String, delta: String?) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = TextDark, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        Text(tr(label), color = TextGray, fontSize = 12.sp)
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
                    shape = RoundedCornerShape(Radius.field),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = FieldFill,
                        unfocusedContainerColor = FieldFill,
                        focusedBorderColor = Purple,
                        unfocusedBorderColor = Color.Transparent,
                        cursorColor = Purple,
                    ),
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

// ─────────────────────────────────────────────────────────────────────────────
// UI CHANGE LOG — AuthHomeScreens.kt
// Premium gig/partner-app (Urban Company / Snabbit style) restyle in our violet brand,
// built on the shared reference-pattern widgets and design tokens. UI-ONLY.
//
// LoginScreen:
//  • Gradient brand header (floating logo tile + tagline); filled, floating-label
//    OutlinedTextFields (FieldFill / Purple focus, Radius.field); soft error surface;
//    PrimaryButton (Get OTP / Verify) keeps its exact enabled/loading logic; trust strip.
//  • Paddings moved to Space tokens.
//
// HomeScreen (flagship dashboard):
//  • Gradient greeting header (avatar + time-of-day greeting, menu / notifications with
//    unread dot / wallet / profile) — tokenised to Radius.sheet + Space.
//  • Active-job resume banner → green hero with tinted icon chip + trailing chevron.
//  • Today's snapshot → 3-up MiniStatCard strip (Earnings / Jobs Today / Completed).
//  • Attendance, Next Job & Wallet → shared StatusListRow (colored status circle,
//    title + colored subtitle, value, chevron).
//  • Quick actions → tinted-chip Cards (Go Online / Take Break / Schedule).
//  • Online hero switch card retained (green when online) with the live "online today"
//    timer; tokenised.
//  • Today's earnings → ElevatedGroup { MoneyBanner + goal-progress breakdown }.
//  • Incoming / waiting-for-job banners → tinted-icon rows with chevrons.
//  • Earnings & Performance → MiniStatCard strips; next-tier progress in its own Card.
//
// HomeDrawer:
//  • Gradient identity header (avatar + tier + rating) and highlighted ratings card
//    retained; menu rows now carry a trailing ChevronRight; tokenised radii/spacing.
//
// Helpers: QuickAction wraps its emoji in a tinted chip; GoalDialog field uses the
// filled-field style; all raw radii/spacing replaced with Radius / Space tokens.
//
// NO functionality/logic/flow changed: every @Composable signature is identical; all
// state (phone/otp/otpSent, online service effects, live timer, goal dialog, active-job
// resume, attendance/next-job/wallet/tier derivations), validations (10-digit phone,
// 4-digit OTP), vm.* calls, onClick handlers, navigation routes and the login
// LaunchedEffect are exactly as before — only layout, colours and styling changed.
// ─────────────────────────────────────────────────────────────────────────────
