// Admin data-scope predicate — the one place "can this admin see this row?" is decided.
// ------------------------------------------------------------------------------------
// A scoped admin (City / Zone manager) only sees data inside their scope. The admin service
// resolves an admin's scope into BOTH a set of zone ids and a set of city names (a city contains
// zones), and ships it inside req.admin.scope via /api/admin/me — so every service filters with the
// same rule, no matter which geographic key its rows carry:
//   • a row WITH a zone_id is judged precisely by zone membership;
//   • a row with no zone_id falls back to city (workers/customers that were never zone-tagged);
//   • a row with neither signal is hidden from a scoped admin (it can't be attributed to a scope).
// scope absent, or type 'all', or an empty scope → everything (unrestricted).

export function inScope(scope, { zoneId = null, city = null } = {}) {
  if (!scope || scope.type === 'all') return true
  const zids = scope.zoneIds, cities = scope.cities
  const hasZ = Array.isArray(zids) && zids.length > 0
  const hasC = Array.isArray(cities) && cities.length > 0
  // A scoped admin whose effective scope is empty (e.g. a team lead with no scoped reports) sees
  // nothing — 'all' is the only unrestricted type, and it already returned above.
  if (!hasZ && !hasC) return false
  if (zoneId != null && hasZ) return zids.includes(Number(zoneId))
  if (city && hasC) return cities.includes(city)
  return false
}

/** Convenience: keep only the in-scope rows, reading zone/city off each with the given accessors. */
export function filterScope(scope, rows, pick = (r) => ({ zoneId: r.zone_id, city: r.city })) {
  if (!scope || scope.type === 'all') return rows
  return rows.filter((r) => inScope(scope, pick(r)))
}
