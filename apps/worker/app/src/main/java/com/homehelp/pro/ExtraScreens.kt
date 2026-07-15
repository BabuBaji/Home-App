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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.MonetizationOn
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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

/* ─────────────────────────── shared UI helpers ─────────────────────────── */

/** Soft-tinted rounded square holding an emoji/glyph — the enterprise "icon chip". */
@Composable
private fun IconChip(emoji: String, bg: Color, size: Int = 44, glyph: Int = 20) {
    Box(
        Modifier.size(size.dp).background(bg, RoundedCornerShape(Radius.field)),
        contentAlignment = Alignment.Center,
    ) { Text(emoji, fontSize = glyph.sp) }
}

/** Feature / benefit line: tinted icon chip + bold title + muted supporting text. */
@Composable
private fun BenefitRow(emoji: String, tint: Color, title: String, body: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = Space.s), verticalAlignment = Alignment.CenterVertically) {
        IconChip(emoji, tint, size = 42, glyph = 19)
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
            Text(body, color = TextGray, fontSize = 12.sp, lineHeight = 16.sp)
        }
    }
}

/** Tinted table header strip (reference rate-card look) — two column captions. */
@Composable
private fun RateTableHeader(left: String, right: String) {
    Row(
        Modifier.fillMaxWidth()
            .background(Primary50, RoundedCornerShape(Radius.field))
            .padding(horizontal = Space.m, vertical = Space.s),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(left, color = TextGray, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        Text(right, color = TextGray, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

/* ============================ RATE CARD ============================ */
@Composable
fun RateCardScreen(vm: AppViewModel, nav: NavHostController) {
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Rate Card", onBack = { nav.popBackStack() })
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            GradientBanner(padding = 20) {
                Text("VISHWAAS", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.xs))
                Text("How you earn on HomeHelp Pro", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
            }
            Card {
                SectionTitle("Per-Job Earnings")
                Text(
                    "You keep 80% of every completed booking. HomeHelp charges a 20% platform fee.",
                    fontSize = 13.sp, color = TextGray, lineHeight = 18.sp,
                )
                Spacer(Modifier.height(Space.m))
                RateTableHeader("Service", "Your share")
                RateRow("Bathroom Cleaning (₹199)", "You earn ₹159")
                HairlineDivider()
                RateRow("Kitchen Cleaning (₹249)", "You earn ₹199")
                HairlineDivider()
                RateRow("Full Home Cleaning (₹499)", "You earn ₹399")
            }
            Card {
                SectionTitle("Bonuses")
                Spacer(Modifier.height(Space.s))
                RateTableHeader("Reward", "Amount")
                RateRow("On-time start bonus", "+ ₹15", GreenSuccess, pill = true)
                HairlineDivider()
                RateRow("Referral bonus", "+ ₹1,500", GreenSuccess, pill = true)
            }
            Card {
                SectionTitle("Penalties")
                Spacer(Modifier.height(Space.s))
                RateTableHeader("Penalty", "Amount")
                RateRow("Late start (OTP not entered in 15 min)", "− ₹15", RedCancel, pill = true)
            }
            Card {
                SectionTitle("FAQs")
                Spacer(Modifier.height(Space.xs))
                Faq("When do I get paid?", "Your 80% share is credited to your wallet the moment you complete a job.")
                Faq("How do I withdraw?", "Use Wallet → Withdraw. Amounts up to ₹2,000 are auto-approved instantly.")
                Faq("What is the on-time bonus?", "Start a job (enter the customer OTP) within 15 minutes of accepting to earn +₹15.")
            }
        }
    }
}

@Composable
private fun RateRow(label: String, value: String, color: Color = TextDark, pill: Boolean = false) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = Space.s),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = TextDark, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(Space.s))
        if (pill) StatusPill(value, bg = color.copy(alpha = 0.12f), fg = color)
        else Text(value, color = color, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}
@Composable
private fun Faq(q: String, a: String) {
    Column(Modifier.padding(vertical = Space.s)) {
        Text(q, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
        Spacer(Modifier.height(2.dp))
        Text(a, color = TextGray, fontSize = 13.sp, lineHeight = 18.sp)
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
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            GradientBanner(padding = 22) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text("🎁", fontSize = 34.sp)
                    Spacer(Modifier.height(Space.s))
                    Text("Refer a friend, both earn", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    Spacer(Modifier.height(Space.xs))
                    Text("Earn ${rupee(r?.bonus ?: 1500)} for every friend who joins", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                }
            }
            Card {
                Text("Your referral code", color = TextGray, fontSize = 12.sp)
                Spacer(Modifier.height(Space.s))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.weight(1f).border(1.5.dp, Purple, RoundedCornerShape(Radius.field)).background(Primary50, RoundedCornerShape(Radius.field)).padding(vertical = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text(r?.code ?: "—", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Purple) }
                    Spacer(Modifier.width(Space.m))
                    Box(
                        Modifier.size(48.dp).background(PurpleLight, RoundedCornerShape(Radius.field))
                            .clickable { r?.code?.let { copyText(ctx, "referral", it) } },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.ContentCopy, "Copy", tint = Purple, modifier = Modifier.size(22.dp)) }
                }
                Spacer(Modifier.height(Space.m))
                PrimaryButton("Share invite") { r?.let { shareText(ctx, it.shareMessage) } }
            }

            // Lifetime earnings — reference "money banner + breakdown" connected surface.
            ElevatedGroup {
                MoneyBanner("Lifetime referral earnings", r?.lifetimeEarnings ?: 0)
                Column(Modifier.background(CardBg).padding(Space.l)) {
                    BreakdownRow("Reward per referral", rupee(r?.bonus ?: 1500), valueColor = GreenSuccess)
                    BreakdownRow("Friends joined", "${r?.referrals?.size ?: 0}", valueColor = Purple)
                }
            }

            Card {
                SectionTitle("How it works")
                Spacer(Modifier.height(Space.xs))
                StepRow(1, "Share your code", "Send your code to friends who want to become a HomeHelp Pro.")
                StepRow(2, "They join & work", "They sign up with your code and complete their first shift.")
                StepRow(3, "You both earn", "₹${r?.bonus ?: 1500} is credited to each of your wallets.")
            }

            // Referral history — activity rows for friends who have already joined.
            val history = r?.referrals ?: emptyList()
            if (history.isNotEmpty()) {
                SectionTitle("Your referrals")
                Column(verticalArrangement = Arrangement.spacedBy(Space.m)) {
                    history.forEach { item ->
                        StatusListRow(
                            icon = Icons.Filled.Check,
                            iconTint = GreenSuccess,
                            iconBg = GreenLight,
                            title = item.label.ifBlank { "Referral" },
                            subtitle = item.date,
                            subtitleColor = TextMuted,
                            value = "+ ${rupee(item.amount)}",
                            valueColor = GreenSuccess,
                        )
                    }
                }
            }
        }
    }
}

/** Numbered step row — violet index badge + title + supporting text. */
@Composable
private fun StepRow(num: Int, title: String, body: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = Space.s), verticalAlignment = Alignment.Top) {
        Box(
            Modifier.size(30.dp).background(PurpleLight, RoundedCornerShape(Radius.pill)),
            contentAlignment = Alignment.Center,
        ) { Text("$num", color = Purple, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
            Text(body, color = TextGray, fontSize = 12.sp, lineHeight = 16.sp)
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
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            GradientBanner(padding = 20) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconChip("🛡️", Color.White.copy(alpha = 0.18f), size = 52, glyph = 28)
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text("HomeHelp Health Card", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                        Spacer(Modifier.height(Space.xs))
                        StatusPill(
                            if (ins?.activated == true) "Active" else "Not activated yet",
                            bg = Color.White.copy(alpha = 0.22f),
                            fg = Color.White,
                        )
                    }
                }
            }
            Card {
                SectionTitle("Coverage")
                Spacer(Modifier.height(Space.xs))
                BenefitRow("🩺", GreenLight, "What's covered", ins?.coverage ?: "—")
                HairlineDivider()
                Spacer(Modifier.height(Space.s))
                BreakdownRow(
                    "Status",
                    if (ins?.activated == true) "Active" else "Not activated",
                    valueColor = if (ins?.activated == true) GreenSuccess else Gold,
                )
                if (!ins?.policyNo.isNullOrBlank()) {
                    LabeledRow("Policy No.", ins?.policyNo)
                }
            }
            Card {
                Text("Need help with a claim?", fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 15.sp)
                Spacer(Modifier.height(2.dp))
                Text("Our team will guide you through the process.", color = TextGray, fontSize = 13.sp)
                Spacer(Modifier.height(Space.m))
                PrimaryButton("Claim Insurance") { showClaim = true }
                Spacer(Modifier.height(Space.s))
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
                    Spacer(Modifier.height(Space.s))
                    OutlinedTextField(
                        value = reason,
                        onValueChange = { reason = it },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(Radius.field),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = FieldFill,
                            unfocusedContainerColor = FieldFill,
                            focusedBorderColor = Purple,
                            unfocusedBorderColor = Color.Transparent,
                            focusedLabelColor = Purple,
                            cursorColor = Purple,
                        ),
                    )
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
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // Reference "Gold Coins / Red Cards" stat tiles.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                MiniStatCard(Modifier.weight(1f), Icons.Filled.MonetizationOn, "${r?.goldCoins ?: 0}", "Gold Coins", Gold, GoldLight)
                MiniStatCard(Modifier.weight(1f), Icons.Filled.Warning, "${r?.redCards ?: 0}", "Red Cards", RedCancel, RedLight)
            }

            // Gold Coins ledger.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                SectionTitle("Gold Coins — bonuses")
                Text("+ ${rupee(r?.coinValue ?: 0)}", color = GreenSuccess, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
            val coinItems = r?.coinItems ?: emptyList()
            if (coinItems.isEmpty()) {
                Card { EmptyState("🪙", "No bonuses yet", "Start jobs on time to earn Gold Coins!") }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(Space.m)) {
                    coinItems.forEach { it ->
                        StatusListRow(
                            icon = Icons.Filled.MonetizationOn,
                            iconTint = GreenSuccess,
                            iconBg = GreenLight,
                            title = it.label,
                            subtitle = it.date,
                            subtitleColor = TextMuted,
                            value = "+ ${rupee(it.amount)}",
                            valueColor = GreenSuccess,
                        )
                    }
                }
            }

            // Red Cards ledger.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                SectionTitle("Red Cards — penalties")
                Text("− ${rupee(r?.cardValue ?: 0)}", color = RedCancel, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
            val cardItems = r?.cardItems ?: emptyList()
            if (cardItems.isEmpty()) {
                Card { EmptyState("✅", "No penalties", "Great work — keep it up!") }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(Space.m)) {
                    cardItems.forEach { it ->
                        StatusListRow(
                            icon = Icons.Filled.Warning,
                            iconTint = RedCancel,
                            iconBg = RedLight,
                            title = it.label,
                            subtitle = it.date,
                            subtitleColor = TextMuted,
                            value = "− ${rupee(it.amount)}",
                            valueColor = RedCancel,
                        )
                    }
                }
            }
            Spacer(Modifier.height(Space.s))
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
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            GradientBanner(padding = 18) {
                Text("Official HomeHelp gear", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Spacer(Modifier.height(Space.xs))
                Text("Cost is deducted from your next payout", color = Color.White.copy(alpha = 0.9f), fontSize = 12.sp)
            }
            if (vm.merch.isEmpty()) {
                EmptyState("🛍️", "Loading store…", "Fetching the latest HomeHelp gear for you.")
            }
            vm.merch.forEach { p ->
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // Rounded product image area (Snabbit-shop style tile).
                        IconChip(p.emoji, Primary50, size = 64, glyph = 30)
                        Spacer(Modifier.width(Space.m))
                        Column(Modifier.weight(1f)) {
                            Text(p.name, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 15.sp)
                            Text(p.desc, color = TextGray, fontSize = 12.sp, lineHeight = 16.sp)
                            Spacer(Modifier.height(Space.xs))
                            Text(rupee(p.price), color = Purple, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        }
                        Spacer(Modifier.width(Space.s))
                        PrimaryButton("Order", modifier = Modifier.width(96.dp)) {
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
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            GradientBanner(padding = 20) {
                Text("Sitara Bonus ⭐", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.xs))
                Text("A monthly bonus based on the days you work in the month at a great rating. Gold also needs Sundays worked. Resets on the 1st, paid after month-end.", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp, lineHeight = 18.sp)
            }

            // Tier medallions
            Card {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    (s?.tiers ?: emptyList()).forEachIndexed { i, t ->
                        val reached = s != null && s.workingDays >= t.days && s.sundays >= t.sundays && s.ratingMet
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                            Box(
                                Modifier.size(60.dp).background(medalColors.getOrElse(i) { Gold }.copy(alpha = if (reached) 1f else 0.25f), RoundedCornerShape(Radius.pill)),
                                contentAlignment = Alignment.Center,
                            ) { Text(emojis.getOrElse(i) { "🏅" }, fontSize = 30.sp) }
                            Spacer(Modifier.height(Space.s))
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
                Spacer(Modifier.height(Space.m))
                val goldDays = s?.tiers?.lastOrNull()?.days ?: 28
                val days = s?.workingDays ?: 0
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Working days", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    Text("$days / $goldDays", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(Space.s))
                ProgressBar(days.toFloat() / goldDays, fill = Purple, height = 10)
                Spacer(Modifier.height(Space.l))
                val goldSundays = s?.tiers?.lastOrNull()?.sundays ?: 4
                if (goldSundays > 0) {
                    val sun = s?.sundays ?: 0
                    val sunMet = sun >= goldSundays
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Sundays worked (Gold)", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text("$sun / $goldSundays", color = if (sunMet) GreenSuccess else Gold, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(Space.s))
                    ProgressBar(sun.toFloat() / goldSundays, fill = if (sunMet) GreenSuccess else Gold, height = 10)
                    Spacer(Modifier.height(Space.l))
                }
                val rating = s?.rating ?: 0.0
                val target = s?.ratingTarget ?: 4.5
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Rating achieved", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    Text("$rating / $target ★", color = if (s?.ratingMet == true) GreenSuccess else Gold, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(Space.s))
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
            Box(Modifier.fillMaxWidth().background(GoldLight, RoundedCornerShape(Radius.field)).padding(Space.l)) {
                Text(hint, color = Color(0xFFB7791F), fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 18.sp)
            }

            // ---- Terms & Conditions (built from the real tier config) ----
            val target = s?.ratingTarget ?: 4.5
            Card {
                SectionTitle("How it works & Terms")
                Spacer(Modifier.height(Space.xs))
                TncRow("🗓️", GoldLight, "Monthly bonus", "Calculated per calendar month. Your progress resets on the 1st and the bonus is paid to your wallet after the month ends.")
                TncRow("🗓️", PurpleLight, "Based on working days", "Your tier is decided by the number of days you check in and work during the month. Higher tiers need more working days.")
                TncRow("🙏", GreenLight, "Sundays for Gold", "The Gold tier also requires working a minimum number of Sundays in the month — Sunday shifts are mandatory for Gold.")
                TncRow("⭐", GoldLight, "Rating requirement", "You must maintain a rating of $target★ or higher for the month. Below $target★, no bonus is paid even if the day targets are met.")
                (s?.tiers ?: emptyList()).forEachIndexed { i, t ->
                    val cond = "Work ${t.days} days" + (if (t.sundays > 0) " incl. ${t.sundays} Sundays" else "") + " in the month, at $target★+."
                    TncRow(listOf("🥉", "🥈", "🥇").getOrElse(i) { "🏅" }, GoldLight, "${t.name} — ${rupee(t.amount)}", cond)
                }
                TncRow("💸", GreenLight, "Highest tier only", "You are paid the single highest tier you reach — tier bonuses are not added together.")
                TncRow("ℹ️", Primary50, "Policy", "Bonus amounts and thresholds are set by HomeHelp and may change. The bonus is credited automatically and is subject to verification and company policy.")
            }

            Text("Last updated on ${s?.lastUpdated ?: "—"}", color = TextMuted, fontSize = 12.sp)
        }
    }
}

// One terms-and-conditions line: tinted icon chip + bold title + explanatory body.
@Composable
private fun TncRow(emoji: String, tint: Color, title: String, body: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = Space.s), verticalAlignment = Alignment.Top) {
        IconChip(emoji, tint, size = 36, glyph = 16)
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
            Text(body, color = TextGray, fontSize = 12.sp, lineHeight = 16.sp)
        }
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * UI CHANGE LOG — ExtraScreens.kt
 * UI-ONLY redesign to a premium gig/partner-app reference look (Urban Company /
 * Snabbit style) rebuilt in OUR violet brand + shared design tokens. No business
 * logic, state, navigation or data flow changed. Every @Composable screen
 * signature is byte-for-byte identical; every vm.* call, remember{} /
 * mutableStateOf / LaunchedEffect, validation, nav route and share/copy/dial
 * action is preserved exactly. Reference-pattern widgets (MoneyBanner,
 * ElevatedGroup, BreakdownRow, StatusListRow, MiniStatCard) are the shared
 * definitions from MoneyScreens.kt — called directly, never redefined.
 *
 * Per-screen improvements:
 *  • RateCard: BrandGradient "VISHWAAS" hero; each rate group is a white Card with a
 *    tinted (Primary50) RateTableHeader strip, HairlineDivider-separated rows and
 *    StatusPill bonus/penalty amounts. Data, percentages and copy are unchanged.
 *  • Refer & Earn: gradient hero with the reward amount; referral code in a tinted
 *    field with a chip copy button + PrimaryButton "Share invite" (same action);
 *    lifetime earnings shown via ElevatedGroup + MoneyBanner + BreakdownRows
 *    (reward per referral / friends joined); "How it works" numbered StepRows; a
 *    new referral-history list rendered as StatusListRow activity rows from the
 *    existing r.referrals data (display only).
 *  • Claim Insurance: gradient hero with status pill; coverage as a tinted
 *    BenefitRow plus a BreakdownRow status line and policy LabeledRow; PrimaryButton
 *    claim CTA + OutlineButton helpline; claim dialog OutlinedTextField restyled
 *    (Radius.field + FieldFill via OutlinedTextFieldDefaults.colors). Claim /
 *    validation / dial logic untouched.
 *  • Rewards: two MiniStatCard tiles side by side (Gold Coins → Gold/GoldLight coin
 *    icon; Red Cards → RedCancel/RedLight warning icon) using Modifier.weight(1f);
 *    each ledger entry rebuilt as a StatusListRow (green coin = bonus, red warning =
 *    penalty) with the month total shown beside each SectionTitle; friendly
 *    EmptyState when a list is empty.
 *  • Merch Store: gradient hero; product cards with a rounded image tile, name/desc,
 *    price in brand violet and a compact PrimaryButton "Order" CTA (order action
 *    unchanged); EmptyState placeholder while loading.
 *  • Sitara (Shakti) Bonus: gradient hero; tier medallions, ProgressBars, hint and
 *    tinted-icon T&C rows retained with tokenised spacing. All eligibility/tier
 *    calculations unchanged.
 *
 * Shared: Space/Radius tokens throughout; leading tinted icon chips; presentational
 * helpers only (IconChip, BenefitRow, RateTableHeader, StepRow, RateRow, Faq,
 * TncRow). Removed now-unused private RewardChip/RewardItemRow (replaced by the
 * shared MiniStatCard/StatusListRow). No functionality, logic or flow changed.
 * ───────────────────────────────────────────────────────────────────────────── */
