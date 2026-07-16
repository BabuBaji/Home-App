// 87 · Loyalty Points — the real points balance from the wallet (reward_points). The earn rules
// and redemption tiers below describe the programme; there is no points earn/redeem backend yet, so
// those actions are informational rather than transactional (flagged, not faked).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Star, Calendar, MessageSquare, Users, Tag, Wallet, Percent, Sparkles, ChevronRight } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { fetchWallet } from '../../api'

const RATE = 100 // points per ₹1 (display only — matches "100 Points = ₹1")

export default function Loyalty() {
  const nav = useNavigate()
  const toast = useToast()
  const [points, setPoints] = useState<number | null>(null)

  useEffect(() => { fetchWallet().then((w) => setPoints(w.points)).catch(() => setPoints(0)) }, [])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Loyalty Points</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (points === null) return <div className="screen">{head}<Loading /></div>

  // Each earn method routes to the flow where you actually earn it (there is no points-crediting
  // backend, so these open the real action rather than faking an award).
  const EARN = [
    { icon: <Calendar size={16} />, t: 'Every Booking', d: '10 Points per ₹100 spent', to: '/home' },
    { icon: <MessageSquare size={16} />, t: 'Review & Rating', d: '50 Points', to: '/bookings/completed' },
    { icon: <Users size={16} />, t: 'Refer a Friend', d: '100 Points', to: '/refer' },
    { icon: <Tag size={16} />, t: 'Special Offers', d: 'Limited time offers', to: '/offers' },
  ]
  const REDEEM = [
    { icon: <Wallet size={17} />, t: '₹50 Cashback', d: '500 Points', cost: 500 },
    { icon: <Percent size={17} />, t: '₹100 OFF', d: '1,000 Points', cost: 1000 },
    { icon: <Sparkles size={17} />, t: 'Free Service', d: '2,000 Points', cost: 2000 },
  ]

  const redeem = (cost: number, label: string) =>
    points >= cost ? toast(`Redeeming ${label} — coming soon`) : toast(`You need ${(cost - points).toLocaleString('en-IN')} more points for ${label}`)

  return (
    <div className="screen">
      {head}
      <div className="content">
        <div className="lp-hero">
          <div className="lp-hero-main">
            <div className="lp-hero-k">Your Loyalty Points</div>
            <div className="lp-hero-v"><Star size={20} className="lp-star" /> {points.toLocaleString('en-IN')}</div>
            <div className="lp-hero-d">Keep earning points &amp; unlock rewards!</div>
          </div>
          <Star size={40} className="lp-hero-art" />
        </div>

        <div className="lp-sec">Earn Points</div>
        <div className="ws-card">
          {EARN.map((e) => (
            <button key={e.t} className="ws-row" onClick={() => nav(e.to)}>
              <span className="ws-ico">{e.icon}</span>
              <span className="ws-main"><span className="ws-t">{e.t}</span><span className="ws-d">{e.d}</span></span>
              <ChevronRight size={17} className="ws-chev" />
            </button>
          ))}
        </div>

        <div className="lp-redeem-head">
          <div className="lp-sec">Redeem Points</div>
          <button className="lp-viewall" onClick={() => toast('More rewards coming soon')}>View All</button>
        </div>
        <div className="lp-redeem">
          {REDEEM.map((r) => (
            <button key={r.t} className={`lp-rd ${points >= r.cost ? 'on' : ''}`} onClick={() => redeem(r.cost, r.t)}>
              <span className="lp-rd-ico">{r.icon}</span>
              <span className="lp-rd-t">{r.t}</span>
              <span className="lp-rd-d">{r.d}</span>
            </button>
          ))}
        </div>
        <div className="lp-rate">{RATE} Points = ₹1</div>
      </div>
    </div>
  )
}
