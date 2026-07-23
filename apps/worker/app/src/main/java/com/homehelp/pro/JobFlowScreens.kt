package com.homehelp.pro

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.location.LocationManager
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Apartment
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import coil.compose.SubcomposeAsyncImage
import kotlinx.coroutines.delay

// Time the worker has to accept a new job before it's auto-rejected and offered elsewhere.
private const val ACCEPT_WINDOW_SEC = 120  // 2 minutes

// On-time-start reward / late-start penalty (mirrors the wallet service; shown to the worker).
private const val ONTIME_BONUS = 15
private const val LATE_PENALTY = 15

/**
 * Banner shown after a job is accepted, until the service is started. Counts down the 15-min
 * window in which the worker must enter the customer OTP to start. Purely informational — the
 * backend independently credits the +₹15 on-time bonus or deducts the ₹15 late penalty.
 */
@Composable
fun StartDeadlineBanner(vm: AppViewModel) {
    if (vm.jobAcceptedAtMs <= 0L) return
    val deadline = vm.jobAcceptedAtMs + vm.startWindowMinutes * 60_000L
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(vm.jobAcceptedAtMs) {
        while (true) { nowMs = System.currentTimeMillis(); delay(1000) }
    }
    val remainingSec = ((deadline - nowMs) / 1000L).toInt()
    val expired = remainingSec <= 0
    val shown = if (expired) 0 else remainingSec
    val bg = if (expired) RedLight else if (remainingSec <= 120) GoldLight else PurpleLight
    val fg = if (expired) RedCancel else if (remainingSec <= 120) Gold else Purple
    Box(Modifier.fillMaxWidth().background(bg, RoundedCornerShape(Radius.card)).padding(Space.m)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(38.dp).clip(RoundedCornerShape(Radius.pill)).background(Color.White.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Schedule, contentDescription = null, tint = fg, modifier = Modifier.size(20.dp)) }
            Spacer(Modifier.width(Space.m))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).clip(RoundedCornerShape(Radius.pill)).background(fg))
                    Spacer(Modifier.width(Space.xs))
                    Text(
                        if (expired) "Start window elapsed"
                        else "Start within ${"%d:%02d".format(shown / 60, shown % 60)} for a +₹$ONTIME_BONUS bonus",
                        fontWeight = FontWeight.Bold, color = fg, fontSize = 14.sp,
                    )
                }
                Spacer(Modifier.height(Space.xs))
                Text(
                    if (expired) "A ₹$LATE_PENALTY late-start penalty may apply. Enter the OTP now to start the service."
                    else "Enter the customer OTP within ${vm.startWindowMinutes} min of accepting. Late start = −₹$LATE_PENALTY.",
                    fontSize = 12.sp, color = TextGray,
                )
            }
        }
    }
}

// The nine steps of the job flow, as the 6_jobFLow reference draws them across the top.
private val JOB_FLOW_STEPS = listOf(
    "New Job\nOffer", "Navigate", "Arrived", "OTP\nVerification", "Before\nPhoto",
    "Work in\nProgress", "After\nPhoto", "Customer\nRating", "Job\nCompleted",
)

@Composable
fun NewJobScreen(vm: AppViewModel, nav: NavHostController) {
    val job = vm.activeJob ?: return
    val ctx = LocalContext.current
    var secs by remember { mutableIntStateOf(ACCEPT_WINDOW_SEC) }

    LaunchedEffect(job.id) {
        secs = ACCEPT_WINDOW_SEC
        // Only count down (and auto-reject) while the offer is still pending. If the worker has
        // already accepted — or re-entered this screen via Back — never reject the live job.
        while (secs > 0 && vm.jobStatus == JobStatus.REQUESTED) {
            delay(1000)
            secs--
        }
        if (vm.jobStatus == JobStatus.REQUESTED) {
            vm.rejectJob()
            nav.popBackStack(Routes.HOME, inclusive = false)
        }
    }

    val service = job.services.firstOrNull() ?: "Service"
    val expectedAtSite = "%02d:%02d".format(job.durationMinutes / 60, job.durationMinutes % 60)

    Column(Modifier.fillMaxSize().background(Color.White)) {
        // Header — back + centred "JOB FLOW (STEP BY STEP)".
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.s).padding(top = 8.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(38.dp).clip(CircleShape).clickable { vm.rejectJob(); nav.popBackStack(Routes.HOME, inclusive = false) }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = PurpleDark, modifier = Modifier.size(22.dp))
            }
            Text(
                "JOB FLOW (STEP BY STEP)", color = PurpleDark, fontSize = 15.sp, fontWeight = FontWeight.Bold,
                letterSpacing = 0.5.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(38.dp))
        }
        JobFlowStepper(current = 1)
        HairlineDivider()

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.m).padding(top = Space.m, bottom = Space.m),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // ── Offer card — clean single-column layout (no map).
            Surface(
                shape = RoundedCornerShape(Radius.card), color = Color.White, shadowElevation = 3.dp,
                border = androidx.compose.foundation.BorderStroke(1.dp, Divider), modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(16.dp)) {
                    // Badge + distance pill.
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        NewJobBadge()
                        Spacer(Modifier.weight(1f))
                        Row(
                            Modifier.clip(RoundedCornerShape(Radius.pill)).background(Primary50).padding(horizontal = 10.dp, vertical = 5.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Filled.Navigation, contentDescription = null, tint = Purple, modifier = Modifier.size(13.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("${job.distanceKm} km away", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(service, color = TextDark, fontSize = 22.sp, fontWeight = FontWeight.Bold, lineHeight = 26.sp, letterSpacing = (-0.3).sp)
                    Spacer(Modifier.height(14.dp))
                    // Customer + call / chat.
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        CustomerPhoto(job.customerAvatar, job.initials, size = 46)
                        Spacer(Modifier.width(Space.m))
                        Column(Modifier.weight(1f)) {
                            Text(job.customerName, color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                            Text(job.customerType.orEmpty().ifBlank { "Residential" }, color = TextGray, fontSize = 13.sp)
                        }
                        OfferIconButton(Icons.Filled.Phone) { dialNumber(ctx, job.customerPhone) }
                        Spacer(Modifier.width(8.dp))
                        OfferIconButton(Icons.Filled.Chat) { nav.navigate(Routes.JOB_CHAT) }
                    }
                    Spacer(Modifier.height(14.dp))
                    val building = job.address.split(",").dropLast(2).joinToString(",").trim()
                    MapLine(Icons.Filled.LocationOn, job.area.ifBlank { job.address })
                    if (building.isNotBlank()) {
                        Spacer(Modifier.height(5.dp))
                        MapLine(Icons.Filled.Apartment, building)
                    }
                    Spacer(Modifier.height(14.dp))
                    HairlineDivider()
                    Spacer(Modifier.height(14.dp))
                    // Earnings + expected time.
                    Row(Modifier.fillMaxWidth()) {
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.Bottom) {
                                Text("₹", color = TextDark, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                                Text("${job.earnings}", color = TextDark, fontSize = 28.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp)
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("Estimated Earnings", color = TextGray, fontSize = 12.5.sp)
                                Spacer(Modifier.width(4.dp))
                                Icon(Icons.Filled.Info, contentDescription = null, tint = TextMuted, modifier = Modifier.size(13.dp))
                            }
                        }
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.Schedule, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
                                Spacer(Modifier.width(6.dp))
                                Text(expectedAtSite, color = TextDark, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                            }
                            Text("Expected time at site", color = TextGray, fontSize = 12.5.sp)
                        }
                    }
                    Spacer(Modifier.height(18.dp))
                    PrimaryButton("ACCEPT") {
                        vm.acceptJob()
                        nav.navigate(Routes.JOB_DETAILS) { popUpTo(Routes.NEW_JOB) { inclusive = true } }
                    }
                    Spacer(Modifier.height(10.dp))
                    OutlineButton("REJECT", modifier = Modifier.fillMaxWidth()) {
                        vm.rejectJob(); nav.popBackStack(Routes.HOME, inclusive = false)
                    }
                }
            }

            // ── Job details.
            Surface(
                shape = RoundedCornerShape(Radius.card), color = Color.White, shadowElevation = 2.dp,
                border = androidx.compose.foundation.BorderStroke(1.dp, Divider), modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Assignment, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(Space.s))
                        Text("Job Details", color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(10.dp))
                    JobDetailRow(Icons.Filled.CleaningServices, GreenSuccess, "Service Type", service)
                    HairlineDivider()
                    JobDetailRow(Icons.Filled.Schedule, Color(0xFF3B82F6), "Preferred Time", job.dateTime)
                    HairlineDivider()
                    JobDetailRow(Icons.Filled.LocalOffer, Amber, "Customer Notes", job.note.orEmpty().ifBlank { "Not specified" })
                    HairlineDivider()
                    JobDetailRow(Icons.Filled.Apartment, RedCancel, "Special Instructions", "Focus on the booked area")
                }
            }

            // ── Auto-reject countdown.
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(PurpleLight).padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Schedule, contentDescription = null, tint = Purple, modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(Space.m))
                Column(Modifier.weight(1f)) {
                    Text(
                        buildString { append("You have "); append("%02d:%02d".format(secs / 60, secs % 60)); append(" min to accept this job") },
                        color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold, lineHeight = 17.sp,
                    )
                    Text("After that, the job will be auto-rejected", color = TextGray, fontSize = 12.sp)
                }
                Spacer(Modifier.width(Space.s))
                Box(contentAlignment = Alignment.Center, modifier = Modifier.size(48.dp)) {
                    CircularProgressIndicator(
                        progress = { secs / ACCEPT_WINDOW_SEC.toFloat() },
                        modifier = Modifier.size(48.dp),
                        color = if (secs <= 20) RedCancel else Purple,
                        trackColor = Color.White,
                        strokeWidth = 4.dp, strokeCap = StrokeCap.Round,
                    )
                    Text("%02d:%02d".format(secs / 60, secs % 60), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Purple)
                }
            }
        }
    }
}

/** Animated purple "New Job" pill with a gently pulsing lightning bolt. */
@Composable
private fun NewJobBadge() {
    val pulse = rememberInfiniteTransition(label = "newjob")
    val scale by pulse.animateFloat(
        initialValue = 0.85f, targetValue = 1.15f,
        animationSpec = infiniteRepeatable(tween(750), RepeatMode.Reverse), label = "pulse",
    )
    Row(
        Modifier.clip(RoundedCornerShape(Radius.pill)).background(PurpleLight).padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Bolt, contentDescription = null, tint = Purple, modifier = Modifier.size(14.dp).scale(scale))
        Spacer(Modifier.width(4.dp))
        Text("New Job", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

/** Round customer photo with an initials fallback (offer payloads may have no avatar). */
@Composable
private fun CustomerPhoto(url: String?, initials: String, size: Int) {
    val fs = (size * 0.38f).sp
    Box(Modifier.size(size.dp).clip(CircleShape).background(Primary50).border(1.5.dp, Purple.copy(alpha = 0.35f), CircleShape), contentAlignment = Alignment.Center) {
        if (!url.isNullOrBlank()) {
            SubcomposeAsyncImage(
                model = url, contentDescription = "Customer", contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().clip(CircleShape),
                loading = { Text(initials, color = Purple, fontWeight = FontWeight.Bold, fontSize = fs) },
                error = { Text(initials, color = Purple, fontWeight = FontWeight.Bold, fontSize = fs) },
            )
        } else {
            Text(initials, color = Purple, fontWeight = FontWeight.Bold, fontSize = fs)
        }
    }
}

/** Lavender customer+service strip with the real photo — shown on the Work-in-Progress screen. */
@Composable
private fun InProgressCustomerStrip(job: Job) {
    val ctx = LocalContext.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Primary50).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CustomerPhoto(job.customerAvatar, job.initials, size = 44)
                Spacer(Modifier.width(Space.s))
                Column(Modifier.weight(1f)) {
                    Text(job.customerName, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                    Box(Modifier.clip(RoundedCornerShape(Radius.pill)).background(PurpleLight).padding(horizontal = 7.dp, vertical = 2.dp)) {
                        Text(job.customerType.orEmpty().ifBlank { "Residential" }, color = Purple, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Spacer(Modifier.height(7.dp))
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { dialNumber(ctx, job.customerPhone) }) {
                Icon(Icons.Filled.Phone, contentDescription = null, tint = Purple, modifier = Modifier.size(12.dp))
                Spacer(Modifier.width(4.dp))
                Text(job.customerPhone, color = TextDark, fontSize = 11.5.sp)
            }
            Spacer(Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.Top) {
                Icon(Icons.Filled.LocationOn, contentDescription = null, tint = Purple, modifier = Modifier.size(12.dp))
                Spacer(Modifier.width(4.dp))
                Text(job.area.ifBlank { job.address }, color = TextGray, fontSize = 11.sp, lineHeight = 14.sp)
            }
        }
        Spacer(Modifier.width(Space.m))
        Box(Modifier.width(1.dp).height(62.dp).background(Divider))
        Spacer(Modifier.width(Space.m))
        Column(Modifier.width(104.dp)) {
            Text("Service", color = TextGray, fontSize = 10.sp)
            Text(job.services.firstOrNull() ?: "Service", color = TextDark, fontSize = 12.sp, fontWeight = FontWeight.Bold, lineHeight = 15.sp)
            Spacer(Modifier.height(7.dp))
            Text("Job ID", color = TextGray, fontSize = 10.sp)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(job.id, color = TextDark, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(4.dp))
                Icon(
                    Icons.Filled.ContentCopy, contentDescription = "Copy", tint = Purple,
                    modifier = Modifier.size(13.dp).clickable {
                        val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                        cm.setPrimaryClip(android.content.ClipData.newPlainText("Job ID", job.id)); toast(ctx, "Job ID copied")
                    },
                )
            }
        }
    }
}

@Composable
private fun MapLine(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text(text, color = TextDark, fontSize = 13.sp, lineHeight = 16.sp)
    }
}

@Composable
private fun JobDetailRow(icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(Space.s))
        Text(label, color = TextGray, fontSize = 13.sp, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(Space.s))
        Text(value, color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.End, modifier = Modifier.weight(1.2f))
    }
}

/** The 9-step progress rail — numbered circles + labels + dashed connectors, current step highlighted. */
@Composable
private fun JobFlowStepper(current: Int) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Space.s, vertical = 10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        JOB_FLOW_STEPS.forEachIndexed { i, label ->
            val step = i + 1
            val done = step < current
            val active = step == current
            Column(Modifier.width(64.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.fillMaxWidth().height(30.dp)) {
                    if (i > 0) StepConnector(Modifier.align(Alignment.CenterStart).width(20.dp), coloured = step <= current)
                    if (i < JOB_FLOW_STEPS.lastIndex) StepConnector(Modifier.align(Alignment.CenterEnd).width(20.dp), coloured = step < current)
                    Box(
                        Modifier.align(Alignment.Center).size(28.dp).clip(CircleShape)
                            .background(if (done || active) Purple else Color.White)
                            .border(if (done || active) 0.dp else 1.5.dp, if (done || active) Color.Transparent else Divider, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (done) Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                        else Text("$step", color = if (active) Color.White else TextMuted, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Spacer(Modifier.height(5.dp))
                Text(
                    label, color = if (active) Purple else if (done) TextDark else TextMuted,
                    fontSize = 9.5.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                    textAlign = TextAlign.Center, lineHeight = 11.sp,
                )
                if (active) {
                    Spacer(Modifier.height(3.dp))
                    Box(Modifier.width(28.dp).height(2.dp).clip(RoundedCornerShape(Radius.pill)).background(Purple))
                }
            }
        }
    }
}

@Composable
private fun StepConnector(modifier: Modifier, coloured: Boolean) {
    val color = if (coloured) Purple else Divider
    Box(
        modifier.height(2.dp).drawBehind {
            if (coloured) {
                drawLine(color, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = size.height)
            } else {
                drawLine(
                    color, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = size.height,
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f), 0f),
                )
            }
        },
    )
}

/** Bordered round call/chat button used on the offer card. */
@Composable
private fun OfferIconButton(icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Box(
        Modifier.size(42.dp).clip(CircleShape).background(Primary50).border(1.dp, Purple.copy(alpha = 0.25f), CircleShape).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(18.dp)) }
}

/** Clean white top bar for the job-flow screens (back + title + optional trailing + hairline). */
@Composable
private fun JobWhiteBar(title: String, onBack: (() -> Unit)? = null, trailing: (@Composable () -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().background(Color.White)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.s).padding(top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                Box(Modifier.size(38.dp).clip(CircleShape).clickable { onBack() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = TextDark, modifier = Modifier.size(22.dp))
                }
                Spacer(Modifier.width(Space.xs))
            } else {
                Spacer(Modifier.width(Space.s))
            }
            Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextDark, letterSpacing = (-0.2).sp, modifier = Modifier.weight(1f))
            trailing?.invoke()
        }
        HairlineDivider()
    }
}

@Composable
private fun InfoRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String?) {
    Row(Modifier.fillMaxWidth().padding(vertical = Space.s), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(Radius.field)).background(PurpleLight),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = TextDark)
            if (subtitle != null) Text(subtitle, fontSize = 12.sp, color = TextGray)
        }
    }
}

@Composable
fun JobDetailsScreen(vm: AppViewModel, nav: NavHostController) {
    val job = vm.activeJob ?: return
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize().background(Color.White)) {
        JobWhiteBar("Job Details", onBack = { nav.popBackStack() }, trailing = {
            Icon(Icons.Filled.Phone, contentDescription = "Call", tint = Purple,
                modifier = Modifier.size(22.dp).clickable { dialNumber(ctx, job.customerPhone) })
        })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                StatusPill("Job Accepted", GreenLight, GreenSuccess)
            }
            StartDeadlineBanner(vm)
            Card {
                SectionTitle("Customer Details")
                Spacer(Modifier.height(Space.s))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(job.initials)
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text(job.customerName, fontWeight = FontWeight.SemiBold, color = TextDark)
                        Text(job.customerPhone, fontSize = 12.sp, color = TextGray)
                    }
                    RatingStars(job.customerRating)
                }
            }
            Card {
                SectionTitle("Job Details")
                Spacer(Modifier.height(Space.xs))
                LabeledRow("Services", job.services.joinToString(", "))
                Divider(color = Divider)
                LabeledRow("Date & Time", job.dateTime)
                Divider(color = Divider)
                LabeledRow("Duration", "${job.durationHours} Hours")
                Divider(color = Divider)
                LabeledRow("Address", job.area)
            }
            Card {
                SectionTitle("Payment Details")
                Spacer(Modifier.height(Space.xs))
                LabeledRow("Estimated Earnings", "₹${job.earnings}", valueColor = GreenSuccess)
                Text("Payable after job completion", fontSize = 12.sp, color = TextGray)
            }
            SafetyCard()
        }
        Surface(color = Color.White, shadowElevation = 12.dp) {
            Box(Modifier.padding(Space.l)) {
                PrimaryButton("Start On The Way") {
                    vm.startOnTheWay(); nav.navigate(Routes.ON_THE_WAY)
                }
            }
        }
    }
}

@Composable
fun OnTheWayScreen(vm: AppViewModel, nav: NavHostController) {
    val job = vm.activeJob ?: return
    val ctx = LocalContext.current
    var myLocation by remember { mutableStateOf("Locating…") }
    var myLat by remember { mutableStateOf<Double?>(null) }
    var myLng by remember { mutableStateOf<Double?>(null) }

    fun readLocation() {
        try {
            val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val loc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            if (loc != null) {
                myLat = loc.latitude
                myLng = loc.longitude
                myLocation = "%.5f, %.5f".format(loc.latitude, loc.longitude)
                vm.reportLocation(loc.latitude, loc.longitude)   // share live position with the customer
            } else {
                myLocation = "Acquiring GPS fix…"
            }
        } catch (e: SecurityException) {
            myLocation = "Location permission required"
        }
    }

    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) readLocation() else myLocation = "Location permission denied"
    }

    LaunchedEffect(Unit) {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            readLocation()
        } else {
            permLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }
    // Keep streaming the live position to the customer while we're on the way.
    LaunchedEffect(Unit) {
        while (true) {
            delay(6000)
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) readLocation()
        }
    }

    // Real distance + ETA from the worker's current GPS to the customer.
    val distKm = if (myLat != null && myLng != null) haversineKm(myLat!!, myLng!!, job.lat, job.lng) else null
    val etaMin = distKm?.let { kotlin.math.max(1, kotlin.math.round(it * 2.5).toInt()) }
    val arrivalClock = etaMin?.let {
        java.text.SimpleDateFormat("hh:mm a", java.util.Locale.US).format(java.util.Date(System.currentTimeMillis() + it * 60000L))
    } ?: "—"

    Column(Modifier.fillMaxSize().background(Color.White)) {
        FlowNavBar(onBack = { nav.popBackStack() })
        JobFlowStepper(current = 2)
        HairlineDivider()
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            StatusBanner(GreenLight, GreenSuccess, "On The Way", "You are on your way to customer location")
            Card {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Route", fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.weight(1f))
                    StatusPill("En route", GreenLight, GreenSuccess)
                }
                Spacer(Modifier.height(Space.m))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(40.dp).clip(RoundedCornerShape(Radius.field)).background(PurpleLight),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.LocationOn, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp)) }
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text(job.address, fontSize = 13.sp, color = TextDark)
                        Text("Destination: ${job.lat}, ${job.lng}", fontSize = 11.sp, color = TextGray)
                    }
                }
                Spacer(Modifier.height(Space.s))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Navigation, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(Space.s))
                    Text("Your GPS: $myLocation", fontSize = 12.sp, color = TextDark, modifier = Modifier.weight(1f))
                }
                Spacer(Modifier.height(Space.s))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        if (distKm != null) "%.1f km away · ~%d min".format(distKm, etaMin) else "${job.distanceKm} km away",
                        fontSize = 13.sp, color = TextGray, modifier = Modifier.weight(1f),
                    )
                    OutlineButton("Navigate", modifier = Modifier.width(130.dp)) {
                        launchNavigation(ctx, job.lat, job.lng, job.customerName, myLat, myLng)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                MiniStatCard(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Filled.Navigation,
                    value = if (distKm != null) "%.1f km".format(distKm) else "${job.distanceKm} km",
                    label = "Distance", tint = Purple, tintBg = PurpleLight,
                )
                MiniStatCard(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Filled.Schedule,
                    value = etaMin?.let { "$it min" } ?: "—",
                    label = "ETA", tint = GreenSuccess, tintBg = GreenLight,
                )
            }
            OsmMap(
                destLat = job.lat,
                destLng = job.lng,
                destLabel = job.customerName,
                myLat = myLat,
                myLng = myLng,
                modifier = Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(Radius.card)),
            )
            Card {
                Text("Customer", fontSize = 12.sp, color = TextMuted)
                Spacer(Modifier.height(Space.s))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(job.initials)
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text(job.customerName, fontWeight = FontWeight.SemiBold, color = TextDark)
                        Text(
                            job.customerPhone.ifBlank { "No number" }, fontSize = 13.sp, color = Purple,
                            modifier = Modifier.clickable { dialNumber(ctx, job.customerPhone) },
                        )
                    }
                    Icon(Icons.Filled.Phone, contentDescription = "Call", tint = Purple,
                        modifier = Modifier.size(22.dp).clickable { dialNumber(ctx, job.customerPhone) })
                    Spacer(Modifier.width(Space.l))
                    Icon(Icons.Filled.Chat, contentDescription = "Chat", tint = Purple,
                        modifier = Modifier.size(22.dp).clickable { toast(ctx, "Opening chat…") })
                }
                Spacer(Modifier.height(Space.m))
                HairlineDivider()
                Spacer(Modifier.height(Space.m))
                Text("Service Address", fontSize = 12.sp, color = TextMuted)
                Text(job.address, fontSize = 13.sp, color = TextDark)
                Spacer(Modifier.height(Space.s))
                Text("Estimated Arrival", fontSize = 12.sp, color = TextMuted)
                Text(arrivalClock, fontWeight = FontWeight.SemiBold, color = TextDark)
            }
            PrimaryButton("Navigate with Google Maps") {
                launchNavigation(ctx, job.lat, job.lng, job.customerName, myLat, myLng)
            }
        }
        Surface(color = Color.White, shadowElevation = 12.dp) {
            Box(Modifier.padding(Space.l)) {
                PrimaryButton("Reached Location") {
                    vm.markArrived(); nav.navigate(Routes.ARRIVED)
                }
            }
        }
    }
}

/** White "JOB FLOW (STEP BY STEP)" navbar (back + centred indigo title + info) used across the flow. */
@Composable
private fun FlowNavBar(onBack: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Color.White)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.s).padding(top = 8.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(38.dp).clip(CircleShape).clickable { onBack() }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = PurpleDark, modifier = Modifier.size(22.dp))
            }
            Text(
                "JOB FLOW (STEP BY STEP)", color = PurpleDark, fontSize = 15.sp, fontWeight = FontWeight.Bold,
                letterSpacing = 0.5.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f),
            )
            Box(Modifier.size(38.dp).clip(CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Info, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
            }
        }
        HairlineDivider()
    }
}

/* ── ARRIVED (step 3) ──────────────────────────────────────────────────────────────────── */

@Composable
fun ArrivedScreen(vm: AppViewModel, nav: NavHostController) {
    val job = vm.activeJob ?: return
    val ctx = LocalContext.current
    val building = job.address.split(",").dropLast(2).joinToString(",").trim().ifBlank { job.area }
    val arrivalClock = remember { java.text.SimpleDateFormat("hh:mm a", java.util.Locale.US).format(java.util.Date()) }

    Column(Modifier.fillMaxSize().background(Color.White)) {
        FlowNavBar(onBack = { nav.popBackStack() })
        JobFlowStepper(current = 3)
        HairlineDivider()
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.m).padding(top = Space.m, bottom = Space.m),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // ── "You've Arrived!" hero.
            FlowCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(46.dp).clip(CircleShape).background(GreenSuccess), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(26.dp))
                    }
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text("You've Arrived!", color = TextDark, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                        Text("You have reached the customer location.", color = TextGray, fontSize = 13.sp, lineHeight = 17.sp)
                    }
                    Spacer(Modifier.width(Space.s))
                    Box(Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(Primary50), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.LocationOn, contentDescription = null, tint = Purple, modifier = Modifier.size(26.dp))
                    }
                }
            }

            // ── Customer.
            FlowCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CustomerPhoto(job.customerAvatar, job.initials, size = 48)
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(job.customerName, color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                            Spacer(Modifier.width(Space.s))
                            Box(Modifier.clip(RoundedCornerShape(Radius.pill)).background(PurpleLight).padding(horizontal = 8.dp, vertical = 3.dp)) {
                                Text(job.customerType.orEmpty().ifBlank { "Residential" }, color = Purple, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        Spacer(Modifier.height(5.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { dialNumber(ctx, job.customerPhone) }) {
                            Icon(Icons.Filled.Phone, contentDescription = null, tint = Purple, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(job.customerPhone.ifBlank { "—" }, color = TextDark, fontSize = 13.5.sp)
                        }
                    }
                }
                Spacer(Modifier.height(Space.m))
                Row(verticalAlignment = Alignment.Top) {
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(
                        listOf(building, job.area).filter { it.isNotBlank() }.joinToString(",\n"),
                        color = TextDark, fontSize = 13.5.sp, lineHeight = 18.sp, modifier = Modifier.weight(1f),
                    )
                }
                Spacer(Modifier.height(Space.m))
                // Full-width Call Customer button — always fits, clearly labelled.
                Box(
                    Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(Radius.button)).background(Color.White)
                        .border(1.5.dp, Purple, RoundedCornerShape(Radius.button)).clickable { dialNumber(ctx, job.customerPhone) },
                    contentAlignment = Alignment.Center,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Phone, contentDescription = null, tint = Purple, modifier = Modifier.size(17.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Call Customer", color = Purple, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            // ── Arrival stats.
            FlowCard {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    ArrivalStat(Modifier.weight(1f), Icons.Filled.Navigation, "Distance", "At site", "from destination")
                    ArrivalStat(Modifier.weight(1f), Icons.Filled.Schedule, "Arrival Time", arrivalClock, "Today")
                    ArrivalStat(Modifier.weight(1.2f), Icons.Filled.LocationOn, "Address", building.ifBlank { job.area }, "")
                    ArrivalStat(Modifier.weight(1f), Icons.Filled.Shield, "Status", "In Range", "(50 m)", valueColor = GreenSuccess)
                }
            }

            // ── What's next + OTP waiting.
            FlowCard {
                Text("What's Next?", color = Purple, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                Text("Please confirm your arrival and proceed to OTP verification to start the job.", color = TextDark, fontSize = 13.sp, lineHeight = 18.sp)
                Spacer(Modifier.height(Space.m))
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(PurpleLight).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Schedule, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(Space.m))
                    Column {
                        Text("Waiting for OTP Verification", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text("Customer will provide OTP to verify your arrival.", color = TextGray, fontSize = 12.sp, lineHeight = 15.sp)
                    }
                }
            }

            // ── Quick actions.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                ArrivedAction(Modifier.weight(1f), Icons.Filled.Chat, "Chat with Customer") { nav.navigate(Routes.JOB_CHAT) }
                ArrivedAction(Modifier.weight(1f), Icons.Filled.Phone, "Customer Not Reachable") { dialNumber(ctx, job.customerPhone) }
                ArrivedAction(Modifier.weight(1f), Icons.Filled.Schedule, "I'm Waiting") { toast(ctx, "Marked as waiting") }
            }

            Spacer(Modifier.height(2.dp))
            // ── Continue (matches the reference: primary CTA above the safety note).
            PrimaryButton("CONTINUE TO OTP VERIFICATION") { nav.navigate(Routes.START_SERVICE) }

            // ── Safety.
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(GoldLight).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Shield, contentDescription = null, tint = Amber, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(Space.m))
                Column {
                    Text("Safety First", color = Amber, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text("Stay safe and professional. Contact support if you face any issues.", color = TextGray, fontSize = 12.sp, lineHeight = 15.sp)
                }
            }
            Spacer(Modifier.height(Space.s))
        }
    }
}

/** Bordered white card used across the Arrived screen. */
@Composable
private fun FlowCard(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Surface(
        shape = RoundedCornerShape(Radius.card), color = Color.White, shadowElevation = 2.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, Divider), modifier = Modifier.fillMaxWidth(),
    ) { Column(Modifier.padding(14.dp), content = content) }
}

@Composable
private fun ArrivalStat(modifier: Modifier, icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String, caption: String, valueColor: Color = TextDark) {
    Column(modifier) {
        Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
        Spacer(Modifier.height(4.dp))
        Text(label, color = TextGray, fontSize = 9.5.sp, lineHeight = 11.sp, maxLines = 1)
        Spacer(Modifier.height(3.dp))
        Text(value, color = valueColor, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, lineHeight = 15.sp, maxLines = 2)
        if (caption.isNotBlank()) Text(caption, color = TextMuted, fontSize = 9.sp, lineHeight = 11.sp, maxLines = 1)
    }
}

@Composable
private fun ArrivedAction(modifier: Modifier, icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).background(Color.White).border(1.dp, Divider, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick).padding(vertical = 12.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
        Spacer(Modifier.height(6.dp))
        Text(label, color = TextDark, fontSize = 11.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center, lineHeight = 13.sp)
    }
}

/**
 * Opens Google Maps driving navigation to the customer.
 *
 * Tries, in order: (1) Google Maps turn-by-turn (`google.navigation:`), (2) Google Maps
 * directions from the worker's current GPS to the destination, (3) any installed maps app via
 * `geo:`, (4) the directions URL in a browser. Each step degrades gracefully if the prior is absent.
 */
// Open the phone dialer pre-filled with the customer's number (no CALL permission needed).
private fun dialNumber(ctx: Context, phone: String?) {
    val p = phone?.trim().orEmpty()
    if (p.isEmpty()) { toast(ctx, "No phone number on file"); return }
    try { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$p"))) }
    catch (_: Exception) { toast(ctx, "Could not open dialer") }
}

private fun launchNavigation(
    ctx: Context,
    destLat: Double,
    destLng: Double,
    label: String,
    originLat: Double? = null,
    originLng: Double? = null,
) {
    // 1) Turn-by-turn navigation in the Google Maps app, driving mode.
    val navIntent = Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$destLat,$destLng&mode=d"))
        .setPackage("com.google.android.apps.maps")
    try { ctx.startActivity(navIntent); return } catch (_: Exception) { }

    // Google Maps directions URL (origin -> destination, driving).
    val dirUrl = buildString {
        append("https://www.google.com/maps/dir/?api=1")
        if (originLat != null && originLng != null) append("&origin=$originLat,$originLng")
        append("&destination=$destLat,$destLng&travelmode=driving")
    }

    // 2) Directions in the Google Maps app.
    try {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(dirUrl)).setPackage("com.google.android.apps.maps"))
        return
    } catch (_: Exception) { }

    // 3) Any maps app that handles geo:.
    try {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:$destLat,$destLng?q=$destLat,$destLng($label)")))
        return
    } catch (_: Exception) { }

    // 4) Fall back to a browser.
    try {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(dirUrl)))
    } catch (_: Exception) {
        toast(ctx, "No maps or browser app available to navigate")
    }
}

@Composable
fun StartServiceScreen(vm: AppViewModel, nav: NavHostController) {
    val job = vm.activeJob ?: return
    val ctx = LocalContext.current
    var otp by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }
    var showCancel by remember { mutableStateOf(false) }
    var resendSec by remember { mutableIntStateOf(28) }
    LaunchedEffect(job.id) { resendSec = 28; while (resendSec > 0) { delay(1000); resendSec-- } }

    // Before-photo capture (module: Start Job → Before Photos).
    var beforeShot by remember { mutableStateOf(vm.beforePhoto != null) }
    val beforeCam = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp ->
        if (bmp != null) { vm.setBeforePhoto(bitmapToDataUrl(bmp)); beforeShot = true; toast(ctx, "Before photo captured") }
    }
    val beforePerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) beforeCam.launch(null) else toast(ctx, "Camera permission is needed for the before photo")
    }
    fun captureBefore() {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) beforeCam.launch(null)
        else beforePerm.launch(Manifest.permission.CAMERA)
    }

    if (showCancel) {
        CancelDialog(onDismiss = { showCancel = false }) { reason ->
            showCancel = false
            vm.cancelJobWithReason(reason)
            toast(ctx, "Job cancelled: $reason")
            nav.popBackStack(Routes.HOME, inclusive = false)
        }
    }

    fun verify() { if (vm.verifyOtpAndStart(otp)) nav.navigate(Routes.BEFORE_PHOTOS) else error = true }

    Column(Modifier.fillMaxSize().background(Color.White)) {
        FlowNavBar(onBack = { nav.popBackStack() })
        JobFlowStepper(current = 4)
        HairlineDivider()
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.m).padding(top = Space.m),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // ── Hero.
            FlowCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(46.dp).clip(RoundedCornerShape(13.dp)).background(Purple), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Lock, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
                    }
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text("OTP Verification", color = TextDark, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                        Text("Enter the OTP sent by the customer to start the service.", color = TextGray, fontSize = 13.sp, lineHeight = 17.sp)
                    }
                }
            }

            // ── Customer + service.
            Surface(shape = RoundedCornerShape(Radius.card), color = Primary50, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CustomerPhoto(job.customerAvatar, job.initials, size = 40)
                            Spacer(Modifier.width(Space.s))
                            Column(Modifier.weight(1f)) {
                                Text(job.customerName, color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                Text(job.customerType.orEmpty().ifBlank { "Residential" }, color = Purple, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { dialNumber(ctx, job.customerPhone) }) {
                            Icon(Icons.Filled.Phone, contentDescription = null, tint = Purple, modifier = Modifier.size(13.dp))
                            Spacer(Modifier.width(5.dp))
                            Text(job.customerPhone.ifBlank { "—" }, color = TextDark, fontSize = 12.5.sp)
                        }
                        Spacer(Modifier.height(3.dp))
                        Row(verticalAlignment = Alignment.Top) {
                            Icon(Icons.Filled.LocationOn, contentDescription = null, tint = Purple, modifier = Modifier.size(13.dp))
                            Spacer(Modifier.width(5.dp))
                            Text(job.area.ifBlank { job.address }, color = TextGray, fontSize = 12.sp, lineHeight = 15.sp)
                        }
                    }
                    Spacer(Modifier.width(Space.m))
                    Box(Modifier.width(1.dp).height(66.dp).background(Divider))
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.width(104.dp)) {
                        Text("Service", color = TextGray, fontSize = 10.sp)
                        Text(job.services.firstOrNull() ?: "Service", color = TextDark, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, lineHeight = 15.sp)
                        Spacer(Modifier.height(8.dp))
                        Text("Job ID", color = TextGray, fontSize = 10.sp)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(job.id, color = TextDark, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.width(4.dp))
                            Icon(
                                Icons.Filled.ContentCopy, contentDescription = "Copy", tint = Purple,
                                modifier = Modifier.size(13.dp).clickable {
                                    val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                                    cm.setPrimaryClip(android.content.ClipData.newPlainText("Job ID", job.id)); toast(ctx, "Job ID copied")
                                },
                            )
                        }
                    }
                }
            }

            // ── OTP entry.
            Spacer(Modifier.height(2.dp))
            Text("Enter 4-digit OTP", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                BasicTextField(
                    value = otp,
                    onValueChange = { if (it.length <= 4 && it.all(Char::isDigit)) { otp = it; error = false } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    decorationBox = {
                        Row(horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                            repeat(4) { i ->
                                val ch = otp.getOrNull(i)?.toString() ?: ""
                                val active = i == otp.length
                                Box(
                                    Modifier.size(62.dp).clip(RoundedCornerShape(14.dp)).background(Color.White)
                                        .border(if (active || ch.isNotEmpty()) 2.dp else 1.5.dp, if (error) RedCancel else Purple.copy(alpha = if (active || ch.isNotEmpty()) 1f else 0.4f), RoundedCornerShape(14.dp)),
                                    contentAlignment = Alignment.Center,
                                ) { Text(ch, fontSize = 26.sp, fontWeight = FontWeight.Bold, color = TextDark) }
                            }
                        }
                    },
                )
            }
            if (error) Text("Incorrect OTP. Try again.", color = RedCancel, fontSize = 12.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            Text("OTP sent to customer's registered mobile number", color = TextGray, fontSize = 12.5.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                if (resendSec > 0) {
                    Text("Resend OTP in ", color = TextGray, fontSize = 13.sp)
                    Text("%02d:%02d".format(resendSec / 60, resendSec % 60), color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                } else {
                    Text("Resend OTP", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.clickable { resendSec = 28; toast(ctx, "OTP resent") })
                }
            }
            Text("Demo OTP: ${job.otp}", color = TextMuted, fontSize = 11.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)

            // ── Didn't receive OTP?
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Primary50).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Shield, contentDescription = null, tint = Purple, modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(Space.m))
                Column(Modifier.weight(1f)) {
                    Text("Didn't receive OTP?", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text("Ask the customer to resend OTP or you can call them directly.", color = TextGray, fontSize = 12.sp, lineHeight = 15.sp)
                }
                Spacer(Modifier.width(Space.s))
                Box(
                    Modifier.clip(RoundedCornerShape(Radius.button)).background(Color.White).border(1.5.dp, Purple, RoundedCornerShape(Radius.button))
                        .clickable { dialNumber(ctx, job.customerPhone) }.padding(horizontal = 12.dp, vertical = 9.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Phone, contentDescription = null, tint = Purple, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(5.dp))
                        Text("CALL", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            // ── Important.
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(GoldLight).padding(14.dp), verticalAlignment = Alignment.Top) {
                Text("💡", fontSize = 18.sp)
                Spacer(Modifier.width(Space.m))
                Column {
                    Text("Important", color = Amber, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text("You must verify using OTP to start the job. Do not start the service without verification.", color = TextGray, fontSize = 12.sp, lineHeight = 16.sp)
                }
            }
            Spacer(Modifier.height(2.dp))
        }
        // ── Bottom actions.
        Surface(color = Color.White, shadowElevation = 12.dp) {
            Column(Modifier.padding(horizontal = Space.l, vertical = Space.m)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                    OutlineButton("CANCEL JOB", modifier = Modifier.weight(1f)) { showCancel = true }
                    Box(
                        Modifier.weight(1f).height(54.dp).clip(RoundedCornerShape(Radius.button))
                            .background(if (otp.length == 4) Purple else Purple.copy(alpha = 0.4f))
                            .clickable(enabled = otp.length == 4) { verify() },
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("VERIFY & CONTINUE", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.width(6.dp))
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Lock, contentDescription = null, tint = TextMuted, modifier = Modifier.size(12.dp))
                    Spacer(Modifier.width(5.dp))
                    Text("Your data is secure and encrypted", color = TextMuted, fontSize = 11.sp)
                }
            }
        }
    }
}

// Best-effort last-known GPS (fine or network) — null if no permission / no fix. Used by SOS so
// the emergency alert carries the worker's position without prompting or blocking in a crisis.
private fun lastKnownLatLng(ctx: Context): Pair<Double, Double>? {
    return try {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val loc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
        loc?.let { it.latitude to it.longitude }
    } catch (_: SecurityException) { null }
}

// Great-circle distance in km between two lat/lng points (for live distance + ETA).
private fun haversineKm(aLat: Double, aLng: Double, bLat: Double, bLng: Double): Double {
    val r = 6371.0
    val sLat = Math.sin(Math.toRadians(bLat - aLat) / 2)
    val sLng = Math.sin(Math.toRadians(bLng - aLng) / 2)
    val s = sLat * sLat + Math.cos(Math.toRadians(aLat)) * Math.cos(Math.toRadians(bLat)) * sLng * sLng
    return 2 * r * Math.asin(Math.sqrt(s))
}

// Parse an ISO-8601 UTC instant (e.g. "2026-06-30T06:18:05.510Z") to epoch millis.
// minSdk 24 → use SimpleDateFormat (java.time.Instant needs API 26 / desugaring).
/** Public twin of [parseIsoMillis] so the Jobs list can anchor its elapsed timer identically. */
fun parseIsoMillisPublic(iso: String?): Long? = parseIsoMillis(iso)

private fun parseIsoMillis(s: String?): Long? {
    if (s.isNullOrBlank()) return null
    for (pattern in arrayOf("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'")) {
        try {
            val fmt = java.text.SimpleDateFormat(pattern, java.util.Locale.US)
            fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
            return fmt.parse(s)?.time
        } catch (_: Exception) { /* try next pattern */ }
    }
    return null
}

// Per-service task checklist shown during the job (module: Service Checklist).
private fun checklistFor(service: String): List<String> {
    val s = service.lowercase()
    return when {
        "bathroom" in s -> listOf("Mirror", "Sink", "Floor", "Toilet", "Bucket", "Drain", "Door")
        "kitchen" in s -> listOf("Countertop", "Sink", "Stove", "Cabinets", "Floor", "Dustbin")
        "dish" in s -> listOf("Wash utensils", "Rinse & stack", "Clean sink", "Wipe counter")
        "sweep" in s || "mop" in s -> listOf("Sweep floors", "Mop floors", "Corners & edges", "Under furniture")
        "laundry" in s -> listOf("Sort clothes", "Wash", "Dry", "Fold & stack")
        "window" in s -> listOf("Glass panes", "Frames", "Sills", "Grills")
        "fan" in s -> listOf("Blades", "Motor housing", "Wipe down", "Test run")
        "fridge" in s || "refriger" in s -> listOf("Empty shelves", "Clean interior", "Wipe seals", "Restock")
        else -> listOf("Prepare area", "Perform service", "Clean up", "Final check")
    }
}

@Composable
fun InProgressScreen(vm: AppViewModel, nav: NavHostController) {
    val job = vm.activeJob ?: return
    val ctx = LocalContext.current
    // Anchor the timer to the SERVER start time so it matches the customer app exactly.
    // Fall back to the local start stamp, then to "now", if the server time is missing.
    val startMs = remember(job.startedAt, vm.serviceStartMs) {
        parseIsoMillis(job.startedAt) ?: vm.serviceStartMs.takeIf { it > 0L } ?: System.currentTimeMillis()
    }
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    // Paused time is excluded from elapsed, so a pause genuinely stops the clock rather than
    // letting the booked duration burn down while the worker waits.
    val rawElapsed = ((nowMs - startMs - vm.pausedMsAt(nowMs)) / 1000L).toInt().coerceAtLeast(0)
    // Booked time is up once elapsed reaches the duration. Freeze the on-screen timer at the
    // booked length and raise a one-time "service time completed" popup (worker still ends
    // the service manually with the proof photo).
    // Booked time plus whatever extra the customer has approved — the extension grows the clock,
    // it never rewrites the booked figure.
    val targetSec = (job.durationMinutes + vm.extensionMinutes).coerceAtLeast(1) * 60
    val timeUp = rawElapsed >= targetSec
    val elapsed = if (timeUp) targetSec else rawElapsed
    var timeUpDismissed by remember { mutableStateOf(false) }
    var extSheet by remember { mutableStateOf(false) }
    // A fresh grant of time re-arms the popup, so the worker is asked again when THAT time runs out.
    LaunchedEffect(vm.extensionMinutes) { if (vm.extensionMinutes > 0) timeUpDismissed = false }

    // Ending the service hands off to step 7 (After Photos) → step 8 (Customer Sign) → complete.
    // The proof photo the customer sees is the first after-photo, attached server-side.

    LaunchedEffect(Unit) {
        vm.loadJobState()   // checklist / extras / pause state for this job
        vm.refreshExtensions()
        while (true) { nowMs = System.currentTimeMillis(); delay(1000) }
    }
    // While the customer is deciding, poll for their answer. Only while pending — an idle job
    // shouldn't be talking to the server every few seconds.
    LaunchedEffect(vm.pendingExtension?.id) {
        while (vm.pendingExtension != null) { delay(5000); vm.refreshExtensions() }
    }
    var pauseDialog by remember { mutableStateOf(false) }
    if (pauseDialog) {
        PauseReasonDialog(onDismiss = { pauseDialog = false }) { reason ->
            vm.pauseJob(reason); pauseDialog = false
        }
    }

    var progressNotes by remember { mutableStateOf("") }
    var beforeShot by remember { mutableStateOf(vm.beforePhoto != null) }
    val progCam = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp ->
        if (bmp != null) { vm.setBeforePhoto(bitmapToDataUrl(bmp)); beforeShot = true; toast(ctx, "Progress photo added") }
    }
    val progPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) progCam.launch(null) else toast(ctx, "Camera permission is needed for the photo")
    }
    fun captureBefore() {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) progCam.launch(null)
        else progPerm.launch(Manifest.permission.CAMERA)
    }

    val elapsedHms = "%02d:%02d:%02d".format(elapsed / 3600, (elapsed % 3600) / 60, elapsed % 60)
    val elapsedFrac = if (targetSec > 0) (elapsed.toFloat() / targetSec).coerceIn(0f, 1f) else 0f

    Column(Modifier.fillMaxSize().background(Color.White)) {
        FlowNavBar(onBack = { nav.popBackStack() })
        JobFlowStepper(current = 6)
        HairlineDivider()
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.m).padding(top = Space.m, bottom = Space.m),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // ── Hero: status + elapsed timer ring.
            FlowCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(46.dp).clip(CircleShape).background(Purple), contentAlignment = Alignment.Center) {
                                Icon(Icons.Filled.Build, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
                            }
                            Spacer(Modifier.width(Space.s))
                            Column {
                                Text("Work In Progress", color = TextDark, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                                Text(if (vm.jobPaused) "Paused — resume when you're back." else "Service started. Keep updating your progress.", color = TextGray, fontSize = 12.sp, lineHeight = 15.sp)
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(
                            Modifier.clip(RoundedCornerShape(Radius.pill)).background(if (vm.jobPaused) GoldLight else GreenLight).padding(horizontal = 10.dp, vertical = 5.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(Modifier.size(7.dp).clip(CircleShape).background(if (vm.jobPaused) Amber else GreenSuccess))
                            Spacer(Modifier.width(6.dp))
                            Text(if (vm.jobPaused) "Paused" else "Service in progress", color = if (vm.jobPaused) Amber else GreenSuccess, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Spacer(Modifier.width(Space.s))
                    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(112.dp)) {
                        CircularProgressIndicator(
                            progress = { elapsedFrac },
                            modifier = Modifier.size(112.dp),
                            color = if (timeUp) GreenSuccess else Purple, trackColor = PurpleLight,
                            strokeWidth = 6.dp, strokeCap = StrokeCap.Round,
                        )
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.Schedule, contentDescription = null, tint = Purple, modifier = Modifier.size(13.dp))
                                Spacer(Modifier.width(3.dp))
                                Text("Timer", color = Purple, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                            Spacer(Modifier.height(2.dp))
                            Text(elapsedHms, color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp)
                            Text("Time Elapsed", color = TextGray, fontSize = 9.sp)
                        }
                    }
                }
            }

            // ── Extra time granted on this job: booked vs total, so the base figure keeps its meaning.
            if (vm.extensionMinutes > 0) {
                FlowCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("⏱", fontSize = 17.sp)
                        Spacer(Modifier.width(Space.s))
                        Column(Modifier.weight(1f)) {
                            Text("Service Extended", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                            Text(
                                "Original ${job.durationMinutes} min + ${vm.extensionMinutes} min extra = ${job.durationMinutes + vm.extensionMinutes} min",
                                color = TextGray, fontSize = 12.sp,
                            )
                        }
                        if (vm.extensionEarnings > 0) {
                            Text("+₹${vm.extensionEarnings}", color = GreenSuccess, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // ── Customer (with photo).
            InProgressCustomerStrip(job)

            // ── Checklist.
            FlowCard {
                val done = vm.checklistDone
                val total = vm.checklist.size
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Checklist ", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Text("($done/$total Completed)", color = if (total > 0 && done == total) GreenSuccess else Purple, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.weight(1f))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("View Details", color = Purple, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                        Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
                    }
                }
                Spacer(Modifier.height(Space.s))
                if (vm.checklist.isEmpty()) Text("Loading tasks…", fontSize = 13.sp, color = TextMuted, modifier = Modifier.padding(vertical = Space.s))
                val firstUndone = vm.checklist.indexOfFirst { !it.done }
                vm.checklist.forEachIndexed { i, t ->
                    val active = i == firstUndone
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                            .background(if (active) Primary50 else Color.Transparent)
                            .clickable { vm.toggleTask(t.id) }.padding(horizontal = if (active) 8.dp else 0.dp, vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        when {
                            t.done -> Box(Modifier.size(22.dp).clip(CircleShape).background(Purple), contentAlignment = Alignment.Center) {
                                Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                            }
                            active -> CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Purple, strokeWidth = 2.dp)
                            else -> Box(Modifier.size(22.dp).clip(CircleShape).border(1.5.dp, Divider, CircleShape))
                        }
                        Spacer(Modifier.width(Space.m))
                        Text(t.label, fontSize = 14.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal, color = if (t.done) TextGray else TextDark, modifier = Modifier.weight(1f))
                        if (active) { Text("In Progress", color = Purple, fontSize = 11.5.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.width(Space.s)) }
                        Icon(Icons.Filled.CameraAlt, contentDescription = "Photo", tint = Purple, modifier = Modifier.size(18.dp).clickable { captureBefore() })
                    }
                    if (i < vm.checklist.lastIndex) HairlineDivider()
                }
            }

            // ── Add progress photo (dashed).
            Text("Add Progress Photo (Optional)", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .border(1.5.dp, Purple.copy(alpha = 0.4f), RoundedCornerShape(12.dp)).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(40.dp).clip(CircleShape).background(Primary50), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.CameraAlt, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
                }
                Spacer(Modifier.width(Space.m))
                Column(Modifier.weight(1f)) {
                    Text(if (beforeShot) "Photo added ✓" else "Add Photo", color = Purple, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Text("Capture progress photo (optional)", color = TextGray, fontSize = 11.5.sp)
                }
                Box(
                    Modifier.clip(RoundedCornerShape(Radius.button)).background(Color.White).border(1.5.dp, Purple, RoundedCornerShape(Radius.button))
                        .clickable { captureBefore() }.padding(horizontal = 12.dp, vertical = 9.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CameraAlt, contentDescription = null, tint = Purple, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(5.dp))
                        Text("Take Photo", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            // ── Notes.
            Text("Add Notes (Optional)", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            OutlinedTextField(
                value = progressNotes, onValueChange = { if (it.length <= 200) progressNotes = it },
                modifier = Modifier.fillMaxWidth().height(72.dp),
                placeholder = { Text("Any notes about the work progress…", fontSize = 12.sp, color = TextMuted) },
                textStyle = androidx.compose.ui.text.TextStyle(fontSize = 13.sp, color = TextDark),
                shape = RoundedCornerShape(10.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.White, unfocusedContainerColor = Color.White,
                    focusedBorderColor = Purple, unfocusedBorderColor = Divider, cursorColor = Purple,
                ),
            )
            Text("${progressNotes.length}/200", color = TextMuted, fontSize = 10.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.End)

            // ── Note.
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Primary50).padding(12.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Filled.Info, contentDescription = null, tint = Purple, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(Space.m))
                Column {
                    Text("Note", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text("Regular updates help us ensure quality and customer satisfaction.", color = TextGray, fontSize = 11.5.sp, lineHeight = 15.sp)
                }
            }
            Spacer(Modifier.height(2.dp))
        }
        // ── Bottom: Pause / Continue.
        Surface(color = Color.White, shadowElevation = 12.dp) {
            Row(Modifier.padding(Space.l), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                if (vm.jobPaused) {
                    Box(Modifier.weight(1f))
                    Box(
                        Modifier.weight(1.4f).height(54.dp).clip(RoundedCornerShape(Radius.button)).background(Purple).clickable { vm.resumeJob() },
                        contentAlignment = Alignment.Center,
                    ) { Text("▶  RESUME WORK", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold) }
                } else {
                    Box(
                        Modifier.weight(1f).height(54.dp).clip(RoundedCornerShape(Radius.button)).background(Color.White)
                            .border(1.5.dp, Purple, RoundedCornerShape(Radius.button)).clickable { pauseDialog = true },
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Pause, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(5.dp))
                            Text("PAUSE WORK", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Box(
                        Modifier.weight(1.2f).height(54.dp).clip(RoundedCornerShape(Radius.button)).background(Purple).clickable {
                            vm.saveJobNotes("before", progressNotes); nav.navigate(Routes.AFTER_PHOTOS)
                        },
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("CONTINUE WORK", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.width(6.dp))
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }
        }
    }

    // Booked time is up: ask whether the job is done, or whether more time is needed. The worker
    // cannot simply carry on billing — extra time has to be asked for and granted by the customer.
    if (timeUp && !timeUpDismissed && vm.pendingExtension == null) {
        val booked = job.durationMinutes + vm.extensionMinutes
        AlertDialog(
            onDismissRequest = { timeUpDismissed = true },
            confirmButton = {
                TextButton(onClick = { timeUpDismissed = true; nav.navigate(Routes.AFTER_PHOTOS) }) {
                    Text("Yes, complete", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { timeUpDismissed = true; extSheet = true; vm.loadExtensionOptions() }) {
                    Text("Need more time")
                }
            },
            title = { Text("⏱  Service Time Completed", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "The $booked min booked for this service is over.\n\nIs the service complete? If you need longer, you can ask the customer to approve extra time.",
                    color = TextGray, fontSize = 14.sp,
                )
            },
        )
    }

    // Waiting on the customer — the clock is NOT extended yet, and we say so plainly.
    val pendingExt = vm.pendingExtension
    if (pendingExt != null) {
        val p = pendingExt
        if (extSheet) extSheet = false
        AlertDialog(
            onDismissRequest = { },
            confirmButton = { TextButton(onClick = { vm.refreshExtensions() }) { Text("Refresh") } },
            title = { Text("Extension approval pending", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "Waiting for the customer to approve +${p.minutes} min" +
                        (if (p.price > 0) " (₹${p.price})" else " (no charge)") +
                        ".\n\nCarry on only once they approve — the extra time isn't active yet.",
                    color = TextGray, fontSize = 14.sp,
                )
            },
        )
    }

    // The customer answered.
    val outcome = vm.lastExtensionOutcome
    if (outcome != null) {
        val o = outcome
        AlertDialog(
            onDismissRequest = { vm.clearExtensionOutcome() },
            confirmButton = { TextButton(onClick = { vm.clearExtensionOutcome() }) { Text("OK") } },
            title = { Text(if (o.status == "approved") "Extra time approved" else "Extension declined", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    if (o.status == "approved")
                        "+${o.minutes} min added" + (if (o.payout > 0) " · you earn ₹${o.payout} extra" else "") + ". The timer has been updated."
                    else
                        "The customer declined the extra time. Finish what you can of the original scope, then complete the job and note anything left undone.",
                    color = TextGray, fontSize = 14.sp,
                )
            },
        )
    }

    if (extSheet) {
        RequestExtensionSheet(vm, onDismiss = { extSheet = false })
    }
}

/**
 * Ask for more time: pick a block, say why, see exactly what the customer will be charged and what
 * you earn, then send. Blocks arrive pre-filtered by the server's caps, so anything shown here is
 * genuinely still allowed on this booking.
 */
@Composable
private fun RequestExtensionSheet(vm: AppViewModel, onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val opts = vm.extensionOptions
    var mins by remember { mutableIntStateOf(0) }
    var reason by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    val block = opts?.blocks?.firstOrNull { it.mins == mins }
    val chargeable = opts?.reasons?.firstOrNull { it.code == reason }?.chargeable ?: true

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        title = { Text("Request more time", fontWeight = FontWeight.Bold) },
        text = {
        Column(Modifier.verticalScroll(rememberScrollState())) {
            Text(
                "The customer decides — they'll see the extra cost and can approve or decline.",
                color = TextGray, fontSize = 12.5.sp, lineHeight = 17.sp,
            )
            Spacer(Modifier.height(Space.l))

            when {
                opts == null -> Text("Loading options…", color = TextMuted, fontSize = 13.sp)
                !opts.enabled -> Text(
                    if (opts.requestsLeft <= 0) "This booking has already used all its allowed extensions. Contact Operations if more time is genuinely needed."
                    else "Extra time isn't available for this service.",
                    color = TextGray, fontSize = 13.sp, lineHeight = 18.sp,
                )
                else -> {
                    Text("Additional time required", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(Space.s))
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                        opts.blocks.forEach { b ->
                            val on = b.mins == mins
                            Column(
                                Modifier.clip(RoundedCornerShape(14.dp))
                                    .background(if (on) Purple else FieldFill)
                                    .clickable { mins = b.mins }
                                    .padding(horizontal = 18.dp, vertical = 12.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Text("+${b.mins} min", color = if (on) Color.White else TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                Text("₹${b.price}", color = if (on) Color.White.copy(alpha = 0.9f) else TextGray, fontSize = 12.sp)
                            }
                        }
                    }
                    Spacer(Modifier.height(Space.l))

                    Text("Why is more time required?", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(Space.s))
                    opts.reasons.forEach { r ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { reason = r.code }
                                .padding(vertical = 9.dp, horizontal = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                Modifier.size(18.dp).clip(CircleShape)
                                    .background(if (reason == r.code) Purple else FieldFill),
                                contentAlignment = Alignment.Center,
                            ) { if (reason == r.code) Box(Modifier.size(7.dp).clip(CircleShape).background(Color.White)) }
                            Spacer(Modifier.width(Space.s))
                            Text(r.label, color = TextDark, fontSize = 13.sp, modifier = Modifier.weight(1f))
                            // Being straight with the worker: this reason means the customer isn't billed.
                            if (!r.chargeable) Text("no charge", color = TextMuted, fontSize = 11.sp)
                        }
                    }

                    if (block != null && reason.isNotBlank()) {
                        Spacer(Modifier.height(Space.m))
                        Column(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Primary50).padding(Space.m),
                        ) {
                            Text("+${block.mins} minutes", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(6.dp))
                            Text(
                                if (chargeable) "Customer charge: ₹${block.price}" else "Customer charge: ₹0 — absorbed, not billed",
                                color = TextGray, fontSize = 12.5.sp,
                            )
                            Text(
                                if (chargeable) "Your additional earning: ₹${block.payout}" else "Your additional earning: ₹0",
                                color = TextGray, fontSize = 12.5.sp,
                            )
                        }
                    }

                    Spacer(Modifier.height(Space.l))
                    PrimaryButton(
                        if (sending) "Sending…" else "Send Request to Customer",
                        enabled = !sending && block != null && reason.isNotBlank(),
                    ) {
                        sending = true
                        vm.requestExtension(mins, reason) { err ->
                            sending = false
                            if (err == null) { toast(ctx, "Request sent — waiting for the customer"); onDismiss() }
                            else toast(ctx, err)
                        }
                    }
                }
            }
        }
        },
    )
}

/**
 * Why the service is pausing. The reason rides along to the activity feed so ops can see why a
 * job's clock stopped — a pause with no reason is indistinguishable from a worker walking off.
 */
@Composable
private fun PauseReasonDialog(onDismiss: () -> Unit, onPick: (String) -> Unit) {
    val reasons = listOf(
        "Water supply cut",
        "Power cut",
        "Customer asked to wait",
        "Short break",
        "Waiting for supplies",
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        title = { Text("Pause the service?", fontWeight = FontWeight.Bold) },
        text = {
            Column {
                Text("The timer stops until you resume. Pick a reason:", color = TextGray, fontSize = 13.sp)
                Spacer(Modifier.height(Space.m))
                reasons.forEach { r ->
                    Row(
                        Modifier.fillMaxWidth().clickable { onPick(r) }.padding(vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("⏸", fontSize = 14.sp)
                        Spacer(Modifier.width(Space.m))
                        Text(r, fontSize = 14.sp, color = TextDark)
                    }
                    Divider(color = Divider)
                }
            }
        },
    )
}

// One row of the In-Progress info card: emoji + bold label on the left, value on the right.
@Composable
private fun TimeInfoRow(emoji: String, label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = Space.m), verticalAlignment = Alignment.CenterVertically) {
        Text(emoji, fontSize = 18.sp)
        Spacer(Modifier.width(Space.m))
        Text(label, fontWeight = FontWeight.Bold, color = TextDark, fontSize = 16.sp, modifier = Modifier.weight(1f))
        Text(value, color = TextGray, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** JPEG-encode a captured camera bitmap as a data URL the backend stores as proof of work. */
private fun bitmapToDataUrl(bmp: Bitmap): String {
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.JPEG, 70, out)
    return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
}

@Composable
fun JobCompletedScreen(vm: AppViewModel, nav: NavHostController) {
    val job = vm.activeJob ?: return
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { vm.loadJobState() }   // so the photo summary + counts are populated
    Column(Modifier.fillMaxSize().background(Color.White)) {
        JobWhiteBar("Job Completed", onBack = null)
        JobFlowStepper(current = 9)
        HairlineDivider()
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.m).padding(top = Space.m, bottom = Space.m),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            val durMs = (vm.serviceEndMs - vm.serviceStartMs).coerceAtLeast(0)
            val h = durMs / 3600000; val m = (durMs / 60000) % 60
            val taken = if (vm.serviceStartMs == 0L) "—" else if (h > 0) "${h}h ${"%02d".format(m)}m" else "${m}m"
            val endedAt = if (vm.serviceEndMs > 0L)
                java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault()).format(java.util.Date(vm.serviceEndMs)) else "—"
            val dateStr = java.text.SimpleDateFormat("dd MMM yyyy", java.util.Locale.getDefault()).format(java.util.Date())
            val rating = if (vm.customerRating > 0) vm.customerRating else 5
            // Earnings + customer-paid split (worker gets 80%; UI breakdown is illustrative).
            val earned = job.earnings
            val incentives = earned * 14 / 100
            val basePay = earned - incentives
            val totalPaid = earned * 100 / 80
            val taxes = totalPaid * 7 / 100
            val serviceCharge = totalPaid - taxes

            // ── Success hero.
            FlowCard {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(76.dp).clip(CircleShape).background(Primary50), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Assignment, contentDescription = null, tint = Purple, modifier = Modifier.size(38.dp))
                        Box(Modifier.align(Alignment.BottomEnd).offset(x = (-6).dp, y = (-6).dp).size(24.dp).clip(CircleShape).background(GreenSuccess), contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(15.dp))
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Text("Job Completed!", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TextDark)
                    Spacer(Modifier.height(4.dp))
                    Text("Great job! The service has been completed successfully.", fontSize = 13.sp, color = TextGray, lineHeight = 17.sp, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(Space.m))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                        CompletedStat(Icons.Filled.Schedule, "Completed At", endedAt)
                        CompletedStat(Icons.Filled.CalendarMonth, "Date", dateStr)
                        CompletedStat(Icons.Filled.Star, "Job ID", job.id)
                    }
                }
            }

            // ── Thank you.
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(GreenLight).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Shield, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(Space.m))
                Column {
                    Text("Thank you for your hard work!", color = GreenSuccess, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text("Your professionalism helps us keep our customers happy.", color = TextGray, fontSize = 11.5.sp, lineHeight = 15.sp)
                }
            }

            // ── Customer (photo + duration + rating).
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Primary50).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CustomerPhoto(job.customerAvatar, job.initials, size = 44)
                        Spacer(Modifier.width(Space.s))
                        Column(Modifier.weight(1f)) {
                            Text(job.customerName, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                            Box(Modifier.clip(RoundedCornerShape(Radius.pill)).background(PurpleLight).padding(horizontal = 7.dp, vertical = 2.dp)) {
                                Text(job.customerType.orEmpty().ifBlank { "Residential" }, color = Purple, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.Top) {
                        Icon(Icons.Filled.LocationOn, contentDescription = null, tint = Purple, modifier = Modifier.size(12.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(job.area.ifBlank { job.address }, color = TextGray, fontSize = 11.sp, lineHeight = 14.sp)
                    }
                }
                Spacer(Modifier.width(Space.m))
                Box(Modifier.width(1.dp).height(62.dp).background(Divider))
                Spacer(Modifier.width(Space.m))
                Column(Modifier.width(104.dp)) {
                    Text("Service", color = TextGray, fontSize = 10.sp)
                    Text(job.services.firstOrNull() ?: "Service", color = TextDark, fontSize = 12.sp, fontWeight = FontWeight.Bold, lineHeight = 15.sp)
                    Spacer(Modifier.height(6.dp))
                    Row {
                        Column(Modifier.weight(1f)) {
                            Text("Duration", color = TextGray, fontSize = 10.sp)
                            Text(taken, color = TextDark, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        Column {
                            Text("Rating", color = TextGray, fontSize = 10.sp)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.Star, contentDescription = null, tint = Purple, modifier = Modifier.size(11.dp))
                                Spacer(Modifier.width(2.dp))
                                Text("$rating.0", color = TextDark, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // ── Job photos summary.
            FlowCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Job Photos Summary", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text("View All", color = Purple, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                    Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
                }
                Spacer(Modifier.height(Space.m))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    PhotoSummaryTile(Modifier.weight(1f), "Before", "${vm.beforePhotos.size} Photos", vm.beforePhotos.firstOrNull()?.url)
                    Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(13.dp))
                    PhotoSummaryTile(Modifier.weight(1f), "In Progress", "${if (vm.beforePhoto != null) 1 else 0} Photo", vm.beforePhoto)
                    Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(13.dp))
                    PhotoSummaryTile(Modifier.weight(1f), "After", "${vm.afterPhotos.size} Photos", vm.afterPhotos.firstOrNull()?.url)
                }
            }

            // ── Payment + earnings.
            FlowCard {
                Row(Modifier.fillMaxWidth()) {
                    Column(Modifier.weight(1f)) {
                        Text("Payment Summary", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(8.dp))
                        PayMini("Service Charge", "₹$serviceCharge")
                        PayMini("Taxes & Fees", "₹$taxes")
                        Spacer(Modifier.height(6.dp)); HairlineDivider(); Spacer(Modifier.height(6.dp))
                        Row { Text("Total Paid", color = Purple, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f)); Text("₹$totalPaid", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                    }
                    Spacer(Modifier.width(Space.m))
                    Box(Modifier.width(1.dp).height(96.dp).background(Divider))
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text("Your Earnings", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(8.dp))
                        PayMini("Base Pay", "₹$basePay")
                        PayMini("Incentives", "₹$incentives")
                        Spacer(Modifier.height(6.dp)); HairlineDivider(); Spacer(Modifier.height(6.dp))
                        Row { Text("Total Earned", color = GreenSuccess, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f)); Text("₹$earned", color = GreenSuccess, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                    }
                }
            }

            // ── Customer feedback.
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Primary50).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("❝", color = Purple, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.width(6.dp))
                        Text("Customer Feedback", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(4.dp))
                    Text("Excellent service! Very professional and thorough. Highly recommended.", color = TextGray, fontSize = 11.5.sp, lineHeight = 15.sp)
                }
                Spacer(Modifier.width(Space.m))
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Row { repeat(rating) { Icon(Icons.Filled.Star, contentDescription = null, tint = Purple, modifier = Modifier.size(12.dp)) } }
                    Spacer(Modifier.height(3.dp))
                    Text(job.customerName, color = TextDark, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Surface(color = Color.White, shadowElevation = 12.dp) {
            Column(Modifier.padding(Space.l), verticalArrangement = Arrangement.spacedBy(Space.s)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                    CompletedFooterButton(Modifier.weight(1f), Icons.AutoMirrored.Filled.HelpOutline, "Contact Support") { nav.navigate(Routes.WALLET_HELP) }
                    CompletedFooterButton(Modifier.weight(1f), Icons.Filled.Assignment, "Download Invoice") {
                        toast(ctx, if (downloadInvoice(ctx, job)) "Invoice saved to Downloads" else "Couldn't save the invoice")
                    }
                }
                Box(
                    Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(Radius.button)).background(Purple).clickable {
                        val e = job.earnings
                        vm.finishAndSettle(); toast(ctx, "₹$e credited to your wallet")
                        nav.navigate(Routes.HOME) { popUpTo(Routes.HOME) { inclusive = true } }
                    },
                    contentAlignment = Alignment.Center,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Home, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("BACK TO DASHBOARD", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

/** Generates a PDF invoice for the job and saves it to the device Downloads folder. */
private fun downloadInvoice(ctx: Context, job: Job): Boolean {
    val earned = job.earnings
    val incentives = earned * 14 / 100
    val basePay = earned - incentives
    val totalPaid = earned * 100 / 80
    val taxes = totalPaid * 7 / 100
    val serviceCharge = totalPaid - taxes
    val date = java.text.SimpleDateFormat("dd MMM yyyy, hh:mm a", java.util.Locale.getDefault()).format(java.util.Date())

    val doc = android.graphics.pdf.PdfDocument()
    val page = doc.startPage(android.graphics.pdf.PdfDocument.PageInfo.Builder(595, 842, 1).create())
    val cv = page.canvas
    val title = android.graphics.Paint().apply { color = android.graphics.Color.parseColor("#4F46E5"); textSize = 24f; isFakeBoldText = true }
    val head = android.graphics.Paint().apply { color = android.graphics.Color.parseColor("#111827"); textSize = 14f; isFakeBoldText = true }
    val body = android.graphics.Paint().apply { color = android.graphics.Color.parseColor("#4B5563"); textSize = 12f }
    val rule = android.graphics.Paint().apply { color = android.graphics.Color.parseColor("#E5E7EB"); strokeWidth = 1f }
    var y = 64f
    cv.drawText("HomeHelp Pro — Invoice", 40f, y, title); y += 32f
    cv.drawText("Job ID: ${job.id}", 40f, y, body); y += 18f
    cv.drawText("Date: $date", 40f, y, body); y += 18f
    cv.drawText("Customer: ${job.customerName}", 40f, y, body); y += 18f
    cv.drawText("Service: ${job.services.firstOrNull() ?: "Service"}", 40f, y, body); y += 18f
    cv.drawText("Address: ${job.address}", 40f, y, body); y += 26f
    cv.drawLine(40f, y, 555f, y, rule); y += 24f
    cv.drawText("Payment Summary", 40f, y, head); y += 22f
    fun row(l: String, v: String) { cv.drawText(l, 40f, y, body); cv.drawText(v, 470f, y, body); y += 18f }
    row("Service Charge", "Rs. $serviceCharge"); row("Taxes & Fees", "Rs. $taxes")
    cv.drawLine(40f, y, 555f, y, rule); y += 20f; row("Total Paid", "Rs. $totalPaid"); y += 14f
    cv.drawText("Your Earnings", 40f, y, head); y += 22f
    row("Base Pay", "Rs. $basePay"); row("Incentives", "Rs. $incentives")
    cv.drawLine(40f, y, 555f, y, rule); y += 20f; row("Total Earned", "Rs. $earned"); y += 32f
    cv.drawText("Thank you for your great work!", 40f, y, body)
    doc.finishPage(page)

    val name = "HomeHelp_Invoice_${job.id}.pdf"
    return try {
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            val resolver = ctx.contentResolver
            val values = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Downloads.DISPLAY_NAME, name)
                put(android.provider.MediaStore.Downloads.MIME_TYPE, "application/pdf")
                put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: return false.also { doc.close() }
            resolver.openOutputStream(uri)!!.use { doc.writeTo(it) }
            values.clear(); values.put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        } else {
            val dir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS)
            if (!dir.exists()) dir.mkdirs()
            java.io.FileOutputStream(java.io.File(dir, name)).use { doc.writeTo(it) }
        }
        doc.close(); true
    } catch (e: Exception) {
        doc.close(); false
    }
}

@Composable
private fun CompletedStat(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(16.dp))
        Spacer(Modifier.height(3.dp))
        Text(label, color = TextGray, fontSize = 9.5.sp, maxLines = 1)
        Text(value, color = Purple, fontSize = 11.5.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
private fun PhotoSummaryTile(modifier: Modifier, label: String, count: String, photoUrl: String? = null) {
    val bmp = remember(photoUrl) { photoUrl?.let { dataUrlToBitmap(it) } }
    Column(
        modifier.clip(RoundedCornerShape(10.dp)).background(Primary50).border(1.dp, Divider, RoundedCornerShape(10.dp)).padding(6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(8.dp)).background(Color.White), contentAlignment = Alignment.Center) {
            if (bmp != null) {
                Image(bmp.asImageBitmap(), contentDescription = label, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(8.dp)))
            } else {
                Icon(Icons.Filled.CameraAlt, contentDescription = null, tint = Purple.copy(alpha = 0.5f), modifier = Modifier.size(20.dp))
            }
        }
        Spacer(Modifier.height(5.dp))
        Text(label, color = TextDark, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, lineHeight = 12.sp, maxLines = 1)
        Text(count, color = TextGray, fontSize = 9.sp, maxLines = 1)
    }
}

@Composable
private fun PayMini(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(label, color = TextGray, fontSize = 11.5.sp, modifier = Modifier.weight(1f))
        Text(value, color = TextDark, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun CompletedFooterButton(modifier: Modifier, icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Box(
        modifier.height(46.dp).clip(RoundedCornerShape(Radius.button)).background(Color.White).border(1.5.dp, Purple, RoundedCornerShape(Radius.button)).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(5.dp))
            Text(label, color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        }
    }
}

// ---- shared flow widgets ----

@Composable
private fun StatusBanner(bg: Color, fg: Color, title: String, subtitle: String) {
    Box(Modifier.fillMaxWidth().background(bg, RoundedCornerShape(Radius.card)).padding(Space.l)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(Radius.field)).background(Color.White.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = fg, modifier = Modifier.size(24.dp)) }
            Spacer(Modifier.width(Space.m))
            Column {
                Text(title, fontWeight = FontWeight.Bold, color = fg)
                Text(subtitle, fontSize = 12.sp, color = TextGray)
            }
        }
    }
}

/**
 * Top action bar for active-job screens — title + quick **Help** (opens support) and **SOS**
 * (confirms, then fires the emergency alert with the worker's location). Brand violet; SOS stays
 * red for urgency. Mirrors the reference layout's Help/SOS controls.
 */
@Composable
fun SafetyHeader(title: String, vm: AppViewModel, nav: NavHostController, onBack: (() -> Unit)? = null) {
    val ctx = LocalContext.current
    var confirmSos by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().background(Color.White)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.m, vertical = Space.s),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = TextDark, modifier = Modifier.size(24.dp).clickable { onBack() })
                Spacer(Modifier.width(Space.s))
            }
            Text(title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.weight(1f))
            Surface(shape = RoundedCornerShape(Radius.pill), color = PurpleLight, modifier = Modifier.clickable { nav.navigate(Routes.P_HELP) }) {
                Row(Modifier.padding(horizontal = 13.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Phone, null, tint = Purple, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(5.dp))
                    Text("Help", color = Purple, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                }
            }
            Spacer(Modifier.width(Space.s))
            Surface(shape = RoundedCornerShape(Radius.pill), color = RedCancel, modifier = Modifier.clickable { confirmSos = true }) {
                Row(Modifier.padding(horizontal = 14.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("🆘", fontSize = 13.sp)
                    Spacer(Modifier.width(5.dp))
                    Text("SOS", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
            }
        }
        HairlineDivider()
    }
    if (confirmSos) {
        AlertDialog(
            onDismissRequest = { confirmSos = false },
            confirmButton = {
                TextButton(onClick = {
                    confirmSos = false
                    // Best-effort live location so the alert carries the worker's position; the SOS
                    // still fires (with null coords) if permission/GPS is unavailable — never blocked.
                    val ll = lastKnownLatLng(ctx)
                    vm.sendSos(ll?.first, ll?.second) { msg -> toast(ctx, msg) }
                }) { Text("Send Alert", color = RedCancel, fontWeight = FontWeight.Bold) }
            },
            dismissButton = { TextButton(onClick = { confirmSos = false }) { Text("Cancel", color = TextGray) } },
            title = { Text("🆘  Send SOS?", fontWeight = FontWeight.Bold) },
            text = { Text("This alerts HomeHelp safety and shares your live location. Use only in a genuine emergency.", color = TextGray, fontSize = 14.sp) },
        )
    }
}

@Composable
fun SafetyCard() {
    Box(Modifier.fillMaxWidth().background(PurpleLight, RoundedCornerShape(Radius.card)).padding(Space.m)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(38.dp).clip(RoundedCornerShape(Radius.pill)).background(Color.White.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Shield, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp)) }
            Spacer(Modifier.width(Space.m))
            Column {
                Text("Safety First", fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 13.sp)
                Text("Your safety is our priority. Share live location with family/friends.", fontSize = 11.sp, color = TextGray)
            }
        }
    }
}

@Composable
private fun MapPlaceholder() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(180.dp)
            .clip(RoundedCornerShape(Radius.card))
            .background(Color(0xFFE8EAF0)),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.foundation.Canvas(Modifier.fillMaxSize().padding(Space.xl)) {
            val start = Offset(size.width * 0.1f, size.height * 0.8f)
            val mid = Offset(size.width * 0.5f, size.height * 0.5f)
            val end = Offset(size.width * 0.9f, size.height * 0.2f)
            drawLine(Purple, start, mid, strokeWidth = 10f, cap = StrokeCap.Round)
            drawLine(Purple, mid, end, strokeWidth = 10f, cap = StrokeCap.Round)
            drawCircle(GreenSuccess, radius = 16f, center = end)
            drawCircle(Purple, radius = 16f, center = start)
        }
        Text("🗺  Live Route", color = TextGray, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun CancelDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    val reasons = listOf("Customer not available", "Wrong address", "Safety concern", "Other")
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
        title = { Text("Cancel Job", fontWeight = FontWeight.Bold) },
        text = {
            Column {
                Text("Select a reason:", color = TextGray, fontSize = 13.sp)
                Spacer(Modifier.height(Space.s))
                reasons.forEach { r ->
                    Text(
                        r,
                        color = TextDark,
                        fontSize = 15.sp,
                        modifier = Modifier.fillMaxWidth().clickable { onConfirm(r) }.padding(vertical = Space.s),
                    )
                    Divider(color = Divider)
                }
            }
        },
    )
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * UI CHANGE LOG — JobFlowScreens.kt  (UI-ONLY enterprise redesign)
 * ─────────────────────────────────────────────────────────────────────────────
 * Goal: give the six job-lifecycle screens a premium, consistent field-service
 * look (Uber / Urban Company driver-flow feel) using the shared design system
 * (Theme.kt Colors/Space/Radius + Components.kt Card/PrimaryButton/OutlineButton/
 * StatusPill/Avatar/RatingStars/GradientBanner/SectionTitle/LabeledRow/HairlineDivider).
 *
 * Per-screen visual improvements (NO behavior changes):
 *  • NewJobScreen — Soft ScreenBg canvas; rounded/round-capped accept countdown ring;
 *    "New Job Request" StatusPill; premium request Card (Avatar + name + RatingStars,
 *    headline Earnings/Distance stats); tinted icon-chip detail rows; Accept
 *    (PrimaryButton) / Decline (OutlineButton) actions. Countdown + accept/reject
 *    logic and nav popUpTo untouched.
 *  • InfoRow helper — restyled from a flat Surface into a tinted round icon-chip row
 *    for use inside Cards.
 *  • JobDetailsScreen — "Job Accepted" StatusPill, token spacing, elevated white
 *    bottom action bar (Surface shadow) with the same Start-On-The-Way action.
 *  • OnTheWayScreen — Route Card with "En route" StatusPill + tinted location chip;
 *    customer Card gains an Avatar and hairline divider; elevated bottom action bar.
 *    OsmMap, GPS reads, live location streaming, distance/ETA math untouched.
 *  • StartServiceScreen — OTP + guidance grouped in a Card with an "Arrived"
 *    StatusPill; 4-box OTP field restyled with FieldFill + Radius.field and a
 *    Purple accent border on filled digits; premium before-photo tile. OTP
 *    validation (verifyOtpAndStart), camera capture, and cancel flow untouched.
 *  • InProgressScreen — Stage StatusPill (In Progress / Time Completed); token
 *    spacing; elevated bottom action bar. Server-anchored countdown timer, ring,
 *    checklist state, camera/end-service logic, and time-up dialog untouched.
 *  • JobCompletedScreen — Celebratory green GradientBanner hero (check badge +
 *    earnings chip) replacing the flat tint box; token spacing on summary/rating
 *    Cards; elevated bottom action bar. Rating submission and finishAndSettle /
 *    wallet-credit / nav logic untouched.
 *  • StatusBanner helper — premium icon-chip + card-radius styling.
 *  • Throughout — hardcoded dp radii replaced with Radius.* tokens and raw spacing
 *    with Space.* tokens.
 *
 * ── Pass 2 (reference-pattern polish, still UI-ONLY) ──
 *  • StartDeadlineBanner — hardcoded warning/urgent hex colors swapped for the
 *    RedLight / GoldLight / PurpleLight tokens; leading translucent icon chip + a
 *    colored status dot on the headline. Countdown math, ONTIME_BONUS / LATE_PENALTY
 *    values, vm.startWindowMinutes and the per-second LaunchedEffect are untouched.
 *  • OnTheWayScreen — added a shared MiniStatCard strip (Distance / ETA) that reads
 *    the SAME distKm / etaMin values already computed from live GPS; OsmMap params,
 *    GPS reads, location streaming and Navigate actions unchanged.
 *  • JobCompletedScreen — earnings now presented via the shared reference widgets:
 *    an ElevatedGroup(MoneyBanner "Total payout" + BreakdownRow breakdown) replacing
 *    the redundant hero chip and the summary "Earnings" row. The green celebration
 *    hero, RatingStars flow, rateCustomer / finishAndSettle / wallet-credit / nav
 *    logic and the time-taken/ended-at computations are unchanged.
 *  • SafetyCard / SafetyHeader — Radius.pill / Radius.card + Space.* tokens and a
 *    translucent icon chip; Help (P_HELP nav) and SOS (confirm → sendSos w/ last
 *    known location) behavior identical, signatures identical.
 *  • InProgressScreen / TimeInfoRow / CancelDialog / MapPlaceholder — remaining raw
 *    4/8/12/16/20/22 dp spacing and RoundedCornerShape(50/12) radii tokenized.
 *
 * Confirmed UNCHANGED: every @Composable signature; all vm.* calls; remember{} /
 * mutableStateOf / mutableIntStateOf / mutableLongStateOf; LaunchedEffect / delay /
 * timers; OTP validation; map composables (OsmMap) and location/permission code;
 * navigation routes and popUpTo; helper logic (haversineKm, parseIsoMillis,
 * checklistFor, bitmapToDataUrl, launchNavigation, dialNumber, lastKnownLatLng).
 * ─────────────────────────────────────────────────────────────────────────────
 */
