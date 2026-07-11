// HomeHelp Dynamic Pricing Engine
// --------------------------------
// Phase 1: Zone Discount, Customer Discount, Coupon. Turns a base price into a final price by
// layering eligible campaigns for the customer's zone + profile, then a coupon. The customer sees
// the already-discounted price (₹129 struck-through ₹199) with no manual coupon hunting for auto
// campaigns.
//
// Selection rule (per the product spec):
//   • Auto campaigns (zone + customer) apply PER ITEM. Among the non-stackable ones the single best
//     discount wins; `stackable` ones add on top.
//   • A coupon is a cart-level stage. If the coupon campaign is `stackable` it adds on top of the
//     auto discount; otherwise the order keeps whichever is larger (best-wins) —
//     e.g. ₹70 zone vs ₹100 coupon, non-stackable → ₹100 applies.
//   • Priority (lower wins on ties): 1 customer, 2 zone, 3 coupon.
//
// This module is deliberately split: pure functions (no I/O) for the math, and a few pool-taking
// helpers for loading/recording. The pure core is unit-testable without a DB.

/* ─────────────── pure helpers ─────────────── */

const up = (s) => String(s || '').trim().toUpperCase()

// A campaign is live if active/within its optional [starts, ends] date window.
export function withinWindow(c, now = new Date()) {
  if (c.status && c.status !== 'active') return false
  const day = now.toISOString().slice(0, 10)             // 'YYYY-MM-DD' (dates are stored date-only)
  if (c.starts && day < String(c.starts).slice(0, 10)) return false
  if (c.ends && day > String(c.ends).slice(0, 10)) return false
  return true
}

// Does this campaign target this cart item? '' filters mean "all".
export function matchesItem(c, item) {
  if (c.service_id && c.service_id !== item.serviceId) return false
  if (c.category && c.category !== item.category) return false
  if (c.duration_id && c.duration_id !== item.durationId) return false
  return true
}

// Raw ₹ discount a campaign yields on a given price (flat amount or capped percent), never > price.
export function rawDiscount(c, price) {
  if (!price || price <= 0) return 0
  let d = c.discount_type === 'percent'
    ? Math.round((price * (Number(c.discount_value) || 0)) / 100)
    : (Number(c.discount_value) || 0)
  if (c.discount_type === 'percent' && c.max_discount > 0) d = Math.min(d, c.max_discount)
  return Math.max(0, Math.min(Math.round(d), price))
}

// Customer-segment eligibility + per-customer usage cap. `ctx` carries the profile signals.
export function customerEligible(c, ctx = {}) {
  const rule = c.rule || { segment: 'all', max_usage: 0, winback_days: 30, vip_min_orders: 10 }
  const used = (ctx.usage && ctx.usage[c.campaign_id]) || 0
  if (rule.max_usage > 0 && used >= rule.max_usage) return false
  const orders = Number(ctx.completedOrders || 0)
  switch (rule.segment) {
    case 'all': return true
    case 'first_order': return orders === 0
    case 'second_order': return orders === 1
    case 'vip': return orders >= (rule.vip_min_orders || 10)
    case 'winback': {
      if (!ctx.lastCompletedAt) return false
      const days = (Date.now() - new Date(ctx.lastCompletedAt).getTime()) / 86400000
      return days >= (rule.winback_days || 30)
    }
    case 'birthday': {
      if (!ctx.dob) return false
      const dob = new Date(ctx.dob), today = new Date()
      return dob.getUTCMonth() === today.getUTCMonth() && dob.getUTCDate() === today.getUTCDate()
    }
    default: return false
  }
}

// Is a campaign eligible at all for this order (window + subtotal floor + customer segment)?
function campaignEligible(c, listSubtotal, ctx, now) {
  if (!withinWindow(c, now)) return false
  if (c.min_subtotal > 0 && listSubtotal < c.min_subtotal) return false
  if (c.campaign_type === 'customer' && !customerEligible(c, ctx)) return false
  return true
}

// Best coupon for this order: a manually-entered code, else the best auto-applied coupon.
function pickCoupon(couponCampaigns, { couponCode, listSubtotal, now }) {
  const usable = couponCampaigns.filter((c) => {
    const cp = c.coupon
    if (!cp) return false
    if (cp.expiry && now.toISOString().slice(0, 10) > String(cp.expiry).slice(0, 10)) return false
    if (cp.usage_limit > 0 && cp.used_count >= cp.usage_limit) return false
    if (c.min_subtotal > 0 && listSubtotal < c.min_subtotal) return false
    return couponCode ? up(cp.coupon_code) === up(couponCode) : cp.auto_apply
  })
  let best = null
  for (const c of usable) {
    const d = rawDiscount(c, listSubtotal)
    if (d > 0 && (!best || d > best.discount)) best = { campaign: c, discount: d, code: c.coupon.coupon_code }
  }
  return best
}

/**
 * Core resolver. Pure — given the loaded campaigns + customer ctx, compute the final priced cart.
 * @param items    [{ serviceId, category, durationId, listPrice }]
 * @param campaigns loaded campaign objects (see loadActiveCampaigns)
 * @param ctx      { completedOrders, lastCompletedAt, dob, usage:{campaign_id:count} }
 * @param couponCode  optional manually-entered code
 * @param applyCoupons  include the coupon stage (true for cart/quote, false for catalogue browse)
 * @returns { items, subtotal, discount, total, coupon, savings, appliedCampaignIds }
 */
export function resolvePricing({ items = [], campaigns = [], ctx = {}, couponCode = null, applyCoupons = false, now = new Date() }) {
  const listSubtotal = items.reduce((s, it) => s + (Number(it.listPrice) || 0), 0)
  const eligible = campaigns.filter((c) => campaignEligible(c, listSubtotal, ctx, now))
  const autoCampaigns = eligible.filter((c) => c.campaign_type === 'zone' || c.campaign_type === 'customer')
  const applied = new Set()

  // ── per-item auto discounts (zone + customer): best non-stackable + sum of stackable ──
  const pricedItems = items.map((it) => {
    const list = Number(it.listPrice) || 0
    const hits = autoCampaigns
      .filter((c) => matchesItem(c, it))
      .map((c) => ({ c, d: rawDiscount(c, list) }))
      .filter((x) => x.d > 0)
    const stackable = hits.filter((x) => x.c.stackable)
    const nonStack = hits.filter((x) => !x.c.stackable)
    const best = nonStack.reduce((m, x) => (!m || x.d > m.d || (x.d === m.d && x.c.priority < m.c.priority) ? x : m), null)
    const chosen = [...(best ? [best] : []), ...stackable]
    let disc = chosen.reduce((s, x) => s + x.d, 0)
    disc = Math.min(disc, list)
    for (const x of chosen) if (x.d > 0) applied.add(x.c.campaign_id)
    const price = list - disc
    return {
      ...it, listPrice: list, price, discount: disc,
      zoneDiscount: list > 0 ? Math.round((disc / list) * 100) : 0,     // back-compat % badge
      appliedCampaignId: (best || stackable[0])?.c.campaign_id || null,
    }
  })

  const D_auto = pricedItems.reduce((s, it) => s + it.discount, 0)
  const subtotalAfterAuto = listSubtotal - D_auto

  // ── coupon stage (cart level) ──
  let couponCode_out = null, extraDiscount = 0
  if (applyCoupons) {
    const couponCampaigns = eligible.filter((c) => c.campaign_type === 'coupon')
    const picked = pickCoupon(couponCampaigns, { couponCode, listSubtotal, now })
    if (picked) {
      const D_coupon = picked.discount
      if (picked.campaign.stackable) {
        // stacks on top of the auto discount
        extraDiscount = Math.min(D_coupon, subtotalAfterAuto)
      } else {
        // best-wins vs the auto discount; only the delta beyond auto is charged as an extra line
        const finalDiscount = Math.max(D_auto, D_coupon)
        extraDiscount = finalDiscount - D_auto
      }
      if (extraDiscount > 0) { couponCode_out = up(picked.code); applied.add(picked.campaign.campaign_id) }
      else extraDiscount = 0
    }
  }

  const subtotal = subtotalAfterAuto
  const discount = extraDiscount
  const total = Math.max(0, subtotal - discount)
  return {
    items: pricedItems,
    subtotal, discount, total,
    coupon: couponCode_out,
    savings: listSubtotal - total,               // total saved vs pre-discount list
    appliedCampaignIds: [...applied],
  }
}

/* ─────────────── DB helpers (take the pg pool) ─────────────── */

// Load active campaigns visible to a zone (campaign_zone empty = all zones), with their
// customer-rule and coupon children joined. `zoneId` null → only all-zone campaigns.
export async function loadActiveCampaigns(pool, { zoneId = null } = {}) {
  const { rows: masters } = await pool.query(
    `SELECT m.* FROM campaign_master m
     WHERE m.status = 'active'
       AND (
         NOT EXISTS (SELECT 1 FROM campaign_zone z WHERE z.campaign_id = m.campaign_id)
         OR ($1::int IS NOT NULL AND EXISTS (SELECT 1 FROM campaign_zone z WHERE z.campaign_id = m.campaign_id AND z.zone_id = $1))
       )
     ORDER BY m.priority, m.campaign_id`,
    [zoneId])
  if (masters.length === 0) return []
  const ids = masters.map((m) => m.campaign_id)
  const [{ rows: rules }, { rows: coupons }] = await Promise.all([
    pool.query('SELECT * FROM campaign_customer_rule WHERE campaign_id = ANY($1)', [ids]),
    pool.query('SELECT * FROM coupon WHERE campaign_id = ANY($1)', [ids]),
  ])
  const ruleBy = Object.fromEntries(rules.map((r) => [r.campaign_id, r]))
  const couponBy = Object.fromEntries(coupons.map((c) => [c.campaign_id, c]))
  return masters.map((m) => ({ ...m, rule: ruleBy[m.campaign_id] || null, coupon: couponBy[m.campaign_id] || null }))
}

// Per-customer usage counts (campaign_id → times used), for eligibility caps.
export async function loadUsage(pool, customerId) {
  if (!customerId) return {}
  const { rows } = await pool.query(
    'SELECT campaign_id, COUNT(*)::int n FROM customer_campaign_usage WHERE customer_id=$1 GROUP BY campaign_id',
    [customerId])
  return Object.fromEntries(rows.map((r) => [r.campaign_id, r.n]))
}

// Record redemptions for a booking (idempotent) + bump coupon.used_count.
export async function recordUsage(pool, { customerId, bookingId, campaignIds = [], couponCode }) {
  // Synthetic zone-pricing campaigns carry string ids ('zp-<service>') — never ledgered.
  const realIds = (campaignIds || []).filter((x) => Number.isInteger(x))
  if (!customerId || (!realIds.length && !couponCode)) return
  for (const cid of realIds) {
    await pool.query(
      `INSERT INTO customer_campaign_usage (customer_id, campaign_id, booking_id)
       VALUES ($1,$2,$3) ON CONFLICT (customer_id, campaign_id, booking_id) DO NOTHING`,
      [customerId, cid, bookingId || null])
  }
  if (couponCode) await pool.query('UPDATE coupon SET used_count = used_count + 1 WHERE UPPER(coupon_code) = UPPER($1)', [couponCode])
}
