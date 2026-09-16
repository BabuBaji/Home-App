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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.navigation.NavHostController
import coil.compose.SubcomposeAsyncImage
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

/**
 * Clean white top bar for the wallet flow — back arrow + title on a white surface with a hairline
 * divider, as the reference draws it (not the app's dark gradient Header). Signature matches
 * Header(title, onBack, trailing) so screens read the same.
 */
@Composable
private fun WalletTopBar(title: String, onBack: (() -> Unit)? = null, trailing: (@Composable () -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().background(Color.White).statusBarsPaddingCompat()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.s, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                Box(
                    Modifier.size(40.dp).clip(RoundedCornerShape(Radius.pill)).clickable(onClick = onBack),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = TextDark, modifier = Modifier.size(22.dp)) }
            } else {
                Spacer(Modifier.width(Space.s))
            }
            Text(
                title, color = TextDark, fontSize = 19.sp, fontWeight = FontWeight.Bold,
                letterSpacing = (-0.2).sp, modifier = Modifier.weight(1f).padding(start = 4.dp),
            )
            trailing?.invoke()
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Divider))
    }
}

/** The screen already sits below the system status bar in this app, so no extra inset is needed. */
private fun Modifier.statusBarsPaddingCompat(): Modifier = this

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
        WalletTopBar("Withdraw Earnings", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // Balance — with the wallet-icon tile top-right, as the reference draws it.
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(EarningsGradient).padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Available Balance", color = Color.White.copy(alpha = 0.9f), fontSize = 13.5.sp)
                    Spacer(Modifier.height(3.dp))
                    Text(rs(vm.walletBalance), color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp)
                }
                Box(
                    Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.18f)),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.AccountBalanceWallet, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp)) }
            }

            // Destination
            Text("Select Bank Account", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            if (vm.bankAccounts.isEmpty()) {
                Card(padding = Dp16.S) {
                    Text("No payout account yet", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(3.dp))
                    Text("Add a bank account to withdraw your earnings.", color = TextGray, fontSize = 13.5.sp)
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
                        Text(bank.bankName.ifBlank { "Bank account" }, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        Text(bank.accountMasked, color = TextGray, fontSize = 13.5.sp)
                        if (!bank.verified) Text("Verification pending", color = Amber, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                    }
                    Text(
                        "Change", color = Purple, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.clickable { nav.navigate(Routes.BANK_ACCOUNTS) },
                    )
                }
            }

            // Amount
            Text("Enter Amount", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
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
                tooHigh -> Text("That's more than your available balance.", color = RedCancel, fontSize = 13.sp)
                tooLow -> Text("Minimum withdrawal is ${rs(min)}.", color = RedCancel, fontSize = 13.sp)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                listOf(500, 1000, 1500).forEach { q ->
                    QuickAmount(Modifier.weight(1f), rs(q), amountText == q.toString()) { amountText = q.toString() }
                }
                QuickAmount(Modifier.weight(1f), "MAX", amountText == vm.walletBalance.toString()) { amountText = vm.walletBalance.toString() }
            }

            // Summary — fees are ₹0 today; shown so the worker sees exactly what lands.
            Card(padding = Dp16.S) {
                Text("Withdrawal Summary", color = Purple, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.s))
                SummaryRow("Withdrawal Amount", rs(amount))
                SummaryRow("Processing Fee", rs(0))
                SummaryRow("GST (0%)", rs(0))
                Spacer(Modifier.height(4.dp))
                Box(Modifier.fillMaxWidth().height(1.dp).background(Divider))
                Spacer(Modifier.height(6.dp))
                Row {
                    Text("Amount You Will Receive", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
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
                    color = TextMuted, fontSize = 12.5.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
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
    ) { Text(label, color = if (on) Color.White else Purple, fontSize = 13.5.sp, fontWeight = FontWeight.Bold) }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Text(label, color = TextGray, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
        Text(value, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
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
                "Forgot PIN?", color = Purple, fontSize = 14.sp, fontWeight = FontWeight.Bold,
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
        WalletTopBar(if (resetting) "Reset Wallet PIN" else "Set Wallet PIN", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            Card(padding = Dp16.S) {
                Text(
                    if (resetting) "Enter the OTP sent to your phone, then choose a new 4-digit PIN."
                    else "Choose a 4-digit PIN. You'll enter it every time you withdraw.",
                    color = TextGray, fontSize = 14.sp,
                )
            }
            if (resetting) {
                PinField("OTP", otp) { otp = it.filter { c -> c.isDigit() }.take(4) }
                Text(
                    "Tap to send the OTP", color = Purple, fontSize = 13.5.sp, fontWeight = FontWeight.Bold,
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
            error?.let { Text(it, color = RedCancel, fontSize = 13.5.sp) }
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
        // Header carries only the back arrow and a help chip — the title is a body heading below,
        // as the reference draws it.
        WalletTopBar("", onBack = onBack, trailing = {
            Box(
                Modifier.size(36.dp).clip(RoundedCornerShape(Radius.pill)).background(Primary50),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.AutoMirrored.Filled.HelpOutline, contentDescription = "Help", tint = Purple, modifier = Modifier.size(19.dp)) }
        })
        Column(
            Modifier.weight(1f).padding(Space.l),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(Space.xxl))
            Text(title, color = TextDark, fontSize = 22.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Spacer(Modifier.height(Space.s))
            Text(subtitle, color = TextGray, fontSize = 14.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(Space.xl))
            Row(horizontalArrangement = Arrangement.spacedBy(Space.l)) {
                repeat(4) { i ->
                    Box(
                        Modifier.size(16.dp).clip(RoundedCornerShape(Radius.pill))
                            .background(if (i < pin.length) Purple else Divider),
                    )
                }
            }
            Spacer(Modifier.height(Space.m))
            if (error != null) Text(error, color = RedCancel, fontSize = 13.5.sp, textAlign = TextAlign.Center)
            else if (busy) Text("Checking…", color = TextMuted, fontSize = 13.5.sp)
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
                                "<" -> Icon(Icons.AutoMirrored.Filled.Backspace, contentDescription = "Delete", tint = TextDark, modifier = Modifier.size(22.dp))
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
    // Ensure accounts are present even on a cold entry, so "To" always resolves to the destination.
    LaunchedEffect(Unit) { if (vm.bankAccounts.isEmpty()) vm.loadBankAccounts() }
    val bank = vm.bankAccounts.firstOrNull { it.id == WithdrawDraft.bankId } ?: vm.defaultBank
    val amount = WithdrawDraft.amount

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        WalletTopBar("Confirm Withdrawal", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.l),
        ) {
            Spacer(Modifier.height(Space.s))
            Text(
                rs(amount), color = TextDark, fontSize = 42.sp, fontWeight = FontWeight.Bold,
                letterSpacing = (-0.5).sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
            )
            Card(padding = Dp16.M) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(48.dp).clip(RoundedCornerShape(13.dp)).background(Primary50),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.AccountBalance, contentDescription = null, tint = Purple, modifier = Modifier.size(26.dp)) }
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text("To", color = TextGray, fontSize = 14.sp)
                        Spacer(Modifier.height(2.dp))
                        Text(bank?.bankName ?: "—", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Text(bank?.accountMasked ?: "", color = TextGray, fontSize = 14.sp)
                    }
                }
                Spacer(Modifier.height(Space.l))
                Box(Modifier.fillMaxWidth().height(1.dp).background(Divider))
                Spacer(Modifier.height(Space.m))
                ConfirmRow("Amount", rs(amount))
                ConfirmRow("Processing Fee", rs(0))
                ConfirmRow("GST", rs(0))
                Spacer(Modifier.height(Space.s))
                Box(Modifier.fillMaxWidth().height(1.dp).background(Divider))
                Spacer(Modifier.height(Space.s))
                Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("You Will Receive", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text(rs(amount), color = GreenSuccess, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                }
                ConfirmRow("Expected Credit", "Within 30 minutes")
            }
            error?.let {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(RedLight).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) { Text(it, color = RedCancel, fontSize = 13.5.sp) }
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

/** Roomier summary row for the Confirm screen — larger type and generous vertical spacing. */
@Composable
private fun ConfirmRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = TextGray, fontSize = 14.5.sp, modifier = Modifier.weight(1f))
        Text(value, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
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
            Text(rs(WithdrawDraft.amount), color = TextDark, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            Text(
                "Your withdrawal request is successfully placed.",
                color = TextGray, fontSize = 14.sp, textAlign = TextAlign.Center,
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
                    "View Withdrawal History", color = Purple, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.fillMaxWidth().clickable {
                        WithdrawDraft.clear(); nav.navigate(Routes.WITHDRAW_HISTORY)
                    },
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

/** Maps the ledger status to the label the design shows ("Paid" → "Completed"). */
private fun displayStatus(s: String): String = when (s) {
    "Paid" -> "Completed"
    "Processing" -> "Processing"
    "Pending" -> "Pending"
    "Failed", "Rejected" -> "Failed"
    else -> s
}
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
        WalletTopBar("Withdrawal History", onBack = { nav.popBackStack() })
        Box(Modifier.padding(Space.l)) { SegmentedTabs(tabs, tab) { tab = it } }
        if (rows.isEmpty()) {
            EmptyState("💸", "Nothing here yet", "Withdrawals you make will show up under this filter.")
        } else {
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.l).padding(bottom = Space.l),
                verticalArrangement = Arrangement.spacedBy(Space.s),
            ) {
                rows.forEach { w ->
                    val failed = w.status == "Failed" || w.status == "Rejected"
                    val accent = if (failed) RedCancel else GreenSuccess
                    val accentBg = if (failed) RedLight else GreenLight
                    Card(padding = Dp16.S) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            // Directional badge, as the design draws it: money-out shows a down
                            // arrow (green when settled), a failed transfer an up arrow (red).
                            Box(
                                Modifier.size(38.dp).clip(RoundedCornerShape(Radius.pill)).background(accentBg),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    if (failed) Icons.Filled.ArrowUpward else Icons.Filled.ArrowDownward,
                                    contentDescription = null, tint = accent, modifier = Modifier.size(20.dp),
                                )
                            }
                            Spacer(Modifier.width(Space.m))
                            Column(Modifier.weight(1f)) {
                                Text(w.reference.ifBlank { "WD${w.id}" }, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                Text(w.date, color = TextGray, fontSize = 13.sp)
                                if (w.destination.isNotBlank()) Text(w.destination, color = TextMuted, fontSize = 12.5.sp)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(rs(w.amount), color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.height(3.dp))
                                Text(
                                    displayStatus(w.status), color = accent, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                                )
                                if (failed) {
                                    Spacer(Modifier.height(4.dp))
                                    Box(
                                        Modifier.clip(RoundedCornerShape(Radius.pill)).background(RedLight)
                                            .clickable { WithdrawDraft.amount = w.amount; nav.navigate(Routes.WITHDRAW) }
                                            .padding(horizontal = 12.dp, vertical = 4.dp),
                                    ) { Text("Retry", color = RedCancel, fontSize = 12.5.sp, fontWeight = FontWeight.Bold) }
                                }
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
    var confirmDelete by remember { mutableStateOf<BankAccount?>(null) }
    LaunchedEffect(Unit) { vm.loadBankAccounts(); vm.loadDocumentTypes() }

    confirmDelete?.let { acct ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("Remove this account?", fontWeight = FontWeight.Bold) },
            text = { Text("${acct.bankName} ${acct.accountMasked} will be removed from your payout accounts.", color = TextGray, fontSize = 14.sp) },
            confirmButton = {
                TextButton(onClick = { vm.deleteBankAccount(acct.id); confirmDelete = null }) {
                    Text("Remove", color = RedCancel, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Cancel") } },
        )
    }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        WalletTopBar("Bank Accounts", onBack = { nav.popBackStack() })
        vm.walletError?.let {
            Row(Modifier.fillMaxWidth().padding(horizontal = Space.l).padding(top = Space.s)) {
                Text(it, color = RedCancel, fontSize = 13.5.sp)
            }
        }
        // KYC status pinned at the top — stays until verification completes.
        Box(Modifier.padding(horizontal = Space.l).padding(top = Space.m)) { KycStatusBanner(vm) }
        if (vm.bankAccounts.isEmpty()) {
            EmptyState("🏦", "No payout accounts", "Add a bank account to receive your earnings.")
        } else {
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
                verticalArrangement = Arrangement.spacedBy(Space.m),
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
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(18.dp))) {
        // ── Gradient card face (looks like a real payment card) ──
        Box(
            Modifier.fillMaxWidth()
                .background(Brush.linearGradient(listOf(Color(0xFF6D4AFF), Color(0xFF9D7BFF))))
                .padding(16.dp),
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(Color.White.copy(alpha = 0.22f)),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.AccountBalance, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp)) }
                    Spacer(Modifier.width(Space.m))
                    Text(a.bankName.ifBlank { "Bank Account" }, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), maxLines = 1)
                    if (a.verified) {
                        Row(
                            Modifier.clip(RoundedCornerShape(20.dp)).background(Color.White.copy(alpha = 0.22f)).padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
                            Spacer(Modifier.width(3.dp))
                            Text("Verified", color = Color.White, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                        }
                    } else {
                        Box(Modifier.clip(RoundedCornerShape(20.dp)).background(Color.White.copy(alpha = 0.22f)).padding(horizontal = 8.dp, vertical = 4.dp)) {
                            Text(a.status, color = Color.White, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                Spacer(Modifier.height(18.dp))
                // Masked account number, spaced like a card PAN.
                Text(
                    a.accountMasked.ifBlank { "•••• •••• ••••" }, color = Color.White,
                    fontSize = 18.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp,
                )
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("ACCOUNT HOLDER", color = Color.White.copy(alpha = 0.7f), fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                        Text(a.holder.ifBlank { "—" }, color = Color.White, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    }
                    if (a.isDefault) {
                        Row(
                            Modifier.clip(RoundedCornerShape(20.dp)).background(Color.White).padding(horizontal = 9.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Filled.Star, contentDescription = null, tint = Gold, modifier = Modifier.size(12.dp))
                            Spacer(Modifier.width(3.dp))
                            Text("Default", color = Purple, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
        // ── Action bar under the card face ──
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
            if (!a.isDefault) {
                Row(
                    Modifier.clickable(enabled = a.verified, onClick = onDefault), verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Star, contentDescription = null, tint = if (a.verified) Gold else TextMuted, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Make Default", color = if (a.verified) Purple else TextMuted, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.width(Space.l))
            }
            Row(Modifier.clickable(onClick = onManage), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Edit, contentDescription = null, tint = Purple, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text("Manage", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.weight(1f))
            Row(Modifier.clickable(onClick = onDelete), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Delete, contentDescription = null, tint = RedCancel, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text("Delete", color = RedCancel, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

/** KYC status banner — green "Verified" once every required document is approved, otherwise an
 *  amber "Complete your KYC" reminder that stays until it completes. Shared by the bank screens. */
@Composable
private fun KycStatusBanner(vm: AppViewModel) {
    val requiredDocs = vm.documents.filter { vm.documentRequired[it.name] != false }
    val kycDone = requiredDocs.isNotEmpty() &&
        requiredDocs.all { it.status.equals("Verified", true) || it.status.equals("Approved", true) }
    if (kycDone) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(GreenLight).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(38.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text("KYC Verified", color = GreenSuccess, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Text("Your identity documents are approved.", color = TextGray, fontSize = 12.5.sp, lineHeight = 16.sp)
            }
        }
    } else {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(GoldLight).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(38.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Info, contentDescription = null, tint = Amber, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text("Complete your KYC", color = Amber, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Text("Verify your documents to start receiving payouts.", color = TextGray, fontSize = 12.5.sp, lineHeight = 16.sp)
            }
        }
    }
}

/* ── ADD BANK ACCOUNT ──────────────────────────────────────────────────────────────────── */

@Composable
fun AddBankAccountScreen(vm: AppViewModel, nav: NavHostController) {
    var holder by remember { mutableStateOf(vm.workerName) }
    var bankName by remember { mutableStateOf("") }
    var account by remember { mutableStateOf("") }
    var confirmAccount by remember { mutableStateOf("") }
    var ifsc by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("Savings") }
    var lookedUp by remember { mutableStateOf<String?>(null) }
    var submitted by remember { mutableStateOf(false) }
    val accountsMismatch = confirmAccount.isNotBlank() && account != confirmAccount

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
    // Pull the document set so the KYC banner reflects real verification status.
    LaunchedEffect(Unit) { vm.loadDocumentTypes() }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        WalletTopBar("Add Bank Account", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            KycStatusBanner(vm)
            BankField("Full Name", holder) { holder = it }
            // Bank Name — searchable dropdown over the full bank list, as requested.
            BankNamePicker(bankName) { bankName = it }
            BankField("Account Number", account, KeyboardType.Number) { account = it.filter { c -> c.isDigit() }.take(18) }
            // Re-enter to catch typos before the account is saved.
            BankField("Confirm Account Number", confirmAccount, KeyboardType.Number, isError = accountsMismatch) {
                confirmAccount = it.filter { c -> c.isDigit() }.take(18)
            }
            if (accountsMismatch) Text("Account numbers don't match.", color = RedCancel, fontSize = 13.sp)
            BankField("IFSC Code", ifsc) { ifsc = it.uppercase().take(11) }
            lookedUp?.let {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(GreenLight).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(Space.s))
                    Column {
                        Text("IFSC found", color = GreenSuccess, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                        Text(it, color = TextGray, fontSize = 13.sp, lineHeight = 14.sp)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                listOf("Savings", "Current").forEach { t ->
                    QuickAmount(Modifier.weight(1f), t, type == t) { type = t }
                }
            }
            vm.walletError?.let { Text(it, color = RedCancel, fontSize = 13.5.sp) }
            Text(
                "New accounts are verified before they can receive payouts.",
                color = TextMuted, fontSize = 12.5.sp,
            )
        }
        androidx.compose.material3.Surface(color = Color.White, shadowElevation = 12.dp) {
            Box(Modifier.padding(Space.l)) {
                PrimaryButton(
                    "Save Account",
                    enabled = account.length >= 8 && account == confirmAccount && ifsc.length == 11 && holder.isNotBlank() && !vm.walletBusy,
                ) {
                    submitted = true
                    vm.addBankAccount(holder.trim(), bankName.trim(), account.trim(), ifsc.trim(), "", type)
                }
            }
        }
    }
}

/** Major Indian banks — the source list for the searchable Bank Name picker. */
private val INDIAN_BANKS = listOf(
    "State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank",
    "Bank of Baroda", "Punjab National Bank", "Canara Bank", "Union Bank of India", "Bank of India",
    "Indian Bank", "Central Bank of India", "Indian Overseas Bank", "UCO Bank", "Bank of Maharashtra",
    "Punjab & Sind Bank", "IDBI Bank", "IDFC FIRST Bank", "Yes Bank", "IndusInd Bank",
    "Federal Bank", "South Indian Bank", "Karur Vysya Bank", "City Union Bank", "RBL Bank",
    "Bandhan Bank", "DCB Bank", "Dhanlaxmi Bank", "Karnataka Bank", "Tamilnad Mercantile Bank",
    "Jammu & Kashmir Bank", "CSB Bank", "Nainital Bank", "AU Small Finance Bank", "Equitas Small Finance Bank",
    "Ujjivan Small Finance Bank", "Jana Small Finance Bank", "Suryoday Small Finance Bank", "ESAF Small Finance Bank",
    "Utkarsh Small Finance Bank", "Fincare Small Finance Bank", "North East Small Finance Bank",
    "Paytm Payments Bank", "Airtel Payments Bank", "India Post Payments Bank", "Fino Payments Bank",
    "Saraswat Co-operative Bank", "Cosmos Co-operative Bank", "SVC Co-operative Bank",
    "Standard Chartered Bank", "HSBC Bank", "Citibank", "Deutsche Bank", "DBS Bank India",
)

// Short acronym shown on a bank's logo tile where the natural initials don't read well.
private val BANK_MONOGRAM = mapOf(
    "State Bank of India" to "SBI", "HDFC Bank" to "HDFC", "ICICI Bank" to "ICICI", "Axis Bank" to "AXIS",
    "Kotak Mahindra Bank" to "KMB", "Bank of Baroda" to "BOB", "Punjab National Bank" to "PNB",
    "Union Bank of India" to "UBI", "Bank of India" to "BOI", "Central Bank of India" to "CBI",
    "Indian Overseas Bank" to "IOB", "Bank of Maharashtra" to "BOM", "Punjab & Sind Bank" to "PSB",
    "IDBI Bank" to "IDBI", "IDFC FIRST Bank" to "IDFC", "Yes Bank" to "YES", "RBL Bank" to "RBL",
    "UCO Bank" to "UCO", "DCB Bank" to "DCB", "CSB Bank" to "CSB", "AU Small Finance Bank" to "AU",
    "Standard Chartered Bank" to "SC", "HSBC Bank" to "HSBC", "DBS Bank India" to "DBS",
    "India Post Payments Bank" to "IPPB", "Paytm Payments Bank" to "PPB", "Airtel Payments Bank" to "APB",
)

// Brand-ish tint per bank; unknown banks fall back to a stable colour picked from the palette.
private val BANK_BRAND = mapOf(
    "State Bank of India" to Color(0xFF22409A), "HDFC Bank" to Color(0xFF004C8F), "ICICI Bank" to Color(0xFFB02A30),
    "Axis Bank" to Color(0xFF97144D), "Kotak Mahindra Bank" to Color(0xFFE5202E), "Bank of Baroda" to Color(0xFFF15A22),
    "Punjab National Bank" to Color(0xFF4B2E83), "Canara Bank" to Color(0xFF00539F), "Union Bank of India" to Color(0xFFC8102E),
    "IDBI Bank" to Color(0xFF006A4D), "IDFC FIRST Bank" to Color(0xFF9C1D26), "Yes Bank" to Color(0xFF003399),
    "Federal Bank" to Color(0xFF00539F), "Bandhan Bank" to Color(0xFFE4002B), "AU Small Finance Bank" to Color(0xFF6A2C91),
    "HSBC Bank" to Color(0xFFDB0011), "Citibank" to Color(0xFF003B70), "DBS Bank India" to Color(0xFFDA2129),
    "Standard Chartered Bank" to Color(0xFF0072CE),
)

private val BANK_PALETTE = listOf(
    Color(0xFF22409A), Color(0xFF00539F), Color(0xFFB02A30), Color(0xFF97144D),
    Color(0xFFF15A22), Color(0xFF006A4D), Color(0xFF4B2E83), Color(0xFF98232B),
)

// Primary domain per bank — the real logo is fetched from a logo CDN keyed by this.
private val BANK_DOMAIN = mapOf(
    "State Bank of India" to "sbi.bank", "HDFC Bank" to "hdfcbank.com", "ICICI Bank" to "icicibank.com",
    "Axis Bank" to "axisbank.com", "Kotak Mahindra Bank" to "kotak.com", "Bank of Baroda" to "bankofbaroda.in",
    "Punjab National Bank" to "pnbindia.in", "Canara Bank" to "canarabank.com", "Union Bank of India" to "unionbankofindia.co.in",
    "Bank of India" to "bankofindia.co.in", "Indian Bank" to "indianbank.in", "Central Bank of India" to "centralbankofindia.co.in",
    "Indian Overseas Bank" to "iob.in", "UCO Bank" to "ucobank.com", "Bank of Maharashtra" to "bankofmaharashtra.in",
    "Punjab & Sind Bank" to "punjabandsindbank.co.in", "IDBI Bank" to "idbibank.in", "IDFC FIRST Bank" to "idfcfirstbank.com",
    "Yes Bank" to "yesbank.in", "IndusInd Bank" to "indusind.com", "Federal Bank" to "federalbank.co.in",
    "South Indian Bank" to "southindianbank.com", "Karur Vysya Bank" to "kvb.co.in", "City Union Bank" to "cityunionbank.com",
    "RBL Bank" to "rblbank.com", "Bandhan Bank" to "bandhanbank.com", "DCB Bank" to "dcbbank.com",
    "Dhanlaxmi Bank" to "dhanbank.com", "Karnataka Bank" to "karnatakabank.com", "Tamilnad Mercantile Bank" to "tmb.in",
    "Jammu & Kashmir Bank" to "jkbank.com", "CSB Bank" to "csb.co.in", "Nainital Bank" to "nainitalbank.co.in",
    "AU Small Finance Bank" to "aubank.in", "Equitas Small Finance Bank" to "equitasbank.com", "Ujjivan Small Finance Bank" to "ujjivansfb.in",
    "Jana Small Finance Bank" to "janabank.com", "Suryoday Small Finance Bank" to "suryodaybank.com", "ESAF Small Finance Bank" to "esafbank.com",
    "Utkarsh Small Finance Bank" to "utkarsh.bank", "Paytm Payments Bank" to "paytmbank.com", "Airtel Payments Bank" to "airtel.in",
    "India Post Payments Bank" to "ippbonline.com", "Fino Payments Bank" to "finobank.com", "Saraswat Co-operative Bank" to "saraswatbank.com",
    "Cosmos Co-operative Bank" to "cosmosbank.com", "SVC Co-operative Bank" to "svcbank.com", "Standard Chartered Bank" to "sc.com",
    "HSBC Bank" to "hsbc.co.in", "Citibank" to "citibank.com", "Deutsche Bank" to "db.com", "DBS Bank India" to "dbs.com",
)

private fun bankColor(name: String): Color =
    BANK_BRAND[name] ?: BANK_PALETTE[kotlin.math.abs(name.hashCode()) % BANK_PALETTE.size]

private fun bankMonogram(name: String): String {
    BANK_MONOGRAM[name]?.let { return it }
    val stop = setOf("bank", "of", "the", "and", "co-operative", "cooperative", "payments", "small", "finance", "ltd", "limited")
    val words = name.split(" ", "&", "-").map { it.trim() }.filter { it.isNotBlank() && it.lowercase() !in stop }
    return words.take(3).map { it.first().uppercaseChar() }.joinToString("").ifEmpty { name.take(2).uppercase() }
}

/**
 * Bank logo tile: loads the real logo by [BANK_DOMAIN]. It tries Google's favicon service first
 * (always PNG, Coil-decodable), then icon.horse (covers domains Google lacks); while any of those
 * load, fail, or the domain is unknown it shows a branded monogram so the row is never blank.
 */
@Composable
private fun BankLogo(name: String, size: Int = 36) {
    val domain = BANK_DOMAIN[name]
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape(10.dp)).background(Color.White)
            .border(1.dp, Divider, RoundedCornerShape(10.dp)),
        contentAlignment = Alignment.Center,
    ) {
        if (domain == null) {
            BankMonogramText(name)
        } else {
            RemoteLogo(
                urls = listOf(
                    "https://www.google.com/s2/favicons?sz=128&domain=$domain",
                    "https://icon.horse/icon/$domain",
                ),
                name = name,
            )
        }
    }
}

/** Tries each URL in turn; on load/failure of one it falls through to the next, then the monogram. */
@Composable
private fun RemoteLogo(urls: List<String>, name: String) {
    if (urls.isEmpty()) { BankMonogramText(name); return }
    SubcomposeAsyncImage(
        model = urls.first(),
        contentDescription = name,
        modifier = Modifier.fillMaxSize().padding(5.dp),
        contentScale = ContentScale.Fit,
        loading = { BankMonogramText(name) },
        error = { RemoteLogo(urls.drop(1), name) },
    )
}

@Composable
private fun BankMonogramText(name: String) {
    val c = bankColor(name)
    val mono = bankMonogram(name)
    val fs = when {
        mono.length <= 2 -> 13
        mono.length == 3 -> 11
        mono.length == 4 -> 9
        else -> 8
    }
    Text(mono, color = c, fontSize = fs.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp)
}

/**
 * Bank Name field rendered as a read-only outlined field with a search trailing icon; tapping it
 * opens a searchable picker dialog over [INDIAN_BANKS]. Falls back to whatever the IFSC lookup
 * filled in if the worker doesn't pick.
 */
@Composable
private fun BankNamePicker(value: String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }

    Box {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            label = { Text("Bank Name") },
            placeholder = { Text("Search bank") },
            leadingIcon = if (value.isNotBlank()) { { BankLogo(value, size = 28) } } else null,
            trailingIcon = { Icon(Icons.Filled.Search, contentDescription = "Search bank", tint = Purple) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(Radius.button),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = Color.White, unfocusedContainerColor = Color.White,
                focusedBorderColor = Purple, unfocusedBorderColor = Divider, cursorColor = Purple,
            ),
        )
        // Transparent overlay so a tap anywhere on the field opens the picker instead of the keyboard.
        Box(Modifier.matchParentSize().clip(RoundedCornerShape(Radius.button)).clickable { query = ""; open = true })
    }

    if (open) {
        Dialog(onDismissRequest = { open = false }) {
            androidx.compose.material3.Surface(shape = RoundedCornerShape(20.dp), color = Color.White) {
                Column(Modifier.fillMaxWidth().padding(Space.l)) {
                    Text("Select Bank", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(Space.m))
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text("Search bank name") },
                        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = Purple) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        shape = RoundedCornerShape(Radius.button),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = Color.White, unfocusedContainerColor = Color.White,
                            focusedBorderColor = Purple, unfocusedBorderColor = Divider, cursorColor = Purple,
                        ),
                    )
                    Spacer(Modifier.height(Space.s))
                    val matches = INDIAN_BANKS.filter { it.contains(query.trim(), ignoreCase = true) }
                    Column(Modifier.fillMaxWidth().heightIn(max = 340.dp).verticalScroll(rememberScrollState())) {
                        if (matches.isEmpty()) {
                            Text(
                                "No matching bank.", color = TextGray, fontSize = 13.5.sp,
                                modifier = Modifier.padding(vertical = 14.dp),
                            )
                        }
                        matches.forEach { bank ->
                            Row(
                                Modifier.fillMaxWidth().clickable { onSelect(bank); open = false }.padding(vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                BankLogo(bank, size = 36)
                                Spacer(Modifier.width(Space.m))
                                Text(bank, color = TextDark, fontSize = 14.sp, fontWeight = if (bank == value) FontWeight.Bold else FontWeight.Normal, modifier = Modifier.weight(1f))
                                if (bank == value) Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(18.dp))
                            }
                            Box(Modifier.fillMaxWidth().height(1.dp).background(Divider))
                        }
                    }
                    Spacer(Modifier.height(Space.s))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { open = false }) { Text("Close", color = Purple, fontWeight = FontWeight.Bold) }
                    }
                }
            }
        }
    }
}

@Composable
private fun BankField(label: String, value: String, kb: KeyboardType = KeyboardType.Text, isError: Boolean = false, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        isError = isError,
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
            WalletTopBar("Manage Account", onBack = { nav.popBackStack() })
            EmptyState("🏦", "Account not found", "It may have been removed.")
        }
        return
    }

    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text("Remove this account?", fontWeight = FontWeight.Bold) },
            text = { Text("${a.bankName} ${a.accountMasked} will no longer receive payouts.", color = TextGray, fontSize = 14.sp) },
            confirmButton = {
                TextButton(onClick = { vm.deleteBankAccount(a.id); confirmRemove = false; nav.popBackStack() }) {
                    Text("Remove", color = RedCancel, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text("Cancel") } },
        )
    }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        WalletTopBar("Manage Account", onBack = { nav.popBackStack() })
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
                Text("Status", color = TextGray, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
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
        Text(label, color = TextMuted, fontSize = 12.5.sp)
        Spacer(Modifier.height(2.dp))
        Text(value, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

/* ── PAYOUT SETTINGS ───────────────────────────────────────────────────────────────────── */

@Composable
fun PayoutSettingsScreen(vm: AppViewModel, nav: NavHostController) {
    LaunchedEffect(Unit) { vm.loadPayoutSettings(); vm.loadBankAccounts() }
    val s = vm.payoutSettings
    fun save(next: PayoutSettingsDto) = vm.savePayoutSettings(next)

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        WalletTopBar("Settlement Settings", onBack = { nav.popBackStack() })
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
                // The reference draws these as dropdown fields — a bordered box showing the chosen
                // value with a chevron — rather than a row of quick-select pills.
                Text("Minimum Payout Amount", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.s))
                SettingDropdown(
                    value = rs(s.minPayout),
                    options = listOf(100, 200, 500, 1000, 2000).map { rs(it) to it },
                    selected = s.minPayout,
                ) { save(s.copy(minPayout = it)) }
                Spacer(Modifier.height(Space.m))
                Text("Settlement Time", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.s))
                SettingDropdown(
                    value = s.settlementTime,
                    options = listOf("07:00 AM", "10:00 AM", "12:00 PM", "06:00 PM", "09:00 PM").map { it to it },
                    selected = s.settlementTime,
                ) { save(s.copy(settlementTime = it)) }
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
                        color = TextDark, fontSize = 13.sp,
                    )
                }
            }
            // Settings and Schedule are a pair — let the worker jump to the schedule view from here.
            OutlineButton("View Payout Schedule", modifier = Modifier.fillMaxWidth()) { nav.navigate(Routes.PAYOUT_SCHEDULE) }
        }
    }
}

/**
 * Bordered value box that opens a menu of choices, as the reference draws Minimum Payout Amount
 * and Settlement Time. Generic over the value type so it serves both the amount (Int) and the
 * time (String) selectors.
 */
@Composable
private fun <T> SettingDropdown(
    value: String,
    options: List<Pair<String, T>>,
    selected: T,
    onSelect: (T) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.button)).background(Color.White)
                .border(1.dp, Divider, RoundedCornerShape(Radius.button))
                .clickable { open = true }.padding(horizontal = 14.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(value, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = TextGray, modifier = Modifier.size(22.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (label, v) ->
                DropdownMenuItem(
                    text = {
                        Text(
                            label,
                            color = if (v == selected) Purple else TextDark,
                            fontSize = 14.sp,
                            fontWeight = if (v == selected) FontWeight.Bold else FontWeight.Normal,
                        )
                    },
                    onClick = { open = false; if (v != selected) onSelect(v) },
                )
            }
        }
    }
}

@Composable
private fun ToggleRow(title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = TextGray, fontSize = 12.5.sp)
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

    val auto = s.autoWithdraw
    val automatic = s.dailySettlement || s.weeklySettlement

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        WalletTopBar("Payout Schedule", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.l),
        ) {
            // Next-settlement hero — calendar tile + when/at, with room to breathe.
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Primary50).padding(Space.l),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(Color.White),
                    contentAlignment = Alignment.Center,
                ) { Text("📅", fontSize = 24.sp) }
                Spacer(Modifier.width(Space.l))
                Column(Modifier.weight(1f)) {
                    Text(
                        "NEXT SETTLEMENT", color = TextGray, fontSize = 11.5.sp,
                        fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(nextSettlementLabel(s), color = Purple, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(3.dp))
                    Text(
                        if (automatic) s.settlementTime else "—", color = TextDark, fontSize = 24.sp,
                        fontWeight = FontWeight.Bold, letterSpacing = (-0.4).sp,
                    )
                }
            }

            // Schedule detail — roomy rows for legibility.
            Card(padding = Dp16.M) {
                Text("Payout Schedule", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.2).sp)
                Spacer(Modifier.height(Space.s))
                ScheduleRow("Frequency", if (s.weeklySettlement) "Weekly" else if (s.dailySettlement) "Daily" else "Manual")
                ScheduleRow("Settlement Time", s.settlementTime)
                ScheduleRow("Minimum Payout", rs(s.minPayout))
                ScheduleRow("Auto Withdraw", if (auto) "Enabled" else "Disabled", valueColor = if (auto) GreenSuccess else TextGray)
                ScheduleRow("Preferred Account", bank?.let { "${it.bankName} ${it.accountMasked}" } ?: "Not set")
            }

            // What this schedule means, spelled out.
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Primary50).padding(14.dp)) {
                Text(
                    if (auto)
                        "Your earnings are automatically transferred to your bank account as per this schedule."
                    else "Settlement moves earnings into your wallet on this schedule. Withdraw them yourself, or turn on Auto Withdraw.",
                    color = TextGray, fontSize = 13.sp, lineHeight = 19.sp,
                )
            }
            OutlineButton("Change Payout Settings", modifier = Modifier.fillMaxWidth()) { nav.navigate(Routes.PAYOUT_SETTINGS) }
        }
    }
}

/** Roomy label/value row for the Payout Schedule detail card — wraps long values (e.g. the bank line). */
@Composable
private fun ScheduleRow(label: String, value: String, valueColor: Color = TextDark) {
    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = TextGray, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(Space.m))
        Text(
            value, color = valueColor, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.End, modifier = Modifier.weight(1.3f),
        )
    }
}

private fun nextSettlementLabel(s: PayoutSettingsDto): String {
    if (!s.dailySettlement && !s.weeklySettlement) return "Manual — no automatic settlement"
    val cal = java.util.Calendar.getInstance()
    cal.add(java.util.Calendar.DAY_OF_YEAR, if (s.weeklySettlement) 7 else 1)
    val date = java.text.SimpleDateFormat("dd MMM yyyy", java.util.Locale.getDefault()).format(cal.time)
    // Daily lands tomorrow — say so, as the reference draws it; weekly names the weekday.
    val prefix = if (s.weeklySettlement)
        java.text.SimpleDateFormat("EEEE", java.util.Locale.getDefault()).format(cal.time)
    else "Tomorrow"
    return "$prefix, $date"
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
        WalletTopBar("Help & Support", onBack = { nav.popBackStack() })
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
                        Text(q, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(16.dp))
                    }
                    if (open == i) {
                        Spacer(Modifier.height(6.dp))
                        Text(a, color = TextGray, fontSize = 13.5.sp, lineHeight = 16.sp)
                    }
                }
            }
            Card(padding = Dp16.S) {
                Text("Need more help?", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text("Our support team is here for you.", color = TextGray, fontSize = 13.5.sp)
                Spacer(Modifier.height(Space.s))
                PrimaryButton("Contact Support") { nav.navigate(Routes.P_HELP) }
            }
        }
    }
}
