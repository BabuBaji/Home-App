import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchLiveMap, type LiveMapData } from '../api'

/* Control-tower map: where every expert is right now and where the jobs are. Refreshes every 10 s.
   Experts: green = online & free, purple = on a job, grey = offline (faded if no GPS for 30 min).
   Jobs: orange = waiting for an expert, blue = in service. Zone areas are outlined. */
const W_COLOR = { online: '#16a34a', busy: '#6d4aff', offline: '#9ca3af' } as const
const J_COLOR = (s: string) => (s === 'confirmed' ? '#f59e0b' : '#2e90fa')

export default function LiveMap() {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const fitted = useRef(false)
  const [data, setData] = useState<LiveMapData | null>(null)

  useEffect(() => {
    if (!el.current || map.current) return
    map.current = L.map(el.current, { attributionControl: false }).setView([17.44, 78.39], 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = null }
  }, [])

  useEffect(() => {
    let stop = false
    const load = () => fetchLiveMap().then((d) => { if (!stop) setData(d) }).catch(() => {})
    load()
    const iv = setInterval(load, 10000)
    return () => { stop = true; clearInterval(iv) }
  }, [])

  useEffect(() => {
    const g = layer.current, m = map.current
    if (!g || !m || !data) return
    g.clearLayers()
    const pts: L.LatLngExpression[] = []
    for (const z of data.zones) {
      if (z.polygon?.length) L.polygon(z.polygon as L.LatLngExpression[], { color: '#5b51e8', weight: 1, fillOpacity: 0.04 }).bindTooltip(z.name).addTo(g)
      else if (z.coverage) L.circle([z.coverage.lat, z.coverage.lng], { radius: z.coverage.radiusKm * 1000, color: '#5b51e8', weight: 1, fillOpacity: 0.04 }).bindTooltip(z.name).addTo(g)
    }
    for (const j of data.jobs) {
      L.circleMarker([j.lat, j.lng], { radius: 7, color: '#fff', weight: 2, fillColor: J_COLOR(j.status), fillOpacity: 1 })
        .bindPopup(`<b>${j.ref}</b><br>${j.service || ''}<br>${j.status.replace(/_/g, ' ')}${j.pro ? ` · ${j.pro}` : ''}`).addTo(g)
      pts.push([j.lat, j.lng])
    }
    for (const w of data.workers) {
      L.circleMarker([w.lat, w.lng], { radius: 8, color: '#fff', weight: 2, fillColor: W_COLOR[w.state], fillOpacity: w.stale ? 0.35 : 1 })
        .bindPopup(`<b>${w.name}</b><br>${w.state === 'busy' ? 'On a job' : w.state === 'online' ? 'Online · free' : 'Offline'}${w.seenAt ? `<br>GPS ${new Date(w.seenAt).toLocaleTimeString()}` : ''}${w.phone ? `<br><a href="tel:${w.phone}">${w.phone}</a>` : ''}`).addTo(g)
      if (!w.stale) pts.push([w.lat, w.lng])
    }
    if (!fitted.current && pts.length) { m.fitBounds(L.latLngBounds(pts).pad(0.2)); fitted.current = true }
  }, [data])

  const n = (s: string) => data?.workers.filter((w) => w.state === s && !w.stale).length ?? 0
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '10px 14px', fontSize: 12.5, color: 'var(--muted)' }}>
        <b style={{ color: 'var(--text)' }}>Live map</b>
        <span><i style={dot(W_COLOR.online)} /> Free ({n('online')})</span>
        <span><i style={dot(W_COLOR.busy)} /> On a job ({n('busy')})</span>
        <span><i style={dot(W_COLOR.offline)} /> Offline</span>
        <span><i style={dot('#f59e0b')} /> Waiting for expert ({data?.jobs.filter((j) => j.status === 'confirmed').length ?? 0})</span>
        <span><i style={dot('#2e90fa')} /> In service ({data?.jobs.filter((j) => j.status !== 'confirmed').length ?? 0})</span>
      </div>
      <div ref={el} style={{ height: 420 }} />
    </div>
  )
}
const dot = (c: string): React.CSSProperties => ({ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: c, marginRight: 4, verticalAlign: 'middle' })
