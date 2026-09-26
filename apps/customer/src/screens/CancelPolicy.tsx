import { useEffect, useState } from 'react'
import { Header, Loading } from '../components/UI'
import { fetchCancellationPolicy, type CancellationPolicy } from '../api'
import { t } from '../i18n'

// Read-only "Cancellation & Refund Policy" page. Values come from the backend so the
// page always matches what the cancellation engine actually charges.
export default function CancelPolicy() {
  const [p, setP] = useState<CancellationPolicy | null>(null)
  useEffect(() => { fetchCancellationPolicy().then(setP).catch(() => setP({
    travelFee: 50, arrivalPct: 100, commissionPct: 20, schedFullHrs: 6, schedHalfHrs: 3, schedHalfPct: 50,
  })) }, [])
  if (!p) return <div className="screen"><Header title={t('Cancellation Policy')} /><Loading /></div>

  const eg = 500
  const egTravel = Math.max(0, eg - p.travelFee)
  const egArrived = Math.round((eg * (100 - p.arrivalPct)) / 100)
  const egSchedHalf = Math.round((eg * p.schedHalfPct) / 100)

  return (
    <div className="screen">
      <Header title={t('Cancellation & Refund Policy')} />
      <div className="content">
        <p className="muted sm" style={{ margin: '4px 2px 14px' }}>
          {t('How much you get back depends on when you cancel. We keep it simple: cancel early and it’s free — the later you cancel, the more it costs.')}
        </p>

        {/* Instant bookings */}
        <h3 className="section-title">{t('Instant bookings')}</h3>
        <div className="card pad">
          <PolicyRow label={t('Before a helper is assigned')} value={t('Full refund')} tone="green" />
          <PolicyRow label={t('Helper assigned, not travelling yet')} value={t('Full refund')} tone="green" />
          <PolicyRow label={t('Helper is on the way')} value={t('Refund minus ₹{fee} travel fee', { fee: p.travelFee })} tone="amber" />
          <PolicyRow label={t('Helper has arrived')} value={p.arrivalPct >= 100 ? t('No refund') : t('{pct}% refund', { pct: 100 - p.arrivalPct })} tone="red" />
          <PolicyRow label={t('Service already started')} value={t('Can’t be cancelled')} tone="red" last />
        </div>

        {/* Scheduled bookings */}
        <h3 className="section-title">{t('Scheduled bookings')}</h3>
        <div className="card pad">
          <PolicyRow label={t('More than {h} hrs before your slot', { h: p.schedFullHrs })} value={t('Full refund')} tone="green" />
          <PolicyRow label={t('{a}–{b} hrs before your slot', { a: p.schedHalfHrs, b: p.schedFullHrs })} value={t('{pct}% refund', { pct: p.schedHalfPct })} tone="amber" />
          <PolicyRow label={t('Less than {h} hrs before / no-show', { h: p.schedHalfHrs })} value={t('No refund')} tone="red" last />
        </div>

        {/* Refunds */}
        <h3 className="section-title">{t('Your refund')}</h3>
        <div className="card pad">
          <div className="kv"><span className="k">{t('Where it goes')}</span><span className="v">{t('HomeHelp wallet')}</span></div>
          <div className="kv"><span className="k">{t('How fast')}</span><span className="v">{t('Instant')}</span></div>
          <div className="divider" />
          <p className="muted sm" style={{ marginTop: 2 }}>{t('Cash bookings aren’t prepaid, so there’s nothing to refund when you cancel.')}</p>
        </div>

        {/* Worked example */}
        <h3 className="section-title">{t('Example — a ₹{amount} booking', { amount: eg })}</h3>
        <div className="card pad">
          <div className="kv"><span className="k">{t('Cancel before helper leaves')}</span><span className="v" style={{ color: 'var(--green)' }}>{t('₹{amount} back', { amount: eg })}</span></div>
          <div className="kv"><span className="k">{t('Cancel while helper is on the way')}</span><span className="v">{t('₹{amount} back', { amount: egTravel })}</span></div>
          <div className="kv"><span className="k">{t('Cancel after helper arrives')}</span><span className="v">{t('₹{amount} back', { amount: egArrived })}</span></div>
          <div className="kv"><span className="k">{t('Scheduled, cancel {a}–{b} hrs early', { a: p.schedHalfHrs, b: p.schedFullHrs })}</span><span className="v">{t('₹{amount} back', { amount: egSchedHalf })}</span></div>
        </div>

        <p className="muted sm" style={{ margin: '14px 2px 24px' }}>
          {t('If a helper cancels on you, or doesn’t arrive, you always get a full refund — and often a compensation coupon. Need help with a specific booking? Contact support from the Help & Support screen.')}

        </p>
      </div>
    </div>
  )
}

function PolicyRow({ label, value, tone, last }: { label: string; value: string; tone: 'green' | 'amber' | 'red'; last?: boolean }) {
  const color = tone === 'green' ? 'var(--green)' : tone === 'amber' ? '#f59e0b' : 'var(--red, #e5484d)'
  return (
    <>
      <div className="kv" style={{ alignItems: 'flex-start', gap: 12 }}>
        <span className="k" style={{ flex: 1 }}>{label}</span>
        <span className="v" style={{ color, fontWeight: 600, textAlign: 'right' }}>{value}</span>
      </div>
      {!last && <div className="divider" />}
    </>
  )
}
