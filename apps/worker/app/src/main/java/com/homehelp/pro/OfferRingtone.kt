package com.homehelp.pro

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * The sound a job offer makes.
 *
 * A single notification "ding" is easy to miss, and an offer that expires unheard in two minutes
 * costs the expert the job and the customer the wait. So the notification chime REPEATS until the
 * offer is answered one way or the other.
 *
 * Deliberately separate from the notification's own sound: the notification channel fires once when
 * the offer lands, while this keeps going for as long as the offer screen is up.
 */
object OfferRingtone {
    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null

    /** Silence between chimes. Long enough to read as separate alerts, short enough to nag. */
    private const val GAP_MS = 2200L
    private val repeatHandler = android.os.Handler(android.os.Looper.getMainLooper())

    /** Start ringing + vibrating. Safe to call when already ringing — it won't stack. */
    @Synchronized
    fun start(ctx: Context) {
        if (player != null) return
        runCatching {
            /* The NOTIFICATION tone, repeated — not the phone's ringtone.
             *
             * This used to play TYPE_RINGTONE, which on most phones is a long musical ringtone and
             * read as an alarm going off rather than a job arriving. A notification chime is the
             * right sound for the event; repeating it is what keeps a 2-minute deadline from being
             * missed. Repeat is driven by an explicit gap (see the completion listener) instead of
             * isLooping, so the chime lands as a series of alerts rather than a continuous drone.
             */
            val uri = RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_NOTIFICATION)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            player = MediaPlayer().apply {
                setDataSource(ctx.applicationContext, uri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        // NOTIFICATION_EVENT, not NOTIFICATION_RINGTONE: this is an alert about an
                        // event, and it should follow the notification volume, not the ring volume.
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                isLooping = false
                setOnCompletionListener { mp ->
                    // Re-arm after a short gap for as long as the offer is unanswered. Guarded on
                    // `player` so a stop() between chimes ends it rather than restarting.
                    repeatHandler.postDelayed({
                        if (player != null) runCatching { mp.seekTo(0); mp.start() }
                    }, GAP_MS)
                }
                prepare()
                start()
            }
        }.onFailure { stop() }   // never leave a half-built player behind

        runCatching {
            vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            val pattern = longArrayOf(0, 250, 250, 250, 1500)   // two short taps, then a pause
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        }
    }

    /** Stop ringing. Must be called on accept, reject, expiry and screen teardown. */
    @Synchronized
    fun stop() {
        // Drop the pending re-arm first, or a queued chime fires after the offer is answered.
        repeatHandler.removeCallbacksAndMessages(null)
        runCatching { player?.setOnCompletionListener(null) }
        runCatching { player?.stop() }
        runCatching { player?.release() }
        player = null
        runCatching { vibrator?.cancel() }
        vibrator = null
    }
}
