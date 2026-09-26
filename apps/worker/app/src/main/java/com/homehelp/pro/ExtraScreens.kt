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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.MonetizationOn
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Redeem
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.Warning
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
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
import com.homehelp.pro.network.MerchProduct

private fun rupee(n: Int) = "₹" + "%,d".format(n)

/** Clean white top bar (back · title · optional trailing action) + hairline — the professional
 *  header used by the white-background screens, in place of the purple gradient [Header]. */
@Composable
private fun WhiteTopBar(title: String, trailing: (@Composable () -> Unit)? = null, onBack: () -> Unit) {
    AppTopBar(title, onBack = onBack, trailing = trailing)
}

/** Share the referral message straight to WhatsApp; falls back to the system share sheet if it
 *  isn't installed (WhatsApp is how most Indian workers actually invite friends). */
private fun shareWhatsApp(ctx: Context, text: String) {
    try {
        ctx.startActivity(Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"; setPackage("com.whatsapp"); putExtra(Intent.EXTRA_TEXT, text)
        })
    } catch (_: Exception) { shareText(ctx, text) }
}

/** Open the SMS composer pre-filled with the referral message. */
private fun shareSms(ctx: Context, text: String) {
    try {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("smsto:")).apply { putExtra("sms_body", text) })
    } catch (_: Exception) { shareText(ctx, text) }
}

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
            Text(tr(title), fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
            Text(tr(body), color = TextGray, fontSize = 12.sp, lineHeight = 16.sp)
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
        Text(tr(left), color = TextGray, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        Text(tr(right), color = TextGray, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

/* ============================ RATE CARD ============================ */
@Composable
fun RateCardScreen(vm: AppViewModel, nav: NavHostController) {
    LaunchedEffect(Unit) { vm.loadRateCard() }
    // Every number below comes from the live settings (GET api/worker/wallet/rate-card).
    val rc = vm.rateCard ?: com.homehelp.pro.network.RateCardDto()
    fun f(template: String, vararg pairs: Pair<String, Any>): String =
        pairs.fold(tr(template)) { acc, (k, v) -> acc.replace("{$k}", v.toString()) }
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header(tr("Rate Card"), onBack = { nav.popBackStack() })
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            GradientBanner(padding = 20) {
                Text(tr("VISHWAAS"), color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.xs))
                Text(tr("How you earn on HomeHelp Pro"), color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
            }
            Card {
                SectionTitle(tr("Per-Job Earnings"))
                Text(
                    if (rc.paysPerJob) f("You keep {share}% of every completed booking. HomeHelp charges a {fee}% platform fee.", "share" to rc.sharePct, "fee" to rc.platformPct)
                    else tr("You are on a fixed monthly salary, paid through payroll. Completed jobs count towards your attendance and bonuses."),
                    fontSize = 13.sp, color = TextGray, lineHeight = 18.sp,
                )
                if (rc.paysPerJob) {
                    Spacer(Modifier.height(Space.m))
                    RateTableHeader(tr("Booking amount"), tr("Your share"))
                    listOf(199, 299, 499).forEach { amt ->
                        RateRow(rupee(amt), f("You earn {amount}", "amount" to rupee(amt * rc.sharePct / 100)))
                        if (amt != 499) HairlineDivider()
                    }
                }
            }
            Card {
                SectionTitle(tr("Bonuses"))
                Spacer(Modifier.height(Space.s))
                RateTableHeader(tr("Reward"), tr("Amount"))
                val rows = buildList {
                    if (rc.startBonus > 0) add(tr("Job start bonus (every job)") to rc.startBonus)
                    if (rc.perJobIncentive > 0) add(tr("Per-job incentive") to rc.perJobIncentive)
                    if (rc.joiningBonus > 0) add(f("Joining bonus — first {jobs} jobs in {days} days", "jobs" to rc.joiningJobs, "days" to rc.joiningDays) to rc.joiningBonus)
                    if (rc.referralBonus > 0) add(f("Referral bonus — friend completes {jobs} jobs", "jobs" to rc.referralJobs) to rc.referralBonus)
                    if (rc.refereeBonus > 0) add(f("Joined with a friend's code — after {jobs} jobs", "jobs" to rc.referralJobs) to rc.refereeBonus)
                }
                if (rows.isEmpty()) Text(tr("No bonuses are running right now."), color = TextGray, fontSize = 13.sp)
                rows.forEachIndexed { i, (label, amt) ->
                    RateRow(label, "+ ${rupee(amt)}", GreenSuccess, pill = true)
                    if (i < rows.lastIndex) HairlineDivider()
                }
            }
            Card {
                SectionTitle(tr("Penalties"))
                Spacer(Modifier.height(Space.xs))
                Text(tr("Late or out-of-zone penalties apply only if your shift plan sets them — see My Shift Plan. Every deduction is listed in your wallet with its reason."),
                    color = TextGray, fontSize = 13.sp, lineHeight = 18.sp)
            }
            Card {
                SectionTitle(tr("FAQs"))
                Spacer(Modifier.height(Space.xs))
                Faq(tr("When do I get paid?"), if (rc.paysPerJob) f("Your {share}% share is credited to your wallet the moment you complete a job.", "share" to rc.sharePct) else tr("Your salary is paid monthly through payroll."))
                Faq(tr("How do I withdraw?"),
                    if (rc.autoApproveBelow > 0) f("Use Wallet → Withdraw (minimum {min}). Amounts up to {auto} are approved instantly.", "min" to rupee(rc.minPayout), "auto" to rupee(rc.autoApproveBelow))
                    else f("Use Wallet → Withdraw (minimum {min}). Your manager approves each request.", "min" to rupee(rc.minPayout)))
                if (rc.joiningBonus > 0) Faq(tr("How does the joining bonus work?"),
                    f("Complete your first {jobs} jobs within {days} days of joining and {amount} is added to your wallet automatically.", "jobs" to rc.joiningJobs, "days" to rc.joiningDays, "amount" to rupee(rc.joiningBonus)))
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
        Text(tr(label), color = TextDark, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(Space.s))
        if (pill) StatusPill(value, bg = color.copy(alpha = 0.12f), fg = color)
        else Text(value, color = color, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}
@Composable
private fun Faq(q: String, a: String) {
    Column(Modifier.padding(vertical = Space.s)) {
        Text(tr(q), fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
        Spacer(Modifier.height(2.dp))
        Text(tr(a), color = TextGray, fontSize = 13.sp, lineHeight = 18.sp)
    }
}

/* ============================ REFER & EARN ============================ */
@Composable
fun ReferEarnScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { vm.loadReferral() }
    val r = vm.referral
    val bonus = r?.bonus ?: 0
    val refereeBonus = r?.refereeBonus ?: 0
    val need = r?.jobsNeeded ?: 10
    val msg = r?.shareMessage ?: ""
    val pink = Color(0xFFEC4899)
    fun f(template: String, vararg pairs: Pair<String, Any>): String =
        pairs.fold(tr(template)) { acc, (k, v) -> acc.replace("{$k}", v.toString()) }
    Column(Modifier.fillMaxSize().background(Color.White)) {
        WhiteTopBar(tr("Refer & Earn")) { nav.popBackStack() }
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // ── Hero: what each side really gets, and when ──
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(60.dp).clip(CircleShape).background(pink.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                        Text("🎁", fontSize = 30.sp)
                    }
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text(if (refereeBonus > 0) tr("Refer a friend, both earn") else tr("Refer a friend and earn"), color = TextDark, fontSize = 16.5.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(3.dp))
                        Text(
                            if (refereeBonus > 0) f("You get {bonus} and your friend gets {friend} when they complete their first {jobs} jobs.", "bonus" to rupee(bonus), "friend" to rupee(refereeBonus), "jobs" to need)
                            else f("You get {bonus} when your friend completes their first {jobs} jobs.", "bonus" to rupee(bonus), "jobs" to need),
                            color = TextGray, fontSize = 12.5.sp, lineHeight = 17.sp,
                        )
                    }
                }
            }

            // ── Referral code + quick share ──
            Card {
                Text(tr("YOUR REFERRAL CODE"), color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                Spacer(Modifier.height(Space.s))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.weight(1f).clip(RoundedCornerShape(Radius.field)).background(Primary50).border(1.5.dp, Purple, RoundedCornerShape(Radius.field)).padding(vertical = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text(r?.code ?: "—", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Purple, letterSpacing = 2.sp) }
                    Spacer(Modifier.width(Space.m))
                    Box(
                        Modifier.size(50.dp).clip(RoundedCornerShape(Radius.field)).background(PurpleLight)
                            .clickable { r?.code?.let { copyText(ctx, "referral", it); toast(ctx, tr("Code copied")) } },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.ContentCopy, "Copy", tint = Purple, modifier = Modifier.size(22.dp)) }
                }
                Spacer(Modifier.height(Space.m))
                Text(tr("Share via"), color = TextGray, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(Space.s))
                Row(Modifier.fillMaxWidth()) {
                    ShareChip(Modifier.weight(1f), Icons.AutoMirrored.Filled.Chat, tr("WhatsApp"), Color(0xFF25D366)) { shareWhatsApp(ctx, msg) }
                    ShareChip(Modifier.weight(1f), Icons.Filled.Sms, tr("SMS"), Color(0xFF3B82F6)) { shareSms(ctx, msg) }
                    ShareChip(Modifier.weight(1f), Icons.Filled.ContentCopy, tr("Copy"), Purple) { r?.code?.let { copyText(ctx, "referral", it); toast(ctx, tr("Code copied")) } }
                    ShareChip(Modifier.weight(1f), Icons.Filled.Share, tr("More"), TextGray) { shareText(ctx, msg) }
                }
            }

            // ── Stats: friends joined with the code · paid out ──
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                MiniStatCard(Modifier.weight(1f), Icons.Filled.Group, "${r?.joinedCount ?: 0}", tr("Joined"), Purple, PurpleLight)
                MiniStatCard(Modifier.weight(1f), Icons.Filled.Redeem, rupee(bonus), tr("Per Friend"), pink, pink.copy(alpha = 0.12f))
                MiniStatCard(Modifier.weight(1f), Icons.Filled.AccountBalanceWallet, rupee(r?.lifetimeEarnings ?: 0), tr("Earned"), GreenSuccess, GreenLight)
            }

            // ── How it works ──
            Card {
                SectionTitle(tr("How it works"))
                Spacer(Modifier.height(Space.xs))
                StepRow(1, tr("Share your code"), tr("Send your code to friends who want to become a HomeHelp Pro."))
                StepRow(2, tr("They join & work"), f("They enter your code in the app within 14 days of joining and complete their first {jobs} jobs.", "jobs" to need))
                StepRow(3, tr("You earn"), if (refereeBonus > 0) f("{bonus} goes to your wallet and {friend} to theirs — automatically.", "bonus" to rupee(bonus), "friend" to rupee(refereeBonus)) else f("{bonus} goes to your wallet automatically.", "bonus" to rupee(bonus)))
            }

            // ── Friends who joined with the code, and their progress ──
            val friends = r?.friends ?: emptyList()
            if (friends.isNotEmpty()) {
                SectionTitle(tr("Friends who joined"))
                Column(verticalArrangement = Arrangement.spacedBy(Space.m)) {
                    friends.forEach { fr ->
                        StatusListRow(
                            icon = if (fr.paid) Icons.Filled.Check else Icons.Filled.Group,
                            iconTint = if (fr.paid) GreenSuccess else Purple,
                            iconBg = if (fr.paid) GreenLight else PurpleLight,
                            title = fr.name,
                            subtitle = if (fr.paid) tr("Bonus paid") else f("{done} of {need} jobs done", "done" to fr.jobs, "need" to fr.jobsNeeded),
                            subtitleColor = TextMuted,
                            value = if (fr.paid) "+ ${rupee(bonus)}" else tr("In progress"),
                            valueColor = if (fr.paid) GreenSuccess else TextMuted,
                        )
                    }
                }
            }

            // ── Were you referred? ──
            if (r?.referredBy != null) {
                Card {
                    SectionTitle(tr("You joined with a friend's code"))
                    Spacer(Modifier.height(Space.xs))
                    Text(
                        when {
                            refereeBonus <= 0 -> f("Referred by {name}.", "name" to r.referredBy)
                            r.refereePaid -> f("Referred by {name}. Your {amount} bonus has been paid.", "name" to r.referredBy, "amount" to rupee(refereeBonus))
                            else -> f("Referred by {name}. {done} of {need} jobs done — {amount} is yours when you reach {need}.", "name" to r.referredBy, "done" to minOf(r.myJobs, need), "need" to need, "amount" to rupee(refereeBonus))
                        },
                        color = TextGray, fontSize = 13.sp, lineHeight = 18.sp,
                    )
                }
            } else if (r?.canApplyCode != false) {
                Card {
                    SectionTitle(tr("Were you referred?"))
                    if (refereeBonus > 0) {
                        Spacer(Modifier.height(2.dp))
                        Text(f("Enter your friend's code to get {amount} after your first {jobs} jobs.", "amount" to rupee(refereeBonus), "jobs" to need), color = TextGray, fontSize = 12.5.sp)
                    }
                    Spacer(Modifier.height(Space.xs))
                    var code by remember { mutableStateOf("") }
                    var busy by remember { mutableStateOf(false) }
                    androidx.compose.material3.OutlinedTextField(
                        value = code, onValueChange = { code = it.uppercase().take(12) }, singleLine = true,
                        placeholder = { Text(tr("Friend's code, e.g. HHP1042")) }, modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(Space.s))
                    PrimaryButton(if (busy) tr("Applying…") else tr("Apply code"), enabled = code.length >= 4 && !busy, loading = busy) {
                        busy = true
                        vm.applyReferral(code) { err -> busy = false; toast(ctx, err ?: tr("Code applied — you both earn when you complete your first jobs")) }
                    }
                }
            }
        }
    }
}

/** One circular quick-share action (icon chip + label) for the referral card. */
@Composable
private fun ShareChip(modifier: Modifier, icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(14.dp)).clickable { onClick() }.padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(46.dp).clip(CircleShape).background(tint.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text(tr(label), color = TextDark, fontSize = 11.sp, fontWeight = FontWeight.Medium, maxLines = 1)
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
            Text(tr(title), fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
            Text(tr(body), color = TextGray, fontSize = 12.sp, lineHeight = 16.sp)
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
        Header(tr("Health Card"), onBack = { nav.popBackStack() })
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            GradientBanner(padding = 20) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconChip("🛡️", Color.White.copy(alpha = 0.18f), size = 52, glyph = 28)
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text(tr("HomeHelp Health Card"), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                        Spacer(Modifier.height(Space.xs))
                        StatusPill(
                            if (ins?.activated == true) tr("Active") else tr("Not activated yet"),
                            bg = Color.White.copy(alpha = 0.22f),
                            fg = Color.White,
                        )
                    }
                }
            }
            Card {
                SectionTitle(tr("Coverage"))
                Spacer(Modifier.height(Space.xs))
                BenefitRow("🩺", GreenLight, tr("What's covered"), ins?.coverage ?: "—")
                HairlineDivider()
                Spacer(Modifier.height(Space.s))
                BreakdownRow(
                    tr("Status"),
                    if (ins?.activated == true) "Active" else "Not activated",
                    valueColor = if (ins?.activated == true) GreenSuccess else Gold,
                )
                if (!ins?.policyNo.isNullOrBlank()) {
                    LabeledRow(tr("Policy No."), ins?.policyNo)
                }
            }
            Card {
                Text(tr("Need help with a claim?"), fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 15.sp)
                Spacer(Modifier.height(2.dp))
                Text(tr("Our team will guide you through the process."), color = TextGray, fontSize = 13.sp)
                Spacer(Modifier.height(Space.m))
                PrimaryButton(tr("Claim Insurance")) { showClaim = true }
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
                }) { Text(tr("Submit"), color = Purple, fontWeight = FontWeight.Bold) }
            },
            dismissButton = { TextButton(onClick = { showClaim = false }) { Text(tr("Cancel"), color = TextGray) } },
            title = { Text(tr("Raise a claim"), fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text(tr("Briefly describe your claim:"), color = TextGray, fontSize = 13.sp)
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
    var period by remember { mutableStateOf("This Month") }
    val thisYM = remember { java.text.SimpleDateFormat("yyyy-MM", java.util.Locale.getDefault()).format(java.util.Date()) }

    // Period-aware figures: "This Month" filters the ledgers by date; "All Time" uses the server totals.
    val monthly = period == "This Month"
    val coins = (r?.coinItems ?: emptyList()).let { if (monthly) it.filter { i -> i.date.startsWith(thisYM) } else it }
    val cards = (r?.cardItems ?: emptyList()).let { if (monthly) it.filter { i -> i.date.startsWith(thisYM) } else it }
    val coinVal = if (monthly) coins.sumOf { it.amount } else (r?.coinValue ?: 0)
    val cardVal = if (monthly) cards.sumOf { it.amount } else (r?.cardValue ?: 0)
    val goldCount = if (monthly) coins.size else (r?.goldCoins ?: 0)
    val redCount = if (monthly) cards.size else (r?.redCards ?: 0)
    val net = coinVal - cardVal
    val bonusPct = coinVal.toFloat() / (coinVal + cardVal).coerceAtLeast(1)

    Column(Modifier.fillMaxSize().background(Color.White)) {
        WhiteTopBar(tr("Rewards & Penalties")) { nav.popBackStack() }
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // ── Period toggle ──
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.button)).background(FieldFill).padding(4.dp)) {
                listOf("This Month", "All Time").forEach { p ->
                    val on = p == period
                    Box(
                        Modifier.weight(1f).clip(RoundedCornerShape(Radius.button - 2.dp)).background(if (on) Color.White else Color.Transparent).clickable { period = p }.padding(vertical = 9.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text(tr(p), color = if (on) Purple else TextGray, fontSize = 13.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Medium) }
                }
            }

            // ── Net rewards hero + bonus/penalty balance bar ──
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(tr("Net Rewards"), color = TextGray, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        Spacer(Modifier.height(4.dp))
                        Text((if (net >= 0) "+ " else "− ") + rupee(kotlin.math.abs(net)), color = if (net >= 0) GreenSuccess else RedCancel, fontSize = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.8).sp)
                        Spacer(Modifier.height(2.dp))
                        Text("${rupee(coinVal)} earned · ${rupee(cardVal)} in penalties", color = TextGray, fontSize = 12.sp)
                    }
                    Box(Modifier.size(54.dp).clip(CircleShape).background(GoldLight), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.MonetizationOn, contentDescription = null, tint = Gold, modifier = Modifier.size(28.dp))
                    }
                }
                Spacer(Modifier.height(Space.m))
                Box(Modifier.fillMaxWidth().height(9.dp).clip(RoundedCornerShape(Radius.pill)).background(RedLight)) {
                    Box(Modifier.fillMaxWidth(bonusPct).height(9.dp).clip(RoundedCornerShape(Radius.pill)).background(GreenSuccess))
                }
                Spacer(Modifier.height(6.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(tr("Bonuses") + " ${rupee(coinVal)}", color = GreenSuccess, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                    Text(tr("Penalties") + " ${rupee(cardVal)}", color = RedCancel, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                }
            }

            // ── Count tiles ──
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                MiniStatCard(Modifier.weight(1f), Icons.Filled.MonetizationOn, "$goldCount", tr("Gold Coins"), Gold, GoldLight)
                MiniStatCard(Modifier.weight(1f), Icons.Filled.Warning, "$redCount", tr("Red Cards"), RedCancel, RedLight)
            }

            // ── Tips (earn more · avoid penalties) ──
            Card {
                Text(tr("Ways to earn more & avoid penalties"), color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.s))
                TipRow(GreenSuccess, tr("Start each job within 15 minutes for a ₹15 on-time bonus."))
                TipRow(GreenSuccess, tr("Keep a great rating to unlock the monthly Sitara Bonus."))
                TipRow(RedCancel, tr("Check in on time — a late shift check-in costs ₹50."))
                TipRow(RedCancel, tr("Avoid cancelling accepted jobs to prevent Red Cards."))
            }

            // ── Gold Coins ledger ──
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                SectionTitle(tr("Gold Coins — bonuses"))
                Text("+ ${rupee(coinVal)}", color = GreenSuccess, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
            if (coins.isEmpty()) {
                Card { EmptyState("🪙", "No bonuses ${if (monthly) "this month" else "yet"}", tr("Start jobs on time to earn Gold Coins!")) }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(Space.s)) {
                    coins.forEach { c ->
                        StatusListRow(Icons.Filled.MonetizationOn, GreenSuccess, GreenLight, c.label, c.date, TextMuted, "+ ${rupee(c.amount)}", GreenSuccess)
                    }
                }
            }

            // ── Red Cards ledger ──
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                SectionTitle(tr("Red Cards — penalties"))
                Text("− ${rupee(cardVal)}", color = RedCancel, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
            if (cards.isEmpty()) {
                Card { EmptyState("✅", "No penalties ${if (monthly) "this month" else ""}", tr("Great work — keep it up!")) }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(Space.s)) {
                    cards.forEach { c ->
                        StatusListRow(Icons.Filled.Warning, RedCancel, RedLight, c.label, c.date, TextMuted, "− ${rupee(c.amount)}", RedCancel)
                    }
                }
            }
            Spacer(Modifier.height(Space.s))
        }
    }
}

/** A single coloured-dot tip line in the Rewards "ways to earn / avoid penalties" card. */
@Composable
private fun TipRow(dot: Color, text: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = 5.dp).size(7.dp).clip(CircleShape).background(dot))
        Spacer(Modifier.width(Space.m))
        Text(tr(text), color = TextGray, fontSize = 12.5.sp, lineHeight = 17.sp, modifier = Modifier.weight(1f))
    }
}

/* ============================ MERCH STORE ============================ */
@Composable
fun MerchStoreScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { vm.loadMerch() }
    // Local cart: productId -> quantity. Checkout places one order per unit.
    val cart = remember { mutableStateMapOf<String, Int>() }
    val cartCount = cart.values.sum()
    val cartTotal = vm.merch.sumOf { (cart[it.id] ?: 0) * it.price }

    Column(Modifier.fillMaxSize().background(Color.White)) {
        WhiteTopBar(tr("Merch Store"), trailing = {
            Box(Modifier.clip(CircleShape).padding(4.dp)) {
                Icon(Icons.Filled.ShoppingCart, contentDescription = tr("Cart"), tint = TextDark, modifier = Modifier.size(23.dp))
                if (cartCount > 0) {
                    Box(
                        Modifier.align(Alignment.TopEnd).offset(x = 6.dp, y = (-5).dp).size(16.dp).clip(CircleShape).background(Purple),
                        contentAlignment = Alignment.Center,
                    ) { Text("${cartCount.coerceAtMost(9)}", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold) }
                }
            }
        }) { nav.popBackStack() }

        Box(Modifier.weight(1f)) {
            Column(
                Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
                verticalArrangement = Arrangement.spacedBy(Space.m),
            ) {
                // ── Hero banner (white with purple accent) ──
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Primary50).padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(44.dp).clip(RoundedCornerShape(13.dp)).background(PurpleLight), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Storefront, contentDescription = null, tint = Purple, modifier = Modifier.size(24.dp))
                    }
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text(tr("Official HomeHelp Gear"), color = TextDark, fontSize = 14.5.sp, fontWeight = FontWeight.Bold)
                        Text(tr("Order now · cost is adjusted from your next payout."), color = TextGray, fontSize = 12.sp, lineHeight = 16.sp)
                    }
                }

                if (vm.merch.isEmpty()) {
                    EmptyState("🛍️", tr("Loading store…"), tr("Fetching the latest HomeHelp gear for you."))
                } else {
                    // ── 2-column product grid ──
                    vm.merch.chunked(2).forEach { rowItems ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                            rowItems.forEach { p ->
                                MerchTile(
                                    Modifier.weight(1f), p, cart[p.id] ?: 0,
                                    onAdd = { cart[p.id] = (cart[p.id] ?: 0) + 1 },
                                    onDec = { val q = (cart[p.id] ?: 0) - 1; if (q <= 0) cart.remove(p.id) else cart[p.id] = q },
                                )
                            }
                            if (rowItems.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
                Spacer(Modifier.height(if (cartCount > 0) 80.dp else Space.s))
            }

            // ── Floating cart bar ──
            if (cartCount > 0) {
                Surface(
                    Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
                    color = Color.White, shadowElevation = 14.dp,
                ) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = Space.l, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("$cartCount item${if (cartCount > 1) "s" else ""} in cart", color = TextGray, fontSize = 12.sp)
                            Text(rupee(cartTotal), color = TextDark, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                        }
                        PrimaryButton(tr("Place Order"), modifier = Modifier.width(160.dp)) {
                            val count = cartCount
                            cart.forEach { (id, qty) -> repeat(qty) { vm.orderMerch(id) {} } }
                            toast(ctx, "Order placed! $count item${if (count > 1) "s" else ""} — deducted from your next payout")
                            cart.clear()
                        }
                    }
                }
            }
        }
    }
}

/** One product tile in the merch grid — image, name, price and an Add / quantity-stepper control. */
@Composable
private fun MerchTile(modifier: Modifier, p: MerchProduct, qty: Int, onAdd: () -> Unit, onDec: () -> Unit) {
    Card(modifier = modifier) {
        Box(Modifier.fillMaxWidth().height(84.dp).clip(RoundedCornerShape(14.dp)).background(Primary50), contentAlignment = Alignment.Center) {
            Text(p.emoji, fontSize = 40.sp)
        }
        Spacer(Modifier.height(Space.s))
        Text(p.name, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        Spacer(Modifier.height(2.dp))
        Text(p.desc, color = TextGray, fontSize = 11.sp, lineHeight = 14.sp, minLines = 2, maxLines = 2)
        Spacer(Modifier.height(Space.s))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(rupee(p.price), color = Purple, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            if (qty == 0) {
                Box(
                    Modifier.clip(RoundedCornerShape(10.dp)).background(Purple).clickable { onAdd() }.padding(horizontal = 14.dp, vertical = 7.dp),
                ) { Text(tr("Add"), color = Color.White, fontSize = 12.5.sp, fontWeight = FontWeight.Bold) }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StepBtn(Icons.Filled.Remove, onDec)
                    Text("$qty", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 10.dp))
                    StepBtn(Icons.Filled.Add, onAdd)
                }
            }
        }
    }
}

/** Small circular +/- button for the merch quantity stepper. */
@Composable
private fun StepBtn(icon: ImageVector, onClick: () -> Unit) {
    Box(Modifier.size(28.dp).clip(CircleShape).background(PurpleLight).clickable { onClick() }, contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
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
        Header(tr("Sitara Bonus"), onBack = { nav.popBackStack() })
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            GradientBanner(padding = 20) {
                Text(tr("Sitara Bonus ⭐"), color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.xs))
                Text(tr("A monthly bonus based on the days you work in the month at a great rating. Gold also needs Sundays worked. Resets on the 1st, paid after month-end."), color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp, lineHeight = 18.sp)
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
                            Text("${t.days} " + tr("days"), color = TextGray, fontSize = 10.sp)
                            if (t.sundays > 0) Text("+ ${t.sundays} " + tr("Sundays"), color = TextGray, fontSize = 10.sp)
                        }
                    }
                }
            }

            // Progress this month
            Card {
                SectionTitle(tr("Your progress this month"))
                Spacer(Modifier.height(Space.m))
                val goldDays = s?.tiers?.lastOrNull()?.days ?: 28
                val days = s?.workingDays ?: 0
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(tr("Working days"), color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Medium)
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
                        Text(tr("Sundays worked (Gold)"), color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text("$sun / $goldSundays", color = if (sunMet) GreenSuccess else Gold, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(Space.s))
                    ProgressBar(sun.toFloat() / goldSundays, fill = if (sunMet) GreenSuccess else Gold, height = 10)
                    Spacer(Modifier.height(Space.l))
                }
                val rating = s?.rating ?: 0.0
                val target = s?.ratingTarget ?: 4.5
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(tr("Rating achieved"), color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    Text("$rating / $target ★", color = if (s?.ratingMet == true) GreenSuccess else Gold, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(Space.s))
                ProgressBar((rating / 5.0).toFloat(), fill = if (s?.ratingMet == true) GreenSuccess else Gold, height = 10)
            }

            // Next-step hint
            val hint = when {
                s == null -> tr("Loading your progress…")
                !s.ratingMet -> "⭐ Improve your rating to ${s.ratingTarget}★+ to unlock the bonus"
                s.nextTier.isNotBlank() -> {
                    val amt = rupee(s.tiers.firstOrNull { it.name == s.nextTier }?.amount ?: 0)
                    val need = mutableListOf<String>()
                    if (s.daysToNext > 0) need.add("${s.daysToNext} more working day${if (s.daysToNext == 1) "" else "s"}")
                    if (s.sundaysToNext > 0) need.add("${s.sundaysToNext} more Sunday${if (s.sundaysToNext == 1) "" else "s"}")
                    if (need.isEmpty()) "You're on track for ${s.nextTier} ($amt)" else "Need ${need.joinToString(" and ")} to reach ${s.nextTier} ($amt)"
                }
                s.currentTier.isNotBlank() -> "🎉 You've reached ${s.currentTier} — the top tier. Great work!"
                else -> tr("Keep working your shifts to earn your first Sitara Bonus.")
            }
            Box(Modifier.fillMaxWidth().background(GoldLight, RoundedCornerShape(Radius.field)).padding(Space.l)) {
                Text(tr(hint), color = Color(0xFFB7791F), fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 18.sp)
            }

            // ---- Terms & Conditions (built from the real tier config) ----
            val target = s?.ratingTarget ?: 4.5
            Card {
                SectionTitle(tr("How it works & Terms"))
                Spacer(Modifier.height(Space.xs))
                TncRow("🗓️", GoldLight, tr("Monthly bonus"), tr("Calculated per calendar month. Your progress resets on the 1st and the bonus is paid to your wallet after the month ends."))
                TncRow("🗓️", PurpleLight, tr("Based on working days"), tr("Your tier is decided by the number of days you check in and work during the month. Higher tiers need more working days."))
                TncRow("🙏", GreenLight, tr("Sundays for Gold"), tr("The Gold tier also requires working a minimum number of Sundays in the month — Sunday shifts are mandatory for Gold."))
                TncRow("⭐", GoldLight, tr("Rating requirement"), "You must maintain a rating of $target★ or higher for the month. Below $target★, no bonus is paid even if the day targets are met.")
                (s?.tiers ?: emptyList()).forEachIndexed { i, t ->
                    val cond = "Work ${t.days} days" + (if (t.sundays > 0) " incl. ${t.sundays} Sundays" else "") + " in the month, at $target★+."
                    TncRow(listOf("🥉", "🥈", "🥇").getOrElse(i) { "🏅" }, GoldLight, "${t.name} — ${rupee(t.amount)}", cond)
                }
                TncRow("💸", GreenLight, tr("Highest tier only"), tr("You are paid the single highest tier you reach — tier bonuses are not added together."))
                TncRow("ℹ️", Primary50, tr("Policy"), tr("Bonus amounts and thresholds are set by HomeHelp and may change. The bonus is credited automatically and is subject to verification and company policy."))
            }

            Text(tr("Last updated on") + " ${s?.lastUpdated ?: "—"}", color = TextMuted, fontSize = 12.sp)
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
            Text(tr(title), fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
            Text(tr(body), color = TextGray, fontSize = 12.sp, lineHeight = 16.sp)
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

/** Home card: progress toward the new-worker joining bonus ("3 of 5 jobs · 18 days left"). */
@Composable
fun JoiningBonusCard(jb: com.homehelp.pro.network.JoiningBonusDto, onClick: () -> Unit) {
    val daysLeft = jb.deadline?.let { d ->
        runCatching {
            // minSdk 24: no java.time without desugaring, so parse the ISO instant by hand.
            val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
            val ms = fmt.parse(d.take(19))!!.time
            ((ms - System.currentTimeMillis()) / 86_400_000L).toInt().coerceAtLeast(0)
        }.getOrNull()
    }
    val need = jb.jobsNeeded.coerceAtLeast(1)
    val done = jb.jobsDone.coerceIn(0, need)
    Card(Modifier.clickable { onClick() }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).clip(CircleShape).background(GreenLight), contentAlignment = Alignment.Center) { Text("🎉", fontSize = 22.sp) }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text(tr("Joining bonus").plus(" · ").plus(rupee(jb.amount)), color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Text(
                    tr("{done} of {need} jobs done").replace("{done}", "$done").replace("{need}", "$need") +
                        (daysLeft?.let { " · " + tr("{days} days left").replace("{days}", "$it") } ?: ""),
                    color = TextGray, fontSize = 12.5.sp,
                )
            }
        }
        Spacer(Modifier.height(Space.s))
        androidx.compose.material3.LinearProgressIndicator(
            progress = { done.toFloat() / need },
            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
            color = GreenSuccess, trackColor = GreenLight,
        )
    }
}
