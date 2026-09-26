// Worker joining bonus + refer & earn, end to end against a running stack: the bonus milestones are
// lowered in admin Settings, a new worker joins with a colleague's code and completes real jobs,
// and the wallet ledgers are read back. Settings are restored at the end.
//
//   node infra/e2e/worker-bonuses.mjs            # BASE=… ADMIN_PW=…
const BASE = process.env.BASE || 'http://localhost:8080'
const RUN = Date.now().toString().slice(-5)
let fails = 0, total = 0
const check = (n, p, d = '') => { total++; if (!p) fails++; console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + String(d).slice(0, 180) : ''}`) }
async function api(method, path, { token, body } = {}) {
  if (process.env.TRACE) process.stderr.write(`${new Date().toISOString().slice(11, 19)} ${method} ${path}\n`)
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let json; try { json = JSON.parse(t) } catch { json = t }
  return { status: r.status, ok: r.ok, json }
}
const must = async (label, p) => { const r = await p; if (!r.ok) throw new Error(`${label} → ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`); return r.json }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(800) } return null }

const KEYS = ['worker_joining_bonus', 'worker_joining_jobs', 'worker_joining_days', 'worker_referral_bonus', 'worker_referee_bonus', 'worker_referral_jobs']

async function main() {
  const SUP = (await must('super', api('POST', '/api/admin/login', { body: { email: 'admin@homehelp.in', password: process.env.ADMIN_PW || 'Admin@12345' } }))).token
  const before = await must('settings', api('GET', '/api/admin/settings', { token: SUP }))
  const saved = Object.fromEntries(KEYS.map((k) => [k, before[k] ?? before.settings?.[k] ?? '']))
  await must('set', api('PATCH', '/api/admin/settings', { token: SUP, body: { worker_joining_bonus: 700, worker_joining_jobs: 2, worker_joining_days: 30, worker_referral_bonus: 1200, worker_referee_bonus: 300, worker_referral_jobs: 2 } }))
  await sleep(1500) // services drop their settings cache on settings.updated
  try {
    const pin = `4${RUN}`, lat = 17.42, lng = 78.49
    const zone = await must('zone', api('POST', '/api/admin/zones', { token: SUP, body: { name: `E2E Bonus ${RUN}`, city: 'Hyderabad', state: 'Telangana', pincodes: pin, status: 'live', config: { services: ['mopping'], workingHours: { is247: true }, coverage: { lat, lng, radiusKm: 4 } } } }))
    const worker = async (n) => {
      const phone = `9${RUN}${n}2${n}2`.slice(0, 10)
      const w = await must('worker', api('POST', '/api/admin/workers', { token: SUP, body: { name: `Bonus${n} ${RUN}`, phone, city: 'Hyderabad', zone_id: zone.id, status: 'active', services: ['Sweeping & Mopping'] } }))
      const id = w.id || w.worker?.id
      await must('shift', api('POST', '/api/admin/shifts', { token: SUP, body: { worker_id: id, zone_id: zone.id, weekdays: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' } }))
      const o = await must('otp', api('POST', '/api/worker/auth/request-otp', { body: { phone } }))
      const v = await must('verify', api('POST', '/api/worker/auth/verify', { body: { phone, otp: o.devOtp || '1234' } }))
      return { id, tok: v.token }
    }
    const REF = await worker(1), NEW = await worker(2)
    const ledger = async (w) => (await must('wallet', api('GET', `/api/admin/workers/${w.id}/wallet`, { token: SUP }))).history || []
    const has = (rows, re) => rows.filter((r) => re.test(r.type + ' ' + (r.remarks || '') + ' ' + JSON.stringify(r)))

    // ── Referral code ──
    const refInfo = (await must('ref', api('GET', '/api/worker/referral', { token: REF.tok })))
    check('Referral screen shows the configured amounts', refInfo.bonus === 1200 && refInfo.refereeBonus === 300 && refInfo.jobsNeeded === 2, JSON.stringify({ b: refInfo.bonus, r: refInfo.refereeBonus, j: refInfo.jobsNeeded }))
    const ap = await api('POST', '/api/worker/referral/apply', { token: NEW.tok, body: { code: refInfo.code } })
    check('New worker applies the code', ap.ok, JSON.stringify(ap.json))
    const back = await api('POST', '/api/worker/referral/apply', { token: REF.tok, body: { code: (await must('r2', api('GET', '/api/worker/referral', { token: NEW.tok }))).code } })
    check("Referrer can't use the referee's code back", !back.ok, `HTTP ${back.status}`)
    const r1 = await must('ref', api('GET', '/api/worker/referral', { token: REF.tok }))
    check('Friend appears under "joined" with 0 jobs done', r1.joinedCount === 1 && r1.friends[0]?.jobs === 0 && !r1.friends[0]?.paid, JSON.stringify(r1.friends))
    const n1 = await must('ref', api('GET', '/api/worker/referral', { token: NEW.tok }))
    check('New worker sees who referred them and cannot apply again', !!n1.referredBy && n1.canApplyCode === false, JSON.stringify({ by: n1.referredBy, can: n1.canApplyCode }))
    const jb0 = await must('jb', api('GET', '/api/worker/joining-bonus', { token: NEW.tok }))
    check('Joining bonus card: ₹700, 0 of 2 jobs, not paid', jb0.active && jb0.amount === 700 && jb0.jobsNeeded === 2 && jb0.jobsDone === 0 && !jb0.paid && !jb0.expired, JSON.stringify(jb0))
    const rc = await must('rc', api('GET', '/api/worker/wallet/rate-card', { token: NEW.tok }))
    check('Rate card carries live numbers', rc.sharePct + rc.platformPct === 100 && rc.joiningBonus === 700 && rc.referralBonus === 1200, JSON.stringify(rc).slice(0, 160))

    // ── Jobs ──
    const cphone = `6${RUN}2727`
    const co = await must('c otp', api('POST', '/api/auth/request-otp', { body: { phone: cphone } }))
    const C = (await must('c verify', api('POST', '/api/auth/verify-otp', { body: { phone: cphone, otp: co.devOtp || '4321' } }))).token
    const addr = (await must('addr', api('POST', '/api/addresses', { token: C, body: { label: 'Home', house: '9', street: 'Bonus Rd', city: 'Hyderabad', pincode: pin, lat, lng, makeDefault: true } }))).id
    await api('POST', '/api/worker/status', { token: REF.tok, body: { state: 'Offline' } })
    const job = async () => {
      const b = await must('book', api('POST', '/api/bookings', { token: C, body: { items: [{ id: 'mopping', durationId: '60m' }], type: 'instant', addressId: addr, pincode: pin, lat, lng, payment: 'cash' } }))
      await api('POST', '/api/worker/status', { token: NEW.tok, body: { state: 'Available' } })
      const off = await waitFor(async () => (await api('GET', '/api/worker/jobs/offer', { token: NEW.tok })).json?.state === 'PENDING', 25000)
      if (!off) throw new Error('no offer reached the new worker')
      await must('accept', api('POST', '/api/worker/jobs/accept', { token: NEW.tok }))
      await must('otw', api('POST', '/api/worker/jobs/on-the-way', { token: NEW.tok }))
      await must('arrived', api('POST', '/api/worker/jobs/arrived', { token: NEW.tok }))
      const otp = (await api('GET', `/api/bookings/${b.id}`, { token: C })).json.service_otp
      await must('otp', api('POST', '/api/worker/jobs/verify-otp', { token: NEW.tok, body: { otp } }))
      await must('end', api('POST', '/api/worker/jobs/end', { token: NEW.tok, body: {} }))
      await sleep(2000) // booking.completed → wallet settlement
    }
    await job()
    let nl = await ledger(NEW)
    check('After 1 job: no joining bonus yet', has(nl, /Joining/).length === 0)
    const r2 = await must('ref', api('GET', '/api/worker/referral', { token: REF.tok }))
    check("Referrer sees the friend's progress (1 of 2)", r2.friends[0]?.jobs === 1 && !r2.friends[0]?.paid, JSON.stringify(r2.friends))
    await job()
    nl = await ledger(NEW)
    const rl = await ledger(REF)
    check('After 2 jobs: new worker gets the ₹700 joining bonus', has(nl, /Joining/).some((r) => r.amount === 700), JSON.stringify(has(nl, /Joining|Referral/)).slice(0, 200))
    check('…and the ₹300 referral welcome bonus', has(nl, /welcome/i).some((r) => r.amount === 300))
    check('Referrer gets the ₹1,200 referral bonus', has(rl, /Referral/).some((r) => r.amount === 1200), JSON.stringify(has(rl, /Referral/)).slice(0, 200))
    await job()
    const nl3 = await ledger(NEW), rl3 = await ledger(REF)
    check('A third job pays nothing twice', has(nl3, /Joining/).length === 1 && has(nl3, /welcome/i).length === 1 && has(rl3, /Referral/).length === 1)
    const jb1 = await must('jb', api('GET', '/api/worker/joining-bonus', { token: NEW.tok }))
    check('Joining bonus card now reads paid (hidden on Home)', jb1.paid === true, JSON.stringify(jb1))
    const r3 = await must('ref', api('GET', '/api/worker/referral', { token: REF.tok }))
    check('Referral screen: friend paid, ₹1,200 earned', r3.friends[0]?.paid === true && r3.lifetimeEarnings === 1200, JSON.stringify({ f: r3.friends, e: r3.lifetimeEarnings }))
    const acts = (await must('activity', api('GET', `/api/admin/activity?entityType=worker&entityId=${NEW.id}&limit=50`, { token: SUP }))).items
    check('Bonuses are in the admin activity log', acts.some((a) => a.action === 'worker.bonus'), acts.map((a) => a.action).join(', '))

    // ── Switched off = nothing paid ──
    await must('off', api('PATCH', '/api/admin/settings', { token: SUP, body: { worker_joining_bonus: 0 } }))
    await sleep(1500)
    const jbOff = await must('jb', api('GET', '/api/worker/joining-bonus', { token: REF.tok }))
    check('Joining bonus set to 0 → card inactive', jbOff.active === false, JSON.stringify(jbOff))

    await api('POST', '/api/worker/status', { token: NEW.tok, body: { state: 'Offline' } })
    await api('DELETE', `/api/admin/zones/${zone.id}`, { token: SUP })
  } finally {
    await api('PATCH', '/api/admin/settings', { token: SUP, body: Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== '')) })
  }
  console.log(`\n${total - fails} passed, ${fails} failed`)
  process.exit(fails ? 1 : 0)
}
main().catch((e) => { console.error('ABORTED:', e.message); process.exit(1) })
