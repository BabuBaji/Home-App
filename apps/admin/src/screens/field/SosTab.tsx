import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, MapPin, ShieldCheck, Hand, CheckCircle2, HardHat, User, Clock, ClipboardList } from 'lucide-react'
import { fetchSos, ackSos, resolveSos, getSocket, type SosIncident } from '../../api'
import { useStore, has } from '../../store'
import { useToast } from '../../components/UI'
import { usePoll, Header, Spinner, ErrorBox, EmptyBox, Sheet, timeAgo, telHref, mapHref, pretty } from './shared'

const QUICK_NOTES = ['Spoke to them — safe', 'False alarm / pressed by mistake', 'Reached on site, handled', 'Escalated to police']

export default function SosTab() {
  const { admin } = useStore()
  const toast = useToast()
  const canRespond = has(admin, 'safety.respond')
  const [showAll, setShowAll] = useState(false)
  const { data, error, loading, refreshing, reload } = usePoll(() => fetchSos(showAll ? 'all' : 'open'), 15000, [showAll])
  const [busy, setBusy] = useState<number | null>(null)
  const [resolving, setResolving] = useState<SosIncident | null>(null)

  // Live: a new SOS or someone else acking/closing one refetches at once. SosAlert (mounted globally
  // while signed in) already joins the admin room, so we only listen.
  useEffect(() => {
    const s = getSocket()
    const on = () => reload(true)
    s.on('sos', on); s.on('sos:update', on)
    return () => { s.off('sos', on); s.off('sos:update', on) }
  }, [reload])

  const list = data || []
  const openCount = list.filter((x) => !isClosed(x)).length

  async function ack(x: SosIncident) {
    setBusy(x.id)
    try { await ackSos(x.id); toast(`You're responding to ${x.ref}`); await reload(true) }
    catch (e) { toast((e as Error).message, 'err') }
    finally { setBusy(null) }
  }

  return (
    <>
      <Header
        title="SOS"
        sub={loading ? 'Loading…' : openCount ? <span className="fd-live"><i />{openCount} open incident{openCount > 1 ? 's' : ''}</span> : 'All clear'}
        onRefresh={() => reload()} refreshing={refreshing}
      >
        <label className="fd-toggle">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <span className="fd-toggle-track"><span /></span>
          Show resolved
        </label>
      </Header>

      <div className="fd-body">
        {loading && !data ? <Spinner label="Loading incidents…" />
          : error && !data ? <ErrorBox msg={error} onRetry={() => reload()} />
          : list.length === 0 ? (
            <EmptyBox icon={<ShieldCheck size={30} />} title={showAll ? 'No SOS incidents yet' : 'No open SOS — all clear'}
              msg="New alerts appear here instantly and sound a siren." />
          ) : (
            <div className="fd-list">
              {error && <div className="fd-banner">Couldn't refresh — showing last data. {error}</div>}
              {list.map((x) => {
                const closed = isClosed(x)
                const acked = !closed && !!x.acknowledgedBy
                return (
                  <article key={x.id} className={'fd-card fd-sos' + (closed ? ' closed' : acked ? ' acked' : ' open')}>
                    <div className="fd-card-top">
                      <span className={'fd-avatar ' + (x.kind === 'worker' ? 'v' : 'a')}>{x.kind === 'worker' ? <HardHat size={20} /> : <User size={20} />}</span>
                      <div className="fd-grow">
                        <div className="fd-title">{x.who}</div>
                        <div className="fd-meta">
                          <span className={'fd-badge ' + (x.kind === 'worker' ? 'violet' : 'accent')}>{x.kind === 'worker' ? 'Expert' : x.kind === 'customer' ? 'Customer' : pretty(x.kind)}</span>
                          <span>{x.ref}</span>
                          <span><Clock size={13} /> {timeAgo(x.created)}</span>
                        </div>
                      </div>
                    </div>
                    {x.message && <p className="fd-msg">{x.message}</p>}
                    {x.bookingId && (
                      <Link className="fd-link" to={`/bookings/${x.bookingId}`}><ClipboardList size={15} /> Booking {x.bookingRef || '#' + x.bookingId}</Link>
                    )}
                    <div className={'fd-status ' + (closed ? 'green' : acked ? 'amber' : 'red')}>
                      {closed ? <>Resolved{x.resolvedBy ? ` by ${x.resolvedBy}` : ''} · {timeAgo(x.resolvedAt)}{x.response ? <em> — “{x.response}”</em> : null}</>
                        : acked ? <>Acknowledged by {x.acknowledgedBy} · {timeAgo(x.acknowledgedAt)}</>
                        : <>Open — nobody responding yet</>}
                    </div>
                    <div className="fd-actions">
                      {x.phone ? <a className="fd-btn fd-btn-call" href={telHref(x.phone)}><Phone size={18} /> Call</a>
                        : <button className="fd-btn" disabled><Phone size={18} /> No phone</button>}
                      {mapHref(x.lat, x.lng) ? <a className="fd-btn" href={mapHref(x.lat, x.lng)} target="_blank" rel="noreferrer"><MapPin size={18} /> Map</a>
                        : <button className="fd-btn" disabled><MapPin size={18} /> No location</button>}
                    </div>
                    {!closed && canRespond && (
                      <div className="fd-actions">
                        {!acked && (
                          <button className="fd-btn fd-btn-danger" disabled={busy === x.id} onClick={() => ack(x)}>
                            <Hand size={18} /> {busy === x.id ? 'Sending…' : "I'm responding"}
                          </button>
                        )}
                        <button className="fd-btn fd-btn-primary" onClick={() => setResolving(x)}><CheckCircle2 size={18} /> Resolve</button>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
      </div>

      {resolving && <ResolveSheet sos={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); reload(true) }} />}
    </>
  )
}

const isClosed = (x: SosIncident) => ['resolved', 'closed'].includes(String(x.status || '').toLowerCase())

function ResolveSheet({ sos, onClose, onDone }: { sos: SosIncident; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit() {
    if (!note.trim()) return toast('Add a short note on what happened', 'err')
    setSaving(true)
    try { await resolveSos(sos.id, note.trim()); toast(`${sos.ref} resolved`); onDone() }
    catch (e) { toast((e as Error).message, 'err'); setSaving(false) }
  }
  return (
    <Sheet title={`Resolve ${sos.ref}`} onClose={onClose}
      footer={<button className="fd-btn fd-btn-primary fd-btn-block" disabled={saving || !note.trim()} onClick={submit}><CheckCircle2 size={18} /> {saving ? 'Resolving…' : 'Mark resolved'}</button>}>
      <p className="fd-sub">What happened with <b>{sos.who}</b>? This note is saved on the incident.</p>
      <div className="fd-chips">
        {QUICK_NOTES.map((q) => <button key={q} className={'fd-chip' + (note === q ? ' on' : '')} onClick={() => setNote(q)}>{q}</button>)}
      </div>
      <textarea className="fd-input" rows={4} maxLength={500} autoFocus placeholder="e.g. Called the expert, they're safe — customer dispute handled" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="fd-count">{note.length}/500</div>
    </Sheet>
  )
}
