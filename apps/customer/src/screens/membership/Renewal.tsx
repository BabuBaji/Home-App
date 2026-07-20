// 79 · Renewal — renew (or reactivate) the active plan; pick a renewal cycle. Extends the real
// membership on the backend.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Smartphone } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { pickPlan, loadPlans, CYCLES, cyclePrice, money, type Plan } from '../../membership'
import { fetchMembership, renewMembership, type Membership } from '../../api'

const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export default function Renewal() {
  const nav = useNavigate()
  const toast = useToast()
  const [mem, setMem] = useState<Membership | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [cycle, setCycle] = useState('monthly')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchMembership().then((m) => {
      setMem(m)
      if (!m.active && !m.plan) nav('/membership/plans', { replace: true })
      else if (m.cycle) setCycle(m.cycle)
    }).catch(() => setMem({ active: false }))
  }, [nav])
  useEffect(() => { loadPlans().then(setPlans).catch(() => setPlans([])) }, [])

  if (!mem) return <div className="screen"><header className="appbar ord-appbar"><button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button><div className="titles"><h1>Renew Your Plan</h1></div><span className="iconbtn ghost" /></header><Loading /></div>

  const plan = pickPlan(plans, mem.plan || 'gold')

  const renew = async () => {
    if (busy) return
    setBusy(true)
    try {
      await renewMembership({ cycle })
      toast('Your plan has been renewed 🎉')
      nav('/membership/active', { replace: true })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not renew')
      setBusy(false)
    }
  }

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
          <div className="ren-next">{mem.status === 'cancelled' ? 'Access Until' : 'Next Renewal'}<br /><b>{fmtDate(mem.renewsAt)}</b></div>
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
        <button className="btn full" disabled={busy} onClick={renew}>{busy ? 'Processing…' : 'Renew Now'}</button>
        <div className="ren-note">Renewing extends your plan from {fmtDate(mem.renewsAt)}</div>
      </div>
    </div>
  )
}
