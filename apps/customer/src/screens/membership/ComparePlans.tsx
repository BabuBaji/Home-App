// 75 · Compare Plans — plan selector + feature comparison table. Prices come from the admin-config
// catalog; the feature matrix is static content.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { PLANS, COMPARE_ROWS, pickPlan, loadPlans, money, type Plan } from '../../membership'
import { t } from '../../i18n'

export default function ComparePlans() {
  const nav = useNavigate()
  const [sel, setSel] = useState('gold')
  const [plans, setPlans] = useState<Plan[]>(PLANS)
  useEffect(() => { loadPlans().then(setPlans).catch(() => setPlans(PLANS)) }, [])
  const cell = (v: string | boolean) => v === true ? <Check size={15} className="cmp-yes" /> : v === false ? <span className="cmp-no">—</span> : <span className="cmp-txt">{t(v)}</span>

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <div className="titles"><h1>{t('Compare Plans')}</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content pad-cta">
        <div className="cmp-tabs">
          {plans.map((p) => (
            <button key={p.key} className={`cmp-tab ${sel === p.key ? 'sel' : ''}`} onClick={() => setSel(p.key)}>
              {p.popular && <span className="cmp-pop">{t('Popular')}</span>}
              <span className="cmp-tab-n">{t(p.name)}</span>
              <span className="cmp-tab-p">{money(p.price)}<small>{t('/mo')}</small></span>
            </button>
          ))}
        </div>

        <div className="cmp-h">{t('Plan Features')}</div>
        <div className="cmp-table">
          <div className="cmp-row cmp-head">
            <span></span><span>{t('Silver')}</span><span>{t('Gold')}</span><span>{t('Platinum')}</span>
          </div>
          {COMPARE_ROWS.map((r) => (
            <div key={r.label} className="cmp-row">
              <span className="cmp-label">{t(r.label)}</span>
              <span>{cell(r.silver)}</span><span>{cell(r.gold)}</span><span>{cell(r.platinum)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="w-foot">
        <button className="btn full" onClick={() => nav(`/membership/subscribe?plan=${sel}`)}>{t('Choose {name} Plan', { name: t(pickPlan(plans, sel).name) })}</button>

      </div>
    </div>
  )
}
