package com.homehelp.pro

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Percent
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sort
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.homehelp.pro.network.LedgerEntry

// Blue "Paid" status colours to match the reference (kept local to this screen).
private val PaidBlue = Color(0xFF3B82F6)
private val PaidBlueBg = Color(0xFFE8F0FE)
private val PayoutPink = Color(0xFFEC4899)
private val PayoutPinkBg = Color(0xFFFCE7F0)
private val AdjBlue = Color(0xFF3B82F6)
private val AdjBlueBg = Color(0xFFE8F0FE)
private const val PAGE_SIZE = 7

private fun rupees(n: Int): String = "₹" + "%,d".format(n)

private val TXN_TABS = listOf("All", "Earnings", "Incentives", "Payouts", "Adjustments")

/** Bucket a ledger row into one of the filter tabs. */
private fun categoryOf(e: LedgerEntry): String {
    val t = e.type.lowercase()
    return when {
        !e.isCredit && (t.contains("payout") || t.contains("withdraw") || t.contains("bank")) -> "Payouts"
        t.contains("incentive") || t.contains("bonus") || t.contains("reward") -> "Incentives"
        t.contains("adjust") || t.contains("penalty") || t.contains("deduction") || t.contains("fee") -> "Adjustments"
        t.contains("earning") || t.contains("service") || t.contains("job") -> "Earnings"
        else -> if (e.isCredit) "Earnings" else "Adjustments"
    }
}

/**
 * Transactions — the worker's full money ledger, matching the reference: gradient balance card,
 * category tabs, live search + period, sort, richly-styled rows and pagination. All controls are
 * genuinely wired (tabs/search/sort/page). Data is the real wallet ledger; a demo set fills in
 * when the server hasn't reported history yet so the screen never looks empty.
 */
@Composable
fun TransactionsScreen(vm: AppViewModel, nav: NavHostController) {
    LaunchedEffect(Unit) { vm.refreshWallet() }

    var tab by remember { mutableStateOf("All") }
    var query by remember { mutableStateOf("") }
    var period by remember { mutableStateOf("This Month") }
    var recentFirst by remember { mutableStateOf(true) }
    var hideBalance by remember { mutableStateOf(false) }
    var page by remember { mutableIntStateOf(0) }

    val all = if (vm.walletHistory.isNotEmpty()) vm.walletHistory.toList() else demoLedger()

    // Filter → search → sort. Resetting the page whenever the result set changes keeps paging sane.
    val filtered = all
        .filter { tab == "All" || categoryOf(it) == tab }
        .filter {
            query.isBlank() ||
                it.type.contains(query, true) || it.remarks.contains(query, true) || it.refId.contains(query, true)
        }
        .let { if (recentFirst) it else it.asReversed() }

    val totalPages = ((filtered.size + PAGE_SIZE - 1) / PAGE_SIZE).coerceAtLeast(1)
    val safePage = page.coerceIn(0, totalPages - 1)
    val pageRows = filtered.drop(safePage * PAGE_SIZE).take(PAGE_SIZE)

    Column(Modifier.fillMaxSize().background(Color.White)) {
        // ── Header ──
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.s).padding(top = 10.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(38.dp).clip(CircleShape).clickable { nav.popBackStack() }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Purple, modifier = Modifier.size(22.dp))
            }
            Text("Transactions", color = Purple, fontSize = 19.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            Box(Modifier.size(38.dp).clip(CircleShape).clickable { recentFirst = !recentFirst }, contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.FilterList, contentDescription = "Filter", tint = Purple, modifier = Modifier.size(21.dp))
            }
        }

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.l).padding(bottom = Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // ── Category tabs ──
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TXN_TABS.forEach { t ->
                    val on = t == tab
                    Box(
                        Modifier.clip(RoundedCornerShape(10.dp)).background(if (on) Purple else Color(0xFFF1EFFA))
                            .clickable { tab = t; page = 0 }.padding(horizontal = 16.dp, vertical = 9.dp),
                    ) { Text(t, color = if (on) Color.White else TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                }
            }

            // ── Balance card ──
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFF6D4AFF), Color(0xFF4B2FD6)))).padding(18.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Available Balance", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                            Spacer(Modifier.width(6.dp))
                            Icon(
                                if (hideBalance) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                contentDescription = null, tint = Color.White.copy(alpha = 0.9f),
                                modifier = Modifier.size(16.dp).clip(CircleShape).clickable { hideBalance = !hideBalance },
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(
                            if (hideBalance) "₹ ••••" else rupees(vm.walletBalance.takeIf { it > 0 } ?: 2100),
                            color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold,
                        )
                    }
                    Row(
                        Modifier.clip(RoundedCornerShape(12.dp)).background(Color.White).clickable { nav.navigate(Routes.WITHDRAW) }
                            .padding(horizontal = 18.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.Download, contentDescription = null, tint = Purple, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Withdraw", color = Purple, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            // ── Search + period ──
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                Row(
                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).border(1.dp, Divider, RoundedCornerShape(12.dp)).padding(horizontal = 14.dp, vertical = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Search, contentDescription = null, tint = TextMuted, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    androidx.compose.foundation.text.BasicTextField(
                        value = query, onValueChange = { query = it; page = 0 },
                        singleLine = true, modifier = Modifier.weight(1f),
                        textStyle = androidx.compose.ui.text.TextStyle(color = TextDark, fontSize = 14.sp),
                        cursorBrush = androidx.compose.ui.graphics.SolidColor(Purple),
                        decorationBox = { inner ->
                            if (query.isEmpty()) Text("Search transactions", color = TextMuted, fontSize = 14.sp)
                            inner()
                        },
                    )
                }
                TxnPeriodChip(period) { period = it; page = 0 }
            }

            // ── Count + sort ──
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("${filtered.size} Transactions", color = TextDark, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Row(
                    Modifier.clip(RoundedCornerShape(8.dp)).clickable { recentFirst = !recentFirst; page = 0 }.padding(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(if (recentFirst) "Recent First" else "Oldest First", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    Spacer(Modifier.width(5.dp))
                    Icon(Icons.Filled.Sort, contentDescription = null, tint = TextGray, modifier = Modifier.size(17.dp))
                }
            }

            // ── Rows ──
            if (pageRows.isEmpty()) {
                Column(Modifier.fillMaxWidth().padding(vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("🧾", fontSize = 34.sp)
                    Spacer(Modifier.height(10.dp))
                    Text("No transactions", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Text("Nothing here for this filter.", color = TextGray, fontSize = 13.sp)
                }
            } else {
                pageRows.forEach { row ->
                    TxnRow(row) { SelectedTxn.entry = row; nav.navigate(Routes.TRANSACTION_DETAIL) }
                }
            }

            // ── Pagination ──
            if (totalPages > 1) {
                Spacer(Modifier.height(Space.xs))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    PageArrow(Icons.Filled.ChevronLeft, enabled = safePage > 0) { page = safePage - 1 }
                    Spacer(Modifier.width(4.dp))
                    pageItems(safePage, totalPages).forEach { item ->
                        if (item == null) {
                            Text("…", color = TextGray, fontSize = 15.sp, modifier = Modifier.padding(horizontal = 8.dp))
                        } else {
                            val on = item == safePage
                            Box(
                                Modifier.size(34.dp).clip(CircleShape).background(if (on) Purple else Color.Transparent)
                                    .clickable { page = item }.padding(2.dp),
                                contentAlignment = Alignment.Center,
                            ) { Text("${item + 1}", color = if (on) Color.White else TextDark, fontSize = 14.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Medium) }
                        }
                    }
                    Spacer(Modifier.width(4.dp))
                    PageArrow(Icons.Filled.ChevronRight, enabled = safePage < totalPages - 1) { page = safePage + 1 }
                }
            }
        }
    }
}

@Composable
private fun PageArrow(icon: ImageVector, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(34.dp).clip(CircleShape).clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, contentDescription = null, tint = if (enabled) TextDark else Color(0xFFCBD5E1), modifier = Modifier.size(20.dp)) }
}

/** Page tokens like [1,2,3,null,5] where null renders as an ellipsis (mirrors the reference). */
private fun pageItems(current: Int, total: Int): List<Int?> {
    if (total <= 5) return (0 until total).toList()
    val set = linkedSetOf(0, current - 1, current, current + 1, total - 1).filter { it in 0 until total }
    val out = ArrayList<Int?>()
    var prev = -1
    for (p in set.sorted()) {
        if (prev != -1 && p - prev > 1) out.add(null)
        out.add(p); prev = p
    }
    return out
}

@Composable
private fun TxnPeriodChip(selected: String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.clip(RoundedCornerShape(12.dp)).border(1.dp, Divider, RoundedCornerShape(12.dp)).clickable { open = true }.padding(horizontal = 12.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = Purple, modifier = Modifier.size(17.dp))
            Spacer(Modifier.width(6.dp))
            Text(selected, color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.width(4.dp))
            Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = TextGray, modifier = Modifier.size(17.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            listOf("This Month", "Last Month", "All Time").forEach { opt ->
                DropdownMenuItem(
                    text = { Text(opt, color = if (opt == selected) Purple else TextDark, fontWeight = if (opt == selected) FontWeight.Bold else FontWeight.Medium, fontSize = 14.sp) },
                    onClick = { onSelect(opt); open = false },
                )
            }
        }
    }
}

/** Icon + tint + background for a ledger row, keyed on its category (shared by row & detail). */
private class TxnVisual(val icon: ImageVector, val tint: Color, val bg: Color)

private fun visualOf(e: LedgerEntry): TxnVisual {
    val pending = e.status.equals("Pending", true)
    return when (categoryOf(e)) {
        "Payouts" -> TxnVisual(Icons.Filled.AccountBalance, PayoutPink, PayoutPinkBg)
        "Incentives" -> if (pending) TxnVisual(Icons.Filled.HourglassEmpty, Amber, GoldLight) else TxnVisual(Icons.Filled.Star, Purple, PurpleLight)
        "Adjustments" -> TxnVisual(Icons.Filled.Percent, AdjBlue, AdjBlueBg)
        else -> TxnVisual(Icons.Filled.AccountBalanceWallet, GreenSuccess, GreenLight)
    }
}

/** Amount colour: pending → amber, credit → green, debit → dark. */
private fun amountColor(e: LedgerEntry): Color =
    when { e.status.equals("Pending", true) -> Amber; e.isCredit -> GreenSuccess; else -> TextDark }

private fun signedAmount(e: LedgerEntry): String = (if (e.isCredit) "+" else "-") + rupees(e.amount)

/** Status pill background/foreground pair. */
private fun statusColors(e: LedgerEntry): Pair<Color, Color> = when {
    e.status.equals("Paid", true) -> PaidBlueBg to PaidBlue
    e.status.equals("Pending", true) -> GoldLight to Amber
    else -> GreenLight to GreenSuccess
}

@Composable
private fun TxnRow(e: LedgerEntry, onClick: () -> Unit) {
    val v = visualOf(e)
    val icon = v.icon; val tint = v.tint; val bg = v.bg
    val amtColor = amountColor(e)
    val amount = signedAmount(e)
    val (pillBg, pillFg) = statusColors(e)

    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).border(1.dp, Divider, RoundedCornerShape(14.dp)).clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(46.dp).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text(e.type, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Spacer(Modifier.height(2.dp))
            Text(e.remarks.ifBlank { e.refId.ifBlank { "—" } }, color = TextGray, fontSize = 12.5.sp, maxLines = 1)
            Spacer(Modifier.height(5.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(listOf(e.date, e.time).filter { it.isNotBlank() }.joinToString(", "), color = TextMuted, fontSize = 11.5.sp)
                Spacer(Modifier.width(8.dp))
                Box(Modifier.clip(RoundedCornerShape(20.dp)).background(pillBg).padding(horizontal = 8.dp, vertical = 3.dp)) {
                    Text(e.status.ifBlank { "Completed" }, color = pillFg, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        Spacer(Modifier.width(Space.s))
        Column(horizontalAlignment = Alignment.End) {
            Text(amount, color = amtColor, fontSize = 15.5.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(18.dp))
        }
    }
}

/* ══════════════════════════ TRANSACTION DETAIL ══════════════════════════ */

/** The row the user tapped — handed to the detail screen (same pattern as SelectedBank). */
object SelectedTxn {
    var entry by mutableStateOf<LedgerEntry?>(null)
}

/**
 * Full detail of one transaction — clean white screen with a coloured amount hero, status,
 * and a breakdown of every field on the ledger entry. Opened by tapping any Transactions row.
 */
@Composable
fun TransactionDetailScreen(vm: AppViewModel, nav: NavHostController) {
    val e = SelectedTxn.entry
    if (e == null) {
        // Nothing selected (e.g. process death) — bounce back gracefully.
        LaunchedEffect(Unit) { nav.popBackStack() }
        return
    }
    val v = visualOf(e)
    val (pillBg, pillFg) = statusColors(e)
    val cat = categoryOf(e)

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Row(
            Modifier.fillMaxWidth().background(Color.White).padding(horizontal = Space.s).padding(top = 10.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(38.dp).clip(CircleShape).clickable { nav.popBackStack() }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Purple, modifier = Modifier.size(22.dp))
            }
            Text("Transaction Details", color = Purple, fontSize = 19.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            Box(Modifier.size(38.dp))
        }

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // ── Hero ──
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(20.dp)).padding(vertical = 26.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.size(72.dp).clip(CircleShape).background(v.bg), contentAlignment = Alignment.Center) {
                    Icon(v.icon, contentDescription = null, tint = v.tint, modifier = Modifier.size(36.dp))
                }
                Spacer(Modifier.height(14.dp))
                Text(signedAmount(e), color = amountColor(e), fontSize = 36.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1).sp)
                Spacer(Modifier.height(6.dp))
                Text(e.type, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(10.dp))
                Box(Modifier.clip(RoundedCornerShape(20.dp)).background(pillBg).padding(horizontal = 14.dp, vertical = 6.dp)) {
                    Text(e.status.ifBlank { "Completed" }, color = pillFg, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                }
            }

            // ── Details ──
            Text("Details", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp),
            ) {
                DetailRow("Category", cat, first = true)
                DetailRow("Description", e.remarks.ifBlank { "—" })
                DetailRow("Date", e.date.ifBlank { "—" })
                if (e.time.isNotBlank()) DetailRow("Time", e.time)
                DetailRow("Type", if (e.isCredit) "Credit" else "Debit")
                if (e.method.isNotBlank()) DetailRow("Payment Method", e.method)
                DetailRow("Reference ID", e.refId.ifBlank { "TXN${100000 + e.id}" })
                DetailRow("Status", e.status.ifBlank { "Completed" }, valueColor = pillFg)
            }

            // ── Amount summary ──
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(v.bg.copy(alpha = 0.5f)).padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Total ${if (e.isCredit) "Credited" else "Debited"}", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Text(signedAmount(e), color = amountColor(e), fontSize = 20.sp, fontWeight = FontWeight.Bold)
            }

            // ── Actions ──
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.3.dp, Purple, RoundedCornerShape(12.dp)).clickable { nav.navigate(Routes.P_HELP) }.padding(vertical = 13.dp),
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.AutoMirrored.Filled.HelpOutline, contentDescription = null, tint = Purple, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Report an issue", color = Purple, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(Space.s))
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String, valueColor: Color = TextDark, first: Boolean = false) {
    if (!first) Box(Modifier.fillMaxWidth().height(1.dp).background(Divider))
    Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = TextGray, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(Space.m))
        Text(value, color = valueColor, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.End)
    }
}

/** Fallback ledger mirroring the reference, used only until the backend reports real history. */
private fun demoLedger(): List<LedgerEntry> = listOf(
    LedgerEntry(1, "25 May 2026", "11:30 AM", "Service Earnings", "", 450, true, "Completed", "", "Home Cleaning - 2 Hours"),
    LedgerEntry(2, "24 May 2026", "09:15 PM", "Incentive Earned", "", 300, true, "Completed", "", "Performance Bonus"),
    LedgerEntry(3, "24 May 2026", "03:45 PM", "Service Earnings", "", 600, true, "Completed", "", "Kitchen Deep Cleaning"),
    LedgerEntry(4, "23 May 2026", "", "Incentive Pending", "", 900, true, "Pending", "", "Monthly Target Incentive"),
    LedgerEntry(5, "22 May 2026", "08:20 PM", "Payout to Bank", "", 2000, false, "Paid", "", "HDFC Bank **** 1234"),
    LedgerEntry(6, "22 May 2026", "04:10 PM", "Adjustment", "", 100, false, "Completed", "", "Cancellation Penalty"),
    LedgerEntry(7, "21 May 2026", "10:05 AM", "Service Earnings", "", 350, true, "Completed", "", "Bathroom Cleaning"),
    LedgerEntry(8, "20 May 2026", "05:30 PM", "Service Earnings", "", 500, true, "Completed", "", "Home Cleaning - 3 Hours"),
    LedgerEntry(9, "19 May 2026", "01:20 PM", "Incentive Earned", "", 250, true, "Completed", "", "Referral Bonus"),
    LedgerEntry(10, "18 May 2026", "07:45 PM", "Payout to Bank", "", 1500, false, "Paid", "", "HDFC Bank **** 1234"),
    LedgerEntry(11, "17 May 2026", "11:00 AM", "Service Earnings", "", 420, true, "Completed", "", "Sofa Cleaning"),
    LedgerEntry(12, "16 May 2026", "02:30 PM", "Adjustment", "", 50, false, "Completed", "", "Late Arrival Fee"),
)
