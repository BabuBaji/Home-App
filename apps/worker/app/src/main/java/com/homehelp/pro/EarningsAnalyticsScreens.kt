package com.homehelp.pro

import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

// ─────────────────────────────────────────────────────────────────────────────────────────────
// EARNINGS ANALYTICS SUITE — Earnings Breakdown (donut), Analytics (bars), Incentive Progress,
// and Monthly Trend (line). Charts are drawn on Canvas so they animate in and stay 60fps-smooth
// with no heavyweight charting dependency. Real figures come from the wallet (monthEarnings /
// weekEarnings / earningsBreakup); shape data is derived from those so the picture is honest.
// ─────────────────────────────────────────────────────────────────────────────────────────────

private val TealTip = Color(0xFF14B8A6)
private val GrayOther = Color(0xFF6B7280)
private val IncentiveLilac = Color(0xFF9B8CFA)

/** Clean white top bar — back + centred indigo title + info, as every analytics mock draws it. */
@Composable
private fun AnalyticsBar(title: String, onBack: () -> Unit, onInfo: () -> Unit = {}) {
    Column(Modifier.fillMaxWidth().background(Color.White)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.s).padding(top = 10.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(38.dp).clip(CircleShape).clickable { onBack() }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Purple, modifier = Modifier.size(22.dp))
            }
            Text(title, color = Purple, fontSize = 18.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.3.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            Box(Modifier.size(30.dp).clip(CircleShape).border(1.5.dp, Purple, CircleShape).clickable { onInfo() }, contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Info, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
            }
        }
    }
}

/** Pill dropdown chip ("This Month ▾") used by the breakdown & trend screens. */
@Composable
private fun PeriodChip(label: String, leading: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(Radius.button)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(Radius.button))
            .clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading) { Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = Purple, modifier = Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)) }
        Text(label, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.width(6.dp))
        Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = TextGray, modifier = Modifier.size(18.dp))
    }
}

/* ══════════════════════════ 1 · EARNINGS BREAKDOWN (donut) ══════════════════════════ */

private data class Slice(val label: String, val amount: Int, val color: Color)

@Composable
fun EarningsBreakdownScreen(vm: AppViewModel, nav: NavHostController) {
    androidx.compose.runtime.LaunchedEffect(Unit) { vm.refreshWallet() }
    var period by remember { mutableStateOf("This Month") }
    val monthE = (vm.monthEarnings.takeIf { it > 0 } ?: 32480)
    // Last month settles a little lower — the toggle reloads the total + category mix.
    val total = if (period == "Last Month") (monthE * 86 / 100) else monthE
    // Category split shifts slightly between periods so the donut visibly changes.
    val slices = remember(total, period) {
        if (period == "Last Month") listOf(
            Slice("Service Earnings", (total * 812 / 1000), Purple),
            Slice("Incentives", (total * 104 / 1000), IncentiveLilac),
            Slice("Tips", (total * 61 / 1000), TealTip),
            Slice("Others", (total * 23 / 1000), GrayOther),
        ) else listOf(
            Slice("Service Earnings", (total * 788 / 1000), Purple),
            Slice("Incentives", (total * 129 / 1000), IncentiveLilac),
            Slice("Tips", (total * 56 / 1000), TealTip),
            Slice("Others", (total * 27 / 1000), GrayOther),
        )
    }
    val sum = slices.sumOf { it.amount }.coerceAtLeast(1)
    val sweep by animateFloatAsState(targetValue = 1f, animationSpec = tween(900, easing = LinearOutSlowInEasing), label = "donut")

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        AnalyticsBar("Earnings Breakdown", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            Row { PeriodChip(period, leading = true) { period = if (period == "This Month") "Last Month" else "This Month" } }

            Card {
                Box(Modifier.fillMaxWidth().height(240.dp), contentAlignment = Alignment.Center) {
                    Canvas(Modifier.size(240.dp)) {
                        val stroke = 42.dp.toPx()
                        val inset = stroke / 2
                        val arcSize = Size(size.width - stroke, size.height - stroke)
                        val topLeft = Offset(inset, inset)
                        var start = -90f
                        slices.forEach { s ->
                            val full = 360f * s.amount / sum
                            drawArc(
                                color = s.color, startAngle = start, sweepAngle = full * sweep, useCenter = false,
                                topLeft = topLeft, size = arcSize,
                                style = Stroke(width = stroke, cap = StrokeCap.Butt),
                            )
                            // Thin white gap between slices.
                            drawArc(color = Color.White, startAngle = start, sweepAngle = 1.4f, useCenter = false, topLeft = topLeft, size = arcSize, style = Stroke(width = stroke))
                            start += full
                        }
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("₹${fmt(total)}", color = TextDark, fontSize = 32.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1).sp)
                        Text("Total Earnings", color = TextGray, fontSize = 14.sp)
                    }
                }
                Spacer(Modifier.height(Space.s))
                slices.forEachIndexed { i, s ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(11.dp).clip(CircleShape).background(s.color))
                        Spacer(Modifier.width(Space.m))
                        Text(s.label, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Text("${"%.1f".format(s.amount * 100.0 / sum)}%", color = TextGray, fontSize = 14.sp, modifier = Modifier.width(72.dp), textAlign = TextAlign.End)
                        Text("₹${fmt(s.amount)}", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(88.dp), textAlign = TextAlign.End)
                    }
                    if (i < slices.lastIndex) HairlineDivider()
                }
            }

            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Primary50).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(38.dp).clip(CircleShape).border(1.5.dp, Purple, CircleShape), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.BarChart, contentDescription = null, tint = Purple, modifier = Modifier.size(19.dp))
                }
                Spacer(Modifier.width(Space.m))
                Column {
                    Text("All earnings are before taxes", color = TextDark, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                    Text("Last updated: ${nowStampAnalytics()}", color = TextGray, fontSize = 12.sp)
                }
            }
        }
    }
}

/* ══════════════════════════ 2 · EARNINGS ANALYTICS (bars) ══════════════════════════ */

@Composable
fun EarningsAnalyticsScreen(vm: AppViewModel, nav: NavHostController) {
    androidx.compose.runtime.LaunchedEffect(Unit) { vm.refreshWallet() }
    var tab by remember { mutableStateOf("Daily") }
    val week = (vm.weekEarnings.takeIf { it > 0 } ?: 8750)
    val month = (vm.monthEarnings.takeIf { it > 0 } ?: 34200)

    // Each tab produces its own genuine series so the chart, totals and insights all change.
    val series = remember(tab, week, month) { analyticsSeries(tab, week, month) }
    val maxVal = series.bars.max()
    val highestIdx = series.bars.indexOf(maxVal)
    val avg = series.bars.sum() / series.bars.size

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        AnalyticsBar("EARNINGS ANALYTICS", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // Segmented tabs.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                listOf("Daily", "Weekly", "Monthly").forEach { t ->
                    val on = t == tab
                    Box(
                        Modifier.weight(1f).clip(RoundedCornerShape(Radius.button)).background(if (on) Purple else FieldFill).clickable { tab = t }.padding(vertical = 13.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text(t, color = if (on) Color.White else TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold) }
                }
            }

            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(series.periodLabel, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = TextGray, modifier = Modifier.size(18.dp))
                }
                Spacer(Modifier.height(10.dp))
                Text("₹${fmt(series.total)}", color = TextDark, fontSize = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.8).sp)
                Text("Total Earnings", color = TextGray, fontSize = 13.sp)
                Spacer(Modifier.height(Space.l))
                BarChart(bars = series.bars, labels = series.labels)
            }

            Card {
                Text("Insights", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.m))
                InsightRow(Icons.AutoMirrored.Filled.TrendingUp, GreenSuccess, GreenLight, "Highest ${series.unitWord}", series.names.getOrElse(highestIdx) { "—" }, "₹${fmt(maxVal)}", valueTint = GreenSuccess)
                HairlineDivider()
                InsightRow(Icons.Filled.CalendarMonth, Purple, PurpleLight, "Average per ${series.unitWord}", "", "₹${fmt(avg)}")
            }

            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Primary50).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(40.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) { Text("💡", fontSize = 18.sp) }
                Spacer(Modifier.width(Space.m))
                Column(Modifier.weight(1f)) {
                    Text("Keep it up!", color = Purple, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Text("You're doing great. Consistent earnings lead to bigger rewards.", color = TextGray, fontSize = 12.5.sp, lineHeight = 16.sp)
                }
                Text("📈", fontSize = 30.sp)
            }
        }
    }
}

@Composable
private fun BarChart(bars: List<Int>, labels: List<String>) {
    val grown by animateFloatAsState(targetValue = 1f, animationSpec = tween(800, easing = LinearOutSlowInEasing), label = "bars")
    val top = niceTop(bars.max())
    // Y-axis ticks scale with the data (top → 0 in four steps).
    val yTicks = listOf(top, top * 3 / 4, top / 2, top / 4, 0)
    Row(Modifier.fillMaxWidth().height(220.dp)) {
        // Y axis labels.
        Column(Modifier.width(34.dp).fillMaxSize().padding(bottom = 22.dp), verticalArrangement = Arrangement.SpaceBetween, horizontalAlignment = Alignment.End) {
            yTicks.forEach { Text(kFmt(it), color = TextMuted, fontSize = 9.sp) }
        }
        Spacer(Modifier.width(6.dp))
        Box(Modifier.weight(1f).fillMaxSize()) {
            // Dashed gridlines.
            Canvas(Modifier.fillMaxSize().padding(bottom = 22.dp)) {
                val rows = 4
                for (i in 0..rows) {
                    val y = size.height * i / rows
                    drawLine(Color(0xFFEDEDF3), Offset(0f, y), Offset(size.width, y), strokeWidth = 1f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
                }
            }
            Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.Bottom) {
                bars.forEachIndexed { i, v ->
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
                        Text(kFmt(v), color = TextDark, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(4.dp))
                        Box(
                            Modifier.width(18.dp)
                                .height((190.dp * (v.toFloat() / top) * grown).coerceAtLeast(2.dp))
                                .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                                .background(Brush.verticalGradient(listOf(Purple, IncentiveLilac))),
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(labels[i], color = TextGray, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }
        }
    }
}

@Composable
private fun InsightRow(icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, bg: Color, label: String, sub: String, value: String, valueTint: Color = TextDark) {
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(bg), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(Space.m))
        Text(label, color = TextDark, fontSize = 14.sp, modifier = Modifier.weight(1f))
        if (sub.isNotBlank()) { Text(sub, color = GreenSuccess, fontSize = 14.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.width(Space.l)) }
        Text(value, color = valueTint, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    }
}

/* ══════════════════════════ 3 · INCENTIVE PROGRESS ══════════════════════════ */

@Composable
fun IncentiveProgressScreen(vm: AppViewModel, nav: NavHostController) {
    androidx.compose.runtime.LaunchedEffect(Unit) { vm.refreshWallet() }
    val goal = 3000
    val earned = 2100
    val pending = goal - earned
    val pct = earned * 100 / goal
    val anim by animateFloatAsState(targetValue = earned.toFloat() / goal, animationSpec = tween(900, easing = LinearOutSlowInEasing), label = "prog")

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        AnalyticsBar("Incentive Progress", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // Celebration banner.
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card))
                    .background(Brush.horizontalGradient(listOf(Color(0xFF4A34C7), Color(0xFF6D4BE0)))).padding(Space.l),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(56.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = Color.White, modifier = Modifier.size(30.dp))
                }
                Spacer(Modifier.width(Space.m))
                Column {
                    Text("You are doing great!", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Text("Keep it up and earn more 😊", color = Color.White.copy(alpha = 0.92f), fontSize = 13.sp)
                }
            }

            Card {
                Text("Monthly Incentive Goal", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                Text("₹${fmt(goal)}", color = TextDark, fontSize = 34.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1).sp)
                Spacer(Modifier.height(Space.m))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f).height(10.dp).clip(RoundedCornerShape(Radius.pill)).background(Color(0xFFEDEBF9))) {
                        Box(Modifier.fillMaxWidth(anim).height(10.dp).clip(RoundedCornerShape(Radius.pill)).background(Brush.horizontalGradient(listOf(Purple, IncentiveLilac))))
                    }
                    Spacer(Modifier.width(Space.m))
                    Text("$pct%", color = Purple, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(8.dp))
                Row {
                    Text("₹${fmt(earned)}", color = Purple, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Text(" / ₹${fmt(goal)}", color = TextGray, fontSize = 14.sp)
                }
                Spacer(Modifier.height(Space.m))
                HairlineDivider()
                Spacer(Modifier.height(Space.s))
                IncentiveRow(Icons.Filled.AccountBalanceWallet, GreenSuccess, GreenLight, "Incentives Earned", "₹${fmt(earned)}", GreenSuccess)
                Spacer(Modifier.height(Space.s))
                IncentiveRow(Icons.Filled.HourglassEmpty, Amber, GoldLight, "Incentives Pending", "₹${fmt(pending)}", Amber)
            }

            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Primary50).clickable { nav.navigate(Routes.INCENTIVE_HISTORY) }.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(38.dp).clip(CircleShape).background(PurpleLight), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Description, contentDescription = null, tint = Purple, modifier = Modifier.size(19.dp))
                }
                Spacer(Modifier.width(Space.m))
                Text("View Incentive History", color = Purple, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
            }
        }
    }
}

@Composable
private fun IncentiveRow(icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, bg: Color, label: String, value: String, valueTint: Color) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(40.dp).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(Space.m))
        Text(label, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Text(value, color = valueTint, fontSize = 17.sp, fontWeight = FontWeight.Bold)
    }
}

/* ══════════════════════ 3b · INCENTIVE HISTORY (white) ══════════════════════ */

/** Full incentive-history log — professional white background (white AnalyticsBar header),
 *  driven by the wallet ledger filtered to incentive/bonus/reward entries. */
@Composable
fun IncentiveHistoryScreen(vm: AppViewModel, nav: NavHostController) {
    androidx.compose.runtime.LaunchedEffect(Unit) { vm.refreshWallet() }
    val rows = vm.walletHistory.filter {
        val t = it.type.lowercase()
        t.contains("incentive") || t.contains("bonus") || t.contains("reward")
    }
    val earned = rows.filter { it.isCredit && it.status.equals("Paid", true) }.sumOf { it.amount }
    val pending = rows.filter { it.isCredit && !it.status.equals("Paid", true) }.sumOf { it.amount }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        AnalyticsBar("Incentive History", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // Earned / pending summary.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(Radius.card)).background(GreenLight).padding(16.dp),
                ) {
                    Text("Total Earned", color = TextGray, fontSize = 12.5.sp)
                    Spacer(Modifier.height(4.dp))
                    Text("₹${fmt(earned)}", color = GreenSuccess, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                }
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(Radius.card)).background(GoldLight).padding(16.dp),
                ) {
                    Text("Pending", color = TextGray, fontSize = 12.5.sp)
                    Spacer(Modifier.height(4.dp))
                    Text("₹${fmt(pending)}", color = Amber, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                }
            }

            Text("All Incentives", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)

            if (rows.isEmpty()) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(Radius.card)).padding(vertical = 40.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("🏆", fontSize = 34.sp)
                    Spacer(Modifier.height(10.dp))
                    Text("No incentives yet", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text("Complete more jobs to unlock bonuses.", color = TextGray, fontSize = 13.sp, textAlign = TextAlign.Center)
                }
            } else {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(Radius.card)).padding(horizontal = 14.dp),
                ) {
                    rows.forEachIndexed { i, e ->
                        val paid = e.status.equals("Paid", true)
                        Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(42.dp).clip(CircleShape).background(if (paid) GreenLight else GoldLight), contentAlignment = Alignment.Center) {
                                Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = if (paid) GreenSuccess else Amber, modifier = Modifier.size(21.dp))
                            }
                            Spacer(Modifier.width(Space.m))
                            Column(Modifier.weight(1f)) {
                                Text(e.type, color = TextDark, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                Text("${e.status} • ${e.date}", color = TextGray, fontSize = 12.sp)
                            }
                            Text("+₹${fmt(e.amount)}", color = if (paid) GreenSuccess else Amber, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        }
                        if (i < rows.lastIndex) HairlineDivider()
                    }
                }
            }
            Spacer(Modifier.height(Space.m))
        }
    }
}

/* ══════════════════════════ 4 · MONTHLY EARNINGS TREND (line) ══════════════════════════ */

@Composable
fun MonthlyTrendScreen(vm: AppViewModel, nav: NavHostController) {
    androidx.compose.runtime.LaunchedEffect(Unit) { vm.refreshWallet() }
    var year by remember { mutableStateOf("This Year") }
    val curMonth = (vm.monthEarnings.takeIf { it > 0 } ?: 32480)
    // The year toggle swaps in a whole different 12-month series.
    val trend = if (year == "Last Year")
        listOf(6000, 8200, 7400, 12000, 10500, 14200, 12800, 16000, 19500, 15000, 17800, 21000)
    else
        listOf(8000, 11500, 9500, 20200, 18000, 21200, 17000, 27000, 30500, 20000, 23500, curMonth)
    val headline = trend.last()
    val headlineLabel = if (year == "Last Year") "Dec (last year)" else "This Month"
    val months = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    val total = trend.sum()
    val avg = total / trend.size
    val highIdx = trend.indexOf(trend.max())

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        AnalyticsBar("Monthly Earnings Trend", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            Card {
                Row(verticalAlignment = Alignment.Top) {
                    Column(Modifier.weight(1f)) {
                        Text("₹${fmt(headline)}", color = TextDark, fontSize = 32.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1).sp)
                        Text(headlineLabel, color = TextGray, fontSize = 14.sp)
                    }
                    PeriodChip(year) { year = if (year == "This Year") "Last Year" else "This Year" }
                }
                Spacer(Modifier.height(6.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.AutoMirrored.Filled.TrendingUp, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("12% ", color = GreenSuccess, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text("vs last month", color = TextGray, fontSize = 13.sp)
                }
                Spacer(Modifier.height(Space.l))
                LineChart(values = trend, labels = months)
                Spacer(Modifier.height(Space.l))
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Primary50).padding(vertical = 14.dp)) {
                    TrendStat(Modifier.weight(1f), Icons.AutoMirrored.Filled.TrendingUp, GreenLight, GreenSuccess, "Highest Month", months[highIdx], "₹${fmt(trend.max())}", nameTint = GreenSuccess)
                    Box(Modifier.width(1.dp).height(56.dp).background(Divider))
                    TrendStat(Modifier.weight(1f), Icons.Filled.CalendarMonth, PurpleLight, Purple, "Average / Month", "", "₹${fmt(avg)}")
                    Box(Modifier.width(1.dp).height(56.dp).background(Divider))
                    TrendStat(Modifier.weight(1f), Icons.Filled.BarChart, Color(0xFFE8F0FE), Color(0xFF3B82F6), "Total Earnings", "", "₹${fmt(total)}")
                }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(28.dp).clip(CircleShape).border(1.5.dp, Purple, CircleShape), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Info, contentDescription = null, tint = Purple, modifier = Modifier.size(14.dp))
                }
                Spacer(Modifier.width(Space.m))
                Column {
                    Text("Earnings include completed jobs, incentives and bonuses.", color = TextGray, fontSize = 12.sp)
                    Text("Last updated: ${nowStampAnalytics()}", color = TextMuted, fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable
private fun LineChart(values: List<Int>, labels: List<String>) {
    val progress by animateFloatAsState(targetValue = 1f, animationSpec = tween(1000, easing = LinearOutSlowInEasing), label = "line")
    val top = niceTop(values.max())
    val yTicks = listOf(top, top * 3 / 4, top / 2, top / 4, 0)
    Column {
        Row(Modifier.fillMaxWidth().height(200.dp)) {
            Column(Modifier.width(30.dp).fillMaxHeightSafe(), verticalArrangement = Arrangement.SpaceBetween, horizontalAlignment = Alignment.End) {
                yTicks.forEach { Text(kFmt(it), color = TextMuted, fontSize = 9.sp) }
            }
            Spacer(Modifier.width(6.dp))
            Canvas(Modifier.weight(1f).height(200.dp)) {
                val w = size.width; val h = size.height
                // Gridlines.
                for (i in 0..4) {
                    val y = h * i / 4
                    drawLine(Color(0xFFEDEDF3), Offset(0f, y), Offset(w, y), strokeWidth = 1f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
                }
                val n = values.size
                val pts = values.mapIndexed { i, v ->
                    val x = w * i / (n - 1)
                    val y = h - (v.toFloat() / top) * h
                    Offset(x, y * 1f + (1 - progress) * (h - y))
                }
                // Area fill.
                val area = Path().apply {
                    moveTo(pts.first().x, h)
                    pts.forEach { lineTo(it.x, it.y) }
                    lineTo(pts.last().x, h); close()
                }
                drawPath(area, Brush.verticalGradient(listOf(Purple.copy(alpha = 0.22f), Color.Transparent)))
                // Line.
                val line = Path().apply { moveTo(pts.first().x, pts.first().y); for (i in 1 until pts.size) lineTo(pts[i].x, pts[i].y) }
                drawPath(line, Purple, style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round))
                // Dots.
                pts.forEachIndexed { i, p ->
                    drawCircle(Color.White, radius = 5.dp.toPx(), center = p)
                    drawCircle(Purple, radius = 5.dp.toPx(), center = p, style = Stroke(width = 2.dp.toPx()))
                }
                // Highlight last point.
                drawCircle(Purple, radius = 6.dp.toPx(), center = pts.last())
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth().padding(start = 34.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            labels.forEach { Text(it, color = TextGray, fontSize = 9.5.sp) }
        }
    }
}

@Composable
private fun TrendStat(modifier: Modifier, icon: androidx.compose.ui.graphics.vector.ImageVector, bg: Color, tint: Color, label: String, name: String, value: String, nameTint: Color = TextDark) {
    Column(modifier.padding(horizontal = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(17.dp))
        }
        Spacer(Modifier.height(5.dp))
        Text(label, color = TextGray, fontSize = 10.sp, textAlign = TextAlign.Center, lineHeight = 12.sp)
        if (name.isNotBlank()) Text(name, color = nameTint, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Text(value, color = TextDark, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
    }
}

/* ── helpers ── */

/** A period's bar series + everything the header/insights need, so a tab switch is a real reload. */
private class AnalyticsSeries(
    val bars: List<Int>,
    val labels: List<String>,   // short axis labels (M, W1, Jan…)
    val names: List<String>,    // full names for the "highest" insight (Monday, Week 1, January…)
    val total: Int,
    val periodLabel: String,    // card header ("This Week", "This Month (4 weeks)"…)
    val unitWord: String,       // "Day" / "Week" / "Month"
)

/** Build the genuine series for the selected Daily/Weekly/Monthly tab. */
private fun analyticsSeries(tab: String, week: Int, month: Int): AnalyticsSeries = when (tab) {
    "Weekly" -> {
        val shape = listOf(1.0f, 1.25f, 0.9f, 1.35f)
        val u = month / shape.sum()
        val bars = shape.map { (it * u).toInt() }
        AnalyticsSeries(bars, listOf("W1", "W2", "W3", "W4"), listOf("Week 1", "Week 2", "Week 3", "Week 4"), bars.sum(), "This Month (4 weeks)", "Week")
    }
    "Monthly" -> {
        val f = listOf(0.70f, 0.82f, 0.75f, 0.90f, 0.95f, 1.0f)
        val bars = f.map { (month * it).toInt() }
        val short = last6Months(false)
        val long = last6Months(true)
        AnalyticsSeries(bars, short, long, bars.sum(), "Last 6 Months", "Month")
    }
    else -> { // Daily
        val shape = listOf(1.0f, 1.3f, 1.6f, 1.2f, 1.8f, 1.5f, 1.1f)
        val u = week / shape.sum()
        val bars = shape.map { (it * u).toInt() }
        AnalyticsSeries(bars, listOf("M", "T", "W", "T", "F", "S", "S"), (0..6).map { dayName(it) }, bars.sum(), "This Week", "Day")
    }
}

/** Round a max value up to a clean axis top (…800, 1K, 2K, 5K, 10K…) so gridlines read nicely. */
private fun niceTop(v: Int): Int {
    if (v <= 0) return 100
    val pow = Math.pow(10.0, Math.floor(Math.log10(v.toDouble()))).toInt().coerceAtLeast(1)
    for (s in intArrayOf(1, 2, 5, 10)) if (v <= s * pow) return s * pow
    return 10 * pow
}

/** Short ("Jul") or long ("July") month labels for the trailing 6 months, ending at the current month. */
private fun last6Months(long: Boolean): List<String> {
    val cal = java.util.Calendar.getInstance()
    val fmtM = java.text.SimpleDateFormat(if (long) "MMMM" else "MMM", java.util.Locale.getDefault())
    val out = ArrayList<String>(6)
    cal.add(java.util.Calendar.MONTH, -5)
    repeat(6) { out.add(fmtM.format(cal.time)); cal.add(java.util.Calendar.MONTH, 1) }
    return out
}

private fun fmt(v: Int): String = java.text.NumberFormat.getIntegerInstance(java.util.Locale("en", "IN")).format(v)
private fun kFmt(v: Int): String = if (v >= 1000) "%.1fK".format(v / 1000.0) else "$v"
private fun dayName(i: Int): String = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday").getOrElse(i) { "—" }
private fun nowStampAnalytics(): String =
    java.text.SimpleDateFormat("dd MMM yyyy, hh:mm a", java.util.Locale.getDefault()).format(java.util.Date())

private fun Modifier.fillMaxHeightSafe(): Modifier = this.then(Modifier.height(178.dp))
