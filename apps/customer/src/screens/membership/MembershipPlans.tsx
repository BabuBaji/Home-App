// 74 · Membership Plans — Silver / Gold / Platinum cards. Choose Plan → Subscribe. If the user is
// already a member, their current plan is marked and the CTA switches to managing it.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { PLANS, money, loadPlans, type Plan } from '../../membership'
import { fetchMembership, type Membership } from '../../api'
import { t } from '../../i18n'

export default function MembershipPlans() {
  const nav = useNavigate()
  const [mem, setMem] = useState<Membership | null>(null)
  const [plans, setPlans] = useState<Plan[]>(PLANS)
  useEffect(() => { fetchMembership().then(setMem).catch(() => setMem({ active: false })) }, [])
  useEffect(() => { loadPlans().then(setPlans).catch(() => setPlans(PLANS)) }, [])
  const currentKey = mem?.active ? mem.plan : undefined

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <div className="titles"><h1>{t('Membership Plans')}</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content">
        <div className="mem-hero">
          <div className="mem-hero-t">{t('Save More. Enjoy More.')}</div>
          <div className="mem-hero-d">{t('Choose the perfect plan for your home.')}</div>
          <span className="mem-hero-art">🏡</span>
        </div>

        <div className="mem-plans">
          {plans.map((p) => {
            const isCurrent = currentKey === p.key
            return (
              <div key={p.key} className={`mem-plan ${p.key} ${p.popular ? 'pop' : ''} ${isCurrent ? 'current' : ''}`}>
                {isCurrent ? <span className="mem-pop">{t('Your Plan')}</span> : p.popular && <span className="mem-pop">{t('Most Popular')}</span>}
                <div className="mem-plan-top">
                  <div><div className="mem-plan-name">{t(p.name)}</div><div className="mem-plan-tag">{t(p.tagline)}</div></div>
                  <div className="mem-plan-price">{money(p.price)}<small>{t('/month')}</small></div>
                </div>
                <ul className="mem-feats">
                  {p.features.map((f) => <li key={f}><Check size={14} /> {t(f)}</li>)}
                </ul>
                {isCurrent
                  ? <button className="mem-choose" onClick={() => nav('/membership/active')}>{t('Manage Plan')}</button>
                  : <button className={`mem-choose ${p.popular ? 'solid' : ''}`} onClick={() => nav(`/membership/subscribe?plan=${p.key}`)}>{currentKey ? t('Switch to {name}', { name: t(p.name) }) : t('Choose Plan')}</button>}
              </div>
            )
          })}
        </div>

        <button className="mem-compare-link" onClick={() => nav('/membership/compare')}>{t('Compare all plans')} →</button>
        {mem?.active
          ? <button className="mem-compare-link" onClick={() => nav('/membership/active')}>{t('View your membership')} →</button>
          : <button className="mem-compare-link" onClick={() => nav('/membership/active')}>{t('Already a member? View your plan')} →</button>
}
      </div>
    </div>
  )
}
