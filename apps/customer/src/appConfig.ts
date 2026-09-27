import { useSyncExternalStore } from 'react'
import { API_BASE } from './api'

// Feature switches from Settings ▸ General (served by GET /api/app-config). Defaults keep the app
// fully usable when the config can't be fetched (offline, older backend).
export type AppConfig = { maintenance: boolean; signups: boolean; promoCodes: boolean; reviews: boolean; supportPhone: string; instantServiceId: string }
let cfg: AppConfig = { maintenance: false, signups: true, promoCodes: true, reviews: true, supportPhone: '', instantServiceId: '' }
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const r = await fetch(API_BASE + '/api/app-config', { cache: 'no-store' })
    if (r.ok) { cfg = { ...cfg, ...(await r.json()) }; emit() }
  } catch { /* keep last known */ }
  return cfg
}

// Any request answered with the gateway's maintenance 503 flips the app to the maintenance screen
// straight away, without waiting for the next config refresh.
export function markMaintenance() { if (!cfg.maintenance) { cfg = { ...cfg, maintenance: true }; emit() } }

export function useAppConfig(): AppConfig {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => cfg)
}
