// 81 · Benefits — the active plan's benefit list.
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { planByKey, BENEFITS } from '../../membership'
import { t } from '../../i18n'

export default function Benefits() {
  const nav = useNavigate()
  const plan = planByKey('gold')

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <div className="titles"><h1>{t('{name} Plan Benefits', { name: t(plan.name) })}</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content pad-cta">
        <div className="ben-card">
          <span className="ben-crown">👑</span>
          <span className="act-badge">{t('Active')}</span>
          <div className="ben-name">{t('{name} Plan', { name: t(plan.name) })}</div>
          <div className="ben-d">{t('Enjoy exclusive benefits with your membership')}</div>
        </div>

        <div className="ben-list">
          {BENEFITS.map((b) => (
            <div key={b.t} className="ben-row">
              <span className="ben-ico">{b.icon}</span>
              <div><div className="ben-t">{t(b.t)}</div><div className="ben-sub">{t(b.d)}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-foot">
        <button className="btn ghost full" onClick={() => nav('/membership')}>{t('View Plan Details')} <ChevronRight
 size={16} /></button>
      </div>
    </div>
  )
}
