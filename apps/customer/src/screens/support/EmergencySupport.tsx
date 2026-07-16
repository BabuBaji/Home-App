// 110 · Emergency Support — 24/7 contact options. Real tel:/WhatsApp deep links; Live Chat routes
// to the chat screen.
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, Phone, MessageCircle } from 'lucide-react'
import { Capacitor } from '@capacitor/core'

const PHONE = '18001234567'   // 24/7 emergency line
const WA = '911800123456'     // WhatsApp, no '+'

async function open(url: string) {
  if (Capacitor.isNativePlatform()) { try { const { AppLauncher } = await import('@capacitor/app-launcher'); await AppLauncher.openUrl({ url }); return } catch { /* fall through */ } }
  window.location.href = url
}

const WHEN = [
  'Worker not arrived for long time',
  'Safety or security concerns',
  'Service in progress issues',
  'Urgent cancellations',
  'Any other urgent help',
]

export default function EmergencySupport() {
  const nav = useNavigate()
  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Emergency Support</h1></div>
        <button className="iconbtn" onClick={() => nav('/notifications')} aria-label="Notifications"><Bell size={18} /></button>
      </header>

      <div className="content">
        <div className="es-hero">
          <span className="es-hero-ico"><Phone size={26} /></span>
          <div className="es-hero-t">Need Immediate Help?</div>
          <div className="es-hero-d">Contact our 24/7 emergency support team for urgent issues.</div>
        </div>

        <div className="es-actions">
          <button className="es-act" onClick={() => open(`tel:+${PHONE}`)}>
            <span className="es-act-ico call"><Phone size={20} /></span>
            <span className="es-act-t">Call Now</span>
            <span className="es-act-d">1800-123-4567</span>
          </button>
          <button className="es-act" onClick={() => open(`https://wa.me/${WA}`)}>
            <span className="es-act-ico wa"><MessageCircle size={20} /></span>
            <span className="es-act-t">WhatsApp</span>
            <span className="es-act-d">Chat Now</span>
          </button>
          <button className="es-act" onClick={() => nav('/support/chat')}>
            <span className="es-act-ico chat"><MessageCircle size={20} /></span>
            <span className="es-act-t">Live Chat</span>
            <span className="es-act-d">Start Chat</span>
          </button>
        </div>

        <div className="es-when-h">When to use Emergency Support</div>
        <ul className="es-when">
          {WHEN.map((w) => <li key={w}>{w}</li>)}
        </ul>

        <div className="es-avail">
          <div className="es-avail-t">Our team is available 24/7</div>
          <div className="es-avail-d">Average response time: 2-3 minutes</div>
        </div>
      </div>
    </div>
  )
}
