import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Phone, Send } from 'lucide-react'
import { Loading } from '../../components/UI'
import { fetchJobMessages, sendJobMessage, type JobMessage } from '../../api'
import { useJob, proName } from './useJob'
import { WorkerAvatar } from './parts'

// Module 6 · #46 — Chat with Worker. Backed by the real job_messages store the worker app already
// reads and writes, so a message sent here lands on the worker's job screen (and their replies land
// here). Polls while the screen is open, matching useJob — the job screens poll rather than hold a
// socket. Messages used to be kept in localStorage and never left the device; anything a customer
// "sent" before this is still only on their phone and is not migrated.
const POLL_MS = 5000

// An unsent message, shown greyed until the POST returns. Negative ids never collide with real ones.
type Pending = JobMessage & { pending: true }

export default function Chat() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b } = useJob(id, false)
  const bid = Number(id)
  const [msgs, setMsgs] = useState<JobMessage[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  // Load once, then poll so the worker's replies arrive without a manual refresh.
  useEffect(() => {
    if (!bid) return
    let stop = false
    const load = () =>
      fetchJobMessages(bid)
        .then((m) => { if (!stop) { setMsgs(m); setLoaded(true) } })
        .catch(() => { if (!stop) setLoaded(true) })
    load()
    const iv = setInterval(load, POLL_MS)
    return () => { stop = true; clearInterval(iv) }
  }, [bid])

  const all = [...msgs, ...pending]
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [all.length])

  async function send() {
    const t = text.trim()
    if (!t || !bid) return
    const draft: Pending = { id: -Date.now(), sender: 'customer', body: t, created: new Date().toISOString(), pending: true }
    setText(''); setErr(''); setPending((p) => [...p, draft])
    try {
      await sendJobMessage(bid, t)
      // Drop the placeholder and refetch, so ordering/ids come from the server rather than guesswork.
      setPending((p) => p.filter((m) => m.id !== draft.id))
      setMsgs(await fetchJobMessages(bid))
    } catch (e) {
      // Keep what they typed — losing a message to a failed request is worse than a retry.
      setPending((p) => p.filter((m) => m.id !== draft.id))
      setText(t)
      setErr(e instanceof Error && /no longer active/i.test(e.message)
        ? 'This job has ended — you can no longer message your expert.'
        : 'Could not send. Check your connection and try again.')
    }
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
        {loaded && all.length === 0 && (
          <div className="jt-chat-empty">Send a message to {proName(b).split(' ')[0]} about your booking. They'll see it on the job.</div>
        )}
        {all.map((m) => {
          const mine = m.sender === 'customer'
          return (
            <div key={m.id} className={`jt-bubble ${mine ? 'me' : 'them'}${'pending' in m ? ' pending' : ''}`}>
              {m.body}
              <span className="jt-bubble-t">
                {new Date(m.created).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {err && <div className="jt-chat-err">{err}</div>}

      <div className="jt-chat-input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          placeholder="Type a message…"
          maxLength={1000}
        />
        <button className="jt-send" onClick={send} aria-label="Send" disabled={!text.trim()}><Send size={17} /></button>
      </div>
    </div>
  )
}
