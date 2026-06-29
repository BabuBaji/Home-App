import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { fetchSettings, updateSettings } from '../api'
import { Card, Field, Loading, useToast, money } from '../components/UI'
import { useStore, can } from '../store'

const PLANS = [
  { name: 'Starter', price: 999, feats: ['Up to 50 bookings/mo', '5 active workers', 'Basic analytics', 'Email support'] },
  { name: 'Basic', price: 2499, feats: ['Up to 250 bookings/mo', '25 active workers', 'Advanced analytics', 'Priority support'] },
  { name: 'Standard', price: 4999, feats: ['Up to 1,000 bookings/mo', '100 active workers', 'Full analytics suite', 'Razorpay payouts', '24/7 support'], featured: true },
  { name: 'Premium', price: 9999, feats: ['Unlimited bookings', 'Unlimited workers', 'Custom reports', 'Dedicated manager', 'API access'] },
]

export default function Pricing() {
  const toast = useToast()
  const { admin } = useStore()
  const [s, setS] = useState<Record<string, string> | null>(null)
  const editable = can(admin?.role, 'admin')
  const load = () => fetchSettings().then(setS).catch(() => {})
  useEffect(() => { load() }, [])

  async function saveFees(e: React.FormEvent) {
    e.preventDefault()
    try { await updateSettings(s!); toast('Pricing updated') } catch (e: any) { toast(e.message, 'err') }
  }
  const set = (k: string, v: string) => setS((p) => ({ ...p!, [k]: v }))

  return (
    <div className="grid" style={{ gap: 22 }}>
      <div>
        <h2 style={{ fontSize: 19, marginBottom: 4 }}>Subscription Plans</h2>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 13.5 }}>Choose the plan that powers your home-services business.</p>
        <div className="plan-grid">
          {PLANS.map((p) => (
            <div key={p.name} className={'plan' + (p.featured ? ' featured' : '')}>
              {p.featured && <span className="tag-pop">Most Popular</span>}
              <h3>{p.name}</h3>
              <div className="price">{money(p.price)} <small>/ mo</small></div>
              <ul>{p.feats.map((f) => <li key={f}><Check size={15} /> {f}</li>)}</ul>
              <button className={'btn' + (p.featured ? '' : ' ghost')}>{p.featured ? 'Current Plan' : 'Choose'}</button>
            </div>
          ))}
        </div>
      </div>

      <Card title="Platform Pricing & Fees">
        {!s ? <Loading /> : (
          <form className="form-grid" onSubmit={saveFees} style={{ maxWidth: 640 }}>
            <Field label="Booking / platform fee (₹)"><input disabled={!editable} value={s.platform_fee || ''} onChange={(e) => set('platform_fee', e.target.value)} type="number" /></Field>
            <Field label="GST / tax (%)"><input disabled={!editable} value={s.tax_percent || ''} onChange={(e) => set('tax_percent', e.target.value)} type="number" /></Field>
            <Field label="Cancellation fee (₹)"><input disabled={!editable} value={s.cancel_fee || ''} onChange={(e) => set('cancel_fee', e.target.value)} type="number" /></Field>
            <Field label="Worker commission (%)"><input disabled={!editable} value={s.commission_percent || ''} onChange={(e) => set('commission_percent', e.target.value)} type="number" /></Field>
            {editable && <div style={{ gridColumn: '1 / -1' }}><button className="btn">Save changes</button></div>}
          </form>
        )}
      </Card>
    </div>
  )
}
