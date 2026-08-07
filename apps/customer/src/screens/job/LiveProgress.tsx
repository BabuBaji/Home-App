import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Phone, MessageCircle, Star, BadgeCheck, MapPin, Sparkles, CheckCircle2 } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { fetchExtensions, completeBooking, type ExtensionState } from '../../api'
import { useJob, proName, proRating } from './useJob'
import { WorkerAvatar } from './parts'

// Module 6 · #50 — Live Progress. A circular service timer (elapsed vs the booked duration — the same
// real math the Track screen uses) plus who's working, what service is running, and where. Nothing is
// faked: per-task ticks only fill once the backend marks the booking completed.
const DUR_MIN: Record<string, number> = { '30m': 30, '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }

export default function LiveProgress() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { b } = useJob(id)
  const [, tick] = useState(0)
  const [ending, setEnding] = useState(false)     // confirm sheet open
  const [busy, setBusy] = useState(false)
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(i) }, [])

  // Extension state: a pending ask needs answering, and approved minutes lengthen the timer below.
  const [ext, setExt] = useState<ExtensionState | null>(null)
  useEffect(() => {
    if (!b?.id || b.status !== 'in_progress') return
    let stop = false
    const load = () => fetchExtensions(b.id).then((d) => { if (!stop) setExt(d) }).catch(() => {})
    load()
    const iv = setInterval(load, 8000)
    return () => { stop = true; clearInterval(iv) }
  }, [b?.id, b?.status])

  if (!b) return <div className="screen jt"><Loading /></div>

  const done = b.status === 'completed'
  // Approved extra time counts towards the countdown, so the ring doesn't sit at 100% for the
  // whole extension. Booked and extra are kept apart for the caption — 60 min was booked, the
  // rest was granted later.
  const bookedMin = DUR_MIN[b.items[0]?.durationId] ?? 60
  const extraMin = ext?.extensionMinutes ?? 0
  const targetMin = bookedMin + extraMin
  const startedMs = b.started_at ? new Date(b.started_at).getTime() : Date.now()
  // The server owns where the clock ends: time approved after an overrun runs FROM approval, which
  // start + booked + extra cannot express. Fall back to that sum when the job was never extended.
  const endMs = b.service_end_at ? new Date(b.service_end_at).getTime() : startedMs + targetMin * 60000
  const targetSec = Math.max(60, Math.round((endMs - startedMs) / 1000))
  const rawElapsed = Math.max(0, Math.floor((Date.now() - startedMs) / 1000))
  // Freeze at the target once the time is up, exactly as the worker's timer does. Left running it
  // would climb past the booked length ("Elapsed 95:20 / Booked 90 min") while remaining sat at 0.
  const timeUp = !done && rawElapsed >= targetSec
  // How far past the booked time the expert has gone — shown so the stopped clock is explained
  // rather than just sitting there.
  const overrunMin = timeUp ? Math.floor((rawElapsed - targetSec) / 60) : 0
  const elapsed = done || timeUp ? targetSec : rawElapsed
  const remaining = done ? 0 : Math.max(0, targetSec - rawElapsed)
  const frac = done ? 1 : Math.min(1, rawElapsed / targetSec)
  const pct = done ? 100 : Math.min(99, Math.round(frac * 100))
  // circular timer geometry — ring fills as elapsed approaches the booked duration
  const R = 86, CIRC = 2 * Math.PI * R
  // Past an hour mm:ss reads as "90:04", which looks like minutes-that-aren't. Roll over to h:mm:ss.
  const mmss = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
    const pad = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
  }

  const jobs = b.pro?.jobs ?? b.pro?.servicesDone ?? 0
  const verified = !!b.pro?.verified
  const assigned = !!(b.pro?.name || (b.pro_name && b.pro_name.trim()))
  const call = () => { const ph = b.pro?.phone; if (ph) window.location.href = `tel:${ph}`; else nav(`/job/${b.id}/call`) }
  const chat = () => nav(`/job/${b.id}/chat`)

  // Customer-side finish: the same /complete endpoint the Track screen uses, so it settles the
  // booking (payout + cashback) exactly as a worker-ended job does. Confirmed first — it closes
  // the job for both sides and can't be undone from here.
  async function endService() {
    if (busy) return
    setBusy(true)
    try {
      await completeBooking(b!.id)
      setEnding(false)
      nav(`/rate/${b!.id}`, { replace: true })
    } catch (e) { toast((e as Error).message); setBusy(false) }
  }

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
        {/* The expert is waiting on an answer — put it above everything else. */}
        {ext?.pending && (
          <button
            className="jt-card"
            style={{ width: '100%', textAlign: 'left', borderColor: '#6D4AFF', background: '#F3F0FF', cursor: 'pointer' }}
            onClick={() => nav(`/job/${b.id}/extend`)}
          >
            <b style={{ display: 'block' }}>{proName(b)} needs {ext.pending.minutes} more minutes</b>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {ext.pending.price > 0 ? `Additional ₹${ext.pending.price} · tap to approve or decline` : 'No extra charge · tap to review'}
            </span>
          </button>
        )}
        {/* Already granted — explains why the countdown is longer than the booked time. */}
        {!ext?.pending && !!ext?.extensionMinutes && (
          <div className="jt-card" style={{ borderColor: '#6D4AFF' }}>
            <b style={{ display: 'block' }}>Service Extended</b>
            <span className="muted" style={{ fontSize: 12.5 }}>
              +{ext.extensionMinutes} min added{ext.extensionTotal > 0 ? ` · ₹${ext.extensionTotal} paid` : ''}
            </span>
          </div>
        )}

        {/* circular timer */}
        <div className={`jt-timer-card ${done ? 'done' : ''}`}>
          <span className={`jt-lp-badge ${done ? 'done' : ''}`}>
            {done ? 'Completed' : timeUp ? 'Scheduled Time Completed' : 'In Progress'}
          </span>
          <div className="jt-timer">
            <svg viewBox="0 0 200 200" className="jt-timer-svg" aria-hidden="true">
              <circle cx="100" cy="100" r={R} className="jt-timer-track" />
              <circle cx="100" cy="100" r={R} className="jt-timer-fill"
                strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - frac)} transform="rotate(-90 100 100)" />
            </svg>
            <div className="jt-timer-center">
              <div className="jt-timer-emoji">{done ? '✅' : timeUp ? '⏱' : '🧹'}</div>
              {/* A frozen 00:00 under "remaining" reads as a broken clock. Say what actually
                  happened: the booked time is over and the expert is wrapping up. */}
              <div className="jt-timer-time">{done ? 'Done' : timeUp ? 'Time up' : mmss(remaining)}</div>
              <div className="jt-timer-lbl">
                {done ? '100% complete' : timeUp ? `booked time over${overrunMin > 0 ? ` · +${overrunMin} min` : ''}` : 'remaining'}
              </div>
            </div>
          </div>
          <div className="jt-timer-meta">
            <span>Elapsed <b>{mmss(elapsed)}</b></span>
            <span className="jt-timer-pct">{pct}%</span>
            <span>Booked <b>{bookedMin} min</b>{extraMin > 0 && <> +<b>{extraMin}</b></>}</span>
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
            {/* No "View on Map" here: once the expert has started, they're at the address — the
                map only answers "where are they now?", which is a pre-arrival question. It stays
                on Booking Details for that stage. */}
            <div className="jt-lp-loc">
              <span className="jt-addr-ic"><MapPin size={16} /></span>
              <div className="jt-lp-loc-main">
                {flat && <div className="jt-lp-loc-flat">{flat}</div>}
                <div className="jt-lp-loc-area">{area}</div>
              </div>
            </div>
          </div>
        </>)}
      </div>

      <div className="jt-foot">
        {done ? (
          <button className="jt-btn" onClick={() => nav(`/job/${b.id}/completed`)}>View Summary</button>
        ) : (<>
          <button className="jt-btn ghost" onClick={() => nav(`/job/${b.id}`)}>Booking Details</button>
          {/* The customer can close the job themselves — useful when the expert has finished but
              hasn't ended it on their app. */}
          <button className="jt-btn" onClick={() => setEnding(true)}><CheckCircle2 size={16} /> End Service</button>
        </>)}
      </div>

      {ending && (
        <div className="cf-backdrop" onClick={() => !busy && setEnding(false)}>
          <div className="cf-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cf-title">End this service?</div>
            <div className="cf-text">
              {timeUp
                ? 'The booked time is over. '
                : `${mmss(remaining)} of the booked ${bookedMin} min is still left. `}
              Ending marks the job complete for {proName(b)} and finalises payment. You'll be asked to rate it next.
            </div>
            <div className="cf-btns">
              <button className="cf-cancel" onClick={() => setEnding(false)} disabled={busy}>Not yet</button>
              <button className="cf-del" onClick={endService} disabled={busy}>{busy ? 'Ending…' : 'End Service'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
