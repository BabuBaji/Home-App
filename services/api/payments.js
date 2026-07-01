// Payment + payout webhooks — mounted at /api/payments by index.js.
//
// Security model (per spec): never trust the frontend's "payment success". The booking is
// only marked paid + settled when a SIGNED webhook arrives from the gateway/payout provider.
// Signatures are HMAC-SHA256 verified; duplicate webhooks are ignored via webhook_events.
//
// NOTE on raw body: real gateways sign the exact bytes. index.js parses JSON, so here we
// re-serialise req.body for the HMAC — correct for our own mock/test signer. A production
// deploy should capture the raw body (express.json({ verify })) and pass it to verifySignature.
import { Router } from 'express'
import {
  findPaymentByOrder, markPaymentSuccess, markPaymentFailed,
  verifySignature, claimWebhook, findPayoutByTransfer, updatePayoutStatus,
} from './payments-db.js'
import { getSetting } from './admin-db.js'
import { markWithdrawalPaid, reverseWithdrawal } from './worker-wallet-db.js'

export function createPaymentsRouter(io) {
  const r = Router()
  // Prefer the exact raw bytes (set by express.json verify) for HMAC; fall back to re-serialised
  // JSON for our own mock/test signer.
  const raw = (req) => (req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {}))

  r.get('/health', (_q, res) => res.json({ ok: true, service: 'homehelp-payments', time: new Date().toISOString() }))

  /* ---------- customer payment gateway webhook (Razorpay/Cashfree shaped) ---------- */
  r.post('/webhook', (req, res) => {
    const secret = getSetting('razorpay_webhook_secret', '') || getSetting('payment_webhook_secret', '')
    const sig = req.headers['x-razorpay-signature'] || req.headers['x-webhook-signature'] || req.body?.signature || ''
    if (!verifySignature(raw(req), sig, secret)) return res.status(400).json({ ok: false, error: 'Invalid signature' })

    const evt = req.body || {}
    const entity = evt?.payload?.payment?.entity || evt?.payload?.order?.entity || {}
    const orderId = evt.orderId || evt.order_id || entity.order_id
    const kind = String(evt.event || evt.type || evt.status || '')
    // Unique per delivery: Razorpay's own event-id header, else the payment id (pay_…), else a composite.
    const eventId = req.headers['x-razorpay-event-id'] || evt.id || evt.event_id || entity.id || `${orderId || ''}:${kind}`
    if (!claimWebhook('gateway', eventId)) return res.json({ ok: true, duplicate: true }) // idempotent

    const pay = findPaymentByOrder(orderId)
    if (!pay) return res.json({ ok: true, ignored: true })
    if (pay.status === 'SUCCESS') return res.json({ ok: true, alreadyPaid: true })

    if (/captured|success|paid/i.test(kind)) {
      markPaymentSuccess(pay.id, { paymentId: evt.paymentId || evt.payment_id || entity.id || '', signature: String(sig) })
      io?.to?.(`booking:${pay.booking_id}`)?.emit?.('payment:update', { orderId, status: 'SUCCESS' })
      console.log(`[webhook] ✓ ${kind} verified for ${orderId} → payment PM${String(pay.id).padStart(7, '0')} marked SUCCESS (₹${pay.amount})`)
    } else if (/fail|declin/i.test(kind)) {
      markPaymentFailed(pay.id, evt.reason || 'Payment failed at gateway')
      console.log(`[webhook] ✗ ${kind} for ${orderId} → payment marked FAILED`)
    }
    res.json({ ok: true })
  })

  /* ---------- payout provider webhook (Cashfree Payouts / RazorpayX shaped) ---------- */
  r.post('/payout/webhook', (req, res) => {
    const secret = getSetting('payout_webhook_secret', '')
    const sig = req.headers['x-payout-signature'] || req.body?.signature || ''
    if (!verifySignature(raw(req), sig, secret)) return res.status(400).json({ ok: false, error: 'Invalid signature' })

    const evt = req.body || {}
    const transferId = evt.transferId || evt.transfer_id || evt?.data?.transfer_id
    const eventId = evt.id || evt.event_id || `${transferId}:${evt.status || evt.event || ''}`
    if (!claimWebhook('payout', eventId)) return res.json({ ok: true, duplicate: true })

    const po = findPayoutByTransfer(transferId)
    if (!po) return res.json({ ok: true, ignored: true })
    const kind = String(evt.event || evt.status || '')
    if (/success|paid|complet|process/i.test(kind) && /success|paid|complet/i.test(kind)) {
      updatePayoutStatus(po.id, 'Paid')
      markWithdrawalPaid(po.withdrawal_id)
    } else if (/fail|revers|return|declin/i.test(kind)) {
      updatePayoutStatus(po.id, 'Failed', evt.reason || 'Payout failed')
      reverseWithdrawal(po.withdrawal_id, evt.reason || 'Payout failed at bank')
    }
    res.json({ ok: true })
  })

  return r
}
