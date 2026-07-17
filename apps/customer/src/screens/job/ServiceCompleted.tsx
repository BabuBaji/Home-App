import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Loading } from '../../components/UI'
import { useJob } from './useJob'

// Module 6 · #51 — Service Completed. Uses the real completed_at timestamp. The star row seeds the
// rating and jumps into the Module-7 rating flow; Pay & Tip opens the tip screen.
export default function ServiceCompleted() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b } = useJob(id, false)
  const [stars, setStars] = useState(0)

  if (!b) return <div className="screen jt"><Loading /></div>
  const completedAt = b.completed_at ? new Date(b.completed_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '—'

  return (
    <div className="screen jt">
      <div className="content jt-scroll jt-center">
        <div className="jt-check"><Check size={40} strokeWidth={3} /></div>
        <h2 className="jt-done-title">Service Completed!</h2>
        <p className="jt-done-sub">Thank you for choosing our service.</p>

        <div className="jt-card jt-kv"><span>Completed At</span><b>{completedAt}</b></div>

        <div className="jt-sc-rate">
          <div className="jt-sc-rate-q">How was your experience?</div>
          <div className="jt-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={n <= stars ? 'on' : ''} onClick={() => { setStars(n); nav(`/rate/${b.id}?stars=${n}`) }}>★</span>
            ))}
          </div>
        </div>
      </div>

      <div className="jt-foot col">
        <button className="jt-btn" onClick={() => nav(`/tip/${b.id}`)}>Pay &amp; Tip</button>
        <button className="jt-btn ghost" onClick={() => nav('/home')}>Back to Home</button>
      </div>
    </div>
  )
}
