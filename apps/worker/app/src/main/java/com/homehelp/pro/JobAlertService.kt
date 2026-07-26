package com.homehelp.pro

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.homehelp.pro.network.CurrentJobResponse
import com.homehelp.pro.network.JobMessage
import com.homehelp.pro.network.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Foreground service that keeps the worker "online" and polls the backend for matching jobs
 * even when the app is in the background. When a new matching job appears it fires a real
 * heads-up system notification (sound + vibrate). This is the no-Firebase push: it works as
 * long as the service is alive. True wake-from-killed delivery would need FCM.
 */
class JobAlertService : Service() {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var lastCount = 0

    // Persisted so a service restart doesn't re-announce messages the worker has already been shown.
    private val prefs by lazy { getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    private var lastMsgId: Int
        get() = prefs.getInt(KEY_LAST_MSG, 0)
        set(v) { prefs.edit().putInt(KEY_LAST_MSG, v).apply() }

    // Booking id of the last assignment announced, so one job is never announced twice.
    private var lastJobId: Int
        get() = prefs.getInt(KEY_LAST_JOB, 0)
        set(v) { prefs.edit().putInt(KEY_LAST_JOB, v).apply() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureChannels(this)
        val ongoing = ongoingNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(ONGOING_ID, ongoing, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(ONGOING_ID, ongoing)
        }
        scope.launch {
            while (isActive) {
                try { RetrofitClient.refreshBaseUrl() } catch (_: Exception) { }
                // Separate try blocks: with no active job the messages call 409s, and that must not
                // stop job alerts from being polled (they shared one try/catch before).
                try {
                    val r = RetrofitClient.api.jobsAvailable()
                    val count = (r["count"] as? Number)?.toInt() ?: if (r["available"] == true) 1 else 0
                    if (count > 0 && lastCount == 0) notifyNewJob(count)  // rising edge only
                    lastCount = count
                } catch (_: Exception) { /* keep polling */ }
                try { pollAssignment() } catch (_: Exception) { /* keep polling */ }
                try { pollMessages() } catch (_: Exception) { /* keep polling */ }
                delay(8000)
            }
        }
        return START_STICKY
    }

    /* Ping the worker when a job is put ON them.
     * The rising-edge check above watches /available, which only ever sees the UNASSIGNED pool —
     * with auto-assign on, a new booking is stamped worker_assigned inside the create request and
     * never lands there, so that alert cannot fire and a booking arrived in silence. This watches
     * "what is mine" instead. Fires once per booking id, persisted, so neither a service restart nor
     * the 8s tick re-announces the same job; and only for a job the worker has not started moving
     * on, so accepting or driving to it doesn't produce a second alert. */
    private suspend fun pollAssignment() {
        val cur = RetrofitClient.api.currentJob()
        val id = cur.bookingId ?: return          // nothing assigned — leave the watermark alone
        if (id == lastJobId) return               // already announced this one
        lastJobId = id
        // Only a freshly assigned job is news. Anything further along was already acted on, and a
        // restart mid-job must not fire an alert for work already underway.
        if (cur.status == "worker_assigned") notifyNewAssignment(cur)
    }

    /* Ping the worker when the customer writes to them. The chat screen already polls every 4s
     * while it is open, so this exists for the case that actually loses messages: the app in the
     * background, or open on any other screen. The high-water mark is persisted, so restarting the
     * service does not re-announce messages already shown — and everything new is coalesced into a
     * single notification rather than one per message. */
    private suspend fun pollMessages() {
        val msgs = RetrofitClient.api.jobMessages().messages
        if (msgs.isEmpty()) return
        val seen = lastMsgId
        val maxId = msgs.maxOf { it.id }
        val incoming = msgs.filter { !it.fromWorker && it.id > seen }
        // Suppressed while the worker is reading the thread — a heads-up alert for a message they
        // are already looking at is just noise. Still watermarked, so it won't fire later either.
        if (incoming.isNotEmpty() && !chatVisible) notifyMessages(incoming)
        if (maxId > seen) lastMsgId = maxId
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun openAppIntent(req: Int) = PendingIntent.getActivity(
        this, req, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun ongoingNotification(): Notification =
        NotificationCompat.Builder(this, ONGOING_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("You're online")
            .setContentText("Looking for nearby jobs…")
            .setOngoing(true)
            .setContentIntent(openAppIntent(0))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

    private fun notifyNewJob(count: Int) {
        val n = NotificationCompat.Builder(this, ALERT_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("New Job Request")
            .setContentText(if (count > 1) "$count jobs available for you — tap to view" else "A customer needs your service — tap to view")
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(1))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .build()
        try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(ALERT_ID, n) } catch (_: Exception) { }
    }

    private fun notifyNewAssignment(job: CurrentJobResponse) {
        val what = job.service.ifBlank { "A new job" }
        val text = if (job.ref.isNotBlank()) "$what · ${job.ref} — tap to view" else "$what — tap to view"
        val n = NotificationCompat.Builder(this, ALERT_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("New job assigned to you")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(3))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .build()
        try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(ASSIGN_ID, n) } catch (_: Exception) { }
    }

    private fun notifyMessages(incoming: List<JobMessage>) {
        val latest = incoming.last().body
        val more = incoming.size - 1
        val text = if (more > 0) "$latest\n(+$more earlier message${if (more > 1) "s" else ""})" else latest
        val n = NotificationCompat.Builder(this, MSG_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle(if (incoming.size > 1) "${incoming.size} new messages from your customer" else "New message from your customer")
            .setContentText(latest)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(2))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .build()
        try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(MSG_ID, n) } catch (_: Exception) { }
    }

    companion object {
        const val ONGOING_CHANNEL = "hh_pro_online"
        const val ALERT_CHANNEL = "hh_pro_jobs"
        const val MSG_CHANNEL = "hh_pro_msgs"
        const val ONGOING_ID = 4711
        const val ALERT_ID = 4712
        const val GEOFENCE_ID = 4713
        const val MSG_ID = 4714
        const val ASSIGN_ID = 4715
        private const val PREFS = "hh_pro_alerts"
        private const val KEY_LAST_MSG = "last_msg_id"
        private const val KEY_LAST_JOB = "last_job_id"

        /** Set by the chat screen while it is on top, so we don't alert about what's already on screen. */
        @Volatile
        var chatVisible = false

        /** Dismiss any message alert — called when the worker opens the chat. */
        fun clearMessageAlert(ctx: Context) {
            try { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(MSG_ID) } catch (_: Exception) { }
        }

        fun ensureChannels(ctx: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.createNotificationChannel(NotificationChannel(ONGOING_CHANNEL, "Online status", NotificationManager.IMPORTANCE_LOW))
                val alert = NotificationChannel(ALERT_CHANNEL, "Job requests", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Alerts when a new matching job is available"
                }
                nm.createNotificationChannel(alert)
                // Its own channel, so a worker can silence chat pings without losing job alerts.
                val msgs = NotificationChannel(MSG_CHANNEL, "Customer messages", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Alerts when the customer sends a message about the current job"
                }
                nm.createNotificationChannel(msgs)
            }
        }

        fun start(ctx: Context) {
            val i = Intent(ctx, JobAlertService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i) else ctx.startService(i)
        }

        fun stop(ctx: Context) {
            try { ctx.stopService(Intent(ctx, JobAlertService::class.java)) } catch (_: Exception) { }
        }

        /** Fire a heads-up system notification when the worker leaves their assigned apartment. */
        fun notifyGeofence(ctx: Context, text: String) {
            ensureChannels(ctx)
            val n = NotificationCompat.Builder(ctx, ALERT_CHANNEL)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("Left your assigned area")
                .setContentText(text)
                .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .build()
            try { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(GEOFENCE_ID, n) } catch (_: Exception) { }
        }
    }
}
