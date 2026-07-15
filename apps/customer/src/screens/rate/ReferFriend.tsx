import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy, Share2, Gift } from 'lucide-react'
import { useToast } from '../../components/UI'
import { fetchHome } from '../../api'
import { useStore } from '../../store'
import type { Referral } from '../../types'

// Module 7 · #57 — Refer & Earn. Referral code + reward come from the real /api/home referral block
// (and the signed-in user's referralCode). Sharing uses the device share sheet.
export default function ReferFriend() {
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useStore()
  const [ref, setRef] = useState<Referral | null>(null)

  useEffect(() => { fetchHome().then((h) => setRef(h.referral)).catch(() => {}) }, [])

  const code = user?.referralCode || ref?.code || ''
  const reward = ref?.reward ?? 100
  const msg = `Get ₹${reward} off your first HomeHelp booking! Use my code ${code} when you sign up.`

  function copy() { navigator.clipboard?.writeText(code).then(() => toast('Code copied!')).catch(() => toast(code)) }
  async function share(via?: string) {
    if (via === 'whatsapp') { window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank'); return }
    try { const { Share } = await import('@capacitor/share'); await Share.share({ title: 'Refer & Earn', text: msg }) }
    catch { try { await navigator.share?.({ text: msg }) } catch { copy() } }
  }

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Refer &amp; Earn</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll jt-center">
        <div className="rf-illo"><Gift size={40} /></div>
        <h2 className="jt-done-title">Refer a friend &amp; earn</h2>
        <p className="jt-done-sub">You get ₹{reward}, your friend gets ₹{reward} off<br />on their first booking!</p>

        <div className="rf-code-label">Your Referral Code</div>
        <button className="rf-code" onClick={copy}>
          <span>{code || '—'}</span><Copy size={18} />
        </button>

        <div className="rf-share-label">Share your link</div>
        <div className="rf-share">
          <button className="rf-app wa" onClick={() => share('whatsapp')}><span>🟢</span>WhatsApp</button>
          <button className="rf-app ig" onClick={() => share()}><span>📸</span>Instagram</button>
          <button className="rf-app fb" onClick={() => share()}><span>📘</span>Facebook</button>
          <button className="rf-app more" onClick={() => share()}><Share2 size={20} />More</button>
        </div>
      </div>

      <div className="jt-foot">
        <button className="jt-btn text" onClick={() => toast(`Share your code. When a friend books their first service, you both get ₹${reward}.`)}>How it works?</button>
      </div>
    </div>
  )
}
