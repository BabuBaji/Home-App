// 80 · Cancel Membership — reasons + confirm. Soft-cancels the real membership (benefits stay
// until the end of the current cycle).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { useToast } from '../../components/UI'
import { cancelMembership } from '../../api'

const REASONS = ['Too expensive', 'Not using enough', 'Found better alternatives', 'Service not as expected', 'Other (please specify)']

export default function CancelMembership() {
  const nav = useNavigate()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const confirmCancel = async () => {
    if (!reason) { toast('Please select a reason'); return }
    if (busy) return
    setBusy(true)
    try {
      await cancelMembership(note.trim() ? `${reason} — ${note.trim()}` : reason)
      toast('Membership cancelled. Benefits stay until your cycle ends.')
      nav('/membership/active', { replace: true })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not cancel')
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Cancel Membership</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content pad-cta">
        <div className="cxl-warn">
          <AlertCircle size={20} />
          <div><div className="cxl-warn-t">Are you sure you want to cancel?</div><div className="cxl-warn-d">You will lose your member benefits at the end of the current billing cycle.</div></div>
        </div>

        <div className="cxl-h">Before you go, tell us why you're canceling</div>
        <div className="ws-card">
          {REASONS.map((r) => (
            <button key={r} className="cxl-reason" onClick={() => setReason(r)}>
              <span className={`sub-radio ${reason === r ? 'on' : ''}`} /> <span>{r}</span>
            </button>
          ))}
        </div>

        <div className="fm-field" style={{ marginTop: 14 }}>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} rows={3} placeholder="Additional comments (optional)" />
          <span className="rt-count">{note.length}/200</span>
        </div>
      </div>

      <div className="w-foot">
        <button className="btn full danger-btn" disabled={busy} onClick={confirmCancel}>{busy ? 'Cancelling…' : 'Cancel Membership'}</button>
        <button className="btn-text full" onClick={() => nav(-1)} style={{ marginTop: 8, color: 'var(--primary)', fontWeight: 600 }}>Go Back</button>
      </div>
    </div>
  )
}
