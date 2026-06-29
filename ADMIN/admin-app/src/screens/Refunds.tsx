import { useEffect, useState } from 'react'
import { fetchRefunds, issueRefund } from '../api'
import { Card, Loading, ErrorState, Empty, Badge, Avatar, money, shortDate, useToast } from '../components/UI'
import { useStore, can } from '../store'

export default function Refunds() {
  const toast = useToast()
  const { admin } = useStore()
  const [rows, setRows] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  const load = () => { setErr(''); fetchRefunds().then(setRows).catch((e) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />

  async function refund(b: any) {
    if (!confirm(`Refund ${money(b.total)} to ${b.customer}?`)) return
    try { const r = await issueRefund(b.id); toast(`Refunded ${money(r.amount)}`); load() } catch (e: any) { toast(e.message, 'err') }
  }

  return (
    <Card title="Refunds & Cancellations">
      {!rows ? <Loading /> : rows.length === 0 ? <Empty msg="No refunds or cancellations." /> : (
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Ref</th><th>Customer</th><th>Order Total</th><th>Refund</th><th>Cancel Fee</th><th>Reason</th><th>Payment</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="muted">{b.ref}</td>
                  <td><div className="cell-user"><Avatar name={b.customer} size={30} /><strong>{b.customer}</strong></div></td>
                  <td className="num">{money(b.total)}</td>
                  <td className="num">{b.refund != null ? money(b.refund) : '—'}</td>
                  <td className="num">{b.cancel_fee != null ? money(b.cancel_fee) : '—'}</td>
                  <td className="muted">{b.cancel_reason || '—'}</td>
                  <td><Badge>{b.payment_status}</Badge></td>
                  <td className="muted">{shortDate(b.created)}</td>
                  <td>{can(admin?.role, 'manager') && b.payment_status !== 'refunded' && <button className="btn sm ghost" onClick={() => refund(b)}>Refund</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
