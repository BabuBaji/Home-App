// 97 · Home Health Score — the AI Home hub. Score, sub-scores and weekly trend are COMPUTED from
// the customer's real completed bookings (see aiHome.ts). Cards link to the other AI Home screens.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Sparkles, CalendarClock, Droplet, Trash2, Bug, PartyPopper, Wallet, History, ChevronRight } from 'lucide-react'
import { BottomNav, Loading } from '../../components/UI'
import { fetchBookings } from '../../api'
import { useStore } from '../../store'
import { healthScore, scoreTrend } from '../../aiHome'
import type { Booking } from '../../types'

const SUB = [
  { key: 'cleanliness', label: 'Cleanliness', icon: '🧹' },
  { key: 'maintenance', label: 'Maintenance', icon: '🛡️' },
  { key: 'hygiene', label: 'Hygiene', icon: '💧' },
  { key: 'safety', label: 'Safety', icon: '🛟' },
] as const

const TILES = [
  { icon: <Sparkles size={17} />, t: 'AI Recommendations', to: '/ai/recommendations' },
  { icon: <CalendarClock size={17} />, t: 'Recurring Cleaning Planner', to: '/ai/planner' },
  { icon: <History size={17} />, t: 'Home Maintenance Calendar', to: '/ai/calendar' },
  { icon: <Droplet size={17} />, t: 'Water Can Reminder', to: '/ai/water' },
  { icon: <Trash2 size={17} />, t: 'Garbage Reminder', to: '/ai/garbage' },
  { icon: <Bug size={17} />, t: 'Pest Control Reminder', to: '/ai/pest' },
  { icon: <PartyPopper size={17} />, t: 'Festival Cleaning', to: '/ai/festival' },
  { icon: <Wallet size={17} />, t: 'AI Budget Planner', to: '/ai/budget' },
  { icon: <History size={17} />, t: 'Home Timeline', to: '/ai/timeline' },
]

export default function HomeHealthScore() {
  const nav = useNavigate()
  const { user } = useStore()
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  useEffect(() => { fetchBookings().then(setBookings).catch(() => setBookings([])) }, [])

  const hs = useMemo(() => bookings ? healthScore(bookings) : null, [bookings])
  const trend = useMemo(() => bookings ? scoreTrend(bookings) : [], [bookings])
  const first = (user?.name || '').trim().split(' ')[0] || 'there'
  const greet = (() => { const h = new Date().getHours(); return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening' })()

  const head = (
    <header className="appbar ord-appbar">
      <span className="iconbtn ghost" />
      <div className="titles"><h1>Home Health Score</h1></div>
      <button className="iconbtn" onClick={() => nav('/notifications')} aria-label="Notifications"><Bell size={18} /></button>
    </header>
  )
  if (!hs) return <div className="screen has-nav">{head}<Loading /><BottomNav /></div>

  const R = 52, C = 2 * Math.PI * R
  return (
    <div className="screen has-nav">
      {head}
      <div className="content">
        <div className="hhs-hi">{greet}, {first} 👋</div>
        <div className="hhs-sub">Let's make your home healthier today.</div>

        <div className="hhs-gauge">
          <svg viewBox="0 0 130 130" width="150" height="150">
            <circle cx="65" cy="65" r={R} fill="none" stroke="#eceaf4" strokeWidth="11" />
            <circle cx="65" cy="65" r={R} fill="none" stroke="url(#hhsg)" strokeWidth="11" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - hs.score / 100)} transform="rotate(-90 65 65)" />
            <defs><linearGradient id="hhsg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7c6df7" /><stop offset="1" stopColor="#4840c4" /></linearGradient></defs>
            <text x="65" y="62" textAnchor="middle" fontSize="30" fontWeight="800" fill="#1c1830">{hs.score}</text>
            <text x="65" y="82" textAnchor="middle" fontSize="12" fill="#9a97ad">/100</text>
          </svg>
          <div className="hhs-label">{hs.label}</div>
        </div>

        <div className="hhs-subs">
          {SUB.map((s) => (
            <div key={s.key} className="hhs-sc">
              <span className="hhs-sc-ico">{s.icon}</span>
              <div><div className="hhs-sc-l">{s.label}</div><div className="hhs-sc-v">{hs[s.key]}/100</div></div>
            </div>
          ))}
        </div>

        <div className="hhs-trend">
          <div className="hhs-trend-h">Score Trend <span>This Week</span></div>
          <svg viewBox="0 0 300 90" width="100%" height="90" preserveAspectRatio="none">
            <polyline fill="none" stroke="#6d5cf5" strokeWidth="2.5" strokeLinejoin="round"
              points={trend.map((v, i) => `${(i / (trend.length - 1)) * 300},${90 - (v / 100) * 80 - 5}`).join(' ')} />
            {trend.map((v, i) => <circle key={i} cx={(i / (trend.length - 1)) * 300} cy={90 - (v / 100) * 80 - 5} r="3" fill="#6d5cf5" />)}
          </svg>
          <div className="hhs-trend-x"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
        </div>

        <div className="hhs-tiles-h">Explore AI Home</div>
        <div className="ws-card">
          {TILES.map((t) => (
            <button key={t.t} className="ws-row" onClick={() => nav(t.to)}>
              <span className="ws-ico">{t.icon}</span>
              <span className="ws-main"><span className="ws-t">{t.t}</span></span>
              <ChevronRight size={17} className="ws-chev" />
            </button>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
