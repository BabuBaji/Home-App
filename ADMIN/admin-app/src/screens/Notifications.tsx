import { useState } from 'react'
import { Bell, Send, Tag, Gift, Megaphone } from 'lucide-react'
import { broadcast } from '../api'
import { Card, Field, useToast } from '../components/UI'
import { useStore, can } from '../store'

const TYPES = [
  { k: 'announcement', label: 'Announcement', Icon: Megaphone },
  { k: 'offer', label: 'Offer', Icon: Tag },
  { k: 'cashback', label: 'Cashback', Icon: Gift },
]

export default function Notifications() {
  const toast = useToast()
  const { admin } = useStore()
  const [type, setType] = useState('announcement')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const allowed = can(admin?.role, 'manager')

  async function send() {
    if (!title.trim()) return toast('Enter a title', 'err')
    setBusy(true)
    try { const r = await broadcast({ type, title, body }); toast(`Sent to ${r.sent} customers`); setTitle(''); setBody('') } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr', gap: 18 }}>
      <Card title="Broadcast Notification">
        {!allowed ? <p className="muted">You need manager access to send notifications.</p> : (
          <>
            <Field label="Type">
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                {TYPES.map((t) => (
                  <button key={t.k} className={'chip' + (type === t.k ? ' active' : '')} onClick={() => setType(t.k)}><t.Icon size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />{t.label}</button>
                ))}
              </div>
            </Field>
            <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="20% off this weekend" /></Field>
            <Field label="Message"><textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Use code SAVE20 on any service…" /></Field>
            <button className="btn" disabled={busy} onClick={send}><Send size={16} /> {busy ? 'Sending…' : 'Send to all customers'}</button>
          </>
        )}
      </Card>
      <Card title="Preview">
        <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'flex', gap: 12 }}>
          <span className="stat-ico" style={{ background: '#efeefe', color: 'var(--violet)' }}><Bell size={20} /></span>
          <div>
            <strong style={{ display: 'block' }}>{title || 'Notification title'}</strong>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{body || 'Your message preview shows up here.'}</p>
            <span className="badge violet" style={{ marginTop: 8 }}>{type}</span>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>Notifications are pushed in real time to every customer app currently connected, and also appear in their in-app notification feed.</p>
      </Card>
    </div>
  )
}
