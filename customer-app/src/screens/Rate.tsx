import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header, FooterCTA, useToast } from '../components/UI'
import { reviewBooking } from '../api'

const TAGS = [
  { id: 'punct', label: 'Punctuality', icon: '⏱' }, { id: 'prof', label: 'Professionalism', icon: '🧑‍💼' },
  { id: 'quality', label: 'Quality of Work', icon: '🏅' }, { id: 'behavior', label: 'Behavior', icon: '🙂' },
  { id: 'value', label: 'Value for Money', icon: '₹' }, { id: 'clean', label: 'Cleanliness', icon: '✨' },
]

export default function Rate() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('Great service! Very punctual and professional.')
  const [tags, setTags] = useState<string[]>([])
  const [photo, setPhoto] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const toggle = (t: string) => setTags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > 4 * 1024 * 1024) return toast('Image too large (max 4MB)')
    const r = new FileReader(); r.onload = () => setPhoto(r.result as string); r.readAsDataURL(f)
  }

  async function submit() {
    setBusy(true)
    const tagTxt = tags.map((t) => TAGS.find((x) => x.id === t)?.label).join(', ')
    try { await reviewBooking(Number(id), rating, [text, tagTxt].filter(Boolean).join(' | '), photo || undefined); toast('Thanks for your feedback! ⭐'); setTimeout(() => nav('/bookings', { replace: true }), 800) }
    catch (e) { toast((e as Error).message); setBusy(false) }
  }

  return (
    <div className="screen">
      <Header title="Rate Your Experience" />
      <div className="content pad-cta">
        <div className="rate-hero">👩🏻‍🔧✨</div>
        <h2 className="rate-q">How was your experience?</h2>
        <div className="stars">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>★</span>)}</div>

        <div className="label normal">Add a review (optional)</div>
        <textarea className="review-area" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="char-count">{text.length}/500</div>

        <div className="tagwrap">
          <div className="tw-title">What did you like?</div>
          <div className="tags">{TAGS.map((t) => <button key={t.id} className={`tag ${tags.includes(t.id) ? 'on' : ''}`} onClick={() => toggle(t.id)}><span>{t.icon}</span> {t.label}</button>)}</div>
        </div>

        <div className="label normal">Add a photo (for complaints / proof)</div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
        {photo ? (
          <div className="photo-prev"><img src={photo} alt="upload" /><button className="rm" onClick={() => setPhoto('')}>✕</button></div>
        ) : (
          <button className="upload-box" onClick={() => fileRef.current?.click()}>📷 Tap to upload a photo</button>
        )}
      </div>
      <FooterCTA>
        <button className="btn full" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit Review'}</button>
        <button className="btn-text full" onClick={() => nav('/bookings', { replace: true })}>Skip</button>
      </FooterCTA>
    </div>
  )
}
