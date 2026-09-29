import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown, Download, ShoppingBag, CheckCircle2, IndianRupee, Wallet, Undo2, Users, TrendingUp, HardHat, X, ExternalLink } from 'lucide-react'
import { fetchBusiness, fetchBusinessTrend, fetchBusinessPayouts, type BizRow, type BizPerformance, type BizTrend, type BizPayouts } from '../api'
import { Card, StatCard, Badge, Loading, Dropdown, useToast } from '../components/UI'
import { useStore, has } from '../store'

/* Insights ▸ Business Performance — orders and money by State → City → Zone for any date range,
 * compared with the period before; click a zone for its daily trend and top services. The Payouts
 * tab lists every expert withdrawal. Everything is limited to the viewer's territory. */
const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN')
const istDay = (off = 0) => new Date(Date.now() + 330 * 60000 + off * 86400000).toISOString().slice(0, 10)
const monthStart = (d: string) => d.slice(0, 8) + '01'
const prevMonth = (): [string, string] => { const t = new Date(Date.now() + 330 * 60000); const a = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1)); const b = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0)); return [a.toISOString().slice(0, 10), b.toISOString().slice(0, 10)] }
const PRESETS: [string, string, () => [string, string]][] = [
  ['today', 'Today', () => [istDay(), istDay()]],
  ['yesterday', 'Yesterday', () => [istDay(-1), istDay(-1)]],
  ['7d', 'Last 7 days', () => [istDay(-6), istDay()]],
  ['30d', 'Last 30 days', () => [istDay(-29), istDay()]],
  ['month', 'This month', () => [monthStart(istDay()), istDay()]],
  ['lastmonth', 'Last month', prevMonth],
]
function Delta({ now, before }: { now: number; before: number }) {
  if (!before && !now) return null
  if (!before) return <span style={{ color: '#16a34a', fontSize: 11, fontWeight: 700 }}>new</span>
  const pct = Math.round(((now - before) / before) * 100)
  if (!pct) return <span className="muted" style={{ fontSize: 11 }}>0%</span>
  return <span style={{ color: pct > 0 ? '#16a34a' : '#dc2626', fontSize: 11, fontWeight: 700 }}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%</span>
}

export default function BusinessPerformance() {
  const toast = useToast()
  const { admin } = useStore()
  const canPayouts = has(admin, 'finance.view') || has(admin, 'wallet.view') || has(admin, 'payments.view')
  const [tab, setTab] = useState<'zones' | 'payouts'>('zones')
  const [preset, setPreset] = useState('month')
  const [[from, to], setRange] = useState<[string, string]>(() => [monthStart(istDay()), istDay()])
  const [d, setD] = useState<BizPerformance | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [drill, setDrill] = useState<BizRow | null>(null)

  useEffect(() => { setD(null); fetchBusiness(from, to).then((x) => { setD(x); setOpen(Object.fromEntries(x.states.map((s) => [`s:${s.state}`, true]))) }).catch((e: Error) => toast(e.message)) }, [from, to])
  const pick = (k: string) => { const p = PRESETS.find((x) => x[0] === k); if (p) { setPreset(k); setRange(p[2]()) } }
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }))

  const exportCsv = () => {
    if (!d) return
    const head = ['State', 'City', 'Zone', 'Orders', 'Orders (prev)', 'Completed', 'Cancelled', 'Cancel %', 'GMV', 'GMV (prev)', 'Collected', 'Refunds', 'Expert cost', 'Net', 'AOV', 'Customers', 'New customers', 'Active experts', 'Online now']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [head.join(',')]
    for (const s of d.states) for (const c of s.cities) for (const z of c.zones)
      lines.push([s.state, c.city, z.zone, z.orders, z.prev.orders, z.completed, z.cancelled, z.cancelRate, z.gmv, z.prev.gmv, z.collected, z.refunds, z.expertCost, z.net, z.aov, z.customers, z.newCustomers, z.experts, z.online].map(esc).join(','))
    const t = d.totals
    lines.push(['All', '', '', t.orders, t.prev.orders, t.completed, t.cancelled, t.cancelRate, t.gmv, t.prev.gmv, t.collected, t.refunds, t.expertCost, t.net, t.aov, t.customers, t.newCustomers, t.experts, t.online].map(esc).join(','))
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })); a.download = `business-${from}_to_${to}.csv`; a.click()
  }

  const t = d?.totals
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="tabs">
          <button className={`tab ${tab === 'zones' ? 'active' : ''}`} onClick={() => setTab('zones')}>By State / City / Zone</button>
          {canPayouts && <button className={`tab ${tab === 'payouts' ? 'active' : ''}`} onClick={() => setTab('payouts')}>Expert payouts</button>}
        </div>
        <div style={{ width: 160 }}>
          <Dropdown value={preset} width="100%" onChange={pick} options={[...PRESETS.map(([k, l]) => ({ value: k, label: l })), { value: 'custom', label: 'Custom range' }]} />
        </div>
        <input type="date" className="input" style={{ maxWidth: 160 }} value={from} max={to} onChange={(e) => e.target.value && (setPreset('custom'), setRange([e.target.value, to]))} />
        <span className="muted">to</span>
        <input type="date" className="input" style={{ maxWidth: 160 }} value={to} min={from} onChange={(e) => e.target.value && (setPreset('custom'), setRange([from, e.target.value]))} />
        {tab === 'zones' && <button className="btn line" style={{ marginLeft: 'auto' }} onClick={exportCsv} disabled={!d}><Download size={15} /> Export</button>}
      </div>

      {tab === 'payouts' ? <Payouts from={from} to={to} /> : !d || !t ? <Loading /> : (<>
        <p className="muted" style={{ margin: '-6px 0 0', fontSize: 12.5 }}>
          {d.range.from} → {d.range.to} ({d.range.days} day{d.range.days > 1 ? 's' : ''}) · compared with {d.range.prevFrom} → {d.range.prevTo}
        </p>
        <div className="stat-row">
          <StatCard icon={<ShoppingBag size={20} />} tint="#5b51e8" label="Orders" value={t.orders.toLocaleString('en-IN')} sub={<><Delta now={t.orders} before={t.prev.orders} /> · {t.cancelled} cancelled ({t.cancelRate}%)</>} />
          <StatCard icon={<CheckCircle2 size={20} />} tint="#16a34a" label="Completed" value={t.completed.toLocaleString('en-IN')} sub={<Delta now={t.completed} before={t.prev.completed} />} />
          <StatCard icon={<TrendingUp size={20} />} tint="#0ea5e9" label="GMV (order value)" value={inr(t.gmv)} sub={<><Delta now={t.gmv} before={t.prev.gmv} /> · AOV {inr(t.aov)}</>} />
          <StatCard icon={<IndianRupee size={20} />} tint="#7c3aed" label="Collected" value={inr(t.collected)} sub={<Delta now={t.collected} before={t.prev.collected} />} />
          <StatCard icon={<Users size={20} />} tint="#f59e0b" label="Customers" value={t.customers.toLocaleString('en-IN')} sub={`${t.newCustomers} new`} />
          <StatCard icon={<HardHat size={20} />} tint="#64748b" label="Active experts" value={t.experts} sub={`${t.online} online now`} />
        </div>

        {/* Money in vs money out */}
        <Card title="Money in vs money out">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            {[
              ['Collected from customers', t.collected, '#16a34a', '+'],
              ['Refunded to customers', t.refunds, '#dc2626', '−'],
              ['Expert job earnings', t.expertEarnings, '#dc2626', '−'],
              ['Incentives & bonuses', t.incentives, '#dc2626', '−'],
              ['Salaries', t.salary, '#dc2626', '−'],
            ].map(([l, v, c, s]) => (
              <div key={l as string} className="card pad" style={{ border: '1px solid var(--line, #eee)' }}>
                <small className="muted">{l as string}</small>
                <div style={{ fontSize: 20, fontWeight: 800, color: c as string, marginTop: 2 }}>{s as string}{inr(v as number)}</div>
              </div>
            ))}
            <div className="card pad" style={{ border: '2px solid #5b51e8', background: '#f5f3ff' }}>
              <small className="muted">Net (company share)</small>
              <div style={{ fontSize: 22, fontWeight: 900, color: t.net >= 0 ? '#15803d' : '#b91c1c', marginTop: 2 }}>{inr(t.net)}</div>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 10, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <span><Wallet size={13} style={{ verticalAlign: -2 }} /> Paid out to experts: <b>{inr(t.paidOut)}</b></span>
            <span><Undo2 size={13} style={{ verticalAlign: -2 }} /> Payouts waiting: <b>{inr(t.payoutsPending)}</b></span>
          </div>
        </Card>

        {/* State → City → Zone */}
        <Card title="By State → City → Zone" right={<span className="muted" style={{ fontSize: 12 }}>Click a state or city to expand · click a zone for its trend</span>}>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr>
              <th>Area</th><th className="num">Orders</th><th className="num">Completed</th><th className="num">Cancel %</th><th className="num">GMV</th>
              <th className="num">Collected</th><th className="num">Refunds</th><th className="num">Expert cost</th><th className="num">Net</th><th className="num">AOV</th>
              <th className="num">Customers</th><th className="num">Experts</th>
            </tr></thead>
            <tbody>
              {d.states.length === 0 && <tr><td colSpan={12} className="muted">No zones in your territory.</td></tr>}
              {d.states.map((s) => (
                <Fragment key={s.state}>
                  <Row r={s} label={s.state} level={0} open={!!open[`s:${s.state}`]} onClick={() => toggle(`s:${s.state}`)} />
                  {open[`s:${s.state}`] && s.cities.map((c) => (
                    <Fragment key={c.city}>
                      <Row r={c} label={c.city} level={1} open={!!open[`c:${s.state}:${c.city}`]} onClick={() => toggle(`c:${s.state}:${c.city}`)} />
                      {open[`c:${s.state}:${c.city}`] && c.zones.map((z) => <Row key={z.zoneId ?? 'none'} r={z} label={z.zone} level={2} onClick={() => setDrill(z)} />)}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
              <Row r={t} label="All areas" level={-1} />
            </tbody>
          </table></div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.6 }}>
            <b>GMV</b> = value of all orders not cancelled. <b>Collected</b> = paid by customers (including bookings later refunded). <b>Expert cost</b> = job earnings + incentives + salary credited to the zone’s experts.
            <b> Net</b> = collected − refunds − expert cost. <b>AOV</b> = GMV ÷ orders not cancelled. “No zone” = bookings/experts not mapped to any zone.
          </p>
        </Card>
      </>)}

      {drill && <ZoneDrill z={drill} from={from} to={to} onClose={() => setDrill(null)} />}
    </div>
  )
}

function Row({ r, label, level, open, onClick }: { r: BizRow | BizPerformance['totals']; label: string; level: number; open?: boolean; onClick?: () => void }) {
  const isTotal = level < 0, isZone = level === 2
  const bold = level <= 0
  return (
    <tr onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', background: isTotal ? '#f8fafc' : level === 0 ? '#fbfaff' : undefined, fontWeight: bold ? 700 : 400 }}>
      <td style={{ paddingLeft: 12 + Math.max(0, level) * 22 }}>
        {!isZone && !isTotal && (open ? <ChevronDown size={14} style={{ verticalAlign: -2 }} /> : <ChevronRight size={14} style={{ verticalAlign: -2 }} />)} {label}
        {isZone && <span className="link" style={{ marginLeft: 6, fontSize: 11 }}>trend →</span>}
      </td>
      <td className="num">{r.orders} <Delta now={r.orders} before={r.prev.orders} /></td>
      <td className="num">{r.completed}</td>
      <td className="num" style={{ color: r.cancelRate > 20 ? '#dc2626' : undefined }}>{r.cancelRate}%</td>
      <td className="num">{inr(r.gmv)} <Delta now={r.gmv} before={r.prev.gmv} /></td>
      <td className="num">{inr(r.collected)}</td>
      <td className="num">{r.refunds ? inr(r.refunds) : '—'}</td>
      <td className="num">{r.expertCost ? inr(r.expertCost) : '—'}</td>
      <td className="num" style={{ color: r.net < 0 ? '#dc2626' : '#15803d', fontWeight: 700 }}>{inr(r.net)}</td>
      <td className="num">{r.aov ? inr(r.aov) : '—'}</td>
      <td className="num">{r.customers}{r.newCustomers ? <span className="muted" style={{ fontSize: 11 }}> ({r.newCustomers} new)</span> : ''}</td>
      <td className="num">{r.experts}<span className="muted" style={{ fontSize: 11 }}> · {r.online} on</span></td>
    </tr>
  )
}

/* Zone drill-down: daily orders / GMV bars and top services. */
function ZoneDrill({ z, from, to, onClose }: { z: BizRow; from: string; to: string; onClose: () => void }) {
  const nav = useNavigate()
  const [tr, setTr] = useState<BizTrend | null>(null)
  useEffect(() => { fetchBusinessTrend(from, to, z.zoneId == null ? 'none' : String(z.zoneId)).then(setTr).catch(() => setTr({ days: [], services: [] } as unknown as BizTrend)) }, [z, from, to])
  const maxG = Math.max(1, ...(tr?.days || []).map((x) => x.gmv))
  const maxO = Math.max(1, ...(tr?.days || []).map((x) => x.orders))
  const W = 640, H = 170, n = tr?.days.length || 1, bw = Math.max(4, Math.min(28, (W - 20) / n - 4))
  return (
    <div className="modal-back" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 16 }}>
      <div className="card pad" onClick={(e) => e.stopPropagation()} style={{ width: 'min(760px, 100%)', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><b style={{ fontSize: 16 }}>{z.zone}</b> <span className="muted">· {z.city}, {z.state}</span></div>
          <button className="iconbtn" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '10px 0 4px', fontSize: 13 }}>
          <span>Orders <b>{z.orders}</b></span><span>GMV <b>{inr(z.gmv)}</b></span><span>Collected <b>{inr(z.collected)}</b></span>
          <span>Net <b style={{ color: z.net < 0 ? '#dc2626' : '#15803d' }}>{inr(z.net)}</b></span><span>Experts <b>{z.experts}</b> ({z.online} online)</span>
        </div>
        {!tr ? <Loading /> : (<>
          <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 4px' }}>Daily GMV <span style={{ color: '#5b51e8' }}>■</span> and orders <span style={{ color: '#f59e0b' }}>●</span></div>
          <svg viewBox={`0 0 ${W} ${H + 22}`} style={{ width: '100%', height: 'auto' }}>
            {tr.days.map((x, i) => {
              const cx = 10 + i * ((W - 20) / n) + ((W - 20) / n) / 2
              const h = (x.gmv / maxG) * (H - 10)
              return (
                <g key={x.d}>
                  <rect x={cx - bw / 2} y={H - h} width={bw} height={Math.max(h, x.gmv ? 2 : 0)} rx={3} fill="#5b51e8" opacity={0.85}><title>{`${x.d}: ${inr(x.gmv)} · ${x.orders} orders`}</title></rect>
                  {x.orders > 0 && <circle cx={cx} cy={H - (x.orders / maxO) * (H - 10)} r={3.5} fill="#f59e0b" />}
                  {(n <= 10 || i % Math.ceil(n / 10) === 0) && <text x={cx} y={H + 15} fontSize={10} textAnchor="middle" fill="#94a3b8">{x.d.slice(5)}</text>}
                </g>
              )
            })}
            <line x1={0} y1={H} x2={W} y2={H} stroke="#e2e8f0" />
          </svg>
          <div style={{ fontSize: 12, fontWeight: 700, margin: '12px 0 6px' }}>Top services</div>
          {tr.services.length === 0 ? <p className="muted" style={{ fontSize: 12.5 }}>No orders in this period.</p> : (
            <table className="tbl"><thead><tr><th>Service</th><th className="num">Orders</th><th className="num">Value</th></tr></thead>
              <tbody>{tr.services.map((s) => <tr key={s.name}><td>{s.name}</td><td className="num">{s.orders}</td><td className="num">{inr(s.revenue)}</td></tr>)}</tbody></table>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn line" onClick={() => nav(`/payments?zoneId=${z.zoneId ?? 'none'}`)}><ExternalLink size={14} /> Payments in this zone</button>
          </div>
        </>)}
      </div>
    </div>
  )
}

/* Every expert payout (withdrawal) in the range, filterable by status and zone. */
function Payouts({ from, to }: { from: string; to: string }) {
  const nav = useNavigate()
  const [status, setStatus] = useState('')
  const [zone, setZone] = useState('')
  const [p, setP] = useState<BizPayouts | null>(null)
  useEffect(() => { setP(null); fetchBusinessPayouts(from, to, status).then(setP).catch(() => setP({ summary: { paid: 0, pending: 0, processing: 0, failed: 0, count: 0 }, payouts: [] } as unknown as BizPayouts)) }, [from, to, status])
  const zones = useMemo(() => [...new Map((p?.payouts || []).map((x) => [String(x.zoneId ?? 'none'), x.zone])).entries()], [p])
  const rows = (p?.payouts || []).filter((x) => !zone || String(x.zoneId ?? 'none') === zone)
  const TONE: Record<string, string> = { Paid: 'green', Processing: 'blue', Pending: 'amber', Failed: 'red', Rejected: 'red' }
  if (!p) return <Loading />
  return (<>
    <div className="stat-row">
      <StatCard icon={<Wallet size={20} />} tint="#16a34a" label="Paid out" value={inr(p.summary.paid)} />
      <StatCard icon={<Wallet size={20} />} tint="#2563eb" label="Processing" value={inr(p.summary.processing)} />
      <StatCard icon={<Wallet size={20} />} tint="#f59e0b" label="Waiting for approval" value={inr(p.summary.pending)} />
      <StatCard icon={<Wallet size={20} />} tint="#dc2626" label="Failed / rejected" value={inr(p.summary.failed)} />
    </div>
    <Card title={`Expert payouts (${rows.length})`} right={
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ width: 160 }}><Dropdown value={status} width="100%" onChange={setStatus} options={[{ value: '', label: 'All statuses' }, ...['Paid', 'Processing', 'Pending', 'Failed', 'Rejected'].map((s) => ({ value: s, label: s }))]} /></div>
        <div style={{ width: 170 }}><Dropdown value={zone} width="100%" onChange={setZone} options={[{ value: '', label: 'All zones' }, ...zones.map(([k, v]) => ({ value: k, label: v === '—' ? 'No zone' : v }))]} /></div>
      </div>}>
      {rows.length === 0 ? <p className="muted" style={{ margin: 0 }}>No expert payouts in this period.</p> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Date</th><th>Expert</th><th>Zone</th><th className="num">Amount</th><th>To</th><th>Reference / UTR</th><th>Status</th></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.id}>
              <td>{new Date(x.created).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</td>
              <td><span className="link" onClick={() => nav(`/workers/${x.workerId}`)}>{x.workerName}</span><div className="muted" style={{ fontSize: 11 }}>{x.phone}</div></td>
              <td>{x.zone}<div className="muted" style={{ fontSize: 11 }}>{x.city}</div></td>
              <td className="num"><b>{inr(x.amount)}</b></td>
              <td>{x.destination || x.method}</td>
              <td>{x.reference}{x.utr ? <div className="muted" style={{ fontSize: 11 }}>UTR {x.utr}</div> : null}</td>
              <td><Badge tone={TONE[x.status] || 'gray'}>{x.status}</Badge></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </Card>
  </>)
}
