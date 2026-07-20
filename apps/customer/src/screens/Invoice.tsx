// 64 · Invoice — the customer-facing invoice summary.
// "Download" exports the SAME tax-invoice document the booking screen has always produced
// (invoiceDoc.ts), so nothing about the GST document changes — only how it is presented.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download } from 'lucide-react'
import { Loading } from '../components/UI'
import { fetchBooking, fetchInvoiceInfo, fetchMe, type InvoiceInfo } from '../api'
import { invoiceNo, money } from '../invoiceDoc'
import type { Booking, User } from '../types'

// en-IN renders "05:16 pm"; the design shows "11:20 AM".
const stamp = (s: string) =>
  new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase())

export default function Invoice() {
  const { id } = useParams()
  const nav = useNavigate()
  const [b, setB] = useState<Booking | null>(null)
  const [inv, setInv] = useState<InvoiceInfo | null>(null)
  const [me, setMe] = useState<User | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => { fetchBooking(Number(id)).then(setB).catch(() => setErr(true)) }, [id])
  useEffect(() => { fetchInvoiceInfo().then(setInv).catch(() => {}) }, [])
  useEffect(() => { fetchMe().then((r) => setMe(r.user)).catch(() => {}) }, [])

  const head = (right?: boolean) => (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Invoice</h1></div>
      {right && b
        ? <button className="iconbtn" onClick={() => nav(`/receipt/${b.id}`)} aria-label="Download receipt"><Download size={18} /></button>
        : <span className="iconbtn ghost" />}
    </header>
  )

  if (err) return <div className="screen">{head()}<div className="state"><div className="ico">⚠️</div><h3>Could not load invoice</h3></div></div>
  if (!b) return <div className="screen">{head()}<Loading /></div>

  const paid = b.payment_status === 'paid'
  const seller = inv?.name || 'HomeHelp Services'

  return (
    <div className="screen">
      {head(true)}
      <div className="content pad-cta">
        <div className="inv-sheet">
          <div className="inv-brand">
            <span className="inv-logo">🏠</span>
            <div>
              <div className="inv-co">{seller}</div>
              <div className="inv-tag">One expert who can do it all</div>
            </div>
          </div>

          <div className="inv-no">
            <div>Invoice #{invoiceNo(b, inv)}</div>
            <div className="muted sm">{stamp(b.created)}</div>
          </div>

          <div className="inv-billed">
            <div className="inv-k">Billed To</div>
            <div className="inv-v">{me?.name || '—'}</div>
            {b.address && <div className="inv-addr">{b.address}</div>}
          </div>

          <div className="inv-row"><span className="inv-k">Booking ID</span><span className="inv-v">{b.ref}</span></div>

          <table className="inv-tbl">
            <thead><tr><th>Item</th><th className="r">Amount (₹)</th></tr></thead>
            <tbody>
              {b.items.map((i, n) => (
                <tr key={n}>
                  <td>{i.name}{i.durationLabel ? ` (${i.durationLabel})` : ''}</td>
                  <td className="r">{money(i.price)}</td>
                </tr>
              ))}
              <tr><td>Platform Fee</td><td className="r">{money(b.fee)}</td></tr>
              {b.tax > 0 && <tr><td>Taxes &amp; GST</td><td className="r">{money(b.tax)}</td></tr>}
              {b.discount > 0 && (
                <tr><td>Discount{b.coupon ? ` (${b.coupon})` : ''}</td><td className="r green">− {money(b.discount)}</td></tr>
              )}
            </tbody>
          </table>

          <div className="inv-total">
            <div>
              <div className="inv-total-k">Total Amount</div>
              <div className="muted sm">{paid ? `Paid via ${(b.payment || '').toUpperCase()}` : `Payable · ${b.payment_status}`}</div>
            </div>
            <div className="inv-total-v">{money(b.total)}</div>
          </div>

          <div className="inv-thanks">Thank you for choosing our service!</div>
        </div>
      </div>
    </div>
  )
}
