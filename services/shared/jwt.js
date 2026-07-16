// Signed session tokens.
//
// Replaces the previous scheme, where the token WAS the user id — `demo-1`, `worker-6`, `admin-1`.
// Each middleware simply parsed the number out of the string, so `Authorization: Bearer admin-1`
// granted a full Super Admin session with no password, and `worker-6` skipped the OTP entirely.
// Nothing was signed, so nothing could be trusted.
//
// HS256, one shared secret, short-ish expiry. Every service verifies the same way, and a token
// is bound to an audience ('customer' | 'worker' | 'admin') so a worker token can't be replayed
// against the admin API.
import jwt from 'jsonwebtoken'

// No default. A guessable signing key is the same hole with extra steps, so a service that has
// not been given a secret must refuse to start rather than quietly sign with something known.
const SECRET = process.env.JWT_SECRET || ''
export const jwtConfigured = () => SECRET.length >= 16

export function assertJwtSecret(serviceName) {
  if (!jwtConfigured()) {
    console.error(`[${serviceName}] JWT_SECRET is missing or too short (need >=16 chars). Refusing to start: sessions could be forged.`)
    process.exit(1)
  }
}

const TTL = { customer: '30d', worker: '30d', admin: '12h' } // phones stay signed in; admin sessions don't

/** Mint a session token. `aud` is who it's for; `sub` is their id. */
export function signToken(aud, sub, extra = {}) {
  return jwt.sign({ ...extra, sub: String(sub), aud }, SECRET, { algorithm: 'HS256', expiresIn: TTL[aud] || '12h' })
}

/**
 * Verify and return the payload, or null. Pinning `algorithms` matters: without it a token could
 * declare alg:none and be accepted unsigned — the classic JWT bypass.
 */
export function verifyToken(token, aud) {
  if (!token || !jwtConfigured()) return null
  try { return jwt.verify(token, SECRET, { algorithms: ['HS256'], audience: aud }) }
  catch { return null }
}

/** The id from a valid token for this audience, else NaN. */
export function tokenSubject(authorizationHeader, aud) {
  const raw = String(authorizationHeader || '').replace(/^Bearer\s+/i, '').trim()
  const p = verifyToken(raw, aud)
  return p ? Number(p.sub) : NaN
}
