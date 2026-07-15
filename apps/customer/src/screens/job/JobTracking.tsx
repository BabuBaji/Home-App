import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Share2, MoreVertical, Check, Phone, Star, ChevronRight, MessageCircle } from 'lucide-react'
import { Loading } from '../../components/UI'
import { useJob, proName, proRating, serviceNames, fmtDateTime } from './useJob'
import { WorkerAvatar, MiniTimeline } from './parts'

// Module 6 · #42 — Worker Assigned. Everything is real booking data (ref, service, date, address,
// assigned worker) polled from /api/bookings/:id. Hub for the rest of the live-job screens.
export default function JobTracking() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b } = useJob(id)

  if (!b) return <div className="screen jt"><Loading /></div>

  const jobs = b.pro?.jobs ?? b.pro?.servicesDone
  const assigned = !!(b.pro?.name || (b.pro_name && b.pro_name.trim()))
  // Tapping Call opens the device dialer directly with the worker's real number. If no number is
  // on file yet (not assigned), fall back to the in-app call screen.
  const call = () => { const ph = b.pro?.phone; if (ph) window.location.href = `tel:${ph}`; else nav(`/job/${b.id}/call`) }

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav('/home')} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Booking Details</b>
        <div className="jt-top-r">
          <button className="jt-ic" aria-label="Share"><Share2 size={19} /></button>
          <button className="jt-ic" aria-label="More"><MoreVertical size={19} /></button>
        </div>
      </div>

      <div className="content jt-scroll">
        <div className="jt-hero">
          <div className="jt-hero-ava">
            <WorkerAvatar b={b} size={92} />
            {assigned && <span className="jt-hero-check"><Check size={16} strokeWidth={3} /></span>}
          </div>
          <h2>{assigned ? 'Worker Assigned!' : 'Confirming your expert…'}</h2>
          <p>{assigned
            ? `Your booking is confirmed. ${proName(b).split(' ')[0]} has been assigned to your service.`
            : 'Your booking is confirmed. We are assigning the best expert near you — this usually takes a moment.'}</p>
        </div>

        <div className="jt-card jt-details">
          <Row label="Booking ID" value={b.ref} />
          <Row label="Service" value={serviceNames(b)} />
          <Row label="Date & Time" value={fmtDateTime(b)} />
          <Row label="Address" value={b.address} />
        </div>

        {assigned ? (
          <button className="jt-card jt-worker" onClick={() => nav(`/job/${b.id}/worker`)}>
            <WorkerAvatar b={b} size={50} />
            <div className="jt-worker-main">
              <div className="jt-worker-name">{proName(b)}</div>
              <div className="jt-worker-sub"><Star size={13} className="jt-star" /> {proRating(b)}{jobs != null ? ` · ${jobs} jobs` : ''}</div>
              {b.pro?.phone && <div className="jt-worker-phone"><Phone size={12} /> {b.pro.phone}</div>}
              <div className="jt-worker-link">View profile</div>
            </div>
            <span className="jt-worker-call" onClick={(e) => { e.stopPropagation(); call() }} aria-label="Call worker"><Phone size={18} /></span>
          </button>
        ) : (
          <div className="jt-card jt-worker pending">
            <span className="jt-ava jt-ava-init" style={{ width: 50, height: 50, fontSize: 20 }}>…</span>
            <div className="jt-worker-main">
              <div className="jt-worker-name">Assigning your expert…</div>
              <div className="jt-worker-sub">Finding someone near you</div>
            </div>
          </div>
        )}

        <StatusAction status={b.status} onGo={(p) => nav(`/job/${b.id}/${p}`)} />

        <MiniTimeline status={b.status} />
      </div>

      <div className="jt-foot">
        <button className="jt-btn ghost" onClick={() => nav(`/job/${b.id}/chat`)}><MessageCircle size={17} /> Chat</button>
        <button className="jt-btn" onClick={call}><Phone size={17} /> Call</button>
      </div>
    </div>
  )
}

// Contextual next-step button that routes to the matching Module-6 screen for the live status.
function StatusAction({ status, onGo }: { status: string; onGo: (p: string) => void }) {
  const map: Record<string, { label: string; path: string }> = {
    worker_assigned: { label: 'Worker is on the way', path: 'otw' },
    on_the_way: { label: 'Track on live map', path: 'map' },
    arrived: { label: 'Share start OTP', path: 'otp' },
    in_progress: { label: 'View live progress', path: 'progress' },
    completed: { label: 'View service summary', path: 'completed' },
  }
  const a = map[status]
  if (!a) return null
  return <button className="jt-status-cta" onClick={() => onGo(a.path)}>{a.label}<ChevronRight size={18} /></button>
}

function Row({ label, value, multiline }: { label: string; value?: string; multiline?: boolean }) {
  return (
    <div className={`jt-row ${multiline ? 'col' : ''}`}>
      <span className="jt-row-l">{label}</span>
      <span className="jt-row-v">{value || '—'}</span>
    </div>
  )
}
