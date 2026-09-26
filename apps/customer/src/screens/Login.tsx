import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, BadgeCheck, Clock3, Sparkles, Delete, Globe } from 'lucide-react'
import { useStore } from '../store'
import { requestOtp, verifyOtp, googleAuth } from '../api'
import { useToast } from '../components/UI'
import { t, setLang, useLang, LANGUAGES } from '../i18n'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const OTP_LEN = 4                 // backend issues a 4-digit code (services/auth DEV_OTP)
const RESEND_SECONDS = 28

export default function Login() {
  const nav = useNavigate()
  const { signIn } = useStore()
  const toast = useToast()
  const lang = useLang()
  const [step, setStep] = useState<'welcome' | 'phone' | 'otp'>('welcome')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [gbusy, setGbusy] = useState(false)
  const [hint, setHint] = useState('')
  const [left, setLeft] = useState(RESEND_SECONDS)
  const gbtnRef = useRef<HTMLDivElement>(null)

  function done(token: string, user: any) {
    signIn(token, user)
    nav('/home', { replace: true })   // AppGuard routes on to Select City → Permission if needed
  }

  async function sendOtp() {
    setBusy(true)
    try {
      const { devOtp } = await requestOtp(phone.replace(/\s/g, ''))
      setHint(t('Demo OTP: {otp}', { otp: devOtp }))
      setOtp('')
      setStep('otp')
      setLeft(RESEND_SECONDS)
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }
  async function resend() {
    if (left > 0) return
    try {
      const { devOtp } = await requestOtp(phone.replace(/\s/g, ''))
      setHint(t('Demo OTP: {otp}', { otp: devOtp }))
      setLeft(RESEND_SECONDS)
      toast(t('OTP resent'))
    } catch (e) { toast((e as Error).message) }
  }
  async function verify(code = otp) {
    setBusy(true)
    try { const { token, user } = await verifyOtp(phone.replace(/\s/g, ''), code); done(token, user) }
    catch (e) { toast((e as Error).message); setOtp('') } finally { setBusy(false) }
  }

  // countdown for the resend timer on the OTP step
  useEffect(() => {
    if (step !== 'otp' || left <= 0) return
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [step, left])

  // auto-submit once all digits are entered
  useEffect(() => {
    if (step === 'otp' && otp.length === OTP_LEN && !busy) verify(otp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp])

  // numeric keypad (OTP step) — fills the boxes without the OS keyboard
  function press(d: string) { setOtp((v) => (v.length < OTP_LEN ? v + d : v)) }
  function backspace() { setOtp((v) => v.slice(0, -1)) }

  // Real Google sign-in when a client id is configured
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || step !== 'phone') return
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
  }, [step])

  /* ---------- 2. Welcome ---------- */
  if (step === 'welcome') {
    return (
      <div className="auth auth-welcome">
        <div className="content aw-scroll">
          {/* First-run language choice — every supported language, switches the screen instantly.
              Marked pending so the profile adopts it after sign-in instead of overwriting it. */}
          <label className="aw-lang">
            <Globe size={15} aria-hidden="true" />
            <select value={lang} aria-label={t('Language')}
              onChange={(e) => { setLang(e.target.value); try { sessionStorage.setItem('hh_lang_pending', '1') } catch { /* ignore */ } }}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.code === 'en' ? l.native : `${l.native} · ${l.name}`}</option>)}
            </select>
          </label>
          <h1 className="au-h1 aw-title">
{t('Welcome')}<br />{t('Back!')}</h1>
          <p className="au-sub">{t("Book trusted home services and relax. We'll take care of the rest.")}</p>

          <div className="aw-photo">
            <img src="/auth/welcome.jpg" alt="" />
            <span className="aw-photo-fade" />
          </div>

          <ul className="aw-feats">
            <li><span className="aw-fi"><BadgeCheck size={18} /></span>
              <div><b>{t('Verified Professionals')}</b><small>{t('Background checked & trained')}</small></div></li>
            <li><span className="aw-fi"><Clock3 size={18} /></span>
              <div><b>{t('On-time Service')}</b><small>{t('Punctual and reliable')}</small></div></li>
            <li><span className="aw-fi"><Sparkles size={18} /></span>
              <div><b>{t('100% Satisfaction')}</b><small>{t('Quality service, every time')}</small></div></li>
          </ul>
        </div>
        <div className="au-foot">
          <button className="au-btn" onClick={() => setStep('phone')}>{t('Get Started')}</button>
        </div>
      </div>
    )
  }

  /* ---------- 3. Phone login ---------- */
  if (step === 'phone') {
    return (
      <div className="auth">
        <div className="au-top">
          <button className="au-back" onClick={() => setStep('welcome')} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        </div>
        <div className="content au-body">
          <h1 className="au-h1">{t('Enter your')}<br /><span className="av">{t('mobile number')}</span></h1>
          <p className="au-sub">{t("We'll send you a verification code to verify your number")}</p>

          <div className="au-field">
            <span className="au-cc"><span className="au-flag">🇮🇳</span> +91</span>
            {/* Digits only, 10 max; a pasted +91 / 0 prefix is dropped. */}
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '').slice(0, 10))} placeholder={t('Enter mobile number')}
              inputMode="numeric" type="tel" maxLength={10} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') sendOtp() }} />
          </div>

          <div className="au-safe"><ShieldCheck size={16} /> {t('Your number is safe with us')}</div>

          {/* Google sign-in only when a client id is configured (the server verifies the token). */}
          {GOOGLE_CLIENT_ID && <div ref={gbtnRef} className="au-google-real" />}
        </div>
        <div className="au-foot">
          <button className="au-btn" onClick={sendOtp} disabled={busy || !/^[6-9]\d{9}$/.test(phone)}>
            {busy ? t('Sending OTP…') : t('Send OTP')}
          </button>
          <p className="au-terms">{t('By continuing, you agree to our Terms of Service and Privacy Policy')}</p>
        </div>
      </div>
    )
  }

  /* ---------- 4. OTP verification ---------- */
  return (
    <div className="auth">
      <div className="au-top">
        <button className="au-back" onClick={() => { setStep('phone'); setOtp('') }} aria-label={t('Back')}><ArrowLeft size={20} /></button>
      </div>
      <div className="content au-body">
        <h1 className="au-h1">{t('Enter')} <span className="av">OTP</span></h1>
        <p className="au-sub">
          {t("We've sent a {n}-digit code to", { n: OTP_LEN })}<br />+91 {phone}{' '}
          <button className="au-link" onClick={() => { setStep('phone'); setOtp('') }}>{t('Change')}</button>
        </p>

        <div className="au-otp">
          {Array.from({ length: OTP_LEN }).map((_, i) => (
            <div key={i} className={`au-otp-box ${otp.length === i ? 'active' : ''} ${otp[i] ? 'filled' : ''}`}>
              {otp[i] || ''}
            </div>
          ))}
        </div>

        <div className="au-resend">
          {left > 0
            ? <>{t('Resend OTP in')} <b>00:{String(left).padStart(2, '0')}</b></>
            : <button className="au-link" onClick={resend}>{t('Resend OTP')}</button>}
        </div>
        {hint && <p className="au-hint">{hint}</p>}

        <div className="au-help">
          <ShieldCheck size={18} />
          <div><b>{t("Didn't receive the code?")}</b><small>{t('Check your SMS spam folder or resend the code.')}</small></div>
        </div>
      </div>

      {/* numeric keypad */}
      <div className="au-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="au-key" onClick={() => press(d)}>{d}</button>
        ))}
        <span />
        <button className="au-key" onClick={() => press('0')}>0</button>
        <button className="au-key au-key-del" onClick={backspace} aria-label={t('Delete')}><Delete size={22} /></button>
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
