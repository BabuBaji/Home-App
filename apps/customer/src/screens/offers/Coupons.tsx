// 82 · Coupons — real coupons from /api/coupons. Coupons carry no expiry date, so every one is
// "Valid" (never expires) and the Expired tab is genuinely empty rather than faked.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, HelpCircle, MapPin, Users, Gift, Star, Sparkles } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { fetchCoupons } from '../../api'
import type { Coupon } from '../../types'

type Tab = 'All' | 'Valid' | 'Expired'

// Tinted card variants, cycled like the mockup's purple / green / amber cards.
const TINTS = ['t-violet', 't-green', 't-amber']
const couponLabel = (c: Coupon) =>
  c.type === 'pct' ? `${c.value}% OFF${c.max ? ` up to ₹${c.max}` : ''}` : `Flat ₹${c.value} OFF`

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
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Coupons</h1></div>
      <button className="iconbtn" onClick={() => toast('Apply a coupon at checkout to save on your booking.')} aria-label="Help"><HelpCircle size={18} /></button>
    </header>
  )
  if (!coupons) return <div className="screen">{head}<Loading /></div>

  function apply(c: string) {
    const v = c.trim().toUpperCase()
    if (!v) return
    // No cart here — hand the code to checkout via clipboard, where the real validation runs.
    navigator.clipboard?.writeText(v).catch(() => {})
    toast(`${v} copied — apply it at checkout`)
  }

  const counts = { all: coupons.length, valid: coupons.length, expired: 0 }

  return (
    <div className="screen">
      {head}
      <div className="content">
        <div className="cp-entry">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter coupon code" maxLength={20} />
          <button className="cp-apply" onClick={() => apply(code)} disabled={!code.trim()}>Apply</button>
        </div>

        <div className="cp-tabs">
          {(['All', 'Valid', 'Expired'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t} ({t === 'All' ? counts.all : t === 'Valid' ? counts.valid : counts.expired})
            </button>
          ))}
        </div>

        {shown.length === 0 && (
          <div className="state"><div className="ico">🎟️</div><h3>No {tab === 'Expired' ? 'expired ' : ''}coupons</h3><p>Coupons you can use appear here.</p></div>
        )}

        <div className="cp-list">
          {shown.map((c, i) => (
            <div key={c.code} className={`cp-card ${TINTS[i % TINTS.length]} ${i === 0 ? 'best' : ''}`}>
              {i === 0 && <span className="cp-best">BEST</span>}
              <div className="cp-card-main">
                <div className="cp-code">{c.code}</div>
                <div className="cp-off">{couponLabel(c)}</div>
                <div className="cp-desc">{c.label}</div>
                <div className="cp-meta">Min. order ₹{c.min}{c.max ? ` · Up to ₹${c.max}` : ''}</div>
              </div>
              <button className="cp-card-btn" onClick={() => apply(c.code)}>Apply</button>
            </div>
          ))}
        </div>

        <div className="cp-more-h">More ways to save</div>
        <div className="cp-more">
          {[
            { icon: <MapPin size={18} />, label: 'Zone Offers', to: '/offers/zone' },
            { icon: <Users size={18} />, label: 'Refer & Earn', to: '/refer' },
            { icon: <Gift size={18} />, label: 'Scratch & Win', to: '/offers/scratch' },
            { icon: <Star size={18} />, label: 'Loyalty Points', to: '/offers/loyalty' },
            { icon: <Sparkles size={18} />, label: 'Auto Offers', to: '/offers/applied' },
          ].map((s) => (
            <button key={s.to} className="cp-more-tile" onClick={() => nav(s.to)}>
              <span className="cp-more-ico">{s.icon}</span>
              <span className="cp-more-label">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
