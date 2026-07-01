import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, ShieldCheck, BarChart3, Users, Lock, Mail } from 'lucide-react'
import { useStore } from '../store'
import { login } from '../api'

export default function Login() {
  const { signIn } = useStore()
  const nav = useNavigate()
  const [email, setEmail] = useState('admin@homehelp.in')
  const [password, setPassword] = useState('admin123')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const { token, admin } = await login(email.trim(), password)
      signIn(token, admin)
      nav('/dashboard', { replace: true })
    } catch (e: any) { setErr(e.message || 'Login failed') } finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="login-badge"><span><LayoutDashboard size={22} /></span> HomeHelp Admin</div>
        <div>
          <h2>Run your home-services business from one dashboard.</h2>
          <p>Manage customers, professionals, bookings, payments and settings in real time.</p>
        </div>
        <div className="login-feats">
          <div className="login-feat"><span><BarChart3 size={16} /></span> Live revenue & booking analytics</div>
          <div className="login-feat"><span><Users size={16} /></span> Customer & pro management</div>
          <div className="login-feat"><span><ShieldCheck size={16} /></span> Secure API keys & settings</div>
        </div>
      </div>
      <div className="login-form">
        <form className="login-card" onSubmit={submit}>
          <h1>Welcome back 👋</h1>
          <p>Sign in to your admin account</p>
          <label className="field"><span>Email address</span>
            <div className="searchbox" style={{ flex: 'unset' }}>
              <Mail size={16} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@homehelp.in" required />
            </div>
          </label>
          <label className="field"><span>Password</span>
            <div className="searchbox" style={{ flex: 'unset' }}>
              <Lock size={16} />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
          </label>
          {err && <p className="err-text">{err}</p>}
          <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <div className="login-hint">Demo: <strong>admin@homehelp.in</strong> / <strong>admin123</strong></div>
        </form>
      </div>
    </div>
  )
}
