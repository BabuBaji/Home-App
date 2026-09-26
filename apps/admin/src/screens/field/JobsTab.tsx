import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, ExternalLink, Repeat2, Clock, MapPin, ChevronRight, Inbox, AlertTriangle, Search, Check, UserX } from 'lucide-react'
import { fetchControlTower, updateBooking } from '../../api'
import type { CTJob, CTPro } from '../../types'
import { useStore, has } from '../../store'
import { useToast } from '../../components/UI'
import { usePoll, Header, Spinner, ErrorBox, EmptyBox, Sheet, fmtAge, telHref, timeAgo } from './shared'

const GROUPS: { status: string; label: string }[] = [
  { status: 'confirmed', label: 'Waiting for an expert' },
  { status: 'worker_assigned', label: 'Assigned' },
  { status: 'on_the_way', label: 'On the way' },
  { status: 'arrived', label: 'Arrived' },
  { status: 'in_progress', label: 'In progress' },
]
const SLA_LABEL: Record<CTJob['sla'], string> = { onTime: 'On time', atRisk: 'At risk', breached: 'Breached' }
const SLA_TONE: Record<CTJob['sla'], string> = { onTime: 'green', atRisk: 'amber', breached: 'red' }
type Filter = 'all' | 'attention' | 'unassigned'

export default function JobsTab() {
  const { data, error, loading, refreshing, reload } = usePoll(fetchControlTower, 20000)
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<number | null>(null)

  const jobs = data?.jobs || []
  const counts = useMemo(() => ({
    all: jobs.length,
    attention: jobs.filter((j) => j.sla !== 'onTime' || j.escalated).length,
    unassigned: jobs.filter((j) => !j.workerId).length,
    breached: jobs.filter((j) => j.sla === 'breached').length,
  }), [jobs])
  const shown = jobs.filter((j) => filter === 'all' ? true : filter === 'attention' ? (j.sla !== 'onTime' || j.escalated) : !j.workerId)
  const groups = GROUPS.map((g) => ({ ...g, jobs: shown.filter((j) => j.status === g.status) })).filter((g) => g.jobs.length)
  const other = shown.filter((j) => !GROUPS.some((g) => g.status === j.status))
  if (other.length) groups.push({ status: 'other', label: 'Other', jobs: other })
  const open = openId != null ? jobs.find((j) => j.id === openId) || null : null

  return (
    <>
      <Header title="Live jobs" sub={data ? `Updated ${timeAgo(data.generatedAt)}` : 'Loading…'} onRefresh={() => reload()} refreshing={refreshing}>
        <div className="fd-stats">
          <div><b>{counts.all}</b><span>Active</span></div>
          <div className={counts.unassigned ? 'amber' : ''}><b>{counts.unassigned}</b><span>Unassigned</span></div>
          <div className={counts.breached ? 'red' : ''}><b>{counts.breached}</b><span>SLA breached</span></div>
        </div>
        <div className="fd-seg" role="tablist">
          {(['all', 'attention', 'unassigned'] as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'attention' ? 'Needs attention' : 'Unassigned'} <small>{counts[f]}</small>
            </button>
          ))}
        </div>
      </Header>

      <div className="fd-body">
        {loading && !data ? <Spinner label="Loading live jobs…" />
          : error && !data ? <ErrorBox msg={error} onRetry={() => reload()} />
          : shown.length === 0 ? (
            <EmptyBox icon={<Inbox size={30} />} title={jobs.length ? 'Nothing in this filter' : 'No active jobs right now'}
              msg={jobs.length ? 'Switch to “All” to see every active job.' : 'Jobs in your area show up here as soon as they are booked.'} />
          ) : (
            <>
              {error && <div className="fd-banner">Couldn't refresh — showing last data. {error}</div>}
              {groups.map((g) => (
                <section key={g.status} className="fd-group">
                  <h2 className="fd-group-title">{g.label} <span>{g.jobs.length}</span></h2>
                  <div className="fd-list">
                    {g.jobs.map((j) => (
                      <button key={j.id} className={'fd-card fd-job sla-' + j.sla} onClick={() => setOpenId(j.id)}>
                        <div className="fd-card-top">
                          <div className="fd-grow">
                            <div className="fd-title">{j.service}</div>
                            <div className="fd-meta">
                              <span>{j.ref}</span>
                              <span><MapPin size={13} /> {j.zone}</span>
                              <span><Clock size={13} /> {fmtAge(j.ageMin)}</span>
                            </div>
                          </div>
                          <span className={'fd-badge ' + SLA_TONE[j.sla]}>{SLA_LABEL[j.sla]}</span>
                        </div>
                        <div className="fd-job-foot">
                          {j.worker ? <span className="fd-who">{j.worker}</span> : <span className="fd-who none"><UserX size={14} /> No expert yet</span>}
                          {j.escalated && <span className="fd-badge red"><AlertTriangle size={12} /> Escalated</span>}
                          <ChevronRight size={18} className="fd-chev" />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
      </div>

      {open && <JobSheet job={open} pros={data?.pros || []} onClose={() => setOpenId(null)} onChanged={() => reload(true)} />}
    </>
  )
}

function JobSheet({ job, pros, onClose, onChanged }: { job: CTJob; pros: CTPro[]; onClose: () => void; onChanged: () => void }) {
  const { admin } = useStore()
  const toast = useToast()
  const canAssign = has(admin, 'bookings.assign')
  const canOpenBooking = has(admin, 'bookings.view')
  const [picking, setPicking] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Dispatch only accepts an expert from the booking's own zone, so offer just those (available first).
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return pros
      .filter((p) => p.id !== job.workerId && (job.zoneId == null || p.zoneId === job.zoneId) && (!s || p.name.toLowerCase().includes(s)))
      .sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name))
  }, [pros, q, job.workerId, job.zoneId])

  async function reassign() {
    const p = pros.find((x) => x.id === sel)
    if (!p) return
    setSaving(true)
    try {
      const r = await updateBooking(job.id, { workerId: p.id, workerName: p.name })
      toast(r && r.pending ? 'Sent for approval' : `Reassigned to ${p.name}`)
      onChanged(); onClose()
    } catch (e) { toast((e as Error).message, 'err'); setSaving(false) }
  }

  if (picking) {
    return (
      <Sheet title={job.workerId ? 'Reassign expert' : 'Assign expert'} onClose={onClose}
        footer={
          <div className="fd-actions">
            <button className="fd-btn" onClick={() => setPicking(false)}>Back</button>
            <button className="fd-btn fd-btn-primary" disabled={!sel || saving} onClick={reassign}><Check size={18} /> {saving ? 'Saving…' : 'Confirm'}</button>
          </div>
        }>
        {job.zoneId != null && <p className="fd-sub">Active experts in <b>{job.zone}</b>{job.worker ? <> · now with <b>{job.worker}</b></> : null}</p>}
        <div className="fd-search"><Search size={18} /><input placeholder="Search experts" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {list.length === 0 ? <p className="fd-sub" style={{ textAlign: 'center', padding: 20 }}>{q ? 'No experts match.' : `No active experts in ${job.zone}.`}</p> : (
          <div className="fd-picklist">
            {list.map((p) => (
              <button key={p.id} className={'fd-pick' + (sel === p.id ? ' on' : '')} onClick={() => setSel(p.id)}>
                <span className={'fd-dot ' + (p.available ? 'green' : 'grey')} />
                <span className="fd-grow">
                  <b>{p.name}</b>
                  <small>{p.available ? 'Available' : 'Not available'}</small>
                </span>
                {sel === p.id && <Check size={18} />}
              </button>
            ))}
          </div>
        )}
      </Sheet>
    )
  }

  return (
    <Sheet title={job.ref} onClose={onClose}>
      <div className="fd-kv">
        <div><span>Service</span><b>{job.service}</b></div>
        <div><span>Status</span><b>{job.status.replace(/_/g, ' ')}</b></div>
        <div><span>SLA</span><b><span className={'fd-badge ' + SLA_TONE[job.sla]}>{SLA_LABEL[job.sla]}</span> · {fmtAge(job.ageMin)} old</b></div>
        <div><span>Zone</span><b>{job.zone}</b></div>
        <div><span>Slot</span><b>{[job.date, job.time].filter(Boolean).join(' · ') || '—'}</b></div>
        <div><span>Customer</span><b>{job.customer}</b></div>
        <div><span>Expert</span><b>{job.worker || 'Not assigned'}</b></div>
        {job.escalated && <div><span>Escalated</span><b className="fd-red">{job.escalateReason || 'Yes'}</b></div>}
        {job.adminNote && <div><span>Note</span><b>{job.adminNote}</b></div>}
      </div>
      <div className="fd-stack">
        {job.workerPhone && <a className="fd-btn fd-btn-call fd-btn-block" href={telHref(job.workerPhone)}><Phone size={18} /> Call expert</a>}
        {job.customerPhone && <a className="fd-btn fd-btn-block" href={telHref(job.customerPhone)}><Phone size={18} /> Call customer</a>}
        {canAssign && <button className="fd-btn fd-btn-primary fd-btn-block" onClick={() => setPicking(true)}><Repeat2 size={18} /> {job.workerId ? 'Reassign' : 'Assign expert'}</button>}
        {canOpenBooking && <Link className="fd-btn fd-btn-block" to={`/bookings/${job.id}`}><ExternalLink size={18} /> Open full booking</Link>}
      </div>
    </Sheet>
  )
}
