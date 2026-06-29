import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, FooterCTA, useToast } from '../components/UI'
import Calendar, { startOfDay, fmtDate, SLOT_HOURS, slotLabel, isSlotDisabled, sameDay } from '../components/Calendar'
import { useStore } from '../store'

export default function Schedule() {
  const nav = useNavigate()
  const toast = useToast()
  const { bookingType, setBookingType, setDate, setTime } = useStore()
  const [selDate, setSelDate] = useState<Date>(startOfDay(new Date()))
  const [slot, setSlot] = useState<number | null>(null)

  // first available slot for the chosen day
  const slots = useMemo(() => SLOT_HOURS.map((h) => ({ h, label: slotLabel(h), disabled: isSlotDisabled(selDate, h) })), [selDate])

  // when date changes, if current slot is now invalid, reset to first available
  useEffect(() => {
    if (slot === null || isSlotDisabled(selDate, slot)) {
      const first = slots.find((s) => !s.disabled)
      setSlot(first ? first.h : null)
    }
  }, [selDate]) // eslint-disable-line

  function next() {
    if (bookingType === 'schedule') {
      if (slot === null) return toast('Please pick a time slot')
      setDate(fmtDate(selDate)); setTime(slotLabel(slot))
    }
    nav('/summary')
  }

  return (
    <div className="screen">
      <Header title="When do you need it?" />
      <div className="content pad-cta">
        <div className={`opt ${bookingType === 'instant' ? 'active' : ''}`} onClick={() => setBookingType('instant')}>
          <span className="oicon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>⚡</span>
          <div className="obody"><h3>Book Now</h3><p>An expert arrives in <b>10-15 minutes</b></p>
            <span className="chip" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>Fastest · ETA 12 min</span></div>
          <span className="radio">{bookingType === 'instant' ? '✓' : ''}</span>
        </div>
        <div className={`opt ${bookingType === 'schedule' ? 'active' : ''}`} onClick={() => setBookingType('schedule')}>
          <span className="oicon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>📅</span>
          <div className="obody"><h3>Schedule Later</h3><p>Pick a date &amp; time slot that works for you</p></div>
          <span className="radio">{bookingType === 'schedule' ? '✓' : ''}</span>
        </div>

        {bookingType === 'schedule' && (
          <>
            <h3 className="section-title">Select date</h3>
            <Calendar value={selDate} onChange={setSelDate} />
            <h3 className="section-title">Available slots {sameDay(selDate, startOfDay(new Date())) ? '(today)' : ''}</h3>
            {slots.every((s) => s.disabled) ? (
              <div className="note-box">No more slots today — please pick another date.</div>
            ) : (
              <div className="slot-grid">
                {slots.map((s) => (
                  <button key={s.h} className={`slot ${slot === s.h ? 'sel' : ''}`} disabled={s.disabled} onClick={() => setSlot(s.h)}>{s.label}</button>
                ))}
              </div>
            )}
            <div className="note-box" style={{ marginTop: 12 }}>📅 {fmtDate(selDate)}{slot !== null ? `, ${slotLabel(slot)}` : ''}</div>
          </>
        )}
      </div>
      <FooterCTA>
        <button className="btn full" onClick={next}>
          {bookingType === 'instant' ? 'Continue · Arrives in ~12 min' : `Continue · ${fmtDate(selDate)}${slot !== null ? `, ${slotLabel(slot)}` : ''}`}
        </button>
      </FooterCTA>
    </div>
  )
}
