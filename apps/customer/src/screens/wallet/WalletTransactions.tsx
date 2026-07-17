// 67 · Transactions — the wallet ledger, month-grouped, filtered by the server's typed `kind`.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, SlidersHorizontal, Check, Plus, CreditCard, Gift, Users, RotateCcw, Wallet as WalletIcon } from 'lucide-react'
import { Loading } from '../../components/UI'
import { pushBackHandler } from '../../backStack'
import { fetchWallet } from '../../api'
import { byMonth, inTxnTab, money2, stamp, txnKindLabel, type TxnTab } from '../../wallet'
import type { Transaction } from '../../types'

const TABS: TxnTab[] = ['All', 'Credit', 'Debit', 'Refund']

// Icon per typed reason; falls back to the credit/debit direction for untyped legacy rows.
function TxnIcon({ t }: { t: Transaction }) {
  const k = t.kind
  const icon = k === 'ADD_MONEY' ? <Plus size={15} />
    : k === 'CASHBACK' ? <Gift size={15} />
      : k === 'REFERRAL_BONUS' ? <Users size={15} />
        : k === 'REFUND' ? <RotateCcw size={15} />
          : k === 'GIFT_CARD' ? <Gift size={15} />
            : k === 'BOOKING_PAYMENT' || k === 'PARTIAL_PAYMENT' ? <CreditCard size={15} />
              : t.type === 'credit' ? <Plus size={15} /> : <WalletIcon size={15} />
  return <span className={`wt-ico ${t.type}`}>{icon}</span>
}

export default function WalletTransactions() {
  const nav = useNavigate()
  const [txns, setTxns] = useState<Transaction[] | null>(null)
  const [tab, setTab] = useState<TxnTab>('All')
  const [sort, setSort] = useState<'new' | 'old'>('new')
  const [showSort, setShowSort] = useState(false)

  useEffect(() => { fetchWallet().then((w) => setTxns(w.transactions)).catch(() => setTxns([])) }, [])
  useEffect(() => { if (showSort) return pushBackHandler(() => setShowSort(false)) }, [showSort])

  const groups = useMemo(() => {
    if (!txns) return []
    const list = txns.filter((t) => inTxnTab(t, tab))
      .sort((a, b) => sort === 'new' ? +new Date(b.created) - +new Date(a.created) : +new Date(a.created) - +new Date(b.created))
    return byMonth(list, (t) => t.created)
  }, [txns, tab, sort])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Transactions</h1></div>
      <button className="iconbtn" onClick={() => setShowSort(true)} aria-label="Sort"><SlidersHorizontal size={18} /></button>
    </header>
  )
  if (!txns) return <div className="screen">{head}<Loading /></div>

  return (
    <div className="screen">
      {head}
      <div className="content">
        <div className="ord-chips">
          {TABS.map((t) => (
            <button key={t} className={`ord-chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {groups.length === 0 && (
          <div className="state"><div className="ico">🧾</div><h3>No {tab === 'All' ? '' : tab.toLowerCase() + ' '}transactions</h3><p>They'll show up here.</p></div>
        )}

        {groups.map((g) => (
          <section key={g.key} className="ord-month">
            <h2 className="ord-month-h">{g.label}</h2>
            <div className="wt-list">
              {g.items.map((t) => (
                <div key={t.id} className="wt-row">
                  <TxnIcon t={t} />
                  <div className="wt-main">
                    <div className="wt-title">{t.title}</div>
                    <div className="wt-when">{stamp(t.created)}</div>
                  </div>
                  <div className="wt-right">
                    <div className={`wt-amt ${t.type}`}>{t.type === 'credit' ? '+' : '−'} {money2(t.amount)}</div>
                    <div className={`wt-tag ${t.type}`}>{txnKindLabel(t.kind, t.type)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {showSort && (
        <div className="sheet-wrap" onClick={() => setShowSort(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-h">Sort by</div>
            {([['new', 'Newest first'], ['old', 'Oldest first']] as const).map(([v, label]) => (
              <button key={v} className="sheet-row" onClick={() => { setSort(v); setShowSort(false) }}>
                <span>{label}</span>{sort === v && <Check size={16} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
