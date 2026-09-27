import { useNavigate } from 'react-router-dom'
import { Header, FooterCTA } from '../components/UI'
import { useStore } from '../store'
import { useAppConfig } from '../appConfig'
import { t } from '../i18n'
import { useEffect, useState } from 'react'
import { getCartWhen, setCartWhen } from '../cartWhen'
import { fetchSlots } from '../api'
import { fmtDate } from '../components/Calendar'

export default function Cart() {
  const { promoCodes } = useAppConfig()
  const nav = useNavigate()
  const { cart, removeFromCart, subtotal, pincode } = useStore()
  const [when, setWhen] = useState(getCartWhen())   // the one slot for the whole visit
  // The cart may have sat closed for a while — ask the server whether the slot is still open (it
  // marks passed / too-soon / full slots unavailable). If not, drop it so a new one is picked.
  const [slotGone, setSlotGone] = useState(false)
  useEffect(() => {
    if (!when || !cart.length) return
    fetchSlots(fmtDate(new Date(when.date)), pincode || '', cart.map((c) => c.name).join(','))
      .then((r) => { const s = r.slots.find((x) => (x.min ?? x.hour * 60) === when.min); if (!s || !s.available) { setCartWhen(null); setWhen(null); setSlotGone(true) } })
      .catch(() => {})
  }, [])

  if (cart.length === 0) {
    return (
      <div className="screen">
        <Header title={t('Your Booking')} />
        <div className="state"><div className="ico">🛒</div><h3>{t('No services added')}</h3><p>{t('Browse services and add them to your booking.')}</p>
          <button className="btn" style={{ maxWidth: 220 }} onClick={() => nav('/home')}>{t('Browse services')}</button></div>
      </div>
    )
  }

  return (
    <div className="screen">
      <Header title={t('Your Booking')} subtitle={cart.length === 1 ? t('1 service') : t('{n} services', { n: cart.length })} />
      <div className="content pad-cta">
        <div className="card pad">
          {cart.map((c) => (
            <div className="cart-row" key={c.id}>
              <span className="ci">{c.icon}</span>
              <div className="grow">
                <div className="cn">{t(c.name)}</div>
                <div className="muted sm">{c.durationLabel} · {c.category}</div>
              </div>
              <div className="cp">₹{c.price}</div>
              <button className="rm" onClick={() => removeFromCart(c.id)}>✕</button>
            </div>
          ))}
        </div>

        {when && (
          <div className="card pad mt">
            <div className="kv"><span className="k">{t('Scheduled for')}</span><span className="v">{when.label}</span></div>
            <p className="muted sm" style={{ marginTop: 4 }}>{cart.length > 1 ? t('All {n} services in one visit.', { n: cart.length }) : t('Add more services to this same visit.')}</p>
            <button className="add-more" style={{ marginTop: 6 }} onClick={() => nav(`/booking/${cart[0].id}`, { state: { mode: 'schedule' } })}>{t('Change slot')}</button>
          </div>
        )}
        {slotGone && <p className="muted sm mt" style={{ color: '#b45309' }}>{t('Your earlier slot is no longer available. You can pick a new time at checkout.')}</p>}

        <button className="add-more" onClick={() => nav('/home')}>{t('+ Add more services')}</button>

        <div className="card pad mt">
          <div className="kv"><span className="k">{t('Subtotal')}</span><span className="v">₹{subtotal}</span></div>
          {promoCodes && <p className="muted sm" style={{ marginTop: 4 }}>{t('Coupons applied at summary.')}</p>}
        </div>
      </div>

      <FooterCTA>
        <div className="sumbar">
          <div className="grow"><div className="cnt">₹{subtotal}</div><div className="sub">{cart.length === 1 ? t('1 service') : t('{n} services', { n: cart.length })}</div></div>
          <button className="btn" onClick={() => nav('/booking/cart')}>{t('Continue →')}</button>
        </div>
      </FooterCTA>
    </div>
  )
}
