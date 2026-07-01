import { useEffect, useState } from 'react'
import { Header, Loading } from '../components/UI'
import { fetchCancellationPolicy, type CancellationPolicy } from '../api'

// Read-only "Cancellation & Refund Policy" page. Values come from the backend so the
// page always matches what the cancellation engine actually charges.
export default function CancelPolicy() {
  const [p, setP] = useState<CancellationPolicy | null>(null)
  useEffect(() => { fetchCancellationPolicy().then(setP).catch(() => setP({
    travelFee: 50, arrivalPct: 100, commissionPct: 20, schedFullHrs: 6, schedHalfHrs: 3, schedHalfPct: 50,
  })) }, [])
  if (!p) return <div className="screen"><Header title="Cancellation Policy" /><Loading /></div>

  const eg = 500
  const egTravel = Math.max(0, eg - p.travelFee)
  const egArrived = Math.round((eg * (100 - p.arrivalPct)) / 100)
  const egSchedHalf = Math.round((eg * p.schedHalfPct) / 100)

  return (
    <div className="screen">
      <Header title="Cancellation & Refund Policy" />
      <div className="content">
        <p className="muted sm" style={{ margin: '4px 2px 14px' }}>
          How much you get back depends on when you cancel. We keep it simple: cancel early and it’s free — the later you cancel, the more it costs.
        </p>

        {/* Instant bookings */}
        <h3 className="section-title">Instant bookings</h3>
        <div className="card pad">
          <PolicyRow label="Before a helper is assigned" value="Full refund" tone="green" />
          <PolicyRow label="Helper assigned, not travelling yet" value="Full refund" tone="green" />
          <PolicyRow label="Helper is on the way" value={`Refund minus ₹${p.travelFee} travel fee`} tone="amber" />
          <PolicyRow label="Helper has arrived" value={p.arrivalPct >= 100 ? 'No refund' : `${100 - p.arrivalPct}% refund`} tone="red" />
          <PolicyRow label="Service already started" value="Can’t be cancelled" tone="red" last />
        </div>

        {/* Scheduled bookings */}
        <h3 className="section-title">Scheduled bookings</h3>
        <div className="card pad">
          <PolicyRow label={`More than ${p.schedFullHrs} hrs before your slot`} value="Full refund" tone="green" />
          <PolicyRow label={`${p.schedHalfHrs}–${p.schedFullHrs} hrs before your slot`} value={`${p.schedHalfPct}% refund`} tone="amber" />
          <PolicyRow label={`Less than ${p.schedHalfHrs} hrs before / no-show`} value="No refund" tone="red" last />
        </div>

        {/* Refunds */}
        <h3 className="section-title">Your refund</h3>
        <div className="card pad">
          <div className="kv"><span className="k">Where it goes</span><span className="v">HomeHelp wallet</span></div>
          <div className="kv"><span className="k">How fast</span><span className="v">Instant</span></div>
          <div className="divider" />
          <p className="muted sm" style={{ marginTop: 2 }}>Cash bookings aren’t prepaid, so there’s nothing to refund when you cancel.</p>
        </div>

        {/* Worked example */}
        <h3 className="section-title">Example — a ₹{eg} booking</h3>
        <div className="card pad">
          <div className="kv"><span className="k">Cancel before helper leaves</span><span className="v" style={{ color: 'var(--green)' }}>₹{eg} back</span></div>
          <div className="kv"><span className="k">Cancel while helper is on the way</span><span className="v">₹{egTravel} back</span></div>
          <div className="kv"><span className="k">Cancel after helper arrives</span><span className="v">₹{egArrived} back</span></div>
          <div className="kv"><span className="k">Scheduled, cancel {p.schedHalfHrs}–{p.schedFullHrs} hrs early</span><span className="v">₹{egSchedHalf} back</span></div>
        </div>

        <p className="muted sm" style={{ margin: '14px 2px 24px' }}>
          If a helper cancels on you, or doesn’t arrive, you always get a full refund — and often a compensation coupon. Need help with a specific booking? Contact support from the Help &amp; Support screen.
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
