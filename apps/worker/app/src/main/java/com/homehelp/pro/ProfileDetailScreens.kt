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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

@Composable
private fun DetailScaffold(title: String, nav: NavHostController, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header(title, onBack = { nav.popBackStack() })
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) { content() }
    }
}

@Composable
private fun Field(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
    )
}

@Composable
fun PersonalInfoScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    DetailScaffold("Personal Information", nav) {
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(vm.workerName.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString(""), size = 56)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(vm.workerName, fontWeight = FontWeight.Bold, color = TextDark)
                    Text("${vm.workerRating} ★ • ${vm.jobsCompleted} jobs", fontSize = 12.sp, color = TextGray)
                }
            }
        }
        Field("Full Name", vm.workerName) { vm.workerName = it }
        Field("Mobile Number", vm.workerPhone) { vm.workerPhone = it }
        Field("Email", vm.workerEmail) { vm.workerEmail = it }
        Field("City", vm.workerCity) { vm.workerCity = it }
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
            val fileName = pickedFileName(ctx, uri)
            vm.uploadDocument(docName, fileName)
            toast(ctx, "$docName uploaded: $fileName")
        } else if (docName != null) {
            toast(ctx, "Upload cancelled")
        }
        pendingDoc = null
    }

    DetailScaffold("Documents", nav) {
        Text(
            "Upload a clear photo or PDF scan for each document. Files are reviewed within 24–48 hours.",
            fontSize = 12.sp, color = TextGray,
        )
        vm.documents.forEach { doc ->
            val (pillBg, pillFg) = when (doc.status) {
                "Verified" -> GreenLight to GreenSuccess
                "Under Review" -> PurpleLight to Purple
                else -> Color(0xFFFFF3D6) to Gold
            }
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Verified, contentDescription = null, tint = pillFg, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(doc.name, fontWeight = FontWeight.SemiBold, color = TextDark)
                        if (doc.fileName.isNotBlank()) {
                            Text(doc.fileName, fontSize = 11.sp, color = TextGray)
                        }
                    }
                    StatusPill(doc.status, pillBg, pillFg)
                }
                Spacer(Modifier.height(10.dp))
                OutlineButton(
                    if (doc.status == "Verified") "Replace Document" else "Upload Document",
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    pendingDoc = doc.name
                    // Accept images and PDFs; system picker honours the mime hint.
                    picker.launch("*/*")
                }
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
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) { chequeName = pickedFileName(ctx, uri); toast(ctx, "Attached: $chequeName") }
    }
    val (pillBg, pillFg) = when (vm.bankStatus) {
        "Approved" -> GreenLight to GreenSuccess
        "Pending Verification" -> Color(0xFFFFF3D6) to Gold
        "Rejected" -> Color(0xFFFDE7E7) to RedCancel
        else -> PurpleLight to Purple
    }

    DetailScaffold("Bank & KYC", nav) {
        // Verification status — and the rule that withdrawals need an Approved account.
        Card {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Verification Status", fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.weight(1f))
                StatusPill(if (vm.bankStatus == "Not Added") "Not Added" else vm.bankStatus, pillBg, pillFg)
            }
            if (vm.bankStatus == "Rejected" && vm.bankRemarks.isNotBlank()) {
                Spacer(Modifier.height(6.dp)); Text("Reason: ${vm.bankRemarks}", fontSize = 12.sp, color = RedCancel)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                if (vm.bankApproved) "Your account is verified — you can withdraw money."
                else "You can withdraw only after admin approves your bank account.",
                fontSize = 12.sp, color = if (vm.bankApproved) GreenSuccess else TextGray,
            )
        }

        if (!otpStep) {
            Field("Account Holder Name", vm.bankHolder) { vm.bankHolder = it }
            Field("Bank Name", vm.bankName) { vm.bankName = it }
            Field("Account Number", vm.bankAccount) { vm.bankAccount = it }
            Field("Re-enter Account Number", reenter) { reenter = it }
            Field("IFSC Code", vm.bankIfsc) { vm.bankIfsc = it }
            Field("UPI ID (optional)", vm.bankUpi) { vm.bankUpi = it }
            // Optional cancelled cheque / passbook photo.
            Box(
                Modifier.fillMaxWidth().background(PurpleLight, RoundedCornerShape(12.dp))
                    .clickable { picker.launch("image/*") }.padding(14.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CheckCircle, null, tint = if (chequeName.isBlank()) TextGray else GreenSuccess, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(chequeName.ifBlank { "Attach cancelled cheque / passbook (optional)" }, fontSize = 13.sp, color = TextDark)
                }
            }
            PrimaryButton("Continue") {
                when {
                    vm.bankHolder.isBlank() || vm.bankName.isBlank() || vm.bankAccount.isBlank() || vm.bankIfsc.isBlank() ->
                        toast(ctx, "Please fill all required fields")
                    vm.bankAccount.trim() != reenter.trim() -> toast(ctx, "Account numbers do not match")
                    else -> otpStep = true
                }
            }
        } else {
            Card {
                Text("OTP Confirmation", fontWeight = FontWeight.SemiBold, color = TextDark)
                Spacer(Modifier.height(4.dp))
                Text("Enter the 4-digit OTP sent to your registered mobile to confirm these bank details.", fontSize = 12.sp, color = TextGray)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = otp,
                    onValueChange = { if (it.length <= 4 && it.all(Char::isDigit)) otp = it },
                    label = { Text("OTP") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
            }
            PrimaryButton("Verify & Submit") {
                if (otp.length < 4) toast(ctx, "Enter the 4-digit OTP")
                else {
                    vm.saveBank(chequeName)
                    toast(ctx, "Bank submitted — pending admin verification")
                    otpStep = false; otp = ""; reenter = ""
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
            Text("Working Days", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(4.dp))
            days.forEach { d ->
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(d, color = TextDark, modifier = Modifier.weight(1f))
                    Switch(
                        checked = vm.availableDays[d] ?: false,
                        onCheckedChange = { vm.availableDays[d] = it },
                        colors = SwitchDefaults.colors(checkedTrackColor = GreenSuccess),
                    )
                }
                Divider(color = Divider)
            }
        }
        Card {
            Text("Preferred Shift", fontWeight = FontWeight.SemiBold, color = TextDark)
            Text("Pick full-time or a 4-hour part-time slot.", fontSize = 12.sp, color = TextGray)
            Spacer(Modifier.height(12.dp))

            // Start on the type that matches the worker's current shift (part-time slots are 4h).
            var shiftType by remember {
                mutableStateOf(if (PART_TIME_SHIFTS.any { it.start == vm.shiftStart && it.end == vm.shiftEnd }) "Part Time" else "Full Time")
            }
            SegmentedTabs(listOf("Full Time", "Part Time"), shiftType) { shiftType = it }
            Spacer(Modifier.height(12.dp))

            val presets = if (shiftType == "Part Time") PART_TIME_SHIFTS else FULL_TIME_SHIFTS
            presets.chunked(2).forEach { rowItems ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    rowItems.forEach { s ->
                        val selected = vm.shiftStart == s.start && vm.shiftEnd == s.end
                        ShiftChip(s.label, "${s.start} – ${s.end}", selected, Modifier.weight(1f)) {
                            vm.shiftStart = s.start; vm.shiftEnd = s.end
                        }
                    }
                    if (rowItems.size == 1) Spacer(Modifier.weight(1f))
                }
                Spacer(Modifier.height(10.dp))
            }
            val shiftSet = vm.shiftStart.isNotBlank() && vm.shiftEnd.isNotBlank()
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
    DetailScaffold("Performance", nav) {
        Card {
            Column {
                Text("Your Rating", fontSize = 12.sp, color = TextGray)
                Text(if (vm.jobsCompleted > 0) "${vm.workerRating} ★" else "New Partner", fontWeight = FontWeight.Bold, color = TextDark, fontSize = 26.sp)
                Text("${vm.jobsCompleted} jobs completed all-time", fontSize = 12.sp, color = TextGray)
            }
        }
        Card {
            Text("Activity", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                PerfTile(Modifier.weight(1f), "${vm.todayJobs}", "Jobs Today")
                PerfTile(Modifier.weight(1f), "${vm.todayCompleted}", "Completed")
                PerfTile(Modifier.weight(1f), "₹${vm.todayEarnings}", "Today")
            }
            Spacer(Modifier.height(12.dp)); HairlineDivider(); Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                PerfTile(Modifier.weight(1f), "₹${vm.weekEarnings}", "This Week")
                PerfTile(Modifier.weight(1f), "₹${vm.monthEarnings}", "This Month")
                PerfTile(Modifier.weight(1f), "₹${vm.totalEarned}", "Lifetime")
            }
        }
        Card {
            Text("Incentives & Goals", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(12.dp))
            Text("Daily earnings goal", fontSize = 13.sp, color = TextDark, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(6.dp))
            ProgressBar(vm.goalProgress, fill = if (vm.goalProgress >= 1f) GreenSuccess else Purple, height = 10)
            Spacer(Modifier.height(6.dp))
            Text(
                if (vm.goalProgress >= 1f) "Goal reached 🎉  ₹${vm.todayEarnings} of ₹${vm.dailyGoal}"
                else "₹${(vm.dailyGoal - vm.todayEarnings).coerceAtLeast(0)} to go  ·  ₹${vm.todayEarnings} of ₹${vm.dailyGoal}",
                fontSize = 12.sp, color = TextGray,
            )
            Spacer(Modifier.height(16.dp))
            val next = WorkerTier.next(vm.tier)
            if (next != null && vm.jobsToNextTier > 0) {
                Text("Next tier: ${next.label} ${next.emoji}", fontSize = 13.sp, color = TextDark, fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(6.dp))
                val span = (next.minJobs - vm.tier.minJobs).coerceAtLeast(1)
                val tp = ((vm.jobsCompleted - vm.tier.minJobs).toFloat() / span).coerceIn(0f, 1f)
                ProgressBar(tp, fill = Purple)
                Spacer(Modifier.height(6.dp))
                Text("${vm.jobsToNextTier} more jobs to reach ${next.label}", fontSize = 12.sp, color = TextGray)
            } else {
                Text("You're at the top tier — ${vm.tier.label} ${vm.tier.emoji} 🏆", fontSize = 13.sp, color = TextDark)
            }
        }
    }
}

@Composable
private fun PerfTile(modifier: Modifier, value: String, label: String) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.Bold, color = TextDark, fontSize = 18.sp)
        Spacer(Modifier.height(2.dp))
        Text(label, fontSize = 11.sp, color = TextGray)
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
            Text("Request Leave", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(from, { from = it }, label = { Text("From (YYYY-MM-DD)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(to, { to = it }, label = { Text("To (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(reason, { reason = it }, label = { Text("Reason") }, minLines = 2, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            PrimaryButton(if (busy) "Submitting…" else "Submit Request") {
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
        Card {
            Text("My Requests", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(6.dp))
            if (vm.leaves.isEmpty()) {
                Text("No leave requests yet.", fontSize = 13.sp, color = TextGray, modifier = Modifier.padding(vertical = 8.dp))
            } else {
                vm.leaves.forEach { lv ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                if (lv.toDate.isNotBlank() && lv.toDate != lv.fromDate) "${lv.fromDate} → ${lv.toDate}" else lv.fromDate,
                                fontWeight = FontWeight.Medium, color = TextDark, fontSize = 14.sp,
                            )
                            if (lv.reason.isNotBlank()) Text(lv.reason, fontSize = 12.sp, color = TextGray)
                        }
                        val (bg, fg) = when (lv.status) {
                            "Approved" -> GreenLight to GreenSuccess
                            "Rejected" -> Color(0xFFFDE7E7) to RedCancel
                            else -> GoldLight to Gold
                        }
                        StatusPill(lv.status, bg, fg)
                    }
                    Divider(color = Divider)
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
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val (dot, label) = when {
                    att.checkedOut -> GreenSuccess to "Checked Out"
                    att.checkedIn -> GreenSuccess to "Checked In · Working"
                    else -> TextGray to "Not Checked In"
                }
                Box(Modifier.size(12.dp).background(dot, RoundedCornerShape(50)))
                Spacer(Modifier.width(10.dp))
                Text(label, fontWeight = FontWeight.Bold, color = TextDark, fontSize = 16.sp)
            }
            Spacer(Modifier.height(12.dp)); HairlineDivider(); Spacer(Modifier.height(10.dp))
            LabeledRow("Check-in time", att.checkInAt.ifBlank { "—" })
            LabeledRow("Check-out time", att.checkOutAt.ifBlank { "—" })
            LabeledRow("Shift", if (vm.shiftStart.isNotBlank()) "${vm.shiftStart} – ${vm.shiftEnd}" else "Not set")
        }
        // Availability state — only "Available" receives new jobs.
        Card {
            Text("Availability", fontWeight = FontWeight.SemiBold, color = TextDark)
            Text("Only “Available” receives new jobs.", fontSize = 12.sp, color = TextGray)
            Spacer(Modifier.height(10.dp))
            listOf("Available", "Busy", "Break", "Offline", "Leave").chunked(3).forEach { rowStates ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    rowStates.forEach { st ->
                        val sel = vm.availabilityState == st
                        Box(
                            Modifier.weight(1f).clip(RoundedCornerShape(10.dp))
                                .background(if (sel) Purple else Color.White)
                                .border(1.dp, if (sel) Purple else Divider, RoundedCornerShape(10.dp))
                                .clickable { vm.changeAvailabilityState(st) }
                                .padding(vertical = 10.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(st, color = if (sel) Color.White else TextDark, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                    repeat(3 - rowStates.size) { Spacer(Modifier.weight(1f)) }
                }
                Spacer(Modifier.height(8.dp))
            }
            Text(
                "Request Leave ›", color = Purple, fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
                modifier = Modifier.clickable { nav.navigate(Routes.LEAVE) }.padding(top = 2.dp),
            )
        }
        Box(Modifier.fillMaxWidth().background(PurpleLight, RoundedCornerShape(12.dp)).padding(12.dp)) {
            Text("📍 Your location is captured at check-in / check-out for verification.", fontSize = 12.sp, color = TextDark)
        }
        when {
            !att.checkedIn -> PrimaryButton("Check In") { val (la, ln) = lastLoc(); vm.checkIn(la, ln) { toast(ctx, "Checked in ✓") } }
            !att.checkedOut -> PrimaryButton("Check Out") { val (la, ln) = lastLoc(); vm.checkOut(la, ln) { toast(ctx, "Checked out ✓") } }
            else -> Box(Modifier.fillMaxWidth().background(GreenLight, RoundedCornerShape(12.dp)).padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(10.dp))
                    Text("Shift complete for today. See you tomorrow!", color = GreenSuccess, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                }
            }
        }
    }
}

@Composable
private fun ShiftChip(title: String, subtitle: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) PurpleLight else Color.White)
            .border(BorderStroke(1.5.dp, if (selected) Purple else Divider), RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 12.dp),
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
            Text("Job types you want to receive", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(4.dp))
            vm.jobPreferences.keys.toList().forEach { service ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = vm.jobPreferences[service] ?: false,
                        onCheckedChange = { vm.jobPreferences[service] = it },
                        colors = CheckboxDefaults.colors(checkedColor = Purple),
                    )
                    Text(service, color = TextDark)
                }
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
                Text("Recent", fontWeight = FontWeight.SemiBold, color = TextDark)
                Spacer(Modifier.height(6.dp))
                vm.notifications.take(25).forEach { n ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("🔔", fontSize = 16.sp)
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(n.text, fontSize = 13.sp, color = TextDark)
                            if (n.date.isNotBlank()) Text(n.date, fontSize = 11.sp, color = TextGray)
                        }
                    }
                    Divider(color = Divider)
                }
            }
        }
        Card {
            Text("Notification Settings", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(4.dp))
            NotifRow("New job alerts", vm.notifNewJobs) { vm.notifNewJobs = it; vm.saveNotifications() }
            Divider(color = Divider)
            NotifRow("Payment updates", vm.notifPayments) { vm.notifPayments = it; vm.saveNotifications() }
            Divider(color = Divider)
            NotifRow("Ratings & feedback", vm.notifRatings) { vm.notifRatings = it; vm.saveNotifications() }
            Divider(color = Divider)
            NotifRow("Promotions & offers", vm.notifPromotions) { vm.notifPromotions = it; vm.saveNotifications() }
        }
    }
}

@Composable
private fun NotifRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = TextDark, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedTrackColor = Purple))
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
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(RedCancel)
                .clickable { val (la, ln) = lastLoc(); vm.sendSos(la, ln) { sosMsg = it } }.padding(18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🆘", fontSize = 26.sp)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Emergency SOS", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    Text("Alerts our team & shares your location", color = Color.White.copy(alpha = 0.9f), fontSize = 12.sp)
                }
            }
        }
        Card {
            Row(Modifier.fillMaxWidth().clickable {
                    runCatching { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:18001234567"))) }
                        .onFailure { toast(ctx, "No dialer app found") }
                }
                .padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Phone, contentDescription = null, tint = Purple, modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Call Support", fontWeight = FontWeight.SemiBold, color = TextDark)
                    Text("1800-123-456 • 24x7", fontSize = 12.sp, color = TextGray)
                }
            }
            Divider(color = Divider)
            Row(Modifier.fillMaxWidth().clickable {
                    val i = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:support@homehelp.pro"))
                        .putExtra(Intent.EXTRA_SUBJECT, "HomeHelp Pro — Support")
                    runCatching { ctx.startActivity(i) }.onFailure { toast(ctx, "No email app found") }
                }
                .padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Email, contentDescription = null, tint = Purple, modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Email Us", fontWeight = FontWeight.SemiBold, color = TextDark)
                    Text("support@homehelp.pro", fontSize = 12.sp, color = TextGray)
                }
            }
        }
        Card {
            Text("Raise a Ticket", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(subject, { subject = it }, label = { Text("Subject") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(message, { message = it }, label = { Text("Describe your issue") }, minLines = 2, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            PrimaryButton(if (busy) "Submitting…" else "Submit Ticket") {
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
                Text("My Tickets", fontWeight = FontWeight.SemiBold, color = TextDark)
                Spacer(Modifier.height(6.dp))
                vm.tickets.forEach { t ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(t.subject.ifBlank { "Support request" }, fontWeight = FontWeight.Medium, color = TextDark, fontSize = 14.sp)
                            if (t.message.isNotBlank()) Text(t.message, fontSize = 12.sp, color = TextGray, maxLines = 1)
                        }
                        val (bg, fg) = if (t.status == "Resolved") GreenLight to GreenSuccess else GoldLight to Gold
                        StatusPill(t.status, bg, fg)
                    }
                    Divider(color = Divider)
                }
            }
        }
        Card {
            Text("FAQs", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(8.dp))
            val faqs = listOf(
                "How do I receive jobs?" to "Go online from the Home screen. When a nearby job matches your services and shift, it's offered to you — tap Accept, then navigate to the customer.",
                "When do I get paid?" to "Earnings for a completed job are credited to your wallet right away. Withdraw to your bank anytime from the Wallet tab.",
                "How is my rating calculated?" to "It's the average of the star ratings customers leave after each completed job. A higher rating gets you more job offers.",
                "How do I withdraw my earnings?" to "Open the Wallet tab → Withdraw, enter the amount and confirm. Add and verify your bank details first under Profile → Bank Details.",
            )
            val open = remember { mutableStateOf(-1) }
            faqs.forEachIndexed { i, (q, a) ->
                Column(
                    Modifier.fillMaxWidth().clickable { open.value = if (open.value == i) -1 else i }.padding(vertical = 8.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(q, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                        Text(if (open.value == i) "▲" else "▼", color = TextGray, fontSize = 12.sp)
                    }
                    if (open.value == i) {
                        Spacer(Modifier.height(6.dp))
                        Text(a, color = TextGray, fontSize = 13.sp, lineHeight = 18.sp)
                    }
                }
                Divider(color = Divider)
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
                Box(Modifier.size(48.dp).background(Purple, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
                }
                Spacer(Modifier.width(12.dp))
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
                color = TextDark, fontSize = 14.sp,
            )
        }
        Card {
            val links = listOf(
                "Terms & Conditions" to "https://homehelp.pro/terms",
                "Privacy Policy" to "https://homehelp.pro/privacy",
                "Licenses" to "https://homehelp.pro/licenses",
            )
            links.forEachIndexed { i, (label, url) ->
                Row(
                    Modifier.fillMaxWidth().clickable {
                        runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                            .onFailure { toast(ctx, "No browser app found") }
                    }.padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(label, color = TextDark, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    Text("›", color = TextGray, fontSize = 16.sp)
                }
                if (i < links.lastIndex) Divider(color = Divider)
            }
        }
        Text("© 2026 HomeHelp Technologies", color = TextGray, fontSize = 12.sp,
            modifier = Modifier.fillMaxWidth(), )
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
            Text("Language", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("English", "हिंदी", "తెలుగు").forEach { l ->
                    val sel = lang == l
                    Box(
                        Modifier.weight(1f).clip(RoundedCornerShape(10.dp))
                            .background(if (sel) Purple else Color.White)
                            .border(1.dp, if (sel) Purple else Divider, RoundedCornerShape(10.dp))
                            .clickable { lang = l; Session.language = l; toast(ctx, "Language: $l") }
                            .padding(vertical = 10.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(l, color = if (sel) Color.White else TextDark, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }
        }
        Card {
            SettingsRow("Notifications") { nav.navigate(Routes.P_NOTIFICATIONS) }
            Divider(color = Divider)
            SettingsRow("Privacy Policy") {
                runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://homehelp.pro/privacy"))) }
                    .onFailure { toast(ctx, "No browser app found") }
            }
            Divider(color = Divider)
            Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("App Version", color = TextDark, modifier = Modifier.weight(1f))
                Text("v$version", color = TextGray)
            }
        }
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White)
                .border(1.dp, Divider, RoundedCornerShape(12.dp))
                .clickable { vm.logout(); nav.navigate(Routes.LOGIN) { popUpTo(Routes.HOME) { inclusive = true } } }
                .padding(16.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text("Logout", color = RedCancel, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun SettingsRow(label: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = TextDark, modifier = Modifier.weight(1f))
        Text("›", color = TextGray, fontSize = 18.sp)
    }
}
