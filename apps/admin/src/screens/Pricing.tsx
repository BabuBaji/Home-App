import { useEffect, useState } from 'react'
import { Check, X, TrendingUp, Shield, Headphones, Receipt, Lock, RotateCcw, BadgeIndianRupee, ChevronDown } from 'lucide-react'
import { fetchSettings, updateSettings } from '../api'
import { Card, Field, Loading, useToast, money } from '../components/UI'
import { useStore, can } from '../store'

const PLANS = [
  { name: 'Starter', price: 999, tag: 'Perfect for getting started', feats: ['Up to 100 Bookings / month', 'Up to 10 Workers (Pros)', '5 Services', 'Email Support', 'Basic Reports'] },
  { name: 'Basic', price: 2499, tag: 'For small growing businesses', feats: ['Up to 500 Bookings / month', 'Up to 25 Workers (Pros)', '15 Services', 'Priority Email Support', 'Advanced Reports'] },
  { name: 'Standard', price: 4999, tag: 'Best for most businesses', featured: true, feats: ['Up to 2,000 Bookings / month', 'Up to 100 Workers (Pros)', 'Unlimited Services', 'Priority Support', 'Advanced Reports', 'Custom Invoices'] },
  { name: 'Premium', price: 9999, tag: 'For established businesses', feats: ['Up to 10,000 Bookings / month', 'Up to 250 Workers (Pros)', 'Unlimited Services', '24/7 Phone & Chat Support', 'Advanced Reports', 'Custom Invoices', 'API Access'] },
  { name: 'Enterprise', price: null, tag: 'For large scale enterprises', custom: true, feats: ['Unlimited Bookings', 'Unlimited Workers (Pros)', 'Unlimited Services', 'Dedicated Account Manager', '24/7 Phone & Chat Support', 'Custom Reports', 'API Access & Webhooks'] },
]

const COMPARE: { label: string; vals: (string | boolean)[] }[] = [
  { label: 'Monthly Bookings', vals: ['Up to 100', 'Up to 500', 'Up to 2,000', 'Up to 10,000', 'Unlimited'] },
  { label: 'Workers (Pros)', vals: ['Up to 10', 'Up to 25', 'Up to 100', 'Up to 250', 'Unlimited'] },
  { label: 'Services', vals: ['5', '15', 'Unlimited', 'Unlimited', 'Unlimited'] },
  { label: 'Customer Support', vals: ['Email Support', 'Priority Email Support', 'Priority Support', '24/7 Phone & Chat', '24/7 Phone & Chat'] },
  { label: 'Reports & Analytics', vals: ['Basic Reports', 'Advanced Reports', 'Advanced Reports', 'Advanced Reports', 'Custom Reports'] },
  { label: 'Custom Invoices', vals: [false, false, true, true, true] },
  { label: 'API Access', vals: [false, false, false, true, true] },
  { label: 'Dedicated Account Manager', vals: [false, false, false, false, true] },
]

const FAQS = ['Can I change my plan later?', 'Is there a free trial?', 'What payment methods do you accept?', 'Do you offer refunds?']

export default function Pricing() {
  const toast = useToast()
  const { admin } = useStore()
  const [s, setS] = useState<Record<string, string> | null>(null)
  const [yearly, setYearly] = useState(false)
  const editable = can(admin?.role, 'admin')
  const load = () => fetchSettings().then(setS).catch(() => {})
  useEffect(() => { load() }, [])

  async function saveFees(e: React.FormEvent) {
    e.preventDefault()
    try { await updateSettings(s!); toast('Pricing updated') } catch (e: any) { toast(e.message, 'err') }
  }
  const set = (k: string, v: string) => setS((p) => ({ ...p!, [k]: v }))
  const planPrice = (p: number) => yearly ? Math.round(p * 12 * 0.8) : p

  return (
    <div className="cols" style={{ gap: 18 }}>
      <div className="grid" style={{ gap: 18 }}>
        <Card>
          <div className="card-head" style={{ marginBottom: 18 }}>
            <h3>Choose the perfect plan for your business</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span className={yearly ? 'muted' : ''} style={{ fontWeight: 600 }}>Monthly</span>
              <button className={'switch' + (yearly ? ' on' : '')} aria-pressed={yearly} onClick={() => setYearly((v) => !v)} />
              <span className={yearly ? '' : 'muted'} style={{ fontWeight: 600 }}>Yearly</span>
              <span className="badge green" style={{ marginLeft: 4 }}>Save up to 20%</span>
            </div>
          </div>

          <div className="plan-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            {PLANS.map((p) => (
              <div key={p.name} className={'plan' + (p.featured ? ' featured' : '')}>
                {p.featured && <span className="tag-pop">Popular</span>}
                <h3>{p.name}</h3>
                <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>{p.tag}</p>
                <div className="price">
                  {p.custom ? 'Custom' : <>{money(planPrice(p.price!))} <small>/{yearly ? 'year' : 'month'}</small></>}
                </div>
                <ul>{p.feats.map((f) => <li key={f}><Check size={15} /> {f}</li>)}</ul>
                <button className={'btn' + (p.featured ? '' : ' ghost')}>{p.custom ? 'Contact Sales' : 'Get Started'}</button>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Compare Plans">
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Features</th>
                  {PLANS.map((p) => <th key={p.name} style={{ textAlign: 'center' }}>{p.featured ? <><span className="tag-pop" style={{ position: 'static', display: 'inline-block', marginBottom: 4 }}>POPULAR</span><br /></> : null}{p.name.toUpperCase()}</th>)}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    {row.vals.map((v, i) => (
                      <td key={i} style={{ textAlign: 'center' }}>
                        {typeof v === 'boolean'
                          ? (v ? <Check size={16} color="var(--green)" /> : <X size={16} color="var(--red)" />)
                          : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 14, fontSize: 12.5 }} className="muted">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Check size={14} color="var(--green)" /> Included</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><X size={14} color="var(--red)" /> Not Included</span>
          </div>
        </Card>

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

      <div className="col-rail">
        <Card title="Why upgrade?">
          <div className="minilist">
            <Why icon={<TrendingUp size={18} />} tint="#16a34a" title="Grow your business" sub="Get more bookings and manage more workers." />
            <Why icon={<Shield size={18} />} tint="#5b51e8" title="Advanced features" sub="Unlock powerful features and detailed reports." />
            <Why icon={<Headphones size={18} />} tint="#f59e0b" title="Priority support" sub="Get faster response and dedicated support." />
          </div>
        </Card>

        <Card title="Billing Information">
          <div className="minilist">
            <Info icon={<Receipt size={16} />} text="All plans include GST" />
            <Info icon={<Lock size={16} />} text="Secure payment" />
            <Info icon={<RotateCcw size={16} />} text="Cancel anytime" />
            <Info icon={<BadgeIndianRupee size={16} />} text="No hidden charges" />
          </div>
        </Card>

        <Card title="Frequently Asked Questions">
          <div className="minilist">
            {FAQS.map((f) => (
              <div key={f} className="mini-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <strong>{f}</strong>
                <ChevronDown size={16} className="muted" />
              </div>
            ))}
          </div>
          <a className="link" href="#" style={{ display: 'inline-block', marginTop: 10, fontWeight: 600 }}>View all FAQs →</a>
        </Card>
      </div>
    </div>
  )
}

function Why({ icon, tint, title, sub }: { icon: React.ReactNode; tint: string; title: string; sub: string }) {
  return (
    <div className="mini-row">
      <span className="mini-ico" style={{ background: `${tint}1f`, color: tint, width: 34, height: 34, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div><strong>{title}</strong><small>{sub}</small></div>
    </div>
  )
}

function Info({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="mini-row" style={{ alignItems: 'center' }}>
      <span className="mini-ico" style={{ color: 'var(--violet)', display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <strong style={{ fontWeight: 500 }}>{text}</strong>
    </div>
  )
}
