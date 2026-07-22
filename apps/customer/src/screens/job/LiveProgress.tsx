import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Phone, MessageCircle, Star, BadgeCheck, MapPin, Sparkles, CheckCircle2 } from 'lucide-react'
import { Loading } from '../../components/UI'
import { useJob, proName, proRating } from './useJob'
import { WorkerAvatar } from './parts'

// Module 6 · #50 — Live Progress. A circular service timer (elapsed vs the booked duration — the same
// real math the Track screen uses) plus who's working, what service is running, and where. Nothing is
// faked: per-task ticks only fill once the backend marks the booking completed.
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
  const remaining = done ? 0 : Math.max(0, targetSec - elapsed)
  const frac = done ? 1 : Math.min(1, elapsed / targetSec)
  const pct = done ? 100 : Math.min(99, Math.round(frac * 100))
  // circular timer geometry — ring fills as elapsed approaches the booked duration
  const R = 86, CIRC = 2 * Math.PI * R
  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  const jobs = b.pro?.jobs ?? b.pro?.servicesDone ?? 0
  const verified = !!b.pro?.verified
  const assigned = !!(b.pro?.name || (b.pro_name && b.pro_name.trim()))
  const call = () => { const ph = b.pro?.phone; if (ph) window.location.href = `tel:${ph}`; else nav(`/job/${b.id}/call`) }
  const chat = () => nav(`/job/${b.id}/chat`)

  const addr = b.addr
  const flat = addr ? [addr.house, addr.apartment, addr.floor && `Floor ${addr.floor}`].filter(Boolean).join(', ') : ''
  const area = addr?.line || b.address || ''

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Live Progress</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll">
        {/* circular timer */}
        <div className={`jt-timer-card ${done ? 'done' : ''}`}>
          <span className={`jt-lp-badge ${done ? 'done' : ''}`}>{done ? 'Completed' : 'In Progress'}</span>
          <div className="jt-timer">
            <svg viewBox="0 0 200 200" className="jt-timer-svg" aria-hidden="true">
              <circle cx="100" cy="100" r={R} className="jt-timer-track" />
              <circle cx="100" cy="100" r={R} className="jt-timer-fill"
                strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - frac)} transform="rotate(-90 100 100)" />
            </svg>
            <div className="jt-timer-center">
              <div className="jt-timer-emoji">{done ? '✅' : '🧹'}</div>
              <div className="jt-timer-time">{done ? 'Done' : mmss(remaining)}</div>
              <div className="jt-timer-lbl">{done ? '100% complete' : 'remaining'}</div>
            </div>
          </div>
          <div className="jt-timer-meta">
            <span>Elapsed <b>{mmss(elapsed)}</b></span>
            <span className="jt-timer-pct">{pct}%</span>
            <span>Booked <b>{targetMin} min</b></span>
          </div>
        </div>

        {/* who's working */}
        {assigned && (
          <div className="jt-lp-sec-h"><Sparkles size={15} /> Your Expert</div>
        )}
        {assigned && (
          <div className="jt-card jt-worker2 jt-lp-worker">
            <button className="jt-worker2-ava" onClick={() => nav(`/job/${b.id}/worker`)} aria-label="Worker profile">
              <WorkerAvatar b={b} size={48} /><span className="jt-online" />
            </button>
            <button className="jt-worker2-main" onClick={() => nav(`/job/${b.id}/worker`)}>
              <div className="jt-worker2-name">{proName(b)}{verified && <BadgeCheck size={15} className="jt-vcheck" />}</div>
              <div className="jt-worker2-sub"><Star size={12} className="jt-star" /> {proRating(b)} · {jobs} jobs</div>
              <div className="jt-lp-w-status"><span className="jt-lp-dot" /> {done ? 'Service finished' : 'Working on your service now'}</div>
            </button>
            <button className="jt-wmini ghost" onClick={chat} aria-label="Chat"><MessageCircle size={17} /></button>
            <button className="jt-wmini" onClick={call} aria-label="Call"><Phone size={17} /></button>
          </div>
        )}

        {/* what's being done */}
        <div className="jt-lp-sec-h"><CheckCircle2 size={15} /> {done ? 'Service completed' : 'Service in progress'}</div>
        <div className="jt-card jt-lp-svc-card">
          {(b.items || []).map((i) => (
            <div key={i.id} className="jt-lp-svc">
              <span className="jt-lp-svc-img">
                <img src={`/services/${i.id}.jpg`} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              </span>
              <div className="jt-lp-svc-main">
                <b>{i.name}</b>
                <small>{i.durationLabel || `${targetMin} min`}{b.ref ? ` · ${b.ref}` : ''}</small>
              </div>
              <span className={`jt-lp-svc-tag ${done ? 'done' : ''}`}>{done ? 'Done' : 'Live'}</span>
            </div>
          ))}
        </div>

        {/* where */}
        {area && (<>
          <div className="jt-lp-sec-h"><MapPin size={15} /> Service location</div>
          <div className="jt-card jt-lp-loc-card">
            <div className="jt-lp-loc">
              <span className="jt-addr-ic"><MapPin size={16} /></span>
              <div className="jt-lp-loc-main">
                {flat && <div className="jt-lp-loc-flat">{flat}</div>}
                <div className="jt-lp-loc-area">{area}</div>
              </div>
            </div>
            <button className="jt-addr-map" onClick={() => nav(`/job/${b.id}/map`)}><MapPin size={16} /> View on Map</button>
          </div>
        </>)}
      </div>

      <div className="jt-foot">
        {done
          ? <button className="jt-btn" onClick={() => nav(`/job/${b.id}/completed`)}>View Summary</button>
          : <button className="jt-btn" onClick={() => nav(`/job/${b.id}`)}>View Booking Details</button>}
      </div>
    </div>
  )
}
