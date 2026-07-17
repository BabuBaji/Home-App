// SMS delivery.
//
// Until this existed, nothing in the stack could send a message: the notification service is a
// pure event sink (in-app rows only), and msg91_key / smtp_* / firebase_server_key were seeded
// into settings but read by nobody. The login OTPs papered over it by RETURNING the code in the
// response — which is why DEV_OTP/WORKER_DEV_OTP exist and must stay unset in production.
//
// Provider config lives in the admin `settings` table (env-overridable — see ENV_SETTINGS), so a
// key can be rotated without a rebuild; the 15s config cache means a change lands within seconds.
//
// MSG91 is the provider because it's India-focused and the key was already reserved. India also
// requires DLT-registered templates for transactional SMS, which is why OTP goes through MSG91's
// dedicated OTP endpoint (it owns the template) rather than a free-text send.
import { getSetting } from './config.js'

const MSG91_OTP_URL = 'https://control.msg91.com/api/v5/otp'
const MSG91_FLOW_URL = 'https://control.msg91.com/api/v5/flow/'

/** Digits only, with India's country code. MSG91 wants 91XXXXXXXXXX — no +, spaces or dashes. */
export function normalizePhone(phone, cc = '91') {
  const d = String(phone || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 10) return cc + d                        // bare local number
  if (d.length === 12 && d.startsWith(cc)) return d         // already 91XXXXXXXXXX
  if (d.length > 10) return cc + d.slice(-10)               // 0-prefixed / +91 / other noise
  return ''                                                 // too short to be a mobile
}

/** Which provider is configured, if any. 'none' means nothing can be delivered. */
export async function smsProvider(adminUrl) {
  const key = await getSetting(adminUrl, 'msg91_key', '')
  return key ? 'msg91' : 'none'
}
export const smsConfigured = async (adminUrl) => (await smsProvider(adminUrl)) !== 'none'

/**
 * Deliver a login OTP. Returns { ok, provider, error? } — never throws, because a delivery
 * failure is a normal outcome the caller must surface, not an exception to swallow.
 */
export async function sendOtpSms(adminUrl, phone, code) {
  const to = normalizePhone(phone)
  if (!to) return { ok: false, provider: 'none', error: 'Invalid mobile number' }

  const key = await getSetting(adminUrl, 'msg91_key', '')
  if (!key) return { ok: false, provider: 'none', error: 'No SMS provider configured' }
  const templateId = await getSetting(adminUrl, 'msg91_otp_template_id', '')
  if (!templateId) return { ok: false, provider: 'msg91', error: 'msg91_otp_template_id is not set' }

  try {
    const url = `${MSG91_OTP_URL}?template_id=${encodeURIComponent(templateId)}&mobile=${to}&otp=${encodeURIComponent(code)}`
    const r = await fetch(url, { method: 'POST', headers: { authkey: key, 'content-type': 'application/json' } })
    const body = await r.json().catch(() => ({}))
    // MSG91 answers 200 with {type:'error'} for things like an unapproved template, so the HTTP
    // status alone is not the outcome.
    if (!r.ok || body?.type === 'error') {
      return { ok: false, provider: 'msg91', error: body?.message || `MSG91 responded ${r.status}` }
    }
    return { ok: true, provider: 'msg91', id: body?.request_id || '' }
  } catch (e) {
    return { ok: false, provider: 'msg91', error: e.message || 'SMS request failed' }
  }
}

/**
 * Send a templated transactional SMS (e.g. a worker's onboarding invitation).
 *
 * `vars` fills the DLT template's placeholders. India does not permit arbitrary free-text
 * transactional SMS, so there is deliberately no sendText(phone, "anything") here — a caller
 * must own a registered template.
 */
export async function sendTemplateSms(adminUrl, phone, templateId, vars = {}) {
  const to = normalizePhone(phone)
  if (!to) return { ok: false, provider: 'none', error: 'Invalid mobile number' }
  const key = await getSetting(adminUrl, 'msg91_key', '')
  if (!key) return { ok: false, provider: 'none', error: 'No SMS provider configured' }
  if (!templateId) return { ok: false, provider: 'msg91', error: 'No template id' }

  try {
    const r = await fetch(MSG91_FLOW_URL, {
      method: 'POST',
      headers: { authkey: key, 'content-type': 'application/json' },
      body: JSON.stringify({ template_id: templateId, recipients: [{ mobiles: to, ...vars }] }),
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok || body?.type === 'error') {
      return { ok: false, provider: 'msg91', error: body?.message || `MSG91 responded ${r.status}` }
    }
    return { ok: true, provider: 'msg91', id: body?.request_id || '' }
  } catch (e) {
    return { ok: false, provider: 'msg91', error: e.message || 'SMS request failed' }
  }
}
