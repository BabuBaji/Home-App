// 79 · Renewal — renew (or reactivate) the active plan; pick a renewal cycle. Extends the real
// membership on the backend.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Smartphone } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { pickPlan, loadPlans, CYCLES, cyclePrice, money, type Plan } from '../../membership'
import { fetchMembership, renewMembership, type Membership } from '../../api'
import PaymentSheet from '../../components/PaymentSheet'
import { t, dateLocale } from '../../i18n'

const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export default function Renewal() {
  const nav = useNavigate()
  const toast = useToast()
  const [mem, setMem] = useState<Membership | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [cycle, setCycle] = useState('monthly')
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState(false)

  useEffect(() => {
    fetchMembership().then((m) => {
      setMem(m)
      if (!m.active && !m.plan) nav('/membership', { replace: true })
      else if (m.cycle) setCycle(m.cycle)
    }).catch(() => setMem({ active: false }))
  }, [nav])
  useEffect(() => { loadPlans().then(setPlans).catch(() => setPlans([])) }, [])

  if (!mem) return <div className="screen"><header className="appbar ord-appbar"><button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={20} /></button><div className="titles"><h1>{t('Renew Your Plan')}</h1></div><span className="iconbtn ghost" /></header><Loading /></div>

  const plan = pickPlan(plans, mem.plan || 'gold')

  const cyc = CYCLES.find((c) => c.key === cycle) || CYCLES[0]
  const amount = cyclePrice(plan.price, cyc.months, cyc.savePct).total
  // Renewal is paid up front through the payment sheet; the server renews only against that payment.
  const renew = async (paymentId?: string) => {
    if (busy) return
    if (!paymentId) { setSheet(true); return }
    setSheet(false)
    setBusy(true)
    try {
      await renewMembership({ cycle, paymentId })
      toast(t('Your plan has been renewed 🎉'))
      nav('/membership/active', { replace: true })
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not renew'))
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <div className="titles"><h1>{t('Renew Your Plan')}</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content pad-cta">
        <div className="ren-card">
          <div className="ren-name">{t('{name} Plan', { name: t(plan.name) })}</div>
          <div className="ren-price">{money(plan.price)} <small>{t('/month')}</small></div>
          <div className="ren-next">{mem.status === 'cancelled' ? t('Access Until') : t('Next Renewal')}<br /><b>{fmtDate(mem.renewsAt)}</b></div>
          <span className="ren-crown">👑</span>
        </div>

        <div className="mem-sec">{t('Choose Renewal Option')}</div>
        <div className="sub-cycles">
          {CYCLES.map((c) => {
            const cp = cyclePrice(plan.price, c.months, c.savePct)
            return (
              <button key={c.key} className={`sub-cycle ${cycle === c.key ? 'sel' : ''}`} onClick={() => setCycle(c.key)}>
                <span className={`sub-radio ${cycle === c.key ? 'on' : ''}`} />
                <span className="sub-cycle-l">{t(c.label)}</span>
                <span className="sub-cycle-p">{money(cp.total)}{c.months === 1 && <small>{t('/month')}</small>}</span>
                {cp.save > 0 && <span className="sub-cycle-save">{t('Save {amount}', { amount: money(cp.save) })}</span>}
              </button>
            )
          })}
        </div>

        <div className="mem-sec">{t('Payment Method')}</div>
        <div className="ren-pay">
          <Smartphone size={17} /><span>UPI</span><span className="sub-rec">{t('Recommended')}</span>
          <button className="ren-change" onClick={() => toast(t('Change payment — coming soon'))}>{t('Change')}</button>
        </div>
      </div>

      <div className="w-foot">
        <button className="btn full" disabled={busy} onClick={() => renew()}>{busy ? t('Processing…') : t('Pay {amount} & Renew', { amount: money(amount) })}</button>
        <div className="ren-note">{t('Renewing extends your plan from {date}', { date: fmtDate(mem.renewsAt) })}</div>

      </div>
      <PaymentSheet open={sheet} amount={amount} onClose={() => setSheet(false)} onPaid={(_m, id) => renew(id)} />
    </div>
  )
}
