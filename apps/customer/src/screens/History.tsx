// 78 · Usage History — matches the Module 10 design: funnel filter, All/Bookings/Add-ons/Discounts
// chips, month-grouped rows, and a "View More History" pager. Full-screen (reached from the Home
// History button). No subscription/membership backend exists, so rows carry the REAL amount paid
// and the REAL coupon discount when one applied — never a fabricated plan discount; Add-ons and
// Discounts simply have no data yet and show empty states.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Filter, ChevronRight, Check } from 'lucide-react'
import { Loading } from '../components/UI'
import { pushBackHandler } from '../backStack'
import { fetchBookings } from '../api'
import { byMonth, durationLabel, isLive } from '../orders'
import type { Booking } from '../types'
import { t, dateLocale } from '../i18n'

type Tab = 'All' | 'Bookings' | 'Add-ons' | 'Discounts'
const TABS: Tab[] = ['All', 'Bookings', 'Add-ons', 'Discounts']
const PAGE = 6   // rows shown before "View More History"
const money = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`

// There is no add-on data model, so the Add-ons tab is intentionally empty until one exists.
const inTab = (b: Booking, t: Tab) =>
  t === 'Discounts' ? (b.discount ?? 0) > 0 : t === 'Add-ons' ? false : true

export default function History() {
  const nav = useNavigate()
  const [items, setItems] = useState<Booking[] | null>(null)
  const [tab, setTab] = useState<Tab>('All')
  const [sort, setSort] = useState<'new' | 'old'>('new')
  const [showSort, setShowSort] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => { fetchBookings().then(setItems).catch(() => setItems([])) }, [])
  useEffect(() => { if (showSort) return pushBackHandler(() => setShowSort(false)) }, [showSort])
  useEffect(() => { setLimit(PAGE) }, [tab, sort])   // reset the pager when the view changes

  const past = useMemo(() => {
    if (!items) return []
    return items.filter((b) => !isLive(b.status) && inTab(b, tab))
      .sort((a, b) => sort === 'new' ? +new Date(b.created) - +new Date(a.created) : +new Date(a.created) - +new Date(b.created))
  }, [items, tab, sort])

  const groups = useMemo(() => byMonth(past.slice(0, limit)), [past, limit])
  const hasMore = past.length > limit

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/home'))} aria-label={t('Back')}><ArrowLeft size={18} /></button>
      <div className="titles"><h1>{t('Usage History')}</h1></div>
      <button className="iconbtn" onClick={() => setShowSort(true)} aria-label={t('Filter')}><Filter size={18} /></button>
    </header>
  )
  if (!items) return <div className="screen">{head}<Loading /></div>

  const dm = (b: Booking) => {
    const d = new Date(b.completed_at || b.scheduled_at || b.created)
    return { day: d.toLocaleDateString('en-IN', { day: '2-digit' }), mon: d.toLocaleDateString(dateLocale(), { month: 'short' }) }
  }

  return (
    <div className="screen">
      {head}
      <div className="content">
        <div className="ord-chips">
          {TABS.map((tb) => (
            <button key={tb} className={`ord-chip ${tab === tb ? 'active' : ''}`} onClick={() => setTab(tb)}>{t(tb)}</button>
          ))}
        </div>

        {groups.length === 0 && (
          <div className="state"><div className="ico">🕘</div>
            <h3>{tab === 'All' ? t('No usage yet') : t('No {kind} usage yet', { kind: t(tab).toLowerCase() })}</h3>
            <p>{tab === 'Add-ons' ? t('Add-on purchases will appear here.') : t("Services you've completed will appear here.")}</p>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.key} className="ord-month">
            <h2 className="ord-month-h">{g.label}</h2>
            <div className="uh-list">
              {g.items.map((b) => {
                const m = dm(b)
                const dur = durationLabel(b)
                const primary = b.items[0]
                const extra = b.items.length - 1
                const disc = b.discount ?? 0
                // Third line mirrors the mockup's green "Gold Plan Discount" slot, with the real
                // reason: the coupon that was applied, else the booking's outcome.
                const note = disc > 0 ? (b.coupon ? t('{code} discount', { code: b.coupon }) : t('Discount applied'))
                  : b.status === 'cancelled' ? t('Cancelled') : t('Completed')
                const noteCls = disc > 0 ? 'saved' : b.status === 'cancelled' ? 'cancel' : 'ok'
                return (
                  <button key={b.id} className="uh-row" onClick={() => nav(`/booking-details/${b.id}`)}>
                    <span className="uh-med"><span className="uh-med-d">{m.day}</span><span className="uh-med-m">{m.mon}</span></span>
                    <span className="uh-main">
                      <span className="uh-name">{primary?.name}{extra > 0 ? ` +${extra}` : ''}</span>
                      {dur && <span className="uh-sub">{dur}</span>}
                      <span className={`uh-note ${noteCls}`}>{note}</span>
                    </span>
                    <span className={`uh-amt ${disc > 0 ? 'saved' : ''}`}>{disc > 0 ? `− ${money(disc)}` : money(b.total)}</span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}

        {hasMore && (
          <button className="uh-more" onClick={() => setLimit((n) => n + PAGE)}>
            {t('View More History')} <ChevronRight size={16} />
          </button>
        )}
      </div>

      {showSort && (
        <div className="sheet-wrap" onClick={() => setShowSort(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-h">{t('Sort by')}</div>
            {([['new', 'Newest first'], ['old', 'Oldest first']] as const).map(([v, label]) => (
              <button key={v} className="sheet-row" onClick={() => { setSort(v); setShowSort(false) }}>
                <span>{t(label)}</span>{sort === v && <Check size={16} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
