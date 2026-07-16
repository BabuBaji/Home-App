// 93 · Privacy — policy links + a real "Delete Account" flow (DELETE /api/me), which signs out.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Database, MapPin, Share2, Trash2, ChevronRight, ShieldCheck, X } from 'lucide-react'
import { useToast } from '../../components/UI'
import { pushBackHandler } from '../../backStack'
import { deleteAccount } from '../../api'
import { useStore } from '../../store'

export default function Privacy() {
  const nav = useNavigate()
  const toast = useToast()
  const { signOut } = useStore()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (confirm) return pushBackHandler(() => setConfirm(false)) }, [confirm])

  async function del() {
    setBusy(true)
    try { await deleteAccount(); signOut(); toast('Account deleted'); nav('/login', { replace: true }) }
    catch (e) { toast((e as Error).message); setBusy(false) }
  }

  const ROWS = [
    { icon: <FileText size={17} />, t: 'Privacy Policy', d: 'Read our privacy policy', to: () => nav('/terms') },
    { icon: <Database size={17} />, t: 'Data Usage', d: 'How we use your data', to: () => nav('/terms') },
    { icon: <MapPin size={17} />, t: 'Location Permission', d: 'Manage location access', to: () => nav('/permissions') },
    { icon: <Share2 size={17} />, t: 'Third Party Sharing', d: 'Manage data sharing preferences', to: () => toast('You control what is shared. We never sell your data.') },
  ]

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Privacy</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content">
        <div className="ws-card">
          {ROWS.map((r) => (
            <button key={r.t} className="ws-row" onClick={r.to}>
              <span className="ws-ico">{r.icon}</span>
              <span className="ws-main"><span className="ws-t">{r.t}</span><span className="ws-d">{r.d}</span></span>
              <ChevronRight size={17} className="ws-chev" />
            </button>
          ))}
          <button className="ws-row" onClick={() => setConfirm(true)}>
            <span className="ws-ico danger"><Trash2 size={17} /></span>
            <span className="ws-main"><span className="ws-t danger">Delete Account</span><span className="ws-d">Permanently delete your account</span></span>
            <ChevronRight size={17} className="ws-chev" />
          </button>
        </div>

        <div className="pv-note">
          <ShieldCheck size={18} />
          <div><div className="pv-note-t">Your privacy is important to us.</div><div className="pv-note-d">We never share your data without your consent.</div></div>
        </div>
      </div>

      {confirm && (
        <div className="sheet-wrap" onClick={() => setConfirm(false)}>
          <div className="sheet fm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="fm-sheet-head"><span>Delete account?</span><button onClick={() => setConfirm(false)} aria-label="Close"><X size={18} /></button></div>
            <p className="pv-warn">This permanently removes your account, addresses, saved methods and wallet history. This cannot be undone.</p>
            <button className="btn full danger-btn" onClick={del} disabled={busy}>{busy ? 'Deleting…' : 'Delete My Account'}</button>
            <button className="btn ghost full" onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
