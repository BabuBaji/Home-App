import { useEffect, useState } from 'react'
import {
  Bell, Send, Eye, Funnel, Download, Plus, MoreVertical, FileText, ChevronRight,
  BellRing, OctagonAlert, History, Clock,
} from 'lucide-react'
import { fetchNotifications, broadcast } from '../api'
import { Card, StatCard, Badge, Field, Modal, Loading, ErrorState, useToast, shortDate } from '../components/UI'
import { Donut, BarChart } from '../components/Charts'

const TABS = ['All', 'System', 'Booking', 'Payment', 'Promotions', 'Reminders', 'Alerts', 'Custom']

interface Notif {
  id: number
  type: string
  title: string
  body: string
  audience: string
  channel: string
  sent: number
  admin: string
  created: string
}

const TINTS = ['#5b51e8', '#16a34a', '#2e90fa', '#f59e0b', '#f04438']
const tintFor = (s: string) => TINTS[[...(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length]
const channelTone = (c: string): 'blue' | 'violet' | 'green' | 'amber' => {
  const s = (c || '').toLowerCase()
  if (s === 'sms') return 'blue'
  if (s === 'push') return 'violet'
  if (s === 'email') return 'green'
  return 'amber'
}
const DONUT_COLORS = ['#5b51e8', '#16a34a', '#2e90fa', '#f59e0b', '#f04438']

// Channel styling; the counts are computed from real notification rows.
const CHANNEL_DEFS = [
  { key: 'push', Icon: Bell, tint: '#5b51e8', label: 'Push Notifications', color: '#5b51e8' },
  { key: 'sms', Icon: Send, tint: '#2e90fa', label: 'SMS', color: '#2e90fa' },
  { key: 'email', Icon: FileText, tint: '#16a34a', label: 'Email', color: '#16a34a' },
  { key: 'in-app', Icon: BellRing, tint: '#f59e0b', label: 'In-App', color: '#f59e0b' },
]

const QUICK = [
  { Icon: Send, title: 'Send Notification', sub: 'Send notification to users' },
  { Icon: FileText, title: 'Create Template', sub: 'Create new notification template' },
  { Icon: History, title: 'Notification History', sub: 'View notification history' },
  { Icon: Clock, title: 'Scheduled Notifications', sub: 'View scheduled notifications' },
]

const TEMPLATES = ['Booking Confirmation', 'Payment Received', 'Booking Reminder', 'Special Offer']

export default function Notifications() {
  const toast = useToast()
  const [tab, setTab] = useState('All')
  const [compose, setCompose] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [cType, setCType] = useState('Custom')
  const [cAudience, setCAudience] = useState('All Customers')
  const [cChannel, setCChannel] = useState('Push')
  const [sending, setSending] = useState(false)

  const [rows, setRows] = useState<Notif[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [recipient, setRecipient] = useState('all')
  const [channel, setChannel] = useState('all')
  const [status, setStatus] = useState('all')

  const load = () => { setErr(''); fetchNotifications().then((d: any) => setRows(d || [])).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])

  const send = async () => {
    if (!title.trim()) { toast('Enter a title', 'err'); return }
    setSending(true)
    try {
      const r = await broadcast({ type: cType, title, body, audience: cAudience, channel: cChannel })
      toast('Notification sent to ' + (r.sent ?? 0) + ' customers', 'ok')
      setCompose(false)
      setTitle(''); setBody('')
      load()
    } catch (e) {
      toast((e as Error).message || 'Could not send', 'err')
    } finally {
      setSending(false)
    }
  }

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const ql = q.trim().toLowerCase()
  const filtered = rows.filter((n) => {
    if (tab !== 'All' && (n.type || '').toLowerCase() !== tab.toLowerCase()) return false
    if (recipient !== 'all' && (n.audience || '').toLowerCase() !== recipient) return false
    if (channel !== 'all' && (n.channel || '').toLowerCase() !== channel) return false
    if (status !== 'all' && 'sent' !== status) return false
    if (ql && !((n.title || '').toLowerCase().includes(ql) || (n.body || '').toLowerCase().includes(ql) || (n.audience || '').toLowerCase().includes(ql))) return false
    return true
  })

  // donut derived from channel counts of fetched rows
  const channelCounts = rows.reduce<Record<string, number>>((a, n) => {
    const c = n.channel || 'Other'; a[c] = (a[c] || 0) + 1; return a
  }, {})
  const DONUT = Object.entries(channelCounts).map(([label, value], i) => ({ label, value, color: DONUT_COLORS[i % DONUT_COLORS.length] }))
  const donutTotal = DONUT.reduce((a, d) => a + d.value, 0) || 1
  const DONUT_PCT: Record<string, string> = Object.fromEntries(DONUT.map((d) => [d.label, (Math.round((d.value / donutTotal) * 1000) / 10) + '%']))

  const totalSent = rows.reduce((a, n) => a + (n.sent || 0), 0)

  // Channel Performance — real recipients reached per channel, from the notification rows.
  const chanTotals = CHANNEL_DEFS.map((c) => ({ ...c, value: rows.filter((n) => (n.channel || '').toLowerCase() === c.key).reduce((a, n) => a + (n.sent || 0), 0) }))
  const chanMax = Math.max(1, ...chanTotals.map((c) => c.value))
  const chanSum = chanTotals.reduce((a, c) => a + c.value, 0) || 1
  const CHANNELS = chanTotals.map((c) => ({ ...c, pct: `${Math.round((c.value / chanSum) * 1000) / 10}%`, bar: Math.round((c.value / chanMax) * 100) }))

  const exportCsv = () => {
    const head = ['Title', 'Type', 'Audience', 'Channel', 'Sent', 'Admin', 'Created']
    const lines = filtered.map((n) => [n.title, n.type, n.audience, n.channel, n.sent, n.admin, n.created]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = [head.join(','), ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'notifications.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<Bell size={22} />} tint="#5b51e8" label="Total Notifications" value={rows.length.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<Send size={22} />} tint="#16a34a" label="Sent" value={totalSent.toLocaleString('en-IN')} sub="recipients reached" />
        <StatCard icon={<FileText size={22} />} tint="#f59e0b" label="Delivered" value={totalSent.toLocaleString('en-IN')} sub="recipients reached" />
        <StatCard icon={<OctagonAlert size={22} />} tint="#f04438" label="Failed" value="0" down sub="all time" />
        <StatCard icon={<Eye size={22} />} tint="#2e90fa" label="Read Rate" value="—" sub="not tracked" />
      </div>

      <div className="cols">
        <Card>
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t} className={'tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          <div className="toolbar">
            <div className="searchbox"><input placeholder="Search by title, message or recipient…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select className="select flt" value={recipient} onChange={(e) => setRecipient(e.target.value)}>
              <option value="all">All Recipients</option>
              <option value="all customers">All Customers</option>
              <option value="all workers">All Workers</option>
            </select>
            <select className="select flt" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="all">All Channels</option>
              <option value="push">Push</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="in-app">In-App</option>
            </select>
            <select className="select flt" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="sent">Sent</option>
            </select>
            <select className="select flt"><option>Select Date Range</option></select>
            <div className="tb-spacer" />
            <button className="btn line"><Funnel size={16} /> Filters</button>
            <button className="btn line" onClick={exportCsv}><Download size={16} /> Export</button>
            <button className="btn" onClick={() => setCompose(true)}><Plus size={17} /> Send Notification</button>
          </div>

          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Notification</th><th>Recipient</th><th>Channel</th><th>Sent At</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((n) => (
                  <tr key={n.id}>
                    <td style={{ maxWidth: 340 }}>
                      <div className="cell-user">
                        <span className="mini-ico" style={{ background: `${tintFor(n.type)}1f`, color: tintFor(n.type) }}><Bell size={16} /></span>
                        <div>
                          <strong style={{ fontSize: 13, display: 'block' }}>{n.title}</strong>
                          <small className="muted">{n.body}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong style={{ fontSize: 13, display: 'block' }}>{n.audience}</strong>
                      <small className="muted">{n.sent} recipients</small>
                    </td>
                    <td><Badge tone={channelTone(n.channel)} dot={false}>{n.channel}</Badge></td>
                    <td>
                      <strong style={{ fontSize: 13, display: 'block', fontWeight: 500 }}>{shortDate(n.created)}</strong>
                      <small className="muted">{n.admin}</small>
                    </td>
                    <td><Badge tone="green" dot={false}>Sent</Badge></td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn line" title="View"><Eye size={16} /></button>
                        <button className="btn line" title="More"><MoreVertical size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <span className="pager-info">Showing 1 to {filtered.length} of {rows.length.toLocaleString('en-IN')} notifications</span>
            <div className="pager-mid">
              <button className="pgbtn active">1</button>
            </div>
            <div className="pgsize" />
          </div>
        </Card>

        <div className="col-rail">
          <Card title="Notification Summary" right={<a className="card-link">View Report</a>}>
            <div className="donut-wrap">
              <Donut data={DONUT} />
            </div>
            <div className="legend" style={{ marginTop: 4 }}>
              {DONUT.map((d) => (
                <div key={d.label} className="legend-row">
                  <span className="dot" style={{ background: d.color }} />
                  <span className="legend-label">{d.label}</span>
                  <span className="legend-val">{d.value} ({DONUT_PCT[d.label]})</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Channel Performance" right={<a className="card-link">View Report</a>}>
            <div className="sumbars">
              {CHANNELS.map((c) => (
                <div key={c.label} className="sumbar" style={{ alignItems: 'center' }}>
                  <span className="mini-ico" style={{ background: `${c.tint}1f`, color: c.tint }}><c.Icon size={15} /></span>
                  <span className="sumbar-label" style={{ flex: 1 }}>{c.label}</span>
                  <span className="sumbar-track"><span className="sumbar-fill" style={{ width: `${c.bar}%`, background: c.color }} /></span>
                  <span className="sumbar-val">{c.value} ({c.pct})</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'none' }}><BarChart data={CHANNELS} valueKey="bar" labelKey="label" height={120} /></div>
          </Card>

          <Card title="Quick Actions">
            <div className="minilist">
              {QUICK.map((q) => (
                <div key={q.title} className="mini-row link-row" onClick={() => q.title === 'Send Notification' && setCompose(true)}>
                  <span className="mini-ico"><q.Icon size={16} /></span>
                  <div className="mini-bd"><strong>{q.title}</strong><small>{q.sub}</small></div>
                  <ChevronRight size={16} className="muted" />
                </div>
              ))}
            </div>
          </Card>

          <Card title="Recent Templates" right={<a className="card-link">View All</a>}>
            <div className="minilist">
              {TEMPLATES.map((t) => (
                <div key={t} className="mini-row" style={{ justifyContent: 'space-between' }}>
                  <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                    <span className="dot" style={{ background: '#5b51e8' }} />
                    <strong style={{ fontSize: 13 }}>{t}</strong>
                  </div>
                  <Badge tone="green" dot={false}>Active</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {compose && (
        <Modal title="Send Notification" onClose={() => setCompose(false)}
          footer={<>
            <button className="btn ghost" onClick={() => setCompose(false)}>Cancel</button>
            <button className="btn" onClick={send} disabled={sending}><Send size={16} /> Send to all customers</button>
          </>}>
          <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Special Offer" /></Field>
          <Field label="Message"><textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Get 20% off this weekend…" /></Field>
          <Field label="Type">
            <select value={cType} onChange={(e) => setCType(e.target.value)}>
              {['System', 'Booking', 'Payment', 'Promotions', 'Reminders', 'Alerts', 'Custom'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Audience">
            <select value={cAudience} onChange={(e) => setCAudience(e.target.value)}>
              <option value="All Customers">All Customers</option>
              <option value="All Workers">All Workers</option>
            </select>
          </Field>
          <Field label="Channel">
            <select value={cChannel} onChange={(e) => setCChannel(e.target.value)}>
              {['Push', 'SMS', 'Email', 'In-App'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'flex', gap: 12, marginTop: 6 }}>
            <span className="mini-ico"><Bell size={18} /></span>
            <div>
              <strong style={{ display: 'block' }}>{title || 'Notification title'}</strong>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{body || 'Your message preview shows up here.'}</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
