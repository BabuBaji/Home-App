// 77 · Active Plan (My Membership). Presentational — shows the Gold plan layout; real subscription
// state is a later feature. Usage summary reflects the design.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, PiggyBank, Star, RefreshCw, XCircle, Gift, ClipboardList } from 'lucide-react'
import { pushBackHandler } from '../../backStack'
import { planByKey, money } from '../../membership'

export default function ActivePlan() {
  const nav = useNavigate()
  const plan = planByKey('gold')
  const [manage, setManage] = useState(false)
  useEffect(() => { if (manage) return pushBackHandler(() => setManage(false)) }, [manage])

  const details: [string, string][] = [
    ['Plan', `${plan.name} Plan`], ['Billing Cycle', 'Monthly'], ['Amount', money(plan.price)],
    ['Next Renewal', '16 May 2026'], ['Payment Method', 'UPI'],
  ]
  const usage = [
    { icon: <Calendar size={18} />, v: '28', l: 'Total Bookings' },
    { icon: <PiggyBank size={18} />, v: money(1860), l: 'You Saved' },
    { icon: <Star size={18} />, v: '4', l: 'Add-ons Used' },
  ]

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>My Membership</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content pad-cta">
        <div className="act-card">
          <span className="act-badge">Active</span>
          <div className="act-you">You are on</div>
          <div className="act-plan">{plan.name} Plan</div>
          <div className="act-valid">Valid till 16 May 2026</div>
          <button className="act-view" onClick={() => nav('/membership/benefits')}>View Benefits</button>
          <span className="act-crown">👑</span>
        </div>

        <div className="mem-sec">Plan Details</div>
        <div className="ws-card rs-kv">
          {details.map(([k, v]) => <div key={k} className="ord-kv"><span className="ord-kv-k">{k}</span><span className="ord-kv-v">{v}</span></div>)}
        </div>

        <div className="mem-sec">Usage Summary</div>
        <div className="act-usage">
          {usage.map((u) => (
            <div key={u.l} className="act-u"><span className="act-u-ico">{u.icon}</span><span className="act-u-v">{u.v}</span><span className="act-u-l">{u.l}</span></div>
          ))}
        </div>
      </div>

      <div className="w-foot">
        <button className="btn ghost full" onClick={() => setManage(true)}>Manage Membership</button>
      </div>

      {manage && (
        <div className="sheet-wrap" onClick={() => setManage(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-h">Manage Membership</div>
            {[
              { icon: <RefreshCw size={16} />, t: 'Renew Plan', to: '/membership/renewal' },
              { icon: <ClipboardList size={16} />, t: 'Usage History', to: '/membership/usage' },
              { icon: <Gift size={16} />, t: 'View Benefits', to: '/membership/benefits' },
              { icon: <XCircle size={16} />, t: 'Cancel Membership', to: '/membership/cancel', danger: true },
            ].map((r) => (
              <button key={r.t} className={`sheet-row ${r.danger ? 'danger' : ''}`} onClick={() => { setManage(false); nav(r.to) }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{r.icon} {r.t}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
