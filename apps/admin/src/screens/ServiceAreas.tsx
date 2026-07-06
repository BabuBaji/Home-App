import { useEffect, useState } from 'react'
import { MapPin, CheckCircle2, Clock, Hash, Plus, Pencil, Trash2, Play, Pause } from 'lucide-react'
import { fetchZones, createZone, updateZone, deleteZone, type Zone } from '../api'
import { StatCard, Card, Badge, SearchBox, Loading, ErrorState, Modal, Field, useToast } from '../components/UI'

type Draft = { name: string; state: string; city: string; pincodes: string; status: Zone['status']; slaMinutes: string }
const emptyDraft: Draft = { name: '', state: '', city: '', pincodes: '', status: 'planned', slaMinutes: '' }
const STATUS_TONE = { live: 'green', planned: 'amber', paused: 'gray' } as const
const STATUS_LABEL = { live: 'Live', planned: 'Planned', paused: 'Paused' } as const

export default function ServiceAreas() {
  const toast = useToast()
  const [rows, setRows] = useState<Zone[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [modal, setModal] = useState<null | 'add' | 'edit'>(null)
  const [active, setActive] = useState<Zone | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)

  const load = () => { setErr(''); fetchZones().then(setRows).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const liveCount = rows.filter((z) => z.status === 'live').length
  const plannedCount = rows.filter((z) => z.status !== 'live').length
  const pinTotal = rows.reduce((s, z) => s + z.pincodeCount, 0)

  const ql = q.trim().toLowerCase()
  const filtered = rows.filter((z) => {
    if (status !== 'all' && z.status !== status) return false
    if (ql && !(z.name.toLowerCase().includes(ql) || (z.city || '').toLowerCase().includes(ql)
      || (z.state || '').toLowerCase().includes(ql) || z.pincodes.includes(ql))) return false
    return true
  })

  const openAdd = () => { setDraft(emptyDraft); setActive(null); setModal('add') }
  const openEdit = (z: Zone) => {
    setActive(z)
    setDraft({ name: z.name, state: z.state, city: z.city, pincodes: z.pincodeList.join(', '), status: z.status, slaMinutes: z.sla_minutes ? String(z.sla_minutes) : '' })
    setModal('edit')
  }
  const close = () => { setModal(null); setActive(null); setSaving(false) }

  const save = () => {
    if (!draft.name.trim()) { toast('Zone name is required', 'err'); return }
    setSaving(true)
    const body = {
      name: draft.name.trim(), state: draft.state.trim(), city: draft.city.trim(),
      pincodes: draft.pincodes, status: draft.status, slaMinutes: draft.slaMinutes ? Number(draft.slaMinutes) : null,
    }
    const p = modal === 'edit' && active ? updateZone(active.id, body) : createZone(body)
    p.then(() => { toast(modal === 'edit' ? 'Zone updated' : 'Zone created', 'ok'); close(); load() })
      .catch((e: Error) => { toast(e.message, 'err'); setSaving(false) })
  }

  const toggle = (z: Zone) => {
    const next = z.status === 'live' ? 'paused' : 'live'
    updateZone(z.id, { status: next })
      .then(() => { toast(next === 'live' ? `${z.name} is now LIVE` : `${z.name} paused`, 'ok'); load() })
      .catch((e: Error) => toast(e.message, 'err'))
  }

  const remove = (z: Zone) => {
    if (!window.confirm(`Delete zone "${z.name}"? Customers in its pincodes may lose service.`)) return
    deleteZone(z.id).then(() => { toast('Zone deleted', 'ok'); load() }).catch((e: Error) => toast(e.message, 'err'))
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<MapPin size={22} />} tint="#5b51e8" label="Total Zones" value={rows.length.toLocaleString('en-IN')} sub="areas" />
        <StatCard icon={<CheckCircle2 size={22} />} tint="#16a34a" label="Live Zones" value={liveCount.toLocaleString('en-IN')} sub="serviceable now" />
        <StatCard icon={<Clock size={22} />} tint="#f59e0b" label="Planned / Paused" value={plannedCount.toLocaleString('en-IN')} sub="not live" />
        <StatCard icon={<Hash size={22} />} tint="#2e90fa" label="Pincodes" value={pinTotal.toLocaleString('en-IN')} sub="covered" />
      </div>

      <Card>
        <div style={{ padding: '2px 4px 12px', color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
          A <b>Zone</b> is a launchable area (a set of pincodes) — your hyperlocal "dark store". Only <b>Live</b> zones are
          serviceable, so you roll out <b>area by area</b>. When <b>no zones exist at all</b>, the app serves everywhere;
          create your first zone to start gating by area.
        </div>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search by zone, city, state or pincode..." />
          <select className="select flt" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All Status</option>
            <option value="live">Live</option>
            <option value="planned">Planned</option>
            <option value="paused">Paused</option>
          </select>
          <div className="tb-spacer" />
          <button className="btn" onClick={openAdd}><Plus size={16} /> Add Zone</button>
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr><th>Zone</th><th>State / City</th><th>Pincodes</th><th>SLA</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((z) => (
                <tr key={z.id}>
                  <td><strong>{z.name}</strong></td>
                  <td>{[z.state, z.city].filter(Boolean).join(' / ') || <span className="muted">—</span>}</td>
                  <td>
                    <div className="cell-user" style={{ gap: 6 }}>
                      <Badge tone="blue">{z.pincodeCount}</Badge>
                      <span className="muted" style={{ fontSize: 12 }}>{z.pincodeList.slice(0, 4).join(', ')}{z.pincodeCount > 4 ? '…' : ''}</span>
                    </div>
                  </td>
                  <td>{z.sla_minutes ? `${z.sla_minutes} min` : <span className="muted">—</span>}</td>
                  <td><Badge tone={STATUS_TONE[z.status]}>{STATUS_LABEL[z.status]}</Badge></td>
                  <td>
                    <div className="actions">
                      <button className="btn line" style={{ padding: '4px 10px' }} onClick={() => toggle(z)} title={z.status === 'live' ? 'Pause' : 'Go live'}>
                        {z.status === 'live' ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Go Live</>}
                      </button>
                      <button className="iconbtn" title="Edit" onClick={() => openEdit(z)}><Pencil size={16} /></button>
                      <button className="iconbtn" title="Delete" style={{ color: 'var(--red)' }} onClick={() => remove(z)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>No zones yet. Click “Add Zone” to launch your first area.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {(modal === 'add' || modal === 'edit') && (
        <Modal
          title={modal === 'edit' ? 'Edit Zone' : 'Add Zone'}
          onClose={close}
          footer={
            <>
              <button className="btn line" onClick={close}>Cancel</button>
              <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : modal === 'edit' ? 'Save Changes' : 'Create Zone'}</button>
            </>
          }
        >
          <Field label="Zone Name">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Kondapur" />
          </Field>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="State"><input value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} placeholder="Telangana" /></Field>
            <Field label="City"><input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="Hyderabad" /></Field>
          </div>
          <Field label="Pincodes (comma or space separated, 6-digit)">
            <textarea value={draft.pincodes} onChange={(e) => setDraft({ ...draft, pincodes: e.target.value })} rows={3}
              placeholder="500081, 500084, 500032" style={{ width: '100%', resize: 'vertical', font: 'inherit', padding: 10, borderRadius: 10, border: '1px solid var(--line)' }} />
          </Field>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="SLA minutes (optional)"><input type="number" value={draft.slaMinutes} onChange={(e) => setDraft({ ...draft, slaMinutes: e.target.value })} placeholder="15" /></Field>
            <Field label="Status">
              <select className="select" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Zone['status'] })}>
                <option value="planned">Planned (not live)</option>
                <option value="live">Live (serviceable)</option>
                <option value="paused">Paused</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  )
}
