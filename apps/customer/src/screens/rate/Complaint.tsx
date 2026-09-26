import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Frown } from 'lucide-react'
import { useToast } from '../../components/UI'
import { createTicket } from '../../api'
import { useJob } from '../job/useJob'
import { t } from '../../i18n'

// Module 7 · #54 — Report an Issue. Files a real support ticket via createTicket(category, message).
const ISSUES = [
  'Worker was late',
  'Did not complete the work',
  'Poor quality of service',
  'Worker behaviour was unprofessional',
  'Damage to property',
  'Other (Please specify)',
]

export default function Complaint() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { b } = useJob(id, false)
  const [issue, setIssue] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!issue) return toast(t('Please select an issue type'))
    setBusy(true)
    const ref = b?.ref ? ` (Booking ${b.ref})` : ''
    try {
      await createTicket(issue, `${issue}${ref}${details ? ` — ${details}` : ''}`)
      toast(t("Complaint submitted. We'll get back to you."))
      setTimeout(() => nav('/bookings', { replace: true }), 800)
    } catch (e) { toast((e as Error).message); setBusy(false) }
  }

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <b>{t('Report an Issue')}</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll">
        <div className="cm-banner"><Frown size={20} /><div><b>{t("We're sorry to hear that!")}</b><span>{t('Please let us know what went wrong.')}</span></div></div>

        <div className="cm-label">{t('Select issue type')}</div>
        <div className="cm-list">
          {ISSUES.map((it) => (
            <button key={it} className={`cm-opt ${issue === it ? 'on' : ''}`} onClick={() => setIssue(it)}>
              <span className="cm-radio">{issue === it && <i />}</span>{t(it)}
            </button>
          ))}
        </div>

        <div className="rt-field">
          <label>{t('Add more details (Optional)')}</label>
          <textarea maxLength={300} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t('Tell us more so we can fix it…')} />
          <span className="rt-count">{details.length}/300</span>
        </div>
      </div>

      <div className="jt-foot">
        <button className="jt-btn" onClick={submit} disabled={busy}>{busy ? t('Submitting…') : t('Submit Complaint')}</button>
      </div>
    </div>
  )
}
