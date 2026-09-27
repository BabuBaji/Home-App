// The customer's own "use my location" switch, independent of the Android permission.
//
// Android never lets an app revoke its own permission, so a switch that drove the OS permission
// could only ever bounce the customer to Settings. This is the app-level preference instead:
// turned off, the app simply stops asking the device for a fix — the permission may still be
// granted, but nothing uses it. That makes the switch instant and fully in-app.
const KEY = 'hh_use_location'

export function locationAllowed(): boolean {
  try { return localStorage.getItem(KEY) !== '0' } catch { return true }   // default: on
}

export function setLocationAllowed(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode — session only */ }
}
