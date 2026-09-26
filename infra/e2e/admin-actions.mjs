// Admin panel WRITE actions against a running stack: every mutation the admin UI can make is
// performed through the same /api/admin/* endpoints the panel calls (apps/admin/src/api.ts) and
// then READ BACK — an HTTP 200 alone is never a pass. Covers settings, RBAC, customers, the
// approval matrix, bookings, catalogue, workers, worker wallet, training/equipment, pay plans,
// payroll, offers, surge, support, broadcasts, report consistency and the audit/activity trail.
//
//   node infra/e2e/admin-actions.mjs            # BASE=… ADMIN_PW=…
//
// Everything created uses a per-run suffix and is removed at the end where an endpoint exists.
const BASE = process.env.BASE || 'http://localhost:8080'
const RUN = Date.now().toString().slice(-5)
const START = new Date(Date.now() - 5000).toISOString()
let fails = 0, total = 0
const results = []
const check = (n, p, d = '') => { total++; if (!p) fails++; results.push({ n, p: !!p, d: String(d) }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + String(d).slice(0, 220) : ''}`) }
async function api(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let json; try { json = JSON.parse(t) } catch { json = t }
  return { status: r.status, ok: r.ok, json }
}
const must = async (label, p) => { const r = await p; if (!r.ok) throw new Error(`${label} → ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`); return r.json }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const A = (path) => '/api/admin' + path
const brief = (r) => `HTTP ${r.status} ${typeof r.json === 'string' ? r.json.slice(0, 120) : JSON.stringify(r.json).slice(0, 160)}`
async function waitFor(fn, ms, step = 1000) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(step) } }
// Run one section; a thrown error is recorded as a FAIL and the run continues with the next one.
async function sec(name, fn) {
  console.log(`\n── ${name} ──`)
  try { await fn() } catch (e) { check(`${name}: section aborted`, false, e.message) }
}

const S = {}          // ids of what this run created (for cleanup)
const cleanup = []    // [label, async fn]

async function main() {
  const SUP = (await must('super login', api('POST', A('/login'), { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } }))).token
  const PIN = `7${RUN}`
  const LAT = 17.2 + (Number(RUN) % 1000) / 10000, LNG = 78.2 + (Number(RUN) % 1000) / 10000

  // ─────────────── shared setup ───────────────
  const zone = await must('zone', api('POST', A('/zones'), { token: SUP, body: {
    name: `E2E Admin ${RUN}`, city: 'Hyderabad', state: 'Telangana', pincodes: PIN, status: 'live',
    config: { services: ['mopping', 'kitchen', 'bathroom', 'dusting'], workingHours: { is247: true }, coverage: { lat: LAT, lng: LNG, radiusKm: 3 } },
  } }))
  S.zone = zone.id
  const wPhone = `9${RUN}0101`.slice(0, 10)
  const W = await must('worker', api('POST', A('/workers'), { token: SUP, body: { name: `E2E Worker ${RUN}`, phone: wPhone, city: 'Hyderabad', zone_id: zone.id, status: 'active', services: ['Sweeping & Mopping'] } }))
  S.worker = W.id
  const WT = await must('throwaway worker', api('POST', A('/workers'), { token: SUP, body: { first_name: 'E2E', last_name: `Temp ${RUN}`, phone: `9${RUN}0202`.slice(0, 10), city: 'Hyderabad', zone_id: zone.id, services: ['Sweeping & Mopping'] } }))
  S.wt = WT.id
  const svc = await must('service', api('POST', A('/services'), { token: SUP, body: { name: `E2E Svc ${RUN}`, price: 199, category: 'Cleaning', duration_min: 45, gst_pct: 18, available: false } }))
  S.svc = svc.id
  const cPhone = `8${RUN}4242`
  const cust = await must('customer', api('POST', A('/customers'), { token: SUP, body: { phone: cPhone, name: `E2E Cust ${RUN}`, city: 'Hyderabad' } }))
  S.cust = cust.id
  const co = await must('c otp', api('POST', '/api/auth/request-otp', { body: { phone: cPhone } }))
  const C = (await must('c verify', api('POST', '/api/auth/verify-otp', { body: { phone: cPhone, otp: co.devOtp || '4321' } }))).token
  const custDetail = async () => (await must('customer detail', api('GET', A(`/customers/${S.cust}`), { token: SUP })))
  const cashBal = async () => (await custDetail()).customer.wallet || 0
  const promoBal = async () => (await custDetail()).customer.promoBalance || 0
  const totBal = async () => { const c = (await custDetail()).customer; return (c.wallet || 0) + (c.promoBalance || 0) }
  const origRules = (await must('rules', api('GET', A('/approval-rules'), { token: SUP }))).actions
  cleanup.push(['restore approval rules', async () => { for (const r of origRules) await api('PATCH', A(`/approval-rules/${r.action}`), { token: SUP, body: { enabled: r.enabled, threshold: r.threshold, reviewerPerm: r.reviewerPerm, minApprovers: r.minApprovers } }) }])
  console.log(`run ${RUN}: zone #${zone.id} pin ${PIN}, worker #${W.id}, temp worker #${WT.id}, service ${svc.id}, customer #${cust.id}`)

  // ─────────────── 1. Settings ───────────────
  await sec('1. Settings', async () => {
    const before = await must('settings', api('GET', A('/settings'), { token: SUP }))
    const orig = before.support_phone ?? ''
    const next = `+91 90000 ${RUN}`
    const w = await api('PATCH', A('/settings'), { token: SUP, body: { support_phone: next } })
    check('PATCH settings accepted', w.ok, brief(w))
    const after = await must('settings', api('GET', A('/settings'), { token: SUP }))
    check('support_phone reads back changed', after.support_phone === next, `got "${after.support_phone}"`)
    const pub = await waitFor(async () => (await api('GET', '/api/support/contact')).json?.phone === next, 20000)
    check('Change reaches the customer app (/api/support/contact) within the 15s config TTL', !!pub)
    const SECRET_KEYS = ['razorpay_key_secret', 'msg91_key', 'firebase_server_key', 'smtp_pass', 'google_maps_key', 'fcm_service_account', 'exotel_api_token', 'razorpay_webhook_secret', 'payment_webhook_secret', 'payout_webhook_secret']
    const set = SECRET_KEYS.filter((k) => after[k])
    const leaked = set.filter((k) => !String(after[k]).startsWith('••••'))
    check('Secrets come back masked', leaked.length === 0, set.length ? `${set.length} secret(s) set: ${set.map((k) => `${k}=${String(after[k]).slice(0, 12)}`).join(', ')}` : 'no secrets are set on this stack (vacuous)')
    if (set.length) {
      const k = set[0], masked = after[k]
      await api('PATCH', A('/settings'), { token: SUP, body: { [k]: masked } })
      const again = await must('settings', api('GET', A('/settings'), { token: SUP }))
      check('Saving the masked placeholder does not overwrite the real secret', again[k] === masked, `${k}: ${again[k]}`)
    }
    await api('PATCH', A('/settings'), { token: SUP, body: { support_phone: orig } })
    const restored = await must('settings', api('GET', A('/settings'), { token: SUP }))
    check('support_phone restored', (restored.support_phone ?? '') === orig, `"${restored.support_phone}"`)
  })

  // ─────────────── 2. Roles & permissions ───────────────
  let LIM = null, LIM_ID = null, roleKey = null
  await sec('2. Roles & permissions', async () => {
    const cat = await api('GET', A('/permissions'), { token: SUP })
    check('Permission catalog loads', cat.ok && Array.isArray(cat.json.catalog) && cat.json.catalog.length > 5, brief(cat))
    const perms = ['dashboard.view', 'services.view', 'services.edit', 'customers.view']
    const cr = await api('POST', A('/roles'), { token: SUP, body: { name: `E2E Limited ${RUN}`, description: 'e2e', permissions: [...perms, 'not.a.perm'] } })
    check('Create custom role', cr.status === 201, brief(cr))
    roleKey = cr.json?.role?.key
    const roles = (await must('roles', api('GET', A('/roles'), { token: SUP }))).roles
    const mine = roles.find((r) => r.key === roleKey)
    check('Role reads back with exactly the chosen permissions (unknown key dropped)', mine && mine.permissions.slice().sort().join() === perms.slice().sort().join() && !mine.isSystem, JSON.stringify(mine?.permissions))
    const sysEdit = await api('PATCH', A('/roles/admin'), { token: SUP, body: { permissions: [] } })
    check('System role cannot be edited', sysEdit.status === 400, brief(sysEdit))

    const mk = async (tag) => {
      const email = `${tag}${RUN}@e2e.test`
      const r = await api('POST', A('/admins'), { token: SUP, body: { name: `E2E ${tag} ${RUN}`, email, password: 'Lim@12345', role: roleKey } })
      return { r, email }
    }
    const l = await mk('lim')
    check('Create admin with the custom role', l.r.status === 201 && l.r.json.role === roleKey, brief(l.r))
    LIM_ID = l.r.json?.id; S.limId = LIM_ID
    const bad = await api('POST', A('/admins'), { token: SUP, body: { name: 'x', email: `bad${RUN}@e2e.test`, role: 'no_such_role' } })
    check('Admin with unknown role is refused', bad.status === 400, brief(bad))
    const lg = await api('POST', A('/login'), { body: { email: l.email, password: 'Lim@12345' } })
    check('Limited admin can log in; token carries role permissions', lg.ok && lg.json.admin.permissions.slice().sort().join() === perms.slice().sort().join(), brief(lg))
    LIM = lg.json?.token

    const ok1 = await api('PATCH', A(`/services/${S.svc}`), { token: LIM, body: { price: 211 } })
    const readSvc = async () => (await must('services', api('GET', A('/services'), { token: SUP }))).find((s) => s.id === S.svc)
    check('ALLOWED: limited admin edits a service (services.edit)', ok1.ok && (await readSvc())?.price === 211, brief(ok1))
    for (const [label, m, p, b] of [
      ['create a service (services.create)', 'POST', '/services', { name: `E2E Nope ${RUN}` }],
      ['edit settings (settings.edit)', 'PATCH', '/settings', { support_phone: 'hacked' }],
      ['create a role (roles.manage)', 'POST', '/roles', { name: `E2E Nope ${RUN}` }],
      ['list admins (admins.view)', 'GET', '/admins', null],
      ['create a customer (customers.edit)', 'POST', '/customers', { phone: `6${RUN}0000` }],
      ['credit a customer wallet (customers.edit)', 'POST', `/customers/${S.cust}/wallet`, { amount: 10 }],
      ['delete a service (services.delete)', 'DELETE', `/services/${S.svc}`, null],
      ['pay a worker bonus (wallet.adjust)', 'POST', `/workers/${S.worker}/wallet/bonus`, { amount: 1 }],
      ['read approvals inbox (approvals.review)', 'GET', '/approvals', null],
    ]) {
      const r = await api(m, A(p), { token: LIM, body: b })
      check(`REFUSED: limited admin cannot ${label}`, r.status === 403, brief(r))
    }
    // Endpoints that change real state but carry no permission gate on the server.
    const gaps = [
      ['freeze a customer wallet (customers.edit)', 'POST', `/customers/${S.cust}/wallet/status`, { status: 'active' }],
      ['create a training module (training.manage)', 'POST', '/training/modules', { title: `E2E Gap ${RUN}` }],
      ['create an equipment type (equipment.manage)', 'POST', '/equipment', { name: `E2E Gap ${RUN}` }],
      ['reject a worker bank account (workers.edit)', 'POST', `/workers/${S.wt}/bank/reject`, {}],
      ['add a worker note (workers.edit)', 'POST', `/workers/${S.wt}/notes`, { note: 'gap probe' }],
      ['create a complaint (complaints.resolve)', 'POST', '/complaints', { customer: 'gap probe', message: 'gap probe' }],
    ]
    for (const [label, m, p, b] of gaps) {
      const r = await api(m, A(p), { token: LIM, body: b })
      check(`REFUSED: limited admin cannot ${label}`, r.status === 403, brief(r))
      // undo what a gap let through
      if (r.ok && p === '/training/modules' && r.json?.module?.id) await api('DELETE', A(`/training/modules/${r.json.module.id}`), { token: SUP })
      if (r.ok && p === '/equipment' && r.json?.type?.id) await api('DELETE', A(`/equipment/${r.json.type.id}`), { token: SUP })
    }

    // Role update takes effect immediately for an already-issued token.
    const up = await api('PATCH', A(`/roles/${roleKey}`), { token: SUP, body: { name: `E2E Limited+ ${RUN}`, permissions: [...perms, 'services.create'] } })
    check('Update role (rename + add services.create)', up.ok && up.json.role.name === `E2E Limited+ ${RUN}` && up.json.role.permissions.includes('services.create'), brief(up))
    const nowOk = await api('POST', A('/services'), { token: LIM, body: { name: `E2E Lim ${RUN}`, available: false } })
    check('…the same token can now create a service', nowOk.status === 201, brief(nowOk))
    if (nowOk.json?.id) await api('DELETE', A(`/services/${nowOk.json.id}`), { token: SUP })
    const delBusy = await api('DELETE', A(`/roles/${roleKey}`), { token: SUP })
    check('Deleting a role still assigned to an admin is refused', delBusy.status === 409, brief(delBusy))

    // Disable an admin → no login, and the live token dies everywhere.
    const d = await mk('dis')
    const dTok = (await must('dis login', api('POST', A('/login'), { body: { email: d.email, password: 'Lim@12345' } }))).token
    const dis = await api('PATCH', A(`/admins/${d.r.json.id}`), { token: SUP, body: { status: 'inactive' } })
    check('Disable admin', dis.ok && dis.json.status === 'inactive', brief(dis))
    const dl = await api('POST', A('/login'), { body: { email: d.email, password: 'Lim@12345' } })
    check('Disabled admin cannot log in', dl.status === 403, brief(dl))
    const dMe = await api('GET', A('/me'), { token: dTok })
    const dCat = await api('GET', A('/services'), { token: dTok })
    check("Disabled admin's existing token is rejected (admin + catalog services)", dMe.status === 401 && dCat.status === 401, `me ${dMe.status}, catalog ${dCat.status}`)
    const dd = await api('DELETE', A(`/admins/${d.r.json.id}`), { token: SUP })
    const gone = !(await must('admins', api('GET', A('/admins'), { token: SUP }))).some((a) => a.id === d.r.json.id)
    check('Delete admin', dd.ok && gone, brief(dd))
  })

  // ─────────────── 3. Customers ───────────────
  await sec('3. Customers', async () => {
    let d = await custDetail()
    check('Admin-created customer reads back (name, phone, city)', d.customer.name === `E2E Cust ${RUN}` && d.customer.phone === cPhone && d.customer.city === 'Hyderabad', JSON.stringify({ n: d.customer.name, p: d.customer.phone, c: d.customer.city }))
    const list = await must('customers', api('GET', A(`/customers?q=&status=all`), { token: SUP }))
    check('Customer appears in the Customers list', list.some((c) => c.id === S.cust))
    const e = await api('PATCH', A(`/customers/${S.cust}`), { token: SUP, body: { name: `E2E Cust Edited ${RUN}`, email: `c${RUN}@e2e.test`, gender: 'female', phone: '9999999999' } })
    d = await custDetail()
    check('Edit profile reads back', e.ok && d.customer.name === `E2E Cust Edited ${RUN}` && d.customer.email === `c${RUN}@e2e.test` && d.customer.gender === 'female', brief(e))
    check('Phone (login identity) is NOT changed by a profile edit', d.customer.phone === cPhone, d.customer.phone)
    const n = await api('POST', A(`/customers/${S.cust}/notes`), { token: SUP, body: { body: `E2E note ${RUN}`, type: 'Escalation', title: 'Test' } })
    d = await custDetail()
    const note = d.notes.find((x) => x.body === `E2E note ${RUN}`)
    check('Add note reads back with type + author', n.ok && note && note.type === 'Escalation' && !!note.author, JSON.stringify(note || n.json).slice(0, 150))
    const ad = await api('POST', A(`/customers/${S.cust}/addresses`), { token: SUP, body: { label: 'Home', house: '12', street: 'E2E Street', city: 'Hyderabad', pincode: PIN } })
    d = await custDetail()
    const addr = d.addresses.find((a) => a.id === ad.json?.id)
    check('Add address reads back (first address becomes default)', ad.ok && addr && addr.pincode === PIN && addr.is_default === true, JSON.stringify(addr || ad.json).slice(0, 150))
    if (addr) {
      const ed = await api('PATCH', A(`/customers/${S.cust}/addresses/${addr.id}`), { token: SUP, body: { landmark: 'Near E2E' } })
      const a2 = (await custDetail()).addresses.find((a) => a.id === addr.id)
      check('Edit address reads back', ed.ok && a2?.landmark === 'Near E2E' && a2.line.includes('Near E2E'), a2?.line)
    }
    // wallet credit: rules are off by default → expect it to execute immediately
    const b0 = await cashBal()
    const rule = origRules.find((r) => r.action === 'customer.wallet_adjust')
    const cr = await api('POST', A(`/customers/${S.cust}/wallet`), { token: SUP, body: { amount: 2000, note: `E2E credit ${RUN}`, balance: 'cash', title: `E2E credit ${RUN}` } })
    if (cr.status === 202) {
      check('Wallet credit queued for approval (rule on)', cr.json.pending === true, `rule ${JSON.stringify(rule)}`)
    } else {
      check(`Wallet credit executes immediately (rule ${rule?.enabled ? 'on ≥₹' + rule.threshold : 'off'})`, cr.ok && cr.json.executed === true, brief(cr))
    }
    const b1 = await cashBal()
    check('Customer cash balance +₹2000 (admin view)', b1 === b0 + 2000, `₹${b0} → ₹${b1}`)
    const cw = (await api('GET', '/api/wallet', { token: C })).json
    check("Customer's own wallet shows the same balance + an ADMIN_CREDIT entry", cw.balance === b1 && cw.transactions.some((t) => (t.title || '').includes(`E2E credit ${RUN}`)), `app ₹${cw.balance}`)
    const pr = await api('POST', A(`/customers/${S.cust}/wallet`), { token: SUP, body: { amount: 50, balance: 'promo', title: 'E2E promo' } })
    check('Promo credit lands in promo balance', pr.ok && (await custDetail()).customer.promoBalance >= 50, brief(pr))
    // freeze
    const fz = await api('POST', A(`/customers/${S.cust}/wallet/status`), { token: SUP, body: { status: 'frozen' } })
    d = await custDetail()
    check('Freeze wallet reads back', fz.ok && d.customer.walletStatus === 'frozen', d.customer.walletStatus)
    const inv = await api('POST', A(`/customers/${S.cust}/wallet/status`), { token: SUP, body: { status: 'melted' } })
    check('Invalid wallet status is refused with a 4xx (not a 500)', inv.status >= 400 && inv.status < 500, brief(inv))
    S.frozen = true
  })

  // ─────────────── 4. Approvals (maker-checker) ───────────────
  let CHK = null
  await sec('4. Approvals (maker-checker)', async () => {
    const chkEmail = `chk${RUN}@e2e.test`
    const ca = await must('checker', api('POST', A('/admins'), { token: SUP, body: { name: `E2E Checker ${RUN}`, email: chkEmail, password: 'Chk@12345', role: 'admin' } }))
    S.chkId = ca.id
    CHK = (await must('chk login', api('POST', A('/login'), { body: { email: chkEmail, password: 'Chk@12345' } }))).token
    const pr = await api('PATCH', A('/approval-rules/customer.wallet_adjust'), { token: SUP, body: { enabled: true, threshold: 500, reviewerPerm: 'approvals.review', minApprovers: 1 } })
    const rules = (await must('rules', api('GET', A('/approval-rules'), { token: SUP }))).actions
    const r = rules.find((x) => x.action === 'customer.wallet_adjust')
    check('Configure rule: wallet adjust needs approval ≥ ₹500', pr.ok && r.enabled && r.threshold === 500, JSON.stringify(r))
    const b0 = await cashBal()
    const small = await api('POST', A(`/customers/${S.cust}/wallet`), { token: SUP, body: { amount: 50, title: 'E2E below threshold' } })
    check('Below threshold (₹50) executes immediately', small.ok && small.json.executed === true && (await cashBal()) === b0 + 50, brief(small))
    const b1 = await cashBal()
    const big = await api('POST', A(`/customers/${S.cust}/wallet`), { token: SUP, body: { amount: 600, title: `E2E gated ${RUN}` } })
    check('Over threshold (₹600) is queued (HTTP 202, pending)', big.status === 202 && big.json.pending === true, brief(big))
    const reqId = big.json?.request?.id
    check('…and NOT executed (balance unchanged)', (await cashBal()) === b1, `₹${await cashBal()}`)
    const inbox = await must('approvals', api('GET', A('/approvals'), { token: CHK }))
    check('Request appears in the checker inbox', inbox.requests.some((x) => x.id === reqId && x.status === 'pending'))
    const self = await api('POST', A(`/approvals/${reqId}/approve`), { token: SUP })
    check('Maker cannot approve own request', self.status === 403, brief(self))
    const ap = await api('POST', A(`/approvals/${reqId}/approve`), { token: CHK })
    check('Checker approves → executed', ap.ok && ap.json.request?.status === 'executed', brief(ap))
    check('…balance now +₹600', (await cashBal()) === b1 + 600, `₹${b1} → ₹${await cashBal()}`)
    const twice = await api('POST', A(`/approvals/${reqId}/approve`), { token: CHK })
    check('Approving again is refused (no double execution)', twice.status === 409 && (await cashBal()) === b1 + 600, brief(twice))
    const b2 = await cashBal()
    const rj = await api('POST', A(`/customers/${S.cust}/wallet`), { token: SUP, body: { amount: -700, title: `E2E gated debit ${RUN}` } })
    const rjId = rj.json?.request?.id
    check('Debit ₹700 is also gated', rj.status === 202 && !!rjId, brief(rj))
    const rej = await api('POST', A(`/approvals/${rjId}/reject`), { token: CHK, body: { reason: 'E2E reject' } })
    const hist = (await must('approvals all', api('GET', A('/approvals?status=all'), { token: SUP }))).requests.find((x) => x.id === rjId)
    check('Checker rejects → status rejected with reason, balance unchanged', rej.ok && hist?.status === 'rejected' && hist.reason === 'E2E reject' && (await cashBal()) === b2, JSON.stringify(hist || rej.json).slice(0, 160))
    const late = await api('POST', A(`/approvals/${rjId}/approve`), { token: CHK })
    check('Approving a rejected request is refused', late.status === 409, brief(late))
    // min approvers = 2
    await api('PATCH', A('/approval-rules/customer.wallet_adjust'), { token: SUP, body: { enabled: true, threshold: 500, reviewerPerm: 'approvals.review', minApprovers: 2 } })
    const two = await api('POST', A(`/customers/${S.cust}/wallet`), { token: SUP, body: { amount: 510, title: 'E2E two approvers' } })
    const tid = two.json?.request?.id
    const a1 = await api('POST', A(`/approvals/${tid}/approve`), { token: CHK })
    check('With 2 approvers required, one approval leaves it pending (not executed)', a1.ok && a1.json.request?.status === 'pending' && (await cashBal()) === b2, brief(a1))
    const a1b = await api('POST', A(`/approvals/${tid}/approve`), { token: CHK })
    check('Same checker cannot count twice', a1b.status === 409, brief(a1b))
    if (tid) await api('POST', A(`/approvals/${tid}/reject`), { token: CHK, body: { reason: 'cleanup' } })
    await api('PATCH', A('/approval-rules/customer.wallet_adjust'), { token: SUP, body: { enabled: false, threshold: 0, reviewerPerm: 'approvals.review', minApprovers: 1 } })
  })

  // ─────────────── 5. Bookings ───────────────
  await sec('5. Bookings', async () => {
    const cAddr = (await must('c addr', api('POST', '/api/addresses', { token: C, body: { label: 'Work', house: '7', street: 'E2E Road', city: 'Hyderabad', pincode: PIN, lat: LAT, lng: LNG, makeDefault: true } }))).id
    const item = [{ id: 'mopping', durationId: '60m' }]
    const book = (payment, extra = {}) => api('POST', '/api/bookings', { token: C, body: { items: item, type: 'instant', addressId: cAddr, pincode: PIN, lat: LAT, lng: LNG, payment, ...extra } })
    // Frozen wallet (from section 3) must block a wallet-paid booking.
    if (S.frozen) {
      const fb = await book('wallet')
      check('Frozen wallet cannot pay for a booking', !fb.ok, brief(fb))
      if (fb.ok) await api('POST', `/api/bookings/${fb.json.id}/cancel`, { token: C, body: { reason: 'e2e' } })
      await api('POST', A(`/customers/${S.cust}/wallet/status`), { token: SUP, body: { status: 'active' } })
      check('Unfreeze wallet reads back', (await custDetail()).customer.walletStatus === 'active')
      S.frozen = false
    }
    const b1 = await api('POST', '/api/bookings', { token: C, body: { items: item, type: 'instant', addressId: cAddr, pincode: PIN, lat: LAT, lng: LNG, payment: 'cash' } })
    check('Customer books (cash) in the new live zone', b1.ok && b1.json.zone_id === S.zone, brief(b1))
    const B = b1.json; S.b1 = B.id
    const get = async (id) => (await must('booking', api('GET', A(`/bookings/${id}`), { token: SUP })))
    const list = await must('bookings', api('GET', A('/bookings?status=all&q='), { token: SUP }))
    check('Booking appears in admin list with customer name', list.some((x) => x.id === B.id && x.customer === `E2E Cust Edited ${RUN}`))
    let r = await api('PATCH', A(`/bookings/${B.id}`), { token: SUP, body: { adminNote: `E2E admin note ${RUN}`, escalated: true, escalateReason: 'E2E escalation' } })
    let g = await get(B.id)
    check('Admin note + escalate read back', r.ok && g.admin_note === `E2E admin note ${RUN}` && g.escalated === true && g.escalate_reason === 'E2E escalation', JSON.stringify({ n: g.admin_note, e: g.escalated, r: g.escalate_reason }))
    const others = (await must('workers', api('GET', A('/workers?q=&status=all&city=all'), { token: SUP }))).workers
    const foreign = others.find((w) => w.status === 'active' && w.zone_id && w.zone_id !== S.zone)
    if (foreign) {
      const fr = await api('PATCH', A(`/bookings/${B.id}`), { token: SUP, body: { workerId: foreign.id } })
      check('Assigning a worker from another zone is refused', fr.status === 422 && (await get(B.id)).worker_id !== foreign.id, brief(fr))
    }
    const inactive = await api('PATCH', A(`/bookings/${B.id}`), { token: SUP, body: { workerId: S.wt } })
    check('Assigning a non-active worker is refused', inactive.status === 422, brief(inactive))
    r = await api('PATCH', A(`/bookings/${B.id}`), { token: SUP, body: { workerId: S.worker, workerName: `E2E Worker ${RUN}` } })
    g = await get(B.id)
    check('Assign same-zone worker → worker_id + worker_assigned', r.ok && g.worker_id === S.worker && g.status === 'worker_assigned' && g.pro_name === `E2E Worker ${RUN}`, JSON.stringify({ w: g.worker_id, s: g.status, p: g.pro_name }))
    const wJobs = await must('worker detail', api('GET', A(`/workers/${S.worker}`), { token: SUP }))
    check("Assignment shows on the worker's detail (recent jobs / live job)", JSON.stringify(wJobs.recentJobs || []).includes(B.ref) || JSON.stringify(wJobs.liveJob || {}).includes(B.ref), `ref ${B.ref}`)
    r = await api('PATCH', A(`/bookings/${B.id}`), { token: SUP, body: { unassign: true } })
    g = await get(B.id)
    check('Unassign → worker cleared, back to confirmed', r.ok && g.worker_id == null && g.status === 'confirmed', JSON.stringify({ w: g.worker_id, s: g.status }))
    const tmr = new Date(Date.now() + 864e5 + 330 * 60e3), M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const date = `${tmr.getUTCDate()} ${M[tmr.getUTCMonth()]} ${tmr.getUTCFullYear()}`
    r = await api('PATCH', A(`/bookings/${B.id}`), { token: SUP, body: { date, time: '11:00 AM' } })
    g = await get(B.id)
    check('Change date/time reads back', r.ok && g.date === date && g.time === '11:00 AM', `${g.date} ${g.time}`)
    const cv = (await api('GET', `/api/bookings/${B.id}`, { token: C })).json
    check('Customer sees the rescheduled date/time', cv.date === date && cv.time === '11:00 AM', `${cv.date} ${cv.time}`)
    const act = await must('activity', api('GET', A(`/bookings/${B.id}/activity`), { token: SUP }))
    const claimsPaid = act.activities.some((a) => a.actionType === 'Payment' && /received/i.test(a.details))
    check('Booking activity does not claim payment was received for an unpaid cash booking', !claimsPaid, act.activities.filter((a) => a.actionType === 'Payment').map((a) => a.details).join(' | '))
    const acts = await must('activity log', api('GET', A(`/activity?entityType=booking&entityId=${B.id}&limit=50`), { token: SUP }))
    check('Admin booking edits (note/escalate/assign/reschedule) are recorded in the activity log', acts.items.some((a) => a.actor_type === 'admin'), `${acts.items.length} entries: ${acts.items.map((a) => a.actor_type + ':' + a.action).join(', ')}`)

    // Refund guard: an ACTIVE, unpaid cash booking has nothing to refund.
    const rfCash = await api('POST', A('/actions/refund'), { token: SUP, body: { bookingId: B.id } })
    check('Refund of an active unpaid cash booking is refused (not reported as executed)', !(rfCash.ok && rfCash.json.executed), brief(rfCash))

    // Refund on a PAID booking that is still active (not cancelled).
    const q = (await api('POST', '/api/quote', { token: C, body: { items: item, pincode: PIN, lat: LAT, lng: LNG } })).json
    const lb = await api('PATCH', A(`/bookings/${B.id}`), { token: LIM, body: { adminNote: 'limited admin probe' } })
    check('REFUSED: limited admin (no bookings.update_status/assign) cannot edit a booking', lb.status === 403, brief(lb))
    const w0 = await totBal()
    const b2 = await book('wallet')
    check('Wallet-paid booking placed (debits wallet cash+promo by the total)', b2.ok && (await totBal()) === w0 - b2.json.total, `${brief(b2).slice(0, 60)} total ₹${b2.json?.total} quote ₹${q.total}; cash+promo ₹${w0} → ₹${await totBal()}`)
    S.b2 = b2.json?.id
    const w1 = await totBal()
    const rfActive = await api('POST', A('/actions/refund'), { token: SUP, body: { bookingId: S.b2 } })
    const w2 = await totBal()
    check('Refund of a paid booking that is still ACTIVE is refused', !(rfActive.ok && rfActive.json.executed) && w2 === w1, `${brief(rfActive)}; wallet ₹${w1} → ₹${w2}, booking status ${(await get(S.b2)).status}`)
    if (w2 > w1) {
      const cc = await api('POST', `/api/bookings/${S.b2}/cancel`, { token: C, body: { reason: 'e2e' } })
      const w3 = await totBal()
      check('…and the customer then cancelling it does not refund a second time', w3 === w2, `cancel ${cc.status}; wallet ₹${w2} → ₹${w3} (paid ₹${b2.json.total})`)
    } else await api('POST', `/api/bookings/${S.b2}/cancel`, { token: C, body: { reason: 'e2e' } })

    // Proper flow: admin cancels a paid booking, then refunds it through the approval matrix.
    // Give the customer ₹50 promo first so the payment is part promo, part cash.
    await api('POST', A(`/customers/${S.cust}/wallet`), { token: SUP, body: { amount: 50, balance: 'promo', title: 'E2E promo 2' } })
    const pc0 = await cashBal(), pp0 = await promoBal()
    const b3 = await book('wallet')
    const pc1 = await cashBal(), pp1 = await promoBal()
    check('Wallet payment spends promo first, then cash', b3.ok && pp1 === Math.max(0, pp0 - b3.json.total) && pc1 === pc0 - (b3.json.total - (pp0 - pp1)), `promo ₹${pp0}→₹${pp1}, cash ₹${pc0}→₹${pc1}, total ₹${b3.json?.total}`)
    S.b3 = b3.json?.id
    const paid = b3.json?.total
    const cx = await api('PATCH', A(`/bookings/${S.b3}`), { token: SUP, body: { status: 'cancelled' } })
    g = await get(S.b3)
    check('Admin cancels a paid booking (status → cancelled)', cx.ok && g.status === 'cancelled', `${g.status} / ${g.payment_status}`)
    await api('PATCH', A('/approval-rules/refund.issue'), { token: SUP, body: { enabled: true, threshold: 0, reviewerPerm: 'approvals.review', minApprovers: 1 } })
    const r0 = await totBal(), rc0 = await cashBal(), rp0 = await promoBal()
    const rq = await api('POST', A('/actions/refund'), { token: SUP, body: { bookingId: S.b3 } })
    check('Refund with rule on (≥₹0) is queued, not executed', rq.status === 202 && rq.json.pending && (await totBal()) === r0 && rq.json.request?.amount === paid, brief(rq))
    const ra = await api('POST', A(`/approvals/${rq.json?.request?.id}/approve`), { token: CHK })
    g = await get(S.b3)
    const r1 = await totBal(), rc1 = await cashBal(), rp1 = await promoBal()
    check('Checker approves → refund executed: wallet +total, booking refunded', ra.ok && r1 === r0 + paid && g.refund_status === 'refunded' && g.payment_status === 'refunded', `cash+promo ₹${r0} → ₹${r1} (paid ₹${paid}); refund_status ${g.refund_status}, payment_status ${g.payment_status}`)
    check('Refund returns the promo part as promo (does not turn promo into withdrawable cash)', rp1 - rp0 === pp0 - pp1 && rc1 - rc0 === pc0 - pc1, `paid with promo ₹${pp0 - pp1} + cash ₹${pc0 - pc1}; refunded as promo ₹${rp1 - rp0} + cash ₹${rc1 - rc0}`)
    await api('PATCH', A('/approval-rules/refund.issue'), { token: SUP, body: { enabled: false, threshold: 0, reviewerPerm: 'approvals.review', minApprovers: 1 } })
    const again = await api('POST', A('/actions/refund'), { token: SUP, body: { bookingId: S.b3 } })
    check('Refunding the same booking again does not pay twice', (await totBal()) === r1, `${brief(again)}; wallet ₹${await cashBal()}`)
    const refunds = await must('refunds', api('GET', A('/refunds'), { token: SUP }))
    check('Refund shows on the Refunds screen', refunds.some((x) => x.id === S.b3 && x.payment_status === 'refunded'))
    const st = await must('settlement', api('GET', A(`/bookings/${S.b3}/settlement`), { token: SUP }))
    check('Settlement tab shows the refund amount', st.refund?.amount === paid, JSON.stringify(st.refund))
  })

  // ─────────────── 6. Services catalogue ───────────────
  await sec('6. Services catalogue', async () => {
    const read = async () => (await must('services', api('GET', A('/services'), { token: SUP }))).find((s) => s.id === S.svc)
    let s = await read()
    check('Created service reads back', s && s.name === `E2E Svc ${RUN}` && s.duration_min === 45 && s.available === false, JSON.stringify(s).slice(0, 160))
    const dup = await api('POST', A('/services'), { token: SUP, body: { name: `E2E Svc ${RUN}` } })
    check('Duplicate service is refused', dup.status === 409, brief(dup))
    const u = await api('PATCH', A(`/services/${S.svc}`), { token: SUP, body: { price: 249, duration_min: 90, gst_pct: 5 } })
    s = await read()
    check('Update price/duration/GST reads back', u.ok && s.price === 249 && s.duration_min === 90 && Number(s.gst_pct) === 5, JSON.stringify({ p: s.price, d: s.duration_min, g: s.gst_pct }))
    const neg = await api('PATCH', A(`/services/${S.svc}`), { token: SUP, body: { price: -50 } })
    s = await read()
    check('Negative price is refused (create clamps to ≥0; update should too)', !neg.ok || s.price >= 0, `${brief(neg)} → price ${s.price}`)
    const d = await api('DELETE', A(`/services/${S.svc}`), { token: SUP })
    check('Delete service', d.ok && !(await read()), brief(d))
    S.svc = null
  })

  // ─────────────── 7. Workers ───────────────
  await sec('7. Workers', async () => {
    const detail = async (id) => must('worker', api('GET', A(`/workers/${id}`), { token: SUP }))
    const lst = await must('workers', api('GET', A(`/workers?q=${encodeURIComponent('E2E Worker ' + RUN)}&status=all&city=all`), { token: SUP }))
    check('Worker (with zone) listed + searchable', lst.workers.some((w) => w.id === S.worker && w.zone_id === S.zone))
    const wt = await detail(S.wt)
    check('Name derived from first/last name', wt.name === `E2E Temp ${RUN}` && wt.status === 'pending', `${wt.name} / ${wt.status}`)
    const dupPh = await api('POST', A('/workers'), { token: SUP, body: { name: 'dup', phone: wt.phone } })
    check('Duplicate worker phone is refused', dupPh.status === 409, brief(dupPh))
    const up = await api('PATCH', A(`/workers/${S.worker}`), { token: SUP, body: { email: `w${RUN}@e2e.test`, designation: 'Senior Worker', worker_category: 'Cleaner' } })
    let w = await detail(S.worker)
    check('Update worker reads back', up.ok && w.email === `w${RUN}@e2e.test` && w.designation === 'Senior Worker' && w.worker_category === 'Cleaner', JSON.stringify({ e: w.email, d: w.designation, c: w.worker_category }))
    const nt = await api('POST', A(`/workers/${S.worker}/notes`), { token: SUP, body: { note: `E2E worker note ${RUN}`, author: 'E2E' } })
    const notes = await must('notes', api('GET', A(`/workers/${S.worker}/notes`), { token: SUP }))
    w = await detail(S.worker)
    check('Add note → in notes list and worker detail', nt.status === 201 && notes.some((n) => n.note === `E2E worker note ${RUN}`) && w.notes.some((n) => n.note === `E2E worker note ${RUN}`))
    check('Detail carries documents / types / skills', Array.isArray(w.documents) && Array.isArray(w.documentTypes) && !!w.skillsServices)
    const ch = await must('checklist', api('GET', A(`/workers/${S.wt}/checklist`), { token: SUP }))
    check('Go-live checklist loads with blocking items', Array.isArray(ch.items) && ch.items.length > 5 && Array.isArray(ch.blocking) && ch.live === false, `blocking: ${ch.blocking?.join(', ')}`)
    const bg = await must('bg', api('GET', A(`/workers/${S.wt}/background`), { token: SUP }))
    check('Background state loads (5 document + 2 manual checks)', bg.items?.length === 7, `${bg.items?.length} items`)
    const flg = await api('POST', A(`/workers/${S.wt}/background/criminal`), { token: SUP, body: { status: 'flagged' } })
    check('Flagging a check without findings is refused', flg.status === 400, brief(flg))
    const clr = await api('POST', A(`/workers/${S.wt}/background/criminal`), { token: SUP, body: { status: 'clear', reference: `E2E-${RUN}` } })
    const crim = clr.json?.items?.find((i) => i.key === 'criminal')
    check('Record criminal check = clear reads back', clr.ok && crim?.ok && crim.reference === `E2E-${RUN}` && !!crim.checkedBy, JSON.stringify(crim).slice(0, 150))
    const ba = await api('POST', A(`/workers/${S.wt}/bank/approve`), { token: SUP })
    w = await detail(S.wt)
    check('Bank approve is refused when the worker never submitted bank details', !ba.ok && w.bank_status !== 'Verified', `worker has profile.bank=${JSON.stringify(w.profile?.bank || null)} but approve returned ${ba.status}`)
    // The active test worker submits bank details from the app, then approval goes through.
    const wo = await must('w otp', api('POST', '/api/worker/auth/request-otp', { body: { phone: wPhone } }))
    const WTOK = (await must('w login', api('POST', '/api/worker/auth/verify', { body: { phone: wPhone, otp: wo.devOtp || '1234' } }))).token
    await must('w bank', api('PUT', '/api/worker/bank', { token: WTOK, body: { bankHolder: `E2E Worker ${RUN}`, bankName: 'HDFC Bank', bankAccount: '50100123456789', bankIfsc: 'HDFC0000001' } }))
    const ba2 = await api('POST', A(`/workers/${S.worker}/bank/approve`), { token: SUP })
    const wv = await detail(S.worker)
    check('Bank approve (details on file) → bank_status Verified', ba2.ok && wv.bank_status === 'Verified', `${brief(ba2)} → ${wv.bank_status}`)
    const br = await api('POST', A(`/workers/${S.wt}/bank/reject`), { token: SUP, body: { reason: 'E2E' } })
    w = await detail(S.wt)
    check('Bank reject → bank_status Rejected', br.ok && w.bank_status === 'Rejected', w.bank_status)
    const inv = await api('POST', A(`/workers/${S.wt}/invite`), { token: SUP })
    check('Invite → status onboarding + delivery reported', inv.ok && inv.json.worker?.status === 'onboarding' && !!inv.json.delivery, `${inv.json?.worker?.status} / ${inv.json?.delivery}`)
    const gl0 = await api('POST', A(`/workers/${S.wt}/go-live`), { token: SUP })
    check('Go-live without a reason is blocked (needsOverride)', gl0.status === 400 && gl0.json.needsOverride === true, brief(gl0))
    const gl = await api('POST', A(`/workers/${S.wt}/go-live`), { token: SUP, body: { reason: 'E2E override' } })
    const ch2 = await must('checklist', api('GET', A(`/workers/${S.wt}/checklist`), { token: SUP }))
    check('Go-live with override reason → active, override recorded in history', gl.ok && ch2.live === true && ch2.history?.[0]?.reason === 'E2E override', JSON.stringify(ch2.history?.[0] || gl.json).slice(0, 150))
    const del = await api('DELETE', A(`/workers/${S.wt}`), { token: SUP })
    const gone = await api('GET', A(`/workers/${S.wt}`), { token: SUP })
    check('Delete throwaway worker', del.ok && gone.status === 404, brief(gone))
    S.wt = null
  })

  // ─────────────── 8. Worker wallet ───────────────
  await sec('8. Worker wallet', async () => {
    const ws = async () => (await must('wallet', api('GET', A(`/workers/${S.worker}/wallet`), { token: SUP }))).walletSummary
    const s0 = await ws()
    let r = await api('POST', A(`/workers/${S.worker}/wallet/bonus`), { token: SUP, body: { amount: 500, label: `E2E bonus ${RUN}` } })
    const s1 = await ws()
    check('Bonus ₹500 → available +500, total earned +500', r.ok && s1.available === s0.available + 500 && s1.totalEarned === s0.totalEarned + 500, `avail ${s0.available}→${s1.available}, earned ${s0.totalEarned}→${s1.totalEarned}`)
    const hist = (await must('wallet', api('GET', A(`/workers/${S.worker}/wallet`), { token: SUP })))
    check('Bonus appears in earnings history with label', JSON.stringify(hist.earningsBreakup).includes(`E2E bonus ${RUN}`) || JSON.stringify(hist.history).includes(`E2E bonus ${RUN}`))
    r = await api('POST', A(`/workers/${S.worker}/wallet/penalty`), { token: SUP, body: { amount: 120, label: `E2E penalty ${RUN}` } })
    const s2 = await ws()
    check('Penalty ₹120 → available −120 and listed in deductions', r.ok && s2.available === s1.available - 120 && JSON.stringify(r.json.deductions).includes(`E2E penalty ${RUN}`), `avail ${s1.available}→${s2.available}`)
    r = await api('POST', A(`/workers/${S.worker}/wallet/hold`), { token: SUP, body: { amount: 100 } })
    const s3 = await ws()
    check('Hold ₹100 → available −100, on-hold +100', r.ok && s3.available === s2.available - 100 && s3.hold === s2.hold + 100, `HTTP ${r.status}; avail ${s2.available}→${s3.available}, hold ${s2.hold}→${s3.hold}`)
    r = await api('POST', A(`/workers/${S.worker}/wallet/release-hold`), { token: SUP, body: { amount: 100 } })
    const s4 = await ws()
    check('Release hold ₹100 → back to pre-hold figures', r.ok && s4.available === s2.available && s4.hold === s2.hold, `avail ${s4.available} (expect ${s2.available}), hold ${s4.hold}`)
    const snap0 = (await must('w', api('GET', A(`/workers/${S.worker}`), { token: SUP })))
    r = await api('POST', A(`/workers/${S.worker}/wallet/release-hold`), { token: SUP, body: { amount: 1000 } })
    const snap1 = (await must('w', api('GET', A(`/workers/${S.worker}`), { token: SUP })))
    check('Releasing more than is on hold is refused', !r.ok, `HTTP ${r.status}; worker record balance ${snap0.balance}→${snap1.balance}, hold ${snap0.hold ?? snap0.on_hold}→${snap1.hold ?? snap1.on_hold}`)
    if (r.ok) await api('POST', A(`/workers/${S.worker}/wallet/hold`), { token: SUP, body: { amount: 1000 } }) // undo
    const z = await api('POST', A(`/workers/${S.worker}/wallet/bonus`), { token: SUP, body: { amount: 0 } })
    check('Zero / missing bonus amount is refused', !z.ok, brief(z).slice(0, 60))
  })

  // ─────────────── 9. Training & equipment ───────────────
  await sec('9. Training & equipment', async () => {
    const tr = async () => must('training', api('GET', A('/training'), { token: SUP }))
    const m = await api('POST', A('/training/modules'), { token: SUP, body: { title: `E2E Module ${RUN}`, body: '' } })
    const mid = m.json?.module?.id; S.mod = mid
    check('Create training module (draft)', m.ok && !!mid && m.json.module.published === false, brief(m))
    const pub = await api('PATCH', A(`/training/modules/${mid}`), { token: SUP, body: { published: true } })
    check('Publishing an empty module is refused', pub.status === 400, brief(pub))
    const mu = await api('PATCH', A(`/training/modules/${mid}`), { token: SUP, body: { title: `E2E Module ${RUN} v2`, body: 'Always wear gloves.' } })
    let t = await tr()
    const mod = t.modules.find((x) => x.id === mid)
    check('Update module reads back', mu.ok && mod?.title === `E2E Module ${RUN} v2` && mod.body === 'Always wear gloves.' && mod.published === false, JSON.stringify(mod).slice(0, 120))
    const badQ = await api('POST', A('/training/questions'), { token: SUP, body: { moduleId: mid, question: 'x?', options: ['only one'], correctIndex: 0 } })
    check('Question with <2 options is refused', badQ.status === 400, brief(badQ))
    const q = await api('POST', A('/training/questions'), { token: SUP, body: { moduleId: mid, question: `E2E Q ${RUN}?`, options: ['Yes', 'No'], correctIndex: 0 } })
    const qid = q.json?.question?.id
    const qu = await api('PATCH', A(`/training/questions/${qid}`), { token: SUP, body: { question: `E2E Q ${RUN} edited?`, options: ['A', 'B', 'C'], correctIndex: 2 } })
    t = await tr()
    const qq = t.questions.find((x) => x.id === qid)
    check('Create + update question reads back', q.ok && qu.ok && qq?.question === `E2E Q ${RUN} edited?` && qq.options.length === 3 && qq.correctIndex === 2 && qq.moduleId === mid, JSON.stringify(qq))
    const qd = await api('DELETE', A(`/training/questions/${qid}`), { token: SUP })
    const md = await api('DELETE', A(`/training/modules/${mid}`), { token: SUP })
    t = await tr()
    check('Delete question + module', qd.ok && md.ok && !t.questions.some((x) => x.id === qid) && !t.modules.some((x) => x.id === mid))
    S.mod = null

    // equipment
    const et = await api('POST', A('/equipment'), { token: SUP, body: { name: `E2E Kit ${RUN}`, required: false } })
    const tid = et.json?.type?.id; S.eq = tid
    const et2 = await api('POST', A('/equipment'), { token: SUP, body: { name: `E2E Kit ${RUN}` } })
    check('Create equipment type (duplicate refused)', et.ok && !!tid && et2.status === 409, `${brief(et)} / dup ${et2.status}`)
    const iss = await api('POST', A(`/workers/${S.worker}/equipment`), { token: SUP, body: { typeId: tid, serial: `SN${RUN}`, notes: 'e2e' } })
    let we = await must('w eq', api('GET', A(`/workers/${S.worker}/equipment`), { token: SUP }))
    const row = we.issued.find((x) => x.typeId === tid)
    check('Issue equipment to worker reads back (serial, issued)', iss.ok && row?.status === 'issued' && row.serial === `SN${RUN}`, JSON.stringify(row).slice(0, 150))
    const iss2 = await api('POST', A(`/workers/${S.worker}/equipment`), { token: SUP, body: { typeId: tid } })
    check('Issuing the same item twice is refused', iss2.status === 409, brief(iss2))
    const types = (await must('eq', api('GET', A('/equipment'), { token: SUP }))).types
    check('Type shows 1 issued', types.find((x) => x.id === tid)?.issued === 1)
    const ret = await api('POST', A(`/workers/${S.worker}/equipment/${row?.id}/return`), { token: SUP })
    we = await must('w eq', api('GET', A(`/workers/${S.worker}/equipment`), { token: SUP }))
    check('Return equipment → status returned', ret.ok && we.issued.find((x) => x.id === row?.id)?.status === 'returned', brief(ret))
    const del = await api('DELETE', A(`/equipment/${tid}`), { token: SUP })
    check('Deleting an issued-before type is refused (history kept) — by design', del.status === 409, brief(del))
    const retire = await api('PATCH', A(`/equipment/${tid}`), { token: SUP, body: { active: false } })
    check('Retire the type instead', retire.ok && retire.json.type.active === false, brief(retire))
    const et3 = await api('POST', A('/equipment'), { token: SUP, body: { name: `E2E Kit2 ${RUN}` } })
    const d3 = await api('DELETE', A(`/equipment/${et3.json?.type?.id}`), { token: SUP })
    const types2 = (await must('eq', api('GET', A('/equipment'), { token: SUP }))).types
    check('Delete a never-issued type', d3.ok && !types2.some((x) => x.id === et3.json?.type?.id))
  })

  // ─────────────── 10. Salary / incentive plans, rules, payroll ───────────────
  await sec('10. Salary & incentive plans, rules, payroll', async () => {
    const sp = await api('POST', A('/salary-plans'), { token: SUP, body: { name: `E2E Plan ${RUN}`, salaryType: 'per_job', commissionPercent: 18, notes: 'e2e' } })
    const spid = sp.json?.plan?.id; S.sp = spid
    let plans = (await must('sp', api('GET', A('/salary-plans'), { token: SUP }))).plans
    check('Create salary plan reads back', sp.status === 201 && plans.find((p) => p.id === spid)?.commissionPercent === 18, brief(sp))
    const bad = await api('POST', A('/salary-plans'), { token: SUP, body: { name: `E2E Bad ${RUN}`, salaryType: 'fixed' } })
    check('Fixed plan without a basic salary is refused', bad.status === 400, brief(bad))
    const spu = await api('PATCH', A(`/salary-plans/${spid}`), { token: SUP, body: { commissionPercent: 15, salaryType: 'hybrid', monthlyBasic: 8000 } })
    plans = (await must('sp', api('GET', A('/salary-plans'), { token: SUP }))).plans
    const p = plans.find((x) => x.id === spid)
    check('Update salary plan reads back', spu.ok && p.commissionPercent === 15 && p.salaryType === 'hybrid' && p.monthlyBasic === 8000, JSON.stringify(p).slice(0, 150))
    const spd = await api('DELETE', A(`/salary-plans/${spid}`), { token: SUP })
    check('Delete salary plan', spd.ok && !(await must('sp', api('GET', A('/salary-plans'), { token: SUP }))).plans.some((x) => x.id === spid))
    S.sp = null

    const ip = await api('POST', A('/incentive-plans'), { token: SUP, body: { name: `E2E Inc ${RUN}`, perJobAmount: 10 } })
    const ipid = ip.json?.plan?.id; S.ip = ipid
    const zero = await api('POST', A('/incentive-plans'), { token: SUP, body: { name: `E2E Zero ${RUN}` } })
    check('Create incentive plan (all-zero plan refused)', ip.status === 201 && zero.status === 400, `${brief(ip)} / zero ${zero.status}`)
    const ipu = await api('PATCH', A(`/incentive-plans/${ipid}`), { token: SUP, body: { perJobAmount: 20, attendanceTiers: [{ label: 'Gold', days: 20, sundays: 0, amount: 500 }] } })
    const ipr = (await must('ip', api('GET', A('/incentive-plans'), { token: SUP }))).plans.find((x) => x.id === ipid)
    check('Update incentive plan reads back', ipu.ok && ipr.perJobAmount === 20 && ipr.attendanceTiers?.[0]?.amount === 500, JSON.stringify(ipr).slice(0, 150))
    const ipd = await api('DELETE', A(`/incentive-plans/${ipid}`), { token: SUP })
    check('Delete incentive plan', ipd.ok && !(await must('ip', api('GET', A('/incentive-plans'), { token: SUP }))).plans.some((x) => x.id === ipid))
    S.ip = null

    const rule = await api('POST', A('/incentive-rules'), { token: SUP, body: { name: `E2E Rule ${RUN}`, category: 'Other', active: false, trigger: 'job_completed', scopeType: 'specific_workers', scopeValues: [String(S.worker)], calcType: 'fixed', calc: { amount: 1 } } })
    const rid = rule.json?.rule?.id; S.rule = rid
    let rd = await api('GET', A(`/incentive-rules/${rid}`), { token: SUP })
    check('Create incentive rule (inactive) reads back', rule.status === 201 && rd.json.rule?.active === false && rd.json.rule.current?.calc?.amount === 1, brief(rule))
    const v2 = await api('POST', A(`/incentive-rules/${rid}/version`), { token: SUP, body: { name: `E2E Rule ${RUN} v2`, trigger: 'job_completed', scopeType: 'specific_workers', scopeValues: [String(S.worker)], calcType: 'fixed', calc: { amount: 2 } } })
    rd = await api('GET', A(`/incentive-rules/${rid}`), { token: SUP })
    check('New version → v2 current, v1 kept', v2.ok && rd.json.rule.current?.version === 2 && rd.json.rule.current.calc.amount === 2 && rd.json.rule.versions?.length === 2 && rd.json.rule.name === `E2E Rule ${RUN} v2`, `v${rd.json.rule?.current?.version}, ${rd.json.rule?.versions?.length} versions`)
    const pt = await api('PATCH', A(`/incentive-rules/${rid}`), { token: SUP, body: { priority: 999 } })
    rd = await api('GET', A(`/incentive-rules/${rid}`), { token: SUP })
    check('Patch rule priority reads back', pt.ok && rd.json.rule.priority === 999 && rd.json.rule.active === false)
    const hasDelete = await api('DELETE', A(`/incentive-rules/${rid}`), { token: SUP })
    check('Incentive rules have no delete (by design: versioned, paused instead) — test rule left inactive', hasDelete.status === 404 && rd.json.rule.active === false, `DELETE → HTTP ${hasDelete.status}; rule #${rid} active=${rd.json.rule.active}`)

    const month = new Date().toISOString().slice(0, 7)
    const runs0 = await must('payroll', api('GET', A('/payroll'), { token: SUP }))
    const existing = runs0.runs.find((r) => r.month === month)
    if (existing?.status === 'approved') {
      check(`Payroll ${month} already approved — rebuild is refused`, (await api('POST', A('/payroll'), { token: SUP, body: { month } })).status === 409)
    } else {
      const b = await api('POST', A('/payroll'), { token: SUP, body: { month } })
      const rr = await api('GET', A(`/payroll/${b.json?.run?.id}`), { token: SUP })
      check(`Build ${month} payroll draft and read it back`, b.ok && b.json.run.status !== 'approved' && rr.ok && rr.json.run.lines.length === b.json.run.lines.length && rr.json.run.totals.net === b.json.run.totals.net, `${b.json?.run?.lines?.length} lines, net ₹${b.json?.run?.totals?.net}, status ${b.json?.run?.status}`)
      const runs1 = await must('payroll', api('GET', A('/payroll'), { token: SUP }))
      check('Run listed with worker count / net', runs1.runs.some((r) => r.id === b.json?.run?.id && r.workers === b.json.run.lines.length))
    }
    const fut = await api('POST', A('/payroll'), { token: SUP, body: { month: '2099-01' } })
    check('Future-month payroll is refused', fut.status === 400, brief(fut))
  })

  // ─────────────── 11. Membership plans, banners, packages, campaigns ───────────────
  await sec('11. Membership plans, banners, packages, campaigns', async () => {
    const mp = await api('POST', A('/membership-plans'), { token: SUP, body: { plan_key: `e2e_${RUN}`, name: `E2E Member ${RUN}`, price: 99, status: 'draft', features: ['e2e'], discount_pct: 5 } })
    const mpid = mp.json?.id; S.mp = mpid
    let mps = await must('mps', api('GET', A('/membership-plans'), { token: SUP }))
    check('Create membership plan (draft) reads back', mp.status === 201 && mps.find((x) => x.id === mpid)?.price === 99 && mps.find((x) => x.id === mpid)?.discountPct === 5, brief(mp))
    const pub = await api('GET', '/api/membership-plans')
    check('Draft plan is not offered to customers', !pub.json.some((x) => x.id === mpid))
    const mpu = await api('PATCH', A(`/membership-plans/${mpid}`), { token: SUP, body: { price: 149, features: ['a', 'b'] } })
    mps = await must('mps', api('GET', A('/membership-plans'), { token: SUP }))
    check('Update membership plan reads back', mpu.ok && mps.find((x) => x.id === mpid)?.price === 149 && mps.find((x) => x.id === mpid)?.features.length === 2)
    const mpd = await api('DELETE', A(`/membership-plans/${mpid}`), { token: SUP })
    check('Delete membership plan', mpd.ok && !(await must('mps', api('GET', A('/membership-plans'), { token: SUP }))).some((x) => x.id === mpid))
    S.mp = null

    const bn = await api('POST', A('/banners'), { token: SUP, body: { title: `E2E Banner ${RUN}`, subtitle: 'e2e', status: 'paused', zone_id: S.zone, priority: 1 } })
    const bid = bn.json?.id; S.banner = bid
    let bns = await must('banners', api('GET', A('/banners'), { token: SUP }))
    check('Create banner reads back', bn.status === 201 && bns.find((x) => x.id === bid)?.zone_id === S.zone)
    const bu = await api('PATCH', A(`/banners/${bid}`), { token: SUP, body: { title: `E2E Banner ${RUN} v2`, cta_label: 'Book' } })
    bns = await must('banners', api('GET', A('/banners'), { token: SUP }))
    check('Update banner reads back', bu.ok && bns.find((x) => x.id === bid)?.title === `E2E Banner ${RUN} v2` && bns.find((x) => x.id === bid)?.cta_label === 'Book')
    const bd = await api('DELETE', A(`/banners/${bid}`), { token: SUP })
    check('Delete banner', bd.ok && !(await must('banners', api('GET', A('/banners'), { token: SUP }))).some((x) => x.id === bid))
    S.banner = null

    const svcs = (await must('services', api('GET', A('/services'), { token: SUP }))).map((s) => s.id)
    const items = svcs.slice(0, 2).map((id) => ({ id, durationId: '60m' }))
    const one = await api('POST', A('/packages'), { token: SUP, body: { name: `E2E Pkg1 ${RUN}`, items: items.slice(0, 1) } })
    check('Single-service package is refused', one.status === 400, brief(one))
    const pk = await api('POST', A('/packages'), { token: SUP, body: { name: `E2E Pkg ${RUN}`, items, discount_type: 'flat', discount_value: 50, zone_ids: [S.zone], active: false } })
    const pid = pk.json?.id; S.pkg = pid
    let pks = await must('packages', api('GET', A('/packages'), { token: SUP }))
    check('Create package reads back', pk.status === 201 && pks.find((x) => x.id === pid)?.discount_value === 50 && pks.find((x) => x.id === pid)?.items.length === 2, brief(pk))
    const pu = await api('PATCH', A(`/packages/${pid}`), { token: SUP, body: { discount_type: 'percent', discount_value: 10 } })
    pks = await must('packages', api('GET', A('/packages'), { token: SUP }))
    check('Update package reads back', pu.ok && pks.find((x) => x.id === pid)?.discount_type === 'percent' && pks.find((x) => x.id === pid)?.discount_value === 10)
    const pd = await api('DELETE', A(`/packages/${pid}`), { token: SUP })
    check('Delete package', pd.ok && !(await must('packages', api('GET', A('/packages'), { token: SUP }))).some((x) => x.id === pid))
    S.pkg = null

    const code = `E2E${RUN}`
    const cp = await api('POST', A('/campaigns'), { token: SUP, body: { campaign_name: `E2E Camp ${RUN}`, campaign_type: 'coupon', discount_type: 'flat', discount_value: 10, status: 'paused', zoneIds: [S.zone], coupon: { coupon_code: code, usage_limit: 1 } } })
    const cid = cp.json?.campaign_id; S.camp = cid
    let cps = await must('campaigns', api('GET', A('/campaigns'), { token: SUP }))
    let c = cps.find((x) => x.campaign_id === cid)
    check('Create coupon campaign reads back (zone + coupon)', cp.status === 201 && c?.coupon?.coupon_code === code && c.zoneIds.includes(S.zone), JSON.stringify(c).slice(0, 150))
    const cu = await api('PATCH', A(`/campaigns/${cid}`), { token: SUP, body: { discount_value: 20, campaign_name: `E2E Camp ${RUN} v2` } })
    cps = await must('campaigns', api('GET', A('/campaigns'), { token: SUP }))
    c = cps.find((x) => x.campaign_id === cid)
    check('Update campaign reads back (children untouched)', cu.ok && c.discount_value === 20 && c.campaign_name === `E2E Camp ${RUN} v2` && c.coupon?.coupon_code === code, JSON.stringify({ v: c?.discount_value, cc: c?.coupon?.coupon_code }))
    const badT = await api('POST', A('/campaigns'), { token: SUP, body: { campaign_name: 'x', campaign_type: 'bogus' } })
    check('Invalid campaign type refused', badT.status === 400)
    const cd = await api('DELETE', A(`/campaigns/${cid}`), { token: SUP })
    check('Delete campaign', cd.ok && !(await must('campaigns', api('GET', A('/campaigns'), { token: SUP }))).some((x) => x.campaign_id === cid))
    S.camp = null
  })

  // ─────────────── 12. Surge override ───────────────
  await sec('12. Surge override', async () => {
    const item = [{ id: 'mopping', durationId: '60m' }]
    const quote = async () => (await api('POST', '/api/quote', { body: { items: item, pincode: PIN, lat: LAT, lng: LNG } })).json
    const q0 = await quote()
    const s = await api('POST', A('/surge'), { token: SUP, body: { zoneId: S.zone, pct: 15, minutes: 5 } })
    check('Set surge 15% on the test zone', s.ok && s.json.pct === 15, brief(s))
    S.surge = true
    const q1 = await quote()
    check('Customer quote now carries the 15% surge', q1.surgePct === 15 && q1.total > q0.total, `surgePct ${q0.surgePct}→${q1.surgePct}, total ₹${q0.total}→₹${q1.total}`)
    const list = await must('surge', api('GET', A('/surge'), { token: SUP }))
    const row = list.find((x) => x.zoneId === S.zone)
    check('Surge screen lists the (new) zone with the override', row?.pct === 15 && row.reason === 'manual', row ? JSON.stringify(row) : `zone #${S.zone} not in list (${list.length} zones listed: ${list.map((x) => x.zoneId).join(',')})`)
    const cl = await api('POST', A('/surge'), { token: SUP, body: { zoneId: S.zone, pct: 0 } })
    const q2 = await quote()
    check('Clear surge → quote back to normal', cl.ok && q2.surgePct === q0.surgePct && q2.total === q0.total, `surgePct ${q2.surgePct}, total ₹${q2.total}`)
    S.surge = false
    const bad = await api('POST', A('/surge'), { token: SUP, body: { pct: 10 } })
    check('Surge without a zone is refused', bad.status === 400, brief(bad))
  })

  // ─────────────── 13. Complaints & tickets ───────────────
  await sec('13. Complaints & tickets', async () => {
    const t = await api('POST', '/api/tickets', { token: C, body: { category: 'Booking', subject: `E2E ticket ${RUN}`, message: 'Something went wrong (e2e)' } })
    const tid = t.json?.id
    check('Customer raises a ticket', t.status === 201 && !!tid, brief(t))
    const all = await must('tickets', api('GET', A('/tickets'), { token: SUP }))
    const row = all.find((x) => x.id === tid)
    check('Ticket reaches the admin queue with the customer name', row?.status === 'Open' && row.customer === `E2E Cust Edited ${RUN}`, JSON.stringify(row).slice(0, 120))
    const lp = await api('PATCH', A(`/tickets/${tid}`), { token: LIM, body: { status: 'Closed' } })
    check('REFUSED: limited admin (no tickets.resolve) cannot close a ticket', lp.status === 403, brief(lp))
    if (lp.ok) await api('PATCH', A(`/tickets/${tid}`), { token: SUP, body: { status: 'Open' } })
    const msg = await api('POST', A(`/tickets/${tid}/messages`), { token: SUP, body: { body: 'We are on it (e2e)' } })
    const up = await api('PATCH', A(`/tickets/${tid}`), { token: SUP, body: { status: 'Resolved', response: 'Fixed by e2e', priority: 'high' } })
    const det = await must('ticket', api('GET', A(`/tickets/${tid}`), { token: SUP }))
    check('Admin reply + resolve reads back (status, response, resolved_at/by, message)', msg.status === 201 && up.ok && det.status === 'Resolved' && det.response === 'Fixed by e2e' && !!det.resolved_at && !!det.resolved_by && det.messages.some((m) => m.body === 'We are on it (e2e)'), JSON.stringify({ s: det.status, r: det.response, at: det.resolved_at, by: det.resolved_by }))
    const mine = (await api('GET', '/api/tickets', { token: C })).json.find((x) => x.id === tid)
    check('Customer sees Resolved + the response', mine?.status === 'Resolved' && mine.response === 'Fixed by e2e')
    const cd = (await custDetail()).tickets
    check('Ticket shows on the customer profile Support tab', cd.some((x) => x.id === tid))
    const cm = await api('POST', A('/complaints'), { token: SUP, body: { customer: `E2E Cust ${RUN}`, category: 'Quality', message: 'e2e complaint', priority: 'high' } })
    const cu = await api('PATCH', A(`/complaints/${cm.json?.id}`), { token: SUP, body: { status: 'resolved', priority: 'low' } })
    const cl = (await must('complaints', api('GET', A('/complaints?status=resolved&priority=all'), { token: SUP }))).find((x) => x.id === cm.json?.id)
    check('Create + resolve complaint reads back', cm.status === 201 && cu.ok && cl?.status === 'resolved' && cl.priority === 'low', JSON.stringify(cl).slice(0, 120))
  })

  // ─────────────── 14. Broadcast ───────────────
  await sec('14. Broadcast', async () => {
    const title = `E2E broadcast ${RUN}`
    const b = await api('POST', A('/notifications/broadcast'), { token: SUP, body: { title, body: 'Automated test — please ignore', audience: 'customers', channel: 'in-app', type: 'announcement' } })
    check('Broadcast to customers sent', b.status === 201 && b.json.sent > 0, brief(b))
    const rec = (await must('broadcasts', api('GET', A('/notifications'), { token: SUP }))).find((x) => x.title === title)
    check('Broadcast is recorded (audience, channel, sent count)', rec && rec.sent === b.json.sent && rec.audience === 'customers' && rec.promotional === false, JSON.stringify(rec).slice(0, 160))
    const got = await waitFor(async () => JSON.stringify((await api('GET', '/api/notifications', { token: C })).json).includes(title), 8000)
    check("It lands in a customer's in-app inbox", !!got)
    const nt = await api('POST', A('/notifications/broadcast'), { token: SUP, body: { audience: 'customers' } })
    check('Broadcast without a title is refused', nt.status === 400)
  })

  // ─────────────── 15. Reports / dashboard consistency ───────────────
  await sec('15. Reports / dashboard consistency', async () => {
    const [dash, ins, ana, bks, cus, wks] = await Promise.all([
      must('dashboard', api('GET', A('/dashboard'), { token: SUP })),
      must('insights', api('GET', A('/insights'), { token: SUP })),
      must('analytics', api('GET', A('/analytics'), { token: SUP })),
      must('bookings', api('GET', A('/bookings?status=all&q='), { token: SUP })),
      must('customers', api('GET', A('/customers?q=&status=all'), { token: SUP })),
      must('workers', api('GET', A('/workers?q=&status=all&city=all'), { token: SUP })),
    ])
    const st = dash.stats
    const isPaid = (b) => b.payment_status === 'paid' || b.status === 'completed'
    const rev = bks.filter(isPaid).reduce((s, b) => s + (b.total || 0), 0)
    check('Dashboard total bookings = Bookings list length', st.totalBookings === bks.length, `dashboard ${st.totalBookings} vs list ${bks.length}${bks.length === 500 ? ' (list capped at 500)' : ''}`)
    check('Dashboard completed/cancelled = list counts', st.completed === bks.filter((b) => b.status === 'completed').length && st.cancelled === bks.filter((b) => b.status === 'cancelled').length, `dash ${st.completed}/${st.cancelled} vs list ${bks.filter((b) => b.status === 'completed').length}/${bks.filter((b) => b.status === 'cancelled').length}`)
    check('Dashboard revenue = Σ paid/completed totals from the list', st.revenue === rev, `dash ₹${st.revenue} vs list ₹${rev}`)
    const refundedCounted = bks.filter((b) => b.payment_status === 'paid' && b.status === 'cancelled')
    check('Revenue does not include cancelled bookings still marked paid (admin-cancelled, unrefunded)', refundedCounted.length === 0, `${refundedCounted.length} cancelled+paid bookings counted as revenue: ${refundedCounted.slice(0, 3).map((b) => `#${b.id} ₹${b.total}`).join(', ')}`)
    check('Dashboard customers = Customers list length', st.customers === cus.length, `dash ${st.customers} vs list ${cus.length}`)
    check('Dashboard workers total = Workers list length', st.workers.total === wks.workers.length && wks.stats?.total === wks.workers.length, `dash ${st.workers.total}, list ${wks.workers.length}, list stats ${wks.stats?.total}`)
    check('Reports (insights) bookings/revenue/completed match dashboard', ins.totals.bookings === st.totalBookings && ins.totals.revenue === st.revenue && ins.totals.completed === st.completed, `ins ${ins.totals.bookings}/₹${ins.totals.revenue}/${ins.totals.completed} vs dash ${st.totalBookings}/₹${st.revenue}/${st.completed}`)
    check('Analytics totals match dashboard', ana.totalBookings === st.totalBookings && ana.totalRevenue === st.revenue, `ana ${ana.totalBookings}/₹${ana.totalRevenue}`)
    const splitSum = ins.statusSplit.reduce((s, x) => s + x.n, 0)
    check('Status split sums to total bookings', splitSum === ins.totals.bookings, `${splitSum} vs ${ins.totals.bookings}`)
    const custWithBk = cus.reduce((s, c) => s + (c.bookings || 0), 0)
    check('Σ per-customer booking counts = total bookings', custWithBk === bks.length, `${custWithBk} vs ${bks.length}`)
    const pinLike = dash.cityRows.filter((r) => /^\d{6}$/.test(r.city))
    check('"Bookings by city" groups by city (not by pincode)', pinLike.length === 0, `labels: ${dash.cityRows.map((r) => r.city).join(', ')}`)
    const ac = ins.totals.activeCustomers
    check('Insights activeCustomers is a real number', Number.isFinite(ac), `activeCustomers=${ac}`)
  })

  // ─────────────── 16. Audit & activity trail ───────────────
  await sec('16. Audit & activity trail', async () => {
    const audit = await must('audit', api('GET', A('/audit?limit=500'), { token: SUP }))
    const mineA = audit.filter((a) => new Date(a.created) >= new Date(START))
    const has = (action, re) => mineA.some((a) => a.action === action && (!re || re.test(a.target || '')))
    for (const [action, re] of [
      ['settings.update'], ['role.create', new RegExp(RUN)], ['role.update', new RegExp(RUN)], ['admin.create', new RegExp(RUN)],
      ['admin.update', new RegExp(RUN)], ['admin.delete'], ['customer.create'], ['customer.edit', new RegExp(`#${S.cust}`)],
      ['customer.note_add', new RegExp(`#${S.cust}`)], ['customer.address_add', new RegExp(`#${S.cust}`)],
      ['customer.wallet_adjust', new RegExp(`#${S.cust}`)], ['approval.rule'], ['approval.request'], ['approval.execute'],
      ['approval.reject'], ['refund.issue'],
    ]) check(`Audit log has ${action}`, has(action, re))
    check('Audit log records the wallet freeze/unfreeze', mineA.some((a) => /wallet.?status|freeze|frozen/i.test(a.action + ' ' + (a.target || ''))), `actions this run: ${[...new Set(mineA.map((a) => a.action))].join(', ')}`)
    const cAudit = (await custDetail()).audit
    check("Customer profile Activity tab shows this run's admin actions", ['customer.edit', 'customer.note_add', 'customer.address_add', 'customer.wallet_adjust'].every((x) => cAudit.some((a) => a.action === x)), cAudit.map((a) => a.action).join(', '))
    check('…including the admin "customer.create"', cAudit.some((a) => a.action === 'customer.create'), 'target is stored as "<id>" not "#<id>" so the profile filter misses it')
    const act = await must('activity', api('GET', A(`/activity?since=${encodeURIComponent(START)}&limit=500`), { token: SUP }))
    const acts = new Set(act.items.map((a) => a.action))
    for (const a of ['worker.create', 'worker.invite', 'worker.golive', 'background.check', 'equipment.issue', 'equipment.return', 'salaryplan.create', 'incentiveplan.create', 'payroll.draft', 'approval.request', 'approval.approve', 'admin.broadcast', 'support.ticket', 'booking.create'])
      check(`Activity log has ${a}`, acts.has(a))
    const catalog = act.items.some((a) => new RegExp(`E2E (Svc|Camp|Banner|Pkg|Member|Admin) ${RUN}`).test(a.detail || '')) || audit.some((a) => new RegExp(`E2E (Svc|Camp|Banner|Pkg|Member) ${RUN}`).test(a.target || ''))
    check('Catalogue changes (service/campaign/banner/package/membership/zone) are in the audit or activity log', catalog, 'no entry mentions any of them')
    const wallet = act.items.some((a) => /bonus|penalty|hold/i.test(a.action) && String(a.entity_id) === String(S.worker)) || act.items.some((a) => new RegExp(`E2E (bonus|penalty) ${RUN}`).test(a.detail || ''))
    check('Worker wallet bonus/penalty/hold are in the activity log', wallet, 'no wallet adjustment entries for the test worker')
    const st = await must('activity stats', api('GET', A('/activity/stats?days=1'), { token: SUP }))
    check('Activity stats reflect recent admin actions', (st.byActor || []).some((x) => x.actor_type === 'admin' && x.n > 0))
  })

  // ─────────────── cleanup ───────────────
  console.log('\n── cleanup ──')
  if (S.b1) await api('POST', `/api/bookings/${S.b1}/cancel`, { token: C, body: { reason: 'e2e cleanup' } })
  if (S.surge) await api('POST', A('/surge'), { token: SUP, body: { zoneId: S.zone, pct: 0 } })
  if (S.frozen) await api('POST', A(`/customers/${S.cust}/wallet/status`), { token: SUP, body: { status: 'active' } })
  for (const [label, fn] of cleanup) { try { await fn() } catch (e) { console.log(`cleanup ${label} failed: ${e.message}`) } }
  const rules = (await api('GET', A('/approval-rules'), { token: SUP })).json.actions
  check('Approval rules restored to their original state', origRules.every((o) => { const r = rules.find((x) => x.action === o.action); return r && r.enabled === o.enabled && r.threshold === o.threshold }))
  if (S.svc) await api('DELETE', A(`/services/${S.svc}`), { token: SUP })
  if (S.mod) await api('DELETE', A(`/training/modules/${S.mod}`), { token: SUP })
  if (S.sp) await api('DELETE', A(`/salary-plans/${S.sp}`), { token: SUP })
  if (S.ip) await api('DELETE', A(`/incentive-plans/${S.ip}`), { token: SUP })
  if (S.mp) await api('DELETE', A(`/membership-plans/${S.mp}`), { token: SUP })
  if (S.banner) await api('DELETE', A(`/banners/${S.banner}`), { token: SUP })
  if (S.pkg) await api('DELETE', A(`/packages/${S.pkg}`), { token: SUP })
  if (S.camp) await api('DELETE', A(`/campaigns/${S.camp}`), { token: SUP })
  if (S.wt) await api('DELETE', A(`/workers/${S.wt}`), { token: SUP })
  if (S.chkId) await api('DELETE', A(`/admins/${S.chkId}`), { token: SUP })
  if (S.limId) await api('DELETE', A(`/admins/${S.limId}`), { token: SUP })
  if (roleKey) {
    const rd = await api('DELETE', A(`/roles/${roleKey}`), { token: SUP })
    const still = (await api('GET', A('/roles'), { token: SUP })).json.roles.some((r) => r.key === roleKey)
    check('Delete custom role once no admin holds it', rd.ok && !still, brief(rd))
  }
  // The test worker and zone are kept only if something still references them.
  const wd = await api('DELETE', A(`/workers/${S.worker}`), { token: SUP })
  const zd = await api('DELETE', A(`/zones/${S.zone}`), { token: SUP })
  console.log(`removed worker #${S.worker}: ${wd.status}, zone #${S.zone}: ${zd.status}. Left behind (no delete endpoint): customer #${S.cust}, bookings #${S.b1}/#${S.b2}/#${S.b3}, incentive rule #${S.rule} (inactive), tickets/complaint/broadcast, retired equipment type #${S.eq}.`)

  console.log(`\n${total - fails} passed, ${fails} failed`)
  if (fails) { console.log('\nFailed checks:'); for (const r of results.filter((x) => !x.p)) console.log(`  - ${r.n}${r.d ? '  — ' + r.d.slice(0, 220) : ''}`) }
  process.exit(fails ? 1 : 0)
}
main().catch((e) => { console.error('ABORTED:', e.message); console.log(`\n${total - fails} passed, ${fails} failed`); process.exit(1) })
