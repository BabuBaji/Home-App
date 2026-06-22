import { useNavigate } from 'react-router-dom'
import { Header, FooterCTA } from '../components/UI'
import { useStore } from '../store'

export default function Cart() {
  const nav = useNavigate()
  const { cart, removeFromCart, subtotal } = useStore()

  if (cart.length === 0) {
    return (
      <div className="screen">
        <Header title="Your Booking" />
        <div className="state"><div className="ico">🛒</div><h3>No services added</h3><p>Browse services and add them to your booking.</p>
          <button className="btn" style={{ maxWidth: 220 }} onClick={() => nav('/home')}>Browse services</button></div>
      </div>
    )
  }

  return (
    <div className="screen">
      <Header title="Your Booking" subtitle={`${cart.length} service${cart.length === 1 ? '' : 's'}`} />
      <div className="content pad-cta">
        <div className="card pad">
          {cart.map((c) => (
            <div className="cart-row" key={c.id}>
              <span className="ci">{c.icon}</span>
              <div className="grow">
                <div className="cn">{c.name}</div>
                <div className="muted sm">{c.durationLabel} · {c.category}</div>
              </div>
              <div className="cp">₹{c.price}</div>
              <button className="rm" onClick={() => removeFromCart(c.id)}>✕</button>
            </div>
          ))}
        </div>

        <button className="add-more" onClick={() => nav('/home')}>+ Add more services</button>

        <div className="card pad mt">
          <div className="kv"><span className="k">Subtotal</span><span className="v">₹{subtotal}</span></div>
          <p className="muted sm" style={{ marginTop: 4 }}>Taxes, fees &amp; coupons applied at summary.</p>
        </div>
      </div>

      <FooterCTA>
        <div className="sumbar">
          <div className="grow"><div className="cnt">₹{subtotal}</div><div className="sub">{cart.length} service{cart.length === 1 ? '' : 's'}</div></div>
          <button className="btn" onClick={() => nav('/address')}>Select address →</button>
        </div>
      </FooterCTA>
    </div>
  )
}
