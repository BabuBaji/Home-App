import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  ShoppingBag, IndianRupee, Users, Clock, XCircle, Star, TrendingUp, TrendingDown,
  Plus, UserPlus, Zap, Package, BarChart3, CalendarDays, Download, Bell, AlertTriangle,
} from 'lucide-react'
import { Card, Badge, SumBars } from '../components/UI'
import { LineChart, BarChart, Donut } from '../components/Charts'
import { allZonesMetrics, opsOverview } from '../api'
import '../zones/zones.css'

import type { BZone } from '../zones/types'

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
// delta/up are optional: only render a trend chip when a real change is supplied.
function Kpi({ icon, tint, label, value, sub, delta, up }: { icon: ReactNode; tint: string; label: string; value: ReactNode; sub?: string; delta?: string; up?: boolean }) {
  return (
    <div className="zo-kpi">
      <div className="zo-kpi-h">
        <div className="zo-kpi-ico" style={{ background: `${tint}18`, color: tint, boxShadow: 'none' }}>{icon}</div>
        {delta ? <span className={'zo-trend ' + (up ? 'up' : 'down')}>{up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{delta}</span> : null}
      </div>
      <div className="zo-kpi-label">{label}</div>
      <div className="zo-kpi-val">{value}{sub && <span style={{ fontSize: 14, color: 'var(--zmut)', fontWeight: 700 }}> {sub}</span>}</div>
    </div>
  )
}

export default function ZoneAdminDashboard({ zones, onCreate, onOpenZone, onViewAllZones }: { zones: BZone[]; onCreate: () => void; onOpenZone: (z: BZone) => void; onViewAllZones?: () => void }) {
  const nav = useNavigate()
  // Real per-zone figures (bookings/revenue/apartments) from the backend; kept alongside the
  // modelled worker-status / trend visuals which have no live per-zone source yet.
  const [real, setReal] = useState<Record<number, Record<string, number>>>({})
  useEffect(() => { allZonesMetrics().then((rows) => setReal(Object.fromEntries(rows.map((r) => [Number(r.id), r as Record<string, number>])))).catch(() => {}) }, [])
  const [ops, setOps] = useState<Record<string, any>>({})
  useEffect(() => { opsOverview().then(setOps).catch(() => {}) }, [])
  const per = useMemo(() => zones.map((z) => {
    const m = zm(z); const r = real[z.id]
    return { z, m: r ? { ...m, orders: r.orders ?? m.orders, revenue: r.revenue ?? m.revenue } : m }
  }), [zones, real])
  // Aggregates: bookings/revenue/pending/cancelled from real per-zone rows; worker status +
  // rating from the real ops-overview (worker + booking services).
  const agg = useMemo(() => {
    let orders = 0, revenue = 0, pending = 0, cancelled = 0
    const rows = Object.values(real)
    rows.forEach((r) => { orders += r.orders || 0; revenue += r.revenue || 0; pending += r.pending || 0; cancelled += r.cancelled || 0 })
    if (!rows.length) per.forEach(({ m }) => { orders += m.orders; revenue += m.revenue })
    const ws = ops.workerStatus || {}
    return { orders, revenue, pending, cancelled, online: ws.online || 0, busy: ws.busy || 0, offline: ws.offline || 0, total: ws.total || 0, onBreak: ws.onBreak || 0, rating: ops.rating || 0 }
  }, [per, real, ops])

  const palette = ['#4F46E5', '#22C55E', '#F59E0B', '#0EA5E9', '#EC4899', '#94A3B8']
  const topServices = (ops.topServices?.length
    ? ops.topServices.slice(0, 6).map((t: any, i: number) => ({ label: t.name, value: t.count, color: palette[i % palette.length] }))
    : [])
  const wsd = ops.workerStatus || {}
  const workerDonut = [
    { label: 'Online', value: wsd.online || 0, color: '#22C55E' }, { label: 'Busy', value: wsd.busy || 0, color: '#F59E0B' },
    { label: 'Offline', value: wsd.offline || 0, color: '#94A3B8' }, { label: 'On Break', value: wsd.onBreak || 0, color: '#7C3AED' },
  ]
  const trend = (ops.trend?.length
    ? ops.trend.map((t: any) => ({ day: t.day, bookings: t.bookings, revenue: Math.round((t.revenue || 0) / 200) }))
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({ day, bookings: 0, revenue: 0 })))
  const revBars = (ops.revenueDaily?.length
    ? ops.revenueDaily.map((r: any) => ({ d: r.d, rev: r.rev }))
    : Array.from({ length: 7 }, (_, i) => ({ d: `Day ${i + 1}`, rev: 0 })))
  const recent: { id: string; svc: string; zone: string; status: string; time: string }[] = (ops.recent || []).map((r: any) => ({ id: r.ref, svc: r.service, zone: r.zone, status: r.status, time: r.time }))
  const hasTrend = trend.some((t: any) => (t.bookings || 0) > 0 || (t.revenue || 0) > 0)

  return (
    <div>
      {/* KPI row */}
      <div className="zo-kpis" style={{ gridTemplateColumns: 'repeat(6,1fr)', marginBottom: 16 }}>
        <Kpi tint="#4F46E5" icon={<ShoppingBag size={19} />} label="Total Bookings" value={agg.orders.toLocaleString('en-IN')} />
        <Kpi tint="#22C55E" icon={<IndianRupee size={19} />} label="Total Revenue" value={compact(agg.revenue)} />
        <Kpi tint="#0EA5E9" icon={<Users size={19} />} label="Workers Online" value={agg.online} sub={`/ ${agg.total}`} />
        <Kpi tint="#F59E0B" icon={<Clock size={19} />} label="Pending Orders" value={agg.pending} />
        <Kpi tint="#EF4444" icon={<XCircle size={19} />} label="Cancelled Orders" value={agg.cancelled} />
        <Kpi tint="#F5B301" icon={<Star size={19} />} label="Customer Rating" value={agg.rating > 0 ? agg.rating : '—'} />
      </div>

      {/* trend + bookings by zone + map */}
      <div className="zo-grid" style={{ gridTemplateColumns: '1.3fr 1fr 1.3fr', gap: 16, marginBottom: 16 }}>
        <Card title="Bookings Trend" right={<Badge tone="violet">This Week</Badge>}>
          {hasTrend ? (<>
            <div className="row" style={{ gap: 16, marginBottom: 4, fontSize: 12, fontWeight: 700 }}><span className="row" style={{ gap: 6, alignItems: 'center' }}><i style={{ width: 9, height: 9, borderRadius: 50, background: '#5b51e8', display: 'inline-block' }} /> Bookings</span><span className="row" style={{ gap: 6, alignItems: 'center' }}><i style={{ width: 9, height: 9, borderRadius: 50, background: '#16a34a', display: 'inline-block' }} /> Revenue (₹)</span></div>
            <LineChart data={trend as unknown as Record<string, number>[]} keys={['bookings', 'revenue']} height={200} />
          </>) : (
            <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--zmut)' }}>
              <BarChart3 size={26} style={{ opacity: .35 }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>No bookings this week yet</span>
            </div>
          )}
        </Card>
        <Card title="Bookings by Zone" right={<button onClick={() => onViewAllZones?.()} style={{ fontSize: 12, color: 'var(--zi)', fontWeight: 700, cursor: 'pointer', background: 'none', border: 'none' }}>View All</button>}>
          <table className="zo-table"><thead><tr><th>Zone</th><th>Bookings</th><th>Revenue</th><th>ETA</th></tr></thead>
            <tbody>{per.slice(0, 7).map(({ z, m }) => (
              <tr key={z.id} style={{ cursor: 'pointer' }} onClick={() => onOpenZone(z)}><td><b>{z.name}</b></td><td>{m.orders}</td><td>{money(m.revenue)}</td><td>{m.eta}m</td></tr>
            ))}</tbody>
          </table>
        </Card>
        <Card title="Live Operations Map"><ZonesMap zones={zones} per={per} /></Card>
      </div>

      {/* donuts + recent */}
      <div className="zo-grid" style={{ gridTemplateColumns: '1fr 1fr 1.3fr', gap: 16, marginBottom: 16 }}>
        <Card title="Top Services"><Donut data={topServices.length ? topServices : [{ label: 'No data', value: 1, color: '#e5e7eb' }]} size={180} /></Card>
        <Card title="Worker Status"><Donut data={workerDonut} size={180} /></Card>
        <Card title="Recent Bookings" right={<button onClick={() => nav('/bookings')} style={{ fontSize: 12, color: 'var(--zi)', fontWeight: 700, cursor: 'pointer', background: 'none', border: 'none' }}>View All</button>}>
          {recent.map((b) => (
            <div key={b.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => nav(`/bookings?q=${encodeURIComponent(b.id)}`)}>
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
            {[['New Zone', <Plus size={15} key="a" />, onCreate], ['Add Worker', <UserPlus size={15} key="b" />, () => nav('/workers/new')], ['Bulk Assign', <Zap size={15} key="c" />, () => nav('/command-center')], ['Inventory', <Package size={15} key="d" />, () => nav('/zones/inventory')], ['Reports', <BarChart3 size={15} key="e" />, () => nav('/reports')], ['Booking', <CalendarDays size={15} key="f" />, () => nav('/bookings')]].map((x, i) => (
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
