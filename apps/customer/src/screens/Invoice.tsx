// 64 · Invoice — shows the SAME professional GST tax-invoice document that Download/Share export
// (invoiceDoc.ts): company + GSTIN, Bill-To, itemised services + SAC, CGST/SGST split, amount in
// words, a PAID/CANCELLED stamp and an authorized-signatory signature. Rendered in an iframe so
// what you view is exactly what you download.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Share2 } from 'lucide-react'
import { Loading, useToast } from '../components/UI'
import { fetchBooking, fetchInvoiceInfo, fetchMe, type InvoiceInfo } from '../api'
import { invoiceHTML, downloadInvoice, shareInvoice } from '../invoiceDoc'
import type { Booking, User } from '../types'
import { t } from '../i18n'

export default function Invoice() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [b, setB] = useState<Booking | null>(null)
  const [inv, setInv] = useState<InvoiceInfo | null>(null)
  const [me, setMe] = useState<User | null>(null)
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchBooking(Number(id)).then(setB).catch(() => setErr(true)) }, [id])
  useEffect(() => { fetchInvoiceInfo().then(setInv).catch(() => {}) }, [])
  useEffect(() => { fetchMe().then((r) => setMe(r.user)).catch(() => {}) }, [])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={18} /></button>
      <div className="titles"><h1>{t('Invoice')}</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )

  if (err) return <div className="screen">{head}<div className="state"><div className="ico">⚠️</div><h3>{t('Could not load invoice')}</h3></div></div>
  if (!b) return <div className="screen">{head}<Loading /></div>

  const bill = { name: me?.name || undefined, phone: me?.phone || undefined }
  const html = invoiceHTML(b, inv, bill)

  const onDownload = async () => {
    setBusy(true)
    const saved = await downloadInvoice(b, inv, bill)
    setBusy(false)
    toast(saved ? t('Invoice saved to {path}', { path: saved }) : t('Could not save the invoice'))
  }
  const onShare = async () => { if (!(await shareInvoice(b, inv, bill))) toast(t('Sharing is not available here')) }

  return (
    <div className="screen inv-screen">
      {head}
      <div className="inv-view">
        <iframe title={`Invoice ${b.ref}`} srcDoc={html} className="inv-frame" />
      </div>
      <div className="inv-foot">
        <button className="inv-btn ghost" onClick={onShare}><Share2 size={16} /> {t('Share')}</button>
        <button className="inv-btn" disabled={busy} onClick={onDownload}><Download size={16} /> {busy ? t('Saving…') : t('Download')}
</button>
      </div>
    </div>
  )
}
