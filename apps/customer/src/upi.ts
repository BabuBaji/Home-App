// UPI deep-link helpers — open the customer's chosen UPI app (PhonePe / Google Pay / Paytm /
// BHIM) with the payee VPA and amount prefilled, exactly like a real merchant checkout.
//
// On Android we prefer the native UpiPlugin (Intent + setPackage) so the selected app opens
// DIRECTLY (no chooser) and returns the real UPI result (SUCCESS/FAILURE). If that app isn't
// installed we fall back to the generic `upi://pay` chooser via AppLauncher.
import { Capacitor } from '@capacitor/core'
import { AppLauncher } from '@capacitor/app-launcher'
import { Upi } from './upiNative'

export type UpiApp = { id: string; name: string; sub: string; pkg?: string }

// Each UPI app + its Android package (used for direct, no-chooser launch).
export const UPI_APPS: UpiApp[] = [
  { id: 'phonepe', name: 'PhonePe', sub: 'UPI', pkg: 'com.phonepe.app' },
  { id: 'gpay', name: 'Google Pay', sub: 'UPI', pkg: 'com.google.android.apps.nbu.paisa.user' },
  { id: 'paytm', name: 'Paytm', sub: 'UPI', pkg: 'net.one97.paytm' },
  { id: 'upi', name: 'Other UPI App', sub: 'BHIM, Amazon Pay, etc.' }, // no pkg -> chooser
]

export type UpiParams = { vpa: string; payeeName: string; amount: number; note: string; txnRef: string }

// Build a standard UPI intent URL. UPI apps want %20 (not +) for spaces, so encode manually.
export function buildUpiUrl(p: UpiParams): string {
  const enc = (v: string | number) => encodeURIComponent(String(v))
  const q = [
    `pa=${enc(p.vpa)}`, `pn=${enc(p.payeeName)}`, `am=${enc(p.amount.toFixed(2))}`,
    `cu=INR`, `tn=${enc(p.note)}`, `tr=${enc(p.txnRef)}`,
  ].join('&')
  return `upi://pay?${q}`
}

// Result status: SUCCESS | FAILURE | SUBMITTED | CANCELLED | OPENED (chooser, unknown) | NOT_OPENED
export async function payByUpi(app: UpiApp, params: UpiParams): Promise<{ status: string }> {
  const url = buildUpiUrl(params)

  // Browser preview / mobile web: navigate to the UPI link (app chooser on a real phone).
  if (!Capacitor.isNativePlatform()) { window.location.href = url; return { status: 'OPENED' } }

  // 1) Direct open of the selected app (no chooser) + real UPI result.
  if (app.pkg) {
    try {
      const r = await Upi.pay({ url, package: app.pkg })
      return { status: r.status || 'OPENED' }
    } catch { /* APP_NOT_FOUND → fall back to chooser */ }
  }
  // 2) Generic UPI chooser (works for "Other UPI App" or when the chosen app isn't installed).
  try { const { completed } = await AppLauncher.openUrl({ url }); return { status: completed ? 'OPENED' : 'NOT_OPENED' } }
  catch { return { status: 'NOT_OPENED' } }
}
