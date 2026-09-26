// 95 · Help & Support — routes to the real support chat / ticket flow that already exists.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, HelpCircle, MessageCircle, Phone, Ticket, ChevronRight, Headset } from 'lucide-react'
import { useBack } from '../../components/UI'
import { supportContact } from '../../api'
import SupportChat from '../../components/SupportChat'
import { t } from '../../i18n'

export default function Help() {
  const nav = useNavigate()
  const back = useBack('/profile')
  const [chat, setChat] = useState(false)
  // The real support line + WhatsApp from the admin settings; a row only shows when one is set.
  const [contact, setContact] = useState<{ phone: string; whatsapp: string }>({ phone: '', whatsapp: '' })
  useEffect(() => { supportContact().then(setContact).catch(() => {}) }, [])
  const digits = (n: string) => n.replace(/[^0-9]/g, '')

  const ROWS = [
    { icon: <HelpCircle size={18} />, t: 'Frequently Asked Questions', d: 'Find quick answers', on: () => nav('/support/faqs') },
    { icon: <MessageCircle size={18} />, t: 'Chat with Us', d: 'Start a conversation', live: true, on: () => nav('/support/chat') },
    ...(contact.phone ? [{ icon: <Phone size={18} />, t: 'Call Us', d: 'Talk to our support team', on: () => { window.location.href = `tel:+${digits(contact.phone)}` } }] : []),
    ...(contact.whatsapp ? [{ icon: <MessageCircle size={18} />, t: 'WhatsApp', d: 'Message our support team', on: () => { window.open(`https://wa.me/${digits(contact.whatsapp)}`, '_blank') } }] : []),
    { icon: <Ticket size={18} />, t: 'Raise a Ticket', d: 'We will get back to you', on: () => nav('/support/ticket') },
  ] as { icon: JSX.Element; t: string; d: string; live?: boolean; on: () => void }[]

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={back} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <div className="titles"><h1>{t('Help & Support')}</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content">
        <div className="hp-hero">
          <div><div className="hp-hero-t">{t('Need Help?')}</div><div className="hp-hero-d">{t('We are here to assist you')}</div></div>
          <span className="hp-hero-art"><Headset size={26} /></span>
        </div>

        <div className="ws-card">
          {ROWS.map((r) => (
            <button key={r.t} className="ws-row" onClick={r.on}>
              <span className="ws-ico">{r.icon}</span>
              <span className="ws-main"><span className="ws-t">{t(r.t)}{r.live && <span className="hp-live">{t('Live')}</span>}</span><span className="ws-d">{t(r.d)}</span></span>
              <ChevronRight size={17} className="ws-chev" />
            </button>
          ))}
        </div>
      </div>

      {chat && <SupportChat onClose={() => setChat(false)} />}
    </div>
  )
}
