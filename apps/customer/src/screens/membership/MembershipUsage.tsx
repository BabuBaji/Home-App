// 78 · Usage History (membership) — the member's real plan activity from the backend ledger
// (subscribed / renewed / cancelled / savings), plus a live usage summary.
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, PiggyBank, Calendar, Star, RefreshCw, XCircle, Sparkles, Tag } from 'lucide-react'
import { Loading } from '../../components/UI'
import { money } from '../../membership'
import { fetchMembershipUsage, type Membership, type MembershipEvent } from '../../api'

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const monthLabel = (s: string) => new Date(s).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
const monthKey = (s: string) => { const d = new Date(s); return `${d.getFullYear()}-${d.getMonth()}` }

const EVENT_META: Record<string, { icon: ReactNode; label: string; credit?: boolean }> = {
  subscribed: { icon: <Sparkles size={16} />, label: 'Subscribed' },
  renewed: { icon: <RefreshCw size={16} />, label: 'Renewed' },
  cancelled: { icon: <XCircle size={16} />, label: 'Cancelled' },
  saved: { icon: <Tag size={16} />, label: 'Plan Discount', credit: true },
  addon: { icon: <Star size={16} />, label: 'Free Add-on', credit: true },
}

export default function MembershipUsage() {
  const nav = useNavigate()
  const [mem, setMem] = useState<Membership | null>(null)
  const [history, setHistory] = useState<MembershipEvent[] | null>(null)

  useEffect(() => {
    fetchMembershipUsage()
      .then((r) => { setMem(r.membership); setHistory(r.history) })
      .catch(() => { setMem({ active: false }); setHistory([]) })
  }, [])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Usage History</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!history) return <div className="screen">{head}<Loading /></div>

  const summary = [
    { icon: <PiggyBank size={18} />, v: money(mem?.usage?.totalSaved ?? 0), l: 'You Saved' },
    { icon: <Calendar size={18} />, v: String(mem?.usage?.bookings ?? 0), l: 'Bookings' },
    { icon: <Star size={18} />, v: String(mem?.usage?.addonsUsed ?? 0), l: 'Add-ons' },
  ]

  // Group ledger rows by month.
  const groups: { key: string; label: string; items: MembershipEvent[] }[] = []
  for (const e of history) {
    const k = monthKey(e.created); const g = groups.find((x) => x.key === k)
    if (g) g.items.push(e); else groups.push({ key: k, label: monthLabel(e.created), items: [e] })
  }

  return (
    <div className="screen">
      {head}
      <div className="content">
        {mem?.plan && (
          <div className="act-usage" style={{ marginTop: 12 }}>
            {summary.map((u) => (
              <div key={u.l} className="act-u"><span className="act-u-ico">{u.icon}</span><span className="act-u-v">{u.v}</span><span className="act-u-l">{u.l}</span></div>
            ))}
          </div>
        )}

        {groups.length === 0 && (
          <div className="state"><div className="ico">🕘</div><h3>No usage yet</h3><p>Your plan activity appears here.</p></div>
        )}

        {groups.map((g) => (
          <section key={g.key} className="ord-month">
            <h2 className="ord-month-h">{g.label}</h2>
            <div className="uh-list">
              {g.items.map((e) => {
                const meta = EVENT_META[e.event] || { icon: <Tag size={16} />, label: e.event }
                return (
                  <div key={e.id} className="uh-row" style={{ cursor: 'default' }}>
                    <span className="uh-med" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{meta.icon}</span>
                    <span className="uh-main">
                      <span className="uh-name">{meta.label}</span>
                      {e.detail && <span className="uh-sub">{e.detail}</span>}
                      <span className="uh-sub">{fmtDate(e.created)}</span>
                    </span>
                    {e.amount > 0 && (
                      <span className={`uh-amt ${meta.credit ? 'saved' : ''}`}>{meta.credit ? '− ' : ''}{money(e.amount)}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
