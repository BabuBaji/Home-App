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
  makePool, migrate, makeAdminAuth, requireRole, internalOnly, tryGet, publishRealtime, getSetting, parseToken,
} from '@homehelp/shared'
import {
  CATEGORIES, SERVICES_SEED, SERVICE_IMAGES, detailsFor, durationsFor,
  REFERRAL, TRUST_BADGES, COUPONS, applyCoupon, priceBreakdown,
} from './catalog-data.js'
import {
  loadActiveCampaigns, loadUsage, recordUsage, resolvePricing, rawDiscount, withinWindow, customerEligible,
} from './pricing-engine.js'

const PORT = Number(process.env.PORT || 4001)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5432/catalog'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const BOOKING_URL = (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')

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
    // Zone code (e.g. MDP001) + full 9-screen onboarding-wizard config (coverage,
    // apartments, services, capacity/SLA, pricing, working hours, holidays, team,
    // go-live toggles) persisted server-side as JSON.
    `ALTER TABLE zones ADD COLUMN IF NOT EXISTS code TEXT`,
    `ALTER TABLE zones ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'`,
    // ── Zone-operations entities (real tables; the admin "Operations" submenu manages these) ──
    `CREATE TABLE IF NOT EXISTS cities (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT true, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS clusters (
      id SERIAL PRIMARY KEY, zone_id INTEGER, name TEXT NOT NULL, manager TEXT DEFAULT '',
      color TEXT DEFAULT '#4F46E5', radius_km REAL DEFAULT 2.5, travel_min INTEGER DEFAULT 15,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS apartments (
      id SERIAL PRIMARY KEY, zone_id INTEGER, cluster_id INTEGER, name TEXT NOT NULL,
      type TEXT DEFAULT 'Apartment', builder TEXT DEFAULT '', units INTEGER DEFAULT 0,
      occupied INTEGER DEFAULT 0, pincode TEXT DEFAULT '', lat REAL, lng REAL, aov INTEGER DEFAULT 0,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS inventory (
      id SERIAL PRIMARY KEY, zone_id INTEGER, name TEXT NOT NULL, vendor TEXT DEFAULT '',
      stock INTEGER DEFAULT 0, reorder INTEGER DEFAULT 0, unit TEXT DEFAULT 'pcs',
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS zone_pricing (
      id SERIAL PRIMARY KEY, zone_id INTEGER NOT NULL, service_id TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0, discount INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT true
    )`,
    // Stores (dark-stores) inside a zone: a service point with a lat/lng centre + service radius.
    // Overlap/coverage between stores is guarded at create time (only super-admin may override).
    `CREATE TABLE IF NOT EXISTS stores (
      id SERIAL PRIMARY KEY, zone_id INTEGER, name TEXT NOT NULL, manager TEXT DEFAULT '',
      address TEXT DEFAULT '', pincode TEXT DEFAULT '', lat DOUBLE PRECISION, lng DOUBLE PRECISION,
      radius_km DOUBLE PRECISION NOT NULL DEFAULT 3, status TEXT NOT NULL DEFAULT 'active',
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // ── Dynamic Pricing Engine: campaigns (Zone / Customer / Coupon) ──
    // campaign_master is the authority; campaign_zone scopes it (no rows = all zones);
    // campaign_customer_rule holds segment/usage rules; coupon holds redeemable codes;
    // customer_campaign_usage is the per-customer redemption ledger.
    `CREATE TABLE IF NOT EXISTS campaign_master (
      campaign_id SERIAL PRIMARY KEY, campaign_name TEXT NOT NULL,
      campaign_type TEXT NOT NULL,                    -- 'zone' | 'customer' | 'coupon'
      discount_type TEXT NOT NULL DEFAULT 'flat',     -- 'flat' | 'percent'
      discount_value INTEGER NOT NULL DEFAULT 0,      -- ₹ (flat) or % (percent)
      max_discount INTEGER NOT NULL DEFAULT 0,        -- cap for percent (0 = no cap)
      min_subtotal INTEGER NOT NULL DEFAULT 0,        -- eligibility floor
      service_id TEXT NOT NULL DEFAULT '',            -- '' = all services
      category TEXT NOT NULL DEFAULT '',              -- '' = all categories
      duration_id TEXT NOT NULL DEFAULT '',           -- '' = all durations
      priority INTEGER NOT NULL DEFAULT 2,            -- 1 customer, 2 zone, 3 coupon
      stackable BOOLEAN NOT NULL DEFAULT false,
      starts DATE, ends DATE,
      status TEXT NOT NULL DEFAULT 'active',          -- 'active' | 'paused'
      banner_title TEXT NOT NULL DEFAULT '',          -- shown in customer Offers carousel
      banner_subtitle TEXT NOT NULL DEFAULT '',
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS campaign_zone (
      campaign_id INTEGER NOT NULL, zone_id INTEGER NOT NULL, PRIMARY KEY (campaign_id, zone_id)
    )`,
    `CREATE TABLE IF NOT EXISTS campaign_customer_rule (
      campaign_id INTEGER PRIMARY KEY,
      segment TEXT NOT NULL DEFAULT 'all',            -- all|first_order|second_order|birthday|winback|vip
      max_usage INTEGER NOT NULL DEFAULT 0,           -- per-customer cap (0 = unlimited)
      winback_days INTEGER NOT NULL DEFAULT 30,
      vip_min_orders INTEGER NOT NULL DEFAULT 10
    )`,
    `CREATE TABLE IF NOT EXISTS coupon (
      coupon_code TEXT PRIMARY KEY, campaign_id INTEGER NOT NULL,
      auto_apply BOOLEAN NOT NULL DEFAULT false,      -- true = engine applies without manual entry
      expiry DATE, usage_limit INTEGER NOT NULL DEFAULT 0, used_count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS customer_campaign_usage (
      id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL, campaign_id INTEGER NOT NULL,
      booking_id INTEGER, created TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (customer_id, campaign_id, booking_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ccu_cust_camp ON customer_campaign_usage (customer_id, campaign_id)`,
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
  // Seed serviceable cities (real table backing the Operations → Cities page + zone form).
  const cityCount = (await pool.query('SELECT COUNT(*)::int n FROM cities')).rows[0].n
  if (!cityCount) {
    const seed = [['Hyderabad', 'Telangana'], ['Bengaluru', 'Karnataka'], ['Mumbai', 'Maharashtra'], ['Delhi', 'Delhi'], ['Chennai', 'Tamil Nadu'], ['Pune', 'Maharashtra'], ['Kolkata', 'West Bengal'], ['Ahmedabad', 'Gujarat'], ['Jaipur', 'Rajasthan']]
    for (const [name, state] of seed) await pool.query('INSERT INTO cities (name, state) VALUES ($1, $2)', [name, state])
    console.log('[catalog] seeded', seed.length, 'cities')
  }
  await seedCampaigns()
  console.log(`[catalog] Postgres ready, seeded ${SERVICES_SEED.length} services`)
}

// One-time seed of the campaign tables so the pricing engine has real data on a fresh DB:
// migrate the legacy hardcoded COUPONS into campaign_master+coupon (nothing breaks), plus a demo
// Zone launch campaign on the seeded live zone and a First-Order customer campaign.
async function seedCampaigns() {
  const n = (await pool.query('SELECT COUNT(*)::int n FROM campaign_master')).rows[0].n
  if (n) return
  const insMaster = async (m) => (await pool.query(
    `INSERT INTO campaign_master (campaign_name,campaign_type,discount_type,discount_value,max_discount,min_subtotal,service_id,category,duration_id,priority,stackable,starts,ends,status,banner_title,banner_subtitle)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active',$14,$15) RETURNING campaign_id`,
    [m.name, m.type, m.discount_type || 'flat', m.discount_value || 0, m.max_discount || 0, m.min_subtotal || 0,
      m.service_id || '', m.category || '', m.duration_id || '', m.priority ?? 2, !!m.stackable,
      m.starts || null, m.ends || null, m.banner_title || '', m.banner_subtitle || ''])).rows[0].campaign_id
  // Coupons (type 'pct' → 'percent', 'flat' → 'flat'); priority 3, manual entry.
  for (const c of COUPONS) {
    const id = await insMaster({
      name: c.label, type: 'coupon', discount_type: c.type === 'pct' ? 'percent' : 'flat',
      discount_value: c.value, max_discount: c.max || 0, min_subtotal: c.min || 0, priority: 3,
      banner_title: c.code, banner_subtitle: c.label,
    })
    await pool.query('INSERT INTO coupon (coupon_code,campaign_id,auto_apply,usage_limit) VALUES ($1,$2,false,0)', [c.code, id])
  }
  // First-Order customer campaign: 50% off up to ₹100, all zones, 1 use/customer.
  const foId = await insMaster({
    name: 'First Order — 50% OFF', type: 'customer', discount_type: 'percent', discount_value: 50,
    max_discount: 100, priority: 1, banner_title: '50% OFF your first booking', banner_subtitle: 'Up to ₹100 off — new customers',
  })
  await pool.query('INSERT INTO campaign_customer_rule (campaign_id,segment,max_usage) VALUES ($1,$2,1)', [foId, 'first_order'])
  // Demo Zone launch campaign on the seeded live zone (₹70 off, if a live zone exists).
  const live = (await pool.query("SELECT id FROM zones WHERE status='live' ORDER BY id LIMIT 1")).rows[0]
  if (live) {
    const zId = await insMaster({
      name: 'Zone Launch — ₹70 OFF', type: 'zone', discount_type: 'flat', discount_value: 70, min_subtotal: 199,
      priority: 2, banner_title: '₹70 OFF launch offer', banner_subtitle: 'Limited-time in your area',
    })
    await pool.query('INSERT INTO campaign_zone (campaign_id,zone_id) VALUES ($1,$2)', [zId, live.id])
  }
  console.log('[catalog] seeded campaigns (coupons + first-order + zone launch)')
}

const withImage = (s) => ({ ...s, available: !!s.available, image: SERVICE_IMAGES[s.id] || null })

// Overlay a zone's price/discount onto a raw catalogue service. `price` becomes the discounted
// "from" price the customer pays; `listPrice` is the pre-discount price (for strikethrough).
function applyZonePrice(s, zmap = {}) {
  const zp = zmap[s.id]
  const base = zp && zp.price > 0 ? zp.price : s.price
  const off = zp ? Math.min(90, Math.max(0, zp.discount || 0)) : 0
  const price = off > 0 ? Math.round(base * (1 - off / 100)) : base
  return { ...s, price, listPrice: base, zoneDiscount: off }
}
async function allServices(zmap = {}) {
  const { rows } = await pool.query('SELECT id,name,icon,price,category,available FROM services ORDER BY sort, name')
  return rows.map((s) => withImage(applyZonePrice(s, zmap)))
}
async function getService(id, zmap = {}) {
  const { rows } = await pool.query('SELECT id,name,icon,price,category,available FROM services WHERE id=$1', [id])
  return rows[0] ? withImage(applyZonePrice(rows[0], zmap)) : null
}
async function broadcastServices() {
  publishRealtime(REDIS_URL, null, 'services:update', await allServices())
}
// service-to-service: booking counts live in the booking service.
const bookingCounts = () => tryGet(BOOKING_URL, '/api/internal/service-booking-counts', {})

/* ═══════════ Dynamic Pricing Engine wiring ═══════════
   The catalog is the authoritative pricing engine. `zone_pricing.price` is the zone base-price
   override (struck-through list price); ALL discounting flows through campaigns (pricing-engine.js).
   The legacy per-service `zone_pricing.discount` is honoured as an implicit "zone campaign" so
   existing configured discounts keep working alongside admin-created campaigns. */

const rawServiceRow = async (id) =>
  (await pool.query('SELECT id,name,icon,price,category,available FROM services WHERE id=$1', [id])).rows[0] || null
const zoneBase = (s, zmap) => (zmap[s.id] && zmap[s.id].price > 0 ? zmap[s.id].price : s.price)

// The customer id from a (possibly absent) Bearer token — no network hop.
function customerIdFromReq(req) { const id = parseToken(req); return Number.isFinite(id) ? id : null }

// Turn any legacy zone_pricing.discount rows into synthetic per-service zone campaigns so they
// price through the same engine (string campaign_id → excluded from the real usage ledger).
function syntheticZoneCampaigns(zmap = {}) {
  const out = []
  for (const [sid, zp] of Object.entries(zmap)) {
    const off = Math.min(90, Math.max(0, zp.discount || 0))
    if (off > 0) out.push({
      campaign_id: `zp-${sid}`, campaign_name: 'Zone price discount', campaign_type: 'zone',
      discount_type: 'percent', discount_value: off, max_discount: 0, min_subtotal: 0,
      service_id: sid, category: '', duration_id: '', priority: 2, stackable: false,
      starts: null, ends: null, status: 'active', banner_title: '', banner_subtitle: '', rule: null, coupon: null,
    })
  }
  return out
}
// All campaigns that can price this zone for this customer (drops customer campaigns when anonymous).
async function campaignsForZone(zoneId, zmap, customerId) {
  const all = [...(await loadActiveCampaigns(pool, { zoneId })), ...syntheticZoneCampaigns(zmap)]
  return customerId ? all : all.filter((c) => c.campaign_type !== 'customer')
}
// Per-customer eligibility signals: order counts (booking svc) + dob (auth svc) + usage (local).
async function buildCtx(customerId) {
  if (!customerId) return { customerId: null, completedOrders: 0, lastCompletedAt: null, dob: null, usage: {} }
  const [stats, userRes, usage] = await Promise.all([
    tryGet(BOOKING_URL, `/api/internal/customer-stats?user_id=${customerId}`, {}),
    tryGet(AUTH_URL, `/api/internal/users/${customerId}`, {}),
    loadUsage(pool, customerId),
  ])
  const u = (userRes && userRes.user) || {}
  return {
    customerId, usage,
    completedOrders: Number((stats && stats.completedOrders) || 0),
    lastCompletedAt: (stats && stats.lastCompletedAt) || null,
    dob: u.dob || null,
  }
}

// Customer catalogue: each service priced (60-min base) through the engine for this zone + customer.
async function catalogueFor(zoneId, customerId) {
  const zmap = await zonePriceMap(zoneId)
  const [campaigns, ctx, { rows }] = await Promise.all([
    campaignsForZone(zoneId, zmap, customerId), buildCtx(customerId),
    pool.query('SELECT id,name,icon,price,category,available FROM services ORDER BY sort, name'),
  ])
  return rows.map((s) => {
    const r = resolvePricing({ items: [{ serviceId: s.id, category: s.category, durationId: '60m', listPrice: zoneBase(s, zmap) }], campaigns, ctx, applyCoupons: false })
    const it = r.items[0]
    return withImage({ ...s, price: it.price, listPrice: it.listPrice, zoneDiscount: it.zoneDiscount })
  })
}

// Single service with per-duration engine pricing.
async function serviceDetail(id, zoneId, customerId) {
  const s = await rawServiceRow(id)
  if (!s) return null
  const zmap = await zonePriceMap(zoneId)
  const [campaigns, ctx] = await Promise.all([campaignsForZone(zoneId, zmap, customerId), buildCtx(customerId)])
  const base = zoneBase(s, zmap)
  const details = detailsFor(s.id, base)
  const durations = details.durations.map((d) => {
    const r = resolvePricing({ items: [{ serviceId: s.id, category: s.category, durationId: d.id, listPrice: d.price }], campaigns, ctx, applyCoupons: false })
    const it = r.items[0]
    return { ...d, listPrice: it.listPrice, price: it.price, original: it.discount > 0 ? d.price : d.original }
  })
  const off = durations.find((d) => d.id === '60m')?.zoneDiscount || 0
  return withImage({ ...s, ...details, price: durations[0].price, listPrice: durations[0].listPrice, durations, zoneDiscount: durations[0].price < durations[0].listPrice ? Math.round((1 - durations[0].price / durations[0].listPrice) * 100) : off })
}

// Authoritative cart pricing → the shape the customer/booking flow expects (items + bill breakdown).
async function priceCart({ items: rawItems, coupon, zoneId, customerId, applyCoupons = true }) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return { error: 'Select at least one service' }
  const zmap = await zonePriceMap(zoneId)
  const normItems = []
  for (const it of rawItems) {
    const s = await rawServiceRow(it.id)
    if (!s || !s.available) return { error: `"${it.id}" is not available` }
    const durs = durationsFor(zoneBase(s, zmap))
    const dur = durs.find((d) => d.id === (it.durationId || '60m')) || durs[0]
    normItems.push({ serviceId: s.id, name: s.name, icon: s.icon, category: s.category, durationId: dur.id, durationLabel: dur.label, listPrice: dur.price })
  }
  const [campaigns, ctx] = await Promise.all([campaignsForZone(zoneId, zmap, customerId), buildCtx(customerId)])
  const r = resolvePricing({ items: normItems, campaigns, ctx, couponCode: coupon, applyCoupons })
  const items = r.items.map((it) => ({ id: it.serviceId, name: it.name, icon: it.icon, category: it.category, durationId: it.durationId, durationLabel: it.durationLabel, price: it.price, listPrice: it.listPrice, zoneDiscount: it.zoneDiscount }))
  return { items, subtotal: r.subtotal, discount: r.discount, total: r.total, coupon: r.coupon, savings: r.savings, appliedCampaignIds: r.appliedCampaignIds }
}
async function quote({ items, coupon, pincode, customerId = null }) {
  const zoneId = await zoneIdForPincode(pincode)
  const q = await priceCart({ items, coupon, zoneId, customerId, applyCoupons: true })
  if (q.error) return { status: 409, body: q }
  return {
    status: 200,
    body: { items: q.items, coupon: q.coupon, ...priceBreakdown(q.subtotal, q.discount), savings: q.savings, appliedCampaignIds: q.appliedCampaignIds },
  }
}

// Validate a single manual coupon against the DB (window, usage cap, min subtotal) → discount.
async function validateCouponDb(code, subtotal) {
  if (!code.trim()) return { error: 'Enter a coupon code' }
  const { rows } = await pool.query(
    `SELECT c.coupon_code, c.expiry, c.usage_limit, c.used_count, m.*
       FROM coupon c JOIN campaign_master m ON m.campaign_id = c.campaign_id
      WHERE UPPER(c.coupon_code) = UPPER($1)`, [code.trim()])
  const row = rows[0]
  if (!row || row.status !== 'active' || !withinWindow(row)) return { error: 'Invalid coupon code' }
  if (row.expiry && new Date().toISOString().slice(0, 10) > String(row.expiry).slice(0, 10)) return { error: 'This coupon has expired' }
  if (row.usage_limit > 0 && row.used_count >= row.usage_limit) return { error: 'This coupon is no longer available' }
  if (subtotal < (row.min_subtotal || 0)) return { error: `Add ₹${(row.min_subtotal || 0) - subtotal} more to use ${row.coupon_code.toUpperCase()}` }
  const discount = rawDiscount(row, subtotal)
  if (discount <= 0) return { error: 'Invalid coupon code' }
  return { code: row.coupon_code.toUpperCase(), discount, label: row.banner_subtitle || row.banner_title || row.coupon_code }
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'catalog', ok: true }))

/* ---------- customer catalogue (public) ---------- */
// `?pincode=` resolves the zone; the Bearer token (optional) resolves the customer so prices
// reflect that zone's overrides + eligible campaigns (zone + customer offers).
app.get('/api/services', async (req, res) => {
  const zoneId = await zoneIdForPincode(req.query.pincode)
  res.json({ categories: CATEGORIES, services: await catalogueFor(zoneId, customerIdFromReq(req)) })
})
app.get('/api/services/:id', async (req, res) => {
  const zoneId = await zoneIdForPincode(req.query.pincode)
  const s = await serviceDetail(req.params.id, zoneId, customerIdFromReq(req))
  if (!s) return res.status(404).json({ error: 'Service not found' })
  res.json(s)
})

/* ---------- pricing / coupons / home ---------- */
app.post('/api/quote', async (req, res) => {
  const r = await quote({ ...(req.body || {}), customerId: customerIdFromReq(req) })
  res.status(r.status).json(r.body)
})
// Public coupon list (manual-entry codes) for the checkout "available offers" panel — from the DB,
// falling back to the legacy static list only if the coupon table is empty.
app.get('/api/coupons', async (_q, res) => {
  const { rows } = await pool.query(
    `SELECT c.coupon_code, c.expiry, m.discount_type, m.discount_value, m.max_discount, m.min_subtotal, m.banner_subtitle, m.banner_title
       FROM coupon c JOIN campaign_master m ON m.campaign_id = c.campaign_id
      WHERE m.status='active' AND c.auto_apply = false ORDER BY m.min_subtotal`)
  if (!rows.length) return res.json(COUPONS)
  res.json(rows.map((r) => ({
    code: r.coupon_code, type: r.discount_type === 'percent' ? 'pct' : 'flat', value: r.discount_value,
    max: r.max_discount || undefined, min: r.min_subtotal, label: r.banner_subtitle || r.banner_title || r.coupon_code,
  })))
})
app.post('/api/coupons/validate', async (req, res) => {
  const r = await validateCouponDb(String(req.body?.code || ''), Number(req.body?.subtotal) || 0)
  if (r.error) return res.status(400).json(r)
  res.json(r)
})
app.get('/api/home', (_q, res) => res.json({ referral: REFERRAL, trust: TRUST_BADGES, instantEta: 5 }))
app.get('/api/referral', (_q, res) => res.json(REFERRAL))

// Customer Offers carousel: campaigns with a banner, scoped to the caller's zone + eligibility.
app.get('/api/offers', async (req, res) => {
  const zoneId = await zoneIdForPincode(req.query.pincode)
  const customerId = customerIdFromReq(req)
  const zmap = await zonePriceMap(zoneId)
  const [campaigns, ctx] = await Promise.all([campaignsForZone(zoneId, zmap, customerId), buildCtx(customerId)])
  const now = new Date()
  const offers = campaigns
    .filter((c) => c.banner_title && withinWindow(c, now) && (c.campaign_type !== 'customer' || customerEligible(c, ctx)))
    .map((c) => ({
      id: c.campaign_id, type: c.campaign_type, title: c.banner_title, subtitle: c.banner_subtitle,
      badge: c.discount_type === 'percent' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`,
      code: c.coupon ? c.coupon.coupon_code : null, serviceId: c.service_id || null, category: c.category || null,
    }))
  res.json(offers)
})

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

// Resolve which zone covers a pincode, and load that zone's price/discount overlay from zone_pricing
// (the authority for zone pricing — kept in sync from the onboarding wizard's config on save).
async function zoneIdForPincode(pincode) {
  const pin = String(pincode || '').trim()
  if (!/^\d{6}$/.test(pin)) return null
  const { rows } = await pool.query('SELECT id, pincodes FROM zones')
  const z = rows.find((r) => normPins(r.pincodes).includes(pin))
  return z ? z.id : null
}
async function zonePriceMap(zoneId) {
  if (!zoneId) return {}
  const { rows } = await pool.query('SELECT service_id, price, discount, active FROM zone_pricing WHERE zone_id=$1', [zoneId])
  const m = {}
  for (const r of rows) if (r.active !== false) m[r.service_id] = { price: Number(r.price) || 0, discount: Number(r.discount) || 0 }
  return m
}
// Mirror the wizard's config (pricing + discounts for the selected services) into zone_pricing,
// so the customer-facing price resolution has a single authoritative table to read.
async function syncZonePricing(zoneId, config) {
  const services = Array.isArray(config?.services) ? config.services : []
  const pricing = config?.pricing || {}, discounts = config?.discounts || {}
  await pool.query('DELETE FROM zone_pricing WHERE zone_id=$1', [zoneId])
  for (const sid of services) {
    await pool.query('INSERT INTO zone_pricing (zone_id, service_id, price, discount, active) VALUES ($1,$2,$3,$4,true)',
      [zoneId, sid, Math.round(Number(pricing[sid]) || 0), Math.round(Number(discounts[sid]) || 0)])
  }
}

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
// Booking service prices bookings authoritatively through here (body may carry `customerId` so
// per-customer campaign eligibility resolves).
app.post('/api/internal/price', internalOnly, async (req, res) => { const r = await quote(req.body || {}); res.status(r.status).json(r.body) })
// Booking service records campaign redemptions here after a booking is created.
app.post('/api/internal/campaign-usage', internalOnly, async (req, res) => {
  const b = req.body || {}
  await recordUsage(pool, {
    customerId: Number(b.customerId) || null, bookingId: Number(b.bookingId) || null,
    campaignIds: Array.isArray(b.campaignIds) ? b.campaignIds : [], couponCode: b.couponCode || null,
  })
  res.json({ ok: true })
})

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
const zoneOut = (z) => ({ ...z, config: z.config || {}, pincodeList: normPins(z.pincodes), pincodeCount: normPins(z.pincodes).length })
app.get('/api/admin/zones', adminAuth, async (_q, res) => {
  const { rows } = await pool.query('SELECT * FROM zones ORDER BY state, city, name')
  res.json(rows.map(zoneOut))
})
app.post('/api/admin/zones', adminAuth, requireRole('admin'), async (req, res) => {
  const b = req.body || {}
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Zone name is required' })
  const status = ['planned', 'live', 'paused'].includes(b.status) ? b.status : 'planned'
  const { rows } = await pool.query(
    'INSERT INTO zones (name,state,city,pincodes,status,sla_minutes,code,config) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *',
    [String(b.name).trim(), String(b.state || '').trim(), String(b.city || '').trim(), normPins(b.pincodes).join(','), status,
      b.slaMinutes ? Number(b.slaMinutes) : null, b.code ? String(b.code).trim() : null, JSON.stringify(b.config || {})])
  await syncZonePricing(rows[0].id, b.config || {})
  res.status(201).json(zoneOut(rows[0]))
})
app.patch('/api/admin/zones/:id', adminAuth, requireRole('admin'), async (req, res) => {
  const cur = await pool.query('SELECT * FROM zones WHERE id=$1', [req.params.id])
  if (!cur.rowCount) return res.status(404).json({ error: 'Zone not found' })
  const z = cur.rows[0], b = req.body || {}
  await pool.query('UPDATE zones SET name=$1,state=$2,city=$3,pincodes=$4,status=$5,sla_minutes=$6,code=$7,config=$8::jsonb WHERE id=$9', [
    b.name ?? z.name, b.state ?? z.state, b.city ?? z.city,
    b.pincodes !== undefined ? normPins(b.pincodes).join(',') : z.pincodes,
    b.status && ['planned', 'live', 'paused'].includes(b.status) ? b.status : z.status,
    b.slaMinutes !== undefined ? (b.slaMinutes ? Number(b.slaMinutes) : null) : z.sla_minutes,
    b.code !== undefined ? (b.code ? String(b.code).trim() : null) : z.code,
    b.config !== undefined ? JSON.stringify(b.config) : JSON.stringify(z.config || {}), req.params.id])
  await syncZonePricing(Number(req.params.id), b.config !== undefined ? b.config : (z.config || {}))
  res.json(zoneOut((await pool.query('SELECT * FROM zones WHERE id=$1', [req.params.id])).rows[0]))
})
app.delete('/api/admin/zones/:id', adminAuth, requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM zones WHERE id=$1', [req.params.id])
  res.json({ ok: true })
})

/* ───────── Admin: Campaigns (Dynamic Pricing Engine) ─────────
   One handler owns campaign_master + its children (campaign_zone / campaign_customer_rule / coupon).
   `zoneIds` empty = all zones; `rule` set for customer campaigns; `coupon` set for coupon campaigns. */
const CM_COLS = ['campaign_name', 'campaign_type', 'discount_type', 'discount_value', 'max_discount',
  'min_subtotal', 'service_id', 'category', 'duration_id', 'priority', 'stackable', 'starts', 'ends',
  'status', 'banner_title', 'banner_subtitle']
const cmDefaults = { campaign_type: 'zone', discount_type: 'flat', discount_value: 0, max_discount: 0, min_subtotal: 0, service_id: '', category: '', duration_id: '', priority: 2, stackable: false, starts: null, ends: null, status: 'active', banner_title: '', banner_subtitle: '' }

async function syncCampaignChildren(id, b) {
  if (b.zoneIds !== undefined) {
    await pool.query('DELETE FROM campaign_zone WHERE campaign_id=$1', [id])
    for (const z of (Array.isArray(b.zoneIds) ? b.zoneIds : [])) {
      if (Number.isFinite(Number(z))) await pool.query('INSERT INTO campaign_zone (campaign_id,zone_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, Number(z)])
    }
  }
  if (b.rule !== undefined) {
    await pool.query('DELETE FROM campaign_customer_rule WHERE campaign_id=$1', [id])
    const r = b.rule || {}
    if (r.segment) await pool.query(
      'INSERT INTO campaign_customer_rule (campaign_id,segment,max_usage,winback_days,vip_min_orders) VALUES ($1,$2,$3,$4,$5)',
      [id, r.segment, Number(r.max_usage) || 0, Number(r.winback_days) || 30, Number(r.vip_min_orders) || 10])
  }
  if (b.coupon !== undefined) {
    await pool.query('DELETE FROM coupon WHERE campaign_id=$1', [id])
    const c = b.coupon || {}
    if (c.coupon_code) await pool.query(
      'INSERT INTO coupon (coupon_code,campaign_id,auto_apply,expiry,usage_limit) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (coupon_code) DO UPDATE SET campaign_id=EXCLUDED.campaign_id,auto_apply=EXCLUDED.auto_apply,expiry=EXCLUDED.expiry,usage_limit=EXCLUDED.usage_limit',
      [String(c.coupon_code).trim().toUpperCase(), id, !!c.auto_apply, c.expiry || null, Number(c.usage_limit) || 0])
  }
}

app.get('/api/admin/campaigns', adminAuth, async (_q, res) => {
  const { rows } = await pool.query('SELECT * FROM campaign_master ORDER BY priority, campaign_id')
  const ids = rows.map((r) => r.campaign_id)
  if (!ids.length) return res.json([])
  const [zones, rules, coupons, usage] = await Promise.all([
    pool.query('SELECT campaign_id, zone_id FROM campaign_zone WHERE campaign_id = ANY($1)', [ids]),
    pool.query('SELECT * FROM campaign_customer_rule WHERE campaign_id = ANY($1)', [ids]),
    pool.query('SELECT * FROM coupon WHERE campaign_id = ANY($1)', [ids]),
    pool.query('SELECT campaign_id, COUNT(*)::int n FROM customer_campaign_usage WHERE campaign_id = ANY($1) GROUP BY campaign_id', [ids]),
  ])
  const zBy = {}; for (const z of zones.rows) (zBy[z.campaign_id] ||= []).push(z.zone_id)
  const rBy = Object.fromEntries(rules.rows.map((r) => [r.campaign_id, r]))
  const cBy = Object.fromEntries(coupons.rows.map((c) => [c.campaign_id, c]))
  const uBy = Object.fromEntries(usage.rows.map((u) => [u.campaign_id, u.n]))
  res.json(rows.map((m) => ({ ...m, zoneIds: zBy[m.campaign_id] || [], rule: rBy[m.campaign_id] || null, coupon: cBy[m.campaign_id] || null, usedCount: uBy[m.campaign_id] || 0 })))
})
app.post('/api/admin/campaigns', adminAuth, requireRole('manager'), async (req, res) => {
  const b = req.body || {}
  if (!b.campaign_name || !String(b.campaign_name).trim()) return res.status(400).json({ error: 'Campaign name is required' })
  if (!['zone', 'customer', 'coupon'].includes(b.campaign_type)) return res.status(400).json({ error: 'Invalid campaign type' })
  const vals = CM_COLS.map((c) => (b[c] !== undefined ? b[c] : cmDefaults[c]))
  const ph = CM_COLS.map((_, i) => `$${i + 1}`).join(',')
  const { rows } = await pool.query(`INSERT INTO campaign_master (${CM_COLS.join(',')}) VALUES (${ph}) RETURNING campaign_id`, vals)
  const id = rows[0].campaign_id
  await syncCampaignChildren(id, b)
  res.status(201).json({ ok: true, campaign_id: id })
})
app.patch('/api/admin/campaigns/:id', adminAuth, requireRole('manager'), async (req, res) => {
  const id = Number(req.params.id), b = req.body || {}
  const cur = (await pool.query('SELECT 1 FROM campaign_master WHERE campaign_id=$1', [id])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Campaign not found' })
  const cols = CM_COLS.filter((c) => b[c] !== undefined)
  if (cols.length) {
    const set = cols.map((c, i) => `${c}=$${i + 1}`).join(',')
    await pool.query(`UPDATE campaign_master SET ${set} WHERE campaign_id=$${cols.length + 1}`, [...cols.map((c) => b[c]), id])
  }
  await syncCampaignChildren(id, b)
  res.json({ ok: true })
})
app.delete('/api/admin/campaigns/:id', adminAuth, requireRole('manager'), async (req, res) => {
  const id = Number(req.params.id)
  await pool.query('DELETE FROM campaign_zone WHERE campaign_id=$1', [id])
  await pool.query('DELETE FROM campaign_customer_rule WHERE campaign_id=$1', [id])
  await pool.query('DELETE FROM coupon WHERE campaign_id=$1', [id])
  await pool.query('DELETE FROM campaign_master WHERE campaign_id=$1', [id])
  res.json({ ok: true })
})
app.get('/api/admin/campaigns/:id/usage', adminAuth, async (req, res) => {
  const id = Number(req.params.id)
  const [total, recent] = await Promise.all([
    pool.query('SELECT COUNT(*)::int n, COUNT(DISTINCT customer_id)::int customers FROM customer_campaign_usage WHERE campaign_id=$1', [id]),
    pool.query('SELECT customer_id, booking_id, created FROM customer_campaign_usage WHERE campaign_id=$1 ORDER BY created DESC LIMIT 50', [id]),
  ])
  res.json({ total: total.rows[0].n, customers: total.rows[0].customers, recent: recent.rows })
})

/* ───────── Stores (dark-stores) with a coverage / overlap guard ─────────
   A store is a service point: a lat/lng centre + a service radius. Two stores "overlap" when the
   distance between centres < sum of radii; a point is "already covered" when it sits inside an
   existing store's radius. Creating a covered/overlapping store is blocked unless the caller is a
   super-admin passing `override: true`. */
const R_EARTH_KM = 6371
const haversineKm = (aLat, aLng, bLat, bLng) => {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)))
}
// Area (km²) of the lens where two circles (radii r,R, centres d apart) overlap.
const overlapAreaKm2 = (d, r, R) => {
  if (d >= r + R) return 0
  if (d <= Math.abs(R - r)) return Math.PI * Math.min(r, R) ** 2
  const r2 = r * r, R2 = R * R, d2 = d * d
  const a1 = r2 * Math.acos((d2 + r2 - R2) / (2 * d * r))
  const a2 = R2 * Math.acos((d2 + R2 - r2) / (2 * d * R))
  const a3 = 0.5 * Math.sqrt(Math.max(0, (-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R)))
  return a1 + a2 - a3
}
async function analyseStore(lat, lng, radiusKm, excludeId = null) {
  const { rows } = await pool.query('SELECT id,name,manager,lat,lng,radius_km,status,pincode FROM stores WHERE lat IS NOT NULL AND lng IS NOT NULL')
  const nearby = [], coveredBy = [], overlaps = []
  for (const s of rows) {
    if (excludeId && s.id === Number(excludeId)) continue
    const dist = haversineKm(lat, lng, s.lat, s.lng)
    const row = { id: s.id, name: s.name, manager: s.manager, lat: s.lat, lng: s.lng, radiusKm: s.radius_km, status: s.status, distanceKm: Math.round(dist * 100) / 100 }
    nearby.push(row)
    if (dist <= s.radius_km) coveredBy.push(row)                                  // centre inside their coverage
    if (radiusKm > 0 && dist < s.radius_km + radiusKm)                            // service circles overlap
      overlaps.push({ ...row, overlapAreaKm2: Math.round(overlapAreaKm2(dist, radiusKm, s.radius_km) * 100) / 100 })
  }
  nearby.sort((a, b) => a.distanceKm - b.distanceKm)
  return { nearby, coveredBy, overlaps }
}

app.get('/api/admin/stores', adminAuth, async (req, res) => {
  const zone = req.query.zone_id ? Number(req.query.zone_id) : null
  const { rows } = zone != null
    ? await pool.query('SELECT * FROM stores WHERE zone_id=$1 ORDER BY id', [zone])
    : await pool.query('SELECT * FROM stores ORDER BY id')
  res.json(rows)
})
// Coverage/overlap preview for a candidate centre — the wizard calls this before creating.
app.get('/api/admin/stores/check', adminAuth, async (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng), radiusKm = Number(req.query.radiusKm) || 0
  if (!isFinite(lat) || !isFinite(lng)) return res.status(400).json({ error: 'lat/lng required' })
  const a = await analyseStore(lat, lng, radiusKm, req.query.exclude_id)
  res.json({ ...a, covered: a.coveredBy.length > 0, overlapping: a.overlaps.length > 0, canOverride: req.admin?.role === 'super' })
})
app.post('/api/admin/stores', adminAuth, requireRole('manager'), async (req, res) => {
  const b = req.body || {}
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Store name is required' })
  const lat = Number(b.lat), lng = Number(b.lng), radiusKm = Number(b.radius_km) || 3
  if (!isFinite(lat) || !isFinite(lng)) return res.status(400).json({ error: 'A valid location (lat/lng) is required' })
  const a = await analyseStore(lat, lng, radiusKm)
  const blocked = a.coveredBy.length > 0 || a.overlaps.length > 0
  const isSuper = req.admin?.role === 'super'
  if (blocked && !(isSuper && b.override)) {
    return res.status(409).json({
      error: a.coveredBy.length ? 'This location is already covered by an existing store.' : 'This store overlaps an existing store.',
      covered: a.coveredBy.length > 0, overlapping: a.overlaps.length > 0, coveredBy: a.coveredBy, overlaps: a.overlaps, canOverride: isSuper,
    })
  }
  const { rows } = await pool.query(
    `INSERT INTO stores (zone_id,name,manager,address,pincode,lat,lng,radius_km,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.zone_id ?? null, String(b.name).trim(), String(b.manager || '').trim(), String(b.address || '').trim(),
      String(b.pincode || '').trim(), lat, lng, radiusKm, ['active', 'paused', 'planned'].includes(b.status) ? b.status : 'active'])
  res.status(201).json({ ...rows[0], overridden: blocked })
})
app.patch('/api/admin/stores/:id', adminAuth, requireRole('manager'), async (req, res) => {
  const b = req.body || {}
  const cur = (await pool.query('SELECT * FROM stores WHERE id=$1', [Number(req.params.id)])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Store not found' })
  const lat = b.lat !== undefined ? Number(b.lat) : cur.lat
  const lng = b.lng !== undefined ? Number(b.lng) : cur.lng
  const radiusKm = b.radius_km !== undefined ? Number(b.radius_km) : cur.radius_km
  if (b.lat !== undefined || b.lng !== undefined || b.radius_km !== undefined) {
    const a = await analyseStore(lat, lng, radiusKm, cur.id)
    const blocked = a.coveredBy.length > 0 || a.overlaps.length > 0
    if (blocked && !(req.admin?.role === 'super' && b.override))
      return res.status(409).json({ error: 'This location overlaps an existing store.', coveredBy: a.coveredBy, overlaps: a.overlaps, canOverride: req.admin?.role === 'super' })
  }
  const { rows } = await pool.query(
    `UPDATE stores SET name=$1,manager=$2,address=$3,pincode=$4,lat=$5,lng=$6,radius_km=$7,status=$8,zone_id=$9 WHERE id=$10 RETURNING *`,
    [b.name ?? cur.name, b.manager ?? cur.manager, b.address ?? cur.address, b.pincode ?? cur.pincode,
      lat, lng, radiusKm, b.status ?? cur.status, b.zone_id ?? cur.zone_id, cur.id])
  res.json(rows[0])
})
app.delete('/api/admin/stores/:id', adminAuth, requireRole('manager'), async (req, res) => {
  await pool.query('DELETE FROM stores WHERE id=$1', [Number(req.params.id)])
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

/* ───────── Zone-operations entities: generic real CRUD (cities / clusters / apartments / inventory / zone_pricing) ───────── */
// column allow-lists per table so we never interpolate arbitrary keys into SQL.
const ENTITY = {
  cities: { cols: ['name', 'state', 'active'], zoned: false },
  clusters: { cols: ['zone_id', 'name', 'manager', 'color', 'radius_km', 'travel_min'], zoned: true },
  apartments: { cols: ['zone_id', 'cluster_id', 'name', 'type', 'builder', 'units', 'occupied', 'pincode', 'lat', 'lng', 'aov'], zoned: true },
  inventory: { cols: ['zone_id', 'name', 'vendor', 'stock', 'reorder', 'unit'], zoned: true },
  zone_pricing: { cols: ['zone_id', 'service_id', 'price', 'discount', 'active'], zoned: true },
}
function entityRoutes(path, table) {
  const def = ENTITY[table]
  app.get(`/api/admin/${path}`, adminAuth, async (req, res) => {
    const zone = req.query.zone_id ? Number(req.query.zone_id) : null
    const { rows } = zone != null && def.zoned
      ? await pool.query(`SELECT * FROM ${table} WHERE zone_id=$1 ORDER BY id`, [zone])
      : await pool.query(`SELECT * FROM ${table} ORDER BY id`)
    res.json(rows)
  })
  app.post(`/api/admin/${path}`, adminAuth, requireRole('manager'), async (req, res) => {
    const b = req.body || {}
    const cols = def.cols.filter((c) => b[c] !== undefined)
    if (!cols.length) return res.status(400).json({ error: 'No fields provided' })
    const vals = cols.map((c) => b[c])
    const ph = cols.map((_, i) => `$${i + 1}`).join(',')
    const { rows } = await pool.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals)
    res.status(201).json(rows[0])
  })
  app.patch(`/api/admin/${path}/:id`, adminAuth, requireRole('manager'), async (req, res) => {
    const b = req.body || {}
    const cols = def.cols.filter((c) => b[c] !== undefined)
    if (!cols.length) return res.json({ ok: true })
    const set = cols.map((c, i) => `${c}=$${i + 1}`).join(',')
    const { rows } = await pool.query(`UPDATE ${table} SET ${set} WHERE id=$${cols.length + 1} RETURNING *`, [...cols.map((c) => b[c]), Number(req.params.id)])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  })
  app.delete(`/api/admin/${path}/:id`, adminAuth, requireRole('manager'), async (req, res) => {
    await pool.query(`DELETE FROM ${table} WHERE id=$1`, [Number(req.params.id)])
    res.json({ ok: true })
  })
}
entityRoutes('cities', 'cities')
entityRoutes('clusters', 'clusters')
entityRoutes('apartments', 'apartments')
entityRoutes('inventory', 'inventory')
entityRoutes('zone-pricing', 'zone_pricing')

/* Real per-zone operations metrics, aggregated from live DB (apartments, inventory, workers,
 * bookings) — powers the dashboards with real numbers instead of derived estimates. */
const WORKER_URL = (process.env.WORKER_URL || 'http://localhost:4004').replace(/\/$/, '')
app.get('/api/admin/zones/:id/metrics', adminAuth, async (req, res) => {
  const zoneId = Number(req.params.id)
  const zoneRow = (await pool.query('SELECT * FROM zones WHERE id=$1', [zoneId])).rows[0]
  if (!zoneRow) return res.status(404).json({ error: 'Zone not found' })
  const [apts, inv] = await Promise.all([
    pool.query('SELECT COUNT(*)::int n, COALESCE(SUM(units),0)::int units, COALESCE(SUM(occupied),0)::int occupied FROM apartments WHERE zone_id=$1', [zoneId]),
    pool.query('SELECT COUNT(*)::int n, COUNT(*) FILTER (WHERE stock < reorder)::int low FROM inventory WHERE zone_id=$1', [zoneId]),
  ])
  // Real workers assigned to this zone (from the worker service).
  // Real figures: bookings + worker-status + ops charts, all from live services.
  const [bstats, ws, ops] = await Promise.all([
    tryGet(BOOKING_URL, '/api/internal/zone-metrics', []),
    tryGet(WORKER_URL, `/internal/worker-status?zone_id=${zoneId}`, {}),
    tryGet(BOOKING_URL, `/api/internal/ops-stats?zone_id=${zoneId}`, {}),
  ])
  const b = (Array.isArray(bstats) ? bstats : []).find((x) => Number(x.zone_id) === zoneId) || {}
  const svcNames = Object.fromEntries((await pool.query('SELECT id, name FROM services')).rows.map((s) => [s.id, s.name]))
  const topServices = (ops.topServices || []).slice(0, 6).map((t) => ({ name: svcNames[t.id] || t.id, count: t.count }))
  res.json({
    zoneId, apartments: apts.rows[0].n, units: apts.rows[0].units, occupied: apts.rows[0].occupied,
    inventoryItems: inv.rows[0].n, lowStock: inv.rows[0].low,
    workers: ws.total || 0, online: ws.online || 0, busy: ws.busy || 0, offline: ws.offline || 0,
    orders: b.orders || 0, revenue: b.revenue || 0, completed: b.completed || 0,
    cancelled: b.cancelled || 0, pending: b.pending || 0, ordersTotal: b.orders_total || 0, revenueTotal: b.revenue_total || 0,
    rating: b.rating || 0, trend: ops.trend || [], topServices, recent: ops.recent || [],
  })
})
// Global operational overview (trend / revenue / top-services / worker-status / rating) for
// the admin all-zones dashboard — all real from the booking + worker services.
app.get('/api/admin/ops-overview', adminAuth, async (_q, res) => {
  const [ops, ws] = await Promise.all([
    tryGet(BOOKING_URL, '/api/internal/ops-stats', {}),
    tryGet(WORKER_URL, '/internal/worker-status', {}),
  ])
  const svcNames = Object.fromEntries((await pool.query('SELECT id, name FROM services')).rows.map((s) => [s.id, s.name]))
  const topServices = (ops.topServices || []).slice(0, 6).map((t) => ({ name: svcNames[t.id] || t.id, count: t.count }))
  const zmap = Object.fromEntries((await pool.query('SELECT id, name FROM zones')).rows.map((z) => [z.id, z.name]))
  const recent = (ops.recent || []).map((r) => ({ ...r, zone: zmap[r.zoneId] || '—' }))
  res.json({ trend: ops.trend || [], revenueDaily: ops.revenueDaily || [], rating: ops.rating || 0, topServices, workerStatus: ws, recent })
})
// All-zones real metrics for the admin dashboard (apartments + real bookings per zone).
app.get('/api/admin/zones-metrics', adminAuth, async (_q, res) => {
  const zones = (await pool.query('SELECT id, name, code, city, status FROM zones ORDER BY id')).rows
  const bstats = await tryGet(BOOKING_URL, '/api/internal/zone-metrics', [])
  const bmap = Object.fromEntries((Array.isArray(bstats) ? bstats : []).map((x) => [Number(x.zone_id), x]))
  const out = []
  for (const z of zones) {
    const apt = (await pool.query('SELECT COUNT(*)::int n, COALESCE(SUM(units),0)::int units FROM apartments WHERE zone_id=$1', [z.id])).rows[0]
    const b = bmap[z.id] || {}
    out.push({
      id: z.id, name: z.name, code: z.code, city: z.city, status: z.status, apartments: apt.n, units: apt.units,
      orders: b.orders || 0, revenue: b.revenue || 0, completed: b.completed || 0, cancelled: b.cancelled || 0,
      pending: b.pending || 0, ordersTotal: b.orders_total || 0, revenueTotal: b.revenue_total || 0,
    })
  }
  res.json(out)
})

init()
  .then(() => app.listen(PORT, () => console.log(`[catalog] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[catalog] failed to start:', e.message); process.exit(1) });
