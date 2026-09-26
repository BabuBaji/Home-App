// Push notifications via Firebase Cloud Messaging (HTTP v1).
//
// Config lives in admin settings (env-overridable like every other key): `fcm_service_account` is
// the Firebase service-account JSON (Project settings → Service accounts → Generate key). With it
// unset nothing is sent and sendPush() reports { ok:false, error:'not configured' } — callers keep
// working, customers simply get in-app updates only.
//
// The v1 API needs a short-lived OAuth token, minted here from the service account with a signed
// JWT (RS256) — no firebase-admin dependency.
import crypto from 'node:crypto'
import { getSetting } from './config.js'

let cached = { key: '', token: '', exp: 0 }

async function serviceAccount(adminUrl) {
  const raw = process.env.FCM_SERVICE_ACCOUNT || await getSetting(adminUrl, 'fcm_service_account', '')
  if (!raw) return null
  try {
    const sa = typeof raw === 'string' ? JSON.parse(raw) : raw
    return sa.client_email && sa.private_key && sa.project_id ? sa : null
  } catch { return null }
}
export const pushConfigured = async (adminUrl) => !!(await serviceAccount(adminUrl))

async function accessToken(sa) {
  if (cached.key === sa.client_email && Date.now() < cached.exp - 60_000) return cached.token
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || `token ${r.status}`)
  cached = { key: sa.client_email, token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }
  return cached.token
}

/**
 * Send one message to one device token. `data` values are stringified (FCM requires strings).
 * `urgent` makes it a high-priority data+notification message (job offers must wake the phone).
 * Returns { ok, unregistered?, error? } and never throws — an unregistered token should be deleted
 * by the caller.
 */
export async function sendPush(adminUrl, token, { title, body, data = {}, urgent = false, channel } = {}) {
  const sa = await serviceAccount(adminUrl)
  if (!sa) return { ok: false, error: 'not configured' }
  try {
    const message = {
      token,
      notification: title ? { title, body: body || '' } : undefined,
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? '')])),
      android: { priority: urgent ? 'HIGH' : 'NORMAL', notification: title ? { channel_id: channel || (urgent ? 'jobs' : 'updates'), sound: 'default' } : undefined },
    }
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + await accessToken(sa) },
      body: JSON.stringify({ message }),
    })
    if (r.ok) return { ok: true }
    const j = await r.json().catch(() => ({}))
    const code = j?.error?.details?.find?.((d) => d.errorCode)?.errorCode || j?.error?.status
    return { ok: false, unregistered: code === 'UNREGISTERED' || r.status === 404, error: j?.error?.message || `HTTP ${r.status}` }
  } catch (e) { return { ok: false, error: e.message } }
}
