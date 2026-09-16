import { useRef, useState } from 'react'
import { Camera as CameraIcon, Image as ImageIcon, Trash2 } from 'lucide-react'
import { Header, useToast } from '../components/UI'
import { useStore } from '../store'
import { updateMe, uploadAvatar, removeAvatar } from '../api'
import { pickPhoto, isCancelled, type PhotoSource } from '../photo'
import PhotoCropper from '../components/PhotoCropper'
import type { User } from '../types'

// Editable personal details. Name / email / city save to the account; the mobile number
// is the login identity and is shown read-only. The profile photo uploads to the media
// bucket via POST /api/me/avatar and is reflected everywhere `user.avatar` is rendered.
export default function PersonalInfo() {
  const toast = useToast()
  const { user, setUser } = useStore()
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [city, setCity] = useState(user?.city || '')
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [sheet, setSheet] = useState(false)          // camera / gallery / remove chooser
  const [cropping, setCropping] = useState<Blob | null>(null)   // chosen image, awaiting framing
  // Shown while the upload is in flight so the new photo appears immediately.
  const preview = useRef<string>('')

  const dirty = name.trim() !== (user?.name || '') || email.trim() !== (user?.email || '') || city.trim() !== (user?.city || '')

  async function save() {
    if (!name.trim()) return toast('Please enter your name')
    setBusy(true)
    try {
      const { user: u } = await updateMe({ name: name.trim(), email: email.trim(), city: city.trim() } as Partial<User>)
      setUser(u)
      toast('Details saved')
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  // Pick -> frame in the cropper -> upload. Nothing is sent until the framing is confirmed.
  async function choose(source: PhotoSource) {
    setSheet(false)
    setPhotoBusy(true)
    try {
      const blob = await pickPhoto(source)
      if (blob) setCropping(blob)                    // null = dismissed the picker
    } catch (e) {
      // Surface the real reason — a silent failure here looks like "the cropper never opened".
      if (!isCancelled(e)) toast(`Camera: ${(e as Error).message || 'could not open'}`)
    } finally { setPhotoBusy(false) }
  }

  async function upload(cropped: Blob) {
    setCropping(null)
    setPhotoBusy(true)
    try {
      if (preview.current) URL.revokeObjectURL(preview.current)
      preview.current = URL.createObjectURL(cropped)
      const { user: u } = await uploadAvatar(cropped)
      setUser(u)
      toast('Profile photo updated')
    } catch (e) {
      toast((e as Error).message || 'Could not update the photo')
    } finally { setPhotoBusy(false) }
  }

  async function clearPhoto() {
    setSheet(false)
    setPhotoBusy(true)
    try {
      if (preview.current) { URL.revokeObjectURL(preview.current); preview.current = '' }
      const { user: u } = await removeAvatar()
      setUser(u)
      toast('Profile photo removed')
    } catch (e) { toast((e as Error).message) } finally { setPhotoBusy(false) }
  }

  const shown = user?.avatar || preview.current

  return (
    <div className="screen">
      <Header title="Personal Information" />
      <div className="content pad-cta">
        <div className="pi-photo">
          <button className="pi-ava" onClick={() => setSheet(true)} disabled={photoBusy} aria-label="Change profile photo">
            {shown
              ? <img src={shown} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              : <span className="pi-ava-ph">{user?.provider === 'google' ? '🧑' : '👨🏻'}</span>}
            <span className="pi-ava-cam"><CameraIcon size={15} /></span>
          </button>
          <div>
            <h2>{user?.name || 'Your profile'}</h2>
            <div className="li">📞 {user?.phone || '—'}</div>
            <button className="pi-photo-link" onClick={() => setSheet(true)} disabled={photoBusy}>
              {photoBusy ? 'Updating…' : shown ? 'Change photo' : 'Add photo'}
            </button>
          </div>
        </div>

        <div className="label normal">Full name</div>
        <div className="field"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>

        <div className="label normal">Email</div>
        <div className="field"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>

        <div className="label normal">Mobile number</div>
        <div className="field" style={{ opacity: .7 }}><input value={user?.phone || '—'} disabled /></div>
        <div className="muted sm" style={{ margin: '-8px 2px 4px' }}>Your mobile number is your login and can’t be changed here.</div>

        <div className="label normal">City</div>
        <div className="field"><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" /></div>

        <button className="btn full" style={{ marginTop: 18 }} onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>

      {cropping && <PhotoCropper src={cropping} onCancel={() => setCropping(null)} onDone={upload} />}

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(false)}>
          <div className="pi-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pi-sheet-h">Profile photo</div>
            <button className="pi-sheet-row" onClick={() => choose('camera')}><CameraIcon size={19} /> Take a photo</button>
            <button className="pi-sheet-row" onClick={() => choose('gallery')}><ImageIcon size={19} /> Choose from gallery</button>
            {shown && <button className="pi-sheet-row danger" onClick={clearPhoto}><Trash2 size={19} /> Remove photo</button>}
            <button className="pi-sheet-row cancel" onClick={() => setSheet(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
