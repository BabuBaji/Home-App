import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarCheck, Copy } from 'lucide-react'
import { Loading, useToast } from '../components/UI'
import { fetchBooking, fetchMe } from '../api'
import type { Booking, Address } from '../types'
import { t } from '../i18n'

// Module 5 · #40 — Booking Confirmed. Real booking via fetchBooking. UI redesigned to the mock;
// the OTP + live tracking live on the Track screen (unchanged). No backend change.
export default function Confirmed() {
  const { id } = useParams()
  const bid = Number(id)
  const nav = useNavigate()
  const toast = useToast()
  const [b, setB] = useState<Booking | null>(null)
  const [addr, setAddr] = useState<Address | null>(null)

  useEffect(() => {
    fetchBooking(bid).then(setB).catch(() => toast(t('Could not load booking')))
    fetchMe().then(({ addresses }) => setAddr(addresses.find((a) => a.is_default) || addresses[0] || null)).catch(() => {})
  }, [bid])

  if (!b) return <div className="screen m2"><Loading /></div>

  const when = b.type === 'instant' ? t('Now') : `${b.date || t('Scheduled')}, ${b.time || ''}`.trim()
  const paid = b.payment === 'wallet' ? 0 : b.total
  const bookingId = b.ref || `BK${b.id}`

  return (
    <div className="screen m2">
      <div className="ps-top">
        <button className="au-back" onClick={() => nav('/home', { replace: true })} aria-label={t('Home')}><ArrowLeft size={22} /></button>
        <span /><span style={{ width: 42 }} />
      </div>
      <div className="content bc-body">
        <div className="bc-ic"><CalendarCheck size={46} /></div>
        <h1 className="bc-title">{t('Booking Confirmed!')}</h1>
        <p className="bc-sub">{t('Your booking is confirmed.')}</p>

        <button className="bc-id" onClick={() => { navigator.clipboard?.writeText(bookingId); toast(t('Booking ID copied')) }}>
          <div><small>{t('Booking ID')}</small><b>{bookingId}</b></div><Copy size={16} />
        </button>

        <div className="bc-rows">
          <div className="bc-row"><span>{t('Service')}</span><b>{b.items.map((i) => i.name).join(', ')}</b></div>
          <div className="bc-row"><span>{t('Date & Time')}</span><b>{when}</b></div>
          <div className="bc-row"><span>{t('Worker')}</span><b>{b.pro_name || t('Being assigned')}</b></div>
          <div className="bc-row"><span>{t('Address')}</span><b className="bc-addr">{b.address || addr?.line || '—'}</b></div>
          <div className="bc-row"><span>{t('Amount Paid')}</span><b>₹{paid}</b></div>
        </div>
      </div>
      <div className="au-foot" style={{ display: 'grid', gap: 8 }}>
        <button className="au-btn" onClick={() => nav(`/job/${b.id}`, { replace: true })}>{t('Track Your Booking')}</button>
        <button className="au-btn ghost" onClick={() => nav(`/tracking/${b.id}`, { replace: true })} style={{ background: 'transparent', color: '#5b51e8', border: '1.5px solid #ddd8fb' }}>{t('Booking Timeline')}</button>
      </div>
    </div>
  )
}
