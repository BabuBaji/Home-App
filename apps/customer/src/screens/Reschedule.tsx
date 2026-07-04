import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header, FooterCTA, useToast } from '../components/UI'
import Calendar, { startOfDay, fmtDate, SLOT_HOURS, slotLabel, isSlotDisabled, sameDay } from '../components/Calendar'
import { rescheduleBookingApi } from '../api'

export default function Reschedule() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [selDate, setSelDate] = useState<Date>(startOfDay(new Date()))
  const [slot, setSlot] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const slots = useMemo(() => SLOT_HOURS.map((h) => ({ h, label: slotLabel(h), disabled: isSlotDisabled(selDate, h) })), [selDate])
  useEffect(() => {
    if (slot === null || isSlotDisabled(selDate, slot)) { const f = slots.find((s) => !s.disabled); setSlot(f ? f.h : null) }
  }, [selDate]) // eslint-disable-line

  async function confirm() {
    if (slot === null) return toast('Please pick a time slot')
    setBusy(true)
    try { await rescheduleBookingApi(Number(id), fmtDate(selDate), slotLabel(slot)); toast('Booking rescheduled'); setTimeout(() => nav(`/track/${id}`, { replace: true }), 600) }
    catch (e) { toast((e as Error).message); setBusy(false) }
  }

  return (
    <div className="screen">
      <Header title="Reschedule Booking" subtitle="Pick a new date & time" />
      <div className="content pad-cta">
        <h3 className="section-title">Select date</h3>
        <Calendar value={selDate} onChange={setSelDate} />
        <h3 className="section-title">New time slot {sameDay(selDate, startOfDay(new Date())) ? '(today)' : ''}</h3>
        {slots.every((s) => s.disabled) ? (
          <div className="note-box">No more slots today — please pick another date.</div>
        ) : (
          <div className="slot-grid">
            {slots.map((s) => <button key={s.h} className={`slot ${slot === s.h ? 'sel' : ''}`} disabled={s.disabled} onClick={() => setSlot(s.h)}>{s.label}</button>)}
          </div>
        )}
        <div className="note-box" style={{ marginTop: 12 }}>📅 {fmtDate(selDate)}{slot !== null ? `, ${slotLabel(slot)}` : ''}</div>
      </div>
      <FooterCTA><button className="btn full" onClick={confirm} disabled={busy}>{busy ? 'Updating…' : 'Confirm New Slot'}</button></FooterCTA>
    </div>
  )
}
