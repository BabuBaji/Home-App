import { useEffect, useState } from 'react'
import { Clock, CheckCircle2, PauseCircle } from 'lucide-react'
import { fetchExtensionRules, updateExtensionRule, type ExtensionRule, type ExtensionBlock } from '../api'
import { StatCard, Card, Badge, Loading, ErrorState, Modal, Field, useToast } from '../components/UI'

// Service Management → Time & Extension Rules.
// Governs what happens when a service runs past its booked duration: which extra-time blocks the
// expert may offer, what the customer pays, what the worker earns, and the caps that stop a small
// booking being extended into a large one. A disabled service simply cannot be extended.
type Draft = {
  enabled: boolean
  blocks: ExtensionBlock[]
  maxTotalMin: string
  maxRequests: string
  minRemainingMin: string
}

export default function ExtensionRules() {
  const toast = useToast()
  const [rows, setRows] = useState<ExtensionRule[] | null>(null)
  const [err, setErr] = useState('')
  const [active, setActive] = useState<ExtensionRule | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => { setErr(''); fetchExtensionRules().then(setRows).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const enabledCount = rows.filter((r) => r.enabled).length

  const open = (r: ExtensionRule) => {
    setActive(r)
    setDraft({
      enabled: r.enabled,
      blocks: r.blocks.map((b) => ({ ...b })),
      maxTotalMin: String(r.maxTotalMin),
      maxRequests: String(r.maxRequests),
      minRemainingMin: String(r.minRemainingMin),
    })
  }

  const setBlock = (i: number, key: keyof ExtensionBlock, v: string) => {
    if (!draft) return
    const blocks = draft.blocks.map((b, n) => (n === i ? { ...b, [key]: Math.max(0, Number(v) || 0) } : b))
    setDraft({ ...draft, blocks })
  }
  const addBlock = () => draft && setDraft({ ...draft, blocks: [...draft.blocks, { mins: 0, price: 0, payout: 0 }] })
  const removeBlock = (i: number) => draft && setDraft({ ...draft, blocks: draft.blocks.filter((_, n) => n !== i) })

  async function save() {
    if (!active || !draft) return
    // A payout above the price would mean paying the worker more than the customer paid.
    const bad = draft.blocks.find((b) => b.payout > b.price)
    if (bad) return toast(`+${bad.mins} min: worker payout ₹${bad.payout} is more than the customer pays ₹${bad.price}`)
    setSaving(true)
    try {
      await updateExtensionRule(active.serviceId, {
        enabled: draft.enabled,
        blocks: draft.blocks.filter((b) => b.mins > 0),
        maxTotalMin: Number(draft.maxTotalMin) || 0,
        maxRequests: Number(draft.maxRequests) || 0,
        minRemainingMin: Number(draft.minRemainingMin) || 0,
      })
      toast(`${active.serviceName} extension rules saved`)
      setActive(null); setDraft(null); load()
    } catch (e) { toast((e as Error).message) } finally { setSaving(false) }
  }

  return (
    <>
      <div className="stat-row">
        <StatCard icon={<Clock size={22} />} tint="#5b51e8" label="Services" value={String(rows.length)} sub="in the catalogue" />
        <StatCard icon={<CheckCircle2 size={22} />} tint="#16a34a" label="Extension enabled" value={String(enabledCount)} sub="can be extended" />
        <StatCard icon={<PauseCircle size={22} />} tint="#2e90fa" label="Not extendable" value={String(rows.length - enabledCount)} sub="fixed duration" />
      </div>

      <Card>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          When a service runs past its booked time the expert can ask the customer for more. These rules decide
          what they may offer, what it costs, and how far a booking can be stretched. The customer always approves
          and pays before the clock moves.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Service</th><th>Extension</th><th>Blocks offered</th>
                <th>Max extra</th><th>Max requests</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.serviceId}>
                  <td><b>{r.serviceName}</b></td>
                  <td>{r.enabled ? <Badge tone="green">Enabled</Badge> : <Badge tone="gray">Disabled</Badge>}</td>
                  <td style={{ fontSize: 12.5 }}>
                    {r.blocks.length
                      ? r.blocks.map((b) => `${b.mins}m ₹${b.price}/₹${b.payout}`).join(' · ')
                      : <span className="muted">none</span>}
                  </td>
                  <td>{r.maxTotalMin} min</td>
                  <td>{r.maxRequests}</td>
                  <td><button className="btn ghost sm" onClick={() => open(r)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Blocks read <i>minutes ₹customer/₹worker</i>. A reason of “Original scope incomplete” is never billed to
          the customer, whatever the block price — the expert running over their own estimate is not the customer’s cost.
        </p>
      </Card>

      {active && draft && (
        <Modal title={`Extension rules · ${active.serviceName}`} onClose={() => { setActive(null); setDraft(null) }}>
          <Field label="Extensions allowed">
            <label className="switch-row">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              <span>{draft.enabled ? 'Enabled — the expert can ask for more time' : 'Disabled — this service cannot be extended'}</span>
            </label>
          </Field>

          <h4 style={{ fontSize: 14, fontWeight: 800, margin: '16px 0 8px' }}>Blocks offered</h4>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Minutes</th><th>Customer pays ₹</th><th>Worker earns ₹</th><th /></tr></thead>
              <tbody>
                {draft.blocks.map((b, i) => (
                  <tr key={i}>
                    <td><input type="number" min={0} value={b.mins} onChange={(e) => setBlock(i, 'mins', e.target.value)} /></td>
                    <td><input type="number" min={0} value={b.price} onChange={(e) => setBlock(i, 'price', e.target.value)} /></td>
                    <td><input type="number" min={0} value={b.payout} onChange={(e) => setBlock(i, 'payout', e.target.value)} /></td>
                    <td><button className="btn ghost sm" onClick={() => removeBlock(i)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn ghost sm" onClick={addBlock}>+ Add block</button>

          <h4 style={{ fontSize: 14, fontWeight: 800, margin: '16px 0 8px' }}>Limits</h4>
          <div className="form-grid">
            <Field label="Max extra time per booking (min)">
              <input type="number" min={0} value={draft.maxTotalMin} onChange={(e) => setDraft({ ...draft, maxTotalMin: e.target.value })} />
            </Field>
            <Field label="Max extension requests">
              <input type="number" min={0} value={draft.maxRequests} onChange={(e) => setDraft({ ...draft, maxRequests: e.target.value })} />
            </Field>
            <Field label="Ask no earlier than (min left)">
              <input type="number" min={0} value={draft.minRemainingMin} onChange={(e) => setDraft({ ...draft, minRemainingMin: e.target.value })} />
            </Field>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Beyond these limits the expert is told to contact Operations rather than being offered more time. This is
            what stops a ₹129 booking becoming a ₹500 one.
          </p>

          <div className="modal-foot">
            <button className="btn ghost" onClick={() => { setActive(null); setDraft(null) }}>Cancel</button>
            <button className="btn" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save rules'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}
