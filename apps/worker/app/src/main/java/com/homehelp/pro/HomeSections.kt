package com.homehelp.pro

import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material.icons.filled.TrackChanges
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/** Formats an Indian-grouped rupee amount ("₹1,240"), or "—" when the value is unknown. */
private fun rupee(v: Int?): String =
    if (v == null) "—"
    else "₹" + java.text.NumberFormat.getIntegerInstance(java.util.Locale("en", "IN")).format(v)

/** Formats a percentage, or "—" when the value is unknown. */
private fun pct(v: Int?): String = if (v == null) "—" else "$v%"

/**
 * EARNINGS OVERVIEW — the brand-gradient card: three tappable period tiles over a
 * four-column strip of wallet / settlement / target / bonus figures.
 *
 * [pendingSettlement] is the wallet's hold balance (withdrawals in flight); the wallet
 * service's own `pending` field is hard-coded to 0 and would always read "₹0".
 * [bonusProgress] is 0f..1f, or null when the Sitara bonus hasn't loaded.
 */
@Composable
fun EarningsOverviewCard(
    today: Int,
    week: Int,
    month: Int,
    walletBalance: Int,
    pendingSettlement: Int,
    todayTarget: Int,
    bonusProgress: Float?,
    onToday: () -> Unit,
    onWeek: () -> Unit,
    onMonth: () -> Unit,
    onEditTarget: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.card))
            .background(EarningsGradient)
            .padding(horizontal = 11.dp, vertical = 10.dp),
    ) {
        Text(
            "EARNINGS OVERVIEW",
            color = Color.White.copy(alpha = 0.92f),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.9.sp,
        )
        Spacer(Modifier.height(7.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
            PeriodTile(Modifier.weight(1f), Icons.Filled.AccountBalanceWallet, "Today", today, onToday)
            PeriodTile(Modifier.weight(1f), Icons.Filled.CalendarMonth, "This Week", week, onWeek)
            PeriodTile(Modifier.weight(1f), Icons.Filled.BarChart, "This Month", month, onMonth)
        }
        Spacer(Modifier.height(8.dp))
        DashedDivider()
        Spacer(Modifier.height(8.dp))
        // All four figures on one row, as in the reference. At phone widths that leaves ~72dp
        // per column, so labels are small and wrap to two lines rather than clip.
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            HeroFigure(Modifier.weight(1f), Icons.Filled.AccountBalanceWallet, "Wallet Balance") {
                Text(rupee(walletBalance), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
            HeroFigureDivider()
            HeroFigure(Modifier.weight(1f), Icons.Filled.Schedule, "Pending Settlement") {
                Text(rupee(pendingSettlement), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
            HeroFigureDivider()
            HeroFigure(Modifier.weight(1f), Icons.Filled.TrackChanges, "Today's Target", Modifier.clickable(onClick = onEditTarget)) {
                Text(rupee(todayTarget), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
            HeroFigureDivider()
            HeroFigure(Modifier.weight(1f), Icons.Filled.CardGiftcard, "Bonus Progress") {
                Text(
                    if (bonusProgress == null) "—" else "${(bonusProgress * 100).toInt()}%",
                    color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                )
                if (bonusProgress != null) {
                    Spacer(Modifier.height(5.dp))
                    Box(
                        Modifier.fillMaxWidth().height(5.dp)
                            .clip(RoundedCornerShape(Radius.pill))
                            .background(Color.White.copy(alpha = 0.25f)),
                    ) {
                        Box(
                            Modifier.fillMaxWidth(bonusProgress.coerceIn(0f, 1f)).fillMaxHeight()
                                .clip(RoundedCornerShape(Radius.pill))
                                .background(Gold),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PeriodTile(modifier: Modifier, icon: ImageVector, label: String, amount: Int, onClick: () -> Unit) {
    Column(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White.copy(alpha = 0.13f))
            .border(1.dp, Color.White.copy(alpha = 0.22f), RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 7.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = Color.White.copy(alpha = 0.9f), modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(5.dp))
            Text(label, color = Color.White.copy(alpha = 0.9f), fontSize = 11.sp, maxLines = 1)
        }
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                rupee(amount),
                color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                letterSpacing = (-0.4).sp, maxLines = 1, modifier = Modifier.weight(1f),
            )
            // Chevron pinned to the tile's right edge, as in the reference.
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Color.White.copy(alpha = 0.8f), modifier = Modifier.size(15.dp))
        }
    }
}

@Composable
private fun HeroFigure(
    modifier: Modifier,
    icon: ImageVector,
    label: String,
    innerModifier: Modifier = Modifier,
    value: @Composable () -> Unit,
) {
    // A one-line box, as the mock draws these labels. The height is explicit because the
    // enclosing Row sizes itself with IntrinsicSize.Min, and intrinsic measurement ignores
    // maxLines — it would hand the row too little and the values would spill past the clip.
    val labelHeight = with(LocalDensity.current) { 11.sp.toDp() }
    Column(modifier.then(innerModifier)) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(
                icon, contentDescription = null, tint = Color.White.copy(alpha = 0.85f),
                modifier = Modifier.size(11.dp).padding(top = 1.dp),
            )
            Spacer(Modifier.width(3.dp))
            // Two lines, not clipped: "Pending Settlement" cannot fit one line in ~72dp.
            Text(
                label, color = Color.White.copy(alpha = 0.85f),
                fontSize = 8.5.sp, lineHeight = 10.sp, maxLines = 1,
                modifier = Modifier.height(labelHeight),
            )
        }
        Spacer(Modifier.height(3.dp))
        value()
    }
}

@Composable
private fun HeroFigureDivider() {
    // 7dp each side: enough that text never touches the rule, tight enough that four
    // columns still fit across a phone.
    Box(
        Modifier.padding(horizontal = 7.dp)
            .width(1.dp).fillMaxHeight()
            .background(Color.White.copy(alpha = 0.22f)),
    )
}

@Composable
private fun DashedDivider() {
    Canvas(Modifier.fillMaxWidth().height(1.dp)) {
        drawLine(
            color = Color.White.copy(alpha = 0.3f),
            start = Offset(0f, 0f),
            end = Offset(size.width, 0f),
            strokeWidth = size.height,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(9f, 7f), 0f),
        )
    }
}

/**
 * TODAY'S PROGRESS — completed/total jobs with a progress bar over a four-column
 * breakdown. [cancelled] and [incentive] are nullable: pass null to render "—" when the
 * figure isn't available from the backend.
 */
@Composable
fun TodaysProgressCard(
    completed: Int,
    total: Int,
    earnings: Int,
    cancelled: Int?,
    incentive: Int?,
) {
    val progress = if (total > 0) completed.toFloat() / total else 0f
    Card(padding = Dp16.XS) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Today's Progress", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text("$completed / $total Jobs", color = TextGray, fontSize = 13.sp)
            Spacer(Modifier.width(Space.m))
            Text(
                if (total > 0) "${(progress * 100).toInt()}%" else "—",
                color = GreenSuccess, fontSize = 14.sp, fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.height(6.dp))
        ProgressBar(progress, Modifier.fillMaxWidth())
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            ProgressFigure(Modifier.weight(1f), "Completed", "$completed", GreenSuccess)
            ProgressFigureDivider()
            ProgressFigure(Modifier.weight(1f), "Cancelled", cancelled?.toString() ?: "—", RedCancel)
            ProgressFigureDivider()
            ProgressFigure(Modifier.weight(1f), "Earnings", rupee(earnings), TextDark)
            ProgressFigureDivider()
            ProgressFigure(Modifier.weight(1f), "Incentive", rupee(incentive), Purple)
        }
    }
}

@Composable
private fun ProgressFigure(modifier: Modifier, label: String, value: String, valueColor: Color) {
    Column(modifier.padding(horizontal = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, color = TextGray, fontSize = 11.5.sp, maxLines = 1)
        Spacer(Modifier.height(4.dp))
        Text(value, color = valueColor, fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
private fun ProgressFigureDivider() {
    Box(Modifier.padding(horizontal = 6.dp).width(1.dp).fillMaxHeight().background(Divider))
}

/**
 * NEXT JOB — the worker's next scheduled service. [etaMins] and [distanceKm] are nullable
 * because the backend supplies neither; they render "—" until it does.
 */
@Composable
fun NextJobCard(
    service: String,
    timeWindow: String,
    location: String,
    distanceKm: Double?,
    etaMins: Int?,
    onViewAll: () -> Unit,
    onNavigate: () -> Unit,
) {
    Card(padding = Dp16.XS) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Next Job", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(
                "View All", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable(onClick = onViewAll),
            )
        }
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.Top) {
            Box(
                Modifier.size(70.dp).clip(RoundedCornerShape(16.dp)).background(Primary50),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(R.drawable.ic_job_cleaning),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(44.dp),
                )
            }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text(service, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(2.dp))
                Text(timeWindow, color = TextGray, fontSize = 13.sp)
                Spacer(Modifier.height(3.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = TextMuted, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(3.dp))
                    Text(location, color = TextGray, fontSize = 13.sp, maxLines = 1)
                }
                Spacer(Modifier.height(3.dp))
                Text(
                    if (distanceKm == null) "— km away" else "${distanceKm} km away",
                    color = TextGray, fontSize = 13.sp,
                )
            }
            Spacer(Modifier.width(Space.s))
            // Fixed-width action stack: letting ETA/Navigate wrap their own text left a wide
            // dead gap in the middle of the card, since the detail column takes the slack.
            // A set width pulls them back toward the text and matches the reference's proportions.
            Column(Modifier.width(112.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(GreenLight)
                        .padding(vertical = 3.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        if (etaMins == null) "—" else "$etaMins mins",
                        color = GreenSuccess, fontSize = 15.sp, fontWeight = FontWeight.Bold,
                    )
                    Text("ETA", color = GreenSuccess.copy(alpha = 0.8f), fontSize = 11.sp)
                }
                Spacer(Modifier.height(4.dp))
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Purple)
                        .clickable(onClick = onNavigate)
                        .padding(vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text("Navigate", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(4.dp))
                    Text("↗", color = Color.White, fontSize = 13.sp)
                }
            }
        }
    }
}

/**
 * PERFORMANCE OVERVIEW — four rate metrics. Every value is nullable: only completion rate
 * is derivable client-side today, so the rest render "—" until the worker API exposes them
 * (the figures exist, but only on the admin-only worker endpoint).
 */
@Composable
fun PerformanceOverviewCard(
    acceptanceRate: Int?,
    completionRate: Int?,
    punctuality: Int?,
    cancellationRate: Int?,
) {
    Card(padding = Dp16.XS) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Performance Overview", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text("Weekly", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = Purple, modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.height(Space.s))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
            PerfFigure(Modifier.weight(1f), Icons.Filled.CheckCircle, GreenSuccess, GreenLight, "Acceptance Rate", pct(acceptanceRate))
            PerfFigure(Modifier.weight(1f), Icons.Filled.Star, Purple, Primary50, "Completion Rate", pct(completionRate))
            PerfFigure(Modifier.weight(1f), Icons.Filled.Schedule, Amber, GoldLight, "Punctuality", pct(punctuality))
            PerfFigure(Modifier.weight(1f), Icons.Filled.Cancel, RedCancel, RedLight, "Cancellation Rate", pct(cancellationRate))
        }
    }
}

/**
 * One performance metric, laid out as the mock draws it: icon chip beside its label, value on
 * the line below. Half the height of the icon-above-label stack it replaces (72dp vs 147dp for
 * the card), which is most of what let Home render near full size instead of shrunk.
 *
 * Labels are single-line, as the mock draws them: reserving a second line only ever rendered as
 * a blank gap above each value.
 */
@Composable
private fun PerfFigure(
    modifier: Modifier,
    icon: ImageVector,
    tint: Color,
    tintBg: Color,
    label: String,
    value: String,
) {
    Column(modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(24.dp).clip(RoundedCornerShape(Radius.pill)).background(tintBg),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(15.dp)) }
            Spacer(Modifier.width(5.dp))
            Text(label, color = TextGray, fontSize = 9.5.sp, lineHeight = 11.5.sp, maxLines = 1)
        }
        Spacer(Modifier.height(5.dp))
        // Centred across the column, not left-aligned under the icon: the four values then sit on
        // an even pitch regardless of how wide each label is.
        Text(
            value, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1,
            textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
        )
    }
}

/**
 * QUICK ACTIONS — five rounded tiles wired to the app's existing destinations.
 *
 * The glyphs are bitmaps lifted from the reference design rather than Material icons:
 * Material ships no briefcase-with-star or SOS shield, and its SupportAgent is a person
 * wearing a headset instead of the headset itself.
 */
@Composable
fun QuickActionsCard(
    onAttendance: () -> Unit,
    onWallet: () -> Unit,
    onShifts: () -> Unit,
    onSupport: () -> Unit,
    onSos: () -> Unit,
) {
    Card(padding = Dp16.XS) {
        Text("Quick Actions", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        // Equal-weight columns rather than SpaceBetween: the columns are as wide as their
        // labels ("Attendance" vs "SOS"), so distributing the leftover space between them
        // spaced the tiles by label width. Equal columns put the tiles on an even pitch.
        Row(Modifier.fillMaxWidth()) {
            QuickTile(Modifier.weight(1f), R.drawable.ic_qa_attendance, "Attendance", Primary50, onAttendance)
            QuickTile(Modifier.weight(1f), R.drawable.ic_qa_wallet, "Wallet", Primary50, onWallet)
            QuickTile(Modifier.weight(1f), R.drawable.ic_qa_shifts, "My Shifts", Primary50, onShifts)
            QuickTile(Modifier.weight(1f), R.drawable.ic_qa_support, "Support", Primary50, onSupport)
            QuickTile(Modifier.weight(1f), R.drawable.ic_qa_sos, "SOS", RedLight, onSos)
        }
    }
}

@Composable
private fun QuickTile(
    modifier: Modifier,
    @DrawableRes icon: Int,
    label: String,
    tintBg: Color,
    onClick: () -> Unit,
) {
    Column(
        modifier.clickable(onClick = onClick).padding(horizontal = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(56.dp).clip(RoundedCornerShape(16.dp)).background(tintBg),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(icon),
                contentDescription = label,
                contentScale = ContentScale.Fit,
                modifier = Modifier.size(32.dp),
            )
        }
        Spacer(Modifier.height(5.dp))
        Text(
            label, color = TextGray, fontSize = 11.5.sp, fontWeight = FontWeight.Medium,
            maxLines = 1, textAlign = TextAlign.Center,
        )
    }
}

/** One slide in the announcements carousel. */
data class Announcement(val text: String, val time: String, val isNew: Boolean)

/**
 * Placeholder announcements shown while there's no announcements feed in the backend.
 * These are DEMO copy, not real notices — replace them once an endpoint exists.
 */
private val DEMO_ANNOUNCEMENTS = listOf(
    Announcement("Incentive boosted for weekend jobs!", "2 hours ago", true),
    Announcement("New: instant payouts now settle in 30 mins", "Yesterday", true),
    Announcement("Complete your KYC to unlock higher-value jobs", "2 days ago", false),
    Announcement("Refer a friend and earn ₹500 per joining", "4 days ago", false),
)

/**
 * ANNOUNCEMENTS — an auto-advancing carousel. The app has no announcements endpoint, so the
 * slides are the [DEMO_ANNOUNCEMENTS] placeholders; the worker's real notifications are still
 * one tap away via "View All".
 */
@Composable
fun AnnouncementsCard(onViewAll: () -> Unit) {
    val slides = DEMO_ANNOUNCEMENTS
    // Index + AnimatedContent rather than a HorizontalPager: the pager's animateScrollToPage
    // fires a bring-into-view that drags the whole Home scroll down on every tick.
    var index by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(3000)
            index = (index + 1) % slides.size
        }
    }

    Card(padding = Dp16.XS) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Campaign, contentDescription = null, tint = Purple, modifier = Modifier.size(21.dp))
            Spacer(Modifier.width(Space.s))
            Text("Announcements", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(
                "View All", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable(onClick = onViewAll),
            )
        }
        Spacer(Modifier.height(9.dp))
        AnimatedContent(
            targetState = index,
            transitionSpec = {
                (slideInHorizontally { it } + fadeIn()) togetherWith (slideOutHorizontally { -it } + fadeOut())
            },
            label = "announcement",
        ) { page ->
            val a = slides[page]
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Primary50)
                    .clickable(onClick = onViewAll)
                    .padding(horizontal = 11.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (a.isNew) {
                    Box(
                        Modifier.clip(RoundedCornerShape(6.dp)).background(Purple)
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    ) { Text("NEW", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold) }
                    Spacer(Modifier.width(Space.s))
                }
                Text(a.text, color = TextDark, fontSize = 12.5.sp, maxLines = 1, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(Space.s))
                Text(a.time, color = TextMuted, fontSize = 11.sp, maxLines = 1)
                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(16.dp))
            }
        }
        // No page dots: the mock doesn't draw them, and the carousel advances on its own — they
        // cost a row of height on a screen that has to fit without scrolling.
    }
}
