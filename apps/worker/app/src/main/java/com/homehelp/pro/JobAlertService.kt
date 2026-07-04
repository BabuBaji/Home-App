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
                try {
                    RetrofitClient.refreshBaseUrl()
                    val r = RetrofitClient.api.jobsAvailable()
                    val count = (r["count"] as? Number)?.toInt() ?: if (r["available"] == true) 1 else 0
                    if (count > 0 && lastCount == 0) notifyNewJob(count)  // rising edge only
                    lastCount = count
                } catch (_: Exception) { /* keep polling */ }
                delay(8000)
            }
        }
        return START_STICKY
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

    companion object {
        const val ONGOING_CHANNEL = "hh_pro_online"
        const val ALERT_CHANNEL = "hh_pro_jobs"
        const val ONGOING_ID = 4711
        const val ALERT_ID = 4712

        fun ensureChannels(ctx: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.createNotificationChannel(NotificationChannel(ONGOING_CHANNEL, "Online status", NotificationManager.IMPORTANCE_LOW))
                val alert = NotificationChannel(ALERT_CHANNEL, "Job requests", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Alerts when a new matching job is available"
                }
                nm.createNotificationChannel(alert)
            }
        }

        fun start(ctx: Context) {
            val i = Intent(ctx, JobAlertService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i) else ctx.startService(i)
        }

        fun stop(ctx: Context) {
            try { ctx.stopService(Intent(ctx, JobAlertService::class.java)) } catch (_: Exception) { }
        }
    }
}
