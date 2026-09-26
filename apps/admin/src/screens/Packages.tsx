import { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, X } from 'lucide-react'
import { useToast, useConfirm } from '../components/UI'
import { fetchPackages, savePackage, deletePackage, fetchServices, fetchZones, type AdminPackage } from '../api'
import '../zones/zones.css'

// Durations the catalog sells (same ids the customer app books with).
const DURATIONS = [['30m', '30 min'], ['60m', '60 min'], ['90m', '90 min'], ['2h', '2 hrs'], ['2h30', '2.5 hrs'], ['3h', '3 hrs']]
const blank = (): Partial<AdminPackage> => ({ name: '', description: '', items: [], discount_type: 'flat', discount_value: 50, zone_ids: [], active: true, sort: 50 })

/* Service packages — bundles of two or more services at a discount (e.g. "Daily Essentials:
   mopping + utensils + dusting"). The customer app lists the ones sold in their zone on Home. */
export default function Packages() {
  const toast = useToast()
  const confirm = useConfirm()
  const [list, setList] = useState<AdminPackage[]>([])
  const [services, setServices] = useState<{ id: string; name: string }[]>([])
  const [zones, setZones] = useState<{ id: number; name: string }[]>([])
  const [edit, setEdit] = useState<Partial<AdminPackage> | null>(null)
  const load = () => fetchPackages().then(setList).catch((e) => toast(e.message, 'err'))
  useEffect(() => { load(); fetchServices().then((s) => setServices(s.map((x) => ({ id: x.id, name: x.name })))).catch(() => {}); fetchZones().then((z) => setZones(z.map((x) => ({ id: x.id, name: x.name })))).catch(() => {}) }, [])
  const svcName = (id: string) => services.find((s) => s.id === id)?.name || id

  async function save() {
    try { await savePackage(edit!); toast('Saved', 'ok'); setEdit(null); load() } catch (e) { toast((e as Error).message, 'err') }
  }
  const setItem = (i: number, k: 'id' | 'durationId', v: string) => setEdit((e) => ({ ...e!, items: e!.items!.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }))

  return (
    <div className="zo">
      <div className="zo-top" style={{ justifyContent: "space-between" }}>
        <div><h2 style={{ margin: 0 }}>Service Packages</h2><div className="muted" style={{ fontSize: 13 }}>Bundles of services at a discount, shown on the customer Home screen.</div></div>
        <button className="zo-btn" onClick={() => setEdit(blank())}><Plus size={16} /> New Package</button>
      </div>
      <div className="zo-panel" style={{ padding: 8 }}>
        <table className="zo-table">
          <thead><tr><th>Name</th><th>Services</th><th>Discount</th><th>Zones</th><th>Active</th><th /></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b></td>
                <td style={{ fontSize: 12 }}>{p.items.map((i) => `${svcName(i.id)} (${i.durationId})`).join(', ')}</td>
                <td>{p.discount_type === 'percent' ? `${p.discount_value}%` : `₹${p.discount_value}`}</td>
                <td style={{ fontSize: 12 }}>{p.zone_ids.length ? p.zone_ids.map((z) => zones.find((x) => x.id === z)?.name || z).join(', ') : 'All zones'}</td>
                <td>{p.active ? 'Yes' : 'No'}</td>
                <td>{p.readOnly ? <span className="muted" style={{ fontSize: 12 }}>View only</span> : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="zo-btn line" style={{ padding: 7 }} onClick={() => setEdit(JSON.parse(JSON.stringify(p)))}><Pencil size={14} /></button>
                    <button className="zo-btn line" style={{ padding: 7 }} onClick={async () => { if (await confirm({ title: 'Delete this package?', confirmLabel: 'Delete', danger: true })) { await deletePackage(p.id).catch((e) => toast(e.message, 'err')); load() } }}><Trash2 size={14} /></button>
                  </div>)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="muted" style={{ padding: 18 }}>No packages yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="zo-scrim" onClick={() => setEdit(null)}>
          <div className="zo-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="zo-drawer-head"><h3>{edit.id ? 'Edit' : 'New'} Package</h3><button className="iconbtn" onClick={() => setEdit(null)}><X size={20} /></button></div>
            <div className="zo-drawer-body">
              <label className="zo-f"><span>Name</span><input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Daily Essentials" /></label>
              <label className="zo-f"><span>Description</span><input value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
              <div className="zo-f"><span>Services (at least two)</span>
                {(edit.items || []).map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <select value={it.id} onChange={(e) => setItem(i, 'id', e.target.value)} style={{ flex: 2 }}>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                    <select value={it.durationId} onChange={(e) => setItem(i, 'durationId', e.target.value)} style={{ flex: 1 }}>{DURATIONS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select>
                    <button className="zo-btn line" style={{ padding: 7 }} onClick={() => setEdit({ ...edit, items: edit.items!.filter((_, j) => j !== i) })}><X size={14} /></button>
                  </div>
                ))}
                <button className="zo-btn line" onClick={() => setEdit({ ...edit, items: [...(edit.items || []), { id: services[0]?.id || '', durationId: '60m' }] })}><Plus size={14} /> Add service</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label className="zo-f" style={{ flex: 1 }}><span>Discount type</span><select value={edit.discount_type} onChange={(e) => setEdit({ ...edit, discount_type: e.target.value as 'flat' | 'percent' })}><option value="flat">Flat ₹</option><option value="percent">Percent %</option></select></label>
                <label className="zo-f" style={{ flex: 1 }}><span>Value</span><input type="number" value={edit.discount_value ?? 0} onChange={(e) => setEdit({ ...edit, discount_value: Number(e.target.value) })} /></label>
              </div>
              <div className="zo-f"><span>Zones (none = all)</span>
                <div className="zo-chips-pick">{zones.map((z) => <button key={z.id} type="button" className={'zo-pick' + (edit.zone_ids?.includes(z.id) ? ' on' : '')} onClick={() => setEdit({ ...edit, zone_ids: edit.zone_ids?.includes(z.id) ? edit.zone_ids.filter((x) => x !== z.id) : [...(edit.zone_ids || []), z.id] })}>{z.name}</button>)}</div>
              </div>
              <label className="zo-check"><input type="checkbox" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> <span>Active</span></label>
            </div>
            <div className="zo-drawer-foot"><button className="zo-btn line" onClick={() => setEdit(null)}>Cancel</button><button className="zo-btn" onClick={save}>Save</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
