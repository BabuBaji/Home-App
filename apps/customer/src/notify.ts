import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'

// Local (device) notifications. These fire from the app itself, so they alert the customer even
// when they've navigated away from the Track screen — as long as the app is still running
// (foreground or backgrounded). A fully-killed app needs FCM push (requires a Firebase project).
let permAsked = false
export async function ensureNotifPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform() || permAsked) return
  permAsked = true
  try {
    const p = await LocalNotifications.checkPermissions()
    if (p.display !== 'granted') await LocalNotifications.requestPermissions()
  } catch { /* ignore */ }
}

// `extra` rides along on the notification and is handed back to the tap handler (see
// onNotificationTap) — we use it to carry a route so tapping a chat alert opens that chat. Optional
// and additive: existing callers pass nothing and their notifications behave exactly as before.
export async function fireLocalNotification(title: string, body: string, id = Math.floor(Date.now() % 100000), extra?: Record<string, unknown>): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return
    await LocalNotifications.schedule({
      notifications: [{ id, title, body, schedule: { at: new Date(Date.now() + 200) }, smallIcon: 'ic_stat_icon_config_sample', extra }],
    })
  } catch { /* ignore */ }
}

// Register a single handler for notification taps. The handler receives the `extra` payload that was
// attached when the notification was fired, so the app can deep-link (e.g. open a job's chat).
// Idempotent — safe to call on every mount; only the first registration attaches the listener.
let tapHandlerRegistered = false
export function onNotificationTap(handler: (extra: Record<string, unknown>) => void): void {
  if (!Capacitor.isNativePlatform() || tapHandlerRegistered) return
  tapHandlerRegistered = true
  try {
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra = (action?.notification?.extra || {}) as Record<string, unknown>
      try { handler(extra) } catch { /* ignore */ }
    })
  } catch { tapHandlerRegistered = false }
}

// One-shot guard so the "service completed" voice line plays at most once per booking, no matter
// which trigger reaches it first — the global watcher (App.tsx) or the ServiceCompleted screen.
// Returns true the first time it's asked for a booking, false thereafter. Persisted so a reopen of
// the completed screen doesn't announce again.
export function speakOnce(bookingId: number): boolean {
  try {
    const KEY = 'hh_spoken_done'
    const set = new Set<number>(JSON.parse(localStorage.getItem(KEY) || '[]'))
    if (set.has(bookingId)) return false
    set.add(bookingId)
    localStorage.setItem(KEY, JSON.stringify([...set]))
    return true
  } catch { return true }
}

// Speak a short line aloud. On the native app this uses the platform (Android/iOS) TTS engine via
// @capacitor-community/text-to-speech — crucially, that plays even when triggered from a background
// timer and needs NO user gesture, unlike the WebView's speechSynthesis which browser autoplay
// rules block for non-interactive audio. The browser build falls back to speechSynthesis for
// preview. Voice is always a layer ON TOP of a notification, so a silent no-op never loses info.
// Locales to try in order — en-IN is nicest for our users but its voice data is often not
// downloaded, in which case the engine rejects it; fall back to the widely-preinstalled ones.
const TTS_LANGS = ['en-IN', 'en-US', 'en-GB', 'en']
export function speak(text: string): void {
  if (Capacitor.isNativePlatform()) {
    void (async () => {
      try {
        const { TextToSpeech } = await import('@capacitor-community/text-to-speech')
        try { await TextToSpeech.stop() } catch { /* nothing playing */ }
        for (const lang of TTS_LANGS) {
          try {
            await TextToSpeech.speak({ text, lang, rate: 1.0, pitch: 1.0, volume: 1.0, category: 'playback' })
            return // spoke successfully
          } catch (e) {
            console.warn('[tts] lang failed:', lang, (e as Error)?.message || e)
          }
        }
        console.error('[tts] all locales failed — no usable voice on device')
      } catch (e) { console.error('[tts] plugin error:', e) }
    })()
    return
  }
  try {
    const synth = (window as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis
    if (!synth || typeof SpeechSynthesisUtterance !== 'function') return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-IN'; u.rate = 1; u.pitch = 1; u.volume = 1
    synth.cancel() // drop anything queued so this plays promptly
    synth.speak(u)
  } catch { /* ignore */ }
}
