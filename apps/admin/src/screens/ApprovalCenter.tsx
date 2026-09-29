import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X, ChevronRight, ArrowUp, ArrowDown, Plus, Trash2, RotateCcw } from 'lucide-react'
import {
  fetchAcItems, decideAcItem, retryAcItem, fetchAcFlows, saveAcFlow, fetchAcCount,
  type AcItem, type AcFlows,
} from '../api'
import { Card, Badge, Loading, Dropdown, useToast } from '../components/UI'
import { useStore, has } from '../store'
import Approvals from './Approvals'

/* Approval Center — every request that needs a sign-off, in one place.
 * Each request type has a chain of levels (Team Lead → Zone Manager → Finance…); every level must
 * approve in order, a reject at any level ends it. "Waiting for me" is only what the signed-in admin
 * can sign right now. Rules (who signs what, in which order) are edited on the Rules tab. */
type Tab = 'mine' | 'pending' | 'done' | 'money' | 'rules'
const when = (d: string | null) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '')
const ago = (d: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d` }
const STATE_STYLE: Record<string, { bg: string; fg: string; icon: string }> = {
  approved: { bg: '#dcfce7', fg: '#15803d', icon: '✓' }, rejected: { bg: '#fee2e2', fg: '#b91c1c', icon: '✕' },
  skipped: { bg: '#f1f5f9', fg: '#64748b', icon: '–' }, current: { bg: '#ede9fe', fg: '#5b21b6', icon: '●' }, waiting: { bg: '#f8fafc', fg: '#94a3b8', icon: '○' },
}
const STATUS_TONE: Record<string, string> = { pending: 'amber', approved: 'green', rejected: 'red', failed: 'red', cancelled: 'gray' }

export default function ApprovalCenter() {
  const nav = useNavigate()
  const toast = useToast()
  const { admin } = useStore()
  const canDecide = has(admin, 'approvals.decide')
  const canManage = has(admin, 'approvals.manage')
  const canMoney = has(admin, 'approvals.review')
  const [tab, setTab] = useState<Tab>(canDecide ? 'mine' : canMoney ? 'money' : 'rules')
  const [type, setType] = useState('')
  const [items, setItems] = useState<AcItem[] | null>(null)
  const [flows, setFlows] = useState<AcFlows | null>(null)
  const [count, setCount] = useState({ mine: 0, money: 0 })
  const [busy, setBusy] = useState(0)

  const loadCount = () => fetchAcCount().then(setCount).catch(() => {})
  const load = () => {
    if (tab === 'money' || tab === 'rules') return
    setItems(null); fetchAcItems(tab, type).then(setItems).catch((e: Error) => toast(e.message))
  }
  useEffect(() => { fetchAcFlows().then(setFlows).catch(() => {}); loadCount() }, [])
  useEffect(load, [tab, type])

  async function decide(it: AcItem, approve: boolean) {
    let comment = ''
    if (!approve) {
      const c = window.prompt(`Why is this ${it.typeLabel.toLowerCase()} request rejected? (${it.workerName} will see this)`)
      if (c === null) return
      if (!c.trim()) return toast('Give a reason')
      comment = c.trim()
    }
    setBusy(it.id)
    try {
      const r = await decideAcItem(it.id, approve, comment)
      toast(r.status === 'pending' ? `Signed — now with the ${r.currentLevel}` : r.status === 'failed' ? `Could not apply: ${r.error}` : `Request ${r.status}`)
      load(); loadCount()
    } catch (e) { toast((e as Error).message) } finally { setBusy(0) }
  }
  async function retry(it: AcItem) {
    try { const r = await retryAcItem(it.id); toast(r.status === 'failed' ? `Still failing: ${r.error}` : `Request ${r.status}`); load() } catch (e) { toast((e as Error).message) }
  }

  const tabs: [Tab, string, boolean][] = [
    ['mine', `Waiting for me${count.mine ? ` (${count.mine})` : ''}`, canDecide],
    ['pending', 'All pending', canDecide],
    ['done', 'Completed', canDecide],
    ['money', `Money actions${count.money ? ` (${count.money})` : ''}`, canMoney],
    ['rules', 'Rules', canDecide || canManage],
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="tabs">
          {tabs.filter((t) => t[2]).map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {['mine', 'pending', 'done'].includes(tab) && flows && (
          <div style={{ width: 220 }}>
            <Dropdown value={type} width="100%" onChange={setType}
              options={[{ value: '', label: 'All request types' }, ...flows.flows.map((f) => ({ value: f.type, label: f.label }))]} />
          </div>
        )}
      </div>

      {tab === 'money' && <Approvals />}
      {tab === 'rules' && flows && <Rules flows={flows} canEdit={canManage} onSaved={() => fetchAcFlows().then(setFlows)} />}

      {['mine', 'pending', 'done'].includes(tab) && (
        !items ? <Loading /> : items.length === 0 ? (
          <Card><p className="muted" style={{ margin: 0 }}>{tab === 'mine' ? 'Nothing is waiting for you. 🎉' : 'No requests here.'}</p></Card>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((it) => (
              <div key={it.id} className="card pad" style={{ borderLeft: `4px solid ${it.canAct ? '#6d28d9' : 'transparent'}` }}>
                <div style={{ display: 'flex', gap: 14, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: '1 1 380px' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Badge tone="blue" dot={false}>{it.typeLabel}</Badge>
                      <span className="link" style={{ fontWeight: 700 }} onClick={() => it.workerId && nav(`/workers/${it.workerId}`)}>{it.workerName || '—'}</span>
                      {it.amount != null && <b>₹{it.amount.toLocaleString('en-IN')}</b>}
                      {it.status !== 'pending' && <Badge tone={STATUS_TONE[it.status] || 'gray'}>{it.status}</Badge>}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13.5 }}>{it.summary}</div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                      Raised {when(it.created)}{it.status === 'pending' ? ` · waiting ${ago(it.created)}` : it.decidedAt ? ` · closed ${when(it.decidedAt)}` : ''}
                    </div>
                    {it.error && <div style={{ fontSize: 12, marginTop: 4, color: '#b91c1c' }}>{it.error}</div>}
                    {/* the chain, level by level */}
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                      {it.levels.map((l, i) => {
                        const st = STATE_STYLE[l.state] || STATE_STYLE.waiting
                        return (
                          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {i > 0 && <ChevronRight size={14} color="#cbd5e1" />}
                            <span title={l.comment || (l.by ? `${l.by} · ${when(l.at)}` : '')} style={{ background: st.bg, color: st.fg, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                              {st.icon} {l.label}{l.by ? ` · ${l.by}` : ''}
                            </span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {it.canAct && <>
                      <button className="btn" disabled={busy === it.id} onClick={() => decide(it, true)}><Check size={15} /> Approve</button>
                      <button className="btn line" disabled={busy === it.id} style={{ color: '#dc2626' }} onClick={() => decide(it, false)}><X size={15} /> Reject</button>
                    </>}
                    {!it.canAct && it.status === 'pending' && <span className="muted" style={{ fontSize: 12.5 }}>With the {it.currentLevel}</span>}
                    {it.status === 'failed' && canManage && <button className="btn line" onClick={() => retry(it)}><RotateCcw size={14} /> Retry</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

/* Rules: per request type — on/off and the ordered chain of levels. */
function Rules({ flows, canEdit, onSaved }: { flows: AcFlows; canEdit: boolean; onSaved: () => void }) {
  const toast = useToast()
  const [draft, setDraft] = useState(() => Object.fromEntries(flows.flows.map((f) => [f.type, { enabled: f.enabled, levels: [...f.levels] }])))
  const levelOpts = Object.entries(flows.levels)
  const set = (t: string, patch: Partial<{ enabled: boolean; levels: string[] }>) => setDraft((d) => ({ ...d, [t]: { ...d[t], ...patch } }))
  const move = (t: string, i: number, dir: -1 | 1) => { const l = [...draft[t].levels]; const j = i + dir; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; set(t, { levels: l }) }
  async function save(t: string) {
    try { await saveAcFlow(t, draft[t]); toast('Rule saved'); onSaved() } catch (e) { toast((e as Error).message) }
  }
  return (
    <Card title="Who approves what" right={<span className="muted" style={{ fontSize: 12 }}>Every level signs in order · a reject at any level ends the request</span>}>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Request</th><th>On</th><th>Approval chain</th><th /></tr></thead>
        <tbody>{flows.flows.map((f) => {
          const d = draft[f.type]
          const dirty = d.enabled !== f.enabled || d.levels.join() !== f.levels.join()
          const unused = levelOpts.filter(([k]) => !d.levels.includes(k))
          return (
            <tr key={f.type}>
              <td><b>{f.label}</b>{f.updatedBy && <div className="muted" style={{ fontSize: 11 }}>Last changed by {f.updatedBy}</div>}</td>
              <td><input type="checkbox" disabled={!canEdit} checked={d.enabled} onChange={(e) => set(f.type, { enabled: e.target.checked })} /></td>
              <td>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {d.levels.map((l, i) => (
                    <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: '#ede9fe', color: '#5b21b6', borderRadius: 999, padding: '3px 6px 3px 10px', fontSize: 12.5, fontWeight: 600 }}>
                      {i + 1}. {flows.levels[l] || l}
                      {canEdit && <>
                        <button className="iconbtn" style={{ padding: 0, width: 20, height: 20, minWidth: 20 }} title="Earlier" onClick={() => move(f.type, i, -1)}><ArrowUp size={12} /></button>
                        <button className="iconbtn" style={{ padding: 0, width: 20, height: 20, minWidth: 20 }} title="Later" onClick={() => move(f.type, i, 1)}><ArrowDown size={12} /></button>
                        {d.levels.length > 1 && <button className="iconbtn" style={{ padding: 0, width: 20, height: 20, minWidth: 20 }} title="Remove" onClick={() => set(f.type, { levels: d.levels.filter((x) => x !== l) })}><Trash2 size={12} /></button>}
                      </>}
                    </span>
                  ))}
                  {canEdit && unused.length > 0 && (
                    <select className="select" style={{ height: 28, fontSize: 12 }} value="" onChange={(e) => e.target.value && set(f.type, { levels: [...d.levels, e.target.value] })}>
                      <option value="">+ Add level</option>
                      {unused.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  )}
                </div>
              </td>
              <td>{canEdit && dirty && <button className="btn" style={{ padding: '4px 12px' }} onClick={() => save(f.type)}><Plus size={13} style={{ display: 'none' }} />Save</button>}</td>
            </tr>
          )
        })}</tbody>
      </table></div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
        <b>Team Lead</b> — the expert’s assigned lead (set on the expert’s Availability tab); skipped if none is assigned.
        <b> Zone Manager</b> — a Zone Manager or Manager covering the expert’s zone; skipped if there is none.
        <b> Verifier</b> — anyone who can edit experts in that area. <b>Finance</b> — Finance team or Admin. <b>Admin</b> — the Admin role.
        Super Admin can sign any level. Nobody signs two levels of the same request. Switching a rule off makes new requests of that type go back to one-click approval on the expert’s screens.
      </p>
    </Card>
  )
}
