import { useEffect, useState } from 'react'
import { AlertOctagon, Clock, CheckCircle2 } from 'lucide-react'
import { fetchComplaints, updateComplaint } from '../api'
import type { Complaint } from '../types'
import { Card, StatCard, Loading, ErrorState, Empty, Badge, Avatar, shortDate, useToast } from '../components/UI'

const STATUSES = ['open', 'in_progress', 'resolved', 'closed']

export default function Complaints() {
  const toast = useToast()
  const [rows, setRows] = useState<Complaint[] | null>(null)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState('all'); const [priority, setPriority] = useState('all')
  const load = () => { setErr(''); fetchComplaints(status, priority).then(setRows).catch((e) => setErr(e.message)) }
  useEffect(load, [status, priority])
  if (err) return <ErrorState msg={err} onRetry={load} />

  const open = rows?.filter((c) => c.status === 'open').length || 0
  const prog = rows?.filter((c) => c.status === 'in_progress').length || 0
  const done = rows?.filter((c) => c.status === 'resolved' || c.status === 'closed').length || 0

  async function setSt(c: Complaint, st: string) { try { await updateComplaint(c.id, { status: st }); toast('Complaint updated'); load() } catch (e: any) { toast(e.message, 'err') } }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="stat-row">
        <StatCard icon={<AlertOctagon size={22} />} tint="#f04438" label="Open" value={open} />
        <StatCard icon={<Clock size={22} />} tint="#f5a524" label="In Progress" value={prog} />
        <StatCard icon={<CheckCircle2 size={22} />} tint="#16a34a" label="Resolved" value={done} />
        <StatCard icon={<AlertOctagon size={22} />} tint="#5b51e8" label="Total" value={rows?.length ?? '—'} />
      </div>
      <Card>
        <div className="toolbar">
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All Status</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="all">All Priority</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        </div>
        {!rows ? <Loading /> : rows.length === 0 ? <Empty msg="No complaints." /> : (
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Ref</th><th>Customer</th><th>Against</th><th>Category</th><th>Message</th><th>Priority</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="muted">{c.ref}</td>
                    <td><div className="cell-user"><Avatar name={c.customer} size={30} /><strong>{c.customer}</strong></div></td>
                    <td>{c.against || '—'}</td>
                    <td><span className="badge violet">{c.category}</span></td>
                    <td style={{ maxWidth: 260 }} className="muted">{c.message}</td>
                    <td><Badge tone={c.priority === 'high' ? 'red' : c.priority === 'medium' ? 'amber' : 'gray'}>{c.priority}</Badge></td>
                    <td className="muted">{shortDate(c.created)}</td>
                    <td>
                      <select className="select" style={{ padding: '5px 8px', fontSize: 12 }} value={c.status} onChange={(e) => setSt(c, e.target.value)}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
