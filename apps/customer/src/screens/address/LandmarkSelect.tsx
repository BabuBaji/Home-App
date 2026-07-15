import { useState } from 'react'
import { ArrowLeft, Search, Check, MapPin } from 'lucide-react'

// Module 3 · #19 — Add Landmark (overlay). Pick a popular landmark or type a custom one.
const POPULAR = [
  'Near City Center Mall', 'Opp. KBR Park', 'Beside ICICI Bank',
  'Near Banjara Hills Metro Station', 'Opp. GVK One Mall', 'Lane Next to HDFC Bank',
]

export default function LandmarkSelect({ initial, onDone, onClose }:
  { initial?: string; onDone: (v: string) => void; onClose: () => void }) {
  const [q, setQ] = useState(initial || '')
  const [sel, setSel] = useState(initial && POPULAR.includes(initial) ? initial : '')
  const list = q.trim() ? POPULAR.filter((l) => l.toLowerCase().includes(q.toLowerCase())) : POPULAR
  const value = sel || q.trim()

  return (
    <div className="ad2-overlay m2">
      <div className="ps-top">
        <button className="au-back" onClick={onClose} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Add Landmark</b><span style={{ width: 42 }} />
      </div>
      <div className="content">
        <div className="au-search"><Search size={18} /><input value={q} onChange={(e) => { setQ(e.target.value); setSel('') }} placeholder="Search or add landmark" /></div>
        <div className="au-eyebrow">Popular Landmarks</div>
        <div className="ad2-list">
          {list.map((l) => (
            <button key={l} className="ad2-opt" onClick={() => { setSel(l); setQ(l) }}>
              <span className="ad2-opt-ic"><MapPin size={16} /></span>
              <b className="grow">{l}</b>
              <span className={`au-radio ${value === l ? 'on' : ''}`}>{value === l && <Check size={13} />}</span>
            </button>
          ))}
          {list.length === 0 && q.trim() && <p className="ad2-hint">Save “{q.trim()}” as your landmark.</p>}
        </div>
      </div>
      <div className="au-foot">
        <button className="au-btn" onClick={() => onDone(value)} disabled={!value}>Save Landmark</button>
      </div>
    </div>
  )
}
