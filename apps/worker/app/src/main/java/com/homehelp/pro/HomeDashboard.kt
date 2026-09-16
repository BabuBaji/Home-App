package com.homehelp.pro

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.CurrencyRupee
import androidx.compose.material.icons.filled.DonutLarge
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Redeem
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Stars
import androidx.compose.material.icons.filled.TrackChanges
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.homehelp.pro.network.ScheduleItem

// ─────────────────────────────────────────────────────────────────────────────
// Home dashboard, built to the supplied reference screen:
//
//   header → online toggle → NEXT JOB hero → Attendance/My Shift/Emergency →
//   TODAY → NEXT UP → bonus banner
//
// Every figure is bound to real AppViewModel state. The reference's ₹1,000 / "0 / 3" /
// "Deep Cleaning" are its sample data, not values baked in here: an empty backend renders
// ₹0 and no schedule rather than inventing jobs.
// ─────────────────────────────────────────────────────────────────────────────

/** Indian-grouped rupees ("₹2,450"). */
private fun money(v: Int): String =
    "₹" + java.text.NumberFormat.getIntegerInstance(java.util.Locale("en", "IN")).format(v)

// The demo SampleSchedule that used to live here was REMOVED. Home rendered it whenever the API
// returned an empty schedule, so workers with a free day — offline ones included — saw three
// invented bookings they could not distinguish from real work. Home now shows the live feed only.

// Card geometry shared by every white panel on Home.
//
// Home is sized to fit ONE screen — no scrolling. On this device (411×914dp) the app area is
// ~833dp and the floating nav takes ~86dp, leaving ~730dp for eight sections plus their gaps.
// Every measurement below is therefore deliberately tight; raising any of them pushes the
// bonus banner off the bottom. The reference screen is built to the same density.
private val PanelRadius = 18.dp
private val PanelPad = 11.dp

// The reference's hero violet, and the deeper violet its primary action uses.
private val JobHeroGradient = Brush.linearGradient(listOf(Color(0xFF7B5CF6), Color(0xFF5B32E8)))
private val BonusGradient = Brush.linearGradient(listOf(Color(0xFF7B5CF6), Color(0xFF6C47F5)))
private val StartJobViolet = Color(0xFF4A22C9)

// Accent used by the "Today's Target" tile.
private val OrangeAccent = Color(0xFFF97316)
private val OrangeLight = Color(0xFFFFF1E6)

/** The white rounded panel every section is drawn on. */
@Composable
private fun Panel(
    modifier: Modifier = Modifier,
    padH: Dp = PanelPad,
    padV: Dp = PanelPad,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .shadow(3.dp, RoundedCornerShape(PanelRadius), spotColor = Color(0x14101828), ambientColor = Color(0x0A101828))
            .clip(RoundedCornerShape(PanelRadius))
            .background(CardBg)
            .padding(horizontal = padH, vertical = padV),
        content = content,
    )
}

/** Section caption + "View all ›", the header each panel carries. */
@Composable
private fun PanelHeader(title: String, action: String, onAction: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            title, color = TextDark, fontSize = 13.sp,
            fontWeight = FontWeight.Bold, letterSpacing = 0.7.sp, modifier = Modifier.weight(1f),
        )
        Row(
            Modifier.clip(RoundedCornerShape(Radius.pill)).clickable(onClick = onAction)
                .padding(horizontal = 4.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(action, color = Purple, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
        }
    }
}

// ── Rating pill ──────────────────────────────────────────────────────────────

/** The "★ 4.5" chip that sits under the greeting. */
@Composable
fun RatingPill(rating: Double, onClick: () -> Unit) {
    Row(
        Modifier
            .shadow(3.dp, RoundedCornerShape(Radius.pill), spotColor = Color(0x1A101828))
            .clip(RoundedCornerShape(Radius.pill))
            .background(CardBg)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Stars, contentDescription = null, tint = Gold, modifier = Modifier.size(17.dp))
        Spacer(Modifier.width(6.dp))
        Text(
            if (rating > 0) String.format("%.1f", rating) else "—",
            color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold,
        )
    }
}

// ── Online toggle ────────────────────────────────────────────────────────────

/**
 * "You are Online / Available for new jobs" with the availability switch.
 *
 * This is the primary online control — the bottom-nav FAB toggles the same state, but a
 * worker reading their dashboard needs to see availability without hunting for it.
 */
@Composable
fun OnlineToggleCard(online: Boolean, onToggle: (Boolean) -> Unit) {
    Panel(padV = 6.dp) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(10.dp).clip(CircleShape)
                    .background(if (online) GreenSuccess else TextMuted),
            )
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Row {
                    Text("You are ", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Text(
                        if (online) "Online" else "Offline",
                        color = if (online) GreenSuccess else TextGray,
                        fontSize = 15.sp, fontWeight = FontWeight.Bold,
                    )
                }
                Text(
                    if (online) "Available for new jobs" else "You won't receive new jobs",
                    color = TextGray, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(8.dp))
            Switch(
                checked = online,
                onCheckedChange = onToggle,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = Purple,
                    checkedBorderColor = Purple,
                    uncheckedThumbColor = Color.White,
                    uncheckedTrackColor = Color(0xFFCBD5E1),
                    uncheckedBorderColor = Color(0xFFCBD5E1),
                ),
            )
        }
    }
}

// ── Next job hero ────────────────────────────────────────────────────────────

/**
 * NEXT JOB — the violet hero: what, who, how far, and the three actions a worker takes from
 * Home. Rendered only when a scheduled job actually exists; nothing is invented.
 */
@Composable
fun NextJobHeroCard(
    job: ScheduleItem,
    timeWindow: String,
    onNavigate: () -> Unit,
    onCall: () -> Unit,
    onStart: () -> Unit,
    /* The primary action follows the stage the job is at — "Start Job" while heading out, then
     * "Reached Location" once the worker is actually at the address. A single fixed label sent
     * them back into the job screens to find the arrival button that this card can just offer. */
    startLabel: String = "Start Job",
    startIcon: ImageVector = Icons.Filled.PlayArrow,
    /** Pill at the top-left: "NEXT JOB", "IN PROGRESS", "ON THE WAY"… */
    badge: String = "NEXT JOB",
    /** Live service clock ("MM:SS" / "H:MM:SS") shown top-right while the service runs. */
    timerText: String? = null,
    /** Caption above the clock — "Elapsed" while running, "Time up" once the booked time is done. */
    timerLabel: String = "Elapsed",
    /** Navigate + Call are dead once the worker is at the customer and working. */
    actionsEnabled: Boolean = true,
) {
    Box(
        Modifier.fillMaxWidth()
            .shadow(12.dp, RoundedCornerShape(22.dp), spotColor = Purple.copy(alpha = 0.4f))
            .clip(RoundedCornerShape(22.dp))
            .background(JobHeroGradient),
    ) {
        // Faint tool watermark, as the reference draws behind the hero text.
        Icon(
            Icons.Filled.CleaningServices,
            contentDescription = null,
            tint = Color.White.copy(alpha = 0.13f),
            modifier = Modifier.align(Alignment.CenterEnd).padding(end = 26.dp, top = 26.dp).size(120.dp),
        )
        Column(Modifier.padding(horizontal = 11.dp, vertical = 8.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Box(
                    Modifier.clip(RoundedCornerShape(Radius.pill))
                        .background(Color.White.copy(alpha = 0.20f))
                        .padding(horizontal = 9.dp, vertical = 3.dp),
                ) {
                    /* Says what the job IS doing, not always "NEXT JOB" — a service already
                     * running is not the next one, and the worker coming back to Home needs to
                     * see at a glance that it is still going. */
                    Text(
                        badge, color = Color.White,
                        fontSize = 9.5.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp,
                    )
                }
                Spacer(Modifier.weight(1f))
                // Running service clock takes this corner while the job is in progress — it is the
                // number the worker checks most, and it beats a "starts in" for a job already
                // started. Otherwise "Starts in 45 min", and only when the backend supplies an ETA
                // (no invented countdown).
                if (timerText != null) {
                    Column(
                        Modifier.clip(RoundedCornerShape(12.dp)).background(Color.White)
                            .padding(horizontal = 12.dp, vertical = 4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(timerLabel, color = TextGray, fontSize = 9.5.sp, maxLines = 1)
                        Text(
                            timerText, color = Purple,
                            fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                        )
                    }
                } else if (job.etaMins != null && job.etaMins > 0) {
                    Column(
                        Modifier.clip(RoundedCornerShape(12.dp)).background(Color.White)
                            .padding(horizontal = 12.dp, vertical = 4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("Starts in", color = TextGray, fontSize = 9.5.sp, maxLines = 1)
                        Text(
                            "${job.etaMins} min", color = Purple,
                            fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                        )
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(46.dp).clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.22f))
                        .padding(3.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier.fillMaxWidth().fillMaxHeight().clip(CircleShape).background(Color.White),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Home, contentDescription = null, tint = Purple, modifier = Modifier.size(22.dp))
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        job.service.ifBlank { "Service" },
                        color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        job.customerName.ifBlank { "Customer" },
                        color = Color.White.copy(alpha = 0.93f), fontSize = 13.sp,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(5.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        HeroMeta(
                            Icons.Filled.LocationOn,
                            job.distanceKm?.let { String.format("%.1f km away", it) } ?: job.location.ifBlank { "—" },
                        )
                        Box(
                            Modifier.padding(horizontal = 10.dp)
                                .width(1.dp).height(13.dp).background(Color.White.copy(alpha = 0.45f)),
                        )
                        // Start time only, as the reference shows. The full window is a tooltip's
                        // worth of detail that pushed this line to two rows on narrower phones.
                        HeroMeta(Icons.Filled.Schedule, job.time.ifBlank { timeWindow })
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HeroAction(Modifier.weight(1f), Icons.Filled.Navigation, "Navigate", Color.White, Purple, onNavigate, actionsEnabled)
                HeroAction(Modifier.weight(1f), Icons.Filled.Phone, "Call", Color.White, Purple, onCall, actionsEnabled)
                HeroAction(Modifier.weight(1.15f), startIcon, startLabel, StartJobViolet, Color.White, onStart)
            }
        }
    }
}

@Composable
private fun HeroMeta(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = Color.White.copy(alpha = 0.92f), modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(4.dp))
        Text(
            text, color = Color.White.copy(alpha = 0.92f), fontSize = 12.5.sp,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun HeroAction(
    modifier: Modifier,
    icon: ImageVector,
    label: String,
    bg: Color,
    fg: Color,
    onClick: () -> Unit,
    enabled: Boolean = true,
) {
    // Dimmed and inert rather than hidden: the worker can still see the action exists, which keeps
    // the card's three-button shape steady instead of reflowing mid-job.
    val a = if (enabled) 1f else 0.45f
    Row(
        modifier.height(34.dp).clip(RoundedCornerShape(11.dp))
            .background(bg.copy(alpha = bg.alpha * a))
            .then(if (enabled) Modifier.clickable(onClick = onClick) else Modifier),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = fg.copy(alpha = a), modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, color = fg.copy(alpha = a), fontSize = 13.5.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

// ── Quick actions ────────────────────────────────────────────────────────────

/** The three-up shortcut strip: Attendance · My Shift · Emergency. */
@Composable
fun QuickActionStrip(onAttendance: () -> Unit, onShifts: () -> Unit, onEmergency: () -> Unit) {
    Panel(padH = 4.dp, padV = 5.dp) {
        Row(
            Modifier.fillMaxWidth().height(IntrinsicSize.Min),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            QuickAction(Modifier.weight(1f), Icons.Filled.EventAvailable, "Attendance", Purple, onAttendance)
            Box(Modifier.width(1.dp).height(32.dp).background(Divider))
            QuickAction(Modifier.weight(1f), Icons.Filled.CalendarMonth, "My Shift", BlueAccent, onShifts)
            Box(Modifier.width(1.dp).height(32.dp).background(Divider))
            QuickAction(Modifier.weight(1f), Icons.Filled.Shield, "Emergency", RedCancel, onEmergency, sosGlyph = true)
        }
    }
}

@Composable
private fun QuickAction(
    modifier: Modifier,
    icon: ImageVector,
    label: String,
    tint: Color,
    onClick: () -> Unit,
    sosGlyph: Boolean = false,
) {
    Column(
        modifier.clip(RoundedCornerShape(14.dp)).clickable(onClick = onClick).padding(vertical = 3.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(26.dp))
            // The reference draws Emergency as the word SOS inside a red shield.
            if (sosGlyph) {
                Text("SOS", color = Color.White, fontSize = 7.5.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(5.dp))
        Text(
            label, color = TextDark, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
        )
    }
}

// ── Today ────────────────────────────────────────────────────────────────────

/**
 * TODAY — jobs done, money earned, the target and progress toward it, over a bar and a
 * one-line prompt telling the worker what is left.
 */
@Composable
fun TodayPanel(
    completed: Int,
    totalJobs: Int,
    earned: Int,
    target: Int,
    onViewAll: () -> Unit,
    onEditTarget: () -> Unit,
) {
    // Progress is measured in money against the money target — that is what "Today's Target
    // ₹1,000" promises. The prompt underneath counts jobs, which is the lever the worker pulls.
    val pct = if (target > 0) (earned.toFloat() / target).coerceIn(0f, 1f) else 0f
    val jobsLeft = (totalJobs - completed).coerceAtLeast(0)
    Panel(padH = 0.dp, padV = 7.dp) {
        Box(Modifier.padding(horizontal = PanelPad)) {
            PanelHeader("TODAY", "View all", onViewAll)
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            TodayCell(Modifier.weight(1f), Icons.Filled.Work, Purple, Primary50, "Jobs Completed", "$completed / $totalJobs")
            CellDivider()
            TodayCell(Modifier.weight(1f), Icons.Filled.CurrencyRupee, GreenSuccess, GreenLight, "Earned", money(earned))
            CellDivider()
            TodayCell(
                Modifier.weight(1f).clickable(onClick = onEditTarget),
                Icons.Filled.TrackChanges, OrangeAccent, OrangeLight, "Today's Target", money(target),
            )
            CellDivider()
            TodayCell(Modifier.weight(1f), Icons.Filled.DonutLarge, Purple, Primary50, "Progress", "${(pct * 100).toInt()}%")
        }
        Spacer(Modifier.height(7.dp))
        Box(
            Modifier.padding(horizontal = PanelPad).fillMaxWidth().height(6.dp)
                .clip(RoundedCornerShape(Radius.pill)).background(PurpleLight),
        ) {
            // A sliver is always drawn so the track reads as a progress bar at 0%, exactly as
            // the reference shows it on an empty day.
            Box(
                Modifier.fillMaxWidth(pct.coerceAtLeast(0.04f)).fillMaxHeight()
                    .clip(RoundedCornerShape(Radius.pill)).background(Purple),
            )
        }
        Spacer(Modifier.height(5.dp))
        Text(
            when {
                target > 0 && earned >= target -> "Target reached — nice work!"
                jobsLeft > 0 -> "Complete $jobsLeft more job${if (jobsLeft == 1) "" else "s"} to reach your target"
                else -> "No jobs scheduled yet — go online to get requests"
            },
            color = TextGray, fontSize = 11.5.sp, textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(horizontal = PanelPad),
        )
    }
}

@Composable
private fun TodayCell(
    modifier: Modifier,
    icon: ImageVector,
    tint: Color,
    tintBg: Color,
    label: String,
    value: String,
) {
    // 24dp plate, 3dp gutters and an 8sp caption. Four cells across a 393dp screen give ~98dp
    // each; at 32dp/8dp/9.5sp the captions clipped to "Jobs Com…" and "Today's Ta…". The
    // reference sets these captions far smaller than their figures for exactly this reason.
    Row(
        modifier.fillMaxHeight().padding(horizontal = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(24.dp).clip(CircleShape).background(tintBg),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(14.dp))
        }
        Spacer(Modifier.width(4.dp))
        Column {
            Text(
                label, color = TextGray, fontSize = 8.sp, lineHeight = 10.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                value, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** Hairline between the cells of a metric row. */
@Composable
private fun CellDivider() {
    Box(Modifier.width(1.dp).fillMaxHeight().background(Divider))
}

// ── Next up ──────────────────────────────────────────────────────────────────

/**
 * UPCOMING SERVICES — the jobs queued AFTER the one in the hero. Renders nothing when there are
 * none, rather than showing an empty shell.
 */
@Composable
fun NextUpPanel(items: List<ScheduleItem>, onViewSchedule: () -> Unit, onItem: (ScheduleItem) -> Unit) {
    Panel(padV = 6.dp) {
        PanelHeader("UPCOMING SERVICES", "View All", onViewSchedule)
        items.forEachIndexed { i, item ->
            NextUpRow(item) { onItem(item) }
            if (i != items.lastIndex) {
                Box(Modifier.fillMaxWidth().height(1.dp).background(Divider))
            }
        }
    }
}

// ── Recent services / welcome ────────────────────────────────────────────────

/**
 * The worker's last completed services, newest first (the feed arrives id-DESC).
 *
 * Sits between TODAY and the bonus banner, where the page previously ran out of content and left
 * a block of empty white below the fold.
 */
@Composable
fun RecentServicesPanel(items: List<Booking>, onViewAll: () -> Unit, onItem: (Booking) -> Unit) {
    Panel(padV = 6.dp) {
        PanelHeader("RECENT SERVICES", "View All", onViewAll)
        items.forEachIndexed { i, b ->
            RecentServiceRow(b) { onItem(b) }
            if (i != items.lastIndex) {
                Box(Modifier.fillMaxWidth().height(1.dp).background(Divider))
            }
        }
    }
}

@Composable
private fun RecentServiceRow(b: Booking, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(34.dp).clip(CircleShape).background(GreenLight),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(18.dp)) }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                b.service?.ifBlank { null } ?: "Service", color = TextDark, fontSize = 14.sp,
                fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Text(
                listOfNotNull(b.customerName?.ifBlank { null }, b.timeInfo?.ifBlank { null }).joinToString(" · "),
                color = TextGray, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(6.dp))
        // The worker's own share, which is what bookingDto already sends — not the customer's total.
        Text("₹${b.amount}", color = GreenSuccess, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(16.dp))
    }
}

/**
 * Shown in place of [RecentServicesPanel] for a worker who has not completed anything yet.
 *
 * A brand-new worker would otherwise meet an empty panel or bare white space on their first
 * screen; this greets them and points at the one thing they can act on — going online.
 */
@Composable
fun WelcomeCard(name: String, greeting: String, online: Boolean) {
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).clip(CircleShape).background(PurpleLight),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Redeem, contentDescription = null, tint = Purple, modifier = Modifier.size(21.dp)) }
            Spacer(Modifier.width(11.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (name.isBlank()) greeting else "$greeting, $name!",
                    color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(3.dp))
                Text("Welcome to HomeHelp", color = Purple, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        Spacer(Modifier.height(9.dp))
        Text(
            if (online) "You're online — your first service will appear here as soon as a customer books you."
            else "Go online to start receiving jobs. Your completed services will show up here.",
            color = TextGray, fontSize = 12.sp,
        )
    }
}

@Composable
private fun NextUpRow(item: ScheduleItem, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Time as a two-line lavender plate ("1:00" over "PM"), as the reference draws it.
        val (clock, meridiem) = splitTime(item.time)
        Column(
            Modifier.width(46.dp).clip(RoundedCornerShape(10.dp)).background(Primary50)
                .padding(vertical = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(clock, color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            if (meridiem.isNotBlank()) {
                Text(meridiem, color = Purple, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                item.service.ifBlank { "Service" }, color = TextDark, fontSize = 14.sp,
                fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    item.customerName.ifBlank { item.location }, color = TextGray, fontSize = 11.5.sp,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                if (item.distanceKm != null) {
                    Spacer(Modifier.width(6.dp))
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = TextMuted, modifier = Modifier.size(12.dp))
                    Text(
                        String.format("%.1f km away", item.distanceKm),
                        color = TextMuted, fontSize = 11.sp, maxLines = 1,
                    )
                }
            }
        }
        Spacer(Modifier.width(6.dp))
        Box(
            Modifier.clip(RoundedCornerShape(Radius.pill)).background(Primary50)
                .padding(horizontal = 10.dp, vertical = 4.dp),
        ) {
            Text(
                item.status.ifBlank { "Upcoming" }, color = Purple,
                fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
            )
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(16.dp))
    }
}

/** Split "1:00 PM" into its clock and meridiem halves for the two-line time plate. */
private fun splitTime(time: String): Pair<String, String> {
    val t = time.trim()
    if (t.isBlank()) return "—" to ""
    val parts = t.split(" ")
    return if (parts.size >= 2 && parts[1].length <= 2) parts[0] to parts[1].uppercase() else t to ""
}

// ── Bonus banner ─────────────────────────────────────────────────────────────

/** The violet bonus card closing the page. */
@Composable
fun BonusBanner(title: String, subtitle: String, onDetails: () -> Unit) {
    Box(
        Modifier.fillMaxWidth()
            .shadow(10.dp, RoundedCornerShape(20.dp), spotColor = Purple.copy(alpha = 0.35f))
            .clip(RoundedCornerShape(20.dp))
            .background(BonusGradient)
            .clickable(onClick = onDetails),
    ) {
        Icon(
            Icons.Filled.Redeem, contentDescription = null,
            tint = Color.White.copy(alpha = 0.28f),
            modifier = Modifier.align(Alignment.CenterEnd).padding(end = 18.dp).size(104.dp),
        )
        // The reference stacks "View Details" BELOW the copy. Here it sits inline to the right:
        // the stacked version is ~37dp taller, which is the difference between this banner
        // landing on screen and being pushed under the nav. Same content, same actions.
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(28.dp).clip(CircleShape).background(Gold.copy(alpha = 0.85f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Stars, contentDescription = null, tint = Color.White, modifier = Modifier.size(17.dp))
            }
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Text(title, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(
                    subtitle, color = Color.White.copy(alpha = 0.93f), fontSize = 11.5.sp,
                    lineHeight = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(8.dp))
            Row(
                Modifier.clip(RoundedCornerShape(Radius.pill)).background(Color.White)
                    .clickable(onClick = onDetails)
                    .padding(start = 12.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Details", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Purple, modifier = Modifier.size(14.dp))
            }
        }
    }
}

// ── Retained by other screens ────────────────────────────────────────────────

/** A section title with a trailing action link, used by screens outside Home. */
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

/**
 * The resume-active-job banner. It sits at the very top of Home when a job is live: a job in
 * progress is the single most important thing on the screen.
 */
@Composable
fun ActiveJobBanner(label: String, subtitle: String, onResume: () -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .shadow(6.dp, RoundedCornerShape(PanelRadius), spotColor = GreenSuccess.copy(alpha = 0.4f))
            .clip(RoundedCornerShape(PanelRadius))
            .background(GreenSuccess)
            .clickable(onClick = onResume)
            .padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(34.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.22f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.CleaningServices, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(label, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Text(
                subtitle, color = Color.White.copy(alpha = 0.92f), fontSize = 11.5.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
    }
}

/** Kept for the attendance route: the check-in / check-out strip other screens still link to. */
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
    Panel {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(Radius.field)).background(tintBg),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Schedule, contentDescription = null, tint = accent, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f).clickable(onClick = onOpen)) {
                Text(label, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Text(
                    when {
                        att.checkedOut && att.checkOutAt.isNotBlank() -> "Out at ${att.checkOutAt}"
                        att.checkedIn && att.checkInAt.isNotBlank() -> "In at ${att.checkInAt}"
                        att.shiftName.isNotBlank() -> "${att.shiftName} · ${att.shiftStart}–${att.shiftEnd}"
                        else -> "Pick a shift to get started"
                    },
                    color = TextGray, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
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
}

@Composable
private fun AttendanceAction(label: String, fill: Brush?, onClick: () -> Unit) {
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
