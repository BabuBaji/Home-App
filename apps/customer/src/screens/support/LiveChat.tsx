// 109 · Live Chat — real support chat backed by /api/support/chat (AI assistant; offline bot
// fallback). Styled as a live agent conversation with a "connected" banner.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MoreVertical, Send, CheckCheck } from 'lucide-react'
import { useStore } from '../../store'
import { sendSupportChat } from '../../api'

type Msg = { from: 'bot' | 'user'; text: string; time: string }
const now = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()

// Local fallback replies when the AI provider is offline, so the chat always responds.
function fallback(q: string): string {
  const s = q.toLowerCase()
  if (/reschedul/.test(s)) return 'Sure, I can help with that. Please share your booking ID and I will check available slots.'
  if (/refund/.test(s)) return 'Refunds are credited to your wallet after a cancellation. You can track it in Refund Status.'
  if (/cancel/.test(s)) return 'You can cancel from the booking details. Cancellation charges depend on how close it is to the slot.'
  if (/worker|expert|arriv/.test(s)) return "I'm sorry about that. Share your booking ID and I'll check the expert's status right away."
  return 'Thank you! Let me check that for you. Could you share your booking ID?'
}

export default function LiveChat() {
  const nav = useNavigate()
  const { user } = useStore()
  const first = (user?.name || '').trim().split(' ')[0] || 'there'
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'bot', text: `Hello ${first}! 👋 How can I help you today?`, time: now() }])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  async function send() {
    const q = text.trim()
    if (!q || busy) return
    const next: Msg[] = [...msgs, { from: 'user', text: q, time: now() }]
    setMsgs(next); setText(''); setBusy(true)
    let reply = ''
    try {
      const r = await sendSupportChat(next.map((m) => ({ role: m.from, text: m.text })))
      if (r && r.reply && !r.fallback) reply = r.reply
    } catch { /* offline */ }
    if (!reply) reply = fallback(q)
    setMsgs((m) => [...m, { from: 'bot', text: reply, time: now() }])
    setBusy(false)
  }

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Live Chat</h1></div>
        <button className="iconbtn" onClick={() => nav('/support/emergency')} aria-label="More"><MoreVertical size={18} /></button>
      </header>

      <div className="content lc-body">
        <div className="lc-banner"><CheckCheck size={16} /><div><b>You are now connected</b><span>Our support agent will be with you shortly.</span></div></div>

        {msgs.map((m, i) => (
          <div key={i} className={`lc-msg ${m.from}`}>
            {m.from === 'bot' && <span className="lc-av">🎧</span>}
            <div className="lc-bubble">
              {m.from === 'bot' && <div className="lc-from">Support</div>}
              <div className="lc-text">{m.text}</div>
              <div className="lc-time">{m.time}{m.from === 'user' && <CheckCheck size={13} />}</div>
            </div>
          </div>
        ))}
        {busy && <div className="lc-msg bot"><span className="lc-av">🎧</span><div className="lc-bubble"><div className="lc-typing"><i /><i /><i /></div></div></div>}
        <div ref={endRef} />
      </div>

      <div className="lc-input">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Type your message..." />
        <button className="lc-send" onClick={send} disabled={!text.trim() || busy} aria-label="Send"><Send size={17} /></button>
      </div>
    </div>
  )
}
