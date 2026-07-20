import { useEffect, useState } from 'react'
import {
  Radio, Users, Zap, AlertTriangle, Timer, MapPin, TrendingUp, RefreshCw, CheckCircle2, Clock, Ban, IndianRupee, UserPlus,
} from 'lucide-react'
import { Card, StatCard, Badge, Loading, ErrorState } from '../components/UI'
import { fetchCommandCenter } from '../api'
import type { CommandCenter } from '../types'

/* Operations Command Center — the network's live "mission control".
 * Every number is real, aggregated server-side from zones × workers × live jobs × bookings, and it
 * refreshes on its own. Scoped: a city/zone leader sees only their patch. */

const HEALTH: Record<string, { c: string; bg: string; label: string }> = {
  healthy: { c: '#0f8a4d', bg: '#e7f7ee', label: 'Healthy' },
  short: { c: '#b97400', bg: '#fff4e5', label: 'Short' },
  critical: { c: '#d92d20', bg: '#fdecec', label: 'Critical' },
  idle: { c: '#6b7090', bg: '#eeeef5', label: 'Idle' },
  off: { c: '#98a2b3', bg: '#f2f3f7', label: 'Offline' },
}
const ALERT: Record<string, { c: string; bg: string }> = {
  critical: { c: '#d92d20', bg: '#fdecec' }, warn: { c: '#b97400', bg: '#fff8ec' }, info: { c: '#1d72d8', bg: '#eaf3ff' },
}
const rupee = (n: number) => '₹' + (n || 0).toLocaleString('en-IN')
const hourLabel = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`)

export default function CommandCenter() {
  const [d, setD] = useState<CommandCenter | null>(null)
  const [err, setErr] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const load = () => {
    setRefreshing(true)
    fetchCommandCenter().then((x) => { setD(x); setErr('') }).catch((e: Error) => setErr(e.message)).finally(() => setRefreshing(false))
  }
  // Live view — refresh every 30s while the screen is open.
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id) }, [])

  if (err && !d) return <ErrorState msg={err} onRetry={load} />
  if (!d) return <Loading />

  const { network: n, sla } = d
  const updated = new Date(d.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const peak = Math.max(1, ...d.peakHours)

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* live indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#0f8a4d' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', boxShadow: '0 0 0 4px rgba(22,163,74,.18)' }} /> LIVE
        </span>
        <span className="muted" style={{ fontSize: 12 }}>Auto-refreshing · updated {updated}</span>
        <button className="btn line sm" style={{ marginLeft: 'auto' }} onClick={load} disabled={refreshing}><RefreshCw size={13} /> Refresh</button>
      </div>

      {/* network stat cards */}
      <div className="stat-row">
        <StatCard icon={<Users size={18} />} tint="#e7f7ee" label="Pros online" value={n.onlineWorkers} sub={`${n.activeWorkers} active`} />
        <StatCard icon={<Zap size={18} />} tint="#eef0ff" label="Live jobs" value={n.liveJobs} sub={`${n.activeJobs} in progress`} />
        <StatCard icon={<Radio size={18} />} tint={n.openJobs ? '#fff4e5' : '#eef0ff'} label="Awaiting dispatch" value={n.openJobs} sub="unassigned" />
        <StatCard icon={<Timer size={18} />} tint={sla.breached ? '#fdecec' : '#e7f7ee'} label="SLA breached" value={sla.breached} sub={`${sla.atRisk} at risk`} />
        <StatCard icon={<AlertTriangle size={18} />} tint={n.zonesCritical ? '#fdecec' : '#e7f7ee'} label="Critical zones" value={n.zonesCritical} sub={`${n.zonesShort} short`} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          {/* demand vs supply */}
          <Card title="Demand vs Supply" right={<span className="muted" style={{ fontSize: 12 }}>{d.demandSupply.length} zone(s)</span>}>
            {d.demandSupply.length === 0
              ? <div className="muted" style={{ fontSize: 13 }}>No zones in your scope.</div>
              : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {d.demandSupply.map((z) => {
                    const h = HEALTH[z.health] || HEALTH.idle
                    const max = Math.max(1, z.demand, z.online)
                    return (
                      <div key={z.id} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 84px', gap: 12, alignItems: 'center' }}>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ fontSize: 13 }}>{z.name}</strong>
                          <div className="muted" style={{ fontSize: 11 }}>{z.city || '—'}</div>
                        </div>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <Bar label="Demand" value={z.demand} max={max} color="#4f46e5" hint={`${z.open} open · ${z.active} active`} />
                          <Bar label="Online" value={z.online} max={max} color="#16a34a" hint={`${z.assigned} assigned`} />
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: h.c, background: h.bg, padding: '3px 9px', borderRadius: 999 }}>{h.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
          </Card>

          {/* peak-hour demand */}
          <Card title="Peak-hour demand" right={<span className="muted" style={{ fontSize: 12 }}>{d.peakHour >= 0 ? `Peak ${hourLabel(d.peakHour)}` : '—'} · IST</span>}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, marginTop: 4 }}>
              {d.peakHours.map((v, h) => (
                <div key={h} title={`${hourLabel(h)}: ${v} booking(s)`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, justifyContent: 'flex-end', height: '100%' }}>
                  <div style={{ width: '100%', height: `${Math.max(2, (v / peak) * 100)}%`, borderRadius: '3px 3px 0 0', background: h === d.peakHour ? '#4f46e5' : 'var(--violet-100, #dcd9fb)' }} />
                  {h % 3 === 0 && <span className="muted" style={{ fontSize: 9 }}>{hourLabel(h)}</span>}
                </div>
              ))}
            </div>
          </Card>

          {/* escalation queue */}
          <Card title="Escalation queue" right={<Badge tone={d.escalations.length ? 'red' : 'green'}>{d.escalations.length} stuck</Badge>}>
            {d.escalations.length === 0
              ? <div className="muted" style={{ fontSize: 13 }}>Nothing stuck — every live job is within its SLA. 🎯</div>
              : (
                <div className="tablewrap">
                  <table className="tbl">
                    <thead><tr><th>Job</th><th>Zone</th><th>Status</th><th style={{ textAlign: 'right' }}>Age</th><th>Why</th></tr></thead>
                    <tbody>
                      {d.escalations.map((e) => (
                        <tr key={e.id}>
                          <td><strong>{e.ref}</strong></td>
                          <td className="muted">{e.zone}</td>
                          <td><Badge tone={e.status === 'unassigned' ? 'red' : 'amber'} dot={false}>{e.status.replace(/_/g, ' ')}</Badge></td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#d92d20' }}>{e.ageMin}m</td>
                          <td className="muted" style={{ fontSize: 12 }}>{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </Card>
        </div>

        {/* right rail */}
        <div style={{ display: 'grid', gap: 16 }}>
          {/* SLA monitor */}
          <Card title="SLA monitor">
            <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: '#eef0f4', marginBottom: 10 }}>
              {sla.total > 0 ? (
                <>
                  <div style={{ width: `${(sla.onTime / sla.total) * 100}%`, background: '#16a34a' }} />
                  <div style={{ width: `${(sla.atRisk / sla.total) * 100}%`, background: '#f59e0b' }} />
                  <div style={{ width: `${(sla.breached / sla.total) * 100}%`, background: '#ef4444' }} />
                </>
              ) : null}
            </div>
            <SlaRow color="#16a34a" label="On time" value={sla.onTime} />
            <SlaRow color="#f59e0b" label="At risk" value={sla.atRisk} />
            <SlaRow color="#ef4444" label="Breached" value={sla.breached} />
            {sla.total === 0 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>No live jobs right now.</div>}
          </Card>

          {/* active alerts */}
          <Card title="Active alerts" right={<Badge tone={d.alerts.length ? 'amber' : 'green'}>{d.alerts.length}</Badge>}>
            {d.alerts.length === 0
              ? <div className="muted" style={{ fontSize: 13 }}>All clear — no active alerts.</div>
              : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {d.alerts.map((a, i) => {
                    const t = ALERT[a.level] || ALERT.info
                    return (
                      <div key={i} style={{ display: 'flex', gap: 9, padding: '9px 11px', borderRadius: 10, background: t.bg }}>
                        <AlertTriangle size={15} style={{ color: t.c, flexShrink: 0, marginTop: 1 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: t.c }}>{a.title}</div>
                          <div className="muted" style={{ fontSize: 11.5 }}>{a.detail}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
          </Card>

          {/* today */}
          <Card title="Today at a glance">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Mini icon={<Radio size={15} />} label="Orders" value={d.dailySummary.orders} />
              <Mini icon={<CheckCircle2 size={15} />} label="Completed" value={d.dailySummary.completed} />
              <Mini icon={<Clock size={15} />} label="Active" value={d.dailySummary.active} />
              <Mini icon={<Ban size={15} />} label="Cancelled" value={d.dailySummary.cancelled} />
              <Mini icon={<IndianRupee size={15} />} label="Revenue" value={rupee(d.dailySummary.revenue)} />
              <Mini icon={<UserPlus size={15} />} label="New pros" value={d.dailySummary.newWorkers} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Bar({ label, value, max, color, hint }: { label: string; value: number; max: number; color: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="muted" style={{ fontSize: 10.5, width: 48, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 14, background: '#f2f3f7', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(3, (value / max) * 100)}%`, height: '100%', background: color, borderRadius: 5 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, width: 22, textAlign: 'right' }}>{value}</span>
      {hint && <span className="muted" style={{ fontSize: 10.5, width: 96, flexShrink: 0 }}>{hint}</span>}
    </div>
  )
}
function SlaRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginTop: 5 }}>
      <i style={{ width: 9, height: 9, borderRadius: 9, background: color, display: 'inline-block' }} />
      <span style={{ flex: 1 }}>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 10, background: 'var(--line-2, #f7f7fb)' }}>
      <span style={{ color: 'var(--violet, #5b51e8)' }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
        <div className="muted" style={{ fontSize: 10.5 }}>{label}</div>
      </div>
    </div>
  )
}
