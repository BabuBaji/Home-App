package com.homehelp.pro

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.homehelp.pro.network.ShiftDto
import kotlinx.coroutines.delay
import java.util.Calendar

// ─────────────────────────────────────────────────────────────────────────────────────────────
// MY SHIFTS — driven by the worker's REAL assigned shift (vm.shifts + selectedShiftId) and their
// available days. Today's live ring ticks off the wall clock; upcoming shifts are the assigned
// shift on the next available days; the calendar and shift-swap are wired to real state.
// ─────────────────────────────────────────────────────────────────────────────────────────────

private val DOW_KEYS = mapOf(
    Calendar.MONDAY to "Mon", Calendar.TUESDAY to "Tue", Calendar.WEDNESDAY to "Wed",
    Calendar.THURSDAY to "Thu", Calendar.FRIDAY to "Fri", Calendar.SATURDAY to "Sat", Calendar.SUNDAY to "Sun",
)
private val MONS = listOf("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")
private val DOW_SHORT = listOf("SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT")

@Composable
fun MyShiftsScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var tab by remember { mutableStateOf("My Schedule") }
    val tabs = listOf("My Schedule", "Shift Swap", "Availability", "Shift History")
    LaunchedEffect(Unit) { vm.loadShifts(); vm.loadAvailability() }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Row(
            Modifier.fillMaxWidth().background(Color.White).padding(horizontal = Space.s).padding(top = 10.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(38.dp).clip(CircleShape).clickable { nav.popBackStack() }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Purple, modifier = Modifier.size(22.dp))
            }
            Text("My Shifts", color = Purple, fontSize = 19.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            Box(Modifier.size(32.dp).clip(CircleShape).border(1.5.dp, Purple, CircleShape).clickable { nav.navigate(Routes.P_AVAILABILITY) }, contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Add, contentDescription = "Add", tint = Purple, modifier = Modifier.size(18.dp))
            }
        }

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.m).padding(top = Space.m, bottom = Space.m),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                tabs.forEach { t ->
                    val on = t == tab
                    Box(
                        Modifier.clip(RoundedCornerShape(Radius.pill)).background(if (on) Purple else FieldFill).clickable { tab = t }.padding(horizontal = 15.dp, vertical = 8.dp),
                    ) { Text(t, color = if (on) Color.White else TextDark, fontSize = 12.5.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Medium) }
                }
            }

            when (tab) {
                "Availability" -> {
                    ShiftHint("Set the days & hours you're available — an admin confirms them.")
                    OutlineButton("Open Availability", modifier = Modifier.fillMaxWidth()) { nav.navigate(Routes.P_AVAILABILITY) }
                }
                "Shift History" -> ShiftHint("Your completed shifts will appear here.")
                "Shift Swap" -> ShiftSwapTab(vm, ctx)
                else -> ScheduleTab(vm, nav, ctx)
            }
        }
    }
}

@Composable
private fun ScheduleTab(vm: AppViewModel, nav: NavHostController, ctx: android.content.Context) {
    val shift = vm.shifts.firstOrNull { it.id == vm.selectedShiftId } ?: vm.shifts.firstOrNull()
    var showCalendar by remember { mutableStateOf(false) }

    if (shift == null) {
        ShiftHint("You're not on a shift yet. Tap ＋ to pick your shift & availability.")
        OutlineButton("Choose a Shift", modifier = Modifier.fillMaxWidth()) { nav.navigate(Routes.P_AVAILABILITY) }
        return
    }

    val startMin = parseShiftMin(shift.start)
    val endMin = parseShiftMin(shift.end)

    // ── Today's shift hero — live ring off the wall clock.
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { nowMs = System.currentTimeMillis(); delay(30000) } }
    val cal = Calendar.getInstance().apply { timeInMillis = nowMs }
    val nowMin = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
    val total = if (startMin != null && endMin != null) (endMin - startMin).coerceAtLeast(1) else 480
    val active = startMin != null && endMin != null && nowMin in startMin until endMin
    val leftMin = if (startMin != null && endMin != null) (endMin - nowMin).coerceIn(0, total) else total
    val frac = leftMin.toFloat() / total

    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card))
            .background(Brush.horizontalGradient(listOf(Color(0xFF4A34C7), Color(0xFF6D4BE0)))).padding(Space.l),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Today's Shift", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                    Spacer(Modifier.width(8.dp))
                    Box(Modifier.clip(RoundedCornerShape(Radius.pill)).background(Color.White.copy(alpha = 0.2f)).padding(horizontal = 8.dp, vertical = 3.dp)) {
                        Text(if (active) "Active" else "Upcoming", color = Color(0xFF86EFAC), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Spacer(Modifier.height(6.dp))
                Text("${fmtShift(shift.start)} – ${fmtShift(shift.end)}", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp)
                Text("${shift.name} Shift", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = Color.White.copy(alpha = 0.9f), modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(vm.workerCity.ifBlank { "Hyderabad" }, color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                }
            }
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(94.dp)) {
                CircularProgressIndicator(progress = { 1f }, modifier = Modifier.size(94.dp), color = Color.White.copy(alpha = 0.22f), strokeWidth = 7.dp)
                CircularProgressIndicator(progress = { frac.coerceIn(0f, 1f) }, modifier = Modifier.size(94.dp), color = Color(0xFF4ADE80), trackColor = Color.Transparent, strokeWidth = 7.dp, strokeCap = StrokeCap.Round)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(if (active) "In Shift" else "Starts in", color = Color.White.copy(alpha = 0.9f), fontSize = 10.sp)
                    Text("%02d:%02d".format(leftMin / 60, leftMin % 60), color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Text("hrs left", color = Color.White.copy(alpha = 0.85f), fontSize = 10.sp)
                }
            }
        }
    }

    // ── Upcoming shifts — the assigned shift on the next available days.
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text("Upcoming Shifts", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        Row(Modifier.clip(RoundedCornerShape(Radius.pill)).clickable { showCalendar = !showCalendar }.padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(5.dp))
            Text(if (showCalendar) "Hide Calendar" else "View Calendar", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
    }

    if (showCalendar) ShiftCalendar(vm)

    val upcoming = upcomingDays(vm)
    if (upcoming.isEmpty()) {
        ShiftHint("No working days set yet. Tap ＋ to set your availability.")
    } else {
        upcoming.forEach { c ->
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.width(44.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(DOW_SHORT[c.get(Calendar.DAY_OF_WEEK) - 1], color = Purple, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        Text("${c.get(Calendar.DAY_OF_MONTH)}", color = TextDark, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                        Text(MONS[c.get(Calendar.MONTH)], color = Purple, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(Space.m))
                    Box(Modifier.width(1.dp).height(50.dp).background(Divider))
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text("${shift.name} Shift", color = Purple, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        Text("${fmtShift(shift.start)} – ${fmtShift(shift.end)}", color = TextGray, fontSize = 13.sp)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.LocationOn, contentDescription = null, tint = TextMuted, modifier = Modifier.size(12.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(vm.workerCity.ifBlank { "Hyderabad" }, color = TextGray, fontSize = 12.sp, maxLines = 1)
                        }
                    }
                    Box(Modifier.clip(RoundedCornerShape(Radius.pill)).background(PurpleLight).padding(horizontal = 9.dp, vertical = 4.dp)) {
                        Text("Scheduled", color = Purple, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }

    // ── Week overview — all four in one card, evenly aligned.
    Text("This Week Overview", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
    val workDays = vm.availableDays.count { it.value }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(Radius.card)).padding(vertical = 14.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OverviewStat(Modifier.weight(1f), Icons.Filled.CalendarMonth, Purple, PurpleLight, "$workDays", "Total Shifts")
        Box(Modifier.width(1.dp).height(40.dp).background(Divider))
        OverviewStat(Modifier.weight(1f), Icons.Filled.CheckCircle, GreenSuccess, GreenLight, "$workDays", "Scheduled")
        Box(Modifier.width(1.dp).height(40.dp).background(Divider))
        OverviewStat(Modifier.weight(1f), Icons.Filled.Schedule, Amber, GoldLight, "0", "Pending")
        Box(Modifier.width(1.dp).height(40.dp).background(Divider))
        OverviewStat(Modifier.weight(1f), Icons.Filled.Close, RedCancel, RedLight, "0", "Cancelled")
    }

    // ── Quick actions.
    Text("Quick Actions", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
        ShiftAction(Modifier.weight(1f), Icons.AutoMirrored.Filled.CompareArrows, Purple, "Request Shift Swap") { toast(ctx, "Open the Shift Swap tab to request a swap") }
        ShiftAction(Modifier.weight(1f), Icons.Filled.EventAvailable, GreenSuccess, "Set Availability") { nav.navigate(Routes.P_AVAILABILITY) }
        ShiftAction(Modifier.weight(1f), Icons.Filled.Schedule, Amber, "Request Time Off") { nav.navigate(Routes.LEAVE) }
        ShiftAction(Modifier.weight(1f), Icons.Filled.Description, Color(0xFF3B82F6), "Shift History") { toast(ctx, "No past shifts yet") }
    }
    Spacer(Modifier.height(Space.s))
}

/* ── Shift Swap tab — pick a different shift; routes through the real selectShift request. ── */
@Composable
private fun ShiftSwapTab(vm: AppViewModel, ctx: android.content.Context) {
    ShiftHint("Pick the shift you'd like to move to. An admin confirms the swap — your current shift stands until then.")
    if (vm.shifts.isEmpty()) { ShiftHint("No shifts available to swap into right now."); return }
    vm.shifts.forEach { s ->
        val current = vm.selectedShiftId == s.id
        val requested = vm.requestedShiftId == s.id && !current
        Card(modifier = Modifier.clickable(enabled = !current) { vm.selectShift(s.id) { toast(ctx, "Requested ${s.name} Shift — awaiting approval") } }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(40.dp).clip(CircleShape).background(if (current) GreenLight else PurpleLight), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Schedule, contentDescription = null, tint = if (current) GreenSuccess else Purple, modifier = Modifier.size(20.dp))
                }
                Spacer(Modifier.width(Space.m))
                Column(Modifier.weight(1f)) {
                    Text("${s.name} Shift", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Text("${fmtShift(s.start)} – ${fmtShift(s.end)} · ${s.hours}h", color = TextGray, fontSize = 12.5.sp)
                }
                when {
                    current -> Box(Modifier.clip(RoundedCornerShape(Radius.pill)).background(GreenLight).padding(horizontal = 9.dp, vertical = 4.dp)) {
                        Text("Current", color = GreenSuccess, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    requested -> Box(Modifier.clip(RoundedCornerShape(Radius.pill)).background(GoldLight).padding(horizontal = 9.dp, vertical = 4.dp)) {
                        Text("Requested", color = Amber, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    else -> Text("Swap", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

/* ── Inline month calendar — highlights today and the worker's available weekdays. ── */
@Composable
private fun ShiftCalendar(vm: AppViewModel) {
    val cal = remember { Calendar.getInstance() }
    val today = cal.get(Calendar.DAY_OF_MONTH)
    val month = cal.get(Calendar.MONTH); val year = cal.get(Calendar.YEAR)
    val first = (cal.clone() as Calendar).apply { set(Calendar.DAY_OF_MONTH, 1) }
    val startOffset = first.get(Calendar.DAY_OF_WEEK) - 1 // 0 = Sunday col
    val daysInMonth = cal.getActualMaximum(Calendar.DAY_OF_MONTH)
    val monthName = listOf("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")[month]

    Card {
        Text("$monthName $year", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth()) {
            listOf("S", "M", "T", "W", "T", "F", "S").forEach { d ->
                Text(d, color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            }
        }
        Spacer(Modifier.height(6.dp))
        val cells = startOffset + daysInMonth
        val rows = (cells + 6) / 7
        for (r in 0 until rows) {
            Row(Modifier.fillMaxWidth()) {
                for (c in 0 until 7) {
                    val cellIdx = r * 7 + c
                    val day = cellIdx - startOffset + 1
                    Box(Modifier.weight(1f).height(38.dp), contentAlignment = Alignment.Center) {
                        if (day in 1..daysInMonth) {
                            val dowIdx = (startOffset + day - 1) % 7 // 0=Sun
                            val key = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")[dowIdx]
                            val works = vm.availableDays[key] == true
                            val isToday = day == today
                            Box(
                                Modifier.size(30.dp).clip(CircleShape)
                                    .background(if (isToday) Purple else if (works) PurpleLight else Color.Transparent),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("$day", color = if (isToday) Color.White else if (works) Purple else TextGray, fontSize = 12.5.sp, fontWeight = if (isToday || works) FontWeight.Bold else FontWeight.Normal)
                            }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(10.dp).clip(CircleShape).background(PurpleLight)); Spacer(Modifier.width(5.dp))
            Text("Working day", color = TextGray, fontSize = 11.sp)
            Spacer(Modifier.width(Space.m))
            Box(Modifier.size(10.dp).clip(CircleShape).background(Purple)); Spacer(Modifier.width(5.dp))
            Text("Today", color = TextGray, fontSize = 11.sp)
        }
    }
}

@Composable
private fun OverviewStat(modifier: Modifier, icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, bg: Color, value: String, label: String) {
    Column(modifier.padding(horizontal = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(30.dp).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
        }
        Spacer(Modifier.height(5.dp))
        Text(value, color = TextDark, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text(label, color = TextGray, fontSize = 10.sp, textAlign = TextAlign.Center, maxLines = 1, lineHeight = 12.sp)
    }
}

@Composable
private fun ShiftAction(modifier: Modifier, icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, label: String, onClick: () -> Unit) {
    Column(
        modifier.height(84.dp).clip(RoundedCornerShape(14.dp)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(14.dp)).clickable(onClick = onClick).padding(horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(Modifier.size(38.dp).clip(CircleShape).background(tint.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.height(7.dp))
        Text(label, color = TextDark, fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, lineHeight = 12.sp)
    }
}

@Composable
private fun ShiftHint(text: String) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(Primary50).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(Space.m))
        Text(text, color = TextGray, fontSize = 13.sp, lineHeight = 17.sp)
    }
}

/* ── helpers ── */

/** Next up-to-4 dates (from tomorrow) that fall on the worker's available weekdays. */
private fun upcomingDays(vm: AppViewModel): List<Calendar> {
    val anyDay = vm.availableDays.any { it.value }
    val out = ArrayList<Calendar>()
    val c = Calendar.getInstance()
    var guard = 0
    while (out.size < 4 && guard < 21) {
        c.add(Calendar.DAY_OF_YEAR, 1); guard++
        val key = DOW_KEYS[c.get(Calendar.DAY_OF_WEEK)] ?: ""
        if (!anyDay || vm.availableDays[key] == true) out.add(c.clone() as Calendar)
    }
    return out
}

/** Parse "14:00" / "2:00 PM" / "2 PM" to minutes-of-day, or null. */
private fun parseShiftMin(t: String): Int? {
    val m = Regex("(\\d{1,2})(?::(\\d{2}))?\\s*(AM|PM)?", RegexOption.IGNORE_CASE).find(t.trim()) ?: return null
    var h = m.groupValues[1].toIntOrNull() ?: return null
    val min = m.groupValues[2].toIntOrNull() ?: 0
    when (m.groupValues[3].uppercase()) {
        "PM" -> if (h < 12) h += 12
        "AM" -> if (h == 12) h = 0
    }
    return (h * 60 + min).coerceIn(0, 24 * 60)
}

/** Display a shift time as "hh:mm a" regardless of the stored format. */
private fun fmtShift(t: String): String {
    val mins = parseShiftMin(t) ?: return t
    var h = mins / 60; val m = mins % 60
    val ap = if (h >= 12) "PM" else "AM"
    h = when { h == 0 -> 12; h > 12 -> h - 12; else -> h }
    return "%02d:%02d %s".format(h, m, ap)
}
