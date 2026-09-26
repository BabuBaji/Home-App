import { useEffect, useState } from 'react'
import { useToast } from './UI'
import PaymentSheet from './PaymentSheet'
import { fetchBookingExtras, decideBookingExtra, type BookingExtra } from '../api'
import type { Booking } from '../types'
import { t } from '../i18n'

/* Tasks the expert added during the job. Nothing is charged until the customer approves: on a cash
   booking the task joins the amount due at the end; otherwise it is paid now through the sheet. */
export default function ExtrasPrompt({ b }: { b: Booking }) {
  const toast = useToast()
  const [extras, setExtras] = useState<BookingExtra[]>([])
  const [paying, setPaying] = useState<BookingExtra | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let stop = false
    const load = () => fetchBookingExtras(b.id).then((x) => { if (!stop) setExtras(x) }).catch(() => {})
    load()
    const iv = setInterval(load, 6000)
    return () => { stop = true; clearInterval(iv) }
  }, [b.id, (b as any).total])

  async function decide(x: BookingExtra, action: 'approve' | 'decline', paymentId?: string) {
    if (action === 'approve' && b.payment !== 'cash' && !paymentId) { setPaying(x); return }
    setBusy(true)
    try {
      const r = await decideBookingExtra(b.id, x.id, action, paymentId ? { paymentId } : {})
      setExtras(r.extras)
      toast(action === 'approve' ? (b.payment === 'cash' ? t('Added — pay ₹{amt} with the bill', { amt: x.price }) : t('Approved and paid')) : t('Declined'))
    } catch (e) { toast((e as Error).message) } finally { setBusy(false); setPaying(null) }
  }

  const pending = extras.filter((x) => x.status === 'pending')
  const approved = extras.filter((x) => x.status === 'approved')
  if (!pending.length && !approved.length) return null
  return (
    <>
      {pending.map((x) => (
        <div key={x.id} className="jt-card" style={{ borderColor: '#6D4AFF', background: '#F3F0FF' }}>
          <b style={{ display: 'block' }}>{t('Extra task requested: {name}', { name: x.name })}</b>
          <span className="muted" style={{ fontSize: 12.5 }}>₹{x.price}{' · '}{b.payment === 'cash' ? t('added to your cash bill if you approve') : t('paid now if you approve')}</span>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn" disabled={busy} style={{ flex: 1 }} onClick={() => decide(x, 'approve')}>{t('Approve ₹{amt}', { amt: x.price })}</button>
            <button className="btn-ghost" disabled={busy} style={{ flex: 1 }} onClick={() => decide(x, 'decline')}>{t('Decline')}</button>
          </div>
        </div>
      ))}
      {approved.length > 0 && (
        <div className="jt-card">
          <b style={{ display: 'block', marginBottom: 4 }}>{t('Extra tasks')}</b>
          {approved.map((x) => <div key={x.id} className="muted" style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}><span>{x.name}</span><span>₹{x.price}</span></div>)}
        </div>
      )}
      <PaymentSheet open={!!paying} amount={paying?.price || 0} onClose={() => setPaying(null)} onPaid={(_m, id) => paying && decide(paying, 'approve', id)} />
    </>
  )
}
