// Customer authentication for services other than auth. The session token is `demo-<id>`
// (preserved from the monolith). We decode the id locally, then load the user from the auth
// service. Services that only need the id can call parseToken() without a network hop.
import { internalGet } from './internal.js'

export function parseToken(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '')
  return t.startsWith('demo-') ? Number(t.slice(5)) : NaN
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
