package com.homehelp.pro

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.NavHostController
import com.homehelp.pro.network.ShaktiBonusDto
import com.homehelp.pro.network.ShaktiTier
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ─────────────────────────────────────────────────────────────────────────────
// HomeHelp Pro — PREMIUM component library (Dribbble-grade, production-ready).
//
// Purely presentational, self-contained widgets used to lift the app to an
// award-winning, fintech-premium feel. Every widget is data-driven from values
// the caller already has — nothing here fabricates business figures. Added as a
// NEW file so no existing component signature changes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Frosted-glass panel for gradient hero surfaces — a translucent white fill with a
 * soft light border. Gives the layered "glassmorphism (light)" look on the hero.
 */
@Composable
fun GlassPanel(
    modifier: Modifier = Modifier,
    radius: Dp = Radius.card,
    alpha: Float = 0.16f,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .clip(RoundedCornerShape(radius))
            .background(Color.White.copy(alpha = alpha))
            .padding(Space.l),
        content = content,
    )
}

/**
 * Smooth mini area+line chart (sparkline). Draws a bezier-smoothed line over a soft
 * gradient fill with an accent end-dot. Renders nothing meaningful for < 2 points.
 */
@Composable
fun Sparkline(
    data: List<Float>,
    modifier: Modifier = Modifier,
    lineColor: Color = Purple,
    fillColor: Color = Purple.copy(alpha = 0.22f),
) {
    if (data.size < 2) { Box(modifier); return }
    Canvas(modifier) {
        val maxV = data.maxOrNull() ?: 0f
        val minV = data.minOrNull() ?: 0f
        val range = (maxV - minV).takeIf { it > 0f } ?: 1f
        val stepX = size.width / (data.size - 1)
        val pad = size.height * 0.14f
        val pts = data.mapIndexed { i, v ->
            val y = size.height - pad - ((v - minV) / range) * (size.height - pad * 2)
            Offset(i * stepX, y)
        }
        val line = Path().apply {
            moveTo(pts[0].x, pts[0].y)
            for (i in 1 until pts.size) {
                val p0 = pts[i - 1]; val p1 = pts[i]; val midX = (p0.x + p1.x) / 2f
                cubicTo(midX, p0.y, midX, p1.y, p1.x, p1.y)
            }
        }
        val area = Path().apply {
            addPath(line)
            lineTo(pts.last().x, size.height)
            lineTo(pts.first().x, size.height)
            close()
        }
        drawPath(area, brush = Brush.verticalGradient(listOf(fillColor, Color.Transparent)))
        drawPath(line, color = lineColor, style = Stroke(width = 2.6.dp.toPx(), cap = StrokeCap.Round))
        drawCircle(color = Color.White, radius = 4.2.dp.toPx(), center = pts.last())
        drawCircle(color = lineColor, radius = 3.dp.toPx(), center = pts.last())
    }
}

/**
 * Animated circular progress ring with a brand-gradient sweep, rounded caps and a
 * free center slot (value / label). Sweeps in on first composition.
 */
@Composable
fun CircularGoalRing(
    progress: Float,
    modifier: Modifier = Modifier,
    ringSize: Dp = 96.dp,
    stroke: Dp = 11.dp,
    trackColor: Color = Color(0xFFEDEBFB),
    brush: Brush = BrandGradient,
    center: @Composable () -> Unit = {},
) {
    val anim by animateFloatAsState(progress.coerceIn(0f, 1f), tween(900), label = "ring")
    Box(modifier.size(ringSize), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val sw = stroke.toPx()
            val d = size.minDimension - sw
            val topLeft = Offset((size.width - d) / 2f, (size.height - d) / 2f)
            val arcSize = Size(d, d)
            drawArc(
                color = trackColor, startAngle = -90f, sweepAngle = 360f, useCenter = false,
                topLeft = topLeft, size = arcSize, style = Stroke(sw, cap = StrokeCap.Round),
            )
            if (anim > 0f) {
                drawArc(
                    brush = brush, startAngle = -90f, sweepAngle = 360f * anim, useCenter = false,
                    topLeft = topLeft, size = arcSize, style = Stroke(sw, cap = StrokeCap.Round),
                )
            }
        }
        center()
    }
}

/**
 * Premium floating KPI card — soft-shadowed white surface with a top gradient accent,
 * a tinted icon chip, label, large value, optional caption and an optional trailing
 * visual slot (e.g. a Sparkline). Lightweight and layered, per the premium spec.
 */
@Composable
fun PremiumStatCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    label: String,
    value: String,
    accent: Color,
    accentBg: Color,
    caption: String? = null,
    captionColor: Color = TextGray,
    trailing: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier
            .shadow(6.dp, RoundedCornerShape(Radius.card), spotColor = accent.copy(alpha = 0.18f), ambientColor = Color(0x0A101828))
            .clip(RoundedCornerShape(Radius.card))
            .background(CardBg),
    ) {
        // top gradient accent hairline
        Box(Modifier.fillMaxWidth().height(3.dp).background(Brush.horizontalGradient(listOf(accent, accent.copy(alpha = 0.35f)))))
        Column(Modifier.padding(Space.m)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(accentBg),
                    contentAlignment = Alignment.Center,
                ) { Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(19.dp)) }
                Spacer(Modifier.weight(1f))
                if (trailing != null) trailing()
            }
            Spacer(Modifier.height(Space.m))
            Text(tr(label), color = TextGray, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(2.dp))
            Text(value, color = TextDark, fontSize = 22.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.4).sp, maxLines = 1)
            if (caption != null) {
                Spacer(Modifier.height(3.dp))
                Text(caption, color = captionColor, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
        }
    }
}

/** Small trend chip (▲/▼ + text) used inside stat cards. Green for up, red for down. */
@Composable
fun TrendChip(text: String, up: Boolean = true) {
    val fg = if (up) GreenSuccess else RedCancel
    val bg = if (up) GreenLight else RedLight
    Row(
        Modifier.clip(RoundedCornerShape(Radius.pill)).background(bg).padding(horizontal = 7.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(if (up) "▲" else "▼", color = fg, fontSize = 8.sp)
        Spacer(Modifier.width(3.dp))
        Text(text, color = fg, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
    }
}

/**
 * Animated 7-day earnings LINE chart — a smooth bezier line over a soft gradient area,
 * with per-point dots (today highlighted) and weekday labels. The line grows up from the
 * baseline on first composition. `days` = (weekday, amount, isToday); amounts are real.
 */
@Composable
fun AnimatedLineChart(
    days: List<Triple<String, Int, Boolean>>,
    modifier: Modifier = Modifier,
    lineColor: Color = Purple,
    fillColor: Color = Purple,
    height: Dp = 132.dp,
) {
    if (days.isEmpty()) { Box(modifier); return }
    var started by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { started = true }
    val anim by animateFloatAsState(
        if (started) 1f else 0f,
        androidx.compose.animation.core.tween(1100, easing = androidx.compose.animation.core.FastOutSlowInEasing),
        label = "lineChart",
    )
    val maxV = (days.maxOfOrNull { it.second } ?: 0).coerceAtLeast(1).toFloat()
    Column(modifier.fillMaxWidth()) {
        Canvas(Modifier.fillMaxWidth().height(height)) {
            val topPad = 16.dp.toPx(); val botPad = 8.dp.toPx()
            val usableH = size.height - topPad - botPad
            val baseY = size.height - botPad
            val stepX = if (days.size > 1) size.width / (days.size - 1) else size.width
            val target = days.mapIndexed { i, d -> Offset(i * stepX, baseY - (d.second / maxV) * usableH) }
            val cur = target.map { Offset(it.x, baseY + (it.y - baseY) * anim) }
            // faint baseline
            drawLine(Color(0x14101828), Offset(0f, baseY), Offset(size.width, baseY), strokeWidth = 1.dp.toPx())
            val line = Path().apply {
                moveTo(cur[0].x, cur[0].y)
                for (i in 1 until cur.size) {
                    val p0 = cur[i - 1]; val p1 = cur[i]; val mx = (p0.x + p1.x) / 2f
                    cubicTo(mx, p0.y, mx, p1.y, p1.x, p1.y)
                }
            }
            val area = Path().apply {
                addPath(line); lineTo(cur.last().x, baseY); lineTo(cur.first().x, baseY); close()
            }
            drawPath(area, Brush.verticalGradient(listOf(fillColor.copy(alpha = 0.30f * anim), Color.Transparent)))
            drawPath(
                line, color = lineColor,
                style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round),
            )
            cur.forEachIndexed { i, p ->
                if (days[i].third) {
                    drawCircle(lineColor.copy(alpha = 0.16f), radius = 10.dp.toPx() * anim, center = p)
                    drawCircle(Color.White, radius = 6.dp.toPx(), center = p)
                    drawCircle(lineColor, radius = 4.dp.toPx(), center = p)
                } else {
                    drawCircle(Color.White, radius = 4.5.dp.toPx(), center = p)
                    drawCircle(lineColor, radius = 3.dp.toPx(), center = p)
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth()) {
            days.forEach { (label, _, today) ->
                Text(
                    label, Modifier.weight(1f), textAlign = TextAlign.Center, fontSize = 10.sp,
                    color = if (today) lineColor else TextMuted, fontWeight = if (today) FontWeight.Bold else FontWeight.Medium,
                )
            }
        }
    }
}

/**
 * Rewards tier LADDER — makes the Bronze → Silver → Gold → Platinum progression explicit.
 * Shows the worker's CURRENT (achieved) tier, a stepper of all four tiers with the reached
 * ones filled, and the exact criteria for the NEXT tier (completed jobs + rating) — both
 * derived from real data via WorkerTier.of(jobsCompleted, rating). No fabricated figures.
 */
@Composable
fun RewardTierCard(
    tier: WorkerTier,
    jobsCompleted: Int,
    rating: Double,
    progress: Float,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
) {
    val tiers = WorkerTier.entries
    val next = WorkerTier.next(tier)
    Column(
        modifier
            .fillMaxWidth()
            .shadow(16.dp, RoundedCornerShape(Radius.card), spotColor = Violet, ambientColor = Violet)
            .clip(RoundedCornerShape(Radius.card))
            .background(HeroGradient)
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier)
            .padding(Space.l),
    ) {
        // Current tier headline.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(46.dp).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.18f)),
                contentAlignment = Alignment.Center,
            ) { Text(tier.emoji, fontSize = 24.sp) }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text("You're ${tier.label} 🎉", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Text(
                    "$jobsCompleted ${if (jobsCompleted == 1) "job" else "jobs"} · ${if (rating > 0) "$rating★" else "no rating yet"}",
                    color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp,
                )
            }
            Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = Color.White.copy(alpha = 0.9f), modifier = Modifier.size(22.dp))
        }

        Spacer(Modifier.height(Space.l))

        // Bronze → Silver → Gold → Platinum stepper (reached tiers filled).
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            tiers.forEachIndexed { i, t ->
                val reached = i <= tier.ordinal
                val isCurrent = i == tier.ordinal
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.size(if (isCurrent) 40.dp else 34.dp)
                            .clip(RoundedCornerShape(Radius.pill))
                            .background(if (reached) Color.White else Color.White.copy(alpha = 0.20f))
                            .then(if (isCurrent) Modifier.padding(0.dp) else Modifier),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(t.emoji, fontSize = if (isCurrent) 20.sp else 15.sp)
                    }
                    Spacer(Modifier.height(5.dp))
                    Text(
                        t.label, fontSize = 10.sp,
                        color = if (reached) Color.White else Color.White.copy(alpha = 0.55f),
                        fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium,
                    )
                }
                if (i < tiers.lastIndex) {
                    val seg = when {
                        i < tier.ordinal -> 1f
                        i == tier.ordinal -> progress.coerceIn(0f, 1f)
                        else -> 0f
                    }
                    val animSeg by animateFloatAsState(seg, tween(900), label = "seg$i")
                    Box(
                        Modifier.weight(1f).padding(top = if (i == tier.ordinal || i + 1 == tier.ordinal) 20.dp else 17.dp, start = 4.dp, end = 4.dp)
                            .height(3.dp).clip(RoundedCornerShape(Radius.pill))
                            .background(Color.White.copy(alpha = 0.22f)),
                    ) {
                        Box(Modifier.fillMaxWidth(animSeg).height(3.dp).clip(RoundedCornerShape(Radius.pill)).background(Color.White))
                    }
                }
            }
        }

        // Next-tier criteria (jobs + rating), each with a met/locked marker.
        if (next != null) {
            Spacer(Modifier.height(Space.l))
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).background(Color.White.copy(alpha = 0.12f)).padding(Space.m)) {
                Column {
                    Text("Unlock ${next.label} ${next.emoji}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Spacer(Modifier.height(Space.s))
                    TierReq("Complete jobs", "$jobsCompleted / ${next.minJobs}", jobsCompleted >= next.minJobs)
                    Spacer(Modifier.height(6.dp))
                    TierReq("Keep rating", "${if (rating > 0) rating else 0.0}★ / ${next.minRating}★", rating >= next.minRating)
                }
            }
        } else {
            Spacer(Modifier.height(Space.m))
            Text("Top tier reached — you're elite 💎🏆", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        }
    }
}

/**
 * Home "Sitara Bonus" card — mirrors the real Sitara/Shakti reward program (working days +
 * Sundays + rating, Bronze→Silver→Gold, real ₹ amounts) in the premium ladder design.
 * Fully data-driven from vm.shaktiBonus; no fabricated tiers or figures. Tap → full screen.
 */
@Composable
fun SitaraBonusCard(s: ShaktiBonusDto?, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    val emojis = listOf("🥉", "🥈", "🥇")
    val tiers = s?.tiers ?: emptyList()
    val workingDays = s?.workingDays ?: 0
    val sundays = s?.sundays ?: 0
    val ratingMet = s?.ratingMet ?: false
    val ratingTarget = s?.ratingTarget ?: 4.5
    val rating = s?.rating ?: 0.0
    fun reached(t: ShaktiTier) = workingDays >= t.days && sundays >= t.sundays && ratingMet
    val currentIdx = tiers.indexOfLast { reached(it) }
    val goldDays = tiers.lastOrNull()?.days ?: 28

    Column(
        modifier
            .fillMaxWidth()
            .shadow(16.dp, RoundedCornerShape(Radius.card), spotColor = Violet, ambientColor = Violet)
            .clip(RoundedCornerShape(Radius.card))
            .background(HeroGradient)
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier)
            .padding(Space.l),
    ) {
        // Headline
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(46.dp).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.18f)),
                contentAlignment = Alignment.Center,
            ) { Text("⭐", fontSize = 24.sp) }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text("Sitara Bonus", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Text(
                    if (currentIdx >= 0) "You've earned ${tiers[currentIdx].name} · ₹${tiers[currentIdx].amount}"
                    else "Work days this month to earn a bonus",
                    color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp,
                )
            }
            Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = Color.White.copy(alpha = 0.9f), modifier = Modifier.size(22.dp))
        }

        Spacer(Modifier.height(Space.l))

        if (tiers.isEmpty()) {
            Text("Loading your bonus progress…", color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp)
        } else {
            // Bronze → Silver → Gold stepper with real ₹ amounts.
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                tiers.forEachIndexed { i, t ->
                    val rc = reached(t)
                    val isCurrent = i == currentIdx
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            Modifier.size(if (isCurrent) 42.dp else 36.dp).clip(RoundedCornerShape(Radius.pill))
                                .background(if (rc) Color.White else Color.White.copy(alpha = 0.20f)),
                            contentAlignment = Alignment.Center,
                        ) { Text(emojis.getOrElse(i) { "🏅" }, fontSize = if (isCurrent) 20.sp else 16.sp) }
                        Spacer(Modifier.height(4.dp))
                        Text(t.name, color = if (rc) Color.White else Color.White.copy(alpha = 0.6f), fontSize = 10.sp, fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium)
                        Text("₹${t.amount}", color = Color.White.copy(alpha = if (rc) 0.95f else 0.6f), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                    if (i < tiers.lastIndex) {
                        val seg = (workingDays.toFloat() / tiers[i + 1].days.coerceAtLeast(1)).coerceIn(0f, 1f)
                        val animSeg by animateFloatAsState(seg, tween(900), label = "sseg$i")
                        Box(
                            Modifier.weight(1f).padding(top = 18.dp, start = 3.dp, end = 3.dp).height(3.dp)
                                .clip(RoundedCornerShape(Radius.pill)).background(Color.White.copy(alpha = 0.22f)),
                        ) {
                            Box(Modifier.fillMaxWidth(animSeg).height(3.dp).clip(RoundedCornerShape(Radius.pill)).background(Color.White))
                        }
                    }
                }
            }

            Spacer(Modifier.height(Space.l))

            // Criteria panel: next-step hint + working days + rating (target 4.5).
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).background(Color.White.copy(alpha = 0.12f)).padding(Space.m)) {
                Column {
                    val hint = when {
                        s == null -> "Loading…"
                        !ratingMet -> "Keep your rating ${ratingTarget}★+ to unlock the bonus"
                        s.nextTier.isNotBlank() -> {
                            val amt = tiers.firstOrNull { it.name == s.nextTier }?.amount ?: 0
                            val need = mutableListOf<String>()
                            if (s.daysToNext > 0) need.add("${s.daysToNext} more day${if (s.daysToNext == 1) "" else "s"}")
                            if (s.sundaysToNext > 0) need.add("${s.sundaysToNext} Sunday${if (s.sundaysToNext == 1) "" else "s"}")
                            if (need.isEmpty()) "On track for ${s.nextTier} (₹$amt)" else "${need.joinToString(" + ")} to reach ${s.nextTier} (₹$amt)"
                        }
                        currentIdx >= 0 -> "🎉 Top tier reached — ${tiers[currentIdx].name}!"
                        else -> "Work your shifts to earn your first bonus"
                    }
                    Text(hint, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, lineHeight = 17.sp)
                    Spacer(Modifier.height(Space.s))
                    TierReq("Working days", "$workingDays / $goldDays", workingDays >= goldDays)
                    Spacer(Modifier.height(6.dp))
                    TierReq("Rating", "${if (rating > 0) rating else 0.0}★ / ${ratingTarget}★", ratingMet)
                }
            }
        }
    }
}

/** One criterion row inside the tier ladder: label, current/target value and a met/locked chip. */
@Composable
private fun TierReq(label: String, value: String, met: Boolean) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(18.dp).clip(RoundedCornerShape(Radius.pill))
                .background(if (met) GreenSuccess else Color.White.copy(alpha = 0.25f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (met) Icons.Filled.Check else Icons.Filled.Lock,
                contentDescription = null, tint = Color.White, modifier = Modifier.size(11.dp),
            )
        }
        Spacer(Modifier.width(Space.s))
        Text(tr(label), color = Color.White.copy(alpha = 0.9f), fontSize = 12.sp, modifier = Modifier.weight(1f))
        Text(value, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
    }
}

/** One premium performance metric: label, big value and an optional 0..1 meter bar. */
@Composable
fun PerformanceMetric(
    modifier: Modifier = Modifier,
    label: String,
    value: String,
    accent: Color,
    meter: Float? = null,
    icon: ImageVector? = null,
) {
    Column(
        modifier
            .clip(RoundedCornerShape(Radius.field))
            .background(ScreenBg)
            .padding(Space.m),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) {
                Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(5.dp))
            }
            Text(tr(label), color = TextGray, fontSize = 11.5.sp, fontWeight = FontWeight.Medium, maxLines = 1)
        }
        Spacer(Modifier.height(5.dp))
        Text(value, color = TextDark, fontSize = 18.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp)
        if (meter != null) {
            Spacer(Modifier.height(7.dp))
            val anim by animateFloatAsState(meter.coerceIn(0f, 1f), tween(800), label = "meter")
            Box(Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(Radius.pill)).background(Divider)) {
                Box(Modifier.fillMaxWidth(anim).height(5.dp).clip(RoundedCornerShape(Radius.pill)).background(accent))
            }
        }
    }
}

/** Premium rounded-icon tile for the Quick-Actions grid, with a springy press. */
@Composable
fun PremiumActionTile(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    label: String,
    accent: Color,
    accentBg: Color,
    onClick: () -> Unit,
) {
    Column(modifier.bounceClick(onClick), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .size(58.dp)
                .shadow(7.dp, RoundedCornerShape(18.dp), spotColor = accent.copy(alpha = 0.28f), ambientColor = Color(0x0A101828))
                .clip(RoundedCornerShape(18.dp))
                .background(CardBg),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(13.dp)).background(accentBg),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, contentDescription = label, tint = accent, modifier = Modifier.size(22.dp)) }
        }
        Spacer(Modifier.height(7.dp))
        Text(tr(label), fontSize = 11.sp, color = TextDark, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center, maxLines = 2, lineHeight = 13.sp)
    }
}

/**
 * Soft pulsing "live" dot — a small filled dot inside a breathing halo. Used to signal
 * the worker is online / receiving requests.
 */
@Composable
fun PulseDot(color: Color = GreenSuccess, size: Dp = 10.dp) {
    val transition = rememberInfiniteTransition(label = "pulse")
    val scale by transition.animateFloat(
        initialValue = 0.5f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "pulseScale",
    )
    Box(Modifier.size(size * 2), contentAlignment = Alignment.Center) {
        Box(Modifier.size(size * (1f + scale)).clip(RoundedCornerShape(Radius.pill)).background(color.copy(alpha = 0.22f)))
        Box(Modifier.size(size).clip(RoundedCornerShape(Radius.pill)).background(color))
    }
}

/** A compact inline star-rating readout (gold star + value), sized to fit stat cards. */
@Composable
fun StarValue(rating: Double, fontSize: Int = 22) {
    Row(verticalAlignment = Alignment.Bottom) {
        Text(if (rating > 0) rating.toString() else "—", color = TextDark, fontSize = fontSize.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.4).sp)
        Spacer(Modifier.width(4.dp))
        Icon(Icons.Filled.Star, contentDescription = null, tint = Gold, modifier = Modifier.size((fontSize - 6).dp).padding(bottom = 3.dp))
    }
}

/**
 * Premium floating bottom navigation — a soft-shadowed white pill bar (Home · Bookings ·
 * Wallet · Profile) with a raised center FAB that toggles the worker's online status
 * (green + pulse when online). Additive navigation only: every tab maps to an existing
 * route via navigateApp(); it changes no business logic.
 */
@Composable
fun FloatingBottomNav(nav: NavHostController, current: String?, vm: AppViewModel) {
    val online = vm.isOnline
    Box(
        Modifier.fillMaxWidth().padding(start = Space.l, end = Space.l, bottom = Space.m),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Box(Modifier.fillMaxWidth().height(76.dp)) {
            // The floating bar
            Row(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(62.dp)
                    .shadow(22.dp, RoundedCornerShape(30.dp), spotColor = Purple.copy(alpha = 0.28f), ambientColor = Color(0x14101828))
                    .clip(RoundedCornerShape(30.dp))
                    .background(CardBg),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                NavBarItem(Icons.Filled.Home, "Home", current == Routes.HOME) { nav.navigateApp(Routes.HOME) }
                NavBarItem(Icons.Filled.CalendarMonth, "Bookings", current == Routes.BOOKINGS) { nav.navigateApp(Routes.BOOKINGS) }
                Spacer(Modifier.weight(1f)) // center gap for the FAB
                NavBarItem(Icons.Filled.AccountBalanceWallet, "Wallet", current == Routes.WALLET) { nav.navigateApp(Routes.WALLET) }
                NavBarItem(Icons.Filled.Person, "Profile", current == Routes.PROFILE) { nav.navigateApp(Routes.PROFILE) }
            }
            // Raised center FAB — online/offline toggle
            Box(Modifier.align(Alignment.TopCenter), contentAlignment = Alignment.Center) {
                if (online) {
                    // soft pulse halo
                    val t = rememberInfiniteTransition(label = "fabPulse")
                    val s by t.animateFloat(1f, 1.35f, infiniteRepeatable(tween(1100), RepeatMode.Reverse), label = "fabScale")
                    Box(Modifier.size(56.dp * s).clip(RoundedCornerShape(Radius.pill)).background(GreenSuccess.copy(alpha = 0.18f)))
                }
                Box(
                    Modifier
                        .size(56.dp)
                        .shadow(16.dp, RoundedCornerShape(Radius.pill), spotColor = if (online) GreenSuccess else Violet, ambientColor = if (online) GreenSuccess else Violet)
                        .clip(RoundedCornerShape(Radius.pill))
                        .background(if (online) Brush.linearGradient(listOf(GreenSuccess, Color(0xFF16A34A))) else BrandGradient)
                        .clickable { vm.goOnline(!online) },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        if (online) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = if (online) "Go offline" else "Go online",
                        tint = Color.White, modifier = Modifier.size(26.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun RowScope.NavBarItem(icon: ImageVector, label: String, selected: Boolean, onClick: () -> Unit) {
    val color = if (selected) Purple else TextMuted
    Column(
        Modifier.weight(1f).clip(RoundedCornerShape(Radius.field)).clickable { onClick() }.padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, contentDescription = label, tint = color, modifier = Modifier.size(22.dp))
        Spacer(Modifier.height(3.dp))
        Text(tr(label), fontSize = 10.sp, color = color, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium)
    }
}
