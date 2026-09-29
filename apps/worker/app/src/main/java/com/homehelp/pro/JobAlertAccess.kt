package com.homehelp.pro

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

/* A new job must open the full Accept / Reject screen even when the phone is locked or another app
 * is in front. Android 14 needs "full-screen notifications" granted per app, and many OEMs (OnePlus,
 * vivo, Xiaomi) also need "display over other apps" — without them the offer is only a tray
 * notification. This banner sits on Home until both are allowed, and links straight to each setting. */
private fun canFullScreen(ctx: Context): Boolean =
    Build.VERSION.SDK_INT < 34 || ctx.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()

private fun canOverlay(ctx: Context): Boolean = Settings.canDrawOverlays(ctx)

private fun openSetting(ctx: Context, action: String) {
    val pkg = Uri.parse("package:${ctx.packageName}")
    val tries = listOf(Intent(action, pkg), Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg))
    for (i in tries) {
        try { ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return } catch (_: Exception) {}
    }
}

@Composable
fun JobAlertAccessBanner() {
    val ctx = LocalContext.current
    var full by remember { mutableStateOf(canFullScreen(ctx)) }
    var overlay by remember { mutableStateOf(canOverlay(ctx)) }
    // Re-check when the expert comes back from Settings.
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) { full = canFullScreen(ctx); overlay = canOverlay(ctx) } }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    if (full && overlay) return

    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Amber.copy(alpha = 0.10f)).padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(CircleShape).background(Amber.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.NotificationsActive, contentDescription = null, tint = Amber, modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(tr("Turn on job alerts"), color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text(tr("So new jobs open on screen with Accept / Reject, even when the phone is locked."), color = TextGray, fontSize = 12.sp)
            }
        }
        if (!full) AccessStep(tr("Allow full-screen notifications")) {
            openSetting(ctx, if (Build.VERSION.SDK_INT >= 34) Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT else Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        }
        if (!overlay) AccessStep(tr("Allow display over other apps")) { openSetting(ctx, Settings.ACTION_MANAGE_OVERLAY_PERMISSION) }
    }
}

@Composable
private fun AccessStep(label: String, onClick: () -> Unit) {
    Row(
        Modifier.padding(top = 10.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(androidx.compose.ui.graphics.Color.White)
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Text(tr("Allow"), color = Purple, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}
