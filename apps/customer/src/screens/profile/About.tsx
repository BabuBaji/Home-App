// 94 · About — app identity + informational links. Version is read from the build.
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, Star, FileText, ScrollText, Heart, ChevronRight } from 'lucide-react'
import { useToast } from '../../components/UI'

const VERSION = '1.3.0'

export default function About() {
  const nav = useNavigate()
  const toast = useToast()

  const ROWS = [
    { icon: <Sparkles size={17} />, t: "What's New", d: 'See latest updates', on: () => toast(`You're on the latest version (${VERSION}).`) },
    { icon: <Star size={17} />, t: 'Rate Us', d: 'Share your feedback', on: () => toast('Thanks! Ratings open the store listing on a published build.') },
    { icon: <FileText size={17} />, t: 'Terms & Conditions', d: 'Read our terms', on: () => nav('/terms') },
    { icon: <ScrollText size={17} />, t: 'Licenses', d: 'Open source licenses', on: () => toast('Built with React, Vite, Capacitor and lucide-react.') },
  ]

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>About</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content">
        <div className="ab-brand">
          <span className="ab-logo">🏠</span>
          <div className="ab-name">HomeHelp</div>
          <div className="ab-ver">Version {VERSION}</div>
        </div>

        <div className="ws-card">
          {ROWS.map((r) => (
            <button key={r.t} className="ws-row" onClick={r.on}>
              <span className="ws-ico">{r.icon}</span>
              <span className="ws-main"><span className="ws-t">{r.t}</span><span className="ws-d">{r.d}</span></span>
              <ChevronRight size={17} className="ws-chev" />
            </button>
          ))}
        </div>

        <div className="ab-foot">
          <div className="ab-foot-made">Made with <Heart size={13} className="ab-heart" /> in India</div>
          <div className="ab-foot-c">© 2026 HomeHelp Services Pvt. Ltd.</div>
          <div className="ab-foot-c">All rights reserved.</div>
        </div>
      </div>
    </div>
  )
}
