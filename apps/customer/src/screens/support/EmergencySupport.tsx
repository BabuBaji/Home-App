// 110 · Emergency Support — 24/7 contact options. Real tel:/WhatsApp deep links; Live Chat routes
// to the chat screen.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, Phone, MessageCircle, Siren } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { useToast } from '../../components/UI'
import { fetchBookings, getCachedPosition, raiseSos, supportContact } from '../../api'
import { isLive } from '../../orders'
import { t } from '../../i18n'

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
  const toast = useToast()
  // The company's real support lines (admin settings) — no placeholder numbers.
  const [contact, setContact] = useState<{ phone: string; whatsapp: string }>({ phone: '', whatsapp: '' })
  const [liveId, setLiveId] = useState<number | null>(null)
  const [sent, setSent] = useState(false)
  useEffect(() => {
    supportContact().then(setContact).catch(() => {})
    fetchBookings().then((bs) => { const b = bs.find((x) => isLive(x.status) && x.worker_id); if (b) setLiveId(b.id) }).catch(() => {})
  }, [])
  const PHONE = contact.phone.replace(/[^\d]/g, ''), WA = contact.whatsapp.replace(/[^\d]/g, '')
  // SOS during a job: alerts the ops control tower with the booking, expert and your location.
  async function sos() {
    if (!liveId) return
    try { const pos = getCachedPosition(); const r = await raiseSos(liveId, pos?.lat, pos?.lng); setSent(true); toast(r.message) }
    catch (e) { toast((e as Error).message) }
  }
  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <div className="titles"><h1>{t('Emergency Support')}</h1></div>
        <button className="iconbtn" onClick={() => nav('/notifications')} aria-label={t('Notifications')}><Bell size={18} /></button>
      </header>

      <div className="content">
        <div className="es-hero">
          <span className="es-hero-ico"><Phone size={26} /></span>
          <div className="es-hero-t">{t('Need Immediate Help?')}</div>
          <div className="es-hero-d">{t('Contact our 24/7 emergency support team for urgent issues.')}</div>
        </div>

        {liveId && (
          <button className="btn full" disabled={sent} onClick={sos} style={{ background: '#dc2626', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Siren size={18} /> {sent ? t('Safety team alerted') : t('SOS — alert the safety team now')}
          </button>
        )}
        <div className="es-actions">
          {PHONE && <button className="es-act" onClick={() => open(`tel:+${PHONE}`)}>
            <span className="es-act-ico call"><Phone size={20} /></span>
            <span className="es-act-t">{t('Call Now')}</span>
            <span className="es-act-d">{contact.phone}</span>
          </button>}
          {WA && <button className="es-act" onClick={() => open(`https://wa.me/${WA}`)}>
            <span className="es-act-ico wa"><MessageCircle size={20} /></span>
            <span className="es-act-t">WhatsApp</span>
            <span className="es-act-d">{t('Chat Now')}</span>
          </button>}
          <button className="es-act" onClick={() => nav('/support/chat')}>
            <span className="es-act-ico chat"><MessageCircle size={20} /></span>
            <span className="es-act-t">{t('Live Chat')}</span>
            <span className="es-act-d">{t('Start Chat')}</span>
          </button>
        </div>

        <div className="es-when-h">{t('When to use Emergency Support')}</div>
        <ul className="es-when">
          {WHEN.map((w) => <li key={w}>{t(w)}</li>)}
        </ul>

        <div className="es-avail">
          <div className="es-avail-t">{t('Our team is available 24/7')}</div>
          <div className="es-avail-d">{t('Average response time: 2-3 minutes')}</div>
        </div>
      </div>
    </div>
  )
}
