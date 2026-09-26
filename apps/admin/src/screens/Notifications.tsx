import { useEffect, useState } from 'react'
import { Send, Download, Plus, Bell } from 'lucide-react'
import { fetchNotifications, broadcast } from '../api'
import { Card, Badge, Field, Modal, Loading, ErrorState, useToast, shortDate, SearchBox, Pagination, FilterTabs } from '../components/UI'

const TYPES = ['System', 'Booking', 'Payment', 'Promotions', 'Reminders', 'Alerts', 'Custom']

interface Notif {
  id: number
  type: string
  title: string
  body: string
  audience: string
  channel: string
  sent: number
  suppressed?: number
  promotional?: boolean
  admin: string
  created: string
}

const channelTone = (c: string): 'blue' | 'violet' | 'green' | 'amber' => {
  const s = (c || '').toLowerCase()
  if (s === 'sms') return 'blue'
  if (s === 'push') return 'violet'
  if (s === 'email') return 'green'
  return 'amber'
}

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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [view, setView] = useState<Notif | null>(null)

  const load = () => { setErr(''); fetchNotifications().then((d: any) => setRows(d || [])).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])

  const send = async () => {
    if (!title.trim()) { toast('Enter a title', 'err'); return }
    setSending(true)
    try {
      const r = await broadcast({ type: cType, title, body, audience: cAudience, channel: cChannel })
      toast(`Sent to ${r.sent ?? 0} recipients${r.suppressed ? ` · ${r.suppressed} skipped (opted out)` : ''}`, 'ok')
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

  const typeOf = (n: Notif) => TYPES.find((t) => t.toLowerCase() === (n.type || '').toLowerCase()) || 'Custom'
  const presentTypes = TYPES.filter((t) => rows.some((n) => typeOf(n) === t))
  const audiences = Array.from(new Set(rows.map((n) => n.audience).filter(Boolean))).sort()
  const channels = Array.from(new Set(rows.map((n) => n.channel).filter(Boolean))).sort()

  const ql = q.trim().toLowerCase()
  const filtered = rows.filter((n) => {
    if (tab !== 'All' && typeOf(n) !== tab) return false
    if (recipient !== 'all' && n.audience !== recipient) return false
    if (channel !== 'all' && n.channel !== channel) return false
    if (ql && ![n.title, n.body, n.audience, n.admin].some((v) => (v || '').toLowerCase().includes(ql))) return false
    return true
  })
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const exportCsv = () => {
    const head = ['Title', 'Message', 'Type', 'Audience', 'Channel', 'Reached', 'Skipped', 'Sent by', 'Sent at']
    const lines = filtered.map((n) => [n.title, n.body, typeOf(n), n.audience, n.channel, n.sent, n.suppressed || 0, n.admin, n.created]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = [head.join(','), ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'notifications.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <Card>
        <div className="card-head lg">
          <h3>Notifications sent<span className="count">{rows.length.toLocaleString('en-IN')}</span></h3>
          <div className="head-actions">
            <button className="btn line" onClick={exportCsv}><Download size={15} /> Export</button>
            <button className="btn" onClick={() => setCompose(true)}><Plus size={16} /> Send notification</button>
          </div>
        </div>

        {presentTypes.length > 1 && (
          <FilterTabs value={tab} onChange={(t) => { setTab(t); setPage(1) }} tabs={[
            { key: 'All', label: 'All', count: rows.length },
            ...presentTypes.map((t) => ({ key: t, label: t, count: rows.filter((n) => typeOf(n) === t).length })),
          ]} />
        )}

        <div className="toolbar">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search title, message or audience" />
          {audiences.length > 1 && (
            <select className="select flt" value={recipient} onChange={(e) => { setRecipient(e.target.value); setPage(1) }}>
              <option value="all">All audiences</option>
              {audiences.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {channels.length > 1 && (
            <select className="select flt" value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1) }}>
              <option value="all">All channels</option>
              {channels.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Notification</th><th>Type</th><th>Audience</th><th>Channel</th><th className="num">Reached</th><th>Sent</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((n) => (
                <tr key={n.id}>
                  <td style={{ maxWidth: 380 }}>
                    <button className="cell-link" onClick={() => setView(n)}>
                      <strong className="clamp1">{n.title}</strong>
                      <small className="muted">{n.body || '—'}</small>
                    </button>
                  </td>
                  <td className="nowrap">{typeOf(n)}</td>
                  <td className="nowrap">{n.audience}</td>
                  <td><Badge tone={channelTone(n.channel)} dot={false}>{n.channel}</Badge></td>
                  <td className="num">
                    <strong>{(n.sent || 0).toLocaleString('en-IN')}</strong>
                    {n.suppressed ? <small className="muted" style={{ display: 'block', fontSize: 12 }}>{n.suppressed} opted out</small> : null}
                  </td>
                  <td className="nowrap">
                    <span style={{ display: 'block' }}>{shortDate(n.created)}</span>
                    <small className="muted" style={{ fontSize: 12 }}>by {n.admin || '—'}</small>
                  </td>
                </tr>
              ))}
              {!pageRows.length && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: '36px 0' }}>
                  {rows.length ? 'No notifications match these filters.' : <>Nothing sent yet. <button className="cell-link" style={{ display: 'inline', color: 'var(--violet)', fontWeight: 600 }} onClick={() => setCompose(true)}>Send the first notification</button></>}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="notifications" onPage={setPage} onSize={(n) => { setPageSize(n); setPage(1) }} />
      </Card>

      {view && (
        <Modal title={view.title} onClose={() => setView(null)} footer={<button className="btn line" onClick={() => setView(null)}>Close</button>}>
          <Field label="Message"><div>{view.body || '—'}</div></Field>
          <Field label="Type"><div>{typeOf(view)}</div></Field>
          <Field label="Audience"><div>{view.audience} · {view.channel}</div></Field>
          <Field label="Reached"><div>{(view.sent || 0).toLocaleString('en-IN')} recipients{view.suppressed ? ` · ${view.suppressed} skipped (opted out)` : ''}</div></Field>
          <Field label="Sent"><div className="muted">{shortDate(view.created)} by {view.admin || '—'}</div></Field>
        </Modal>
      )}

      {compose && (
        <Modal title="Send Notification" onClose={() => setCompose(false)}
          footer={<>
            <button className="btn ghost" onClick={() => setCompose(false)}>Cancel</button>
            <button className="btn" onClick={send} disabled={sending}><Send size={16} /> Send to {cAudience.toLowerCase()}</button>
          </>}>
          <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Special Offer" /></Field>
          <Field label="Message"><textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Get 20% off this weekend…" /></Field>
          <Field label="Type">
            <select value={cType} onChange={(e) => setCType(e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
