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

export async function fireLocalNotification(title: string, body: string, id = Math.floor(Date.now() % 100000)): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return
    await LocalNotifications.schedule({
      notifications: [{ id, title, body, schedule: { at: new Date(Date.now() + 200) }, smallIcon: 'ic_stat_icon_config_sample' }],
    })
  } catch { /* ignore */ }
}
