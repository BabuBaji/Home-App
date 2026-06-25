import { useEffect, useState } from 'react'
import { Header, BottomNav, Loading, useToast } from '../components/UI'
import { fetchWallet, addMoney } from '../api'
import { useStore } from '../store'
import type { Transaction } from '../types'

export default function Wallet() {
  const toast = useToast()
  const { user, setUser } = useStore()
  const [balance, setBalance] = useState<number | null>(null)
  const [cashback, setCashback] = useState(200)
  const [txns, setTxns] = useState<Transaction[]>([])
  const [busy, setBusy] = useState(false)

  function load() { fetchWallet().then((w) => { setBalance(w.balance); setCashback(w.cashback); setTxns(w.transactions) }).catch(() => {}) }
  useEffect(load, [])

  async function add() {
    setBusy(true)
    try { const { balance } = await addMoney(500); setBalance(balance); if (user) setUser({ ...user, wallet: balance }); toast('₹500 added'); load() }
    catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  if (balance === null) return <div className="screen has-nav"><Header title="Wallet" back={false} /><Loading /><BottomNav /></div>

  return (
    <div className="screen has-nav">
      <Header title="Wallet" back={false} right={<span>?</span>} />
      <div className="content">
        <div className="wallet-card">
          <div className="wc-top"><div><div className="lbl">My Wallet Balance</div><div className="bal">₹{balance.toLocaleString('en-IN')}</div><div className="sub">Total Balance</div></div>
            <button className="add-money" onClick={add} disabled={busy}>+ Add Money</button></div>
        </div>
        <div className="card offer"><span className="oi">🏷</span><div><div className="ot">You have ₹{cashback} cashback</div><div className="od">Use it on your next booking</div></div><span className="ol">View ›</span></div>

        <h3 className="section-title">Transactions</h3>
        <div className="card pad tight">
          {txns.map((t) => (
            <div key={t.id} className="txn"><span className={`ti ${t.type === 'credit' ? 'cr' : 'db'}`}>{t.type === 'credit' ? '+' : '💳'}</span>
              <div><div className="tt">{t.title}</div><div className="td">{new Date(t.created).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{t.ref ? ` · ${t.ref}` : ''}</div></div>
              <div className="amt"><div className={`a ${t.type}`}>{t.type === 'credit' ? '+' : '-'}₹{t.amount}</div><div className="b">Bal: ₹{t.balance.toLocaleString('en-IN')}</div></div></div>
          ))}
          {txns.length === 0 && <p className="muted center-text" style={{ padding: 16 }}>No transactions yet.</p>}
        </div>
        <div className="banner-soft"><span className="bi">🛡</span><div className="grow"><div className="bt">100% Secure Transactions</div><div className="bd">Your wallet payments are safe.</div></div></div>
      </div>
      <BottomNav />
    </div>
  )
}
