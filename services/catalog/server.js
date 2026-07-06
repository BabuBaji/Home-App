// HomeHelp Catalog Service
// -------------------------
// Owns the service catalogue on its own Postgres, and is the authority for pricing/coupons.
// Serves the customer catalogue + quote + coupons + home content, and admin service CRUD.
// Admin auth + config are delegated to the admin service; per-service booking counts come from
// the booking service; catalogue changes are broadcast as `services:update` via the realtime bus.
import express from 'express'
import {
  makePool, migrate, makeAdminAuth, requireRole, internalOnly, tryGet, publishRealtime, getSetting,
} from '@homehelp/shared'
import {
  CATEGORIES, SERVICES_SEED, SERVICE_IMAGES, detailsFor, durationsFor,
  REFERRAL, TRUST_BADGES, COUPONS, applyCoupon, priceBreakdown,
} from './catalog-data.js'

const PORT = Number(process.env.PORT || 4001)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5432/catalog'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const BOOKING_URL = (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, '')

const pool = makePool(DATABASE_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, price INTEGER NOT NULL,
      category TEXT NOT NULL, available BOOLEAN NOT NULL DEFAULT true, sort INTEGER NOT NULL DEFAULT 0
    )`,
    // Service Zones (the "dark store" / micro-market): a launchable area = a set of pincodes.
    // status: planned (not live) | live (serviceable) | paused. state/city give the hierarchy.
    `CREATE TABLE IF NOT EXISTS zones (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '', pincodes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planned', sla_minutes INTEGER,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ])
  const up = `INSERT INTO services (id,name,icon,price,category,available,sort)
    VALUES ($1,$2,$3,$4,$5,true,$6)
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, icon=EXCLUDED.icon, price=EXCLUDED.price, category=EXCLUDED.category, sort=EXCLUDED.sort`
  for (let i = 0; i < SERVICES_SEED.length; i++) {
    const [id, name, icon, price, category] = SERVICES_SEED[i]
    await pool.query(up, [id, name, icon, price, category, i])
  }
  // Seed one launch zone so instant bookings get a zone_id and push auto-assign can fire on a
  // fresh DB. Only when NO zones exist — once an admin creates any zone, zones are the source of
  // truth (see serviceability logic below) and we must not re-inject this one.
  const zoneCount = (await pool.query('SELECT COUNT(*)::int n FROM zones')).rows[0].n
  if (!zoneCount) {
    const pins = Array.from({ length: 115 }, (_, i) => `560${String(i + 1).padStart(3, '0')}`).join(',')
    await pool.query(
      `INSERT INTO zones (name,state,city,pincodes,status,sla_minutes) VALUES ($1,$2,$3,$4,'live',$5)`,
      ['Bengaluru Central', 'Karnataka', 'Bengaluru', pins, 60])
    console.log('[catalog] seeded live zone "Bengaluru Central" (pincodes 560001-560115)')
  }
  console.log(`[catalog] Postgres ready, seeded ${SERVICES_SEED.length} services`)
}

const withImage = (s) => ({ ...s, available: !!s.available, image: SERVICE_IMAGES[s.id] || null })

async function allServices() {
  const { rows } = await pool.query('SELECT id,name,icon,price,category,available FROM services ORDER BY sort, name')
  return rows.map(withImage)
}
async function getService(id) {
  const { rows } = await pool.query('SELECT id,name,icon,price,category,available FROM services WHERE id=$1', [id])
  return rows[0] ? withImage(rows[0]) : null
}
async function broadcastServices() {
  publishRealtime(REDIS_URL, null, 'services:update', await allServices())
}
// service-to-service: booking counts live in the booking service.
const bookingCounts = () => tryGet(BOOKING_URL, '/api/internal/service-booking-counts', {})

// Authoritative pricing for a set of {id, durationId} items.
async function priceItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return { error: 'Select at least one service' }
  const items = []
  for (const it of rawItems) {
    const s = await getService(it.id)
    if (!s || !s.available) return { error: `"${it.id}" is not available` }
    const durs = durationsFor(s.price)
    const dur = durs.find((d) => d.id === (it.durationId || '60m')) || durs[0]
    items.push({ id: s.id, name: s.name, icon: s.icon, category: s.category, durationId: dur.id, durationLabel: dur.label, price: dur.price })
  }
  const subtotal = Math.max(0, items.reduce((sum, x) => sum + x.price, 0))
  return { items, subtotal }
}
async function quote({ items, coupon }) {
  const q = await priceItems(items)
  if (q.error) return { status: 409, body: q }
  let discount = 0, code = null
  if (coupon) { const c = applyCoupon(coupon, q.subtotal); if (!c.error) { discount = c.discount; code = c.code } }
  return { status: 200, body: { items: q.items, coupon: code, ...priceBreakdown(q.subtotal, discount) } }
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'catalog', ok: true }))

/* ---------- customer catalogue (public) ---------- */
app.get('/api/services', async (_q, res) => res.json({ categories: CATEGORIES, services: await allServices() }))
app.get('/api/services/:id', async (req, res) => {
  const s = await getService(req.params.id)
  if (!s) return res.status(404).json({ error: 'Service not found' })
  res.json({ ...s, ...detailsFor(s.id, s.price) })
})

/* ---------- pricing / coupons / home ---------- */
app.post('/api/quote', async (req, res) => { const r = await quote(req.body || {}); res.status(r.status).json(r.body) })
app.get('/api/coupons', (_q, res) => res.json(COUPONS))
app.post('/api/coupons/validate', (req, res) => {
  const r = applyCoupon(req.body?.code, Number(req.body?.subtotal) || 0)
  if (r.error) return res.status(400).json(r)
  res.json(r)
})
app.get('/api/home', (_q, res) => res.json({ referral: REFERRAL, trust: TRUST_BADGES, instantEta: 5 }))
app.get('/api/referral', (_q, res) => res.json(REFERRAL))

/* ---------- address search (Google Places when key set; OpenStreetMap/Nominatim fallback) ----------
   Google is proxied server-side so the key stays private and CORS isn't an issue. The key comes
   from admin settings (google_maps_key). Without it, we fall back to Nominatim (limited India POIs). */
const NOMINATIM = 'https://nominatim.openstreetmap.org'
const gkey = async () => { try { return await getSetting(ADMIN_URL, 'google_maps_key', '') } catch { return '' } }
// Google Maps APIs fail hard until billing is enabled (REQUEST_DENIED). Once we see that, stop
// hitting Google for a while so every address search doesn't waste a failing round-trip before
// the OSM fallback — the key auto-recovers after the cooldown once billing is turned on.
let googleDeniedUntil = 0
const googleUsable = async () => (Date.now() < googleDeniedUntil ? '' : await gkey())
const markGoogleDenied = (status, msg) => {
  if (status === 'REQUEST_DENIED' || status === 'OVER_QUERY_LIMIT' || /billing/i.test(msg || '')) {
    googleDeniedUntil = Date.now() + 10 * 60 * 1000
    console.warn('[catalog] Google disabled for 10 min:', status, (msg || '').slice(0, 80))
  }
}

async function nominatimSearch(q) {
  const r = await fetch(`${NOMINATIM}/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=6&addressdetails=1&countrycodes=in`,
    { headers: { 'User-Agent': 'HomeHelp/1.0 (address search)', Accept: 'application/json' } })
  const list = await r.json()
  return (Array.isArray(list) ? list : []).map((x) => ({
    placeId: '', label: (x.display_name || '').split(',').slice(0, 2).join(',').trim(),
    sub: x.display_name || '', lat: +x.lat, lng: +x.lon, pincode: x.address?.postcode || null,
  }))
}

// Photon (OSM-based) has far better fuzzy matching on POI/apartment/residency names than raw
// Nominatim, and biases results to the caller's coordinates when provided — so a local
// "Rainbow Vistas" surfaces above a same-named building in another city.
async function photonSearch(q, lat, lng) {
  const bias = (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) ? `&lat=${lat}&lon=${lng}` : ''
  const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en${bias}`,
    { headers: { 'User-Agent': 'HomeHelp/1.0 (address search)', Accept: 'application/json' } })
  const j = await r.json()
  return (j.features || []).map((f) => {
    const p = f.properties || {}, c = f.geometry?.coordinates || []
    const label = p.name || [p.street, p.district].filter(Boolean).join(', ')
    const sub = [p.name && p.street, p.district, p.city, p.state, p.postcode, p.country].filter(Boolean).join(', ')
    return { placeId: '', label, sub, lat: c[1], lng: c[0], pincode: p.postcode || null, cc: p.countrycode || '' }
  }).filter((x) => x.label && x.lat != null && (!x.cc || x.cc === 'IN'))
    .map(({ cc, ...x }) => x)
}

// Merge Photon (name-first) + Nominatim, de-duplicated by name + rounded coordinates.
async function osmSearch(q, lat, lng) {
  const [ph, no] = await Promise.all([
    photonSearch(q, lat, lng).catch(() => []),
    nominatimSearch(q).catch(() => []),
  ])
  const seen = new Set(), out = []
  for (const r of [...ph, ...no]) {
    const key = `${(r.label || '').toLowerCase()}|${(+r.lat).toFixed(2)}|${(+r.lng).toFixed(2)}`
    if (seen.has(key)) continue
    seen.add(key); out.push(r)
    if (out.length >= 8) break
  }
  return out
}
const pinFromComponents = (comps) => (comps || []).find((c) => (c.types || []).includes('postal_code'))?.long_name || null

// Predictive address search. Google Autocomplete (India-biased) → results with a place_id you
// resolve to coords via /api/places/details. Falls back to Nominatim on no-key or API error.
app.get('/api/places/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (!q) return res.json({ results: [] })
  const lat = req.query.lat != null ? Number(req.query.lat) : null
  const lng = req.query.lng != null ? Number(req.query.lng) : null
  const key = await googleUsable()
  try {
    if (key) {
      // Bias Google Autocomplete to the caller's location when we have it (surfaces nearby apartments first).
      const bias = (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) ? `&location=${lat},${lng}&radius=40000` : ''
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&key=${key}&components=country:in&language=en${bias}`
      const j = await (await fetch(url)).json()
      if (j.status === 'OK' || j.status === 'ZERO_RESULTS') {
        return res.json({ provider: 'google', results: (j.predictions || []).map((p) => ({
          placeId: p.place_id,
          label: p.structured_formatting?.main_text || p.description,
          sub: p.structured_formatting?.secondary_text || p.description,
        })) })
      }
      console.warn('[catalog] google autocomplete:', j.status, j.error_message || '')
      markGoogleDenied(j.status, j.error_message)
    }
    return res.json({ provider: 'osm', results: await osmSearch(q, lat, lng) })
  } catch (e) {
    console.error('[catalog] places/search:', e.message)
    try { return res.json({ provider: 'osm', results: await osmSearch(q, lat, lng) }) }
    catch { return res.status(502).json({ error: 'Place search failed', results: [] }) }
  }
})

// Resolve a Google place_id to coordinates + a clean formatted address.
app.get('/api/places/details', async (req, res) => {
  const placeId = String(req.query.placeId || req.query.id || '')
  if (!placeId) return res.status(400).json({ error: 'Missing placeId' })
  const key = await googleUsable()
  if (!key) return res.status(400).json({ error: 'Google Maps not configured' })
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&key=${key}&fields=geometry,formatted_address,name,address_component&language=en`
    const j = await (await fetch(url)).json()
    if (j.status !== 'OK') { markGoogleDenied(j.status, j.error_message); return res.status(502).json({ error: j.status }) }
    const g = j.result || {}
    res.json({ label: g.name || (g.formatted_address || '').split(',')[0], sub: g.formatted_address || '',
      lat: g.geometry?.location?.lat ?? null, lng: g.geometry?.location?.lng ?? null, pincode: pinFromComponents(g.address_components) })
  } catch (e) { res.status(502).json({ error: 'Details failed' }) }
})

// Forward geocoding: a typed/manual address -> lat/lng + pincode. Google Geocoding (India-biased)
// when the key is set and billed, else OpenStreetMap/Nominatim. Used for manual address entry.
app.get('/api/geocode', async (req, res) => {
  const q = String(req.query.q || req.query.address || '').trim()
  if (!q) return res.status(400).json({ error: 'Missing address' })
  const key = await googleUsable()
  try {
    if (key) {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}&region=in&language=en`
      const j = await (await fetch(url)).json()
      if (j.status === 'OK' && j.results?.[0]) {
        const r0 = j.results[0]
        return res.json({ provider: 'google', label: (r0.formatted_address || '').split(',')[0], sub: r0.formatted_address || '',
          lat: r0.geometry?.location?.lat ?? null, lng: r0.geometry?.location?.lng ?? null, pincode: pinFromComponents(r0.address_components) })
      }
      console.warn('[catalog] google geocode:', j.status, j.error_message || '')
      markGoogleDenied(j.status, j.error_message)
    }
    const r = await fetch(`${NOMINATIM}/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=1&addressdetails=1&countrycodes=in`,
      { headers: { 'User-Agent': 'HomeHelp/1.0 (geocode)', Accept: 'application/json' } })
    const x = (await r.json())?.[0]
    if (!x) return res.json({ provider: 'nominatim', lat: null, lng: null, pincode: null, label: '', sub: '' })
    res.json({ provider: 'nominatim', label: (x.display_name || '').split(',').slice(0, 2).join(',').trim(),
      sub: x.display_name || '', lat: +x.lat, lng: +x.lon, pincode: x.address?.postcode || null })
  } catch (e) { console.error('[catalog] geocode:', e.message); res.status(502).json({ error: 'Geocode failed' }) }
})

// Normalize a pincode blob (comma/space separated) to a clean, de-duped list of 6-digit PINs.
const normPins = (v) => [...new Set(String(v || '').split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^\d{6}$/.test(s)))]

// Service-area gating.
//  • If ANY zones exist → zones are the source of truth: a pincode is serviceable iff it (or its
//    city) belongs to a LIVE zone. This is how areas launch/pause "block by block".
//  • If NO zones exist → fall back to legacy flat settings (serviceable_pincodes/service_cities;
//    both empty = serve everywhere).
app.get('/api/serviceable', async (req, res) => {
  const pincode = String(req.query.pincode || '').trim()
  const city = String(req.query.city || '').trim().toLowerCase()
  const zones = (await pool.query('SELECT city, pincodes, status FROM zones')).rows
  if (zones.length > 0) {
    const live = zones.filter((z) => z.status === 'live')
    if (live.length === 0) return res.json({ serviceable: false, reason: 'no_live_zones', pincode: pincode || null })
    const covered = live.some((z) => {
      const pins = normPins(z.pincodes)
      const cityMatch = city && String(z.city || '').trim().toLowerCase() === city
      if (pincode) return pins.includes(pincode) || (pins.length === 0 && cityMatch)
      return cityMatch
    })
    return res.json({ serviceable: covered, reason: covered ? 'covered' : 'not_covered', pincode: pincode || null })
  }
  const pins = (await getSetting(ADMIN_URL, 'serviceable_pincodes', '')).split(',').map((s) => s.trim()).filter(Boolean)
  const cities = (await getSetting(ADMIN_URL, 'service_cities', '')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (pins.length === 0 && cities.length === 0) return res.json({ serviceable: true, reason: 'open' })
  const serviceable = (pins.length > 0 && pins.includes(pincode)) || (cities.length > 0 && cities.includes(city))
  res.json({ serviceable, reason: serviceable ? 'covered' : 'not_covered', pincode: pincode || null })
})

// Public: live zones (for a "we're now in these areas" display).
app.get('/api/zones', async (_q, res) => {
  const { rows } = await pool.query("SELECT name, state, city FROM zones WHERE status='live' ORDER BY state, city, name")
  res.json(rows)
})

// Internal: which zone covers a pincode — booking stamps booking.zone_id from this on create.
app.get('/api/internal/zone-for', internalOnly, async (req, res) => {
  const pincode = String(req.query.pincode || '').trim()
  if (!pincode) return res.json({ zoneId: null })
  const { rows } = await pool.query('SELECT id, name, status, pincodes FROM zones')
  const z = rows.find((r) => normPins(r.pincodes).includes(pincode))
  res.json(z ? { zoneId: z.id, zoneName: z.name, live: z.status === 'live' } : { zoneId: null })
})
// Internal: full zone list (for the admin live-ops aggregation).
app.get('/api/internal/zones', internalOnly, async (_q, res) => {
  const { rows } = await pool.query('SELECT * FROM zones ORDER BY state, city, name')
  res.json(rows.map(zoneOut))
})

// Worker/customer ETA via OSRM road routing (free). Distance Matrix (Google) can slot in later
// when billing is enabled. Returns straight road distance + drive-time estimate.
app.get('/api/eta', async (req, res) => {
  const fromLat = Number(req.query.fromLat), fromLng = Number(req.query.fromLng)
  const toLat = Number(req.query.toLat), toLng = Number(req.query.toLng)
  if ([fromLat, fromLng, toLat, toLng].some(Number.isNaN)) return res.status(400).json({ error: 'from/to lat & lng required' })
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`
    const r0 = (await (await fetch(url)).json())?.routes?.[0]
    if (!r0) return res.status(502).json({ error: 'No route' })
    res.json({ provider: 'osrm', distanceKm: +(r0.distance / 1000).toFixed(2), etaMin: Math.max(1, Math.round(r0.duration / 60)) })
  } catch (e) { console.error('[catalog] eta:', e.message); res.status(502).json({ error: 'ETA failed' }) }
})

/* ---------- internal (service-to-service) ---------- */
// Booking service prices bookings authoritatively through here.
app.post('/api/internal/price', internalOnly, async (req, res) => { const r = await quote(req.body || {}); res.status(r.status).json(r.body) })

/* ---------- admin management ---------- */
app.get('/api/admin/services', adminAuth, async (_q, res) => {
  const [rows, counts] = await Promise.all([allServices(), bookingCounts()])
  res.json(rows.map((s) => ({ ...s, bookings: counts[s.id] || 0 })))
})
app.post('/api/admin/services', adminAuth, requireRole('manager'), async (req, res) => {
  const b = req.body || {}
  const id = String(b.id || b.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24)
  if (!id || !b.name) return res.status(400).json({ error: 'Name is required' })
  const exists = await pool.query('SELECT 1 FROM services WHERE id=$1', [id])
  if (exists.rowCount) return res.status(409).json({ error: 'Service already exists' })
  const { rows } = await pool.query('SELECT COALESCE(MAX(sort),0)+1 AS s FROM services')
  await pool.query('INSERT INTO services (id,name,icon,price,category,available,sort) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, b.name, b.icon || '🧰', Math.max(0, Number(b.price) || 99), b.category || 'Cleaning', b.available === false ? false : true, rows[0].s])
  await broadcastServices()
  res.status(201).json({ ok: true, id })
})
app.patch('/api/admin/services/:id', adminAuth, requireRole('manager'), async (req, res) => {
  const b = req.body || {}
  const cur = await pool.query('SELECT * FROM services WHERE id=$1', [req.params.id])
  if (!cur.rowCount) return res.status(404).json({ error: 'Not found' })
  const s = cur.rows[0]
  await pool.query('UPDATE services SET name=$1, icon=$2, price=$3, category=$4, available=$5 WHERE id=$6', [
    b.name ?? s.name, b.icon ?? s.icon, b.price ?? s.price, b.category ?? s.category,
    b.available === undefined ? s.available : !!b.available, req.params.id,
  ])
  await broadcastServices()
  res.json({ ok: true })
})
app.delete('/api/admin/services/:id', adminAuth, requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM services WHERE id=$1', [req.params.id])
  await broadcastServices()
  res.json({ ok: true })
})
/* ---------- admin: Service Zones (area-by-area onboarding) ---------- */
const zoneOut = (z) => ({ ...z, pincodeList: normPins(z.pincodes), pincodeCount: normPins(z.pincodes).length })
app.get('/api/admin/zones', adminAuth, async (_q, res) => {
  const { rows } = await pool.query('SELECT * FROM zones ORDER BY state, city, name')
  res.json(rows.map(zoneOut))
})
app.post('/api/admin/zones', adminAuth, requireRole('admin'), async (req, res) => {
  const b = req.body || {}
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Zone name is required' })
  const status = ['planned', 'live', 'paused'].includes(b.status) ? b.status : 'planned'
  const { rows } = await pool.query(
    'INSERT INTO zones (name,state,city,pincodes,status,sla_minutes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [String(b.name).trim(), String(b.state || '').trim(), String(b.city || '').trim(), normPins(b.pincodes).join(','), status, b.slaMinutes ? Number(b.slaMinutes) : null])
  res.status(201).json(zoneOut(rows[0]))
})
app.patch('/api/admin/zones/:id', adminAuth, requireRole('admin'), async (req, res) => {
  const cur = await pool.query('SELECT * FROM zones WHERE id=$1', [req.params.id])
  if (!cur.rowCount) return res.status(404).json({ error: 'Zone not found' })
  const z = cur.rows[0], b = req.body || {}
  await pool.query('UPDATE zones SET name=$1,state=$2,city=$3,pincodes=$4,status=$5,sla_minutes=$6 WHERE id=$7', [
    b.name ?? z.name, b.state ?? z.state, b.city ?? z.city,
    b.pincodes !== undefined ? normPins(b.pincodes).join(',') : z.pincodes,
    b.status && ['planned', 'live', 'paused'].includes(b.status) ? b.status : z.status,
    b.slaMinutes !== undefined ? (b.slaMinutes ? Number(b.slaMinutes) : null) : z.sla_minutes, req.params.id])
  res.json(zoneOut((await pool.query('SELECT * FROM zones WHERE id=$1', [req.params.id])).rows[0]))
})
app.delete('/api/admin/zones/:id', adminAuth, requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM zones WHERE id=$1', [req.params.id])
  res.json({ ok: true })
})

// Customer-facing single-field update kept from the monolith (price/availability toggle).
app.patch('/api/services/:id', adminAuth, requireRole('manager'), async (req, res) => {
  const cur = await pool.query('SELECT * FROM services WHERE id=$1', [req.params.id])
  if (!cur.rowCount) return res.status(404).json({ error: 'Service not found' })
  const s = cur.rows[0]
  await pool.query('UPDATE services SET price=$1, available=$2 WHERE id=$3',
    [req.body?.price ?? s.price, req.body?.available === undefined ? s.available : !!req.body.available, req.params.id])
  await broadcastServices()
  res.json(await getService(req.params.id))
})

init()
  .then(() => app.listen(PORT, () => console.log(`[catalog] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[catalog] failed to start:', e.message); process.exit(1) })
