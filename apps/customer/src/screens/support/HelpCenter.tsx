// 107 · Help Center — the support hub: search, categories, popular articles. Categories/articles
// are help content (informational); the actions route to the real support flows.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, Search, CalendarCheck, Wallet, UserCircle, BadgePercent, RotateCcw, Wrench, ChevronRight, Ticket, MessageCircle, Phone, XCircle, ArrowUpCircle, HelpCircle } from 'lucide-react'
import { BottomNav } from '../../components/UI'
import { useStore } from '../../store'

const CATEGORIES = [
  { icon: <CalendarCheck size={20} />, t: 'Bookings & Services', n: 12, to: '/support/faqs?cat=Bookings' },
  { icon: <Wallet size={20} />, t: 'Payments & Wallet', n: 16, to: '/support/faqs?cat=Payments' },
  { icon: <UserCircle size={20} />, t: 'Account & Profile', n: 10, to: '/support/faqs?cat=Others' },
  { icon: <BadgePercent size={20} />, t: 'Membership & Offers', n: 14, to: '/support/faqs?cat=Services' },
  { icon: <RotateCcw size={20} />, t: 'Cancellations & Refunds', n: 9, to: '/support/refund-status' },
  { icon: <Wrench size={20} />, t: 'Technical Support', n: 8, to: '/support/ticket' },
]
const POPULAR = [
  { t: 'How to reschedule a booking?', to: '/support/faqs' },
  { t: 'How to use wallet balance?', to: '/support/faqs' },
  { t: 'Cancellation & refund policy', to: '/cancellation-policy' },
]

export default function HelpCenter() {
  const nav = useNavigate()
  const { user } = useStore()
  const [q, setQ] = useState('')
  const first = (user?.name || '').trim().split(' ')[0] || 'there'

  return (
    <div className="screen has-nav">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Help Center</h1></div>
        <button className="iconbtn" onClick={() => nav('/notifications')} aria-label="Notifications"><Bell size={18} /></button>
      </header>

      <div className="content">
        <div className="hc-hero">
          <div className="hc-hi">Hi {first} 👋</div>
          <div className="hc-hero-d">How can we help you today?</div>
          <form className="hc-search" onSubmit={(e) => { e.preventDefault(); nav(`/support/faqs${q ? `?q=${encodeURIComponent(q)}` : ''}`) }}>
            <Search size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for help topics..." />
          </form>
        </div>

        <div className="hc-sec">Browse by Category</div>
        <div className="hc-cats">
          {CATEGORIES.map((c) => (
            <button key={c.t} className="hc-cat" onClick={() => nav(c.to)}>
              <span className="hc-cat-ico">{c.icon}</span>
              <span className="hc-cat-t">{c.t}</span>
              <span className="hc-cat-n">{c.n} Articles</span>
            </button>
          ))}
        </div>

        <div className="hc-sec">Popular Articles</div>
        <div className="ws-card">
          {POPULAR.map((a) => (
            <button key={a.t} className="ws-row" onClick={() => nav(a.to)}>
              <span className="ws-ico"><Search size={15} /></span>
              <span className="ws-main"><span className="ws-t">{a.t}</span></span>
              <ChevronRight size={17} className="ws-chev" />
            </button>
          ))}
        </div>

        <div className="hc-sec">Get Support</div>
        <div className="ws-card">
          {[
            { icon: <Ticket size={17} />, t: 'Raise a Ticket', to: '/support/ticket' },
            { icon: <MessageCircle size={17} />, t: 'Live Chat', to: '/support/chat' },
            { icon: <RotateCcw size={17} />, t: 'Refund Status', to: '/support/refund-status' },
            { icon: <XCircle size={17} />, t: 'Cancel a Booking', to: '/support/cancellation' },
            { icon: <ArrowUpCircle size={17} />, t: 'Escalate an Issue', to: '/support/escalation' },
            { icon: <HelpCircle size={17} />, t: 'All FAQs', to: '/support/faqs' },
          ].map((r) => (
            <button key={r.t} className="ws-row" onClick={() => nav(r.to)}>
              <span className="ws-ico">{r.icon}</span>
              <span className="ws-main"><span className="ws-t">{r.t}</span></span>
              <ChevronRight size={17} className="ws-chev" />
            </button>
          ))}
        </div>

        <button className="hc-emergency" onClick={() => nav('/support/emergency')}>
          <Phone size={18} /> Emergency Support — 24/7
        </button>
      </div>
      <BottomNav />
    </div>
  )
}
