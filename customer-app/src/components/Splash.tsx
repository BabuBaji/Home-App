import { useEffect, useState } from 'react'

/* Premium animated welcome / launch screen shown while the app boots. */
const MESSAGES = ['Warming things up', 'Finding experts near you', 'Almost ready']
const BUBBLES = [
  { l: '12%', s: 14, d: 0, dur: 5.5 }, { l: '24%', s: 9, d: 1.2, dur: 6.5 },
  { l: '46%', s: 18, d: 0.6, dur: 5 }, { l: '63%', s: 11, d: 2, dur: 7 },
  { l: '78%', s: 16, d: 0.3, dur: 5.8 }, { l: '88%', s: 8, d: 1.6, dur: 6.2 },
  { l: '36%', s: 7, d: 2.4, dur: 6.8 }, { l: '70%', s: 13, d: 1, dur: 5.3 },
]

export default function Splash({ visible }: { visible: boolean }) {
  const [msg, setMsg] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setMsg((m) => (m + 1) % MESSAGES.length), 750)
    return () => clearInterval(t)
  }, [])

  return (
    <div className={`splashx ${visible ? '' : 'splashx--hide'}`}>
      <div className="splashx-bg" />
      <div className="splashx-bubbles">
        {BUBBLES.map((b, i) => (
          <span key={i} style={{ left: b.l, width: b.s, height: b.s, animationDelay: `${b.d}s`, animationDuration: `${b.dur}s` }} />
        ))}
      </div>

      <div className="splashx-center">
        <div className="splashx-logo">
          <span className="splashx-ring r1" />
          <span className="splashx-ring r2" />
          <div className="splashx-badge">
            <svg viewBox="0 0 220 220" width="92" height="92" aria-hidden>
              <g className="spx-house">
                <path d="M110 56 L44 110 V178 a8 8 0 0 0 8 8 H168 a8 8 0 0 0 8 -8 V110 Z" fill="#fff" />
                <path d="M110 50 L34 116 a9 9 0 0 0 12 14 L110 74 L174 130 a9 9 0 0 0 12 -14 Z" fill="#fff" />
                <rect x="98" y="132" width="30" height="54" rx="6" fill="#0ea5a4" />
                <rect x="64" y="120" width="26" height="26" rx="5" fill="#0ea5a4" />
              </g>
              <path className="spx-spark" d="M156 78 c4 16 7 19 23 23 c-16 4 -19 7 -23 23 c-4 -16 -7 -19 -23 -23 c16 -4 19 -7 23 -23 Z" fill="#ff7a59" />
            </svg>
            <span className="splashx-shine" />
          </div>
        </div>

        <div className="splashx-brand">HomeHelp</div>
        <div className="splashx-tag">Trusted help, right at your home</div>

        <div className="splashx-bar"><span /></div>
        <div className="splashx-msg" key={msg}>{MESSAGES[msg]}…</div>
      </div>

      <div className="splashx-foot">⚡ Verified experts at your door in minutes</div>
    </div>
  )
}
