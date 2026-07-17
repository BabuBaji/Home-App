// 69 · Cashback — the Promo purse: credits are cashback earned, debits are cashback spent.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Gift, TrendingUp, TrendingDown, Clock } from 'lucide-react'
import { Loading } from '../../components/UI'
import { fetchCashback, type CashbackInfo } from '../../api'
import { byMonth, money2, stamp } from '../../wallet'

type Tab = 'All' | 'Earned' | 'Used' | 'Expired'
const TABS: Tab[] = ['All', 'Earned', 'Used', 'Expired']

export default function Cashback() {
  const nav = useNavigate()
  const [info, setInfo] = useState<CashbackInfo | null>(null)
  const [tab, setTab] = useState<Tab>('All')

  useEffect(() => { fetchCashback().then(setInfo).catch(() => setInfo({ lifetime: 0, usable: 0, expired: 0, history: [] })) }, [])

  const groups = useMemo(() => {
    if (!info) return []
    const list = info.history.filter((h) => tab === 'All' || h.state === tab.toLowerCase())
    return byMonth(list, (h) => h.created)
  }, [info, tab])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Cashback</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!info) return <div className="screen">{head}<Loading /></div>

  return (
    <div className="screen">
      {head}
      <div className="content">
        <div className="w-hero">
          <div className="w-hero-top">
            <div>
              <div className="w-hero-k">Total Cashback Earned</div>
              <div className="w-hero-v">{money2(info.lifetime)}</div>
            </div>
            <Gift size={22} className="w-hero-ico" />
          </div>
          <div className="w-hero-split">
            <div><div className="w-hero-sk">Lifetime Cashback</div><div className="w-hero-sv">{money2(info.lifetime)}</div></div>
            <div><div className="w-hero-sk">Usable Cashback</div><div className="w-hero-sv">{money2(info.usable)}</div></div>
          </div>
        </div>

        <div className="ord-chips">
          {TABS.map((t) => <button key={t} className={`ord-chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>

        {groups.length === 0 && (
          <div className="state"><div className="ico">🎁</div><h3>No {tab === 'All' ? '' : tab.toLowerCase() + ' '}cashback yet</h3><p>Cashback from your bookings shows up here.</p></div>
        )}

        {groups.map((g) => (
          <section key={g.key} className="ord-month">
            <h2 className="ord-month-h">{g.label}</h2>
            <div className="wt-list">
              {g.items.map((h) => (
                <div key={h.id} className="wt-row">
                  <span className={`wt-ico ${h.state === 'earned' ? 'credit' : h.state === 'expired' ? 'expired' : 'debit'}`}>
                    {h.state === 'earned' ? <TrendingUp size={15} /> : h.state === 'expired' ? <Clock size={15} /> : <TrendingDown size={15} />}
                  </span>
                  <div className="wt-main">
                    <div className="wt-title">{h.title}</div>
                    <div className="wt-when">{stamp(h.created)}</div>
                  </div>
                  <div className="wt-right">
                    <div className={`wt-amt ${h.state === 'earned' ? 'credit' : 'debit'}`}>{h.state === 'earned' ? '+' : '−'} {money2(h.amount)}</div>
                    <div className={`wt-tag ${h.state === 'earned' ? 'credit' : 'debit'}`}>{h.state[0].toUpperCase() + h.state.slice(1)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
