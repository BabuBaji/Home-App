package com.homehelp.pro

import android.content.Context
import android.content.Intent
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
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocationOn
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

@Composable
fun EarningsScreen(vm: AppViewModel) {
    // Pull the latest wallet snapshot so week/month totals are populated from the server.
    LaunchedEffect(Unit) { vm.refreshWallet() }
    var tab by remember { mutableStateOf("Today") }
    val tabs = listOf("Today", "This Week", "This Month")

    // Period total + caption — the filter now genuinely drives the headline figure.
    // Week/Month fall back to summing the daily entries when the server hasn't sent a total yet.
    val (periodTotal, caption) = when (tab) {
        "This Week" -> (if (vm.weekEarnings > 0) vm.weekEarnings else vm.earnings.take(7).sumOf { it.amount }) to "Last 7 days"
        "This Month" -> (if (vm.monthEarnings > 0) vm.monthEarnings else vm.earnings.sumOf { it.amount }) to "This month so far"
        else -> vm.todayEarnings to "${vm.todayJobs} ${if (vm.todayJobs == 1) "job" else "jobs"} today"
    }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        BellHeader("Earnings")
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            SegmentedTabs(tabs, tab) { tab = it }

            // Headline earnings for the selected period.
            Box(Modifier.fillMaxWidth().background(Purple, RoundedCornerShape(16.dp)).padding(18.dp)) {
                Column {
                    Text("$tab Earnings", color = Color.White.copy(alpha = 0.85f), fontSize = 13.sp)
                    Text("₹$periodTotal", color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text(caption, color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp)
                }
            }

            // Payout status — genuinely useful, cleanly aligned.
            Card {
                SectionTitle("Payout")
                Spacer(Modifier.height(6.dp))
                LabeledRow("Available to withdraw", "₹${vm.walletBalance}", GreenSuccess)
                LabeledRow("Pending clearance", "₹${vm.pendingAmount}", Gold)
                LabeledRow("Next payout", vm.nextPayout)
            }

            // Day-by-day breakdown.
            Card {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Recent Days", fontWeight = FontWeight.SemiBold, color = TextDark)
                    Text("₹${vm.earnings.sumOf { it.amount }}", fontWeight = FontWeight.Bold, color = Purple)
                }
                Spacer(Modifier.height(8.dp))
                if (vm.earnings.isEmpty()) {
                    EmptyState("📅", "No earnings yet", "Completed jobs will show up here.")
                } else {
                    vm.earnings.forEach { e ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(e.date, color = TextDark, fontSize = 14.sp, modifier = Modifier.weight(1f))
                            Text("₹${e.amount}", fontWeight = FontWeight.SemiBold, color = TextDark)
                            Spacer(Modifier.width(10.dp))
                            StatusPill(if (e.paid) "Paid" else "Pending", if (e.paid) GreenLight else Color(0xFFFFF3D6), if (e.paid) GreenSuccess else Gold)
                        }
                        Divider(color = Divider)
                    }
                }
            }
        }
    }
}

@Composable
fun BookingsScreen(vm: AppViewModel) {
    var tab by remember { mutableStateOf("Upcoming") }
    val tabs = listOf("Upcoming", "Completed", "Cancelled")
    val counts = tabs.associateWith { t -> vm.bookings.count { it.status == t } }
    val filtered = vm.bookings.filter { it.status == tab }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        BellHeader("My Bookings")
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SegmentedTabs(tabs, tab, counts = counts) { tab = it }
            // Aligned summary strip for the selected filter.
            if (filtered.isNotEmpty()) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("${filtered.size} ${tab.lowercase()} ${if (filtered.size == 1) "booking" else "bookings"}", fontSize = 13.sp, color = TextGray)
                    Text("₹${filtered.sumOf { it.amount }} total", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = TextDark)
                }
            }
        }
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (filtered.isEmpty()) {
                val (emoji, msg) = when (tab) {
                    "Upcoming" -> "🗓️" to "New bookings will appear here once customers book you."
                    "Completed" -> "✅" to "Jobs you finish will be listed here."
                    else -> "🚫" to "Cancelled bookings will show up here."
                }
                EmptyState(emoji, "No $tab bookings", msg)
            } else {
                filtered.forEach { b -> BookingCard(b) }
            }
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
        // Title + status, top-aligned so long service names wrap cleanly beside the pill.
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(b.service, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 15.sp)
                Spacer(Modifier.height(2.dp))
                Text(b.customerName, fontSize = 13.sp, color = TextGray)
            }
            Spacer(Modifier.width(10.dp))
            StatusPill(b.status, bg, fg)
        }
        Spacer(Modifier.height(10.dp)); HairlineDivider(); Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.LocationOn, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text(b.address, fontSize = 12.sp, color = TextGray, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                Icon(Icons.Filled.Schedule, contentDescription = null, tint = TextGray, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(5.dp))
                Text(b.timeInfo, fontSize = 11.sp, color = TextGray)
            }
            Text("₹${b.amount}", fontWeight = FontWeight.Bold, color = TextDark, fontSize = 16.sp)
        }
    }
}

@Composable
fun ProfileScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    val initials = vm.workerName.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString("").ifBlank { "?" }
    val verified = vm.bankApproved
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        BellHeader("Profile")
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(initials, size = 56)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(vm.workerName.ifBlank { "HomeHelp Partner" }, fontWeight = FontWeight.Bold, fontSize = 17.sp, color = TextDark)
                        if (verified) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.Verified, contentDescription = null, tint = Purple, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Verified Partner", fontSize = 12.sp, color = Purple)
                            }
                        }
                        Text(
                            if (vm.jobsCompleted > 0) "${vm.workerRating} ★  •  ${vm.jobsCompleted} jobs completed" else "New partner",
                            fontSize = 12.sp, color = TextGray,
                        )
                    }
                }
            }
            // Overview — real figures; only shown once there's activity to report.
            if (vm.monthEarnings > 0 || vm.jobsCompleted > 0 || vm.walletBalance > 0) {
                Box(Modifier.fillMaxWidth().background(Purple, RoundedCornerShape(16.dp)).padding(16.dp)) {
                    Column {
                        Text("Overview", color = Color.White, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(12.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            SplitStat("₹${vm.monthEarnings}", "This Month")
                            SplitStat("${vm.jobsCompleted}", "Jobs Done")
                            SplitStat("₹${vm.walletBalance}", "Balance")
                        }
                    }
                }
            }
            Card(padding = Dp16.S) {
                MenuItem(Icons.Filled.Person, "Personal Information") { nav.navigate(Routes.P_PERSONAL) }
                MenuItem(Icons.Filled.Description, "Documents") { nav.navigate(Routes.P_DOCUMENTS) }
                MenuItem(Icons.Filled.AccountBalance, "Bank Details") { nav.navigate(Routes.P_BANK) }
                MenuItem(Icons.Filled.Schedule, "Availability & Shifts") { nav.navigate(Routes.P_AVAILABILITY) }
                MenuItem(Icons.Filled.Tune, "Preferences") { nav.navigate(Routes.P_PREFERENCES) }
                MenuItem(Icons.Filled.Notifications, "Notification Settings") { nav.navigate(Routes.P_NOTIFICATIONS) }
                MenuItem(Icons.Filled.CardGiftcard, "Refer & Earn") { shareInvite(ctx) }
                MenuItem(Icons.AutoMirrored.Filled.HelpOutline, "Help & Support") { nav.navigate(Routes.P_HELP) }
                MenuItem(Icons.Filled.Info, "About Us", divider = false) { nav.navigate(Routes.P_ABOUT) }
            }
            Surface(
                Modifier.fillMaxWidth().clickable {
                    vm.logout()
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

// ---- helpers ----

/** Open the Android share sheet to invite others to join HomeHelp Pro as partners. */
private fun shareInvite(ctx: Context) {
    val msg = "Join me on HomeHelp Pro — become a verified home-service partner and earn on your " +
        "own schedule. Download the app to get started."
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, "Join HomeHelp Pro")
        putExtra(Intent.EXTRA_TEXT, msg)
    }
    ctx.startActivity(Intent.createChooser(send, "Invite via").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

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
