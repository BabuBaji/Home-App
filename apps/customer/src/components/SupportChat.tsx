import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Headset, Send, X } from 'lucide-react'
import { sendSupportChat } from '../api'
import { pushBackHandler } from '../backStack'

type Msg = { from: 'bot' | 'user'; text: string }

/* Built-in offline assistant scoped to HomeHelp. Scores the customer's message against
 * intent keyword sets and replies with the best match — instant, no network. Used as the
 * automatic fallback whenever the AI provider is unavailable or unconfigured. */
type Intent = { keys: string[]; reply: string; escalate?: boolean }
const INTENTS: Intent[] = [
  { keys: ['hi', 'hello', 'hey', 'hii', 'namaste', 'good morning', 'good evening'], reply: 'Hi! 👋 I’m the HomeHelp assistant. Ask me about cancellations, refunds, rescheduling, payments, invoices, tracking, or the services we offer — or tap a topic below.' },
  { keys: ['thank', 'thanks', 'thx'], reply: 'You’re welcome! 😊 Anything else I can help you with?' },
  { keys: ['cancel', 'cancellation', 'call off'], reply: 'Cancellation is free until an expert is assigned. Once the expert is on the way, a ₹50 fee applies. To cancel, open the booking and tap “Cancel”.' },
  { keys: ['reschedul', 'change time', 'change date', 'change slot', 'postpone', 'another day', 'different time'], reply: 'You can reschedule free of charge up to 1 hour before your selected slot — open the booking’s details and tap “Reschedule”.' },
  { keys: ['refund', 'money back', 'not refunded', 'return money'], reply: 'Eligible refunds are credited to your HomeHelp wallet, usually instantly. If you paid online, the amount (minus any cancellation fee) goes back to your wallet.' },
  { keys: ['invoice', 'bill', 'receipt', 'gst', 'tax'], reply: 'Your tax invoice appears on the booking’s details screen once the service is completed — tap “Invoice” to view, download or share it.' },
  { keys: ['track', 'where is', 'status', 'how far', 'reach', 'on the way', 'coming', 'eta', 'live'], reply: 'Open the booking and tap “Track” to see your expert’s live status and location on the map.' },
  { keys: ['pay', 'payment', 'upi', 'cash', 'card', 'gpay', 'phonepe', 'netbanking'], reply: 'We accept UPI (GPay/PhonePe), cards, wallet and cash. Online payments are charged at booking; cash is paid to the expert after the service.' },
  { keys: ['wallet', 'balance', 'credits', 'cashback'], reply: 'Your HomeHelp wallet holds refunds, cashback and referral rewards. Open Wallet from the top of the Home screen to see your balance and use it at checkout.' },
  { keys: ['price', 'cost', 'charge', 'how much', 'rate', 'expensive', 'fee'], reply: 'The price shown is for the duration you select. If the job needs more time, the expert confirms any change with you before continuing.' },
  { keys: ['how to book', 'book a', 'make a booking', 'place order', 'new booking', 'book service'], reply: 'From the Home screen, pick a service, choose Instant or Schedule, select a duration and slot, then confirm. An expert gets assigned and you can Track them live.' },
  { keys: ['what service', 'which service', 'services do', 'what do you offer', 'types of', 'cleaning', 'laundry', 'kitchen', 'bathroom', 'dusting', 'mopping', 'list of'], reply: 'We offer Sweeping & Mopping, Bathroom & Kitchen Cleaning, Dusting, Dishwashing, Laundry, Window & Fan Cleaning, Ironing, Deep Cleaning, Fridge Cleaning and more — browse them all on the Home screen.' },
  { keys: ['timing', 'hours', 'available', 'when can', 'how long', 'duration', 'slot', 'instant', 'same day'], reply: 'Book Instant (an expert reaches you in minutes) or Schedule for a preferred date & time. Durations start at 60 minutes — you pick the length at booking.' },
  { keys: ['area', 'pincode', 'serviceable', 'available in', 'my city', 'location', 'near me', 'cover'], reply: 'Serviceability depends on your pincode. Set your location at the top of the Home screen — if we’re live in your area you’ll see available services and slots.' },
  { keys: ['expert', 'worker', 'professional', 'verified', 'trust', 'safe', 'background', 'who will come', 'maid'], reply: 'All experts are background-verified and professionally trained. Once assigned, you’ll see your expert’s name and rating on the booking.' },
  { keys: ['rebook', 'book again', 'repeat', 'same expert'], reply: 'To book the same service again, open a past booking and tap “🔁 Rebook” — it starts a fresh booking with the same service.' },
  { keys: ['rate', 'rating', 'review', 'feedback', 'stars'], reply: 'After a service is completed, open the booking and tap “⭐ Rate” to share your rating and review. It won’t ask again once you’ve rated.' },
  { keys: ['coupon', 'offer', 'discount', 'promo', 'refer', 'referral', 'code'], reply: 'Apply coupons at checkout. You can also earn ₹150 for every friend you refer — find your referral code under Profile.' },
  { keys: ['account', 'profile', 'login', 'log in', 'logout', 'sign out', 'change number', 'change name', 'delete account'], reply: 'Manage your details from the Profile screen (top-right of Home) — addresses, payment methods, notifications and support all live there.' },
  { keys: ['history', 'past', 'previous', 'my bookings', 'order history'], reply: 'Tap “History” in the bottom bar to see all your past services, or “Bookings” for upcoming and completed ones.' },
  { keys: ['human', 'agent', 'talk to', 'contact', 'call', 'phone', 'complaint', 'complain', 'executive', 'customer care'], reply: 'I can connect you to our team. Reach us at support@homehelp.in, or tap below to raise a support request and we’ll get back to you.', escalate: true },
]
const GREETING = 'Hi! 👋 I’m the HomeHelp assistant. How can I help with your booking today? You can ask me anything about your services, or tap a topic below.'
const CHIPS = ['Cancel a booking', 'Refund', 'Reschedule', 'Payment', 'Invoice', 'Track order', 'Talk to a human']

function scoreIntent(q: string, it: Intent): number {
  let s = 0
  for (const k of it.keys) {
    if (k.includes(' ')) { if (k.split(' ').every((w) => q.includes(w))) s += 3 }
    else if (k.length <= 3) { if (q.includes(' ' + k + ' ')) s += 1 }
    else if (q.includes(k)) { s += k.length >= 5 ? 2 : 1 }
  }
  return s
}
function answer(raw: string): { text: string; escalate?: boolean } {
  const q = ' ' + raw.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' '
  let best: Intent | null = null, bestScore = 0
  for (const it of INTENTS) { const sc = scoreIntent(q, it); if (sc > bestScore) { bestScore = sc; best = it } }
  if (best && bestScore > 0) return { text: best.reply, escalate: best.escalate }
  return { text: 'I can help with your HomeHelp bookings — cancellations, refunds, rescheduling, payments, invoices, tracking, and the services we offer. Try asking about one of those, or tap a topic below.' }
}

export default function SupportChat({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'bot', text: GREETING }])
  const [input, setInput] = useState('')
  const [escalate, setEscalate] = useState(false)
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])
  // Android hardware back closes the chat (returns to the page underneath) instead of navigating.
  useEffect(() => pushBackHandler(() => closeRef.current()), [])

  async function send(raw: string) {
    const q = raw.trim()
    if (!q || busy) return
    const next: Msg[] = [...msgs, { from: 'user', text: q }]
    setMsgs(next)
    setInput('')
    setBusy(true)
    let reply = ''
    try {
      const r = await sendSupportChat(next.map((m) => ({ role: m.from, text: m.text })))
      if (r && r.reply && !r.fallback) reply = r.reply    // AI answered
    } catch { /* offline / provider down → use built-in bot */ }
    if (!reply) reply = answer(q).text
    setMsgs((m) => [...m, { from: 'bot', text: reply }])
    setEscalate(/\b(human|agent|talk to|contact|call|complaint|complain)\b/i.test(q))
    setBusy(false)
  }

  return (
    <div className="chat-modal">
      <div className="chat-head">
        <span className="ch-ic"><Headset size={20} /></span>
        <div className="ch-t"><b>Help &amp; Support</b><span>Typically replies instantly</span></div>
        <button className="ch-x" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="chat-body">
        {msgs.map((m, i) => <div key={i} className={`msg ${m.from}`}>{m.text}</div>)}
        {busy && <div className="msg bot typing"><span /><span /><span /></div>}
        {escalate && !busy && (
          <button className="msg bot chat-esc" onClick={() => nav('/support')}>🎧 Raise a support request ›</button>
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-chips">
        {CHIPS.map((c) => <button key={c} className="chat-chip" disabled={busy} onClick={() => send(c)}>{c}</button>)}
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input) }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question…" aria-label="Message" disabled={busy} />
        <button type="submit" aria-label="Send" disabled={busy}><Send size={18} /></button>
      </form>
    </div>
  )
}
