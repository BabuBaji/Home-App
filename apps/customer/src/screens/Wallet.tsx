// 66 · Wallet Dashboard — balances, quick actions, overview, invite.
// Same route/tab as before; Add Money now lives on its own screen (68) but still runs through the
// existing PaymentSheet + walletTopup. The referral-code apply card is kept.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Receipt, Gift, Settings, Wallet as WalletIcon, HelpCircle, Users, RotateCcw, ChevronRight, Eye, ArrowLeft } from 'lucide-react'
import { BottomNav, Loading, useToast } from '../components/UI'
import { fetchWallet, fetchCashback, fetchReferralEarnings, fetchRefunds, applyReferral } from '../api'
import { useStore } from '../store'
import { money, money2 } from '../wallet'

export default function Wallet() {
  const nav = useNavigate()
  const toast = useToast()
  const { user, setUser } = useStore()
  const [w, setW] = useState<{ cash: number; promo: number; total: number; available: number; locked: number; status: string; hideBalance: boolean } | null>(null)
  // "Hide Wallet Balance" (Settings) — masked until tapped, so the toggle actually does something.
  const [reveal, setReveal] = useState(false)
  const [cashback, setCashback] = useState<number | null>(null)
  const [referral, setReferral] = useState<number | null>(null)
  const [pendingRefunds, setPendingRefunds] = useState<number | null>(null)
  const [refCode, setRefCode] = useState('')
  const [refBusy, setRefBusy] = useState(false)
  const [refDone, setRefDone] = useState(false)

  function load() {
    fetchWallet().then((r) => setW(r)).catch(() => {})
    fetchCashback().then((c) => setCashback(c.usable)).catch(() => setCashback(0))
    fetchReferralEarnings().then((r) => setReferral(r.earned)).catch(() => setReferral(0))
    // "Pending refunds" is money owed but not yet in the wallet — anything not completed.
    fetchRefunds().then((rs) => setPendingRefunds(rs.filter((r) => r.status !== 'completed').reduce((s, r) => s + r.amount, 0))).catch(() => setPendingRefunds(0))
  }
  useEffect(load, [])

  async function applyRef() {
    const code = refCode.trim().toUpperCase()
    if (!code) return
    setRefBusy(true)
    try {
      const r = await applyReferral(code)
      setRefDone(true)
      if (user) setUser({ ...user, referredBy: -1 })
      toast(`Code applied! ${r.referrer} earns ${money(r.reward)} when you finish your first booking.`)
    } catch (e) { toast((e as Error).message) } finally { setRefBusy(false) }
  }

  const head = (
    <header className="appbar ord-appbar">
      {/* Wallet is a bottom-nav tab but is also reached from the Home wallet icon, so offer a back
          button; fall back to Home when there's no in-app history to pop. */}
      <button className="iconbtn" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/home'))} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Wallet</h1></div>
      <button className="iconbtn" onClick={() => nav('/support')} aria-label="Help"><HelpCircle size={18} /></button>
    </header>
  )
  if (!w) return <div className="screen has-nav">{head}<Loading /><BottomNav /></div>

  const hidden = w.hideBalance && !reveal
  const show = (n: number) => (hidden ? '••••••' : money2(n))

  const ACTIONS = [
    { k: 'Add Money', icon: <Plus size={17} />, to: '/wallet/add' },
    { k: 'Transactions', icon: <Receipt size={17} />, to: '/wallet/transactions' },
    { k: 'Gift Cards', icon: <Gift size={17} />, to: '/wallet/gift-cards' },
    { k: 'Settings', icon: <Settings size={17} />, to: '/wallet/settings' },
  ]
  const OVERVIEW = [
    { k: 'Cashback', icon: <Gift size={15} />, cls: 'cb', v: cashback, to: '/wallet/cashback' },
    { k: 'Referral Earnings', icon: <Users size={15} />, cls: 'rf', v: referral, to: '/wallet/referrals' },
    { k: 'Pending Refunds', icon: <RotateCcw size={15} />, cls: 'rd', v: pendingRefunds, to: '/wallet/refunds' },
  ]

  return (
    <div className="screen has-nav">
      {head}
      <div className="content">
        <div className="w-hero">
          <div className="w-hero-top">
            <div>
              <div className="w-hero-k">Total Wallet Balance</div>
              <button className="w-hero-v as-text" onClick={() => hidden && setReveal((r) => !r)}>
                {show(w.total)}
                {hidden && <Eye size={15} className="w-hero-eye" />}
              </button>
            </div>
            <WalletIcon size={22} className="w-hero-ico" />
          </div>
          <div className="w-hero-split">
            {/* Cash spends anywhere; Promo is locked to bookings — that is the split. */}
            <div><div className="w-hero-sk">Available Balance</div><div className="w-hero-sv">{show(w.available)}</div></div>
            <div><div className="w-hero-sk">Locked Balance</div><div className="w-hero-sv">{show(w.locked)}</div></div>
          </div>
        </div>

        {w.status !== 'active' && (
          <div className="card offer" style={{ background: '#fff4de' }}>
            <span className="oi">⚠️</span>
            <div><div className="ot">Wallet {w.status}</div><div className="od">You can't add or use your wallet right now. Contact support.</div></div>
          </div>
        )}

        <div className="w-actions">
          {ACTIONS.map((a) => (
            <button key={a.k} className="w-act" onClick={() => nav(a.to)}>
              <span className="w-act-ico">{a.icon}</span>
              <span className="w-act-k">{a.k}</span>
            </button>
          ))}
        </div>

        <div className="ws-card">
          <div className="w-ov-h">Quick Overview</div>
          {OVERVIEW.map((o) => (
            <button key={o.k} className="w-ov" onClick={() => nav(o.to)}>
              <span className={`w-ov-ico ${o.cls}`}>{o.icon}</span>
              <span className="w-ov-k">{o.k}</span>
              <span className="w-ov-v">{o.v === null ? '—' : money(o.v)}</span>
              <ChevronRight size={15} className="ws-chev" />
            </button>
          ))}
        </div>

        <div className="w-invite">
          <div className="w-invite-main">
            <div className="w-invite-t">Invite &amp; Earn</div>
            <div className="w-invite-d">Invite friends and earn on their first booking.</div>
            <button className="w-invite-btn" onClick={() => nav('/refer')}>Refer Now</button>
          </div>
          <div className="w-invite-art" aria-hidden="true">🎁</div>
        </div>

        {!user?.referredBy && !refDone && (
          <div className="card pad ref-apply">
            <div className="ra-t">🎁 Have a referral code?</div>
            <div className="ra-d">Apply a friend's code — they earn when you complete your first booking.</div>
            <div className="ra-row">
              <div className="field ra-input">
                <input value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())} placeholder="e.g. HH1A2B3C" maxLength={12} />
              </div>
              <button className="btn ra-btn" onClick={applyRef} disabled={refBusy || !refCode.trim()}>{refBusy ? '…' : 'Apply'}</button>
            </div>
          </div>
        )}

        <div className="banner-soft">
          <span className="bi">🛡</span>
          <div className="grow"><div className="bt">100% Secure Transactions</div><div className="bd">Wallet is credited only after your payment is verified.</div></div>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
