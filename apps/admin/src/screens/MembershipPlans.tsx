import { useEffect, useState } from 'react'
import { Crown, Plus, Pencil, Trash2, Star, RefreshCw } from 'lucide-react'
import { Card, StatCard, Badge, Loading, ErrorState, Modal, Dropdown, useToast } from '../components/UI'
import { fetchMembershipPlans, createMembershipPlan, updateMembershipPlan, deleteMembershipPlan } from '../api'
import type { MembershipPlan } from '../types'
import { useStore, has } from '../store'

/* Membership Plans (Module 10) — the admin-configurable catalog of paid benefit plans. Prices and
   benefit rules here are the authority the customer app renders and the pricing engine will consume.
   Requires pricing.edit to mutate. */

// Editor holds snake_case column names (what the write endpoints expect).
type Editor = {
  id?: number
  plan_key: string; name: string; tagline: string; price: number; popular: boolean; sort: number
  discount_pct: number; max_discount_per_order: number; discounted_orders_per_month: number
  cashback_pct: number; cashback_max: number; platform_fee_waiver: boolean; priority_booking: boolean
  min_order_value: number; free_cancellations: number; status: string; features: string
}
const BLANK: Editor = {
  plan_key: '', name: '', tagline: '', price: 0, popular: false, sort: 0,
  discount_pct: 10, max_discount_per_order: 30, discounted_orders_per_month: 5,
  cashback_pct: 0, cashback_max: 0, platform_fee_waiver: false, priority_booking: true,
  min_order_value: 0, free_cancellations: 0, status: 'published', features: '',
}
const fromRow = (p: MembershipPlan): Editor => ({
  id: p.id, plan_key: p.key, name: p.name, tagline: p.tagline, price: p.price, popular: p.popular, sort: p.sort,
  discount_pct: p.discountPct, max_discount_per_order: p.maxDiscountPerOrder, discounted_orders_per_month: p.discountedOrdersPerMonth,
  cashback_pct: p.cashbackPct, cashback_max: p.cashbackMax, platform_fee_waiver: p.platformFeeWaiver, priority_booking: p.priorityBooking,
  min_order_value: p.minOrderValue, free_cancellations: p.freeCancellations, status: p.status, features: (p.features || []).join('\n'),
})
const money = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`
const statusTone = (s: string) => (s === 'published' ? 'green' : s === 'disabled' ? 'red' : 'gray')

export default function MembershipPlans() {
  const toast = useToast()
  const { admin } = useStore()
  const canEdit = has(admin, 'pricing.edit')
  const [rows, setRows] = useState<MembershipPlan[] | null>(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState<Editor | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => fetchMembershipPlans().then((r) => { setRows(r); setErr('') }).catch((e: Error) => setErr(e.message))
  useEffect(() => { load() }, [])

  if (err && !rows) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const published = rows.filter((r) => r.status === 'published').length
  const set = (patch: Partial<Editor>) => setEdit((e) => (e ? { ...e, ...patch } : e))

  const save = async () => {
    if (!edit) return
    if (!edit.plan_key.trim()) { toast('Plan key is required', 'err'); return }
    if (!edit.name.trim()) { toast('Name is required', 'err'); return }
    setBusy(true)
    const body: Record<string, unknown> = {
      plan_key: edit.plan_key.trim(), name: edit.name.trim(), tagline: edit.tagline, price: Number(edit.price) || 0,
      popular: edit.popular, sort: Number(edit.sort) || 0, discount_pct: Number(edit.discount_pct) || 0,
      max_discount_per_order: Number(edit.max_discount_per_order) || 0, discounted_orders_per_month: Number(edit.discounted_orders_per_month) || 0,
      cashback_pct: Number(edit.cashback_pct) || 0, cashback_max: Number(edit.cashback_max) || 0,
      platform_fee_waiver: edit.platform_fee_waiver, priority_booking: edit.priority_booking,
      min_order_value: Number(edit.min_order_value) || 0, free_cancellations: Number(edit.free_cancellations) || 0,
      status: edit.status, features: edit.features.split('\n').map((s) => s.trim()).filter(Boolean),
    }
    try {
      if (edit.id) await updateMembershipPlan(edit.id, body); else await createMembershipPlan(body)
      toast(edit.id ? 'Plan updated' : 'Plan created'); setEdit(null); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const remove = async (p: MembershipPlan) => {
    if (!confirm(`Delete the ${p.name} plan? Existing members keep their membership; this only removes it from the catalog.`)) return
    try { await deleteMembershipPlan(p.id); toast('Plan deleted'); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  const th = { padding: '9px 12px', borderBottom: '1px solid var(--line,#eef0f4)', whiteSpace: 'nowrap' as const, fontWeight: 600, textAlign: 'left' as const }
  const td = { padding: '11px 12px', borderBottom: '1px solid var(--line-2,#f4f4fa)', fontSize: 13, whiteSpace: 'nowrap' as const }
  const numField = (label: string, key: keyof Editor, hint?: string) => (
    <label className="zo-f"><span>{label}</span><input type="number" value={edit![key] as number} onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<Editor>)} placeholder={hint} /></label>
  )

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ alignItems: 'center', gap: 10, marginTop: -4, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12 }}>Plans, prices and benefit rules the customer app reads. Eligibility (services/zones) applies in the booking pricing engine.</span>
        <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
          <button className="btn line sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
          {canEdit && <button className="btn sm" onClick={() => setEdit({ ...BLANK })}><Plus size={14} /> New plan</button>}
        </div>
      </div>

      <div className="stat-row">
        <StatCard icon={<Crown size={18} />} tint="#f1ecfe" label="Total plans" value={rows.length} sub="in catalog" />
        <StatCard icon={<Star size={18} />} tint="#e7f7ee" label="Published" value={published} sub="live to customers" />
        <StatCard icon={<Crown size={18} />} tint="#eef0ff" label="Cheapest" value={rows.length ? money(Math.min(...rows.map((r) => r.price))) : '—'} sub="entry price" />
      </div>

      <Card title="Membership plans" right={<span className="muted" style={{ fontSize: 12 }}>{rows.length} plan{rows.length === 1 ? '' : 's'}{!canEdit && ' · view only'}</span>}>
        {rows.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>No plans yet.{canEdit && ' Click “New plan” to create one.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 860 }}>
              <thead><tr style={{ color: 'var(--muted,#667085)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {['Plan', 'Price/mo', 'Discount', 'Cap/order', 'Orders/mo', 'Cashback', 'Status', 'Action'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.name}{r.popular && <span className="muted" style={{ fontWeight: 400 }}> · popular</span>}<div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{r.key}</div></td>
                  <td style={td}>{money(r.price)}</td>
                  <td style={td}>{r.discountPct}%</td>
                  <td style={td}>{r.maxDiscountPerOrder ? money(r.maxDiscountPerOrder) : '—'}</td>
                  <td style={td}>{r.discountedOrdersPerMonth || '∞'}</td>
                  <td style={td}>{r.cashbackPct ? `${r.cashbackPct}%${r.cashbackMax ? ` ≤${money(r.cashbackMax)}` : ''}` : '—'}</td>
                  <td style={td}><Badge tone={statusTone(r.status)} dot={false}>{r.status}</Badge></td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {canEdit ? (
                      <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn line" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setEdit(fromRow(r))}><Pencil size={13} /></button>
                        <button className="btn line" style={{ padding: '5px 10px', fontSize: 12, color: '#dc2626' }} onClick={() => remove(r)}><Trash2 size={13} /></button>
                      </span>
                    ) : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      {edit && (
        <Modal wide title={edit.id ? `Edit ${edit.name || 'plan'}` : 'New membership plan'} onClose={() => setEdit(null)} footer={<>
          <button className="btn line" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : edit.id ? 'Save changes' : 'Create plan'}</button>
        </>}>
          <div className="grid" style={{ gap: 12 }}>
            <div className="zo-grid">
              <label className="zo-f"><span>Plan key (stable id)</span><input value={edit.plan_key} disabled={!!edit.id} onChange={(e) => set({ plan_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} placeholder="e.g. silver" /></label>
              <label className="zo-f"><span>Name</span><input value={edit.name} onChange={(e) => set({ name: e.target.value })} placeholder="Silver" /></label>
              <label className="zo-f"><span>Tagline</span><input value={edit.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="Best for small homes" /></label>
              {numField('Monthly price (₹)', 'price')}
              {numField('Sort order', 'sort')}
              <label className="zo-f"><span>Status</span><Dropdown value={edit.status} width="100%" options={[['published', 'Published (live)'], ['draft', 'Draft (hidden)'], ['disabled', 'Disabled']].map(([v, l]) => ({ value: v, label: l }))} onChange={(v) => set({ status: v })} /></label>
            </div>

            <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 4 }}>Benefit rules</div>
            <div className="zo-grid">
              {numField('Service discount (%)', 'discount_pct')}
              {numField('Max discount / order (₹)', 'max_discount_per_order', '0 = no cap')}
              {numField('Discounted orders / month', 'discounted_orders_per_month', '0 = unlimited')}
              {numField('Cashback (%)', 'cashback_pct')}
              {numField('Cashback max / order (₹)', 'cashback_max', '0 = no cap')}
              {numField('Min order value (₹)', 'min_order_value')}
              {numField('Free cancellations / month', 'free_cancellations')}
            </div>
            <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
              <label className="zo-check"><input type="checkbox" checked={edit.popular} onChange={(e) => set({ popular: e.target.checked })} /> <span>Most popular badge</span></label>
              <label className="zo-check"><input type="checkbox" checked={edit.platform_fee_waiver} onChange={(e) => set({ platform_fee_waiver: e.target.checked })} /> <span>Waive platform fee</span></label>
              <label className="zo-check"><input type="checkbox" checked={edit.priority_booking} onChange={(e) => set({ priority_booking: e.target.checked })} /> <span>Priority booking</span></label>
            </div>

            <label className="zo-f"><span>Features (one per line — shown on the plan card)</span>
              <textarea rows={4} value={edit.features} onChange={(e) => set({ features: e.target.value })} placeholder={'Up to ₹1,000 off on bookings\nPriority customer support\nExclusive member offers'} />
            </label>
            <div className="muted" style={{ fontSize: 11.5 }}>Discount %, caps and monthly limits protect your margin — the booking pricing engine (Phase 2) enforces them per order. Deleting a plan does not cancel existing members.</div>
          </div>
        </Modal>
      )}
    </div>
  )
}
