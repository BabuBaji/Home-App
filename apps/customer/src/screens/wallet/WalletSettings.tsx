// 73 · Wallet Settings — real preferences, persisted via PATCH /api/wallet/settings.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Smartphone, CreditCard, RefreshCw, Bell, BellRing, EyeOff, ChevronRight } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { fetchWalletSettings, updateWalletSettings, type WalletSettings as WS } from '../../api'

export default function WalletSettings() {
  const nav = useNavigate()
  const toast = useToast()
  const [s, setS] = useState<WS | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => { fetchWalletSettings().then(setS).catch(() => setS(null)) }, [])

  // Optimistic: flip immediately, roll back if the server rejects it.
  async function toggle(key: keyof WS) {
    if (!s || busy) return
    const next = { ...s, [key]: !s[key] } as WS
    setS(next); setBusy(key)
    try { setS(await updateWalletSettings({ [key]: next[key] } as Partial<WS>)) }
    catch (e) { setS(s); toast((e as Error).message) } finally { setBusy('') }
  }

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Wallet Settings</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!s) return <div className="screen">{head}<Loading /></div>

  const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button className={`ws-sw ${on ? 'on' : ''}`} onClick={onClick} role="switch" aria-checked={on}><i /></button>
  )

  return (
    <div className="screen">
      {head}
      <div className="content">
        <div className="ws-sec">Payment &amp; Security</div>
        <div className="ws-card">
          {/* Saved UPI IDs and cards live with the payment provider, not in this app — these open
              the method list used at top-up, which is the real place they are chosen. */}
          <button className="ws-row" onClick={() => nav('/wallet/add')}>
            <span className="ws-ico"><Smartphone size={16} /></span>
            <span className="ws-main"><span className="ws-t">UPI Accounts</span><span className="ws-d">Manage your UPI IDs</span></span>
            <ChevronRight size={17} className="ws-chev" />
          </button>
          <button className="ws-row" onClick={() => nav('/wallet/add')}>
            <span className="ws-ico"><CreditCard size={16} /></span>
            <span className="ws-main"><span className="ws-t">Cards &amp; Banks</span><span className="ws-d">Saved cards and bank accounts</span></span>
            <ChevronRight size={17} className="ws-chev" />
          </button>
          <div className="ws-row">
            <span className="ws-ico"><RefreshCw size={16} /></span>
            <span className="ws-main"><span className="ws-t">Auto Add Money</span><span className="ws-d">Setup low balance auto top-up</span></span>
            <Toggle on={s.autoTopup} onClick={() => toggle('autoTopup')} />
          </div>
          <div className="ws-row">
            <span className="ws-ico"><Bell size={16} /></span>
            <span className="ws-main"><span className="ws-t">Transaction Alerts</span><span className="ws-d">Get notified for wallet activities</span></span>
            <Toggle on={s.notifyTxn} onClick={() => toggle('notifyTxn')} />
          </div>
        </div>

        <div className="ws-sec">Preferences</div>
        <div className="ws-card">
          <div className="ws-row">
            <span className="ws-ico"><BellRing size={16} /></span>
            <span className="ws-main"><span className="ws-t">Low Balance Reminder</span><span className="ws-d">Notify when balance is low</span></span>
            <Toggle on={s.notifyLowBalance} onClick={() => toggle('notifyLowBalance')} />
          </div>
          <div className="ws-row">
            <span className="ws-ico"><EyeOff size={16} /></span>
            <span className="ws-main"><span className="ws-t">Hide Wallet Balance</span><span className="ws-d">Hide balance on home screen</span></span>
            <Toggle on={s.hideBalance} onClick={() => toggle('hideBalance')} />
          </div>
        </div>
      </div>
    </div>
  )
}
