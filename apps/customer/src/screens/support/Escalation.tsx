// 113 · Escalate Issue — real: shows the customer's latest ticket and escalates it via
// /api/tickets/:id/escalate with a reason + preferred contact.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Info, ArrowUpCircle, Phone, Mail, MessageCircle } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { fetchTickets, escalateTicket } from '../../api'
import type { Ticket } from '../../types'

const day = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const CONTACTS = [
  { k: 'call', icon: <Phone size={18} />, t: 'Call Me', d: 'Our team will call you' },
  { k: 'email', icon: <Mail size={18} />, t: 'Email Me', d: 'We will email you' },
  { k: 'whatsapp', icon: <MessageCircle size={18} />, t: 'WhatsApp', d: 'We will message you' },
]

export default function Escalation() {
  const nav = useNavigate()
  const toast = useToast()
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [reason, setReason] = useState('')
  const [contact, setContact] = useState('call')
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchTickets().then(setTickets).catch(() => setTickets([])) }, [])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Escalate Issue</h1></div>
      <button className="iconbtn" onClick={() => toast('Escalations go to our senior team for priority handling.')} aria-label="Info"><Info size={18} /></button>
    </header>
  )
  if (!tickets) return <div className="screen">{head}<Loading /></div>

  const ticket = tickets[0]

  async function submit() {
    if (!ticket) return
    if (!reason.trim()) return toast('Tell us why you want to escalate')
    setBusy(true)
    try { await escalateTicket(ticket.id, reason.trim(), contact); toast('Issue escalated to our senior team'); nav(-1) }
    catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="screen">
      {head}
      <div className="content pad-cta">
        <div className="es-note">
          <ArrowUpCircle size={20} />
          <div><div className="es-note-t">Still Need Help?</div><div className="es-note-d">If you are not satisfied with the resolution, escalate your issue to our senior team.</div></div>
        </div>

        {!ticket ? (
          <div className="state"><div className="ico">🎫</div><h3>No ticket to escalate</h3><p>Raise a ticket first, then escalate if needed.</p>
            <button className="btn" style={{ marginTop: 14 }} onClick={() => nav('/support/ticket')}>Raise a Ticket</button></div>
        ) : (
          <>
            <div className="rs-sec">Current Ticket</div>
            <div className="ws-card rs-kv">
              <div className="ord-kv"><span className="ord-kv-k">Ticket ID</span><span className="ord-kv-v">{ticket.ref}</span></div>
              <div className="ord-kv"><span className="ord-kv-k">Issue</span><span className="ord-kv-v">{ticket.subject || ticket.category}</span></div>
              <div className="ord-kv"><span className="ord-kv-k">Status</span><span className="ord-kv-v" style={{ color: ticket.escalated ? 'var(--orange)' : 'var(--green)' }}>{ticket.status}</span></div>
              <div className="ord-kv"><span className="ord-kv-k">Raised On</span><span className="ord-kv-v">{day(ticket.created)}</span></div>
            </div>

            <div className="rs-sec">Why do you want to escalate?</div>
            <div className="fm-field">
              <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} rows={4} placeholder="Please explain why you want to escalate this issue..." />
              <span className="rt-count">{reason.length}/500</span>
            </div>

            <div className="rs-sec">Preferred Contact</div>
            <div className="ws-card">
              {CONTACTS.map((c) => (
                <button key={c.k} className="ws-row" onClick={() => setContact(c.k)}>
                  <span className="ws-ico">{c.icon}</span>
                  <span className="ws-main"><span className="ws-t">{c.t}</span><span className="ws-d">{c.d}</span></span>
                  <span className={`lang-radio ${contact === c.k ? 'on' : ''}`} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {ticket && (
        <div className="w-foot">
          <button className="btn full" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit Escalation'}</button>
        </div>
      )}
    </div>
  )
}
