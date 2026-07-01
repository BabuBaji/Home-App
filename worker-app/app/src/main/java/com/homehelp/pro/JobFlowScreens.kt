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
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Shield
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import kotlinx.coroutines.delay

@Composable
fun NewJobScreen(vm: AppViewModel, nav: NavHostController) {
    val job = vm.activeJob ?: return
    var secs by remember { mutableIntStateOf(18) }

    LaunchedEffect(job.id) {
        secs = 18
        while (secs > 0) {
            delay(1000)
            secs--
        }
        vm.rejectJob()
        nav.popBackStack(Routes.HOME, inclusive = false)
    }

    Column(Modifier.fillMaxSize().background(Color.White)) {
        Header("New Job Request", onBack = {
            vm.rejectJob(); nav.popBackStack(Routes.HOME, inclusive = false)
        })
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(120.dp)) {
                CircularProgressIndicator(
                    progress = { secs / 18f },
                    modifier = Modifier.size(120.dp),
                    color = Purple,
                    trackColor = PurpleLight,
                    strokeWidth = 8.dp,
                )
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("$secs", fontSize = 32.sp, fontWeight = FontWeight.Bold, color = TextDark)
                    Text("SEC", fontSize = 12.sp, color = TextGray)
                }
            }
            Spacer(Modifier.height(16.dp))
            Text("New job request!", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TextDark)
            Text("Respond within time to accept the job", fontSize = 13.sp, color = TextGray)
            Spacer(Modifier.height(20.dp))

            InfoRow(Icons.Filled.CameraAlt, job.services.first(), if (job.services.size > 1) "+${job.services.size - 1} more service" else null)
            InfoRow(Icons.Filled.LocationOn, job.address, null)
            InfoRow(Icons.Filled.Navigation, "${job.distanceKm} km away", null)
            InfoRow(Icons.Filled.Schedule, "₹${job.earnings}", "Estimated Earnings")

            Spacer(Modifier.height(16.dp))
            Box(Modifier.fillMaxWidth().background(PurpleLight, RoundedCornerShape(12.dp)).padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Shield, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text("Accept more jobs to increase your earnings", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = TextDark)
                        Text("Higher acceptance rate gives you more priority", fontSize = 11.sp, color = TextGray)
                    }
                }
            }
            Spacer(Modifier.height(20.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlineButton("Reject", modifier = Modifier.weight(1f), color = RedCancel) {
                    vm.rejectJob(); nav.popBackStack(Routes.HOME, inclusive = false)
                }
                PrimaryButton("Accept", modifier = Modifier.weight(1f)) {
                    vm.acceptJob(); nav.navigate(Routes.JOB_DETAILS)
                }
            }
        }
    }
}

@Composable
private fun InfoRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String?) {
    Surface(
        Modifier.fillMaxWidth().padding(vertical = 5.dp),
        shape = RoundedCornerShape(12.dp),
        color = ScreenBg,
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = Purple, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = TextDark)
                if (subtitle != null) Text(subtitle, fontSize = 12.sp, color = TextGray)
            }
        }
    }
}

@Composable
fun JobDetailsScreen(vm: AppViewModel, nav: NavHostController) {
    val job = vm.activeJob ?: return
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Job Details", onBack = { nav.popBackStack() }, trailing = {
            Icon(Icons.Filled.Phone, contentDescription = "Call", tint = Purple,
                modifier = Modifier.size(22.dp).clickable { dialNumber(ctx, job.customerPhone) })
        })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Card {
                SectionTitle("Customer Details")
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(job.initials)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(job.customerName, fontWeight = FontWeight.SemiBold, color = TextDark)
                        Text(job.customerPhone, fontSize = 12.sp, color = TextGray)
                    }
                    RatingStars(job.customerRating)
                }
            }
            Card {
                SectionTitle("Job Details")
                Spacer(Modifier.height(4.dp))
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
                Spacer(Modifier.height(4.dp))
                LabeledRow("Estimated Earnings", "₹${job.earnings}", valueColor = GreenSuccess)
                Text("Payable after job completion", fontSize = 12.sp, color = TextGray)
            }
            SafetyCard()
        }
        Box(Modifier.background(Color.White).padding(16.dp)) {
            PrimaryButton("Start On The Way") {
                vm.startOnTheWay(); nav.navigate(Routes.ON_THE_WAY)
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
            Icon(Icons.Filled.Phone, contentDescription = "Call", tint = Purple,
                modifier = Modifier.size(22.dp).clickable { dialNumber(ctx, job.customerPhone) })
        })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            StatusBanner(GreenLight, GreenSuccess, "On The Way", "You are on your way to customer location")
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = Purple, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(job.address, fontSize = 13.sp, color = TextDark)
                        Text("Destination: ${job.lat}, ${job.lng}", fontSize = 11.sp, color = TextGray)
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Navigation, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Your GPS: $myLocation", fontSize = 12.sp, color = TextDark, modifier = Modifier.weight(1f))
                }
                Spacer(Modifier.height(10.dp))
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
            OsmMap(
                destLat = job.lat,
                destLng = job.lng,
                destLabel = job.customerName,
                myLat = myLat,
                myLng = myLng,
                modifier = Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(12.dp)),
            )
            Card {
                Text("Customer", fontSize = 12.sp, color = TextGray)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(job.customerName, fontWeight = FontWeight.SemiBold, color = TextDark)
                        Text(
                            job.customerPhone.ifBlank { "No number" }, fontSize = 13.sp, color = Purple,
                            modifier = Modifier.clickable { dialNumber(ctx, job.customerPhone) },
                        )
                    }
                    Icon(Icons.Filled.Phone, contentDescription = "Call", tint = Purple,
                        modifier = Modifier.size(22.dp).clickable { dialNumber(ctx, job.customerPhone) })
                    Spacer(Modifier.width(16.dp))
                    Icon(Icons.Filled.Chat, contentDescription = "Chat", tint = Purple,
                        modifier = Modifier.size(22.dp).clickable { toast(ctx, "Opening chat…") })
                }
                Spacer(Modifier.height(8.dp))
                Text("Service Address", fontSize = 12.sp, color = TextGray)
                Text(job.address, fontSize = 13.sp, color = TextDark)
                Spacer(Modifier.height(8.dp))
                Text("Estimated Arrival", fontSize = 12.sp, color = TextGray)
                Text(arrivalClock, fontWeight = FontWeight.SemiBold, color = TextDark)
            }
            PrimaryButton("Navigate with Google Maps") {
                launchNavigation(ctx, job.lat, job.lng, job.customerName, myLat, myLng)
            }
        }
        Box(Modifier.background(Color.White).padding(16.dp)) {
            PrimaryButton("Reached Location") {
                vm.markArrived(); nav.navigate(Routes.START_SERVICE)
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

    if (showCancel) {
        CancelDialog(onDismiss = { showCancel = false }) { reason ->
            showCancel = false
            vm.cancelJobWithReason(reason)
            toast(ctx, "Job cancelled: $reason")
            nav.popBackStack(Routes.HOME, inclusive = false)
        }
    }

    Column(Modifier.fillMaxSize().background(Color.White)) {
        Header("Start Service", onBack = { nav.popBackStack() })
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            StatusBanner(GreenLight, GreenSuccess, "You have arrived!", "Please start the service after OTP verification")
            Spacer(Modifier.height(24.dp))
            Text("Enter OTP given by customer", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(16.dp))

            BasicTextField(
                value = otp,
                onValueChange = {
                    if (it.length <= 4 && it.all(Char::isDigit)) { otp = it; error = false }
                },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                decorationBox = {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        repeat(4) { i ->
                            val ch = otp.getOrNull(i)?.toString() ?: ""
                            Box(
                                Modifier
                                    .size(56.dp)
                                    .background(ScreenBg, RoundedCornerShape(12.dp))
                                    .border(1.5.dp, if (error) RedCancel else PurpleLight, RoundedCornerShape(12.dp)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(ch, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextDark)
                            }
                        }
                    }
                },
            )
            if (error) {
                Spacer(Modifier.height(8.dp))
                Text("Incorrect OTP. Try again.", color = RedCancel, fontSize = 12.sp)
            }
            Spacer(Modifier.height(16.dp))
            Box(Modifier.fillMaxWidth().background(PurpleLight, RoundedCornerShape(12.dp)).padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Shield, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text("This OTP is valid for 10 minutes.", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = TextDark)
                        Text("Do not share this OTP with anyone.", fontSize = 11.sp, color = TextGray)
                    }
                }
            }
            Text("Demo OTP for ${job.customerName}: ${job.otp}", color = TextGray, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
            Spacer(Modifier.height(12.dp))
            Text("Don't get the OTP?", color = TextGray, fontSize = 13.sp)
            Text("Call Customer", color = Purple, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable { dialNumber(ctx, job.customerPhone) })
            Spacer(Modifier.height(16.dp))
            PrimaryButton("Start Service", enabled = otp.length == 4) {
                if (vm.verifyOtpAndStart(otp)) nav.navigate(Routes.IN_PROGRESS) else error = true
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "Cancel Job",
                color = RedCancel, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(8.dp).clickable { showCancel = true },
            )
        }
    }
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
    val elapsed = ((nowMs - startMs) / 1000L).toInt().coerceAtLeast(0)

    // Live-camera proof of work: capture a photo, attach it to the job, end the service,
    // then move on. The customer app receives the completion (+ photo) and opens its
    // review/feedback page automatically.
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp ->
        if (bmp != null) {
            vm.endService(bitmapToDataUrl(bmp))
            toast(ctx, "Proof photo uploaded · service ended")
            nav.navigate(Routes.JOB_COMPLETED)
        } else {
            toast(ctx, "A photo is required to end the service")
        }
    }
    val cameraPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) cameraLauncher.launch(null) else toast(ctx, "Camera permission is needed to capture the proof photo")
    }
    fun captureAndEnd() {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
            cameraLauncher.launch(null)
        else cameraPerm.launch(Manifest.permission.CAMERA)
    }

    LaunchedEffect(Unit) {
        while (true) { nowMs = System.currentTimeMillis(); delay(1000) }
    }
    val hh = elapsed / 3600
    val mm = (elapsed % 3600) / 60
    val ss = elapsed % 60
    val timer = "%02d:%02d:%02d".format(hh, mm, ss)

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("In Progress", onBack = { nav.popBackStack() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.fillMaxWidth().background(GreenLight, RoundedCornerShape(12.dp)).padding(16.dp)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text("Service In Progress", color = GreenSuccess, fontWeight = FontWeight.SemiBold)
                    Text(timer, fontSize = 30.sp, fontWeight = FontWeight.Bold, color = TextDark)
                    Text("Time Elapsed", fontSize = 12.sp, color = TextGray)
                }
            }
            Card {
                SectionTitle("Job Details")
                Spacer(Modifier.height(4.dp))
                LabeledRow("Services", job.services.joinToString(", "))
                Divider(color = Divider)
                LabeledRow("Duration", "${job.durationHours} Hours")
                Divider(color = Divider)
                LabeledRow("Address", job.area)
            }
            Card {
                Text("Customer", fontSize = 12.sp, color = TextGray)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(job.initials)
                    Spacer(Modifier.width(12.dp))
                    Text(job.customerName, fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.weight(1f))
                    Icon(Icons.Filled.Phone, contentDescription = "Call", tint = Purple,
                        modifier = Modifier.size(22.dp).clickable { dialNumber(ctx, job.customerPhone) })
                    Spacer(Modifier.width(16.dp))
                    Icon(Icons.Filled.Chat, contentDescription = "Chat", tint = Purple,
                        modifier = Modifier.size(22.dp).clickable { toast(ctx, "Opening chat…") })
                }
            }
            SafetyCard()
            Text(
                "📷 Tap “End Service” to take a live proof-of-work photo. The customer gets it and is asked to rate the service.",
                fontSize = 12.sp, color = TextGray,
            )
        }
        Box(Modifier.background(Color.White).padding(16.dp)) {
            PrimaryButton("📷  End Service & Capture Photo") {
                captureAndEnd()
            }
        }
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
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.fillMaxWidth().background(GreenLight, RoundedCornerShape(12.dp)).padding(20.dp)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(48.dp))
                    Spacer(Modifier.height(8.dp))
                    Text("Job Completed!", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = GreenSuccess)
                    Text("Thank you for completing the job.", fontSize = 13.sp, color = TextGray)
                }
            }
            Card {
                SectionTitle("Job Summary")
                Spacer(Modifier.height(4.dp))
                LabeledRow("Services", job.services.joinToString(", "))
                Divider(color = Divider)
                LabeledRow("Booked Duration", "${job.durationHours} Hours")
                Divider(color = Divider)
                // Actual on-site time (start → end) and the moment the service ended.
                val durMs = (vm.serviceEndMs - vm.serviceStartMs).coerceAtLeast(0)
                val mins = durMs / 60000
                val secs = (durMs / 1000) % 60
                val taken = if (vm.serviceStartMs == 0L) "—" else if (mins > 0) "${mins}m ${secs}s" else "${secs}s"
                val endedAt = if (vm.serviceEndMs > 0L)
                    java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault()).format(java.util.Date(vm.serviceEndMs))
                else "—"
                LabeledRow("Time Taken (actual)", taken, valueColor = GreenSuccess)
                Divider(color = Divider)
                LabeledRow("Ended At", endedAt)
                Divider(color = Divider)
                LabeledRow("Earnings", "₹${job.earnings}", valueColor = GreenSuccess)
            }
            Card {
                Text("Customer Rating", fontWeight = FontWeight.SemiBold, color = TextDark)
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    repeat(5) { i ->
                        Icon(
                            Icons.Filled.CheckCircle,
                            contentDescription = null,
                            tint = if (i < 4) Gold else Color(0xFFE0E0E6),
                            modifier = Modifier.size(28.dp),
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Text("4.0", fontWeight = FontWeight.Bold, color = TextDark)
                }
                Spacer(Modifier.height(6.dp))
                Text("We value your feedback! Your rating helps us improve.", fontSize = 12.sp, color = TextGray)
            }
            SafetyCard()
        }
        Box(Modifier.background(Color.White).padding(16.dp)) {
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

// ---- shared flow widgets ----

@Composable
private fun StatusBanner(bg: Color, fg: Color, title: String, subtitle: String) {
    Box(Modifier.fillMaxWidth().background(bg, RoundedCornerShape(12.dp)).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = fg, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(10.dp))
            Column {
                Text(title, fontWeight = FontWeight.Bold, color = fg)
                Text(subtitle, fontSize = 12.sp, color = TextGray)
            }
        }
    }
}

@Composable
fun SafetyCard() {
    Box(Modifier.fillMaxWidth().background(PurpleLight, RoundedCornerShape(12.dp)).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Shield, contentDescription = null, tint = Purple, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(10.dp))
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
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFE8EAF0)),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.foundation.Canvas(Modifier.fillMaxSize().padding(20.dp)) {
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
                Spacer(Modifier.height(8.dp))
                reasons.forEach { r ->
                    Text(
                        r,
                        color = TextDark,
                        fontSize = 15.sp,
                        modifier = Modifier.fillMaxWidth().clickable { onConfirm(r) }.padding(vertical = 10.dp),
                    )
                    Divider(color = Divider)
                }
            }
        },
    )
}
