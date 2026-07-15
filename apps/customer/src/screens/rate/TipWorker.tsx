import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Gift, Wallet as WalletIcon, Check } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import PaymentSheet from '../../components/PaymentSheet'
import { fetchWallet } from '../../api'
import { useJob, proName } from '../job/useJob'
import { WorkerAvatar } from '../job/parts'

// Module 7 · #55 — Tip Your Worker. Worker is real booking data; wallet balance is the real
// fetchWallet balance. The tip is charged through the existing PaymentSheet (real Razorpay/UPI) —
// no new backend endpoint is introduced.
const PRESETS = [20, 50, 100, 200]

export default function TipWorker() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { b } = useJob(id, false)
  const [amt, setAmt] = useState(50)
  const [custom, setCustom] = useState('')
  const [balance, setBalance] = useState<number | null>(null)
  const [sheet, setSheet] = useState(false)

  useEffect(() => { fetchWallet().then((w) => setBalance(w.balance)).catch(() => {}) }, [])

  if (!b) return <div className="screen jt"><Loading /></div>
  const tip = custom ? Math.max(0, parseInt(custom) || 0) : amt

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Tip Your Worker</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll">
        <div className="tp-who">
          <WorkerAvatar b={b} size={52} />
          <div><div className="jt-worker-name">{proName(b)}</div><div className="tp-thanks">Thank you for the great service!</div></div>
        </div>

        <div className="tp-label">Select Tip Amount</div>
        <div className="tp-amounts">
          {PRESETS.map((p) => (
            <button key={p} className={`tp-amt ${!custom && amt === p ? 'on' : ''}`} onClick={() => { setCustom(''); setAmt(p) }}>₹{p}</button>
          ))}
          <input className={`tp-other ${custom ? 'on' : ''}`} inputMode="numeric" placeholder="Other" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))} />
        </div>

        <div className="tp-note"><Gift size={18} /> 100% of your tip goes directly to the worker</div>

        <div className="tp-label">Payment Method</div>
        <div className="tp-method">
          <span className="tp-method-ic"><WalletIcon size={18} /></span>
          <div className="grow"><b>Wallet Balance</b><span>₹{balance ?? '—'}</span></div>
          <span className="tp-method-ok"><Check size={15} /></span>
        </div>
      </div>

      <div className="jt-foot col">
        <button className="jt-btn" disabled={tip <= 0} onClick={() => setSheet(true)}>Add Tip ₹{tip}</button>
        <button className="jt-btn text" onClick={() => nav('/home')}>Skip</button>
      </div>

      <PaymentSheet open={sheet} amount={tip} onClose={() => setSheet(false)} onPaid={() => { setSheet(false); toast(`₹${tip} tip sent to ${proName(b).split(' ')[0]}! 🎉`); setTimeout(() => nav('/home'), 900) }} />
    </div>
  )
}
