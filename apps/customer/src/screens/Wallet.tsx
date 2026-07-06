import { useEffect, useState } from 'react'
import { Header, BottomNav, Loading, useToast } from '../components/UI'
import PaymentSheet from '../components/PaymentSheet'
import { fetchWallet, walletTopup, applyReferral } from '../api'
import { useStore } from '../store'
import type { Transaction } from '../types'

const PRESETS = [100, 250, 500, 1000]

export default function Wallet() {
  const toast = useToast()
  const { user, setUser } = useStore()
  const [balance, setBalance] = useState<number | null>(null)
  const [promo, setPromo] = useState(0)
  const [points, setPoints] = useState(0)
  const [status, setStatus] = useState('active')
  const [txns, setTxns] = useState<Transaction[]>([])
  const [picker, setPicker] = useState(false)
  const [amount, setAmount] = useState(500)
  const [custom, setCustom] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [refCode, setRefCode] = useState('')
  const [refBusy, setRefBusy] = useState(false)
  const [refDone, setRefDone] = useState(false)

  async function applyRef() {
    const code = refCode.trim().toUpperCase()
    if (!code) return
    setRefBusy(true)
    try { const r = await applyReferral(code); setRefDone(true); if (user) setUser({ ...user, referredBy: -1 }); toast(`Code applied! ${r.referrer} earns ₹${r.reward} when you finish your first booking.`) }
    catch (e) { toast((e as Error).message) } finally { setRefBusy(false) }
  }

  function load() { fetchWallet().then((w) => { setBalance(w.cash); setPromo(w.promo); setPoints(w.points); setStatus(w.status); setTxns(w.transactions) }).catch(() => {}) }
  useEffect(load, [])

  function openPicker() { setAmount(500); setCustom(''); setPicker(true) }
  function continueToPay() {
    if (!amount || amount < 1) return toast('Choose an amount')
    setPicker(false); setPayOpen(true)
  }
  async function onPaid(_method: string, paymentId: string) {
    setPayOpen(false)
    try {
      const { balance: bal } = await walletTopup(paymentId, amount)
      if (typeof bal === 'number') { setBalance(bal); if (user) setUser({ ...user, wallet: bal }) }
      toast(`₹${amount} added to your wallet`)
    } catch (e) { toast((e as Error).message) }
    load()
  }

  if (balance === null) return <div className="screen has-nav"><Header title="Wallet" back={false} /><Loading /><BottomNav /></div>

  return (
    <div className="screen has-nav">
      <Header title="Wallet" back={false} right={<span>?</span>} />
      <div className="content">
        <div className="wallet-card">
          <div className="wc-top"><div><div className="lbl">Total Usable Balance</div><div className="bal">₹{(balance + promo).toLocaleString('en-IN')}</div><div className="sub">Cash + Promo</div></div>
            {status === 'active'
              ? <button className="add-money" onClick={openPicker}>+ Add Money</button>
              : <span className="add-money" style={{ opacity: .8 }}>{status === 'frozen' ? 'Frozen' : 'Blocked'}</span>}</div>
          <div className="wc-splits">
            <div><div className="wc-s-l">💵 Cash</div><div className="wc-s-v">₹{balance.toLocaleString('en-IN')}</div></div>
            <div><div className="wc-s-l">🎁 Promo</div><div className="wc-s-v">₹{promo.toLocaleString('en-IN')}</div></div>
            <div><div className="wc-s-l">⭐ Points</div><div className="wc-s-v">{points.toLocaleString('en-IN')}</div></div>
          </div>
        </div>
        {status !== 'active' && <div className="card offer" style={{ background: '#fff4de' }}><span className="oi">⚠️</span><div><div className="ot">Wallet {status}</div><div className="od">You can’t add or use your wallet right now. Contact support.</div></div></div>}
        {promo > 0 && <div className="card offer"><span className="oi">🏷</span><div><div className="ot">You have ₹{promo} promo credit</div><div className="od">Used first on your next booking</div></div></div>}

        {!user?.referredBy && !refDone && (
          <div className="card pad ref-apply">
            <div className="ra-t">🎁 Have a referral code?</div>
            <div className="ra-d">Apply a friend’s code — they earn ₹150 when you complete your first booking.</div>
            <div className="ra-row">
              <div className="field ra-input"><input value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())} placeholder="e.g. HH1A2B3C" maxLength={12} /></div>
              <button className="btn ra-btn" onClick={applyRef} disabled={refBusy || !refCode.trim()}>{refBusy ? '…' : 'Apply'}</button>
            </div>
          </div>
        )}

        <h3 className="section-title">Transactions</h3>
        <div className="card pad tight">
          {txns.map((t) => (
            <div key={t.id} className="txn"><span className={`ti ${t.type === 'credit' ? 'cr' : 'db'}`}>{t.type === 'credit' ? '+' : '💳'}</span>
              <div><div className="tt">{t.title}</div><div className="td">{new Date(t.created).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{t.ref ? ` · ${t.ref}` : ''}</div></div>
              <div className="amt"><div className={`a ${t.type}`}>{t.type === 'credit' ? '+' : '-'}₹{t.amount}</div><div className="b">Bal: ₹{t.balance.toLocaleString('en-IN')}</div></div></div>
          ))}
          {txns.length === 0 && <p className="muted center-text" style={{ padding: 16 }}>No transactions yet.</p>}
        </div>
        <div className="banner-soft"><span className="bi">🛡</span><div className="grow"><div className="bt">100% Secure Transactions</div><div className="bd">Wallet is credited only after your payment is verified.</div></div></div>
      </div>

      {picker && (
        <div className="sheet-backdrop" onClick={() => setPicker(false)}>
          <div className="amt-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="amt-grab" />
            <div className="amt-title">Add money to wallet</div>
            <div className="amt-grid">
              {PRESETS.map((v) => (
                <button key={v} className={`amt-chip ${amount === v && !custom ? 'sel' : ''}`} onClick={() => { setAmount(v); setCustom('') }}>₹{v.toLocaleString('en-IN')}</button>
              ))}
            </div>
            <div className="field amt-custom"><span className="cc">₹</span><input inputMode="numeric" placeholder="Enter custom amount" value={custom}
              onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, '').slice(0, 6); setCustom(n); setAmount(Number(n) || 0) }} /></div>
            <button className="btn full" style={{ marginTop: 6 }} disabled={!amount || amount < 1} onClick={continueToPay}>Continue{amount ? ` · ₹${amount.toLocaleString('en-IN')}` : ''}</button>
          </div>
        </div>
      )}

      <PaymentSheet open={payOpen} amount={amount} onClose={() => setPayOpen(false)} onPaid={onPaid} />
      <BottomNav />
    </div>
  )
}
