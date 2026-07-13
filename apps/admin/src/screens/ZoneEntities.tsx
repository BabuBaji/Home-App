import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useToast } from '../components/UI'
import { opList, opCreate, opUpdate, opDelete, fetchZones, fetchServices } from '../api'
import '../zones/zones.css'

type Row = Record<string, unknown> & { id: number }
type Zone = { id: number; name: string }
type Col = { key: string; label: string; type?: 'text' | 'number' | 'bool' | 'zone' | 'select'; w?: number; options?: { value: string; label: string }[] }

function Cell({ r, c, zones, services, upd }: { r: Row; c: Col; zones: Zone[]; services: { id: string; name: string }[]; upd: (id: number, k: string, v: unknown) => void }) {
  const v = r[c.key]
  if (c.type === 'bool') return (
    <button className={'zo-toggle' + (v ? ' on' : '')} onClick={() => upd(r.id, c.key, !v)}><span /></button>
  )
  if (c.type === 'zone') return (
    <select className="zo-mini" style={{ width: 140, textAlign: 'left' }} value={(v as number) || ''} onChange={(e) => upd(r.id, c.key, e.target.value ? Number(e.target.value) : null)}>
      <option value="">—</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
    </select>
  )
  if (c.type === 'select') {
    const opts = c.key === 'service_id' ? services.map((s) => ({ value: s.id, label: s.name })) : (c.options || [])
    return <select className="zo-mini" style={{ width: 140, textAlign: 'left' }} value={(v as string) || ''} onChange={(e) => upd(r.id, c.key, e.target.value)}><option value="">—</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  }
  return <input className="zo-mini" style={{ width: c.w || 100, textAlign: c.type === 'number' ? 'right' : 'left' }} type={c.type === 'number' ? 'number' : 'text'} value={(v as string | number) ?? ''} onChange={(e) => upd(r.id, c.key, c.type === 'number' ? Number(e.target.value) : e.target.value)} />
}

function EntityPage({ title, sub, path, cols, zoned = false, defaults = {} }: { title: string; sub: string; path: string; cols: Col[]; zoned?: boolean; defaults?: Record<string, unknown> }) {
  const [rows, setRows] = useState<Row[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [services, setServices] = useState<{ id: string; name: string }[]>([])
  const [zoneFilter, setZoneFilter] = useState<number | ''>('')
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  const load = () => { setLoading(true); opList<Row>(path, zoneFilter || undefined).then(setRows).catch(() => toast('Could not load', 'err')).finally(() => setLoading(false)) }
  useEffect(load, [zoneFilter]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (zoned) fetchZones().then((z) => setZones(z as unknown as Zone[])).catch(() => {}); if (cols.some((c) => c.key === 'service_id')) fetchServices().then((s) => setServices(s as unknown as { id: string; name: string }[])).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    try { await opCreate(path, { ...defaults, ...(zoned && zoneFilter ? { zone_id: zoneFilter } : {}) }); toast('Added', 'ok'); load() } catch { toast('Add failed', 'err') }
  }
  const upd = (id: number, key: string, val: unknown) => { setRows((rs) => rs.map((r) => r.id === id ? { ...r, [key]: val } : r)); opUpdate(path, id, { [key]: val as string | number | boolean }).catch(() => toast('Save failed', 'err')) }
  const del = async (id: number) => { try { await opDelete(path, id); load() } catch { toast('Delete failed', 'err') } }

  return (
    <div className="zo">
      <div className="zo-top">
        <div><h2>{title}</h2><p>{sub} · {rows.length} {rows.length === 1 ? 'record' : 'records'}</p></div>
        <div style={{ flex: 1 }} />
        {zoned && (
          <select className="zo-mini" style={{ width: 170, textAlign: 'left' }} value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All zones</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        )}
        <button className="zo-btn" onClick={add}><Plus size={16} /> Add {title.replace(/s$/, '')}</button>
      </div>
      <div className="zo-panel" style={{ padding: 8 }}>
        {loading ? (
          <div style={{ padding: 8 }}>{Array.from({ length: 5 }).map((_, i) => <div key={i} className="zo-sk-row"><span className="zo-sk" style={{ height: 16 }} /><span className="zo-sk" style={{ height: 16 }} /><span className="zo-sk" style={{ height: 16 }} /><span className="zo-sk" style={{ height: 16 }} /><span className="zo-sk" style={{ height: 16 }} /><span className="zo-sk" style={{ height: 16 }} /></div>)}</div>
        ) : rows.length === 0 ? (
          <div className="zo-empty"><div className="e">📭</div><p>No {title.toLowerCase()} yet. Click "Add" to create one.</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="zo-table">
              <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}<th></th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} style={{ cursor: 'default' }}>
                  {cols.map((c) => <td key={c.key}><Cell r={r} c={c} zones={zones} services={services} upd={upd} /></td>)}
                  <td><button className="zo-btn line" style={{ padding: 7 }} onClick={() => del(r.id)}><Trash2 size={14} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export function CitiesPage() {
  return <EntityPage title="Cities" sub="Serviceable cities" path="cities" defaults={{ name: 'New City', state: '', active: true }}
    cols={[{ key: 'name', label: 'City', w: 150 }, { key: 'state', label: 'State', w: 140 }, { key: 'active', label: 'Active', type: 'bool' }]} />
}
export function ClustersPage() {
  return <EntityPage title="Clusters" sub="Apartment clusters per zone" path="clusters" zoned defaults={{ name: 'New Cluster', manager: '', color: '#4F46E5', radius_km: 2.5, travel_min: 15 }}
    cols={[{ key: 'name', label: 'Cluster', w: 150 }, { key: 'zone_id', label: 'Zone', type: 'zone' }, { key: 'manager', label: 'Manager', w: 130 }, { key: 'radius_km', label: 'Radius (km)', type: 'number', w: 80 }, { key: 'travel_min', label: 'Travel (min)', type: 'number', w: 80 }, { key: 'color', label: 'Colour', w: 90 }]} />
}
export function ApartmentsPage() {
  return <EntityPage title="Apartments" sub="Societies & localities" path="apartments" zoned defaults={{ name: 'New Apartment', type: 'Apartment', builder: '', units: 100, occupied: 0, pincode: '', aov: 0 }}
    cols={[{ key: 'name', label: 'Apartment', w: 160 }, { key: 'zone_id', label: 'Zone', type: 'zone' }, { key: 'type', label: 'Type', type: 'select', options: [{ value: 'Apartment', label: 'Apartment' }, { value: 'Locality', label: 'Locality' }, { value: 'Society', label: 'Society' }] }, { key: 'builder', label: 'Builder', w: 120 }, { key: 'units', label: 'Units', type: 'number', w: 70 }, { key: 'occupied', label: 'Occupied', type: 'number', w: 70 }, { key: 'pincode', label: 'Pincode', w: 80 }, { key: 'aov', label: 'AOV', type: 'number', w: 70 }]} />
}
export function InventoryPage() {
  return <EntityPage title="Inventory" sub="Stock & supplies per zone" path="inventory" zoned defaults={{ name: 'New Item', vendor: '', stock: 0, reorder: 10, unit: 'pcs' }}
    cols={[{ key: 'name', label: 'Item', w: 160 }, { key: 'zone_id', label: 'Zone', type: 'zone' }, { key: 'vendor', label: 'Vendor', w: 130 }, { key: 'stock', label: 'Stock', type: 'number', w: 70 }, { key: 'reorder', label: 'Reorder', type: 'number', w: 70 }, { key: 'unit', label: 'Unit', w: 70 }]} />
}
export function PricingPage() {
  return <EntityPage title="Pricing" sub="Zone-wise service pricing" path="zone-pricing" zoned defaults={{ service_id: '', price: 0, discount: 0, active: true }}
    cols={[{ key: 'service_id', label: 'Service', type: 'select' }, { key: 'zone_id', label: 'Zone', type: 'zone' }, { key: 'price', label: 'Price (₹)', type: 'number', w: 80 }, { key: 'discount', label: 'Discount (%)', type: 'number', w: 80 }, { key: 'active', label: 'Active', type: 'bool' }]} />
}

type CovZone = { id: number; name: string; code?: string; city?: string; status: string; pincodeList?: string[]; config?: { services?: string[]; apartments?: unknown[] } }
export function ServiceCoveragePage() {
  const [zones, setZones] = useState<CovZone[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetchZones().then((z) => setZones(z as unknown as CovZone[])).catch(() => {}).finally(() => setLoading(false)) }, [])
  return (
    <div className="zo">
      <div className="zo-top"><div><h2>Service Coverage</h2><p>Where each zone is serviceable · {zones.length} zones</p></div></div>
      <div className="zo-panel" style={{ padding: 8 }}>
        {loading ? <div className="zo-empty"><div className="spinner" /></div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="zo-table">
              <thead><tr><th>Zone</th><th>City</th><th>Pincodes</th><th>Apartments</th><th>Services</th><th>Status</th></tr></thead>
              <tbody>{zones.map((z) => (
                <tr key={z.id} style={{ cursor: 'default' }}>
                  <td><b>{z.name}</b> <span style={{ color: 'var(--zmut)', fontSize: 11 }}>{z.code || ''}</span></td>
                  <td>{z.city || '—'}</td>
                  <td>{z.pincodeList?.length || 0}</td>
                  <td>{z.config?.apartments?.length || 0}</td>
                  <td>{z.config?.services?.length || 0}</td>
                  <td><span className={'zo-chip ' + (z.status === 'live' ? 'active' : z.status === 'paused' ? 'inactive' : 'planning')}><i />{z.status === 'live' ? 'Active' : z.status === 'paused' ? 'Inactive' : 'Draft'}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
