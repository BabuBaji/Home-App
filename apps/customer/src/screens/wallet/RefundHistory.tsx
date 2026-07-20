// 72 · Refund History — every booking that produced a refund. Status is what actually happened:
// 'completed' credited, 'failed' the credit did not go through, 'pending' owed but not yet run.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { Loading } from '../../components/UI'
import { ServiceThumb } from '../../serviceArt'
import { fetchRefunds, type RefundEntry } from '../../api'
import { byMonth, money2, stamp } from '../../wallet'

type Tab = 'All' | 'Completed' | 'Pending' | 'Failed'
const TABS: Tab[] = ['All', 'Completed', 'Pending', 'Failed']

export default function RefundHistory() {
  const nav = useNavigate()
  const [rows, setRows] = useState<RefundEntry[] | null>(null)
  const [tab, setTab] = useState<Tab>('All')

  useEffect(() => { fetchRefunds().then(setRows).catch(() => setRows([])) }, [])

  const groups = useMemo(() => {
    if (!rows) return []
    const list = rows.filter((r) => tab === 'All' || r.status === tab.toLowerCase())
    return byMonth(list, (r) => r.created)
  }, [rows, tab])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Refund History</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!rows) return <div className="screen">{head}<Loading /></div>

  return (
    <div className="screen">
      {head}
      <div className="content">
        <div className="ord-chips">
          {TABS.map((t) => <button key={t} className={`ord-chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>

        {groups.length === 0 && (
          <div className="state"><div className="ico">↩️</div><h3>No {tab === 'All' ? '' : tab.toLowerCase() + ' '}refunds</h3><p>Refunds from cancelled bookings show up here.</p></div>
        )}

        {groups.map((g) => (
          <section key={g.key} className="ord-month">
            <h2 className="ord-month-h">{g.label}</h2>
            <div className="wt-list">
              {g.items.map((r) => (
                <button key={r.id} className="wt-row tap" onClick={() => nav(`/booking-details/${r.id}`)}>
                  {r.serviceId
                    ? <span className="wt-thumb"><ServiceThumb service={{ id: r.serviceId, name: r.title, image: `/services/${r.serviceId}.jpg` }} medallion={30} /></span>
                    : <span className="wt-ico credit"><RotateCcw size={15} /></span>}
                  <div className="wt-main">
                    <div className="wt-title">{r.title}</div>
                    <div className="wt-when">{stamp(r.created)}</div>
                  </div>
                  <div className="wt-right">
                    <div className={`wt-amt ${r.status === 'failed' ? 'debit' : 'credit'}`}>+ {money2(r.amount)}</div>
                    <div className={`wt-tag ${r.status === 'completed' ? 'credit' : r.status === 'failed' ? 'debit' : 'pending'}`}>
                      {r.status[0].toUpperCase() + r.status.slice(1)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
