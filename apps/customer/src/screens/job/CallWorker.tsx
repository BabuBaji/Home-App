import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Mic, MicOff, Grid3x3, Volume2, PhoneOff, Phone } from 'lucide-react'
import { Loading } from '../../components/UI'
import { useJob, proName } from './useJob'
import { WorkerAvatar } from './parts'
import { callExpert } from '../../api'
import { t } from '../../i18n'

// Module 6 · #47 — Call Worker. Asks the server to connect the call: with masked calling on, our
// number rings the customer and bridges them to the expert (neither sees the other's number);
// otherwise it dials the expert's number directly (tel:).
export default function CallWorker() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b } = useJob(id, false)
  const [muted, setMuted] = useState(false)
  const [speaker, setSpeaker] = useState(false)
  const [secs, setSecs] = useState(0)

  const [phone, setPhone] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'bridging' | 'failed'>('idle')
  useEffect(() => { if (b?.pro?.phone) setPhone(b.pro.phone) }, [b?.pro?.phone])

  useEffect(() => { const i = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(i) }, [])

  async function dial() {
    if (!b) return
    try {
      const r = await callExpert(b.id)
      if (r.mode === 'bridge') { setState('bridging'); return }
      if (r.phone) { setPhone(r.phone); window.location.href = `tel:${r.phone}` }
    } catch { setState('failed') }
  }

  if (!b) return <div className="screen jt"><Loading /></div>
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`

  return (
    <div className="jt-call">
      <div className="jt-call-top">
        <WorkerAvatar b={b} size={120} />
        <h2>{proName(b)}</h2>
        <div className="jt-call-num">{state === 'bridging' ? t('Your phone will ring — pick up to be connected') : phone || t('Private number')}</div>
        <div className="jt-call-state">{state === 'failed' ? t('Could not connect the call') : state === 'bridging' ? `${t('Connecting…')} ${mmss}` : t('Tap the green button to call')}</div>
      </div>

      <div className="jt-call-ctrls">
        <button className={`jt-call-btn ${muted ? 'on' : ''}`} onClick={() => setMuted((m) => !m)}>
          {muted ? <MicOff size={22} /> : <Mic size={22} />}<span>{t('Mute')}</span>
        </button>
        <button className="jt-call-btn" onClick={dial}>
          <Grid3x3 size={22} /><span>{t('Keypad')}</span>
        </button>
        <button className={`jt-call-btn ${speaker ? 'on' : ''}`} onClick={() => setSpeaker((s) => !s)}>
          <Volume2 size={22} /><span>{t('Speaker')}</span>
        </button>
      </div>

      <div className="jt-call-actions">
        <button className="jt-call-dial" onClick={dial} aria-label={t('Dial')}><Phone size={26} /></button>
        <button className="jt-call-end" onClick={() => nav(-1)} aria-label={t('End call')}><PhoneOff size={26} /></button>
      </div>
    </div>
  )
}
