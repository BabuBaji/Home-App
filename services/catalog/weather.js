// Weather-driven surge pricing.
// A background poller fetches rain data per serviced CITY from Open-Meteo (free, no API key),
// caches it in-memory, and derives a per-zone surge %. The pricing quote reads the cached surge
// (never calls the weather API in the request path). Ops can force a manual override per zone.
//
// Signal → surge tiers (on the SUBTOTAL, capped at SURGE_MAX_PCT):
//   drizzle / high chance   → +10%
//   moderate rain (2.5 mm/h)→ +20%
//   heavy rain (7.5 mm/h)   → +30%

// Representative coordinates for the cities we serve (zone.city → lat,lng). Add rows as you expand.
const CITY_COORDS = {
  hyderabad: [17.3850, 78.4867], mumbai: [19.0760, 72.8777], bengaluru: [12.9716, 77.5946],
  bangalore: [12.9716, 77.5946], delhi: [28.6139, 77.2090], 'new delhi': [28.6139, 77.2090],
  chennai: [13.0827, 80.2707], kolkata: [22.5726, 88.3639], pune: [18.5204, 73.8567],
  ahmedabad: [23.0225, 72.5714], jaipur: [26.9124, 75.7873], lucknow: [26.8467, 80.9462],
  surat: [21.1702, 72.8311], kanpur: [26.4499, 80.3319], nagpur: [21.1458, 79.0882],
  indore: [22.7196, 75.8577], bhopal: [23.2599, 77.4126], visakhapatnam: [17.6868, 83.2185],
  patna: [25.5941, 85.1376], vadodara: [22.3072, 73.1812], coimbatore: [11.0168, 76.9558],
  kochi: [9.9312, 76.2673], chandigarh: [30.7333, 76.7794], gurugram: [28.4595, 77.0266],
  gurgaon: [28.4595, 77.0266], noida: [28.5355, 77.3910], thane: [19.2183, 72.9781],
}

const PROB_THRESHOLD = 60   // % chance of rain that counts as "rain likely" even with little precip
const SURGE_MAX_PCT = 25    // cap so a storm can't runaway the bill

const weatherByCity = new Map()   // city -> { precipMm, prob, at }
let zoneCity = new Map()          // zoneId -> lowercased city
const manualOverride = new Map()  // zoneId (or '*') -> { pct, until }

function computeSurge(w) {
  if (!w) return { active: false, pct: 0, reason: '' }
  const mm = Number(w.precipMm) || 0, prob = Number(w.prob) || 0
  // Surge only when it's ACTUALLY raining now, and hard enough to matter — a mere high forecast
  // probability or a trace drizzle no longer triggers it, so the app matches on-street conditions.
  const rainy = mm >= 0.5   // ignore trace/drizzle (grid data reads light rain the street doesn't feel)
  if (!rainy) return { active: false, pct: 0, reason: '', prob, precipMm: mm }
  let pct = mm >= 7.5 ? 30 : mm >= 2.5 ? 20 : 10   // light / moderate / heavy
  pct = Math.min(pct, SURGE_MAX_PCT)
  return { active: pct > 0, pct, reason: 'rain', prob, precipMm: mm }
}

/** The surge for a zone right now: a live manual override wins, else the cached weather signal. */
export function getSurgeForZone(zoneId) {
  const id = Number(zoneId)
  const ov = manualOverride.get(id) || manualOverride.get('*')
  if (ov && (!ov.until || ov.until > Date.now())) return { active: (ov.pct || 0) > 0, pct: ov.pct || 0, reason: 'manual' }
  const city = zoneCity.get(id)
  return computeSurge(city ? weatherByCity.get(city) : null)
}

/** Set a manual surge override for a zone (or '*' = all zones) for `minutes`. pct 0 clears it. */
export function setManualSurge(scope, pct, minutes) {
  const key = scope === '*' ? '*' : Number(scope)
  if (!pct || pct <= 0) { manualOverride.delete(key); return }
  manualOverride.set(key, { pct: Math.round(pct), until: minutes ? Date.now() + minutes * 60000 : null })
}

/** Snapshot of every live zone's surge + underlying weather — for the admin surge view. */
export function surgeSnapshot() {
  const out = []
  for (const [zoneId, city] of zoneCity) {
    const w = weatherByCity.get(city)
    const s = getSurgeForZone(zoneId)
    out.push({ zoneId, city, active: s.active, pct: s.pct, reason: s.reason, precipMm: w?.precipMm ?? null, prob: w?.prob ?? null, at: w?.at ?? null })
  }
  return out
}

async function pollOnce(pool) {
  const { rows } = await pool.query("SELECT id, lower(trim(city)) AS city FROM zones WHERE status='live' AND city <> ''")
  zoneCity = new Map(rows.map((r) => [r.id, r.city]))
  const cities = [...new Set(rows.map((r) => r.city))].filter((c) => CITY_COORDS[c])
  for (const city of cities) {
    const [lat, lng] = CITY_COORDS[city]
    try {
      // `current` = what's falling RIGHT NOW (so surge tracks actual rain, not a 2-hour forecast);
      // the hourly probability is kept only for display ("73% chance").
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=precipitation,rain&hourly=precipitation_probability&forecast_hours=1&timezone=auto`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const j = await res.json()
      const precipMm = j.current?.precipitation ?? j.current?.rain ?? 0
      const prob = (j.hourly?.precipitation_probability || [])[0] ?? 0
      weatherByCity.set(city, { precipMm, prob, at: Date.now() })
    } catch { /* keep last-known reading on a transient failure */ }
  }
  return cities.length
}

/** Start the poller: fetch now, then every `intervalMinutes`. */
export function startWeatherPoller(pool, intervalMinutes = 20) {
  const run = () => pollOnce(pool).then((n) => console.log(`[catalog] weather refreshed for ${n} cit${n === 1 ? 'y' : 'ies'}`)).catch((e) => console.error('[catalog] weather poll failed:', e.message))
  run()
  setInterval(run, Math.max(5, intervalMinutes) * 60000)
}
