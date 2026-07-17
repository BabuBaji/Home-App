// 76 · Subscribe — chosen plan, billing cycle, payment method. (Payment wiring comes later.)
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Smartphone, CreditCard, Building2, ChevronRight } from 'lucide-react'
import { useToast } from '../../components/UI'
import { planByKey, CYCLES, cyclePrice, money } from '../../membership'

export default function Subscribe() {
  const nav = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const plan = planByKey(params.get('plan') || 'gold')
  const [cycle, setCycle] = useState('monthly')
  const [method, setMethod] = useState('upi')

  const active = CYCLES.find((c) => c.key === cycle) || CYCLES[0]
  const { total } = cyclePrice(plan.price, active.months, active.savePct)

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Subscribe</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content pad-cta">
        <div className="sub-plan">
          <span className="sub-plan-crown">👑</span>
          {plan.popular && <span className="sub-plan-badge">Most Popular</span>}
          <div className="sub-plan-name">{plan.name} Plan</div>
          <div className="sub-plan-price">{money(plan.price)} <small>/month</small></div>
          <ul className="sub-feats">{plan.features.slice(0, 4).map((f) => <li key={f}><Check size={13} /> {f}</li>)}</ul>
        </div>

        <div className="sub-sec">Choose Billing Cycle</div>
        <div className="sub-cycles">
          {CYCLES.map((c) => {
            const cp = cyclePrice(plan.price, c.months, c.savePct)
            return (
              <button key={c.key} className={`sub-cycle ${cycle === c.key ? 'sel' : ''}`} onClick={() => setCycle(c.key)}>
                <span className={`sub-radio ${cycle === c.key ? 'on' : ''}`} />
                <span className="sub-cycle-l">{c.label}</span>
                <span className="sub-cycle-p">{money(cp.total)}{c.months === 1 && <small>/month</small>}</span>
                {cp.save > 0 && <span className="sub-cycle-save">Save {money(cp.save)}</span>}
              </button>
            )
          })}
        </div>

        <div className="sub-sec">Payment Method</div>
        <div className="sub-methods">
          {[{ k: 'upi', icon: <Smartphone size={17} />, l: 'UPI', rec: true }, { k: 'card', icon: <CreditCard size={17} />, l: 'Card' }, { k: 'nb', icon: <Building2 size={17} />, l: 'Net Banking' }].map((m) => (
            <button key={m.k} className={`sub-method ${method === m.k ? 'sel' : ''}`} onClick={() => setMethod(m.k)}>
              {m.icon}<span>{m.l}</span>{m.rec && <span className="sub-rec">Recommended</span>}
            </button>
          ))}
        </div>
        <button className="sub-more" onClick={() => toast('More payment options coming soon')}>More Options <ChevronRight size={16} /></button>
      </div>

      <div className="w-foot">
        <button className="btn full" onClick={() => toast('Subscription checkout is coming soon')}>Pay {money(total)} &amp; Subscribe</button>
        <div className="sub-terms">By continuing, you agree to our <button onClick={() => nav('/terms')}>Terms &amp; Conditions</button></div>
      </div>
    </div>
  )
}
