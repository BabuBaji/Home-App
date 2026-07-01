// Cancellation & refund policy engine — the single source of truth for how much a
// customer is refunded and how much a worker is compensated when a booking is cancelled.
//
// Mirrors the two models real platforms use:
//   • Instant bookings  → Snabbit-style, driven by the WORKER'S STAGE
//       confirmed / worker_assigned  → free (worker hasn't travelled)   100% refund
//       on_the_way                    → small travel fee (paid to worker)
//       arrived                       → 100% charged (worker gets a visit fee)
//       in_progress                   → cannot cancel
//   • Scheduled bookings → Pronto-style, driven by HOURS BEFORE THE SLOT
//       > full_hrs before   → 100% refund
//       half_hrs..full_hrs  → part refund
//       < half_hrs / no-show → no refund
//   Once a scheduled booking's worker is actually travelling/arrived, the stage
//   rules take over (they're stricter and involve a real worker).
//
// All thresholds come from admin Settings so they can be tuned without code changes.
import { getSetting } from './admin-db.js'

const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

// Parse the app's "1 Jul 2026" + "2:30 PM" slot into epoch ms (null if instant/unparseable).
function scheduledStartMs(b) {
  if (!b || b.type !== 'schedule' || !b.date || !b.time) return null
  const dm = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(String(b.date).trim())
  const tm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(b.time).trim())
  if (!dm || !tm || !(dm[2] in MON)) return null
  let hr = Number(tm[1]) % 12; if (/pm/i.test(tm[3])) hr += 12
  return new Date(Number(dm[3]), MON[dm[2]], Number(dm[1]), hr, Number(tm[2]), 0, 0).getTime()
}

const int = (key, dflt) => { const n = parseInt(getSetting(key, String(dflt)), 10); return Number.isFinite(n) ? n : dflt }
const pctOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/**
 * Quote a cancellation WITHOUT mutating anything.
 * @returns {{allowed:boolean, model:'instant'|'scheduled', stage:string, title:string,
 *            note:string, paid:number, refund:number, fee:number, refundPct:number, workerComp:number}}
 */
export function quoteCancellation(b, nowMs = Date.now()) {
  // Only money actually collected online can be refunded; cash bookings paid nothing yet.
  const paid = b.payment === 'cash' ? 0 : (b.total || 0)
  const base = { allowed: true, model: 'instant', stage: b.status, paid, refund: paid, fee: 0, refundPct: 100, workerComp: 0, title: '', note: '' }

  // ---- Non-cancellable states ----
  if (b.status === 'completed' || b.status === 'cancelled')
    return { ...base, allowed: false, refund: 0, refundPct: 0, title: 'Cannot cancel', note: `This booking is already ${b.status}.` }
  if (b.status === 'in_progress')
    return { ...base, allowed: false, refund: 0, fee: paid, refundPct: 0, title: 'Service already started',
      note: 'The service is in progress and can no longer be cancelled. Please contact support if there is a problem.' }

  const commissionPct = int('commission_percent', 20)
  const travelFee = int('cancel_fee', 50)            // fee charged when the worker is already travelling
  const arrivalPct = int('cancel_arrival_pct', 100)  // % of the bill charged once the worker has arrived
  const workerShare = (amt) => Math.max(0, Math.round((amt * (100 - commissionPct)) / 100))

  const start = scheduledStartMs(b)
  const traveling = b.status === 'on_the_way' || b.status === 'arrived'

  // ---- Scheduled booking, worker not yet dispatched → Pronto hours-based tiers ----
  if (b.type === 'schedule' && start != null && !traveling) {
    const fullHrs = int('cancel_sched_full_hrs', 6)
    const halfHrs = int('cancel_sched_half_hrs', 3)
    const halfPct = int('cancel_sched_half_pct', 50)
    const hrs = (start - nowMs) / 3600000
    let refundPct, note
    if (hrs >= fullHrs) { refundPct = 100; note = `Cancelled more than ${fullHrs} hrs before the slot — full refund.` }
    else if (hrs >= halfHrs) { refundPct = halfPct; note = `Cancelled ${halfHrs}–${fullHrs} hrs before the slot — ${halfPct}% refund.` }
    else { refundPct = 0; note = `Cancelled less than ${halfHrs} hrs before the slot (or no-show) — no refund.` }
    const refund = Math.round((paid * refundPct) / 100)
    return { ...base, model: 'scheduled', stage: 'scheduled', refundPct, refund, fee: paid - refund,
      title: refundPct === 100 ? 'Free cancellation' : refundPct > 0 ? `${refundPct}% refund` : 'No refund', note }
  }

  // ---- Instant / dispatched → Snabbit-style stage tiers ----
  switch (b.status) {
    case 'confirmed':
    case 'worker_assigned':
      return { ...base, title: 'Free cancellation', note: 'The worker has not started travelling yet — you get a full refund.' }
    case 'on_the_way': {
      const fee = Math.min(travelFee, paid || travelFee)
      const refund = Math.max(0, paid - fee)
      return { ...base, stage: 'on_the_way', fee, refund, refundPct: pctOf(refund, paid), workerComp: Math.min(fee, travelFee),
        title: `₹${fee} travel fee`, note: 'The worker is already on the way, so a small travel fee applies and is paid to the worker.' }
    }
    case 'arrived': {
      const fee = Math.round((paid * arrivalPct) / 100)
      const refund = Math.max(0, paid - fee)
      return { ...base, stage: 'arrived', fee, refund, refundPct: pctOf(refund, paid), workerComp: workerShare(fee),
        title: arrivalPct >= 100 ? 'No refund' : `${100 - arrivalPct}% refund`,
        note: `The worker has already arrived, so ${arrivalPct}% of the bill is charged. The worker receives a visit fee.` }
    }
    default:
      return base
  }
}

export { scheduledStartMs }
