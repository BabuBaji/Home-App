// Customer authentication for services other than auth.
//
// The session token is a signed JWT minted by the auth service (see jwt.js). It used to be the
// user id in plain text — `demo-7` — so anyone could read or act as any customer just by typing
// their id. auth/worker/admin/wallet/dispatch were moved onto signed tokens; this file was left
// behind, so booking, notification, payment and catalog still trusted `demo-<id>` while the app
// had already switched to JWTs: real logins got 401, forged ones got 200.
//
// NOT re-exported from index.js on purpose — it imports jwt.js, which carries the jsonwebtoken
// dependency. Only services that actually authenticate customers should carry that dep, so they
// import this module directly:
//   import { makeCustomerAuth } from '@homehelp/shared/customer-auth.js'
import { internalGet } from './internal.js'
import { tokenSubject } from './jwt.js'

/** The customer id from a valid, signed customer token, else NaN. No network hop. */
export function parseToken(req) {
  return tokenSubject(req.headers.authorization, 'customer')
}

export function makeCustomerAuth(authUrl) {
  return async (req, res, next) => {
    const id = parseToken(req)
    if (!Number.isFinite(id)) return res.status(401).json({ error: 'Not authenticated' })
    try {
      const body = await internalGet(authUrl, `/api/internal/users/${id}`)
      if (!body?.user) return res.status(401).json({ error: 'Not authenticated' })
      req.user = body.user
      next()
    } catch {
      res.status(401).json({ error: 'Not authenticated' })
    }
  }
}
