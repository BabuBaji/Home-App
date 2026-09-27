import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, ArrowLeft } from 'lucide-react'
import { Loading, useBack } from '../../components/UI'
import { speak, speakOnce } from '../../notify'
import { useStore } from '../../store'
import { useJob, serviceNames } from './useJob'
import { t, tEn, dateLocale } from '../../i18n'
import { useAppConfig } from '../../appConfig'

// Module 6 · #51 — Service Completed. Uses the real completed_at timestamp. The star row seeds the
// rating and jumps into the Module-7 rating flow; Pay & Tip opens the tip screen.
export default function ServiceCompleted() {
  const { id } = useParams()
  const nav = useNavigate()
  const { reviews } = useAppConfig()
  const { user } = useStore()
  const goBack = useBack('/bookings')
  const { b } = useJob(id, false)
  const [stars, setStars] = useState(0)

  // Announce completion aloud once, on the screen the customer is actually looking at (the most
  // reliable place for voice — foreground, with audio focus). Personalised with the customer's name
  // and the service. Deduped via speakOnce so it
  // never repeats. (Extending is offered only while the job is running — not after it's over.)
  useEffect(() => {
    if (b?.status === 'completed' && speakOnce(b.id)) {
      const name = user?.name?.split(' ')[0] || t('there')
      const line = 'Hi {name}, your {service} service has completed. Please rate your experience.'
      speak(t(line, { name, service: serviceNames(b) }), tEn(line, { name, service: serviceNames(b) }))

    }
  }, [b?.id, b?.status])

  if (!b) return <div className="screen jt"><Loading /></div>
  const completedAt = b.completed_at ? new Date(b.completed_at).toLocaleString(dateLocale(), { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase()) : '—'

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={goBack} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <b>{t('Service Completed')}</b><span style={{ width: 40 }} />
      </div>
      <div className="content jt-scroll jt-center">
        <div className="jt-check"><Check size={40} strokeWidth={3} /></div>
        <h2 className="jt-done-title">{t('Service Completed!')}</h2>
        <p className="jt-done-sub">{t('Thank you for choosing our service.')}</p>

        <div className="jt-card jt-kv"><span>{t('Completed At')}</span><b>{completedAt}</b></div>
        <button className="au-link" onClick={() => nav(`/booking-details/${b.id}`)}>{t('View receipt & details')}</button>

        {reviews && <div className="jt-sc-rate">
          <div className="jt-sc-rate-q">{t('How was your experience?')}</div>
          <div className="jt-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-label={t('{n} stars', { n })} className={n <= stars ? 'on' : ''} onClick={() => { setStars(n); nav(`/rate/${b.id}?stars=${n}`) }}>★</button>
            ))}
          </div>
        </div>}
      </div>

      <div className="jt-foot col">
        <button className="jt-btn" onClick={() => nav(`/tip/${b.id}`)}>{t('Pay & Tip')}</button>
        <button className="jt-btn ghost" onClick={() => nav('/home')}>{t('Back to Home')}</button>
      </div>
    </div>
  )
}
