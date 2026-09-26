// Book again — the services this customer has actually had done, from their completed bookings
// ("You booked X 12 days ago"). Book opens the booking flow with the same duration preselected.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { Loading, useBack } from '../../components/UI'
import { ServiceThumb } from '../../serviceArt'
import { fetchBookings, fetchServices } from '../../api'
import { useStore } from '../../store'
import { bookAgain } from '../../aiHome'
import type { Booking, Service } from '../../types'
import { t } from '../../i18n'

export default function AIRecommendations() {
  const nav = useNavigate()
  const back = useBack('/profile')
  const { pincode } = useStore()
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [services, setServices] = useState<Service[] | null>(null)

  useEffect(() => {
    fetchBookings().then(setBookings).catch(() => setBookings([]))
    fetchServices(pincode || undefined).then((c) => setServices(c.services)).catch(() => setServices([]))
  }, [pincode])

  const list = useMemo(() => (bookings && services) ? bookAgain(bookings, services) : null, [bookings, services])
  const ago = (d: number) => d <= 0 ? t('today') : d === 1 ? t('yesterday') : t('{n} days ago', { n: d })

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={back} aria-label={t('Back')}><ArrowLeft size={18} /></button>
      <div className="titles"><h1>{t('Book again')}</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!list) return <div className="screen">{head}<Loading /></div>

  return (
    <div className="screen">
      {head}
      <div className="content">
        {list.length === 0 ? (
          <div className="state"><div className="ico"><RotateCcw size={40} /></div><h3>{t('Nothing to rebook yet')}</h3><p>{t('Services you have had done will appear here, so you can book them again in a tap.')}</p>
            <button className="btn" style={{ maxWidth: 220 }} onClick={() => nav('/home')}>{t('Browse services')}</button></div>
        ) : (
          <div className="air-list">
            {list.map((r) => (
              <div key={r.service.id} className="air-card">
                <span className="air-thumb"><ServiceThumb service={{ id: r.service.id, name: r.service.name, image: `/services/${r.service.id}.jpg` }} medallion={30} /></span>
                <div className="air-main">
                  <div className="air-name">{r.service.name}</div>
                  <div className="air-note">
                    {t('You booked this {when}', { when: ago(r.days) })}{r.times > 1 ? ` · ${t('{n} times', { n: r.times })}` : ''}
                  </div>
                </div>
                <button className="air-book" disabled={!r.service.available}
                  onClick={() => nav(`/booking/${r.service.id}`, { state: { durationId: r.durationId } })}>
                  {r.service.available ? t('Book') : t('Not available')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
