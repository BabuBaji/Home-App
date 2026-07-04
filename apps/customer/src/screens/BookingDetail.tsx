import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Header, Loading, useToast } from '../components/UI'
import { fetchBooking } from '../api'
import type { Booking } from '../types'

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed', worker_assigned: 'Expert assigned', on_the_way: 'On the way',
  arrived: 'Arrived', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
}
const money = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
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
  const [b, setB] = useState<Booking | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => { fetchBooking(Number(id)).then(setB).catch(() => setErr(true)) }, [id])
  if (err) return <div className="screen"><Header title="Booking Details" /><div className="state"><div className="ico">⚠️</div><h3>Could not load booking</h3></div></div>
  if (!b) return <div className="screen"><Header title="Booking Details" /><Loading /></div>

  const dur = actualDuration(b)
  const scheduled = b.type === 'schedule' ? (b.date && b.time ? `${b.date}, ${b.time}` : (b.scheduled_at ? dt(new Date(b.scheduled_at).toISOString()) : '—')) : 'Instant (now)'

  function invoiceText(): string {
    const L: string[] = []
    L.push('════════════════════════════════════')
    L.push('           HomeHelp — TAX INVOICE')
    L.push('════════════════════════════════════')
    L.push(`Invoice for : ${b!.ref}`)
    L.push(`Booked on   : ${dt(b!.created)}`)
    L.push(`Type        : ${b!.type === 'instant' ? 'Instant' : 'Scheduled'}`)
    L.push(`Schedule    : ${scheduled}`)
    L.push(`Status      : ${STATUS_LABEL[b!.status] || b!.status}`)
    if (b!.pro_name) L.push(`Expert      : ${b!.pro_name}${b!.pro_rating ? ` (⭐ ${b!.pro_rating})` : ''}`)
    L.push(`Address     : ${b!.address || '—'}`)
    if (b!.started_at) L.push(`Started     : ${dt(b!.started_at)}`)
    if (b!.completed_at) L.push(`Completed   : ${dt(b!.completed_at)}`)
    if (dur) L.push(`Duration    : ${dur}`)
    L.push('────────────────────────────────────')
    L.push('SERVICES')
    b!.items.forEach((i) => L.push(`  • ${i.name}${i.durationLabel ? ` (${i.durationLabel})` : ''}  —  ${money(i.price)}`))
    L.push('────────────────────────────────────')
    L.push(`Item total   : ${money(b!.subtotal)}`)
    L.push(`Platform fee : ${money(b!.fee)}`)
    L.push(`Taxes        : ${money(b!.tax)}`)
    if (b!.discount) L.push(`Discount     : -${money(b!.discount)}${b!.coupon ? ` (${b!.coupon})` : ''}`)
    L.push(`TOTAL        : ${money(b!.total)}`)
    L.push('────────────────────────────────────')
    L.push(`Payment      : ${(b!.payment || '').toUpperCase()} · ${b!.payment_status}`)
    if (b!.status === 'cancelled' && (b!.refund ?? 0) > 0) L.push(`Refunded     : ${money(b!.refund)} to wallet`)
    L.push('════════════════════════════════════')
    L.push('     Thank you for choosing HomeHelp!')
    L.push('════════════════════════════════════')
    return L.join('\n')
  }

  async function downloadInvoice() {
    const text = invoiceText()
    const name = `Invoice-${b!.ref.replace(/[#\s]/g, '')}.txt`
    try {
      if (Capacitor.isNativePlatform()) {
        const w = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
        await Share.share({ title: `HomeHelp Invoice ${b!.ref}`, text: `Invoice for ${b!.ref}`, url: w.uri, dialogTitle: 'Save or share invoice' })
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
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
          {b.status === 'cancelled' && (b.refund ?? 0) > 0 && <Row k="Refunded" v={<span style={{ color: '#157347' }}>{money(b.refund)} to wallet</span>} />}
          {b.status === 'cancelled' && b.cancel_reason && <Row k="Cancel reason" v={b.cancel_reason} />}
        </div>

        {b.work_photo && (
          <div className="card pad mt">
            <div className="label normal">Proof of work</div>
            <img src={b.work_photo} alt="Proof of work" style={{ width: '100%', borderRadius: 12, marginTop: 6 }} />
          </div>
        )}

        <button className="btn full" style={{ marginTop: 14 }} onClick={downloadInvoice}>🧾 Download Invoice</button>
        {['confirmed', 'worker_assigned', 'on_the_way', 'arrived', 'in_progress'].includes(b.status) && (
          <button className="btn full ghost" style={{ marginTop: 10 }} onClick={() => nav(`/track/${b.id}`)}>Track this booking</button>
        )}
      </div>
    </div>
  )
}
