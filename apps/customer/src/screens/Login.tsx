import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { requestOtp, verifyOtp, googleAuth } from '../api'
import { useToast } from '../components/UI'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

export default function Login() {
  const nav = useNavigate()
  const { signIn } = useStore()
  const toast = useToast()
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('98765 43210')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [gbusy, setGbusy] = useState(false)
  const [hint, setHint] = useState('')
  const gbtnRef = useRef<HTMLDivElement>(null)

  function done(token: string, user: any) {
    signIn(token, user)
    nav('/home', { replace: true })
  }

  async function sendOtp() {
    setBusy(true)
    try {
      const { devOtp } = await requestOtp(phone.replace(/\s/g, ''))
      setHint(`Demo OTP: ${devOtp}`)
      setStep('otp')
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }
  async function verify() {
    setBusy(true)
    try { const { token, user } = await verifyOtp(phone.replace(/\s/g, ''), otp); done(token, user) }
    catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  // Demo Google sign-in (works with no setup)
  async function googleDemo() {
    setGbusy(true)
    try { const { token, user } = await googleAuth({ demo: true }); done(token, user) }
    catch (e) { toast((e as Error).message); setGbusy(false) }
  }

  // Real Google sign-in when a client id is configured
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    const id = 'gsi-script'
    const init = () => {
      const g = (window as any).google
      if (!g?.accounts?.id || !gbtnRef.current) return
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (resp: any) => {
          try { const { token, user } = await googleAuth({ credential: resp.credential }); done(token, user) }
          catch (e) { toast((e as Error).message) }
        },
      })
      g.accounts.id.renderButton(gbtnRef.current, { theme: 'outline', size: 'large', width: 320, text: 'continue_with', shape: 'pill' })
    }
    if (document.getElementById(id)) { init(); return }
    const s = document.createElement('script')
    s.id = id; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true
    s.onload = init
    document.body.appendChild(s)
  }, [])

  return (
    <div className="login2">
      {/* hero */}
      <div className="login2-hero">
        <div className="orbs"><span /><span /><span /></div>
        <div className="brand2">
          <span className="brand2-logo">🏠</span>
          <span className="brand2-name">HomeHelp</span>
        </div>
        <h1 className="hero2-title">Trusted house help<br />at your fingertips</h1>
        <p className="hero2-sub">Cleaning, kitchen, laundry &amp; more — a verified pro at your door in minutes.</p>
        <div className="hero2-chips">
          <span>🧹 Cleaning</span><span>🍳 Kitchen</span><span>🧺 Laundry</span><span>🚿 Bathroom</span>
        </div>
      </div>

      {/* card */}
      <div className="login2-card">
        <div className="grip" />
        <h2>{step === 'phone' ? 'Login or Sign up' : 'Verify your number'}</h2>
        <p className="muted">
          {step === 'phone' ? 'Enter your mobile number to continue' : `Enter the 4-digit OTP sent to +91 ${phone}`}
        </p>

        {step === 'phone' ? (
          <>
            <div className="field">
              <span className="cc">🇮🇳 +91</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" inputMode="numeric" />
            </div>
            <button className="btn full" onClick={sendOtp} disabled={busy}>{busy ? 'Sending OTP…' : 'Continue'}</button>

            <div className="or"><span>or continue with</span></div>

            {GOOGLE_CLIENT_ID ? (
              <div ref={gbtnRef} className="gbtn-real" />
            ) : (
              <button className="gbtn" onClick={googleDemo} disabled={gbusy}>
                <GoogleIcon />
                <span>{gbusy ? 'Signing in…' : 'Continue with Google'}</span>
              </button>
            )}

            <p className="terms">By continuing, you agree to our <b>Terms &amp; Conditions</b> &amp; <b>Privacy Policy</b></p>
          </>
        ) : (
          <>
            {hint && <p className="otp-hint">{hint}</p>}
            <div className="field">
              <span className="cc">🔒</span>
              <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="• • • •" inputMode="numeric" autoFocus style={{ letterSpacing: 8 }} />
            </div>
            <button className="btn full" onClick={verify} disabled={busy || otp.length !== 4}>{busy ? 'Verifying…' : 'Verify & Continue'}</button>
            <button className="btn-text full" onClick={() => { setStep('phone'); setOtp('') }}>← Change number</button>
          </>
        )}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
