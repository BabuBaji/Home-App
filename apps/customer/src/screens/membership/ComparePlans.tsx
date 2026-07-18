// 75 · Compare Plans — plan selector + feature comparison table. Prices come from the admin-config
// catalog; the feature matrix is static content.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { PLANS, COMPARE_ROWS, pickPlan, loadPlans, money, type Plan } from '../../membership'

export default function ComparePlans() {
  const nav = useNavigate()
  const [sel, setSel] = useState('gold')
  const [plans, setPlans] = useState<Plan[]>(PLANS)
  useEffect(() => { loadPlans().then(setPlans).catch(() => setPlans(PLANS)) }, [])
  const cell = (v: string | boolean) => v === true ? <Check size={15} className="cmp-yes" /> : v === false ? <span className="cmp-no">—</span> : <span className="cmp-txt">{v}</span>

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Compare Plans</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content pad-cta">
        <div className="cmp-tabs">
          {plans.map((p) => (
            <button key={p.key} className={`cmp-tab ${sel === p.key ? 'sel' : ''}`} onClick={() => setSel(p.key)}>
              {p.popular && <span className="cmp-pop">Popular</span>}
              <span className="cmp-tab-n">{p.name}</span>
              <span className="cmp-tab-p">{money(p.price)}<small>/mo</small></span>
            </button>
          ))}
        </div>

        <div className="cmp-h">Plan Features</div>
        <div className="cmp-table">
          <div className="cmp-row cmp-head">
            <span></span><span>Silver</span><span>Gold</span><span>Platinum</span>
          </div>
          {COMPARE_ROWS.map((r) => (
            <div key={r.label} className="cmp-row">
              <span className="cmp-label">{r.label}</span>
              <span>{cell(r.silver)}</span><span>{cell(r.gold)}</span><span>{cell(r.platinum)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="w-foot">
        <button className="btn full" onClick={() => nav(`/membership/subscribe?plan=${sel}`)}>Choose {pickPlan(plans, sel).name} Plan</button>
      </div>
    </div>
  )
}
