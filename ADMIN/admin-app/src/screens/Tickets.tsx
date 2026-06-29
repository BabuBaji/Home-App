import { useEffect, useState } from 'react'
import { fetchTickets, updateTicket } from '../api'
import type { Ticket } from '../types'
import { Card, Loading, ErrorState, Empty, Badge, Avatar, shortDate, useToast } from '../components/UI'

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed']

export default function Tickets() {
  const toast = useToast()
  const [rows, setRows] = useState<Ticket[] | null>(null)
  const [err, setErr] = useState('')
  const load = () => { setErr(''); fetchTickets().then(setRows).catch((e) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />

  async function setSt(t: Ticket, st: string) { try { await updateTicket(t.id, st); toast('Ticket updated'); load() } catch (e: any) { toast(e.message, 'err') } }

  return (
    <Card title="Support Tickets">
      {!rows ? <Loading /> : rows.length === 0 ? <Empty msg="No support tickets." /> : (
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Ref</th><th>Customer</th><th>Category</th><th>Message</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="muted">{t.ref || `#${t.id}`}</td>
                  <td><div className="cell-user"><Avatar name={t.customer} size={30} /><strong>{t.customer}</strong></div></td>
                  <td><span className="badge violet">{t.category}</span></td>
                  <td className="muted" style={{ maxWidth: 320 }}>{t.message}</td>
                  <td className="muted">{shortDate(t.created)}</td>
                  <td>
                    <select className="select" style={{ padding: '5px 8px', fontSize: 12 }} value={t.status} onChange={(e) => setSt(t, e.target.value)}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
