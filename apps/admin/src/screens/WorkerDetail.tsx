import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Phone, MessageSquare, MapPin, Star, CheckCircle2, BadgeCheck,
  Briefcase, TrendingUp, Clock, XCircle, Wallet, ShieldAlert, Zap,
} from 'lucide-react'
import { fetchWorkerDetail, fetchZones, updateWorker, type Zone } from '../api'
import type { WorkerDetail } from '../types'
import { Card, Badge, Avatar, Loading, ErrorState, useToast, shortDate } from '../components/UI'

const rupee = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`

/** Small labelled cell used across the info panels. */
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

/** A KPI tile in the stats strip. */
function Kpi({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: ReactNode; sub?: string; tone?: string }) {
  return (
    <div style={{ flex: '1 1 110px', minWidth: 110, background: 'var(--card,#fff)', border: '1px solid var(--line,#eef0f4)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ color: tone || 'var(--muted,#98a2b3)', marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: tone }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted,#667085)' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted,#98a2b3)', marginTop: 2 }}>{sub}</div>}
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

const rowStatusTone = (s: string) => s === 'completed' ? 'green' : s === 'cancelled' ? 'red' : 'blue'

export default function WorkerDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [w, setW] = useState<WorkerDetail | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [err, setErr] = useState('')

  const load = () => { setErr(''); fetchWorkerDetail(Number(id)).then(setW).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [id])
  useEffect(() => { fetchZones().then(setZones).catch(() => {}) }, [])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!w) return <Loading />

  const m = w.metrics
  const bank = w.profile?.bank
  const bv = w.profile?.bankVerification
  const zoneName = zones.find((z) => z.id === w.zone_id)?.name || '—'
  const onDuty = !!w.available
  const act = async (patch: Record<string, unknown>, msg: string) => { try { await updateWorker(w.id, patch); toast(msg); load() } catch (e) { toast((e as Error).message) } }

  const grid3: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }

  return (
    <div className="grid" style={{ gap: 14 }}>
      {/* Breadcrumb + title */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <button className="btn ghost" onClick={() => nav('/workers')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4 }}><ChevronLeft size={16} /> Workers</button>
          <h2 style={{ margin: 0, display: 'flex', gap: 10, alignItems: 'center' }}>Worker Details <Badge tone={onDuty ? 'green' : 'gray'} dot={false}>{onDuty ? 'On Duty' : 'Off Duty'}</Badge></h2>
          <div className="muted" style={{ fontSize: 12.5 }}>Complete overview and management of the worker profile</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => toast(`Call ${w.phone || ''}`)}><Phone size={15} /> Call</button>
          <button className="btn" onClick={() => toast('Messaging is not wired yet')}><MessageSquare size={15} /> Message</button>
        </div>
      </div>

      {/* Identity + status strip */}
      <Card>
        <div className="row" style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Avatar name={w.name} src={w.avatar} size={64} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong style={{ fontSize: 19 }}>{w.name}</strong>
              {w.verified && <BadgeCheck size={18} color="#2563eb" />}
            </div>
            <div className="row" style={{ gap: 6, alignItems: 'center', color: 'var(--muted,#667085)', fontSize: 13, marginTop: 2 }}>
              <Star size={14} fill="#f59e0b" stroke="#f59e0b" /> {w.rating || '—'} · Worker ID WKR{String(w.id).padStart(4, '0')} · {w.designation || 'Worker'}
            </div>
            <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {w.verified && <Badge tone="blue" dot={false}>Verified</Badge>}
              <Badge tone="gray" dot={false}>{w.jobs}+ Jobs</Badge>
              {(w.services || []).slice(0, 3).map((s) => <Badge key={s} tone="violet" dot={false}>{s}</Badge>)}
            </div>
          </div>
          <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
            <div><div className="muted" style={{ fontSize: 11 }}>Status</div><div style={{ fontWeight: 600, color: onDuty ? '#16a34a' : '#98a2b3' }}>{onDuty ? 'Online' : 'Offline'}</div></div>
            <div><div className="muted" style={{ fontSize: 11 }}>On Shift</div><div style={{ fontWeight: 600 }}>{w.on_shift ? 'Yes' : 'No'}</div></div>
            <div><div className="muted" style={{ fontSize: 11 }}>Last GPS</div><div style={{ fontWeight: 600, fontSize: 12 }}>{w.last_lat != null ? `${Number(w.last_lat).toFixed(3)}, ${Number(w.last_lng).toFixed(3)}` : '—'}</div></div>
            <div><div className="muted" style={{ fontSize: 11 }}>Zone</div><div style={{ fontWeight: 600 }}>{zoneName}</div></div>
          </div>
        </div>
      </Card>

      {/* KPI tiles */}
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <Kpi icon={<Briefcase size={17} />} label="Today's Jobs" value={m?.todayJobs ?? 0} />
        <Kpi icon={<Briefcase size={17} />} label="Weekly Jobs" value={m?.weekJobs ?? 0} />
        <Kpi icon={<Briefcase size={17} />} label="Monthly Jobs" value={m?.monthJobs ?? 0} />
        <Kpi icon={<TrendingUp size={17} />} label="Completion" value={`${m?.completionPct ?? 0}%`} tone="#16a34a" />
        <Kpi icon={<XCircle size={17} />} label="Cancellation" value={`${m?.cancellationPct ?? 0}%`} tone={(m?.cancellationPct ?? 0) > 10 ? '#dc2626' : undefined} />
        <Kpi icon={<Star size={17} />} label="Rating" value={<span>{w.rating || '—'} <Star size={13} fill="#f59e0b" stroke="#f59e0b" style={{ verticalAlign: -1 }} /></span>} />
        <Kpi icon={<Wallet size={17} />} label="Today's Earnings" value={rupee(m?.todayEarnings)} tone="#7c3aed" />
      </div>

      {/* Live Operation + AI Health (stub) */}
      <div style={grid3}>
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

        <Panel title="AI Worker Health">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '18px 0', color: 'var(--muted,#98a2b3)' }}>
            <ShieldAlert size={26} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted,#667085)' }}>Coming soon</div>
            <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 240 }}>Risk scoring (burnout, late-probability, complaints) needs a health model — not yet computed.</div>
          </div>
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
      </div>

      {/* Personal / Contact / Bank */}
      <div style={grid3}>
        <Panel title="Personal Information">
          <Info label="Full Name" value={w.name} />
          <Info label="City" value={w.city || '—'} />
          <Info label="Zone" value={zoneName} />
          <Info label="Designation" value={w.designation || 'Worker'} />
          <Info label="Joined On" value={shortDate(w.joined)} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Gender, DOB, address, Aadhaar &amp; PAN aren't captured yet.</div>
        </Panel>

        <Panel title="Contact Information">
          <Info label="Mobile Number" value={w.phone || '—'} verified={w.verified} />
          <Info label="Email" value={w.email || '—'} verified={w.verified} />
          <Info label="Last Location" value={w.last_lat != null ? `${Number(w.last_lat).toFixed(4)}, ${Number(w.last_lng).toFixed(4)}` : '—'} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>WhatsApp, emergency contact &amp; languages aren't captured yet.</div>
        </Panel>

        <Panel title="Bank & Payout" action={<Badge tone={w.bank_status === 'Verified' ? 'green' : w.bank_status === 'Rejected' ? 'red' : 'amber'} dot={false}>{w.bank_status || 'Pending'}</Badge>}>
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

      {/* Documents / Skills / Recent Jobs */}
      <div style={grid3}>
        <Panel title={`Documents (${w.documents?.length ?? 0})`}>
          {(w.documents && w.documents.length > 0) ? w.documents.map((d) => (
            <div key={d.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
              <span style={{ fontSize: 13 }}>{d.name}</span>
              <Badge tone={d.status === 'Verified' ? 'green' : d.status === 'Rejected' || d.status === 'Expired' ? 'red' : 'amber'} dot={false}>{d.status || 'Pending'}</Badge>
            </div>
          )) : <div className="muted" style={{ fontSize: 13, padding: '10px 0' }}>No documents uploaded.</div>}
        </Panel>

        <Panel title={`Skills & Services (${w.services?.length ?? 0})`}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {(w.services || []).map((s) => <Badge key={s} tone="blue" dot={false}>{s}</Badge>)}
            {(!w.services || w.services.length === 0) && <span className="muted" style={{ fontSize: 13 }}>None assigned.</span>}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Skill levels (Expert/Advanced) aren't captured yet.</div>
        </Panel>

        <Panel title={`Recent Jobs (${w.recentJobs?.length ?? 0})`} action={<button className="btn ghost" onClick={() => nav('/bookings')}>View All</button>}>
          {(w.recentJobs && w.recentJobs.length > 0) ? w.recentJobs.map((j) => (
            <div key={j.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
              <span style={{ fontSize: 12.5 }}>{j.ref} · {j.service}{j.date ? ` · ${j.date}` : ''}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>{rupee(j.total)}</span>
                <Badge tone={rowStatusTone(j.status)} dot={false}>{j.status}</Badge>
              </span>
            </div>
          )) : <div className="muted" style={{ fontSize: 13, padding: '10px 0' }}>No recent jobs.</div>}
        </Panel>
      </div>

      {/* Earnings summary */}
      <Panel title="Earnings Summary" action={<button className="btn ghost" onClick={() => nav('/worker-wallet')}>Full Earnings</button>}>
        <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
          <div><div className="muted" style={{ fontSize: 12 }}>Available</div><div style={{ fontSize: 18, fontWeight: 700 }}>{rupee(w.wallet?.available ?? w.balance)}</div></div>
          <div><div className="muted" style={{ fontSize: 12 }}>Lifetime Earned</div><div style={{ fontSize: 18, fontWeight: 700 }}>{rupee(w.wallet?.totalEarned ?? w.earnings)}</div></div>
          <div><div className="muted" style={{ fontSize: 12 }}>This Week</div><div style={{ fontSize: 18, fontWeight: 700 }}>{rupee(w.wallet?.weekEarnings)}</div></div>
          <div><div className="muted" style={{ fontSize: 12 }}>This Month</div><div style={{ fontSize: 18, fontWeight: 700 }}>{rupee(w.wallet?.monthEarnings)}</div></div>
          <div><div className="muted" style={{ fontSize: 12 }}>On Hold</div><div style={{ fontSize: 18, fontWeight: 700 }}>{rupee(w.wallet?.hold)}</div></div>
          <div><div className="muted" style={{ fontSize: 12 }}>Withdrawn</div><div style={{ fontSize: 18, fontWeight: 700 }}>{rupee(w.wallet?.totalWithdrawn)}</div></div>
        </div>
      </Panel>
    </div>
  )
}
