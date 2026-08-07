import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { speak, speakOnce } from '../../notify'
import { sendJobMessage } from '../../api'
import { useStore } from '../../store'
import { useJob, serviceNames, proName } from './useJob'

// Module 6 · #51 — Service Completed. Uses the real completed_at timestamp. The star row seeds the
// rating and jumps into the Module-7 rating flow; Pay & Tip opens the tip screen.
export default function ServiceCompleted() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useStore()
  const { b } = useJob(id, false)
  const [stars, setStars] = useState(0)
  // idle → showing the offer · sending → messaging the expert · sent → done · declined → hidden
  const [extend, setExtend] = useState<'idle' | 'sending' | 'sent' | 'declined'>('idle')

  // Announce completion aloud once, on the screen the customer is actually looking at (the most
  // reliable place for voice — foreground, with audio focus). Personalised with the customer's name
  // and the service, and it invites them to extend. Deduped via speakOnce so it never repeats.
  useEffect(() => {
    if (b?.status === 'completed' && speakOnce(b.id)) {
      const name = user?.name?.split(' ')[0] || 'there'
      speak(`Hi ${name}, your ${serviceNames(b)} service has completed. Do you want to extend any service? If yes, tap yes and we will inform your expert.`)
    }
  }, [b?.id, b?.status])

  if (!b) return <div className="screen jt"><Loading /></div>
  const completedAt = b.completed_at ? new Date(b.completed_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '—'

  // "Yes, extend" → message the assigned expert (by the customer's name) on the same job chat the
  // worker app reads, so they get the alert and can raise an extension request. That request then
  // comes back to the customer's Extend screen to approve & pay via Razorpay.
  async function requestExtend() {
    if (!b) return
    setExtend('sending')
    try {
      const name = user?.name || 'The customer'
      await sendJobMessage(b.id, `Hi, this is ${name}. I'd like to extend my ${serviceNames(b)} service. Could you please raise an extension request?`)
      setExtend('sent')
      const who = proName(b)
      toast(`We've informed ${who}. They'll send you an extension request to approve.`)
      speak(`We have informed ${who}. They will send you an extension request shortly.`)
    } catch {
      setExtend('idle')
      toast('Could not reach your expert. Please try again.')
    }
  }

  return (
    <div className="screen jt">
      <div className="content jt-scroll jt-center">
        <div className="jt-check"><Check size={40} strokeWidth={3} /></div>
        <h2 className="jt-done-title">Service Completed!</h2>
        <p className="jt-done-sub">Thank you for choosing our service.</p>

        <div className="jt-card jt-kv"><span>Completed At</span><b>{completedAt}</b></div>

        {/* Extend offer — voiced above and actionable here. */}
        {extend === 'sent' ? (
          <div className="jt-card" style={{ borderColor: 'var(--brand, #6D4AFF)' }}>
            <b>Extension requested</b>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {proName(b)} will send you an extension request — approve &amp; pay it on the Extend screen.
            </p>
          </div>
        ) : extend !== 'declined' ? (
          <div className="jt-card">
            <b>Need more time?</b>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              We can ask {proName(b)} to extend your {serviceNames(b)} service.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button className="jt-btn" style={{ flex: 1.4 }} disabled={extend === 'sending'} onClick={requestExtend}>
                {extend === 'sending' ? 'Please wait…' : 'Yes, extend'}
              </button>
              <button className="jt-btn ghost" style={{ flex: 1 }} disabled={extend === 'sending'} onClick={() => setExtend('declined')}>
                No, thanks
              </button>
            </div>
          </div>
        ) : null}

        <div className="jt-sc-rate">
          <div className="jt-sc-rate-q">How was your experience?</div>
          <div className="jt-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={n <= stars ? 'on' : ''} onClick={() => { setStars(n); nav(`/rate/${b.id}?stars=${n}`) }}>★</span>
            ))}
          </div>
        </div>
      </div>

      <div className="jt-foot col">
        <button className="jt-btn" onClick={() => nav(`/tip/${b.id}`)}>Pay &amp; Tip</button>
        <button className="jt-btn ghost" onClick={() => nav('/home')}>Back to Home</button>
      </div>
    </div>
  )
}
