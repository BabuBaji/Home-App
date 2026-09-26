import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarCheck } from 'lucide-react'
import { Loading } from '../../components/UI'
import { useJob, serviceNames } from '../job/useJob'
import { t } from '../../i18n'

// Module 7 · #56 — Rebook This Service. Summary is real booking data; "Rebook Same Service" re-enters
// the real booking flow for the same service id.
export default function Rebook() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b } = useJob(id, false)

  if (!b) return <div className="screen jt"><Loading /></div>
  const sid = b.items?.[0]?.id
  const when = [b.date, b.time].filter(Boolean).join(', ') || t('Flexible')
  const duration = b.items?.[0]?.durationLabel || b.duration || '—'

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={22} /></button>
        <b>{t('Rebook This Service')}</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll jt-center">
        <div className="rb-illo"><CalendarCheck size={38} /></div>
        <h2 className="jt-done-title">{t('Glad you loved our service!')}</h2>
        <p className="jt-done-sub">{t('Would you like to book again?')}</p>

        <div className="jt-card jt-details rb-details">
          <div className="jt-row"><span className="jt-row-l">{t('Service')}</span><span className="jt-row-v">{serviceNames(b)}</span></div>
          <div className="jt-row"><span className="jt-row-l">{t('Date')}</span><span className="jt-row-v">{when}</span></div>
          <div className="jt-row"><span className="jt-row-l">{t('Duration')}</span><span className="jt-row-v">{duration}</span></div>
          <div className="jt-row col"><span className="jt-row-l">{t('Address')}</span><span className="jt-row-v">{b.address}</span></div>
        </div>
      </div>

      <div className="jt-foot col">
        <button className="jt-btn" onClick={() => sid ? nav(`/booking/${sid}`) : nav('/home')}>{t('Rebook Same Service')}</button>
        <button className="jt-btn ghost" onClick={() => nav('/home')}>{t('Choose Another Service')}</button>
        <button className="jt-btn text" onClick={() => nav('/home')}>{t('Back to Home')}</button>
      </div>
    </div>
  )
}
