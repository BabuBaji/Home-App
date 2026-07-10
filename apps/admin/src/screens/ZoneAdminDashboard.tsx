import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  ShoppingBag, IndianRupee, Users, Clock, XCircle, Star, TrendingUp, TrendingDown,
  Plus, UserPlus, Zap, Package, BarChart3, CalendarDays, Download, Bell, AlertTriangle,
} from 'lucide-react'
import { Card, Badge, SumBars } from '../components/UI'
import { LineChart, BarChart, Donut } from '../components/Charts'
import '../zones/zones.css'

import type { BZone } from '../zones/types'

const SVC: Record<string, string> = { sweep: 'Sweeping & Mopping', bath: 'Bathroom Cleaning', kitchen: 'Kitchen Cleaning', dust: 'Dusting', laundry: 'Laundry', fan: 'Fan Cleaning', window: 'Window Cleaning', sofa: 'Sofa Cleaning', deep: 'Deep Cleaning' }
const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const compact = (n: number) => n >= 1e5 ? '₹' + (n / 1e5).toFixed(2) + 'L' : money(n)

function zm(z: BZone) {
  const cap = z.config?.capacity || { maxOrders: 120, workersRequired: 20, maxEtaMin: 20 }
  const total = Math.max(z.config?.team?.workers?.length || 0, cap.workersRequired || 0, 1)
  const online = Math.round(total * 0.62), busy = Math.round(total * 0.34), offline = Math.max(0, total - online - busy)
  const orders = Math.round((cap.maxOrders || 120) * 0.69)
  const svc = z.config?.services || []
  const prices = svc.map((k) => z.config?.pricing?.[k] || 200)
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 200
  const completed = Math.round(orders * 0.925)
  const revenue = Math.round(completed * avg)
  const eta = Math.max(5, Math.round((cap.maxEtaMin || 20) * 0.7))
  const health = Math.min(99, 58 + svc.length * 4 + Math.round(total / 3))
  return { total, online, busy, offline, orders, completed, revenue, eta, svc, avg, health }
}
function series(v: number, seed: number) {
  return Array.from({ length: 8 }, (_, i) => Math.max(0, v * (0.6 + (i / 7) * 0.4 + Math.sin((i + seed) * 1.3) * 0.1)))
}
function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 120, h = 34, max = Math.max(...data, 1), min = Math.min(...data, 0), rng = max - min || 1
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / rng) * (h - 6) - 3] as const)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 34 }}>
    <path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity=".10" /><path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}
function Kpi({ icon, tint, label, value, sub, delta, up, seed, sval }: { icon: ReactNode; tint: string; label: string; value: ReactNode; sub?: string; delta: string; up: boolean; seed: number; sval: number }) {
  return (
    <div className="zo-kpi" style={{ animationDelay: `${seed * 40}ms` }}>
      <div className="zo-kpi-h">
        <div className="zo-kpi-ico" style={{ background: `${tint}18`, color: tint, boxShadow: 'none' }}>{icon}</div>
        <span className={'zo-trend ' + (up ? 'up' : 'down')}>{up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{delta}</span>
      </div>
      <div className="zo-kpi-label">{label}</div>
      <div className="zo-kpi-val">{value}{sub && <span style={{ fontSize: 14, color: 'var(--zmut)', fontWeight: 700 }}> {sub}</span>}</div>
      <div style={{ marginTop: 8 }}><Spark data={series(sval, seed)} color={tint} /></div>
    </div>
  )
}

export default function ZoneAdminDashboard({ zones, onCreate, onOpenZone }: { zones: BZone[]; onCreate: () => void; onOpenZone: (z: BZone) => void }) {
  const per = useMemo(() => zones.map((z) => ({ z, m: zm(z) })), [zones])
  const agg = useMemo(() => {
    const a = { orders: 0, revenue: 0, online: 0, total: 0, busy: 0, offline: 0 }
    per.forEach(({ m }) => { a.orders += m.orders; a.revenue += m.revenue; a.online += m.online; a.total += m.total; a.busy += m.busy; a.offline += m.offline })
    return { ...a, pending: Math.round(a.orders * 0.06), cancelled: Math.round(a.orders * 0.02), onBreak: Math.round(a.total * 0.03), rating: 4.6 }
  }, [per])

  const topServices = useMemo(() => {
    const counts: Record<string, number> = {}
    per.forEach(({ z, m }) => { const w = (z.config.services || []).map((_, i) => (z.config.services!.length - i)); const ws = w.reduce((x, y) => x + y, 0) || 1;(z.config.services || []).forEach((k, i) => { counts[k] = (counts[k] || 0) + Math.round(m.completed * w[i] / ws) }) })
    const palette = ['#4F46E5', '#22C55E', '#F59E0B', '#0EA5E9', '#EC4899', '#94A3B8']
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v], i) => ({ label: SVC[k] || k, value: v, color: palette[i % palette.length] }))
  }, [per])

  const workerDonut = [
    { label: 'Online', value: agg.online, color: '#22C55E' }, { label: 'Busy', value: agg.busy, color: '#F59E0B' },
    { label: 'Offline', value: agg.offline, color: '#94A3B8' }, { label: 'On Break', value: agg.onBreak, color: '#7C3AED' },
  ]
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const trend = days.map((day, i) => { const f = [0.55, 0.62, 0.7, 0.85, 1, 0.78, 0.6][i]; return { day, bookings: Math.round(agg.orders * f / 3), revenue: Math.round(agg.revenue * f / 3 / 200) } })
  const revBars = Array.from({ length: 12 }, (_, i) => ({ d: `${i * 3 + 1} May`, rev: Math.round(agg.revenue / 20 * (0.5 + Math.abs(Math.sin(i)) )) }))
  const recent = per.flatMap(({ z, m }) => (z.config.services || []).slice(0, 1).map((k) => ({ id: '#BK' + (78912 - z.id), svc: SVC[k] || k, zone: z.name, status: ['Assigned', 'In Progress', 'Completed', 'Pending'][z.id % 4], time: '09:' + (10 + z.id) + ' AM' }))).slice(0, 5)

  return (
    <div>
      {/* filter bar */}
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <span className="citysel">All Zones</span>
        <span className="daterange"><CalendarDays size={14} /> Today</span>
        <span className="citysel">All Services</span>
        <span className="citysel">All Status</span>
        <div style={{ flex: 1 }} />
        <button className="zo-btn line"><Download size={15} /> Export Report</button>
        <button className="zo-btn" onClick={onCreate}><Plus size={16} /> Create New Zone</button>
      </div>

      {/* KPI row */}
      <div className="zo-kpis" style={{ gridTemplateColumns: 'repeat(6,1fr)', marginBottom: 16 }}>
        <Kpi seed={0} tint="#4F46E5" icon={<ShoppingBag size={19} />} label="Total Bookings" value={agg.orders.toLocaleString('en-IN')} delta="18%" up sval={agg.orders} />
        <Kpi seed={1} tint="#22C55E" icon={<IndianRupee size={19} />} label="Total Revenue" value={compact(agg.revenue)} delta="16%" up sval={agg.revenue} />
        <Kpi seed={2} tint="#0EA5E9" icon={<Users size={19} />} label="Workers Online" value={agg.online} sub={`/ ${agg.total}`} delta="11%" up sval={agg.online} />
        <Kpi seed={3} tint="#F59E0B" icon={<Clock size={19} />} label="Pending Orders" value={agg.pending} delta="8%" up={false} sval={agg.pending} />
        <Kpi seed={4} tint="#EF4444" icon={<XCircle size={19} />} label="Cancelled Orders" value={agg.cancelled} delta="5%" up={false} sval={agg.cancelled} />
        <Kpi seed={5} tint="#F5B301" icon={<Star size={19} />} label="Customer Rating" value={agg.rating} delta="2%" up sval={46} />
      </div>

      {/* trend + bookings by zone + map */}
      <div className="zo-grid" style={{ gridTemplateColumns: '1.3fr 1fr 1.3fr', gap: 16, marginBottom: 16 }}>
        <Card title="Bookings Trend" right={<Badge tone="violet">This Week</Badge>}>
          <div className="row" style={{ gap: 16, marginBottom: 4, fontSize: 12, fontWeight: 700 }}><span className="row" style={{ gap: 6, alignItems: 'center' }}><i style={{ width: 9, height: 9, borderRadius: 50, background: '#5b51e8', display: 'inline-block' }} /> Bookings</span><span className="row" style={{ gap: 6, alignItems: 'center' }}><i style={{ width: 9, height: 9, borderRadius: 50, background: '#16a34a', display: 'inline-block' }} /> Revenue (₹)</span></div>
          <LineChart data={trend as unknown as Record<string, number>[]} keys={['bookings', 'revenue']} height={200} />
        </Card>
        <Card title="Bookings by Zone" right={<span style={{ fontSize: 12, color: 'var(--zi)', fontWeight: 700 }}>View All</span>}>
          <table className="zo-table"><thead><tr><th>Zone</th><th>Bookings</th><th>Revenue</th><th>ETA</th></tr></thead>
            <tbody>{per.slice(0, 7).map(({ z, m }) => (
              <tr key={z.id} onClick={() => onOpenZone(z)}><td><b>{z.name}</b></td><td>{m.orders}</td><td>{money(m.revenue)}</td><td>{m.eta}m</td></tr>
            ))}</tbody>
          </table>
        </Card>
        <Card title="Live Operations Map"><ZonesMap zones={zones} per={per} /></Card>
      </div>

      {/* donuts + recent */}
      <div className="zo-grid" style={{ gridTemplateColumns: '1fr 1fr 1.3fr', gap: 16, marginBottom: 16 }}>
        <Card title="Top Services"><Donut data={topServices.length ? topServices : [{ label: 'No data', value: 1, color: '#e5e7eb' }]} size={180} /></Card>
        <Card title="Worker Status"><Donut data={workerDonut} size={180} /></Card>
        <Card title="Recent Bookings" right={<span style={{ fontSize: 12, color: 'var(--zi)', fontWeight: 700 }}>View All</span>}>
          {recent.map((b) => (
            <div key={b.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
              <div><div style={{ fontWeight: 700, fontSize: 12.5 }}>{b.id}</div><div style={{ fontSize: 12, color: 'var(--zmut)' }}>{b.svc} · {b.zone}</div></div>
              <div style={{ textAlign: 'right' }}><Badge>{b.status}</Badge><div style={{ fontSize: 11, color: 'var(--zmut)', marginTop: 3 }}>{b.time}</div></div>
            </div>
          ))}
          {recent.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No bookings yet.</span>}
        </Card>
      </div>

      {/* alerts + revenue + quick actions + zone performance */}
      <div className="zo-grid" style={{ gridTemplateColumns: '1fr 1.3fr 1fr 1fr', gap: 16 }}>
        <Card title="Alerts & Notifications">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><AlertTriangle size={15} style={{ color: '#EF4444', flex: 'none' }} /><span>{agg.pending} orders pending assignment</span></div>
            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Clock size={15} style={{ color: '#F59E0B', flex: 'none' }} /><span>{agg.busy} workers on a job</span></div>
            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Bell size={15} style={{ color: '#4F46E5', flex: 'none' }} /><span>{zones.filter((z) => z.status !== 'live').length} zones in draft</span></div>
          </div>
        </Card>
        <Card title="Revenue Overview" right={<Badge tone="violet">This Month</Badge>}>
          <BarChart data={revBars} valueKey="rev" labelKey="d" height={180} />
        </Card>
        <Card title="Quick Actions">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[['New Zone', <Plus size={15} key="a" />, onCreate], ['Add Worker', <UserPlus size={15} key="b" />], ['Bulk Assign', <Zap size={15} key="c" />], ['Inventory', <Package size={15} key="d" />], ['Reports', <BarChart3 size={15} key="e" />], ['Booking', <CalendarDays size={15} key="f" />]].map((x, i) => (
              <button key={i} className="zo-btn line" style={{ justifyContent: 'flex-start' }} onClick={x[2] as (() => void) | undefined}>{x[1] as ReactNode} {x[0] as string}</button>
            ))}
          </div>
        </Card>
        <Card title="Zone Performance">
          <SumBars rows={per.slice(0, 7).map(({ z, m }) => ({ label: z.name, value: m.health + '%', pct: m.health, color: m.health >= 80 ? '#22C55E' : m.health >= 65 ? '#F59E0B' : '#EF4444' }))} />
        </Card>
      </div>
    </div>
  )
}

function ZonesMap({ zones, per }: { zones: BZone[]; per: { z: BZone; m: ReturnType<typeof zm> }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = L.map(ref.current, { attributionControl: false }).setView([17.44, 78.39], 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    const pts: L.LatLngExpression[] = []
    per.forEach(({ z, m }) => {
      const cov = z.config.coverage; if (!cov) return
      pts.push([cov.lat, cov.lng])
      L.circle([cov.lat, cov.lng], { radius: cov.radiusKm * 1000, color: '#4F46E5', fillColor: '#4F46E5', fillOpacity: 0.07 }).addTo(map)
      const color = m.orders >= 60 ? '#22C55E' : m.orders >= 30 ? '#F59E0B' : '#EF4444'
      const icon = L.divIcon({ className: '', html: `<div style="background:${color};color:#fff;font-weight:800;font-size:11px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">${m.orders}</div>`, iconSize: [30, 30] })
      L.marker([cov.lat, cov.lng], { icon }).bindTooltip(z.name).addTo(map)
    })
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.4))
    setTimeout(() => map.invalidateSize(), 200)
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  void zones
  return <div ref={ref} style={{ height: 220, width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', background: '#eef0f4' }} />
}
