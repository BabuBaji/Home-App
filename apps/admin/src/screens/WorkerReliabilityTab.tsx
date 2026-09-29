import { useEffect, useState } from 'react'
import { fetchWorkerReliability, addWorkerPenalty, reinstateWorker, reverseRcPenalty, fetchRcRules, type RcReliability, type RcRule } from '../api'
import { Card, Badge, Loading, Field, useToast } from '../components/UI'

/* Worker details ▸ Reliability — score, Red Cards, level, timeline; add a penalty, remove one,
 * or reinstate a suspended expert. */
const TONE: Record<string, string> = { excellent: 'green', good: 'green', attention: 'amber', warning: 'amber', high_risk: 'red', final: 'red', suspended: 'red' }
const when = (d: string) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function WorkerReliabilityTab({ workerId }: { workerId: number }) {
  const toast = useToast()
  const [r, setR] = useState<RcReliability | null>(null)
  const [rules, setRules] = useState<RcRule[]>([])
  const [code, setCode] = useState('MANUAL')
  const [reason, setReason] = useState('')
  const [points, setPoints] = useState('')
  const load = () => fetchWorkerReliability(workerId).then(setR).catch((e: Error) => toast(e.message))
  useEffect(() => { load(); fetchRcRules().then((l) => setRules(l.filter((x) => x.active))).catch(() => {}) }, [workerId])

  async function add() {
    if (!reason.trim()) return toast('Give a reason')
    try { await addWorkerPenalty(workerId, { code, reason: reason.trim(), points: points === '' ? null : Number(points) }); setReason(''); setPoints(''); toast('Penalty added'); load() } catch (e) { toast((e as Error).message) }
  }
  async function remove(id: number) { try { await reverseRcPenalty(id); toast('Red Card removed'); load() } catch (e) { toast((e as Error).message) } }
  async function reinstate() { try { await reinstateWorker(workerId); toast('Expert reinstated'); load() } catch (e) { toast((e as Error).message) } }

  if (!r) return <Loading />
  const kpis: [string, string][] = [['Reliability score', `${r.score}/100`], ['Red Cards', `${r.redCards} / ${r.suspendAt}`], ['Attendance', `${r.attendance}%`], ['On-time', `${r.onTime}%`], ['Acceptance', `${r.acceptance}%`], ['Completion', `${r.completion}%`], ['Rating', r.rating ? r.rating.toFixed(1) : '—']]
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card title="Reliability" right={<Badge tone={TONE[r.level.key] || 'gray'}>{r.level.label}</Badge>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
          {kpis.map(([l, v]) => <div key={l} className="card pad" style={{ border: '1px solid var(--line, #eee)' }}><small className="muted">{l}</small><div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{v}</div></div>)}
        </div>
        <p className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>{r.level.note}</p>
        {r.suspended && <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#fef2f2', color: '#991b1b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span>Suspended from new jobs for too many Red Cards.</span><button className="btn" onClick={reinstate}>Reinstate expert</button>
        </div>}
      </Card>

      <Card title="Add a penalty">
        <div className="form-grid">
          <Field label="Violation"><select value={code} onChange={(e) => setCode(e.target.value)}>{rules.map((x) => <option key={x.code} value={x.code}>{x.name} ({x.points || 'warning'})</option>)}</select></Field>
          <Field label="Red Cards (blank = rule default)"><input type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} /></Field>
          <Field label="Reason / evidence"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened" /></Field>
          <div style={{ alignSelf: 'end' }}><button className="btn" onClick={add}>Add penalty</button></div>
        </div>
      </Card>

      <Card title="Red Card history">
        {r.history.length === 0 ? <p className="muted">No penalties on record.</p> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>When</th><th>Violation</th><th>Cards</th><th>Status</th><th>Appeal</th><th /></tr></thead>
            <tbody>{r.history.map((p) => (
              <tr key={p.id}>
                <td>{when(p.created)}</td>
                <td>{p.reason}{p.ref && !p.ref.startsWith('manual-') ? <div className="muted" style={{ fontSize: 11 }}>{p.ref}</div> : null}</td>
                <td className="num">{p.points ? `+${p.points}` : 'Warning'}</td>
                <td><Badge tone={p.status === 'active' ? 'red' : p.status === 'reversed' ? 'green' : 'gray'}>{p.status}</Badge></td>
                <td>{p.appeal ? `${p.appeal.status}: “${p.appeal.reason}”` : '—'}</td>
                <td>{p.status === 'active' && <button className="btn line" style={{ padding: '4px 10px' }} onClick={() => remove(p.id)}>Remove</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  )
}
