import { useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, ImageIcon, X, Info } from 'lucide-react'
import { useToast } from '../../components/UI'
import { reviewBooking } from '../../api'

// Module 7 · #53 — Upload Photos (optional). Submits the whole review — rating/feedback/tags from the
// previous step + the first attached photo — via the real reviewBooking API.
export default function UploadPhotos() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const loc = useLocation()
  const st = (loc.state || {}) as { rating?: number; text?: string; tags?: string[] }
  const fileRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  function add(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > 4 * 1024 * 1024) return toast('Image too large (max 4MB)')
    const r = new FileReader(); r.onload = () => setPhotos((p) => [...p, r.result as string]); r.readAsDataURL(f)
    e.target.value = ''
  }

  async function submit() {
    setBusy(true)
    const review = [st.text, (st.tags || []).join(', ')].filter(Boolean).join(' | ')
    try {
      await reviewBooking(Number(id), st.rating ?? 5, review, photos[0])
      toast('Thanks for your feedback! ⭐')
      setTimeout(() => nav('/bookings', { replace: true }), 700)
    } catch (e) { toast((e as Error).message); setBusy(false) }
  }

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Upload Photos</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll">
        <div className="up-illo"><ImageIcon size={40} /></div>
        <h2 className="up-title">Add photos (Optional)</h2>
        <p className="up-sub">Help others know what to expect</p>

        <div className="up-label">Add Before / After Photos</div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={add} />
        <div className="up-grid">
          {photos.map((p, i) => (
            <div className="up-thumb" key={i}><img src={p} alt="" /><button onClick={() => setPhotos((a) => a.filter((_, j) => j !== i))}><X size={13} /></button></div>
          ))}
          <button className="up-add" onClick={() => fileRef.current?.click()}><Camera size={22} /><span>Add More</span></button>
        </div>

        <div className="up-note"><Info size={16} /> Photos you upload will be used to improve our service quality.</div>
      </div>

      <div className="jt-foot">
        <button className="jt-btn" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Continue'}</button>
      </div>
    </div>
  )
}
