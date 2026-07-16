// 65 · Download Receipt — confirmation + re-download / share of the tax invoice.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Share2 } from 'lucide-react'
import { Loading, useToast } from '../components/UI'
import { fetchBooking, fetchInvoiceInfo, type InvoiceInfo } from '../api'
import { downloadInvoice, shareInvoice } from '../invoiceDoc'
import type { Booking } from '../types'

export default function Receipt() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [b, setB] = useState<Booking | null>(null)
  const [inv, setInv] = useState<InvoiceInfo | null>(null)
  const [busy, setBusy] = useState<'' | 'save' | 'share'>('')

  useEffect(() => { fetchBooking(Number(id)).then(setB).catch(() => {}) }, [id])
  useEffect(() => { fetchInvoiceInfo().then(setInv).catch(() => {}) }, [])

  // Download writes the file onto the device — no share sheet.
  async function save() {
    if (!b || busy) return
    setBusy('save')
    const at = await downloadInvoice(b, inv)
    setBusy('')
    toast(at ? `Receipt saved to ${at}` : 'Could not save the receipt')
  }

  // Share hands it to the OS picker so it can go to any app or contact.
  async function send() {
    if (!b || busy) return
    setBusy('share')
    const ok = await shareInvoice(b, inv)
    setBusy('')
    if (!ok) toast('Could not share the receipt')
  }

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles" />
      <span className="iconbtn ghost" />
    </header>
  )

  if (!b) return <div className="screen">{head}<Loading /></div>

  return (
    <div className="screen">
      {head}
      <div className="content rc-wrap">
        <div className="rc-art" aria-hidden="true">
          <svg viewBox="0 0 120 120" className="rc-svg">
            <rect x="24" y="14" width="62" height="84" rx="8" fill="#fff" stroke="var(--primary)" strokeWidth="3" />
            <rect x="36" y="32" width="38" height="4" rx="2" fill="var(--primary-light)" />
            <rect x="36" y="46" width="38" height="4" rx="2" fill="var(--primary-light)" />
            <rect x="36" y="60" width="26" height="4" rx="2" fill="var(--primary-light)" />
            <circle cx="82" cy="80" r="22" fill="var(--primary)" />
            <path d="M72 80l7 7 14-15" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 className="rc-title">Your receipt is ready!</h2>
        <p className="rc-sub">You can download or share your receipt.</p>

        <div className="rc-actions">
          <button className="btn full" onClick={save} disabled={!!busy}>
            <Download size={16} /> {busy === 'save' ? 'Saving…' : 'Download Receipt'}
          </button>
          <button className="btn ghost full" onClick={send} disabled={!!busy}>
            <Share2 size={16} /> {busy === 'share' ? 'Opening…' : 'Share Receipt'}
          </button>
          <button className="rc-back" onClick={() => nav('/bookings')}>Back to Bookings</button>
        </div>
      </div>
    </div>
  )
}
