// 105 · AI Budget Planner — this month's real spend from bookings/transactions, broken down by
// category (aiHome.budget). The monthly budget target is a local preference (no budget backend).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Info, Sparkles } from 'lucide-react'
import { BottomNav, Loading } from '../../components/UI'
import { fetchBookings, fetchWallet } from '../../api'
import { budget, money } from '../../aiHome'
import type { Booking, Transaction } from '../../types'

const CAT_ICON: Record<string, string> = { Cleaning: '🧹', 'Fees & Taxes': '🧾', Maintenance: '🛠️', Services: '🧰' }
const TARGET_KEY = 'hh_budget_target'

export default function AIBudgetPlanner() {
  const nav = useNavigate()
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [txns, setTxns] = useState<Transaction[]>([])
  const [target] = useState<number>(() => Number(localStorage.getItem(TARGET_KEY)) || 5000)

  useEffect(() => {
    fetchBookings().then(setBookings).catch(() => setBookings([]))
    fetchWallet().then((w) => setTxns(w.transactions)).catch(() => {})
  }, [])

  const b = useMemo(() => bookings ? budget(bookings, txns) : null, [bookings, txns])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>AI Budget Planner</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!b) return <div className="screen has-nav">{head}<Loading /><BottomNav /></div>

  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const pct = target ? Math.min(100, Math.round((b.spent / target) * 100)) : 0
  const potentialSave = Math.round(b.spent * 0.1)

  return (
    <div className="screen has-nav">
      {head}
      <div className="content">
        <div className="bud-hero">
          <div className="bud-hero-main">
            <div className="bud-hero-k">Monthly Home Budget</div>
            <div className="bud-hero-m">{monthName}</div>
            <div className="bud-hero-v">{money(b.spent)}</div>
            <div className="bud-hero-of">of {money(target)}</div>
            <div className="bud-bar"><i style={{ width: `${pct}%` }} /></div>
          </div>
          <div className="bud-ring">{pct}%</div>
        </div>

        <div className="hhs-tiles-h">Budget Breakdown</div>
        {b.cats.length === 0 ? (
          <div className="state"><div className="ico">💰</div><h3>No spending yet this month</h3><p>Your booking spend will break down here.</p></div>
        ) : (
          <div className="ws-card">
            {b.cats.map((c) => (
              <div key={c.name} className="bud-row">
                <span className="bud-ico">{CAT_ICON[c.name] || '🧰'}</span>
                <span className="bud-name">{c.name}</span>
                <span className="bud-amt">{money(c.amount)}</span>
                <span className="bud-pct">{c.pct}%</span>
              </div>
            ))}
          </div>
        )}

        {b.spent > 0 && (
          <div className="bud-tip">
            <Sparkles size={18} />
            <div><div className="bud-tip-t">AI Suggestion</div><div className="bud-tip-d">You can save up to {money(potentialSave)} this month by booking a cleaning package.</div></div>
          </div>
        )}

        <button className="hc-emergency" style={{ background: 'var(--primary-50)', color: 'var(--primary-dark)', borderColor: '#e2ddf7' }} onClick={() => nav('/wallet/transactions')}>
          <Info size={16} /> View Spend History
        </button>
      </div>
      <BottomNav />
    </div>
  )
}
