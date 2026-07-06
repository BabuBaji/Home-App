import { useState } from 'react'
import { Header, useToast } from '../components/UI'
import { useStore } from '../store'
import { updateMe } from '../api'
import type { User } from '../types'

// Editable personal details. Name / email / city save to the account; the mobile number
// is the login identity and is shown read-only.
export default function PersonalInfo() {
  const toast = useToast()
  const { user, setUser } = useStore()
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [city, setCity] = useState(user?.city || '')
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="screen">
      <Header title="Personal Information" />
      <div className="content pad-cta">
        <div className="prof-head" style={{ marginBottom: 16 }}>
          <div className="ava-lg">{user?.provider === 'google' ? '🧑' : '👨🏻'}</div>
          <div><h2>{user?.name || 'Your profile'}</h2><div className="li">📞 {user?.phone || '—'}</div></div>
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
    </div>
  )
}
