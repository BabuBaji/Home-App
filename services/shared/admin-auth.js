// Admin authentication for services that expose /api/admin/* routes but do NOT own the admin
// identity. They validate the caller's bearer token by asking the admin service `/api/admin/me`
// (the same delegated-auth pattern the catalog/activity/worker services already used against
// the monolith — now pointed at the admin service).
export const RANK = { super: 4, admin: 3, manager: 2, support: 1 }

export function makeAdminAuth(adminUrl) {
  return async (req, res, next) => {
    try {
      const r = await fetch(`${adminUrl}/api/admin/me`, { headers: { authorization: req.headers.authorization || '' } })
      if (!r.ok) return res.status(401).json({ error: 'Not authenticated' })
      req.admin = (await r.json()).admin
      next()
    } catch {
      res.status(502).json({ error: 'Auth service unavailable' })
    }
  }
}

export const requireRole = (min) => (req, res, next) =>
  (RANK[req.admin?.role] || 0) >= RANK[min] ? next() : res.status(403).json({ error: 'Insufficient permissions' })
