package com.homehelp.pro

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Share
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

private fun rupee(n: Int) = "₹" + "%,d".format(n)

private fun shareText(ctx: Context, text: String) {
    try {
        val i = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text) }
        ctx.startActivity(Intent.createChooser(i, "Share via"))
    } catch (_: Exception) { toast(ctx, "No app to share with") }
}
private fun copyText(ctx: Context, label: String, text: String) {
    try {
        (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText(label, text))
        toast(ctx, "Copied")
    } catch (_: Exception) { }
}
private fun dial(ctx: Context, phone: String) {
    try { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))) } catch (_: Exception) { }
}

/* ============================ RATE CARD ============================ */
@Composable
fun RateCardScreen(vm: AppViewModel, nav: NavHostController) {
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Rate Card", onBack = { nav.popBackStack() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.fillMaxWidth().background(BrandGradient, RoundedCornerShape(18.dp)).padding(20.dp)) {
                Column {
                    Text("VISHWAAS", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text("How you earn on HomeHelp Pro", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                }
            }
            Card {
                SectionTitle("Per-Job Earnings")
                Spacer(Modifier.height(6.dp))
                Text("You keep 80% of every completed booking. HomeHelp charges a 20% platform fee.", fontSize = 13.sp, color = TextGray)
                Spacer(Modifier.height(10.dp))
                RateRow("Bathroom Cleaning (₹199)", "You earn ₹159")
                Divider(color = Divider)
                RateRow("Kitchen Cleaning (₹249)", "You earn ₹199")
                Divider(color = Divider)
                RateRow("Full Home Cleaning (₹499)", "You earn ₹399")
            }
            Card {
                SectionTitle("Bonuses")
                Spacer(Modifier.height(6.dp))
                RateRow("On-time start bonus", "+ ₹15", GreenSuccess)
                Divider(color = Divider)
                RateRow("Referral bonus", "+ ₹1,500", GreenSuccess)
            }
            Card {
                SectionTitle("Penalties")
                Spacer(Modifier.height(6.dp))
                RateRow("Late start (OTP not entered in 15 min)", "− ₹15", RedCancel)
            }
            Card {
                SectionTitle("FAQs")
                Spacer(Modifier.height(6.dp))
                Faq("When do I get paid?", "Your 80% share is credited to your wallet the moment you complete a job.")
                Faq("How do I withdraw?", "Use Wallet → Withdraw. Amounts up to ₹2,000 are auto-approved instantly.")
                Faq("What is the on-time bonus?", "Start a job (enter the customer OTP) within 15 minutes of accepting to earn +₹15.")
            }
        }
    }
}

@Composable
private fun RateRow(label: String, value: String, color: Color = TextDark) {
    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = TextDark, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Text(value, color = color, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}
@Composable
private fun Faq(q: String, a: String) {
    Column(Modifier.padding(vertical = 8.dp)) {
        Text(q, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
        Text(a, color = TextGray, fontSize = 13.sp)
    }
}

/* ============================ REFER & EARN ============================ */
@Composable
fun ReferEarnScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { vm.loadReferral() }
    val r = vm.referral
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Refer & Earn", onBack = { nav.popBackStack() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.fillMaxWidth().background(BrandGradient, RoundedCornerShape(18.dp)).padding(22.dp)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text("🎁", fontSize = 34.sp)
                    Spacer(Modifier.height(6.dp))
                    Text("Refer a friend, both earn", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    Text("Earn ${rupee(r?.bonus ?: 1500)} for every friend who joins", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                }
            }
            Card {
                Text("Your referral code", color = TextGray, fontSize = 12.sp)
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.weight(1f).border(1.5.dp, Purple, RoundedCornerShape(12.dp)).padding(vertical = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text(r?.code ?: "—", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Purple) }
                    Spacer(Modifier.width(10.dp))
                    Icon(Icons.Filled.ContentCopy, "Copy", tint = Purple, modifier = Modifier.size(26.dp).clickable { r?.code?.let { copyText(ctx, "referral", it) } })
                }
                Spacer(Modifier.height(12.dp))
                PrimaryButton("Share invite") { r?.let { shareText(ctx, it.shareMessage) } }
            }
            Card {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column {
                        Text("Lifetime referral earnings", color = TextGray, fontSize = 12.sp)
                        Text(rupee(r?.lifetimeEarnings ?: 0), color = GreenSuccess, fontWeight = FontWeight.Bold, fontSize = 24.sp)
                    }
                    Text("👛", fontSize = 30.sp)
                }
            }
            Card {
                SectionTitle("How it works")
                Spacer(Modifier.height(6.dp))
                Faq("1. Share your code", "Send your code to friends who want to become a HomeHelp Pro.")
                Faq("2. They join & work", "They sign up with your code and complete their first shift.")
                Faq("3. You both earn", "₹${r?.bonus ?: 1500} is credited to each of your wallets.")
            }
        }
    }
}

/* ============================ CLAIM INSURANCE ============================ */
@Composable
fun ClaimInsuranceScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { vm.loadInsurance() }
    val ins = vm.insurance
    var showClaim by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Health Card", onBack = { nav.popBackStack() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.fillMaxWidth().background(BrandGradient, RoundedCornerShape(18.dp)).padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("🛡️", fontSize = 30.sp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("HomeHelp Health Card", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                        Text(if (ins?.activated == true) "Active" else "Not activated yet", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                    }
                }
            }
            Card {
                SectionTitle("Coverage")
                Spacer(Modifier.height(6.dp))
                Text(ins?.coverage ?: "—", color = TextDark, fontSize = 14.sp)
                if (!ins?.policyNo.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp)); Divider(color = Divider); Spacer(Modifier.height(8.dp))
                    LabeledRow("Policy No.", ins?.policyNo)
                }
            }
            Card {
                Text("Need help with a claim?", fontWeight = FontWeight.SemiBold, color = TextDark)
                Text("Our team will guide you through the process.", color = TextGray, fontSize = 13.sp)
                Spacer(Modifier.height(12.dp))
                PrimaryButton("Claim Insurance") { showClaim = true }
                Spacer(Modifier.height(8.dp))
                OutlineButton("Call Helpline ${ins?.helpline ?: ""}", modifier = Modifier.fillMaxWidth()) { ins?.helpline?.let { dial(ctx, it) } }
            }
        }
    }
    if (showClaim) {
        AlertDialog(
            onDismissRequest = { showClaim = false },
            confirmButton = {
                TextButton(enabled = !busy, onClick = {
                    busy = true
                    vm.claimInsurance(reason.ifBlank { "Insurance claim request" }) { msg ->
                        busy = false; showClaim = false; reason = ""; toast(ctx, msg)
                    }
                }) { Text("Submit", color = Purple, fontWeight = FontWeight.Bold) }
            },
            dismissButton = { TextButton(onClick = { showClaim = false }) { Text("Cancel", color = TextGray) } },
            title = { Text("Raise a claim", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text("Briefly describe your claim:", color = TextGray, fontSize = 13.sp)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(value = reason, onValueChange = { reason = it }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                }
            },
        )
    }
}

/* ============================ REWARDS (Gold Coins / Red Cards) ============================ */
@Composable
fun RewardsScreen(vm: AppViewModel, nav: NavHostController) {
    LaunchedEffect(Unit) { vm.loadRewards() }
    val r = vm.rewards
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Rewards & Penalties", onBack = { nav.popBackStack() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                RewardChip(Modifier.weight(1f), "🪙", "Gold Coins", r?.goldCoins ?: 0, rupee(r?.coinValue ?: 0), Gold, GoldLight, "earned this month")
                RewardChip(Modifier.weight(1f), "🟥", "Red Cards", r?.redCards ?: 0, "− ${rupee(r?.cardValue ?: 0)}", RedCancel, RedLight, "received this month")
            }
            Card {
                SectionTitle("Gold Coins — bonuses")
                Spacer(Modifier.height(4.dp))
                val items = r?.coinItems ?: emptyList()
                if (items.isEmpty()) Text("No bonuses yet. Start jobs on time to earn coins!", color = TextGray, fontSize = 13.sp, modifier = Modifier.padding(vertical = 8.dp))
                items.forEach {
                    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) { Text(it.label, color = TextDark, fontSize = 14.sp); Text(it.date, color = TextGray, fontSize = 11.sp) }
                        Text("+ ${rupee(it.amount)}", color = GreenSuccess, fontWeight = FontWeight.SemiBold)
                    }
                    Divider(color = Divider)
                }
            }
            Card {
                SectionTitle("Red Cards — penalties")
                Spacer(Modifier.height(4.dp))
                val items = r?.cardItems ?: emptyList()
                if (items.isEmpty()) Text("No penalties. Great work — keep it up!", color = TextGray, fontSize = 13.sp, modifier = Modifier.padding(vertical = 8.dp))
                items.forEach {
                    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) { Text(it.label, color = TextDark, fontSize = 14.sp); Text(it.date, color = TextGray, fontSize = 11.sp) }
                        Text("− ${rupee(it.amount)}", color = RedCancel, fontWeight = FontWeight.SemiBold)
                    }
                    Divider(color = Divider)
                }
            }
        }
    }
}

@Composable
private fun RewardChip(modifier: Modifier, emoji: String, label: String, count: Int, value: String, fg: Color, bg: Color, sub: String) {
    Box(modifier.background(bg, RoundedCornerShape(16.dp)).padding(16.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text(emoji, fontSize = 26.sp)
            Text("$count", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = fg)
            Text(label, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 13.sp)
            Text(value, color = fg, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            Text(sub, color = TextGray, fontSize = 10.sp)
        }
    }
}

/* ============================ MERCH STORE ============================ */
@Composable
fun MerchStoreScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { vm.loadMerch() }
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Merch Store", onBack = { nav.popBackStack() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.fillMaxWidth().background(BrandGradient, RoundedCornerShape(16.dp)).padding(16.dp)) {
                Column {
                    Text("Official HomeHelp gear", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Text("Cost is deducted from your next payout", color = Color.White.copy(alpha = 0.9f), fontSize = 12.sp)
                }
            }
            if (vm.merch.isEmpty()) Text("Loading store…", color = TextGray, modifier = Modifier.padding(16.dp))
            vm.merch.forEach { p ->
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(52.dp).background(PurpleLight, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Text(p.emoji, fontSize = 26.sp) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(p.name, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 15.sp)
                            Text(p.desc, color = TextGray, fontSize = 12.sp)
                            Text(rupee(p.price), color = Purple, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                        OutlineButton("Order", modifier = Modifier.width(96.dp)) {
                            vm.orderMerch(p.id) { msg -> toast(ctx, msg) }
                        }
                    }
                }
            }
        }
    }
}

/* ============================ SHAKTI BONUS ============================ */
@Composable
fun ShaktiBonusScreen(vm: AppViewModel, nav: NavHostController) {
    LaunchedEffect(Unit) { vm.loadShaktiBonus() }
    val s = vm.shaktiBonus
    val medalColors = listOf(Color(0xFFCD7F32), Color(0xFF9AA0AB), Gold)
    val emojis = listOf("🥉", "🥈", "🥇")
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Sitara Bonus", onBack = { nav.popBackStack() })
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.fillMaxWidth().background(BrandGradient, RoundedCornerShape(18.dp)).padding(20.dp)) {
                Column {
                    Text("Sitara Bonus ⭐", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text("A monthly bonus based on the days you work in the month at a great rating. Gold also needs Sundays worked. Resets on the 1st, paid after month-end.", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                }
            }

            // Tier medallions
            Card {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    (s?.tiers ?: emptyList()).forEachIndexed { i, t ->
                        val reached = s != null && s.workingDays >= t.days && s.sundays >= t.sundays && s.ratingMet
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                            Box(
                                Modifier.size(60.dp).background(medalColors.getOrElse(i) { Gold }.copy(alpha = if (reached) 1f else 0.25f), RoundedCornerShape(50)),
                                contentAlignment = Alignment.Center,
                            ) { Text(emojis.getOrElse(i) { "🏅" }, fontSize = 30.sp) }
                            Spacer(Modifier.height(6.dp))
                            Text(t.name, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 13.sp)
                            Text(rupee(t.amount), color = medalColors.getOrElse(i) { Gold }, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            Text("${t.days} days", color = TextGray, fontSize = 10.sp)
                            if (t.sundays > 0) Text("+ ${t.sundays} Sundays", color = TextGray, fontSize = 10.sp)
                        }
                    }
                }
            }

            // Progress this month
            Card {
                SectionTitle("Your progress this month")
                Spacer(Modifier.height(12.dp))
                val goldDays = s?.tiers?.lastOrNull()?.days ?: 28
                val days = s?.workingDays ?: 0
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Working days", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    Text("$days / $goldDays", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(6.dp))
                ProgressBar(days.toFloat() / goldDays, fill = Purple, height = 10)
                Spacer(Modifier.height(16.dp))
                val goldSundays = s?.tiers?.lastOrNull()?.sundays ?: 4
                if (goldSundays > 0) {
                    val sun = s?.sundays ?: 0
                    val sunMet = sun >= goldSundays
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Sundays worked (Gold)", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text("$sun / $goldSundays", color = if (sunMet) GreenSuccess else Gold, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(6.dp))
                    ProgressBar(sun.toFloat() / goldSundays, fill = if (sunMet) GreenSuccess else Gold, height = 10)
                    Spacer(Modifier.height(16.dp))
                }
                val rating = s?.rating ?: 0.0
                val target = s?.ratingTarget ?: 4.5
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Rating achieved", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    Text("$rating / $target ★", color = if (s?.ratingMet == true) GreenSuccess else Gold, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(6.dp))
                ProgressBar((rating / 5.0).toFloat(), fill = if (s?.ratingMet == true) GreenSuccess else Gold, height = 10)
            }

            // Next-step hint
            val hint = when {
                s == null -> "Loading your progress…"
                !s.ratingMet -> "⭐ Improve your rating to ${s.ratingTarget}★+ to unlock the bonus"
                s.nextTier.isNotBlank() -> {
                    val amt = rupee(s.tiers.firstOrNull { it.name == s.nextTier }?.amount ?: 0)
                    val need = mutableListOf<String>()
                    if (s.daysToNext > 0) need.add("${s.daysToNext} more working day${if (s.daysToNext == 1) "" else "s"}")
                    if (s.sundaysToNext > 0) need.add("${s.sundaysToNext} more Sunday${if (s.sundaysToNext == 1) "" else "s"}")
                    if (need.isEmpty()) "You're on track for ${s.nextTier} ($amt)" else "Need ${need.joinToString(" and ")} to reach ${s.nextTier} ($amt)"
                }
                s.currentTier.isNotBlank() -> "🎉 You've reached ${s.currentTier} — the top tier. Great work!"
                else -> "Keep working your shifts to earn your first Sitara Bonus."
            }
            Box(Modifier.fillMaxWidth().background(GoldLight, RoundedCornerShape(12.dp)).padding(14.dp)) {
                Text(hint, color = Color(0xFFB7791F), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            }

            // ---- Terms & Conditions (built from the real tier config) ----
            val target = s?.ratingTarget ?: 4.5
            Card {
                SectionTitle("How it works & Terms")
                Spacer(Modifier.height(6.dp))
                TncRow("🗓️", "Monthly bonus", "Calculated per calendar month. Your progress resets on the 1st and the bonus is paid to your wallet after the month ends.")
                TncRow("🗓️", "Based on working days", "Your tier is decided by the number of days you check in and work during the month. Higher tiers need more working days.")
                TncRow("🙏", "Sundays for Gold", "The Gold tier also requires working a minimum number of Sundays in the month — Sunday shifts are mandatory for Gold.")
                TncRow("⭐", "Rating requirement", "You must maintain a rating of $target★ or higher for the month. Below $target★, no bonus is paid even if the day targets are met.")
                (s?.tiers ?: emptyList()).forEachIndexed { i, t ->
                    val cond = "Work ${t.days} days" + (if (t.sundays > 0) " incl. ${t.sundays} Sundays" else "") + " in the month, at $target★+."
                    TncRow(listOf("🥉", "🥈", "🥇").getOrElse(i) { "🏅" }, "${t.name} — ${rupee(t.amount)}", cond)
                }
                TncRow("💸", "Highest tier only", "You are paid the single highest tier you reach — tier bonuses are not added together.")
                TncRow("ℹ️", "Policy", "Bonus amounts and thresholds are set by HomeHelp and may change. The bonus is credited automatically and is subject to verification and company policy.")
            }

            Text("Last updated on ${s?.lastUpdated ?: "—"}", color = TextMuted, fontSize = 12.sp)
        }
    }
}

// One terms-and-conditions line: emoji + bold title + explanatory body.
@Composable
private fun TncRow(emoji: String, title: String, body: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Text(emoji, fontSize = 16.sp)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
            Text(body, color = TextGray, fontSize = 12.sp, lineHeight = 16.sp)
        }
    }
}

