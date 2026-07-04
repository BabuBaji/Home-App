// Config cache. The admin service owns the `settings` table (the old global config bus). Any
// service that needs a tunable (commission %, cancellation fees, gateway fees, payout provider,
// API keys) reads it here — a short-TTL cached call to the admin service's /internal/settings.
import { internalGet } from './internal.js'

let _cache = {}
let _ts = 0
const TTL = 15000 // ms

export async function loadSettings(adminUrl) {
  if (Date.now() - _ts < TTL && _ts) return _cache
  try { _cache = await internalGet(adminUrl, '/internal/settings'); _ts = Date.now() }
  catch { /* keep last-known settings if admin is briefly unavailable */ }
  return _cache
}

export async function getSetting(adminUrl, key, def = '') {
  const s = await loadSettings(adminUrl)
  return (s && s[key] != null && s[key] !== '') ? s[key] : def
}

export async function getSettingInt(adminUrl, key, def) {
  const n = parseInt(await getSetting(adminUrl, key, String(def)), 10)
  return Number.isFinite(n) ? n : def
}

export function invalidateSettings() { _ts = 0 }
