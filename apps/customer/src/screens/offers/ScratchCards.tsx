// 86 · Scratch & Win — there is no scratch-reward backend, so this is the promotional UI only:
// the reward categories and mechanics are shown, but scratching cannot grant a real prize until a
// backend exists. The card makes that explicit rather than faking a win.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Gift, Wallet, Percent, Sparkles, Star, ChevronRight } from 'lucide-react'
import { useToast } from '../../components/UI'

export default function ScratchCards() {
  const nav = useNavigate()
  const toast = useToast()
  const [scratched, setScratched] = useState(false)

  const WIN = [
    { icon: <Wallet size={17} />, t: 'Cashback', d: 'Upto ₹200' },
    { icon: <Percent size={17} />, t: 'Discounts', d: 'Upto 50%' },
    { icon: <Sparkles size={17} />, t: 'Free Service', d: 'Worth ₹300' },
    { icon: <Star size={17} />, t: 'Loyalty Points', d: 'Upto 500' },
  ]

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Scratch &amp; Win</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content">
        <div className="sc-hero">
          <div className="sc-hero-title">Scratch &amp; Win</div>
          <div className="sc-hero-sub">Exciting rewards!</div>
          <button className={`sc-card ${scratched ? 'done' : ''}`} onClick={() => { if (!scratched) { setScratched(true); toast('Scratch cards need a rewards backend to grant a prize.') } }}>
            {scratched ? (
              <span className="sc-card-result">Come back soon<small>Rewards are on the way</small></span>
            ) : (
              <span className="sc-card-face"><Gift size={34} /><span>Scratch Here</span></span>
            )}
          </button>
        </div>

        <div className="sc-win-h">You can win</div>
        <div className="sc-win">
          {WIN.map((w) => (
            <div key={w.t} className="sc-win-cell">
              <span className="sc-win-ico">{w.icon}</span>
              <span className="sc-win-t">{w.t}</span>
              <span className="sc-win-d">{w.d}</span>
            </div>
          ))}
        </div>

        <button className="sc-how" onClick={() => toast('Complete bookings to unlock scratch cards (coming soon).')}>
          How it works? <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
