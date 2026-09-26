// 76 · Subscribe — chosen plan, billing cycle, payment method. Creates a real membership on the
// backend, which records the subscription (and charges the wallet when that method is chosen).
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Smartphone, CreditCard, Building2, Wallet, ChevronRight } from 'lucide-react'
import { useToast } from '../../components/UI'
import { planByKey, pickPlan, loadPlans, CYCLES, cyclePrice, money } from '../../membership'
import { subscribeMembership } from '../../api'
import PaymentSheet from '../../components/PaymentSheet'
import { t } from '../../i18n'

export default function Subscribe() {
  const nav = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const key = params.get('plan') || 'gold'
  const [plan, setPlan] = useState(planByKey(key))
  useEffect(() => { loadPlans().then((ps) => setPlan(pickPlan(ps, key))).catch(() => setPlan(planByKey(key))) }, [key])
  const [cycle, setCycle] = useState('monthly')
  const [method, setMethod] = useState('upi')
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState(false)

  const active = CYCLES.find((c) => c.key === cycle) || CYCLES[0]
  const { total } = cyclePrice(plan.price, active.months, active.savePct)

  // Wallet pays on the server; any other method goes through the payment sheet first and the
  // server only activates the plan against that verified payment.
  const subscribe = async (paymentId?: string) => {
    if (busy) return
    if (method !== 'wallet' && !paymentId) { setSheet(true); return }
    setSheet(false)
    setBusy(true)
    try {
      await subscribeMembership({ plan: plan.key, cycle, method, payWithWallet: method === 'wallet', paymentId })
      toast(t('Welcome to {name}! 🎉', { name: t(plan.name) }))
      nav('/membership/active', { replace: true })
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Could not complete subscription'))
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <div className="titles"><h1>{t('Subscribe')}</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content pad-cta">
        <div className="sub-plan">
          <span className="sub-plan-crown">👑</span>
          {plan.popular && <span className="sub-plan-badge">{t('Most Popular')}</span>}
          <div className="sub-plan-name">{t('{name} Plan', { name: t(plan.name) })}</div>
          <div className="sub-plan-price">{money(plan.price)} <small>{t('/month')}</small></div>
          <ul className="sub-feats">{plan.features.slice(0, 4).map((f) => <li key={f}><Check size={13} /> {t(f)}</li>)}</ul>
        </div>

        <div className="sub-sec">{t('Choose Billing Cycle')}</div>
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

        <div className="sub-sec">{t('Payment Method')}</div>
        <div className="sub-methods">
          {[{ k: 'upi', icon: <Smartphone size={17} />, l: 'UPI', rec: true }, { k: 'card', icon: <CreditCard size={17} />, l: t('Card') }, { k: 'nb', icon: <Building2 size={17} />, l: t('Net Banking') }, { k: 'wallet', icon: <Wallet size={17} />, l: t('Wallet') }].map((m) => (
            <button key={m.k} className={`sub-method ${method === m.k ? 'sel' : ''}`} onClick={() => setMethod(m.k)}>
              {m.icon}<span>{m.l}</span>{m.rec && <span className="sub-rec">{t('Recommended')}</span>}
            </button>
          ))}
        </div>
        <button className="sub-more" onClick={() => toast(t('More payment options coming soon'))}>{t('More Options')} <ChevronRight size={16} /></button>
      </div>

      <div className="w-foot">
        <button className="btn full" disabled={busy} onClick={() => subscribe()}>{busy ? t('Processing…') : t('Pay {amount} & Subscribe', { amount: money(total) })}</button>
        <div className="sub-terms">{t('By continuing, you agree to our')} <button onClick={() => nav('/terms')}>{t('Terms & Conditions')}</button></div>

      </div>
      <PaymentSheet open={sheet} amount={total} onClose={() => setSheet(false)} onPaid={(_m, id) => subscribe(id)} />
    </div>
  )
}
