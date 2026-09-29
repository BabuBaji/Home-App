/* Approval Center — one engine for every request that needs a sign-off.
 *
 * A request type (shift change, leave, advance, withdrawal, bank account, Red Card appeal, KYC
 * document, skill) has a FLOW: an ordered list of levels, e.g. Team Lead → Zone Manager → Finance.
 * Every level must approve, in order. A reject at any level ends it. The flows are data (ac_flows),
 * edited in Admin ▸ Approval Center ▸ Rules — nothing about who approves what is hard-coded here.
 *
 * The request itself stays owned by its service (worker / wallet). That service RAISES an item here
 * when the expert asks, and when the last level approves (or anyone rejects) this engine calls the
 * service's /internal/approvals/execute, which runs the same decision logic an admin button used to
 * run directly. The old per-screen Approve/Reject buttons still work: they arrive here via
 * /internal/approvals/decide-by-ref and count as that admin's signature on the current level.
 *
 * Levels:
 *   team_lead    — the expert's assigned Team Lead (workers.team_lead_id)
 *   zone_manager — a Zone Manager / Manager whose territory covers the expert (Admin can stand in)
 *   verifier     — anyone with workers.edit covering the expert (recruiter, manager…)
 *   finance      — holds finance.payout (Finance, Admin)
 *   admin        — the Admin role
 * A team_lead / zone_manager level with nobody to fill it (no lead assigned, no manager for that
 * zone) is skipped and recorded as such; the money / verifier / admin levels never skip. Super Admin
 * may act on any level. Nobody (except Super Admin) signs two levels of the same request.
 */
import { requireAnyPerm, requirePerm, internalOnly, publishEvent, tryGet, internalPost, inScope } from '@homehelp/shared'

export const LEVELS = {
  team_lead: 'Team Lead', zone_manager: 'Zone Manager', verifier: 'Verifier', finance: 'Finance', admin: 'Admin',
}
const TYPES = [
  { type: 'shift_change', label: 'Shift change', svc: 'worker', levels: ['team_lead', 'zone_manager'] },
  { type: 'leave', label: 'Leave', svc: 'worker', levels: ['team_lead', 'zone_manager'] },
  { type: 'advance', label: 'Salary advance', svc: 'wallet', levels: ['team_lead', 'zone_manager', 'finance'] },
  { type: 'withdrawal', label: 'Withdrawal', svc: 'wallet', levels: ['zone_manager', 'finance'] },
  { type: 'bank_account', label: 'Bank account', svc: 'worker', levels: ['zone_manager', 'finance'] },
  { type: 'rc_appeal', label: 'Red Card appeal', svc: 'worker', levels: ['zone_manager', 'admin'] },
  { type: 'document', label: 'KYC document', svc: 'worker', levels: ['verifier'] },
  { type: 'skill', label: 'Skill verification', svc: 'worker', levels: ['team_lead', 'verifier'] },
]
const TYPE = Object.fromEntries(TYPES.map((t) => [t.type, t]))

export function installApprovalCenter({ app, pool, admin, resolvePermissions, resolveScope, U, REDIS_URL }) {
  const SVC = { worker: U.worker, wallet: (process.env.WALLET_URL || 'http://localhost:4009').replace(/\/$/, '') }

  async function migrateAc() {
    await pool.query(`CREATE TABLE IF NOT EXISTS ac_flows (
      type TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT true, levels JSONB NOT NULL DEFAULT '[]'::jsonb,
      sla_hours INTEGER NOT NULL DEFAULT 24, updated_by TEXT NOT NULL DEFAULT '', updated TIMESTAMPTZ NOT NULL DEFAULT now())`)
    await pool.query(`CREATE TABLE IF NOT EXISTS ac_items (
      id SERIAL PRIMARY KEY, type TEXT NOT NULL, ref TEXT NOT NULL,
      worker_id INTEGER, worker_name TEXT NOT NULL DEFAULT '', zone_id INTEGER, city TEXT, store_id INTEGER, team_lead_id INTEGER,
      title TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', amount INTEGER, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      levels JSONB NOT NULL DEFAULT '[]'::jsonb, level_idx INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending', error TEXT NOT NULL DEFAULT '',
      created TIMESTAMPTZ NOT NULL DEFAULT now(), updated TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ)`)
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ac_items_open ON ac_items (type, ref) WHERE status = 'pending'`)
    await pool.query(`CREATE TABLE IF NOT EXISTS ac_steps (
      id SERIAL PRIMARY KEY, item_id INTEGER NOT NULL, level_idx INTEGER NOT NULL, level TEXT NOT NULL,
      decision TEXT NOT NULL, by_id INTEGER, by_name TEXT NOT NULL DEFAULT '', by_role TEXT NOT NULL DEFAULT '',
      comment TEXT NOT NULL DEFAULT '', at TIMESTAMPTZ NOT NULL DEFAULT now())`)
    for (const t of TYPES) {
      await pool.query('INSERT INTO ac_flows (type, levels) VALUES ($1,$2::jsonb) ON CONFLICT (type) DO NOTHING', [t.type, JSON.stringify(t.levels)])
    }
  }

  const flow = async (type) => (await pool.query('SELECT * FROM ac_flows WHERE type=$1', [type])).rows[0] || null
  const stepsOf = async (itemId) => (await pool.query('SELECT * FROM ac_steps WHERE item_id=$1 ORDER BY id', [itemId])).rows
  const covers = (scope, it) => inScope(scope, { zoneId: it.zone_id, city: it.city, storeId: it.store_id })

  // Active admins with their permissions + effective territory (for "is there anyone for this level?").
  async function staff() {
    const all = (await pool.query("SELECT id, name, role, status, reports_to, scope_type, scope_values FROM admins WHERE COALESCE(status,'active')='active'")).rows
    const out = []
    for (const a of all) out.push({ ...a, permissions: await resolvePermissions(a.role), scope: await resolveScope(a, all) })
    return out
  }

  /** May admin `a` ({id, role, permissions, scope}) sign the CURRENT level of `it`? */
  function canAct(a, it, steps) {
    if (!a || it.status !== 'pending') return false
    if (a.role === 'super') return true
    if (steps.some((s) => s.decision === 'approved' && s.by_id === a.id)) return false // one signature per person
    const perms = a.permissions || []
    switch (it.levels[it.level_idx]) {
      case 'team_lead': return it.team_lead_id != null && a.id === it.team_lead_id
      case 'zone_manager': return ['zone_manager', 'manager', 'admin'].includes(a.role) && covers(a.scope, it)
      case 'verifier': return perms.includes('workers.edit') && covers(a.scope, it)
      case 'finance': return perms.includes('finance.payout')
      case 'admin': return a.role === 'admin'
      default: return false
    }
  }
  // Could ANYONE (other than Super Admin) fill this level? team_lead / zone_manager levels skip if not.
  function levelFillable(level, it, people) {
    if (level === 'team_lead') return it.team_lead_id != null && people.some((p) => p.id === it.team_lead_id)
    if (level === 'zone_manager') return people.some((p) => ['zone_manager', 'manager'].includes(p.role) && covers(p.scope, it))
    return true
  }

  const notifyWorker = (it, title, body) => it.worker_id && publishEvent(REDIS_URL, 'worker.notify', { workerId: it.worker_id, title, body })

  // Move past levels nobody can fill; when every level is done, execute the approval.
  async function advance(itemId) {
    let it = (await pool.query('SELECT * FROM ac_items WHERE id=$1', [itemId])).rows[0]
    const people = await staff()
    while (it.status === 'pending' && it.level_idx < it.levels.length && !levelFillable(it.levels[it.level_idx], it, people)) {
      const lvl = it.levels[it.level_idx]
      await pool.query("INSERT INTO ac_steps (item_id, level_idx, level, decision, by_name, comment) VALUES ($1,$2,$3,'skipped','System',$4)",
        [it.id, it.level_idx, lvl, lvl === 'team_lead' ? 'No Team Lead assigned' : `No ${LEVELS[lvl]} for this area`])
      it = (await pool.query('UPDATE ac_items SET level_idx=level_idx+1, updated=now() WHERE id=$1 RETURNING *', [it.id])).rows[0]
    }
    if (it.status === 'pending' && it.level_idx >= it.levels.length) return finish(it, true, '', (await stepsOf(it.id)).filter((s) => s.decision === 'approved').pop()?.by_name || 'System')
    return it
  }

  // Hand the final decision to the owning service.
  async function finish(it, approve, comment, who) {
    const t = TYPE[it.type]
    try {
      const r = await internalPost(SVC[t.svc], '/internal/approvals/execute', { type: it.type, ref: it.ref, approve, comment, by: who, payload: it.payload })
      if (r && r.ok === false) throw new Error(r.error || 'The request could not be applied')
      it = (await pool.query("UPDATE ac_items SET status=$2, decided_at=now(), updated=now(), error='' WHERE id=$1 RETURNING *", [it.id, approve ? 'approved' : 'rejected'])).rows[0]
    } catch (e) {
      it = (await pool.query("UPDATE ac_items SET status='failed', error=$2, updated=now() WHERE id=$1 RETURNING *", [it.id, String(e.message || e).slice(0, 300)])).rows[0]
    }
    publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: `approval.${it.status}`, entityType: 'worker', entityId: it.worker_id, detail: `${t.label}: ${it.summary} — ${it.status}${it.error ? ` (${it.error})` : ''}` })
    return it
  }

  /** One admin's decision on the current level. Returns { ok, item } or { ok:false, status, error }. */
  async function decide(it, a, approve, comment) {
    const steps = await stepsOf(it.id)
    if (it.status !== 'pending') return { ok: false, status: 409, error: 'This request has already been decided.' }
    if (!canAct(a, it, steps)) {
      const lvl = it.levels[it.level_idx]
      return { ok: false, status: 403, error: `Waiting for the ${LEVELS[lvl] || lvl} level${steps.some((s) => s.by_id === a?.id && s.decision === 'approved') ? ' — you already signed an earlier level' : ''}.` }
    }
    if (!approve && !String(comment || '').trim()) return { ok: false, status: 400, error: 'Give a reason for rejecting.' }
    const lvl = it.levels[it.level_idx]
    const who = a.name || a.email || 'Admin'
    await pool.query('INSERT INTO ac_steps (item_id, level_idx, level, decision, by_id, by_name, by_role, comment) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [it.id, it.level_idx, lvl, approve ? 'approved' : 'rejected', a.id ?? null, who, a.role || '', String(comment || '')])
    if (!approve) return { ok: true, item: await finish(it, false, String(comment || ''), who) }
    it = (await pool.query('UPDATE ac_items SET level_idx=level_idx+1, updated=now() WHERE id=$1 RETURNING *', [it.id])).rows[0]
    it = await advance(it.id)
    if (it.status === 'pending') notifyWorker(it, `${TYPE[it.type].label}: step approved`, `${who} (${LEVELS[lvl]}) approved your request. It is now with the ${LEVELS[it.levels[it.level_idx]]}.`)
    return { ok: true, item: it }
  }

  // Shape an item for the panel: levels with their state, and whether the viewer can act now.
  async function dto(it, a) {
    const steps = await stepsOf(it.id)
    const lv = it.levels.map((l, i) => {
      const s = [...steps].reverse().find((x) => x.level_idx === i)
      return { level: l, label: LEVELS[l] || l, state: s ? s.decision : (i === it.level_idx && it.status === 'pending' ? 'current' : 'waiting'), by: s?.by_name || '', at: s?.at || null, comment: s?.comment || '' }
    })
    return {
      id: it.id, type: it.type, typeLabel: TYPE[it.type]?.label || it.type, ref: it.ref, title: it.title, summary: it.summary, amount: it.amount,
      workerId: it.worker_id, workerName: it.worker_name, status: it.status, error: it.error, created: it.created, decidedAt: it.decided_at,
      levels: lv, currentLevel: it.status === 'pending' ? (LEVELS[it.levels[it.level_idx]] || '') : '', canAct: canAct(a, it, steps),
    }
  }

  // ---------------- internal: services raise and decide ----------------
  app.post('/internal/approvals', internalOnly, async (req, res) => {
    const b = req.body || {}
    const t = TYPE[b.type]
    const f = t && (await flow(b.type))
    if (!t || !f?.enabled || !Array.isArray(f.levels) || !f.levels.length) return res.json({ handled: false })
    const ctx = b.workerId ? await tryGet(U.worker, `/internal/workers/${Number(b.workerId)}/approval-context`, null) : null
    // A fresh request for the same thing supersedes the one still open.
    await pool.query("UPDATE ac_items SET status='cancelled', updated=now(), error='Replaced by a newer request' WHERE type=$1 AND ref=$2 AND status='pending'", [b.type, String(b.ref)])
    const it = (await pool.query(
      `INSERT INTO ac_items (type, ref, worker_id, worker_name, zone_id, city, store_id, team_lead_id, title, summary, amount, payload, levels)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb) RETURNING *`,
      [b.type, String(b.ref), b.workerId ?? null, ctx?.name || b.workerName || '', ctx?.zoneId ?? null, ctx?.city ?? null, ctx?.storeId ?? null, ctx?.teamLeadId ?? null,
        b.title || t.label, String(b.summary || ''), b.amount != null ? Math.round(Number(b.amount)) : null, JSON.stringify(b.payload || {}), JSON.stringify(f.levels)])).rows[0]
    const after = await advance(it.id)
    res.json({ handled: true, id: after.id, status: after.status, waitingFor: after.status === 'pending' ? LEVELS[after.levels[after.level_idx]] : null })
  })
  // The expert withdrew / the thing no longer exists → close it quietly.
  app.post('/internal/approvals/cancel', internalOnly, async (req, res) => {
    const r = await pool.query("UPDATE ac_items SET status='cancelled', updated=now(), error=$3 WHERE type=$1 AND ref=$2 AND status='pending'", [req.body?.type, String(req.body?.ref), String(req.body?.reason || '')])
    res.json({ ok: true, cancelled: r.rowCount })
  })
  // An old per-screen Approve/Reject button: counts as this admin's signature on the current level.
  app.post('/internal/approvals/decide-by-ref', internalOnly, async (req, res) => {
    const b = req.body || {}
    const it = (await pool.query("SELECT * FROM ac_items WHERE type=$1 AND ref=$2 AND status='pending' ORDER BY id DESC LIMIT 1", [b.type, String(b.ref)])).rows[0]
    if (!it) return res.json({ handled: false }) // not under the Approval Center (raised before it, or flow off)
    const r = await decide(it, b.admin, !!b.approve, b.comment)
    if (!r.ok) return res.status(r.status).json({ handled: true, error: r.error })
    const d = await dto(r.item, b.admin)
    res.json({ handled: true, ok: true, status: d.status, message: d.status === 'pending' ? `Signed. Now waiting for the ${d.currentLevel}.` : d.status === 'failed' ? d.error : `Request ${d.status}.`, item: d })
  })

  // ---------------- admin panel ----------------
  const viewPerm = requireAnyPerm('approvals.decide', 'approvals.manage', 'approvals.review')
  // Items this admin is allowed to see: their territory (or their own Team-Lead experts).
  const visible = (a, it) => a?.role === 'super' || it.team_lead_id === a?.id || covers(a?.scope, it)

  app.get('/api/admin/approval-center/items', admin, viewPerm, async (req, res) => {
    const tab = String(req.query.tab || 'mine')
    const type = String(req.query.type || '')
    const where = tab === 'done' ? "status <> 'pending'" : "status = 'pending'"
    const rows = (await pool.query(`SELECT * FROM ac_items WHERE ${where} ${type ? 'AND type=$1' : ''} ORDER BY ${tab === 'done' ? 'updated DESC' : 'created ASC'} LIMIT 300`, type ? [type] : [])).rows
    const out = []
    for (const it of rows) {
      if (!visible(req.admin, it)) continue
      const d = await dto(it, req.admin)
      if (tab === 'mine' && !d.canAct) continue
      out.push(d)
    }
    res.json(out)
  })
  app.get('/api/admin/approval-center/count', admin, viewPerm, async (req, res) => {
    const rows = (await pool.query("SELECT * FROM ac_items WHERE status='pending'")).rows
    let mine = 0
    for (const it of rows) if (visible(req.admin, it) && canAct(req.admin, it, await stepsOf(it.id))) mine++
    const money = (req.admin?.permissions || []).includes('approvals.review') || req.admin?.role === 'super'
      ? Number((await pool.query("SELECT COUNT(*)::int n FROM approval_requests WHERE status='pending'")).rows[0].n) : 0
    res.json({ mine, money, total: mine + money })
  })
  app.post('/api/admin/approval-center/items/:id/decide', admin, requireAnyPerm('approvals.decide'), async (req, res) => {
    const it = (await pool.query('SELECT * FROM ac_items WHERE id=$1', [Number(req.params.id)])).rows[0]
    if (!it || !visible(req.admin, it)) return res.status(404).json({ error: 'Not found' })
    const r = await decide(it, req.admin, !!req.body?.approve, req.body?.comment)
    if (!r.ok) return res.status(r.status).json({ error: r.error })
    res.json(await dto(r.item, req.admin))
  })
  // Retry a request whose final step failed to apply (e.g. the service was down).
  app.post('/api/admin/approval-center/items/:id/retry', admin, requireAnyPerm('approvals.manage'), async (req, res) => {
    const it = (await pool.query("SELECT * FROM ac_items WHERE id=$1 AND status='failed'", [Number(req.params.id)])).rows[0]
    if (!it) return res.status(404).json({ error: 'Nothing to retry' })
    const last = (await stepsOf(it.id)).pop()
    res.json(await dto(await finish(it, last?.decision !== 'rejected', last?.comment || '', req.admin?.name || 'Admin'), req.admin))
  })
  app.get('/api/admin/approval-center/flows', admin, viewPerm, async (_q, res) => {
    const rows = (await pool.query('SELECT * FROM ac_flows')).rows
    res.json({ levels: LEVELS, flows: TYPES.map((t) => { const f = rows.find((r) => r.type === t.type) || {}; return { type: t.type, label: t.label, enabled: f.enabled !== false, levels: f.levels || t.levels, slaHours: f.sla_hours ?? 24, updatedBy: f.updated_by || '' } }) })
  })
  app.put('/api/admin/approval-center/flows/:type', admin, requirePerm('approvals.manage'), async (req, res) => {
    const t = TYPE[req.params.type]
    if (!t) return res.status(404).json({ error: 'Unknown request type' })
    const levels = Array.isArray(req.body?.levels) ? req.body.levels.filter((l) => LEVELS[l]) : null
    if (levels && !levels.length) return res.status(400).json({ error: 'A flow needs at least one level' })
    if (levels && new Set(levels).size !== levels.length) return res.status(400).json({ error: 'A level can appear only once' })
    const who = req.admin?.name || req.admin?.email || 'Admin'
    await pool.query(
      `UPDATE ac_flows SET enabled=COALESCE($2, enabled), levels=COALESCE($3::jsonb, levels), sla_hours=COALESCE($4, sla_hours), updated_by=$5, updated=now() WHERE type=$1`,
      [t.type, typeof req.body?.enabled === 'boolean' ? req.body.enabled : null, levels ? JSON.stringify(levels) : null,
        req.body?.slaHours != null ? Math.max(1, parseInt(req.body.slaHours, 10) || 24) : null, who])
    publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'approval.flow', entityType: 'settings', entityId: 0, detail: `Approval flow for ${t.label} updated` })
    res.json({ ok: true })
  })

  return { migrateAc }
}
