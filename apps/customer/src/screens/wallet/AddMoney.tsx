// 68 · Add Money — amount + method, then the existing PaymentSheet does the real payment.
// The method list is whatever /api/payment/methods returns; nothing here is invented.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import PaymentSheet from '../../components/PaymentSheet'
import { fetchPaymentMethods, fetchWallet, walletTopup } from '../../api'
import { useStore } from '../../store'
import { money } from '../../wallet'
import type { PaymentGroup } from '../../types'

// /api/payment/methods is the booking-checkout list. Two of its options cannot fund a top-up:
// you can't pay for wallet money with wallet money, and cash is handed to the expert after a job.
const NOT_FOR_TOPUP = ['wallet', 'cash']

export default function AddMoney() {
  const nav = useNavigate()
  const toast = useToast()
  const { user, setUser } = useStore()
  const [groups, setGroups] = useState<PaymentGroup[] | null>(null)
  // Amount chips are configured by admin (wallet_topup_presets); none configured = no chips.
  const [presets, setPresets] = useState<number[]>([])
  const [amount, setAmount] = useState(0)
  const [raw, setRaw] = useState('')
  const [method, setMethod] = useState('')
  const [payOpen, setPayOpen] = useState(false)

  useEffect(() => {
    fetchWallet()
      .then((w) => setPresets(w.topupPresets || []))
      .catch(() => setPresets([]))
  }, [])

  useEffect(() => {
    fetchPaymentMethods()
      .then((r) => {
        const usable = r.methods
          .map((g) => ({ ...g, options: g.options.filter((o) => !NOT_FOR_TOPUP.includes(o.id)) }))
          .filter((g) => g.options.length > 0)
        setGroups(usable)
        // Preselect whatever the backend marks as recommended.
        const rec = usable.find((g) => g.recommended) || usable[0]
        if (rec?.options?.[0]) setMethod(rec.options[0].id)
      })
      .catch(() => setGroups([]))
  }, [])

  async function onPaid(_m: string, paymentId: string) {
    setPayOpen(false)
    try {
      const { balance } = await walletTopup(paymentId, amount)
      if (typeof balance === 'number' && user) setUser({ ...user, wallet: balance })
      toast(`${money(amount)} added to your wallet`)
      nav('/wallet', { replace: true })
    } catch (e) { toast((e as Error).message) }
  }

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Add Money</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!groups) return <div className="screen">{head}<Loading /></div>

  const flat = groups.flatMap((g) => g.options.map((o) => ({ ...o, group: g.group, recommended: !!g.recommended })))

  return (
    <div className="screen">
      {head}
      <div className="content pad-cta">
        <div className="am-label">Enter Amount</div>
        <div className="am-field">
          <span className="am-rs">₹</span>
          <input inputMode="numeric" value={raw} autoFocus placeholder="0"
            onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, '').slice(0, 6); setRaw(n); setAmount(Number(n) || 0) }} />
        </div>

        {presets.length > 0 && (
          <div className="am-chips">
            {presets.map((v) => (
              <button key={v} className={`am-chip ${amount === v ? 'sel' : ''}`} onClick={() => { setAmount(v); setRaw(String(v)) }}>
                {money(v)}
              </button>
            ))}
          </div>
        )}

        <div className="am-sec">Recommended</div>
        <div className="am-methods">
          {flat.map((o) => (
            <button key={o.id} className={`am-m ${method === o.id ? 'sel' : ''}`} onClick={() => setMethod(o.id)}>
              <span className="am-m-ico">{o.icon}</span>
              <span className="am-m-main">
                <span className="am-m-name">{o.name}</span>
                {o.sub && <span className="am-m-sub">{o.sub}</span>}
              </span>
              <span className={`am-radio ${method === o.id ? 'on' : ''}`} />
            </button>
          ))}
          {flat.length === 0 && <p className="muted center-text" style={{ padding: 14 }}>No payment methods available right now.</p>}
        </div>
      </div>

      <div className="w-foot">
        <button className="btn full" disabled={!amount || amount < 1 || !method} onClick={() => setPayOpen(true)}>
          {amount > 0 ? `Add ${money(amount)}` : 'Add Money'}
        </button>
      </div>

      <PaymentSheet open={payOpen} amount={amount} onClose={() => setPayOpen(false)} onPaid={onPaid} />
    </div>
  )
}
