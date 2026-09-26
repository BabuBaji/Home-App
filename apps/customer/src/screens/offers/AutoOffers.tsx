// 83 · Offers Applied — the offers that apply automatically for the customer's zone. The real
// per-booking savings ("you saved ₹120") are computed at checkout by the pricing engine; here,
// without a live cart, we surface the eligible offers and highlight the best one.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Gift } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { fetchOffers } from '../../api'
import { useStore } from '../../store'
import { t } from '../../i18n'
import type { Offer } from '../../types'

// Numeric value from an offer badge ("₹120 OFF" / "20% OFF") for ranking the best one.
const badgeValue = (o: Offer) => { const m = (o.badge || '').match(/(\d+)/); return m ? Number(m[1]) : 0 }

export default function AutoOffers() {
  const nav = useNavigate()
  const toast = useToast()
  const { pincode } = useStore()
  const [offers, setOffers] = useState<Offer[] | null>(null)

  useEffect(() => { fetchOffers(pincode || undefined).then(setOffers).catch(() => setOffers([])) }, [pincode])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={18} /></button>
      <div className="titles"><h1>{t('Offers Applied')}</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!offers) return <div className="screen">{head}<Loading /></div>

  const ranked = [...offers].sort((a, b) => badgeValue(b) - badgeValue(a))
  const best = ranked[0]
  const others = ranked.slice(1)

  function apply(code: string | null) {
    if (!code) { toast(t('This offer applies automatically at checkout.')); return }
    navigator.clipboard?.writeText(code).catch(() => {})
    toast(t('{code} copied — apply it at checkout', { code }))
  }

  return (
    <div className="screen">
      {head}
      <div className="content pad-cta">
        {best ? (
          <>
            <div className="ao-banner">
              <CheckCircle2 size={20} className="ao-banner-ico" />
              <div>
                <div className="ao-banner-t">{t('Best offer available')}</div>
                <div className="ao-banner-d">{t('{badge} with {title}', { badge: best.badge, title: best.title })}</div>
              </div>
            </div>

            <div className="ao-save">
              <div>
                <div className="ao-save-k">{t('Top Saving')}</div>
                <div className="ao-save-v">{best.badge}</div>
              </div>
              <span className="ao-save-art" aria-hidden="true"><Gift size={30} /></span>
            </div>

            <div className="ao-sec">{t('Best Offer')}</div>
            <div className="ao-row">
              <div className="ao-row-main">
                <div className="ao-row-code">{best.title}</div>
                <div className="ao-row-d">{best.subtitle}</div>
              </div>
              <span className="ao-applied">{t('Best')}</span>
            </div>

            {others.length > 0 && (
              <>
                <div className="ao-sec">{t('Other Eligible Offers')}</div>
                {others.map((o) => (
                  <div key={o.id} className="ao-row">
                    <div className="ao-row-main">
                      <div className="ao-row-code">{o.title}</div>
                      <div className="ao-row-d">{o.subtitle}</div>
                    </div>
                    <button className="ao-apply" onClick={() => apply(o.code)}>{t('Apply')}</button>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <div className="state"><div className="ico">🎁</div><h3>{t('No offers available')}</h3><p>{t('Offers for your area appear here.')}</p>
</div>
        )}
      </div>

      <div className="w-foot">
        <button className="btn full" onClick={() => nav('/home')}>{t('Browse services')}</button>
      </div>
    </div>
  )
}
