package com.homehelp.pro

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material.icons.filled.Shower
import androidx.compose.material.icons.filled.Weekend
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalLaundryService
import androidx.compose.material.icons.filled.Window
import androidx.compose.material.icons.filled.Air
import androidx.compose.material.icons.filled.LocalDining
import androidx.compose.material.icons.filled.Iron
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Chair
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.FormatListBulleted
import androidx.compose.material.icons.filled.CurrencyRupee
import androidx.compose.material.icons.filled.Kitchen
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.homehelp.pro.network.ScheduleItem
import kotlinx.coroutines.delay

// ─────────────────────────────────────────────────────────────────────────────────────────────
// JOBS (2_job.png) — Active / Upcoming / History.
//
// Replaces the old "My Bookings" list, which had Upcoming/Completed/Cancelled tabs and no way to
// reach the job you were actually working on. Everything here is real: the active job comes from
// the lifecycle state machine, upcoming from today's schedule feed, history from the bookings
// list. Figures the backend doesn't carry render "—" rather than being invented.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A glyph that actually means the service, as the mock does it (shower for bathroom, sofa for
 * upholstery, house for full-home). Cleaning-type services use the design's own bucket-and-mop
 * bitmap; everything else maps to the closest Material glyph.
 *
 * Returns null when the bucket bitmap should be drawn instead — see [ServiceGlyph].
 */
private fun serviceIcon(service: String): ImageVector? {
    val s = service.lowercase()
    return when {
        // Cleaning work → the bucket + mop artwork from the design.
        "deep clean" in s || "kitchen clean" in s || "kitchen deep" in s -> null
        "mop" in s || "sweep" in s || "dust" in s || "full home" in s && "clean" in s -> null
        "bathroom" in s || "toilet" in s || "shower" in s -> Icons.Filled.Shower
        "sofa" in s || "upholster" in s -> Icons.Filled.Weekend
        "chair" in s -> Icons.Filled.Chair
        "home" in s || "house" in s -> Icons.Filled.Home
        "iron" in s -> Icons.Filled.Iron
        "laundry" in s || "cloth" in s || "wash" in s && "dish" !in s -> Icons.Filled.LocalLaundryService
        "window" in s || "glass" in s -> Icons.Filled.Window
        "fan" in s -> Icons.Filled.Air
        "dish" in s || "utensil" in s -> Icons.Filled.LocalDining
        "fridge" in s || "refrigerat" in s -> Icons.Filled.Kitchen
        "bed" in s -> Icons.Filled.Bed
        "garbage" in s || "trash" in s || "waste" in s -> Icons.Filled.Delete
        else -> Icons.Filled.CleaningServices
    }
}

/** Draws the service's glyph — the design's bitmap for cleaning work, else a Material vector. */
@Composable
private fun ServiceGlyph(service: String, size: androidx.compose.ui.unit.Dp, tint: Color = Purple) {
    val icon = serviceIcon(service)
    if (icon == null) {
        Image(
            painter = painterResource(R.drawable.ic_job_cleaning),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            colorFilter = if (tint == Color.White) ColorFilter.tint(Color.White) else null,
            modifier = Modifier.size(size),
        )
    } else {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(size))
    }
}

private const val TAB_ACTIVE = "Active"
private const val TAB_UPCOMING = "Upcoming"
private const val TAB_HISTORY = "History"

@Composable
fun BookingsScreen(vm: AppViewModel, nav: NavHostController) {
    var tab by remember { mutableStateOf(TAB_ACTIVE) }
    var query by remember { mutableStateOf("") }
    var searching by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { if (vm.activeJob != null) vm.loadJobState() }

    val upcoming = vm.schedule.filter { it.status == "Upcoming" }
    val history = vm.bookings.filter { it.status == "Completed" || it.status == "Cancelled" }
    val counts = mapOf(
        TAB_ACTIVE to if (vm.activeJob != null) 1 else 0,
        TAB_UPCOMING to upcoming.size,
        TAB_HISTORY to history.size,
    )

    fun ScheduleItem.matches() = query.isBlank() ||
        service.contains(query, true) || location.contains(query, true) || customerName.contains(query, true)
    fun Booking.matches() = query.isBlank() ||
        (service ?: "").contains(query, true) || (address ?: "").contains(query, true) ||
        (customerName ?: "").contains(query, true)

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        // Title row — "Jobs" with search, per the design.
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.l).padding(top = Space.l, bottom = Space.s),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Jobs", color = TextDark, fontSize = 30.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Box(
                Modifier.size(38.dp).clip(RoundedCornerShape(Radius.pill))
                    .clickable { searching = !searching; if (!searching) query = "" },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (searching) Icons.Filled.Close else Icons.Filled.Search,
                    contentDescription = if (searching) "Close search" else "Search jobs",
                    tint = TextDark, modifier = Modifier.size(27.dp),
                )
            }
        }
        if (searching) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth().padding(horizontal = Space.l).padding(bottom = Space.s),
                placeholder = { Text("Search service, customer or area", fontSize = 13.sp) },
                singleLine = true,
                shape = RoundedCornerShape(Radius.pill),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.White,
                    unfocusedContainerColor = Color.White,
                    focusedBorderColor = Purple,
                    unfocusedBorderColor = Divider,
                    cursorColor = Purple,
                ),
            )
        }
        Box(Modifier.padding(horizontal = Space.l)) {
            SegmentedTabs(listOf(TAB_ACTIVE, TAB_UPCOMING, TAB_HISTORY), tab, counts = counts) { tab = it }
        }

        // Active is the overview the reference draws: active job + upcoming + history, all visible
        // at once. Upcoming/History are true lists, so those scroll.
        val fit: @Composable (@Composable () -> Unit) -> Unit = { body ->
            if (tab == TAB_ACTIVE) FitToScreen(Modifier.weight(1f).fillMaxWidth()) { body() }
            else Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) { body() }
        }
        fit {
        Column(
            Modifier.padding(horizontal = Space.l).padding(top = Space.s, bottom = Space.s),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            when (tab) {
                TAB_ACTIVE -> {
                    SectionLabel("Active Job")
                    val job = vm.activeJob
                    if (job == null) {
                        EmptyState("🛠", "No active job", "Go online and accept a job to see it here.")
                    } else {
                        ActiveJobCard(vm, job) { nav.navigate(resumeRouteFor(vm.jobStatus) ?: Routes.JOB_DETAILS) }
                    }
                    if (upcoming.isNotEmpty()) {
                        SectionHeader("Upcoming Jobs", onViewAll = { tab = TAB_UPCOMING })
                        upcoming.take(2).forEach { UpcomingJobCard(it) { nav.navigate(Routes.SCHEDULE) } }
                    }
                    if (history.isNotEmpty()) {
                        SectionHeader("Job History", onViewAll = { tab = TAB_HISTORY })
                        history.take(1).forEach { HistoryJobCard(it) }
                    }
                }
                TAB_UPCOMING -> {
                    val list = upcoming.filter { it.matches() }
                    SectionLabel("Upcoming Jobs")
                    if (list.isEmpty()) EmptyState("📅", "Nothing upcoming", "New bookings for today will appear here.")
                    else list.forEach { UpcomingJobCard(it) { nav.navigate(Routes.SCHEDULE) } }
                }
                else -> {
                    val list = history.filter { it.matches() }
                    SectionLabel("Job History")
                    if (list.isEmpty()) EmptyState("📜", "No history yet", "Completed and cancelled jobs land here.")
                    else list.forEach { HistoryJobCard(it) }
                }
            }
        }
        }
    }
}

/** Maps the lifecycle state to the screen that resumes it — same mapping Home's banner uses. */
private fun resumeRouteFor(status: JobStatus): String? = when (status) {
    JobStatus.REQUESTED -> Routes.NEW_JOB
    JobStatus.ACCEPTED -> Routes.JOB_DETAILS
    JobStatus.ON_THE_WAY -> Routes.ON_THE_WAY
    JobStatus.ARRIVED -> Routes.START_SERVICE
    JobStatus.IN_PROGRESS -> Routes.IN_PROGRESS
    JobStatus.COMPLETED -> Routes.JOB_COMPLETED
    else -> null
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold)
}

@Composable
private fun SectionHeader(text: String, onViewAll: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        Text(
            "View All", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.clickable(onClick = onViewAll),
        )
    }
}

/**
 * The live job: status, a four-figure stat strip (started / elapsed / tasks / earnings) and the
 * two actions the worker actually needs mid-job. Elapsed excludes paused time, so it matches the
 * in-progress timer exactly.
 */
@Composable
private fun ActiveJobCard(vm: AppViewModel, job: Job, onContinue: () -> Unit) {
    val ctx = LocalContext.current
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(vm.jobStatus) { while (true) { nowMs = System.currentTimeMillis(); delay(1000) } }

    val startMs = remember(job.startedAt, vm.serviceStartMs) {
        parseIsoMillisPublic(job.startedAt) ?: vm.serviceStartMs.takeIf { it > 0L }
    }
    val running = vm.jobStatus == JobStatus.IN_PROGRESS && startMs != null
    val elapsedSec = if (running) {
        ((nowMs - startMs!! - vm.pausedMsAt(nowMs)) / 1000L).toInt().coerceAtLeast(0)
    } else 0

    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(Radius.card))
            .background(ActiveJobTint)
            .border(1.dp, ActiveJobBorder, RoundedCornerShape(Radius.card))
            .padding(18.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Box(
                Modifier.size(78.dp).clip(RoundedCornerShape(18.dp)).background(EarningsGradient),
                contentAlignment = Alignment.Center,
            ) {
                // White on the violet tile: the source glyph is brand-purple and was near-
                // invisible against it. The mock draws this one white.
                ServiceGlyph(job.services.firstOrNull() ?: "", 50.dp, Color.White)
            }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text(job.services.joinToString(", "), color = TextDark, fontSize = 21.sp, fontWeight = FontWeight.Bold, lineHeight = 25.sp)
                Spacer(Modifier.height(5.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Person, contentDescription = null, tint = TextMuted, modifier = Modifier.size(19.dp))
                    Spacer(Modifier.width(5.dp))
                    Text(job.customerName, color = TextGray, fontSize = 16.sp, maxLines = 1)
                }
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = TextMuted, modifier = Modifier.size(19.dp))
                    Spacer(Modifier.width(5.dp))
                    Text(job.area, color = TextGray, fontSize = 16.sp, maxLines = 1)
                }
            }
            Spacer(Modifier.width(Space.s))
            Column(horizontalAlignment = Alignment.End) {
                Text("₹${job.earnings}", color = TextDark, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                StatusPill(statusLabel(vm.jobStatus, vm.jobPaused), if (vm.jobPaused) GoldLight else GreenLight, if (vm.jobPaused) Amber else GreenSuccess)
            }
        }
        Spacer(Modifier.height(Space.m))
        Row(
            Modifier.fillMaxWidth().height(IntrinsicSize.Min)
                .clip(RoundedCornerShape(12.dp))
                .background(Color.White)
                .border(1.dp, Divider, RoundedCornerShape(12.dp))
                .padding(vertical = 15.dp),
        ) {
            JobStat(Modifier.weight(1f), Icons.Filled.Schedule, "Started At", if (startMs != null) clockOf(startMs) else "—", TextDark)
            StatDivider()
            JobStat(Modifier.weight(1f), Icons.Filled.Timer, "Time Elapsed", if (running) hhmmss(elapsedSec) else "—", Purple)
            StatDivider()
            JobStat(
                Modifier.weight(1f), Icons.Filled.FormatListBulleted, "Tasks",
                if (vm.checklist.isEmpty()) "—" else "${vm.checklistDone} / ${vm.checklist.size}", Purple,
            )
            StatDivider()
            JobStat(Modifier.weight(1f), Icons.Filled.CurrencyRupee, "Earnings", "₹${job.earnings + vm.extrasTotal}", GreenSuccess)
        }
        Spacer(Modifier.height(Space.m))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
            Box(Modifier.weight(1f)) {
                OutlineButton("📞  Call Customer", modifier = Modifier.fillMaxWidth()) { dialCustomerPhone(ctx, job.customerPhone) }
            }
            Box(Modifier.weight(1f)) {
                PrimaryButton("Continue Job  ›", onClick = onContinue)
            }
        }
    }
}

private fun statusLabel(status: JobStatus, paused: Boolean) = when {
    paused -> "Paused"
    status == JobStatus.IN_PROGRESS -> "In Progress"
    status == JobStatus.ON_THE_WAY -> "On the way"
    status == JobStatus.ARRIVED -> "Arrived"
    status == JobStatus.ACCEPTED -> "Accepted"
    status == JobStatus.REQUESTED -> "New request"
    status == JobStatus.COMPLETED -> "Completed"
    else -> "Active"
}

@Composable
private fun JobStat(
    modifier: Modifier,
    icon: ImageVector,
    label: String,
    value: String,
    valueColor: Color,
) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(24.dp))
        Spacer(Modifier.height(5.dp))
        Text(label, color = TextGray, fontSize = 13.sp, maxLines = 1)
        Spacer(Modifier.height(5.dp))
        Text(value, color = valueColor, fontSize = 18.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
private fun StatDivider() {
    Box(Modifier.padding(horizontal = 2.dp).width(1.dp).fillMaxHeight().background(Divider))
}

/** One of today's upcoming jobs: when, where, how far, what it pays, and how long until it starts. */
@Composable
private fun UpcomingJobCard(item: ScheduleItem, onClick: () -> Unit) {
    Card(padding = Dp16.M) {
        Row(Modifier.fillMaxWidth().clickable(onClick = onClick), verticalAlignment = Alignment.Top) {
            Box(
                Modifier.size(72.dp).clip(RoundedCornerShape(18.dp)).background(Primary50),
                contentAlignment = Alignment.Center,
            ) { ServiceGlyph(item.service, 48.dp) }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text(item.service, color = TextDark, fontSize = 19.sp, fontWeight = FontWeight.Bold, lineHeight = 22.sp)
                Spacer(Modifier.height(4.dp))
                IconLine(Icons.Filled.Schedule, jobWindow(item.time, item.durationMins), 15.5.sp)
                Spacer(Modifier.height(3.dp))
                IconLine(Icons.Filled.LocationOn, item.location, 15.5.sp)
                Spacer(Modifier.height(3.dp))
                IconLine(Icons.Filled.SwapVert, item.distanceKm?.let { "$it km away" } ?: "— km away", 15.5.sp)
            }
            Spacer(Modifier.width(Space.s))
            Column(horizontalAlignment = Alignment.End) {
                Text(if (item.earnings > 0) "₹${item.earnings}" else "—", color = TextDark, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                // "In 1h 45m" — from the ETA the backend derives; "—" when it has no GPS fix.
                Row(
                    Modifier.clip(RoundedCornerShape(Radius.pill)).background(Primary50).padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Schedule, contentDescription = null, tint = Purple, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(item.etaMins?.let { "In ${etaWords(it)}" } ?: "Scheduled", color = Purple, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun HistoryJobCard(b: Booking) {
    val done = b.status == "Completed"
    Card(padding = Dp16.M) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Box(
                Modifier.size(58.dp).clip(RoundedCornerShape(Radius.pill)).background(if (done) GreenSuccess else RedLight),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (done) Icons.Filled.CheckCircle else Icons.Filled.Close,
                    contentDescription = null,
                    tint = if (done) Color.White else RedCancel,
                    modifier = Modifier.size(34.dp),
                )
            }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text(b.service ?: "Service", color = TextDark, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(3.dp))
                IconLine(Icons.Filled.Schedule, b.timeInfo ?: "—", 15.sp)
                Spacer(Modifier.height(2.dp))
                IconLine(Icons.Filled.LocationOn, b.address ?: "—", 15.sp)
            }
            Spacer(Modifier.width(Space.s))
            Column(horizontalAlignment = Alignment.End) {
                Text("₹${b.amount}", color = TextDark, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(5.dp))
                StatusPill(
                    b.status ?: "—",
                    if (done) GreenLight else RedLight,
                    if (done) GreenSuccess else RedCancel,
                )
            }
        }
    }
}

@Composable
private fun IconLine(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String,
    size: androidx.compose.ui.unit.TextUnit = 11.5.sp,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = TextMuted, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(5.dp))
        Text(text, color = TextGray, fontSize = size, maxLines = 1)
    }
}

private fun etaWords(mins: Int): String =
    if (mins < 60) "${mins}m" else "${mins / 60}h ${mins % 60}m"

private fun hhmmss(sec: Int): String = "%02d:%02d:%02d".format(sec / 3600, (sec % 3600) / 60, sec % 60)

private fun clockOf(ms: Long): String =
    java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault()).format(java.util.Date(ms))

/** "2:30 PM – 3:30 PM" from a start clock + booked minutes; the start alone if we can't parse it. */
private fun jobWindow(start: String, durationMins: Int): String {
    if (start.isBlank()) return "—"
    if (durationMins <= 0) return start
    return runCatching {
        val fmt = java.text.SimpleDateFormat("hh:mm a", java.util.Locale.US)
        val d = fmt.parse(start) ?: return start
        val end = java.util.Date(d.time + durationMins * 60_000L)
        "$start – ${fmt.format(end)}"
    }.getOrDefault(start)
}
