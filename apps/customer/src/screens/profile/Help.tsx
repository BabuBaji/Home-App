// 95 · Help & Support — routes to the real support chat / ticket flow that already exists.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, HelpCircle, MessageCircle, Phone, Mail, Ticket, ChevronRight, Headset } from 'lucide-react'
import { useToast } from '../../components/UI'
import SupportChat from '../../components/SupportChat'

export default function Help() {
  const nav = useNavigate()
  const toast = useToast()
  const [chat, setChat] = useState(false)

  const ROWS = [
    { icon: <HelpCircle size={18} />, t: 'Frequently Asked Questions', d: 'Find quick answers', on: () => nav('/support/faqs') },
    { icon: <MessageCircle size={18} />, t: 'Chat with Us', d: 'Start a conversation', live: true, on: () => nav('/support/chat') },
    { icon: <Phone size={18} />, t: 'Call Us', d: '+91 40 1234 5678 · 9 AM – 9 PM', on: () => { window.location.href = 'tel:+914012345678' } },
    { icon: <Mail size={18} />, t: 'Email Us', d: 'support@homehelp.in · reply within 24 hours', on: () => { window.location.href = 'mailto:support@homehelp.in' } },
    { icon: <Ticket size={18} />, t: 'Raise a Ticket', d: 'We will get back to you', on: () => nav('/support/ticket') },
  ]

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Help &amp; Support</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content">
        <div className="hp-hero">
          <div><div className="hp-hero-t">Need Help?</div><div className="hp-hero-d">We are here to assist you</div></div>
          <span className="hp-hero-art"><Headset size={26} /></span>
        </div>

        <div className="ws-card">
          {ROWS.map((r) => (
            <button key={r.t} className="ws-row" onClick={r.on}>
              <span className="ws-ico">{r.icon}</span>
              <span className="ws-main"><span className="ws-t">{r.t}{r.live && <span className="hp-live">Live</span>}</span><span className="ws-d">{r.d}</span></span>
              <ChevronRight size={17} className="ws-chev" />
            </button>
          ))}
        </div>
      </div>

      {chat && <SupportChat onClose={() => setChat(false)} />}
    </div>
  )
}
