package com.homehelp.pro

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.homehelp.pro.network.PushTokenBody
import com.homehelp.pro.network.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Server push (FCM). Job offers arrive as high-priority messages that wake the phone even when the
 * app is closed and the foreground poller has been killed. Needs app/google-services.json; without
 * it Firebase isn't initialised and everything here is a no-op (the poller still works).
 */
object PushRegistrar {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Send this device's token to the backend. Call once the worker is signed in. */
    fun register(ctx: Context) {
        if (FirebaseApp.getApps(ctx).isEmpty()) return
        runCatching { FirebaseMessaging.getInstance().token.addOnSuccessListener { send(it) } }
    }

    internal fun send(token: String) {
        if (Session.token.isNullOrBlank()) return
        scope.launch { runCatching { RetrofitClient.api.registerPush(PushTokenBody(token)) } }
    }
}

class WorkerMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        Session.init(applicationContext)
        PushRegistrar.send(token)
    }

    override fun onMessageReceived(msg: RemoteMessage) {
        val data = msg.data
        val title = msg.notification?.title ?: data["title"] ?: "HomeHelp Pro"
        val body = msg.notification?.body ?: data["body"] ?: ""
        val offer = data["type"] == "job_offer"
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = if (offer) "push_jobs" else "push_updates"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(channel) == null) {
            nm.createNotificationChannel(
                NotificationChannel(channel, if (offer) "Job requests" else "Updates",
                    if (offer) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
        val open = PendingIntent.getActivity(
            this, if (offer) 7001 else 7002,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
                .apply { if (data["type"] == "chat") putExtra("nav_route", Routes.JOB_CHAT) },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(this, channel)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(open)
            .setPriority(if (offer) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_DEFAULT)
            .apply {
                // An offer only lasts a couple of minutes: ring like a call and take over the screen.
                if (offer) setCategory(NotificationCompat.CATEGORY_CALL).setFullScreenIntent(open, true).setDefaults(NotificationCompat.DEFAULT_ALL)
            }
            .build()
        runCatching { nm.notify(if (offer) 7001 else (System.currentTimeMillis() % 100000).toInt(), n) }
    }
}
