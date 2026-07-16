import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Phone, MessageSquare, MapPin, Star, CheckCircle2, BadgeCheck,
  Briefcase, XCircle, Wallet, ShieldAlert, Zap, Activity as ActivityIcon,
  Clock, Wifi, BatteryMedium, CalendarClock, Download, Gift, Eye, Info as InfoIcon, Landmark, Smartphone, SlidersHorizontal,
} from 'lucide-react'
import { fetchWorkerDetail, fetchZones, updateWorker, addWorkerNote, fetchWorkerWallet, workerDocUrl, reviewWorkerDoc, reviewWorkerSkill, type Zone } from '../api'
import type { WorkerDetail, WorkerNote, WalletState, WalletTxn, WalletWithdrawal } from '../types'
import { Card, Badge, Avatar, Loading, ErrorState, useToast, shortDate, Dropdown, Pagination, SearchBox, Modal } from '../components/UI'
import { useStore } from '../store'
import WorkerApproval from './WorkerApproval'
import WorkerAvailability from './WorkerAvailability'

const rupee = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`

type EarnTab = 'overview' | 'txns' | 'payouts' | 'incentives' | 'deductions'
const EARN_TABS: [EarnTab, string][] = [
  ['overview', 'Payment Overview'], ['txns', 'Transactions'], ['payouts', 'Payment History'],
  ['incentives', 'Incentives & Bonuses'], ['deductions', 'Deductions'],
]

function StripCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ flex: '1 1 120px', minWidth: 0, padding: '2px 14px', borderLeft: '1px solid var(--line,#eef0f4)' }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: tone || 'var(--ink,#101828)', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
}

function Info({ label, value, verified }: { label: string; value: ReactNode; verified?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '5px 0' }}>
      <span style={{ color: 'var(--muted,#667085)', fontSize: 12.5 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, textAlign: 'right', display: 'flex', gap: 6, alignItems: 'center' }}>
        {value}{verified && <BadgeCheck size={14} color="#16a34a" />}
      </span>
    </div>
  )
}

function Kpi({ label, value, sub, tone, trend, invert }: { label: string; value: ReactNode; sub?: string; tone?: string; trend?: number | null; invert?: boolean }) {
  const t = trend ?? null
  const good = t == null || t === 0 ? null : (invert ? t < 0 : t > 0)
  return (
    <div style={{ minWidth: 0, background: 'var(--card,#fff)', border: '1px solid var(--line,#eef0f4)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 10.5, lineHeight: 1.2, color: 'var(--muted,#667085)', marginBottom: 5, minHeight: 25, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: tone, whiteSpace: 'nowrap' }}>{value}</div>
      {t != null && t !== 0 && <div style={{ fontSize: 10.5, marginTop: 2, color: good ? '#16a34a' : '#dc2626' }}>{t > 0 ? '▲' : '▼'} {Math.abs(t)}</div>}
      {sub && <div style={{ fontSize: 10.5, color: 'var(--muted,#98a2b3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

/** One item in the status strip (icon + label + value). */
function StatusItem({ icon, label, value, sub }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minWidth: 0 }}>
      <span style={{ color: 'var(--muted,#98a2b3)', marginTop: 2, display: 'flex' }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10.5, color: 'var(--muted,#98a2b3)' }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
        {sub && <div style={{ fontSize: 10.5, color: 'var(--muted,#98a2b3)' }}>{sub}</div>}
      </div>
    </div>
  )
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ fontSize: 13, letterSpacing: 0.3, color: 'var(--muted,#475467)', textTransform: 'uppercase' }}>{title}</strong>
        {action}
      </div>
      {children}
    </Card>
  )
}

/** Inline SVG line+area chart for the earnings trend (no external chart lib). */
function TrendChart({ points }: { points: { date: string; amount: number }[] }) {
  if (!points.length) return <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>No completed-job earnings yet.</div>
  const W = 460, H = 120, pad = 8
  const max = Math.max(...points.map((p) => p.amount), 1)
  const step = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0
  const xy = points.map((p, i) => [pad + i * step, H - pad - (p.amount / max) * (H - pad * 2)] as const)
  const line = xy.map(([x, y]) => `${x},${y}`).join(' ')
  const area = `${pad},${H - pad} ${line} ${pad + (points.length - 1) * step},${H - pad}`
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        <polygon points={area} fill="rgba(91,81,232,.12)" />
        <polyline points={line} fill="none" stroke="#5b51e8" strokeWidth={2} />
        {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.5} fill="#5b51e8" />)}
      </svg>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 10.5, color: 'var(--muted,#98a2b3)', marginTop: 2 }}>
        <span>{points[0].date.slice(5)}</span><span>{points[points.length - 1].date.slice(5)}</span>
      </div>
    </div>
  )
}

/** Circular risk gauge for the worker-health score. */
function RiskDonut({ score, level }: { score: number; level: string }) {
  const r = 34, c = 2 * Math.PI * r
  const color = level === 'Low' ? '#16a34a' : level === 'Medium' ? '#d97706' : '#dc2626'
  return (
    <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0 }}>
      <svg width={92} height={92} viewBox="0 0 92 92">
        <circle cx={46} cy={46} r={r} fill="none" stroke="var(--line,#eef0f4)" strokeWidth={8} />
        <circle cx={46} cy={46} r={r} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 46 46)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color }}>{score}%</div>
        <div style={{ fontSize: 10, color: 'var(--muted,#98a2b3)' }}>{level} Risk</div>
      </div>
    </div>
  )
}
function RiskRow({ label, value, pct }: { label: string; value: number; pct?: boolean }) {
  const tone = value < 15 ? 'green' : value < 35 ? 'amber' : 'red'
  return (
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
      <span style={{ fontSize: 12.5, color: 'var(--muted,#667085)' }}>{label}</span>
      {pct
        ? <span style={{ fontSize: 13, fontWeight: 600, color: value < 15 ? '#16a34a' : value < 35 ? '#d97706' : '#dc2626' }}>{value}%</span>
        : <Badge tone={tone} dot={false}>{value < 15 ? 'Low' : value < 35 ? 'Medium' : 'High'}</Badge>}
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = { completed: '#16a34a', inProgress: '#3b82f6', noShow: '#f59e0b', cancelled: '#ef4444' }
const SERVICE_PALETTE = ['#5b51e8', '#f59e0b', '#06b6d4', '#10b981', '#94a3b8', '#ec4899']

/** Multi-segment SVG donut with a centred total. */
function DonutChart({ segments, total, colorFor, centerValue, centerLabel }: { segments: { count: number }[]; total: number; colorFor: (i: number) => string; centerValue?: string; centerLabel?: string }) {
  const r = 52, cx = 68, cy = 68, C = 2 * Math.PI * r
  let acc = 0
  return (
    <svg width={136} height={136} viewBox="0 0 136 136" style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line,#eef0f4)" strokeWidth={15} />
      {total > 0 && segments.map((s, i) => {
        const len = (s.count / total) * C
        const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={colorFor(i)} strokeWidth={15} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform={`rotate(-90 ${cx} ${cy})`} />
        acc += len
        return el
      })}
      <text x={cx} y={cy - 1} textAnchor="middle" fontSize={centerValue ? 18 : 24} fontWeight={700} fill="var(--ink,#101828)">{centerValue ?? total}</text>
      <text x={cx} y={cy + 15} textAnchor="middle" fontSize={10.5} fill="var(--muted,#98a2b3)">{centerLabel ?? 'Total Jobs'}</text>
    </svg>
  )
}
function LegendRow({ color, label, count, pct }: { color: string; label: string; count: number; pct: number }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13, gap: 8 }}>
      <span className="row" style={{ gap: 8, alignItems: 'center', minWidth: 0 }}>
        <span style={{ width: 9, height: 9, borderRadius: 9, background: color, display: 'inline-block', flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </span>
      <span style={{ color: 'var(--muted,#667085)', whiteSpace: 'nowrap' }}><strong style={{ color: 'var(--ink,#101828)' }}>{count}</strong> ({pct}%)</span>
    </div>
  )
}
function Delta({ v, invert }: { v: number | null; invert?: boolean }) {
  if (v == null || v === 0) return null
  const good = invert ? v < 0 : v > 0
  return <span style={{ fontSize: 11.5, color: good ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{v > 0 ? '▲' : '▼'} {Math.abs(v)}</span>
}
function MetricRow({ label, value, delta, invert, last }: { label: string; value: ReactNode; delta?: number | null; invert?: boolean; last?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: last ? 'none' : '1px solid var(--line,#f1f2f6)', fontSize: 13 }}>
      <span style={{ color: 'var(--muted,#667085)' }}>{label}</span>
      <span className="row" style={{ gap: 10, alignItems: 'center' }}><strong>{value}</strong><Delta v={delta ?? null} invert={invert} /></span>
    </div>
  )
}
function PerfTile({ label, value, sub, subTone }: { label: string; value: ReactNode; sub?: string; subTone?: string }) {
  return (
    <div style={{ border: '1px solid var(--line,#eef0f4)', borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: 'var(--muted,#667085)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, marginTop: 3, color: subTone || 'var(--muted,#98a2b3)', fontWeight: 600 }}>{sub}</div>}
    </div>
  )
}

const jobTone = (s: string) => s === 'completed' ? 'green' : s === 'cancelled' ? 'red' : 'blue'
const TABS = [['overview', 'Overview'], ['jobs', 'Jobs & Performance'], ['earnings', 'Earnings & Payouts'], ['docs', 'Documents'], ['skills', 'Skills & Services'], ['avail', 'Availability'], ['approval', 'Approval & Go Live'], ['notes', 'Notes & Activity']] as const

export default function WorkerDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { admin } = useStore()
  const [w, setW] = useState<WorkerDetail | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [err, setErr] = useState('')
  const [notes, setNotes] = useState<WorkerNote[]>([])
  const [noteText, setNoteText] = useState('')
  const [tab, setTab] = useState<string>('overview')
  const [wal, setWal] = useState<WalletState | null>(null)
  const [earnTab, setEarnTab] = useState<EarnTab>('overview')
  const [earnPage, setEarnPage] = useState(1)
  const [earnSize, setEarnSize] = useState(10)
  const [earnFrom, setEarnFrom] = useState('')
  const [earnTo, setEarnTo] = useState('')
  const [earnType, setEarnType] = useState('all')
  const [earnStatus, setEarnStatus] = useState('all')
  const [earnQuery, setEarnQuery] = useState('')
  const [incView, setIncView] = useState<WalletTxn | null>(null)
  const [payView, setPayView] = useState<WalletWithdrawal | null>(null)
  const [docBusy, setDocBusy] = useState<number | null>(null)
  const [skillBusy, setSkillBusy] = useState<string | null>(null)
  // Advanced filters, behind the "Filters" toggle.
  const [showFilters, setShowFilters] = useState(false)
  const [earnMin, setEarnMin] = useState('')
  const [earnMax, setEarnMax] = useState('')
  const [earnSource, setEarnSource] = useState('all')
  const [earnDir, setEarnDir] = useState<'all' | 'credit' | 'debit'>('all')
  const [earnMethod, setEarnMethod] = useState('all')

  const load = () => { setErr(''); fetchWorkerDetail(Number(id)).then((d) => { setW(d); setNotes(d.notes || []) }).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [id])
  useEffect(() => { fetchZones().then(setZones).catch(() => {}) }, [])
  useEffect(() => { if (tab === 'earnings' && !wal && id) fetchWorkerWallet(Number(id)).then(setWal).catch(() => {}) }, [tab, wal, id])
  const submitNote = async () => {
    const text = noteText.trim(); if (!text || !w) return
    try { const n = await addWorkerNote(w.id, text, admin?.name || 'Admin'); setNotes([n, ...notes]); setNoteText('') }
    catch (e) { toast((e as Error).message) }
  }

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!w) return <Loading />

  const m = w.metrics
  const bank = w.profile?.bank
  const bv = w.profile?.bankVerification
  const p = w.profile?.personal || {}
  const zoneName = zones.find((z) => z.id === w.zone_id)?.name || '—'
  const onDuty = !!w.available
  const dev = w.device || {}
  const badges = [
    ...(w.verified ? ['Verified'] : []),
    ...((w.rating || 0) >= 4.7 ? ['Top Performer'] : []),
    w.jobs >= 500 ? '500+ Jobs' : `${w.jobs}+ Jobs`,
    ...(w.services || []).slice(0, 1),
  ]
  const act = async (patch: Record<string, unknown>, msg: string) => { try { await updateWorker(w.id, patch); toast(msg); load() } catch (e) { toast((e as Error).message) } }

  /* ---- KYC document review ---- */
  // The signed URL is short-lived, so fetch it on click and open immediately — never hold it in
  // state, or a stale tab would hand out an expired (or long-lived) link to an identity document.
  const openDoc = async (docId: number) => {
    setDocBusy(docId)
    try { const r = await workerDocUrl(w.id, docId); window.open(r.url, '_blank', 'noopener,noreferrer') }
    catch (e) { toast((e as Error).message) } finally { setDocBusy(null) }
  }
  /* Approving a skill is what makes the worker dispatchable for it — the claim alone never does.
     `level` lets the admin approve at a different level than claimed; that's the point of a review. */
  const reviewSkill = async (service: string, approve: boolean, level?: string) => {
    let lvl = level
    let reason = ''
    if (approve && !lvl) {
      lvl = (window.prompt(`Approve "${service}" at which level?\nBeginner / Intermediate / Advanced / Expert`, claimed[service]?.level || 'Beginner') || '').trim()
      if (!lvl) return
    }
    if (!approve) {
      reason = (window.prompt(`Why is "${service}" not approved? The worker sees this.`) || '').trim()
      if (!reason) return
    }
    setSkillBusy(service)
    try {
      await reviewWorkerSkill(w.id, service, approve, lvl, reason)
      toast(approve ? `${service} approved — they can now be assigned this work` : `${service} removed`)
      load()
    } catch (e) { toast((e as Error).message) } finally { setSkillBusy(null) }
  }

  const reviewDoc = async (docId: number, approve: boolean) => {
    // The server rejects a reasonless rejection, so ask for one here rather than round-trip to fail.
    let reason = ''
    if (!approve) {
      reason = (window.prompt('Why is this document being rejected? The worker sees this message.') || '').trim()
      if (!reason) return
    }
    setDocBusy(docId)
    try { await reviewWorkerDoc(w.id, docId, approve, reason); toast(approve ? 'Document verified' : 'Document rejected'); load() }
    catch (e) { toast((e as Error).message) } finally { setDocBusy(null) }
  }
  const grid3: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }
  const softBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--card,#fff)', border: '1px solid var(--line,#e4e7ec)', color: 'var(--violet,#5b51e8)', padding: '9px 15px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
  const dateInput: CSSProperties = { border: '1px solid var(--line,#e4e7ec)', background: 'var(--card,#fff)', borderRadius: 9, padding: '8px 10px', fontSize: 12.5, color: 'var(--ink,#101828)', fontFamily: 'inherit', cursor: 'pointer' }
  // The table is borderCollapse:separate (for the rounded header band), so row separators live on
  // the cells — a border on <tr> would not paint.
  const td: CSSProperties = { padding: '11px 12px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--line-2,#f4f4fa)' }
  const show = (t: string) => tab === 'overview' || tab === t

  // ---- Jobs & Performance: Recent Jobs is a preview only; "View All" deep-links to Bookings ----
  const jp = w.jobsPerformance
  const ACTIVE_STS = ['confirmed', 'worker_assigned', 'accepted', 'on_the_way', 'on the way', 'travelling', 'arrived', 'in_progress', 'in progress', 'started']
  const statusTone = (s: string) => s === 'completed' ? 'green' : s === 'cancelled' ? 'red' : ACTIVE_STS.includes(String(s).toLowerCase()) ? 'amber' : 'gray'
  const prettyStatus = (s: string) => String(s || '—').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const jobsPreview = jp ? jp.jobs.slice(0, 5) : []
  const viewAllJobs = () => nav(`/bookings?worker=${encodeURIComponent(w.name)}`)

  // ---- Earnings & Payouts (real data from the wallet ledger) ----
  // Everything here is derived client-side: the wallet endpoint returns the worker's full ledger in
  // one unpaginated call and accepts no date/type/status params, so the range + filters run locally.
  const ws = wal?.walletSummary || w.wallet
  const allTxns = wal?.history || []
  const allPayouts = wal?.withdrawals || []
  const paidWd = allPayouts.filter((x) => x.status === 'Paid')
  const lastPayout = paidWd[0] || null
  const lastMethod = (paidWd[0]?.method || allPayouts[0]?.method || '').toLowerCase()
  const payoutMethod = lastMethod === 'upi' ? 'UPI' : lastMethod === 'bank' ? 'Bank Transfer' : (w.profile?.bank?.bankAccount ? 'Bank Transfer' : w.profile?.bank?.bankUpi ? 'UPI' : '—')
  // Ledger categories → the three buckets on the summary strip. TOTAL by design: every credit
  // category maps to exactly one bucket, so Base + Incentives + Bonuses − Deductions always equals
  // Net. An unmapped category falls to its own cell rather than silently vanishing from the strip.
  const BUCKET: Record<string, string> = {
    'Job Earnings': 'Base Earnings', 'Min Guarantee': 'Base Earnings', Compensation: 'Base Earnings',
    Incentive: 'Incentives', Referral: 'Incentives',
    Bonus: 'Bonuses', 'Sitara Bonus': 'Bonuses',
  }
  const bucketOf = (t: string) => BUCKET[t] || t || 'Other'
  const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0)
  const inEarnRange = (d: string) => (!earnFrom || d >= earnFrom) && (!earnTo || d <= earnTo) // dates are ISO, so string compare is date compare

  // The section date range scopes every panel below it.
  const rangeTxns = allTxns.filter((h) => inEarnRange(h.date))
  const rangePayouts = allPayouts.filter((x) => inEarnRange(x.date))
  // A salary advance is a credit but not an earning — it's recovered from future income, so it must not inflate Net.
  const earnCredits = rangeTxns.filter((h) => h.isCredit && h.type !== 'Salary Advance')
  const dedTxns = rangeTxns.filter((h) => !h.isCredit && h.type !== 'Withdrawal')
  const incTxns = rangeTxns.filter((h) => h.isCredit && ['Incentives', 'Bonuses'].includes(bucketOf(h.type)))
  const catSums: Record<string, number> = {}
  for (const h of earnCredits) { const k = bucketOf(h.type); catSums[k] = (catSums[k] || 0) + h.amount }
  const dedTotal = sum(dedTxns)
  const netEarn = sum(earnCredits) - dedTotal
  const HEAD_CATS = ['Base Earnings', 'Incentives', 'Bonuses']
  const earnStripCells = [
    { label: 'Base Earnings', value: rupee(catSums['Base Earnings'] || 0) },
    { label: 'Incentives', value: rupee(catSums.Incentives || 0) },
    { label: 'Bonuses', value: rupee(catSums.Bonuses || 0) },
    ...Object.entries(catSums).filter(([k]) => !HEAD_CATS.includes(k)).map(([k, v]) => ({ label: k, value: rupee(v) })),
    { label: 'Deductions', value: dedTotal ? `− ${rupee(dedTotal)}` : rupee(0), tone: '#dc2626' },
    { label: 'Net Earnings', value: rupee(netEarn), tone: '#16a34a' },
    { label: 'Paid Amount', value: rupee(sum(rangePayouts.filter((x) => x.status === 'Paid'))) },
    { label: 'Pending Amount', value: rupee(sum(rangePayouts.filter((x) => ['Pending', 'Processing'].includes(x.status)))), tone: '#f59e0b' },
  ]

  /* ---- Incentives & Bonuses tab ---- */
  const incOnly = incTxns.filter((h) => bucketOf(h.type) === 'Incentives')
  const bonusOnly = incTxns.filter((h) => bucketOf(h.type) === 'Bonuses')
  const incTotal = sum(incOnly)
  const bonusTotal = sum(bonusOnly)
  const incEarned = incTotal + bonusTotal
  // No approval workflow exists — every incentive is credited the moment it's earned — so there is
  // deliberately no "Pending Approval" cell here, and no paid/unpaid split (nothing links an income
  // row to a payout).
  const incStripCells = [
    { label: 'Total Incentives', value: rupee(incTotal), tone: '#16a34a' },
    { label: 'Total Bonuses', value: rupee(bonusTotal), tone: '#5b51e8' },
    { label: 'Total Earned', value: rupee(incEarned) },
    { label: 'Incentives', value: String(incOnly.length) },
    { label: 'Bonuses', value: String(bonusOnly.length) },
  ]
  const INC_COLORS: Record<string, string> = { Incentives: '#16a34a', Bonuses: '#5b51e8' }
  const incSegs = [{ label: 'Incentives', amount: incTotal }, { label: 'Bonuses', amount: bonusTotal }].filter((s) => s.amount > 0)
  // Top earners, grouped by label — the same incentive recurs across jobs, so group rather than list.
  const topIncMap: Record<string, number> = {}
  for (const h of incTxns) { const k = h.remarks || h.refId || h.type; topIncMap[k] = (topIncMap[k] || 0) + h.amount }
  const topInc = Object.entries(topIncMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const isIncTab = earnTab === 'incentives'
  const isPayoutTab = earnTab === 'payouts'
  const isDedTab = earnTab === 'deductions'

  /* ---- Deductions tab ---- */
  const dedAmounts = dedTxns.map((h) => h.amount)
  const dedStats = {
    total: dedTotal,
    count: dedTxns.length,
    avg: dedTxns.length ? Math.round((dedTotal / dedTxns.length) * 100) / 100 : 0,
    high: dedAmounts.length ? Math.max(...dedAmounts) : 0,
    low: dedAmounts.length ? Math.min(...dedAmounts) : 0,
  }
  const dedCatMap: Record<string, number> = {}
  for (const h of dedTxns) { const k = h.type || 'Deduction'; dedCatMap[k] = (dedCatMap[k] || 0) + h.amount }
  const dedSegs = Object.entries(dedCatMap).sort((a, b) => b[1] - a[1]).map(([label, amount]) => ({ label, amount }))
  const DED_PALETTE = ['#5b51e8', '#f59e0b', '#ef4444', '#0ea5e9', '#ec4899', '#eab308', '#14b8a6', '#94a3b8']
  const dedColor = (i: number) => DED_PALETTE[i % DED_PALETTE.length]
  const dedStripCells = [
    { label: 'Total Deductions', value: rupee(dedStats.total), tone: '#dc2626' },
    { label: 'Records', value: String(dedStats.count) },
    { label: 'Average', value: rupee(dedStats.avg) },
    { label: 'Highest', value: rupee(dedStats.high) },
    { label: 'Lowest', value: rupee(dedStats.low) },
  ]

  /* ---- Payment History tab ---- */
  const payMethodLabel = (m: string) => (m || '').toLowerCase() === 'upi' ? 'UPI' : 'Bank Transfer'
  const paidRange = rangePayouts.filter((x) => x.status === 'Paid')
  const payStats = {
    total: sum(paidRange),
    ok: paidRange.length,
    failed: rangePayouts.filter((x) => ['Failed', 'Rejected'].includes(x.status)).length,
    pending: rangePayouts.filter((x) => ['Pending', 'Processing'].includes(x.status)).length,
    avg: paidRange.length ? Math.round((sum(paidRange) / paidRange.length) * 100) / 100 : 0,
  }
  // Grouped by the destination captured at payout time, so an old account still shows against the
  // payouts that actually went to it. Falls back to the method for rows predating that snapshot.
  const payMethodMap: Record<string, number> = {}
  for (const x of rangePayouts) { const k = x.destination || payMethodLabel(x.method); payMethodMap[k] = (payMethodMap[k] || 0) + 1 }
  const payMethods = Object.entries(payMethodMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const totalCredits = sum(rangeTxns.filter((h) => h.isCredit))
  const totalDebits = sum(rangeTxns.filter((h) => !h.isCredit))
  const payStripCells = [
    { label: 'Total Payouts', value: rupee(payStats.total), tone: '#16a34a' },
    { label: 'Successful', value: String(payStats.ok) },
    { label: 'Failed', value: String(payStats.failed), tone: payStats.failed ? '#dc2626' : undefined },
    { label: 'Pending', value: String(payStats.pending), tone: payStats.pending ? '#f59e0b' : undefined },
    { label: 'Average Payout', value: rupee(payStats.avg) },
  ]
  const stripCells = isIncTab ? incStripCells : isPayoutTab ? payStripCells : isDedTab ? dedStripCells : earnStripCells
  // Labels are written as "<what it was for> · <ref/period>", e.g. "On-time start · #HH18323" — split
  // on that separator so the row reads as a title with the job/period beneath it. No second sentence
  // of copy exists in the ledger, so the sub-line is the ref, not a description.
  const incParts = (h: { type: string; remarks: string; refId: string }) => {
    const p = (h.remarks || h.refId || '').split(' · ').filter(Boolean)
    return { title: p[0] || h.type, sub: p.slice(1).join(' · ') }
  }
  const incTitle = (h: typeof allTxns[number]) => incParts(h).title
  const incSubtitle = (h: typeof allTxns[number]) => incParts(h).sub

  // Withdrawals carry no label, only the gateway reference — describe them from their real method.
  // Everything else has a real label from the ledger ("Kitchen Cleaning · #HH10234").
  const txnDesc = (h: { type: string; method: string; remarks: string; refId: string }) =>
    h.type === 'Withdrawal' ? `Payout to ${h.method === 'upi' ? 'UPI' : 'Bank Account'}` : (h.remarks || h.refId || '—')
  // The wallet's status/type vocabulary is the worker app's contract (WalletScreens.kt matches on it
  // exactly), so rename for display here rather than at the source.
  const TYPE_LABEL: Record<string, string> = { Withdrawal: 'Payout' }
  const typeLabel = (t: string) => TYPE_LABEL[t] || t || '—'
  const STATUS_LABEL: Record<string, string> = { Success: 'Completed', Debited: 'Completed', Approved: 'Completed' }
  const statusLabel = (s: string) => STATUS_LABEL[s] || s || '—'
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()
  // Filter options come from the rows the tab actually shows — otherwise Deductions would offer
  // "Job Earnings" as a type, and picking it would empty the table.
  const tabSource = isIncTab ? incTxns : isDedTab ? dedTxns : rangeTxns
  const earnTypeOpts = uniq(tabSource.map((h) => typeLabel(h.type)))
  const earnStatusOpts = uniq((isPayoutTab ? rangePayouts : tabSource).map((r) => statusLabel(r.status)))
  const hit = (q: string, ...fields: (string | undefined)[]) => !q || fields.some((f) => (f || '').toLowerCase().includes(q))
  const q = earnQuery.trim().toLowerCase()
  // Advanced filters — all of these run over the already-loaded ledger, same as the basic ones.
  const earnSourceOpts = uniq(tabSource.map((h) => h.source || 'System'))
  const minAmt = Number(earnMin) || 0
  const maxAmt = Number(earnMax) || Infinity
  const inAmt = (n: number) => n >= minAmt && n <= maxAmt
  const advTxn = (h: typeof allTxns[number]) => inAmt(h.amount)
    && (earnSource === 'all' || (h.source || 'System') === earnSource)
    && (earnDir === 'all' || (earnDir === 'credit') === h.isCredit)
  const txnRows = (src: typeof allTxns) => src.filter((h) => (earnType === 'all' || typeLabel(h.type) === earnType) && (earnStatus === 'all' || statusLabel(h.status) === earnStatus) && hit(q, typeLabel(h.type), txnDesc(h), statusLabel(h.status), h.reference) && advTxn(h))
  const earnRows: (typeof allTxns[number] | typeof allPayouts[number])[] =
    earnTab === 'payouts' ? rangePayouts.filter((x) => (earnStatus === 'all' || statusLabel(x.status) === earnStatus) && hit(q, x.method, x.reference, x.utr, x.destination, x.payoutId, x.status) && inAmt(x.amount) && (earnMethod === 'all' || (x.method || '').toLowerCase() === earnMethod))
      : earnTab === 'incentives' ? txnRows(incTxns)
        : earnTab === 'deductions' ? txnRows(dedTxns)
          : txnRows(rangeTxns)
  // Count only the ADVANCED ones, so the Filters button can badge how many are hidden in the panel.
  const advCount = [earnMin, earnMax].filter(Boolean).length + (earnSource !== 'all' ? 1 : 0) + (earnDir !== 'all' ? 1 : 0) + (earnMethod !== 'all' ? 1 : 0)
  const earnFilterOn = !!(earnType !== 'all' || earnStatus !== 'all' || q || advCount)
  const resetEarnFilters = () => {
    setEarnType('all'); setEarnStatus('all'); setEarnQuery(''); setEarnPage(1)
    setEarnMin(''); setEarnMax(''); setEarnSource('all'); setEarnDir('all'); setEarnMethod('all')
  }
  // Quick range presets — the panel's date shortcuts write the same range the header inputs use.
  const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
  const RANGE_PRESETS: [string, () => void][] = [
    ['Today', () => { setEarnFrom(isoDaysAgo(0)); setEarnTo(isoDaysAgo(0)) }],
    ['Last 7 days', () => { setEarnFrom(isoDaysAgo(6)); setEarnTo(isoDaysAgo(0)) }],
    ['Last 30 days', () => { setEarnFrom(isoDaysAgo(29)); setEarnTo(isoDaysAgo(0)) }],
    ['This month', () => { setEarnFrom(isoDaysAgo(0).slice(0, 8) + '01'); setEarnTo(isoDaysAgo(0)) }],
    ['All time', () => { setEarnFrom(''); setEarnTo('') }],
  ]
  const earnPages = Math.max(1, Math.ceil(earnRows.length / earnSize))
  const curEarnPage = Math.min(earnPage, earnPages)
  // Payment Overview shows a preview only; the dedicated sub-tabs paginate. Mirrors Recent Jobs on the Jobs tab.
  const earnPageRows = earnTab === 'overview' ? earnRows.slice(0, 5) : earnRows.slice((curEarnPage - 1) * earnSize, curEarnPage * earnSize)
  // No statement endpoint exists — every other admin "Export" builds CSV from loaded state, so this does too.
  const downloadStatement = () => {
    const head = isPayoutTab ? ['Payment Date', 'Time', 'Payout ID', 'Amount', 'Payment Method', 'Paid To', 'Status', 'UTR', 'Gateway Reference']
      : isDedTab ? ['Date', 'Time', 'Deduction ID', 'Type', 'Description', 'Amount', 'Status', 'Applied By']
        : ['Date', 'Time', 'Type', 'Description', 'Amount', 'Credit/Debit', 'Status', 'Reference ID', 'Source']
    const rows = isPayoutTab
      ? (earnRows as typeof allPayouts).map((x) => [x.date, x.time, x.payoutId, x.amount, payMethodLabel(x.method), x.destination, x.status, x.utr, x.reference])
      : isDedTab
        ? (earnRows as typeof allTxns).map((h) => [h.date, h.time, h.reference, h.type, h.remarks || h.refId, h.amount, statusLabel(h.status), h.source || 'System'])
        : (earnRows as typeof allTxns).map((h) => [h.date, h.time, typeLabel(h.type), txnDesc(h), h.amount, h.isCredit ? 'Credit' : 'Debit', statusLabel(h.status), h.reference, h.source || 'System'])
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `worker-${w.id}-${earnTab}${earnFrom || earnTo ? `-${earnFrom || 'start'}_${earnTo || 'today'}` : ''}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const liveOpPanel = (
    <Panel title="Live Operation" action={w.liveJob && <button className="btn ghost" onClick={() => nav('/bookings')}>View Job</button>}>
      {w.liveJob ? (
        <div className="grid" style={{ gap: 4 }}>
          <Info label="Current Status" value={<Badge tone="blue" dot={false}>{w.liveJob.status}</Badge>} />
          <Info label="Job Ref" value={w.liveJob.ref} />
          <Info label="Service" value={w.liveJob.service} />
          <Info label="Location" value={w.liveJob.apartment || '—'} />
          <Info label="Amount" value={rupee(w.liveJob.total)} />
          <Info label="OTP Status" value={<Badge tone={w.liveJob.otpStatus === 'Set' ? 'green' : 'amber'} dot={false}>{w.liveJob.otpStatus}</Badge>} />
        </div>
      ) : <div className="muted" style={{ fontSize: 13, padding: '12px 0' }}>No active job right now.</div>}
    </Panel>
  )
  // The list the server owns, so the panel can show what hasn't been uploaded at all — an absent
  // Police Verification is the thing an admin needs to chase, and it has no row to render.
  const docTypes = w.documentTypes || []
  const byName = new Map((w.documents || []).map((d) => [d.name, d]))
  const missingRequired = docTypes.filter((t) => t.required && !byName.has(t.name))
  const requiredDone = docTypes.filter((t) => t.required && byName.get(t.name)?.status === 'Verified').length
  const requiredTotal = docTypes.filter((t) => t.required).length

  const documentsPanel = (
    <Panel
      title={`Documents (${requiredTotal ? `${requiredDone}/${requiredTotal} verified` : (w.documents?.length ?? 0)})`}
      action={missingRequired.length > 0 ? <Badge tone="red" dot={false}>{missingRequired.length} missing</Badge> : undefined}
    >
      {(w.documents && w.documents.length > 0) ? w.documents.map((d) => (
        <div key={d.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--line-2,#f4f4fa)' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
              {d.fileName && <div className="muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fileName}{d.sizeBytes ? ` · ${Math.max(1, Math.round(d.sizeBytes / 1024))} KB` : ''}</div>}
            </span>
            <span className="row" style={{ gap: 8, alignItems: 'center', flexShrink: 0 }}>
              {/* Only offer View when a file actually exists — rows written before the storage
                  pipeline have no object behind them, and a preview that 404s is worse than none. */}
              {d.hasFile && (
                <button onClick={() => openDoc(d.id)} disabled={docBusy === d.id} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--violet,#5b51e8)', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Eye size={13} /> View
                </button>
              )}
              <Badge tone={d.status === 'Verified' ? 'green' : d.status === 'Rejected' || d.status === 'Expired' ? 'red' : 'amber'} dot={false}>{d.status || 'Pending'}</Badge>
            </span>
          </div>
          {d.status === 'Rejected' && d.rejectReason && (
            <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 2 }}>Rejected: {d.rejectReason}</div>
          )}
          {d.status === 'Verified' && d.reviewedBy && (
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>Verified by {d.reviewedBy}{d.reviewedAt ? ` · ${shortDate(String(d.reviewedAt).slice(0, 10))}` : ''}</div>
          )}
          {d.hasFile && d.status !== 'Verified' && (
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <button className="btn line" style={{ padding: '4px 10px', fontSize: 12 }} disabled={docBusy === d.id} onClick={() => reviewDoc(d.id, true)}>Approve</button>
              <button className="btn line" style={{ padding: '4px 10px', fontSize: 12, color: '#dc2626' }} disabled={docBusy === d.id} onClick={() => reviewDoc(d.id, false)}>Reject</button>
            </div>
          )}
        </div>
      )) : <div className="muted" style={{ fontSize: 13, padding: '10px 0' }}>No documents uploaded.</div>}
      {/* Required types with no row at all. Listing only what was uploaded hides the gap. */}
      {missingRequired.map((t) => (
        <div key={t.name} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--line-2,#f4f4fa)' }}>
          <span style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted,#667085)' }}>{t.name}</div>
            {t.hint && <div className="muted" style={{ fontSize: 11.5 }}>{t.hint}</div>}
          </span>
          <Badge tone="gray" dot={false}>Not uploaded</Badge>
        </div>
      ))}
    </Panel>
  )
  /* Skills the worker CLAIMED (profile.skills) vs services they're actually approved for
     (w.services — what dispatch matches on). Approving is what promotes one into the other, so the
     panel is built from the claims, not from the live set. Legacy skillLevels rows have no claim. */
  const claimed = (w.profile?.skills || {}) as Record<string, { level?: string; years?: string; status?: string; reason?: string; certificate?: { fileName?: string } | null }>
  const claimNames = Object.keys(claimed)
  const liveServices = w.services || []
  const skillRows = [...new Set([...claimNames, ...liveServices])]
  const pendingSkills = claimNames.filter((s) => claimed[s]?.status === 'Pending').length
  const lvlTone = (l?: string) => l === 'Expert' ? 'green' : l === 'Advanced' ? 'blue' : l === 'Intermediate' ? 'amber' : 'gray'

  const skillsPanel = (
    <Panel
      title={`Skills & Services (${liveServices.length} approved)`}
      action={pendingSkills > 0 ? <Badge tone="amber" dot={false}>{pendingSkills} to review</Badge> : undefined}
    >
      {skillRows.length > 0 ? skillRows.map((s) => {
        const c = claimed[s]
        const live = liveServices.includes(s)
        const lvl = c?.level || w.profile?.skillLevels?.[s]
        return (
          <div key={s} style={{ padding: '7px 0', borderBottom: '1px solid var(--line-2,#f4f4fa)' }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {c ? `Claims ${c.level}${c.years ? ` · ${c.years} yr${c.years === '1' ? '' : 's'}` : ''}${c.certificate?.fileName ? ' · certificate attached' : ''}` : 'Assigned by admin'}
                </div>
              </span>
              <span className="row" style={{ gap: 6, alignItems: 'center', flexShrink: 0 }}>
                {lvl && <Badge tone={lvlTone(lvl)} dot={false}>{lvl}</Badge>}
                {/* "Live" = dispatch can actually send them this work. That's the fact that matters. */}
                <Badge tone={live ? 'green' : c?.status === 'Rejected' ? 'red' : 'gray'} dot={false}>
                  {live ? 'Live' : c?.status === 'Rejected' ? 'Rejected' : c?.status === 'Pending' ? 'In review' : 'Not live'}
                </Badge>
              </span>
            </div>
            {c?.status === 'Rejected' && c.reason && <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 2 }}>Rejected: {c.reason}</div>}
            {c && c.status !== 'Approved' && (
              <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center' }}>
                <button className="btn line" style={{ padding: '4px 10px', fontSize: 12 }} disabled={skillBusy === s} onClick={() => reviewSkill(s, true, c.level)}>Approve as {c.level}</button>
                <button className="btn line" style={{ padding: '4px 10px', fontSize: 12 }} disabled={skillBusy === s} onClick={() => reviewSkill(s, true)}>Approve at…</button>
                <button className="btn line" style={{ padding: '4px 10px', fontSize: 12, color: '#dc2626' }} disabled={skillBusy === s} onClick={() => reviewSkill(s, false)}>Reject</button>
              </div>
            )}
            {c?.status === 'Approved' && live && (
              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                <button className="btn line" style={{ padding: '4px 10px', fontSize: 12, color: '#dc2626' }} disabled={skillBusy === s} onClick={() => reviewSkill(s, false)}>Revoke</button>
              </div>
            )}
          </div>
        )
      }) : <span className="muted" style={{ fontSize: 13 }}>None assigned.</span>}
    </Panel>
  )
  const recentJobsPanel = (
    <Panel title={`Recent Jobs (${w.recentJobs?.length ?? 0})`} action={<button className="btn ghost" onClick={() => nav('/bookings')}>View All</button>}>
      {(w.recentJobs && w.recentJobs.length > 0) ? w.recentJobs.map((j) => (
        <div key={j.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
          <span style={{ fontSize: 12.5 }}>{j.ref} · {j.service}{j.date ? ` · ${j.date}` : ''}</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>{rupee(j.total)}</span>
            <Badge tone={jobTone(j.status)} dot={false}>{j.status}</Badge>
          </span>
        </div>
      )) : <div className="muted" style={{ fontSize: 13, padding: '10px 0' }}>No recent jobs.</div>}
    </Panel>
  )
  const timelinePanel = (
    <Panel title="Job Timeline">
      {(w.timeline && w.timeline.length > 0) ? (
        <div className="grid" style={{ gap: 0 }}>
          {w.timeline.map((t, i) => (
            <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 9, height: 9, borderRadius: 9, background: '#5b51e8', marginTop: 4 }} />
                {i < w.timeline!.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 20, background: 'var(--line,#e4e7ec)' }} />}
              </div>
              <div style={{ paddingBottom: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{t.detail || t.action}</div>
                <div className="muted" style={{ fontSize: 11 }}>{t.created ? new Date(t.created).toLocaleString() : ''}</div>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="muted" style={{ fontSize: 13, padding: '10px 0' }}>No timeline events for the latest job.</div>}
    </Panel>
  )
  const earningsTrendPanel = (
    <Panel title="Earnings Trend" action={<button className="btn ghost" onClick={() => nav('/worker-wallet')}>Full Earnings</button>}>
      <TrendChart points={w.earningsTrend || []} />
    </Panel>
  )
  const activityPanel = (
    <Panel title="Activity Feed">
      {(w.activity && w.activity.length > 0) ? w.activity.map((a) => (
        <div key={a.id} className="row" style={{ gap: 8, alignItems: 'flex-start', padding: '4px 0' }}>
          <ActivityIcon size={13} style={{ marginTop: 3, color: 'var(--muted,#98a2b3)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12.5 }}>{a.detail || a.action}</div>
            <div className="muted" style={{ fontSize: 11 }}>{a.created ? new Date(a.created).toLocaleString() : ''}</div>
          </div>
        </div>
      )) : <div className="muted" style={{ fontSize: 13, padding: '10px 0' }}>No activity recorded.</div>}
    </Panel>
  )
  const notesPanel = (
    <Panel title="Admin Notes">
      <div className="grid" style={{ gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === 'Enter') submitNote() }} />
          <button className="btn" onClick={submitNote}>Add</button>
        </div>
        {notes.length > 0 ? notes.map((n) => (
          <div key={n.id} style={{ borderLeft: '3px solid var(--violet,#5b51e8)', paddingLeft: 10 }}>
            <div style={{ fontSize: 13 }}>{n.note}</div>
            <div className="muted" style={{ fontSize: 11 }}>{n.author || 'Admin'}{n.created ? ` · ${shortDate(n.created)}` : ''}</div>
          </div>
        )) : <div className="muted" style={{ fontSize: 13 }}>No notes yet.</div>}
      </div>
    </Panel>
  )
  const availabilityPanel = (
    <Panel title="Weekly Availability">
      {(() => {
        const av = w.profile?.availability
        // The worker app sends 'Mon'…'Sun'; looking up 'Monday' made every day render as Off.
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        if (!av || !av.availableDays) return <div className="muted" style={{ fontSize: 13, padding: '8px 0' }}>Not set by the worker yet.</div>
        return (
          <div className="grid" style={{ gap: 4 }}>
            {days.map((d) => {
              const on = !!av.availableDays?.[d]
              return (
                <div key={d} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>{d}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {on && av.shiftStart && <span className="muted" style={{ fontSize: 12 }}>{av.shiftStart} – {av.shiftEnd}</span>}
                    <Badge tone={on ? 'green' : 'gray'} dot={false}>{on ? 'Available' : 'Off'}</Badge>
                  </span>
                </div>
              )
            })}
          </div>
        )
      })()}
    </Panel>
  )

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* Breadcrumb + title + actions */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <button onClick={() => nav('/workers')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--violet,#5b51e8)', fontWeight: 600, fontSize: 13, padding: 0, marginBottom: 6 }}><ChevronLeft size={16} /> Back to Worker List</button>
          <h2 style={{ margin: 0, display: 'flex', gap: 10, alignItems: 'center' }}>Worker Details <Badge tone={onDuty ? 'green' : 'gray'} dot={false}>{onDuty ? 'On Duty' : 'Off Duty'}</Badge></h2>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button style={softBtn} onClick={() => toast(`Call ${w.phone || ''}`)}><Phone size={15} /> Call Worker</button>
          <button style={softBtn} onClick={() => toast('Messaging is not wired yet')}><MessageSquare size={15} /> Send Message</button>
          <button className="btn" onClick={() => setTab('notes')}>More Actions</button>
        </div>
      </div>

      {/* Top: worker card (left) + status strip & KPI tiles (right) — matches the mock */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(330px, 360px) 1fr', gap: 16, alignItems: 'stretch' }}>
        <Card>
          {/* Left: avatar + rating + Worker ID · Right: name/status/badges/action */}
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, alignItems: 'flex-start' }}>
              <Avatar name={w.name} src={w.avatar} size={100} />
              <div>
                <div className="row" style={{ gap: 5, alignItems: 'center', fontSize: 14 }}>
                  <Star size={15} fill="#f59e0b" stroke="#f59e0b" /> <strong>{w.rating || '—'}</strong> <span className="muted" style={{ fontSize: 13 }}>({w.jobs} reviews)</span>
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4, whiteSpace: 'nowrap' }}>Worker ID: WKR{String(w.id).padStart(4, '0')}</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: 20, lineHeight: 1.15 }}>{w.name}</strong>{w.verified && <BadgeCheck size={17} color="#2563eb" />}
              </div>
              <div><Badge tone={onDuty ? 'green' : 'gray'} dot={false}>{onDuty ? 'On Duty' : 'Off Duty'}</Badge></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {badges.map((b) => (
                  <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(91,81,232,.10)', color: 'var(--violet,#5b51e8)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {b === 'Verified' ? <BadgeCheck size={13} /> : b === 'Top Performer' ? <Star size={12} fill="currentColor" /> : b.includes('Jobs') ? <Briefcase size={12} /> : <Zap size={12} />}
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16, height: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: '14px 10px', paddingBottom: 12, borderBottom: '1px solid var(--line,#eef0f4)' }}>
            <StatusItem icon={<span style={{ width: 9, height: 9, borderRadius: 9, background: onDuty ? '#16a34a' : '#98a2b3', display: 'inline-block', marginTop: 3 }} />} label="Current Status" value={w.liveJob ? w.liveJob.status : (onDuty ? 'Available' : 'Offline')} />
            <StatusItem icon={<Briefcase size={14} />} label="Current Job" value={w.liveJob ? w.liveJob.ref : '—'} sub={w.liveJob?.service} />
            <StatusItem icon={<MapPin size={14} />} label="Zone" value={zoneName} />
            <StatusItem icon={<CalendarClock size={14} />} label="Last Seen" value={dev.lastSeen ? new Date(dev.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} />
            <StatusItem icon={<BatteryMedium size={14} />} label="Battery" value={dev.battery != null ? `${dev.battery}%` : '—'} />
            <StatusItem icon={<Wifi size={14} />} label="Network" value={dev.network || '—'} />
            <StatusItem icon={<MapPin size={14} />} label="Last GPS" value={w.last_lat != null ? `${Number(w.last_lat).toFixed(2)}, ${Number(w.last_lng).toFixed(2)}` : '—'} />
            <StatusItem icon={<Clock size={14} />} label="Idle Time" value={dev.idleMins != null ? `${dev.idleMins} min` : '—'} />
          </div>
          {tab === 'earnings' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, paddingTop: 12 }}>
              <Kpi label="Today's Earnings" value={rupee(ws?.todayEarnings)} tone="#7c3aed" />
              <Kpi label="Week's Earnings" value={rupee(ws?.weekEarnings)} />
              <Kpi label="Month's Earnings" value={rupee(ws?.monthEarnings)} />
              <Kpi label="Total Earnings" value={rupee(ws?.totalEarned ?? w.earnings)} />
              <Kpi label="Pending Payout" value={rupee(ws?.hold)} tone={(ws?.hold ?? 0) > 0 ? '#d97706' : undefined} />
              <Kpi label="Last Payout" value={lastPayout ? rupee(lastPayout.amount) : '—'} sub={lastPayout?.date} />
              <Kpi label="Available" value={rupee(ws?.available ?? w.balance)} tone="#16a34a" sub="Withdrawable" />
            </div>
          ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: 8, paddingTop: 12 }}>
            <Kpi label="Today's Jobs" value={m?.todayJobs ?? 0} sub={`Completed: ${m?.completedToday ?? 0}`} />
            <Kpi label="Weekly Jobs" value={m?.weekJobs ?? 0} sub={`Completed: ${m?.completedWeek ?? 0}`} trend={m?.trends?.weekJobs} />
            <Kpi label="Monthly Jobs" value={m?.monthJobs ?? 0} sub={`Completed: ${m?.completedMonth ?? 0}`} />
            <Kpi label="Acceptance Rate" value={`${m?.acceptanceRate ?? 0}%`} tone="#16a34a" />
            <Kpi label="Cancellation" value={`${m?.cancellationPct ?? 0}%`} tone={(m?.cancellationPct ?? 0) > 10 ? '#dc2626' : undefined} trend={m?.trends?.cancellation} invert />
            <Kpi label="On Time" value={m?.onTimeSamples ? `${m?.onTimePct ?? 0}%` : '—'} tone={!m?.onTimeSamples ? undefined : (m.onTimePct ?? 0) >= 80 ? '#16a34a' : (m.onTimePct ?? 0) >= 50 ? '#d97706' : '#dc2626'} sub={m?.onTimeSamples ? `${m.onTimeSamples} check-in${m.onTimeSamples === 1 ? '' : 's'}` : undefined} />
            <Kpi label="Avg Rating" value={<span>{w.rating || '—'} <Star size={12} fill="#f59e0b" stroke="#f59e0b" style={{ verticalAlign: -1 }} /></span>} trend={m?.trends?.rating} />
            <Kpi label="Today's Earnings" value={rupee(m?.todayEarnings)} tone="#7c3aed" />
          </div>
          )}
          </div>
        </Card>
      </div>

      {/* Tab bar — sticky while scrolling */}
      <div className="row" style={{ gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--line,#e4e7ec)', position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg,#f5f5fb)', paddingTop: 6 }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', fontSize: 13,
            fontWeight: tab === key ? 700 : 500, color: tab === key ? 'var(--violet,#5b51e8)' : 'var(--muted,#667085)',
            borderBottom: tab === key ? '2px solid var(--violet,#5b51e8)' : '2px solid transparent',
          }}>{label}</button>
        ))}
      </div>

      {show('overview') && (
        <div style={grid3}>
          {liveOpPanel}
          <Panel title="AI Worker Health">
            {w.health ? (
              <>
                <div className="row" style={{ gap: 14, alignItems: 'center' }}>
                  <RiskDonut score={w.health.riskScore} level={w.health.level} />
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <RiskRow label="Attendance Risk" value={w.health.attendanceRisk} />
                    <RiskRow label="Burnout Risk" value={w.health.burnoutRisk} />
                    <RiskRow label="Late Probability" value={w.health.lateProbability} pct />
                    <RiskRow label="Complaint Probability" value={w.health.complaintProbability} pct />
                  </div>
                </div>
                <div style={{ marginTop: 10, background: 'var(--soft,#f6f7fb)', borderRadius: 10, padding: 10, fontSize: 12, display: 'flex', gap: 8 }}>
                  <ShieldAlert size={15} style={{ flexShrink: 0, color: 'var(--muted,#98a2b3)', marginTop: 1 }} />
                  <span><strong>Suggested action:</strong> {w.health.suggestion}</span>
                </div>
                <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>Heuristic score from cancellations, completion, rating &amp; workload — not ML.</div>
              </>
            ) : <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>No data.</div>}
          </Panel>
          <Panel title="Quick Actions">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button className="btn" onClick={() => nav('/roster')}><Zap size={14} /> Assign Job</button>
              <button className="btn" onClick={() => nav('/workers')}><MapPin size={14} /> Change Zone</button>
              <button className="btn" onClick={() => nav('/worker-wallet')}><Wallet size={14} /> Wallet</button>
              <button className="btn" onClick={() => toast('Messaging not wired')}><MessageSquare size={14} /> Message</button>
              <button className="btn" onClick={() => act({ status: 'active', verified: true }, 'Worker approved')}><CheckCircle2 size={14} /> Approve</button>
              <button className="btn danger" onClick={() => act({ status: 'suspended' }, 'Worker suspended')}><XCircle size={14} /> Suspend</button>
            </div>
          </Panel>
          <Panel title="Bank & Payout" action={<Badge tone={w.bank_status === 'Verified' ? 'green' : w.bank_status === 'Rejected' ? 'red' : 'amber'} dot={false}>{w.bank_status || 'Pending'}</Badge>}>
            <Info label="Available" value={rupee(w.wallet?.available ?? w.balance)} />
            <Info label="Lifetime Earned" value={rupee(w.wallet?.totalEarned ?? w.earnings)} />
            <Info label="On Hold" value={rupee(w.wallet?.hold)} />
            <Info label="Withdrawn" value={rupee(w.wallet?.totalWithdrawn)} />
          </Panel>
        </div>
      )}

      {(show('overview')) && (
        <div style={grid3}>
          <Panel title="Personal Information">
            <Info label="Full Name" value={w.name} />
            {p.gender && <Info label="Gender" value={p.gender} />}
            {p.dob && <Info label="Date of Birth" value={p.dob} />}
            {p.fatherName && <Info label="Father's Name" value={p.fatherName} />}
            {p.address && <Info label="Address" value={p.address} />}
            {p.aadhaar && <Info label="Aadhaar" value={`XXXX XXXX ${String(p.aadhaar).slice(-4)}`} />}
            {p.pan && <Info label="PAN" value={p.pan} />}
            <Info label="City" value={w.city || '—'} />
            <Info label="Zone" value={zoneName} />
            <Info label="Joined On" value={shortDate(w.joined)} />
            {!(p.gender || p.dob || p.address) && <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Add personal &amp; KYC details via Edit Worker.</div>}
          </Panel>
          <Panel title="Contact Information">
            <Info label="Mobile Number" value={w.phone || '—'} verified={w.verified} />
            {p.whatsapp && <Info label="WhatsApp" value={p.whatsapp} />}
            <Info label="Email" value={w.email || '—'} verified={w.verified} />
            {(p.emergencyName || p.emergencyPhone) && <Info label="Emergency Contact" value={`${p.emergencyName || ''}${p.emergencyPhone ? ` · ${p.emergencyPhone}` : ''}`} />}
            {p.languages && <Info label="Languages Known" value={p.languages} />}
            <Info label="Last Location" value={w.last_lat != null ? `${Number(w.last_lat).toFixed(4)}, ${Number(w.last_lng).toFixed(4)}` : '—'} />
          </Panel>
          <Panel title="Bank Details" action={<Badge tone={w.bank_status === 'Verified' ? 'green' : w.bank_status === 'Rejected' ? 'red' : 'amber'} dot={false}>{w.bank_status || 'Pending'}</Badge>}>
            {bank?.bankAccount ? (
              <>
                <Info label="Bank Name" value={bank.bankName || '—'} />
                <Info label="Account Number" value={`••••${String(bank.bankAccount).slice(-4)}`} verified={w.bank_status === 'Verified'} />
                <Info label="IFSC Code" value={bank.bankIfsc || '—'} />
                {bank.bankUpi && <Info label="UPI ID" value={bank.bankUpi} />}
                {bv?.registeredName && <Info label="Registered Name" value={bv.registeredName} />}
              </>
            ) : <div className="muted" style={{ fontSize: 13, padding: '10px 0' }}>No bank account added.</div>}
          </Panel>
        </div>
      )}

      {(show('docs') || show('skills')) && (
        <div style={grid3}>
          {(show('docs')) && documentsPanel}
          {(show('skills')) && skillsPanel}
        </div>
      )}

      {/* Phase 12. Reloads the worker on success so the header's status pill follows the go-live. */}
      {tab === 'approval' && <WorkerApproval workerId={Number(id)} onChanged={load} />}

      {tab === 'overview' && <div style={grid3}>{timelinePanel}{recentJobsPanel}</div>}

      {tab === 'jobs' && jp && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 16 }}>
            <Panel title="Job Performance Summary">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 10 }}>
                <PerfTile label="Total Jobs" value={jp.summary.totalJobs} />
                <PerfTile label="Completed Jobs" value={jp.summary.completed} sub={`${jp.summary.completedPct}%`} subTone="#16a34a" />
                <PerfTile label="Cancelled Jobs" value={jp.summary.cancelled} sub={`${jp.summary.cancelledPct}%`} subTone="#ef4444" />
                <PerfTile label="No Show / Missed" value={jp.summary.noShow} sub={`${jp.summary.noShowPct}%`} subTone="#ef4444" />
                <PerfTile label="On Time Arrivals" value={jp.summary.onTimeArrivals} sub={`${jp.summary.onTimePct}%`} subTone="#16a34a" />
                <PerfTile label="Average Rating" value={<span>{jp.summary.avgRating || '—'} <Star size={14} fill="#f59e0b" stroke="#f59e0b" style={{ verticalAlign: -2 }} /></span>} />
                <PerfTile label="Total Earnings" value={rupee(jp.summary.totalEarnings)} />
              </div>
            </Panel>
            <Panel title="Performance Trend">
              {jp.trend.length ? <TrendChart points={jp.trend.map((t) => ({ date: t.date, amount: t.value }))} />
                : <div className="muted" style={{ fontSize: 13, padding: '24px 0', textAlign: 'center' }}>No completed-job history yet.</div>}
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>On-time completion % per active day.</div>
            </Panel>
          </div>

          <div style={grid3}>
            <Panel title="Jobs by Status (This Month)">
              <div className="row" style={{ gap: 16, alignItems: 'center' }}>
                <DonutChart segments={jp.byStatus.segments} total={jp.byStatus.total} colorFor={(i) => STATUS_COLORS[jp.byStatus.segments[i].key || ''] || '#94a3b8'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {jp.byStatus.segments.map((s) => <LegendRow key={s.key} color={STATUS_COLORS[s.key || ''] || '#94a3b8'} label={s.label || ''} count={s.count} pct={s.pct} />)}
                </div>
              </div>
            </Panel>
            <Panel title="Jobs by Service Type (This Month)">
              {jp.byService.segments.length ? (
                <div className="row" style={{ gap: 16, alignItems: 'center' }}>
                  <DonutChart segments={jp.byService.segments} total={jp.byService.total} colorFor={(i) => SERVICE_PALETTE[i % SERVICE_PALETTE.length]} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {jp.byService.segments.map((s, i) => <LegendRow key={s.service} color={SERVICE_PALETTE[i % SERVICE_PALETTE.length]} label={s.service || ''} count={s.count} pct={s.pct} />)}
                  </div>
                </div>
              ) : <div className="muted" style={{ fontSize: 13, padding: '24px 0', textAlign: 'center' }}>No jobs this month.</div>}
            </Panel>
            <Panel title="Performance Metrics">
              <MetricRow label="Acceptance Rate" value={`${jp.metrics.acceptanceRate}%`} delta={jp.metrics.acceptanceDelta} />
              <MetricRow label="On Time Arrival" value={`${jp.metrics.onTimeArrival}%`} delta={jp.metrics.onTimeDelta} />
              <MetricRow label="Cancellation Rate" value={`${jp.metrics.cancellationRate}%`} delta={jp.metrics.cancellationDelta} invert />
              <MetricRow label="Customer Rating" value={jp.metrics.customerRating || '—'} delta={jp.metrics.ratingDelta} />
              <MetricRow label="Jobs per Day (Avg)" value={jp.metrics.jobsPerDay} delta={jp.metrics.jobsPerDayDelta} />
              <MetricRow label="Earnings per Day (Avg)" value={rupee(jp.metrics.earningsPerDay)} delta={jp.metrics.earningsPerDayDelta} last />
            </Panel>
          </div>

          <Card>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 15 }}>Recent Jobs</strong>
              <button style={softBtn} onClick={viewAllJobs}>View All Bookings <ChevronRight size={15} /></button>
            </div>
            {jobsPreview.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>No jobs yet.</div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--muted,#667085)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        {['Job ID', 'Service', 'Customer', 'Date & Time', 'Amount', 'Status', 'On Time', 'Rating', 'Earnings'].map((h) => (
                          <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid var(--line,#eef0f4)', whiteSpace: 'nowrap', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {jobsPreview.map((j) => (
                        <tr key={j.id} style={{ borderBottom: '1px solid var(--line,#f4f5f8)', cursor: 'pointer' }} onClick={viewAllJobs}>
                          <td style={{ padding: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{j.ref}</td>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{j.service}</td>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{j.customer}</td>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap', color: 'var(--muted,#667085)' }}>{[j.date, j.time].filter(Boolean).join(', ') || '—'}</td>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{rupee(j.amount)}</td>
                          <td style={{ padding: '10px' }}><Badge tone={statusTone(j.status)} dot={false}>{prettyStatus(j.status)}</Badge></td>
                          <td style={{ padding: '10px' }}>{j.onTime === 'On Time' ? <Badge tone="green" dot={false}>On Time</Badge> : j.onTime === 'Late' ? <Badge tone="red" dot={false}>Late</Badge> : <span className="muted">—</span>}</td>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{j.rating ? <span>{j.rating} <Star size={12} fill="#f59e0b" stroke="#f59e0b" style={{ verticalAlign: -1 }} /></span> : <span className="muted">—</span>}</td>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap', fontWeight: 600 }}>{j.earnings ? rupee(j.earnings) : <span className="muted" style={{ fontWeight: 400 }}>₹0</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>Showing the {jobsPreview.length} most recent {jobsPreview.length === 1 ? 'job' : 'jobs'}{jp && jp.summary.totalJobs > jobsPreview.length ? ` of ${jp.summary.totalJobs}` : ''}.</span>
                  <button style={{ ...softBtn, color: 'var(--violet,#5b51e8)' }} onClick={viewAllJobs}>View all in Bookings <ChevronRight size={15} /></button>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {tab === 'overview' && <div style={grid3}>{earningsTrendPanel}
        <Panel title="Earnings Summary" action={<button style={softBtn} onClick={() => setTab('earnings')}>Details <ChevronRight size={15} /></button>}>
          <Info label="Available" value={rupee(w.wallet?.available ?? w.balance)} />
          <Info label="Lifetime Earned" value={rupee(w.wallet?.totalEarned ?? w.earnings)} />
          <Info label="This Week" value={rupee(w.wallet?.weekEarnings)} />
          <Info label="This Month" value={rupee(w.wallet?.monthEarnings)} />
          <Info label="On Hold" value={rupee(w.wallet?.hold)} />
          <Info label="Withdrawn" value={rupee(w.wallet?.totalWithdrawn)} />
        </Panel>
      </div>}

      {tab === 'earnings' && (
        <>
          {/* Sub-tabs left, date range + statement right. The range scopes every sub-tab, so it stays
              visible on all of them rather than hiding into one. */}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            {EARN_TABS.map(([k, label]) => (
              // Filter options differ per sub-tab, so clear them all on switch rather than carry a
              // stale one across — an advanced filter that no longer applies would still badge.
              <button key={k} onClick={() => { setEarnTab(k); setEarnPage(1); resetEarnFilters() }} className={'chip' + (earnTab === k ? ' active' : '')} style={{ cursor: 'pointer' }}>{label}</button>
            ))}
            <div className="tb-spacer" />
            <input type="date" value={earnFrom} max={earnTo || undefined} onChange={(e) => { setEarnFrom(e.target.value); setEarnPage(1) }} style={dateInput} aria-label="From date" />
            <span className="muted" style={{ fontSize: 12.5 }}>to</span>
            <input type="date" value={earnTo} min={earnFrom || undefined} onChange={(e) => { setEarnTo(e.target.value); setEarnPage(1) }} style={dateInput} aria-label="To date" />
            {(earnFrom || earnTo) && <button onClick={() => { setEarnFrom(''); setEarnTo(''); setEarnPage(1) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', fontSize: 13, fontWeight: 600, color: 'var(--violet,#5b51e8)' }}>All time</button>}
            <button style={softBtn} onClick={downloadStatement}><Download size={15} /> Download Statement</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.6fr) minmax(280px, 1fr)', gap: 16, alignItems: 'start' }}>
            <div className="grid" style={{ gap: 16 }}>
              <Card>
                <div className="row" style={{ alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 13.5, fontWeight: 800 }}>{isIncTab ? 'Incentives & Bonuses' : isPayoutTab ? 'Payment History' : isDedTab ? 'Deductions' : 'Earnings Summary'}</h3>
                  <span className="muted" style={{ fontSize: 12 }}>({earnFrom || earnTo ? `${earnFrom || 'start'} – ${earnTo || 'today'}` : 'All time'})</span>
                  {(isIncTab || isPayoutTab || isDedTab) && (
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      · {isIncTab ? 'Track all incentives and bonuses earned by the worker.' : isPayoutTab ? 'View all payments made to the worker.' : 'View all deductions applied to the worker.'}
                    </span>
                  )}
                </div>
                {!wal ? <Loading /> : (
                  <div className="row" style={{ flexWrap: 'wrap', rowGap: 14, marginLeft: -14 }}>
                    {stripCells.map((c) => <StripCell key={c.label} label={c.label} value={c.value} tone={c.tone} />)}
                  </div>
                )}
              </Card>

              <Card>
                <div className="row" style={{ alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: 13.5, fontWeight: 800, marginRight: 4 }}>{earnTab === 'overview' ? 'Recent Transactions' : EARN_TABS.find(([k]) => k === earnTab)![1]}</h3>
                  {/* Payouts have no transaction type, so that filter is txn-tabs only. */}
                  {!isPayoutTab && (
                    <Dropdown value={earnType} width={isDedTab ? 168 : 175} options={[{ value: 'all', label: isDedTab ? 'All Deduction Types' : isIncTab ? 'All Types' : 'All Transaction Types' }, ...earnTypeOpts.map((t) => ({ value: t, label: t }))]} onChange={(v) => { setEarnType(v); setEarnPage(1) }} />
                  )}
                  <Dropdown value={earnStatus} width={140} options={[{ value: 'all', label: 'All Status' }, ...earnStatusOpts.map((s) => ({ value: s, label: s }))]} onChange={(v) => { setEarnStatus(v); setEarnPage(1) }} />
                  <SearchBox className="sm" value={earnQuery} onChange={(v) => { setEarnQuery(v); setEarnPage(1) }} placeholder={isPayoutTab ? 'Search payouts…' : isDedTab ? 'Search deductions…' : isIncTab ? 'Search incentives or bonuses…' : 'Search transactions…'} />
                  {earnFilterOn && <button onClick={resetEarnFilters} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', fontSize: 13, fontWeight: 600, color: 'var(--violet,#5b51e8)' }}>Reset</button>}
                  <div className="tb-spacer" />
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    style={{ ...softBtn, padding: '8px 12px', fontSize: 12.5, borderColor: showFilters || advCount ? 'var(--violet,#5b51e8)' : 'var(--line,#e4e7ec)' }}
                  >
                    <SlidersHorizontal size={14} /> Filters
                    {advCount > 0 && <span style={{ background: 'var(--violet,#5b51e8)', color: '#fff', borderRadius: 99, fontSize: 10.5, fontWeight: 700, padding: '1px 6px' }}>{advCount}</span>}
                  </button>
                </div>

                {/* Advanced filters — everything here runs over the loaded ledger, no refetch. */}
                {showFilters && (
                  <div style={{ background: 'var(--bg,#f5f5fb)', border: '1px solid var(--line,#ededf6)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                    <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 5 }}>Quick range</div>
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          {RANGE_PRESETS.map(([label, apply]) => (
                            <button key={label} onClick={() => { apply(); setEarnPage(1) }} style={{ background: 'var(--card,#fff)', border: '1px solid var(--line,#e4e7ec)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--ink-2,#3a3650)' }}>{label}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 5 }}>Amount (₹)</div>
                        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                          <input type="number" min={0} placeholder="Min" value={earnMin} onChange={(e) => { setEarnMin(e.target.value); setEarnPage(1) }} style={{ ...dateInput, width: 84 }} />
                          <span className="muted" style={{ fontSize: 12 }}>to</span>
                          <input type="number" min={0} placeholder="Max" value={earnMax} onChange={(e) => { setEarnMax(e.target.value); setEarnPage(1) }} style={{ ...dateInput, width: 84 }} />
                        </div>
                      </div>
                      {isPayoutTab ? (
                        <div>
                          <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 5 }}>Payment method</div>
                          <Dropdown value={earnMethod} width={150} options={[{ value: 'all', label: 'All Payment Methods' }, { value: 'bank', label: 'Bank Transfer' }, { value: 'upi', label: 'UPI' }]} onChange={(v) => { setEarnMethod(v); setEarnPage(1) }} />
                        </div>
                      ) : (
                        <>
                          <div>
                            <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 5 }}>{isDedTab ? 'Applied by' : 'Approved by'}</div>
                            <Dropdown value={earnSource} width={150} options={[{ value: 'all', label: isDedTab ? 'Anyone' : 'Anyone' }, ...earnSourceOpts.map((s) => ({ value: s, label: s }))]} onChange={(v) => { setEarnSource(v); setEarnPage(1) }} />
                          </div>
                          {!isIncTab && !isDedTab && (
                            <div>
                              <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 5 }}>Direction</div>
                              <Dropdown value={earnDir} width={130} options={[{ value: 'all', label: 'Credits & debits' }, { value: 'credit', label: 'Credits only' }, { value: 'debit', label: 'Debits only' }]} onChange={(v) => { setEarnDir(v as typeof earnDir); setEarnPage(1) }} />
                            </div>
                          )}
                        </>
                      )}
                      <div className="tb-spacer" />
                      {advCount > 0 && (
                        <button onClick={() => { setEarnMin(''); setEarnMax(''); setEarnSource('all'); setEarnDir('all'); setEarnMethod('all'); setEarnPage(1) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', fontSize: 12.5, fontWeight: 600, color: 'var(--violet,#5b51e8)' }}>Clear filters</button>
                      )}
                    </div>
                  </div>
                )}
                {!wal ? <Loading /> : earnRows.length === 0 ? (
                  <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>
                    {earnFilterOn ? 'Nothing matches these filters.' : earnFrom || earnTo ? 'Nothing in this date range.' : isPayoutTab ? 'No payouts yet.' : 'No transactions yet.'}
                  </div>
                ) : (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      {/* borderCollapse: separate so the header band can take rounded end caps */}
                      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, minWidth: isPayoutTab || isDedTab ? 880 : 780 }}>
                        <thead>
                          <tr style={{ textAlign: 'left' }}>
                            {(isPayoutTab ? ['Payment Date', 'Payout ID', 'Amount', 'Payment Method', 'Paid To', 'Status', 'UTR / Reference No.', 'Action']
                              : isIncTab ? ['Date', 'Type', 'Title / Description', 'Amount', 'Status', 'Approved By', 'Action']
                                : isDedTab ? ['Date', 'Deduction ID', 'Type', 'Description', 'Amount', 'Status', 'Applied By', 'Action']
                                  : ['Date & Time', 'Type', 'Description', 'Amount', 'Status', 'Reference ID']).map((h, i, arr) => (
                              <th key={h} style={{
                                padding: '11px 12px', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 12.5,
                                color: 'var(--ink-2,#3a3650)', background: 'var(--bg,#f5f5fb)',
                                borderTopLeftRadius: i === 0 ? 10 : 0, borderBottomLeftRadius: i === 0 ? 10 : 0,
                                borderTopRightRadius: i === arr.length - 1 ? 10 : 0, borderBottomRightRadius: i === arr.length - 1 ? 10 : 0,
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {isPayoutTab ? (earnPageRows as typeof allPayouts).map((x) => (
                            <tr key={x.id}>
                              <td style={{ ...td, color: 'var(--muted,#667085)' }}>{x.date}{x.time ? `, ${x.time}` : ''}</td>
                              <td style={{ ...td, fontWeight: 600, fontSize: 12 }}>{x.payoutId || '—'}</td>
                              <td style={{ ...td, fontWeight: 700, color: '#16a34a' }}>{rupee(x.amount)}</td>
                              <td style={td}>
                                <span className="row" style={{ gap: 7, alignItems: 'center' }}>
                                  {(x.method || '').toLowerCase() === 'upi' ? <Smartphone size={14} color="#f59e0b" /> : <Landmark size={14} color="#5b51e8" />}
                                  {payMethodLabel(x.method)}
                                </span>
                              </td>
                              <td style={{ ...td, color: 'var(--muted,#667085)' }}>{x.destination || '—'}</td>
                              <td style={td}><Badge tone={x.status === 'Paid' ? 'green' : x.status === 'Failed' || x.status === 'Rejected' ? 'red' : 'amber'} dot={false}>{x.status}</Badge></td>
                              {/* The UTR is the bank's number and only exists once a real rail settles;
                                  until then the gateway's payout reference is the best id we have. */}
                              <td style={{ ...td, color: 'var(--muted,#667085)', fontSize: 12 }}>{x.utr || x.reference || '—'}</td>
                              <td style={td}>
                                <button onClick={() => setPayView(x)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--violet,#5b51e8)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Eye size={14} /> View</button>
                              </td>
                            </tr>
                          )) : isIncTab ? (earnPageRows as typeof allTxns).map((h) => (
                            <tr key={h.id}>
                              <td style={{ ...td, color: 'var(--muted,#667085)' }}>{h.date}</td>
                              <td style={td}>
                                <span className="row" style={{ gap: 7, alignItems: 'center' }}>
                                  <span style={{ display: 'inline-grid', placeItems: 'center', width: 24, height: 24, borderRadius: 7, flexShrink: 0, background: bucketOf(h.type) === 'Bonuses' ? '#eef2ff' : '#e9f9ef' }}>
                                    <Gift size={13} color={INC_COLORS[bucketOf(h.type)] || '#5b51e8'} />
                                  </span>
                                  <Badge tone={bucketOf(h.type) === 'Bonuses' ? 'blue' : 'green'} dot={false}>{h.type}</Badge>
                                </span>
                              </td>
                              <td style={{ ...td, maxWidth: 300, whiteSpace: 'normal' }}>
                                <div style={{ fontWeight: 600, color: 'var(--ink,#101828)' }}>{incTitle(h)}</div>
                                {incSubtitle(h) && <div className="muted" style={{ fontSize: 12, marginTop: 1 }}>{incSubtitle(h)}</div>}
                              </td>
                              <td style={{ ...td, fontWeight: 700, color: '#16a34a' }}>+ {rupee(h.amount)}</td>
                              <td style={td}><Badge tone="green" dot={false}>Credited</Badge></td>
                              <td style={{ ...td, color: 'var(--muted,#667085)' }}>{h.source || 'System'}</td>
                              <td style={td}>
                                <button onClick={() => setIncView(h)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--violet,#5b51e8)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Eye size={14} /> View</button>
                              </td>
                            </tr>
                          )) : isDedTab ? (earnPageRows as typeof allTxns).map((h) => (
                            <tr key={h.id}>
                              <td style={{ ...td, color: 'var(--muted,#667085)' }}>{h.date}, {h.time}</td>
                              <td style={{ ...td, fontWeight: 600, fontSize: 12 }}>{h.reference || '—'}</td>
                              <td style={td}>
                                <span className="row" style={{ gap: 7, alignItems: 'center' }}>
                                  <span style={{ display: 'inline-grid', placeItems: 'center', width: 24, height: 24, borderRadius: 7, flexShrink: 0, background: '#fdeced' }}>
                                    <ShieldAlert size={13} color={dedColor(dedSegs.findIndex((s) => s.label === h.type))} />
                                  </span>
                                  <span style={{ fontWeight: 600, color: dedColor(dedSegs.findIndex((s) => s.label === h.type)) }}>{h.type}</span>
                                </span>
                              </td>
                              <td style={{ ...td, maxWidth: 300, whiteSpace: 'normal', color: 'var(--muted,#667085)' }}>{h.remarks || h.refId || '—'}</td>
                              <td style={{ ...td, fontWeight: 700, color: '#dc2626' }}>− {rupee(h.amount)}</td>
                              <td style={td}><Badge tone="green" dot={false}>{statusLabel(h.status)}</Badge></td>
                              <td style={{ ...td, color: 'var(--muted,#667085)' }}>{h.source || 'System'}</td>
                              <td style={td}>
                                <button onClick={() => setIncView(h)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--violet,#5b51e8)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Eye size={14} /> View</button>
                              </td>
                            </tr>
                          )) : (earnPageRows as typeof allTxns).map((h) => (
                            <tr key={h.id}>
                              <td style={{ ...td, color: 'var(--muted,#667085)' }}>{h.date} {h.time}</td>
                              <td style={td}><Badge tone={h.isCredit ? 'green' : 'red'} dot={false}>{typeLabel(h.type)}</Badge></td>
                              <td style={{ ...td, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{txnDesc(h)}</td>
                              <td style={{ ...td, fontWeight: 700, color: h.isCredit ? '#16a34a' : '#dc2626' }}>{h.isCredit ? '+' : '−'} {rupee(h.amount)}</td>
                              <td style={td}><Badge tone={h.isCredit ? 'green' : h.type === 'Withdrawal' ? 'blue' : 'red'} dot={false}>{statusLabel(h.status)}</Badge></td>
                              <td style={{ ...td, color: 'var(--muted,#667085)', fontSize: 12 }}>{h.reference || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {earnTab === 'overview' ? (
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
                        <span className="muted" style={{ fontSize: 12.5 }}>Showing the {earnPageRows.length} most recent of {earnRows.length}.</span>
                        <button style={{ ...softBtn, color: 'var(--violet,#5b51e8)' }} onClick={() => { setEarnTab('txns'); setEarnPage(1) }}>View all transactions <ChevronRight size={15} /></button>
                      </div>
                    ) : (
                      <Pagination page={curEarnPage} pageSize={earnSize} total={earnRows.length} noun={isPayoutTab ? 'payments' : isIncTab || isDedTab ? 'records' : 'transactions'} onPage={setEarnPage} onSize={(s) => { setEarnSize(s); setEarnPage(1) }} />
                    )}
                  </>
                )}
              </Card>
            </div>

            {isIncTab ? (
              <div className="grid" style={{ gap: 16 }}>
                <Panel title="Incentive & Bonus Summary">
                  {incSegs.length ? (
                    <div className="row" style={{ gap: 16, alignItems: 'center' }}>
                      <DonutChart segments={incSegs.map((s) => ({ count: s.amount }))} total={incEarned} colorFor={(i) => INC_COLORS[incSegs[i].label]} centerValue={rupee(incEarned)} centerLabel="Total" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {incSegs.map((s) => (
                          <div key={s.label} style={{ padding: '5px 0' }}>
                            <span className="row" style={{ gap: 8, alignItems: 'center', fontSize: 13 }}>
                              <span style={{ width: 9, height: 9, borderRadius: 9, background: INC_COLORS[s.label], flexShrink: 0 }} />
                              <span>{s.label}</span>
                            </span>
                            <div style={{ fontWeight: 700, fontSize: 13, marginLeft: 17 }}>
                              {rupee(s.amount)} <span className="muted" style={{ fontWeight: 500 }}>({incEarned ? Math.round((s.amount / incEarned) * 1000) / 10 : 0}%)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : <div className="muted" style={{ fontSize: 13, padding: '24px 0', textAlign: 'center' }}>{wal ? 'No incentives or bonuses in this range.' : 'Loading…'}</div>}
                </Panel>

                <Panel title="Incentive Stats">
                  <Info label="Incentives Earned" value={rupee(incTotal)} />
                  <Info label="Bonuses Earned" value={rupee(bonusTotal)} />
                  <Info label="Total Earned" value={rupee(incEarned)} />
                  <Info label="Records" value={String(incTxns.length)} />
                </Panel>

                <Panel title="Top Incentives Earned">
                  {topInc.length ? topInc.map(([label, amt], i) => (
                    <div key={label} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 13 }}>
                      <span className="row" style={{ gap: 9, alignItems: 'center', minWidth: 0 }}>
                        <span className="rank" style={{ background: 'var(--violet-50,#f3f1fe)', color: 'var(--violet,#5b51e8)' }}>{i + 1}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                      </span>
                      <strong style={{ whiteSpace: 'nowrap' }}>{rupee(amt)}</strong>
                    </div>
                  )) : <div className="muted" style={{ fontSize: 13, padding: '10px 0' }}>Nothing yet.</div>}
                </Panel>

                <Card>
                  <div className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
                    <InfoIcon size={16} color="var(--violet,#5b51e8)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>Note</div>
                      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                        Incentives are calculated automatically from performance and job-completion metrics, and are
                        credited as soon as they're earned — there is no approval step. Manually granted bonuses show
                        the admin who added them.
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            ) : isDedTab ? (
              <div className="grid" style={{ gap: 16 }}>
                <Panel title="Deduction Summary">
                  {dedSegs.length ? (
                    <div className="row" style={{ gap: 16, alignItems: 'center' }}>
                      <DonutChart segments={dedSegs.map((s) => ({ count: s.amount }))} total={dedTotal} colorFor={dedColor} centerValue={rupee(dedTotal)} centerLabel="Total Deductions" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {dedSegs.map((s, i) => (
                          <div key={s.label} style={{ padding: '3px 0' }}>
                            <span className="row" style={{ gap: 8, alignItems: 'center', fontSize: 12.5, minWidth: 0 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 8, background: dedColor(i), flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                            </span>
                            <div style={{ fontSize: 12.5, marginLeft: 16 }}>
                              <strong>{rupee(s.amount)}</strong> <span className="muted">({dedTotal ? Math.round((s.amount / dedTotal) * 1000) / 10 : 0}%)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : <div className="muted" style={{ fontSize: 13, padding: '24px 0', textAlign: 'center' }}>{wal ? 'No deductions in this range.' : 'Loading…'}</div>}
                </Panel>

                <Panel title="Deduction Stats" action={<span className="muted" style={{ fontSize: 11.5 }}>{earnFrom || earnTo ? 'Selected range' : 'All time'}</span>}>
                  <Info label="Total Deductions" value={rupee(dedStats.total)} />
                  <Info label="Deductions Applied" value={String(dedStats.count)} />
                  <Info label="Average Deduction" value={rupee(dedStats.avg)} />
                  <Info label="Highest Deduction" value={rupee(dedStats.high)} />
                  <Info label="Lowest Deduction" value={rupee(dedStats.low)} />
                </Panel>

                <Card>
                  <div className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
                    <InfoIcon size={16} color="var(--violet,#5b51e8)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>Note</div>
                      <ul className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, paddingLeft: 15, margin: 0 }}>
                        <li>Late-start and shift penalties are applied automatically; anything else was applied by an admin.</li>
                        <li>A deduction reduces the withdrawable balance as soon as it is applied.</li>
                      </ul>
                    </div>
                  </div>
                </Card>
              </div>
            ) : isPayoutTab ? (
              <div className="grid" style={{ gap: 16 }}>
                <Panel title="Wallet Summary">
                  <Info label="Current Wallet Balance" value={<strong style={{ color: 'var(--violet,#5b51e8)' }}>{rupee(ws?.available ?? w.balance)}</strong>} />
                  <Info label="Total Credits" value={<span style={{ color: '#16a34a' }}>{rupee(totalCredits)}</span>} />
                  <Info label="Total Debits" value={<span style={{ color: '#dc2626' }}>{rupee(totalDebits)}</span>} />
                  <Info label="Pending Settlement" value={rupee(ws?.hold)} />
                  <button className="btn line" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} onClick={() => { setEarnTab('txns'); setEarnPage(1) }}>View Wallet Statement</button>
                </Panel>

                <Panel title="Payout Stats" action={<span className="muted" style={{ fontSize: 11.5 }}>{earnFrom || earnTo ? 'Selected range' : 'All time'}</span>}>
                  <Info label="Total Payouts" value={rupee(payStats.total)} />
                  <Info label="Successful Payouts" value={String(payStats.ok)} />
                  <Info label="Failed Payouts" value={String(payStats.failed)} />
                  <Info label="Pending Payouts" value={String(payStats.pending)} />
                  <Info label="Average Payout" value={rupee(payStats.avg)} />
                </Panel>

                <Panel title="Payout Destinations">
                  {payMethods.length ? payMethods.map(([label, count]) => (
                    <div key={label} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 13 }}>
                      <span className="row" style={{ gap: 8, alignItems: 'center', minWidth: 0 }}>
                        {label.includes('@') ? <Smartphone size={14} color="#f59e0b" /> : <Landmark size={14} color="#5b51e8" />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                      </span>
                      <Badge tone="gray" dot={false}>{count}</Badge>
                    </div>
                  )) : <div className="muted" style={{ fontSize: 13, padding: '10px 0' }}>No payouts yet.</div>}
                </Panel>

                <Card>
                  <div className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
                    <InfoIcon size={16} color="var(--violet,#5b51e8)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>Important Note</div>
                      <ul className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, paddingLeft: 15, margin: 0 }}>
                        {/* Reflects the real configured policy, not a hardcoded schedule. */}
                        <li>Payouts are requested by the worker and released by an admin{ws?.payoutFrequency && ws.payoutFrequency !== 'On demand' ? `, on a ${ws.payoutFrequency.toLowerCase()} cycle` : ''}.</li>
                        {ws?.minPayoutLimit ? <li>Minimum payout is {rupee(ws.minPayoutLimit)}.</li> : null}
                        <li>Once released, it can take 24–48 hours to reach the worker's bank.</li>
                      </ul>
                    </div>
                  </div>
                </Card>
              </div>
            ) : (
            <div className="grid" style={{ gap: 16 }}>
              <Panel title="Payout Account" action={<Badge tone={w.bank_status === 'Verified' ? 'green' : w.bank_status === 'Rejected' ? 'red' : 'amber'} dot={false}>{w.bank_status || 'Pending'}</Badge>}>
                <Info label="Bank Name" value={bank?.bankName || '—'} />
                <Info label="Account Number" value={bank?.bankAccount ? `•••• •••• ${String(bank.bankAccount).slice(-4)}` : '—'} />
                <Info label="IFSC Code" value={bank?.bankIfsc || '—'} />
                <Info label="Account Holder Name" value={bank?.bankHolder || '—'} verified={bv?.nameMatch === true} />
                <Info label="Account Type" value={bank?.bankAccountType ? `${bank.bankAccountType.replace(/^./, (c) => c.toUpperCase())} Account` : '—'} />
                <Info label="UPI ID" value={bank?.bankUpi || '—'} />
                <Info label="Payout Method" value={payoutMethod} />
                <button className="btn line" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} onClick={() => setTab('docs')}><Wallet size={15} /> Manage Payout Account</button>
              </Panel>
              <Panel title="Payout Summary">
                <Info label="Wallet Balance" value={rupee(ws?.available ?? w.balance)} />
                <Info label="Pending Settlement" value={rupee(ws?.hold)} />
                <Info label="Total Payouts" value={rupee(ws?.totalWithdrawn)} />
                <Info label="Last Payout" value={lastPayout ? `${rupee(lastPayout.amount)} · ${shortDate(lastPayout.date)}` : '—'} />
                {/* Estimated from the configured payout policy (Pricing → Worker Payout Policy). Nothing pays
                    automatically, so this is only ever shown as an estimate, and only when a schedule is set. */}
                {!ws?.nextPayout ? <Info label="Next Payout" value={<span className="muted">On request</span>} />
                  : ws.nextPayoutEst ? (
                    <Info label="Next Payout" value={<span>{rupee(ws.nextPayoutEst)} <span className="muted">(Est.)</span><br /><span className="muted" style={{ fontSize: 12 }}>{shortDate(ws.nextPayout)}</span></span>} />
                  ) : (
                    // Balance is under the minimum, so no payout would go out — say that rather than show "₹0".
                    <Info label="Next Payout" value={<span className="muted" style={{ fontSize: 12 }}>Below {rupee(ws.minPayoutLimit)} minimum</span>} />
                  )}
                <Info label="Payout Frequency" value={ws?.payoutFrequency || '—'} />
                <Info label="Minimum Payout Limit" value={ws?.minPayoutLimit != null ? rupee(ws.minPayoutLimit) : '—'} />
                <button className="btn" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} onClick={() => { setEarnTab('payouts'); setEarnPage(1) }}>View Payment History <ChevronRight size={15} /></button>
              </Panel>
            </div>
            )}
          </div>

          {/* Shared by the Incentives and Deductions tabs — a debit is a deduction, so the wording flips. */}
          {incView && (
            <Modal title={incView.isCredit ? 'Incentive Details' : 'Deduction Details'} onClose={() => setIncView(null)}>
              <Info label="Title" value={incTitle(incView)} />
              {incSubtitle(incView) && <Info label={incView.isCredit ? 'Applied For' : 'Details'} value={incSubtitle(incView)} />}
              <Info label="Type" value={<Badge tone={!incView.isCredit ? 'red' : bucketOf(incView.type) === 'Bonuses' ? 'blue' : 'green'} dot={false}>{incView.type}</Badge>} />
              <Info label="Amount" value={<strong style={{ color: incView.isCredit ? '#16a34a' : '#dc2626' }}>{incView.isCredit ? '+' : '−'} {rupee(incView.amount)}</strong>} />
              <Info label="Date & Time" value={`${incView.date} ${incView.time}`} />
              <Info label="Status" value={<Badge tone="green" dot={false}>{incView.isCredit ? 'Credited' : statusLabel(incView.status)}</Badge>} />
              <Info label={incView.isCredit ? 'Approved By' : 'Applied By'} value={incView.source || 'System'} />
              <Info label={incView.isCredit ? 'Reference ID' : 'Deduction ID'} value={incView.reference || '—'} />
            </Modal>
          )}

          {payView && (
            <Modal title="Payout Details" onClose={() => setPayView(null)}>
              <Info label="Payout ID" value={payView.payoutId || '—'} />
              <Info label="Amount" value={<strong>{rupee(payView.amount)}</strong>} />
              <Info label="Payment Method" value={payMethodLabel(payView.method)} />
              <Info label="Paid To" value={payView.destination || '—'} />
              <Info label="Payment Date" value={`${payView.date}${payView.time ? `, ${payView.time}` : ''}`} />
              <Info label="Status" value={<Badge tone={payView.status === 'Paid' ? 'green' : payView.status === 'Failed' || payView.status === 'Rejected' ? 'red' : 'amber'} dot={false}>{payView.status}</Badge>} />
              <Info label="Bank UTR" value={payView.utr || <span className="muted">Not issued yet</span>} />
              <Info label="Gateway Reference" value={payView.reference || '—'} />
            </Modal>
          )}
        </>
      )}

      {tab === 'avail' && <WorkerAvailability workerId={Number(id)} />}
      {(show('avail')) && <div style={grid3}>{availabilityPanel}
        <Panel title="Attendance & Shift">
          <Info label="On Shift" value={<Badge tone={w.on_shift ? 'green' : 'gray'} dot={false}>{w.on_shift ? 'On shift' : 'Off'}</Badge>} />
          <Info label="Shift Assigned" value={w.shift_def_id ? `Shift #${w.shift_def_id}` : '—'} />
          <Info label="Availability" value={<Badge tone={w.available ? 'green' : 'gray'} dot={false}>{w.available ? 'Online' : 'Offline'}</Badge>} />
        </Panel>
      </div>}

      {(show('notes')) && <div style={grid3}>{notesPanel}{activityPanel}</div>}
    </div>
  )
}
