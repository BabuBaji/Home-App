import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Star, BadgeCheck, ShieldCheck, MapPin, Wrench, Phone } from 'lucide-react'
import { Loading } from '../../components/UI'
import { useJob, proName, proRating } from './useJob'
import { WorkerAvatar } from './parts'
import { t } from '../../i18n'

// Module 6 · #43 — Worker Profile. Real fields from the enriched booking pro (name, rating, jobs,
// verified, skills, city). Fields the backend does not track (years/languages) are omitted, not faked.
export default function WorkerProfile() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b } = useJob(id, false)

  if (!b) return <div className="screen jt"><Loading /></div>

  const p = b.pro
  const jobs = p?.jobs ?? p?.servicesDone ?? 0
  const skills = p?.skills || p?.services || (b.items || []).map((i) => i.name)
  const rating = proRating(b)
  const first = proName(b).split(' ')[0]

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={22} /></button>
        <b>{t('Worker Profile')}</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll">
        <div className="jt-wp-head">
          <WorkerAvatar b={b} size={76} />
          <div className="jt-wp-id">
            <div className="jt-wp-name">{proName(b)}</div>
            <div className="jt-wp-rate"><Star size={13} className="jt-star" /> {rating} · {t('{n} jobs', { n: jobs })}</div>
            {p?.city && <div className="jt-wp-city">{p.city}</div>}
            {p?.verified && <span className="jt-wp-badge"><BadgeCheck size={13} /> {t('Verified Partner')}</span>}
          </div>
        </div>

        <div className="jt-wp-stats">
          <div><b>{jobs}</b><span>{t('Jobs Completed')}</span></div>
          <div><b>{rating}<Star size={13} className="jt-star" /></b><span>{t('Rating')}</span></div>
          <div><b>{skills.length}</b><span>{t('Services')}</span></div>
        </div>

        <div className="jt-wp-sec">
          <h4>{t('About')}</h4>
          <p>{p?.city ? t('Professional home-service expert based in {city}.', { city: p.city }) : t('Professional home-service expert.')} {t('{n}+ jobs completed on HomeHelp with a {r}★ rating.', { n: jobs, r: rating })}</p>
        </div>

        {skills.length > 0 && (
          <div className="jt-wp-sec">
            <h4>{t('Skills & Services')} ({skills.length})</h4>
            <div className="jt-chips">{skills.map((s) => <span key={s} className="jt-chip">{s}</span>)}</div>
          </div>
        )}

        <div className="jt-wp-sec jt-wp-rows">
          {p?.phone && <a className="jt-wp-line" href={`tel:${p.phone}`}><Phone size={17} /><span className="grow">{t('Mobile')}</span><b>{p.phone}</b></a>}
          {p?.city && <div className="jt-wp-line"><MapPin size={17} /><span className="grow">{t('Serves in')}</span><b>{p.city}</b></div>}
          <div className="jt-wp-line"><Wrench size={17} /><span className="grow">{t('Services offered')}</span><b>{skills.length}</b></div>
          <div className="jt-wp-line"><ShieldCheck size={17} /><span className="grow">{t('Background')}</span><b>{p?.verified ? t('ID & Address Verified') : t('In review')}</b></div>
        </div>
      </div>

      <div className="jt-foot">
        <button className="jt-btn" onClick={() => { if (p?.phone) window.location.href = `tel:${p.phone}`; else nav(`/job/${b.id}/call`) }}><Phone size={16} /> {t('Call {name}', { name: first })}</button>
      </div>
    </div>
  )
}
