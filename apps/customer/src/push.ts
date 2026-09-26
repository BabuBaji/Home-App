import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { registerPushToken } from './api'

/* FCM push for the installed app: works with the app closed (booking status, expert chat, extra
   task approvals, offers). Needs google-services.json in android/app. Without it register() does NOT
   fail quietly — the native plugin throws on its own thread and kills the app — so build-apk.ps1
   sets VITE_PUSH=0 and we never touch the plugin; the app keeps its in-app / local notifications. */
let started = false
export async function startPush(onOpen: (route: string) => void): Promise<void> {
  if (!Capacitor.isNativePlatform() || started || import.meta.env.VITE_PUSH === '0') return
  started = true
  try {
    let p = await PushNotifications.checkPermissions()
    if (p.receive === 'prompt' || p.receive === 'prompt-with-rationale') p = await PushNotifications.requestPermissions()
    if (p.receive !== 'granted') return
    await PushNotifications.addListener('registration', (t) => { registerPushToken(t.value, Capacitor.getPlatform()).catch(() => {}) })
    await PushNotifications.addListener('registrationError', () => { /* no Firebase config — stay on local notifications */ })
    // Tapping a push opens what it is about.
    await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const d = (a.notification?.data || {}) as Record<string, string>
      const id = d.bookingId
      if (d.type === 'chat' && id) onOpen(`/job/${id}/chat`)
      // /job/:id is the one booking screen; it sends a finished or cancelled booking on to its details.
      else if (id) onOpen(`/job/${id}`)
      else onOpen('/notifications')
    })
    await PushNotifications.createChannel?.({ id: 'updates', name: 'Booking updates', importance: 4 }).catch(() => {})
    await PushNotifications.register()
  } catch { /* plugin unavailable — ignore */ }
}
