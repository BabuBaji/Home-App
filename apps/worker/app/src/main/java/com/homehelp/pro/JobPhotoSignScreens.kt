package com.homehelp.pro

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Shield
import androidx.compose.foundation.shape.CircleShape
import coil.compose.SubcomposeAsyncImage
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Draw
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.navigation.NavHostController
import java.io.ByteArrayOutputStream

// ─────────────────────────────────────────────────────────────────────────────────────────────
// JOB FLOW steps 5, 7 and 8 — Before Photos · After Photos · Customer Sign & Rating.
//
// Everything here is server-held (dispatch `job_state`): the required shots are seeded from the
// booked service, each photo is keyed by its slot so a retake replaces it, and notes/signature/
// rating survive the app being killed mid-job.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * How many of the service's photo slots the worker MUST fill before moving on. The rest stay on
 * screen and are still worth taking — they just don't block the job when an angle isn't gettable.
 */
private const val MIN_PHOTOS = 1

/** Clean white top navbar for the step-by-step flow — back + centred indigo title (matches the mockup). */
@Composable
private fun FlowTopBar(onBack: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Color.White)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Space.s).padding(top = 8.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(38.dp).clip(RoundedCornerShape(Radius.pill)).clickable { onBack() }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = PurpleDark, modifier = Modifier.size(22.dp))
            }
            Text(
                "JOB FLOW (STEP BY STEP)", color = PurpleDark, fontSize = 15.sp, fontWeight = FontWeight.Bold,
                letterSpacing = 0.5.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(38.dp))
        }
        HairlineDivider()
    }
}

/** Hero: brand icon chip, title + subtitle, and the design's tip box. */
@Composable
private fun FlowHero(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, tip: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Box(
            Modifier.size(38.dp).clip(RoundedCornerShape(Radius.pill)).background(Purple),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp)) }
        Spacer(Modifier.width(Space.m))
        Column(Modifier.weight(1f)) {
            Text(title, color = TextDark, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = TextGray, fontSize = 12.sp, lineHeight = 15.sp)
        }
        Spacer(Modifier.width(Space.s))
        Column(
            Modifier.width(120.dp).clip(RoundedCornerShape(10.dp)).background(Primary50).padding(8.dp),
        ) {
            Text("💡 Tip", color = Purple, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(2.dp))
            Text(tip, color = TextDark, fontSize = 9.sp, lineHeight = 11.sp)
        }
    }
}

/** Round customer photo with an initials fallback — the worker sees who they're serving. */
@Composable
private fun FlowCustomerPhoto(url: String?, initials: String, size: Int = 44) {
    val fs = (size * 0.36f).sp
    Box(
        Modifier.size(size.dp).clip(CircleShape).background(Color.White).border(1.5.dp, Purple.copy(alpha = 0.35f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
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

/** Customer + service strip shown on every step of the flow — with the customer's real photo. */
@Composable
private fun FlowCustomerStrip(job: Job) {
    val ctx = LocalContext.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Primary50).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                FlowCustomerPhoto(job.customerAvatar, job.initials, size = 44)
                Spacer(Modifier.width(Space.s))
                Column(Modifier.weight(1f)) {
                    Text(job.customerName, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                    Box(Modifier.clip(RoundedCornerShape(Radius.pill)).background(PurpleLight).padding(horizontal = 7.dp, vertical = 2.dp)) {
                        Text(job.customerType.orEmpty().ifBlank { "Residential" }, color = Purple, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Spacer(Modifier.height(7.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable { dialCustomerPhone(ctx, job.customerPhone) },
            ) {
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
        Column(Modifier.width(108.dp)) {
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
                        val cm = ctx.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                        cm.setPrimaryClip(android.content.ClipData.newPlainText("Job ID", job.id)); toast(ctx, "Job ID copied")
                    },
                )
            }
        }
    }
}

/** Decodes a `data:image/...;base64,...` URL for display. Returns null on anything unexpected. */
fun dataUrlToBitmap(dataUrl: String?): Bitmap? {
    if (dataUrl.isNullOrBlank()) return null
    val comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    return runCatching {
        val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }.getOrNull()
}

/** JPEG-encodes a bitmap as a data URL — the wire format every photo endpoint expects. */
fun bitmapToDataUrlJpeg(bmp: Bitmap, quality: Int = 70): String {
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)
    return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
}

/** One named shot: header, live thumbnail once captured, and Retake / Tap to Capture. */
@Composable
private fun PhotoSlotCard(
    modifier: Modifier,
    slot: String,
    photo: com.homehelp.pro.network.JobPhoto?,
    onCapture: () -> Unit,
    onRetake: () -> Unit,
) {
    val bmp = remember(photo?.url) { dataUrlToBitmap(photo?.url) }
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White)
            .border(1.dp, if (photo != null) Divider else Purple.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
            .padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(slot, color = TextDark, fontSize = 10.5.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2, lineHeight = 12.sp)
        Spacer(Modifier.height(4.dp))
        if (photo != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(11.dp))
                Spacer(Modifier.width(3.dp))
                Text("Captured", color = GreenSuccess, fontSize = 9.5.sp, fontWeight = FontWeight.Medium)
            }
            Spacer(Modifier.height(5.dp))
            if (bmp != null) {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = slot,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(8.dp)),
                )
            } else {
                Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(8.dp)).background(Primary50))
            }
            Spacer(Modifier.height(5.dp))
            Row(
                Modifier.clickable(onClick = onRetake),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null, tint = Purple, modifier = Modifier.size(12.dp))
                Spacer(Modifier.width(3.dp))
                Text("Retake", color = Purple, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        } else {
            Box(
                Modifier.fillMaxWidth().aspectRatio(1f).clickable(onClick = onCapture),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.size(34.dp).clip(RoundedCornerShape(Radius.pill)).background(Primary50),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.CameraAlt, contentDescription = null, tint = Purple, modifier = Modifier.size(18.dp)) }
                    Spacer(Modifier.height(5.dp))
                    Text("Tap to Capture", color = Purple, fontSize = 9.5.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

/** White bordered section card used to separate the photo-flow blocks. */
@Composable
private fun PhotoCard(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Surface(
        shape = RoundedCornerShape(Radius.card), color = Color.White, shadowElevation = 2.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, Divider), modifier = Modifier.fillMaxWidth(),
    ) { Column(Modifier.padding(14.dp), content = content) }
}

/** The "Ensure the following" guidance strip the mockups show under the photo grid. */
@Composable
private fun EnsureStrip() {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Primary50).padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("🛡", fontSize = 14.sp)
        Spacer(Modifier.width(Space.s))
        Column(Modifier.weight(1f)) {
            Text("Ensure the following", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("Good lighting • Clear visibility • All areas in frame • No blur", color = TextGray, fontSize = 10.sp)
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun NotesField(value: String, placeholder: String, onChange: (String) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Row {
            Text("Add Notes ", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Text("(Optional)", color = TextGray, fontSize = 13.sp)
        }
        Spacer(Modifier.height(5.dp))
        OutlinedTextField(
            value = value,
            onValueChange = { if (it.length <= 200) onChange(it) },
            modifier = Modifier.fillMaxWidth().height(72.dp),
            placeholder = { Text(placeholder, fontSize = 11.5.sp, color = TextMuted) },
            textStyle = androidx.compose.ui.text.TextStyle(fontSize = 12.sp, color = TextDark),
            shape = RoundedCornerShape(10.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedBorderColor = Purple,
                unfocusedBorderColor = Divider,
                cursorColor = Purple,
            ),
        )
        Text("${value.length}/200", color = TextMuted, fontSize = 10.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.End)
    }
}

/**
 * Shared body for steps 5 and 7 — the two photo screens differ only in phase, copy and CTA.
 */
@Composable
private fun PhotoStepScreen(
    vm: AppViewModel,
    nav: NavHostController,
    phase: String,
    title: String,
    subtitle: String,
    tip: String,
    notesPlaceholder: String,
    footerNote: String,
    ctaLabel: String,
    onContinue: () -> Unit,
) {
    val ctx = LocalContext.current
    val job = vm.activeJob
    var pendingSlot by remember { mutableStateOf<String?>(null) }
    var notes by remember(phase) { mutableStateOf(if (phase == "after") vm.afterNotes else vm.beforeNotes) }

    LaunchedEffect(Unit) { vm.loadJobState() }
    // Adopt server-side notes once state lands, unless the worker has started typing.
    LaunchedEffect(vm.beforeNotes, vm.afterNotes) {
        val server = if (phase == "after") vm.afterNotes else vm.beforeNotes
        if (notes.isBlank() && server.isNotBlank()) notes = server
    }

    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp ->
        val slot = pendingSlot
        if (bmp != null && slot != null) {
            vm.addJobPhoto(phase, slot, bitmapToDataUrlJpeg(bmp))
            toast(ctx, "$slot captured")
        }
        pendingSlot = null
    }
    val perm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) camera.launch(null) else { toast(ctx, "Camera permission is needed to capture photos"); pendingSlot = null }
    }
    fun shoot(slot: String) {
        pendingSlot = slot
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) camera.launch(null)
        else perm.launch(Manifest.permission.CAMERA)
    }

    Column(Modifier.fillMaxSize().background(Color.White)) {
        FlowTopBar { nav.popBackStack() }
        if (job == null) {
            EmptyState("📷", "No active job", "Photos attach to a job you're working on.")
            return@Column
        }
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.m).padding(top = Space.m, bottom = Space.m),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {

            // ── Hero (own card).
            PhotoCard { FlowHero(Icons.Filled.CameraAlt, title, subtitle, tip) }

            // ── Customer (own strip, with photo).
            FlowCustomerStrip(job)

            // ── Photos required + slots (on white).
            val done = vm.photosDone(phase)
            val total = vm.photoSlots.size
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Photos Required ", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Text(
                        "($done/$total)",
                        color = if (total > 0 && done == total) GreenSuccess else Purple,
                        fontSize = 15.sp, fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.weight(1f))
                    Row(
                        Modifier.clip(RoundedCornerShape(Radius.pill)).clickable {
                            toast(ctx, "Clear before/after photos protect you — they prove the area's condition and help resolve any dispute.")
                        }.padding(horizontal = 4.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Why photos?", color = Purple, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.width(4.dp))
                        Icon(Icons.AutoMirrored.Filled.HelpOutline, contentDescription = null, tint = Purple, modifier = Modifier.size(15.dp))
                    }
                }
                Spacer(Modifier.height(Space.s))
                if (vm.photoSlots.isEmpty()) {
                    Text("Loading required shots…", color = TextMuted, fontSize = 12.sp)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                    vm.photoSlots.forEach { slot ->
                        PhotoSlotCard(
                            modifier = Modifier.weight(1f),
                            slot = slot,
                            photo = vm.photoFor(phase, slot),
                            onCapture = { shoot(slot) },
                            onRetake = { shoot(slot) },
                        )
                    }
                }
            }

            // ── Ensure guidance.
            EnsureStrip()

            // ── Notes.
            NotesField(notes, notesPlaceholder) { notes = it }

            // ── Add additional photo (After Photos only).
            if (phase == "after") {
                val extra = vm.photoFor("after", "Additional")
                Text("Add Additional Photo (Optional)", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.5.dp, Purple.copy(alpha = 0.4f), RoundedCornerShape(12.dp)).padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(40.dp).clip(CircleShape).background(Primary50), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.CameraAlt, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text(if (extra != null) "Photo added ✓" else "Add Photo", color = Purple, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        Text("Capture any additional photo (optional)", color = TextGray, fontSize = 11.5.sp)
                    }
                    Box(
                        Modifier.clip(RoundedCornerShape(Radius.button)).background(Color.White).border(1.5.dp, Purple, RoundedCornerShape(Radius.button))
                            .clickable { shoot("Additional") }.padding(horizontal = 12.dp, vertical = 9.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.CameraAlt, contentDescription = null, tint = Purple, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(5.dp))
                            Text("Take Photo", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // ── Reminder (own card).
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Primary50).padding(12.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Text("🔔", fontSize = 17.sp)
                Spacer(Modifier.width(Space.m))
                Column {
                    Text("Reminder", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text(footerNote, color = TextGray, fontSize = 11.5.sp, lineHeight = 15.sp)
                }
            }
        }
        Surface(color = Color.White, shadowElevation = 12.dp) {
            Column(Modifier.padding(Space.l)) {
                // One shot is the floor; the remaining slots are encouraged but optional, so a
                // worker is never blocked from proceeding by an angle they can't get.
                val canContinue = vm.photosDone(phase) >= MIN_PHOTOS
                if (phase == "after") {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                        OutlineButton("← BACK", modifier = Modifier.weight(1f)) { nav.popBackStack() }
                        Box(Modifier.weight(1.7f)) {
                            PrimaryButton(ctaLabel, enabled = canContinue) { vm.saveJobNotes(phase, notes); onContinue() }
                        }
                    }
                } else {
                    PrimaryButton(ctaLabel, enabled = canContinue) { vm.saveJobNotes(phase, notes); onContinue() }
                }
                if (!canContinue) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Capture at least 1 photo to continue.",
                        color = TextMuted, fontSize = 11.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

/** STEP 5 — Before Photos (module 16). */
@Composable
fun BeforePhotosScreen(vm: AppViewModel, nav: NavHostController) = PhotoStepScreen(
    vm = vm, nav = nav, phase = "before",
    title = "Before Photos",
    subtitle = "Take clear photos of the area/items before starting the service.",
    tip = "Good photos help avoid disputes and improve customer satisfaction.",
    notesPlaceholder = "Any special instructions or observations before starting…",
    footerNote = "Please capture all required photos before starting the service. You can't edit photos after starting.",
    ctaLabel = "Continue to Work in Progress",
    onContinue = { nav.navigate(Routes.IN_PROGRESS) { popUpTo(Routes.BEFORE_PHOTOS) { inclusive = true } } },
)

/** STEP 7 — After Photos (module 17). */
@Composable
fun AfterPhotosScreen(vm: AppViewModel, nav: NavHostController) = PhotoStepScreen(
    vm = vm, nav = nav, phase = "after",
    title = "After Photos",
    subtitle = "Great! Work in progress completed. Please capture after photos of the area.",
    tip = "Clear after photos help build trust and improve customer satisfaction.",
    notesPlaceholder = "Any special instructions or observations after completing the service…",
    footerNote = "Please ensure all after photos are captured before proceeding.",
    ctaLabel = "Continue to Customer Rating",
    onContinue = { nav.navigate(Routes.CUSTOMER_SIGN) },
)

/**
 * STEP 8 — Customer Sign & Rating. The customer signs on the worker's screen; the strokes are
 * rasterised to a JPEG data URL and stored against the job, alongside their star rating.
 */
@Composable
fun CustomerSignScreen(vm: AppViewModel, nav: NavHostController) {
    val job = vm.activeJob
    var rating by remember { mutableIntStateOf(0) }
    var notes by remember { mutableStateOf("") }

    LaunchedEffect(Unit) { vm.loadJobState() }

    Column(Modifier.fillMaxSize().background(Color.White)) {
        FlowTopBar { nav.popBackStack() }
        if (job == null) {
            EmptyState("⭐", "No active job", "Rating attaches to a job you're working on.")
            return@Column
        }
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.m).padding(top = Space.m, bottom = Space.m),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            // ── Hero (own card).
            PhotoCard {
                FlowHero(
                    Icons.Filled.Star, "Customer Rating",
                    "Please collect the customer's rating to complete the service.",
                    "A quick rating from the customer helps us improve our service quality.",
                )
            }
            // ── Customer (own strip, with photo).
            FlowCustomerStrip(job)
            // ── Rating form.
            PhotoCard {
                // Service-complete banner.
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(GreenLight).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(30.dp).clip(CircleShape).background(GreenSuccess), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                    }
                    Spacer(Modifier.width(Space.s))
                    Column(Modifier.weight(1f)) {
                        Text("Service Completed!", color = GreenSuccess, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text("Please confirm with the customer and collect their rating.", color = TextGray, fontSize = 10.5.sp)
                    }
                    Box(Modifier.clip(RoundedCornerShape(Radius.pill)).border(1.dp, GreenSuccess, RoundedCornerShape(Radius.pill)).padding(horizontal = 8.dp, vertical = 4.dp)) {
                        Text("All tasks done", color = GreenSuccess, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Spacer(Modifier.height(Space.l))

                // ── Rating — the priority, centered and prominent.
                Text("How would you rate this service?", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                Spacer(Modifier.height(Space.m))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                    (1..5).forEach { i ->
                        Icon(
                            Icons.Filled.Star, contentDescription = "$i star",
                            tint = if (i <= rating) Purple else Color(0xFFE3E3EC),
                            modifier = Modifier.size(44.dp).padding(horizontal = 4.dp).clickable { rating = i },
                        )
                    }
                }
                if (rating > 0) {
                    Spacer(Modifier.height(Space.s))
                    Text(ratingWord(rating), color = GreenSuccess, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center, lineHeight = 17.sp)
                }
                Spacer(Modifier.height(Space.l))
                Text("Add Notes ", color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(5.dp))
                NotesField(notes, "Any additional comments from the customer…") { notes = it }
            }
            // ── Thank you.
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Primary50).padding(12.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Filled.Shield, contentDescription = null, tint = Purple, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(Space.m))
                Column {
                    Text("Thank You!", color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text("Your professionalism and customer satisfaction are highly appreciated.", color = TextGray, fontSize = 11.5.sp, lineHeight = 15.sp)
                }
            }
        }
        Surface(color = Color.White, shadowElevation = 12.dp) {
            Row(Modifier.padding(Space.l), horizontalArrangement = Arrangement.spacedBy(Space.m)) {
                OutlineButton("← BACK", modifier = Modifier.weight(1f)) { nav.popBackStack() }
                Box(Modifier.weight(1.6f)) {
                    PrimaryButton("MARK JOB AS COMPLETED", enabled = rating > 0) {
                        vm.saveSignature("", rating, notes)
                        vm.endService()
                        nav.navigate(Routes.JOB_COMPLETED) { popUpTo(Routes.IN_PROGRESS) { inclusive = true } }
                    }
                }
            }
        }
    }
}

private fun ratingWord(stars: Int) = when (stars) {
    5 -> "Excellent! Thank you for your wonderful feedback!"
    4 -> "Great! Thanks for the feedback."
    3 -> "Thanks — we'll keep improving."
    2 -> "Sorry to hear that. We'll do better."
    else -> "We're sorry. Your feedback helps us improve."
}

/** Draws the captured strokes onto a white bitmap and encodes them for the server. */
private fun rasteriseSignature(strokes: List<List<Offset>>, w: Int, h: Int): String? {
    if (strokes.isEmpty() || w <= 0 || h <= 0) return null
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(bmp)
    canvas.drawColor(android.graphics.Color.WHITE)
    val paint = android.graphics.Paint().apply {
        color = android.graphics.Color.BLACK
        strokeWidth = 6f
        style = android.graphics.Paint.Style.STROKE
        strokeCap = android.graphics.Paint.Cap.ROUND
        strokeJoin = android.graphics.Paint.Join.ROUND
        isAntiAlias = true
    }
    strokes.forEach { pts ->
        if (pts.size > 1) {
            val path = android.graphics.Path().apply {
                moveTo(pts[0].x, pts[0].y)
                for (i in 1 until pts.size) lineTo(pts[i].x, pts[i].y)
            }
            canvas.drawPath(path, paint)
        }
    }
    return bitmapToDataUrlJpeg(bmp, 80)
}
