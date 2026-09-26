// Repeat bookings — the customer's daily/weekly/… plans. Each visit is booked a day ahead as a
// normal scheduled booking; here they can pause, resume or stop a plan.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Repeat } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { fetchRecurring, updateRecurring, type RecurringPlan } from '../../api'
import { t } from '../../i18n'

const FREQ_LABEL: Record<string, string> = { daily: 'Every day', alternate: 'Every 2 days', weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month' }

export default function RepeatBookings() {
  const nav = useNavigate()
  const toast = useToast()
  const [plans, setPlans] = useState<RecurringPlan[] | null>(null)
  useEffect(() => { fetchRecurring().then(setPlans).catch(() => setPlans([])) }, [])

  async function act(p: RecurringPlan, action: 'pause' | 'resume' | 'cancel') {
    try {
      const u = await updateRecurring(p.id, action)
      setPlans((ps) => (ps || []).filter((x) => action !== 'cancel' || x.id !== p.id).map((x) => (x.id === p.id ? u : x)))
      toast(action === 'cancel' ? t('Repeat visits stopped') : action === 'pause' ? t('Paused') : t('Resumed'))
    } catch (e) { toast((e as Error).message) }
  }

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={18} /></button>
        <div className="titles"><h1>{t('Repeat bookings')}</h1></div>
        <span className="iconbtn ghost" />
      </header>
      <div className="content">
        {!plans ? <Loading /> : plans.length === 0 ? (
          <p className="muted" style={{ padding: '24px 4px' }}>{t('No repeat visits yet. Choose Daily or Weekly when you book a service.')}</p>
        ) : plans.map((p) => (
          <div key={p.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Repeat size={18} />
              <div style={{ flex: 1 }}>
                <b>{p.items.map((i) => i.id).join(', ')} · {p.time}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>{t(FREQ_LABEL[p.freq] || p.freq)} · {t('pay by {method}', { method: p.payment })}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{p.status === 'paused' ? t('Paused') : t('Next visit {date}', { date: p.nextDate })}</div>
                {p.lastError && <div style={{ fontSize: 12, color: '#c2410c' }}>{t('Last visit not booked: {err}', { err: p.lastError })}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {p.status === 'active'
                ? <button className="btn-ghost" style={{ flex: 1 }} onClick={() => act(p, 'pause')}>{t('Pause')}</button>
                : <button className="btn-ghost" style={{ flex: 1 }} onClick={() => act(p, 'resume')}>{t('Resume')}</button>}
              <button className="btn-ghost" style={{ flex: 1, color: '#dc2626' }} onClick={() => act(p, 'cancel')}>{t('Stop')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
