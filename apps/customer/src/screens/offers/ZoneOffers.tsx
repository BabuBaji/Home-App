// 85 · Zone Offers — offers for the customer's own zone. The pincode (from their default address,
// held in the store) resolves to a zone server-side, and /api/offers returns exactly that zone's
// admin-configured campaigns/coupons. Change location → different zone → different offers.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Percent, ChevronRight } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { fetchOffers, fetchMe } from '../../api'
import { useStore } from '../../store'
import type { Offer, Address } from '../../types'

export default function ZoneOffers() {
  const nav = useNavigate()
  const toast = useToast()
  const { pincode } = useStore()
  const [offers, setOffers] = useState<Offer[] | null>(null)
  const [addr, setAddr] = useState<Address | null>(null)

  useEffect(() => { fetchOffers(pincode || undefined).then(setOffers).catch(() => setOffers([])) }, [pincode])
  useEffect(() => { fetchMe().then(({ addresses }) => setAddr(addresses.find((a) => a.is_default) || addresses[0] || null)).catch(() => {}) }, [])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Zone Offers</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!offers) return <div className="screen">{head}<Loading /></div>

  // Best available label: apartment/landmark + city, else city, else the zone pincode.
  const area = [addr?.apartment || addr?.landmark, addr?.city].filter(Boolean).join(', ')
    || addr?.city || (pincode ? `Pincode ${pincode}` : 'your area')

  function apply(code: string | null) {
    if (!code) { toast('This offer applies automatically at checkout.'); return }
    navigator.clipboard?.writeText(code).catch(() => {})
    toast(`${code} copied — apply it at checkout`)
  }

  return (
    <div className="screen">
      {head}
      <div className="content">
        <button className="zo-loc" onClick={() => nav('/locations')}>
          <MapPin size={16} className="zo-loc-pin" />
          <span className="zo-loc-main">
            <span className="zo-loc-k">Your Location</span>
            <span className="zo-loc-v">{area}</span>
          </span>
          <span className="zo-loc-change">Change</span>
        </button>

        <div className="zo-banner">
          <div>
            <div className="zo-banner-t">Special offers in your zone!</div>
            <div className="zo-banner-d">Save more on services near you.</div>
          </div>
          <span className="zo-banner-ico"><Percent size={20} /></span>
        </div>

        {offers.length === 0 && (
          <div className="state"><div className="ico">🏷️</div><h3>No offers in your zone yet</h3><p>Check back soon — new offers appear here.</p></div>
        )}

        <div className="zo-list">
          {offers.map((o) => (
            <div key={o.id} className="zo-card">
              <div className="zo-card-main">
                <div className="zo-code">{o.title}</div>
                <div className="zo-off">{o.subtitle}</div>
                <div className="zo-tag">{o.type === 'zone' ? 'Zone offer' : o.type === 'customer' ? 'For you' : 'Coupon'}</div>
              </div>
              <button className="zo-apply" onClick={() => apply(o.code)}>Apply</button>
            </div>
          ))}
        </div>

        {offers.length > 0 && (
          // This screen already lists every offer for the zone, so "View All" stays here rather
          // than navigating away (it used to wrongly open the Coupons page).
          <button className="zo-more" onClick={() => toast('Showing all offers in your zone')}>
            View All Zone Offers <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
