package com.homehelp.pro

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.LocationManager
import android.media.AudioManager
import android.media.VolumeProvider
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.homehelp.pro.network.RetrofitClient
import com.homehelp.pro.network.SosBody
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlin.math.sqrt

/**
 * Lone-worker safety while the expert is inside a customer's home (job arrived / in progress).
 * Runs inside [JobAlertService], so it keeps working with the app in the background.
 *
 *  1. Distress detection (motion). A fall (free-fall followed by a hard impact) or a sustained
 *     violent shake asks "Are you safe?" with a full-screen alert. No answer in 30 seconds sends an
 *     SOS with the last known location. "I'm safe" cancels it; "Send help" sends it at once.
 *  2. Volume-button SOS. Pressing either volume button 5 times within 4 seconds sends an SOS
 *     straight away — no need to unlock the phone or open the app. The presses still change the
 *     volume as usual, so the buttons keep working normally.
 *
 * Nothing is recorded: only accelerometer readings are looked at, on the phone, and discarded.
 */
object SafetyMonitor : SensorEventListener {
    private const val CHANNEL = "hh_pro_safety"
    private const val NOTIF_ID = 4720
    private const val ANSWER_WINDOW_MS = 30_000L
    const val ACTION_SAFE = "com.homehelp.pro.SAFETY_SAFE"
    const val ACTION_HELP = "com.homehelp.pro.SAFETY_HELP"

    private val main = Handler(Looper.getMainLooper())
    private val io = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var app: Context? = null
    private var sensors: SensorManager? = null
    private var session: MediaSession? = null
    @Volatile var active = false
        private set

    // ── motion state ──
    private var freeFallAt = 0L
    private var impactAt = 0L
    private val shakeTimes = ArrayDeque<Long>()
    private var lastTrigger = 0L
    private var pending: Runnable? = null

    // ── volume presses ──
    private val presses = ArrayDeque<Long>()
    private var lastVolumeSos = 0L

    /** Start or stop monitoring; called by the service on each job-status poll. Idempotent. */
    fun setOnJob(ctx: Context, onJob: Boolean) = main.post { if (onJob) start(ctx) else stop() }

    private fun start(ctx: Context) {
        if (active) return
        val c = ctx.applicationContext
        app = c
        active = true
        ensureChannel(c)
        sensors = (c.getSystemService(Context.SENSOR_SERVICE) as SensorManager).also { sm ->
            sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let { sm.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        }
        startVolumeSos(c)
    }

    fun stop() {
        if (!active) return
        active = false
        sensors?.unregisterListener(this); sensors = null
        session?.run { isActive = false; release() }; session = null
        pending?.let { main.removeCallbacks(it) }; pending = null
        presses.clear(); shakeTimes.clear()
    }

    /* ---------------- distress detection ---------------- */
    override fun onSensorChanged(e: SensorEvent) {
        val g = sqrt(e.values[0] * e.values[0] + e.values[1] * e.values[1] + e.values[2] * e.values[2])
        val now = System.currentTimeMillis()
        // Fall: near-weightless for a moment (< 3 m/s²), then a hard impact (> 25 m/s²) within 1 s.
        if (g < 3f) freeFallAt = now
        if (g > 25f && now - freeFallAt < 1000) impactAt = now
        // After the impact, the phone lying still for 3 s (≈ 1 g) is what separates a fall from a
        // phone that was simply dropped and picked up again.
        if (impactAt > 0 && now - impactAt > 3000) {
            val still = kotlin.math.abs(g - SensorManager.GRAVITY_EARTH) < 1.5f
            if (still) trigger("A possible fall was detected")
            impactAt = 0
        }
        // Struggle: violent shaking — 20+ readings above 22 m/s² inside 3 seconds.
        if (g > 22f) shakeTimes.addLast(now)
        while (shakeTimes.isNotEmpty() && now - shakeTimes.first() > 3000) shakeTimes.removeFirst()
        if (shakeTimes.size >= 20) { shakeTimes.clear(); trigger("Violent shaking was detected") }
    }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun trigger(reason: String) {
        val c = app ?: return
        val now = System.currentTimeMillis()
        if (pending != null || now - lastTrigger < 60_000) return // one question at a time, max 1/min
        lastTrigger = now
        vibrate(c, longArrayOf(0, 400, 200, 400, 200, 400))
        showAsk(c, reason)
        val r = Runnable { pending = null; sendSos(c, "No reply to an automatic safety check ($reason)") }
        pending = r
        main.postDelayed(r, ANSWER_WINDOW_MS)
    }

    /** Called from the notification actions / the in-app dialog. */
    fun answer(ctx: Context, safe: Boolean) = main.post {
        pending?.let { main.removeCallbacks(it) }; pending = null
        (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIF_ID)
        if (!safe) sendSos(ctx.applicationContext, "Worker asked for help after an automatic safety check")
    }

    /* ---------------- volume-button SOS ---------------- */
    private fun startVolumeSos(c: Context) {
        val audio = c.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val provider = object : VolumeProvider(VOLUME_CONTROL_RELATIVE, max, audio.getStreamVolume(AudioManager.STREAM_MUSIC)) {
            override fun onAdjustVolume(direction: Int) {
                if (direction == 0) return
                // Keep the buttons doing their normal job…
                audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, 0)
                currentVolume = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
                // …and count the presses.
                val now = System.currentTimeMillis()
                presses.addLast(now)
                while (presses.isNotEmpty() && now - presses.first() > 4000) presses.removeFirst()
                if (presses.size >= 5 && now - lastVolumeSos > 60_000) {
                    presses.clear(); lastVolumeSos = now
                    vibrate(c, longArrayOf(0, 800))
                    sendSos(c, "SOS from the volume buttons")
                }
            }
        }
        session = MediaSession(c, "HomeHelpSafety").apply {
            setPlaybackToRemote(provider)
            // A playing state keeps the session eligible for volume keys with the screen locked.
            setPlaybackState(PlaybackState.Builder().setState(PlaybackState.STATE_PLAYING, 0, 0f).build())
            isActive = true
        }
    }

    /* ---------------- helpers ---------------- */
    private fun sendSos(c: Context, reason: String) {
        val (lat, lng) = lastLocation(c)
        io.launch {
            val ok = runCatching { RetrofitClient.api.sos(SosBody(lat, lng, reason)) }.isSuccess
            main.post { notifySent(c, ok) }
        }
    }

    @SuppressLint("MissingPermission")
    private fun lastLocation(c: Context): Pair<Double?, Double?> {
        if (ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null to null
        val lm = c.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val loc = lm.getProviders(true).mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }.maxByOrNull { it.time }
        return loc?.latitude to loc?.longitude
    }

    private fun ensureChannel(c: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL) != null) return
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Safety alerts", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Are-you-safe checks and SOS confirmations"
            enableVibration(true)
        })
    }

    private fun actionIntent(c: Context, action: String, req: Int) = PendingIntent.getBroadcast(
        c, req, Intent(c, SafetyActionReceiver::class.java).setAction(action),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun showAsk(c: Context, reason: String) {
        val open = PendingIntent.getActivity(c, 71, Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(tr("Are you safe?"))
            .setContentText(tr(reason) + ". " + tr("We'll alert the safety team in 30 seconds unless you answer."))
            .setStyle(NotificationCompat.BigTextStyle().bigText(tr(reason) + ". " + tr("We'll alert the safety team in 30 seconds unless you answer.")))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(open, true)
            .setTimeoutAfter(ANSWER_WINDOW_MS)
            .addAction(0, tr("I'm safe"), actionIntent(c, ACTION_SAFE, 72))
            .addAction(0, tr("Send help"), actionIntent(c, ACTION_HELP, 73))
            .build()
        runCatching { (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_ID, n) }
    }

    private fun notifySent(c: Context, ok: Boolean) {
        val n = NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(if (ok) tr("SOS sent") else tr("SOS could not be sent"))
            .setContentText(if (ok) tr("Our safety team has your location and is contacting you.") else tr("No internet. Call emergency services on 112."))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .build()
        runCatching { (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_ID, n) }
    }

    private fun vibrate(c: Context, pattern: LongArray) {
        val v = c.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) v.vibrate(VibrationEffect.createWaveform(pattern, -1))
        else @Suppress("DEPRECATION") v.vibrate(pattern, -1)
    }
}

/** "I'm safe" / "Send help" buttons on the safety notification. */
class SafetyActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            SafetyMonitor.ACTION_SAFE -> SafetyMonitor.answer(context, safe = true)
            SafetyMonitor.ACTION_HELP -> SafetyMonitor.answer(context, safe = false)
        }
    }
}
