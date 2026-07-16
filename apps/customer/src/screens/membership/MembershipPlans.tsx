// 74 · Membership Plans — Silver / Gold / Platinum cards. Choose Plan → Subscribe.
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { PLANS, money } from '../../membership'

export default function MembershipPlans() {
  const nav = useNavigate()
  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Membership Plans</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content">
        <div className="mem-hero">
          <div className="mem-hero-t">Save More. Enjoy More.</div>
          <div className="mem-hero-d">Choose the perfect plan for your home.</div>
          <span className="mem-hero-art">🏡</span>
        </div>

        <div className="mem-plans">
          {PLANS.map((p) => (
            <div key={p.key} className={`mem-plan ${p.key} ${p.popular ? 'pop' : ''}`}>
              {p.popular && <span className="mem-pop">Most Popular</span>}
              <div className="mem-plan-top">
                <div><div className="mem-plan-name">{p.name}</div><div className="mem-plan-tag">{p.tagline}</div></div>
                <div className="mem-plan-price">{money(p.price)}<small>/month</small></div>
              </div>
              <ul className="mem-feats">
                {p.features.map((f) => <li key={f}><Check size={14} /> {f}</li>)}
              </ul>
              <button className={`mem-choose ${p.popular ? 'solid' : ''}`} onClick={() => nav(`/membership/subscribe?plan=${p.key}`)}>Choose Plan</button>
            </div>
          ))}
        </div>

        <button className="mem-compare-link" onClick={() => nav('/membership/compare')}>Compare all plans →</button>
        <button className="mem-compare-link" onClick={() => nav('/membership/active')}>Already a member? View your plan →</button>
      </div>
    </div>
  )
}
