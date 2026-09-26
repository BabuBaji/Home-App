// Payment + account security checks against a running stack (mock payment mode, i.e. no Razorpay
// keys and NODE_ENV != production).
//
//   node infra/e2e/payments.mjs            # BASE=… ADMIN_PW=… PIN=<served pincode> LAT= LNG=
//
// WEBHOOK_SECRET=<the Razorpay webhook secret set in Admin ▸ Settings> also runs the signed-webhook
// checks; without it only "unsigned webhooks are refused" is checked.
//
// Every check states what must hold for money to be safe; FAIL means it does not.
import crypto from 'node:crypto'
const BASE = process.env.BASE || 'http://localhost:8080'
const RUN = Date.now().toString().slice(-5)
const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + String(detail).slice(0, 160) : ''}`)
}
async function api(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let json; try { json = JSON.parse(t) } catch { json = t }
  return { status: r.status, ok: r.ok, json }
}
async function customer(n) {
  const phone = `7${RUN}${String(n).padStart(4, '0')}`
  const o = (await api('POST', '/api/auth/request-otp', { body: { phone } })).json
  const v = (await api('POST', '/api/auth/verify-otp', { body: { phone, otp: o.devOtp || '4321' } })).json
  return { tok: v.token, id: v.user.id, phone }
}
async function pay(tok, amount) {
  const o = (await api('POST', '/api/payment/order', { token: tok, body: { amount } })).json
  const c = await api('POST', '/api/payment/charge', { token: tok, body: { orderId: o.orderId, method: 'upi', amount } })
  return c.json?.txnId
}
const wallet = async (tok) => (await api('GET', '/api/wallet', { token: tok })).json

async function main() {
  // A live zone to book into: the first live zone's first pincode (or PIN/LAT/LNG from env).
  const sup = (await api('POST', '/api/admin/login', { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } })).json.token
  const zones = (await api('GET', '/api/admin/zones', { token: sup })).json.filter((z) => z.status === 'live' && z.pincodeList?.length)
  const pin = process.env.PIN || zones[0]?.pincodeList[0]
  const cfg = zones[0]?.config?.coverage || {}
  const lat = Number(process.env.LAT || cfg.lat || 17.44), lng = Number(process.env.LNG || cfg.lng || 78.38)
  const A = await customer(1), B = await customer(2)
  for (const c of [A, B]) c.addr = (await api('POST', '/api/addresses', { token: c.tok, body: { label: 'Home', house: '1', street: 'Test', city: zones[0]?.city || 'Hyderabad', pincode: pin, lat, lng, makeDefault: true } })).json.id
  const item = [{ id: 'mopping', durationId: '60m' }]
  const total = (await api('POST', '/api/quote', { token: A.tok, body: { items: item, pincode: pin, lat, lng } })).json.total
  const book = (c, extra) => api('POST', '/api/bookings', { token: c.tok, body: { items: item, type: 'instant', addressId: c.addr, pincode: pin, lat, lng, payment: 'upi', ...extra } })
  console.log(`zone pin ${pin}, booking total ₹${total}`)

  // Free money paths are closed.
  const add = await api('POST', '/api/wallet/add', { token: A.tok, body: { amount: 5000 } })
  check('Wallet cannot be credited without a payment', !add.ok, `HTTP ${add.status}`)
  const g1 = await api('POST', '/api/auth/google', { body: { demo: true } })
  check('Demo Google login is gone', !g1.ok, `HTTP ${g1.status}`)
  const forged = 'e30.' + Buffer.from(JSON.stringify({ email: 'victim@gmail.com', email_verified: true })).toString('base64url') + '.x'
  const g2 = await api('POST', '/api/auth/google', { body: { credential: forged } })
  check('Forged Google token is refused', !g2.ok, `HTTP ${g2.status}`)
  const ph = await api('PATCH', '/api/me', { token: A.tok, body: { phone: B.phone } })
  check("Can't switch to another account's phone", !ph.ok, `HTTP ${ph.status}`)
  const ph2 = await api('PATCH', '/api/me', { token: A.tok, body: { phone: `6${RUN}99999` } })
  check("Can't change phone without an OTP to the new number", !ph2.ok, `HTTP ${ph2.status}`)

  // Bookings must carry a real, sufficient, single-use payment.
  let r = await book(A)
  check('Online booking without payment is refused', r.status === 402, `HTTP ${r.status}`)
  r = await book(A, { paymentId: 'pay_made_up_123' })
  check('Made-up payment id is refused', r.status === 402, `HTTP ${r.status}`)
  const small = await pay(A.tok, 1)
  r = await book(A, { paymentId: small })
  check('A ₹1 payment cannot pay for the booking', r.status === 402, `HTTP ${r.status}`)
  const bp = await pay(B.tok, total)
  r = await book(A, { paymentId: bp })
  check("Another customer's payment cannot be used", r.status === 402, `HTTP ${r.status}`)
  const good = await pay(A.tok, total)
  r = await book(A, { paymentId: good })
  check('Paid booking is accepted', r.status === 201, `HTTP ${r.status} ${r.ok ? '' : JSON.stringify(r.json).slice(0, 100)}`)
  const paidId = r.json?.id
  r = await book(A, { paymentId: good })
  check('The same payment cannot pay twice', r.status === 402, `HTTP ${r.status}`)

  // Wallet top-up only against a payment, once.
  const w0 = (await wallet(A.tok)).total
  const tp = await pay(A.tok, 100)
  const t1 = await api('POST', '/api/payment/wallet/topup', { token: A.tok, body: { paymentId: tp, amount: 100 } })
  const t2 = await api('POST', '/api/payment/wallet/topup', { token: A.tok, body: { paymentId: tp, amount: 100 } })
  const t3 = await api('POST', '/api/payment/wallet/topup', { token: A.tok, body: { paymentId: tp, amount: 500 } })
  const w1 = (await wallet(A.tok)).total
  check('Top-up credits once, replay does not double it', t1.ok && w1 - w0 === 100, `before ₹${w0}, after ₹${w1}, replay ${t2.status}/${t3.status}`)

  // Split: part wallet, part online.
  // Re-quote: the first-booking offer no longer applies to a second booking.
  const total2 = (await api('POST', '/api/quote', { token: A.tok, body: { items: item, pincode: pin, lat, lng } })).json.total
  const walletAmount = Math.min(50, total2 - 1)
  const rest = await pay(A.tok, total2 - walletAmount)
  r = await book(A, { paymentId: rest, walletAmount })
  const w2 = (await wallet(A.tok)).total
  check('Split payment debits the wallet slice', r.status === 201 && w1 - w2 === walletAmount, `HTTP ${r.status} ${r.ok ? '' : JSON.stringify(r.json).slice(0, 90)}, wallet ₹${w1} → ₹${w2}`)
  const splitId = r.json?.id

  // Cancel before an expert is found: online part back to source, wallet part to wallet.
  if (splitId) {
    const q = (await api('GET', `/api/bookings/${splitId}/cancel-quote`, { token: A.tok })).json
    check('Cancel quote shows the card/UPI vs wallet split', q.toSource === total2 - walletAmount && q.toWallet === walletAmount, `to source ₹${q.toSource}, to wallet ₹${q.toWallet}`)
    await api('POST', `/api/bookings/${splitId}/cancel`, { token: A.tok, body: { reason: 'test' } })
    const b = (await api('GET', `/api/admin/bookings/${splitId}`, { token: sup })).json
    const w3 = (await wallet(A.tok)).total
    check('Cancel refunds online part to the card/UPI', b.refund_to_source === total2 - walletAmount, `to source ₹${b.refund_to_source}, status ${b.refund_status}`)
    check('…and the wallet part to the wallet', w3 - w2 === walletAmount, `wallet ₹${w2} → ₹${w3}`)
    const rf = ((await api('GET', '/api/refunds', { token: A.tok })).json || []).find((x) => x.id === splitId)
    check('Refund history says where the refund went', rf && rf.toSource === total2 - walletAmount && rf.toWallet === walletAmount, JSON.stringify(rf || {}).slice(0, 120))
    const tx = ((await api('GET', '/api/payment/transactions', { token: A.tok })).json || []).find((x) => x.paymentId === rest)
    check('Payment details list the refund against the payment', tx && tx.refunded === total2 - walletAmount && tx.refunds.length === 1 && tx.bookingId === splitId, JSON.stringify(tx || {}).slice(0, 140))
  }

  // Failed checkouts are recorded as failed, and the same order can still be paid afterwards.
  const fo = (await api('POST', '/api/payment/order', { token: A.tok, body: { amount: 40 } })).json
  const fx = await api('POST', '/api/payment/failed', { token: B.tok, body: { orderId: fo.orderId, reason: 'x' } })
  check("A customer can't mark someone else's order failed", fx.ok && fx.json.ok === false, JSON.stringify(fx.json))
  await api('POST', '/api/payment/failed', { token: A.tok, body: { orderId: fo.orderId, reason: 'Bank declined' } })
  let failedRow = ((await api('GET', '/api/payment/transactions', { token: A.tok })).json || []).find((x) => x.orderId === fo.orderId)
  check('Failed payment shows in payment details with its reason', failedRow?.status === 'failed' && failedRow.failureReason === 'Bank declined', JSON.stringify(failedRow || {}).slice(0, 120))
  const retry = await api('POST', '/api/payment/charge', { token: A.tok, body: { orderId: fo.orderId, method: 'upi', amount: 40 } })
  failedRow = ((await api('GET', '/api/payment/transactions', { token: A.tok })).json || []).find((x) => x.orderId === fo.orderId)
  check('A failed order can be retried and paid', retry.ok && failedRow?.status === 'paid' && !failedRow.failureReason, `HTTP ${retry.status}, now ${failedRow?.status}`)

  // Webhooks: unsigned ones never change anything; signed ones record failures.
  const hook = (body, sig, id) => fetch(BASE + '/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', ...(sig ? { 'x-razorpay-signature': sig } : {}), ...(id ? { 'x-razorpay-event-id': id } : {}) }, body })
  const forgedBody = JSON.stringify({ event: 'payment.captured', bookingId: paidId, payload: { payment: { entity: { id: 'pay_forged', order_id: 'order_x', amount: 100 } } } })
  const u = await hook(forgedBody)
  check('Unsigned webhook is refused', u.status === 400 || u.status === 503, `HTTP ${u.status}`)
  if (process.env.WEBHOOK_SECRET) {
    const sign = (b) => crypto.createHmac('sha256', process.env.WEBHOOK_SECRET).update(b).digest('hex')
    const bad = await hook(forgedBody, sign(forgedBody + ' '))
    check('Webhook with a wrong signature is refused', bad.status === 400, `HTTP ${bad.status}`)
    const wo = (await api('POST', '/api/payment/order', { token: A.tok, body: { amount: 30 } })).json
    const fb = JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_f' + RUN, order_id: wo.orderId, error_description: 'Insufficient funds' } } } })
    const w = await hook(fb, sign(fb), 'evt_f' + RUN)
    const wr = ((await api('GET', '/api/payment/transactions', { token: A.tok })).json || []).find((x) => x.orderId === wo.orderId)
    check('Signed payment.failed webhook records the failure', w.ok && wr?.status === 'failed' && wr.failureReason === 'Insufficient funds', `HTTP ${w.status} ${JSON.stringify(wr || {}).slice(0, 100)}`)
    // A payment.failed event must never mark a booking paid (it used to be treated as success).
    const cashBook = await book(A, { payment: 'cash' })
    if (cashBook.ok) {
      const cb = JSON.stringify({ event: 'payment.failed', bookingId: cashBook.json.id, payload: { payment: { entity: { id: 'pay_g' + RUN, order_id: 'order_none', notes: { bookingId: cashBook.json.id } } } } })
      await hook(cb, sign(cb), 'evt_g' + RUN)
      await new Promise((r) => setTimeout(r, 500))
      const cbk = (await api('GET', `/api/admin/bookings/${cashBook.json.id}`, { token: sup })).json
      check('payment.failed webhook does not mark a booking paid', cbk.payment_status !== 'paid', `payment_status ${cbk.payment_status}`)
      await api('POST', `/api/bookings/${cashBook.json.id}/cancel`, { token: A.tok, body: { reason: 'test' } })
    }
  }
  if (paidId) await api('POST', `/api/bookings/${paidId}/cancel`, { token: A.tok, body: { reason: 'test' } })

  // Memberships are paid for.
  const m1 = await api('POST', '/api/membership/subscribe', { token: B.tok, body: { plan: 'gold', cycle: 'monthly', method: 'upi' } })
  check('Membership without payment is refused', m1.status === 402, `HTTP ${m1.status}`)
  const plans = (await api('GET', '/api/membership-plans')).json
  const gold = (Array.isArray(plans) ? plans : plans.plans || []).find((p) => p.key === 'gold')
  const mp = await pay(B.tok, gold?.price || 1)
  const m2 = await api('POST', '/api/membership/subscribe', { token: B.tok, body: { plan: 'gold', cycle: 'monthly', method: 'upi', paymentId: mp } })
  check('Membership with a verified payment activates', m2.ok, `HTTP ${m2.status} ${m2.ok ? '' : JSON.stringify(m2.json).slice(0, 100)}`)

  const f = results.filter((x) => !x.pass).length
  console.log(`\n${results.length - f} passed, ${f} failed`)
  process.exit(f ? 1 : 0)
}
main().catch((e) => { console.error('ABORTED:', e.message); process.exit(1) })
