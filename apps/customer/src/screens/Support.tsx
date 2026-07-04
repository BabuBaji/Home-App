import { useEffect, useState } from 'react'
import { Header, useToast } from '../components/UI'
import { fetchTickets, createTicket } from '../api'
import type { Ticket } from '../types'

const ISSUES = [
  { id: 'Service issue', icon: '🧹' }, { id: 'Worker issue', icon: '🧑‍🔧' },
  { id: 'Payment issue', icon: '💳' }, { id: 'Refund issue', icon: '💸' },
]

export default function Support() {
  const toast = useToast()
  const [cat, setCat] = useState('Service issue')
  const [msg, setMsg] = useState('')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [busy, setBusy] = useState(false)

  function load() { fetchTickets().then(setTickets).catch(() => {}) }
  useEffect(load, [])

  async function submit() {
    if (!msg.trim()) return toast('Describe your issue')
    setBusy(true)
    try { const t = await createTicket(cat, msg); toast(`Ticket ${t.ref} raised`); setMsg(''); setTickets((p) => [t, ...p]) }
    catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="screen">
      <Header title="Help & Support" />
      <div className="content">
        <div className="support-quick">
          <a className="sq" href="tel:+918000000000"><span>📞</span>Call us</a>
          <a className="sq" href="https://wa.me/918000000000" target="_blank"><span>🟢</span>WhatsApp</a>
          <button className="sq" onClick={() => toast('Live chat opening…')}><span>💬</span>Live chat</button>
        </div>

        <h3 className="section-title">Raise a ticket</h3>
        <div className="issue-grid">
          {ISSUES.map((i) => (
            <button key={i.id} className={`issue ${cat === i.id ? 'sel' : ''}`} onClick={() => setCat(i.id)}><span className="ie">{i.icon}</span>{i.id}</button>
          ))}
        </div>
        <textarea className="req-area" style={{ marginTop: 12 }} placeholder="Describe your issue in detail…" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <button className="btn full" style={{ marginTop: 12 }} onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit Ticket'}</button>

        {tickets.length > 0 && <>
          <h3 className="section-title">Your tickets</h3>
          {tickets.map((t) => (
            <div key={t.id} className="card pad mt ticket">
              <div className="bk-top"><div><b>{t.ref}</b><div className="muted sm">{t.category}</div></div><span className="status-chip upcoming">{t.status}</span></div>
              <p className="muted" style={{ marginTop: 8, fontSize: 13.5 }}>{t.message}</p>
            </div>
          ))}
        </>}
      </div>
    </div>
  )
}
