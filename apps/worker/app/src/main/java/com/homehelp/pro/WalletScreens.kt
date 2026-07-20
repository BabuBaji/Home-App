package com.homehelp.pro

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.homehelp.pro.network.BreakupItem
import com.homehelp.pro.network.LedgerEntry
import java.io.File

// Money is whole rupees everywhere; one formatter keeps the ₹1,23,456 style consistent.
private fun rupee(n: Int): String = "₹" + "%,d".format(n)

// Shared soft-filled text-field styling used by every input in this file.
@Composable
private fun softFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedContainerColor = FieldFill,
    unfocusedContainerColor = FieldFill,
    focusedBorderColor = Purple,
    unfocusedBorderColor = Color.Transparent,
    focusedLabelColor = Purple,
    cursorColor = Purple,
)

/* ============================ WALLET DASHBOARD ============================ */
@Composable
fun WalletScreen(vm: AppViewModel, nav: NavHostController) {
    LaunchedEffect(Unit) { vm.refreshWallet() }
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        BellHeader("My Wallet") { nav.navigate(Routes.P_NOTIFICATIONS) }
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // Hero — Available balance + the single most important action.
            GradientBanner(radius = Radius.card.value.toInt(), padding = Space.xl.value.toInt()) {
                Text(tr("Available Balance"), color = Color.White.copy(alpha = 0.85f), fontSize = 13.sp)
                Spacer(Modifier.height(Space.xs))
                Text(rupee(vm.walletBalance), color = Color.White, fontSize = 36.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp)
                Spacer(Modifier.height(Space.xs))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Schedule, null, tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(Space.xs))
                    Text("Next payout: ${vm.nextPayout}", color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp)
                }
                Spacer(Modifier.height(Space.l))
                Surface(
                    Modifier.fillMaxWidth().height(50.dp).clickable { nav.navigate(Routes.WITHDRAW) },
                    shape = RoundedCornerShape(Radius.button), color = Color.White,
                ) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.ArrowUpward, null, tint = Purple, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(Space.s))
                        Text(tr("Withdraw Money"), color = Purple, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                }
            }

            // Three balance types as compact reference-style stat tiles.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                MiniStatCard(Modifier.weight(1f), Icons.Filled.Payments, rupee(vm.walletBalance), "Available", GreenSuccess, GreenLight)
                MiniStatCard(Modifier.weight(1f), Icons.Filled.Schedule, rupee(vm.pendingAmount), "Pending", Gold, GoldLight)
                MiniStatCard(Modifier.weight(1f), Icons.Filled.Lock, rupee(vm.holdBalance), "On Hold", RedCancel, RedLight)
            }

            // Period earnings + total withdrawn.
            Card {
                SectionTitle("Earnings Overview")
                Spacer(Modifier.height(Space.m))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    StatTile("Today", vm.todayEarnings)
                    StatTile("This Week", vm.weekEarnings)
                    StatTile("This Month", vm.monthEarnings)
                }
                Spacer(Modifier.height(Space.m)); HairlineDivider(); Spacer(Modifier.height(Space.m))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    StatTile("Total Withdrawn", vm.withdrawnTotal, GreenSuccess)
                    StatTile("Advance Due", vm.advanceOutstanding, if (vm.advanceOutstanding > 0) RedCancel else TextDark)
                    StatTile("Total Earned", vm.totalEarned)
                }
            }

            // Big, clearly-labelled action buttons.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                BigAction(Modifier.weight(1f), Icons.Filled.Savings, "Salary\nAdvance") { nav.navigate(Routes.SALARY_ADVANCE) }
                BigAction(Modifier.weight(1f), Icons.Filled.Description, "Payslip") { nav.navigate(Routes.PAYSLIP) }
                BigAction(Modifier.weight(1f), Icons.Filled.History, "History") { nav.navigate(Routes.WALLET_HISTORY) }
            }

            // Earnings breakup (preview).
            Card {
                RowHeader("Earnings Breakup", "View all") { nav.navigate(Routes.EARNINGS_BREAKUP) }
                Spacer(Modifier.height(Space.xs))
                val shown = vm.earningsBreakup.filter { it.amount > 0 }.take(5)
                if (shown.isEmpty()) EmptyHint("No earnings recorded yet.")
                shown.forEach { BreakupRow(it.category, it.amount, credit = true) }
            }

            // Deductions — never hidden, total shown in red.
            Card {
                RowHeader("Deductions", "View all") { nav.navigate(Routes.DEDUCTIONS) }
                Spacer(Modifier.height(Space.xs))
                val shown = vm.deductionSummary.filter { it.amount > 0 }.take(5)
                if (shown.isEmpty()) EmptyHint("No deductions. You keep 100% of your earnings.")
                shown.forEach { BreakupRow(it.category, it.amount, credit = false) }
                if (vm.deductionTotal > 0) {
                    HairlineDivider()
                    Row(Modifier.fillMaxWidth().padding(top = Space.s), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(tr("Total Deductions"), fontWeight = FontWeight.Bold, color = TextDark)
                        Text("- ${rupee(vm.deductionTotal)}", fontWeight = FontWeight.Bold, color = RedCancel)
                    }
                }
            }

            // Recent activity.
            Card {
                RowHeader("Recent Activity", "View all") { nav.navigate(Routes.WALLET_HISTORY) }
                Spacer(Modifier.height(Space.xs))
                val recent = vm.walletHistory.take(5)
                if (recent.isEmpty()) EmptyHint("No transactions yet.")
                recent.forEachIndexed { i, e ->
                    LedgerRow(e)
                    if (i < recent.lastIndex) HairlineDivider()
                }
            }
            Spacer(Modifier.height(Space.s))
        }
    }
}

/* ============================ WITHDRAW ============================ */
@Composable
fun WithdrawScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { vm.refreshWallet() }
    var amount by remember { mutableStateOf("") }
    var method by remember { mutableStateOf("Bank") }
    var otp by remember { mutableStateOf("") }
    var otpSent by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    // Best rule: block withdrawal until the bank account is admin-verified (Approved).
    if (!vm.bankApproved) {
        Column(Modifier.fillMaxSize().background(ScreenBg)) {
            Header("Withdraw Money", onBack = { nav.popBackStack() })
            Column(Modifier.padding(Space.l), verticalArrangement = Arrangement.spacedBy(Space.m)) {
                Box(Modifier.fillMaxWidth().background(RedLight, RoundedCornerShape(Radius.card)).padding(Space.l)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(44.dp).background(Color.White, RoundedCornerShape(Radius.field)),
                            contentAlignment = Alignment.Center,
                        ) { Icon(Icons.Filled.Lock, null, tint = RedCancel, modifier = Modifier.size(24.dp)) }
                        Spacer(Modifier.width(Space.m))
                        Column {
                            Text("Bank not verified", fontWeight = FontWeight.Bold, color = TextDark)
                            Text(
                                when (vm.bankStatus) {
                                    "Pending Verification" -> "Your bank account is awaiting admin approval."
                                    "Rejected" -> "Your bank account was rejected. Please re-submit."
                                    else -> "Add your bank account to start withdrawing."
                                },
                                fontSize = 13.sp, color = TextGray,
                            )
                        }
                    }
                }
                InfoNote("For your security, withdrawals are enabled only after an admin verifies your bank account.")
                PrimaryButton(if (vm.bankStatus == "Not Added") "Add Bank Account" else "View Bank & KYC") {
                    nav.navigate(Routes.P_BANK)
                }
            }
        }
        return
    }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Withdraw Money", onBack = { nav.popBackStack() })
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            MoneyBanner("Available to withdraw", vm.walletBalance)
            Card {
                SectionTitle("Enter Amount")
                Spacer(Modifier.height(Space.s))
                OutlinedTextField(
                    value = amount,
                    onValueChange = { if (it.length <= 6 && it.all(Char::isDigit)) amount = it },
                    label = { Text("Amount (₹)") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(Radius.field),
                    colors = softFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(Space.l))
                SectionTitle("Transfer To")
                Spacer(Modifier.height(Space.s))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    ChoicePill(Modifier.weight(1f), "Bank Account", method == "Bank") { method = "Bank" }
                    ChoicePill(Modifier.weight(1f), "UPI", method == "UPI") { method = "UPI" }
                }
                Text(
                    if (method == "Bank") "${vm.bankName} • ${vm.bankAccount}" else "Linked UPI ID",
                    color = TextGray, fontSize = 12.sp, modifier = Modifier.padding(top = Space.s),
                )
            }
            if (otpSent) {
                Card {
                    SectionTitle("Confirm with OTP")
                    Text("Enter the 4-digit OTP sent to your phone.", color = TextGray, fontSize = 12.sp)
                    Spacer(Modifier.height(Space.s))
                    OutlinedTextField(
                        value = otp,
                        onValueChange = { if (it.length <= 4 && it.all(Char::isDigit)) otp = it },
                        label = { Text("OTP") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        shape = RoundedCornerShape(Radius.field),
                        colors = softFieldColors(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            InfoNote("Withdrawals up to ₹2,000 are auto-approved instantly. Larger amounts go to admin for approval before payout.")
            if (!otpSent) {
                PrimaryButton(if (busy) "Sending OTP…" else "Send OTP", enabled = !busy, loading = busy) {
                    val amt = amount.toIntOrNull() ?: 0
                    when {
                        amt <= 0 -> toast(ctx, "Enter a valid amount")
                        amt > vm.walletBalance -> toast(ctx, "Amount exceeds available balance")
                        else -> {
                            busy = true
                            vm.requestWithdrawOtp { dev ->
                                busy = false
                                if (dev != null) { otpSent = true; toast(ctx, "OTP sent (demo: $dev)") }
                                else toast(ctx, "Could not send OTP — check connection")
                            }
                        }
                    }
                }
            } else {
                PrimaryButton(if (busy) "Processing…" else "Confirm Withdrawal", enabled = !busy, loading = busy) {
                    busy = true
                    vm.submitWithdrawal(amount.toIntOrNull() ?: 0, method, otp) { err ->
                        busy = false
                        if (err == null) {
                            // Withdrawal request created -> show the transaction receipt.
                            val rid = vm.lastWithdrawalId
                            if (rid > 0) nav.navigate("${Routes.WITHDRAW_RECEIPT}/$rid") else nav.popBackStack()
                        } else toast(ctx, err)
                    }
                }
            }
            // Past withdrawals — tap to view/download the receipt again.
            if (vm.withdrawals.isNotEmpty()) {
                SectionTitle("Recent Withdrawals")
                vm.withdrawals.take(5).forEach { x ->
                    StatusListRow(
                        icon = Icons.Filled.ArrowUpward,
                        iconTint = Purple,
                        iconBg = PurpleLight,
                        title = rupee(x.amount),
                        subtitle = "${x.method} • ${x.date}",
                        subtitleColor = TextGray,
                        value = x.status,
                        valueColor = statusFg(x.status),
                        onClick = { nav.navigate("${Routes.WITHDRAW_RECEIPT}/${x.id}") },
                    )
                }
            }
        }
    }
}

/* ============================ WITHDRAWAL RECEIPT ============================ */
@Composable
fun WithdrawalReceiptScreen(vm: AppViewModel, nav: NavHostController, withdrawalId: Int) {
    val ctx = LocalContext.current
    LaunchedEffect(withdrawalId) { vm.loadWithdrawalReceipt(withdrawalId) }
    val r = vm.withdrawalReceipt
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Transaction Receipt", onBack = { nav.popBackStack() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(Space.l), verticalArrangement = Arrangement.spacedBy(Space.m)) {
            if (r == null) {
                Text("Loading receipt…", color = TextGray, modifier = Modifier.padding(Space.xxl))
            } else {
                // Status banner
                val paid = r.status == "Paid"
                Box(
                    Modifier.fillMaxWidth()
                        .background(if (paid) GreenLight else GoldLight, RoundedCornerShape(Radius.card)).padding(Space.xl),
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        Box(
                            Modifier.size(56.dp).background(Color.White, RoundedCornerShape(Radius.pill)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(if (paid) Icons.Filled.CheckCircle else Icons.Filled.Schedule, null, tint = if (paid) GreenSuccess else Gold, modifier = Modifier.size(34.dp))
                        }
                        Spacer(Modifier.height(Space.m))
                        Text(rupee(r.amount), fontWeight = FontWeight.Bold, fontSize = 30.sp, color = TextDark, letterSpacing = (-0.5).sp)
                        Text(if (paid) "Paid to your ${r.method}" else r.status, color = if (paid) GreenSuccess else Gold, fontWeight = FontWeight.SemiBold)
                    }
                }
                Card {
                    SectionTitle("Details")
                    Spacer(Modifier.height(Space.xs))
                    PayRow("Reference No.", r.reference)
                    PayRow("Worker", "${r.workerName} (${r.workerId})")
                    PayRow("Amount", rupee(r.amount), if (paid) GreenSuccess else TextDark)
                    PayRow("Method", r.method)
                    PayRow("Paid To", r.bankDetails)
                    PayRow("Requested", "${r.date}, ${r.time}")
                    if (r.processedDate.isNotBlank()) PayRow("Processed", r.processedDate)
                    HairlineDivider()
                    Row(Modifier.fillMaxWidth().padding(top = Space.s), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text(tr("Status"), fontWeight = FontWeight.Bold, color = TextDark)
                        StatusPill(r.status, statusBg(r.status), statusFg(r.status))
                    }
                }
                InfoNote(r.note)
                PrimaryButton("Download Receipt") {
                    val path = saveReceipt(ctx, r)
                    toast(ctx, if (path != null) "Saved to $path" else "Could not save receipt")
                }
            }
        }
    }
}

private fun saveReceipt(ctx: Context, r: com.homehelp.pro.network.WithdrawalReceiptDto): String? = try {
    val text = buildString {
        appendLine("HOMEHELP PRO — WITHDRAWAL RECEIPT")
        appendLine("==================================")
        appendLine("Reference : ${r.reference}")
        appendLine("Worker    : ${r.workerName} (${r.workerId})")
        appendLine("Amount    : ₹${r.amount}")
        appendLine("Method    : ${r.method}")
        appendLine("Paid To   : ${r.bankDetails}")
        appendLine("Requested : ${r.date}, ${r.time}")
        if (r.processedDate.isNotBlank()) appendLine("Processed : ${r.processedDate}")
        appendLine("Status    : ${r.status}")
        appendLine("Note      : ${r.note}")
    }
    val file = File(ctx.getExternalFilesDir(null), "receipt-${r.reference}.txt")
    file.writeText(text)
    file.absolutePath
} catch (e: Exception) { null }

/* ============================ SALARY ADVANCE ============================ */
@Composable
fun SalaryAdvanceScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { vm.loadAdvanceEligibility() }
    var amount by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val elig = vm.advanceEligibility

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Salary Advance", onBack = { nav.popBackStack() })
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            val eligible = elig?.eligible == true
            Box(
                Modifier.fillMaxWidth()
                    .background(if (eligible) GreenLight else RedLight, RoundedCornerShape(Radius.card))
                    .padding(Space.l),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(44.dp).background(Color.White, RoundedCornerShape(Radius.field)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            if (eligible) Icons.Filled.CheckCircle else Icons.Filled.Warning,
                            null, tint = if (eligible) GreenSuccess else RedCancel, modifier = Modifier.size(24.dp),
                        )
                    }
                    Spacer(Modifier.width(Space.m))
                    Column {
                        Text(
                            if (eligible) "You're eligible!" else "Not eligible right now",
                            fontWeight = FontWeight.Bold, color = TextDark,
                        )
                        Text(
                            if (eligible) "Up to ${rupee(elig?.maxAmount ?: 0)} available"
                            else (elig?.reasons?.firstOrNull() ?: "Checking…"),
                            color = TextGray, fontSize = 13.sp,
                        )
                    }
                }
            }
            Card {
                SectionTitle("Eligibility Check")
                Spacer(Modifier.height(Space.s))
                CriteriaRow("Attendance", "${elig?.attendancePct ?: 0}%", (elig?.attendancePct ?: 0) >= 60)
                CriteriaRow("Rating", "${elig?.rating ?: 0.0} ★", (elig?.rating ?: 0.0) >= 4.0)
                CriteriaRow("Completed jobs", "${elig?.completedJobs ?: 0}", (elig?.completedJobs ?: 0) >= 10)
                CriteriaRow("Active penalties", "${elig?.activePenalties ?: 0}", (elig?.activePenalties ?: 0) == 0)
            }
            if (eligible) {
                Card {
                    SectionTitle("Request Amount")
                    Spacer(Modifier.height(Space.s))
                    OutlinedTextField(
                        value = amount,
                        onValueChange = { if (it.length <= 6 && it.all(Char::isDigit)) amount = it },
                        label = { Text("Amount (₹) • max ${rupee(elig?.maxAmount ?: 0)}") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        shape = RoundedCornerShape(Radius.field),
                        colors = softFieldColors(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            InfoNote("Once approved, the advance is credited to your wallet. Recovery happens automatically as a small deduction from your future job earnings.")
            PrimaryButton(if (busy) "Sending request…" else "Request Advance", enabled = eligible && !busy, loading = busy) {
                busy = true
                vm.submitAdvance(amount.toIntOrNull() ?: 0) { err ->
                    busy = false
                    if (err == null) { toast(ctx, "Advance request sent for approval"); nav.popBackStack() }
                    else toast(ctx, err)
                }
            }
            if (vm.advances.isNotEmpty()) {
                SectionTitle("Advance History")
                vm.advances.forEach { a ->
                    StatusListRow(
                        icon = Icons.Filled.Savings,
                        iconTint = Purple,
                        iconBg = PurpleLight,
                        title = rupee(a.amount),
                        subtitle = a.date,
                        subtitleColor = TextGray,
                        value = a.status,
                        valueColor = statusFg(a.status),
                    )
                }
            }
        }
    }
}

/* ============================ WALLET HISTORY ============================ */
@Composable
fun WalletHistoryScreen(vm: AppViewModel, nav: NavHostController) {
    LaunchedEffect(Unit) { vm.refreshWallet() }
    var filter by remember { mutableStateOf("All") }
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Transaction History", onBack = { nav.popBackStack() })
        SegmentedTabs(
            options = listOf("All", "Credit", "Debit"),
            selected = filter,
            modifier = Modifier.padding(horizontal = Space.l, vertical = Space.m),
        ) { filter = it }
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.s),
        ) {
            val rows = vm.walletHistory.filter {
                when (filter) { "Credit" -> it.isCredit; "Debit" -> !it.isCredit; else -> true }
            }
            if (rows.isEmpty()) {
                EmptyState("🧾", "No transactions", "Your wallet activity will appear here.")
            } else {
                rows.forEach { e ->
                    val meta = buildString {
                        append("${e.status} • ${e.date}")
                        if (e.refId.isNotBlank()) append(" • ${e.refId}")
                        if (e.method != "—" && e.method.isNotBlank()) append(" • ${e.method}")
                    }
                    StatusListRow(
                        icon = if (e.isCredit) Icons.Filled.ArrowDownward else Icons.Filled.ArrowUpward,
                        iconTint = if (e.isCredit) GreenSuccess else Purple,
                        iconBg = if (e.isCredit) GreenLight else PurpleLight,
                        title = e.type,
                        subtitle = meta,
                        subtitleColor = statusFg(e.status),
                        value = (if (e.isCredit) "+" else "-") + rupee(e.amount),
                        valueColor = if (e.isCredit) GreenSuccess else RedCancel,
                    )
                }
            }
            Spacer(Modifier.height(Space.l))
        }
    }
}

/* ============================ EARNINGS BREAKUP ============================ */
@Composable
fun EarningsBreakupScreen(vm: AppViewModel, nav: NavHostController) {
    LaunchedEffect(Unit) { vm.refreshWallet() }
    val total = vm.earningsBreakup.sumOf { it.amount }
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Earnings Breakup", onBack = { nav.popBackStack() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(Space.l), verticalArrangement = Arrangement.spacedBy(Space.m)) {
            // Green total banner connected to the category breakdown as one surface.
            ElevatedGroup {
                MoneyBanner("Total Income", total)
                Column(Modifier.background(CardBg).padding(Space.l)) {
                    SectionTitle("By Category")
                    Spacer(Modifier.height(Space.xs))
                    if (vm.earningsBreakup.isEmpty()) EmptyHint("No earnings recorded yet.")
                    vm.earningsBreakup.forEachIndexed { i, b ->
                        BreakdownRow(b.category, "+ ${rupee(b.amount)}", GreenSuccess)
                        if (i < vm.earningsBreakup.lastIndex) HairlineDivider()
                    }
                }
            }
        }
    }
}

/* ============================ DEDUCTIONS ============================ */
@Composable
fun DeductionsScreen(vm: AppViewModel, nav: NavHostController) {
    LaunchedEffect(Unit) { vm.refreshWallet() }
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Deductions", onBack = { nav.popBackStack() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(Space.l), verticalArrangement = Arrangement.spacedBy(Space.m)) {
            Box(Modifier.fillMaxWidth().background(RedLight, RoundedCornerShape(Radius.card)).padding(Space.l)) {
                Column {
                    Text(tr("Total Deductions"), color = TextGray, fontSize = 12.sp)
                    Text("- ${rupee(vm.deductionTotal)}", color = RedCancel, fontSize = 28.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp)
                    Text("Every deduction is itemised below — nothing is hidden.", color = TextGray, fontSize = 11.sp)
                }
            }
            Card {
                SectionTitle("By Category")
                Spacer(Modifier.height(Space.xs))
                vm.deductionSummary.forEach { BreakupRow(it.category, it.amount, credit = false, dim = it.amount == 0) }
            }
            if (vm.deductionDetail.isNotEmpty()) {
                SectionTitle("Itemised")
                vm.deductionDetail.forEach { d ->
                    StatusListRow(
                        icon = Icons.Filled.ArrowUpward,
                        iconTint = RedCancel,
                        iconBg = RedLight,
                        title = d.category,
                        subtitle = "${d.label} • ${d.date}",
                        subtitleColor = TextGray,
                        value = "- ${rupee(d.amount)}",
                        valueColor = RedCancel,
                    )
                }
            }
        }
    }
}

/* ============================ PAYSLIP ============================ */
@Composable
fun PayslipScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { vm.loadPayslip() }
    val p = vm.payslip
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        // White header: back · title · download.
        Row(
            Modifier.fillMaxWidth().background(Color.White).padding(horizontal = Space.s).padding(top = 10.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(38.dp).clip(CircleShape).clickable { nav.popBackStack() }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Purple, modifier = Modifier.size(22.dp))
            }
            Text("Payslip", color = Purple, fontSize = 19.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            Box(
                Modifier.size(38.dp).clip(CircleShape).clickable(enabled = p != null) {
                    p?.let {
                        val path = savePayslip(ctx, it.workerName, it.month, buildPayslipText(it))
                        toast(ctx, if (path != null) "Saved to $path" else "Could not save payslip")
                    }
                },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Download, contentDescription = "Download", tint = Purple, modifier = Modifier.size(20.dp)) }
        }

        Column(Modifier.verticalScroll(rememberScrollState()).padding(Space.l), verticalArrangement = Arrangement.spacedBy(Space.m)) {
            if (p == null) {
                Text("Loading payslip…", color = TextGray, modifier = Modifier.padding(Space.xxl))
            } else {
                // Worker + pay period.
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(16.dp)).padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(48.dp).clip(CircleShape).background(PurpleLight), contentAlignment = Alignment.Center) {
                        Text(p.workerName.take(1).ifBlank { "W" }.uppercase(), color = Purple, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text(p.workerName.ifBlank { "Worker" }, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextDark)
                        Text("ID: ${p.workerId}", color = TextGray, fontSize = 12.5.sp)
                    }
                    Box(Modifier.clip(RoundedCornerShape(20.dp)).background(Primary50).padding(horizontal = 12.dp, vertical = 6.dp)) {
                        Text(p.month, color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }

                // Net-pay highlight (soft purple, take-home this month).
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Brush.linearGradient(listOf(Color(0xFF6D4AFF), Color(0xFF4B2FD6)))).padding(20.dp),
                ) {
                    Text("NET PAY", color = Color.White.copy(alpha = 0.85f), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                    Spacer(Modifier.height(6.dp))
                    Text(rupee(p.netPay), color = Color.White, fontSize = 34.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1).sp)
                    Spacer(Modifier.height(2.dp))
                    Text("Take-home for ${p.month}", color = Color.White.copy(alpha = 0.85f), fontSize = 12.5.sp)
                }

                // Earnings card.
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(16.dp)).padding(16.dp),
                ) {
                    Text("Earnings", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(Space.s))
                    PaySlipRow("Total Jobs", "${p.totalJobs}")
                    HairlineDivider()
                    if (p.breakup.isNotEmpty()) {
                        p.breakup.forEach { PaySlipRow(it.category, "+ ${rupee(it.amount)}", GreenSuccess); HairlineDivider() }
                    } else {
                        PaySlipRow("Gross Earnings", "+ ${rupee(p.grossEarnings)}", GreenSuccess)
                        HairlineDivider()
                    }
                    PaySlipRow("Bonuses & Incentives", "+ ${rupee(p.bonuses)}", GreenSuccess)
                }

                // Deductions card.
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(16.dp)).padding(16.dp),
                ) {
                    Text("Deductions", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(Space.s))
                    if (p.deductionBreakup.isNotEmpty()) {
                        p.deductionBreakup.forEachIndexed { i, it ->
                            PaySlipRow(it.category, "- ${rupee(it.amount)}", RedCancel)
                            if (i < p.deductionBreakup.lastIndex) HairlineDivider()
                        }
                    } else {
                        PaySlipRow("Total Deductions", "- ${rupee(p.deductions)}", RedCancel)
                    }
                }

                // Net pay summary strip.
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(GreenLight).padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Net Payable", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text(rupee(p.netPay), color = GreenSuccess, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                }

                // Settlement details.
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(16.dp)).padding(16.dp),
                ) {
                    Text("Settlement", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(Space.s))
                    PaySlipRow("Withdrawn", rupee(p.withdrawals))
                    HairlineDivider()
                    PaySlipRow("Pending Balance", rupee(p.pending))
                    HairlineDivider()
                    PaySlipRow("Bank", p.bankDetails.ifBlank { "—" })
                }

                PrimaryButton("Download Payslip") {
                    val path = savePayslip(ctx, p.workerName, p.month, buildPayslipText(p))
                    toast(ctx, if (path != null) "Saved to $path" else "Could not save payslip")
                }
                Spacer(Modifier.height(Space.s))
            }
        }
    }
}

/** Label-value row for the payslip cards (value right-aligned, optional colour). */
@Composable
private fun PaySlipRow(label: String, value: String, valueColor: Color = TextDark) {
    Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = TextGray, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(Space.m))
        Text(value, color = valueColor, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.End)
    }
}

/* ============================ shared helpers ============================ */
// (Hero money figures now use the shared GREEN MoneyBanner / ElevatedGroup from
//  MoneyScreens.kt; balance strips use the shared MiniStatCard.)

@Composable
private fun StatTile(label: String, amount: Int, color: Color = TextDark) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(rupee(amount), color = color, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        Text(label, color = TextGray, fontSize = 11.sp)
    }
}

@Composable
private fun BigAction(modifier: Modifier, icon: ImageVector, label: String, onClick: () -> Unit) {
    Surface(
        modifier = modifier.height(96.dp).clickable { onClick() },
        shape = RoundedCornerShape(Radius.card), color = PurpleLight,
    ) {
        Column(Modifier.padding(horizontal = Space.s, vertical = Space.m), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Box(
                Modifier.size(40.dp).background(Color.White, RoundedCornerShape(Radius.field)),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, null, tint = Purple, modifier = Modifier.size(22.dp)) }
            Spacer(Modifier.height(Space.s))
            Text(tr(label), color = Purple, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, textAlign = TextAlign.Center, lineHeight = 14.sp, maxLines = 2)
        }
    }
}

@Composable
private fun RowHeader(title: String, action: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(tr(title), fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = TextDark)
        Text(tr(action), color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.clickable { onClick() })
    }
}

@Composable
private fun BreakupRow(category: String, amount: Int, credit: Boolean, dim: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = Space.s), verticalAlignment = Alignment.CenterVertically) {
        Text(category, color = if (dim) TextGray else TextDark, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Text(
            (if (credit) "+ " else "- ") + rupee(amount),
            color = if (dim) TextGray else if (credit) GreenSuccess else RedCancel,
            fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
        )
    }
}

@Composable
private fun LedgerRow(e: LedgerEntry, detailed: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = Space.m), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(40.dp).background(if (e.isCredit) GreenLight else RedLight, RoundedCornerShape(Radius.field)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (e.isCredit) Icons.Filled.ArrowDownward else Icons.Filled.ArrowUpward,
                null, tint = if (e.isCredit) GreenSuccess else RedCancel, modifier = Modifier.size(18.dp),
            )
        }
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text(e.type, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
            Text(
                buildString {
                    append("${e.date}, ${e.time}")
                    if (e.refId.isNotBlank()) append(" • ${e.refId}")
                    if (detailed && e.method != "—" && e.method.isNotBlank()) append(" • ${e.method}")
                },
                color = TextGray, fontSize = 11.sp,
            )
            if (detailed && e.remarks.isNotBlank()) Text(e.remarks, color = TextGray, fontSize = 11.sp)
        }
        Spacer(Modifier.width(Space.s))
        Column(horizontalAlignment = Alignment.End) {
            Text(
                (if (e.isCredit) "+" else "-") + rupee(e.amount),
                fontWeight = FontWeight.Bold, fontSize = 14.sp,
                color = if (e.isCredit) GreenSuccess else RedCancel,
            )
            Spacer(Modifier.height(Space.xs))
            StatusPill(e.status, statusBg(e.status), statusFg(e.status))
        }
    }
}

@Composable
private fun ChoicePill(modifier: Modifier, text: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = modifier.height(46.dp).clickable { onClick() },
        shape = RoundedCornerShape(Radius.field),
        color = if (selected) Purple else FieldFill,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) Purple else Color.Transparent),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(tr(text), color = if (selected) Color.White else TextGray, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        }
    }
}

@Composable
private fun CriteriaRow(label: String, value: String, ok: Boolean) {
    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(
            if (ok) Icons.Filled.CheckCircle else Icons.Filled.Warning,
            null, tint = if (ok) GreenSuccess else RedCancel, modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(Space.s))
        Text(label, color = TextDark, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Text(value, color = if (ok) TextDark else RedCancel, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}

// Payslip / receipt label-value row — delegates to the shared LabeledRow component.
@Composable
private fun PayRow(label: String, value: String, color: Color = TextDark) {
    LabeledRow(label, value, color)
}

@Composable
private fun InfoNote(text: String) {
    Row(
        Modifier.fillMaxWidth().background(PurpleLight, RoundedCornerShape(Radius.field)).padding(Space.m),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Info, null, tint = Purple, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(Space.s))
        Text(tr(text), color = TextDark, fontSize = 12.sp)
    }
}

@Composable
private fun EmptyHint(text: String) {
    Text(tr(text), color = TextGray, fontSize = 13.sp, modifier = Modifier.padding(vertical = Space.s))
}

// Status -> pill colours (shared across history, withdrawals, advances).
private fun statusBg(s: String): Color = when (s) {
    "Success", "Paid", "Cleared" -> GreenLight
    "Rejected", "Failed", "Hold" -> RedLight
    else -> GoldLight // Pending / Processing / Requested / Recovering
}
private fun statusFg(s: String): Color = when (s) {
    "Success", "Paid", "Cleared" -> GreenSuccess
    "Rejected", "Failed", "Hold" -> RedCancel
    else -> Gold
}

/* ---- payslip "download": write a plain-text slip to app storage (no permission needed) ---- */
private fun buildPayslipText(p: com.homehelp.pro.network.PayslipDto): String = buildString {
    appendLine("HOMEHELP PRO — PAYSLIP")
    appendLine("========================")
    appendLine("Worker   : ${p.workerName} (${p.workerId})")
    appendLine("Month    : ${p.month}")
    appendLine("Jobs     : ${p.totalJobs}")
    appendLine("------------------------")
    appendLine("EARNINGS")
    p.breakup.filter { it.amount > 0 }.forEach { appendLine("  ${it.category.padEnd(22)} ₹${it.amount}") }
    appendLine("  Gross Earnings        ₹${p.grossEarnings}")
    appendLine("  Bonuses               ₹${p.bonuses}")
    appendLine("------------------------")
    appendLine("DEDUCTIONS")
    p.deductionBreakup.filter { it.amount > 0 }.forEach { appendLine("  ${it.category.padEnd(22)} ₹${it.amount}") }
    appendLine("  Total Deductions      ₹${p.deductions}")
    appendLine("------------------------")
    appendLine("NET PAY                 ₹${p.netPay}")
    appendLine("Withdrawn               ₹${p.withdrawals}")
    appendLine("Pending Balance         ₹${p.pending}")
    appendLine("Bank: ${p.bankDetails}")
}

private fun savePayslip(ctx: Context, name: String, month: String, text: String): String? = try {
    val dir = ctx.getExternalFilesDir(null)
    val file = File(dir, "payslip-${month.replace(" ", "-")}.txt")
    file.writeText(text)
    file.absolutePath
} catch (e: Exception) { null }

/* =================================================================================
 * UI CHANGE LOG — WalletScreens.kt
 * ---------------------------------------------------------------------------------
 * UI-ONLY reference redesign (Urban Company / Snabbit partner-app language, in OUR
 * violet brand + green money banner). NO business logic, state, validation,
 * navigation, vm.* calls, remember{}/mutableStateOf, LaunchedEffect, or @Composable
 * signatures were changed. Every route string, validation rule, OTP/withdraw/advance
 * flow, and WithdrawalReceiptScreen's withdrawalId param are byte-for-byte preserved.
 * This pass adopts the shared reference widgets defined in MoneyScreens.kt
 * (MoneyBanner, ElevatedGroup, BreakdownRow, InsetRow, StatusListRow, MiniStatCard) —
 * none redefined here.
 *
 * WalletScreen        : Kept the rich GradientBanner hero (holds the primary Withdraw
 *                       action). The three balance types (Available/Pending/On Hold)
 *                       are now shared MiniStatCard stat tiles with status icons.
 *                       Earnings Overview / quick-action tiles / preview cards retained.
 * WithdrawScreen      : "Available to withdraw" is now the signature MoneyBanner.
 *                       Soft-filled amount/OTP fields unchanged; recent withdrawals are
 *                       now StatusListRow activity cards (violet up-arrow chip, method •
 *                       date subtitle, colored status value, tap → receipt). Bank-not-
 *                       verified guard panel untouched in behaviour.
 * WithdrawalReceipt   : Circular status badge, large amount, details Card with
 *                       LabeledRow + StatusPill summary (already reference-aligned).
 * SalaryAdvance       : Eligibility banner + criteria card retained; advance history
 *                       converted to StatusListRow cards (Savings chip + status value).
 * WalletHistory       : Shared SegmentedTabs filter; each transaction is now a
 *                       StatusListRow — credit = green down-arrow chip, debit = violet
 *                       up-arrow chip, colored "status • date • ref • method" subtitle,
 *                       signed +/- amount value. EmptyState when empty.
 * EarningsBreakup     : Total Income is a green MoneyBanner joined to the category
 *                       breakdown via ElevatedGroup (BreakdownRow lines).
 * Deductions          : Red total hero retained; itemised list now StatusListRow cards
 *                       (red up-arrow chip, "- ₹x" value).
 * Payslip             : Worker/month header Card; Net Pay is now the green MoneyBanner
 *                       connected via ElevatedGroup to the earnings BreakdownRows plus a
 *                       FieldFill InsetRow sub-box (Withdrawn / Pending / Bank).
 * Helpers             : Removed now-unused MoneyPanel()/BalanceChip() (superseded by the
 *                       shared MoneyBanner/MiniStatCard). softFieldColors() + Radius/Space
 *                       tokens retained. Text-only download files (buildPayslipText/
 *                       saveReceipt/savePayslip) are byte-for-byte unchanged.
 * =================================================================================
 */
