import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Tag, Gift, HardHat, Sigma, CreditCard } from 'lucide-react'
import { fetchRewards, type RewardsData } from '../api'
import { Card, StatCard, Loading, Dropdown, Badge, useToast } from '../components/UI'
import { useStore, has } from '../store'

/* Insights ▸ Rewards & Discounts — what every offer, reward and incentive cost over a date range:
 * discounts off orders (coupons / campaigns, membership, zone), rewards credited to customers
 * (welcome, referral, cashback, gift cards…), incentives paid to experts (joining, referral, job
 * start, rules…), incentive-rule spend against budget, and gift cards issued vs redeemed. */
const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN')
const istDay = (off = 0) => new Date(Date.now() + 330 * 60000 + off * 86400000).toISOString().slice(0, 10)
const PRESETS: [string, string, () => [string, string]][] = [
  ['7d', 'Last 7 days', () => [istDay(-6), istDay()]],
  ['30d', 'Last 30 days', () => [istDay(-29), istDay()]],
  ['month', 'This month', () => [istDay().slice(0, 8) + '01', istDay()]],
  ['90d', 'Last 90 days', () => [istDay(-89), istDay()]],
]

function Breakdown({ rows, total, unit = 'count', empty }: { rows: { name: string; amount: number; count?: number; orders?: number }[]; total: number; unit?: 'count' | 'orders'; empty: string }) {
  if (!rows.length) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>{empty}</p>
  return (
    <table className="tbl"><thead><tr><th>Type</th><th className="num">{unit === 'orders' ? 'Orders' : 'Times'}</th><th className="num">Cost</th><th style={{ width: '32%' }}>Share</th></tr></thead>
      <tbody>{rows.map((r) => {
        const pct = total ? Math.round((r.amount / total) * 100) : 0
        return (
          <tr key={r.name}>
            <td>{r.name}</td><td className="num">{unit === 'orders' ? r.orders : r.count}</td><td className="num"><b>{inr(r.amount)}</b></td>
            <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4 }}><div style={{ width: `${pct}%`, height: 8, background: '#7c3aed', borderRadius: 4 }} /></div><span className="muted" style={{ fontSize: 11, width: 32 }}>{pct}%</span></div></td>
          </tr>
        )
      })}</tbody></table>
  )
}

export default function RewardsReport() {
  const nav = useNavigate()
  const toast = useToast()
  const { admin } = useStore()
  const [preset, setPreset] = useState('month')
  const [[from, to], setRange] = useState<[string, string]>(() => PRESETS[2][2]())
  const [d, setD] = useState<RewardsData | null>(null)
  useEffect(() => { setD(null); fetchRewards(from, to).then(setD).catch((e: Error) => toast(e.message)) }, [from, to])
  const pick = (k: string) => { const p = PRESETS.find((x) => x[0] === k); if (p) { setPreset(k); setRange(p[2]()) } }

  const exportCsv = () => {
    if (!d) return
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [['Group', 'Type', 'Times / orders', 'Cost (₹)'].join(',')]
    lines.push(['Discount', 'Coupons & campaigns', '', d.discounts.coupon].map(esc).join(','))
    d.discounts.byCampaign.forEach((c) => lines.push(['Discount', `  ${c.name}`, c.orders, c.amount].map(esc).join(',')))
    lines.push(['Discount', 'Membership discount', '', d.discounts.membership].map(esc).join(','))
    lines.push(['Discount', 'Zone discount', '', d.discounts.zone].map(esc).join(','))
    d.customerRewards.forEach((c) => lines.push(['Customer reward', c.name, c.count, c.amount].map(esc).join(',')))
    d.expertIncentives.forEach((c) => lines.push(['Expert incentive', c.name, c.count, c.amount].map(esc).join(',')))
    lines.push(['Total', '', '', d.totals.all].map(esc).join(','))
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })); a.download = `rewards-${from}_to_${to}.csv`; a.click()
  }

  const t = d?.totals
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ width: 150 }}><Dropdown value={preset} width="100%" onChange={pick} options={[...PRESETS.map(([k, l]) => ({ value: k, label: l })), { value: 'custom', label: 'Custom range' }]} /></div>
        <input type="date" className="input" style={{ maxWidth: 160 }} value={from} max={to} onChange={(e) => e.target.value && (setPreset('custom'), setRange([e.target.value, to]))} />
        <span className="muted">to</span>
        <input type="date" className="input" style={{ maxWidth: 160 }} value={to} min={from} onChange={(e) => e.target.value && (setPreset('custom'), setRange([from, e.target.value]))} />
        <button className="btn line" style={{ marginLeft: 'auto' }} onClick={exportCsv} disabled={!d}><Download size={15} /> Export</button>
      </div>

      {!d || !t ? <Loading /> : (<>
        <div className="stat-row">
          <StatCard icon={<Tag size={20} />} tint="#0ea5e9" label="Discounts given" value={inr(t.discounts)} sub={`${d.discounts.orders} orders`} />
          <StatCard icon={<Gift size={20} />} tint="#f59e0b" label="Customer rewards" value={inr(t.customerRewards)} sub="wallet credits" />
          <StatCard icon={<HardHat size={20} />} tint="#16a34a" label="Expert incentives" value={inr(t.expertIncentives)} sub="bonuses beyond job pay" />
          <StatCard icon={<Sigma size={20} />} tint="#7c3aed" label="Total cost" value={inr(t.all)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
          <Card title="Discounts off orders" right={<span className="muted" style={{ fontSize: 12 }}>reduce the order value</span>}>
            <Breakdown unit="orders" total={t.discounts} rows={[
              { name: 'Coupons & campaigns', amount: d.discounts.coupon, orders: d.discounts.couponOrders },
              { name: 'Membership discount', amount: d.discounts.membership, orders: d.discounts.membershipOrders },
              { name: 'Zone discount', amount: d.discounts.zone, orders: d.discounts.zoneOrders },
            ].filter((r) => r.amount > 0)} empty="No discounts in this period." />
            {d.discounts.byCampaign.length > 0 && (<>
              <div style={{ fontWeight: 700, fontSize: 13, margin: '14px 0 6px' }}>By campaign / coupon</div>
              <Breakdown unit="orders" total={d.discounts.coupon} rows={d.discounts.byCampaign} empty="" />
            </>)}
            <div style={{ marginTop: 10 }}><button className="btn line" onClick={() => nav('/campaigns')}>Manage campaigns</button></div>
          </Card>

          <Card title="Customer rewards" right={<span className="muted" style={{ fontSize: 12 }}>credited to customer wallets</span>}>
            <Breakdown total={t.customerRewards} rows={d.customerRewards} empty="No customer rewards in this period." />
            {has(admin, 'settings.view') && <div style={{ marginTop: 10 }}><button className="btn line" onClick={() => nav('/settings')}>Reward amounts (Settings ▸ Customer credits)</button></div>}
          </Card>

          <Card title="Expert incentives" right={<span className="muted" style={{ fontSize: 12 }}>paid into expert wallets</span>}>
            <Breakdown total={t.expertIncentives} rows={d.expertIncentives} empty="No expert incentives in this period." />
          </Card>

          {d.rules.length > 0 && (
            <Card title={`Incentive rules — ${d.rulesMonth}`} right={<span className="muted" style={{ fontSize: 12 }}>spend vs monthly budget</span>}>
              <table className="tbl"><thead><tr><th>Rule</th><th>Status</th><th className="num">Paid</th><th className="num">Spent</th><th className="num">Budget</th></tr></thead>
                <tbody>{d.rules.map((r) => {
                  const over = r.budget > 0 && r.spent >= r.budget
                  return (
                    <tr key={r.id}>
                      <td>{r.name}<div className="muted" style={{ fontSize: 11 }}>{r.calcType === 'fixed' ? `${inr(r.calc.amount || 0)} per ${r.trigger === 'job_completed' ? 'job' : 'month'}` : r.calcType}</div></td>
                      <td><Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'On' : 'Off'}</Badge></td>
                      <td className="num">{r.paid}</td>
                      <td className="num" style={{ color: over ? '#dc2626' : undefined, fontWeight: 700 }}>{inr(r.spent)}</td>
                      <td className="num">{r.budget ? inr(r.budget) : 'No cap'}</td>
                    </tr>
                  )
                })}</tbody></table>
              <div style={{ marginTop: 10 }}><button className="btn line" onClick={() => nav('/compensation-rules')}>Edit rules</button></div>
            </Card>
          )}

          {d.giftCards && (
            <Card title="Gift cards" right={<CreditCard size={16} color="#94a3b8" />}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[['Issued', `${d.giftCards.issued} · ${inr(d.giftCards.value)}`], ['Redeemed', inr(d.giftCards.redeemed)], ['Unused balance', inr(d.giftCards.outstanding)]].map(([l, v]) => (
                  <div key={l} className="card pad" style={{ border: '1px solid var(--line, #eee)' }}><small className="muted">{l}</small><div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{v}</div></div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </>)}
    </div>
  )
}
