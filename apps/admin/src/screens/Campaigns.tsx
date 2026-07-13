import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, X, Tag } from 'lucide-react'
import { useToast, useConfirm } from '../components/UI'
import {
  fetchCampaigns, createCampaign, updateCampaign, deleteCampaign, fetchZones, fetchServices,
  type Campaign,
} from '../api'
import '../zones/zones.css'

type Zone = { id: number; name: string }
type Svc = { id: string; name: string }

const TYPES = [
  { value: 'zone', label: 'Zone Discount' },
  { value: 'customer', label: 'Customer Discount' },
  { value: 'coupon', label: 'Coupon' },
]
const SEGMENTS = [
  { value: 'all', label: 'All customers' },
  { value: 'first_order', label: 'First order' },
  { value: 'second_order', label: 'Second order' },
  { value: 'winback', label: 'Win-back (inactive)' },
  { value: 'vip', label: 'VIP (loyal)' },
  { value: 'birthday', label: 'Birthday' },
]
const DURATIONS = [
  { value: '', label: 'All durations' }, { value: '60m', label: '60 min' }, { value: '90m', label: '90 min' },
  { value: '2h', label: '2 hrs' }, { value: '2h30', label: '2.5 hrs' }, { value: '3h', label: '3 hrs' },
  { value: '3h30', label: '3.5 hrs' }, { value: '4h', label: '4 hrs' },
]
const PRIORITY: Record<string, number> = { customer: 1, zone: 2, coupon: 3 }

const blank = (): Partial<Campaign> => ({
  campaign_name: '', campaign_type: 'zone', discount_type: 'flat', discount_value: 0, max_discount: 0,
  min_subtotal: 0, service_id: '', category: '', duration_id: '', priority: 2, stackable: false,
  starts: null, ends: null, status: 'active', banner_title: '', banner_subtitle: '',
  zoneIds: [], rule: { segment: 'first_order', max_usage: 1, winback_days: 30, vip_min_orders: 10 },
  coupon: { coupon_code: '', auto_apply: false, expiry: null, usage_limit: 0, used_count: 0 },
})

function discountLabel(c: Campaign) {
  const base = c.discount_type === 'percent' ? `${c.discount_value}%` : `₹${c.discount_value}`
  const cap = c.discount_type === 'percent' && c.max_discount > 0 ? ` (max ₹${c.max_discount})` : ''
  return base + cap
}
function scopeLabel(c: Campaign, zones: Zone[]) {
  if (c.campaign_type === 'coupon') return c.coupon?.coupon_code || '—'
  if (c.campaign_type === 'customer') return SEGMENTS.find((s) => s.value === c.rule?.segment)?.label || 'All customers'
  if (!c.zoneIds?.length) return 'All zones'
  return c.zoneIds.map((id) => zones.find((z) => z.id === id)?.name || `#${id}`).join(', ')
}

export default function Campaigns() {
  const [rows, setRows] = useState<Campaign[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [services, setServices] = useState<Svc[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [edit, setEdit] = useState<Partial<Campaign> | null>(null)
  const toast = useToast()
  const confirm = useConfirm()

  const load = () => { setLoading(true); fetchCampaigns().then(setRows).catch(() => toast('Could not load campaigns', 'err')).finally(() => setLoading(false)) }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchZones().then((z) => setZones(z as unknown as Zone[])).catch(() => {})
    fetchServices().then((s) => setServices(s as unknown as Svc[])).catch(() => {})
  }, [])

  const list = useMemo(() => rows.filter((r) => !typeFilter || r.campaign_type === typeFilter), [rows, typeFilter])

  const toggleStatus = (c: Campaign) => {
    const status = c.status === 'active' ? 'paused' : 'active'
    setRows((rs) => rs.map((r) => r.campaign_id === c.campaign_id ? { ...r, status } : r))
    updateCampaign(c.campaign_id, { status }).catch(() => toast('Save failed', 'err'))
  }
  const del = async (id: number) => { if (!(await confirm({ title: 'Delete this campaign?', confirmLabel: 'Delete', danger: true }))) return; try { await deleteCampaign(id); load() } catch { toast('Delete failed', 'err') } }

  async function save(c: Partial<Campaign>) {
    if (!c.campaign_name?.trim()) return toast('Name is required', 'err')
    if (c.campaign_type === 'coupon' && !c.coupon?.coupon_code?.trim()) return toast('Coupon code is required', 'err')
    const body: Record<string, unknown> = {
      campaign_name: c.campaign_name.trim(), campaign_type: c.campaign_type, discount_type: c.discount_type,
      discount_value: Number(c.discount_value) || 0, max_discount: Number(c.max_discount) || 0,
      min_subtotal: Number(c.min_subtotal) || 0, service_id: c.service_id || '', category: c.category || '',
      duration_id: c.duration_id || '', priority: Number(c.priority) || PRIORITY[c.campaign_type || 'zone'],
      stackable: !!c.stackable, starts: c.starts || null, ends: c.ends || null, status: c.status || 'active',
      banner_title: c.banner_title || '', banner_subtitle: c.banner_subtitle || '', zoneIds: c.zoneIds || [],
    }
    if (c.campaign_type === 'customer') body.rule = c.rule
    if (c.campaign_type === 'coupon') body.coupon = { ...c.coupon, coupon_code: c.coupon?.coupon_code?.trim().toUpperCase() }
    try {
      if (c.campaign_id) await updateCampaign(c.campaign_id, body)
      else await createCampaign(body)
      toast('Saved', 'ok'); setEdit(null); load()
    } catch (e) { toast((e as Error).message || 'Save failed', 'err') }
  }

  return (
    <div className="zo">
      <div className="zo-top">
        <div><h2>Campaigns &amp; Offers</h2><p>Dynamic pricing — zone, customer &amp; coupon discounts · {rows.length} total</p></div>
        <div style={{ flex: 1 }} />
        <select className="zo-mini" style={{ width: 160, textAlign: 'left' }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button className="zo-btn" onClick={() => setEdit(blank())}><Plus size={16} /> New Campaign</button>
      </div>

      <div className="zo-panel" style={{ padding: 8 }}>
        {loading ? (
          <div style={{ padding: 8 }}>{Array.from({ length: 5 }).map((_, i) => <div key={i} className="zo-sk-row">{Array.from({ length: 7 }).map((_, j) => <span key={j} className="zo-sk" style={{ height: 16 }} />)}</div>)}</div>
        ) : list.length === 0 ? (
          <div className="zo-empty"><div className="e">🏷️</div><p>No campaigns yet. Click "New Campaign" to create your first offer.</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="zo-table">
              <thead><tr><th>Campaign</th><th>Type</th><th>Discount</th><th>Scope</th><th>Validity</th><th>Used</th><th>Status</th><th></th></tr></thead>
              <tbody>{list.map((c) => (
                <tr key={c.campaign_id} style={{ cursor: 'default' }}>
                  <td><b>{c.campaign_name}</b>{c.stackable ? <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--zmut)' }}>stackable</span> : null}</td>
                  <td><span className="zo-chip planning"><i />{TYPES.find((t) => t.value === c.campaign_type)?.label}</span></td>
                  <td>{discountLabel(c)}</td>
                  <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{scopeLabel(c, zones)}</td>
                  <td style={{ fontSize: 12 }}>{c.starts || c.ends ? `${(c.starts || '').slice(0, 10) || '…'} → ${(c.ends || '').slice(0, 10) || '…'}` : 'Always'}</td>
                  <td>{c.usedCount}</td>
                  <td><button className={'zo-toggle' + (c.status === 'active' ? ' on' : '')} onClick={() => toggleStatus(c)}><span /></button></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="zo-btn line" style={{ padding: 7 }} onClick={() => setEdit(JSON.parse(JSON.stringify(c)))}><Pencil size={14} /></button>
                      <button className="zo-btn line" style={{ padding: 7 }} onClick={() => del(c.campaign_id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {edit && <CampaignForm value={edit} zones={zones} services={services} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  )
}

function CampaignForm({ value, zones, services, onClose, onSave }: {
  value: Partial<Campaign>; zones: Zone[]; services: Svc[]
  onClose: () => void; onSave: (c: Partial<Campaign>) => void
}) {
  const [c, setC] = useState<Partial<Campaign>>(value)
  const set = (patch: Partial<Campaign>) => setC((p) => ({ ...p, ...patch }))
  const isPct = c.discount_type === 'percent'
  const toggleZone = (id: number) => set({ zoneIds: (c.zoneIds || []).includes(id) ? (c.zoneIds || []).filter((z) => z !== id) : [...(c.zoneIds || []), id] })

  return (
    <div className="zo-scrim" onClick={onClose}>
      <div className="zo-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="zo-drawer-head">
          <h3><Tag size={18} /> {c.campaign_id ? 'Edit' : 'New'} Campaign</h3>
          <button className="iconbtn" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="zo-drawer-body">
          <label className="zo-f"><span>Campaign name</span>
            <input value={c.campaign_name || ''} onChange={(e) => set({ campaign_name: e.target.value })} placeholder="e.g. Hyderabad Zone A Launch" />
          </label>
          <div className="zo-frow">
            <label className="zo-f"><span>Type</span>
              <select value={c.campaign_type} onChange={(e) => set({ campaign_type: e.target.value as Campaign['campaign_type'], priority: PRIORITY[e.target.value] })}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="zo-f"><span>Status</span>
              <select value={c.status} onChange={(e) => set({ status: e.target.value as Campaign['status'] })}><option value="active">Active</option><option value="paused">Paused</option></select>
            </label>
          </div>

          <div className="zo-frow">
            <label className="zo-f"><span>Discount type</span>
              <select value={c.discount_type} onChange={(e) => set({ discount_type: e.target.value as Campaign['discount_type'] })}><option value="flat">Flat ₹</option><option value="percent">Percent %</option></select>
            </label>
            <label className="zo-f"><span>{isPct ? 'Percent off' : 'Amount off (₹)'}</span>
              <input type="number" value={c.discount_value ?? 0} onChange={(e) => set({ discount_value: Number(e.target.value) })} />
            </label>
            {isPct && <label className="zo-f"><span>Max discount (₹)</span>
              <input type="number" value={c.max_discount ?? 0} onChange={(e) => set({ max_discount: Number(e.target.value) })} placeholder="0 = no cap" />
            </label>}
            <label className="zo-f"><span>Min order (₹)</span>
              <input type="number" value={c.min_subtotal ?? 0} onChange={(e) => set({ min_subtotal: Number(e.target.value) })} />
            </label>
          </div>

          <div className="zo-frow">
            <label className="zo-f"><span>Service</span>
              <select value={c.service_id || ''} onChange={(e) => set({ service_id: e.target.value })}><option value="">All services</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </label>
            <label className="zo-f"><span>Duration</span>
              <select value={c.duration_id || ''} onChange={(e) => set({ duration_id: e.target.value })}>{DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
            </label>
          </div>

          <div className="zo-frow">
            <label className="zo-f"><span>Starts</span><input type="date" value={(c.starts || '').slice(0, 10)} onChange={(e) => set({ starts: e.target.value || null })} /></label>
            <label className="zo-f"><span>Ends</span><input type="date" value={(c.ends || '').slice(0, 10)} onChange={(e) => set({ ends: e.target.value || null })} /></label>
            <label className="zo-f"><span>Priority</span><input type="number" value={c.priority ?? 2} onChange={(e) => set({ priority: Number(e.target.value) })} /></label>
          </div>

          <label className="zo-check"><input type="checkbox" checked={!!c.stackable} onChange={(e) => set({ stackable: e.target.checked })} /> <span>Stackable — combine with other discounts (otherwise the single best discount wins)</span></label>

          {/* Zone scope (zone campaigns; empty = all zones) */}
          {c.campaign_type !== 'coupon' && (
            <div className="zo-f"><span>Zones <small style={{ color: 'var(--zmut)' }}>(none selected = all zones)</small></span>
              <div className="zo-chips-pick">
                {zones.map((z) => <button key={z.id} type="button" className={'zo-pick' + ((c.zoneIds || []).includes(z.id) ? ' on' : '')} onClick={() => toggleZone(z.id)}>{z.name}</button>)}
                {zones.length === 0 && <span style={{ color: 'var(--zmut)', fontSize: 12 }}>No zones yet.</span>}
              </div>
            </div>
          )}

          {/* Customer eligibility */}
          {c.campaign_type === 'customer' && (
            <div className="zo-frow">
              <label className="zo-f"><span>Segment</span>
                <select value={c.rule?.segment || 'all'} onChange={(e) => set({ rule: { ...(c.rule as Campaign['rule'])!, segment: e.target.value } })}>{SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
              </label>
              <label className="zo-f"><span>Max uses / customer</span>
                <input type="number" value={c.rule?.max_usage ?? 0} onChange={(e) => set({ rule: { ...(c.rule as Campaign['rule'])!, max_usage: Number(e.target.value) } })} placeholder="0 = unlimited" />
              </label>
              {c.rule?.segment === 'winback' && <label className="zo-f"><span>Inactive days</span>
                <input type="number" value={c.rule?.winback_days ?? 30} onChange={(e) => set({ rule: { ...(c.rule as Campaign['rule'])!, winback_days: Number(e.target.value) } })} /></label>}
              {c.rule?.segment === 'vip' && <label className="zo-f"><span>Min completed orders</span>
                <input type="number" value={c.rule?.vip_min_orders ?? 10} onChange={(e) => set({ rule: { ...(c.rule as Campaign['rule'])!, vip_min_orders: Number(e.target.value) } })} /></label>}
            </div>
          )}

          {/* Coupon */}
          {c.campaign_type === 'coupon' && (
            <div className="zo-frow">
              <label className="zo-f"><span>Coupon code</span>
                <input value={c.coupon?.coupon_code || ''} onChange={(e) => set({ coupon: { ...(c.coupon as Campaign['coupon'])!, coupon_code: e.target.value.toUpperCase() } })} placeholder="WELCOME100" />
              </label>
              <label className="zo-f"><span>Usage limit</span>
                <input type="number" value={c.coupon?.usage_limit ?? 0} onChange={(e) => set({ coupon: { ...(c.coupon as Campaign['coupon'])!, usage_limit: Number(e.target.value) } })} placeholder="0 = unlimited" />
              </label>
              <label className="zo-f"><span>Expiry</span>
                <input type="date" value={(c.coupon?.expiry || '').slice(0, 10)} onChange={(e) => set({ coupon: { ...(c.coupon as Campaign['coupon'])!, expiry: e.target.value || null } })} />
              </label>
              <label className="zo-check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={!!c.coupon?.auto_apply} onChange={(e) => set({ coupon: { ...(c.coupon as Campaign['coupon'])!, auto_apply: e.target.checked } })} /> <span>Auto-apply</span></label>
            </div>
          )}

          <div className="zo-frow">
            <label className="zo-f"><span>Banner title <small style={{ color: 'var(--zmut)' }}>(shown to customers)</small></span>
              <input value={c.banner_title || ''} onChange={(e) => set({ banner_title: e.target.value })} placeholder="₹70 OFF launch offer" />
            </label>
            <label className="zo-f"><span>Banner subtitle</span>
              <input value={c.banner_subtitle || ''} onChange={(e) => set({ banner_subtitle: e.target.value })} placeholder="Limited-time in your area" />
            </label>
          </div>
        </div>
        <div className="zo-drawer-foot">
          <button className="zo-btn line" onClick={onClose}>Cancel</button>
          <button className="zo-btn" onClick={() => onSave(c)}>{c.campaign_id ? 'Save changes' : 'Create campaign'}</button>
        </div>
      </div>
    </div>
  )
}
