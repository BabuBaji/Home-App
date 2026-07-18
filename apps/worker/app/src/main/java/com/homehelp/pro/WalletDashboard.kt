package com.homehelp.pro

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

// ─────────────────────────────────────────────────────────────────────────────────────────────
// WALLET DASHBOARD — the starting point of 3_wallet_Follow.png.
//
// Balance hero (Earnings this month + Pending Settlement, Withdraw + Transaction History) →
// Earnings Overview (month total, % vs last month, 7-day bar chart, period list) →
// Quick Actions (Withdraw · Payout Settings · Bank Accounts · Help & Support).
//
// Every figure is real (wallet ledger); the bar chart is the last 7 days of the earnings trend.
// ─────────────────────────────────────────────────────────────────────────────────────────────

private fun money(v: Int): String =
    "₹" + java.text.NumberFormat.getIntegerInstance(java.util.Locale("en", "IN")).format(v)

@Composable
fun WalletDashboardScreen(vm: AppViewModel, nav: NavHostController) {
    var hidden by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { vm.refreshWallet(); vm.loadWalletAnalytics() }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        // Title row — Wallet. (Transaction History lives in the hero beside Withdraw, so it's
        // not repeated up here.)
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.l).padding(top = Space.l, bottom = Space.s),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Wallet", color = TextDark, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        }

        FitToScreen(Modifier.weight(1f).fillMaxWidth()) {
            Column(
                Modifier.padding(horizontal = Space.l).padding(bottom = Space.s),
                verticalArrangement = Arrangement.spacedBy(Space.s),
            ) {
                    BalanceHero(
                    vm, hidden, onToggle = { hidden = !hidden },
                    onWithdraw = { nav.navigate(Routes.WITHDRAW) },
                    onHistory = { nav.navigate(Routes.WITHDRAW_HISTORY) },
                )
                EarningsOverviewCard(vm)
                QuickActions(nav)
            }
        }
    }
}

/** Violet hero: balance + eye · earnings-this-month + pending settlement · Withdraw + History. */
@Composable
private fun BalanceHero(vm: AppViewModel, hidden: Boolean, onToggle: () -> Unit, onWithdraw: () -> Unit, onHistory: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(EarningsGradient).padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Available Balance", color = Color.White.copy(alpha = 0.9f), fontSize = 13.5.sp)
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
            }
            Icon(Icons.Filled.AccountBalanceWallet, contentDescription = null, tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(26.dp))
        }
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth().height(androidx.compose.foundation.layout.IntrinsicSize.Min)) {
            HeroFigure(Modifier.weight(1f), "Earnings this month", money(vm.monthEarnings))
            Box(Modifier.padding(horizontal = 10.dp).width(1.dp).height(30.dp).background(Color.White.copy(alpha = 0.25f)))
            HeroFigure(Modifier.weight(1f), "Pending Settlement", money(vm.holdBalance))
        }
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
            // Withdraw — primary (white pill)
            Row(
                Modifier.weight(1f).clip(RoundedCornerShape(Radius.pill)).background(Color.White)
                    .clickable(onClick = onWithdraw).padding(vertical = 10.dp),
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.ArrowUpward, contentDescription = null, tint = Purple, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(5.dp))
                Text("Withdraw Money", color = Purple, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            }
            // Transaction History — secondary (translucent, outlined) beside Withdraw, per the design
            Row(
                Modifier.weight(1f).clip(RoundedCornerShape(Radius.pill))
                    .background(Color.White.copy(alpha = 0.16f))
                    .border(1.dp, Color.White.copy(alpha = 0.5f), RoundedCornerShape(Radius.pill))
                    .clickable(onClick = onHistory).padding(vertical = 10.dp),
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Schedule, contentDescription = null, tint = Color.White, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(5.dp))
                Text("Transaction History", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(2.dp))
                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
            }
        }
    }
}

@Composable
private fun HeroFigure(modifier: Modifier, label: String, value: String) {
    Column(modifier) {
        Text(label, color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp, maxLines = 1)
        Spacer(Modifier.height(2.dp))
        Text(value, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

/** Month total + change-vs-last-month + 7-day bar chart + the period list, as the reference draws it. */
@Composable
private fun EarningsOverviewCard(vm: AppViewModel) {
    Card(padding = Dp16.S) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Earnings Overview", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text("This Month", color = Purple, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(Space.s))
        Text(money(vm.monthEarnings), color = TextDark, fontSize = 26.sp, fontWeight = FontWeight.Bold)
        vm.changePct(vm.monthEarnings, vm.lastMonthEarnings)?.let { pct ->
            Spacer(Modifier.height(2.dp))
            val up = pct >= 0
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.TrendingUp, contentDescription = null, tint = if (up) GreenSuccess else RedCancel, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text(
                    "${if (up) "+" else ""}$pct% vs last month",
                    color = if (up) GreenSuccess else RedCancel, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                )
            }
        }
        Spacer(Modifier.height(Space.m))
        EarningsBars(vm)
        Spacer(Modifier.height(Space.m))
        // Period list — each with an icon, as the reference draws it.
        PeriodRow(Icons.Filled.CalendarMonth, "Today", vm.todayEarnings, Purple, Primary50)
        Divider()
        PeriodRow(Icons.Filled.CalendarMonth, "This Week", vm.weekEarnings, Amber, GoldLight)
        Divider()
        PeriodRow(Icons.Filled.BarChart, "This Month", vm.monthEarnings, GreenSuccess, GreenLight)
        Divider()
        PeriodRow(Icons.Filled.Savings, "Total Earnings", vm.totalEarned, Violet, PurpleLight)
    }
}

@Composable
private fun Divider() {
    Box(Modifier.fillMaxWidth().height(1.dp).padding(vertical = 0.dp).background(com.homehelp.pro.Divider))
}

/**
 * The reference's growth histogram: many thin light-purple bars over the recent period, no axis
 * labels — a compact "earnings are climbing" visual rather than a labelled day-by-day chart.
 */
@Composable
private fun EarningsBars(vm: AppViewModel) {
    val days = vm.earningsTrend.takeLast(14)
    val max = (days.maxOfOrNull { it.amount } ?: 0).coerceAtLeast(1)
    Row(
        Modifier.fillMaxWidth().height(64.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        if (days.isEmpty()) {
            Text("No earnings yet", color = TextMuted, fontSize = 13.5.sp)
            return@Row
        }
        days.forEach { d ->
            // Light lavender for quiet days, solid brand purple for the peak, as the reference shades them.
            val frac = (d.amount.toFloat() / max).coerceIn(0.06f, 1f)
            val peak = d.amount >= max * 0.85f
            Box(
                Modifier.weight(1f).height((64 * frac).dp)
                    .clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
                    .background(if (peak) Purple else Purple.copy(alpha = 0.30f)),
            )
        }
    }
}

@Composable
private fun PeriodRow(icon: ImageVector, label: String, amount: Int, tint: Color, tintBg: Color) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(tintBg),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp)) }
        Spacer(Modifier.width(Space.m))
        Text(label, color = TextDark, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Text(money(amount), color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
    }
}

/** Four actions, as the reference draws them: Withdraw · Payout Settings · Bank Accounts · Help. */
@Composable
private fun QuickActions(nav: NavHostController) {
    Card(padding = Dp16.S) {
        Text("Quick Actions", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(Space.m))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            QuickTile(Modifier.weight(1f), Icons.Filled.ArrowUpward, "Withdraw") { nav.navigate(Routes.WITHDRAW) }
            QuickTile(Modifier.weight(1f), Icons.Filled.Settings, "Payout\nSettings") { nav.navigate(Routes.PAYOUT_SETTINGS) }
            QuickTile(Modifier.weight(1f), Icons.Filled.AccountBalance, "Bank\nAccounts") { nav.navigate(Routes.BANK_ACCOUNTS) }
            QuickTile(Modifier.weight(1f), Icons.AutoMirrored.Filled.HelpOutline, "Help &\nSupport") { nav.navigate(Routes.WALLET_HELP) }
        }
    }
}

@Composable
private fun QuickTile(modifier: Modifier, icon: ImageVector, label: String, onClick: () -> Unit) {
    Column(modifier.clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(Primary50),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = label, tint = Purple, modifier = Modifier.size(23.dp)) }
        Spacer(Modifier.height(6.dp))
        Text(label, color = TextGray, fontSize = 12.sp, fontWeight = FontWeight.Medium, textAlign = androidx.compose.ui.text.style.TextAlign.Center, lineHeight = 12.sp)
    }
}
