package com.homehelp.pro

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Backspace
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.homehelp.pro.network.BankAccount
import com.homehelp.pro.network.PayoutSettingsDto

// ─────────────────────────────────────────────────────────────────────────────────────────────
// WALLET MODULE — the navigation flow from 3_wallet_Follow.png.
//
//   Dashboard → Withdraw Money → Enter PIN → Confirm → Success → Withdrawal History
//   Dashboard → Bank Accounts → Add / Manage Account
//   Dashboard → Payout Settings · Payout Schedule · Help & Support
//
// The amount, PIN and destination are carried in the ViewModel rather than as nav arguments, so
// a process death mid-flow can't resurrect a half-built withdrawal from the back stack.
// Every guard here is mirrored server-side: the UI is a convenience, not the control.
// ─────────────────────────────────────────────────────────────────────────────────────────────

private fun rs(v: Int): String =
    "₹" + java.text.NumberFormat.getIntegerInstance(java.util.Locale("en", "IN")).format(v)

/** In-flight withdrawal being assembled across the flow's screens. */
object WithdrawDraft {
    var amount by mutableIntStateOf(0)
    var bankId by mutableIntStateOf(0)
    var pin by mutableStateOf("")
    fun clear() { amount = 0; bankId = 0; pin = "" }
}

/* ── 1. WITHDRAW MONEY ─────────────────────────────────────────────────────────────────── */

@Composable
fun WithdrawMoneyScreen(vm: AppViewModel, nav: NavHostController) {
    var amountText by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { vm.loadBankAccounts(); vm.loadPayoutSettings(); vm.loadPinStatus(); vm.refreshWallet() }

    val bank = vm.bankAccounts.firstOrNull { it.id == WithdrawDraft.bankId } ?: vm.defaultBank
    val amount = amountText.toIntOrNull() ?: 0
    val min = vm.payoutSettings.minPayout
    val tooLow = amount in 1 until min
    val tooHigh = amount > vm.walletBalance
    val canContinue = amount > 0 && !tooLow && !tooHigh && bank != null && bank.verified

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Withdraw Earnings", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // Balance
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(EarningsGradient).padding(14.dp),
            ) {
                Text("Available Balance", color = Color.White.copy(alpha = 0.9f), fontSize = 12.sp)
                Spacer(Modifier.height(4.dp))
                Text(rs(vm.walletBalance), color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            }

            // Destination
            Text("Select Bank Account", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            if (vm.bankAccounts.isEmpty()) {
                Card(padding = Dp16.S) {
                    Text("No payout account yet", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(3.dp))
                    Text("Add a bank account to withdraw your earnings.", color = TextGray, fontSize = 12.sp)
                    Spacer(Modifier.height(Space.s))
                    PrimaryButton("Add Bank Account") { nav.navigate(Routes.BANK_ACCOUNTS) }
                }
            } else if (bank != null) {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White)
                        .border(1.dp, Divider, RoundedCornerShape(12.dp)).padding(11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(38.dp).clip(RoundedCornerShape(10.dp)).background(Primary50),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.AccountBalance, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp)) }
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text(bank.bankName.ifBlank { "Bank account" }, color = TextDark, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                        Text(bank.accountMasked, color = TextGray, fontSize = 12.sp)
                        if (!bank.verified) Text("Verification pending", color = Amber, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    Text(
                        "Change", color = Purple, fontSize = 12.5.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.clickable { nav.navigate(Routes.BANK_ACCOUNTS) },
                    )
                }
            }

            // Amount
            Text("Enter Amount", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            OutlinedTextField(
                value = amountText,
                onValueChange = { v -> amountText = v.filter { it.isDigit() }.take(7) },
                modifier = Modifier.fillMaxWidth(),
                prefix = { Text("₹ ", color = TextDark, fontWeight = FontWeight.Bold) },
                placeholder = { Text("0") },
                singleLine = true,
                isError = tooLow || tooHigh,
                shape = RoundedCornerShape(Radius.button),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.White, unfocusedContainerColor = Color.White,
                    focusedBorderColor = Purple, unfocusedBorderColor = Divider, cursorColor = Purple,
                ),
            )
            when {
                tooHigh -> Text("That's more than your available balance.", color = RedCancel, fontSize = 11.5.sp)
                tooLow -> Text("Minimum withdrawal is ${rs(min)}.", color = RedCancel, fontSize = 11.5.sp)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                listOf(500, 1000, 1500).forEach { q ->
                    QuickAmount(Modifier.weight(1f), rs(q), amountText == q.toString()) { amountText = q.toString() }
                }
                QuickAmount(Modifier.weight(1f), "MAX", amountText == vm.walletBalance.toString()) { amountText = vm.walletBalance.toString() }
            }

            // Summary — fees are ₹0 today; shown so the worker sees exactly what lands.
            Card(padding = Dp16.S) {
                Text("Withdrawal Summary", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.s))
                SummaryRow("Withdrawal Amount", rs(amount))
                SummaryRow("Processing Fee", rs(0))
                SummaryRow("GST (0%)", rs(0))
                Spacer(Modifier.height(4.dp))
                Box(Modifier.fillMaxWidth().height(1.dp).background(Divider))
                Spacer(Modifier.height(6.dp))
                Row {
                    Text("Amount You Will Receive", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text(rs(amount), color = GreenSuccess, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        BottomBar {
            PrimaryButton("Continue", enabled = canContinue) {
                WithdrawDraft.amount = amount
                WithdrawDraft.bankId = bank?.id ?: 0
                nav.navigate(if (vm.pinIsSet) Routes.WITHDRAW_PIN else Routes.WALLET_PIN_SET)
            }
            if (bank != null && !bank.verified) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "This account is still being verified — you can't withdraw to it yet.",
                    color = TextMuted, fontSize = 11.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun QuickAmount(modifier: Modifier, label: String, on: Boolean, onClick: () -> Unit) {
    Box(
        modifier.clip(RoundedCornerShape(Radius.pill))
            .background(if (on) Purple else Color.White)
            .border(1.dp, if (on) Purple else Divider, RoundedCornerShape(Radius.pill))
            .clickable(onClick = onClick).padding(vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = if (on) Color.White else Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Text(label, color = TextGray, fontSize = 12.sp, modifier = Modifier.weight(1f))
        Text(value, color = TextDark, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun BottomBar(content: @Composable ColumnScopeCompat.() -> Unit) {
    androidx.compose.material3.Surface(color = Color.White, shadowElevation = 12.dp) {
        Column(Modifier.padding(Space.l)) { ColumnScopeCompat.content() }
    }
}

/** Tiny receiver so BottomBar's slot reads like a Column body without leaking ColumnScope. */
object ColumnScopeCompat

/* ── 2. ENTER PIN (and first-time set) ─────────────────────────────────────────────────── */

@Composable
fun WithdrawPinScreen(vm: AppViewModel, nav: NavHostController) {
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var checking by remember { mutableStateOf(false) }

    fun submit(entered: String) {
        checking = true
        vm.verifyWalletPin(entered) { ok, err ->
            checking = false
            if (ok) {
                WithdrawDraft.pin = entered
                nav.navigate(Routes.WITHDRAW_CONFIRM)
            } else { error = err ?: "Incorrect PIN"; pin = "" }
        }
    }

    PinPad(
        title = "Enter 4-digit PIN",
        subtitle = "Enter your 4-digit wallet PIN",
        pin = pin,
        error = error,
        busy = checking,
        onBack = { nav.popBackStack() },
        footer = {
            Text(
                "Forgot PIN?", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable { nav.navigate(Routes.WALLET_PIN_SET) },
            )
        },
        onChange = { next ->
            error = null; pin = next
            if (next.length == 4) submit(next)
        },
    )
}

/**
 * Sets the PIN first time, or resets it. The server demands the OTP when a PIN already exists,
 * so the OTP field only appears in that case.
 */
@Composable
fun WalletPinSetScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var pin by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var otp by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val resetting = vm.pinIsSet

    LaunchedEffect(Unit) { vm.loadPinStatus() }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header(if (resetting) "Reset Wallet PIN" else "Set Wallet PIN", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            Card(padding = Dp16.S) {
                Text(
                    if (resetting) "Enter the OTP sent to your phone, then choose a new 4-digit PIN."
                    else "Choose a 4-digit PIN. You'll enter it every time you withdraw.",
                    color = TextGray, fontSize = 12.5.sp,
                )
            }
            if (resetting) {
                PinField("OTP", otp) { otp = it.filter { c -> c.isDigit() }.take(4) }
                Text(
                    "Tap to send the OTP", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable {
                        // Dev builds hand the OTP straight back; show it rather than pretend it was SMS'd.
                        vm.requestWithdrawOtp { code ->
                            toast(ctx, if (code != null) "OTP sent (dev: $code)" else "Couldn't send the OTP")
                        }
                    },
                )
            }
            PinField("New PIN", pin) { pin = it.filter { c -> c.isDigit() }.take(4) }
            PinField("Confirm PIN", confirm) { confirm = it.filter { c -> c.isDigit() }.take(4) }
            error?.let { Text(it, color = RedCancel, fontSize = 12.sp) }
        }
        androidx.compose.material3.Surface(color = Color.White, shadowElevation = 12.dp) {
            Box(Modifier.padding(Space.l)) {
                PrimaryButton(
                    if (resetting) "Reset PIN" else "Set PIN",
                    enabled = pin.length == 4 && confirm.length == 4 && !vm.walletBusy,
                ) {
                    if (pin != confirm) { error = "Both PINs must match"; return@PrimaryButton }
                    vm.setWalletPin(pin, otp.takeIf { resetting }) { ok, err ->
                        if (ok) { toast(ctx, "Wallet PIN saved"); nav.popBackStack() } else error = err
                    }
                }
            }
        }
    }
}

@Composable
private fun PinField(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        shape = RoundedCornerShape(Radius.button),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = Color.White, unfocusedContainerColor = Color.White,
            focusedBorderColor = Purple, unfocusedBorderColor = Divider, cursorColor = Purple,
        ),
    )
}

/** The design's own keypad — the flow shows a custom pad, not the system IME. */
@Composable
private fun PinPad(
    title: String,
    subtitle: String,
    pin: String,
    error: String?,
    busy: Boolean,
    onBack: () -> Unit,
    footer: @Composable () -> Unit,
    onChange: (String) -> Unit,
) {
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header(title, onBack = onBack)
        Column(
            Modifier.weight(1f).padding(Space.l),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(Space.xl))
            Text(subtitle, color = TextGray, fontSize = 13.sp)
            Spacer(Modifier.height(Space.xl))
            Row(horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                repeat(4) { i ->
                    Box(
                        Modifier.size(18.dp).clip(RoundedCornerShape(Radius.pill))
                            .background(if (i < pin.length) Purple else Divider),
                    )
                }
            }
            Spacer(Modifier.height(Space.m))
            if (error != null) Text(error, color = RedCancel, fontSize = 12.sp, textAlign = TextAlign.Center)
            else if (busy) Text("Checking…", color = TextMuted, fontSize = 12.sp)
            Spacer(Modifier.height(Space.s))
            footer()
            Spacer(Modifier.height(Space.xl))
            listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("", "0", "<")).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                    row.forEach { key ->
                        Box(
                            Modifier.weight(1f).height(56.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .background(if (key.isBlank()) Color.Transparent else Color.White)
                                .clickable(enabled = key.isNotBlank() && !busy) {
                                    when (key) {
                                        "<" -> if (pin.isNotEmpty()) onChange(pin.dropLast(1))
                                        else -> if (pin.length < 4) onChange(pin + key)
                                    }
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            when (key) {
                                "" -> Unit
                                "<" -> Icon(Icons.Filled.Backspace, contentDescription = "Delete", tint = TextDark, modifier = Modifier.size(22.dp))
                                else -> Text(key, color = TextDark, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(Space.s))
            }
        }
    }
}

/* ── 3. CONFIRM WITHDRAWAL ─────────────────────────────────────────────────────────────── */

@Composable
fun ConfirmWithdrawalScreen(vm: AppViewModel, nav: NavHostController) {
    var error by remember { mutableStateOf<String?>(null) }
    val bank = vm.bankAccounts.firstOrNull { it.id == WithdrawDraft.bankId } ?: vm.defaultBank
    val amount = WithdrawDraft.amount

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Confirm Withdrawal", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            Text(
                rs(amount), color = TextDark, fontSize = 34.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
            )
            Card(padding = Dp16.S) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(38.dp).clip(RoundedCornerShape(10.dp)).background(Primary50),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.AccountBalance, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp)) }
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text("To", color = TextGray, fontSize = 11.sp)
                        Text(bank?.bankName ?: "—", color = TextDark, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                        Text(bank?.accountMasked ?: "", color = TextGray, fontSize = 12.sp)
                    }
                }
                Spacer(Modifier.height(Space.s))
                Box(Modifier.fillMaxWidth().height(1.dp).background(Divider))
                Spacer(Modifier.height(Space.s))
                SummaryRow("Amount", rs(amount))
                SummaryRow("Processing Fee", rs(0))
                SummaryRow("GST", rs(0))
                Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Text("You Will Receive", color = TextDark, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text(rs(amount), color = GreenSuccess, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
                SummaryRow("Expected Credit", "Within 30 minutes")
            }
            error?.let {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(RedLight).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) { Text(it, color = RedCancel, fontSize = 12.sp) }
            }
        }
        androidx.compose.material3.Surface(color = Color.White, shadowElevation = 12.dp) {
            Box(Modifier.padding(Space.l)) {
                PrimaryButton("Withdraw Now", enabled = !vm.walletBusy && amount > 0) {
                    vm.requestWithdrawalWithPin(amount, WithdrawDraft.pin, WithdrawDraft.bankId.takeIf { it > 0 }) { ok, err ->
                        if (ok) nav.navigate(Routes.WITHDRAW_SUCCESS) { popUpTo(Routes.WITHDRAW) { inclusive = true } }
                        else error = err
                    }
                }
            }
        }
    }
}

/* ── 4. WITHDRAWAL SUCCESS ─────────────────────────────────────────────────────────────── */

@Composable
fun WithdrawalSuccessScreen(vm: AppViewModel, nav: NavHostController) {
    val r = vm.lastWithdrawal
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(Space.xxxl))
            Box(
                Modifier.size(84.dp).clip(RoundedCornerShape(Radius.pill)).background(GreenLight),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(54.dp)) }
            Spacer(Modifier.height(Space.l))
            Text("Withdrawal Requested", color = TextDark, fontSize = 19.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            Text(rs(r?.walletSummaryAmount() ?: WithdrawDraft.amount), color = TextDark, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            Text(
                "Your withdrawal request is successfully placed.",
                color = TextGray, fontSize = 12.5.sp, textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(Space.xl))
            Card(padding = Dp16.S) {
                SummaryRow("Reference ID", r?.reference ?: "—")
                SummaryRow("Requested On", nowStamp())
                SummaryRow("To", r?.destination?.takeIf { it.isNotBlank() } ?: "—")
                SummaryRow("Status", r?.status ?: "—")
                SummaryRow("Expected Credit", r?.expectedCredit?.takeIf { it.isNotBlank() } ?: "—")
            }
        }
        androidx.compose.material3.Surface(color = Color.White, shadowElevation = 12.dp) {
            Column(Modifier.padding(Space.l)) {
                PrimaryButton("Done") {
                    WithdrawDraft.clear()
                    nav.navigate(Routes.WALLET) { popUpTo(Routes.WALLET) { inclusive = true } }
                }
                Spacer(Modifier.height(Space.s))
                Text(
                    "View Withdrawal History", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.fillMaxWidth().clickable {
                        WithdrawDraft.clear(); nav.navigate(Routes.WITHDRAW_HISTORY)
                    },
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

private fun com.homehelp.pro.network.WithdrawResult.walletSummaryAmount(): Int? = null
private fun nowStamp(): String =
    java.text.SimpleDateFormat("dd MMM yyyy, hh:mm a", java.util.Locale.getDefault()).format(java.util.Date())

/* ── 5. WITHDRAWAL HISTORY ─────────────────────────────────────────────────────────────── */

@Composable
fun WithdrawalHistoryScreen(vm: AppViewModel, nav: NavHostController) {
    var tab by remember { mutableStateOf("All") }
    LaunchedEffect(Unit) { vm.refreshWallet() }
    val tabs = listOf("All", "Completed", "Pending", "Failed")
    val rows = vm.withdrawals.filter {
        when (tab) {
            "Completed" -> it.status == "Paid"
            "Pending" -> it.status == "Pending" || it.status == "Processing"
            "Failed" -> it.status == "Failed" || it.status == "Rejected"
            else -> true
        }
    }
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Withdrawal History", onBack = { nav.popBackStack() })
        Box(Modifier.padding(Space.l)) { SegmentedTabs(tabs, tab) { tab = it } }
        if (rows.isEmpty()) {
            EmptyState("💸", "Nothing here yet", "Withdrawals you make will show up under this filter.")
        } else {
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.l).padding(bottom = Space.l),
                verticalArrangement = Arrangement.spacedBy(Space.s),
            ) {
                rows.forEach { w ->
                    val paid = w.status == "Paid"
                    val failed = w.status == "Failed" || w.status == "Rejected"
                    Card(padding = Dp16.S) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(w.reference.ifBlank { "WD${w.id}" }, color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                Text(w.date, color = TextGray, fontSize = 11.5.sp)
                                if (w.destination.isNotBlank()) Text(w.destination, color = TextMuted, fontSize = 11.sp)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(rs(w.amount), color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.height(4.dp))
                                StatusPill(
                                    w.status,
                                    if (paid) GreenLight else if (failed) RedLight else GoldLight,
                                    if (paid) GreenSuccess else if (failed) RedCancel else Amber,
                                )
                            }
                        }
                        if (failed) {
                            Spacer(Modifier.height(Space.s))
                            OutlineButton("Retry", modifier = Modifier.fillMaxWidth(), color = RedCancel) {
                                WithdrawDraft.amount = w.amount
                                nav.navigate(Routes.WITHDRAW)
                            }
                        }
                    }
                }
            }
        }
    }
}

/* ── BANK ACCOUNTS ─────────────────────────────────────────────────────────────────────── */

@Composable
fun BankAccountsScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var confirmDelete by remember { mutableStateOf<BankAccount?>(null) }
    LaunchedEffect(Unit) { vm.loadBankAccounts() }

    confirmDelete?.let { acct ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("Remove this account?", fontWeight = FontWeight.Bold) },
            text = { Text("${acct.bankName} ${acct.accountMasked} will be removed from your payout accounts.", color = TextGray, fontSize = 13.sp) },
            confirmButton = {
                TextButton(onClick = { vm.deleteBankAccount(acct.id); confirmDelete = null }) {
                    Text("Remove", color = RedCancel, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Cancel") } },
        )
    }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Bank Accounts", onBack = { nav.popBackStack() })
        vm.walletError?.let {
            Row(Modifier.fillMaxWidth().padding(horizontal = Space.l).padding(top = Space.s)) {
                Text(it, color = RedCancel, fontSize = 12.sp)
            }
        }
        if (vm.bankAccounts.isEmpty()) {
            EmptyState("🏦", "No payout accounts", "Add a bank account to receive your earnings.")
        } else {
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
                verticalArrangement = Arrangement.spacedBy(Space.s),
            ) {
                vm.bankAccounts.forEach { a -> BankCard(a, onDefault = { vm.makeBankDefault(a.id) }, onManage = {
                    SelectedBank.id = a.id; nav.navigate(Routes.BANK_MANAGE)
                }, onDelete = { confirmDelete = a }) }
            }
        }
        androidx.compose.material3.Surface(color = Color.White, shadowElevation = 12.dp) {
            Box(Modifier.padding(Space.l)) {
                PrimaryButton("+  Add New Bank Account") { nav.navigate(Routes.BANK_ADD) }
            }
        }
    }
}

/** Which account the Manage screen is editing — set on navigation. */
object SelectedBank { var id by mutableIntStateOf(0) }

@Composable
private fun BankCard(a: BankAccount, onDefault: () -> Unit, onManage: () -> Unit, onDelete: () -> Unit) {
    Card(padding = Dp16.S) {
        if (a.isDefault) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Star, contentDescription = null, tint = Gold, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text("Default Account", color = Purple, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(6.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(11.dp)).background(Primary50),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.AccountBalance, contentDescription = null, tint = Purple, modifier = Modifier.size(21.dp)) }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text(a.bankName.ifBlank { "Bank account" }, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text(a.accountMasked, color = TextGray, fontSize = 12.sp)
                Text(a.holder, color = TextMuted, fontSize = 11.sp)
            }
            StatusPill(
                if (a.verified) "Verified" else a.status,
                if (a.verified) GreenLight else GoldLight,
                if (a.verified) GreenSuccess else Amber,
            )
        }
        Spacer(Modifier.height(Space.s))
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (!a.isDefault) {
                Text(
                    "Make Default", color = if (a.verified) Purple else TextMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable(enabled = a.verified, onClick = onDefault),
                )
                Spacer(Modifier.width(Space.l))
            }
            Row(Modifier.clickable(onClick = onManage), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Edit, contentDescription = null, tint = Purple, modifier = Modifier.size(13.dp))
                Spacer(Modifier.width(3.dp))
                Text("Manage", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.weight(1f))
            Row(Modifier.clickable(onClick = onDelete), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Delete, contentDescription = null, tint = RedCancel, modifier = Modifier.size(13.dp))
                Spacer(Modifier.width(3.dp))
                Text("Delete", color = RedCancel, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

/* ── ADD BANK ACCOUNT ──────────────────────────────────────────────────────────────────── */

@Composable
fun AddBankAccountScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var holder by remember { mutableStateOf(vm.workerName) }
    var bankName by remember { mutableStateOf("") }
    var account by remember { mutableStateOf("") }
    var ifsc by remember { mutableStateOf("") }
    var upi by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("Savings") }
    var lookedUp by remember { mutableStateOf<String?>(null) }
    var submitted by remember { mutableStateOf(false) }

    // The server resolves the branch from the IFSC when saving; this runs the same lookup live so
    // the worker can confirm the bank BEFORE saving. lookupIfsc publishes to vm.ifscBank/bankBranch
    // rather than taking a callback.
    LaunchedEffect(ifsc) { if (ifsc.length == 11) vm.lookupIfsc(ifsc) }
    LaunchedEffect(vm.ifscBank, vm.bankBranch) {
        if (vm.ifscBank.isNotBlank()) {
            if (bankName.isBlank()) bankName = vm.ifscBank
            lookedUp = listOf(vm.ifscBank, vm.bankBranch).filter { it.isNotBlank() }.joinToString("\n")
        } else {
            lookedUp = null
        }
    }
    // Leave once the account lands in the list.
    LaunchedEffect(vm.bankAccounts.size) { if (submitted && !vm.walletBusy) nav.popBackStack() }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Add Bank Account", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            BankField("Full Name", holder) { holder = it }
            BankField("Bank Name", bankName) { bankName = it }
            BankField("Account Number", account, KeyboardType.Number) { account = it.filter { c -> c.isDigit() }.take(18) }
            BankField("IFSC Code", ifsc) { ifsc = it.uppercase().take(11) }
            lookedUp?.let {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(GreenLight).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(Space.s))
                    Column {
                        Text("IFSC found", color = GreenSuccess, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Text(it, color = TextGray, fontSize = 11.5.sp, lineHeight = 14.sp)
                    }
                }
            }
            BankField("UPI ID (optional)", upi) { upi = it }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                listOf("Savings", "Current").forEach { t ->
                    QuickAmount(Modifier.weight(1f), t, type == t) { type = t }
                }
            }
            vm.walletError?.let { Text(it, color = RedCancel, fontSize = 12.sp) }
            Text(
                "New accounts are verified before they can receive payouts.",
                color = TextMuted, fontSize = 11.sp,
            )
        }
        androidx.compose.material3.Surface(color = Color.White, shadowElevation = 12.dp) {
            Box(Modifier.padding(Space.l)) {
                PrimaryButton(
                    "Save Account",
                    enabled = account.length >= 8 && ifsc.length == 11 && holder.isNotBlank() && !vm.walletBusy,
                ) {
                    submitted = true
                    vm.addBankAccount(holder.trim(), bankName.trim(), account.trim(), ifsc.trim(), upi.trim(), type)
                }
            }
        }
    }
}

@Composable
private fun BankField(label: String, value: String, kb: KeyboardType = KeyboardType.Text, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        shape = RoundedCornerShape(Radius.button),
        keyboardOptions = KeyboardOptions(keyboardType = kb),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = Color.White, unfocusedContainerColor = Color.White,
            focusedBorderColor = Purple, unfocusedBorderColor = Divider, cursorColor = Purple,
        ),
    )
}

/* ── MANAGE ACCOUNT ────────────────────────────────────────────────────────────────────── */

@Composable
fun ManageBankAccountScreen(vm: AppViewModel, nav: NavHostController) {
    val a = vm.bankAccounts.firstOrNull { it.id == SelectedBank.id }
    var holder by remember(a?.id) { mutableStateOf(a?.holder ?: "") }
    var bankName by remember(a?.id) { mutableStateOf(a?.bankName ?: "") }
    var upi by remember(a?.id) { mutableStateOf(a?.upi ?: "") }
    var type by remember(a?.id) { mutableStateOf(a?.accountType ?: "Savings") }
    var confirmRemove by remember { mutableStateOf(false) }

    if (a == null) {
        Column(Modifier.fillMaxSize().background(ScreenBg)) {
            Header("Manage Account", onBack = { nav.popBackStack() })
            EmptyState("🏦", "Account not found", "It may have been removed.")
        }
        return
    }

    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text("Remove this account?", fontWeight = FontWeight.Bold) },
            text = { Text("${a.bankName} ${a.accountMasked} will no longer receive payouts.", color = TextGray, fontSize = 13.sp) },
            confirmButton = {
                TextButton(onClick = { vm.deleteBankAccount(a.id); confirmRemove = false; nav.popBackStack() }) {
                    Text("Remove", color = RedCancel, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text("Cancel") } },
        )
    }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Manage Account", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            BankField("Account Holder Name", holder) { holder = it }
            BankField("Bank Name", bankName) { bankName = it }
            // The number and IFSC identify the account — changing them would be a different
            // account, so they're shown read-only. Remove and re-add instead.
            ReadOnlyRow("Account Number", a.accountMasked)
            ReadOnlyRow("IFSC Code", a.ifsc)
            if (a.branch.isNotBlank()) ReadOnlyRow("Branch", a.branch)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                listOf("Savings", "Current").forEach { t -> QuickAmount(Modifier.weight(1f), t, type == t) { type = t } }
            }
            BankField("UPI ID", upi) { upi = it }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Status", color = TextGray, fontSize = 12.sp, modifier = Modifier.weight(1f))
                StatusPill(
                    if (a.verified) "Verified" else a.status,
                    if (a.verified) GreenLight else GoldLight,
                    if (a.verified) GreenSuccess else Amber,
                )
            }
        }
        androidx.compose.material3.Surface(color = Color.White, shadowElevation = 12.dp) {
            Column(Modifier.padding(Space.l), verticalArrangement = Arrangement.spacedBy(Space.s)) {
                PrimaryButton("Save Changes", enabled = !vm.walletBusy) {
                    vm.updateBankAccount(a.id, holder.trim(), bankName.trim(), upi.trim(), type)
                    nav.popBackStack()
                }
                if (!a.isDefault) {
                    OutlineButton("Make Default", modifier = Modifier.fillMaxWidth()) { vm.makeBankDefault(a.id) }
                }
                OutlineButton("Remove Account", modifier = Modifier.fillMaxWidth(), color = RedCancel) { confirmRemove = true }
            }
        }
    }
}

@Composable
private fun ReadOnlyRow(label: String, value: String) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.button)).background(FieldFill).padding(12.dp)) {
        Text(label, color = TextMuted, fontSize = 11.sp)
        Spacer(Modifier.height(2.dp))
        Text(value, color = TextDark, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

/* ── PAYOUT SETTINGS ───────────────────────────────────────────────────────────────────── */

@Composable
fun PayoutSettingsScreen(vm: AppViewModel, nav: NavHostController) {
    LaunchedEffect(Unit) { vm.loadPayoutSettings(); vm.loadBankAccounts() }
    val s = vm.payoutSettings
    fun save(next: PayoutSettingsDto) = vm.savePayoutSettings(next)

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Settlement Settings", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            Card(padding = Dp16.S) {
                // Daily and weekly are one choice: the server refuses to honour both, because
                // settling twice would pay the same earnings out twice.
                ToggleRow("Daily Settlement", "Settle earnings daily to bank", s.dailySettlement) {
                    save(s.copy(dailySettlement = it, weeklySettlement = if (it) false else s.weeklySettlement))
                }
                Spacer(Modifier.height(Space.s))
                ToggleRow("Weekly Settlement", "Settle earnings once a week", s.weeklySettlement) {
                    save(s.copy(weeklySettlement = it, dailySettlement = if (it) false else s.dailySettlement))
                }
            }
            Card(padding = Dp16.S) {
                Text("Minimum Payout Amount", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.s))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    listOf(200, 500, 1000).forEach { v ->
                        QuickAmount(Modifier.weight(1f), rs(v), s.minPayout == v) { save(s.copy(minPayout = v)) }
                    }
                }
                Spacer(Modifier.height(Space.m))
                Text("Settlement Time", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.s))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    listOf("07:00 AM", "12:00 PM", "06:00 PM").forEach { t ->
                        QuickAmount(Modifier.weight(1f), t, s.settlementTime == t) { save(s.copy(settlementTime = t)) }
                    }
                }
            }
            Card(padding = Dp16.S) {
                ToggleRow("Auto Withdraw", "Automatically withdraw on settlement", s.autoWithdraw) { save(s.copy(autoWithdraw = it)) }
                Spacer(Modifier.height(Space.s))
                ToggleRow("SMS Notification", "Get SMS on settlement & withdrawal", s.smsNotify) { save(s.copy(smsNotify = it)) }
                Spacer(Modifier.height(Space.s))
                ToggleRow("Email Notification", "Get email on settlement & withdrawal", s.emailNotify) { save(s.copy(emailNotify = it)) }
            }
            if (vm.bankAccounts.none { it.verified }) {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(GoldLight).padding(10.dp),
                ) {
                    Text(
                        "Auto-withdraw needs a verified payout account before it can run.",
                        color = TextDark, fontSize = 11.5.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun ToggleRow(title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = TextGray, fontSize = 11.sp)
        }
        Switch(
            checked = checked, onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = Purple),
        )
    }
}

/* ── PAYOUT SCHEDULE ───────────────────────────────────────────────────────────────────── */

@Composable
fun PayoutScheduleScreen(vm: AppViewModel, nav: NavHostController) {
    LaunchedEffect(Unit) { vm.loadPayoutSettings(); vm.loadBankAccounts(); vm.loadWalletAnalytics() }
    val s = vm.payoutSettings
    val bank = vm.defaultBank

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Payout Schedule", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Primary50).padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("📅", fontSize = 26.sp)
                Spacer(Modifier.width(Space.m))
                Column {
                    Text("Next Settlement", color = TextGray, fontSize = 11.5.sp)
                    Text(nextSettlementLabel(s), color = Purple, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Text(s.settlementTime, color = TextDark, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                }
            }
            Card(padding = Dp16.S) {
                Text("Payout Schedule", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.s))
                SummaryRow("Frequency", if (s.weeklySettlement) "Weekly" else if (s.dailySettlement) "Daily" else "Manual")
                SummaryRow("Settlement Time", s.settlementTime)
                SummaryRow("Minimum Payout", rs(s.minPayout))
                SummaryRow("Auto Withdraw", if (s.autoWithdraw) "Enabled" else "Disabled")
                SummaryRow("Preferred Account", bank?.let { "${it.bankName} ${it.accountMasked}" } ?: "Not set")
            }
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Primary50).padding(11.dp)) {
                Text(
                    if (s.autoWithdraw)
                        "Your earnings are automatically transferred to your bank account as per this schedule."
                    else "Settlement moves earnings into your wallet on this schedule. Withdraw them yourself, or turn on Auto Withdraw.",
                    color = TextGray, fontSize = 11.5.sp, lineHeight = 15.sp,
                )
            }
            OutlineButton("Change Payout Settings", modifier = Modifier.fillMaxWidth()) { nav.navigate(Routes.PAYOUT_SETTINGS) }
        }
    }
}

private fun nextSettlementLabel(s: PayoutSettingsDto): String {
    if (!s.dailySettlement && !s.weeklySettlement) return "Manual — no automatic settlement"
    val cal = java.util.Calendar.getInstance()
    cal.add(java.util.Calendar.DAY_OF_YEAR, if (s.weeklySettlement) 7 else 1)
    return java.text.SimpleDateFormat("EEEE, dd MMM yyyy", java.util.Locale.getDefault()).format(cal.time)
}

/* ── WALLET HELP & SUPPORT ─────────────────────────────────────────────────────────────── */

private val WALLET_FAQS = listOf(
    "How does the wallet work?" to "Completed jobs credit your wallet after the customer confirms. Settled earnings become Available and can be withdrawn to a verified bank account.",
    "How do I add a bank account?" to "Wallet → Bank Accounts → Add New Bank Account. Enter your account number and IFSC; the branch is looked up for you. Accounts are verified before they can receive payouts.",
    "How do I withdraw money?" to "Wallet → Withdraw Money. Pick the account, enter an amount above your minimum payout, then confirm with your 4-digit wallet PIN.",
    "Withdrawal timing & charges" to "Auto-approved withdrawals are sent for payout immediately and usually credit within 30 minutes. There is no processing fee or GST on withdrawals.",
    "Settlement & payout details" to "Settlement runs at the time you choose in Payout Settings — daily or weekly, never both. Amounts below your minimum payout roll over to the next run.",
    "Failed withdrawal — what to do?" to "The money is returned to your wallet balance automatically. Check your account details are correct, then retry from Withdrawal History.",
)

@Composable
fun WalletHelpScreen(vm: AppViewModel, nav: NavHostController) {
    var open by remember { mutableIntStateOf(-1) }
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Help & Support", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.s),
        ) {
            WALLET_FAQS.forEachIndexed { i, (q, a) ->
                Card(padding = Dp16.S) {
                    Row(
                        Modifier.fillMaxWidth().clickable { open = if (open == i) -1 else i },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(q, color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(16.dp))
                    }
                    if (open == i) {
                        Spacer(Modifier.height(6.dp))
                        Text(a, color = TextGray, fontSize = 12.sp, lineHeight = 16.sp)
                    }
                }
            }
            Card(padding = Dp16.S) {
                Text("Need more help?", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Text("Our support team is here for you.", color = TextGray, fontSize = 12.sp)
                Spacer(Modifier.height(Space.s))
                PrimaryButton("Contact Support") { nav.navigate(Routes.P_HELP) }
            }
        }
    }
}
