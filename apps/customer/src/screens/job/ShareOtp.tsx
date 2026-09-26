import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Bell } from 'lucide-react'
import { Loading, useToast, useBack } from '../../components/UI'
import { useJob, useAutoAdvance, proName } from './useJob'
import { t } from '../../i18n'

// Module 6 · #48 — Share OTP. The code is the real booking.service_otp the worker enters to start
// the job. If it hasn't been released yet (future scheduled booking), we say so instead of faking one.
export default function ShareOtp() {
  const { id } = useParams()
  const nav = useNavigate()
  const goBack = useBack(`/job/${id}`)
  const toast = useToast()
  const { b } = useJob(id)

  // The worker entered the OTP and the backend flipped the booking to in_progress — the code on
  // this screen is spent, so move the customer on to the live service timer.
  useAutoAdvance(b, 'in_progress', (bid) => `/job/${bid}/progress`)

  if (!b) return <div className="screen jt"><Loading /></div>

  const otp = b.service_otp ? String(b.service_otp) : ''
  const first = proName(b).split(' ')[0]

  async function share() {
    if (!otp) return
    const text = `My HomeHelp service start OTP is ${otp}. Please share only with the assigned worker.`
    try {
      const { Share } = await import('@capacitor/share')
      await Share.share({ title: t('Service OTP'), text })
    } catch {
      try { await navigator.share?.({ text }) } catch { /* ignore */ }
      try { await navigator.clipboard?.writeText(otp); toast(t('OTP copied')) } catch { toast(`OTP: ${otp}`) }
    }
  }

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={goBack} aria-label={t('Back')}><ArrowLeft size={22} /></button>
        <b>{t('Share OTP')}</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll jt-otp-wrap">
        <div className="jt-otp-illo"><ShieldCheck size={44} /></div>
        <h2 className="jt-otp-title">{t('Share this OTP with')}<br />{proName(b)}</h2>
        <p className="jt-otp-sub">{t('This OTP is required to start the service')}</p>

        {otp ? (
          <>
            <div className="jt-otp-boxes">{otp.split('').map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="jt-otp-valid">{t('Keep it safe — share only when {name} arrives', { name: first })}</div>
          </>
        ) : (
          <div className="jt-otp-pending">{t('Your start OTP will appear here once the service window opens.')}</div>
        )}

        <div className="jt-note warn"><Bell size={17} /> {t('Do not share this OTP with anyone else for security reasons.')}</div>
      </div>

      <div className="jt-foot col">
        <button className="jt-btn" onClick={share} disabled={!otp}>{t('Share OTP')}</button>
        <button className="jt-btn text" onClick={() => nav(-1)}>{t('Cancel')}</button>
      </div>
    </div>
  )
}
