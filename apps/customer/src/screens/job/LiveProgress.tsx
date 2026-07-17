import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react'
import { Loading } from '../../components/UI'
import { useJob } from './useJob'

// Module 6 · #50 — Live Progress. Overall % is derived from the REAL service timer (elapsed vs the
// booked duration), the same math the live Track screen uses. Per-task ticks are only shown once the
// service is completed (the backend tracks overall status, not per-sub-task), so nothing is faked.
const DUR_MIN: Record<string, number> = { '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }

export default function LiveProgress() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b } = useJob(id)
  const [, tick] = useState(0)
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(i) }, [])

  if (!b) return <div className="screen jt"><Loading /></div>

  const done = b.status === 'completed'
  const targetMin = DUR_MIN[b.items[0]?.durationId] ?? 60
  const startedMs = b.started_at ? new Date(b.started_at).getTime() : Date.now()
  const targetSec = targetMin * 60
  const elapsed = done ? targetSec : Math.max(0, Math.floor((Date.now() - startedMs) / 1000))
  const pct = done ? 100 : Math.min(99, Math.round((elapsed / targetSec) * 100))
  const tasks = (b.items || []).map((i) => i.name)

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Live Progress</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll">
        <div className="jt-lp-card">
          <div className="jt-lp-head">
            <span className={`jt-lp-badge ${done ? 'done' : ''}`}>{done ? 'Completed' : 'In Progress'}</span>
            <span className="jt-lp-ill">🧹</span>
          </div>
          <div className="jt-lp-sub">{done ? 'Service completed' : 'Service in progress'}</div>
          <div className="jt-lp-bar"><span style={{ width: `${pct}%` }} /></div>
          <div className="jt-lp-pct">{pct}%</div>
        </div>

        <h4 className="jt-lp-tasks-h">Tasks</h4>
        <div className="jt-lp-tasks">
          {tasks.map((t) => (
            <div key={t} className={`jt-lp-task ${done ? 'ok' : ''}`}>
              {done ? <CheckCircle2 size={19} className="jt-lp-ok" /> : <Circle size={19} className="jt-lp-pending" />}
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="jt-foot">
        {done
          ? <button className="jt-btn" onClick={() => nav(`/job/${b.id}/completed`)}>View Summary</button>
          : <button className="jt-btn" onClick={() => nav(`/track/${b.id}`)}>View Details</button>}
      </div>
    </div>
  )
}
