import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Header, Loading, useToast } from '../components/UI'
import { useStore } from '../store'
import { pushBackHandler } from '../backStack'
import { fetchBooking, fetchInvoiceInfo, type InvoiceInfo } from '../api'
import type { Booking } from '../types'

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed', worker_assigned: 'Expert assigned', on_the_way: 'On the way',
  arrived: 'Arrived', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
}
const money = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`
// Seller details shown on the tax invoice — edit these to your registered company info.
const COMPANY = {
  name: 'HomeHelp Services Pvt. Ltd.',
  addr: '3rd Floor, Cyber Heights, HITEC City, Hyderabad, Telangana 500081',
  gstin: '36AABCH1234M1Z7',
}
// Stable transaction reference derived from the booking (no gateway id is persisted).
const txnRef = (b: Booking) => `TXN-${new Date(b.created).toISOString().slice(0, 10).replace(/-/g, '')}-${String(b.id).padStart(6, '0')}`
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
// Indian-system number to words for the invoice's "amount in words" (crore / lakh / thousand).
function amountInWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const two = (n: number): string => n < 20 ? ones[n] : (tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''))
  const three = (n: number): string => { const h = Math.floor(n / 100), r = n % 100; return (h ? ones[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : '') }
  let n = Math.floor(Math.abs(num))
  if (n === 0) return 'Zero'
  const cr = Math.floor(n / 10000000); n %= 10000000
  const la = Math.floor(n / 100000); n %= 100000
  const th = Math.floor(n / 1000); n %= 1000
  let out = ''
  if (cr) out += two(cr) + ' Crore '
  if (la) out += two(la) + ' Lakh '
  if (th) out += two(th) + ' Thousand '
  if (n) out += three(n)
  return out.trim()
}
function actualDuration(b: Booking): string | null {
  if (!b.started_at || !b.completed_at) return null
  const mins = Math.max(0, Math.round((new Date(b.completed_at).getTime() - new Date(b.started_at).getTime()) / 60000))
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

export default function BookingDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { setBookingType } = useStore()
  const [b, setB] = useState<Booking | null>(null)
  const [err, setErr] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)

  const [inv, setInv] = useState<InvoiceInfo | null>(null)
  useEffect(() => { fetchBooking(Number(id)).then(setB).catch(() => setErr(true)) }, [id])
  useEffect(() => { fetchInvoiceInfo().then(setInv).catch(() => {}) }, [])
  // Android hardware back closes the invoice preview instead of navigating away.
  useEffect(() => { if (showInvoice) return pushBackHandler(() => setShowInvoice(false)) }, [showInvoice])
  if (err) return <div className="screen"><Header title="Booking Details" /><div className="state"><div className="ico">⚠️</div><h3>Could not load booking</h3></div></div>
  if (!b) return <div className="screen"><Header title="Booking Details" /><Loading /></div>

  const dur = actualDuration(b)
  const live = ['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress'].includes(b.status)
  const scheduled = b.type === 'schedule' ? (b.date && b.time ? `${b.date}, ${b.time}` : (b.scheduled_at ? dt(new Date(b.scheduled_at).toISOString()) : '—')) : 'Instant (now)'

  function invoiceHTML(): string {
    const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c])
    const paid = b!.payment_status === 'paid'
    const cancelled = b!.status === 'cancelled'
    const color = cancelled ? '#c0392b' : paid ? '#1f9d57' : '#c98a00'
    const stampText = cancelled ? 'CANCELLED' : paid ? 'PAID' : 'PENDING'
    const genAt = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const txn = txnRef(b!)
    const seller = inv || { name: COMPANY.name, gstin: COMPANY.gstin, address: COMPANY.addr, state: 'Telangana', sac: '9987', prefix: 'INV', gstInclusive: false }
    // Sequential invoice number: <prefix>/<financial year>/<padded booking id> (bookings are consecutive).
    const fyD = new Date(b!.created); const fyY = fyD.getMonth() >= 3 ? fyD.getFullYear() : fyD.getFullYear() - 1
    const invNo = `${seller.prefix}/${fyY}-${String((fyY + 1) % 100).padStart(2, '0')}/${String(b!.id).padStart(5, '0')}`
    // Taxable value reconciles exactly (total − GST − fee); split GST into CGST + SGST (intra-state supply).
    const taxable = Math.max(0, b!.total - b!.tax - b!.fee)
    const gRate = taxable > 0 ? Math.round((b!.tax / taxable) * 100) : 0
    const half = gRate / 2
    const cgst = Math.round(b!.tax / 2), sgst = b!.tax - cgst
    const inWords = amountInWords(b!.total)
    const rows = b!.items.map((i) => `<tr><td>${esc(i.name)}${i.durationLabel ? ` <span class="dim">· ${esc(i.durationLabel)}</span>` : ''}</td><td class="dim">${esc(seller.sac)}</td><td class="r">${money(i.price)}</td></tr>`).join('')
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;color:#1c1830;background:#eceaf2;padding:14px;-webkit-font-smoothing:antialiased}
.sheet{max-width:640px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(30,20,60,.12)}
.top{background:linear-gradient(135deg,#6d5cf5,#4840c4);color:#fff;padding:22px 24px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.brand{font-size:22px;font-weight:800;letter-spacing:-.3px}.brand span{opacity:.85;font-weight:500}
.tagline{font-size:11px;opacity:.85;margin-top:3px}
.co{font-size:10px;opacity:.82;margin-top:7px;line-height:1.45;max-width:300px}
.it{text-align:right}.it h1{font-size:18px;letter-spacing:2px;font-weight:700}.it .no{font-size:12px;opacity:.9;margin-top:4px}
.meta{display:flex;flex-wrap:wrap;gap:14px 30px;padding:18px 24px;border-bottom:1px solid #eee}
.meta .k{color:#8a86a0;text-transform:uppercase;letter-spacing:.4px;font-size:10px}
.meta .v{font-weight:600;margin-top:2px;font-size:13px;max-width:230px}
.body{padding:8px 24px 0;position:relative}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#8a86a0;border-bottom:2px solid #efedf6;padding:8px 0}
td{padding:11px 0;font-size:13px;border-bottom:1px solid #f2f0f8}
.r{text-align:right}.dim{color:#9a97ad;font-size:12px}
.totals{margin:14px 0 8px auto;width:250px}
.totals .row{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;color:#4a4660}
.totals .grand{border-top:2px solid #efedf6;margin-top:6px;padding-top:10px;font-size:16px;font-weight:800;color:#4840c4}
.pay{display:flex;align-items:center;gap:8px;padding:14px 24px;background:#faf9ff;margin-top:6px;font-size:12px;flex-wrap:wrap}
.badge{display:inline-block;padding:4px 10px;border-radius:20px;font-weight:700;font-size:11px}
.badge.ok{background:#e4f7ec;color:#1f9d57}.badge.no{background:#fdeaea;color:#c0392b}.badge.pend{background:#fff4de;color:#c98a00}
.stamp{position:absolute;right:20px;top:6px;width:116px;height:116px;border-radius:50%;border:3px double ${color};color:${color};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;transform:rotate(-15deg);opacity:.72}
.stamp b{font-size:20px;font-weight:800;letter-spacing:1px}
.stamp small{font-size:8px;letter-spacing:.5px;margin-top:3px;line-height:1.3;text-transform:uppercase}
.foot{text-align:center;padding:16px 24px 22px;color:#9a97ad;font-size:11px;line-height:1.6}
.foot .hr{height:3px;background:linear-gradient(90deg,#6d5cf5,#4840c4);border-radius:3px;margin-bottom:12px}
</style></head><body><div class="sheet">
<div class="top"><div><div class="brand">🏠 Home<span>Help</span></div><div class="tagline">One expert who can do it all</div>
<div class="co">${esc(seller.name)} · GSTIN: ${esc(seller.gstin)}</div><div class="co">${esc(seller.address)}</div></div>
<div class="it"><h1>TAX INVOICE</h1><div class="no">${esc(invNo)}</div><div class="no" style="opacity:.7">Ref ${esc(b!.ref)}</div></div></div>
<div class="meta">
<div><div class="k">Invoice Date</div><div class="v">${genAt}</div></div>
<div><div class="k">Transaction ID</div><div class="v">${txn}</div></div>
<div><div class="k">Booked On</div><div class="v">${dt(b!.created)}</div></div>
<div><div class="k">Type</div><div class="v">${b!.type === 'instant' ? 'Instant' : 'Scheduled'}</div></div>
<div><div class="k">Place of Supply</div><div class="v">${esc(seller.state || '—')}</div></div>
<div><div class="k">Schedule</div><div class="v">${esc(scheduled)}</div></div>
<div><div class="k">Expert</div><div class="v">${esc(b!.pro_name || 'Not assigned')}${b!.pro_rating ? ` ⭐ ${b!.pro_rating}` : ''}</div></div>
<div><div class="k">Service Address</div><div class="v">${esc(b!.address || '—')}</div></div>
${b!.started_at ? `<div><div class="k">Started</div><div class="v">${dt(b!.started_at)}</div></div>` : ''}
${b!.completed_at ? `<div><div class="k">Completed</div><div class="v">${dt(b!.completed_at)}</div></div>` : ''}
${dur ? `<div><div class="k">Duration Worked</div><div class="v">${esc(dur)}</div></div>` : ''}
</div>
<div class="body"><div class="stamp"><b>${stampText}</b><small>HomeHelp<br>${esc(genAt.split(',')[0])}</small></div>
<table><thead><tr><th>Service</th><th>SAC</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">
<div class="row"><span>Item total</span><span>${money(b!.subtotal)}</span></div>
${b!.discount ? `<div class="row"><span>Discount${b!.coupon ? ` (${esc(b!.coupon)})` : ''}</span><span>-${money(b!.discount)}</span></div>` : ''}
<div class="row"><span>Taxable value</span><span>${money(taxable)}</span></div>
<div class="row"><span>CGST @ ${half}%</span><span>${money(cgst)}</span></div>
<div class="row"><span>SGST @ ${half}%</span><span>${money(sgst)}</span></div>
<div class="row"><span>Platform fee</span><span>${money(b!.fee)}</span></div>
<div class="row grand"><span>Total ${paid ? 'Paid' : 'Payable'}</span><span>${money(b!.total)}</span></div>
${seller.gstInclusive ? `<div style="font-size:10px;color:#9a97ad;text-align:right;margin-top:4px">GST is included in the item price shown above.</div>` : ''}
</div>
<div style="clear:both;font-size:11.5px;color:#4a4660;padding:4px 0 8px;line-height:1.5"><b>Amount in words:</b> Rupees ${esc(inWords)} Only</div>
</div>
<div class="pay">Payment: <b>${esc((b!.payment || '').toUpperCase())}</b>
<span class="badge ${paid ? 'ok' : cancelled ? 'no' : 'pend'}">${esc(b!.payment_status.toUpperCase())}</span>
<span style="color:#8a86a0">Txn: ${txn}</span>
${cancelled && (b!.refund ?? 0) > 0 ? `<span style="margin-left:auto;color:#1f9d57;font-weight:600">Refunded ${money(b!.refund)} to wallet</span>` : ''}</div>
<div class="foot"><div class="hr"></div>This is a computer-generated invoice and does not require a physical signature.<br>Generated on ${genAt} · Thank you for choosing HomeHelp!</div>
</div></body></html>`
  }

  async function downloadInvoice() {
    const html = invoiceHTML()
    const name = `Invoice-${b!.ref.replace(/[#\s]/g, '')}.html`
    try {
      if (Capacitor.isNativePlatform()) {
        const w = await Filesystem.writeFile({ path: name, data: html, directory: Directory.Cache, encoding: Encoding.UTF8 })
        await Share.share({ title: `HomeHelp Invoice ${b!.ref}`, text: `Invoice for ${b!.ref}`, url: w.uri, dialogTitle: 'Save or share invoice' })
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
        a.download = name; a.click()
        toast('Invoice downloaded')
      }
    } catch { toast('Could not export the invoice') }
  }

  const Row = ({ k, v }: { k: ReactNode; v: ReactNode }) => (
    <div className="row" style={{ justifyContent: 'space-between', gap: 12, padding: '7px 0', fontSize: 13.5 }}>
      <span className="muted">{k}</span><span style={{ textAlign: 'right', fontWeight: 500 }}>{v}</span>
    </div>
  )

  return (
    <div className="screen">
      <Header title="Booking Details" />
      <div className="content pad-cta">
        <div className="card pad">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div><div style={{ fontWeight: 700, fontSize: 16 }}>{b.items.map((i) => i.name).join(', ')}</div>
              <div className="muted sm" style={{ marginTop: 2 }}>{b.ref}</div></div>
            <span className={`status-chip ${b.status === 'completed' ? 'completed' : b.status === 'cancelled' ? 'cancelled' : 'upcoming'}`}>{STATUS_LABEL[b.status] || b.status}</span>
          </div>
        </div>

        <div className="card pad mt">
          <div className="label normal">Service</div>
          {b.items.map((i, idx) => (
            <Row key={idx} k={`${i.name}${i.durationLabel ? ` · ${i.durationLabel}` : ''}`} v={money(i.price)} />
          ))}
          <Row k="Schedule" v={scheduled} />
          {b.started_at && <Row k="Started" v={dt(b.started_at)} />}
          {b.completed_at && <Row k="Completed" v={dt(b.completed_at)} />}
          {dur && <Row k="Duration worked" v={dur} />}
        </div>

        <div className="card pad mt">
          <div className="label normal">Expert & location</div>
          <Row k="Expert" v={b.pro_name ? `${b.pro_name}${b.pro_rating ? ` · ⭐ ${b.pro_rating}` : ''}` : 'Not assigned'} />
          <Row k="Address" v={b.address || '—'} />
          {b.rating ? <Row k="Your rating" v={`⭐ ${b.rating}`} /> : null}
          {b.review ? <Row k="Your review" v={b.review} /> : null}
        </div>

        <div className="card pad mt">
          <div className="label normal">Payment</div>
          <Row k="Item total" v={money(b.subtotal)} />
          <Row k="Platform fee" v={money(b.fee)} />
          <Row k="Taxes" v={money(b.tax)} />
          {b.discount ? <Row k={`Discount${b.coupon ? ` (${b.coupon})` : ''}`} v={`-${money(b.discount)}`} /> : null}
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <Row k={<b>Total paid</b>} v={<b>{money(b.total)}</b>} />
          <Row k="Method" v={`${(b.payment || '').toUpperCase()} · ${b.payment_status}`} />
          {b.status === 'completed' && <Row k="Transaction ID" v={txnRef(b)} />}
          {b.status === 'cancelled' && (b.refund ?? 0) > 0 && <Row k="Refunded" v={<span style={{ color: '#157347' }}>{money(b.refund)} to wallet</span>} />}
          {b.status === 'cancelled' && b.cancel_reason && <Row k="Cancel reason" v={b.cancel_reason} />}
        </div>

        {b.work_photo && (
          <div className="card pad mt">
            <div className="label normal">Proof of work</div>
            <img src={b.work_photo} alt="Proof of work" style={{ width: '100%', borderRadius: 12, marginTop: 6 }} />
          </div>
        )}

      </div>

      {/* action bar — buttons side by side */}
      <div className="bd-foot">
        {b.status === 'completed' && !b.rating && (
          <button className="btn" onClick={() => nav(`/rate/${b.id}`)}>⭐ Rate</button>
        )}
        {live && (
          <button className="btn" onClick={() => nav(`/track/${b.id}`)}>Track</button>
        )}
        {(b.status === 'completed' || b.status === 'cancelled') && (
          <button className="btn ghost" onClick={() => { setBookingType('instant'); nav(`/book/${b.items[0].id}`) }}>🔁 Rebook</button>
        )}
        {b.status === 'completed' && (
          <button className="btn ghost" onClick={() => setShowInvoice(true)}>🧾 Invoice</button>
        )}
      </div>

      {showInvoice && (
        <div className="inv-modal">
          <div className="inv-head"><span>Invoice · {b.ref}</span><button onClick={() => setShowInvoice(false)} aria-label="Close">✕</button></div>
          <iframe className="inv-frame" srcDoc={invoiceHTML()} title="Invoice" />
          <div className="inv-foot"><button className="btn full" onClick={downloadInvoice}>⬇️ Download / Share Invoice</button></div>
        </div>
      )}
    </div>
  )
}
