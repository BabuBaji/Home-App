// 112 · Cancellation — reached from Support. The full cancel form (reasons + real refund quote +
// Confirm) already exists at /cancel/:id, so this picks the most recent cancellable booking and
// opens it there. If several are cancellable, the customer chooses.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Loading } from '../../components/UI'
import OrderCard from '../../components/OrderCard'
import { fetchBookings } from '../../api'
import { isLive } from '../../orders'
import type { Booking } from '../../types'

export default function Cancellation() {
  const nav = useNavigate()
  const [items, setItems] = useState<Booking[] | null>(null)

  useEffect(() => { fetchBookings().then(setItems).catch(() => setItems([])) }, [])

  const cancellable = (items || []).filter((b) => isLive(b.status))

  // Exactly one to cancel → jump straight into the cancel form.
  useEffect(() => {
    if (items && cancellable.length === 1) nav(`/cancel/${cancellable[0].id}`, { replace: true })
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Cancel Booking</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!items) return <div className="screen">{head}<Loading /></div>

  return (
    <div className="screen">
      {head}
      <div className="content">
        {cancellable.length === 0 ? (
          <div className="state"><div className="ico">🗓</div><h3>No bookings to cancel</h3><p>Only upcoming or in-progress bookings can be cancelled.</p></div>
        ) : (
          <>
            <div className="rs-sec">Choose a booking to cancel</div>
            <div className="ord-list">
              {cancellable.map((b) => <OrderCard key={b.id} b={b} onClick={() => nav(`/cancel/${b.id}`)} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
