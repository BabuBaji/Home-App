import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, Star } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { fetchExtensions, approveExtension, declineExtension, type BookingExtension } from '../../api'
import { useJob, proName, proRating, serviceNames } from './useJob'

// Module 6 — Extend Your Service. The expert can ASK for more time; only this screen grants it.
// Nothing here shortens or rewrites the original booking: the extension is priced and shown as its
// own line, and the clock only moves once the customer has approved and paid.
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

// Booked length in minutes — mirrors the server's rule (durationId first, then the label).
const DUR: Record<string, number> = { '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }
function bookedMinutes(b: { items?: { durationId?: string }[]; duration?: string }): number {
  const id = b.items?.[0]?.durationId
  if (id && DUR[id]) return DUR[id]
  const s = String(b.duration || '')
  const n = parseInt(s, 10)
  if (!n) return 60
  return /h/i.test(s) && !/min/i.test(s) ? n * 60 : n
}

export default function ExtendService() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { b } = useJob(id)
  const [pending, setPending] = useState<BookingExtension | null>(null)
  const [granted, setGranted] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Poll: the expert may cancel, or the request may be answered on another device.
  useEffect(() => {
    if (!b?.id) return
    let stop = false
    const load = () => fetchExtensions(b.id)
      .then((d) => { if (!stop) { setPending(d.pending); setGranted(d.extensionMinutes); setLoaded(true) } })
      .catch(() => setLoaded(true))
    load()
    const iv = setInterval(load, 8000)
    return () => { stop = true; clearInterval(iv) }
  }, [b?.id])

  if (!b || !loaded) return <div className="screen jt"><Loading /></div>

  const startMs = b.started_at ? new Date(b.started_at).getTime() : 0
  const currentEndMs = startMs ? startMs + (bookedMinutes(b) + granted) * 60000 : 0
  const newEndMs = currentEndMs && pending ? currentEndMs + pending.minutes * 60000 : 0

  async function decide(approve: boolean) {
    if (!pending || !b) return
    setBusy(true)
    try {
      if (approve) {
        await approveExtension(b.id, pending.id)
        toast(pending.price > 0 ? `Approved — ₹${pending.price} paid from your wallet` : 'Extra time approved')
      } else {
        await declineExtension(b.id, pending.id)
        toast('Extension declined')
      }
      setPending(null)
      nav(`/job/${b.id}/progress`)
    } catch (e) {
      // The commonest failure is an empty wallet — say so plainly rather than "something went wrong".
      const msg = (e as Error).message || 'Could not complete that'
      toast(/insufficient|balance/i.test(msg) ? `${msg} — add money to your wallet to approve` : msg)
    } finally { setBusy(false) }
  }

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(`/job/${b.id}/progress`)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Extend Your Service?</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll">
        {!pending ? (
          <div className="jt-card jt-center" style={{ padding: 28 }}>
            <Clock size={30} />
            <h3 style={{ margin: '12px 0 4px' }}>No request right now</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              {granted > 0
                ? `Your service was extended by ${granted} minutes.`
                : 'Your expert hasn’t asked for extra time.'}
            </p>
          </div>
        ) : (
          <>
            <div className="jt-card">
              <div className="jt-kv"><span>Current Booking</span><b>{serviceNames(b)}</b></div>
              <div className="jt-kv"><span>Original duration</span><b>{bookedMinutes(b)} mins</b></div>
              {granted > 0 && <div className="jt-kv"><span>Already extended</span><b>+{granted} mins</b></div>}
              {!!currentEndMs && <div className="jt-kv"><span>Current end time</span><b>{clock(currentEndMs)}</b></div>}
            </div>

            <div className="jt-card" style={{ borderColor: 'var(--brand, #6D4AFF)' }}>
              <div className="jt-kv"><span>Requested extension</span><b>+{pending.minutes} mins</b></div>
              {!!newEndMs && <div className="jt-kv"><span>New expected completion</span><b>{clock(newEndMs)}</b></div>}
              <div className="jt-kv">
                <span>Additional amount</span>
                <b>{pending.price > 0 ? `₹${pending.price}` : 'No charge'}</b>
              </div>
            </div>

            <div className="jt-card">
              <div className="jt-kv" style={{ alignItems: 'center' }}>
                <span>Your expert</span>
                <b>{proName(b)} <Star size={12} fill="#F5A623" strokeWidth={0} /> {proRating(b)}</b>
              </div>
              <div style={{ marginTop: 8 }}>
                <div className="muted" style={{ fontSize: 12 }}>Reason</div>
                <div style={{ fontSize: 14 }}>{pending.reasonLabel}</div>
                {!!pending.reasonText && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{pending.reasonText}</div>}
              </div>
            </div>

            {pending.price === 0 && (
              <p className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>
                This extra time is not being charged to you.
              </p>
            )}
          </>
        )}
      </div>

      {!!pending && (
        <div className="jt-foot" style={{ display: 'flex', gap: 10 }}>
          <button className="jt-btn ghost" disabled={busy} style={{ flex: 1 }} onClick={() => decide(false)}>Decline</button>
          <button className="jt-btn" disabled={busy} style={{ flex: 1.6 }} onClick={() => decide(true)}>
            {busy ? 'Please wait…' : pending.price > 0 ? `Approve ₹${pending.price}` : 'Approve'}
          </button>
        </div>
      )}
    </div>
  )
}
