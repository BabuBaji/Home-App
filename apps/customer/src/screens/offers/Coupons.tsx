// 82 · Coupons — real coupons from /api/coupons. Coupons carry no expiry date, so every one is
// "Valid" (never expires) and the Expired tab is genuinely empty rather than faked.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HelpCircle, MapPin, Users, Sparkles } from 'lucide-react'
import { BottomNav, Loading, useToast } from '../../components/UI'
import { t } from '../../i18n'
import { fetchCoupons } from '../../api'
import type { Coupon } from '../../types'

type Tab = 'All' | 'Valid' | 'Expired'

// Tinted card variants, cycled like the mockup's purple / green / amber cards.
const TINTS = ['t-violet', 't-green', 't-amber']
const couponLabel = (c: Coupon) =>
  c.type === 'pct'
    ? (c.max ? t('{pct}% OFF up to ₹{max}', { pct: c.value, max: c.max }) : t('{pct}% OFF', { pct: c.value }))
    : t('Flat ₹{amount} OFF', { amount: c.value })

export default function Coupons() {
  const nav = useNavigate()
  const toast = useToast()
  const [coupons, setCoupons] = useState<Coupon[] | null>(null)
  const [tab, setTab] = useState<Tab>('All')
  const [code, setCode] = useState('')

  useEffect(() => { fetchCoupons().then(setCoupons).catch(() => setCoupons([])) }, [])

  // No expiry in the data → all coupons are valid, none expired.
  const shown = useMemo(() => tab === 'Expired' ? [] : (coupons || []), [coupons, tab])

  const head = (
    <header className="appbar ord-appbar">
      <span className="iconbtn ghost" />
      <div className="titles"><h1>{t('Offers')}</h1></div>
      <button className="iconbtn" onClick={() => toast(t('Apply a coupon at checkout to save on your booking.'))} aria-label={t('Help')}><HelpCircle size={18} /></button>
    </header>
  )
  if (!coupons) return <div className="screen has-nav">{head}<Loading /><BottomNav /></div>

  function apply(c: string) {
    const v = c.trim().toUpperCase()
    if (!v) return
    // No cart here — hand the code to checkout via clipboard, where the real validation runs.
    navigator.clipboard?.writeText(v).catch(() => {})
    toast(t('{code} copied — apply it at checkout', { code: v }))
  }

  const counts = { all: coupons.length, valid: coupons.length, expired: 0 }

  return (
    <div className="screen has-nav">
      {head}
      <div className="content">
        <div className="cp-entry">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('Enter coupon code')} maxLength={20} />
          <button className="cp-apply" onClick={() => apply(code)} disabled={!code.trim()}>{t('Apply')}</button>
        </div>

        <div className="cp-tabs">
          {(['All', 'Valid', 'Expired'] as Tab[]).map((tb) => (
            <button key={tb} className={tab === tb ? 'active' : ''} onClick={() => setTab(tb)}>
              {t(tb)} ({tb === 'All' ? counts.all : tb === 'Valid' ? counts.valid : counts.expired})
            </button>
          ))}
        </div>

        {shown.length === 0 && (
          <div className="state"><div className="ico">🎟️</div><h3>{tab === 'Expired' ? t('No expired coupons') : t('No coupons')}</h3><p>{t('Coupons you can use appear here.')}</p></div>
        )}

        <div className="cp-list">
          {shown.map((c, i) => (
            <div key={c.code} className={`cp-card ${TINTS[i % TINTS.length]} ${i === 0 ? 'best' : ''}`}>
              {i === 0 && <span className="cp-best">{t('BEST')}</span>}
              <div className="cp-card-main">
                <div className="cp-code">{c.code}</div>
                <div className="cp-off">{couponLabel(c)}</div>
                <div className="cp-desc">{c.label}</div>
                <div className="cp-meta">{t('Min. order ₹{amount}', { amount: c.min })}{c.max ? ` · ${t('Up to ₹{amount}', { amount: c.max })}` : ''}</div>
              </div>
              <button className="cp-card-btn" onClick={() => apply(c.code)}>{t('Apply')}</button>

            </div>
          ))}
        </div>

        <div className="cp-more-h">{t('More ways to save')}</div>
        <div className="cp-more">
          {[
            { icon: <MapPin size={18} />, label: 'Zone Offers', to: '/offers/zone' },
            { icon: <Users size={18} />, label: 'Refer & Earn', to: '/refer' },
            { icon: <Sparkles size={18} />, label: 'Auto Offers', to: '/offers/applied' },
          ].map((s) => (
            <button key={s.to} className="cp-more-tile" onClick={() => nav(s.to)}>
              <span className="cp-more-ico">{s.icon}</span>
              <span className="cp-more-label">{t(s.label)}</span>
            </button>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
