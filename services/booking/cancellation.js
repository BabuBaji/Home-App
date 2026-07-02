// Cancellation & refund policy engine (ported from the monolith). Pure function — the
// booking service loads the tunables from the admin/config service and passes them in as `cfg`.
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

export function scheduledStartMs(b) {
  if (!b || b.type !== 'schedule' || !b.date || !b.time) return null
  const dm = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(String(b.date).trim())
  const tm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(b.time).trim())
  if (!dm || !tm || !(dm[2] in MON)) return null
  let hr = Number(tm[1]) % 12; if (/pm/i.test(tm[3])) hr += 12
  return new Date(Number(dm[3]), MON[dm[2]], Number(dm[1]), hr, Number(tm[2]), 0, 0).getTime()
}

const pctOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

// cfg: { commission_percent, cancel_fee, cancel_arrival_pct, cancel_sched_full_hrs, cancel_sched_half_hrs, cancel_sched_half_pct }
export function quoteCancellation(b, cfg, nowMs = Date.now()) {
  const paid = b.payment === 'cash' ? 0 : (b.total || 0)
  const base = { allowed: true, model: 'instant', stage: b.status, paid, refund: paid, fee: 0, refundPct: 100, workerComp: 0, title: '', note: '' }

  if (b.status === 'completed' || b.status === 'cancelled')
    return { ...base, allowed: false, refund: 0, refundPct: 0, title: 'Cannot cancel', note: `This booking is already ${b.status}.` }
  if (b.status === 'in_progress')
    return { ...base, allowed: false, refund: 0, fee: paid, refundPct: 0, title: 'Service already started',
      note: 'The service is in progress and can no longer be cancelled. Please contact support if there is a problem.' }

  const commissionPct = cfg.commission_percent
  const travelFee = cfg.cancel_fee
  const arrivalPct = cfg.cancel_arrival_pct
  const workerShare = (amt) => Math.max(0, Math.round((amt * (100 - commissionPct)) / 100))

  const start = scheduledStartMs(b)
  const traveling = b.status === 'on_the_way' || b.status === 'arrived'

  if (b.type === 'schedule' && start != null && !traveling) {
    const fullHrs = cfg.cancel_sched_full_hrs, halfHrs = cfg.cancel_sched_half_hrs, halfPct = cfg.cancel_sched_half_pct
    const hrs = (start - nowMs) / 3600000
    let refundPct, note
    if (hrs >= fullHrs) { refundPct = 100; note = `Cancelled more than ${fullHrs} hrs before the slot — full refund.` }
    else if (hrs >= halfHrs) { refundPct = halfPct; note = `Cancelled ${halfHrs}–${fullHrs} hrs before the slot — ${halfPct}% refund.` }
    else { refundPct = 0; note = `Cancelled less than ${halfHrs} hrs before the slot (or no-show) — no refund.` }
    const refund = Math.round((paid * refundPct) / 100)
    return { ...base, model: 'scheduled', stage: 'scheduled', refundPct, refund, fee: paid - refund,
      title: refundPct === 100 ? 'Free cancellation' : refundPct > 0 ? `${refundPct}% refund` : 'No refund', note }
  }

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
