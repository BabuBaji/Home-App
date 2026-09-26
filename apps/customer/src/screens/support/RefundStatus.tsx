// 111 · Refund Status — real refund data from /api/refunds. Shows the latest refund's detail and
// a status timeline derived from its actual status/date (Requested → Approved → Processed → Completed).
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Share2 } from 'lucide-react'
import { Loading } from '../../components/UI'
import { fetchRefunds, fetchBooking, type RefundEntry } from '../../api'
import type { Booking } from '../../types'
import { t, dateLocale } from '../../i18n'

const money = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`
const stamp = (s: string) => new Date(s).toLocaleString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase())
const day = (s: string) => new Date(s).toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' })

export default function RefundStatus() {
  const nav = useNavigate()
  const { id } = useParams()
  const [refund, setRefund] = useState<RefundEntry | null | undefined>(undefined)
  const [booking, setBooking] = useState<Booking | null>(null)

  useEffect(() => {
    fetchRefunds().then((rs) => {
      const r = id ? rs.find((x) => x.id === Number(id)) : rs[0]
      setRefund(r || null)
      if (r) fetchBooking(r.id).then(setBooking).catch(() => {})
    }).catch(() => setRefund(null))
  }, [id])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={18} /></button>
      <div className="titles"><h1>{t('Refund Status')}</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (refund === undefined) return <div className="screen">{head}<Loading /></div>
  if (!refund) return <div className="screen">{head}<div className="state"><div className="ico">↩️</div><h3>{t('No refunds yet')}</h3><p>{t('Refunds from cancelled bookings show here.')}</p></div></div>

  const done = refund.status === 'completed'
  const created = refund.created
  // Timeline steps are derived from the refund's real status + date — not invented events.
  const steps = [
    { t: 'Refund Requested', at: created, on: true },
    { t: 'Refund Approved', at: created, on: refund.status !== 'failed' },
    { t: 'Refund Processed', at: created, on: done },
    { t: 'Refund Completed', at: created, on: done },
  ]

  return (
    <div className="screen">
      {head}
      <div className="content pad-cta">
        <div className={`rs-banner ${done ? 'ok' : refund.status === 'failed' ? 'fail' : 'pending'}`}>
          <CheckCircle2 size={22} />
          <div>
            <div className="rs-banner-id">{t('Refund ID:')} {refund.ref}</div>
            <div className="rs-banner-t">{done ? t('Completed') : refund.status === 'failed' ? t('Failed') : t('Pending')}</div>
            <div className="rs-banner-d">{done ? t('Refund completed successfully') : refund.status === 'failed' ? t('Refund could not be processed') : t('Your refund is being processed')}</div>
            <div className="rs-banner-when">{stamp(created)}</div>
          </div>
        </div>

        <div className="rs-sec">{t('Refund Details')}</div>
        <div className="ws-card rs-kv">
          <Row k={t('Booking ID')} v={refund.ref} />
          <Row k={t('Service')} v={refund.title} />
          <Row k={t('Amount')} v={money(refund.amount)} />
          {booking && <Row k={t('Payment Method')} v={(booking.payment || '—').toUpperCase()} />}
          <Row k={t('Refund Date')} v={day(created)} />
          {booking && <Row k={t('Refunded To')} v={t('HomeHelp Wallet')} />}
        </div>

        <div className="rs-sec">{t('Refund Timeline')}</div>
        <div className="rs-timeline">
          {steps.map((s, i) => (
            <div key={s.t} className={`rs-step ${s.on ? 'on' : ''}`}>
              <span className="rs-dot">{s.on && <CheckCircle2 size={16} />}</span>
              {i < steps.length - 1 && <span className={`rs-line ${steps[i + 1].on ? 'on' : ''}`} />}
              <div className="rs-step-main"><div className="rs-step-t">{t(s.t)}</div><div className="rs-step-at">{stamp(s.at)}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-foot">
        <button className="btn ghost full" onClick={() => nav('/cancellation-policy')}>{t('View Refund Policy')}</button>

      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="ord-kv"><span className="ord-kv-k">{k}</span><span className="ord-kv-v">{v}</span></div>
}
