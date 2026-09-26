// UPI & Card Payments — every online payment the customer made (or tried to), from the payment
// service's ledger: the Razorpay payment id, what it paid for, why a failed one failed, and each
// refund sent back to the card/UPI with its status. Tap a row for the full details.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CreditCard, ChevronDown, ChevronUp } from 'lucide-react'
import { Loading } from '../../components/UI'
import { fetchPaymentTransactions, type PaymentTxn } from '../../api'
import { byMonth, money2, stamp } from '../../wallet'
import { t } from '../../i18n'

type Tab = 'All' | 'Paid' | 'Refunded' | 'Failed'
const TABS: Tab[] = ['All', 'Paid', 'Refunded', 'Failed']

const PURPOSE: Record<string, string> = {
  booking: 'Service booking', wallet_topup: 'Added to wallet', extension: 'Extra service time',
  tip: 'Tip for expert', extra: 'Extra work', membership: 'Membership',
}
const REFUND_STATUS: Record<string, string> = { pending: 'Processing', processed: 'Credited', failed: 'Failed — added to wallet' }

export default function PaymentHistory() {
  const nav = useNavigate()
  const [rows, setRows] = useState<PaymentTxn[] | null>(null)
  const [tab, setTab] = useState<Tab>('All')
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => { fetchPaymentTransactions().then(setRows).catch(() => setRows([])) }, [])

  const groups = useMemo(() => {
    if (!rows) return []
    const list = rows.filter((r) => tab === 'All'
      || (tab === 'Failed' && r.status === 'failed')
      || (tab === 'Refunded' && r.refunds.length > 0)
      || (tab === 'Paid' && r.status === 'paid'))
    return byMonth(list, (r) => r.created)
  }, [rows, tab])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={18} /></button>
      <div className="titles"><h1>{t('UPI & Card Payments')}</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (!rows) return <div className="screen">{head}<Loading /></div>

  return (
    <div className="screen">
      {head}
      <div className="content">
        <div className="ord-chips">
          {TABS.map((tb) => <button key={tb} className={`ord-chip ${tab === tb ? 'active' : ''}`} onClick={() => setTab(tb)}>{t(tb)}</button>)}
        </div>

        {groups.length === 0 && (
          <div className="state"><div className="ico">💳</div><h3>{t('No payments')}</h3><p>{t('Payments you make by UPI or card show up here.')}</p></div>
        )}

        {groups.map((g) => (
          <section key={g.key} className="ord-month">
            <h2 className="ord-month-h">{g.label}</h2>
            <div className="wt-list">
              {g.items.map((r) => {
                const failed = r.status === 'failed'
                const isOpen = open === r.id
                const tag = failed ? t('Failed') : r.refunded >= r.amount ? t('Refunded') : r.refunded > 0 ? t('Part refunded') : t('Paid')
                return (
                  <div key={r.id}>
                    <button className="wt-row tap" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
                      <span className={`wt-ico ${failed ? 'debit' : 'credit'}`}><CreditCard size={15} /></span>
                      <div className="wt-main">
                        <div className="wt-title">{t(PURPOSE[r.purpose || ''] || 'Online payment')}</div>
                        <div className="wt-when">{stamp(r.created)}</div>
                      </div>
                      <div className="wt-right">
                        <div className={`wt-amt ${failed ? 'debit' : 'credit'}`}>{money2(r.amount)}</div>
                        <div className={`wt-tag ${failed ? 'debit' : r.refunded > 0 ? 'pending' : 'credit'}`}>{tag}</div>
                      </div>
                      {isOpen ? <ChevronUp size={15} className="ws-chev" /> : <ChevronDown size={15} className="ws-chev" />}
                    </button>
                    {isOpen && (
                      <div className="card pad" style={{ margin: '4px 0 10px' }}>
                        <div className="kv"><span className="k">{t('Transaction ID')}</span><span className="v">{r.paymentId || '—'}</span></div>
                        <div className="kv"><span className="k">{t('Order ID')}</span><span className="v">{r.orderId}</span></div>
                        <div className="kv"><span className="k">{t('Amount')}</span><span className="v">{money2(r.amount)}</span></div>
                        {failed && <div className="kv"><span className="k">{t('Reason')}</span><span className="v" style={{ color: 'var(--red)' }}>{r.failureReason || t('Payment failed')}</span></div>}
                        {failed && <p className="muted sm" style={{ marginTop: 6 }}>{t('No money was taken for a failed payment. If your bank shows a debit, it is returned automatically within 5–7 working days.')}</p>}
                        {r.refunds.map((f) => (
                          <div key={f.id} className="kv">
                            <span className="k">{t('Refund {amt}', { amt: money2(f.amount) })} · {stamp(f.updated || f.created)}</span>
                            <span className="v" style={{ color: f.status === 'processed' ? 'var(--green)' : f.status === 'failed' ? 'var(--red)' : 'var(--orange)' }}>{t(REFUND_STATUS[f.status] || f.status)}</span>
                          </div>
                        ))}
                        {r.bookingId && <button className="btn-text" style={{ padding: 0, marginTop: 8 }} onClick={() => nav(`/booking-details/${r.bookingId}`)}>{t('View booking ›')}</button>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
