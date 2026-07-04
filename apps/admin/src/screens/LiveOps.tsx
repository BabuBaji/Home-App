import { useEffect, useRef, useState } from 'react'
import { Radio, Users, Zap, MapPin } from 'lucide-react'
import { fetchLiveOps, type LiveOps as LiveOpsData, type LiveOpsZone } from '../api'
import { StatCard, Card, Badge, Loading, ErrorState } from '../components/UI'

const HEALTH: Record<string, { tone: 'green' | 'amber' | 'red' | 'gray'; label: string; color: string }> = {
  healthy: { tone: 'green', label: 'Healthy', color: '#16a34a' },
  short: { tone: 'amber', label: 'Understaffed', color: '#f59e0b' },
  critical: { tone: 'red', label: 'No supply', color: '#e23b3b' },
  idle: { tone: 'gray', label: 'Idle', color: '#bbb' },
  off: { tone: 'gray', label: 'Not live', color: '#bbb' },
}

export default function LiveOps() {
  const [data, setData] = useState<LiveOpsData | null>(null)
  const [err, setErr] = useState('')
  const first = useRef(true)

  const load = () => fetchLiveOps().then((d) => { setData(d); setErr('') }).catch((e: Error) => { if (first.current) setErr(e.message) })
  useEffect(() => {
    load().finally(() => { first.current = false })
    const iv = setInterval(load, 5000) // control tower auto-refresh
    return () => clearInterval(iv)
  }, [])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!data) return <Loading />
  const t = data.totals

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<Zap size={22} />} tint="#f59e0b" label="Open Jobs" value={String(t.openJobs)} sub="awaiting an expert" />
        <StatCard icon={<Radio size={22} />} tint="#5b51e8" label="Active Jobs" value={String(t.activeJobs)} sub="in progress now" />
        <StatCard icon={<Users size={22} />} tint="#16a34a" label="Online Experts" value={`${t.onlineWorkers} / ${t.activeWorkers}`} sub="online / active" />
        <StatCard icon={<MapPin size={22} />} tint="#2e90fa" label="Live Zones" value={`${t.zonesLive} / ${t.zonesTotal}`} sub="live / total" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#16a34a', display: 'inline-block', boxShadow: '0 0 0 3px rgba(22,163,74,.18)' }} />
        Live control tower — auto-refreshing every 5s
      </div>

      {data.zones.length === 0 ? (
        <Card><div className="muted" style={{ padding: 18, textAlign: 'center' }}>No zones yet. Create <b>Service Areas</b> to see per-zone supply &amp; demand here.</div></Card>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {data.zones.map((z) => <ZoneCard key={z.id} z={z} />)}
        </div>
      )}

      {(data.unzoned.open > 0 || data.unzoned.active > 0) && (
        <Card>
          <div style={{ padding: 14 }}>
            <strong>Unzoned jobs</strong> <span className="muted">— pincode not covered by any zone</span>
            <div className="muted" style={{ marginTop: 4 }}>{data.unzoned.open} open · {data.unzoned.active} active</div>
          </div>
        </Card>
      )}
    </div>
  )
}

function ZoneCard({ z }: { z: LiveOpsZone }) {
  const h = HEALTH[z.health] || HEALTH.idle
  const loadPct = z.supply.online === 0
    ? (z.demand.total > 0 ? 100 : 0)
    : Math.round(Math.min(1, z.demand.total / Math.max(1, z.supply.online)) * 100)
  return (
    <Card>
      <div style={{ padding: 14, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <strong style={{ fontSize: 15 }}>{z.name}</strong>
            <div className="muted" style={{ fontSize: 12 }}>{[z.city, z.state].filter(Boolean).join(', ') || '—'} · {z.pincodeCount} pins</div>
          </div>
          <Badge tone={h.tone}>{h.label}</Badge>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: 'var(--panel, #f6f7fb)', borderRadius: 10, padding: '8px 10px' }}>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px' }}>Demand</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{z.demand.total}</div>
            <div className="muted" style={{ fontSize: 12 }}>{z.demand.open} open · {z.demand.active} active</div>
          </div>
          <div style={{ background: 'var(--panel, #f6f7fb)', borderRadius: 10, padding: '8px 10px' }}>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px' }}>Supply</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{z.supply.online}</div>
            <div className="muted" style={{ fontSize: 12 }}>online · {z.supply.assigned} assigned</div>
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 4, background: '#ececf0', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, loadPct)}%`, background: h.color, transition: 'width .4s' }} />
        </div>
      </div>
    </Card>
  )
}
