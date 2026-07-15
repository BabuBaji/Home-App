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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.CheckCircle
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
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

@Composable
fun NewJobScreen(vm: AppViewModel, nav: NavHostController) {
    val job = vm.activeJob ?: return
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

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("New Job Request", onBack = {
            vm.rejectJob(); nav.popBackStack(Routes.HOME, inclusive = false)
        })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Live accept countdown (drives auto-reject) rendered as a premium progress ring.
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(128.dp)) {
                CircularProgressIndicator(
                    progress = { secs / ACCEPT_WINDOW_SEC.toFloat() },
                    modifier = Modifier.size(128.dp),
                    color = if (secs <= 20) RedCancel else Purple,
                    trackColor = PurpleLight,
                    strokeWidth = 9.dp,
                    strokeCap = StrokeCap.Round,
                )
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("%d:%02d".format(secs / 60, secs % 60), fontSize = 30.sp, fontWeight = FontWeight.Bold, color = TextDark)
                    Text("MIN : SEC", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = TextGray, letterSpacing = 1.sp)
                }
            }
            Spacer(Modifier.height(Space.m))
            StatusPill("New Job Request", PurpleLight, Purple)
            Spacer(Modifier.height(Space.s))
            Text("New job request!", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TextDark)
            Text("Respond within time to accept the job", fontSize = 13.sp, color = TextGray)
            Spacer(Modifier.height(Space.l))

            // Premium request summary — customer, service, and headline pay/distance.
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(job.initials)
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text(job.customerName, fontWeight = FontWeight.SemiBold, color = TextDark)
                        Text(
                            (job.services.firstOrNull() ?: "Service") +
                                if (job.services.size > 1) "  +${job.services.size - 1} more" else "",
                            fontSize = 12.sp, color = TextGray,
                        )
                    }
                    RatingStars(job.customerRating)
                }
                Spacer(Modifier.height(Space.m))
                HairlineDivider()
                Spacer(Modifier.height(Space.m))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text("Estimated Earnings", fontSize = 12.sp, color = TextMuted)
                        Spacer(Modifier.height(Space.xs))
                        Text("₹${job.earnings}", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = GreenSuccess)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Distance", fontSize = 12.sp, color = TextMuted)
                        Spacer(Modifier.height(Space.xs))
                        Text("${job.distanceKm} km", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TextDark)
                    }
                }
            }
            Spacer(Modifier.height(Space.m))
            Card {
                InfoRow(Icons.Filled.CameraAlt, job.services.firstOrNull() ?: "Service", if (job.services.size > 1) "+${job.services.size - 1} more service" else "Service requested")
                HairlineDivider()
                InfoRow(Icons.Filled.LocationOn, job.address, "Service location")
                HairlineDivider()
                InfoRow(Icons.Filled.Navigation, "${job.distanceKm} km away", "Estimated travel distance")
            }
            Spacer(Modifier.height(Space.m))
            Box(Modifier.fillMaxWidth().background(PurpleLight, RoundedCornerShape(Radius.field)).padding(Space.m)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Shield, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(Space.s))
                    Column {
                        Text("Accept more jobs to increase your earnings", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = TextDark)
                        Text("Higher acceptance rate gives you more priority", fontSize = 11.sp, color = TextGray)
                    }
                }
            }
            Spacer(Modifier.height(Space.l))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                OutlineButton("Decline", modifier = Modifier.weight(1f), color = RedCancel) {
                    vm.rejectJob(); nav.popBackStack(Routes.HOME, inclusive = false)
                }
                PrimaryButton("Accept", modifier = Modifier.weight(1f)) {
                    vm.acceptJob()
                    // Remove the New Job screen from the back stack so "Back" returns to Home
                    // (with the resume card), not to the accept countdown for a job already taken.
                    nav.navigate(Routes.JOB_DETAILS) {
                        popUpTo(Routes.NEW_JOB) { inclusive = true }
                    }
                }
            }
        }
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
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Job Details", onBack = { nav.popBackStack() }, trailing = {
            Icon(Icons.Filled.Phone, contentDescription = "Call", tint = Color.White,
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

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("On The Way", onBack = { nav.popBackStack() }, trailing = {
            Icon(Icons.Filled.Phone, contentDescription = "Call", tint = Color.White,
                modifier = Modifier.size(22.dp).clickable { dialNumber(ctx, job.customerPhone) })
        })
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
                    vm.markArrived(); nav.navigate(Routes.START_SERVICE)
                }
            }
        }
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

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        SafetyHeader("Start Service", vm, nav) { nav.popBackStack() }
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            StatusBanner(GreenLight, GreenSuccess, "You have arrived!", "Please start the service after OTP verification")
            Spacer(Modifier.height(Space.m))
            StartDeadlineBanner(vm)
            Spacer(Modifier.height(Space.m))

            Card {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Verify to Start", fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.weight(1f))
                    StatusPill("Arrived", GreenLight, GreenSuccess)
                }
                Spacer(Modifier.height(Space.xs))
                Text("Enter OTP given by customer", fontSize = 13.sp, color = TextGray)
                Spacer(Modifier.height(Space.l))

                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    BasicTextField(
                        value = otp,
                        onValueChange = {
                            if (it.length <= 4 && it.all(Char::isDigit)) { otp = it; error = false }
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        decorationBox = {
                            Row(horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                                repeat(4) { i ->
                                    val ch = otp.getOrNull(i)?.toString() ?: ""
                                    val filled = ch.isNotEmpty()
                                    Box(
                                        Modifier
                                            .size(56.dp)
                                            .background(FieldFill, RoundedCornerShape(Radius.field))
                                            .border(
                                                1.5.dp,
                                                if (error) RedCancel else if (filled) Purple else Color.Transparent,
                                                RoundedCornerShape(Radius.field),
                                            ),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text(ch, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextDark)
                                    }
                                }
                            }
                        },
                    )
                }
                if (error) {
                    Spacer(Modifier.height(Space.s))
                    Text("Incorrect OTP. Try again.", color = RedCancel, fontSize = 12.sp)
                }
                Spacer(Modifier.height(Space.l))
                Box(Modifier.fillMaxWidth().background(PurpleLight, RoundedCornerShape(Radius.field)).padding(Space.m)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Shield, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(Space.s))
                        Column {
                            Text("This OTP is valid for 10 minutes.", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = TextDark)
                            Text("Do not share this OTP with anyone.", fontSize = 11.sp, color = TextGray)
                        }
                    }
                }
                Text("Demo OTP for ${job.customerName}: ${job.otp}", color = TextGray, fontSize = 12.sp, modifier = Modifier.padding(top = Space.s))
                Spacer(Modifier.height(Space.m))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Don't get the OTP?", color = TextGray, fontSize = 13.sp)
                    Spacer(Modifier.width(Space.xs))
                    Text("Call Customer", color = Purple, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable { dialNumber(ctx, job.customerPhone) })
                }
            }
            Spacer(Modifier.height(Space.m))
            Surface(
                Modifier.fillMaxWidth().clickable { captureBefore() },
                shape = RoundedCornerShape(Radius.field),
                color = if (beforeShot) GreenLight else PurpleLight,
            ) {
                Row(Modifier.padding(Space.m), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CameraAlt, contentDescription = null, tint = if (beforeShot) GreenSuccess else Purple, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(Space.s))
                    Text(
                        if (beforeShot) "Before photo captured ✓" else "Take Before Photo (optional)",
                        color = if (beforeShot) GreenSuccess else Purple, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
                    )
                }
            }
            Spacer(Modifier.height(Space.l))
            PrimaryButton("Start Service", enabled = otp.length == 4) {
                if (vm.verifyOtpAndStart(otp)) nav.navigate(Routes.BEFORE_PHOTOS) else error = true
            }
            Spacer(Modifier.height(Space.s))
            Text(
                "Cancel Job",
                color = RedCancel, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(Space.s).clickable { showCancel = true },
            )
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
    val targetSec = job.durationMinutes.coerceAtLeast(1) * 60
    val timeUp = rawElapsed >= targetSec
    val elapsed = if (timeUp) targetSec else rawElapsed
    var timeUpDismissed by remember { mutableStateOf(false) }

    // Ending the service hands off to step 7 (After Photos) → step 8 (Customer Sign) → complete.
    // The proof photo the customer sees is the first after-photo, attached server-side.

    LaunchedEffect(Unit) {
        vm.loadJobState()   // checklist / extras / pause state for this job
        while (true) { nowMs = System.currentTimeMillis(); delay(1000) }
    }
    var pauseDialog by remember { mutableStateOf(false) }
    if (pauseDialog) {
        PauseReasonDialog(onDismiss = { pauseDialog = false }) { reason ->
            vm.pauseJob(reason); pauseDialog = false
        }
    }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        SafetyHeader("Service Started", vm, nav) { nav.popBackStack() }
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // Booked-duration COUNTDOWN (violet) + start/end times — mirrors the customer's timer.
            val remainingSec = (targetSec - rawElapsed).coerceAtLeast(0)
            val ringProgress = if (targetSec > 0) remainingSec.toFloat() / targetSec else 0f
            val clock: (Long) -> String = { ms ->
                java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault()).format(java.util.Date(ms))
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                StatusPill(
                    if (vm.jobPaused) "Paused" else if (timeUp) "Time Completed" else "Service In Progress",
                    if (vm.jobPaused) GoldLight else if (timeUp) GreenLight else PurpleLight,
                    if (vm.jobPaused) Amber else if (timeUp) GreenSuccess else Purple,
                )
            }
            if (vm.jobPaused) {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.card)).background(GoldLight).padding(Space.m),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("⏸", fontSize = 18.sp)
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text("Service paused", fontWeight = FontWeight.Bold, color = TextDark, fontSize = 14.sp)
                        Text("The timer is stopped. Resume when you're back on the job.", color = TextGray, fontSize = 12.sp)
                    }
                }
            }
            Card {
                TimeInfoRow("⏳", "Duration", "${job.durationMinutes} Minutes")
                Divider(color = Divider)
                TimeInfoRow("🕗", "Start time", clock(startMs))
                Divider(color = Divider)
                TimeInfoRow("🕘", "End time", clock(startMs + targetSec * 1000L))

                Spacer(Modifier.height(Space.xl))
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(210.dp)) {
                        CircularProgressIndicator(
                            progress = { if (timeUp) 0f else ringProgress.coerceIn(0f, 1f) },
                            modifier = Modifier.size(210.dp),
                            color = if (timeUp) GreenSuccess else Purple,
                            trackColor = PurpleLight,
                            strokeWidth = 13.dp,
                            strokeCap = StrokeCap.Round,
                        )
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                if (timeUp) "TIME COMPLETED" else "TIME REMAINING",
                                color = if (timeUp) GreenSuccess else Purple,
                                fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.5.sp,
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "%02d:%02d".format(remainingSec / 60, remainingSec % 60),
                                color = if (timeUp) GreenSuccess else Purple,
                                fontSize = 44.sp, fontWeight = FontWeight.Bold,
                            )
                            Text(
                                if (timeUp) "Booked ${job.durationMinutes} min reached" else "of ${job.durationMinutes} min booked",
                                color = TextGray, fontSize = 12.sp,
                            )
                        }
                    }
                }
                Spacer(Modifier.height(Space.s))
            }
            Card {
                SectionTitle("Job Details")
                Spacer(Modifier.height(Space.xs))
                LabeledRow("Services", job.services.joinToString(", "))
                Divider(color = Divider)
                LabeledRow("Address", job.area)
            }
            Card {
                Text("Customer", fontSize = 12.sp, color = TextMuted)
                Spacer(Modifier.height(Space.s))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(job.initials)
                    Spacer(Modifier.width(Space.m))
                    Text(job.customerName, fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.weight(1f))
                    Icon(Icons.Filled.Phone, contentDescription = "Call", tint = Purple,
                        modifier = Modifier.size(22.dp).clickable { dialNumber(ctx, job.customerPhone) })
                    Spacer(Modifier.width(Space.l))
                    Icon(Icons.Filled.Chat, contentDescription = "Chat", tint = Purple,
                        modifier = Modifier.size(22.dp).clickable { nav.navigate(Routes.JOB_CHAT) })
                }
            }
            // Service checklist — server-held, so ticks survive leaving the screen and reach the
            // customer/admin. The list itself is seeded from the booked services.
            Card {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Service Checklist", fontWeight = FontWeight.SemiBold, color = TextDark)
                    Text(
                        "${vm.checklistDone}/${vm.checklist.size}",
                        fontWeight = FontWeight.Bold,
                        color = if (vm.checklist.isNotEmpty() && vm.checklistDone == vm.checklist.size) GreenSuccess else Purple,
                    )
                }
                Spacer(Modifier.height(Space.xs))
                if (vm.checklist.isEmpty()) {
                    Text("Loading tasks…", fontSize = 13.sp, color = TextMuted, modifier = Modifier.padding(vertical = Space.s))
                }
                vm.checklist.forEachIndexed { i, t ->
                    Row(
                        Modifier.fillMaxWidth().clickable { vm.toggleTask(t.id) }.padding(vertical = Space.s),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (t.done) Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(22.dp))
                        else Box(Modifier.size(22.dp).border(1.5.dp, Divider, RoundedCornerShape(Radius.pill)))
                        Spacer(Modifier.width(Space.m))
                        Text(t.label, fontSize = 14.sp, color = if (t.done) TextGray else TextDark, modifier = Modifier.weight(1f))
                    }
                    if (i < vm.checklist.lastIndex) Divider(color = Divider)
                }
            }
            // Extra services added on this job (module: Add Extra Service).
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Extra Services", fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.weight(1f))
                    if (vm.extras.isNotEmpty()) {
                        Text("+₹${vm.extrasTotal}", fontWeight = FontWeight.Bold, color = GreenSuccess, fontSize = 14.sp)
                        Spacer(Modifier.width(Space.s))
                    }
                    Text(
                        "Add", color = Purple, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                        modifier = Modifier.clickable { nav.navigate(Routes.JOB_EXTRAS) },
                    )
                }
                if (vm.extras.isEmpty()) {
                    Spacer(Modifier.height(Space.xs))
                    Text("Customer asked for something extra? Add it here so it's billed.", fontSize = 12.sp, color = TextGray)
                } else {
                    vm.extras.forEach { e ->
                        Row(Modifier.fillMaxWidth().padding(top = Space.s), verticalAlignment = Alignment.CenterVertically) {
                            Text("• ${e.name}", fontSize = 13.sp, color = TextDark, modifier = Modifier.weight(1f))
                            Text("₹${e.price}", fontSize = 13.sp, color = TextDark, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
            SafetyCard()
            Text(
                "📷 Tap “End Service” to capture the after photos, then collect the customer's signature and rating.",
                fontSize = 12.sp, color = TextGray,
            )
        }
        Surface(color = Color.White, shadowElevation = 12.dp) {
            Column(Modifier.padding(Space.l), verticalArrangement = Arrangement.spacedBy(Space.s)) {
                // Pause/Resume sits beside the end action: it's a state toggle, not a way out.
                if (vm.jobPaused) {
                    PrimaryButton("▶  Resume Service") { vm.resumeJob() }
                } else {
                    OutlineButton("⏸  Pause Service", modifier = Modifier.fillMaxWidth(), color = Amber) { pauseDialog = true }
                }
                PrimaryButton("End Service & Capture After Photos", enabled = !vm.jobPaused) {
                    nav.navigate(Routes.AFTER_PHOTOS)
                }
            }
        }
    }

    // One-time "service time completed" popup when the booked duration elapses.
    if (timeUp && !timeUpDismissed) {
        AlertDialog(
            onDismissRequest = { timeUpDismissed = true },
            confirmButton = { TextButton(onClick = { timeUpDismissed = true }) { Text("OK") } },
            title = { Text("⏱  Service Time Completed", fontWeight = FontWeight.Bold) },
            text = { Text("The booked ${job.durationMinutes} min for this service is over. Wrap up and tap “End Service” to capture the proof photo.", color = TextGray, fontSize = 14.sp) },
        )
    }
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
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Job Completed", onBack = null)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // Celebratory success hero.
            GradientBanner(gradient = Brush.linearGradient(listOf(GreenSuccess, Color(0xFF16A34A)))) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(vertical = Space.s)) {
                    Box(
                        Modifier.size(64.dp).clip(RoundedCornerShape(Radius.pill)).background(Color.White.copy(alpha = 0.22f)),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp)) }
                    Spacer(Modifier.height(Space.m))
                    Text("Job Completed!", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    Spacer(Modifier.height(Space.xs))
                    Text("Thank you for completing the job.", fontSize = 13.sp, color = Color.White.copy(alpha = 0.9f))
                }
            }
            // Actual on-site time (start → end) and the moment the service ended.
            val durMs = (vm.serviceEndMs - vm.serviceStartMs).coerceAtLeast(0)
            val mins = durMs / 60000
            val secs = (durMs / 1000) % 60
            val taken = if (vm.serviceStartMs == 0L) "—" else if (mins > 0) "${mins}m ${secs}s" else "${secs}s"
            val endedAt = if (vm.serviceEndMs > 0L)
                java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault()).format(java.util.Date(vm.serviceEndMs))
            else "—"
            // Payout hero — brand money banner + connected breakdown (reference pattern).
            ElevatedGroup {
                MoneyBanner("Total payout", job.earnings)
                Column(Modifier.background(CardBg).padding(Space.l)) {
                    BreakdownRow("Service earnings", "₹${job.earnings}")
                    BreakdownRow("Time taken (actual)", taken, valueColor = GreenSuccess)
                    HairlineDivider()
                    Spacer(Modifier.height(Space.s))
                    BreakdownRow("Credited to wallet", "₹${job.earnings}", valueColor = GreenSuccess)
                }
            }
            Card {
                SectionTitle("Job Summary")
                Spacer(Modifier.height(Space.xs))
                LabeledRow("Services", job.services.joinToString(", "))
                Divider(color = Divider)
                LabeledRow("Booked Duration", "${job.durationHours} Hours")
                Divider(color = Divider)
                LabeledRow("Ended At", endedAt)
            }
            var stars by remember { mutableStateOf(0) }
            var comment by remember { mutableStateOf("") }
            var rated by remember { mutableStateOf(false) }
            Card {
                Text("Rate the Customer", fontWeight = FontWeight.SemiBold, color = TextDark)
                Spacer(Modifier.height(Space.xs))
                Text("Optional — helps us match you better next time.", fontSize = 12.sp, color = TextGray)
                Spacer(Modifier.height(Space.s))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    repeat(5) { i ->
                        Icon(
                            Icons.Filled.Star,
                            contentDescription = null,
                            tint = if (i < stars) Gold else Color(0xFFE0E0E6),
                            modifier = Modifier.size(34.dp).clickable(enabled = !rated) { stars = i + 1 },
                        )
                        if (i < 4) Spacer(Modifier.width(Space.xs))
                    }
                }
                if (!rated) {
                    Spacer(Modifier.height(Space.m))
                    Box(Modifier.fillMaxWidth().border(1.dp, Divider, RoundedCornerShape(Radius.field)).padding(Space.m)) {
                        BasicTextField(
                            value = comment, onValueChange = { comment = it },
                            modifier = Modifier.fillMaxWidth(),
                            decorationBox = { inner ->
                                if (comment.isEmpty()) Text("Add a note (optional)", color = TextGray, fontSize = 14.sp)
                                inner()
                            },
                        )
                    }
                    Spacer(Modifier.height(Space.m))
                    OutlineButton("Submit Rating", modifier = Modifier.fillMaxWidth()) {
                        if (stars == 0) toast(ctx, "Tap the stars to rate") else {
                            vm.rateCustomer(stars, comment); rated = true; toast(ctx, "Thanks for your feedback!")
                        }
                    }
                } else {
                    Spacer(Modifier.height(Space.s))
                    Text("✓ Rating submitted — thank you!", color = GreenSuccess, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            SafetyCard()
        }
        Surface(color = Color.White, shadowElevation = 12.dp) {
          Box(Modifier.padding(Space.l)) {
            PrimaryButton("Finish & Submit") {
                val earned = job.earnings
                vm.finishAndSettle()
                toast(ctx, "₹$earned credited to your wallet")
                nav.navigate(Routes.HOME) {
                    popUpTo(Routes.HOME) { inclusive = true }
                }
            }
          }
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
