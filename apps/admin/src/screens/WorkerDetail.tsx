import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Phone, MessageSquare, MapPin, Star, CheckCircle2, BadgeCheck,
  Briefcase, XCircle, Wallet, ShieldAlert, Zap, Activity as ActivityIcon,
  Clock, Wifi, BatteryMedium, CalendarClock, Eye, Download,
} from 'lucide-react'
import { fetchWorkerDetail, fetchZones, updateWorker, addWorkerNote, type Zone } from '../api'
import type { WorkerDetail, WorkerNote } from '../types'
import { Card, Badge, Avatar, Loading, ErrorState, useToast, shortDate } from '../components/UI'
import { useStore } from '../store'

const rupee = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`

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
function DonutChart({ segments, total, colorFor }: { segments: { count: number }[]; total: number; colorFor: (i: number) => string }) {
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
      <text x={cx} y={cy - 1} textAnchor="middle" fontSize={24} fontWeight={700} fill="var(--ink,#101828)">{total}</text>
      <text x={cx} y={cy + 15} textAnchor="middle" fontSize={10.5} fill="var(--muted,#98a2b3)">Total Jobs</text>
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
const TABS = [['overview', 'Overview'], ['jobs', 'Jobs & Performance'], ['earnings', 'Earnings & Payouts'], ['docs', 'Documents'], ['skills', 'Skills & Services'], ['avail', 'Availability'], ['notes', 'Notes & Activity']] as const

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
  const [jobPage, setJobPage] = useState(1)
  const [jobFilter, setJobFilter] = useState('all')

  const load = () => { setErr(''); fetchWorkerDetail(Number(id)).then((d) => { setW(d); setNotes(d.notes || []) }).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [id])
  useEffect(() => { fetchZones().then(setZones).catch(() => {}) }, [])
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
  const grid3: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }
  const softBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--card,#fff)', border: '1px solid var(--line,#e4e7ec)', color: 'var(--violet,#5b51e8)', padding: '9px 15px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
  const show = (t: string) => tab === 'overview' || tab === t

  // ---- Jobs & Performance: table filtering + pagination (client-side over the real jobs list) ----
  const jp = w.jobsPerformance
  const ACTIVE_STS = ['confirmed', 'worker_assigned', 'accepted', 'on_the_way', 'on the way', 'travelling', 'arrived', 'in_progress', 'in progress', 'started']
  const statusGroup = (s: string) => s === 'completed' ? 'completed' : s === 'cancelled' ? 'cancelled' : ACTIVE_STS.includes(String(s).toLowerCase()) ? 'in_progress' : 'other'
  const statusTone = (s: string) => s === 'completed' ? 'green' : s === 'cancelled' ? 'red' : ACTIVE_STS.includes(String(s).toLowerCase()) ? 'amber' : 'gray'
  const prettyStatus = (s: string) => String(s || '—').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const jobsFiltered = jp ? (jobFilter === 'all' ? jp.jobs : jp.jobs.filter((j) => statusGroup(j.status) === jobFilter)) : []
  const PAGE_SIZE = 10
  const jobPages = Math.max(1, Math.ceil(jobsFiltered.length / PAGE_SIZE))
  const curPage = Math.min(jobPage, jobPages)
  const jobsPageRows = jobsFiltered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)
  const exportJobsCsv = () => {
    if (!jp) return
    const head = ['Job ID', 'Service', 'Customer', 'Date', 'Time', 'Amount', 'Status', 'Acceptance', 'On Time', 'Rating', 'Earnings']
    const rows = jobsFiltered.map((j) => [j.ref, j.service, j.customer, j.date, j.time, j.amount, prettyStatus(j.status), j.acceptance, j.onTime, j.rating ?? '', j.earnings])
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `worker-${w.id}-jobs.csv`; a.click(); URL.revokeObjectURL(url)
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
  const documentsPanel = (
    <Panel title={`Documents (${w.documents?.length ?? 0})`}>
      {(w.documents && w.documents.length > 0) ? w.documents.map((d) => (
        <div key={d.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
          <span style={{ fontSize: 13 }}>{d.name}</span>
          <Badge tone={d.status === 'Verified' ? 'green' : d.status === 'Rejected' || d.status === 'Expired' ? 'red' : 'amber'} dot={false}>{d.status || 'Pending'}</Badge>
        </div>
      )) : <div className="muted" style={{ fontSize: 13, padding: '10px 0' }}>No documents uploaded.</div>}
    </Panel>
  )
  const skillsPanel = (
    <Panel title={`Skills & Services (${w.services?.length ?? 0})`}>
      {(w.services && w.services.length > 0) ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '6px 20px' }}>
          {w.services.map((s) => {
            const lvl = w.profile?.skillLevels?.[s]
            return (
              <div key={s} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--line,#f1f2f6)' }}>
                <span style={{ fontSize: 13 }}>{s}</span>
                {lvl && <Badge tone={lvl === 'Expert' ? 'green' : lvl === 'Advanced' ? 'blue' : lvl === 'Intermediate' ? 'amber' : 'gray'} dot={false}>{lvl}</Badge>}
              </div>
            )
          })}
        </div>
      ) : <span className="muted" style={{ fontSize: 13 }}>None assigned.</span>}
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
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
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
              <div className="row" style={{ gap: 10 }}>
                <select value={jobFilter} onChange={(e) => { setJobFilter(e.target.value); setJobPage(1) }} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line,#e4e7ec)', fontSize: 13, background: 'var(--card,#fff)', cursor: 'pointer' }}>
                  <option value="all">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button style={softBtn} onClick={exportJobsCsv}><Download size={15} /> Export</button>
              </div>
            </div>
            {jobsFiltered.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>No jobs to show.</div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--muted,#667085)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        {['Job ID', 'Service', 'Customer', 'Date & Time', 'Amount', 'Status', 'Acceptance', 'On Time', 'Rating', 'Earnings', ''].map((h) => (
                          <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid var(--line,#eef0f4)', whiteSpace: 'nowrap', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {jobsPageRows.map((j) => (
                        <tr key={j.id} style={{ borderBottom: '1px solid var(--line,#f4f5f8)' }}>
                          <td style={{ padding: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{j.ref}</td>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{j.service}</td>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{j.customer}</td>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap', color: 'var(--muted,#667085)' }}>{[j.date, j.time].filter(Boolean).join(', ') || '—'}</td>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{rupee(j.amount)}</td>
                          <td style={{ padding: '10px' }}><Badge tone={statusTone(j.status)} dot={false}>{prettyStatus(j.status)}</Badge></td>
                          <td style={{ padding: '10px' }}>{j.acceptance === 'Accepted' ? <Badge tone="green" dot={false}>Accepted</Badge> : <span className="muted">—</span>}</td>
                          <td style={{ padding: '10px' }}>{j.onTime === 'On Time' ? <Badge tone="green" dot={false}>On Time</Badge> : j.onTime === 'Late' ? <Badge tone="red" dot={false}>Late</Badge> : <span className="muted">—</span>}</td>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{j.rating ? <span>{j.rating} <Star size={12} fill="#f59e0b" stroke="#f59e0b" style={{ verticalAlign: -1 }} /></span> : <span className="muted">—</span>}</td>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap', fontWeight: 600 }}>{j.earnings ? rupee(j.earnings) : <span className="muted" style={{ fontWeight: 400 }}>₹0</span>}</td>
                          <td style={{ padding: '10px' }}>
                            <span className="row" style={{ gap: 8 }}>
                              <Eye size={16} style={{ cursor: 'pointer', color: 'var(--muted,#98a2b3)' }} onClick={() => nav('/bookings')} />
                              <ChevronRight size={16} style={{ cursor: 'pointer', color: 'var(--muted,#98a2b3)' }} onClick={() => nav('/bookings')} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>Showing {(curPage - 1) * PAGE_SIZE + 1} to {Math.min(curPage * PAGE_SIZE, jobsFiltered.length)} of {jobsFiltered.length} jobs</span>
                  <div className="row" style={{ gap: 4 }}>
                    <button style={{ ...softBtn, padding: '6px 10px', opacity: curPage <= 1 ? 0.5 : 1 }} disabled={curPage <= 1} onClick={() => setJobPage(curPage - 1)}><ChevronLeft size={15} /></button>
                    {Array.from({ length: jobPages }, (_, i) => i + 1).map((n) => (
                      <button key={n} onClick={() => setJobPage(n)} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--line,#e4e7ec)', cursor: 'pointer', fontSize: 13, fontWeight: n === curPage ? 700 : 500, background: n === curPage ? 'var(--violet,#5b51e8)' : 'var(--card,#fff)', color: n === curPage ? '#fff' : 'var(--ink,#101828)' }}>{n}</button>
                    ))}
                    <button style={{ ...softBtn, padding: '6px 10px', opacity: curPage >= jobPages ? 0.5 : 1 }} disabled={curPage >= jobPages} onClick={() => setJobPage(curPage + 1)}><ChevronRight size={15} /></button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {(show('earnings')) && <div style={grid3}>{earningsTrendPanel}
        <Panel title="Earnings Summary" action={<button className="btn ghost" onClick={() => nav('/worker-wallet')}>Full Earnings</button>}>
          <Info label="Available" value={rupee(w.wallet?.available ?? w.balance)} />
          <Info label="Lifetime Earned" value={rupee(w.wallet?.totalEarned ?? w.earnings)} />
          <Info label="This Week" value={rupee(w.wallet?.weekEarnings)} />
          <Info label="This Month" value={rupee(w.wallet?.monthEarnings)} />
          <Info label="On Hold" value={rupee(w.wallet?.hold)} />
          <Info label="Withdrawn" value={rupee(w.wallet?.totalWithdrawn)} />
        </Panel>
      </div>}

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
