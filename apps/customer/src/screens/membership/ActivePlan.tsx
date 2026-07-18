// 77 · Active Plan (My Membership). Shows the user's REAL current membership from the backend;
// if they have none, bounce to the plans screen. Usage tiles reflect stored counters.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, PiggyBank, Star, RefreshCw, XCircle, Gift, ClipboardList } from 'lucide-react'
import { pushBackHandler } from '../../backStack'
import { Loading } from '../../components/UI'
import { money } from '../../membership'
import { fetchMembership, type Membership } from '../../api'

const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const cycleLabel = (c?: string) => (c === '3m' ? '3 Months' : c === '12m' ? '12 Months' : 'Monthly')
const methodLabel = (m?: string) => (m === 'card' ? 'Card' : m === 'nb' ? 'Net Banking' : 'UPI')

export default function ActivePlan() {
  const nav = useNavigate()
  const [mem, setMem] = useState<Membership | null>(null)
  const [manage, setManage] = useState(false)
  useEffect(() => { if (manage) return pushBackHandler(() => setManage(false)) }, [manage])
  useEffect(() => { fetchMembership().then(setMem).catch(() => setMem({ active: false })) }, [])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>My Membership</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!mem) return <div className="screen">{head}<Loading /></div>

  // No live membership → invite them to the plans screen instead of showing an empty shell.
  if (!mem.active) {
    return (
      <div className="screen">
        {head}
        <div className="content">
          <div className="state"><div className="ico">👑</div><h3>No active membership</h3><p>Join a plan to start saving on every booking.</p></div>
          <button className="btn full" style={{ margin: '0 16px', width: 'calc(100% - 32px)' }} onClick={() => nav('/membership/plans')}>View Plans</button>
        </div>
      </div>
    )
  }

  const cancelled = mem.status === 'cancelled'
  const details: [string, string][] = [
    ['Plan', `${mem.planName} Plan`], ['Billing Cycle', cycleLabel(mem.cycle)], ['Amount', money(mem.price)],
    [cancelled ? 'Access Until' : 'Next Renewal', fmtDate(mem.renewsAt)], ['Payment Method', methodLabel(mem.method)],
  ]
  const usage = [
    { icon: <Calendar size={18} />, v: String(mem.usage?.bookings ?? 0), l: 'Total Bookings' },
    { icon: <PiggyBank size={18} />, v: money(mem.usage?.totalSaved ?? 0), l: 'You Saved' },
    { icon: <Star size={18} />, v: String(mem.usage?.addonsUsed ?? 0), l: 'Add-ons Used' },
  ]

  return (
    <div className="screen">
      {head}
      <div className="content pad-cta">
        <div className={`act-card ${cancelled ? 'cxl' : ''}`}>
          <span className="act-badge">{cancelled ? 'Cancelling' : 'Active'}</span>
          <div className="act-you">You are on</div>
          <div className="act-plan">{mem.planName} Plan</div>
          <div className="act-valid">{cancelled ? 'Benefits end' : 'Valid till'} {fmtDate(mem.renewsAt)}</div>
          <button className="act-view" onClick={() => nav('/membership/benefits')}>View Benefits</button>
          <span className="act-crown">👑</span>
        </div>

        {cancelled && (
          <div className="cxl-warn" style={{ marginTop: 14 }}>
            <XCircle size={20} />
            <div><div className="cxl-warn-t">Auto-renew is off</div><div className="cxl-warn-d">You keep your benefits until {fmtDate(mem.renewsAt)}. Renew any time to stay a member.</div></div>
          </div>
        )}

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
              { icon: <RefreshCw size={16} />, t: cancelled ? 'Reactivate Plan' : 'Renew Plan', to: '/membership/renewal' },
              { icon: <ClipboardList size={16} />, t: 'Usage History', to: '/membership/usage' },
              { icon: <Gift size={16} />, t: 'View Benefits', to: '/membership/benefits' },
              ...(cancelled ? [] : [{ icon: <XCircle size={16} />, t: 'Cancel Membership', to: '/membership/cancel', danger: true }]),
            ].map((r) => (
              <button key={r.t} className={`sheet-row ${(r as { danger?: boolean }).danger ? 'danger' : ''}`} onClick={() => { setManage(false); nav(r.to) }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{r.icon} {r.t}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
