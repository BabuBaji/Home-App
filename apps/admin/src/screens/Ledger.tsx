import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, ArrowDownLeft, ArrowUpRight, Scale, Repeat } from 'lucide-react'
import { fetchLedger, fetchZones, type LedgerData, type Zone } from '../api'
import { Card, StatCard, Loading, Dropdown, SearchBox, Pagination, useToast } from '../components/UI'

/* Finance ▸ Ledger — every money movement in one list, newest first: customer payments, refunds
 * (card/UPI and wallet), customer-wallet credits and wallet-paid bookings, expert earnings,
 * incentives, advances, deductions and bank payouts. IN = the company receives, OUT = it pays or
 * owes; "settles" rows move money already counted (a bank payout of earnings already listed) and
 * stay out of the totals so nothing is counted twice. Limited to the viewer's territory. */
const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN')
const istDay = (off = 0) => new Date(Date.now() + 330 * 60000 + off * 86400000).toISOString().slice(0, 10)
const PRESETS: [string, string, () => [string, string]][] = [
  ['today', 'Today', () => [istDay(), istDay()]],
  ['7d', 'Last 7 days', () => [istDay(-6), istDay()]],
  ['30d', 'Last 30 days', () => [istDay(-29), istDay()]],
  ['month', 'This month', () => [istDay().slice(0, 8) + '01', istDay()]],
  ['90d', 'Last 90 days', () => [istDay(-89), istDay()]],
]
const DIR_STYLE: Record<string, { fg: string; label: string }> = { in: { fg: '#15803d', label: 'In' }, out: { fg: '#b91c1c', label: 'Out' }, settle: { fg: '#64748b', label: 'Settles' } }

export default function Ledger() {
  const nav = useNavigate()
  const toast = useToast()
  const [preset, setPreset] = useState('month')
  const [[from, to], setRange] = useState<[string, string]>(() => PRESETS[3][2]())
  const [type, setType] = useState('')
  const [zone, setZone] = useState('')
  const [q, setQ] = useState('')
  const [zones, setZones] = useState<Zone[]>([])
  const [d, setD] = useState<LedgerData | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => { fetchZones().then(setZones).catch(() => {}) }, [])
  useEffect(() => { setD(null); setPage(1); fetchLedger(from, to, type, zone).then(setD).catch((e: Error) => toast(e.message)) }, [from, to, type, zone])
  useEffect(() => setPage(1), [q])
  const pick = (k: string) => { const p = PRESETS.find((x) => x[0] === k); if (p) { setPreset(k); setRange(p[2]()) } }

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (d?.rows || []).filter((r) => !s || [r.party, r.ref, r.note, r.label, r.zone].some((v) => String(v || '').toLowerCase().includes(s)))
  }, [d, q])
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize)

  const exportCsv = () => {
    const head = ['Date', 'Type', 'Direction', 'Party', 'Party type', 'Zone', 'City', 'Reference', 'Method', 'Details', 'In', 'Out', 'Settles']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [head.join(',')]
    rows.forEach((r) => lines.push([new Date(r.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), r.label, DIR_STYLE[r.dir]?.label, r.party, r.partyType, r.zone, r.city, r.ref, r.method, r.note,
      r.dir === 'in' ? r.amount : '', r.dir === 'out' ? r.amount : '', r.dir === 'settle' ? r.amount : ''].map(esc).join(',')))
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })); a.download = `ledger-${from}_to_${to}.csv`; a.click()
  }

  const t = d?.totals
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ width: 150 }}><Dropdown value={preset} width="100%" onChange={pick} options={[...PRESETS.map(([k, l]) => ({ value: k, label: l })), { value: 'custom', label: 'Custom range' }]} /></div>
        <input type="date" className="input" style={{ maxWidth: 160 }} value={from} max={to} onChange={(e) => e.target.value && (setPreset('custom'), setRange([e.target.value, to]))} />
        <span className="muted">to</span>
        <input type="date" className="input" style={{ maxWidth: 160 }} value={to} min={from} onChange={(e) => e.target.value && (setPreset('custom'), setRange([from, e.target.value]))} />
        <div style={{ width: 210 }}>
          <Dropdown value={type} width="100%" onChange={setType} options={[
            { value: '', label: 'All types' }, { value: 'in', label: '↙ All money in' }, { value: 'out', label: '↗ All money out' }, { value: 'settle', label: '⇄ Settlements' },
            ...(d?.kinds || []).map((k) => ({ value: k.kind, label: k.label })),
          ]} />
        </div>
        <div style={{ width: 190 }}>
          <Dropdown value={zone} width="100%" onChange={setZone} options={[{ value: '', label: 'All zones' }, ...zones.map((z) => ({ value: String(z.id), label: `${z.name} · ${z.city}` })), { value: 'none', label: 'No zone' }]} />
        </div>
        <button className="btn line" style={{ marginLeft: 'auto' }} onClick={exportCsv} disabled={!d}><Download size={15} /> Export</button>
      </div>

      {!d || !t ? <Loading /> : (<>
        <div className="stat-row">
          <StatCard icon={<ArrowDownLeft size={20} />} tint="#16a34a" label="Money in" value={inr(t.in)} sub="payments, wallet-paid bookings, deductions" />
          <StatCard icon={<ArrowUpRight size={20} />} tint="#dc2626" label="Money out" value={inr(t.out)} sub="refunds, credits, expert earnings, advances" />
          <StatCard icon={<Scale size={20} />} tint="#5b51e8" label="Net" value={<span style={{ color: t.net < 0 ? '#b91c1c' : '#15803d' }}>{inr(t.net)}</span>} sub={`${t.count} entries`} />
          <StatCard icon={<Repeat size={20} />} tint="#64748b" label="Paid out to expert banks" value={inr(t.settled)} sub="settles earnings above — not counted again" />
        </div>

        <Card>
          <div className="card-head lg" style={{ gap: 10, flexWrap: 'wrap' }}>
            <h3>Ledger<span className="count">{rows.length.toLocaleString('en-IN')}</span></h3>
            <div style={{ flex: '1 1 260px', maxWidth: 420 }}><SearchBox value={q} onChange={setQ} placeholder="Search name, reference, booking, details…" /></div>
          </div>
          {rows.length === 0 ? <p className="muted" style={{ margin: 0 }}>No money movements in this period.</p> : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Date</th><th>Type</th><th>Party</th><th>Zone</th><th>Reference</th><th>Details</th><th className="num">In</th><th className="num">Out</th></tr></thead>
              <tbody>{pageRows.map((r) => {
                const st = DIR_STYLE[r.dir] || DIR_STYLE.settle
                return (
                  <tr key={r.key}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</td>
                    <td><span style={{ color: st.fg, fontWeight: 700, fontSize: 11, marginRight: 6 }}>{r.dir === 'in' ? '↙' : r.dir === 'out' ? '↗' : '⇄'}</span>{r.label}{r.method && r.partyType === 'customer' ? <div className="muted" style={{ fontSize: 11 }}>{r.method.toUpperCase()}</div> : null}</td>
                    <td>
                      {r.workerId ? <span className="link" onClick={() => nav(`/workers/${r.workerId}`)}>{r.party}</span>
                        : r.customerId ? <span className="link" onClick={() => nav(`/customers/${r.customerId}`)}>{r.party}</span> : r.party}
                      <div className="muted" style={{ fontSize: 11 }}>{r.partyType === 'expert' ? 'Expert' : 'Customer'}</div>
                    </td>
                    <td>{r.zone}{r.city !== '—' && <div className="muted" style={{ fontSize: 11 }}>{r.city}</div>}</td>
                    <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{r.ref || '—'}</td>
                    <td style={{ maxWidth: 280, fontSize: 12.5 }}>{r.note || '—'}</td>
                    <td className="num" style={{ color: '#15803d', fontWeight: 700 }}>{r.dir === 'in' ? inr(r.amount) : ''}</td>
                    <td className="num" style={{ color: r.dir === 'out' ? '#b91c1c' : '#64748b', fontWeight: 700 }}>{r.dir === 'out' ? inr(r.amount) : r.dir === 'settle' ? <span title="Settles money already counted">({inr(r.amount)})</span> : ''}</td>
                  </tr>
                )
              })}</tbody>
            </table></div>
          )}
          {rows.length > 0 && <Pagination page={page} pageSize={pageSize} total={rows.length} noun="entries" onPage={setPage} onSize={(n) => { setPageSize(n); setPage(1) }} />}
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.6 }}>
            <b>In</b> — customer payments (card/UPI), bookings paid from the customer wallet, deductions and fines recovered from experts.
            <b> Out</b> — refunds, wallet credits and bonuses given to customers, expert job earnings, incentives and advances.
            Amounts in brackets <b>settle</b> money already listed (e.g. an expert’s bank payout of earnings credited earlier) and are not added to the totals.
          </p>
        </Card>
      </>)}
    </div>
  )
}
