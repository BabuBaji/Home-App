// 108 · Raise a Ticket — real ticket creation via /api/tickets (category, sub-category, subject,
// description). Attachments are noted on the ticket text (upload storage is a separate feature).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Headset, Upload } from 'lucide-react'
import { useToast } from '../../components/UI'
import { createTicket } from '../../api'

const CATEGORIES: Record<string, string[]> = {
  'Bookings & Services': ['Reschedule', 'Worker not arrived', 'Service quality', 'Wrong service'],
  'Payments & Wallet': ['Payment failed', 'Wrong amount', 'Wallet not credited', 'Refund'],
  'Account & Profile': ['Login issue', 'Update details', 'Delete account'],
  'Technical Support': ['App not working', 'Bug report', 'Other'],
}

export default function RaiseTicket() {
  const nav = useNavigate()
  const toast = useToast()
  const [cat, setCat] = useState('')
  const [sub, setSub] = useState('')
  const [subject, setSubject] = useState('')
  const [desc, setDesc] = useState('')
  const [attach, setAttach] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!cat) return toast('Select a category')
    if (!subject.trim()) return toast('Add a short summary')
    if (!desc.trim()) return toast('Describe your issue')
    setBusy(true)
    try {
      const msg = attach ? `${desc}\n\n[Attachment: ${attach}]` : desc
      const t = await createTicket(cat, msg, { subcategory: sub || undefined, subject: subject.trim() })
      toast(`Ticket ${t.ref} raised`)
      nav(-1)
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Raise a Ticket</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content pad-cta">
        <div className="rt-hero">
          <div><div className="rt-hero-t">We're here to help!</div><div className="rt-hero-d">Raise a ticket and our team will get back to you.</div></div>
          <span className="rt-hero-art"><Headset size={24} /></span>
        </div>

        <label className="fm-field"><span>Category <b className="req">*</b></span>
          <select value={cat} onChange={(e) => { setCat(e.target.value); setSub('') }}>
            <option value="">Select Category</option>
            {Object.keys(CATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="fm-field"><span>Sub Category <b className="req">*</b></span>
          <select value={sub} onChange={(e) => setSub(e.target.value)} disabled={!cat}>
            <option value="">Select Sub Category</option>
            {(CATEGORIES[cat] || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="fm-field"><span>Issue Summary <b className="req">*</b></span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Briefly describe your issue" />
        </label>
        <label className="fm-field"><span>Description <b className="req">*</b></span>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value.slice(0, 1000))} rows={4} placeholder="Describe your issue in detail..." />
          <span className="rt-count">{desc.length}/1000</span>
        </label>

        <div className="rt-attach">
          <label>
            <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setAttach(e.target.files?.[0]?.name || '')} />
            <Upload size={18} />
            <span>{attach || 'Upload File or Take Photo'}</span>
            <small>JPG, PNG, PDF up to 10MB</small>
          </label>
        </div>
      </div>

      <div className="w-foot">
        <button className="btn full" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit Ticket'}</button>
      </div>
    </div>
  )
}
