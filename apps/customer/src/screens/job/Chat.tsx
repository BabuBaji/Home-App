import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Phone, Send } from 'lucide-react'
import { Loading } from '../../components/UI'
import { useJob, proName } from './useJob'
import { WorkerAvatar } from './parts'

// Module 6 · #46 — Chat with Worker. There is no worker-chat backend yet, so we do NOT fabricate a
// conversation. The customer's own messages are kept locally (per booking) and shown; a call CTA
// uses the worker's real number. Ready to swap to a real chat API when the worker app adds one.
interface Msg { from: 'me'; text: string; at: number }

export default function Chat() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b } = useJob(id, false)
  const bid = Number(id)
  const key = `hh_chat_${bid}`
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem(`hh_chat_${bid}`) || '[]') } catch { return [] } })
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])

  function send() {
    const t = text.trim(); if (!t) return
    const next = [...msgs, { from: 'me' as const, text: t, at: Date.now() }]
    setMsgs(next); setText('')
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* ignore */ }
  }

  if (!b) return <div className="screen jt"><Loading /></div>
  const phone = b.pro?.phone

  return (
    <div className="screen jt">
      <div className="jt-top jt-chat-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <div className="jt-chat-who">
          <WorkerAvatar b={b} size={36} />
          <div><div className="jt-chat-name">{proName(b)}</div><div className="jt-chat-status">Assigned to your job</div></div>
        </div>
        {phone
          ? <a className="jt-ic" href={`tel:${phone}`} aria-label="Call"><Phone size={19} /></a>
          : <button className="jt-ic" onClick={() => nav(`/job/${bid}/call`)} aria-label="Call"><Phone size={19} /></button>}
      </div>

      <div className="content jt-chat-body">
        <div className="jt-chat-day">Today</div>
        {msgs.length === 0 && (
          <div className="jt-chat-empty">Send a message to {proName(b).split(' ')[0]} about your booking. They'll see it on the job.</div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className="jt-bubble me">
            {m.text}
            <span className="jt-bubble-t">{new Date(m.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="jt-chat-input">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }} placeholder="Type a message…" />
        <button className="jt-send" onClick={send} aria-label="Send"><Send size={17} /></button>
      </div>
    </div>
  )
}
