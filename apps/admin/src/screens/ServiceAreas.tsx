import { useEffect, useState } from 'react'
import { MapPin, CheckCircle2, Clock, Hash, Plus, Pencil, Trash2, Play, Pause } from 'lucide-react'
import { fetchZones, createZone, updateZone, deleteZone, fetchLiveOps, type Zone, type LiveOpsZone } from '../api'
import { StatCard, Card, Badge, SearchBox, Loading, ErrorState, Modal, Field, useToast, useConfirm } from '../components/UI'
import { CITIES, stateForCity } from '../cities'

const HEALTH_TONE: Record<string, 'green' | 'amber' | 'red' | 'gray'> = { healthy: 'green', short: 'amber', critical: 'red', idle: 'gray', off: 'gray' }
const HEALTH_LABEL: Record<string, string> = { healthy: 'Healthy', short: 'Short', critical: 'No supply', idle: 'Idle', off: '—' }

type Draft = { name: string; state: string; city: string; pincodes: string; status: Zone['status']; slaMinutes: string }
const emptyDraft: Draft = { name: '', state: '', city: '', pincodes: '', status: 'planned', slaMinutes: '' }
const STATUS_TONE = { live: 'green', planned: 'amber', paused: 'gray' } as const
const STATUS_LABEL = { live: 'Live', planned: 'Planned', paused: 'Paused' } as const

export default function ServiceAreas() {
  const toast = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState<Zone[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [modal, setModal] = useState<null | 'add' | 'edit'>(null)
  const [active, setActive] = useState<Zone | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [ops, setOps] = useState<Record<number, LiveOpsZone>>({})

  const loadOps = () => fetchLiveOps().then((d) => setOps(Object.fromEntries(d.zones.map((z) => [z.id, z])))).catch(() => {})
  const load = () => { setErr(''); fetchZones().then(setRows).catch((e: Error) => setErr(e.message)); loadOps() }
  useEffect(() => { load(); const iv = setInterval(loadOps, 8000); return () => clearInterval(iv) }, [])
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

  const remove = async (z: Zone) => {
    if (!(await confirm({ title: `Delete zone "${z.name}"?`, message: 'Customers in its pincodes may lose service. This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return
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
        <div style={{ padding: '2px 4px 12px', color: 'var(--muted)', fontSize: 13, lineHeight: 1.55 }}>
          A <b>Zone</b> is a launchable area (a set of pincodes) — your hyperlocal "dark store". What a live zone <b>operates</b>:
          it turns those pincodes <b>serviceable</b> (customers there can book), it <b>scopes dispatch</b> (jobs go to experts in the
          zone first), and the server <b>auto-assigns</b> jobs to on-shift experts here. The columns below show each zone's live
          <b> experts</b>, <b>open/active jobs</b>, and supply/demand <b>health</b> (auto-refreshing).
          <br /><b>Go Live</b> = start serving the area · <b>Pause</b> = stop taking new bookings there. No zones at all = serves everywhere.
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
              <tr><th>Zone</th><th>State / City</th><th>Pincodes</th><th>SLA</th><th>Experts</th><th>Live Jobs</th><th>Health</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((z) => { const o = ops[z.id]; return (
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
                  <td>{o ? <span><b>{o.supply.onShift}</b> <span className="muted" style={{ fontSize: 12 }}>on shift / {o.supply.assigned}</span></span> : <span className="muted">—</span>}</td>
                  <td>{o ? <span><b>{o.demand.open}</b> <span className="muted" style={{ fontSize: 12 }}>open · {o.demand.active} active</span></span> : <span className="muted">—</span>}</td>
                  <td>{o && z.status === 'live' ? <Badge tone={HEALTH_TONE[o.health]}>{HEALTH_LABEL[o.health]}</Badge> : <span className="muted">—</span>}</td>
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
              ) })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 24 }}>No zones yet. Click “Add Zone” to launch your first area.</td></tr>
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
            <Field label="City">
              <select value={draft.city} onChange={(e) => { const city = e.target.value; setDraft({ ...draft, city, state: stateForCity(city) || draft.state }) }}>
                <option value="">— Select city —</option>
                {CITIES.map((c) => <option key={c.city} value={c.city}>{c.city} · {c.state}</option>)}
                {draft.city && !CITIES.some((c) => c.city === draft.city) && <option value={draft.city}>{draft.city}</option>}
              </select>
            </Field>
            <Field label="State"><input value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} placeholder="Auto-filled from city" /></Field>
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
