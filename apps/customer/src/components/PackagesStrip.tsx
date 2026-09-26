import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package } from 'lucide-react'
import { useStore } from '../store'
import { fetchPackages, setActivePackage, type ServicePackage } from '../api'
import { t } from '../i18n'

/* "Save with packages" on Home: bundles sold in the customer's zone, priced by the server. Booking
   one fills the cart with exactly its services; the package discount then shows in the quote. */
export default function PackagesStrip() {
  const nav = useNavigate()
  const { clearCart, addToCart, pincode } = useStore()
  const [list, setList] = useState<ServicePackage[]>([])
  useEffect(() => { fetchPackages().then(setList).catch(() => setList([])) }, [pincode])
  if (!list.length) return null
  const book = (p: ServicePackage) => {
    clearCart()
    for (const it of p.items) addToCart(it)
    setActivePackage(p.id)
    nav('/cart')
  }
  return (<>
    <div className="hd-sec-head"><h3>{t('Save with packages')}</h3></div>
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
      {list.map((p) => (
        <button key={p.id} className="card" onClick={() => book(p)} style={{ minWidth: 220, textAlign: 'left', padding: 12, border: '1px solid var(--line, #eee)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Package size={16} /><b>{p.name}</b></div>
          <div className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>{p.services.join(' · ')}</div>
          <div><b>₹{p.price}</b> {p.save > 0 && <><s className="muted" style={{ fontSize: 12 }}>₹{p.was}</s> <span style={{ color: '#16a34a', fontSize: 12 }}>{t('Save ₹{amt}', { amt: p.save })}</span></>}</div>
        </button>
      ))}
    </div>
  </>)
}
