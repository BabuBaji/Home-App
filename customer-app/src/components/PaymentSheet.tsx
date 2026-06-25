import { useEffect, useState } from 'react'
import { fetchPaymentMethods, createOrder, chargePayment } from '../api'
import { useToast } from './UI'
import type { PaymentGroup } from '../types'

interface Props {
  open: boolean
  amount: number
  onClose: () => void
  onPaid: (method: string, txnId: string) => void
}

export default function PaymentSheet({ open, amount, onClose, onPaid }: Props) {
  const toast = useToast()
  const [groups, setGroups] = useState<PaymentGroup[]>([])
  const [method, setMethod] = useState('phonepe')
  const [phase, setPhase] = useState<'select' | 'processing' | 'done'>('select')

  useEffect(() => {
    if (!open) return
    setPhase('select')
    fetchPaymentMethods().then((d) => setGroups(d.methods)).catch(() => {})
  }, [open])

  if (!open) return null

  async function pay() {
    setPhase('processing')
    try {
      const order = await createOrder(amount)
      // simulate the gateway authorising the payment
      await new Promise((r) => setTimeout(r, 1600))
      const res = await chargePayment(order.orderId, method, amount)
      setPhase('done')
      setTimeout(() => onPaid(res.method, res.txnId), 750)
    } catch (e) {
      toast((e as Error).message)
      setPhase('select')
    }
  }

  const cash = method === 'cash'

  return (
    <div className="pm-overlay" onClick={phase === 'select' ? onClose : undefined}>
      <div className="pm-sheet" onClick={(e) => e.stopPropagation()}>
        {phase === 'select' && (
          <>
            <div className="pm-head">
              <div>
                <div className="pm-amt">₹{amount}</div>
                <div className="muted sm">Choose a payment method</div>
              </div>
              <button className="pm-x" onClick={onClose}>✕</button>
            </div>
            <div className="pm-scroll">
              {groups.map((g) => (
                <div className="pm-group" key={g.group}>
                  <div className="pm-glabel">{g.group}{g.recommended && <span className="pm-rec">Recommended</span>}</div>
                  {g.options.map((o) => (
                    <button key={o.id} className={`pm-row ${method === o.id ? 'sel' : ''}`} onClick={() => setMethod(o.id)}>
                      <span className="pm-ic">{o.icon}</span>
                      <span className="grow"><span className="pm-name">{o.name}</span>{o.sub && <span className="pm-sub">{o.sub}</span>}</span>
                      <span className="pm-radio">{method === o.id ? '●' : ''}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="pm-foot">
              <div className="pm-secure">🔒 100% secure payments</div>
              <button className="btn full" onClick={pay}>{cash ? `Confirm · ₹${amount}` : `Pay ₹${amount}`}</button>
            </div>
          </>
        )}

        {phase === 'processing' && (
          <div className="pm-state">
            <div className="spinner" />
            <h3>{cash ? 'Confirming…' : 'Processing payment…'}</h3>
            <p className="muted">Please don't close the app</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="pm-state">
            <div className="pm-tick">✓</div>
            <h3>{cash ? 'Booking confirmed!' : 'Payment successful!'}</h3>
            <p className="muted">₹{amount} {cash ? 'to pay after service' : 'paid'}</p>
          </div>
        )}
      </div>
    </div>
  )
}
