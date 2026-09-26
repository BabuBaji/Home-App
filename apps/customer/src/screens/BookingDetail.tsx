// 63 · Booking Details — summary header, service, expert, schedule, address, payment.
// Invoice/receipt now live on their own screens (64/65); the tax-invoice document itself is
// unchanged (invoiceDoc.ts). All existing actions — rate, rebook, tip, report, track — are kept.
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Share2, Phone, Star, MoreVertical, CalendarClock, XCircle, FileText, ShieldQuestion, Headset, RotateCcw } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { Loading, useToast, useBack } from '../components/UI'
import { WorkerAvatar } from '../components/OrderCard'
import { ServiceThumb } from '../serviceArt'
import { pushBackHandler } from '../backStack'
import { fetchBooking } from '../api'
import { actualDuration, money, txnRef, dt } from '../invoiceDoc'
import { chipClass, isLive, medallion, scheduleDisplay, STATUS_LABEL, whenLine } from '../orders'
import type { Booking } from '../types'
import { t } from '../i18n'

export default function BookingDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const goBack = useBack('/bookings')
  const toast = useToast()
  const [b, setB] = useState<Booking | null>(null)
  const [err, setErr] = useState(false)
  const [menu, setMenu] = useState(false)

  // Receipt-style details are for finished/cancelled bookings; a live one belongs on /job/:id.
  useEffect(() => {
    fetchBooking(Number(id)).then((d) => { if (isLive(d.status)) nav(`/job/${d.id}`, { replace: true }); else setB(d) }).catch(() => setErr(true))
  }, [id])
  // Android hardware back closes the menu instead of leaving the screen.
  useEffect(() => { if (menu) return pushBackHandler(() => setMenu(false)) }, [menu])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={goBack} aria-label={t('Back')}><ArrowLeft size={18} /></button>
      {/* spacer: balances the two icons on the right so the title stays centred */}
      {b && <span className="iconbtn ghost" />}
      <div className="titles"><h1>{t('Booking Details')}</h1></div>
      {b ? (
        <>
          <button className="iconbtn" onClick={share} aria-label={t('Share booking')}><Share2 size={18} /></button>
          <button className="iconbtn" onClick={() => setMenu(true)} aria-label={t('More options')}><MoreVertical size={18} /></button>
        </>
      ) : <span className="iconbtn ghost" />}

      {/* anchored to the appbar itself, so it clears the icons whatever the safe-area inset is */}
      {menu && b && (
        <div className="bd-menu" onClick={(e) => e.stopPropagation()}>
          {/* Reschedule/Cancel only while the job is still live — the cancel screen then applies
              the real cancellation terms (fee/refund quote) before anything is cancelled. */}
          {isLive(b.status) && b.type === 'schedule' && (
            <button className="bd-mi" onClick={() => go(`/reschedule/${b.id}`)}><CalendarClock size={16} /> {t('Reschedule Booking')}</button>
          )}
          {isLive(b.status) && (
            <button className="bd-mi danger" onClick={() => go(`/cancel/${b.id}`)}><XCircle size={16} /> {t('Cancel Booking')}</button>
          )}
          {b.status === 'completed' && (
            <button className="bd-mi" onClick={() => go(`/invoice/${b.id}`)}><FileText size={16} /> {t('View Invoice')}</button>
          )}
          {(b.status === 'completed' || b.status === 'cancelled') && (
            <button className="bd-mi" onClick={() => go(`/rebook/${b.id}`)}><RotateCcw size={16} /> {t('Rebook Service')}</button>
          )}
          <button className="bd-mi" onClick={() => go('/cancellation-policy')}><ShieldQuestion size={16} /> {t('Cancellation Policy')}</button>
          <button className="bd-mi" onClick={() => go('/support')}><Headset size={16} /> {t('Get Help')}</button>
        </div>
      )}
    </header>
  )

  async function share() {
    if (!b) return
    const when = whenLine(b)
    const text = [
      t('HomeHelp booking {ref}', { ref: b.ref }),
      b.items.map((i) => i.name).join(', '),
      when || '',
      b.address ? t('At: {addr}', { addr: b.address }) : '',
      t('Total: {amt}', { amt: money(b.total) }),
    ].filter(Boolean).join('\n')
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: `HomeHelp ${b.ref}`, text, dialogTitle: t('Share booking') })
      } else if (navigator.share) {
        await navigator.share({ title: `HomeHelp ${b.ref}`, text })
      } else {
        await navigator.clipboard.writeText(text)
        toast(t('Booking details copied'))
      }
    } catch { /* user dismissed the sheet — not an error */ }
  }

  if (err) return <div className="screen">{head}<div className="state"><div className="ico">⚠️</div><h3>{t('Could not load booking')}</h3></div></div>
  if (!b) return <div className="screen">{head}<Loading /></div>

  const m = medallion(b)
  const dur = actualDuration(b)
  const live = isLive(b.status)
  const when = whenLine(b)

  const Row = ({ k, v }: { k: ReactNode; v: ReactNode }) => (
    <div className="ord-kv"><span className="ord-kv-k">{k}</span><span className="ord-kv-v">{v}</span></div>
  )
  const go = (to: string) => { setMenu(false); nav(to) }

  return (
    <div className="screen">
      {head}
      <div className="content pad-cta">
        {/* summary header */}
        <div className="bd-hero">
          <span className="bd-hero-med">
            <span className="ord-med-m">{m.month}</span>
            <span className="ord-med-d">{m.day}</span>
            <span className="ord-med-w">{m.weekday}</span>
          </span>
          <span className="bd-hero-main">
            <span className="bd-hero-k">{t('Booking ID')}</span>
            <span className="bd-hero-ref">{b.ref}</span>
            {when && <span className="bd-hero-when">{when}</span>}
          </span>
          <span className={`status-chip ${chipClass(b.status)}`}>{t(STATUS_LABEL[b.status] || b.status)}</span>
        </div>

        {/* service */}
        <div className="ord-block">
          <div className="ord-block-h">{t('Service Details')}</div>
          {b.items.map((i, n) => (
            <div key={n} className="bd-svc">
              {/* ServiceThumb is absolutely positioned — it needs this sized, relative box */}
              <span className="bd-svc-thumb">
                <ServiceThumb service={{ id: i.id, name: i.name, image: `/services/${i.id}.jpg` }} medallion={34} />
              </span>
              <span className="bd-svc-main">
                <span className="bd-svc-name">{t(i.name)}</span>
                {i.durationLabel && <span className="bd-svc-dur">{i.durationLabel}</span>}
              </span>
              <span className="bd-svc-amt">{money(i.price)}</span>
            </div>
          ))}
        </div>

        {/* extended service — extra paid time the customer granted, itemised with amount + method */}
        {Array.isArray(b.extensions) && b.extensions.some((x) => x.status === 'approved') && (
          <div className="ord-block">
            <div className="ord-block-h">{t('Extended Service')}</div>
            {b.extensions.filter((x) => x.status === 'approved').map((x) => (
              <div key={x.id} className="bd-svc">
                <span className="bd-svc-main">
                  <span className="bd-svc-name">{t('+{n} min extra time', { n: x.minutes })}</span>
                  <span className="bd-svc-dur">
                    {x.reasonLabel}{x.paymentMethod ? ` · ${x.paymentMethod.toUpperCase()}` : ''} · {dt(x.decided || x.created)}
                  </span>
                </span>
                <span className="bd-svc-amt">{x.price > 0 ? money(x.price) : t('No charge')}</span>
              </div>
            ))}
          </div>
        )}

        {/* expert */}
        {b.pro_name && (
          <div className="ord-block">
            <div className="ord-block-h">{t('Worker Details')}</div>
            <div className="ord-pro flat">
              <WorkerAvatar name={b.pro_name} src={b.pro?.avatar} size={40} />
              <div className="ord-pro-main">
                <div className="ord-pro-name">{b.pro_name}</div>
                <div className="ord-pro-meta">
                  {b.pro_rating ? <span className="ord-rate">{b.pro_rating}<Star size={11} className="ord-star" /></span> : null}
                  {b.pro?.reviewsCount ? <span className="muted"> {t('({n} reviews)', { n: b.pro.reviewsCount })}</span> : null}
                </div>
              </div>
              {live && <button className="ord-call" onClick={() => nav(`/job/${b.id}/call`)} aria-label={t('Call expert')}><Phone size={16} /></button>}
            </div>
          </div>
        )}

        {/* schedule + address */}
        <div className="ord-block">
          <Row k={t('Date & Time')} v={b.type === 'instant' ? `${t('Instant')} · ${dt(b.created)}` : scheduleDisplay(b)} />
          {b.started_at && <Row k={t('Started')} v={dt(b.started_at)} />}
          {b.completed_at && <Row k={t('Completed')} v={dt(b.completed_at)} />}
          {dur && <Row k={t('Duration worked')} v={dur} />}
          <Row k={t('Address')} v={b.address || '—'} />
        </div>

        {/* payment */}
        <div className="ord-block">
          <div className="ord-block-h">{t('Payment Summary')}</div>
          <Row k={t('Service Charges')} v={money(b.subtotal)} />
          <Row k={t('Platform Fee')} v={money(b.fee)} />
          {b.tax > 0 && <Row k={t('Taxes & GST')} v={money(b.tax)} />}
          {b.discount > 0 && <Row k={`${t('Discount')}${b.coupon ? ` (${b.coupon})` : ''}`} v={<span className="green">− {money(b.discount)}</span>} />}
          <div className="ord-sep" />
          <Row k={<b>{b.payment_status === 'paid' ? t('Total Paid') : t('Total Payable')}</b>} v={<b>{money(b.total)}</b>} />
          {(b.extension_total ?? 0) > 0 && (
            <>
              <Row k={t('Extra time ({n} min)', { n: b.extension_minutes || 0 })} v={money(b.extension_total)} />
              <div className="ord-sep" />
              <Row k={<b>{t('Total incl. extensions')}</b>} v={<b>{money(b.total + (b.extension_total || 0))}</b>} />
            </>
          )}
          <Row k={t('Method')} v={`${(b.payment || '').toUpperCase()} · ${b.payment_status}`} />
          {/* The real gateway payment id when paid online — the id Razorpay and support look up. */}
          {b.payment_ref
            ? <Row k={t('Transaction ID')} v={b.payment_ref} />
            : b.status === 'completed' && <Row k={t('Transaction ID')} v={txnRef(b)} />}
          {(b.refund ?? 0) > 0 && (() => {
            const toSource = Math.min(b.refund || 0, b.refund_to_source || 0), toWallet = (b.refund || 0) - toSource
            return (
              <>
                {toSource > 0 && <Row k={t('Refunded')} v={<span className="green">{t('{amt} to your UPI / card', { amt: money(toSource) })}</span>} />}
                {toWallet > 0 && <Row k={toSource > 0 ? '' : t('Refunded')} v={<span className="green">{t('{amt} to wallet', { amt: money(toWallet) })}</span>} />}
                {b.refund_status === 'failed' && <Row k={t('Refund status')} v={<span style={{ color: 'var(--red)' }}>{t('Failed — please contact support')}</span>} />}
              </>
            )
          })()}
          {b.status === 'cancelled' && b.cancel_reason && <Row k={t('Cancel reason')} v={b.cancel_reason} />}
        </div>

        {/* your feedback */}
        {(b.rating || b.review) && (
          <div className="ord-block">
            <div className="ord-block-h">{t('Your Feedback')}</div>
            {b.rating ? <Row k={t('Rating')} v={<span className="ord-rate">{b.rating}<Star size={11} className="ord-star" /></span>} /> : null}
            {b.review ? <Row k={t('Review')} v={b.review} /> : null}
          </div>
        )}

        {b.work_photo && (
          <div className="ord-block">
            <div className="ord-block-h">{t('Proof of Work')}</div>
            <img src={b.work_photo} alt={t('Proof of Work')} className="bd-photo" />
          </div>
        )}

        {/* secondary actions — unchanged behaviour, restyled */}
        <div className="bd-acts">
          {b.status === 'completed' && !b.rating && <button className="bd-act" onClick={() => nav(`/rate/${b.id}`)}>⭐ {t('Rate')}</button>}
          {(b.status === 'completed' || b.status === 'cancelled') && <button className="bd-act" onClick={() => nav(`/rebook/${b.id}`)}>🔁 {t('Rebook')}</button>}
          {b.status === 'completed' && <button className="bd-act" onClick={() => nav(`/tip/${b.id}`)}>💜 {t('Tip')}</button>}
          {b.status === 'completed' && <button className="bd-act" onClick={() => nav(`/complaint/${b.id}`)}>⚠️ {t('Report')}</button>}
        </div>

        {/* primary CTA sits in the page, as in the design — not a fixed footer bar */}
        <div className="bd-cta">
          {live && <button className="btn" onClick={() => nav(`/job/${b.id}`)}>{t('Track Booking')}</button>}
          {b.status === 'completed' && <button className="btn" onClick={() => nav(`/invoice/${b.id}`)}>{t('View Invoice')}</button>}
        </div>
      </div>

      {menu && <div className="bd-menu-back" onClick={() => setMenu(false)} />}
    </div>
  )
}
