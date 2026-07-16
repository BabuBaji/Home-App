package com.homehelp.pro

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Surface
import androidx.compose.ui.window.Dialog
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.PrivacyTip
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.filled.WorkOutline
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

// ─────────────────────────────────────────────────────────────────────────────
// Shared scaffolding & small building blocks for the profile detail screens.
// Presentational only — no business logic lives here.
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun DetailScaffold(title: String, nav: NavHostController, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header(title, onBack = { nav.popBackStack() })
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) { content() }
    }
}

/** Soft filled text-field colours — enterprise "grey fill, violet focus" look. */
@Composable
private fun softFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedContainerColor = FieldFill,
    unfocusedContainerColor = FieldFill,
    focusedBorderColor = Purple,
    unfocusedBorderColor = Color.Transparent,
    focusedLabelColor = Purple,
    cursorColor = Purple,
)

@Composable
private fun Field(label: String, value: String, keyboard: KeyboardType = KeyboardType.Text, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(Radius.field),
        colors = softFieldColors(),
    )
}

/** A bank shown in the picker: display name, short badge code, and brand-ish badge colour. */
private data class BankOption(val name: String, val code: String, val color: Long)

private val INDIAN_BANKS = listOf(
    BankOption("State Bank of India", "SBI", 0xFF2A4DA8),
    BankOption("HDFC Bank", "HDFC", 0xFF004C8F),
    BankOption("ICICI Bank", "ICICI", 0xFFAE282E),
    BankOption("Axis Bank", "AXIS", 0xFF97144D),
    BankOption("Kotak Mahindra Bank", "KOTAK", 0xFFE4002B),
    BankOption("Punjab National Bank", "PNB", 0xFFA1132E),
    BankOption("Bank of Baroda", "BOB", 0xFFEF5A28),
    BankOption("Canara Bank", "CNRB", 0xFF00558C),
    BankOption("Union Bank of India", "UBI", 0xFFC8102E),
    BankOption("Bank of India", "BOI", 0xFFF37021),
    BankOption("IndusInd Bank", "INDS", 0xFF9B1B30),
    BankOption("YES Bank", "YES", 0xFF00518F),
    BankOption("IDFC FIRST Bank", "IDFC", 0xFF9C1D26),
    BankOption("IDBI Bank", "IDBI", 0xFF006A4E),
    BankOption("Federal Bank", "FDRL", 0xFFF9A01B),
    BankOption("Indian Bank", "INDB", 0xFF00355F),
    BankOption("Central Bank of India", "CBI", 0xFF7A1F2B),
    BankOption("Indian Overseas Bank", "IOB", 0xFF003D7C),
    BankOption("UCO Bank", "UCO", 0xFF1A4E8A),
    BankOption("Bank of Maharashtra", "BOM", 0xFFF6A21E),
    BankOption("Punjab & Sind Bank", "PSB", 0xFF6A1B9A),
    BankOption("RBL Bank", "RBL", 0xFFE4002B),
    BankOption("Bandhan Bank", "BDN", 0xFFDA291C),
    BankOption("AU Small Finance Bank", "AU", 0xFF6D2077),
    BankOption("South Indian Bank", "SIB", 0xFFC8102E),
    BankOption("Karnataka Bank", "KBL", 0xFFED1C24),
    BankOption("Karur Vysya Bank", "KVB", 0xFF00518F),
    BankOption("City Union Bank", "CUB", 0xFF003D7C),
    BankOption("DCB Bank", "DCB", 0xFF00A0DF),
    BankOption("Jammu & Kashmir Bank", "JKB", 0xFF6A1B9A),
    BankOption("Tamilnad Mercantile Bank", "TMB", 0xFF00518F),
    BankOption("CSB Bank", "CSB", 0xFF00355F),
    BankOption("Dhanlaxmi Bank", "DLB", 0xFFED1C24),
    BankOption("Paytm Payments Bank", "PYTM", 0xFF00BAF2),
    BankOption("Airtel Payments Bank", "ARTL", 0xFFE4002B),
    BankOption("India Post Payments Bank", "IPPB", 0xFFAE282E),
    BankOption("Equitas Small Finance Bank", "EQTS", 0xFF6D2077),
    BankOption("Ujjivan Small Finance Bank", "UJVN", 0xFF00518F),
    BankOption("Jana Small Finance Bank", "JANA", 0xFFE4002B),
    BankOption("Standard Chartered Bank", "SCB", 0xFF1A4E8A),
    BankOption("HSBC Bank", "HSBC", 0xFFDB0011),
    BankOption("Citibank", "CITI", 0xFF003B70),
    BankOption("DBS Bank", "DBS", 0xFFE4002B),
)

/** Loose check that the selected bank name and the IFSC's bank name refer to the same bank. */
private fun bankMatches(selected: String, ifscBank: String): Boolean {
    fun norm(s: String) = s.lowercase().replace("bank", "").filter { it.isLetterOrDigit() || it == ' ' }.trim()
    val a = norm(selected); val b = norm(ifscBank)
    if (a.isBlank() || b.isBlank()) return true
    return a.contains(b) || b.contains(a) || a.split(" ")[0] == b.split(" ")[0]
}

/** Circular badge with the bank's short code on its brand colour (no external logo assets). */
@Composable
private fun BankBadge(code: String, color: Long, size: Int = 34) {
    Box(Modifier.size(size.dp).clip(CircleShape).background(Color(color)), contentAlignment = Alignment.Center) {
        Text(code, color = Color.White, fontSize = if (code.length >= 4) 9.sp else 11.sp, fontWeight = FontWeight.Bold)
    }
}

/** Searchable bank selector — a field that opens a dialog with a search box + badge list. */
@Composable
private fun BankPickerField(selected: String, onSelect: (BankOption) -> Unit) {
    var open by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val chosen = INDIAN_BANKS.firstOrNull { it.name == selected }
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).background(FieldFill)
            .clickable { open = true }.padding(Space.m),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (chosen != null) { BankBadge(chosen.code, chosen.color, 28); Spacer(Modifier.width(Space.s)) }
            Text(selected.ifBlank { "Select your bank" }, color = if (selected.isBlank()) TextMuted else TextDark, modifier = Modifier.weight(1f))
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null, tint = TextGray)
        }
    }
    if (open) {
        Dialog(onDismissRequest = { open = false; query = "" }) {
            Surface(shape = RoundedCornerShape(16.dp), color = Color.White) {
                Column(Modifier.padding(Space.m).heightIn(max = 520.dp)) {
                    Text("Select Bank", fontWeight = FontWeight.SemiBold, color = TextDark)
                    Spacer(Modifier.height(Space.s))
                    OutlinedTextField(
                        value = query, onValueChange = { query = it },
                        label = { Text("Search bank") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(Radius.field), colors = softFieldColors(),
                    )
                    Spacer(Modifier.height(Space.s))
                    val filtered = INDIAN_BANKS.filter { it.name.contains(query, true) || it.code.contains(query, true) }
                    LazyColumn(Modifier.heightIn(max = 380.dp)) {
                        items(filtered) { b ->
                            Row(
                                Modifier.fillMaxWidth().clickable { onSelect(b); open = false; query = "" }.padding(vertical = Space.s),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                BankBadge(b.code, b.color)
                                Spacer(Modifier.width(Space.m))
                                Text(b.name, color = TextDark, fontSize = 14.sp)
                            }
                        }
                        if (filtered.isEmpty()) item { Text("No banks match \"$query\"", color = TextGray, modifier = Modifier.padding(Space.m)) }
                    }
                }
            }
        }
    }
}

/** Tinted rounded icon chip used as the leading element of list/toggle/nav rows. */
@Composable
private fun IconChip(icon: ImageVector, tint: Color, bg: Color, size: Int = 38) {
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape(Radius.field)).background(bg),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size((size * 0.55).dp))
    }
}

/** Row with a tinted leading icon, label/subtitle and a trailing Material3 Switch. */
@Composable
private fun ToggleRow(
    icon: ImageVector,
    tint: Color,
    bg: Color,
    label: String,
    subtitle: String? = null,
    checked: Boolean,
    trackColor: Color = Purple,
    onChange: (Boolean) -> Unit,
) {
    Row(Modifier.fillMaxWidth().padding(vertical = Space.s), verticalAlignment = Alignment.CenterVertically) {
        IconChip(icon, tint, bg)
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text(label, color = TextDark, fontWeight = FontWeight.Medium, fontSize = 14.sp)
            if (subtitle != null) Text(subtitle, color = TextGray, fontSize = 12.sp)
        }
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedTrackColor = trackColor),
        )
    }
}

/** Tappable navigation row with a tinted leading icon and trailing chevron. */
@Composable
private fun NavRow(
    icon: ImageVector,
    tint: Color,
    bg: Color,
    label: String,
    subtitle: String? = null,
    labelColor: Color = TextDark,
    onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = Space.m),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconChip(icon, tint, bg)
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text(label, color = labelColor, fontWeight = FontWeight.Medium, fontSize = 14.sp)
            if (subtitle != null) Text(subtitle, color = TextGray, fontSize = 12.sp)
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(22.dp))
    }
}

@Composable
fun PersonalInfoScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    DetailScaffold("Personal Information", nav) {
        // Identity hero — avatar, name, rating and earned tier.
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(vm.workerName.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString(""), size = 60)
                Spacer(Modifier.width(Space.m))
                Column(Modifier.weight(1f)) {
                    Text(vm.workerName, fontWeight = FontWeight.Bold, color = TextDark, fontSize = 18.sp)
                    Spacer(Modifier.height(Space.xs))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (vm.jobsCompleted > 0) {
                            RatingStars(vm.workerRating)
                            Spacer(Modifier.width(Space.s))
                        }
                        Text("${vm.jobsCompleted} jobs", fontSize = 12.sp, color = TextGray)
                    }
                    Spacer(Modifier.height(Space.s))
                    TierBadge(vm.tier)
                }
            }
        }
        // Editable contact details.
        Card {
            SectionLabel("Contact Details")
            Spacer(Modifier.height(Space.m))
            Column(verticalArrangement = Arrangement.spacedBy(Space.m)) {
                Field("Full Name", vm.workerName) { vm.workerName = it }
                Field("Mobile Number", vm.workerPhone) { vm.workerPhone = it }
                Field("Email", vm.workerEmail) { vm.workerEmail = it }
                Field("City", vm.workerCity) { vm.workerCity = it }
            }
        }
        PrimaryButton("Save Changes") { vm.saveProfile(); toast(ctx, "Profile updated") }
    }
}

/** Resolve a human-readable file name for a picked content Uri. */
private fun pickedFileName(ctx: Context, uri: Uri): String {
    var name = uri.lastPathSegment ?: "document"
    try {
        ctx.contentResolver.query(uri, null, null, null, null)?.use { c ->
            val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && c.moveToFirst()) c.getString(idx)?.let { name = it }
        }
    } catch (_: Exception) {
    }
    return name
}

@Composable
fun DocumentsScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    // Which document the picker was opened for (each row shares one launcher).
    var pendingDoc by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        val docName = pendingDoc
        if (uri != null && docName != null) {
            // Hand the Uri over so the BYTES get uploaded. Previously only the display name was
            // taken and the Uri discarded, so nothing was ever actually sent — and it toasted
            // "uploaded" before the request had even been made.
            vm.uploadDocument(ctx, docName, pickedFileName(ctx, uri), uri)
        } else if (docName != null) {
            toast(ctx, "Upload cancelled")
        }
        pendingDoc = null
    }
    // Report the real outcome (wrong file type, too large, storage unreachable).
    LaunchedEffect(vm.uploadError) { vm.uploadError?.let { toast(ctx, it); vm.clearUploadError() } }

    DetailScaffold("Documents", nav) {
        Card(padding = Dp16.S) {
            Row(Modifier.padding(Space.xs), verticalAlignment = Alignment.CenterVertically) {
                IconChip(Icons.Filled.Info, Purple, PurpleLight)
                Spacer(Modifier.width(Space.m))
                Text(
                    "Upload a clear photo or PDF scan for each document. Files are reviewed within 24–48 hours.",
                    fontSize = 12.sp, color = TextGray, lineHeight = 17.sp,
                )
            }
        }
        // One tap-through row per document — status colour tells verified / pending / missing
        // at a glance, and tapping the row opens the picker (upload / replace) as before.
        vm.documents.forEach { doc ->
            val hasFile = doc.fileName.isNotBlank()
            val icon: ImageVector
            val tint: Color
            val bg: Color
            val subtitle: String
            when {
                doc.status == "Verified" -> {
                    icon = Icons.Filled.CheckCircle; tint = GreenSuccess; bg = GreenLight
                    subtitle = doc.fileName.ifBlank { "Verified" }
                }
                doc.status == "Under Review" -> {
                    icon = Icons.Filled.Schedule; tint = Purple; bg = PurpleLight
                    subtitle = "Under review • ${doc.fileName.ifBlank { "submitted" }}"
                }
                hasFile -> {
                    icon = Icons.Filled.Schedule; tint = Amber; bg = GoldLight
                    subtitle = doc.fileName
                }
                else -> {
                    icon = Icons.Filled.Close; tint = RedCancel; bg = RedLight
                    subtitle = "Not uploaded yet — tap to add"
                }
            }
            StatusListRow(
                icon = icon,
                iconTint = tint,
                iconBg = bg,
                title = doc.name,
                subtitle = subtitle,
                subtitleColor = tint,
                value = if (doc.status == "Verified") "Replace" else "Upload",
                valueColor = tint,
            ) {
                pendingDoc = doc.name
                // Accept images and PDFs; system picker honours the mime hint.
                picker.launch("*/*")
            }
        }
    }
}

@Composable
fun BankDetailsScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var reenter by remember { mutableStateOf("") }
    var chequeName by remember { mutableStateOf("") }
    var otpStep by remember { mutableStateOf(false) }
    var otp by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf(false) }
    // Local form state — kept separate from the ViewModel so a background refresh (ON_RESUME ->
    // applyBootstrap) can't wipe what the worker is typing mid-entry.
    var fName by remember { mutableStateOf(vm.bankName) }
    var fAccount by remember { mutableStateOf(vm.bankAccount) }
    var fIfsc by remember { mutableStateOf(vm.bankIfsc) }
    var fUpi by remember { mutableStateOf(vm.bankUpi) }
    var fAccType by remember { mutableStateOf(vm.bankAccountType.ifBlank { "savings" }) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) { chequeName = pickedFileName(ctx, uri); toast(ctx, "Attached: $chequeName") }
    }
    val (pillBg, pillFg) = when (vm.bankStatus) {
        "Approved" -> GreenLight to GreenSuccess
        "Pending Verification" -> GoldLight to Amber
        "Rejected" -> RedLight to RedCancel
        else -> PurpleLight to Purple
    }

    DetailScaffold("Bank & KYC", nav) {
        // Verification status — and the rule that withdrawals need an Approved account.
        Card {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                IconChip(Icons.Filled.AccountBalance, pillFg, pillBg)
                Spacer(Modifier.width(Space.m))
                Text("Verification Status", fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.weight(1f))
                StatusPill(if (vm.bankStatus == "Not Added") "Not Added" else vm.bankStatus, pillBg, pillFg)
            }
            if (vm.bankStatus == "Rejected" && vm.bankRemarks.isNotBlank()) {
                Spacer(Modifier.height(Space.s)); Text("Reason: ${vm.bankRemarks}", fontSize = 12.sp, color = RedCancel)
            }
            // Name the bank has on record for this account (from the penny-drop check).
            if (vm.bankApproved && vm.bankRegisteredName.isNotBlank()) {
                Spacer(Modifier.height(Space.s))
                Text("✓ Verified — ${vm.bankRegisteredName}", fontSize = 13.sp, color = GreenSuccess, fontWeight = FontWeight.SemiBold)
            } else if (vm.bankRegisteredName.isNotBlank()) {
                Spacer(Modifier.height(Space.s))
                Text("Registered name (as per bank): ${vm.bankRegisteredName}", fontSize = 12.sp, color = TextDark)
            }
            if (vm.bankNameMatch == false) {
                Spacer(Modifier.height(Space.xs))
                Text("⚠ This differs from the name you entered — flagged for review.", fontSize = 12.sp, color = Amber)
            }
            Spacer(Modifier.height(Space.s)); HairlineDivider(); Spacer(Modifier.height(Space.s))
            Text(
                if (vm.bankApproved) "Your account is verified — you can withdraw money."
                else "You can withdraw only after admin approves your bank account.",
                fontSize = 12.sp, color = if (vm.bankApproved) GreenSuccess else TextGray,
            )
        }

        val hasSavedBank = vm.bankAccount.isNotBlank()
        if (otpStep) {
            Card {
                Text("OTP Confirmation", fontWeight = FontWeight.SemiBold, color = TextDark)
                Spacer(Modifier.height(Space.xs))
                Text("Enter the 4-digit OTP sent to your registered mobile to confirm these bank details.", fontSize = 12.sp, color = TextGray)
                Spacer(Modifier.height(Space.m))
                OutlinedTextField(
                    value = otp,
                    onValueChange = { if (it.length <= 4 && it.all(Char::isDigit)) otp = it },
                    label = { Text("OTP") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(Radius.field), colors = softFieldColors(),
                )
            }
            PrimaryButton("Verify & Submit") {
                if (otp.length < 4) toast(ctx, "Enter the 4-digit OTP")
                else {
                    vm.saveBank(fName, fAccount, fIfsc, fUpi, chequeName, fAccType)
                    toast(ctx, "Bank submitted — verifying…")
                    otpStep = false; otp = ""; reenter = ""; editing = false
                }
            }
        } else if (hasSavedBank && !editing) {
            // Read-only summary of the already-saved account, with an Edit action.
            Card {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Saved Account", fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.weight(1f))
                    Text(
                        "Edit", color = Purple, fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
                        modifier = Modifier.clickable {
                            fName = vm.bankName; fAccount = vm.bankAccount; fIfsc = vm.bankIfsc; fUpi = vm.bankUpi
                            fAccType = vm.bankAccountType.ifBlank { "savings" }
                            reenter = ""; editing = true
                        },
                    )
                }
                Spacer(Modifier.height(Space.m))
                val bopt = INDIAN_BANKS.firstOrNull { it.name == vm.bankName }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (bopt != null) { BankBadge(bopt.code, bopt.color); Spacer(Modifier.width(Space.m)) }
                    Column(Modifier.weight(1f)) {
                        Text(vm.bankName.ifBlank { "Bank account" }, fontWeight = FontWeight.SemiBold, color = TextDark)
                        Text(
                            "A/C ••••${vm.bankAccount.takeLast(4)}   •   ${vm.bankIfsc}" +
                                (if (vm.bankAccountType.isNotBlank()) "   •   ${vm.bankAccountType.replaceFirstChar(Char::uppercase)}" else ""),
                            fontSize = 12.sp, color = TextGray,
                        )
                    }
                }
                if (vm.bankUpi.isNotBlank()) {
                    Spacer(Modifier.height(Space.s)); Text("UPI: ${vm.bankUpi}", fontSize = 12.sp, color = TextGray)
                }
            }
        } else {
            Card {
                SectionLabel("Account Details")
                Spacer(Modifier.height(Space.m))
                Column(verticalArrangement = Arrangement.spacedBy(Space.m)) {
                    // Bank — searchable dropdown with brand badges.
                    BankPickerField(fName) { fName = it.name }
                    // Account number: digits only — non-numeric input is stripped as it's typed.
                    Field("Account Number", fAccount, KeyboardType.Number) { fAccount = it.filter(Char::isDigit).take(18) }
                    Field("Confirm Account Number", reenter, KeyboardType.Number) { reenter = it.filter(Char::isDigit).take(18) }
                    // Savings / Current — passed to the payout gateway, which validates it against the account.
                    SectionLabel("Account Type")
                    Row(horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                        listOf("savings" to "Savings", "current" to "Current").forEach { (v, label) ->
                            val on = fAccType == v
                            Text(
                                label, fontSize = 13.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (on) Purple else TextGray,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(Radius.field))
                                    .background(if (on) PurpleLight else FieldFill)
                                    .clickable { fAccType = v }
                                    .padding(horizontal = Space.m, vertical = Space.s),
                            )
                        }
                    }
                    Field("IFSC Code", fIfsc) { fIfsc = it.uppercase(); vm.lookupIfsc(it) }
                    // Confirm the IFSC is real + which bank/branch it belongs to (cross-checks the selected bank).
                    when {
                        vm.ifscChecking -> Text("Checking IFSC…", fontSize = 12.sp, color = TextGray)
                        vm.ifscError.isNotBlank() -> Text("⚠ ${vm.ifscError}", fontSize = 12.sp, color = RedCancel)
                        vm.ifscBank.isNotBlank() -> {
                            val mism = fName.isNotBlank() && !bankMatches(fName, vm.ifscBank)
                            Text(
                                (if (mism) "⚠ This IFSC belongs to ${vm.ifscBank}" else "✓ ${vm.ifscBank}") +
                                    (if (vm.bankBranch.isNotBlank()) " — ${vm.bankBranch}" else ""),
                                fontSize = 12.sp, color = if (mism) Amber else GreenSuccess,
                            )
                        }
                    }
                    Field("UPI ID (optional)", fUpi) { fUpi = it }
                    // Optional cancelled cheque / passbook photo.
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field))
                            .background(FieldFill)
                            .clickable { picker.launch("image/*") }.padding(Space.m),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Filled.CheckCircle, null,
                            tint = if (chequeName.isBlank()) TextMuted else GreenSuccess,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.width(Space.s))
                        Text(chequeName.ifBlank { "Attach cancelled cheque / passbook (optional)" }, fontSize = 13.sp, color = TextDark)
                    }
                }
            }
            PrimaryButton("Continue") {
                val acc = fAccount.trim()
                val ifsc = fIfsc.trim().uppercase()
                // Standard Indian IFSC: 4 letters + '0' + 6 alphanumerics (e.g. HDFC0001234).
                val ifscOk = Regex("^[A-Z]{4}0[A-Z0-9]{6}$").matches(ifsc)
                when {
                    fName.isBlank() -> toast(ctx, "Please select your bank")
                    acc.isBlank() -> toast(ctx, "Enter your account number")
                    acc.length < 9 || acc.length > 18 -> toast(ctx, "Enter a valid account number (9–18 digits)")
                    acc != reenter.trim() -> toast(ctx, "Account numbers do not match")
                    !ifscOk -> toast(ctx, "Enter a valid IFSC code (e.g. HDFC0001234)")
                    vm.ifscChecking -> toast(ctx, "Verifying IFSC — please wait")
                    vm.ifscError.isNotBlank() -> toast(ctx, "This IFSC could not be verified")
                    else -> { fIfsc = ifsc; otpStep = true }
                }
            }
        }
    }
}

@Composable
fun AvailabilityScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    val days = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    DetailScaffold("Availability", nav) {
        Card {
            SectionLabel("Working Days")
            Text("Tap the days you want to work.", fontSize = 12.sp, color = TextGray)
            Spacer(Modifier.height(Space.m))
            days.chunked(4).forEach { rowDays ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    rowDays.forEach { d ->
                        val on = vm.availableDays[d] ?: false
                        DayChip(d, on, Modifier.weight(1f)) { vm.availableDays[d] = !on }
                    }
                    repeat(4 - rowDays.size) { Spacer(Modifier.weight(1f)) }
                }
                Spacer(Modifier.height(Space.s))
            }
        }
        Card {
            SectionLabel("Preferred Shift")
            Text("Pick full-time or a 4-hour part-time slot.", fontSize = 12.sp, color = TextGray)
            Spacer(Modifier.height(Space.m))

            // Start on the type that matches the worker's current shift (part-time slots are 4h).
            var shiftType by remember {
                mutableStateOf(if (PART_TIME_SHIFTS.any { it.start == vm.shiftStart && it.end == vm.shiftEnd }) "Part Time" else "Full Time")
            }
            SegmentedTabs(listOf("Full Time", "Part Time"), shiftType) { shiftType = it }
            Spacer(Modifier.height(Space.m))

            val presets = if (shiftType == "Part Time") PART_TIME_SHIFTS else FULL_TIME_SHIFTS
            presets.chunked(2).forEach { rowItems ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    rowItems.forEach { s ->
                        val selected = vm.shiftStart == s.start && vm.shiftEnd == s.end
                        ShiftChip(s.label, "${s.start} – ${s.end}", selected, Modifier.weight(1f)) {
                            vm.shiftStart = s.start; vm.shiftEnd = s.end
                        }
                    }
                    if (rowItems.size == 1) Spacer(Modifier.weight(1f))
                }
                Spacer(Modifier.height(Space.s))
            }
            val shiftSet = vm.shiftStart.isNotBlank() && vm.shiftEnd.isNotBlank()
            HairlineDivider()
            LabeledRow("Selected", if (shiftSet) "$shiftType • ${vm.shiftStart} – ${vm.shiftEnd}" else "Not set")
        }
        PrimaryButton("Save Availability") {
            vm.saveAvailability()
            val active = vm.availableDays.count { it.value }
            val shift = if (vm.shiftStart.isNotBlank()) " • ${vm.shiftStart}–${vm.shiftEnd}" else ""
            toast(ctx, "Saved • $active days/week$shift")
        }
    }
}

/** A selectable shift window the worker can choose from on the Availability screen. */
private data class ShiftPreset(val label: String, val start: String, val end: String)

// Full-time shifts (longer windows) vs part-time 4-hour slots. The worker first picks a
// type, then a slot within it.
private val FULL_TIME_SHIFTS = listOf(
    ShiftPreset("Morning", "06:00 AM", "02:00 PM"),
    ShiftPreset("Day", "08:00 AM", "08:00 PM"),
    ShiftPreset("Evening", "02:00 PM", "10:00 PM"),
    ShiftPreset("Full Day", "05:00 AM", "10:00 PM"),
)

private val PART_TIME_SHIFTS = listOf(
    ShiftPreset("Early", "06:00 AM", "10:00 AM"),
    ShiftPreset("Midday", "10:00 AM", "02:00 PM"),
    ShiftPreset("Afternoon", "02:00 PM", "06:00 PM"),
    ShiftPreset("Evening", "06:00 PM", "10:00 PM"),
)

// Performance & Incentives — all figures are real (from the worker's own activity/earnings).
@Composable
fun PerformanceScreen(vm: AppViewModel, nav: NavHostController) {
    androidx.compose.runtime.LaunchedEffect(Unit) { vm.loadShaktiBonus() }
    DetailScaffold("Performance", nav) {
        // Rating / tier hero.
        GradientBanner {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Your Rating", color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp)
                    Spacer(Modifier.height(Space.xs))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            if (vm.jobsCompleted > 0) "${vm.workerRating}" else "New Partner",
                            fontWeight = FontWeight.Bold, color = Color.White, fontSize = 28.sp,
                        )
                        if (vm.jobsCompleted > 0) {
                            Spacer(Modifier.width(Space.xs))
                            Icon(Icons.Filled.Star, null, tint = Gold, modifier = Modifier.size(24.dp))
                        }
                    }
                    Spacer(Modifier.height(Space.xs))
                    Text("${vm.jobsCompleted} jobs completed all-time", color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp)
                }
                TierBadge(vm.tier)
            }
        }
        // Today at a glance — mini stat strip.
        SectionTitle("Today")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
            MiniStatCard(Modifier.weight(1f), Icons.Filled.WorkOutline, "${vm.todayJobs}", "Jobs Today", Purple, PurpleLight)
            MiniStatCard(Modifier.weight(1f), Icons.Filled.CheckCircle, "${vm.todayCompleted}", "Completed", GreenSuccess, GreenLight)
            MiniStatCard(Modifier.weight(1f), Icons.Filled.Payments, "₹${vm.todayEarnings}", "Earned", Gold, GoldLight)
        }
        // Earnings breakdown.
        Card {
            SectionLabel("Earnings")
            Spacer(Modifier.height(Space.xs))
            BreakdownRow("This Week", "₹${vm.weekEarnings}")
            HairlineDivider()
            BreakdownRow("This Month", "₹${vm.monthEarnings}")
            HairlineDivider()
            BreakdownRow("Lifetime", "₹${vm.totalEarned}", GreenSuccess)
        }
        // Daily goal with an animated progress ring.
        SectionTitle("Today's Goal")
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularGoalRing(vm.goalProgress, ringSize = 88.dp) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("${(vm.goalProgress * 100).toInt()}%", color = TextDark, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        Text(if (vm.goalProgress >= 1f) "🎉" else "Goal", color = TextGray, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(Modifier.width(Space.l))
                Column(Modifier.weight(1f)) {
                    Text("₹${vm.todayEarnings} of ₹${vm.dailyGoal}", fontWeight = FontWeight.Bold, color = TextDark, fontSize = 18.sp)
                    Spacer(Modifier.height(Space.xs))
                    Text(
                        if (vm.goalProgress >= 1f) "Goal reached — great work today!"
                        else "₹${(vm.dailyGoal - vm.todayEarnings).coerceAtLeast(0)} to go to hit today's target",
                        fontSize = 12.5.sp, color = TextGray,
                    )
                }
            }
        }

        // Performance metrics.
        val completionPct = if (vm.todayJobs > 0) vm.todayCompleted * 100 / vm.todayJobs else 0
        SectionTitle("Metrics")
        Card {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                PerformanceMetric(Modifier.weight(1f), "Rating", if (vm.workerRating > 0) "${vm.workerRating}" else "—", Gold, meter = if (vm.workerRating > 0) (vm.workerRating / 5.0).toFloat() else null, icon = Icons.Filled.Star)
                PerformanceMetric(Modifier.weight(1f), "Completion", if (vm.todayJobs > 0) "$completionPct%" else "—", GreenSuccess, meter = if (vm.todayJobs > 0) completionPct / 100f else null, icon = Icons.Filled.CheckCircle)
            }
            Spacer(Modifier.height(Space.m))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                PerformanceMetric(Modifier.weight(1f), "Jobs Done", "${vm.jobsCompleted}", Purple, icon = Icons.Filled.EmojiEvents)
                PerformanceMetric(Modifier.weight(1f), "Lifetime", "₹${vm.totalEarned}", Violet, icon = Icons.Filled.Payments)
            }
        }

        // Sitara Bonus — real working-days / Sundays / rating reward ladder.
        SectionTitle("Sitara Bonus")
        SitaraBonusCard(vm.shaktiBonus) { nav.navigate(Routes.SHAKTI) }
    }
}

/** Compact section heading used inside cards. */
@Composable
private fun SectionLabel(text: String) {
    Text(text, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 15.sp)
}

private val MONTH_ABBR = listOf("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")

/** Calendar-style tinted date tile ("07 / JUL") parsed from a "YYYY-MM-DD" string. Purely
 *  presentational — falls back gracefully if the string isn't in that shape. */
@Composable
private fun DateBadge(dateStr: String, bg: Color, fg: Color) {
    val parts = dateStr.split("-")
    val day = parts.getOrNull(2)?.takeLast(2) ?: dateStr.takeLast(2)
    val month = parts.getOrNull(1)?.toIntOrNull()?.let { MONTH_ABBR.getOrNull(it - 1) } ?: ""
    Box(
        Modifier.size(46.dp).clip(RoundedCornerShape(Radius.field)).background(bg),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(day.ifBlank { "•" }, color = fg, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            if (month.isNotBlank()) Text(month, color = fg, fontWeight = FontWeight.SemiBold, fontSize = 9.sp)
        }
    }
}

// Leave: submit a leave request (date + reason) and see the status of past requests.
@Composable
fun LeaveScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var from by remember { mutableStateOf("") }
    var to by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    DetailScaffold("Leave", nav) {
        Card {
            SectionLabel("Request Leave")
            Spacer(Modifier.height(Space.m))
            OutlinedTextField(from, { from = it }, label = { Text("From (YYYY-MM-DD)") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(Radius.field), colors = softFieldColors())
            Spacer(Modifier.height(Space.m))
            OutlinedTextField(to, { to = it }, label = { Text("To (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(Radius.field), colors = softFieldColors())
            Spacer(Modifier.height(Space.m))
            OutlinedTextField(reason, { reason = it }, label = { Text("Reason") }, minLines = 2, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(Radius.field), colors = softFieldColors())
            Spacer(Modifier.height(Space.l))
            PrimaryButton("Submit Request", loading = busy) {
                if (!busy) {
                    busy = true
                    vm.submitLeave(from.trim(), to.trim(), reason.trim()) { err ->
                        busy = false
                        toast(ctx, err ?: "Leave request submitted")
                        if (err == null) { from = ""; to = ""; reason = "" }
                    }
                }
            }
        }
        SectionTitle("My Requests")
        if (vm.leaves.isEmpty()) {
            Card { EmptyState("🗓️", "No leave requests yet", "Your submitted leave requests will appear here.") }
        } else {
            vm.leaves.forEach { lv ->
                val (bg, fg) = when (lv.status) {
                    "Approved" -> GreenLight to GreenSuccess
                    "Rejected" -> RedLight to RedCancel
                    else -> GoldLight to Amber
                }
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // Calendar-style tinted date tile derived from the "from" date string.
                        DateBadge(lv.fromDate, PurpleLight, Purple)
                        Spacer(Modifier.width(Space.m))
                        Column(Modifier.weight(1f)) {
                            Text(
                                if (lv.toDate.isNotBlank() && lv.toDate != lv.fromDate) "${lv.fromDate} → ${lv.toDate}" else lv.fromDate,
                                fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp,
                            )
                            if (lv.reason.isNotBlank()) {
                                Spacer(Modifier.height(2.dp))
                                Text(lv.reason, fontSize = 12.sp, color = TextGray)
                            }
                        }
                        Spacer(Modifier.width(Space.s))
                        StatusPill(lv.status, bg, fg)
                    }
                }
            }
        }
    }
}

// Attendance: check in / out for the day with best-effort GPS capture.
@Composable
fun AttendanceScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    val att = vm.attendance
    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        if (androidx.core.content.ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED)
            permLauncher.launch(android.Manifest.permission.ACCESS_FINE_LOCATION)
    }
    fun lastLoc(): Pair<Double?, Double?> = try {
        if (androidx.core.content.ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
            val loc = lm.getLastKnownLocation(android.location.LocationManager.GPS_PROVIDER)
                ?: lm.getLastKnownLocation(android.location.LocationManager.NETWORK_PROVIDER)
            loc?.latitude to loc?.longitude
        } else null to null
    } catch (_: Exception) { null to null }

    DetailScaffold("Attendance", nav) {
        // ── Shift plan picker (min-guarantee model) ──
        Card {
            SectionLabel("Your Shift Plan")
            Text(
                "Pick one shift. Check in within ${(att.graceMin.takeIf { it > 0 } ?: 15)} min of the start time — later check-ins are penalised.",
                fontSize = 12.sp, color = TextGray,
            )
            Spacer(Modifier.height(Space.m))
            if (vm.shifts.isEmpty()) {
                Text("No shifts available yet.", fontSize = 13.sp, color = TextMuted)
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(Space.s)) {
                    vm.shifts.forEach { s ->
                        ShiftOption(s, vm.selectedShiftId == s.id) {
                            vm.selectShift(s.id) { toast(ctx, "Shift set: ${s.name}") }
                        }
                    }
                }
            }
        }

        // ── Today's attendance status (judged against the chosen shift) ──
        Card {
            val (dot, label) = when {
                att.checkedOut -> GreenSuccess to "Checked Out"
                att.checkedIn -> GreenSuccess to "Checked In · Working"
                else -> TextMuted to "Not Checked In"
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconChip(Icons.Filled.AccessTime, dot, if (att.checkedIn || att.checkedOut) GreenLight else FieldFill)
                Spacer(Modifier.width(Space.m))
                Column(Modifier.weight(1f)) {
                    Text(label, fontWeight = FontWeight.Bold, color = TextDark, fontSize = 16.sp)
                    Text(
                        if (att.shiftName.isNotBlank()) "${att.shiftName} shift · ${att.shiftStart}–${att.shiftEnd}" else "Choose a shift plan above",
                        fontSize = 12.sp, color = TextGray,
                    )
                }
                Box(Modifier.size(12.dp).background(dot, RoundedCornerShape(Radius.pill)))
            }
            // On-time / late banner once the worker has checked in.
            if (att.checkedIn && att.shiftName.isNotBlank()) {
                Spacer(Modifier.height(Space.m))
                val onTime = att.onTime
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field))
                        .background(if (onTime) GreenLight else RedLight).padding(Space.m),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        if (onTime) Icons.Filled.CheckCircle else Icons.Filled.Close,
                        contentDescription = null,
                        tint = if (onTime) GreenSuccess else RedCancel,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(Space.s))
                    Text(
                        if (onTime) "On time — no penalty" else "Late by ${att.lateMinutes} min · −₹${att.penalty} deducted",
                        color = if (onTime) GreenSuccess else RedCancel, fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
                    )
                }
            }
            Spacer(Modifier.height(Space.m)); HairlineDivider(); Spacer(Modifier.height(Space.s))
            LabeledRow("Check-in time", att.checkInAt.ifBlank { "—" })
            LabeledRow("Check-out time", att.checkOutAt.ifBlank { "—" })
            LabeledRow("Shift", if (att.shiftName.isNotBlank()) "${att.shiftName} · ${att.shiftStart}–${att.shiftEnd}" else "Not set")
            if (att.minGuarantee > 0) LabeledRow("Minimum guarantee", "₹${att.minGuarantee}", GreenSuccess)
            LabeledRow("Days attended this month", "${att.attendedThisMonth} ${if (att.attendedThisMonth == 1) "day" else "days"}", Purple)
        }
        // ── Assigned apartment (geofence): must stay within the radius during the shift ──
        if (att.siteName.isNotBlank()) {
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconChip(Icons.Filled.LocationOn, Purple, PurpleLight)
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text("Assigned Apartment", fontSize = 12.sp, color = TextGray)
                        Text(att.siteName, fontWeight = FontWeight.Bold, color = TextDark, fontSize = 16.sp)
                        if (att.siteAddress.isNotBlank()) Text(att.siteAddress, fontSize = 12.sp, color = TextGray)
                    }
                }
                Spacer(Modifier.height(Space.m))
                val g = vm.geofence
                val outside = g?.let { !it.inside } ?: att.geoOutside
                val bg = if (!att.geoActive) FieldFill else if (outside) RedLight else GreenLight
                val fg = if (!att.geoActive) TextGray else if (outside) RedCancel else GreenSuccess
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).background(bg).padding(Space.m),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        if (!att.geoActive) Icons.Filled.LocationOn else if (outside) Icons.Filled.Close else Icons.Filled.CheckCircle,
                        contentDescription = null, tint = fg, modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(Space.s))
                    Text(
                        when {
                            !att.geoActive -> "Check in here — then stay within ${att.geofenceM} m all day."
                            outside -> "Outside your area${g?.let { " · ${it.distance} m away" } ?: ""} (limit ${att.geofenceM} m)"
                            else -> "Inside your area${g?.let { " · ${it.distance} m from centre" } ?: ""}"
                        },
                        color = fg, fontSize = 12.5.sp, fontWeight = FontWeight.Medium, lineHeight = 16.sp,
                    )
                }
                Spacer(Modifier.height(Space.s))
                LabeledRow("Allowed radius", "${att.geofenceM} m")
                if (att.geoBreaches > 0) LabeledRow("Times you left the area today", "${att.geoBreaches}", RedCancel)
            }
        }
        // Availability state — only "Available" receives new jobs.
        Card {
            SectionLabel("Availability")
            Text("Only “Available” receives new jobs.", fontSize = 12.sp, color = TextGray)
            Spacer(Modifier.height(Space.m))
            listOf("Available", "Busy", "Break", "Offline", "Leave").chunked(3).forEach { rowStates ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    rowStates.forEach { st ->
                        val sel = vm.availabilityState == st
                        Box(
                            Modifier.weight(1f).clip(RoundedCornerShape(Radius.pill))
                                .background(if (sel) Purple else FieldFill)
                                .clickable { vm.changeAvailabilityState(st) }
                                .padding(vertical = Space.m),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(st, color = if (sel) Color.White else TextGray, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    repeat(3 - rowStates.size) { Spacer(Modifier.weight(1f)) }
                }
                Spacer(Modifier.height(Space.s))
            }
            Text(
                "Request Leave ›", color = Purple, fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
                modifier = Modifier.clickable { nav.navigate(Routes.LEAVE) }.padding(top = Space.xs),
            )
        }
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).background(PurpleLight).padding(Space.m),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("📍", fontSize = 16.sp)
            Spacer(Modifier.width(Space.s))
            Text("Your location is captured at check-in / check-out for verification.", fontSize = 12.sp, color = TextDark, lineHeight = 16.sp)
        }
        when {
            !att.checkedIn -> PrimaryButton("Check In") { val (la, ln) = lastLoc(); vm.checkIn(la, ln) { toast(ctx, "Checked in ✓") } }
            !att.checkedOut -> PrimaryButton("Check Out") { val (la, ln) = lastLoc(); vm.checkOut(la, ln) { toast(ctx, "Checked out ✓") } }
            else -> Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).background(GreenLight).padding(Space.l),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(Space.s))
                Text("Shift complete for today. See you tomorrow!", color = GreenSuccess, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
        }
    }
}

/** A selectable shift-plan row — radio + name/window + minimum-guarantee. Violet when chosen. */
@Composable
private fun ShiftOption(s: com.homehelp.pro.network.ShiftDto, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field))
            .background(if (selected) PurpleLight else FieldFill)
            .then(if (selected) Modifier.border(1.5.dp, Purple, RoundedCornerShape(Radius.field)) else Modifier)
            .clickable { onClick() }
            .padding(Space.m),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(20.dp).clip(RoundedCornerShape(Radius.pill))
                .border(2.dp, if (selected) Purple else TextMuted, RoundedCornerShape(Radius.pill)),
            contentAlignment = Alignment.Center,
        ) { if (selected) Box(Modifier.size(10.dp).background(Purple, RoundedCornerShape(Radius.pill))) }
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text("${s.name} Shift", fontWeight = FontWeight.Bold, color = TextDark, fontSize = 15.sp)
            Text("${s.start} – ${s.end} · ${s.hours}h · ${s.graceMin}m grace", fontSize = 12.sp, color = TextGray)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text("₹${s.minGuarantee}", fontWeight = FontWeight.Bold, color = GreenSuccess, fontSize = 15.sp)
            Text("min. guarantee", fontSize = 10.sp, color = TextGray)
        }
    }
}

/** Rounded pill day toggle — violet when selected, soft grey when off. Same toggle logic. */
@Composable
private fun DayChip(day: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .clip(RoundedCornerShape(Radius.pill))
            .background(if (selected) Purple else FieldFill)
            .clickable { onClick() }
            .padding(vertical = Space.m),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            day,
            color = if (selected) Color.White else TextGray,
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp,
        )
    }
}

@Composable
private fun ShiftChip(title: String, subtitle: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier
            .clip(RoundedCornerShape(Radius.field))
            .background(if (selected) PurpleLight else CardBg)
            .border(1.5.dp, if (selected) Purple else Divider, RoundedCornerShape(Radius.field))
            .clickable { onClick() }
            .padding(horizontal = Space.m, vertical = Space.m),
    ) {
        Text(title, fontWeight = FontWeight.SemiBold, color = if (selected) Purple else TextDark, fontSize = 14.sp)
        Spacer(Modifier.height(2.dp))
        Text(subtitle, fontSize = 11.sp, color = TextGray)
    }
}

@Composable
fun PreferencesScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    DetailScaffold("Preferences", nav) {
        Card {
            SectionLabel("Job types you want to receive")
            Spacer(Modifier.height(Space.s))
            val services = vm.jobPreferences.keys.toList()
            services.forEachIndexed { i, service ->
                val on = vm.jobPreferences[service] ?: false
                Row(
                    Modifier.fillMaxWidth()
                        .clickable { vm.jobPreferences[service] = !on }
                        .padding(vertical = Space.s),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconChip(Icons.Filled.WorkOutline, if (on) Purple else TextMuted, if (on) PurpleLight else FieldFill)
                    Spacer(Modifier.width(Space.m))
                    Text(service, color = TextDark, fontWeight = FontWeight.Medium, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    Checkbox(
                        checked = on,
                        onCheckedChange = { vm.jobPreferences[service] = it },
                        colors = CheckboxDefaults.colors(checkedColor = Purple),
                    )
                }
                if (i < services.lastIndex) HairlineDivider()
            }
        }
        PrimaryButton("Save Preferences") {
            vm.savePreferences()
            val n = vm.jobPreferences.count { it.value }
            toast(ctx, "Preferences saved • $n job types enabled")
        }
    }
}

@Composable
fun NotificationsScreen(vm: AppViewModel, nav: NavHostController) {
    androidx.compose.runtime.LaunchedEffect(Unit) { vm.refreshNotifications(); vm.markNotificationsRead() }
    DetailScaffold("Notifications", nav) {
        if (vm.notifications.isNotEmpty()) {
            Card {
                SectionLabel("Recent")
                Spacer(Modifier.height(Space.s))
                vm.notifications.take(25).forEachIndexed { i, n ->
                    Row(Modifier.fillMaxWidth().padding(vertical = Space.s), verticalAlignment = Alignment.CenterVertically) {
                        IconChip(Icons.Filled.Notifications, Purple, PurpleLight)
                        Spacer(Modifier.width(Space.m))
                        Column(Modifier.weight(1f)) {
                            Text(n.text, fontSize = 13.sp, color = TextDark)
                            if (n.date.isNotBlank()) Text(n.date, fontSize = 11.sp, color = TextGray)
                        }
                    }
                    if (i < vm.notifications.take(25).lastIndex) HairlineDivider()
                }
            }
        }
        Card {
            SectionLabel("Notification Settings")
            Spacer(Modifier.height(Space.xs))
            ToggleRow(Icons.Filled.WorkOutline, Purple, PurpleLight, "New job alerts", checked = vm.notifNewJobs) { vm.notifNewJobs = it; vm.saveNotifications() }
            HairlineDivider()
            ToggleRow(Icons.Filled.Payments, GreenSuccess, GreenLight, "Payment updates", checked = vm.notifPayments) { vm.notifPayments = it; vm.saveNotifications() }
            HairlineDivider()
            ToggleRow(Icons.Filled.ThumbUp, Gold, GoldLight, "Ratings & feedback", checked = vm.notifRatings) { vm.notifRatings = it; vm.saveNotifications() }
            HairlineDivider()
            ToggleRow(Icons.Filled.Campaign, Coral, CoralLight, "Promotions & offers", checked = vm.notifPromotions) { vm.notifPromotions = it; vm.saveNotifications() }
        }
    }
}

@Composable
fun HelpSupportScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var subject by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var sosMsg by remember { mutableStateOf<String?>(null) }
    fun lastLoc(): Pair<Double?, Double?> = try {
        if (androidx.core.content.ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
            (lm.getLastKnownLocation(android.location.LocationManager.GPS_PROVIDER) ?: lm.getLastKnownLocation(android.location.LocationManager.NETWORK_PROVIDER)).let { it?.latitude to it?.longitude }
        } else null to null
    } catch (_: Exception) { null to null }
    sosMsg?.let { m ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { sosMsg = null },
            confirmButton = { androidx.compose.material3.TextButton(onClick = { sosMsg = null }) { Text("OK") } },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { sosMsg = null; runCatching { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:112"))) } }) { Text("Call 112") } },
            title = { Text("🆘 SOS sent", fontWeight = FontWeight.Bold) },
            text = { Text(m) },
        )
    }
    DetailScaffold("Help & Support", nav) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(RedCancel)
                .clickable { val (la, ln) = lastLoc(); vm.sendSos(la, ln) { sosMsg = it } }.padding(Space.l),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("🆘", fontSize = 26.sp)
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text("Emergency SOS", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Text("Alerts our team & shares your location", color = Color.White.copy(alpha = 0.9f), fontSize = 12.sp)
            }
        }
        Card {
            SectionLabel("Contact Us")
            Spacer(Modifier.height(Space.xs))
            NavRow(Icons.Filled.Phone, Purple, PurpleLight, "Call Support", "1800-123-456 • 24x7") {
                runCatching { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:18001234567"))) }
                    .onFailure { toast(ctx, "No dialer app found") }
            }
            HairlineDivider()
            NavRow(Icons.Filled.Email, Purple, PurpleLight, "Email Us", "support@homehelp.pro") {
                val i = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:support@homehelp.pro"))
                    .putExtra(Intent.EXTRA_SUBJECT, "HomeHelp Pro — Support")
                runCatching { ctx.startActivity(i) }.onFailure { toast(ctx, "No email app found") }
            }
        }
        Card {
            SectionLabel("Raise a Ticket")
            Spacer(Modifier.height(Space.m))
            OutlinedTextField(subject, { subject = it }, label = { Text("Subject") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(Radius.field), colors = softFieldColors())
            Spacer(Modifier.height(Space.m))
            OutlinedTextField(message, { message = it }, label = { Text("Describe your issue") }, minLines = 2, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(Radius.field), colors = softFieldColors())
            Spacer(Modifier.height(Space.l))
            PrimaryButton("Submit Ticket", loading = busy) {
                if (!busy) {
                    busy = true
                    vm.submitTicket(subject.trim(), message.trim()) { err ->
                        busy = false; toast(ctx, err ?: "Ticket submitted")
                        if (err == null) { subject = ""; message = "" }
                    }
                }
            }
        }
        if (vm.tickets.isNotEmpty()) {
            Card {
                SectionLabel("My Tickets")
                Spacer(Modifier.height(Space.s))
                vm.tickets.forEachIndexed { i, t ->
                    Row(Modifier.fillMaxWidth().padding(vertical = Space.m), verticalAlignment = Alignment.CenterVertically) {
                        IconChip(Icons.Filled.HelpOutline, Purple, PurpleLight)
                        Spacer(Modifier.width(Space.m))
                        Column(Modifier.weight(1f)) {
                            Text(t.subject.ifBlank { "Support request" }, fontWeight = FontWeight.Medium, color = TextDark, fontSize = 14.sp)
                            if (t.message.isNotBlank()) Text(t.message, fontSize = 12.sp, color = TextGray, maxLines = 1)
                        }
                        val (bg, fg) = if (t.status == "Resolved") GreenLight to GreenSuccess else GoldLight to Amber
                        StatusPill(t.status, bg, fg)
                    }
                    if (i < vm.tickets.lastIndex) HairlineDivider()
                }
            }
        }
        Card {
            SectionLabel("FAQs")
            Spacer(Modifier.height(Space.s))
            val faqs = listOf(
                "How do I receive jobs?" to "Go online from the Home screen. When a nearby job matches your services and shift, it's offered to you — tap Accept, then navigate to the customer.",
                "When do I get paid?" to "Earnings for a completed job are credited to your wallet right away. Withdraw to your bank anytime from the Wallet tab.",
                "How is my rating calculated?" to "It's the average of the star ratings customers leave after each completed job. A higher rating gets you more job offers.",
                "How do I withdraw my earnings?" to "Open the Wallet tab → Withdraw, enter the amount and confirm. Add and verify your bank details first under Profile → Bank Details.",
            )
            val open = remember { mutableStateOf(-1) }
            faqs.forEachIndexed { i, (q, a) ->
                Column(
                    Modifier.fillMaxWidth().clickable { open.value = if (open.value == i) -1 else i }.padding(vertical = Space.s),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(q, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                        Text(if (open.value == i) "▲" else "▼", color = TextGray, fontSize = 12.sp)
                    }
                    if (open.value == i) {
                        Spacer(Modifier.height(Space.s))
                        Text(a, color = TextGray, fontSize = 13.sp, lineHeight = 18.sp)
                    }
                }
                if (i < faqs.lastIndex) HairlineDivider()
            }
        }
    }
}

@Composable
fun AboutScreen(nav: NavHostController) {
    val ctx = LocalContext.current
    DetailScaffold("About Us", nav) {
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(48.dp).background(Purple, RoundedCornerShape(Radius.field)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
                }
                Spacer(Modifier.width(Space.m))
                Column {
                    Text("HomeHelp Pro", fontWeight = FontWeight.Bold, color = TextDark, fontSize = 17.sp)
                    Text("Version 1.5", fontSize = 12.sp, color = TextGray)
                }
            }
        }
        Card {
            Text(
                "HomeHelp Pro is the partner app for verified house-help and cleaning professionals. " +
                    "Go online, accept nearby jobs, navigate to customers, verify with OTP, complete the " +
                    "service and get paid — all from one app.",
                color = TextDark, fontSize = 14.sp, lineHeight = 21.sp,
            )
        }
        Card {
            SectionLabel("Legal")
            Spacer(Modifier.height(Space.xs))
            val links = listOf(
                Triple(Icons.Filled.Description, "Terms & Conditions", "https://homehelp.pro/terms"),
                Triple(Icons.Filled.PrivacyTip, "Privacy Policy", "https://homehelp.pro/privacy"),
                Triple(Icons.Filled.Info, "Licenses", "https://homehelp.pro/licenses"),
            )
            links.forEachIndexed { i, (icon, label, url) ->
                NavRow(icon, Purple, PurpleLight, label) {
                    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                        .onFailure { toast(ctx, "No browser app found") }
                }
                if (i < links.lastIndex) HairlineDivider()
            }
        }
        Text(
            "© 2026 HomeHelp Technologies", color = TextMuted, fontSize = 12.sp,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

// Settings — language, notifications, privacy, app version, logout.
@Composable
fun SettingsScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var lang by remember { mutableStateOf(Session.language) }
    val version = remember { runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "1.0" }
    DetailScaffold("Settings", nav) {
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconChip(Icons.Filled.Language, Purple, PurpleLight)
                Spacer(Modifier.width(Space.m))
                SectionLabel("Language")
            }
            Spacer(Modifier.height(Space.m))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                listOf("English", "हिंदी", "తెలుగు").forEach { l ->
                    val sel = lang == l
                    Box(
                        Modifier.weight(1f).clip(RoundedCornerShape(Radius.pill))
                            .background(if (sel) Purple else FieldFill)
                            .clickable { lang = l; Session.language = l; toast(ctx, "Language: $l") }
                            .padding(vertical = Space.m),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(l, color = if (sel) Color.White else TextGray, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        Card {
            NavRow(Icons.Filled.Notifications, Purple, PurpleLight, "Notifications") { nav.navigate(Routes.P_NOTIFICATIONS) }
            HairlineDivider()
            NavRow(Icons.Filled.PrivacyTip, Purple, PurpleLight, "Privacy Policy") {
                runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://homehelp.pro/privacy"))) }
                    .onFailure { toast(ctx, "No browser app found") }
            }
            HairlineDivider()
            Row(Modifier.fillMaxWidth().padding(vertical = Space.m), verticalAlignment = Alignment.CenterVertically) {
                IconChip(Icons.Filled.Info, TextGray, FieldFill)
                Spacer(Modifier.width(Space.m))
                Text("App Version", color = TextDark, fontWeight = FontWeight.Medium, fontSize = 14.sp, modifier = Modifier.weight(1f))
                Text("v$version", color = TextGray)
            }
        }
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).background(CardBg)
                .border(1.dp, Divider, RoundedCornerShape(Radius.field))
                .clickable { vm.logout(); nav.navigate(Routes.LOGIN) { popUpTo(Routes.HOME) { inclusive = true } } }
                .padding(Space.l),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Logout, contentDescription = null, tint = RedCancel, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(Space.s))
            Text("Logout", color = RedCancel, fontWeight = FontWeight.SemiBold)
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI CHANGE LOG — ProfileDetailScreens.kt
// Premium gig/partner-app redesign (UI ONLY) in our violet brand, aligning every
// screen with the shared reference-pattern widgets used across the app (MoneyBanner,
// StatusListRow, MiniStatCard, BreakdownRow…). Soft-slate ScreenBg, white shadowed
// Cards, tinted icon chips, token spacing (Space.*) & radii (Radius.*) throughout.
//
// Shared reference widgets reused (defined in MoneyScreens.kt / Components.kt — same
// package, no redefinition): StatusListRow, MiniStatCard, BreakdownRow, SectionTitle.
// Private presentational helpers in this file:
//  • softFieldColors() — filled grey field, violet focus/label/cursor (all text fields).
//  • IconChip / ToggleRow / NavRow — tinted-icon list, switch and nav rows.
//  • SectionLabel — compact in-card heading.
//  • DateBadge (new) — calendar-style tinted day/month tile parsed from a date string
//    (safe fallback); MONTH_ABBR lookup table.
//  • DayChip (new) — rounded pill working-day toggle (violet on / grey off).
// Removed the now-unused PerfTile helper (superseded by MiniStatCard + BreakdownRow).
//
// Per screen:
//  • PersonalInfo — avatar hero (RatingStars + TierBadge); grouped soft-filled fields.
//  • Documents — intro info card; each document is a StatusListRow with a status-tinted
//    circle (Verified→green Check, Under Review→violet Schedule, uploaded-pending→amber
//    Schedule, missing→red Close). Tapping the row opens the picker (upload/replace) as
//    before — value shows Upload/Replace + chevron.
//  • BankDetails — status card (AccountBalance chip + hairline); grouped fields; cheque
//    attach as a filled tappable row; soft-filled OTP field.
//  • Availability — working days now rounded pill DayChips (Purple selected); preferred
//    shift as SegmentedTabs + shift chips; selection summary via LabeledRow.
//  • Performance — GradientBanner rating/tier hero, MiniStatCard "Today" strip (jobs /
//    completed / earned), Earnings BreakdownRows, goal & next-tier ProgressBars.
//  • Leave — soft-filled form (PrimaryButton loading via existing `busy`); each request
//    is a Card with a violet DateBadge + range/reason + APPROVED/PENDING/REJECTED
//    StatusPill; EmptyState card when none.
//  • Attendance — status card (AccessTime chip + live dot); availability states as pill
//    chips; location note & completion banner as tinted rows.
//  • Preferences — tinted-icon rows (whole row tappable) with Purple trailing checkbox
//    and hairline dividers.
//  • Notifications — recent list with bell chips; settings as ToggleRows (per-category
//    tinted icons, Purple switch track).
//  • HelpSupport — SOS banner, contact NavRows, soft-filled ticket form, ticket list,
//    FAQ accordion.
//  • About — brand logo card, description, legal NavRows, muted footer.
//  • Settings — language pill chips, Notifications/Privacy/Version NavRows, logout row.
//
// No functionality changed: every @Composable screen signature is identical; all vm.*
// calls, remember{}/mutableStateOf, LaunchedEffect, validation, nav routes, dialog
// logic, Switch/Checkbox/toggle state and callbacks are preserved exactly. All edits
// are purely presentational (layout, colour tokens, spacing, icons, widget swaps).
// ─────────────────────────────────────────────────────────────────────────────
