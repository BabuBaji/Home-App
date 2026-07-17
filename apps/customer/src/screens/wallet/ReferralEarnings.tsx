// 70 · Referral Earnings — REFERRAL_BONUS credits + who you actually referred.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, Share2 } from 'lucide-react'
import { Loading } from '../../components/UI'
import { fetchReferralEarnings, type ReferralInfo } from '../../api'
import { dayStamp, money2 } from '../../wallet'

export default function ReferralEarnings() {
  const nav = useNavigate()
  const [info, setInfo] = useState<ReferralInfo | null>(null)
  useEffect(() => { fetchReferralEarnings().then(setInfo).catch(() => setInfo(null)) }, [])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Referral Earnings</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!info) return <div className="screen">{head}<Loading /></div>

  return (
    <div className="screen">
      {head}
      <div className="content pad-cta">
        <div className="w-hero">
          <div className="w-hero-top">
            <div>
              <div className="w-hero-k">Total Earnings</div>
              <div className="w-hero-v">{money2(info.earned)}</div>
            </div>
            <Users size={22} className="w-hero-ico" />
          </div>
          <div className="w-hero-split">
            <div><div className="w-hero-sk">Total Referrals</div><div className="w-hero-sv">{info.total}</div></div>
            <div><div className="w-hero-sk">Successful Referrals</div><div className="w-hero-sv">{info.successful}</div></div>
          </div>
        </div>

        <h2 className="ord-month-h" style={{ marginTop: 16 }}>Earnings History</h2>
        {info.history.length === 0 ? (
          <div className="state">
            <div className="ico">👥</div>
            <h3>No referral earnings yet</h3>
            <p>You earn {money2(info.reward)} when a friend you invited finishes their first booking.</p>
          </div>
        ) : (
          <div className="wt-list">
            {info.history.map((h) => (
              <div key={h.id} className="wt-row">
                <span className="wt-ico credit"><Users size={15} /></span>
                <div className="wt-main">
                  <div className="wt-title">{h.title}</div>
                  <div className="wt-when">{dayStamp(h.created)}</div>
                </div>
                <div className="wt-right">
                  <div className="wt-amt credit">+ {money2(h.amount)}</div>
                  <div className="wt-tag credit">Completed</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="w-foot">
        <button className="btn full" onClick={() => nav('/refer')}><Share2 size={16} /> Refer Friends &amp; Earn</button>
      </div>
    </div>
  )
}
