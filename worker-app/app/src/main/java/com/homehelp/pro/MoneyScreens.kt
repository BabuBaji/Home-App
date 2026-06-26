package com.homehelp.pro

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
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

@Composable
fun EarningsScreen(vm: AppViewModel) {
    var tab by remember { mutableStateOf("Daily") }
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        BellHeader("Earnings")
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(Modifier.fillMaxWidth().background(Purple, RoundedCornerShape(16.dp)).padding(18.dp)) {
                Column {
                    Text("Today's Earnings", color = Color.White.copy(alpha = 0.85f), fontSize = 13.sp)
                    Text("₹${vm.todayEarnings}", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        SplitStat("₹0", "Cash Collected")
                        SplitStat("₹${vm.todayEarnings}", "Online")
                        SplitStat("₹50", "Incentives")
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Daily", "Weekly", "Monthly").forEach { t ->
                    TabPill(t, tab == t, Modifier.weight(1f)) { tab = t }
                }
            }
            Card {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(tab, fontWeight = FontWeight.SemiBold, color = TextDark)
                    Text("₹${vm.todayEarnings}", fontWeight = FontWeight.Bold, color = Purple)
                }
                Spacer(Modifier.height(8.dp))
                vm.earnings.forEach { e ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(e.date, color = TextDark, fontSize = 14.sp, modifier = Modifier.weight(1f))
                        Text("₹${e.amount}", fontWeight = FontWeight.SemiBold, color = TextDark)
                        Spacer(Modifier.width(10.dp))
                        StatusPill("Paid", GreenLight, GreenSuccess)
                    }
                    Divider(color = Divider)
                }
                Spacer(Modifier.height(8.dp))
                Text("View More ▾", color = Purple, fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
fun BookingsScreen(vm: AppViewModel) {
    var tab by remember { mutableStateOf("Upcoming") }
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        BellHeader("My Bookings")
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Upcoming", "Completed", "Cancelled").forEach { t ->
                TabPill(t, tab == t, Modifier.weight(1f)) { tab = t }
            }
        }
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val filtered = vm.bookings.filter { it.status == tab }
            if (filtered.isEmpty()) {
                Text("No $tab bookings.", color = TextGray, modifier = Modifier.padding(24.dp))
            }
            filtered.forEach { b -> BookingCard(b) }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun BookingCard(b: Booking) {
    val (bg, fg) = when (b.status) {
        "Upcoming" -> PurpleLight to Purple
        "Completed" -> GreenLight to GreenSuccess
        else -> Color(0xFFFDE7E7) to RedCancel
    }
    Card {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(b.timeInfo.substringBefore(" •"), fontSize = 12.sp, color = TextGray)
            StatusPill(b.status, bg, fg)
        }
        Spacer(Modifier.height(8.dp))
        Text(b.service, fontWeight = FontWeight.SemiBold, color = TextDark)
        Text(b.customerName, fontSize = 13.sp, color = TextDark)
        Text(b.address, fontSize = 12.sp, color = TextGray)
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(b.timeInfo, fontSize = 11.sp, color = TextGray, modifier = Modifier.weight(1f))
            Text("₹${b.amount}", fontWeight = FontWeight.Bold, color = TextDark)
        }
    }
}

@Composable
fun ProfileScreen(vm: AppViewModel, nav: NavHostController) {
    var showServer by remember { mutableStateOf(false) }
    if (showServer) ServerSettingsDialog(onDismiss = { showServer = false })
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        BellHeader("Profile")
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(vm.workerName.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString(""), size = 56)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(vm.workerName, fontWeight = FontWeight.Bold, fontSize = 17.sp, color = TextDark)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Verified, contentDescription = null, tint = Purple, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Verified Partner", fontSize = 12.sp, color = Purple)
                        }
                        Text("${vm.workerRating} ★  •  ${vm.jobsCompleted} Jobs Completed", fontSize = 12.sp, color = TextGray)
                    }
                }
            }
            Box(Modifier.fillMaxWidth().background(Purple, RoundedCornerShape(16.dp)).padding(16.dp)) {
                Column {
                    Text("This Month Overview", color = Color.White, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        SplitStat("₹8,450", "Earnings")
                        SplitStat("32", "Jobs Completed")
                        SplitStat("68h 30m", "Hours Worked")
                    }
                }
            }
            Card(padding = Dp16.S) {
                MenuItem(Icons.Filled.Person, "Personal Information") { nav.navigate(Routes.P_PERSONAL) }
                MenuItem(Icons.Filled.Description, "Documents") { nav.navigate(Routes.P_DOCUMENTS) }
                MenuItem(Icons.Filled.AccountBalance, "Bank Details") { nav.navigate(Routes.P_BANK) }
                MenuItem(Icons.Filled.Schedule, "Availability") { nav.navigate(Routes.P_AVAILABILITY) }
                MenuItem(Icons.Filled.Tune, "Preferences") { nav.navigate(Routes.P_PREFERENCES) }
                MenuItem(Icons.Filled.Notifications, "Notification Settings") { nav.navigate(Routes.P_NOTIFICATIONS) }
                MenuItem(Icons.AutoMirrored.Filled.HelpOutline, "Help & Support") { nav.navigate(Routes.P_HELP) }
                MenuItem(Icons.Filled.Info, "About Us") { nav.navigate(Routes.P_ABOUT) }
                MenuItem(Icons.Filled.Dns, "Server Settings", divider = false) { showServer = true }
            }
            Surface(
                Modifier.fillMaxWidth().clickable {
                    nav.navigate(Routes.LOGIN) { popUpTo(Routes.HOME) { inclusive = true } }
                },
                shape = RoundedCornerShape(12.dp),
                color = Color.White,
            ) {
                Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.Center) {
                    Icon(Icons.Filled.Logout, contentDescription = null, tint = RedCancel, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Logout", color = RedCancel, fontWeight = FontWeight.SemiBold)
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
fun WalletScreen(vm: AppViewModel) {
    val ctx = LocalContext.current
    var dialog by remember { mutableStateOf("") } // "", "withdraw", "add"

    if (dialog == "withdraw") {
        AmountDialog("Withdraw to Bank", "Withdraw", onDismiss = { dialog = "" }) { amt ->
            val err = vm.withdraw(amt)
            toast(ctx, err ?: "₹$amt withdrawal initiated")
            if (err == null) dialog = ""
        }
    } else if (dialog == "add") {
        AmountDialog("Add Money", "Add", onDismiss = { dialog = "" }) { amt ->
            val err = vm.addMoney(amt)
            toast(ctx, err ?: "₹$amt added to wallet")
            if (err == null) dialog = ""
        }
    }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        BellHeader("Wallet")
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(Modifier.fillMaxWidth().background(Purple, RoundedCornerShape(16.dp)).padding(18.dp)) {
                Column {
                    Text("Available Balance", color = Color.White.copy(alpha = 0.85f), fontSize = 13.sp)
                    Text("₹${vm.walletBalance}", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Text("View Balance Details ›", color = Color.White, fontSize = 12.sp)
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                WalletAction(Icons.Filled.ArrowUpward, "Withdraw") { dialog = "withdraw" }
                WalletAction(Icons.Filled.AddCircleOutline, "Add Money") { dialog = "add" }
                WalletAction(Icons.Filled.History, "History") { toast(ctx, "Showing full transaction history") }
                WalletAction(Icons.Filled.CardGiftcard, "Summary") { toast(ctx, "Earnings summary") }
            }
            Card {
                SectionTitle("Balance Summary")
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    SummaryMini("₹${vm.totalEarned}", "Total", TextDark)
                    SummaryMini("₹${vm.withdrawnTotal}", "Withdrawn", GreenSuccess)
                    SummaryMini("₹${vm.pendingAmount}", "Pending", Gold)
                }
            }
            Card {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Recent Transactions", fontWeight = FontWeight.SemiBold, color = TextDark)
                    Text("View All", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                }
                Spacer(Modifier.height(8.dp))
                vm.walletTxns.forEach { t -> TxnRow(t) }
            }
        }
    }
}

// ---- helpers ----

@Composable
private fun SplitStat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        Text(label, color = Color.White.copy(alpha = 0.8f), fontSize = 11.sp)
    }
}

@Composable
private fun SummaryMini(value: String, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = color, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        Text(label, color = TextGray, fontSize = 11.sp)
    }
}

@Composable
private fun TabPill(text: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        modifier = modifier.height(40.dp).clickable { onClick() },
        shape = RoundedCornerShape(10.dp),
        color = if (selected) Purple else Color.White,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(text, color = if (selected) Color.White else TextGray, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        }
    }
}

@Composable
private fun MenuItem(icon: ImageVector, label: String, divider: Boolean = true, onClick: () -> Unit) {
    Column(Modifier.clickable { onClick() }) {
        Row(Modifier.fillMaxWidth().padding(vertical = 14.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(14.dp))
            Text(label, color = TextDark, fontSize = 15.sp, modifier = Modifier.weight(1f))
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextGray, modifier = Modifier.size(20.dp))
        }
        if (divider) Divider(color = Divider)
    }
}

@Composable
private fun WalletAction(icon: ImageVector, label: String, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable { onClick() }) {
        Box(Modifier.size(52.dp).background(PurpleLight, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = label, tint = Purple, modifier = Modifier.size(24.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text(label, fontSize = 11.sp, color = TextDark)
    }
}

@Composable
private fun AmountDialog(title: String, action: String, onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    var amount by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, fontWeight = FontWeight.Bold) },
        text = {
            OutlinedTextField(
                value = amount,
                onValueChange = { if (it.length <= 6 && it.all(Char::isDigit)) amount = it },
                label = { Text("Amount (₹)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(amount.toIntOrNull() ?: 0) }) {
                Text(action, color = Purple, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun TxnRow(t: WalletTxn) {
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(40.dp).background(if (t.isCredit) GreenLight else PurpleLight, RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
            Icon(
                if (t.isCredit) Icons.Filled.ArrowDownward else Icons.Filled.ArrowUpward,
                contentDescription = null,
                tint = if (t.isCredit) GreenSuccess else Purple,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(t.title, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
            Text(t.subtitle, fontSize = 11.sp, color = TextGray)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                (if (t.isCredit) "+₹" else "-₹") + t.amount,
                fontWeight = FontWeight.Bold,
                color = if (t.isCredit) GreenSuccess else TextDark,
                fontSize = 14.sp,
            )
            StatusPill(t.status, if (t.status == "Success") GreenLight else Color(0xFFFFF3D6), if (t.status == "Success") GreenSuccess else Gold)
        }
    }
}
