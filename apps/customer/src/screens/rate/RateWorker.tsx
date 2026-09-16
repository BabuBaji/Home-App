import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Loading } from '../../components/UI'
import { useJob, proName, serviceNames } from '../job/useJob'
import { WorkerAvatar } from '../job/parts'

// Module 7 · #52 — Rate Your Experience. Worker + service + date are real booking data. Rating,
// feedback and quick-tags are carried to the Upload-Photos step, which submits via reviewBooking.
const LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent']
const QUICK = ['On-time', 'Polite', 'Thorough', 'Professional']

export default function RateWorker() {
  const { id } = useParams()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { b } = useJob(id, false)
  // No star is pre-selected — the customer decides by tapping. (A ?stars= hint from a prior screen
  // is still honoured, but the default is 0 = unrated, so we never assume a 5-star review.)
  const [rating, setRating] = useState(Number(sp.get('stars')) || 0)
  const [text, setText] = useState('')
  const [tags, setTags] = useState<string[]>([])

  if (!b) return <div className="screen jt"><Loading /></div>
  const toggle = (t: string) => setTags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])
  const when = [b.date, b.time].filter(Boolean).join(', ')

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav('/home')} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Rate Your Experience</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll">
        <div className="rt-who">
          <WorkerAvatar b={b} size={64} />
          <div className="jt-worker-name">{proName(b)}</div>
          <div className="rt-who-svc">{serviceNames(b)}</div>
          {when && <div className="rt-who-when">{when}</div>}
        </div>

        <div className="rt-q">How was your overall experience?</div>
        <div className="jt-stars big">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>★</span>)}</div>
        <div className="rt-lbl">{rating > 0 ? LABELS[rating] : 'Tap a star to rate'}</div>

        <div className="rt-field">
          <label>Share your feedback (Optional)</label>
          <textarea maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell us about your experience…" />
          <span className="rt-count">{text.length}/300</span>
        </div>

        <div className="rt-quick">
          {QUICK.map((q) => <button key={q} className={`rt-pill ${tags.includes(q) ? 'on' : ''}`} onClick={() => toggle(q)}>{q}</button>)}
        </div>
      </div>

      <div className="jt-foot">
        <button className="jt-btn" disabled={rating === 0}
          onClick={() => nav(`/rate/${b.id}/photos`, { state: { rating, text, tags } })}>
          {rating === 0 ? 'Select a rating' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
