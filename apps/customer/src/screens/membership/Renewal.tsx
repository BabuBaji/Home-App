// 79 · Renewal — renew the active plan; pick a renewal cycle. (Payment wiring later.)
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Smartphone } from 'lucide-react'
import { useToast } from '../../components/UI'
import { planByKey, CYCLES, cyclePrice, money } from '../../membership'

export default function Renewal() {
  const nav = useNavigate()
  const toast = useToast()
  const plan = planByKey('gold')
  const [cycle, setCycle] = useState('monthly')

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Renew Your Plan</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content pad-cta">
        <div className="ren-card">
          <div className="ren-name">{plan.name} Plan</div>
          <div className="ren-price">{money(plan.price)} <small>/month</small></div>
          <div className="ren-next">Next Renewal<br /><b>16 May 2026</b></div>
          <span className="ren-crown">👑</span>
        </div>

        <div className="mem-sec">Choose Renewal Option</div>
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

        <div className="mem-sec">Payment Method</div>
        <div className="ren-pay">
          <Smartphone size={17} /><span>UPI</span><span className="sub-rec">Recommended</span>
          <button className="ren-change" onClick={() => toast('Change payment — coming soon')}>Change</button>
        </div>
      </div>

      <div className="w-foot">
        <button className="btn full" onClick={() => toast('Renewal is coming soon')}>Renew Now</button>
        <div className="ren-note">Your plan will be renewed on 16 May 2026</div>
      </div>
    </div>
  )
}
