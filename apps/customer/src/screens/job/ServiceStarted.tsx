import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play } from 'lucide-react'
import { Loading, useBack } from '../../components/UI'
import { useJob, proName, serviceNames } from './useJob'
import { MiniTimeline } from './parts'
import { t, dateLocale } from '../../i18n'

// Module 6 · #49 — Service Started. Uses the real started_at timestamp + assigned worker from the booking.
export default function ServiceStarted() {
  const { id } = useParams()
  const nav = useNavigate()
  const goBack = useBack(`/job/${id}`)
  const { b } = useJob(id)

  if (!b) return <div className="screen jt"><Loading /></div>
  const startedAt = b.started_at ? new Date(b.started_at).toLocaleString(dateLocale(), { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '—'

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={goBack} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <b>{t('Service Started')}</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll jt-center">
        <div className="jt-play"><Play size={34} fill="#fff" strokeWidth={0} /></div>
        <h2 className="jt-done-title">{t('Service Started!')}</h2>
        <p className="jt-done-sub">{t('{name} has started the service.', { name: proName(b) })}</p>

        <div className="jt-card jt-kv"><span>{t('Started At')}</span><b>{startedAt}</b></div>
        <div className="jt-card jt-svc"><span className="jt-svc-ic">🧹</span><div className="grow">{serviceNames(b)}</div></div>

        <MiniTimeline status={b.status} />
      </div>

      <div className="jt-foot">
        <button className="jt-btn" onClick={() => nav(`/job/${b.id}/progress`)}>{t('View Details')}</button>
      </div>
    </div>
  )
}
