import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Flame, Circle as CircleIco, Building2 } from 'lucide-react'
import { type Zone } from './store'

/**
 * Interactive operational map (Screen 13) — real OSM tiles via Leaflet (no API key).
 * Plots every apartment as a cluster-coloured pin, each zone's coverage radius, and a
 * toggleable demand heat overlay, with zone/cluster filters. Vector markers only
 * (circleMarker) so there are no broken default-icon assets under the bundler.
 */
export function ZoneMap({ zones }: { zones: Zone[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [zoneFilter, setZoneFilter] = useState('all')
  const [showHeat, setShowHeat] = useState(true)
  const [showCoverage, setShowCoverage] = useState(true)

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = L.map(ref.current, { zoomControl: true, attributionControl: false }).setView([17.44, 78.39], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    mapRef.current = map
    layerRef.current = L.layerGroup().addTo(map)
    // Leaflet needs a size recalc once its container has real dimensions.
    setTimeout(() => map.invalidateSize(), 200)
    return () => { map.remove(); mapRef.current = null; layerRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const shown = zones.filter((z) => zoneFilter === 'all' || z.id === zoneFilter)
    const pts: L.LatLngExpression[] = []
    shown.forEach((z) => {
      if (showCoverage) {
        L.circle([z.lat, z.lng], { radius: z.radiusKm * 1000, color: '#4F46E5', weight: 1.5, fillColor: '#4F46E5', fillOpacity: 0.05, dashArray: '6 6' })
          .bindTooltip(`${z.name} · ${z.radiusKm}km`, { permanent: false }).addTo(layer)
      }
      z.apartments.forEach((a) => {
        pts.push([a.lat, a.lng])
        const cluster = z.clusters.find((c) => c.id === a.clusterId)
        const color = cluster?.color || '#7C3AED'
        if (showHeat) L.circle([a.lat, a.lng], { radius: 240 + a.occupied * 1.5, stroke: false, fillColor: '#EF4444', fillOpacity: 0.10 }).addTo(layer)
        L.circleMarker([a.lat, a.lng], { radius: 6 + Math.min(8, a.occupied / 40), color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
          .bindPopup(
            `<b>${a.name || 'Apartment'}</b><br>${z.name} · ${cluster?.name || 'Unassigned'}<br>` +
            `${a.occupied}/${a.flats} occupied · AOV ₹${a.aov}` +
            (a.siteId ? `<br>✅ worker site #${a.siteId}` : '<br>⚠️ not synced'),
          ).addTo(layer)
      })
    })
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3))
  }, [zones, zoneFilter, showHeat, showCoverage])

  const legendClusters = zones.filter((z) => zoneFilter === 'all' || z.id === zoneFilter).flatMap((z) => z.clusters)
  return (
    <div className="zo-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="zo-panel-h" style={{ padding: '14px 16px', marginBottom: 0 }}>
        <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Building2 size={17} style={{ color: 'var(--zv)' }} /> Operational Map</h3>
        <div className="row" style={{ gap: 8 }}>
          <select className="zo-mini" style={{ width: 150, textAlign: 'left' }} value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
            <option value="all">All zones</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name || 'Untitled'}</option>)}
          </select>
          <button className={'zo-btn ' + (showHeat ? '' : 'line')} onClick={() => setShowHeat((v) => !v)}><Flame size={15} /> Heatmap</button>
          <button className={'zo-btn ' + (showCoverage ? '' : 'line')} onClick={() => setShowCoverage((v) => !v)}><CircleIco size={15} /> Coverage</button>
        </div>
      </div>
      <div ref={ref} style={{ height: 560, width: '100%', background: '#eef0f4' }} />
      <div className="row" style={{ gap: 16, padding: '12px 16px', borderTop: '1px solid var(--zline)', flexWrap: 'wrap' }}>
        {legendClusters.map((c, i) => (
          <span key={c.id + i} className="row" style={{ gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--zmut)', fontWeight: 600 }}>
            <i style={{ width: 10, height: 10, borderRadius: 50, background: c.color, display: 'inline-block' }} />{c.name}
          </span>
        ))}
        <span className="row" style={{ gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--zmut)', fontWeight: 600 }}>
          <i style={{ width: 10, height: 10, borderRadius: 50, background: 'rgba(239,68,68,.4)', display: 'inline-block' }} />Demand heat
        </span>
      </div>
    </div>
  )
}
