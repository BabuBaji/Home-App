import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, Phone, BadgeCheck, ShieldCheck } from 'lucide-react'
import { Loading, useBack } from '../../components/UI'
import { useJob, proName } from './useJob'
import { WorkerAvatar } from './parts'
import { callExpert } from '../../api'
import { t } from '../../i18n'

// Call your expert. One honest action: ask the server to connect the call. With masked calling on
// ('bridge') our number rings the customer's phone and connects them to the expert — neither side
// sees the other's number. Otherwise ('direct') the phone's own dialer opens with the expert's
// number. The call itself happens in the phone app; nothing here pretends to be an in-app call,
// and the expert's number is never printed on screen.
export default function CallWorker() {
  const { id } = useParams()
  const back = useBack(`/job/${id}`)
  const { b } = useJob(id, false)
  const [state, setState] = useState<'idle' | 'calling' | 'bridging' | 'dialer' | 'failed'>('idle')

  async function call() {
    if (!b || state === 'calling') return
    setState('calling')
    try {
      const r = await callExpert(b.id)
      if (r.mode === 'bridge') { setState('bridging'); return }
      if (r.phone) { setState('dialer'); window.location.href = `tel:${r.phone}`; return }
      setState('failed')
    } catch { setState('failed') }
  }

  const top = (
    <div className="jt-top">
      <button className="jt-ic" onClick={back} aria-label={t('Back')}><ArrowLeft size={22} /></button>
      <b>{t('Call your expert')}</b><span style={{ width: 40 }} />
    </div>
  )
  if (!b) return <div className="screen jt">{top}<Loading /></div>

  const assigned = !!(b.pro?.name || (b.pro_name && b.pro_name.trim()))
  const status = state === 'calling' ? t('Connecting…')
    : state === 'bridging' ? t('Your phone will ring in a moment — pick up to be connected to {name}.', { name: proName(b).split(' ')[0] })
      : state === 'dialer' ? t('Opening your phone dialer…')
        : state === 'failed' ? t('Could not connect the call. Please try again, or message your expert in chat.')
          : ''

  return (
    <div className="screen jt">
      {top}
      <div className="content cw-body">
        <WorkerAvatar b={b} size={110} />
        <h2>{assigned ? proName(b) : t('Expert not assigned yet')}</h2>
        {b.pro?.verified && <span className="jt-wp-badge"><BadgeCheck size={13} /> {t('Verified Partner')}</span>}
        <p>{assigned ? t('Tap the button to call your expert about this booking.') : t('You can call once an expert has been assigned to your booking.')}</p>
        <button className="cw-call" onClick={call} disabled={!assigned || state === 'calling'} aria-label={t('Call {name}', { name: proName(b).split(' ')[0] })}>
          <Phone size={32} />
        </button>
        {status && <p role="status" style={{ color: state === 'failed' ? 'var(--red)' : 'var(--ink)' }}>{status}</p>}
        {state === 'bridging' && (
          <div className="cw-note"><ShieldCheck size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
            {t('This is a masked call — HomeHelp connects you, so neither of you sees the other\'s phone number.')}
          </div>
        )}
      </div>
    </div>
  )
}
