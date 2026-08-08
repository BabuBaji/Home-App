package com.homehelp.pro

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.SupportAgent
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/** Formats an Indian-grouped rupee amount ("₹1,240"), or "—" when the value is unknown. */
private fun rupee(v: Int?): String =
    if (v == null) "—"
    else "₹" + java.text.NumberFormat.getIntegerInstance(java.util.Locale("en", "IN")).format(v)

/**
 * EARNINGS OVERVIEW — the brand-gradient hero, and the visual anchor of Home.
 *
 * Deliberately short. An earlier version stacked a section label, the hero figure, two boxed
 * period tiles, a dashed rule, a target strip and a bonus/pending caption — six bands and
 * ~300dp for a card whose job is to answer "how much have I made today?". It now carries the
 * figure, progress against today's target, and the two other periods on one plain line.
 *
 * Dropped, not lost: the bonus percentage lives on the Sitara screen and pending settlement in
 * the wallet, both a tap away and neither something a worker acts on from Home.
 */
@Composable
fun EarningsOverviewCard(
    today: Int,
    week: Int,
    month: Int,
    walletBalance: Int,
    todayTarget: Int,
    onToday: () -> Unit,
    onWeek: () -> Unit,
    onMonth: () -> Unit,
    onEditTarget: () -> Unit,
) {
    val pctToTarget = if (todayTarget > 0) (today.toFloat() / todayTarget).coerceIn(0f, 1f) else 0f
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.card))
            .background(EarningsGradient)
            .padding(horizontal = 18.dp, vertical = 20.dp),
    ) {
        // Hero figure and wallet share a baseline, so the two numbers align rather than one
        // floating above the other.
        Row(Modifier.fillMaxWidth().clickable(onClick = onToday), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text("Today's Earnings", color = Color.White.copy(alpha = 0.8f), fontSize = 12.5.sp)
                Text(
                    rupee(today),
                    color = Color.White, fontSize = 38.sp, fontWeight = FontWeight.Bold,
                    letterSpacing = (-1.2).sp, maxLines = 1,
                )
            }
            Column(horizontalAlignment = Alignment.End, modifier = Modifier.padding(bottom = 5.dp)) {
                Text("Wallet", color = Color.White.copy(alpha = 0.8f), fontSize = 12.5.sp, maxLines = 1)
                Text(rupee(walletBalance), color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }

        Spacer(Modifier.height(13.dp))
        // Target: one bar and one caption, in place of the old icon row + bar + bonus row.
        Box(
            Modifier.fillMaxWidth().height(6.dp)
                .clip(RoundedCornerShape(Radius.pill))
                .background(Color.White.copy(alpha = 0.22f))
                .clickable(onClick = onEditTarget),
        ) {
            Box(
                Modifier.fillMaxWidth(pctToTarget).fillMaxHeight()
                    .clip(RoundedCornerShape(Radius.pill))
                    .background(Gold),
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(
            "${rupee(today)} of ${rupee(todayTarget)} daily target",
            color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp, maxLines = 1,
        )

        Spacer(Modifier.height(13.dp))
        HairlineOnGradient()
        Spacer(Modifier.height(11.dp))
        // Week and month as plain figures on one line — the boxed tiles they replace were two
        // more bordered surfaces competing with the figure above them.
        Row(Modifier.fillMaxWidth()) {
            PeriodFigure(Modifier.weight(1f), "This Week", week, onWeek)
            PeriodFigure(Modifier.weight(1f), "This Month", month, onMonth)
        }
    }
}

/** A soft white rule for use inside the gradient hero. */
@Composable
private fun HairlineOnGradient() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.2f)))
}

/** One secondary earnings period — label over value, no box, no chevron. */
@Composable
private fun PeriodFigure(modifier: Modifier, label: String, amount: Int, onClick: () -> Unit) {
    Column(modifier.clickable(onClick = onClick)) {
        Text(label, color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp, maxLines = 1)
        Text(rupee(amount), color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}



/**
 * TODAY'S PROGRESS — a completion ring beside the two job counts.
 *
 * [cancelled] is nullable: pass null to render "—" when the figure isn't available from the
 * backend. Today's earnings and incentive used to appear here too; earnings duplicated the
 * hero figure on the card above, and incentive is "—" until a bonus lands.
 */
@Composable
fun TodaysProgressCard(
    completed: Int,
    total: Int,
    cancelled: Int?,
) {
    val progress = if (total > 0) completed.toFloat() / total else 0f
    // Animated so the ring sweeps in on load and grows as jobs land, rather than snapping.
    val sweep by animateFloatAsState(targetValue = progress, animationSpec = tween(900), label = "progress")
    Card(padding = Dp16.M) {
        Text("Today's Progress", color = TextDark, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(14.dp))
        // Ring, then the two counts as equal-weight columns across the remaining width. Stacking
        // them in a narrow column left the card's right half empty and the whole thing lopsided.
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            // The ring carries the headline number. A full-width bar read as chrome — thin,
            // grey, and easy to miss at a glance; a ring is the piece of the card the eye
            // lands on first, which is the right place for "how is today going".
            ProgressRing(
                sweep = sweep,
                centre = if (total > 0) "${(progress * 100).toInt()}%" else "—",
                caption = "$completed of $total",
            )
            Spacer(Modifier.width(Space.l))
            // Two figures, not four. "Earnings" repeated the hero number one card above, and
            // "Incentive" reads "—" until a bonus lands; both were noise beside the job counts,
            // which are the only part of today's progress this card uniquely reports.
            ProgressFigure(Modifier.weight(1f), "Completed", "$completed", GreenSuccess)
            ProgressFigure(Modifier.weight(1f), "Cancelled", cancelled?.toString() ?: "—", RedCancel)
        }
    }
}

/**
 * The today's-progress dial: a soft track with a brand-gradient sweep, the percentage in the
 * middle and the raw job count beneath it. Drawn rather than composed so the cap stays round
 * and the sweep can be animated smoothly.
 */
@Composable
private fun ProgressRing(sweep: Float, centre: String, caption: String) {
    Box(Modifier.size(96.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 10.dp.toPx()
            val inset = stroke / 2
            val arcSize = androidx.compose.ui.geometry.Size(size.width - stroke, size.height - stroke)
            drawArc(
                color = FieldFill,
                startAngle = -90f, sweepAngle = 360f, useCenter = false,
                topLeft = Offset(inset, inset), size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
            if (sweep > 0f) {
                drawArc(
                    brush = Brush.sweepGradient(listOf(Purple, Violet, PurpleMid, Purple)),
                    startAngle = -90f, sweepAngle = 360f * sweep.coerceIn(0f, 1f), useCenter = false,
                    topLeft = Offset(inset, inset), size = arcSize,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(centre, color = TextDark, fontSize = 24.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Text(caption, color = TextGray, fontSize = 11.sp, maxLines = 1)
        }
    }
}

@Composable
private fun ProgressFigure(modifier: Modifier, label: String, value: String, valueColor: Color) {
    // Value above label, and clearly larger: the number is the content, the label only names it.
    // Start-aligned now that these sit in a 2×2 grid — centred columns left ragged gutters.
    Column(modifier.padding(end = 2.dp)) {
        Text(value, color = valueColor, fontSize = 21.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        Text(label, color = TextGray, fontSize = 12.sp, maxLines = 1)
    }
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

// PERFORMANCE OVERVIEW was removed from Home. Home is a fit-to-screen dashboard (see
// FitToScreen), so every section it carries shrinks the others: the four rate metrics cost
// ~110dp and forced 9.5sp labels on a card whose values are mostly "—", because only
// completion rate is derivable client-side today. The same figures already have two better
// homes — the Profile stat row and the dedicated Routes.PERFORMANCE screen — so nothing is
// lost by dropping the card, and the height it frees goes to the earnings hero.

// QUICK ACTIONS was removed from Home — see the note at its old call site in AuthHomeScreens.
// Its five destinations all remain reachable (bottom nav / drawer / top bar), and SOS kept a
// one-tap route by moving into the top bar. The ic_qa_* drawables are now unused.

/**
 * Height of Home's status slot — the row that shows announcements when offline and online /
 * incoming-job state when online. Every variant is pinned to this so switching between them
 * cannot change Home's natural height (which would make FitToScreen rescale the dashboard, and
 * read to the worker as the screen zooming out the moment they tapped "Go Online").
 */
val StatusSlotHeight = 52.dp

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
 * ANNOUNCEMENTS — a single auto-advancing line rather than a titled card.
 *
 * The card version spent a whole header row ("Announcements" + "View All") and a tinted slide
 * box on placeholder copy, for ~99dp. On a fit-to-screen dashboard that height was taken from
 * the earnings figure, which is the thing workers actually open the app for. The ticker keeps
 * the same rotating content and the same tap target at roughly half the height.
 *
 * The app still has no announcements endpoint, so the slides remain [DEMO_ANNOUNCEMENTS]
 * placeholders; real notifications stay one tap away.
 */
@Composable
fun AnnouncementTicker(onViewAll: () -> Unit) {
    val slides = DEMO_ANNOUNCEMENTS
    // Index + AnimatedContent rather than a HorizontalPager: the pager's animateScrollToPage
    // fires a bring-into-view that drags the whole Home layout on every tick.
    var index by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(3000)
            index = (index + 1) % slides.size
        }
    }

    Row(
        Modifier.fillMaxWidth()
            // Fixed height, shared with Home's other status-slot strips (see StatusSlotHeight):
            // the slot must measure the same whether it shows announcements or online state, or
            // Home's natural height changes and FitToScreen rescales the whole dashboard.
            .height(StatusSlotHeight)
            .clip(RoundedCornerShape(Radius.button))
            .background(Primary50)
            .clickable(onClick = onViewAll)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Campaign, contentDescription = null, tint = Purple, modifier = Modifier.size(19.dp))
        Spacer(Modifier.width(9.dp))
        AnimatedContent(
            targetState = index,
            transitionSpec = {
                (slideInHorizontally { it } + fadeIn()) togetherWith (slideOutHorizontally { -it } + fadeOut())
            },
            label = "announcement",
            modifier = Modifier.weight(1f),
        ) { page ->
            val a = slides[page]
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (a.isNew) {
                    Box(
                        Modifier.clip(RoundedCornerShape(6.dp)).background(Purple)
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    ) { Text("NEW", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold) }
                    Spacer(Modifier.width(7.dp))
                }
                Text(a.text, color = TextDark, fontSize = 13.sp, maxLines = 1, modifier = Modifier.weight(1f))
            }
        }
        Spacer(Modifier.width(7.dp))
        Icon(Icons.Filled.ChevronRight, contentDescription = "View all announcements", tint = Purple, modifier = Modifier.size(18.dp))
    }
}
