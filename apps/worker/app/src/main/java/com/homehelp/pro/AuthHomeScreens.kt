package com.homehelp.pro

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.defaultMinSize
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
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.outlined.Notifications
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
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.WorkspacePremium
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
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
        // ---- Light brand header — same language as the Home profile header: white surface,
        //      brand-gradient logo tile, dark wordmark (no dark gradient hero). ----
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(bottomStart = 34.dp, bottomEnd = 34.dp))
                .background(CardBg)
                .padding(horizontal = Space.xxl)
                .padding(top = 72.dp, bottom = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                Modifier.size(76.dp)
                    .shadow(14.dp, RoundedCornerShape(22.dp), spotColor = Purple.copy(alpha = 0.45f))
                    .clip(RoundedCornerShape(22.dp))
                    .background(BrandGradient),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Home, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp))
            }
            Spacer(Modifier.height(18.dp))
            Row {
                Text("HomeHelp", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = TextDark, letterSpacing = (-0.4).sp)
                Text(" Pro", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Purple, letterSpacing = (-0.4).sp)
            }
            Spacer(Modifier.height(7.dp))
            Text("Your daily workforce companion", color = TextGray, fontSize = 14.sp)
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
                // Surface a failed/rate-limited request too — otherwise "Get OTP" looks like it worked.
                if (vm.loginError != null) {
                    Surface(
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
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
                Spacer(Modifier.height(4.dp))
                // Must round-trip to the server: it issues and stores the code we later verify against.
                PrimaryButton("Get OTP", enabled = phone.length == 10 && !vm.requestingOtp, loading = vm.requestingOtp) {
                    vm.requestLoginOtp(phone)
                }
            }
            // The field appears only once the backend confirms a code was actually issued.
            LaunchedEffect(vm.otpRequested) {
                if (vm.otpRequested) {
                    otpSent = true
                    vm.devOtp?.let { otp = it }   // demo mode (WORKER_DEV_OTP) pre-fills it
                }
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

/**
 * Renders a schedule slot as "2:30 PM – 3:30 PM". The backend sends only a start time and a
 * duration, so the end is derived; if the start can't be parsed we show it unchanged rather
 * than inventing a window.
 */
private fun jobTimeWindow(start: String?, durationMins: Int?): String {
    val s = start.orEmpty()
    if (s.isBlank()) return "—"
    if (durationMins == null || durationMins <= 0) return s
    return try {
        val fmt = java.text.SimpleDateFormat("h:mm a", java.util.Locale.ENGLISH)
        val startDate = fmt.parse(s) ?: return s
        val end = java.util.Calendar.getInstance().apply {
            time = startDate
            add(java.util.Calendar.MINUTE, durationMins)
        }
        "$s – ${fmt.format(end.time)}"
    } catch (e: Exception) {
        s
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

/**
 * Best-effort last known position for a Home check-in / check-out, mirroring what the
 * attendance screen captures. Returns nulls when permission is missing or no fix is cached —
 * the attendance API accepts null coordinates, so check-in still succeeds without GPS.
 */
private fun homeLastLoc(ctx: Context): Pair<Double?, Double?> = try {
    if (androidx.core.content.ContextCompat.checkSelfPermission(
            ctx, android.Manifest.permission.ACCESS_FINE_LOCATION,
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    ) {
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
        val loc = lm.getLastKnownLocation(android.location.LocationManager.GPS_PROVIDER)
            ?: lm.getLastKnownLocation(android.location.LocationManager.NETWORK_PROVIDER)
        loc?.latitude to loc?.longitude
    } else null to null
} catch (_: Exception) { null to null }

@Composable
fun HomeScreen(vm: AppViewModel, nav: NavHostController) {
    val openDrawer = LocalDrawerOpen.current
    val appCtx = LocalContext.current.applicationContext

    val sosCtx = LocalContext.current
    val homeCtx = LocalContext.current

    // Pull the wallet ledger so the Home "Last 7 Days" chart + balance chip have live data.
    LaunchedEffect(Unit) { vm.refreshWallet() }
    // Pull the Sitara Bonus (working-days / rating reward) so the Home rewards card is live.
    LaunchedEffect(Unit) { vm.loadShaktiBonus() }
    // Pull notifications so the bell badge + Announcements card show real items.
    LaunchedEffect(Unit) { vm.refreshNotifications() }

    // Ask for notification permission (Android 13+) so background job alerts can show.
    val notifPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    /* Only the PERMISSION prompt lives here — it needs an Activity-scoped launcher, and Home is
     * where a worker first goes online. Starting/stopping the service itself moved to AppRoot, which
     * outlives navigation; doing it here too meant it never ran when the worker went online from any
     * other screen. Asked for on every online transition seen while Home is up; once granted or
     * permanently denied the launcher is a no-op. */
    LaunchedEffect(vm.isOnline) {
        if (vm.isOnline &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(appCtx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
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

    // Today's incentive was derived here for the progress card. That figure left Home when the
    // card was cut to the two job counts, so the wallet-ledger scan it needed went with it.

    // Next scheduled job — the real `schedule` feed carries service/time/location.
    // Any live or upcoming job, not just "Upcoming". The backend reports a job the worker has
    // already accepted as "In progress", so an exact-match on "Upcoming" hid the Next Job card
    // for exactly the job the worker most needs to act on.
    //
    // When the API returns NO schedule at all, Home falls back to [SampleSchedule] so the
    // NEXT JOB hero and NEXT UP panel still render. That is demo data — see the warning on
    // SampleSchedule before shipping a release build.
    val scheduleItems = vm.schedule.ifEmpty { SampleSchedule }
    val nextJob = scheduleItems.firstOrNull {
        it.status.equals("Upcoming", true) || it.status.equals("In progress", true) ||
            it.status.equals("Accepted", true) || it.status.equals("Confirmed", true)
    } ?: scheduleItems.firstOrNull()
    val nextJobWindow = remember(nextJob?.time, nextJob?.durationMins) { jobTimeWindow(nextJob?.time, nextJob?.durationMins) }

    // Home scrolls, and deliberately so. Measured on a 1080×2408 @440dpi device: this layout's
    // natural height is ~1500dp against ~820dp of usable screen, so the old FitToScreen wrapper
    // was rendering the whole page at 0.545 scale — 108dp tiles came out 162px instead of 297px,
    // and 19sp figures read as 10sp. No amount of trimming closes a 680dp gap; dropping the
    // schedule, banner and ticker together still only reached ~0.76. Scrolling is what lets the
    // type and cards render at the size they are designed at.
    // Home scrolls. The sections below are compact enough that almost all of the page is
    // visible at once, but nothing is scaled to force a fit: type renders at the size it is
    // designed at, and the last card is reached by scrolling. An earlier revision shrank the
    // whole page to fit exactly one screen — that is deliberately NOT done here.
    Column(
        Modifier.fillMaxSize().background(ScreenBg).verticalScroll(rememberScrollState()),
    ) {
        Column(
            // The bottom nav floats OVER this content rather than sitting below it, so the last
            // card needs the pill's height (~86dp) plus its bottom margin as clearance.
            // Only 24dp at the bottom. FloatingBottomNav sits in the Scaffold's bottomBar slot,
            // so the NavHost is ALREADY inset by the pill's full height — reserving it again
            // here (it was 180dp) just added dead scroll. This covers the centre FAB, which
            // overhangs the bar's top edge and is not part of the measured bottomBar.
            Modifier.padding(horizontal = Space.m).padding(top = 2.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            // ─── Header ─── drawer handle, greeting and rating on the left; bell and avatar on
            // the right, as the reference draws them.
            HomeHeaderRow(
                greeting = greeting,
                firstName = firstName,
                rating = vm.workerRating,
                unread = vm.unreadNotifications,
                online = vm.isOnline,
                onMenu = { openDrawer() },
                onNotifications = { nav.navigate(Routes.P_NOTIFICATIONS) },
                onProfile = { nav.navigateApp(Routes.PROFILE) },
                onRating = { nav.navigate(Routes.PERFORMANCE) },
            )

            // ─── Availability ─── the primary online control. goOnline() is the same call the
            // nav FAB makes, so the switch and the FAB stay in step.
            OnlineToggleCard(online = vm.isOnline, onToggle = { vm.goOnline(it) })

            // ─── Live job ─── highest-priority state on the screen, so it leads. It used to
            // render below the refer banner, under everything else.
            vm.activeJob?.let { job ->
                val route = when (vm.jobStatus) {
                    JobStatus.REQUESTED -> Routes.NEW_JOB
                    JobStatus.ACCEPTED -> Routes.JOB_DETAILS
                    JobStatus.ON_THE_WAY -> Routes.ON_THE_WAY
                    JobStatus.ARRIVED -> Routes.ARRIVED
                    JobStatus.IN_PROGRESS -> Routes.IN_PROGRESS
                    else -> null
                }
                // Suppressed while the NEXT JOB hero is on screen: with a live job the hero is
                // showing that same booking, and its "Start Job" resumes it at exactly the stage
                // this banner would have navigated to. Two cards for one job cost ~75dp and made
                // the page overflow. With no hero (empty schedule) the banner is the only route
                // back into a live job, so it still renders.
                if (route != null && nextJob == null) {
                    ActiveJobBanner(
                        label = when (vm.jobStatus) {
                            JobStatus.REQUESTED -> "New job request"
                            JobStatus.ACCEPTED -> "Job accepted"
                            JobStatus.ON_THE_WAY -> "On the way to customer"
                            JobStatus.ARRIVED -> "Arrived — start the service"
                            JobStatus.IN_PROGRESS -> "Service in progress"
                            else -> "Active job"
                        },
                        subtitle = "${job.services.joinToString(", ")} · tap to resume",
                        onResume = { nav.navigate(route) },
                    )
                }
            }

            // ─── Next job ─── only when a REAL customer booking exists. Nothing is fabricated:
            // no booking in the feed means no card, which is what makes this the app's
            // "a customer has requested you" surface. It leads the page for the same reason.
            if (nextJob != null) {
                NextJobHeroCard(
                    job = nextJob,
                    timeWindow = nextJobWindow,
                    onNavigate = { nav.navigate(Routes.SCHEDULE) },
                    onCall = { nav.navigateApp(Routes.BOOKINGS) },
                    // Start Job used to just open the Jobs list, which is why tapping it
                    // appeared to do nothing. It now drives the real lifecycle: resume the
                    // live job at whatever stage it is at, or pull the next real booking.
                    onStart = {
                        val live = when (vm.jobStatus) {
                            JobStatus.REQUESTED -> Routes.NEW_JOB
                            JobStatus.ACCEPTED -> Routes.JOB_DETAILS
                            JobStatus.ON_THE_WAY -> Routes.ON_THE_WAY
                            JobStatus.ARRIVED -> Routes.ARRIVED
                            JobStatus.IN_PROGRESS -> Routes.IN_PROGRESS
                            else -> null
                        }
                        if (vm.activeJob != null && live != null) {
                            nav.navigate(live)
                        } else {
                            vm.requestJob { found ->
                                if (found) nav.navigate(Routes.NEW_JOB)
                                else toast(homeCtx, "No job ready to start yet")
                            }
                        }
                    },
                )
            }

            // ─── Quick actions ─── Attendance · My Shift · Emergency. Emergency is a lone-worker
            // safety control, so it keeps a one-tap home here rather than sitting two taps deep
            // behind Support.
            QuickActionStrip(
                onAttendance = { nav.navigate(Routes.ATTENDANCE) },
                onShifts = { nav.navigate(Routes.MY_SHIFTS) },
                onEmergency = { vm.sendSos(null, null) { msg -> toast(sosCtx, msg) } },
            )

            // ─── Today ─── jobs done against today's total, money earned, the target and the
            // progress toward it. Tapping the target cell opens the goal editor, which is the
            // only route to it.
            TodayPanel(
                completed = vm.todayCompleted,
                // Falls back to the schedule's length when the API reports no jobs for today, so
                // the count agrees with the rows NEXT UP is actually showing.
                totalJobs = if (vm.todayJobs > 0) vm.todayJobs else scheduleItems.size,
                earned = vm.todayEarnings,
                target = vm.dailyGoal,
                onViewAll = { nav.navigateApp(Routes.EARNINGS) },
                onEditTarget = { showGoalDialog = true },
            )

            // ─── Next up ─── the jobs queued AFTER the hero's. Dropping the hero job keeps the
            // two sections from showing the same booking twice; hidden entirely when nothing is
            // left, rather than rendering an empty shell.
            val upcoming = scheduleItems.filter { it !== nextJob }.take(3)
            if (upcoming.isNotEmpty()) {
                NextUpPanel(
                    items = upcoming,
                    onViewSchedule = { nav.navigate(Routes.SCHEDULE) },
                    onItem = { nav.navigateApp(Routes.BOOKINGS) },
                )
            }

            // ─── Incoming request ───────────────────────────────────────────────────────────
            // ONLY the incoming-job strip renders here now. The idle "You're Online / Waiting
            // for job requests" variant was removed: the availability card at the top of the
            // page already says exactly that, and the reference has no second copy of it.
            if (vm.isOnline && vm.hasIncomingJob) {
                val jobCtx = LocalContext.current
                OnlineStatusStrip(
                    background = BrandGradient,
                    onLight = false,
                    title = "New Job Request",
                    subtitle = "A customer needs your service — tap to view",
                    trailing = null,
                    onClick = {
                        vm.requestJob { found ->
                            if (found) nav.navigate(Routes.NEW_JOB) else toast(jobCtx, "That job was just taken")
                        }
                    },
                )
            }

            // ─── Bonus banner ─── closes the page. When the backend reports a Sitara tier the
            // banner quotes ITS reward and target; with no tier reported it falls back to the
            // generic weekend copy rather than naming a bonus the worker cannot actually earn.
            val nextBonusTier = vm.shaktiBonus?.tiers?.firstOrNull { it.days > (vm.shaktiBonus?.workingDays ?: 0) }
            BonusBanner(
                title = "Weekend Bonus!",
                subtitle = nextBonusTier
                    ?.let { "Earn ₹${it.amount} extra after ${it.days} working days" }
                    ?: "Extra incentive on weekend jobs — tap for details",
                onDetails = { nav.navigate(Routes.SHAKTI) },
            )

            // The active-job banner moved to the TOP of this column — a job in progress is the
            // most important thing on the screen and used to render here, below everything.
            // The live-session card, the "Waiting for job requests…" box and the "Check for Jobs"
            // button folded into the status slot above.
        }
    }
}

/**
 * Home's header row, per the reference: the drawer handle as a floating white circle on the
 * left, and the notification bell (with its unread count) plus the avatar on the right.
 *
 * SOS is NOT here — the reference puts it in the quick-action strip, where it still sits one
 * tap from Home.
 */
@Composable
private fun HomeHeaderRow(
    greeting: String,
    firstName: String,
    rating: Double,
    unread: Int,
    online: Boolean,
    onMenu: () -> Unit,
    onNotifications: () -> Unit,
    onProfile: () -> Unit,
    onRating: () -> Unit,
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        CircleButton(onClick = onMenu) {
            Icon(Icons.Filled.Menu, contentDescription = "Open menu", tint = TextDark, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.width(10.dp))
        // Greeting sits beside the drawer handle, with the rating chip hanging under the name.
        Column(Modifier.weight(1f)) {
            Text("$greeting,", fontSize = 13.sp, color = TextGray, maxLines = 1)
            Text(
                "$firstName 👋",
                fontSize = 21.sp, fontWeight = FontWeight.Bold, color = TextDark,
                letterSpacing = (-0.5).sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            RatingPill(rating = rating, onClick = onRating)
        }
        Spacer(Modifier.width(6.dp))
        Box(Modifier.size(46.dp), contentAlignment = Alignment.Center) {
            CircleButton(onClick = onNotifications) {
                Icon(Icons.Outlined.Notifications, contentDescription = "Notifications", tint = TextDark, modifier = Modifier.size(22.dp))
            }
            if (unread > 0) {
                Box(
                    Modifier.align(Alignment.TopEnd)
                        .defaultMinSize(minWidth = 20.dp, minHeight = 20.dp)
                        .clip(RoundedCornerShape(Radius.pill))
                        .background(RedCancel)
                        .border(2.dp, ScreenBg, RoundedCornerShape(Radius.pill))
                        .padding(horizontal = 5.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (unread > 99) "99+" else "$unread",
                        color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
        Spacer(Modifier.width(2.dp))
        // Avatar, ringed in brand violet with a presence dot on its corner.
        Box(Modifier.size(50.dp), contentAlignment = Alignment.Center) {
            Image(
                painterResource(R.drawable.dummy_avatar),
                contentDescription = "Profile",
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(46.dp)
                    .clip(RoundedCornerShape(Radius.pill))
                    .border(2.dp, Purple.copy(alpha = 0.5f), RoundedCornerShape(Radius.pill))
                    .clickable(onClick = onProfile),
            )
            Box(
                Modifier.align(Alignment.BottomEnd).size(12.dp)
                    .clip(RoundedCornerShape(Radius.pill))
                    .background(if (online) GreenSuccess else TextMuted)
                    .border(2.dp, ScreenBg, RoundedCornerShape(Radius.pill)),
            )
        }
    }
}

/** A floating white circle button — the header's drawer and bell affordance. */
@Composable
private fun CircleButton(onClick: () -> Unit, content: @Composable () -> Unit) {
    Box(
        Modifier.size(42.dp)
            .shadow(4.dp, RoundedCornerShape(Radius.pill), spotColor = Color(0x1A101828))
            .clip(RoundedCornerShape(Radius.pill))
            .background(CardBg)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
        content = { content() },
    )
}

/**
 * The one-line strip in Home's status slot: announcements when offline, online/idle state or an
 * incoming job request when online. Fixed single-line height in every variant, so switching
 * between them never changes Home's natural height (and so never re-triggers FitToScreen's
 * shrink). [background] paints a gradient variant; null uses the light tint.
 */
@Composable
private fun OnlineStatusStrip(
    background: Brush?,
    onLight: Boolean,
    title: String,
    subtitle: String,
    trailing: String?,
    onClick: () -> Unit,
) {
    val base = Modifier.fillMaxWidth().height(StatusSlotHeight).clip(RoundedCornerShape(Radius.button))
    val painted = if (background != null) base.background(background) else base.background(PurpleLight)
    Row(
        painted.clickable(onClick = onClick).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PulseDot(if (onLight) GreenSuccess else Color.White, 9.dp)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                title,
                color = if (onLight) TextDark else Color.White,
                fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
            )
            Text(
                subtitle,
                color = if (onLight) TextGray else Color.White.copy(alpha = 0.9f),
                fontSize = 11.5.sp, maxLines = 1,
            )
        }
        if (trailing != null) {
            Spacer(Modifier.width(8.dp))
            Text(
                trailing,
                color = if (onLight) GreenSuccess else Color.White,
                fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1,
            )
        }
        Icon(
            Icons.Filled.ChevronRight, contentDescription = null,
            tint = if (onLight) Purple else Color.White, modifier = Modifier.size(18.dp),
        )
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
            DrawerRow(Icons.Filled.History, "Transaction History", Color(0xFFEC4899)) { go(Routes.TRANSACTIONS) }
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
            DrawerRow(Icons.Filled.WorkspacePremium, "Skills & Services", Color(0xFF7C3AED)) { go(Routes.P_SKILLS) }
            DrawerRow(Icons.AutoMirrored.Filled.MenuBook, "Training", Color(0xFF0EA5E9)) { go(Routes.P_TRAINING) }
            DrawerRow(Icons.Filled.Inventory2, "My Equipment", Color(0xFF0891B2)) { go(Routes.P_EQUIPMENT) }
            DrawerRow(Icons.Filled.AccountBalance, "Bank Accounts", Color(0xFF14B8A6)) { go(Routes.BANK_ACCOUNTS) }
            DrawerRow(Icons.Filled.Tune, "Preferences", TextGray) { go(Routes.P_PREFERENCES) }
            DrawerRow(Icons.Filled.Notifications, "Notifications", PurpleMid) { go(Routes.P_NOTIFICATIONS) }

            DrawerSection("Support")
            DrawerRow(Icons.AutoMirrored.Filled.HelpOutline, "Help & Support", Purple) { go(Routes.P_HELP) }
            DrawerRow(Icons.Filled.Info, "About Us", TextGray) { go(Routes.P_ABOUT) }

            Spacer(Modifier.height(8.dp)); HairlineDivider(Modifier.padding(horizontal = 20.dp)); Spacer(Modifier.height(8.dp))
            DrawerRow(Icons.AutoMirrored.Filled.Logout, "Logout", RedCancel) {
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
