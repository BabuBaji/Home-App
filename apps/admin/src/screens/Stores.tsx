import { useEffect, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Plus, Search, MapPin, Store as StoreIcon, Trash2, AlertTriangle, CheckCircle2, ArrowLeft, ShieldAlert } from 'lucide-react'
import { useToast, useConfirm } from '../components/UI'
import { useStore, can } from '../store'
import { fetchStores, checkStore, createStore, deleteStore, fetchZones, type Store, type StoreCheck, type StoreNear, type Zone } from '../api'
import '../zones/zones.css'

const F = ({ label, children }: { label: string; children: ReactNode }) => <label className="zo-f"><span>{label}</span>{children}</label>

// Geocode a 6-digit Indian pincode → lat/lng via OSM Nominatim (same approach as the zone wizard).
async function geocodePin(pin: string): Promise<{ lat: number; lng: number } | null> {
  const pick = (j: unknown) => (Array.isArray(j) && j[0] ? { lat: +(j[0] as { lat: string }).lat, lng: +(j[0] as { lon: string }).lon } : null)
  try {
    let j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&postalcode=${encodeURIComponent(pin)}`)).json()
    let r = pick(j)
    if (!r) { j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(pin + ', India')}`)).json(); r = pick(j) }
    return r
  } catch { return null }
}

/* ═══════════════════════════════ ROOT ═══════════════════════════════ */
export default function Stores() {
  const { admin } = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const isSuper = can(admin?.role, 'super')
  const [stores, setStores] = useState<Store[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = () => { setLoading(true); fetchStores().then(setStores).catch(() => toast('Could not load stores', 'err')).finally(() => setLoading(false)) }
  useEffect(load, [])
  useEffect(() => { fetchZones().then(setZones).catch(() => {}) }, [])
  const zoneName = (id: number | null) => zones.find((z) => z.id === id)?.name || '—'

  const del = async (s: Store) => { if (!(await confirm({ title: `Delete "${s.name}"?`, message: 'This dark store will be removed.', confirmLabel: 'Delete', danger: true }))) return; deleteStore(s.id).then(load).catch(() => toast('Delete failed', 'err')) }

  if (adding) return <StoreBuilder isSuper={isSuper} zones={zones} onDone={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />

  return (
    <div className="zo">
      <div className="zo-top">
        <div><h2>Stores</h2><p>{stores.length} store{stores.length !== 1 ? 's' : ''} · dark-store service points</p></div>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="zo-btn" onClick={() => setAdding(true)}><Plus size={17} /> Add Store</button>
      </div>
      {loading ? <div className="zo-empty"><p>Loading…</p></div>
        : stores.length === 0 ? <div className="zo-empty"><div className="e">🏪</div><p>No stores yet. Add your first store.</p></div>
          : (
            <div className="zo-panel" style={{ overflowX: 'auto', padding: 0 }}>
              <table className="zo-table">
                <thead><tr><th>Store</th><th>Zone</th><th>Manager</th><th>Location</th><th>Radius</th><th>Status</th><th></th></tr></thead>
                <tbody>{stores.map((s) => (
                  <tr key={s.id} style={{ cursor: 'default' }}>
                    <td><b>{s.name}</b>{s.pincode && <div className="zo-zcode">{s.pincode}</div>}</td>
                    <td style={{ color: 'var(--zmut)' }}>{zoneName(s.zone_id)}</td>
                    <td>{s.manager || '—'}</td>
                    <td style={{ color: 'var(--zmut)' }}>{s.lat != null ? `${s.lat.toFixed(4)}, ${s.lng!.toFixed(4)}` : '—'}</td>
                    <td>{s.radius_km} km</td>
                    <td><span className={'zo-chip ' + (s.status === 'active' ? 'active' : s.status === 'paused' ? 'inactive' : 'planning')}><i />{s.status}</span></td>
                    <td><button className="zo-iconbtn" onClick={() => del(s)}><Trash2 size={14} /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
    </div>
  )
}

/* ═══════════════════════════════ ADD-STORE BUILDER ═══════════════════════════════ */
function StoreBuilder({ isSuper, zones, onDone, onCancel }: { isSuper: boolean; zones: Zone[]; onDone: () => void; onCancel: () => void }) {
  const toast = useToast()
  const [pin, setPin] = useState('')
  const [geoBusy, setGeoBusy] = useState(false)
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [manager, setManager] = useState('')
  const [address, setAddress] = useState('')
  const [radius, setRadius] = useState(3)
  const [status, setStatus] = useState('active')
  const [zoneId, setZoneId] = useState<number | ''>('')
  const [check, setCheck] = useState<StoreCheck | null>(null)
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState(false)

  const search = async () => {
    if (!/^\d{6}$/.test(pin)) { toast('Enter a valid 6-digit pincode', 'err'); return }
    setGeoBusy(true)
    const g = await geocodePin(pin)
    setGeoBusy(false)
    if (!g) { toast('Could not locate that pincode', 'err'); return }
    setLat(g.lat); setLng(g.lng)
    // Auto-pick the zone that already covers this pincode, if any.
    const z = zones.find((zz) => zz.pincodeList?.includes(pin))
    if (z) setZoneId(z.id)
  }

  // Re-check coverage whenever the centre or radius changes.
  useEffect(() => {
    if (lat == null || lng == null) { setCheck(null); return }
    let alive = true
    checkStore(lat, lng, radius).then((c) => { if (alive) setCheck(c) }).catch(() => {})
    return () => { alive = false }
  }, [lat, lng, radius])

  const covered = !!check?.covered, overlapping = !!check?.overlapping
  const conflict = covered || overlapping

  const save = async (override = false) => {
    if (!name.trim()) { toast('Store name is required', 'err'); return }
    if (lat == null || lng == null) { toast('Search a pincode or set a location first', 'err'); return }
    setSaving(true)
    try {
      const r = await createStore({ name: name.trim(), manager, address, pincode: pin, lat, lng, radius_km: radius, status, zone_id: zoneId === '' ? null : zoneId, override })
      if (r.ok) { toast('Store created', 'ok'); onDone(); return }
      setDialog(true) // 409 conflict → show the override/blocked dialog
    } catch (e) { toast((e as Error).message, 'err') }
    finally { setSaving(false) }
  }

  const conflictList = covered ? (check?.coveredBy || []) : (check?.overlaps || [])

  return (
    <div className="zo">
      <div className="zo-top">
        <button className="zo-btn line" onClick={onCancel}><ArrowLeft size={16} /> Stores</button>
        <div><h2>Add Store</h2><p>Find a location, check coverage, then create the store.</p></div>
      </div>
      <div className="zo-wiz2">
        <div>
          {/* 1 · Location */}
          <div className="zo-panel">
            <div className="zo-panel-h"><h3>1 · Location</h3><span className="sub">Enter a pincode to locate the centre</span></div>
            <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label className="zo-f" style={{ flex: 1, minWidth: 180 }}><span>Pincode</span>
                <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="500081" onKeyDown={(e) => e.key === 'Enter' && search()} />
              </label>
              <button className="zo-btn" disabled={geoBusy} onClick={search}><Search size={16} /> {geoBusy ? 'Searching…' : 'Search'}</button>
            </div>
            {lat != null && (
              <div className="zo-fgrid" style={{ marginTop: 12 }}>
                <F label="Latitude"><input type="number" value={lat} onChange={(e) => setLat(+e.target.value)} /></F>
                <F label="Longitude"><input type="number" value={lng ?? 0} onChange={(e) => setLng(+e.target.value)} /></F>
              </div>
            )}
            {lat != null && <StoreMap lat={lat} lng={lng!} radiusKm={radius} nearby={check?.nearby || []} onMove={(la, ln) => { setLat(la); setLng(ln) }} />}
          </div>

          {/* 2 · Coverage */}
          {check && (
            <div className="zo-panel" style={{ marginTop: 16 }}>
              <div className="zo-panel-h"><h3>2 · Coverage</h3></div>
              {conflict
                ? <div className="zo-warn"><AlertTriangle size={18} /><div><b>{covered ? 'This location is already covered.' : 'This store overlaps existing coverage.'}</b><div className="s">Covered by: {conflictList.map((x) => x.name).join(', ')}</div></div></div>
                : <div className="zo-ok"><CheckCircle2 size={18} /><b>Available — no existing store covers this location.</b></div>}
              {check.nearby.length > 0 && (
                <div style={{ overflowX: 'auto', marginTop: 12 }}>
                  <table className="zo-table">
                    <thead><tr><th>Store</th><th>Distance</th><th>Radius</th><th>Status</th></tr></thead>
                    <tbody>{check.nearby.slice(0, 8).map((n) => (
                      <tr key={n.id} style={{ cursor: 'default' }}>
                        <td><b>{n.name}</b></td>
                        <td className={n.distanceKm <= n.radiusKm ? 'zo-danger' : ''}>{n.distanceKm} km{n.distanceKm <= n.radiusKm ? ' · covers you' : ''}</td>
                        <td>{n.radiusKm} km</td>
                        <td><span className={'zo-chip ' + (n.status === 'active' ? 'active' : 'inactive')}><i />{n.status}</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 3 · Store details */}
          <div className="zo-panel" style={{ marginTop: 16 }}>
            <div className="zo-panel-h"><h3>3 · Store details</h3></div>
            <div className="zo-fgrid">
              <F label="Store Name *"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gachibowli Store" /></F>
              <F label="Zone"><select value={zoneId} onChange={(e) => setZoneId(e.target.value === '' ? '' : Number(e.target.value))}><option value="">— No zone —</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}{z.city ? ` · ${z.city}` : ''}</option>)}</select></F>
              <F label="Manager"><input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Manager name" /></F>
              <label className="zo-f" style={{ gridColumn: '1 / -1' }}><span>Address</span><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street / building" /></label>
              <F label={`Service Radius — ${radius} km`}><input type="range" min={1} max={15} step={0.5} value={radius} onChange={(e) => setRadius(+e.target.value)} /></F>
              <F label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="paused">Paused</option><option value="planned">Planned</option></select></F>
            </div>
          </div>

          <div className="zo-wiz-foot">
            <button className="zo-btn line" onClick={onCancel}>Cancel</button>
            <button className="zo-btn" disabled={saving} onClick={() => save(false)}>{saving ? 'Saving…' : 'Create Store'}</button>
          </div>
        </div>

        {/* right rail summary */}
        <aside className="zo-sum">
          <h3>Summary</h3>
          <div className="zo-sum-row"><span className="zo-sum-ic"><StoreIcon size={16} /></span><div><div className="l">Name</div><div className="v">{name || '—'}</div></div></div>
          <div className="zo-sum-row"><span className="zo-sum-ic"><MapPin size={16} /></span><div><div className="l">Zone</div><div className="v">{zoneId === '' ? '—' : (zones.find((z) => z.id === zoneId)?.name || '—')}</div></div></div>
          <div className="zo-sum-row"><span className="zo-sum-ic"><MapPin size={16} /></span><div><div className="l">Location</div><div className="v">{lat != null ? `${lat.toFixed(4)}, ${lng!.toFixed(4)}` : '—'}</div></div></div>
          <div className="zo-sum-row"><span className="zo-sum-ic"><StoreIcon size={16} /></span><div><div className="l">Service Radius</div><div className="v">{radius} km</div></div></div>
          <div className="zo-next">
            {conflict
              ? <><div className="k" style={{ color: 'var(--zerr)' }}>⚠ {covered ? 'Already covered' : 'Overlaps existing'}</div><div className="d">{isSuper ? 'As Super Admin you can override and create anyway.' : 'Only a Super Admin can create an overlapping store.'}</div></>
              : check ? <><div className="k">🟢 Available</div><div className="d">This location isn’t covered by another store.</div></>
                : <><div className="k">Search a pincode</div><div className="d">Coverage is checked once a location is set.</div></>}
          </div>
        </aside>
      </div>

      {/* override / blocked dialog */}
      {dialog && (
        <div className="zo-modal-bg" onClick={() => setDialog(false)}>
          <div className="zo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}><ShieldAlert size={22} style={{ color: 'var(--zwarn)' }} /><h3 style={{ margin: 0 }}>{covered ? 'Already covered' : 'Overlapping store'}</h3></div>
            <p style={{ color: 'var(--zmut)', fontSize: 13, marginTop: 8 }}>{covered ? 'This location is inside the coverage of:' : 'This store overlaps with:'}</p>
            <ul style={{ margin: '6px 0 14px', paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
              {conflictList.map((x) => <li key={x.id}><b>{x.name}</b> — {x.distanceKm} km away, radius {x.radiusKm} km{x.overlapAreaKm2 ? ` · overlap ${x.overlapAreaKm2} km²` : ''}</li>)}
            </ul>
            {isSuper ? (
              <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                <button className="zo-btn line" onClick={() => setDialog(false)}>Cancel</button>
                <button className="zo-btn" disabled={saving} onClick={() => { setDialog(false); save(true) }}>Create Anyway</button>
              </div>
            ) : (
              <div className="zo-warn" style={{ marginTop: 4 }}><ShieldAlert size={16} /><div><b>Blocked</b><div className="s">Only a Super Admin can override overlap. Ask a Super Admin to create this store.</div></div></div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────── leaflet map: candidate store (draggable) + existing coverage circles ───────── */
function StoreMap({ lat, lng, radiusKm, nearby, onMove }: { lat: number; lng: number; radiusKm: number; nearby: StoreNear[]; onMove: (lat: number, lng: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const onMoveRef = useRef(onMove); onMoveRef.current = onMove
  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = L.map(ref.current, { attributionControl: false }).setView([lat, lng], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    const marker = L.marker([lat, lng], { draggable: true }).addTo(map)
    const circle = L.circle([lat, lng], { radius: radiusKm * 1000, color: '#4F46E5', fillColor: '#4F46E5', fillOpacity: 0.14 }).addTo(map)
    marker.on('move', (e) => circle.setLatLng((e as unknown as { latlng: L.LatLng }).latlng))
    marker.on('dragend', () => { const ll = marker.getLatLng(); onMoveRef.current(+ll.lat.toFixed(5), +ll.lng.toFixed(5)) })
    mapRef.current = map; markerRef.current = marker; circleRef.current = circle; layerRef.current = L.layerGroup().addTo(map)
    setTimeout(() => map.invalidateSize(), 150)
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    circleRef.current?.setRadius(radiusKm * 1000)
    circleRef.current?.setLatLng([lat, lng]); markerRef.current?.setLatLng([lat, lng])
    mapRef.current?.panTo([lat, lng])
  }, [lat, lng, radiusKm])
  useEffect(() => {
    const layer = layerRef.current; if (!layer) return
    layer.clearLayers()
    for (const n of nearby) {
      const covers = n.distanceKm <= n.radiusKm
      const col = covers ? '#EF4444' : '#6B7280'
      L.circle([n.lat, n.lng], { radius: n.radiusKm * 1000, color: col, weight: 1.5, fillColor: col, fillOpacity: 0.08 }).addTo(layer)
      L.circleMarker([n.lat, n.lng], { radius: 5, color: col, fillColor: col, fillOpacity: 1 }).bindTooltip(`${n.name} · ${n.distanceKm} km`, { direction: 'top' }).addTo(layer)
    }
  }, [nearby])
  return <div ref={ref} style={{ height: 320, width: '100%', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--zline)', marginTop: 12, background: '#eef0f4' }} />
}
