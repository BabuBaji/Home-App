import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, ShieldAlert, AlertTriangle, UserX, Scale, Users } from 'lucide-react'
import {
  fetchRcSummary, fetchRcPenalties, fetchRcAppeals, decideRcAppeal, reverseRcPenalty, fetchRcRules, saveRcRule,
  fetchSettings, updateSettings, type RcPenalty, type RcAppeal, type RcRule, type RcSummary,
} from '../api'
import { Card, Badge, Loading, StatCard, Field, useToast } from '../components/UI'

/* Workforce ▸ Reliability & Penalties — the Red Card system: who is at risk, penalties on record,
 * appeals to decide, and the rules (points per violation + thresholds). All values are data. */
type Tab = 'penalties' | 'appeals' | 'rules'
const STATUS_TONE: Record<string, string> = { active: 'red', reversed: 'green', expired: 'gray' }
const when = (d: string) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const isManualRef = (r: string) => !r || r.startsWith('manual-')

const acMsg = (r: unknown, fallback: string) => { const x = r as { approvalCenter?: boolean; message?: string } | null; return x?.approvalCenter && x.message ? x.message : fallback }
export default function Reliability() {
  const nav = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('penalties')
  const [sum, setSum] = useState<RcSummary | null>(null)
  const [pens, setPens] = useState<RcPenalty[] | null>(null)
  const [pStatus, setPStatus] = useState('active')
  const [q, setQ] = useState('')
  const [appeals, setAppeals] = useState<RcAppeal[] | null>(null)
  const [aStatus, setAStatus] = useState('pending')
  const [rules, setRules] = useState<RcRule[] | null>(null)
  const [cfg, setCfg] = useState<{ rc_suspend_at: string; rc_expiry_days: string; rc_rupee_value: string } | null>(null)

  const loadSum = () => fetchRcSummary().then(setSum).catch(() => {})
  useEffect(() => { loadSum() }, [])
  useEffect(() => {
    if (tab !== 'penalties') return
    setPens(null); fetchRcPenalties(pStatus).then(setPens).catch((e: Error) => toast(e.message))
  }, [tab, pStatus])
  useEffect(() => {
    if (tab !== 'appeals') return
    setAppeals(null); fetchRcAppeals(aStatus).then(setAppeals).catch((e: Error) => toast(e.message))
  }, [tab, aStatus])
  useEffect(() => {
    if (tab !== 'rules') return
    fetchRcRules().then(setRules).catch((e: Error) => toast(e.message))
    fetchSettings().then((st) => {
      const s = st as unknown as Record<string, unknown>
      setCfg({ rc_suspend_at: String(s.rc_suspend_at ?? '6'), rc_expiry_days: String(s.rc_expiry_days ?? '30'), rc_rupee_value: String(s.rc_rupee_value ?? '0') })
    }).catch(() => {})
  }, [tab])

  async function reverse(p: RcPenalty) {
    try {
      await reverseRcPenalty(p.id); toast('Red Card removed')
      setPens((l) => l && l.map((x) => (x.id === p.id ? { ...x, status: 'reversed' } : x))); loadSum()
    } catch (e) { toast((e as Error).message) }
  }
  async function decide(a: RcAppeal, approve: boolean) {
    const comment = window.prompt(approve ? 'Note for approving (optional)' : 'Why is the appeal rejected?')
    if (comment === null) return
    try {
      const r = await decideRcAppeal(a.id, approve, comment)
      toast(acMsg(r, approve ? 'Appeal approved — Red Card removed' : 'Appeal rejected'))
      setAppeals((l) => l && l.filter((x) => x.id !== a.id)); loadSum()
    } catch (e) { toast((e as Error).message) }
  }
  async function saveRule(r: RcRule, body: Partial<{ points: number; autoApply: boolean; active: boolean }>) {
    try { const n = await saveRcRule(r.code, body); setRules((l) => l && l.map((x) => (x.code === r.code ? n : x))); toast('Rule saved') } catch (e) { toast((e as Error).message) }
  }
  async function saveCfg() {
    if (!cfg) return
    try { await updateSettings(cfg as never); toast('Thresholds saved'); loadSum() } catch (e) { toast((e as Error).message) }
  }

  const shown = (pens || []).filter((p) => !q.trim() || `${p.workerName} ${p.workerPhone} ${p.reason} ${p.ref}`.toLowerCase().includes(q.trim().toLowerCase()))
  const tabs: [Tab, string][] = [['penalties', 'Penalties'], ['appeals', `Appeals${sum?.pendingAppeals ? ` (${sum.pendingAppeals})` : ''}`], ['rules', 'Rules & thresholds']]

  return (
    <div>
      <div className="stat-row">
        <StatCard icon={<Users size={20} />} tint="#4F29E1" label="Active experts" value={sum?.active ?? '—'} />
        <StatCard icon={<ShieldCheck size={20} />} tint="#16a34a" label="0 Red Cards" value={sum?.zero ?? '—'} />
        <StatCard icon={<AlertTriangle size={20} />} tint="#d97706" label="1–2 cards" value={sum?.low ?? '—'} />
        <StatCard icon={<ShieldAlert size={20} />} tint="#ea580c" label="3–4 cards" value={sum?.mid ?? '—'} sub="lower dispatch priority" />
        <StatCard icon={<AlertTriangle size={20} />} tint="#dc2626" label="Final warning" value={sum?.final ?? '—'} sub={`${(sum?.suspendAt ?? 6) - 1}+ cards`} />
        <StatCard icon={<UserX size={20} />} tint="#7f1d1d" label="Suspended" value={sum?.suspended ?? '—'} />
        <StatCard icon={<Scale size={20} />} tint="#2563eb" label="Pending appeals" value={sum?.pendingAppeals ?? '—'} />
      </div>

      <Card>
        <div className="tabs" style={{ marginBottom: 14 }}>
          {tabs.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
        </div>

        {tab === 'penalties' && (<>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <select className="select flt" value={pStatus} onChange={(e) => setPStatus(e.target.value)}>
              <option value="active">Active</option><option value="reversed">Reversed</option><option value="expired">Expired</option><option value="">All</option>
            </select>
            <input className="input" style={{ maxWidth: 280 }} placeholder="Search expert, reason, booking…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!pens ? <Loading /> : shown.length === 0 ? <p className="muted">No penalties.</p> : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>When</th><th>Expert</th><th>Violation</th><th>Ref</th><th>Cards</th><th>Status</th><th>Appeal</th><th /></tr></thead>
              <tbody>{shown.map((p) => (
                <tr key={p.id}>
                  <td>{when(p.created)}</td>
                  <td><span className="link" onClick={() => nav(`/workers/${p.workerId}`)}>{p.workerName}</span></td>
                  <td>{p.reason}<div className="muted" style={{ fontSize: 11 }}>{p.createdBy === 'system' ? 'Automatic' : `By ${p.createdBy}`}</div></td>
                  <td>{isManualRef(p.ref) ? '—' : p.ref}</td>
                  <td className="num">{p.points ? `+${p.points}` : 'Warning'}</td>
                  <td><Badge tone={STATUS_TONE[p.status] || 'gray'}>{p.status}</Badge></td>
                  <td>{p.appeal ? <Badge tone={p.appeal.status === 'pending' ? 'amber' : p.appeal.status === 'approved' ? 'green' : 'red'}>{p.appeal.status}</Badge> : '—'}</td>
                  <td>{p.status === 'active' && <button className="btn line" style={{ padding: '4px 10px' }} onClick={() => reverse(p)}>Remove</button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </>)}

        {tab === 'appeals' && (<>
          <select className="select flt" style={{ marginBottom: 12 }} value={aStatus} onChange={(e) => setAStatus(e.target.value)}>
            <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All</option>
          </select>
          {!appeals ? <Loading /> : appeals.length === 0 ? <p className="muted">No appeals.</p> : appeals.map((a) => (
            <div key={a.id} className="card pad" style={{ marginBottom: 10, border: '1px solid var(--line, #eee)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <b>{a.worker_name}</b> · <span className="muted">{when(a.created)}</span>
                  <div style={{ marginTop: 4 }}>Penalty: {a.penalty_reason}{isManualRef(a.ref) ? '' : ` (${a.ref})`} — <b>{a.points ? `+${a.points} Red Card${a.points > 1 ? 's' : ''}` : 'Warning'}</b></div>
                  <div style={{ marginTop: 6, padding: '8px 10px', background: '#f6f5fb', borderRadius: 8 }}>“{a.reason}”</div>
                  {a.status !== 'pending' && <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{a.status} by {a.reviewed_by}{a.review_comment ? ` — ${a.review_comment}` : ''}</div>}
                </div>
                {a.status === 'pending' && <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <button className="btn" onClick={() => decide(a, true)}>Approve — remove card</button>
                  <button className="btn line" onClick={() => decide(a, false)}>Reject</button>
                </div>}
              </div>
            </div>
          ))}
        </>)}

        {tab === 'rules' && (<>
          {cfg && <div className="form-grid" style={{ marginBottom: 18 }}>
            <Field label="Suspend at (active Red Cards)"><input type="number" min={1} value={cfg.rc_suspend_at} onChange={(e) => setCfg({ ...cfg, rc_suspend_at: e.target.value })} /></Field>
            <Field label="Red Cards expire after (days, 0 = never)"><input type="number" min={0} value={cfg.rc_expiry_days} onChange={(e) => setCfg({ ...cfg, rc_expiry_days: e.target.value })} /></Field>
            <Field label="₹ deducted per Red Card (0 = points only)"><input type="number" min={0} value={cfg.rc_rupee_value} onChange={(e) => setCfg({ ...cfg, rc_rupee_value: e.target.value })} /></Field>
            <div style={{ alignSelf: 'end' }}><button className="btn" onClick={saveCfg}>Save thresholds</button></div>
          </div>}
          {!rules ? <Loading /> : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Violation</th><th>Red Cards</th><th>Automatic</th><th>On</th></tr></thead>
              <tbody>{rules.map((r) => (
                <tr key={r.code}>
                  <td>{r.name}<div className="muted" style={{ fontSize: 11 }}>{r.code}</div></td>
                  <td>
                    <input type="number" min={0} defaultValue={r.points} style={{ width: 70 }} onBlur={(e) => { const v = Number(e.target.value); if (v !== r.points) saveRule(r, { points: v }) }} />
                    {r.points === 0 && <small className="muted"> warning only</small>}
                  </td>
                  <td><input type="checkbox" checked={r.auto_apply} onChange={(e) => saveRule(r, { autoApply: e.target.checked })} /></td>
                  <td><input type="checkbox" checked={r.active} onChange={(e) => saveRule(r, { active: e.target.checked })} /></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Levels: 1 Good · 2 Attention · 3 Warning (lower dispatch priority) · 4 High risk · 5 Final warning · at the threshold the expert is
            suspended until reinstated from their profile. Approving an appeal removes the card and lifts an automatic suspension.
          </p>
        </>)}
      </Card>
    </div>
  )
}
