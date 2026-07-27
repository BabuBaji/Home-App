// Tax-invoice document + export helpers.
//
// Extracted verbatim from BookingDetail so the Invoice (64) and Download Receipt (65) screens can
// render/export the SAME document the booking screen has always produced. Nothing here is new
// behaviour — it is the existing generator, parameterised by (booking, seller) instead of closing
// over component state.
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { InvoiceInfo } from './api'
import type { Booking } from './types'

export const money = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`

// Seller details shown on the tax invoice — used only when /api/invoice-info is unreachable.
export const COMPANY = {
  name: 'HomeHelp Services Pvt. Ltd.',
  addr: '3rd Floor, Cyber Heights, HITEC City, Hyderabad, Telangana 500081',
  gstin: '36AABCH1234M1Z7',
}

// Stable transaction reference derived from the booking (no gateway id is persisted).
export const txnRef = (b: Booking) =>
  `TXN-${new Date(b.created).toISOString().slice(0, 10).replace(/-/g, '')}-${String(b.id).padStart(6, '0')}`

// en-IN renders "02:35 pm"; the design shows "11:20 AM".
export const dt = (s?: string | null) =>
  s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase()) : '—'

// Indian-system number to words for the invoice's "amount in words" (crore / lakh / thousand).
export function amountInWords(num: number): string {
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

export function actualDuration(b: Booking): string | null {
  if (!b.started_at || !b.completed_at) return null
  const mins = Math.max(0, Math.round((new Date(b.completed_at).getTime() - new Date(b.started_at).getTime()) / 60000))
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

export const scheduleLabel = (b: Booking) =>
  b.type === 'schedule'
    ? (b.date && b.time ? `${b.date}, ${b.time}` : (b.scheduled_at ? dt(new Date(b.scheduled_at).toISOString()) : '—'))
    : 'Instant (now)'

// Sequential invoice number: <prefix>/<financial year>/<padded booking id> (bookings are consecutive).
export function invoiceNo(b: Booking, inv: InvoiceInfo | null): string {
  const prefix = inv?.prefix || 'INV'
  const fyD = new Date(b.created)
  const fyY = fyD.getMonth() >= 3 ? fyD.getFullYear() : fyD.getFullYear() - 1
  return `${prefix}/${fyY}-${String((fyY + 1) % 100).padStart(2, '0')}/${String(b.id).padStart(5, '0')}`
}

export function invoiceHTML(b: Booking, inv: InvoiceInfo | null, bill?: { name?: string; phone?: string } | null): string {
  const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c])
  const paid = b.payment_status === 'paid'
  const cancelled = b.status === 'cancelled'
  const color = cancelled ? '#c0392b' : paid ? '#1f9d57' : '#c98a00'
  const stampText = cancelled ? 'CANCELLED' : paid ? 'PAID' : 'PENDING'
  const genAt = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const txn = txnRef(b)
  const seller = inv || { name: COMPANY.name, gstin: COMPANY.gstin, address: COMPANY.addr, state: 'Telangana', sac: '9987', prefix: 'INV', gstInclusive: false }
  const invNo = invoiceNo(b, inv)
  const scheduled = scheduleLabel(b)
  const dur = actualDuration(b)
  // Taxable value reconciles exactly (total − GST − fee); split GST into CGST + SGST (intra-state supply).
  const taxable = Math.max(0, b.total - b.tax - b.fee)
  const gRate = taxable > 0 ? Math.round((b.tax / taxable) * 100) : 0
  const half = gRate / 2
  const cgst = Math.round(b.tax / 2), sgst = b.tax - cgst
  const inWords = amountInWords(b.total)
  const rows = b.items.map((i) => `<tr><td>${esc(i.name)}${i.durationLabel ? ` <span class="dim">· ${esc(i.durationLabel)}</span>` : ''}</td><td class="dim">${esc(seller.sac)}</td><td class="r">${money(i.price)}</td></tr>`).join('')
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
.sign-wrap{display:flex;justify-content:flex-end;padding:14px 0 6px}
.sign{text-align:center;min-width:210px}
.sign-mark{font-family:'Segoe Script','Brush Script MT','Snell Roundhand',cursive;font-size:32px;color:#4840c4;line-height:1.1;transform:rotate(-4deg)}
.sign-rule{border-top:1.5px solid #cfcae6;margin:2px 0 5px}
.sign-for{font-size:12px;font-weight:700;color:#1c1830}
.sign-role{font-size:10px;color:#8a86a0;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
.foot{text-align:center;padding:16px 24px 22px;color:#9a97ad;font-size:11px;line-height:1.6}
.foot .hr{height:3px;background:linear-gradient(90deg,#6d5cf5,#4840c4);border-radius:3px;margin-bottom:12px}
</style></head><body><div class="sheet">
<div class="top"><div><div class="brand">🏠 Home<span>Help</span></div><div class="tagline">One expert who can do it all</div>
<div class="co">${esc(seller.name)} · GSTIN: ${esc(seller.gstin)}</div><div class="co">${esc(seller.address)}</div></div>
<div class="it"><h1>TAX INVOICE</h1><div class="no">${esc(invNo)}</div><div class="no" style="opacity:.7">Ref ${esc(b.ref)}</div></div></div>
<div class="meta">
<div><div class="k">Billed To</div><div class="v">${esc(bill?.name || '—')}${bill?.phone ? `<br><span class="dim">${esc(bill.phone)}</span>` : ''}</div></div>
<div><div class="k">Invoice Date</div><div class="v">${genAt}</div></div>
<div><div class="k">Transaction ID</div><div class="v">${txn}</div></div>
<div><div class="k">Booked On</div><div class="v">${dt(b.created)}</div></div>
<div><div class="k">Type</div><div class="v">${b.type === 'instant' ? 'Instant' : 'Scheduled'}</div></div>
<div><div class="k">Place of Supply</div><div class="v">${esc(seller.state || '—')}</div></div>
<div><div class="k">Schedule</div><div class="v">${esc(scheduled)}</div></div>
<div><div class="k">Expert</div><div class="v">${esc(b.pro_name || 'Not assigned')}${b.pro_rating ? ` ⭐ ${b.pro_rating}` : ''}</div></div>
<div><div class="k">Service Address</div><div class="v">${esc(b.address || '—')}</div></div>
${b.started_at ? `<div><div class="k">Started</div><div class="v">${dt(b.started_at)}</div></div>` : ''}
${b.completed_at ? `<div><div class="k">Completed</div><div class="v">${dt(b.completed_at)}</div></div>` : ''}
${dur ? `<div><div class="k">Duration Worked</div><div class="v">${esc(dur)}</div></div>` : ''}
</div>
<div class="body"><div class="stamp"><b>${stampText}</b><small>HomeHelp<br>${esc(genAt.split(',')[0])}</small></div>
<table><thead><tr><th>Service</th><th>SAC</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">
<div class="row"><span>Item total</span><span>${money(b.subtotal)}</span></div>
${b.discount ? `<div class="row"><span>Discount${b.coupon ? ` (${esc(b.coupon)})` : ''}</span><span>-${money(b.discount)}</span></div>` : ''}
<div class="row"><span>Taxable value</span><span>${money(taxable)}</span></div>
<div class="row"><span>CGST @ ${half}%</span><span>${money(cgst)}</span></div>
<div class="row"><span>SGST @ ${half}%</span><span>${money(sgst)}</span></div>
<div class="row"><span>Platform fee</span><span>${money(b.fee)}</span></div>
<div class="row grand"><span>Total ${paid ? 'Paid' : 'Payable'}</span><span>${money(b.total)}</span></div>
${seller.gstInclusive ? `<div style="font-size:10px;color:#9a97ad;text-align:right;margin-top:4px">GST is included in the item price shown above.</div>` : ''}
</div>
<div style="clear:both;font-size:11.5px;color:#4a4660;padding:4px 0 8px;line-height:1.5"><b>Amount in words:</b> Rupees ${esc(inWords)} Only</div>
<div class="sign-wrap"><div class="sign">
<div class="sign-mark">${esc((seller.name || 'HomeHelp').split(/\s|\./)[0])}</div>
<div class="sign-rule"></div>
<div class="sign-for">For ${esc(seller.name)}</div>
<div class="sign-role">Authorized Signatory</div>
</div></div>
</div>
<div class="pay">Payment: <b>${esc((b.payment || '').toUpperCase())}</b>
<span class="badge ${paid ? 'ok' : cancelled ? 'no' : 'pend'}">${esc(b.payment_status.toUpperCase())}</span>
<span style="color:#8a86a0">Txn: ${txn}</span>
${cancelled && (b.refund ?? 0) > 0 ? `<span style="margin-left:auto;color:#1f9d57;font-weight:600">Refunded ${money(b.refund)} to wallet</span>` : ''}</div>
<div class="foot"><div class="hr"></div>This invoice is digitally signed and stamped — no physical signature is required.<br>Generated on ${genAt} · Thank you for choosing HomeHelp!</div>
</div></body></html>`
}

const fileName = (b: Booking) => `Invoice-${b.ref.replace(/[#\s]/g, '')}.html`

/**
 * DOWNLOAD — write the invoice to the device's own storage. No share sheet: the file lands on the
 * phone (Documents, falling back to the app's Data dir if scoped storage refuses) and the browser
 * simply downloads it. Returns where it was saved, or null on failure.
 */
export async function downloadInvoice(b: Booking, inv: InvoiceInfo | null, bill?: { name?: string; phone?: string } | null): Promise<string | null> {
  const html = invoiceHTML(b, inv, bill)
  const name = fileName(b)
  try {
    if (!Capacitor.isNativePlatform()) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      a.download = name; a.click()
      URL.revokeObjectURL(a.href)
      return name
    }
    // Public Documents is what a user means by "downloaded to my device", but scoped storage can
    // reject it — fall back to the app's own directory rather than failing the download outright.
    for (const directory of [Directory.Documents, Directory.Data]) {
      try {
        await Filesystem.writeFile({ path: name, data: html, directory, encoding: Encoding.UTF8 })
        return directory === Directory.Documents ? `Documents/${name}` : name
      } catch { /* try the next location */ }
    }
    return null
  } catch { return null }
}

/** SHARE — hand the invoice to the OS share sheet so it can go to any app/contact the user picks. */
export async function shareInvoice(b: Booking, inv: InvoiceInfo | null, bill?: { name?: string; phone?: string } | null): Promise<boolean> {
  const html = invoiceHTML(b, inv, bill)
  const name = fileName(b)
  try {
    if (Capacitor.isNativePlatform()) {
      // Share needs a file URI it can grant access to; Cache is the right place for that.
      const w = await Filesystem.writeFile({ path: name, data: html, directory: Directory.Cache, encoding: Encoding.UTF8 })
      await Share.share({ title: `HomeHelp Invoice ${b.ref}`, text: `Invoice for ${b.ref}`, url: w.uri, dialogTitle: 'Share receipt' })
      return true
    }
    if (navigator.share) {
      await navigator.share({ title: `HomeHelp Invoice ${b.ref}`, text: `Invoice for ${b.ref}` })
      return true
    }
    return false
  } catch { return false }
}
