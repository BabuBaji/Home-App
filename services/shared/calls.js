// Masked calls: the customer and the expert talk through a bridged call so neither ever sees the
// other's number. Exotel's "connect two numbers" API rings the caller first, then the callee, and
// both see the company's ExoPhone as caller id.
//
// Config (admin settings): exotel_sid, exotel_api_key, exotel_api_token, exotel_caller_id (the
// ExoPhone), exotel_subdomain (api.exotel.com, or api.in.exotel.com for the Mumbai cluster).
import { getSetting } from './config.js'
import { normalizePhone } from './sms.js'

async function exotel(adminUrl) {
  const [sid, key, token, callerId, sub] = await Promise.all(['exotel_sid', 'exotel_api_key', 'exotel_api_token', 'exotel_caller_id', 'exotel_subdomain']
    .map((k) => getSetting(adminUrl, k, '')))
  return sid && key && token && callerId ? { sid, key, token, callerId, sub: sub || 'api.exotel.com' } : null
}
export const callsMasked = async (adminUrl) => !!(await exotel(adminUrl))

/** Ring `from` then connect them to `to`. Returns { ok, callSid?, error? }; never throws. */
export async function bridgeCall(adminUrl, from, to) {
  const cfg = await exotel(adminUrl)
  if (!cfg) return { ok: false, error: 'not configured' }
  const a = normalizePhone(from), b = normalizePhone(to)
  if (!a || !b) return { ok: false, error: 'Missing phone number' }
  try {
    const r = await fetch(`https://${cfg.sub}/v1/Accounts/${encodeURIComponent(cfg.sid)}/Calls/connect.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + Buffer.from(`${cfg.key}:${cfg.token}`).toString('base64') },
      body: new URLSearchParams({ From: '+' + a, To: '+' + b, CallerId: cfg.callerId, CallType: 'trans', TimeLimit: '1800' }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: j?.RestException?.Message || `HTTP ${r.status}` }
    return { ok: true, callSid: j?.Call?.Sid || null }
  } catch (e) { return { ok: false, error: e.message } }
}
