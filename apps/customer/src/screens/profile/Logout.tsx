// 96 · Logout — confirmation, then real sign-out (clears token/user) and back to login.
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut } from 'lucide-react'
import { BottomNav, useToast } from '../../components/UI'
import { useStore } from '../../store'

export default function Logout() {
  const nav = useNavigate()
  const toast = useToast()
  const { signOut } = useStore()

  function doLogout() { signOut(); toast('Logged out'); nav('/login', { replace: true }) }

  return (
    <div className="screen has-nav">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Logout</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content lo-wrap">
        <div className="lo-art" aria-hidden="true"><LogOut size={44} /></div>
        <h2 className="lo-title">Logout from HomeHelp?</h2>
        <p className="lo-sub">You will need to login again to access your account.</p>
        <div className="lo-actions">
          <button className="btn full" onClick={doLogout}>Logout</button>
          <button className="btn ghost full" onClick={() => nav(-1)}>Cancel</button>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
