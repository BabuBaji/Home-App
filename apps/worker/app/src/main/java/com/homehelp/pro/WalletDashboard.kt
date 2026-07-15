package com.homehelp.pro

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.homehelp.pro.network.ServiceEarning

// ─────────────────────────────────────────────────────────────────────────────────────────────
// WALLET (3_wallet.png) — balance hero · earnings overview · breakdown + trend · service split ·
// settlement · leaderboard · quick actions.
//
// Every figure is derived from the real ledger (worker_income / withdrawals / deductions). Where
// the backend genuinely has nothing — no bank on file, too few earning peers to rank against —
// the card says so instead of showing a plausible number.
// ─────────────────────────────────────────────────────────────────────────────────────────────

private fun money(v: Int): String =
    "₹" + java.text.NumberFormat.getIntegerInstance(java.util.Locale("en", "IN")).format(v)

@Composable
fun WalletDashboardScreen(vm: AppViewModel, nav: NavHostController) {
    var hidden by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { vm.refreshWallet(); vm.loadWalletAnalytics() }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        // Title row — Wallet · help · Transaction History, per the design.
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.l).padding(top = Space.l, bottom = Space.s),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Wallet", color = TextDark, fontSize = 28.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Row(
                Modifier.clip(RoundedCornerShape(Radius.pill)).clickable { nav.navigate(Routes.WALLET_HISTORY) }
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Schedule, contentDescription = null, tint = Purple, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(5.dp))
                Text("Transaction History", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        }

        // Fit-to-screen, as the mock draws it: the whole wallet in one frame, no scrolling.
        FitToScreen(Modifier.weight(1f).fillMaxWidth()) {
        Column(
            Modifier.padding(horizontal = Space.l).padding(bottom = Space.s),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            BalanceHero(vm, hidden, onToggle = { hidden = !hidden }) { nav.navigate(Routes.WITHDRAW) }
            EarningsOverviewStrip(vm)
            EarningsBreakdownCard(vm) { nav.navigate(Routes.EARNINGS_BREAKUP) }
            EarningsTrendCard(vm) { nav.navigate(Routes.EARNINGS) }
            ServiceWiseCard(vm)
            SettlementCard(vm) { nav.navigate(Routes.P_BANK) }
            LeaderboardBanner(vm) { nav.navigateApp(Routes.REWARDS) }
            WalletQuickActions(nav)
        }
        }
    }
}

/** The violet hero: balance + withdraw on the left, settlement facts on the right. */
@Composable
private fun BalanceHero(vm: AppViewModel, hidden: Boolean, onToggle: () -> Unit, onWithdraw: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(EarningsGradient).padding(11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Available Balance", color = Color.White.copy(alpha = 0.9f), fontSize = 12.sp)
                Spacer(Modifier.width(6.dp))
                Icon(
                    if (hidden) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                    contentDescription = if (hidden) "Show balance" else "Hide balance",
                    tint = Color.White.copy(alpha = 0.9f),
                    modifier = Modifier.size(16.dp).clickable(onClick = onToggle),
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                if (hidden) "₹ ••••" else money(vm.walletBalance),
                color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp,
            )
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.clip(RoundedCornerShape(Radius.pill)).background(Color.White)
                    .clickable(onClick = onWithdraw).padding(horizontal = 12.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.ArrowUpward, contentDescription = null, tint = Purple, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(5.dp))
                Text("Withdraw Money", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(3.dp))
                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Purple, modifier = Modifier.size(15.dp))
            }
        }
        Spacer(Modifier.width(10.dp))
        Box(Modifier.width(1.dp).height(84.dp).background(Color.White.copy(alpha = 0.25f)))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1.05f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            HeroFact(Icons.Filled.Schedule, "Pending Settlement", money(vm.pendingAmount))
            HeroFact(Icons.Filled.Autorenew, "Processing Withdrawal", money(vm.holdBalance))
            HeroFact(Icons.Filled.CalendarMonth, "Next Settlement", vm.settlement?.dailyTime?.let { "Tomorrow, $it" } ?: "—")
        }
    }
}

@Composable
private fun HeroFact(icon: ImageVector, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, color = Color.White.copy(alpha = 0.85f), fontSize = 10.sp, modifier = Modifier.weight(1f), maxLines = 1)
        Spacer(Modifier.width(4.dp))
        Text(value, color = Color.White, fontSize = 11.5.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

/** Five period tiles, each with a real change vs the same-length previous window. */
@Composable
private fun EarningsOverviewStrip(vm: AppViewModel) {
    Card(padding = Dp16.S) {
        Text("EARNINGS OVERVIEW", color = Purple, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp)
        Spacer(Modifier.height(Space.s))
        // Five tiles across, as the mock has them — a horizontal scroll hid two of them.
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            PeriodStat(Modifier.weight(1f), Icons.Filled.CalendarMonth, "Today", vm.todayEarnings, vm.changePct(vm.todayEarnings, vm.yesterdayEarnings), "vs yest.", Purple, Primary50)
            PeriodStat(Modifier.weight(1f), Icons.Filled.CalendarMonth, "This Week", vm.weekEarnings, vm.changePct(vm.weekEarnings, vm.lastWeekEarnings), "vs last wk", Amber, GoldLight)
            PeriodStat(Modifier.weight(1f), Icons.Filled.TrendingUp, "This Month", vm.monthEarnings, vm.changePct(vm.monthEarnings, vm.lastMonthEarnings), "vs last mo", GreenSuccess, GreenLight)
            PeriodStat(Modifier.weight(1f), Icons.Filled.CalendarMonth, "Last Month", vm.lastMonthEarnings, null, "", Color(0xFF3B82F6), Color(0xFFE7F0FE))
            PeriodStat(Modifier.weight(1f), Icons.Filled.EmojiEvents, "Total", vm.totalEarned, null, "", Violet, PurpleLight)
        }
    }
}

@Composable
private fun PeriodStat(
    modifier: Modifier,
    icon: ImageVector,
    label: String,
    amount: Int,
    changePct: Int?,
    changeLabel: String,
    accent: Color,
    accentBg: Color,
) {
    Column(
        modifier.clip(RoundedCornerShape(10.dp))
            .border(1.dp, Divider, RoundedCornerShape(10.dp)).padding(6.dp),
    ) {
        Box(
            Modifier.size(22.dp).clip(RoundedCornerShape(7.dp)).background(accentBg),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(13.dp)) }
        Spacer(Modifier.height(4.dp))
        Text(label, color = TextGray, fontSize = 8.5.sp, maxLines = 1)
        Spacer(Modifier.height(1.dp))
        Text(money(amount), color = TextDark, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        if (changePct != null) {
            Spacer(Modifier.height(2.dp))
            val up = changePct >= 0
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (up) Icons.Filled.TrendingUp else Icons.Filled.TrendingDown,
                    contentDescription = null,
                    tint = if (up) GreenSuccess else RedCancel,
                    modifier = Modifier.size(10.dp),
                )
                Spacer(Modifier.width(2.dp))
                Text(
                    "${if (up) "+" else ""}$changePct%",
                    color = if (up) GreenSuccess else RedCancel, fontSize = 8.5.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                )
            }
            Text(changeLabel, color = TextMuted, fontSize = 7.5.sp, maxLines = 1)
        }
    }
}

/** Credits, then deductions, then the net — the design never hides what was taken off. */
@Composable
private fun EarningsBreakdownCard(vm: AppViewModel, onViewAll: () -> Unit) {
    Card(padding = Dp16.S) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("EARNINGS BREAKDOWN", color = Purple, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp, modifier = Modifier.weight(1f))
            Text("View All", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable(onClick = onViewAll))
        }
        Spacer(Modifier.height(Space.s))
        val credits = vm.earningsBreakup.filter { it.amount > 0 }
        if (credits.isEmpty()) {
            Text("No earnings recorded yet.", color = TextMuted, fontSize = 12.sp)
        }
        credits.take(4).forEach { BreakdownLine(it.category, it.amount, false) }
        val deduction = vm.deductionTotal
        if (deduction > 0) {
            Spacer(Modifier.height(6.dp))
            Box(Modifier.fillMaxWidth().height(1.dp).background(Divider))
            Spacer(Modifier.height(6.dp))
            BreakdownLine("Deductions", deduction, true)
        }
        Spacer(Modifier.height(6.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(Divider))
        Spacer(Modifier.height(7.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Net Earnings", color = Purple, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(money((credits.sumOf { it.amount } - deduction).coerceAtLeast(0)), color = Purple, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun BreakdownLine(label: String, amount: Int, negative: Boolean) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(6.dp).clip(RoundedCornerShape(Radius.pill)).background(if (negative) RedCancel else Purple))
        Spacer(Modifier.width(8.dp))
        Text(label, color = TextDark, fontSize = 12.5.sp, modifier = Modifier.weight(1f), maxLines = 1)
        Text(
            (if (negative) "- " else "") + money(amount),
            color = if (negative) RedCancel else TextDark,
            fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
        )
    }
}

/** Daily earnings for the last 30 days, straight from the ledger. */
@Composable
private fun EarningsTrendCard(vm: AppViewModel, onDetails: () -> Unit) {
    Card(padding = Dp16.S) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("EARNINGS TREND", color = Purple, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp)
            Spacer(Modifier.width(5.dp))
            Text("(Last 30 days)", color = TextMuted, fontSize = 10.sp, modifier = Modifier.weight(1f))
            Text("View Details", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable(onClick = onDetails))
        }
        Spacer(Modifier.height(Space.s))
        val pts = vm.earningsTrend
        if (pts.size < 2) {
            Text("Not enough history to chart yet.", color = TextMuted, fontSize = 12.sp)
            return@Card
        }
        val max = pts.maxOf { it.amount }.coerceAtLeast(1)
        Row {
            Column(Modifier.height(74.dp), verticalArrangement = Arrangement.SpaceBetween, horizontalAlignment = Alignment.End) {
                Text(shortMoney(max), color = TextMuted, fontSize = 9.sp)
                Text(shortMoney(max / 2), color = TextMuted, fontSize = 9.sp)
                Text("0", color = TextMuted, fontSize = 9.sp)
            }
            Spacer(Modifier.width(6.dp))
            Canvas(Modifier.weight(1f).height(74.dp)) {
                val stepX = if (pts.size > 1) size.width / (pts.size - 1) else size.width
                // grid
                for (i in 0..2) {
                    val y = size.height * i / 2f
                    drawLine(Divider, Offset(0f, y), Offset(size.width, y), strokeWidth = 1f)
                }
                val offs = pts.mapIndexed { i, p ->
                    Offset(i * stepX, size.height - (p.amount.toFloat() / max) * size.height * 0.92f)
                }
                val line = Path().apply {
                    moveTo(offs[0].x, offs[0].y)
                    for (i in 1 until offs.size) {
                        val p0 = offs[i - 1]; val p1 = offs[i]; val midX = (p0.x + p1.x) / 2f
                        cubicTo(midX, p0.y, midX, p1.y, p1.x, p1.y)
                    }
                }
                val area = Path().apply {
                    addPath(line); lineTo(offs.last().x, size.height); lineTo(offs.first().x, size.height); close()
                }
                drawPath(area, Brush.verticalGradient(listOf(Purple.copy(alpha = 0.22f), Color.Transparent)))
                drawPath(line, color = Purple, style = Stroke(width = 2.4.dp.toPx(), cap = StrokeCap.Round))
                drawCircle(Color.White, radius = 4f.dp.toPx(), center = offs.last())
                drawCircle(Purple, radius = 2.6f.dp.toPx(), center = offs.last())
            }
        }
        Spacer(Modifier.height(5.dp))
        Row(Modifier.fillMaxWidth().padding(start = 30.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            listOf(pts.first(), pts[pts.size / 2], pts.last()).forEach {
                Text(dayLabel(it.date), color = TextMuted, fontSize = 9.sp)
            }
        }
    }
}

private fun shortMoney(v: Int): String = if (v >= 1000) "${v / 1000}K" else "$v"
private fun dayLabel(iso: String): String = runCatching {
    val d = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).parse(iso)!!
    java.text.SimpleDateFormat("dd MMM", java.util.Locale.US).format(d)
}.getOrDefault(iso)

/** Donut of earnings per service, resolved from the ledger's booking refs. */
@Composable
private fun ServiceWiseCard(vm: AppViewModel) {
    val sw = vm.serviceWise
    Card(padding = Dp16.S) {
        Text("SERVICE WISE EARNINGS", color = Purple, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp)
        Spacer(Modifier.height(Space.s))
        val services = sw?.services.orEmpty()
        if (services.isEmpty()) {
            Text("No job earnings yet.", color = TextMuted, fontSize = 12.sp)
            return@Card
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(86.dp), contentAlignment = Alignment.Center) {
                DonutChart(services, sw?.total ?: 0)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(money(sw?.total ?: 0), color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text("Total", color = TextMuted, fontSize = 9.sp)
                }
            }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                services.take(4).forEachIndexed { i, s ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(8.dp).clip(RoundedCornerShape(Radius.pill)).background(donutColor(i)))
                        Spacer(Modifier.width(6.dp))
                        Text(s.service, color = TextDark, fontSize = 11.sp, modifier = Modifier.weight(1f), maxLines = 1)
                        Text("${s.pct}%", color = TextMuted, fontSize = 10.sp)
                        Spacer(Modifier.width(6.dp))
                        Text(money(s.amount), color = TextDark, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

private fun donutColor(i: Int): Color = listOf(
    Purple, Violet, Color(0xFF14B8A6), Amber, Color(0xFF3B82F6), Coral,
)[i % 6]

@Composable
private fun DonutChart(services: List<ServiceEarning>, total: Int) {
    Canvas(Modifier.size(86.dp)) {
        val stroke = 15.dp.toPx()
        val d = size.minDimension - stroke
        val topLeft = Offset((size.width - d) / 2f, (size.height - d) / 2f)
        val arc = Size(d, d)
        var start = -90f
        val sum = services.sumOf { it.amount }.coerceAtLeast(1)
        services.forEachIndexed { i, s ->
            val sweep = 360f * (s.amount.toFloat() / sum)
            drawArc(
                color = donutColor(i), startAngle = start + 1f, sweepAngle = (sweep - 2f).coerceAtLeast(0.5f),
                useCenter = false, topLeft = topLeft, size = arc, style = Stroke(stroke, cap = StrokeCap.Butt),
            )
            start += sweep
        }
    }
}

/** Payout rules + destination. Says "Not set" when there's genuinely no bank on file. */
@Composable
private fun SettlementCard(vm: AppViewModel, onPayoutSettings: () -> Unit) {
    val st = vm.settlement
    Card(padding = Dp16.S) {
        Text("SETTLEMENT INFO", color = Purple, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp)
        Spacer(Modifier.height(Space.s))
        SettlementRow("Daily Settlement Time", st?.dailyTime ?: "—")
        SettlementRow("Minimum Payout", st?.minPayout?.let { money(it) } ?: "—")
        SettlementRow("Settlement Mode", st?.mode ?: "—")
        Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Bank Account", color = TextGray, fontSize = 12.sp, modifier = Modifier.weight(1f))
            Text(
                st?.bankAccount?.takeIf { it.isNotBlank() } ?: (st?.bankStatus ?: "Not added"),
                color = TextDark, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold,
            )
            if (st?.bankVerified == true) {
                Spacer(Modifier.width(5.dp))
                Icon(Icons.Filled.CheckCircle, contentDescription = "Verified", tint = GreenSuccess, modifier = Modifier.size(14.dp))
            }
        }
        Spacer(Modifier.height(Space.s))
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.button)).background(EarningsGradient)
                .clickable(onClick = onPayoutSettings).padding(vertical = 11.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Settings, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text("Payout Settings", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun SettlementRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = TextGray, fontSize = 12.sp, modifier = Modifier.weight(1f))
        Text(value, color = TextDark, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * Only shown once there are enough earning peers this month for a percentile to mean something —
 * the backend returns null otherwise, rather than telling a lone worker they're "Top 20%".
 */
@Composable
private fun LeaderboardBanner(vm: AppViewModel, onView: () -> Unit) {
    val lb = vm.leaderboard ?: return
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Primary50)
            .clickable(onClick = onView).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("🏆", fontSize = 26.sp)
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text("Great Job! 🎉", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Text(
                "You are in the top ${lb.topPercent}% of ${lb.of} earning workers this month",
                color = TextGray, fontSize = 11.5.sp,
            )
        }
        Text("View", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun WalletQuickActions(nav: NavHostController) {
    Card(padding = Dp16.S) {
        Text("QUICK ACTIONS", color = Purple, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp)
        Spacer(Modifier.height(Space.s))
        Row(Modifier.fillMaxWidth()) {
            WalletAction(Modifier.weight(1f), Icons.Filled.ArrowUpward, "Withdraw") { nav.navigate(Routes.WITHDRAW) }
            WalletAction(Modifier.weight(1f), Icons.Filled.Receipt, "Earnings") { nav.navigate(Routes.EARNINGS_BREAKUP) }
            WalletAction(Modifier.weight(1f), Icons.Filled.CardGiftcard, "Incentives") { nav.navigateApp(Routes.REWARDS) }
            WalletAction(Modifier.weight(1f), Icons.Filled.Description, "Payslips") { nav.navigate(Routes.PAYSLIP) }
            WalletAction(Modifier.weight(1f), Icons.Filled.Schedule, "History") { nav.navigate(Routes.WALLET_HISTORY) }
        }
    }
}

@Composable
private fun WalletAction(modifier: Modifier, icon: ImageVector, label: String, onClick: () -> Unit) {
    Column(modifier.clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Primary50),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = label, tint = Purple, modifier = Modifier.size(21.dp)) }
        Spacer(Modifier.height(5.dp))
        Text(label, color = TextGray, fontSize = 10.5.sp, fontWeight = FontWeight.Medium, maxLines = 1)
    }
}
