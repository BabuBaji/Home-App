import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Heart } from 'lucide-react'
import { fetchFavExperts, saveFavExpert, removeFavExpert } from '../../api'
import { Loading } from '../../components/UI'
import { useJob, proName, serviceNames } from '../job/useJob'
import { WorkerAvatar } from '../job/parts'
import { t } from '../../i18n'

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
  const toggle = (tag: string) => setTags((p) => p.includes(tag) ? p.filter((x) => x !== tag) : [...p, tag])
  const when = [b.date, b.time].filter(Boolean).join(', ')

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav('/home')} aria-label={t('Back')}><ArrowLeft size={22} /></button>
        <b>{t('Rate Your Experience')}</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll">
        <div className="rt-who">
          <WorkerAvatar b={b} size={64} />
          <div className="jt-worker-name">{proName(b)}</div>
          <div className="rt-who-svc">{serviceNames(b)}</div>
          {when && <div className="rt-who-when">{when}</div>}
          {b.worker_id && <FavButton wid={b.worker_id} name={proName(b).split(' ')[0]} />}
        </div>

        <div className="rt-q">{t('How was your overall experience?')}</div>
        <div className="jt-stars big">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>★</span>)}</div>
        <div className="rt-lbl">{rating > 0 ? t(LABELS[rating]) : t('Tap a star to rate')}</div>

        <div className="rt-field">
          <label>{t('Share your feedback (Optional)')}</label>
          <textarea maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Tell us about your experience…')} />
          <span className="rt-count">{text.length}/300</span>
        </div>

        <div className="rt-quick">
          {QUICK.map((q) => <button key={q} className={`rt-pill ${tags.includes(q) ? 'on' : ''}`} onClick={() => toggle(q)}>{t(q)}</button>)}
        </div>
      </div>

      <div className="jt-foot">
        <button className="jt-btn" disabled={rating === 0}
          onClick={() => nav(`/rate/${b.id}/photos`, { state: { rating, text, tags } })}>
          {rating === 0 ? t('Select a rating') : t('Continue')}
        </button>
      </div>
    </div>
  )
}

/** Save the expert so the customer can pick them again when booking (only after they served them). */
function FavButton({ wid, name }: { wid: number; name: string }) {
  const [fav, setFav] = useState<boolean | null>(null)
  useEffect(() => { fetchFavExperts().then((l) => setFav(l.some((x) => x.id === wid))).catch(() => setFav(false)) }, [wid])
  if (fav === null) return null
  const toggle = () => (fav ? removeFavExpert(wid) : saveFavExpert(wid)).then(() => setFav(!fav)).catch(() => {})
  return (
    <button className="btn-ghost" onClick={toggle} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Heart size={16} fill={fav ? '#e5484d' : 'none'} color={fav ? '#e5484d' : 'currentColor'} />
      {fav ? t('{name} is a favourite', { name }) : t('Save {name} as favourite', { name })}
    </button>
  )
}
