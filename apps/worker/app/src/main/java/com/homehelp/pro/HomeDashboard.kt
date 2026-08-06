package com.homehelp.pro

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
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.PlayCircleFilled
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.TrackChanges
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.homehelp.pro.network.ScheduleItem

// ─────────────────────────────────────────────────────────────────────────────
// Home dashboard sections, built to the reference design: a stat-tile strip, a
// "next job" hero, today's schedule timeline, and the refer-&-earn banner.
//
// Home scrolls (see HomeScreen) — this content is roughly 1.4 screens tall, so it
// is NOT the fit-to-screen dashboard the earlier layout was.
// ─────────────────────────────────────────────────────────────────────────────

/** Indian-grouped rupees ("₹2,450"). Local copy so this file stands alone. */
private fun money(v: Int): String =
    "₹" + java.text.NumberFormat.getIntegerInstance(java.util.Locale("en", "IN")).format(v)

/** A section title with a trailing action link, as the reference draws above each block. */
@Composable
fun SectionHeading(title: String, action: String, onAction: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = TextDark, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Row(
            Modifier.clip(RoundedCornerShape(Radius.pill)).clickable(onClick = onAction).padding(horizontal = 4.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(action, color = Purple, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
        }
    }
}

// ── Stat tiles ───────────────────────────────────────────────────────────────

/**
 * The four headline figures, sized to fit the width exactly — no horizontal scroll.
 *
 * They were a scrollable strip of fixed-width tiles, but the row arrived scrolled a third of
 * the way across on load, clipping "Today's Earnings" off the left edge. Measuring the
 * reference, its own tiles are ~87dp on a 393dp frame, so four equal weights is what it
 * actually draws; making them fit removes both the overflow and the stray scroll offset.
 * Labels wrap to two lines so nothing is truncated at this width.
 */
@Composable
fun StatTilesRow(
    todayEarnings: Int,
    dailyTarget: Int,
    jobsCompleted: Int,
    jobsToday: Int,
    rating: Double,
    walletBalance: Int,
    onEarnings: () -> Unit,
    onJobs: () -> Unit,
    onRating: () -> Unit,
    onWallet: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        StatTile(
            Modifier.weight(1f),
            icon = Icons.Filled.AccountBalanceWallet, tint = Purple, tintBg = Primary50,
            value = money(todayEarnings), label = "Today's\nEarnings",
            footer = if (dailyTarget > 0) "of ${money(dailyTarget)}" else null,
            footerColor = Purple, footerBg = Primary50, onClick = onEarnings,
        )
        StatTile(
            Modifier.weight(1f),
            icon = Icons.Filled.CheckCircle, tint = GreenSuccess, tintBg = GreenLight,
            value = "$jobsCompleted", label = "Jobs\nCompleted",
            footer = if (jobsToday > 0) "$jobsToday today" else null,
            footerColor = GreenSuccess, footerBg = GreenLight, onClick = onJobs,
        )
        StatTile(
            Modifier.weight(1f),
            icon = Icons.Filled.Star, tint = Gold, tintBg = GoldLight,
            value = if (rating > 0) String.format("%.1f", rating) else "—", label = "Your\nRating",
            footer = if (rating >= 4.5) "Top Rated" else null,
            footerColor = Amber, footerBg = GoldLight, onClick = onRating,
        )
        StatTile(
            Modifier.weight(1f),
            icon = Icons.Filled.AccountBalanceWallet, tint = Color(0xFF2563EB), tintBg = Color(0xFFE8F0FE),
            value = money(walletBalance), label = "Wallet\nBalance",
            footer = "View ›", footerColor = Color(0xFF2563EB), footerBg = Color(0xFFE8F0FE),
            onClick = onWallet,
        )
    }
}

@Composable
private fun StatTile(
    modifier: Modifier,
    icon: ImageVector,
    tint: Color,
    tintBg: Color,
    value: String,
    label: String,
    footer: String?,
    footerColor: Color,
    footerBg: Color,
    onClick: () -> Unit,
) {
    Column(
        modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(Radius.card))
            .background(CardBg)
            .border(1.dp, CardBorder, RoundedCornerShape(Radius.card))
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(38.dp).clip(CircleShape).background(tintBg), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(19.dp))
        }
        Spacer(Modifier.height(8.dp))
        // Label above value, as the reference draws it: the caption names the metric, the
        // figure below it is the payload.
        Text(
            label, color = TextGray, fontSize = 10.5.sp, lineHeight = 13.sp,
            maxLines = 2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(3.dp))
        Text(
            value, color = TextDark, fontSize = 17.sp, fontWeight = FontWeight.Bold,
            maxLines = 1, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.weight(1f))
        if (footer != null) {
            Spacer(Modifier.height(8.dp))
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.pill)).background(footerBg)
                    .padding(horizontal = 4.dp, vertical = 5.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(footer, color = footerColor, fontSize = 9.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
        }
    }
}

// ── Daily target ─────────────────────────────────────────────────────────────

/**
 * Progress towards today's earnings goal, and the only route to the goal editor.
 *
 * The editor used to hang off the earnings card's "Today's Target" row; when that card became
 * the stat-tile strip the dialog was left in HomeScreen with nothing able to open it. Tapping
 * this bar opens it again.
 */
@Composable
fun DailyTargetBar(todayEarnings: Int, dailyTarget: Int, onEditTarget: () -> Unit) {
    val pct = if (dailyTarget > 0) (todayEarnings.toFloat() / dailyTarget).coerceIn(0f, 1f) else 0f
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(Radius.card))
            .background(CardBg)
            .border(1.dp, CardBorder, RoundedCornerShape(Radius.card))
            .clickable(onClick = onEditTarget)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.TrackChanges, contentDescription = null, tint = Purple, modifier = Modifier.size(17.dp))
            Spacer(Modifier.width(8.dp))
            Text("Daily Target", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text(
                "${money(todayEarnings)} / ${money(dailyTarget)}",
                color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1,
            )
        }
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(Radius.pill)).background(FieldFill),
        ) {
            Box(
                Modifier.fillMaxWidth(pct).fillMaxHeight().clip(RoundedCornerShape(Radius.pill)).background(BrandGradient),
            )
        }
        Spacer(Modifier.height(7.dp))
        Text(
            if (dailyTarget > 0 && todayEarnings >= dailyTarget) "Target reached — nice work!"
            else "${(pct * 100).toInt()}% of today's goal · tap to change",
            color = TextGray, fontSize = 11.5.sp, maxLines = 1,
        )
    }
}

// ── Attendance ───────────────────────────────────────────────────────────────

/**
 * Shift check-in / check-out — the one thing a worker must do every single day, and which was
 * only reachable through the drawer after Quick Actions was removed. Late check-ins are
 * penalised (see AttendanceScreen), so burying it two taps deep costs the worker money.
 *
 * [onOpen] leads to the full attendance screen; [onCheckIn] / [onCheckOut] act directly.
 */
@Composable
fun AttendanceStrip(
    att: com.homehelp.pro.network.AttendanceDto,
    onOpen: () -> Unit,
    onCheckIn: () -> Unit,
    onCheckOut: () -> Unit,
) {
    val (accent, tintBg, label) = when {
        att.checkedOut -> Triple(TextMuted, FieldFill, "Shift complete")
        att.checkedIn -> Triple(GreenSuccess, GreenLight, "Checked in")
        else -> Triple(Amber, GoldLight, "Not checked in")
    }
    Row(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(Radius.card))
            .background(CardBg)
            .border(1.dp, CardBorder, RoundedCornerShape(Radius.card))
            .clickable(onClick = onOpen)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(38.dp).clip(CircleShape).background(tintBg), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Schedule, contentDescription = null, tint = accent, modifier = Modifier.size(19.dp))
        }
        Spacer(Modifier.width(11.dp))
        Column(Modifier.weight(1f)) {
            Text(label, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text(
                when {
                    att.checkedOut && att.checkOutAt.isNotBlank() -> "Out at ${att.checkOutAt}"
                    att.checkedIn && att.checkInAt.isNotBlank() -> "In at ${att.checkInAt}"
                    att.shiftName.isNotBlank() -> "${att.shiftName} · ${att.shiftStart}–${att.shiftEnd}"
                    else -> "Pick a shift to get started"
                },
                color = TextGray, fontSize = 12.sp, maxLines = 1,
            )
        }
        Spacer(Modifier.width(10.dp))
        when {
            !att.checkedIn -> AttendanceAction("Check In", BrandGradient, onCheckIn)
            !att.checkedOut -> AttendanceAction("Check Out", null, onCheckOut)
            else -> Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(22.dp))
        }
    }
}

@Composable
private fun AttendanceAction(label: String, fill: androidx.compose.ui.graphics.Brush?, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(Radius.pill))
            .then(if (fill != null) Modifier.background(fill) else Modifier.background(FieldFill))
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label, color = if (fill != null) Color.White else TextDark,
            fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1,
        )
    }
}

// ── Active job ───────────────────────────────────────────────────────────────

/**
 * The resume-active-job banner. It sits at the very top of Home when a job is live: it used to
 * render below the refer-&-earn banner, i.e. under everything else, even though a job in
 * progress is the single most important thing on the screen.
 */
@Composable
fun ActiveJobBanner(label: String, subtitle: String, onResume: () -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(Radius.card))
            .background(GreenSuccess)
            .clickable(onClick = onResume)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(42.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.22f)),
            contentAlignment = Alignment.Center,
        ) { Text("🛠", fontSize = 19.sp) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Text(subtitle, color = Color.White.copy(alpha = 0.92f), fontSize = 12.5.sp, maxLines = 1)
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
    }
}

// ── Next job ─────────────────────────────────────────────────────────────────

/**
 * NEXT JOB — the reference's lavender hero: who, what, how far, and the two actions a worker
 * takes from Home. Rendered only when a scheduled job actually exists; nothing is invented.
 */
@Composable
fun NextJobHeroCard(
    job: ScheduleItem,
    timeWindow: String,
    onNavigate: () -> Unit,
    onCall: () -> Unit,
    onStart: () -> Unit,
) {
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(Radius.card))
            .background(ActiveJobTint)
            .border(1.dp, ActiveJobBorder, RoundedCornerShape(Radius.card))
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.clip(RoundedCornerShape(Radius.pill)).background(Primary50)
                    .padding(horizontal = 9.dp, vertical = 4.dp),
            ) {
                Text("NEXT JOB", color = Purple, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp)
            }
            Spacer(Modifier.weight(1f))
            // "45 min left" only when the backend actually supplies an ETA — no invented countdown.
            if (job.etaMins != null && job.etaMins > 0) {
                Row(
                    Modifier.clip(RoundedCornerShape(Radius.pill)).background(CardBg)
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Schedule, contentDescription = null, tint = Purple, modifier = Modifier.size(13.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("${job.etaMins} min left", color = TextDark, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            // Initial-badge stands in for the customer photo: the schedule feed carries a name
            // but no avatar URL, so there is no image to load.
            Box(
                Modifier.size(48.dp).clip(CircleShape).background(BrandGradient),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    job.customerName.trim().take(1).uppercase().ifBlank { "C" },
                    color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    job.customerName.ifBlank { "Customer" },
                    color = TextDark, fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                )
                Spacer(Modifier.height(3.dp))
                Text(job.service, color = TextGray, fontSize = 13.sp, maxLines = 1)
                Spacer(Modifier.height(5.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = TextMuted, modifier = Modifier.size(13.dp))
                    Spacer(Modifier.width(3.dp))
                    Text(
                        job.distanceKm?.let { String.format("%.1f km away", it) } ?: job.location.ifBlank { "—" },
                        color = TextMuted, fontSize = 12.sp, maxLines = 1,
                    )
                    Spacer(Modifier.width(10.dp))
                    Icon(Icons.Filled.Schedule, contentDescription = null, tint = TextMuted, modifier = Modifier.size(13.dp))
                    Spacer(Modifier.width(3.dp))
                    Text(timeWindow.ifBlank { job.time }, color = TextMuted, fontSize = 12.sp, maxLines = 1)
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedAction(Modifier.weight(1f), Icons.Filled.Navigation, "Navigate", onNavigate)
            OutlinedAction(Modifier.weight(1f), Icons.Filled.Phone, "Call", onCall)
            FilledAction(Modifier.weight(1.15f), Icons.Filled.PlayCircleFilled, "Start Job", onStart)
        }
    }
}

@Composable
private fun OutlinedAction(modifier: Modifier, icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        modifier.height(46.dp).clip(RoundedCornerShape(Radius.button))
            .background(CardBg).border(1.4.dp, Purple, RoundedCornerShape(Radius.button))
            .clickable(onClick = onClick),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(17.dp))
        Spacer(Modifier.width(7.dp))
        Text(label, color = Purple, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun FilledAction(modifier: Modifier, icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        modifier.height(46.dp).clip(RoundedCornerShape(Radius.button))
            .background(BrandGradient).clickable(onClick = onClick),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(17.dp))
        Spacer(Modifier.width(7.dp))
        Text(label, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

// ── Today's schedule ─────────────────────────────────────────────────────────

/**
 * TODAY'S SCHEDULE — a timeline of the day's jobs. The first upcoming row is marked "Next" and
 * carries a filled dot; the rest are hollow. Renders nothing when the schedule feed is empty
 * rather than showing placeholder rows.
 */
@Composable
fun TodayScheduleCard(items: List<ScheduleItem>, onViewAll: () -> Unit, onItem: (ScheduleItem) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Today's Schedule", color = TextDark, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Row(
                Modifier.clip(RoundedCornerShape(Radius.pill)).clickable(onClick = onViewAll).padding(horizontal = 4.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("View all", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
            }
        }
        Spacer(Modifier.height(10.dp))
        Card(padding = Dp16.S) {
            items.forEachIndexed { i, item ->
                ScheduleRow(item, isNext = i == 0, isLast = i == items.lastIndex, onClick = { onItem(item) })
            }
        }
    }
}

@Composable
private fun ScheduleRow(item: ScheduleItem, isNext: Boolean, isLast: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp)) {
        // Timeline rail: dot plus the connector down to the next row.
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(18.dp)) {
            Box(
                Modifier.size(11.dp).clip(CircleShape)
                    .background(if (isNext) GreenSuccess else Color.Transparent)
                    .border(if (isNext) 0.dp else 1.5.dp, if (isNext) Color.Transparent else Divider, CircleShape),
            )
            if (!isLast) {
                Spacer(Modifier.height(4.dp))
                Box(Modifier.width(1.dp).height(40.dp).background(Divider))
            }
        }
        Spacer(Modifier.width(12.dp))
        Text(
            item.time, color = if (isNext) GreenSuccess else TextGray,
            fontSize = 13.sp, fontWeight = if (isNext) FontWeight.Bold else FontWeight.Normal,
            maxLines = 1, modifier = Modifier.width(72.dp),
        )
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text(item.service, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text(item.customerName.ifBlank { item.location }, color = TextGray, fontSize = 12.sp, maxLines = 1)
        }
        Spacer(Modifier.width(8.dp))
        val badgeBg = if (isNext) GreenLight else Primary50
        val badgeFg = if (isNext) GreenSuccess else Purple
        Box(
            Modifier.clip(RoundedCornerShape(Radius.pill)).background(badgeBg).padding(horizontal = 10.dp, vertical = 5.dp),
        ) {
            Text(
                if (isNext) "Next" else item.status.ifBlank { "Upcoming" },
                color = badgeFg, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
            )
        }
    }
}

// ── Incentive progress ───────────────────────────────────────────────────────

/**
 * INCENTIVE PROGRESS — the purple banner closing the page. Rendered only when the backend
 * actually reports a bonus target, so it never shows an invented goal.
 */
@Composable
fun IncentiveProgressBanner(done: Int, target: Int, reward: Int, onOpen: () -> Unit) {
    val remaining = (target - done).coerceAtLeast(0)
    Row(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(Radius.card))
            .background(BrandGradient)
            .clickable(onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🏆", fontSize = 14.sp)
                Spacer(Modifier.width(6.dp))
                Text("Incentive Progress", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(5.dp))
            Text(
                if (remaining > 0) "Complete $remaining more jobs to earn ₹$reward extra!"
                else "Target complete — ₹$reward unlocked!",
                color = Color.White.copy(alpha = 0.92f), fontSize = 12.5.sp, lineHeight = 17.sp,
            )
        }
        Spacer(Modifier.width(12.dp))
        Box(Modifier.size(64.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize()) {
                val stroke = 7.dp.toPx()
                val inset = stroke / 2
                val arc = androidx.compose.ui.geometry.Size(size.width - stroke, size.height - stroke)
                drawArc(
                    color = Color.White.copy(alpha = 0.28f), startAngle = -90f, sweepAngle = 360f,
                    useCenter = false, topLeft = Offset(inset, inset), size = arc,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
                val frac = if (target > 0) (done.toFloat() / target).coerceIn(0f, 1f) else 0f
                if (frac > 0f) {
                    drawArc(
                        color = Gold, startAngle = -90f, sweepAngle = 360f * frac,
                        useCenter = false, topLeft = Offset(inset, inset), size = arc,
                        style = Stroke(width = stroke, cap = StrokeCap.Round),
                    )
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("$done/$target", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text("Jobs", color = Color.White.copy(alpha = 0.85f), fontSize = 9.sp, maxLines = 1)
            }
        }
        Spacer(Modifier.width(10.dp))
        Text("🎁", fontSize = 30.sp)
    }
}

// ── Refer & earn ─────────────────────────────────────────────────────────────

/** The purple refer-a-friend banner that closes the page in the reference design. */
@Composable
fun ReferEarnBanner(onRefer: () -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(Radius.card))
            .background(BrandGradient)
            .clickable(onClick = onRefer)
            .padding(horizontal = 18.dp, vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("Refer & Earn", color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(
                "Refer a friend and earn up to ₹500 bonus!",
                color = Color.White.copy(alpha = 0.92f), fontSize = 13.sp, lineHeight = 18.sp,
            )
        }
        Spacer(Modifier.width(12.dp))
        Text("🎁", fontSize = 34.sp)
        Spacer(Modifier.width(12.dp))
        Row(
            Modifier.clip(RoundedCornerShape(Radius.button)).background(Color.White)
                .padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Refer Now", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Purple, modifier = Modifier.size(15.dp))
        }
    }
}
