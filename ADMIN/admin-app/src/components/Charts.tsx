// Dependency-free SVG charts (line, bar, donut) tuned for the admin theme.

const VIOLET = '#5b51e8'
const GREEN = '#16a34a'

// smooth path through points (Catmull-Rom → cubic bezier)
function smooth(pts: [number, number][]) {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`
  }
  return d
}

export function LineChart({ data, keys = ['total', 'completed'], colors = [VIOLET, GREEN], height = 200 }: {
  data: Record<string, number>[]; keys?: string[]; colors?: string[]; height?: number
}) {
  const w = 640, h = height, pad = 28
  const max = Math.max(1, ...data.flatMap((d) => keys.map((k) => d[k] || 0)))
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1)
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2)
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        {keys.map((k, ki) => (
          <linearGradient key={k} id={`lg-${ki}-${colors[ki].slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={colors[ki]} stopOpacity="0.22" />
            <stop offset="1" stopColor={colors[ki]} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)} stroke="#eceaf6" strokeDasharray={g === 1 ? '0' : '4 6'} />
      ))}
      {keys.map((k, ki) => {
        const pts = data.map((d, i) => [x(i), y(d[k] || 0)] as [number, number])
        const path = smooth(pts)
        const area = `${path} L ${x(data.length - 1)},${h - pad} L ${x(0)},${h - pad} Z`
        return (
          <g key={k}>
            <path d={area} fill={`url(#lg-${ki}-${colors[ki].slice(1)})`} />
            <path d={path} fill="none" stroke={colors[ki]} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
            {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d[k] || 0)} r={3.4} fill="#fff" stroke={colors[ki]} strokeWidth={2.2} />)}
          </g>
        )
      })}
      {data.map((d, i) => {
        const step = Math.ceil(data.length / 8)
        if (i % step !== 0 && i !== data.length - 1) return null
        return <text key={i} x={x(i)} y={h - 8} textAnchor="middle" className="axis">{d.day ?? d.date ?? ''}</text>
      })}
    </svg>
  )
}

export function BarChart({ data, valueKey = 'revenue', labelKey = 'day', color = VIOLET, height = 200 }: {
  data: Record<string, any>[]; valueKey?: string; labelKey?: string; color?: string; height?: number
}) {
  const w = 640, h = height, pad = 28
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0))
  const bw = (w - pad * 2) / data.length
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="bargrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7c6df7" />
          <stop offset="1" stopColor="#5b51e8" />
        </linearGradient>
      </defs>
      {[0.5, 1].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)} stroke="#eceaf6" strokeDasharray={g === 1 ? '0' : '4 6'} />
      ))}
      {data.map((d, i) => {
        const bh = ((d[valueKey] || 0) / max) * (h - pad * 2)
        return (
          <g key={i}>
            <rect x={pad + i * bw + bw * 0.22} y={h - pad - bh} width={bw * 0.56} height={Math.max(0, bh)} rx={6} fill="url(#bargrad)" />
            {(i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) && <text x={pad + i * bw + bw * 0.5} y={h - 8} textAnchor="middle" className="axis">{d[labelKey]}</text>}
          </g>
        )
      })}
    </svg>
  )
}

export function Donut({ data, size = 180 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = Math.max(1, data.reduce((s, d) => s + d.value, 0))
  const r = size / 2 - 16, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef0f7" strokeWidth={16} />
        {data.map((d, i) => {
          const frac = d.value / total
          const dash = `${frac * C} ${C}`
          const off = -acc * C
          acc += frac
          return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={16}
            strokeDasharray={dash} strokeDashoffset={off} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="round" />
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="donut-total">{total.toLocaleString('en-IN')}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="donut-cap">Total</text>
      </svg>
      <div className="legend">
        {data.map((d, i) => (
          <div key={i} className="legend-row">
            <span className="dot" style={{ background: d.color }} />
            <span className="legend-label">{d.label}</span>
            <span className="legend-val">{d.value.toLocaleString('en-IN')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
