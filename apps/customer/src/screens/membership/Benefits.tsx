// 81 · Benefits — the active plan's benefit list.
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { planByKey, BENEFITS } from '../../membership'

export default function Benefits() {
  const nav = useNavigate()
  const plan = planByKey('gold')

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>{plan.name} Plan Benefits</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content pad-cta">
        <div className="ben-card">
          <span className="ben-crown">👑</span>
          <span className="act-badge">Active</span>
          <div className="ben-name">{plan.name} Plan</div>
          <div className="ben-d">Enjoy exclusive benefits with your membership</div>
        </div>

        <div className="ben-list">
          {BENEFITS.map((b) => (
            <div key={b.t} className="ben-row">
              <span className="ben-ico">{b.icon}</span>
              <div><div className="ben-t">{b.t}</div><div className="ben-sub">{b.d}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-foot">
        <button className="btn ghost full" onClick={() => nav('/membership')}>View Plan Details <ChevronRight size={16} /></button>
      </div>
    </div>
  )
}
