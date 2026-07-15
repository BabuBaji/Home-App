import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Star, Repeat, ChevronRight } from 'lucide-react'
import { Loading, useToast } from '../components/UI'
import { useStore } from '../store'
import { fetchService, fetchQuote, fetchServiceReviews } from '../api'
import type { ServiceDetail, Duration, Quote, Review } from '../types'

// Module 4 · #24–#31 — Service configuration wizard. Real durations/quote from the backend;
// Reviews shows REAL customer reviews for this service (fetchServiceReviews), falling back to the
// seeded sample reviews when none exist yet. Add-ons/gallery/frequency/instructions are UI-only.
// The final step hands off to the existing Book flow for real payment + tracking. No backend break.
type Step = 'duration' | 'addons' | 'frequency' | 'instructions' | 'gallery' | 'pricing' | 'reviews'
const ORDER: Step[] = ['duration', 'addons', 'frequency', 'instructions', 'gallery', 'pricing', 'reviews']
const TITLES: Record<Step, string> = {
  duration: 'Select Duration', addons: 'Add-ons', frequency: 'Select Frequency', instructions: 'Instructions',
  gallery: 'Before / After', pricing: 'Pricing Details', reviews: 'Reviews & Ratings',
}

const ADDONS = [
  { id: 'fridge', name: 'Inside Refrigerator Cleaning', sub: 'Deep cleaning & sanitization', price: 149 },
  { id: 'cabinet', name: 'Inside Cabinet Cleaning', sub: 'Kitchen cabinets & drawers', price: 149 },
  { id: 'balcony', name: 'Balcony Cleaning', sub: 'Sweep & mop balcony', price: 99 },
  { id: 'dishes', name: 'Dishes Washing', sub: 'Up to 30 utensils', price: 129 },
  { id: 'laundry', name: 'Laundry Washing & Folding', sub: 'Up to 10 clothes', price: 149 },
  { id: 'steam', name: 'Steam Cleaning', sub: 'High temperature steam', price: 199 },
]
const FREQ = [
  { id: 'one-time', label: 'One-time', sub: 'Book as per your need' },
  { id: 'daily', label: 'Daily', sub: 'Recommended for busy homes' },
  { id: 'alternate', label: 'Alternate Days', sub: 'Once in 2 days' },
  { id: 'weekly', label: 'Weekly', sub: 'Once a week' },
  { id: 'biweekly', label: 'Bi-weekly', sub: 'Once in 2 weeks' },
  { id: 'monthly', label: 'Monthly', sub: 'Once a month' },
]
const PREFS = [
  { id: 'equipment', label: 'Bring your own equipment' },
  { id: 'eco', label: 'Use eco-friendly products', on: true },
  { id: 'bleach', label: 'Do not use bleach' },
  { id: 'shoes', label: 'Ensure shoes are removed', on: true },
]
const GALLERY = [
  { room: 'Living Room', before: '/services/deepclean.jpg', after: '/services/mopping.jpg' },
  { room: 'Kitchen', before: '/services/kitchen.jpg', after: '/services/dishwashing.jpg' },
  { room: 'Bathroom', before: '/services/bathroom.jpg', after: '/services/sanitization.jpg' },
]
const POPULAR_DUR = 1

// Reviews carry either a seeded "2 days ago"-style date or a real ISO timestamp — normalise both.
function ago(d: string): string {
  const t = Date.parse(d)
  if (isNaN(t)) return d
  const diff = (Date.now() - t) / 1000
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 172800) return 'Yesterday'
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`
  return `${Math.floor(diff / 604800)} week${Math.floor(diff / 604800) > 1 ? 's' : ''} ago`
}

export default function ServiceFlow() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { pincode } = useStore()
  const [s, setS] = useState<ServiceDetail | null>(null)
  const [dur, setDur] = useState<Duration | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [realReviews, setRealReviews] = useState<Review[] | null>(null)
  const [addons, setAddons] = useState<Set<string>>(new Set(['balcony']))
  const [freq, setFreq] = useState('one-time')
  const [note, setNote] = useState('')
  const [prefs, setPrefs] = useState<Record<string, boolean>>(Object.fromEntries(PREFS.map((p) => [p.id, !!p.on])))
  const [gtab, setGtab] = useState<'before' | 'after'>('before')
  const [step, setStep] = useState<Step>('duration')

  useEffect(() => { fetchService(id!, pincode || undefined).then((d) => { setS(d); setDur(d.durations[0]) }).catch(() => toast('Could not load service')) }, [id, pincode])
  useEffect(() => { if (dur) fetchQuote([{ id: id!, durationId: dur.id }], undefined, pincode || undefined).then(setQuote).catch(() => {}) }, [dur, id, pincode])
  // Real customer reviews for this service (best-effort; empty until customers have reviewed).
  useEffect(() => { fetchServiceReviews(id!).then((r) => setRealReviews(r as any)).catch(() => setRealReviews([])) }, [id])

  const addonList = ADDONS.filter((a) => addons.has(a.id))
  const addonsTotal = addonList.reduce((n, a) => n + a.price, 0)
  const base = dur?.price ?? 0
  const subtotal = base + addonsTotal
  const fee = quote?.fee ?? 19
  const gst = Math.round((subtotal + fee) * 0.18)
  const total = subtotal + fee + gst
  const savings = (dur?.original ? dur.original - dur.price : 0)
  if (!s || !dur) return <div className="screen m2"><Loading /></div>

  // Prefer real customer reviews; fall back to the seeded samples only when none exist yet.
  const reviews: Review[] = (realReviews && realReviews.length) ? realReviews : s.reviews
  const usingReal = !!(realReviews && realReviews.length)
  // Rating distribution (5★→1★) computed from the reviews shown, not hardcoded.
  const dist = (() => {
    const c = [0, 0, 0, 0, 0]
    reviews.forEach((r) => { const i = 5 - Math.round(r.rating); if (i >= 0 && i < 5) c[i]++ })
    const t = reviews.length
    return t > 0 ? c.map((x) => Math.round((x / t) * 100)) : [70, 20, 6, 2, 2]
  })()

  const idx = ORDER.indexOf(step)
  const back = () => { if (idx === 0) nav(-1); else setStep(ORDER[idx - 1]) }
  const next = () => { if (idx < ORDER.length - 1) setStep(ORDER[idx + 1]) }
  const toggleAddon = (aid: string) => setAddons((p) => { const n = new Set(p); n.has(aid) ? n.delete(aid) : n.add(aid); return n })

  return (
    <div className="screen m2">
      <div className="ps-top">
        <button className="au-back" onClick={back} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>{TITLES[step]}</b><span style={{ width: 42 }} />
      </div>

      {/* ---------- 24 Duration ---------- */}
      {step === 'duration' && (<>
        <div className="content">
          <p className="sf-q">How many hours do you need?</p>
          {s.durations.map((d, i) => (
            <button key={d.id} className={`sf-opt ${dur.id === d.id ? 'on' : ''}`} onClick={() => setDur(d)}>
              <div className="grow">
                <div className="sf-opt-t">{d.label}{i === POPULAR_DUR && <span className="sf-pop">Popular</span>}</div>
                <div className="sf-opt-s">{durHint(d.label)}</div>
              </div>
              <div className="sf-opt-p">₹{d.price}</div>
              <span className={`sf-radio ${dur.id === d.id ? 'on' : ''}`}>{dur.id === d.id && <Check size={13} />}</span>
            </button>
          ))}
          <div className="sf-selrow"><span>Selected: {dur.label}</span><b>₹{dur.price}</b></div>
        </div>
        <div className="au-foot"><button className="au-btn" onClick={next}>Continue</button></div>
      </>)}

      {/* ---------- 25 Add-ons ---------- */}
      {step === 'addons' && (<>
        <div className="content">
          <p className="sf-sub">Enhance your cleaning</p>
          {ADDONS.map((a) => (
            <label key={a.id} className="sf-check">
              <input type="checkbox" checked={addons.has(a.id)} onChange={() => toggleAddon(a.id)} />
              <span className="sf-check-box"><Check size={13} /></span>
              <div className="grow"><b>{a.name}</b><small>{a.sub}</small></div>
              <span className="sf-check-p">₹{a.price}</span>
            </label>
          ))}
          <div className="sf-selrow"><span>Total Add-ons</span><b>₹{addonsTotal}</b></div>
        </div>
        <div className="au-foot"><button className="au-btn" onClick={next}>Continue</button></div>
      </>)}

      {/* ---------- 26 Frequency ---------- */}
      {step === 'frequency' && (<>
        <div className="content">
          <p className="sf-q">How often do you need this service?</p>
          {FREQ.map((f) => (
            <button key={f.id} className={`sf-opt ${freq === f.id ? 'on' : ''}`} onClick={() => setFreq(f.id)}>
              <span className="sf-freq-ic"><Repeat size={16} /></span>
              <div className="grow"><div className="sf-opt-t">{f.label}</div><div className="sf-opt-s">{f.sub}</div></div>
              <span className={`sf-radio ${freq === f.id ? 'on' : ''}`}>{freq === f.id && <Check size={13} />}</span>
            </button>
          ))}
        </div>
        <div className="au-foot"><button className="au-btn" onClick={next}>Continue</button></div>
      </>)}

      {/* ---------- 28 Instructions ---------- */}
      {step === 'instructions' && (<>
        <div className="content">
          <p className="sf-sub">Any special instructions?</p>
          <textarea className="sf-ta" rows={3} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Please focus more on kitchen and bathroom." />
          <div className="sf-count">{note.length}/200</div>
          <h3 className="sf-h">Additional Preferences</h3>
          {PREFS.map((p) => (
            <div key={p.id} className="sf-pref">
              <span className="grow">{p.label}</span>
              <button className={`sf-switch ${prefs[p.id] ? 'on' : ''}`} onClick={() => setPrefs((st) => ({ ...st, [p.id]: !st[p.id] }))}><span /></button>
            </div>
          ))}
        </div>
        <div className="au-foot"><button className="au-btn" onClick={next}>Continue</button></div>
      </>)}

      {/* ---------- 29 Before / After ---------- */}
      {step === 'gallery' && (<>
        <div className="content">
          <div className="sf-tabs">
            <button className={gtab === 'before' ? 'on' : ''} onClick={() => setGtab('before')}>Before</button>
            <button className={gtab === 'after' ? 'on' : ''} onClick={() => setGtab('after')}>After</button>
          </div>
          {GALLERY.map((g) => (
            <div key={g.room} className="sf-gal">
              <div className="sf-gal-imgs">
                <img src={g.before} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
                <span className="sf-gal-swap"><ChevronRight size={14} /></span>
                <img src={g.after} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} className={gtab === 'after' ? 'hi' : ''} />
              </div>
              <div className="sf-gal-room">{g.room}</div>
            </div>
          ))}
        </div>
        <div className="au-foot"><button className="au-btn" onClick={next}>Continue</button></div>
      </>)}

      {/* ---------- 30 Pricing ---------- */}
      {step === 'pricing' && (<>
        <div className="content">
          <p className="sf-sub">Review your selection</p>
          <div className="sf-price-row"><span>{s.name} ({dur.label})</span><b>₹{base}</b></div>
          {addonList.map((a) => <div key={a.id} className="sf-price-row"><span>{a.name} (Add-on)</span><b>₹{a.price}</b></div>)}
          <div className="sf-div" />
          <div className="sf-price-row"><span>Subtotal</span><b>₹{subtotal}</b></div>
          <div className="sf-price-row"><span>Platform Fee</span><b>₹{fee}</b></div>
          <div className="sf-price-row"><span>GST (18%)</span><b>₹{gst}</b></div>
          <div className="sf-div" />
          <div className="sf-price-row total"><span>Total Amount</span><b>₹{total}</b></div>
          {savings > 0 && <div className="sf-save"><Check size={15} /> You are saving ₹{savings} on this booking</div>}
        </div>
        <div className="au-foot"><button className="au-btn" onClick={next}>Continue to Reviews</button></div>
      </>)}

      {/* ---------- 31 Reviews (real customer reviews) ---------- */}
      {step === 'reviews' && (<>
        <div className="content">
          <div className="sf-rev-head">
            <div className="sf-rev-score">
              <b>{s.rating}</b>
              <div className="sf-rev-stars">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} className={n <= Math.round(s.rating) ? 'f' : ''} />)}</div>
              <small>({s.reviewsCount.toLocaleString()} ratings)</small>
            </div>
            <div className="sf-rev-bars">
              {dist.map((p, i) => (
                <div key={i} className="sf-bar-row"><span>{5 - i}</span><Star size={11} className="f" /><div className="sf-bar"><span style={{ width: `${p}%` }} /></div><em>{p}%</em></div>
              ))}
            </div>
          </div>
          {!usingReal && reviews.length > 0 && <div className="sf-rev-note">Sample reviews — real customer reviews appear here once bookings are rated.</div>}
          <div className="sf-reviews">
            {reviews.map((r, i) => (
              <div key={i} className="sf-review">
                <div className="sf-rev-top">
                  <span className="sf-rev-ava">{(r.name || 'C')[0]}</span>
                  <div className="grow"><b>{r.name || 'Customer'}</b><small>{ago(r.date)}{(r as any).pro ? ` · ${(r as any).pro}` : ''}</small></div>
                  <span className="sf-rev-rate">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={11} className={n <= r.rating ? 'f' : ''} />)}</span>
                </div>
                <p className="sf-rev-text">{r.text}</p>
              </div>
            ))}
            {reviews.length === 0 && <p className="ad2-hint">No reviews yet — be the first to review this service.</p>}
          </div>
        </div>
        <div className="au-foot"><button className="au-btn" onClick={() => nav(`/booking/${id}`, { state: { durationId: dur.id } })}>Continue to Book</button></div>
      </>)}
    </div>
  )
}

function durHint(label: string): string {
  const h = parseInt(label) || 1
  return h <= 1 ? 'Perfect for small apartments' : h === 2 ? 'Ideal for 2 BHK homes' : h <= 4 ? 'Best for deep cleaning' : 'Complete home cleaning'
}
