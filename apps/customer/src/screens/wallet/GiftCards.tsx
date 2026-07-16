// 71 · Gift Cards — cards you have redeemed. Redeeming credits Promo, so a card spends through
// the normal booking flow with no payment-path change.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Gift, ChevronRight } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { pushBackHandler } from '../../backStack'
import { fetchGiftCards, redeemGiftCard, type GiftCardInfo } from '../../api'
import { money2 } from '../../wallet'

const validTill = (s: string | null) =>
  s ? `Valid till ${new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : 'No expiry'

export default function GiftCards() {
  const nav = useNavigate()
  const toast = useToast()
  const [info, setInfo] = useState<GiftCardInfo | null>(null)
  const [add, setAdd] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => fetchGiftCards().then(setInfo).catch(() => setInfo({ balance: 0, active: 0, cards: [] }))
  useEffect(() => { load() }, [])
  useEffect(() => { if (add) return pushBackHandler(() => setAdd(false)) }, [add])

  async function redeem() {
    const c = code.trim().toUpperCase()
    if (!c || busy) return
    setBusy(true)
    try {
      const r = await redeemGiftCard(c)
      toast(`${money2(r.card.amount)} added from ${c}`)
      setAdd(false); setCode(''); await load()
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Gift Cards</h1></div>
      <button className="iconbtn" onClick={() => setAdd(true)} aria-label="Add gift card"><Plus size={18} /></button>
    </header>
  )
  if (!info) return <div className="screen">{head}<Loading /></div>

  const expired = (c: { balance: number; expires: string | null }) =>
    c.balance <= 0 || (!!c.expires && new Date(c.expires) < new Date())

  return (
    <div className="screen">
      {head}
      <div className="content">
        <div className="w-hero">
          <div className="w-hero-top">
            <div>
              <div className="w-hero-k">My Gift Card Balance</div>
              <div className="w-hero-v">{money2(info.balance)}</div>
              <div className="w-hero-sub">{info.active} Active Card{info.active === 1 ? '' : 's'}</div>
            </div>
            <Gift size={22} className="w-hero-ico" />
          </div>
        </div>

        <h2 className="ord-month-h" style={{ marginTop: 16 }}>My Gift Cards</h2>
        {info.cards.length === 0 ? (
          <div className="state"><div className="ico">🎁</div><h3>No gift cards yet</h3><p>Add a gift card code and its value lands in your wallet.</p></div>
        ) : (
          <div className="gc-list">
            {info.cards.map((c) => (
              <div key={c.id} className={`gc-card ${expired(c) ? 'off' : ''}`}>
                <span className="gc-ico"><Gift size={17} /></span>
                <div className="gc-main">
                  <div className="gc-code">{c.code}</div>
                  <div className="gc-valid">{expired(c) ? 'Used / expired' : validTill(c.expires)}</div>
                </div>
                <div className="gc-amt">{money2(c.balance)}</div>
              </div>
            ))}
          </div>
        )}

        <button className="gc-add" onClick={() => setAdd(true)}>
          <span>
            <span className="gc-add-k">Have a Gift Card?</span>
            <span className="gc-add-v">Add Gift Card</span>
          </span>
          <ChevronRight size={18} />
        </button>
      </div>

      {add && (
        <div className="sheet-wrap" onClick={() => setAdd(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-h">Add a gift card</div>
            <div className="gc-form">
              <div className="am-field sm">
                <input value={code} autoFocus placeholder="Enter code" maxLength={20}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              </div>
              <button className="btn full" disabled={!code.trim() || busy} onClick={redeem}>{busy ? 'Adding…' : 'Add Gift Card'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
