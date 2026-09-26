// 84 · Refer & Earn — real referral code + summary from /api/wallet/referrals. Replaces the older
// Module-7 refer screen at /refer. Sharing uses the device share sheet / deep links.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy, Share2, ChevronRight, MoreHorizontal } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { Capacitor } from '@capacitor/core'
import { fetchReferralEarnings, type ReferralInfo } from '../../api'
import { useStore } from '../../store'
import { t } from '../../i18n'

const money = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`

// Brand glyphs (lucide has no brand icons) — simple, recognisable marks in each brand's colour.
const WhatsAppLogo = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden="true">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.06c-.24.68-1.42 1.32-1.95 1.36-.5.05-1.13.07-1.83-.11a12.9 12.9 0 0 1-1.65-.61c-2.9-1.25-4.79-4.17-4.94-4.37-.14-.19-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.27-.29.58-.36.78-.36l.56.01c.18.01.42-.07.66.5.24.58.82 2.01.9 2.15.07.14.12.31.02.5-.1.19-.14.31-.29.48l-.43.5c-.14.14-.29.3-.12.58.17.29.75 1.23 1.6 2 1.1.98 2.02 1.29 2.31 1.43.29.14.46.12.63-.07.17-.19.72-.85.91-1.14.19-.29.39-.24.66-.14.27.1 1.7.8 1.99.95.29.14.48.22.55.34.07.12.07.68-.17 1.36Z" />
  </svg>
)
const InstagramLogo = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1.2" fill="#fff" stroke="none" />
  </svg>
)
const FacebookLogo = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden="true">
    <path d="M13.5 21v-7h2.3l.4-2.7h-2.7V9.5c0-.8.3-1.3 1.4-1.3h1.4V5.8c-.7-.1-1.4-.1-2.1-.1-2.1 0-3.5 1.3-3.5 3.6v2H8.3V14h2.3v7h2.9Z" />
  </svg>
)

export default function Referral() {
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useStore()
  const [info, setInfo] = useState<ReferralInfo | null>(null)

  useEffect(() => { fetchReferralEarnings().then(setInfo).catch(() => setInfo(null)) }, [])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={20} /></button>
      <div className="titles"><h1>{t('Refer & Earn')}</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!info) return <div className="screen">{head}<Loading /></div>

  const code = info.code || user?.referralCode || ''
  const reward = info.reward
  const msg = t('Get {amount} off your first HomeHelp booking! Use my code {code} when you sign up.', { amount: money(reward), code })

  function copy() { navigator.clipboard?.writeText(code).then(() => toast(t('Code copied!'))).catch(() => toast(code)) }
  async function share(via?: string) {
    if (via === 'whatsapp') { window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank'); return }
    if (via === 'instagram') { await copy(); toast(t('Code copied — paste it into Instagram')); return }
    if (via === 'facebook') { window.open(`https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(msg)}`, '_blank'); return }
    try {
      if (Capacitor.isNativePlatform()) { const { Share } = await import('@capacitor/share'); await Share.share({ title: t('Refer & Earn'), text: msg }) }
      else if (navigator.share) { await navigator.share({ title: t('Refer & Earn'), text: msg }) }
      else { await copy() }
    } catch { /* dismissed */ }
  }

  const STEPS = [
    { n: 1, t: t('Share your code'), d: t('with friends') },
    { n: 2, t: t('They book using'), d: t('your code') },
    { n: 3, t: t('You earn {amount}', { amount: money(reward) }), d: t('in your wallet') },
  ]
  const SHARE = [
    { k: 'whatsapp', label: 'WhatsApp', cls: 'wa', ico: <WhatsAppLogo /> },
    { k: 'instagram', label: 'Instagram', cls: 'ig', ico: <InstagramLogo /> },
    { k: 'facebook', label: 'Facebook', cls: 'fb', ico: <FacebookLogo /> },
    { k: 'more', label: t('More'), cls: 'more', ico: <MoreHorizontal size={20} /> },
  ]

  return (
    <div className="screen">
      {head}
      <div className="content">
        <div className="rf-hero">
          <div className="rf-hero-main">
            <div className="rf-hero-k">{t('Refer a friend &')}</div>
            <div className="rf-hero-v">{t('Earn {amount}', { amount: money(reward) })}</div>
            <div className="rf-hero-d">{t('Your friend gets {amount} OFF on their first booking!', { amount: money(reward) })}</div>
          </div>
          <div className="rf-hero-art" aria-hidden="true">🎁</div>
        </div>

        <div className="rf-code-k">{t('Your Referral Code')}</div>
        <div className="rf-code">
          <span className="rf-code-v">{code || '—'}</span>
          <button className="rf-code-copy" onClick={copy} aria-label={t('Copy code')}><Copy size={17} /></button>
        </div>

        <div className="rf-sec">{t('How it works?')}</div>
        <div className="rf-steps">
          {STEPS.map((s, i) => (
            <div key={s.n} className="rf-step">
              <span className="rf-step-n">{s.n}</span>
              <span className="rf-step-t">{s.t}</span>
              <span className="rf-step-d">{s.d}</span>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="rf-step-arrow" />}
            </div>
          ))}
        </div>

        <div className="rf-sec">{t('Share your link')}</div>
        <div className="rf-share">
          {SHARE.map((s) => (
            <button key={s.k} className="rf-share-btn" onClick={() => share(s.k)}>
              <span className={`rf-share-ico ${s.cls}`}>{s.ico}</span>
              <span className="rf-share-label">{s.label}</span>
            </button>
          ))}
        </div>

        <div className="rf-sec">{t('Referrals Summary')}</div>
        <button className="rf-summary" onClick={() => nav('/wallet/referrals')}>
          <div className="rf-sum-cell"><div className="rf-sum-k">{t('Total Referrals')}</div><div className="rf-sum-v">{info.total}</div></div>
          <div className="rf-sum-div" />
          <div className="rf-sum-cell"><div className="rf-sum-k">{t('Total Earnings')}</div><div className="rf-sum-v">{money(info.earned)}</div></div>
          <ChevronRight size={18} className="rf-sum-arrow" />
        </button>
      </div>

      <div className="w-foot">
        <button className="btn full" onClick={() => share()}><Share2 size={16} /> {t('Share & Earn')}</button>

      </div>
    </div>
  )
}
