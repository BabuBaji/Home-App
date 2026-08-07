import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Bell } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { useJob, useAutoAdvance, proName } from './useJob'

// Module 6 · #48 — Share OTP. The code is the real booking.service_otp the worker enters to start
// the job. If it hasn't been released yet (future scheduled booking), we say so instead of faking one.
export default function ShareOtp() {
  const { id } = useParams()
  const nav = useNavigate()
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
      await Share.share({ title: 'Service OTP', text })
    } catch {
      try { await navigator.share?.({ text }) } catch { /* ignore */ }
      try { await navigator.clipboard?.writeText(otp); toast('OTP copied') } catch { toast(`OTP: ${otp}`) }
    }
  }

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Share OTP</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll jt-otp-wrap">
        <div className="jt-otp-illo"><ShieldCheck size={44} /></div>
        <h2 className="jt-otp-title">Share this OTP with<br />{proName(b)}</h2>
        <p className="jt-otp-sub">This OTP is required to start the service</p>

        {otp ? (
          <>
            <div className="jt-otp-boxes">{otp.split('').map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="jt-otp-valid">Keep it safe — share only when {first} arrives</div>
          </>
        ) : (
          <div className="jt-otp-pending">Your start OTP will appear here once the service window opens.</div>
        )}

        <div className="jt-note warn"><Bell size={17} /> Do not share this OTP with anyone else for security reasons.</div>
      </div>

      <div className="jt-foot col">
        <button className="jt-btn" onClick={share} disabled={!otp}>Share OTP</button>
        <button className="jt-btn text" onClick={() => nav(-1)}>Cancel</button>
      </div>
    </div>
  )
}
