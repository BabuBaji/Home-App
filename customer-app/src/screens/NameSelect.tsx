import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/UI'
import { useStore } from '../store'
import { updateMe } from '../api'

export default function NameSelect() {
  const nav = useNavigate()
  const toast = useToast()
  const { user, setUser } = useStore()
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [busy, setBusy] = useState(false)

  async function next() {
    const clean = name.trim()
    if (clean.length < 2) return toast('Please enter your name')
    setBusy(true)
    try {
      const { user } = await updateMe({ name: clean, email: email.trim() })
      setUser(user)
      nav('/onboarding/location', { replace: true })
    } catch (e) { toast((e as Error).message); setBusy(false) }
  }

  return (
    <div className="screen">
      <div className="onb-hero">
        <div className="onb-step">Step 1 of 2</div>
        <h1>What's your name?</h1>
        <p>So your experts know who they're helping.</p>
      </div>
      <div className="content pad-cta">
        <div className="field" style={{ marginTop: 14 }}>
          <span className="cc">🙂</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') next() }} />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <span className="cc">✉</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)"
            inputMode="email" type="email" />
        </div>
      </div>
      <div className="footer-cta">
        <button className="btn full" onClick={next} disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
      </div>
    </div>
  )
}
