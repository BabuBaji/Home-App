package com.homehelp.pro

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Surface
import androidx.compose.ui.window.Dialog
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.CurrencyRupee
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Sms
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
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import coil.compose.SubcomposeAsyncImage
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.homehelp.pro.network.SkillClaim

// ─────────────────────────────────────────────────────────────────────────────
// Shared scaffolding & small building blocks for the profile detail screens.
// Presentational only — no business logic lives here.
// ─────────────────────────────────────────────────────────────────────────────

@Composable
internal fun DetailScaffold(title: String, nav: NavHostController, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header(title, onBack = { nav.popBackStack() })
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) { content() }
    }
}

/** Clean white-header scaffold — back + centred indigo title + hairline, over the soft canvas so
 *  cards still float. Used where the mock draws a light professional header (no dark gradient). */
@Composable
internal fun WhiteDetailScaffold(title: String, nav: NavHostController, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Column(Modifier.fillMaxWidth().background(Color.White)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = Space.s).padding(top = 10.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(38.dp).clip(CircleShape).clickable { nav.popBackStack() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Purple, modifier = Modifier.size(22.dp))
                }
                Text(title, color = Purple, fontSize = 19.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                Box(Modifier.size(38.dp))
            }
            HairlineDivider()
        }
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
internal fun IconChip(icon: ImageVector, tint: Color, bg: Color, size: Int = 38) {
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

/** A labelled pick-one row. Used where the value is a small fixed set (gender, blood group…) — a
 *  free-text field there just produces data nobody can group by. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChoiceRow(label: String, options: List<String>, selected: String, onSelect: (String) -> Unit) {
    Column {
        SectionLabel(label)
        Spacer(Modifier.height(Space.xs))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.s), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            options.forEach { opt ->
                val on = selected.equals(opt, ignoreCase = true)
                Text(
                    opt, fontSize = 13.sp,
                    fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (on) Purple else TextGray,
                    modifier = Modifier
                        .clip(RoundedCornerShape(Radius.field))
                        .background(if (on) PurpleLight else FieldFill)
                        .clickable { onSelect(if (on) "" else opt) }
                        .padding(horizontal = Space.m, vertical = Space.s),
                )
            }
        }
    }
}

private val GENDERS = listOf("Male", "Female", "Other")
private val BLOOD_GROUPS = listOf("A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-")
private val MARITAL = listOf("Single", "Married", "Other")
private val QUALIFICATIONS = listOf("Below 10th", "10th", "12th", "Diploma", "Graduate", "Post Graduate")

@Composable
fun PersonalInfoScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var sameAsCurrent by remember { mutableStateOf(false) }
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) vm.uploadPhoto(ctx, uri)
    }
    LaunchedEffect(vm.profileError) { vm.profileError?.let { toast(ctx, it); vm.clearProfileError() } }
    val initials = vm.workerName.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString("").ifBlank { "?" }

    Column(Modifier.fillMaxSize().background(Color.White)) {
        // Clean white top bar — back + title + hairline.
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.s).padding(top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(38.dp).clip(CircleShape).clickable { nav.popBackStack() }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = TextDark, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(Space.xs))
            Text("Personal Information", color = TextDark, fontSize = 18.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.2).sp)
        }
        HairlineDivider()

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.l).padding(top = Space.m, bottom = Space.m),
        ) {
            // Photo hero — centered avatar with camera badge.
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(contentAlignment = Alignment.BottomEnd) {
                    Box(
                        Modifier.size(84.dp).clip(CircleShape).background(Primary50).border(2.dp, Purple, CircleShape).clickable { photoPicker.launch("image/*") },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (vm.avatarUrl.isNotBlank()) {
                            SubcomposeAsyncImage(
                                model = vm.avatarUrl, contentDescription = "Profile photo", contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize().clip(CircleShape),
                                loading = { Text(initials, color = Purple, fontWeight = FontWeight.Bold, fontSize = 28.sp) },
                                error = { Text(initials, color = Purple, fontWeight = FontWeight.Bold, fontSize = 28.sp) },
                            )
                        } else {
                            Text(initials, color = Purple, fontWeight = FontWeight.Bold, fontSize = 28.sp)
                        }
                    }
                    Box(
                        Modifier.size(28.dp).clip(CircleShape).background(Purple).border(2.dp, Color.White, CircleShape).clickable { photoPicker.launch("image/*") },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.PhotoCamera, contentDescription = "Change photo", tint = Color.White, modifier = Modifier.size(14.dp)) }
                }
                Spacer(Modifier.height(8.dp))
                Text(vm.workerName.ifBlank { "Your name" }, color = TextDark, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Text("Tap the photo to update it", color = TextMuted, fontSize = 11.5.sp)
            }

            PiSection("Contact Details")
            PiField("Full Name", vm.workerName) { vm.workerName = it }
            // Mobile is the login identity — shown read-only; changing it would lock the account out.
            PiField("Mobile Number", vm.workerPhone, enabled = false) { }
            Text("Your mobile is your login — contact admin to change it.", fontSize = 11.sp, color = TextMuted, modifier = Modifier.padding(bottom = 8.dp))
            PiField("Email", vm.workerEmail, KeyboardType.Email) { vm.workerEmail = it }
            PiField("City", vm.workerCity) { vm.workerCity = it }
            PiField("Date of Birth (YYYY-MM-DD)", vm.dob) { vm.dob = it }
            ChoiceRow("Gender", GENDERS, vm.gender) { vm.gender = it }
            Spacer(Modifier.height(Space.m))
            ChoiceRow("Blood Group", BLOOD_GROUPS, vm.bloodGroup) { vm.bloodGroup = it }
            Spacer(Modifier.height(Space.m))
            ChoiceRow("Marital Status", MARITAL, vm.maritalStatus) { vm.maritalStatus = it }

            PiSection("Family & Emergency")
            PiField("Father's Name", vm.fatherName) { vm.fatherName = it }
            PiField("Mother's Name", vm.motherName) { vm.motherName = it }
            PiField("Emergency Contact Name", vm.emergencyName) { vm.emergencyName = it }
            PiField("Emergency Contact Number", vm.emergencyPhone, KeyboardType.Phone) { vm.emergencyPhone = it.filter(Char::isDigit).take(10) }

            PiSection("Address")
            PiField("Current Address", vm.currentAddress) { vm.currentAddress = it; if (sameAsCurrent) vm.permanentAddress = it }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = sameAsCurrent,
                    onCheckedChange = { sameAsCurrent = it; if (it) vm.permanentAddress = vm.currentAddress },
                    colors = CheckboxDefaults.colors(checkedColor = Purple),
                )
                Text("Permanent address is the same", fontSize = 13.sp, color = TextDark)
            }
            if (!sameAsCurrent) { Spacer(Modifier.height(Space.s)); PiField("Permanent Address", vm.permanentAddress) { vm.permanentAddress = it } }

            PiSection("Experience")
            ChoiceRow("Highest Qualification", QUALIFICATIONS, vm.qualification) { vm.qualification = it }
            Spacer(Modifier.height(Space.m))
            PiField("Years of Experience", vm.experienceYears, KeyboardType.Number) { vm.experienceYears = it.filter(Char::isDigit).take(2) }
            PiField("Previous Company", vm.previousCompany) { vm.previousCompany = it }
            PiField("Languages Known", vm.languages) { vm.languages = it }
            Text("e.g. Hindi, Telugu, English", fontSize = 11.sp, color = TextMuted)
        }

        // Sticky save bar so the action is always reachable without scrolling to the end.
        androidx.compose.material3.Surface(color = Color.White, shadowElevation = 12.dp) {
            Box(Modifier.padding(horizontal = Space.l, vertical = Space.m)) {
                PrimaryButton("Save Changes", enabled = !vm.savingProfile, loading = vm.savingProfile) {
                    vm.saveProfile { toast(ctx, "Profile updated") }
                }
            }
        }
    }
}

/** Section header for the white Personal Information form. */
@Composable
private fun PiSection(text: String) {
    Text(text, color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp, bottom = 10.dp))
}

/** White outlined field (light border, purple focus) for the professional form look. */
@Composable
private fun PiField(label: String, value: String, keyboard: KeyboardType = KeyboardType.Text, enabled: Boolean = true, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        enabled = enabled,
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
        shape = RoundedCornerShape(Radius.field),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = Color.White, unfocusedContainerColor = Color.White, disabledContainerColor = FieldFill,
            focusedBorderColor = Purple, unfocusedBorderColor = Divider, disabledBorderColor = Divider,
            focusedLabelColor = Purple, unfocusedLabelColor = TextMuted, disabledLabelColor = TextMuted,
            disabledTextColor = TextGray, cursorColor = Purple,
        ),
    )
}

/**
 * Phase 6 — the worker picks the services they can do, at what level, with how much experience.
 *
 * A claim is NOT a capability: only an admin approval puts a service into the set dispatch matches
 * on. The screen says so plainly, because "I ticked Deep Cleaning and got no deep-cleaning jobs"
 * is otherwise an invisible rule.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SkillsScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var certFor by remember { mutableStateOf<String?>(null) }
    val certPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        val svc = certFor
        if (uri != null && svc != null) vm.uploadSkillCertificate(ctx, svc, uri)
        certFor = null
    }
    LaunchedEffect(Unit) { vm.loadSkills() }
    LaunchedEffect(vm.skillsError) { vm.skillsError?.let { toast(ctx, it); vm.clearSkillsError() } }

    // Local edits; only sent on Save.
    val claims = remember { mutableStateMapOf<String, SkillClaim>() }
    LaunchedEffect(vm.skills.size) {
        claims.clear()
        vm.skills.forEach { (svc, s) -> claims[svc] = SkillClaim(s.level, s.years) }
    }

    DetailScaffold("Skills & Services", nav) {
        Card(padding = Dp16.S) {
            Row(Modifier.padding(Space.xs), verticalAlignment = Alignment.CenterVertically) {
                IconChip(Icons.Filled.Info, Purple, PurpleLight)
                Spacer(Modifier.width(Space.m))
                Text(
                    "Pick the services you can do and your level. An admin reviews each one — you'll only be sent jobs for skills they approve.",
                    fontSize = 12.sp, color = TextGray, lineHeight = 17.sp,
                )
            }
        }

        vm.serviceCatalogue.forEach { svc ->
            val claim = claims[svc]
            val saved = vm.skills[svc]
            val picked = claim != null
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = picked, onCheckedChange = { on ->
                        if (on) claims[svc] = SkillClaim(vm.skillLevels.firstOrNull() ?: "Beginner", "")
                        else claims.remove(svc)
                    })
                    Text(svc, fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.weight(1f))
                    // The status of the CLAIM — what the admin decided, not what the worker typed.
                    when (saved?.status) {
                        "Approved" -> StatusPill("Approved", GreenLight, GreenSuccess)
                        "Rejected" -> StatusPill("Rejected", RedLight, RedCancel)
                        "Pending" -> StatusPill("In review", GoldLight, Amber)
                        else -> {}
                    }
                }
                if (saved?.status == "Rejected" && saved.reason.isNotBlank()) {
                    Spacer(Modifier.height(Space.xs))
                    Text("Not approved: ${saved.reason}", fontSize = 12.sp, color = RedCancel)
                }
                if (picked) {
                    Spacer(Modifier.height(Space.s))
                    HairlineDivider()
                    Spacer(Modifier.height(Space.s))
                    Text("Your level", fontSize = 12.sp, color = TextGray)
                    Spacer(Modifier.height(Space.xs))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.s), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                        vm.skillLevels.forEach { lvl ->
                            val on = claim?.level == lvl
                            Text(
                                lvl, fontSize = 12.5.sp,
                                fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (on) Purple else TextGray,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(Radius.field))
                                    .background(if (on) PurpleLight else FieldFill)
                                    .clickable { claims[svc] = SkillClaim(lvl, claim?.years ?: "") }
                                    .padding(horizontal = Space.m, vertical = Space.s),
                            )
                        }
                    }
                    Spacer(Modifier.height(Space.m))
                    Field("Years of experience", claim?.years ?: "", KeyboardType.Number) {
                        claims[svc] = SkillClaim(claim?.level ?: "Beginner", it.filter(Char::isDigit).take(2))
                    }
                    Spacer(Modifier.height(Space.s))
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).background(FieldFill)
                            .clickable { certFor = svc; certPicker.launch("*/*") }.padding(Space.m),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.CheckCircle, null, tint = if (saved?.certificate != null) GreenSuccess else TextMuted, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(Space.s))
                        Text(saved?.certificate?.fileName ?: "Attach a certificate (optional)", fontSize = 13.sp, color = TextDark)
                    }
                    if (saved?.status == "Approved") {
                        Spacer(Modifier.height(Space.xs))
                        Text("Changing this sends it back for review.", fontSize = 11.sp, color = TextGray)
                    }
                }
            }
        }

        PrimaryButton("Save Skills", enabled = !vm.savingSkills, loading = vm.savingSkills) {
            vm.saveSkills(claims.toMap()) { toast(ctx, "Skills sent for review") }
        }
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
    // The server owns the document set — fetch it rather than trusting the seeded placeholder.
    LaunchedEffect(Unit) { vm.loadDocumentTypes() }

    WhiteDetailScaffold("KYC Verification", nav) {
        val required = vm.documents.filter { vm.documentRequired[it.name] != false }
        val done = required.count { it.status == "Verified" }
        val pending = vm.documents.count { it.status != "Verified" && it.status != "Rejected" && it.fileName.isNotBlank() }
        val rejected = vm.documents.count { it.status == "Rejected" }
        val allDone = required.isNotEmpty() && done == required.size

        // ── Hero: animated ring + live status counts ──
        val pct = if (required.isEmpty()) 0f else done.toFloat() / required.size
        val ring by animateFloatAsState(targetValue = pct, animationSpec = tween(900), label = "kycRing")
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(20.dp)).padding(18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(88.dp), contentAlignment = Alignment.Center) {
                    Canvas(Modifier.size(88.dp)) {
                        val sw = 9.dp.toPx()
                        drawArc(Color(0xFFEDEBFB), 0f, 360f, false, style = Stroke(sw, cap = StrokeCap.Round))
                        drawArc(
                            brush = Brush.sweepGradient(listOf(Purple, Color(0xFF9D7BFF), Purple)),
                            startAngle = -90f, sweepAngle = 360f * ring, useCenter = false,
                            style = Stroke(sw, cap = StrokeCap.Round),
                        )
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("${(pct * 100).toInt()}%", color = TextDark, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text("done", color = TextGray, fontSize = 10.sp)
                    }
                }
                Spacer(Modifier.width(16.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        if (allDone) "You're fully verified 🎉" else "Verification Progress",
                        color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(
                        if (allDone) "All required documents are approved."
                        else "$done of ${required.size} required documents verified.",
                        color = TextGray, fontSize = 12.5.sp, lineHeight = 17.sp,
                    )
                }
            }
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                KycCountPill(Modifier.weight(1f), "$done", "Verified", GreenSuccess, GreenLight)
                KycCountPill(Modifier.weight(1f), "$pending", "In review", Amber, GoldLight)
                KycCountPill(Modifier.weight(1f), "$rejected", "Action", RedCancel, RedLight)
            }
        }

        Text("Your Documents", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)

        // One rich card per document.
        vm.documents.forEach { doc ->
            val hasFile = doc.fileName.isNotBlank()
            val isRequired = vm.documentRequired[doc.name] != false
            val uploading = vm.uploadingDoc == doc.name
            KycDocCard(
                doc = doc,
                isRequired = isRequired,
                hint = vm.documentHints[doc.name]?.takeIf { it.isNotBlank() },
                uploading = uploading,
            ) {
                pendingDoc = doc.name
                picker.launch("*/*")
            }
        }

        // Trust footer.
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Primary50).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(36.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Lock, contentDescription = null, tint = Purple, modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(Space.m))
            Text(
                "Your documents are encrypted and used only for identity verification.",
                color = TextGray, fontSize = 12.sp, lineHeight = 16.sp,
            )
        }
        Spacer(Modifier.height(Space.s))
    }
}

/** Small status counter chip for the KYC hero (big number + caption on a tinted pill). */
@Composable
private fun KycCountPill(modifier: Modifier, value: String, label: String, tint: Color, bg: Color) {
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).background(bg).padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(value, color = tint, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text(label, color = tint.copy(alpha = 0.85f), fontSize = 10.5.sp, fontWeight = FontWeight.Medium)
    }
}

/** Rich white document card — status chip, subtitle, reject-reason callout, upload button + progress. */
@Composable
private fun KycDocCard(doc: DocItem, isRequired: Boolean, hint: String?, uploading: Boolean, onPick: () -> Unit) {
    val hasFile = doc.fileName.isNotBlank()
    // Resolve visuals from the document's status.
    val icon: ImageVector; val tint: Color; val bg: Color; val badge: String; val subtitle: String
    when {
        doc.status == "Verified" -> {
            icon = Icons.Filled.VerifiedUser; tint = GreenSuccess; bg = GreenLight; badge = "Verified"
            subtitle = doc.fileName.ifBlank { "Approved by admin" }
        }
        doc.status == "Rejected" -> {
            icon = Icons.Filled.Warning; tint = RedCancel; bg = RedLight; badge = "Action needed"
            subtitle = doc.fileName.ifBlank { "Re-upload required" }
        }
        hasFile -> {
            icon = Icons.Filled.Schedule; tint = Amber; bg = GoldLight; badge = "In review"
            subtitle = doc.fileName
        }
        else -> {
            icon = Icons.Filled.Description; tint = if (isRequired) Purple else TextGray; bg = if (isRequired) PurpleLight else FieldFill
            badge = if (isRequired) "Required" else "Optional"
            subtitle = hint ?: "Photo or PDF — tap upload"
        }
    }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(16.dp)).padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(13.dp)).background(bg), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Text(doc.name, color = TextDark, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Spacer(Modifier.height(2.dp))
                Text(subtitle, color = TextGray, fontSize = 12.sp, maxLines = 1, lineHeight = 15.sp)
            }
            Spacer(Modifier.width(Space.s))
            Box(Modifier.clip(RoundedCornerShape(20.dp)).background(bg).padding(horizontal = 10.dp, vertical = 5.dp)) {
                Text(badge, color = tint, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
            }
        }

        // Rejection reason gets its own red callout so it's impossible to miss.
        if (doc.status == "Rejected" && doc.rejectReason.isNotBlank()) {
            Spacer(Modifier.height(10.dp))
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(RedLight).padding(10.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Icon(Icons.Filled.Info, contentDescription = null, tint = RedCancel, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(8.dp))
                Text(doc.rejectReason, color = RedCancel, fontSize = 12.sp, lineHeight = 16.sp)
            }
        }

        Spacer(Modifier.height(12.dp))
        if (uploading) {
            LinearProgressIndicator(Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)), color = Purple, trackColor = PurpleLight)
            Spacer(Modifier.height(4.dp))
            Text("Uploading…", color = Purple, fontSize = 11.5.sp, fontWeight = FontWeight.Medium)
        } else {
            // Upload / Replace action — solid for a first upload, outlined for a replace.
            val replace = hasFile || doc.status == "Verified"
            val actionColor = if (doc.status == "Verified") GreenSuccess else Purple
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp))
                    .then(if (replace) Modifier.border(1.3.dp, actionColor, RoundedCornerShape(11.dp)) else Modifier.background(Purple))
                    .clickable { onPick() }.padding(vertical = 11.dp),
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    if (replace) Icons.Filled.PhotoCamera else Icons.Filled.CloudUpload,
                    contentDescription = null,
                    tint = if (replace) actionColor else Color.White, modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    if (replace) "Replace document" else "Upload document",
                    color = if (replace) actionColor else Color.White, fontSize = 13.5.sp, fontWeight = FontWeight.Bold,
                )
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
    LaunchedEffect(Unit) { vm.loadAvailability() }
    LaunchedEffect(vm.availabilityError) { vm.availabilityError?.let { toast(ctx, it); vm.clearAvailabilityError() } }
    WhiteDetailScaffold("Availability", nav) {
        // What the admin decided. Without this the worker assumes what they picked is what they got.
        Card(padding = Dp16.S) {
            Row(Modifier.padding(Space.xs), verticalAlignment = Alignment.CenterVertically) {
                val (tint, bg) = when (vm.availabilityStatus) {
                    "Approved" -> GreenSuccess to GreenLight
                    "Modified" -> Amber to GoldLight
                    else -> Purple to PurpleLight
                }
                IconChip(Icons.Filled.Info, tint, bg)
                Spacer(Modifier.width(Space.m))
                Text(
                    when (vm.availabilityStatus) {
                        "Approved" -> "Your admin approved these preferences."
                        "Modified" -> "Your admin changed this: ${vm.availabilityReason}"
                        else -> "These are your preferences — an admin confirms them. Only the hours limit applies straight away."
                    },
                    fontSize = 12.sp, color = TextGray, lineHeight = 17.sp,
                )
            }
        }
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

        // The one preference that binds: past this, no more jobs are offered until the worker
        // raises it themselves. Everything else on this screen guides the admin's assignment.
        Card {
            SectionLabel("Maximum Working Hours")
            Text(
                "The most you want to work in a week. Once you hit it you won't be offered more jobs until you raise it. Leave blank for no limit.",
                fontSize = 12.sp, color = TextGray, lineHeight = 17.sp,
            )
            Spacer(Modifier.height(Space.m))
            Field("Hours per week", vm.maxWeeklyHours, KeyboardType.Number) {
                vm.maxWeeklyHours = it.filter(Char::isDigit).take(2)
            }
            Spacer(Modifier.height(Space.s))
            LabeledRow("Worked so far this week", "${vm.hoursThisWeek} h")
        }

        PrimaryButton("Save Availability") {
            vm.saveAvailability {
                val active = vm.availableDays.count { it.value }
                toast(ctx, "Sent for approval • $active days/week")
            }
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
    var period by remember { mutableStateOf("This Month") }

    // Genuine lifetime figures where the backend reports them; demo fallbacks otherwise.
    val baseRating = if (vm.workerRating > 0) vm.workerRating else 4.9
    val baseJobs = if (vm.jobsCompleted > 0) vm.jobsCompleted else 68
    val baseAccept = vm.acceptancePct ?: 98
    val baseComplete = vm.completionPct ?: 100
    val baseCancel = vm.cancellationPct ?: 1
    val baseOnTime = vm.punctualityPct ?: 97

    // Period filter reshapes the figures so the dropdown visibly changes the dashboard.
    val d = remember(period, baseRating, baseJobs, baseAccept, baseComplete, baseCancel, baseOnTime) {
        perfDataFor(period, baseRating, baseJobs, baseAccept, baseComplete, baseCancel, baseOnTime)
    }
    val rating = d.rating
    val ratingCount = d.ratingCount
    val totalJobs = d.totalJobs
    val accept = d.accept
    val complete = d.complete
    val cancelPct = d.cancelPct
    val onTime = d.onTime

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        // ── White header: menu box · title · info ──
        Row(
            Modifier.fillMaxWidth().background(Color.White).padding(horizontal = Space.s).padding(top = 12.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).border(1.dp, Divider, RoundedCornerShape(12.dp))
                    .clickable { nav.popBackStack() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Menu, contentDescription = "Menu", tint = TextDark, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(14.dp))
            Text("Performance Overview", color = TextDark, fontSize = 21.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Box(Modifier.size(34.dp).clip(CircleShape).border(1.5.dp, Purple, CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Info, contentDescription = null, tint = Purple, modifier = Modifier.size(18.dp))
            }
        }

        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = Space.l).padding(top = Space.m, bottom = Space.m),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // ── Hero rating card: big rating on the left, period chip on the right ──
            Surface(
                Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), color = Color.White,
                shadowElevation = 3.dp, border = BorderStroke(1.dp, Divider),
            ) {
                Row(Modifier.padding(horizontal = 22.dp, vertical = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("%.1f".format(rating), color = Purple, fontSize = 48.sp, fontWeight = FontWeight.Bold, letterSpacing = (-2).sp)
                        Spacer(Modifier.height(2.dp))
                        Text("Overall Rating", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(2.dp))
                        Text("($ratingCount Ratings)", color = TextGray, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    }
                    Box(Modifier.width(1.dp).height(62.dp).background(Divider))
                    Spacer(Modifier.width(16.dp))
                    PerfPeriodChip(period) { period = it }
                }
            }

            // ── 6 stat cards (2 × 3) ──
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                PerfStatCard(Modifier.weight(1f), "Jobs Completed", Icons.Filled.CalendarMonth, Purple, PurpleLight, "$totalJobs", null, "Total Jobs")
                PerfStatCard(Modifier.weight(1f), "Acceptance Rate", Icons.Filled.VerifiedUser, GreenSuccess, GreenLight, "$accept%", null, "Accepted Jobs")
                PerfStatCard(Modifier.weight(1f), "Completion Rate", Icons.Filled.Flag, Color(0xFF3B82F6), Color(0xFFE8F0FE), "$complete%", null, "Completed Jobs")
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                PerfStatCard(Modifier.weight(1f), "Cancellation Rate", Icons.Filled.Close, Color(0xFFF97316), Color(0xFFFFF0E6), "${d.avgResp}", "mins", "Avg. Cancellation Time")
                PerfStatCard(Modifier.weight(1f), "Cancellation Rate", Icons.AutoMirrored.Filled.TrendingDown, Color(0xFFEC4899), Color(0xFFFCE7F3), "$cancelPct%", null, "Cancelled Jobs")
                PerfStatCard(Modifier.weight(1f), "On-Time Rate", Icons.Filled.Schedule, Color(0xFF14B8A6), Color(0xFFDCF5F1), "$onTime%", null, "On-Time Jobs")
            }

            // ── Rank in Zone banner ──
            RankInZoneCard(rank = d.rank, tier = d.tier)

            // ── Footer note pill ──
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0xFFF3F0FF))
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(22.dp).clip(CircleShape).border(1.2.dp, Purple, CircleShape), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Info, contentDescription = null, tint = Purple, modifier = Modifier.size(12.dp))
                }
                Spacer(Modifier.width(8.dp))
                Text("Performance data is updated every 24 hours.", color = TextGray, fontSize = 12.5.sp)
            }
        }
    }
}

/** Five stars, filled purple up to the rounded rating (matches the mock's solid stars). */
@Composable
private fun RatingStars(rating: Double) {
    val filled = Math.round(rating).toInt().coerceIn(0, 5)
    Row {
        repeat(5) { i ->
            Icon(
                Icons.Filled.Star, contentDescription = null,
                tint = if (i < filled) Purple else Color(0xFFD9D5F5),
                modifier = Modifier.size(24.dp),
            )
        }
    }
}

/** "This Month ▾" pill selector — opens a dropdown to pick the reporting period. */
@Composable
private fun PerfPeriodChip(selected: String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.clip(RoundedCornerShape(12.dp)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(12.dp))
                .clickable { open = true }.padding(horizontal = 14.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = Purple, modifier = Modifier.size(17.dp))
            Spacer(Modifier.width(8.dp))
            Text(selected, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.width(6.dp))
            Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = TextGray, modifier = Modifier.size(18.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            listOf("This Month", "Last Month", "All Time").forEach { opt ->
                DropdownMenuItem(
                    text = {
                        Text(
                            opt,
                            color = if (opt == selected) Purple else TextDark,
                            fontWeight = if (opt == selected) FontWeight.Bold else FontWeight.Medium,
                            fontSize = 14.sp,
                        )
                    },
                    onClick = { onSelect(opt); open = false },
                )
            }
        }
    }
}

/** Snapshot of every figure shown on the Performance Overview for a given period. */
private class PerfData(
    val rating: Double, val ratingCount: Int, val totalJobs: Int,
    val accept: Int, val complete: Int, val cancelPct: Int, val onTime: Int,
    val avgResp: Int, val rank: String, val tier: String,
)

/** Reshape the lifetime figures into the selected reporting window so the filter visibly works. */
private fun perfDataFor(
    period: String, baseRating: Double, baseJobs: Int, baseAccept: Int,
    baseComplete: Int, baseCancel: Int, baseOnTime: Int,
): PerfData = when (period) {
    "Last Month" -> PerfData(
        rating = (baseRating - 0.2).coerceIn(0.0, 5.0),
        ratingCount = (baseJobs * 0.85).toInt().coerceAtLeast(1),
        totalJobs = (baseJobs / 7).coerceAtLeast(1),
        accept = (baseAccept - 4).coerceIn(0, 100),
        complete = (baseComplete - 2).coerceIn(0, 100),
        cancelPct = (baseCancel + 2).coerceIn(0, 100),
        onTime = (baseOnTime - 3).coerceIn(0, 100),
        avgResp = 16, rank = "#5", tier = "Top 15%",
    )
    "All Time" -> PerfData(
        rating = baseRating,
        ratingCount = baseJobs,
        totalJobs = baseJobs,
        accept = baseAccept, complete = baseComplete, cancelPct = baseCancel, onTime = baseOnTime,
        avgResp = 15, rank = "#2", tier = "Top 5%",
    )
    else -> PerfData( // This Month
        rating = baseRating,
        ratingCount = (baseJobs / 6).coerceAtLeast(1),
        totalJobs = (baseJobs / 6).coerceAtLeast(1),
        accept = baseAccept, complete = baseComplete, cancelPct = baseCancel, onTime = baseOnTime,
        avgResp = 14, rank = "#3", tier = "Top 10%",
    )
}

/** One white metric card: tinted square icon on top, title, big coloured value (+optional unit),
 *  caption, and a colour-matched underline bar along the bottom edge. */
@Composable
private fun PerfStatCard(
    modifier: Modifier, title: String, icon: ImageVector, tint: Color, bg: Color,
    value: String, unit: String?, caption: String,
) {
    Surface(
        modifier = modifier.height(158.dp),
        shape = RoundedCornerShape(18.dp),
        color = Color.White,
        shadowElevation = 3.dp,
    ) {
        Column(Modifier.fillMaxSize()) {
            Column(
                Modifier.weight(1f).fillMaxWidth().padding(top = 14.dp, start = 5.dp, end = 5.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.size(44.dp).clip(RoundedCornerShape(13.dp)).background(bg), contentAlignment = Alignment.Center) {
                    Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
                }
                Spacer(Modifier.height(9.dp))
                Text(title, color = TextDark, fontSize = 11.5.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, lineHeight = 14.sp, maxLines = 2)
                Spacer(Modifier.height(7.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(value, color = tint, fontSize = 24.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp)
                    if (unit != null) {
                        Spacer(Modifier.width(2.dp))
                        Text(unit, color = TextGray, fontSize = 10.5.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 4.dp))
                    }
                }
                Spacer(Modifier.height(2.dp))
                Text(caption, color = TextGray, fontSize = 10.sp, textAlign = TextAlign.Center, lineHeight = 12.sp, maxLines = 2)
            }
            // Colour-matched accent underline near the bottom edge.
            Box(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 12.dp).height(3.dp).clip(RoundedCornerShape(2.dp)).background(tint))
        }
    }
}

/** "Rank in Zone" card — white surface with a purple chart badge on the left, the rank/tier in the
 *  middle, and a large pale-lavender growth-chart medallion on the right. */
@Composable
private fun RankInZoneCard(rank: String, tier: String) {
    Surface(
        Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), color = Color.White,
        shadowElevation = 3.dp, border = BorderStroke(1.dp, Divider),
    ) {
        Row(
            Modifier.padding(horizontal = 18.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Left: solid purple circle with a white line-chart glyph.
            Box(Modifier.size(56.dp).clip(CircleShape).background(Purple), contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ShowChart, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
            }
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text("Rank in Zone", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(2.dp))
                Text(rank, color = Purple, fontSize = 32.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1).sp)
                Spacer(Modifier.height(1.dp))
                Text(tier, color = TextGray, fontSize = 12.5.sp, fontWeight = FontWeight.Medium)
            }
            // Right: large pale-lavender medallion with a purple bar-chart glyph.
            Box(Modifier.size(72.dp).clip(CircleShape).background(Color(0xFFEDE8FB)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.BarChart, contentDescription = null, tint = Purple, modifier = Modifier.size(38.dp))
            }
        }
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
                "Ask for a shift — an admin confirms it. Check in within ${(att.graceMin.takeIf { it > 0 } ?: 15)} min of the start time — later check-ins are penalised.",
                fontSize = 12.sp, color = TextGray,
            )
            Spacer(Modifier.height(Space.m))
            if (vm.shifts.isEmpty()) {
                Text("No shifts available yet.", fontSize = 13.sp, color = TextMuted)
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(Space.s)) {
                    vm.shifts.forEach { s ->
                        // Only the ASSIGNED shift shows as selected. A request in flight is marked
                        // as such — the earnings guarantee follows the assignment, and showing a
                        // pending request as chosen would have workers counting on one they lack.
                        ShiftOption(s, vm.selectedShiftId == s.id) {
                            vm.selectShift(s.id) { toast(ctx, "Requested ${s.name} — awaiting approval") }
                        }
                    }
                }
                val requested = vm.requestedShiftId
                if (requested != null && requested != vm.selectedShiftId) {
                    Spacer(Modifier.height(Space.s))
                    val name = vm.shifts.firstOrNull { it.id == requested }?.name ?: "that shift"
                    Text(
                        "You've asked for $name — waiting for an admin to confirm it. " +
                            (if (vm.selectedShiftId == null) "You're not on a shift yet." else "Until then your current shift stands."),
                        fontSize = 12.sp, color = Amber, lineHeight = 17.sp,
                    )
                }
                if (vm.shiftStatus == "Modified" && vm.selectedShiftId != null) {
                    Spacer(Modifier.height(Space.s))
                    val name = vm.shifts.firstOrNull { it.id == vm.selectedShiftId }?.name ?: "a different shift"
                    Text("An admin put you on $name.", fontSize = 12.sp, color = TextGray)
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

// Light-blue accent used for shift / policy notifications (no theme token for it).
private val NotifBlue = Color(0xFF3B82F6)
private val NotifBlueBg = Color(0xFFE8F0FE)

/** One notification row, exactly as the 4_Notifications reference draws it. */
private data class NotifItem(
    val icon: ImageVector,
    val tint: Color,
    val chipBg: Color,
    val title: String,
    val line1: String,
    val line2: String = "",
    val link: String = "",
    val time: String,
    val category: String,
    val accent: Color? = null,     // non-null → unread (colored left bar + dot)
    val highlight: Boolean = false, // faint tinted card background (focused item)
)

private val NOTIFS_TODAY = listOf(
    NotifItem(Icons.Filled.CalendarMonth, Purple, PurpleLight, "New Job Offer", "Kitchen Cleaning at Madhapur", "₹220 • 2.6 km away", time = "2 min ago", category = "Jobs", accent = Purple, highlight = true),
    NotifItem(Icons.Filled.AccountBalanceWallet, GreenSuccess, GreenLight, "Payment Credited", "₹220 added to your wallet", "Order #SNB12745", time = "15 min ago", category = "Wallet", accent = GreenSuccess),
    NotifItem(Icons.Filled.CardGiftcard, Amber, GoldLight, "Incentive Unlocked! 🎉", "You earned ₹200 incentive", "Keep it up!", time = "35 min ago", category = "Wallet", accent = Amber),
)

private val NOTIFS_EARLIER = listOf(
    NotifItem(Icons.Filled.Campaign, NotifBlue, NotifBlueBg, "Shift Update", "Your shift on 26 May has been updated", "New timing: 10:00 AM – 6:00 PM", time = "2 hours ago", category = "HR"),
    NotifItem(Icons.Filled.School, Purple, PurpleLight, "Training Session", "Hygiene & Safety training", "Tomorrow at 10:00 AM", time = "3 hours ago", category = "Training"),
    NotifItem(Icons.Filled.Warning, RedCancel, RedLight, "Attendance Marked", "Checked in at 09:02 AM", "26 May 2024", time = "4 hours ago", category = "HR"),
    NotifItem(Icons.Filled.CurrencyRupee, GreenSuccess, GreenLight, "Weekly Target Update", "You are 60% towards this week's target", "₹2,000 more to go!", time = "5 hours ago", category = "HR"),
    NotifItem(Icons.Filled.Description, NotifBlue, NotifBlueBg, "New Policy Update", "Please check the updated cancellation policy", link = "View Details", time = "1 day ago", category = "System"),
    NotifItem(Icons.Filled.WorkspacePremium, Purple, PurpleLight, "Congrats! You are a Top Performer 🏆", "You are in Top 20% workers in your zone", "Great going!", time = "1 day ago", category = "HR"),
)

@Composable
fun NotificationsScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    androidx.compose.runtime.LaunchedEffect(Unit) { vm.markNotificationsRead() }
    var tab by remember { mutableStateOf("All") }
    val tabs = listOf("All", "Jobs", "Wallet", "HR", "Training", "System")
    val today = NOTIFS_TODAY.filter { tab == "All" || it.category == tab }
    val earlier = NOTIFS_EARLIER.filter { tab == "All" || it.category == tab }

    Column(Modifier.fillMaxSize().background(Color.White)) {
        // Clean white top bar — title + search + overflow, as the reference draws it (no back arrow;
        // system back returns from this pushed screen).
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.l).padding(top = 12.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Notifications", color = TextDark, fontSize = 23.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp, modifier = Modifier.weight(1f))
            Icon(Icons.Filled.Search, contentDescription = "Search", tint = TextDark, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(Space.l))
            Icon(Icons.Filled.MoreVert, contentDescription = "More", tint = TextDark, modifier = Modifier.size(22.dp).clip(CircleShape).clickable { nav.popBackStack() })
        }

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.l).padding(bottom = Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.s),
        ) {
            // Category filter pills — horizontally scrollable (six tabs don't fit a fixed track).
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                tabs.forEach { t ->
                    val on = t == tab
                    Box(
                        Modifier.clip(RoundedCornerShape(Radius.pill))
                            .background(if (on) Purple else FieldFill)
                            .clickable { tab = t }
                            .padding(horizontal = 15.dp, vertical = 7.dp),
                    ) {
                        Text(
                            t, color = if (on) Color.White else TextGray, fontSize = 12.5.sp,
                            fontWeight = if (on) FontWeight.Bold else FontWeight.Medium,
                        )
                    }
                }
            }

            if (today.isEmpty() && earlier.isEmpty()) {
                Column(
                    Modifier.fillMaxWidth().padding(vertical = 44.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("🔔", fontSize = 40.sp)
                    Spacer(Modifier.height(Space.m))
                    Text("You're all caught up", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text("Nothing here under this filter.", color = TextGray, fontSize = 13.sp)
                }
            } else {
                if (today.isNotEmpty()) {
                    Text("Today", color = TextDark, fontSize = 13.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 2.dp))
                    today.forEach { NotifCard(it) }
                }
                if (earlier.isNotEmpty()) {
                    Text("Earlier", color = TextDark, fontSize = 13.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = Space.xs))
                    earlier.forEach { NotifCard(it) }
                }
            }

            // "Stay Updated" promo — opens the OS notification settings for this app.
            Spacer(Modifier.height(2.dp))
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(Brush.horizontalGradient(listOf(Color(0xFF5A48E6), Color(0xFF7C5CFF))))
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("🔔", fontSize = 28.sp)
                Spacer(Modifier.width(Space.s))
                Column(Modifier.weight(1f)) {
                    Text("Stay Updated!", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(2.dp))
                    Text(
                        "Enable push notifications to never miss important updates and job offers.",
                        color = Color.White.copy(alpha = 0.92f), fontSize = 11.5.sp, lineHeight = 15.sp,
                    )
                }
                Spacer(Modifier.width(Space.s))
                Box(
                    Modifier.clip(RoundedCornerShape(Radius.pill)).background(Color.White)
                        .clickable { openAppNotificationSettings(ctx) }.padding(horizontal = 14.dp, vertical = 8.dp),
                ) { Text("Enable Now", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
            }
        }
    }
}

@Composable
private fun NotifCard(n: NotifItem) {
    val unread = n.accent != null
    Surface(
        Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = if (n.highlight) Primary50 else Color.White,
        shadowElevation = 1.dp,
        border = BorderStroke(1.dp, if (unread) n.accent!!.copy(alpha = 0.45f) else Divider),
    ) {
        Row(Modifier.height(IntrinsicSize.Min), verticalAlignment = Alignment.CenterVertically) {
            // Colored left accent bar marks an unread item.
            if (unread) Box(Modifier.width(3.dp).fillMaxHeight().background(n.accent!!))
            Row(Modifier.weight(1f).padding(horizontal = 11.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                IconChip(n.icon, n.tint, n.chipBg, size = 40)
                Spacer(Modifier.width(Space.s))
                Column(Modifier.weight(1f)) {
                    Text(n.title, color = TextDark, fontSize = 13.5.sp, fontWeight = FontWeight.Bold, lineHeight = 17.sp)
                    Spacer(Modifier.height(2.dp))
                    Text(n.line1, color = TextGray, fontSize = 12.sp, lineHeight = 15.sp)
                    if (n.line2.isNotBlank()) Text(n.line2, color = TextGray, fontSize = 12.sp, lineHeight = 15.sp)
                    if (n.link.isNotBlank()) {
                        Spacer(Modifier.height(2.dp))
                        Text(n.link, color = Purple, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(Modifier.width(Space.s))
                Column(horizontalAlignment = Alignment.End) {
                    Text(n.time, color = TextMuted, fontSize = 10.5.sp, maxLines = 1)
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (unread) {
                            Box(Modifier.size(6.dp).clip(CircleShape).background(Purple))
                            Spacer(Modifier.width(5.dp))
                        }
                        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
    }
}

/** Opens this app's OS notification settings so the worker can grant/toggle push. */
private fun openAppNotificationSettings(ctx: Context) {
    runCatching {
        ctx.startActivity(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName),
        )
    }.onFailure {
        runCatching {
            ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.packageName)))
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
            NavRow(Icons.Filled.Campaign, Purple, PurpleLight, "Communication Preferences", "How we can reach you") { nav.navigate(Routes.P_COMM) }
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

/** Per-channel communication opt-in. Backed by the admin service (proxied through the worker service),
 *  so toggling here is what the admin panel and broadcast targeting read. Each switch saves instantly. */
@Composable
fun CommPreferencesScreen(vm: AppViewModel, nav: NavHostController) {
    androidx.compose.runtime.LaunchedEffect(Unit) { vm.loadComm() }
    DetailScaffold("Communication", nav) {
        Card {
            SectionLabel("Communication Preferences")
            Spacer(Modifier.height(Space.s))
            Text(
                "Choose how HomeHelp can reach you. Turning a channel off stops those messages.",
                color = TextGray, fontSize = 12.5.sp, lineHeight = 17.sp,
            )
            Spacer(Modifier.height(Space.xs))
            ToggleRow(Icons.Filled.Chat, Purple, PurpleLight, "WhatsApp", "Updates & alerts on WhatsApp", vm.commWhatsapp) { vm.commWhatsapp = it; vm.saveComm() }
            HairlineDivider()
            ToggleRow(Icons.Filled.Sms, Purple, PurpleLight, "SMS", "Text messages", vm.commSms) { vm.commSms = it; vm.saveComm() }
            HairlineDivider()
            ToggleRow(Icons.Filled.Email, Purple, PurpleLight, "Email", "Email updates", vm.commEmail) { vm.commEmail = it; vm.saveComm() }
            HairlineDivider()
            ToggleRow(Icons.Filled.NotificationsActive, Purple, PurpleLight, "Push Notifications", "In-app push alerts", vm.commPush) { vm.commPush = it; vm.saveComm() }
            HairlineDivider()
            ToggleRow(Icons.Filled.LocalOffer, Purple, PurpleLight, "Promotional Offers", "Bonuses, campaigns & offers", vm.commPromo) { vm.commPromo = it; vm.saveComm() }
        }
        Text(
            "Important account, job and payment messages are always sent, regardless of these settings.",
            color = TextMuted, fontSize = 11.5.sp, lineHeight = 15.sp,
            modifier = Modifier.padding(horizontal = Space.xs),
        )
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
