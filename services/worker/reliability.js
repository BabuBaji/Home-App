/* Red Card / reliability system.
 *
 * Violations (late cancellations, no-shows, dropped jobs, late check-ins) add Red Card points under
 * admin-editable rules (rc_rules). Active, unexpired points decide the expert's level; at the
 * threshold (Settings ▸ rc_suspend_at) the expert is suspended from dispatch until an admin
 * reinstates them. Experts see everything in "My Performance" and can appeal a penalty; admins review
 * appeals, add/reverse penalties and edit the rules. Points expire after rc_expiry_days (0 = never).
 * An optional ₹ amount per Red Card (rc_rupee_value, default 0) is deducted through the wallet.
 *
 * Everything here is data-driven: no point values are hard-coded outside the default seed.
 */
import { getSettingInt, publishEvent } from '@homehelp/shared'

// Default rules, seeded once (admin edits are kept). points 0 = a warning on record only.
const DEFAULT_RULES = [
  ['SHIFT_EDIT_SAME_DAY', 'Shift changed on the day of the shift', 1],
  ['SHIFT_CANCEL_SAME_DAY', 'Shift cancelled on the same day', 2],
  ['SHIFT_CANCEL_1_DAY', 'Shift cancelled one day before', 1],
  ['SHIFT_CANCEL_EARLY', 'Shift cancelled 2+ days before', 0],
  ['SHIFT_NO_SHOW', 'Rostered shift — did not come to work', 2],
  ['WEEKEND_NO_SHOW', 'Rostered weekend shift — did not come to work', 3],
  ['LATE_CHECKIN_15', 'Checked in more than 15 min late', 0],
  ['LATE_CHECKIN_30', 'Checked in more than 30 min late', 1],
  ['JOB_DROPPED', 'Accepted job cancelled by the expert', 1],
  ['JOB_NO_SHOW', 'Did not arrive for an assigned job', 3],
  ['MANUAL', 'Added by operations', 1],
]

// Level by active Red Cards; `at` = the suspension threshold (default 6).
export function levelFor(count, at) {
  if (count >= at) return { key: 'suspended', label: 'Suspended', note: 'Account paused until operations review it.' }
  const t = [
    ['excellent', 'Excellent', 'Normal work allocation.'],
    ['good', 'Good', 'Keep it up — a small slip is on record.'],
    ['attention', 'Attention required', 'Please watch your attendance.'],
    ['warning', 'Warning', 'You get lower priority for new jobs.'],
    ['high_risk', 'High risk', 'Incentives may be restricted.'],
    ['final', 'Final warning', 'One more Red Card may suspend your account.'],
  ]
  const [key, label, note] = t[Math.min(count, t.length - 1)]
  return { key, label, note }
}
export const LOWER_PRIORITY_AT = 3   // dispatch puts experts with this many active cards after others

export function installReliability({ app, pool, auth, adminAuth, requirePerm, requireAnyPerm, internalOnly, ADMIN_URL, REDIS_URL, getWorker, raiseApproval = null, viaApprovals = null }) {
  const settings = async () => ({
    suspendAt: Math.max(1, await getSettingInt(ADMIN_URL, 'rc_suspend_at', 6)),
    expiryDays: Math.max(0, await getSettingInt(ADMIN_URL, 'rc_expiry_days', 30)),
    rupee: Math.max(0, await getSettingInt(ADMIN_URL, 'rc_rupee_value', 0)),
  })

  async function migrateRc() {
    for (const q of [
      `CREATE TABLE IF NOT EXISTS rc_rules (code TEXT PRIMARY KEY, name TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 1,
        auto_apply BOOLEAN NOT NULL DEFAULT true, active BOOLEAN NOT NULL DEFAULT true, sort INTEGER NOT NULL DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS worker_penalties (
        id SERIAL PRIMARY KEY, worker_id INTEGER NOT NULL, rule_code TEXT NOT NULL, points INTEGER NOT NULL,
        reason TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
        created_by TEXT NOT NULL DEFAULT 'system', created TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ, closed_by TEXT, UNIQUE (worker_id, rule_code, ref))`,
      `CREATE INDEX IF NOT EXISTS ix_wpen_worker ON worker_penalties(worker_id, status)`,
      `CREATE TABLE IF NOT EXISTS penalty_appeals (
        id SERIAL PRIMARY KEY, penalty_id INTEGER NOT NULL, worker_id INTEGER NOT NULL, reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', review_comment TEXT, reviewed_by TEXT,
        created TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ)`,
      `ALTER TABLE workers ADD COLUMN IF NOT EXISTS rc_suspended BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE workers ADD COLUMN IF NOT EXISTS rc_suspended_at TIMESTAMPTZ`,
    ]) await pool.query(q)
    for (const [i, [code, name, points]] of DEFAULT_RULES.entries())
      await pool.query('INSERT INTO rc_rules (code,name,points,sort) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING', [code, name, points, i])
  }

  const ACTIVE = "status='active' AND (expires_at IS NULL OR expires_at > now())"
  async function activeCount(wid) {
    return Number((await pool.query(`SELECT COALESCE(SUM(points),0)::int n FROM worker_penalties WHERE worker_id=$1 AND ${ACTIVE}`, [wid])).rows[0].n)
  }

  /** Add a penalty by rule code. Idempotent per (worker, rule, ref). Returns the row or null. */
  const tell = (workerId, title, body) => publishEvent(REDIS_URL, 'worker.notify', { workerId, title, body })

  async function applyPenalty(wid, code, { ref = '', reason = '', by = 'system', points = null } = {}) {
    const rule = (await pool.query('SELECT * FROM rc_rules WHERE code=$1', [code])).rows[0]
    if (!rule || !rule.active || (by === 'system' && !rule.auto_apply)) return null
    const pts = points != null ? Math.max(0, Math.round(points)) : rule.points
    const { expiryDays, suspendAt, rupee } = await settings()
    const ins = await pool.query(
      `INSERT INTO worker_penalties (worker_id, rule_code, points, reason, ref, created_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $7::int > 0 THEN now() + make_interval(days => $7::int) END)
       ON CONFLICT (worker_id, rule_code, ref) DO NOTHING RETURNING *`,
      [wid, code, pts, reason || rule.name, String(ref || ''), by, expiryDays])
    if (!ins.rowCount) return null
    const p = ins.rows[0]
    const w = await getWorker(wid)
    publishEvent(REDIS_URL, 'activity', { actorType: by === 'system' ? 'system' : 'admin', actorName: by === 'system' ? 'Reliability' : by, action: 'worker.red_card', entityType: 'worker', entityId: wid, detail: `${pts ? `+${pts} Red Card${pts > 1 ? 's' : ''}` : 'Warning'} — ${p.reason}${ref ? ` (${ref})` : ''}` })
    if (pts > 0 && rupee > 0) publishEvent(REDIS_URL, 'rc.penalty', { workerId: wid, amount: pts * rupee, points: pts, reason: p.reason, ref: p.ref })
    const n = await activeCount(wid)
    // Gap 1: tell the expert straight away (worker_notifications lives in the wallet service).
    tell(wid, pts > 0 ? `Red Card: +${pts}` : 'Reliability warning',
      `${p.reason}${p.ref && !p.ref.startsWith('manual-') ? ` (${p.ref})` : ''}. ` +
      (pts > 0 ? `You now have ${n} of ${suspendAt} Red Cards. ` : 'No Red Card this time. ') +
      'Think it is wrong? Appeal it in Profile → Performance.')
    if (pts > 0 && n >= suspendAt && w && !w.rc_suspended) {
      await pool.query('UPDATE workers SET rc_suspended=true, rc_suspended_at=now(), available=false WHERE id=$1', [wid])
      tell(wid, 'Account suspended', `You have reached ${n} Red Cards, so you cannot take new jobs. Operations will review your account — you can appeal a penalty in Profile → Performance.`)
      publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Reliability', action: 'worker.suspended', entityType: 'worker', entityId: wid, detail: `Suspended at ${n} Red Cards — review required` })
    }
    return p
  }

  // Expire points past their date (kept on record as 'expired').
  async function expireSweep() {
    await pool.query(`UPDATE worker_penalties SET status='expired', closed_at=now(), closed_by='system' WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= now()`).catch(() => {})
  }

  /* Shift no-show sweep: an expert rostered today (shifts table, IST weekday) whose shift has ended
   * with no check-in, no approved/pending leave and no "not coming" answer → SHIFT_NO_SHOW (weekend:
   * WEEKEND_NO_SHOW). Ref = the date, so it's charged once per day. */
  async function noShowSweep() {
    try {
      const now = new Date(Date.now() + 5.5 * 3600e3)
      const day = now.toISOString().slice(0, 10), weekday = now.getUTCDay(), min = now.getUTCHours() * 60 + now.getUTCMinutes()
      const { rows } = await pool.query(
        `SELECT DISTINCT s.worker_id FROM shifts s JOIN workers w ON w.id=s.worker_id
          WHERE w.status='active' AND s.weekday=$1 AND s.end_min <= $2 AND s.end_min > s.start_min
            AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.worker_id=s.worker_id AND a.day=$3::date)
            AND NOT EXISTS (SELECT 1 FROM leave_requests l WHERE l.worker_id=s.worker_id AND l.status <> 'Rejected' AND $3::date BETWEEN l.from_date AND COALESCE(l.to_date, l.from_date))
            AND NOT EXISTS (SELECT 1 FROM next_day_avail n WHERE n.worker_id=s.worker_id AND n.for_date=$3::date AND n.coming=false)`,
        [weekday, min, day])
      // Not on the roster but on a shift plan (Morning / Evening…) and said "coming" for today:
      // the plan's end time is the deadline.
      const planned = (await pool.query(
        `SELECT w.id worker_id FROM workers w
           JOIN shift_defs sd ON sd.id = w.shift_def_id
           JOIN next_day_avail n ON n.worker_id = w.id AND n.for_date = $2::date AND n.coming = true
          WHERE w.status='active' AND sd.end_min <= $1 AND sd.end_min > sd.start_min
            AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.worker_id=w.id AND a.day=$2::date)
            AND NOT EXISTS (SELECT 1 FROM leave_requests l WHERE l.worker_id=w.id AND l.status <> 'Rejected' AND $2::date BETWEEN l.from_date AND COALESCE(l.to_date, l.from_date))`,
        [min, day])).rows
      const weekend = weekday === 0 || weekday === 6
      const ids = [...new Set([...rows, ...planned].map((r) => r.worker_id))]
      for (const id of ids) await applyPenalty(id, weekend ? 'WEEKEND_NO_SHOW' : 'SHIFT_NO_SHOW', { ref: day })
    } catch (e) { console.error('[worker] noShowSweep:', e.message) }
  }

  /* Reliability score 0–100 over the last 30 days: 30% attendance, 20% on-time, 15% offer
   * acceptance, 20% completion (1 − dropped/no-show share), 15% rating, minus 5 per active Red Card.
   * Components with no data count as 100 so a new expert isn't punished for having no history. */
  async function reliability(wid) {
    const w = await getWorker(wid)
    const { suspendAt } = await settings()
    const q1 = (sql, p) => pool.query(sql, p).then((r) => r.rows[0]).catch(() => ({}))
    const att = await q1(`SELECT COUNT(*)::int days, COUNT(*) FILTER (WHERE on_time)::int ontime FROM attendance WHERE worker_id=$1 AND day >= (now() AT TIME ZONE 'Asia/Kolkata')::date - 30`, [wid])
    const rostered = await q1(`SELECT COUNT(*)::int n FROM shifts WHERE worker_id=$1`, [wid])
    const offers = await q1(`SELECT COUNT(*) FILTER (WHERE outcome='accepted')::int acc, COUNT(*) FILTER (WHERE outcome IN ('accepted','declined'))::int ans FROM job_offers WHERE worker_id=$1 AND offered_at > now() - interval '30 days'`, [wid])
    const bad = await q1(`SELECT COUNT(*)::int n FROM worker_penalties WHERE worker_id=$1 AND rule_code IN ('JOB_DROPPED','JOB_NO_SHOW') AND created > now() - interval '30 days' AND status <> 'reversed'`, [wid])
    const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 100)
    const expectedDays = Math.round((rostered.n || 0) * 30 / 7)
    const attendance = pct(att.days || 0, expectedDays)
    const onTime = pct(att.ontime || 0, att.days || 0)
    const acceptance = pct(offers.acc || 0, offers.ans || 0)
    const jobs = Number(w?.jobs || 0)
    const completion = pct(Math.max(0, jobs - (bad.n || 0)), jobs)
    const rating = Math.round((Math.min(5, Number(w?.rating || 5)) / 5) * 100)
    const redCards = await activeCount(wid)
    const score = Math.max(0, Math.min(100, Math.round(0.3 * attendance + 0.2 * onTime + 0.15 * acceptance + 0.2 * completion + 0.15 * rating - 5 * redCards)))
    return { score, redCards, suspendAt, level: w?.rc_suspended ? levelFor(suspendAt, suspendAt) : levelFor(redCards, suspendAt), suspended: !!w?.rc_suspended, attendance, onTime, acceptance, completion, rating: Number(w?.rating || 0), jobs }
  }

  const penaltyDto = (p) => ({ id: p.id, code: p.rule_code, points: p.points, reason: p.reason, ref: p.ref, status: p.status, createdBy: p.created_by, created: p.created, expiresAt: p.expires_at, closedAt: p.closed_at, appeal: p.appeal_status ? { status: p.appeal_status, reason: p.appeal_reason, comment: p.appeal_comment } : null })
  const historyFor = (wid) => pool.query(
    `SELECT p.*, a.status appeal_status, a.reason appeal_reason, a.review_comment appeal_comment FROM worker_penalties p
       LEFT JOIN LATERAL (SELECT * FROM penalty_appeals x WHERE x.penalty_id=p.id ORDER BY x.id DESC LIMIT 1) a ON true
      WHERE p.worker_id=$1 ORDER BY p.created DESC LIMIT 100`, [wid]).then((r) => r.rows.map(penaltyDto))

  // ----- expert app -----
  app.get('/api/worker/reliability', auth, async (req, res) => res.json({ ...(await reliability(req.worker.id)), history: await historyFor(req.worker.id) }))
  app.post('/api/worker/penalties/:id/appeal', auth, async (req, res) => {
    const reason = String(req.body?.reason || '').trim().slice(0, 1000)
    if (reason.length < 5) return res.status(400).json({ ok: false, error: 'Please explain what happened.' })
    const p = (await pool.query('SELECT * FROM worker_penalties WHERE id=$1 AND worker_id=$2', [Number(req.params.id), req.worker.id])).rows[0]
    if (!p) return res.status(404).json({ ok: false, error: 'Not found' })
    if (p.status !== 'active') return res.status(409).json({ ok: false, error: 'This penalty is no longer active.' })
    const open = await pool.query("SELECT 1 FROM penalty_appeals WHERE penalty_id=$1 AND status='pending'", [p.id])
    if (open.rowCount) return res.status(409).json({ ok: false, error: 'An appeal is already under review.' })
    const ap = await pool.query('INSERT INTO penalty_appeals (penalty_id, worker_id, reason) VALUES ($1,$2,$3) RETURNING id', [p.id, req.worker.id, reason])
    raiseApproval?.({ type: 'rc_appeal', ref: ap.rows[0].id, workerId: req.worker.id, summary: `${p.reason}${p.points ? ` (+${p.points})` : ''} — “${reason.slice(0, 120)}”` })
    publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'worker.appeal', entityType: 'worker', entityId: req.worker.id, detail: `Appealed: ${p.reason}` })
    res.json({ ok: true, history: await historyFor(req.worker.id) })
  })

  // ----- other services report violations -----
  app.post('/internal/workers/:id/penalty', internalOnly, async (req, res) => {
    const p = await applyPenalty(Number(req.params.id), String(req.body?.code || ''), { ref: req.body?.ref, reason: req.body?.reason })
    res.json({ ok: true, applied: !!p })
  })

  // ----- admin -----
  const view = requireAnyPerm('workers.view'), edit = requirePerm('workers.edit')
  app.get('/api/admin/reliability/summary', adminAuth, view, async (_q, res) => {
    const { suspendAt } = await settings()
    const { rows } = await pool.query(
      `SELECT w.id, w.rc_suspended, COALESCE(SUM(p.points) FILTER (WHERE p.status='active' AND (p.expires_at IS NULL OR p.expires_at > now())),0)::int n
         FROM workers w LEFT JOIN worker_penalties p ON p.worker_id=w.id WHERE w.status='active' GROUP BY w.id`)
    const b = { active: rows.length, zero: 0, low: 0, mid: 0, final: 0, suspended: 0 }
    for (const r of rows) { if (r.rc_suspended || r.n >= suspendAt) b.suspended++; else if (r.n === 0) b.zero++; else if (r.n <= 2) b.low++; else if (r.n <= 4) b.mid++; else b.final++ }
    const pendingAppeals = Number((await pool.query("SELECT COUNT(*)::int n FROM penalty_appeals WHERE status='pending'")).rows[0].n)
    res.json({ ...b, pendingAppeals, suspendAt })
  })
  app.get('/api/admin/reliability/penalties', adminAuth, view, async (req, res) => {
    const status = String(req.query.status || '')
    const { rows } = await pool.query(
      `SELECT p.*, w.name worker_name, w.phone worker_phone, a.status appeal_status, a.reason appeal_reason, a.review_comment appeal_comment
         FROM worker_penalties p JOIN workers w ON w.id=p.worker_id
         LEFT JOIN LATERAL (SELECT * FROM penalty_appeals x WHERE x.penalty_id=p.id ORDER BY x.id DESC LIMIT 1) a ON true
        WHERE ($1='' OR p.status=$1) ORDER BY p.created DESC LIMIT 300`, [status])
    res.json(rows.map((r) => ({ ...penaltyDto(r), workerId: r.worker_id, workerName: r.worker_name, workerPhone: r.worker_phone })))
  })
  app.get('/api/admin/reliability/appeals', adminAuth, view, async (req, res) => {
    const status = String(req.query.status || 'pending')
    const { rows } = await pool.query(
      `SELECT a.*, p.reason penalty_reason, p.points, p.ref, p.created penalty_created, w.name worker_name
         FROM penalty_appeals a JOIN worker_penalties p ON p.id=a.penalty_id JOIN workers w ON w.id=a.worker_id
        WHERE ($1='all' OR a.status=$1) ORDER BY a.created DESC LIMIT 200`, [status])
    res.json(rows)
  })
  // The appeal decision itself — used by the admin route and by the Approval Center's final step.
  async function decideAppeal(id, approve, comment, who) {
    const a = (await pool.query("SELECT * FROM penalty_appeals WHERE id=$1 AND status='pending'", [Number(id)])).rows[0]
    if (!a) return { ok: false, error: 'Appeal not found or already decided' }
    const req = { body: { comment } }
    await pool.query('UPDATE penalty_appeals SET status=$1, review_comment=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$4', [approve ? 'approved' : 'rejected', String(req.body?.comment || ''), who, a.id])
    if (approve) await reversePenalty(a.penalty_id, who, true)
    else tell(a.worker_id, 'Appeal rejected', `Your appeal was not accepted${req.body?.comment ? `: ${String(req.body.comment)}` : '.'} The Red Card stays on your record.`)
    return { ok: true }
  }
  app.post('/api/admin/reliability/appeals/:id/decide', adminAuth, edit, async (req, res) => {
    const approve = req.body?.approve === true
    if (viaApprovals && (await viaApprovals(req, res, 'rc_appeal', req.params.id, approve, req.body?.comment))) return
    const r = await decideAppeal(Number(req.params.id), approve, String(req.body?.comment || ''), req.admin?.name || req.admin?.email || 'Admin')
    if (!r.ok) return res.status(404).json({ error: r.error })
    res.json({ ok: true })
  })
  async function reversePenalty(id, who, viaAppeal = false) {
    const p = (await pool.query("UPDATE worker_penalties SET status='reversed', closed_at=now(), closed_by=$2 WHERE id=$1 AND status='active' RETURNING *", [id, who])).rows[0]
    if (!p) return null
    tell(p.worker_id, viaAppeal ? 'Appeal approved' : 'Red Card removed', `"${p.reason}" has been removed from your record.`)
    publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'worker.red_card_reversed', entityType: 'worker', entityId: p.worker_id, detail: `Removed: ${p.reason}` })
    // Dropped below the threshold by a reversal → lift an automatic suspension.
    const { suspendAt } = await settings()
    if ((await activeCount(p.worker_id)) < suspendAt) await pool.query('UPDATE workers SET rc_suspended=false WHERE id=$1', [p.worker_id])
    return p
  }
  app.post('/api/admin/reliability/penalties/:id/reverse', adminAuth, edit, async (req, res) => {
    const p = await reversePenalty(Number(req.params.id), req.admin?.name || req.admin?.email || 'Admin')
    if (!p) return res.status(404).json({ error: 'Not found or not active' })
    res.json({ ok: true })
  })
  app.get('/api/admin/workers/:id/reliability', adminAuth, view, async (req, res) => {
    const wid = Number(req.params.id)
    if (!(await getWorker(wid))) return res.status(404).json({ error: 'Not found' })
    res.json({ ...(await reliability(wid)), history: await historyFor(wid) })
  })
  app.post('/api/admin/workers/:id/penalties', adminAuth, edit, async (req, res) => {
    const wid = Number(req.params.id)
    if (!(await getWorker(wid))) return res.status(404).json({ error: 'Not found' })
    const code = String(req.body?.code || 'MANUAL')
    const reason = String(req.body?.reason || '').trim()
    if (!reason) return res.status(400).json({ error: 'Give a reason' })
    const p = await applyPenalty(wid, code, { ref: `manual-${Date.now()}`, reason, by: req.admin?.name || req.admin?.email || 'Admin', points: req.body?.points != null && req.body.points !== '' ? Number(req.body.points) : null })
    if (!p) return res.status(400).json({ error: 'Rule is switched off' })
    res.json({ ok: true })
  })
  app.post('/api/admin/workers/:id/reinstate', adminAuth, edit, async (req, res) => {
    const wid = Number(req.params.id)
    const who = req.admin?.name || req.admin?.email || 'Admin'
    await pool.query('UPDATE workers SET rc_suspended=false WHERE id=$1', [wid])
    tell(wid, 'Account reinstated', 'You can go online and take jobs again. Keep your Red Cards low to stay active.')
    publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'worker.reinstated', entityType: 'worker', entityId: wid, detail: 'Reinstated after reliability review' })
    res.json({ ok: true })
  })
  app.get('/api/admin/reliability/rules', adminAuth, view, async (_q, res) => res.json((await pool.query('SELECT * FROM rc_rules ORDER BY sort, code')).rows))
  app.put('/api/admin/reliability/rules/:code', adminAuth, edit, async (req, res) => {
    const b = req.body || {}
    if (b.points != null && !(Number(b.points) >= 0)) return res.status(400).json({ error: 'Points cannot be negative' })
    const r = await pool.query(
      'UPDATE rc_rules SET name=COALESCE($2,name), points=COALESCE($3,points), auto_apply=COALESCE($4,auto_apply), active=COALESCE($5,active) WHERE code=$1 RETURNING *',
      [req.params.code, b.name ?? null, b.points != null ? Math.round(Number(b.points)) : null, b.autoApply ?? null, b.active ?? null])
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' })
    res.json(r.rows[0])
  })

  return {
    migrateRc, applyPenalty, activeCount, decideAppeal,
    start() { setInterval(noShowSweep, 10 * 60000).unref(); setInterval(expireSweep, 30 * 60000).unref(); expireSweep() },
  }
}
