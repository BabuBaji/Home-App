package com.homehelp.pro

import android.content.Context
import androidx.compose.foundation.background
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
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
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

/* ============================ WALLET DASHBOARD ============================ */
@Composable
fun WalletScreen(vm: AppViewModel, nav: NavHostController) {
    LaunchedEffect(Unit) { vm.refreshWallet() }
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        BellHeader("My Wallet")
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Hero — Available balance + the single most important action.
            Box(Modifier.fillMaxWidth().background(Purple, RoundedCornerShape(18.dp)).padding(20.dp)) {
                Column {
                    Text("Available Balance", color = Color.White.copy(alpha = 0.85f), fontSize = 13.sp)
                    Text(rupee(vm.walletBalance), color = Color.White, fontSize = 34.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Schedule, null, tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Next payout: ${vm.nextPayout}", color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp)
                    }
                    Spacer(Modifier.height(14.dp))
                    Surface(
                        Modifier.fillMaxWidth().height(48.dp).clickable { nav.navigate(Routes.WITHDRAW) },
                        shape = RoundedCornerShape(12.dp), color = Color.White,
                    ) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.ArrowUpward, null, tint = Purple, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Withdraw Money", color = Purple, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        }
                    }
                }
            }

            // Three balance types, each saying WHY (transparency requirement).
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                BalanceChip(Modifier.weight(1f), "Available", vm.walletBalance, GreenSuccess, GreenLight, "Ready to withdraw")
                BalanceChip(Modifier.weight(1f), "Pending", vm.pendingAmount, Gold, Color(0xFFFFF6E5), "Awaiting QC")
                BalanceChip(Modifier.weight(1f), "On Hold", vm.holdBalance, RedCancel, Color(0xFFFDECEC), "Under review")
            }

            // Period earnings + total withdrawn.
            Card {
                SectionTitle("Earnings Overview")
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    StatTile("Today", vm.todayEarnings)
                    StatTile("This Week", vm.weekEarnings)
                    StatTile("This Month", vm.monthEarnings)
                }
                Spacer(Modifier.height(12.dp)); Divider(color = Divider); Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    StatTile("Total Withdrawn", vm.withdrawnTotal, GreenSuccess)
                    StatTile("Advance Due", vm.advanceOutstanding, if (vm.advanceOutstanding > 0) RedCancel else TextDark)
                    StatTile("Total Earned", vm.totalEarned)
                }
            }

            // Big, clearly-labelled action buttons.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                BigAction(Modifier.weight(1f), Icons.Filled.Savings, "Salary\nAdvance") { nav.navigate(Routes.SALARY_ADVANCE) }
                BigAction(Modifier.weight(1f), Icons.Filled.Description, "Payslip") { nav.navigate(Routes.PAYSLIP) }
                BigAction(Modifier.weight(1f), Icons.Filled.History, "History") { nav.navigate(Routes.WALLET_HISTORY) }
            }

            // Earnings breakup (preview).
            Card {
                RowHeader("Earnings Breakup", "View all") { nav.navigate(Routes.EARNINGS_BREAKUP) }
                Spacer(Modifier.height(6.dp))
                val shown = vm.earningsBreakup.filter { it.amount > 0 }.take(5)
                if (shown.isEmpty()) EmptyHint("No earnings recorded yet.")
                shown.forEach { BreakupRow(it.category, it.amount, credit = true) }
            }

            // Deductions — never hidden, total shown in red.
            Card {
                RowHeader("Deductions", "View all") { nav.navigate(Routes.DEDUCTIONS) }
                Spacer(Modifier.height(6.dp))
                val shown = vm.deductionSummary.filter { it.amount > 0 }.take(5)
                if (shown.isEmpty()) EmptyHint("No deductions. You keep 100% of your earnings.")
                shown.forEach { BreakupRow(it.category, it.amount, credit = false) }
                if (vm.deductionTotal > 0) {
                    Divider(color = Divider)
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Total Deductions", fontWeight = FontWeight.Bold, color = TextDark)
                        Text("- ${rupee(vm.deductionTotal)}", fontWeight = FontWeight.Bold, color = RedCancel)
                    }
                }
            }

            // Recent activity.
            Card {
                RowHeader("Recent Activity", "View all") { nav.navigate(Routes.WALLET_HISTORY) }
                Spacer(Modifier.height(4.dp))
                val recent = vm.walletHistory.take(5)
                if (recent.isEmpty()) EmptyHint("No transactions yet.")
                recent.forEach { LedgerRow(it) }
            }
            Spacer(Modifier.height(8.dp))
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
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.fillMaxWidth().background(Color(0xFFFDECEC), RoundedCornerShape(14.dp)).padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Lock, null, tint = RedCancel, modifier = Modifier.size(26.dp))
                        Spacer(Modifier.width(12.dp))
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
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(Modifier.fillMaxWidth().background(GreenLight, RoundedCornerShape(14.dp)).padding(16.dp)) {
                Column {
                    Text("Available to withdraw", color = TextGray, fontSize = 12.sp)
                    Text(rupee(vm.walletBalance), color = GreenSuccess, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                }
            }
            Card {
                SectionTitle("Enter Amount")
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = amount,
                    onValueChange = { if (it.length <= 6 && it.all(Char::isDigit)) amount = it },
                    label = { Text("Amount (₹)") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(14.dp))
                SectionTitle("Transfer To")
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ChoicePill(Modifier.weight(1f), "Bank Account", method == "Bank") { method = "Bank" }
                    ChoicePill(Modifier.weight(1f), "UPI", method == "UPI") { method = "UPI" }
                }
                Text(
                    if (method == "Bank") "${vm.bankName} • ${vm.bankAccount}" else "Linked UPI ID",
                    color = TextGray, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp),
                )
            }
            if (otpSent) {
                Card {
                    SectionTitle("Confirm with OTP")
                    Text("Enter the 4-digit OTP sent to your phone.", color = TextGray, fontSize = 12.sp)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = otp,
                        onValueChange = { if (it.length <= 4 && it.all(Char::isDigit)) otp = it },
                        label = { Text("OTP") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            InfoNote("Withdrawals up to ₹2,000 are auto-approved instantly. Larger amounts go to admin for approval before payout.")
            if (!otpSent) {
                PrimaryButton(if (busy) "Sending OTP…" else "Send OTP", enabled = !busy) {
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
                PrimaryButton(if (busy) "Processing…" else "Confirm Withdrawal", enabled = !busy) {
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
                Card {
                    SectionTitle("Recent Withdrawals")
                    Spacer(Modifier.height(4.dp))
                    vm.withdrawals.take(5).forEach { x ->
                        Row(
                            Modifier.fillMaxWidth().clickable { nav.navigate("${Routes.WITHDRAW_RECEIPT}/${x.id}") }
                                .padding(vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(rupee(x.amount), fontWeight = FontWeight.SemiBold, color = TextDark)
                                Text("${x.method} • ${x.date}", fontSize = 11.sp, color = TextGray)
                            }
                            StatusPill(x.status, statusBg(x.status), statusFg(x.status))
                            Spacer(Modifier.width(8.dp))
                            Text("Receipt ›", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        }
                        Divider(color = Divider)
                    }
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
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            if (r == null) {
                Text("Loading receipt…", color = TextGray, modifier = Modifier.padding(24.dp))
            } else {
                // Status banner
                val paid = r.status == "Paid"
                Box(
                    Modifier.fillMaxWidth()
                        .background(if (paid) GreenLight else Color(0xFFFFF6E5), RoundedCornerShape(14.dp)).padding(18.dp),
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        Icon(if (paid) Icons.Filled.CheckCircle else Icons.Filled.Schedule, null, tint = if (paid) GreenSuccess else Gold, modifier = Modifier.size(40.dp))
                        Spacer(Modifier.height(8.dp))
                        Text(rupee(r.amount), fontWeight = FontWeight.Bold, fontSize = 28.sp, color = TextDark)
                        Text(if (paid) "Paid to your ${r.method}" else r.status, color = if (paid) GreenSuccess else Gold, fontWeight = FontWeight.SemiBold)
                    }
                }
                Card {
                    PayRow("Reference No.", r.reference)
                    PayRow("Worker", "${r.workerName} (${r.workerId})")
                    PayRow("Amount", rupee(r.amount), if (paid) GreenSuccess else TextDark)
                    PayRow("Method", r.method)
                    PayRow("Paid To", r.bankDetails)
                    PayRow("Requested", "${r.date}, ${r.time}")
                    if (r.processedDate.isNotBlank()) PayRow("Processed", r.processedDate)
                    PayRow("Status", r.status, if (paid) GreenSuccess else Gold)
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
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            val eligible = elig?.eligible == true
            Box(
                Modifier.fillMaxWidth()
                    .background(if (eligible) GreenLight else Color(0xFFFDECEC), RoundedCornerShape(14.dp))
                    .padding(16.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        if (eligible) Icons.Filled.CheckCircle else Icons.Filled.Warning,
                        null, tint = if (eligible) GreenSuccess else RedCancel, modifier = Modifier.size(28.dp),
                    )
                    Spacer(Modifier.width(12.dp))
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
                Spacer(Modifier.height(8.dp))
                CriteriaRow("Attendance", "${elig?.attendancePct ?: 0}%", (elig?.attendancePct ?: 0) >= 60)
                CriteriaRow("Rating", "${elig?.rating ?: 0.0} ★", (elig?.rating ?: 0.0) >= 4.0)
                CriteriaRow("Completed jobs", "${elig?.completedJobs ?: 0}", (elig?.completedJobs ?: 0) >= 10)
                CriteriaRow("Active penalties", "${elig?.activePenalties ?: 0}", (elig?.activePenalties ?: 0) == 0)
            }
            if (eligible) {
                Card {
                    SectionTitle("Request Amount")
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = amount,
                        onValueChange = { if (it.length <= 6 && it.all(Char::isDigit)) amount = it },
                        label = { Text("Amount (₹) • max ${rupee(elig?.maxAmount ?: 0)}") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            InfoNote("Once approved, the advance is credited to your wallet. Recovery happens automatically as a small deduction from your future job earnings.")
            PrimaryButton(if (busy) "Sending request…" else "Request Advance", enabled = eligible && !busy) {
                busy = true
                vm.submitAdvance(amount.toIntOrNull() ?: 0) { err ->
                    busy = false
                    if (err == null) { toast(ctx, "Advance request sent for approval"); nav.popBackStack() }
                    else toast(ctx, err)
                }
            }
            if (vm.advances.isNotEmpty()) {
                Card {
                    SectionTitle("Advance History")
                    Spacer(Modifier.height(4.dp))
                    vm.advances.forEach { a ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column(Modifier.weight(1f)) {
                                Text(rupee(a.amount), fontWeight = FontWeight.SemiBold, color = TextDark)
                                Text(a.date, color = TextGray, fontSize = 11.sp)
                            }
                            StatusPill(a.status, statusBg(a.status), statusFg(a.status))
                        }
                        Divider(color = Divider)
                    }
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
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("All", "Credit", "Debit").forEach {
                ChoicePill(Modifier.weight(1f), it, filter == it) { filter = it }
            }
        }
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            val rows = vm.walletHistory.filter {
                when (filter) { "Credit" -> it.isCredit; "Debit" -> !it.isCredit; else -> true }
            }
            if (rows.isEmpty()) Text("No transactions.", color = TextGray, modifier = Modifier.padding(24.dp))
            Card {
                rows.forEachIndexed { i, e ->
                    LedgerRow(e, detailed = true)
                    if (i < rows.lastIndex) Divider(color = Divider)
                }
            }
            Spacer(Modifier.height(16.dp))
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
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.fillMaxWidth().background(GreenLight, RoundedCornerShape(14.dp)).padding(16.dp)) {
                Column {
                    Text("Total Income", color = TextGray, fontSize = 12.sp)
                    Text(rupee(total), color = GreenSuccess, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                }
            }
            Card {
                vm.earningsBreakup.forEachIndexed { i, b ->
                    BreakupRow(b.category, b.amount, credit = true)
                    if (i < vm.earningsBreakup.lastIndex) Divider(color = Divider)
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
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.fillMaxWidth().background(Color(0xFFFDECEC), RoundedCornerShape(14.dp)).padding(16.dp)) {
                Column {
                    Text("Total Deductions", color = TextGray, fontSize = 12.sp)
                    Text("- ${rupee(vm.deductionTotal)}", color = RedCancel, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                    Text("Every deduction is itemised below — nothing is hidden.", color = TextGray, fontSize = 11.sp)
                }
            }
            Card {
                SectionTitle("By Category")
                Spacer(Modifier.height(4.dp))
                vm.deductionSummary.forEach { BreakupRow(it.category, it.amount, credit = false, dim = it.amount == 0) }
            }
            if (vm.deductionDetail.isNotEmpty()) {
                Card {
                    SectionTitle("Itemised")
                    Spacer(Modifier.height(4.dp))
                    vm.deductionDetail.forEach { d ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(d.category, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
                                Text("${d.label} • ${d.date}", color = TextGray, fontSize = 11.sp)
                            }
                            Text("- ${rupee(d.amount)}", color = RedCancel, fontWeight = FontWeight.Bold)
                        }
                        Divider(color = Divider)
                    }
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
        Header("Payslip", onBack = { nav.popBackStack() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            if (p == null) {
                Text("Loading payslip…", color = TextGray, modifier = Modifier.padding(24.dp))
            } else {
                Card {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column {
                            Text(p.workerName, fontWeight = FontWeight.Bold, fontSize = 17.sp, color = TextDark)
                            Text("ID: ${p.workerId}", color = TextGray, fontSize = 12.sp)
                        }
                        Text(p.month, color = Purple, fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(Modifier.height(12.dp)); Divider(color = Divider); Spacer(Modifier.height(12.dp))
                    PayRow("Total Jobs", "${p.totalJobs}")
                    PayRow("Gross Earnings", rupee(p.grossEarnings), GreenSuccess)
                    PayRow("Bonuses & Incentives", rupee(p.bonuses), GreenSuccess)
                    PayRow("Deductions", "- ${rupee(p.deductions)}", RedCancel)
                    Spacer(Modifier.height(8.dp)); Divider(color = Divider); Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Net Pay", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextDark)
                        Text(rupee(p.netPay), fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Purple)
                    }
                    Spacer(Modifier.height(8.dp)); Divider(color = Divider); Spacer(Modifier.height(8.dp))
                    PayRow("Withdrawn", rupee(p.withdrawals))
                    PayRow("Pending Balance", rupee(p.pending), Gold)
                    PayRow("Bank", p.bankDetails)
                }
                PrimaryButton("Download Payslip") {
                    val path = savePayslip(ctx, p.workerName, p.month, buildPayslipText(p))
                    toast(ctx, if (path != null) "Saved to $path" else "Could not save payslip")
                }
            }
        }
    }
}

/* ============================ shared helpers ============================ */
@Composable
private fun BalanceChip(modifier: Modifier, label: String, amount: Int, fg: Color, bg: Color, why: String) {
    Box(modifier.background(bg, RoundedCornerShape(14.dp)).padding(12.dp)) {
        Column {
            Text(label, color = TextGray, fontSize = 11.sp)
            Text(rupee(amount), color = fg, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text(why, color = TextGray, fontSize = 9.sp)
        }
    }
}

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
        modifier = modifier.height(94.dp).clickable { onClick() },
        shape = RoundedCornerShape(14.dp), color = PurpleLight,
    ) {
        Column(Modifier.padding(horizontal = 6.dp, vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Icon(icon, null, tint = Purple, modifier = Modifier.size(26.dp))
            Spacer(Modifier.height(6.dp))
            Text(label, color = Purple, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, textAlign = TextAlign.Center, lineHeight = 14.sp, maxLines = 2)
        }
    }
}

@Composable
private fun RowHeader(title: String, action: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontWeight = FontWeight.SemiBold, color = TextDark)
        Text(action, color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.clickable { onClick() })
    }
}

@Composable
private fun BreakupRow(category: String, amount: Int, credit: Boolean, dim: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
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
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(40.dp).background(if (e.isCredit) GreenLight else Color(0xFFFDECEC), RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (e.isCredit) Icons.Filled.ArrowDownward else Icons.Filled.ArrowUpward,
                null, tint = if (e.isCredit) GreenSuccess else RedCancel, modifier = Modifier.size(18.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
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
        Column(horizontalAlignment = Alignment.End) {
            Text(
                (if (e.isCredit) "+" else "-") + rupee(e.amount),
                fontWeight = FontWeight.Bold, fontSize = 14.sp,
                color = if (e.isCredit) GreenSuccess else RedCancel,
            )
            StatusPill(e.status, statusBg(e.status), statusFg(e.status))
        }
    }
}

@Composable
private fun ChoicePill(modifier: Modifier, text: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = modifier.height(44.dp).clickable { onClick() },
        shape = RoundedCornerShape(10.dp),
        color = if (selected) Purple else Color.White,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) Purple else Divider),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(text, color = if (selected) Color.White else TextGray, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
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
        Spacer(Modifier.width(10.dp))
        Text(label, color = TextDark, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Text(value, color = if (ok) TextDark else RedCancel, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}

@Composable
private fun PayRow(label: String, value: String, color: Color = TextDark) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = TextGray, fontSize = 14.sp)
        Text(value, color = color, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun InfoNote(text: String) {
    Row(
        Modifier.fillMaxWidth().background(PurpleLight, RoundedCornerShape(12.dp)).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Info, null, tint = Purple, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, color = TextDark, fontSize = 12.sp)
    }
}

@Composable
private fun EmptyHint(text: String) {
    Text(text, color = TextGray, fontSize = 13.sp, modifier = Modifier.padding(vertical = 10.dp))
}

// Status -> pill colours (shared across history, withdrawals, advances).
private fun statusBg(s: String): Color = when (s) {
    "Success", "Paid", "Cleared" -> GreenLight
    "Rejected", "Failed", "Hold" -> Color(0xFFFDECEC)
    else -> Color(0xFFFFF6E5) // Pending / Processing / Requested / Recovering
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
