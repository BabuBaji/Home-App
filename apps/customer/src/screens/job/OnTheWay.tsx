import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Clock, Bell, Navigation } from 'lucide-react'
import { Loading, useBack } from '../../components/UI'
import { useJob, proName } from './useJob'
import { t } from '../../i18n'

// Module 6 · #44 — On The Way. Distance/ETA come from the real travel calc on /api/bookings/:id
// (worker GPS ↔ customer). Vehicle is not tracked by the backend, so it is omitted (no fake value).
export default function OnTheWay() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b } = useJob(id)
  const back = useBack(`/job/${id}`)

  if (!b) return <div className="screen jt"><Loading /></div>

  const first = proName(b).split(' ')[0]

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={back} aria-label={t('Back')}><ArrowLeft size={22} /></button>
        <b>{t('On The Way')}</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll">
        <div className="jt-otw-illo"><span className="jt-scooter">🛵</span></div>
        <h2 className="jt-otw-name">{proName(b)}</h2>
        <p className="jt-otw-sub">{t('is on the way to your location')}</p>

        <div className="jt-card jt-otw-rows">
          <div className="jt-otw-line"><span className="jt-otw-ic"><MapPin size={17} /></span><span className="grow">{t('Distance')}</span><b>{b.dist != null ? t('{km} km away', { km: b.dist }) : t('Calculating…')}</b></div>
          <div className="jt-otw-line"><span className="jt-otw-ic"><Clock size={17} /></span><span className="grow">{t('ETA')}</span><b>{b.eta != null ? t('{n} mins', { n: b.eta }) : '—'}</b></div>
        </div>

        <button className="jt-map-link" onClick={() => nav(`/job/${b.id}/map`)}><Navigation size={15} /> {t('View live on map')}</button>

        <div className="jt-note"><Bell size={17} /> {t("We'll notify you when {name} arrives", { name: first })}</div>
      </div>

      <div className="jt-foot">
        <button className="jt-btn ghost" onClick={() => nav(`/job/${b.id}/chat`)}>{t('Chat')}</button>
        <button className="jt-btn" onClick={() => nav(`/job/${b.id}/call`)}>{t('Call')}</button>
      </div>
    </div>
  )
}
