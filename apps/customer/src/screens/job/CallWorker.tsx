import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Mic, MicOff, Grid3x3, Volume2, PhoneOff, Phone } from 'lucide-react'
import { Loading } from '../../components/UI'
import { useJob, proName } from './useJob'
import { WorkerAvatar } from './parts'

// Module 6 · #47 — Call Worker. Places a real phone call to the assigned worker's number via the
// device dialer (tel:). The controls mirror the mock; the number comes from the booking (no fake).
export default function CallWorker() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b } = useJob(id, false)
  const [muted, setMuted] = useState(false)
  const [speaker, setSpeaker] = useState(false)
  const [secs, setSecs] = useState(0)

  const phone = b?.pro?.phone

  useEffect(() => { const i = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(i) }, [])

  function dial() { if (phone) window.location.href = `tel:${phone}` }

  if (!b) return <div className="screen jt"><Loading /></div>
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`

  return (
    <div className="jt-call">
      <div className="jt-call-top">
        <WorkerAvatar b={b} size={120} />
        <h2>{proName(b)}</h2>
        {phone ? <div className="jt-call-num">{phone}</div> : <div className="jt-call-num">No number on file</div>}
        <div className="jt-call-state">{phone ? `Calling… ${mmss}` : 'Cannot place call'}</div>
      </div>

      <div className="jt-call-ctrls">
        <button className={`jt-call-btn ${muted ? 'on' : ''}`} onClick={() => setMuted((m) => !m)}>
          {muted ? <MicOff size={22} /> : <Mic size={22} />}<span>Mute</span>
        </button>
        <button className="jt-call-btn" onClick={dial}>
          <Grid3x3 size={22} /><span>Keypad</span>
        </button>
        <button className={`jt-call-btn ${speaker ? 'on' : ''}`} onClick={() => setSpeaker((s) => !s)}>
          <Volume2 size={22} /><span>Speaker</span>
        </button>
      </div>

      <div className="jt-call-actions">
        {phone && <button className="jt-call-dial" onClick={dial} aria-label="Dial"><Phone size={26} /></button>}
        <button className="jt-call-end" onClick={() => nav(-1)} aria-label="End call"><PhoneOff size={26} /></button>
      </div>
    </div>
  )
}
