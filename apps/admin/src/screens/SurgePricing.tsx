import { useEffect, useState, type CSSProperties } from 'react'
import { CloudRain, Zap, TrendingUp, Hand, RefreshCw } from 'lucide-react'
import { Card, StatCard, Badge, Loading, ErrorState, Modal, Field, Dropdown, useToast } from '../components/UI'
import { fetchSurge, setSurge } from '../api'
import type { SurgeZone } from '../types'
import { useStore, has } from '../store'

/* Surge Pricing — live per-zone surge. Automatic from the cached weather signal (rain), with an ops
 * manual override that takes precedence. Read-only unless the admin has pricing.edit. */

const sourceLabel = (r: SurgeZone) => r.reason === 'rain' ? '🌧️ Rain (auto)' : r.reason === 'manual' ? 'Manual override' : 'None'
const ago = (ms: number | null) => { if (!ms) return ''; const m = Math.round((Date.now() - ms) / 60000); return m <= 0 ? 'just now' : `${m}m ago` }

export default function SurgePricing() {
  const toast = useToast()
  const { admin } = useStore()
  const canEdit = has(admin, 'pricing.edit')
  const [rows, setRows] = useState<SurgeZone[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<number | 'all' | null>(null)
  const [modal, setModal] = useState<{ scope: number | 'all'; label: string } | null>(null)
  const [form, setForm] = useState({ pct: '20', minutes: '120' })

  const load = () => fetchSurge().then((r) => { setRows(r); setErr('') }).catch((e: Error) => setErr(e.message))
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id) }, [])

  if (err && !rows) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const surging = rows.filter((r) => r.active)
  const highest = rows.reduce((m, r) => Math.max(m, r.pct), 0)
  const rainy = rows.filter((r) => r.reason === 'rain').length
  const manual = rows.filter((r) => r.reason === 'manual').length

  const apply = async (scope: number | 'all', pct: number, minutes: number, msg: string) => {
    setBusy(scope)
    try { await setSurge({ zoneId: scope, pct, minutes }); toast(msg); setModal(null); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(null) }
  }
  const submit = () => { if (!modal) return; apply(modal.scope, Number(form.pct), Number(form.minutes), `Surge ${form.pct}% applied to ${modal.label}`) }
  const clear = (r: SurgeZone) => apply(r.zoneId, 0, 0, `Override cleared for ${r.zone}`)
  const openForce = (scope: number | 'all', label: string) => { setForm({ pct: '20', minutes: '120' }); setModal({ scope, label }) }

  const th: CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--line,#eef0f4)', whiteSpace: 'nowrap', fontWeight: 600, textAlign: 'left' }
  const td: CSSProperties = { padding: '11px 12px', borderBottom: '1px solid var(--line-2,#f4f4fa)', fontSize: 13, whiteSpace: 'nowrap' }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ alignItems: 'center', gap: 10, marginTop: -4, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12 }}>Weather refreshes every ~20 min · auto-refreshing</span>
        <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
          <button className="btn line sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
          {canEdit && <button className="btn sm" onClick={() => openForce('all', 'all zones')}><Zap size={14} /> Force surge (all zones)</button>}
        </div>
      </div>

      <div className="stat-row">
        <StatCard icon={<Zap size={18} />} tint={surging.length ? '#fff4e5' : '#eef0ff'} label="Zones surging" value={surging.length} sub={`of ${rows.length}`} />
        <StatCard icon={<TrendingUp size={18} />} tint={highest ? '#fdecec' : '#e7f7ee'} label="Highest surge" value={`${highest}%`} sub="right now" />
        <StatCard icon={<CloudRain size={18} />} tint={rainy ? '#e8f0fe' : '#eef0ff'} label="Rain surge" value={rainy} sub="weather-driven" />
        <StatCard icon={<Hand size={18} />} tint={manual ? '#f1ecfe' : '#eef0ff'} label="Manual overrides" value={manual} sub="ops-set" />
      </div>

      <Card title="Zones" right={<span className="muted" style={{ fontSize: 12 }}>{rows.length} live zone{rows.length === 1 ? '' : 's'}{!canEdit && ' · view only'}</span>}>
        {rows.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>No live zones with a mapped city yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
              <thead><tr style={{ color: 'var(--muted,#667085)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {['Zone', 'City', 'Weather', 'Surge', 'Source', 'Action'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.zoneId} style={r.active ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.zone}</td>
                  <td style={{ ...td, textTransform: 'capitalize' }}>{r.city}</td>
                  <td style={td}>
                    {r.prob != null ? <span>{r.prob}% chance{r.precipMm != null ? ` · ${r.precipMm}mm` : ''}<div className="muted" style={{ fontSize: 11 }}>{ago(r.at)}</div></span> : <span className="muted">no reading</span>}
                  </td>
                  <td style={td}><Badge tone={r.pct >= 25 ? 'red' : r.pct > 0 ? 'amber' : 'gray'} dot={false}>{r.pct > 0 ? `+${r.pct}%` : 'None'}</Badge></td>
                  <td style={td}>{sourceLabel(r)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {canEdit ? (
                      <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn line" style={{ padding: '5px 11px', fontSize: 12 }} disabled={busy === r.zoneId} onClick={() => openForce(r.zoneId, r.zone)}>Force</button>
                        {r.reason === 'manual' && <button className="btn line" style={{ padding: '5px 11px', fontSize: 12, color: '#dc2626' }} disabled={busy === r.zoneId} onClick={() => clear(r)}>Clear</button>}
                      </span>
                    ) : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      {modal && (
        <Modal title={`Force surge — ${modal.label}`} onClose={() => setModal(null)} footer={<>
          <button className="btn line" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn" disabled={busy === modal.scope} onClick={submit}>{busy === modal.scope ? 'Applying…' : 'Apply surge'}</button>
        </>}>
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Surge %">
              <Dropdown value={form.pct} width="100%" options={['10', '15', '20', '25', '30', '40', '50'].map((v) => ({ value: v, label: `+${v}%` }))} onChange={(v) => setForm({ ...form, pct: v })} />
            </Field>
            <Field label="For how long">
              <Dropdown value={form.minutes} width="100%" options={[['30', '30 minutes'], ['60', '1 hour'], ['120', '2 hours'], ['240', '4 hours'], ['480', '8 hours']].map(([v, l]) => ({ value: v, label: l }))} onChange={(v) => setForm({ ...form, minutes: v })} />
            </Field>
            <div className="muted" style={{ fontSize: 11.5 }}>A manual override takes precedence over the automatic weather surge until it expires. It applies on the subtotal at checkout.</div>
          </div>
        </Modal>
      )}
    </div>
  )
}
