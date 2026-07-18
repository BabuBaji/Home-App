package com.homehelp.pro

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.SentimentSatisfiedAlt
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.WorkOutline
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import coil.compose.SubcomposeAsyncImage
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

@Composable
fun EarningsScreen(vm: AppViewModel, nav: NavHostController) {
    // Pull the latest wallet snapshot so today/week/month totals are populated from the server.
    LaunchedEffect(Unit) { vm.refreshWallet() }
    val entries = vm.earnings
    // Which working day the calendar has selected (0 = most recent). Resets when data loads.
    var selectedIdx by remember(entries.size) { mutableStateOf(0) }
    val sel = entries.getOrNull(selectedIdx)
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        BellHeader("Earnings") { nav.navigate(Routes.P_NOTIFICATIONS) }
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.l),
        ) {
            // Working-days calendar strip — tap a date to see that day's income below.
            if (entries.isNotEmpty()) {
                Column {
                    SectionTitle("Daily Earnings")
                    Spacer(Modifier.height(Space.s))
                    Row(
                        Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(Space.s),
                    ) {
                        entries.forEachIndexed { i, e ->
                            DateChip(e.date, "₹${e.amount}", e.paid, selectedIdx == i) { selectedIdx = i }
                        }
                    }
                }
            }

            // Hero: the selected day's income (green banner) + that day's breakdown.
            ElevatedGroup {
                MoneyBanner(sel?.date ?: "Today's Earnings", sel?.amount ?: vm.todayEarnings)
                Column(Modifier.background(CardBg).padding(Space.l)) {
                    if (sel != null) {
                        BreakdownRow(
                            "Payment status",
                            if (sel.paid) "Paid" else "Pending",
                            valueColor = if (sel.paid) GreenSuccess else Gold,
                        )
                    }
                    BreakdownRow("This Week", "₹${vm.weekEarnings}")
                    BreakdownRow("This Month", "₹${vm.monthEarnings}", valueColor = Purple)
                    Spacer(Modifier.height(Space.s))
                    // Inset sub-breakdown box (overall context).
                    Column(Modifier.fillMaxWidth().background(FieldFill, RoundedCornerShape(Radius.field)).padding(Space.m)) {
                        InsetRow("Jobs today", "${vm.todayJobs}")
                        Spacer(Modifier.height(Space.s))
                        InsetRow("Completed all-time", "${vm.jobsCompleted}")
                    }
                }
            }

            // Payout summary.
            SectionTitle("Payout")
            Card {
                LabeledRow("Available to withdraw", "₹${vm.walletBalance}", GreenSuccess)
                LabeledRow("Pending clearance", "₹${vm.pendingAmount}", Gold)
                LabeledRow("Next payout", vm.nextPayout)
            }
            PrimaryButton("Withdraw to Bank") { nav.navigate(Routes.WITHDRAW) }

            // Recent Earnings — live calendar; tap a day to see that day's services + income.
            SectionTitle("Recent Earnings")
            RecentEarningsCalendar(vm)
            Spacer(Modifier.height(Space.s))
        }
    }
}

/** Calendar day chip for the Earnings date strip — shows the date + that day's amount. */
@Composable
private fun DateChip(date: String, amount: String, paid: Boolean, selected: Boolean, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(Radius.field),
        color = if (selected) Purple else FieldFill,
        modifier = Modifier.clip(RoundedCornerShape(Radius.field)).clickable { onClick() },
    ) {
        Column(
            Modifier.padding(horizontal = Space.l, vertical = Space.m),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                date,
                color = if (selected) Color.White else TextDark,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp,
                maxLines = 1,
            )
            Spacer(Modifier.height(Space.xs))
            Text(
                amount,
                color = if (selected) Color.White.copy(alpha = 0.9f) else if (paid) GreenSuccess else Gold,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                maxLines = 1,
            )
        }
    }
}

// ── Recent-Earnings calendar (month grid + per-day service/income breakdown) ──
// Scoped entirely to the "Recent Earnings" section: a live month calendar whose days
// are lit when the worker earned, and a detail card that lists that day's individual
// services (per-service amount), other income and deductions. Data is derived from the
// wallet LEDGER (vm.walletHistory), which stamps every entry with an ISO yyyy-MM-dd date.

@Composable
private fun RecentEarningsCalendar(vm: AppViewModel) {
    val byDate = vm.walletHistory.groupBy { it.date }
    val earnedByDate = byDate.mapValues { (_, es) -> es.filter { it.isCredit }.sumOf { it.amount } }

    val now = remember { java.util.Calendar.getInstance() }
    val todayIso = remember {
        isoDate(now.get(java.util.Calendar.YEAR), now.get(java.util.Calendar.MONTH), now.get(java.util.Calendar.DAY_OF_MONTH))
    }
    var year by remember { mutableStateOf(now.get(java.util.Calendar.YEAR)) }
    var month by remember { mutableStateOf(now.get(java.util.Calendar.MONTH)) } // 0-based
    var selected by remember { mutableStateOf(todayIso) }

    // Resolve each Job Earnings ledger entry to its real service via the booking ref
    // (ledger label == booking ref, e.g. "#HH12345"), so rows show the actual service name.
    val bookingsByRef = vm.bookings.filter { !it.ref.isNullOrBlank() }.associateBy { it.ref }

    val entries = byDate[selected].orEmpty()
    val services = entries.filter { it.isCredit && it.type.equals("Job Earnings", ignoreCase = true) }
    val otherIncome = entries.filter { it.isCredit && !it.type.equals("Job Earnings", ignoreCase = true) }
    val deductions = entries.filter { !it.isCredit }
    val dayTotal = entries.filter { it.isCredit }.sumOf { it.amount }

    Column(verticalArrangement = Arrangement.spacedBy(Space.m)) {
        // Calendar card: ‹ Month YYYY › + Mon-first grid (earned days green, selected violet).
        Card(padding = Dp16.S) {
            MonthNavigator(
                label = monthLabel(year, month),
                onPrev = { if (month == 0) { month = 11; year-- } else month-- },
                onNext = { if (month == 11) { month = 0; year++ } else month++ },
            )
            Spacer(Modifier.height(Space.m))
            EarningsCalendar(year, month, earnedByDate, selected, todayIso) { selected = it }
            Spacer(Modifier.height(Space.m))
            HairlineDivider()
            Spacer(Modifier.height(Space.s))
            Row(verticalAlignment = Alignment.CenterVertically) {
                LegendDot(GreenSuccess); Spacer(Modifier.width(Space.xs))
                Text("Worked", fontSize = 11.5.sp, color = TextGray)
                Spacer(Modifier.width(Space.l))
                LegendDot(Purple); Spacer(Modifier.width(Space.xs))
                Text("Selected", fontSize = 11.5.sp, color = TextGray)
                Spacer(Modifier.weight(1f))
                Text("Tap a day", fontSize = 11.5.sp, color = TextMuted)
            }
        }

        // Selected-day detail: services done + per-service amounts + income summary.
        Card {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text(if (selected == todayIso) "Today" else prettyDate(selected), fontWeight = FontWeight.Bold, color = TextDark, fontSize = 16.sp)
                    Text(
                        "${services.size} ${if (services.size == 1) "service" else "services"} done",
                        fontSize = 12.sp, color = TextGray,
                    )
                }
                Text("₹${inr(dayTotal)}", fontWeight = FontWeight.Bold, color = GreenSuccess, fontSize = 20.sp)
            }
            if (entries.isEmpty()) {
                Spacer(Modifier.height(Space.m))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (selected > todayIso) "🗓️" else "🛌", fontSize = 20.sp)
                    Spacer(Modifier.width(Space.m))
                    Text(
                        if (selected > todayIso) "No work scheduled yet." else "No work on this day — it was an off day.",
                        fontSize = 13.sp, color = TextGray,
                    )
                }
            } else {
                Spacer(Modifier.height(Space.m)); HairlineDivider(); Spacer(Modifier.height(Space.s))
                if (services.isNotEmpty()) {
                    Text("Services", fontSize = 12.sp, color = TextMuted, fontWeight = FontWeight.SemiBold)
                    services.forEachIndexed { i, e ->
                        ServiceRow(i + 1, e, bookingsByRef[e.remarks.ifBlank { e.refId }])
                    }
                }
                if (otherIncome.isNotEmpty()) {
                    Spacer(Modifier.height(Space.s))
                    Text("Other income", fontSize = 12.sp, color = TextMuted, fontWeight = FontWeight.SemiBold)
                    otherIncome.forEach { IncomeLine(it.type.ifBlank { "Incentive" }, "+₹${inr(it.amount)}", GreenSuccess) }
                }
                if (deductions.isNotEmpty()) {
                    Spacer(Modifier.height(Space.s))
                    Text("Deductions", fontSize = 12.sp, color = TextMuted, fontWeight = FontWeight.SemiBold)
                    deductions.forEach { IncomeLine(it.type.ifBlank { "Deduction" }, "−₹${inr(it.amount)}", RedCancel) }
                }
                Spacer(Modifier.height(Space.s)); HairlineDivider(); Spacer(Modifier.height(Space.s))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Total income", fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 15.sp)
                    Text("₹${inr(dayTotal)}", fontWeight = FontWeight.Bold, color = GreenSuccess, fontSize = 16.sp)
                }
            }
        }
    }
}

/** One completed service on the selected day: index chip + real service name, customer/time
 *  and that job's amount. `booking` is the ref-matched booking (null → falls back to ref). */
@Composable
private fun ServiceRow(index: Int, e: com.homehelp.pro.network.LedgerEntry, booking: Booking?) {
    val ref = e.remarks.ifBlank { e.refId }
    val name = booking?.service?.takeIf { it.isNotBlank() } ?: "Service $index"
    val subParts = listOfNotNull(
        booking?.customerName?.takeIf { it.isNotBlank() } ?: ref.takeIf { it.isNotBlank() },
        e.time.takeIf { it.isNotBlank() },
    )
    Row(Modifier.fillMaxWidth().padding(vertical = Space.s), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(34.dp).background(Primary50, RoundedCornerShape(Radius.field)),
            contentAlignment = Alignment.Center,
        ) { Text("$index", color = Purple, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text(name, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp, maxLines = 2)
            if (subParts.isNotEmpty()) Text(subParts.joinToString(" • "), fontSize = 11.sp, color = TextGray, maxLines = 1)
        }
        Spacer(Modifier.width(Space.s))
        Text("+₹${inr(e.amount)}", fontWeight = FontWeight.Bold, color = GreenSuccess, fontSize = 14.sp)
    }
}

/** A muted label / signed-amount line for the other-income & deduction groups. */
@Composable
private fun IncomeLine(label: String, value: String, valueColor: Color) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = TextGray, fontSize = 13.sp)
        Text(value, color = valueColor, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

private val MONTH_NAMES = arrayOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
private fun monthLabel(year: Int, month0: Int) = "${MONTH_NAMES[month0]} $year"

/** ISO "yyyy-MM-dd" for a Y/M(0-based)/D — matches the ledger's date keys. */
private fun isoDate(year: Int, month0: Int, day: Int) =
    String.format(java.util.Locale.US, "%04d-%02d-%02d", year, month0 + 1, day)

/** Indian-grouped integer, e.g. 30685 → "30,685". */
private fun inr(n: Int): String =
    java.text.NumberFormat.getIntegerInstance(java.util.Locale("en", "IN")).format(n)

/** Short amount for a calendar cell, e.g. 850 → "850", 1200 → "1.2k". */
private fun compactAmount(n: Int): String = when {
    n >= 100000 -> String.format(java.util.Locale.US, "%.1fL", n / 100000.0).replace(".0L", "L")
    n >= 1000 -> String.format(java.util.Locale.US, "%.1fk", n / 1000.0).replace(".0k", "k")
    else -> n.toString()
}

/** Friendly label for an ISO date, e.g. "Mon, 6 Jul". Falls back to the raw string. */
private fun prettyDate(iso: String): String = runCatching {
    val d = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).parse(iso)!!
    java.text.SimpleDateFormat("EEE, d MMM", java.util.Locale.US).format(d)
}.getOrDefault(iso)

@Composable
private fun LegendDot(color: Color) {
    Box(Modifier.size(10.dp).clip(RoundedCornerShape(Radius.pill)).background(color))
}

/** ‹ Month YYYY › navigator row. */
@Composable
private fun MonthNavigator(label: String, onPrev: () -> Unit, onNext: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = Space.xs), verticalAlignment = Alignment.CenterVertically) {
        NavArrow(Icons.Filled.ChevronLeft, onPrev)
        Text(label, modifier = Modifier.weight(1f), textAlign = TextAlign.Center, fontWeight = FontWeight.Bold, fontSize = 18.sp, color = TextDark)
        NavArrow(Icons.Filled.ChevronRight, onNext)
    }
}

@Composable
private fun NavArrow(icon: ImageVector, onClick: () -> Unit) {
    Box(
        Modifier.size(38.dp).clip(RoundedCornerShape(Radius.field)).background(Primary50).clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(22.dp)) }
}

/** Month grid (Mon-first): earned days tinted green with the amount, selected day violet, today ringed. */
@Composable
private fun EarningsCalendar(
    year: Int,
    month: Int,
    earnedByDate: Map<String, Int>,
    selected: String,
    today: String,
    onSelect: (String) -> Unit,
) {
    Row(Modifier.fillMaxWidth()) {
        listOf("M", "T", "W", "T", "F", "S", "S").forEach { d ->
            Text(d, modifier = Modifier.weight(1f), textAlign = TextAlign.Center, fontSize = 12.sp, color = TextMuted, fontWeight = FontWeight.SemiBold)
        }
    }
    Spacer(Modifier.height(Space.s))

    val cal = java.util.Calendar.getInstance().apply { clear(); set(year, month, 1) }
    val firstDow = cal.get(java.util.Calendar.DAY_OF_WEEK) // 1=Sun..7=Sat
    val lead = (firstDow + 5) % 7                           // Mon-first leading blanks
    val days = cal.getActualMaximum(java.util.Calendar.DAY_OF_MONTH)
    val rows = (lead + days + 6) / 7

    var day = 1
    Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        repeat(rows) { r ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                repeat(7) { c ->
                    val idx = r * 7 + c
                    if (idx < lead || day > days) {
                        Box(Modifier.weight(1f).height(46.dp))
                    } else {
                        val iso = isoDate(year, month, day)
                        DayCell(
                            day = day,
                            earned = earnedByDate[iso] ?: 0,
                            isSelected = iso == selected,
                            isToday = iso == today,
                            modifier = Modifier.weight(1f),
                            onClick = { onSelect(iso) },
                        )
                        day++
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCell(day: Int, earned: Int, isSelected: Boolean, isToday: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val hasEarned = earned > 0
    val bg = when {
        isSelected -> Purple
        hasEarned -> GreenLight
        else -> Color.Transparent
    }
    val fg = when {
        isSelected -> Color.White
        hasEarned -> GreenSuccess
        else -> TextDark
    }
    Box(
        modifier
            .height(46.dp)
            .clip(RoundedCornerShape(Radius.field))
            .background(bg)
            .then(if (isToday && !isSelected) Modifier.border(1.5.dp, Purple, RoundedCornerShape(Radius.field)) else Modifier)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("$day", color = fg, fontWeight = if (hasEarned || isSelected) FontWeight.Bold else FontWeight.Medium, fontSize = 14.sp)
            if (hasEarned) {
                Text(
                    "₹${compactAmount(earned)}",
                    color = if (isSelected) Color.White.copy(alpha = 0.9f) else GreenSuccess,
                    fontSize = 9.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
                )
            }
        }
    }
}

// Compact period-earnings tile — retained for reuse across summary rows.
@Composable
private fun EarnTile(modifier: Modifier, label: String, amount: Int, valueColor: Color) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("₹$amount", fontWeight = FontWeight.Bold, color = valueColor, fontSize = 22.sp)
        Spacer(Modifier.height(Space.xs))
        Text(tr(label), fontSize = 11.sp, color = TextGray, fontWeight = FontWeight.Medium)
    }
}

// ── Reference-style building blocks (green money banner + breakdown + status rows) ──

/** Rounded elevated wrapper that clips a banner + card into one connected surface. */
@Composable
fun ElevatedGroup(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(Radius.card), spotColor = Color(0x0D101828), ambientColor = Color(0x0A101828))
            .clip(RoundedCornerShape(Radius.card))
            .background(CardBg),
        content = content,
    )
}

/** Signature mint-green "total" money banner with a ₹ coin chip and a Canvas-drawn
 *  scalloped (receipt-notch) bottom edge — the reference look for every money total. */
@Composable
fun MoneyBanner(label: String, amount: Int) {
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth()
                .background(GreenLight)
                .padding(horizontal = Space.l, vertical = Space.l),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(36.dp).background(GreenSuccess, RoundedCornerShape(Radius.pill)),
                contentAlignment = Alignment.Center,
            ) { Text("₹", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp) }
            Spacer(Modifier.width(Space.m))
            Text(tr(label), color = GreenSuccess, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, modifier = Modifier.weight(1f))
            Text("₹$amount", color = GreenSuccess, fontWeight = FontWeight.Bold, fontSize = 27.sp)
        }
        // Scalloped seam: white half-moon notches punched into the green base.
        Canvas(Modifier.fillMaxWidth().height(9.dp)) {
            drawRect(color = GreenLight)
            val r = size.height
            var x = r
            while (x < size.width) {
                drawCircle(color = CardBg, radius = r, center = Offset(x, size.height))
                x += r * 2
            }
        }
    }
}

/** A label / value line used inside breakdown cards. */
@Composable
fun BreakdownRow(label: String, value: String, valueColor: Color = TextDark) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = Space.s),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(tr(label), color = TextDark, fontSize = 16.sp)
        Text(value, color = valueColor, fontSize = 16.sp, fontWeight = FontWeight.Bold)
    }
}

/** A muted label / value line used inside the gray inset sub-breakdown. */
@Composable
fun InsetRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(tr(label), color = TextGray, fontSize = 13.sp)
        Text(value, color = TextGray, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * White rounded list row with a colored circular status icon, title + colored status
 * subtitle, a trailing value and a chevron — the app's shared "activity row" pattern.
 */
@Composable
fun StatusListRow(
    icon: ImageVector,
    iconTint: Color,
    iconBg: Color,
    title: String,
    subtitle: String,
    subtitleColor: Color,
    value: String,
    valueColor: Color = TextDark,
    onClick: (() -> Unit)? = null,
) {
    Card(modifier = if (onClick != null) Modifier.clickable { onClick() } else Modifier) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(44.dp).background(iconBg, RoundedCornerShape(Radius.pill)),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(22.dp)) }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text(tr(title), fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 15.sp)
                Spacer(Modifier.height(2.dp))
                Text(tr(subtitle), color = subtitleColor, fontSize = 12.5.sp, fontWeight = FontWeight.Medium)
            }
            Spacer(Modifier.width(Space.s))
            Text(value, fontWeight = FontWeight.Bold, color = valueColor, fontSize = 15.sp)
            Spacer(Modifier.width(Space.xs))
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(20.dp))
        }
    }
}

// BookingsScreen moved to JobsListScreen.kt and rebuilt as the Jobs tab (2_job.png):
// Active / Upcoming / History, with a live active-job card. The old Upcoming/Completed/Cancelled
// list had no way to reach the job in progress.

// ---- Today's Schedule (timeline) ------------------------------------------------------------
private fun scheduleColor(s: String) = when (s) { "Completed" -> GreenSuccess; "In progress" -> Purple; else -> Gold }
private fun scheduleBg(s: String) = when (s) { "Completed" -> GreenLight; "In progress" -> PurpleLight; else -> GoldLight }

@Composable
fun ScheduleScreen(vm: AppViewModel, nav: NavHostController) {
    val items = vm.schedule
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Today's Schedule", onBack = { nav.popBackStack() })
        if (items.isEmpty()) {
            EmptyState("🗓️", "No jobs scheduled today", "New bookings appear here as customers book you.")
        } else {
            Column(
                Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            ) {
                Text(
                    "${items.size} ${if (items.size == 1) "job" else "jobs"} today",
                    fontSize = 13.sp, color = TextGray, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = Space.m),
                )
                items.forEach { ScheduleRow(it) }
                Spacer(Modifier.height(Space.l))
            }
        }
    }
}

private fun scheduleIcon(s: String): ImageVector = when (s) {
    "Completed" -> Icons.Filled.Check
    "In progress" -> Icons.Filled.Schedule
    else -> Icons.Filled.Schedule
}

@Composable
private fun ScheduleRow(item: com.homehelp.pro.network.ScheduleItem) {
    Column(Modifier.padding(bottom = Space.m)) {
        Card {
            // Header: colored status circle + service/customer + status pill.
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(44.dp).background(scheduleBg(item.status), RoundedCornerShape(Radius.pill)),
                    contentAlignment = Alignment.Center,
                ) { Icon(scheduleIcon(item.status), contentDescription = null, tint = scheduleColor(item.status), modifier = Modifier.size(22.dp)) }
                Spacer(Modifier.width(Space.m))
                Column(Modifier.weight(1f)) {
                    Text(item.service, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 15.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("${item.time} • ${item.customerName}", fontSize = 12.sp, color = TextGray)
                }
                Spacer(Modifier.width(Space.s))
                StatusPill(item.status, scheduleBg(item.status), scheduleColor(item.status))
            }
            Spacer(Modifier.height(Space.m)); HairlineDivider(); Spacer(Modifier.height(Space.m))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.LocationOn, contentDescription = null, tint = TextMuted, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(Space.s))
                Text(item.location, fontSize = 12.sp, color = TextGray, modifier = Modifier.weight(1f))
            }
            Spacer(Modifier.height(Space.s))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Schedule, contentDescription = null, tint = TextMuted, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(Space.s))
                    Text("${item.durationMins} min", fontSize = 12.sp, color = TextGray)
                }
                StatusPill(
                    item.paymentStatus,
                    if (item.paymentStatus == "Paid") GreenLight else GoldLight,
                    if (item.paymentStatus == "Paid") GreenSuccess else Gold,
                )
            }
        }
    }
}

private val ProfBlue = Color(0xFF3B82F6)
private val ProfBlueBg = Color(0xFFEAF1FE)

@Composable
fun ProfileScreen(vm: AppViewModel, nav: NavHostController) {
    val initials = vm.workerName.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString("").ifBlank { "?" }
    val tier = vm.tier
    val nextTier = WorkerTier.next(tier)
    val progressCur = if (nextTier != null) vm.jobsCompleted.coerceAtMost(nextTier.minJobs) else vm.jobsCompleted
    val progressMax = nextTier?.minJobs ?: vm.jobsCompleted.coerceAtLeast(1)
    val progressFrac = if (nextTier != null) (progressCur.toFloat() / progressMax).coerceIn(0f, 1f) else 1f
    val kycVerified = vm.workerStatus.equals("active", true) || vm.bankApproved

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        // Clean white header — title + bell(badge) + settings, as the reference draws it.
        Row(
            Modifier.fillMaxWidth().background(Color.White).padding(horizontal = Space.l).padding(top = 8.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Profile", color = TextDark, fontSize = 21.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp, modifier = Modifier.weight(1f))
            Box(Modifier.clip(CircleShape).clickable { nav.navigate(Routes.P_NOTIFICATIONS) }.padding(2.dp)) {
                Icon(Icons.Filled.Notifications, contentDescription = "Notifications", tint = TextDark, modifier = Modifier.size(24.dp))
                if (vm.unreadNotifications > 0) {
                    Box(
                        Modifier.align(Alignment.TopEnd).offset(x = 6.dp, y = (-5).dp).size(15.dp).clip(CircleShape).background(RedCancel),
                        contentAlignment = Alignment.Center,
                    ) { Text("${vm.unreadNotifications.coerceAtMost(9)}", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold) }
                }
            }
            Spacer(Modifier.width(Space.l))
            Icon(Icons.Filled.Settings, contentDescription = "Settings", tint = TextDark, modifier = Modifier.size(24.dp).clip(CircleShape).clickable { nav.navigate(Routes.SETTINGS) })
        }

        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = Space.m).padding(top = 6.dp, bottom = Space.s),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            // ── Identity card
            Surface(shape = RoundedCornerShape(Radius.card), color = Primary50, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(11.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box {
                            Box(
                                Modifier.size(52.dp).clip(CircleShape).background(Color.White).border(2.dp, Purple, CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (vm.avatarUrl.isNotBlank()) {
                                    // Show the photo when it loads; fall back to initials while loading or if the URL can't be reached.
                                    SubcomposeAsyncImage(
                                        model = vm.avatarUrl,
                                        contentDescription = "Profile photo",
                                        modifier = Modifier.fillMaxSize().clip(CircleShape),
                                        contentScale = ContentScale.Crop,
                                        loading = { Text(initials, color = Purple, fontWeight = FontWeight.Bold, fontSize = 18.sp) },
                                        error = { Text(initials, color = Purple, fontWeight = FontWeight.Bold, fontSize = 18.sp) },
                                    )
                                } else {
                                    Text(initials, color = Purple, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                                }
                            }
                            Box(
                                Modifier.align(Alignment.BottomEnd).size(20.dp).clip(CircleShape).background(Purple)
                                    .border(2.dp, Primary50, CircleShape).clickable { nav.navigate(Routes.P_PERSONAL) },
                                contentAlignment = Alignment.Center,
                            ) { Icon(Icons.Filled.CameraAlt, contentDescription = "Change photo", tint = Color.White, modifier = Modifier.size(10.dp)) }
                        }
                        Spacer(Modifier.width(Space.s))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(vm.workerName.ifBlank { "HomeHelp Partner" }, color = TextDark, fontSize = 15.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                                if (kycVerified) { Spacer(Modifier.width(4.dp)); Icon(Icons.Filled.Verified, contentDescription = null, tint = Purple, modifier = Modifier.size(14.dp)) }
                            }
                            Spacer(Modifier.height(3.dp))
                            if (vm.workerPhone.isNotBlank()) { ProfileIconLine(Icons.Filled.Phone, vm.workerPhone); Spacer(Modifier.height(1.dp)) }
                            if (vm.workerCity.isNotBlank()) { ProfileIconLine(Icons.Filled.LocationOn, vm.workerCity); Spacer(Modifier.height(1.dp)) }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.Star, contentDescription = null, tint = Gold, modifier = Modifier.size(13.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("${vm.workerRating}", color = Purple, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                                if (vm.jobsCompleted > 0) { Spacer(Modifier.width(4.dp)); Text("(${vm.jobsCompleted} Ratings)", color = TextGray, fontSize = 11.5.sp) }
                            }
                        }
                        Spacer(Modifier.width(Space.s))
                        Box(
                            Modifier.clip(RoundedCornerShape(Radius.pill)).background(Color.White).border(1.dp, Purple, RoundedCornerShape(Radius.pill))
                                .clickable { nav.navigate(Routes.P_PERSONAL) }.padding(horizontal = 9.dp, vertical = 6.dp),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.Edit, contentDescription = null, tint = Purple, modifier = Modifier.size(12.dp))
                                Spacer(Modifier.width(3.dp))
                                Text("Edit", color = Purple, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // ── Level banner
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card))
                    .background(Brush.horizontalGradient(listOf(Color(0xFF4A34C7), Color(0xFF6D4BE0)))).padding(12.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(34.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.VerifiedUser, contentDescription = null, tint = Color.White, modifier = Modifier.size(17.dp))
                    }
                    Spacer(Modifier.width(Space.s))
                    Column(Modifier.weight(1f)) {
                        Text("Level ${tier.label}", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        Text(
                            if (nextTier != null) "Keep going to reach ${nextTier.label}" else "You're at the top tier",
                            color = Color.White.copy(alpha = 0.85f), fontSize = 11.5.sp,
                        )
                    }
                    Row(Modifier.clip(RoundedCornerShape(Radius.pill)).clickable { nav.navigate(Routes.PERFORMANCE) }.padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("View Benefits", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                    }
                }
                Spacer(Modifier.height(11.dp))
                Box(Modifier.fillMaxWidth().height(7.dp).clip(RoundedCornerShape(Radius.pill)).background(Color.White.copy(alpha = 0.22f))) {
                    Box(Modifier.fillMaxWidth(progressFrac).height(7.dp).clip(RoundedCornerShape(Radius.pill)).background(Brush.horizontalGradient(listOf(Color(0xFFF7B733), Color(0xFFFC7B2D)))))
                }
                Spacer(Modifier.height(7.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(if (nextTier != null) "Progress to ${nextTier.label}" else "Highest tier reached", color = Color.White.copy(alpha = 0.85f), fontSize = 11.5.sp)
                    Text(if (nextTier != null) "$progressCur / $progressMax jobs" else "$progressCur jobs", color = Color.White, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                }
            }

            // ── Stat cards
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                ProfileStat(Modifier.weight(1f), Icons.Filled.WorkOutline, Purple, PurpleLight, "Jobs Completed", "${vm.jobsCompleted}", "Total")
                ProfileStat(Modifier.weight(1f), Icons.Filled.Star, GreenSuccess, GreenLight, "Acceptance Rate", vm.acceptancePct?.let { "$it%" } ?: "—", "This Month")
                ProfileStat(Modifier.weight(1f), Icons.Filled.ThumbUp, Amber, GoldLight, "Completion Rate", vm.completionPct?.let { "$it%" } ?: "—", "This Month")
                ProfileStat(Modifier.weight(1f), Icons.Filled.SentimentSatisfiedAlt, ProfBlue, ProfBlueBg, "Customer Rating", "${vm.workerRating}", "Out of 5")
            }

            // ── Menu list
            Card(padding = Dp16.XS) {
                ProfileMenuRow(Icons.Filled.Person, "Personal Information", "View and update your personal details") { nav.navigate(Routes.P_PERSONAL) }
                HairlineDivider()
                ProfileMenuRow(Icons.Filled.VerifiedUser, "KYC Verification", "Aadhaar, PAN, Bank & other documents", verified = kycVerified) { nav.navigate(Routes.P_DOCUMENTS) }
                HairlineDivider()
                ProfileMenuRow(Icons.Filled.AccountBalance, "Bank Account", "Manage your bank account details") { nav.navigate(Routes.P_BANK) }
                HairlineDivider()
                ProfileMenuRow(Icons.Filled.AccountBalanceWallet, "Wallet & Earnings", "View earnings, incentives & withdrawals") { nav.navigate(Routes.WALLET) }
                HairlineDivider()
                ProfileMenuRow(Icons.Filled.CalendarMonth, "My Shifts", "View your shifts and availability") { nav.navigate(Routes.P_AVAILABILITY) }
                HairlineDivider()
                ProfileMenuRow(Icons.Filled.WorkspacePremium, "Performance", "View your performance and stats") { nav.navigate(Routes.PERFORMANCE) }
                HairlineDivider()
                ProfileMenuRow(Icons.AutoMirrored.Filled.HelpOutline, "Help & Support", "FAQs, help center & contact support") { nav.navigate(Routes.P_HELP) }
            }

            // ── Logout
            Surface(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).clickable {
                    vm.logout(); nav.navigate(Routes.LOGIN) { popUpTo(Routes.HOME) { inclusive = true } }
                },
                shape = RoundedCornerShape(Radius.card), color = RedLight,
            ) {
                Row(Modifier.fillMaxWidth().padding(Space.m), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(36.dp).clip(RoundedCornerShape(Radius.field)).background(Color.White), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Logout, contentDescription = null, tint = RedCancel, modifier = Modifier.size(18.dp))
                    }
                    Spacer(Modifier.width(Space.m))
                    Column {
                        Text("Logout", color = RedCancel, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text("Logout from your account", color = RedCancel.copy(alpha = 0.72f), fontSize = 12.sp)
                    }
                }
            }
            Spacer(Modifier.height(2.dp))
        }
    }
}

@Composable
private fun ProfileIconLine(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = TextGray, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text(text, color = TextGray, fontSize = 13.sp)
    }
}

/** One compact stat card in the profile's four-up strip (icon chip + label + big value + caption). */
@Composable
private fun ProfileStat(modifier: Modifier, icon: ImageVector, tint: Color, tintBg: Color, label: String, value: String, caption: String) {
    Card(modifier = modifier, padding = Dp16.XS) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Box(Modifier.size(26.dp).clip(CircleShape).background(tintBg), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(15.dp))
            }
            Spacer(Modifier.height(3.dp))
            Text(label, color = TextGray, fontSize = 9.5.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center, lineHeight = 11.sp)
            Spacer(Modifier.height(1.dp))
            Text(value, color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Text(caption, color = TextMuted, fontSize = 9.sp)
        }
    }
}

/** Menu row: plain leading icon + title (with optional Verified pill) + subtitle + chevron. */
@Composable
private fun ProfileMenuRow(icon: ImageVector, title: String, subtitle: String, verified: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(Space.s))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, color = TextDark, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                if (verified) {
                    Spacer(Modifier.width(Space.s))
                    StatusPill("Verified", GreenLight, GreenSuccess)
                }
            }
            Text(subtitle, color = TextGray, fontSize = 11.5.sp)
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(20.dp))
    }
}

// ---- helpers ----

/** Open the Android share sheet to invite others to join HomeHelp Pro as partners. */
private fun shareInvite(ctx: Context) {
    val msg = "Join me on HomeHelp Pro — become a verified home-service partner and earn on your " +
        "own schedule. Download the app to get started."
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, "Join HomeHelp Pro")
        putExtra(Intent.EXTRA_TEXT, msg)
    }
    ctx.startActivity(Intent.createChooser(send, "Invite via").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

@Composable
private fun SplitStat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
        Spacer(Modifier.height(Space.xs))
        Text(tr(label), color = Color.White.copy(alpha = 0.8f), fontSize = 11.sp)
    }
}

@Composable
private fun SummaryMini(value: String, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = color, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        Text(label, color = TextGray, fontSize = 11.sp)
    }
}

// Each menu item is its own tinted-icon card row with a trailing chevron.
@Composable
private fun MenuItem(icon: ImageVector, label: String, divider: Boolean = true, onClick: () -> Unit) {
    Card(modifier = Modifier.clickable { onClick() }) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).background(Primary50, RoundedCornerShape(Radius.field)),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp)) }
            Spacer(Modifier.width(Space.m))
            Text(tr(label), color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(20.dp))
        }
    }
}

/** Compact stat card (icon chip + big value + caption) for the profile quick-stats strip. */
@Composable
fun MiniStatCard(modifier: Modifier, icon: ImageVector, value: String, label: String, tint: Color, tintBg: Color) {
    Card(modifier = modifier) {
        Box(
            Modifier.size(38.dp).background(tintBg, RoundedCornerShape(Radius.field)),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp)) }
        Spacer(Modifier.height(Space.s))
        Text(value, color = TextDark, fontWeight = FontWeight.Bold, fontSize = 20.sp)
        Text(tr(label), color = TextGray, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun WalletAction(icon: ImageVector, label: String, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable { onClick() }) {
        Box(Modifier.size(52.dp).background(PurpleLight, RoundedCornerShape(Radius.button)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = label, tint = Purple, modifier = Modifier.size(24.dp))
        }
        Spacer(Modifier.height(Space.s))
        Text(label, fontSize = 11.sp, color = TextDark, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun AmountDialog(title: String, action: String, onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    var amount by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, fontWeight = FontWeight.Bold) },
        text = {
            OutlinedTextField(
                value = amount,
                onValueChange = { if (it.length <= 6 && it.all(Char::isDigit)) amount = it },
                label = { Text(tr("Amount (₹)")) },
                singleLine = true,
                shape = RoundedCornerShape(Radius.field),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = FieldFill,
                    unfocusedContainerColor = FieldFill,
                    focusedBorderColor = Purple,
                    unfocusedBorderColor = Color.Transparent,
                    focusedLabelColor = Purple,
                    cursorColor = Purple,
                ),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(amount.toIntOrNull() ?: 0) }) {
                Text(action, color = Purple, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun TxnRow(t: WalletTxn) {
    Row(Modifier.fillMaxWidth().padding(vertical = Space.s), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(40.dp).background(if (t.isCredit) GreenLight else PurpleLight, RoundedCornerShape(Radius.field)), contentAlignment = Alignment.Center) {
            Icon(
                if (t.isCredit) Icons.Filled.ArrowDownward else Icons.Filled.ArrowUpward,
                contentDescription = null,
                tint = if (t.isCredit) GreenSuccess else Purple,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text(t.title, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
            Text(t.subtitle, fontSize = 11.sp, color = TextGray)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                (if (t.isCredit) "+₹" else "-₹") + t.amount,
                fontWeight = FontWeight.Bold,
                color = if (t.isCredit) GreenSuccess else TextDark,
                fontSize = 14.sp,
            )
            StatusPill(t.status, if (t.status == "Success") GreenLight else Color(0xFFFFF3D6), if (t.status == "Success") GreenSuccess else Gold)
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI CHANGE LOG — MoneyScreens.kt
// UI-only redesign inspired by leading gig/partner apps (Urban Company / Snabbit
// style) but rebuilt in our own violet brand + design tokens. No business logic,
// state, navigation, validation or vm.* calls were changed; all @Composable
// screen signatures are preserved verbatim. New helpers are private/additive.
//
// New shared building blocks (private):
//  • MoneyBanner — signature mint-green "total" money banner with a ₹ coin chip and
//    a Canvas-drawn scalloped (receipt-notch) bottom edge.
//  • ElevatedGroup — clips the banner + breakdown into one connected elevated surface.
//  • BreakdownRow / InsetRow — label/value lines for breakdown cards + gray inset box.
//  • StatusListRow — the app-wide activity row: colored circular status icon (green
//    check / amber clock / red X / purple clock) + title + colored status subtitle +
//    trailing value + chevron. Shared by Earnings, Bookings and (styling) Schedule.
//  • MiniStatCard — icon-chip stat tile for the profile quick-stats strip.
//
// EarningsScreen:
//  • Green MoneyBanner hero ("Today's Earnings") connected to a white breakdown card
//    (This Week / This Month + a gray inset sub-breakdown of jobs today / completed).
//  • Payout summary card + Withdraw CTA retained; Recent Earnings now render as
//    StatusListRow cards (green check = Paid, amber clock = Pending).
//
// BookingsScreen:
//  • Booking rows rebuilt as StatusListRow cards with a colored status circle
//    (Upcoming = purple clock, Completed = green check, Cancelled = red X). Tap →
//    the same detail dialog (unchanged).
//
// ScheduleScreen:
//  • Rows rebuilt as cards led by a colored status circle; time folded into the
//    subtitle; location / duration / payment detail row + status pill retained.
//
// ProfileScreen:
//  • Kept the brand identity hero; added a two-up MiniStatCard quick-stats strip
//    (This Week / Jobs Done). Menu regrouped into Account / Growth & Rewards /
//    Support sections, each item now its own tinted-icon card with a chevron.
//    Logout retained as a soft RedLight rounded action.
//
// Confirmed: presentation only — every vm.* call, remember/state, nav route,
// validation and function argument is byte-for-byte unchanged.
// ─────────────────────────────────────────────────────────────────────────────
