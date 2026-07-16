// 114 · FAQs — searchable, category-filtered help content. The Q&A is informational help copy;
// tapping a question expands its answer, and Contact Support routes to the ticket flow.
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Search, SlidersHorizontal, ChevronDown, MessageCircleQuestion } from 'lucide-react'

const CATS = ['All', 'Bookings', 'Payments', 'Services', 'Others']
const FAQS: { q: string; a: string; cat: string }[] = [
  { cat: 'Bookings', q: 'How do I book a service?', a: 'Open Home, pick a service, choose a date/time and address, then confirm and pay. Your booking appears under Bookings.' },
  { cat: 'Bookings', q: 'Can I reschedule my booking?', a: 'Yes — open the booking, tap the ⋮ menu and choose Reschedule. You can move it while it is still upcoming.' },
  { cat: 'Bookings', q: 'How do I cancel my booking?', a: 'Open the booking, tap ⋮ → Cancel Booking. Cancellation charges depend on how close it is to the slot; the terms are shown before you confirm.' },
  { cat: 'Bookings', q: 'What is the cancellation policy?', a: 'Free cancellation well before the slot; a partial or full fee applies closer to it or after the expert is on the way. See the full policy from the cancel screen.' },
  { cat: 'Payments', q: 'How do I use my wallet balance?', a: 'Wallet balance is applied automatically at checkout. Promo credit is used first, then cash.' },
  { cat: 'Payments', q: 'How do I add money to wallet?', a: 'Wallet → Add Money, choose an amount and a method (UPI, card, net banking), then pay.' },
  { cat: 'Payments', q: 'When will I receive my refund?', a: 'Refunds are credited to your HomeHelp wallet, usually instantly after a cancellation. Track it under Refund Status.' },
  { cat: 'Others', q: 'How can I contact support?', a: 'Use Live Chat, raise a ticket, or call our 24/7 emergency line from the Help Center.' },
  { cat: 'Services', q: 'Is there any membership plan?', a: 'Membership plans with extra discounts are rolling out. Watch the Offers section for updates.' },
  { cat: 'Others', q: 'How do I refer a friend?', a: 'Wallet → Refer & Earn. Share your code; you earn when your friend completes their first booking.' },
]

export default function FAQs() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [cat, setCat] = useState(CATS.includes(params.get('cat') || '') ? (params.get('cat') as string) : 'All')
  const [open, setOpen] = useState<number | null>(null)

  const shown = useMemo(() => FAQS.filter((f) =>
    (cat === 'All' || f.cat === cat) && (!q.trim() || (f.q + f.a).toLowerCase().includes(q.toLowerCase()))), [q, cat])

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Frequently Asked Questions</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content">
        <div className="cp-entry">
          <span className="faq-search"><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search FAQs..." /></span>
          <button className="faq-filter" aria-label="Filter"><SlidersHorizontal size={17} /></button>
        </div>

        <div className="ord-chips">
          {CATS.map((c) => <button key={c} className={`ord-chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>

        {shown.length === 0 && <div className="state"><div className="ico">🔍</div><h3>No matching FAQs</h3><p>Try a different search or category.</p></div>}

        <div className="faq-list">
          {shown.map((f, i) => (
            <div key={f.q} className={`faq-item ${open === i ? 'open' : ''}`}>
              <button className="faq-q" onClick={() => setOpen(open === i ? null : i)}>
                <span>{f.q}</span><ChevronDown size={18} className="faq-chev" />
              </button>
              {open === i && <div className="faq-a">{f.a}</div>}
            </div>
          ))}
        </div>

        <div className="faq-contact">
          <div>
            <div className="faq-contact-t">Can't find your answer?</div>
            <div className="faq-contact-d">Our support team is here to help you.</div>
            <button className="faq-contact-btn" onClick={() => nav('/support/ticket')}>Contact Support</button>
          </div>
          <span className="faq-contact-art"><MessageCircleQuestion size={30} /></span>
        </div>
      </div>
    </div>
  )
}
