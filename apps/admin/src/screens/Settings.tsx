import { useEffect, useState } from 'react'
import {
  Save, KeyRound, Globe, SlidersHorizontal, Settings as Cog, ShieldCheck, Building2,
  Mail, Bell, Palette, Database, FileText, CreditCard, BadgeCheck, Users2, ChevronRight, Pencil,
} from 'lucide-react'
import { fetchSettings, updateSettings } from '../api'
import { Card, Field, Loading, ErrorState, useToast } from '../components/UI'
import { useStore, has } from '../store'

// Left vertical nav. Only "general" maps to live fields; others are placeholders.
const NAV = [
  { k: 'general', label: 'General Settings', Icon: Cog },
  { k: 'business', label: 'Business Profile', Icon: Building2 },
  { k: 'local', label: 'Localization', Icon: Globe },
  { k: 'payment', label: 'Payment Settings', Icon: CreditCard },
  { k: 'email', label: 'Email & SMS', Icon: Mail },
  { k: 'notif', label: 'Notification Settings', Icon: Bell },
  { k: 'security', label: 'Security', Icon: ShieldCheck },
  { k: 'appearance', label: 'Appearance', Icon: Palette },
  { k: 'integrations', label: 'Integrations', Icon: KeyRound },
  { k: 'backup', label: 'Backup & Data', Icon: Database },
  { k: 'audit', label: 'Audit Logs', Icon: FileText },
] as const

// Integration key fields. `secret` ones come back masked from the server.
const KEYS = [
  { k: 'razorpay_key_id', label: 'Razorpay Key ID', hint: 'rzp_live_… / rzp_test_…', secret: false },
  { k: 'razorpay_key_secret', label: 'Razorpay Key Secret', hint: 'Stored securely, enables live payments', secret: true },
  { k: 'razorpayx_account_number', label: 'RazorpayX Account Number', hint: 'Source account for worker payouts & penny-drop (from RazorpayX dashboard). Enables real payouts.', secret: false },
  { k: 'payout_mode', label: 'Payout Mode', hint: 'IMPS / NEFT / UPI (default IMPS)', secret: false },
  { k: 'payout_webhook_secret', label: 'Payout Webhook Secret', hint: 'Verifies RazorpayX payout & fund-account-validation webhooks', secret: true },
  { k: 'google_maps_key', label: 'Google Maps API Key', hint: 'Geocoding & live tracking maps', secret: true },
  { k: 'msg91_key', label: 'MSG91 / SMS Key', hint: 'Sends login OTPs. While this is empty, codes are returned in the API response instead (dev only).', secret: true },
  { k: 'msg91_otp_template_id', label: 'MSG91 OTP Template ID', hint: 'Required once the key is set — India needs a DLT-registered template or MSG91 rejects the send.', secret: false },
  { k: 'msg91_sender_id', label: 'MSG91 Sender ID', hint: '6-character DLT-approved sender, e.g. HHELP', secret: false },
  { k: 'firebase_server_key', label: 'Firebase Server Key', hint: 'Push notifications (FCM)', secret: true },
  { k: 'smtp_host', label: 'SMTP Host', hint: 'e.g. smtp.gmail.com', secret: false },
  { k: 'smtp_user', label: 'SMTP Username', hint: 'Email sender address', secret: false },
  { k: 'smtp_pass', label: 'SMTP Password', hint: 'App password', secret: true },
]

export default function SettingsScreen() {
  const toast = useToast()
  const { admin } = useStore()
  const [s, setS] = useState<Record<string, string> | null>(null)
  const [err, setErr] = useState('')
  const [nav, setNav] = useState<string>('general')
  const [busy, setBusy] = useState(false)
  const editable = has(admin, 'settings.edit')

  const load = () => { setErr(''); fetchSettings().then(setS).catch((e) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!s) return <Loading />

  const set = (k: string, v: string) => setS((p) => ({ ...p!, [k]: v }))
  const toggle = (k: string) => set(k, s[k] === 'true' ? 'false' : 'true')

  async function save() {
    setBusy(true)
    try { const updated = await updateSettings(s!); setS(updated); toast('Settings saved') } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: '232px 1fr 318px', gap: 16, alignItems: 'start' }}>
      {/* ---- left vertical nav ---- */}
      <Card className="settings-nav-card">
        <div className="minilist">
          {NAV.map((n) => (
            <button key={n.k} className="settings-navitem" onClick={() => setNav(n.k)}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                padding: '11px 12px', border: 'none', borderRadius: 11, marginBottom: 2, cursor: 'pointer',
                background: nav === n.k ? 'var(--violet-50)' : 'transparent',
                color: nav === n.k ? 'var(--violet)' : 'var(--ink-2)',
                fontWeight: nav === n.k ? 700 : 600, fontSize: 13.5,
                borderLeft: nav === n.k ? '3px solid var(--violet)' : '3px solid transparent',
              }}>
              <n.Icon size={17} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{n.label}</span>
              <ChevronRight size={15} style={{ color: 'var(--muted)' }} />
            </button>
          ))}
        </div>
      </Card>

      {/* ---- center form (General Settings) ---- */}
      <Card>
        <div className="card-head" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: 17 }}>General Settings</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>Manage your platform preferences and configuration.</p>
          </div>
          {editable && <button className="btn" disabled={busy} onClick={save}><Save size={16} /> {busy ? 'Saving…' : 'Save Changes'}</button>}
        </div>

        {/* Platform Information */}
        <h4 style={{ fontSize: 14.5, fontWeight: 800, margin: '14px 0 12px' }}>Platform Information</h4>
        <div className="form-grid">
          <Field label="Platform Name"><input disabled={!editable} value={s.platform_name || ''} onChange={(e) => set('platform_name', e.target.value)} /></Field>
          <Field label="Platform Tagline"><input disabled={!editable} value={s.platform_tagline || ''} onChange={(e) => set('platform_tagline', e.target.value)} placeholder="We make home services simple" /></Field>
          <Field label="Support Email"><input disabled={!editable} value={s.support_email || ''} onChange={(e) => set('support_email', e.target.value)} /></Field>
          <Field label="Support Phone"><input disabled={!editable} value={s.support_phone || ''} onChange={(e) => set('support_phone', e.target.value)} /></Field>
          <Field label="Company Legal Name (tax invoice)"><input disabled={!editable} value={s.company_name || ''} onChange={(e) => set('company_name', e.target.value)} placeholder="HomeHelp Services Pvt. Ltd." /></Field>
          <Field label="Company GSTIN"><input disabled={!editable} value={s.company_gstin || ''} onChange={(e) => set('company_gstin', e.target.value)} placeholder="36AABCH1234M1Z7" /></Field>
          <Field label="Registered Address (invoice)"><input disabled={!editable} value={s.company_address || ''} onChange={(e) => set('company_address', e.target.value)} placeholder="Street, City, State, PIN" /></Field>
          <Field label="State — Place of Supply"><input disabled={!editable} value={s.company_state || ''} onChange={(e) => set('company_state', e.target.value)} placeholder="Telangana" /></Field>
          <Field label="Service SAC Code"><input disabled={!editable} value={s.service_sac || ''} onChange={(e) => set('service_sac', e.target.value)} placeholder="9987" /></Field>
        </div>

        {/* Default Currency & Time */}
        <h4 style={{ fontSize: 14.5, fontWeight: 800, margin: '20px 0 12px' }}>Default Currency &amp; Time</h4>
        <div className="form-grid">
          <Field label="Currency">
            <select disabled={!editable} value={s.currency || 'INR'} onChange={(e) => set('currency', e.target.value)}>
              <option value="INR">INR - Indian Rupee (₹)</option>
              <option value="USD">USD - US Dollar ($)</option>
              <option value="EUR">EUR - Euro (€)</option>
            </select>
          </Field>
          <Field label="Timezone">
            <select disabled={!editable} value={s.timezone || 'Asia/Kolkata'} onChange={(e) => set('timezone', e.target.value)}>
              <option value="Asia/Kolkata">(GMT +05:30) Asia/Kolkata</option>
              <option value="UTC">(GMT +00:00) UTC</option>
            </select>
          </Field>
          <Field label="Date Format">
            <select disabled={!editable} value={s.date_format || 'DD MMM YYYY'} onChange={(e) => set('date_format', e.target.value)}>
              <option value="DD MMM YYYY">DD MMM YYYY (16 May 2025)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (05/16/2025)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (2025-05-16)</option>
            </select>
          </Field>
          <Field label="Time Format">
            <select disabled={!editable} value={s.time_format || '12h'} onChange={(e) => set('time_format', e.target.value)}>
              <option value="12h">12 Hour (hh:mm AM/PM)</option>
              <option value="24h">24 Hour (HH:mm)</option>
            </select>
          </Field>
        </div>

        {/* Operational Settings */}
        <h4 style={{ fontSize: 14.5, fontWeight: 800, margin: '20px 0 4px' }}>Operational Settings</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
          <ToggleRow label="Allow New Customer Registration" on={s.allow_registration !== 'false'} onClick={() => toggle('allow_registration')} disabled={!editable} />
          <ToggleRow label="Service Availability by Default" on={s.service_available_default !== 'false'} onClick={() => toggle('service_available_default')} disabled={!editable} />
          <ToggleRow label="Auto-assign jobs to on-shift experts" on={s.auto_assign === 'true'} onClick={() => toggle('auto_assign')} disabled={!editable} />
          <ToggleRow label="Maintenance Mode" on={s.maintenance_mode === 'true'} onClick={() => toggle('maintenance_mode')} disabled={!editable} />
          <ToggleRow label="Enable Promo Codes" on={s.enable_promo !== 'false'} onClick={() => toggle('enable_promo')} disabled={!editable} />
          <ToggleRow label="Enable Review & Ratings" on={s.enable_reviews !== 'false'} onClick={() => toggle('enable_reviews')} disabled={!editable} />
          <ToggleRow label="Show GST-inclusive prices to customers" on={s.gst_inclusive !== 'false'} onClick={() => toggle('gst_inclusive')} disabled={!editable} />
        </div>

        {/* Worker Payout Policy — read by the wallet service. min_payout_limit is enforced on every
            withdrawal request; frequency/day only drive the estimated next-payout date shown to
            workers and admins. Nothing pays automatically — payouts stay worker-requested and
            admin-approved — so 'On demand' is the honest setting when there is no stated cycle. */}
        <h4 style={{ fontSize: 14.5, fontWeight: 800, margin: '20px 0 12px' }}>Worker Payout Policy</h4>
        <div className="form-grid">
          <Field label="Minimum payout (₹)">
            <input disabled={!editable} type="number" min={0} value={s.min_payout_limit || ''} onChange={(e) => set('min_payout_limit', e.target.value)} placeholder="500" />
          </Field>
          <Field label="Payout frequency">
            <select disabled={!editable} value={s.payout_frequency || 'weekly'} onChange={(e) => set('payout_frequency', e.target.value)}>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
              <option value="daily">Daily</option>
              <option value="on_demand">On demand (no schedule)</option>
            </select>
          </Field>
          {s.payout_frequency !== 'on_demand' && s.payout_frequency !== 'daily' && (
            s.payout_frequency === 'monthly' ? (
              <Field label="Payout day of month">
                <input disabled={!editable} type="number" min={1} max={28} value={s.payout_day || ''} onChange={(e) => set('payout_day', e.target.value)} placeholder="1" />
              </Field>
            ) : (
              <Field label="Payout day">
                <select disabled={!editable} value={s.payout_day || '4'} onChange={(e) => set('payout_day', e.target.value)}>
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={d} value={String(i)}>{d}</option>)}
                </select>
              </Field>
            )
          )}
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
          The minimum is enforced on every withdrawal request. Frequency sets the payout date estimated for
          workers — it does not pay anyone automatically; payouts stay worker-requested and admin-approved.
        </p>

        {/* Settlement rates — drive the per-booking Payment & Settlement breakdown. */}
        <h4 style={{ fontSize: 14.5, fontWeight: 800, margin: '20px 0 12px' }}>Settlement Rates</h4>
        <div className="form-grid">
          <Field label="Payment gateway fee (%)"><input disabled={!editable} type="number" step="0.01" min={0} value={s.pg_fee_percent || ''} onChange={(e) => set('pg_fee_percent', e.target.value)} placeholder="2.36" /></Field>
          <Field label="GST on gateway fee (%)"><input disabled={!editable} type="number" step="0.01" min={0} value={s.pg_fee_gst_percent || ''} onChange={(e) => set('pg_fee_gst_percent', e.target.value)} placeholder="18" /></Field>
          <Field label="Worker incentive (% of service)"><input disabled={!editable} type="number" step="0.1" min={0} value={s.worker_incentive_percent || ''} onChange={(e) => set('worker_incentive_percent', e.target.value)} placeholder="3" /></Field>
          <Field label="Operational cost (% of order)"><input disabled={!editable} type="number" step="0.1" min={0} value={s.operational_cost_percent || ''} onChange={(e) => set('operational_cost_percent', e.target.value)} placeholder="2" /></Field>
          <Field label="Marketing & platform cost (% of order)"><input disabled={!editable} type="number" step="0.1" min={0} value={s.marketing_cost_percent || ''} onChange={(e) => set('marketing_cost_percent', e.target.value)} placeholder="1" /></Field>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
          These drive each booking's Payment &amp; Settlement breakdown. The gateway fee + its GST are the real
          charges a card/UPI payment incurs (0 on wallet); incentive/operational/marketing are the org's
          allocated per-booking costs. Set any to 0 to remove that line.
        </p>

        {/* Session & Security */}
        <h4 style={{ fontSize: 14.5, fontWeight: 800, margin: '20px 0 12px' }}>Session &amp; Security</h4>
        <div className="form-grid">
          <Field label="Session Timeout">
            <select disabled={!editable} value={s.session_timeout || '30'} onChange={(e) => set('session_timeout', e.target.value)}>
              <option value="15">15 Minutes</option>
              <option value="30">30 Minutes</option>
              <option value="60">60 Minutes</option>
            </select>
          </Field>
          <Field label="Password Expiry">
            <select disabled={!editable} value={s.password_expiry || '90'} onChange={(e) => set('password_expiry', e.target.value)}>
              <option value="30">30 Days</option>
              <option value="60">60 Days</option>
              <option value="90">90 Days</option>
            </select>
          </Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)', marginTop: 6 }}>
          <input type="checkbox" disabled={!editable} checked={s.require_2fa === 'true'} onChange={() => toggle('require_2fa')} />
          Require Two-Factor Authentication for Admin Users
        </label>

        {!editable && <p className="muted" style={{ marginTop: 16 }}>You need admin access to edit settings.</p>}

        {/* Integration keys retained for admins (rendered after the general form) */}
        {editable && nav === 'integrations' && (
          <div style={{ marginTop: 24, borderTop: '1px solid var(--line)', paddingTop: 18 }}>
            <h4 style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 6 }}>Backend API Keys &amp; Integrations</h4>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              These keys power live payments, maps, SMS/OTP and push. Secret values are masked once saved — leave a field as <code>••••</code> to keep it unchanged.
            </p>
            <div className="form-grid">
              {KEYS.map((f) => (
                <Field key={f.k} label={f.label}>
                  <input className="keyrow" type={f.secret ? 'password' : 'text'} placeholder={f.hint}
                    value={s[f.k] || ''} onChange={(e) => set(f.k, e.target.value)}
                    onFocus={() => { if (f.secret && (s[f.k] || '').startsWith('••••')) set(f.k, '') }} />
                </Field>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ---- right rail ---- */}
      <div className="col-rail">
        <Card title="Account Summary">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--violet-50)', color: 'var(--violet)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Building2 size={24} /></span>
            <div>
              <strong style={{ fontSize: 14, display: 'block' }}>{s.platform_name || 'HomeHelp'} Technologies</strong>
              <span className="badge green" style={{ marginTop: 4 }}><BadgeCheck size={12} /> Verified</span>
            </div>
          </div>
          <SummaryRow label="Account Type" value={<strong>{admin?.role === 'super' ? 'Super Admin' : 'Admin'}</strong>} />
          <SummaryRow label="Member Since" value={<strong>12 Jan 2024</strong>} />
          <SummaryRow label="Account Status" value={<span className="badge green">Active</span>} />
          <SummaryRow label="Plan" value={<strong>Enterprise</strong>} />
          <SummaryRow label="Valid Till" value={<strong>12 Jan 2026</strong>} />
          <button className="btn ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => toast('Subscription management is coming soon', 'ok')}><CreditCard size={15} /> Manage Subscription</button>
        </Card>

        <Card title="System Preferences">
          <div className="minilist">
            <PrefRow Icon={Globe} label="Language" value="English" />
            <PrefRow Icon={FileText} label="Receipts Prefix" value="HH-" />
            <PrefRow Icon={FileText} label="Booking Prefix" value="BK-" />
            <PrefRow Icon={FileText} label="Invoice Prefix" value="INV-" />
            <PrefRow Icon={CreditCard} label="Tax Display" value="Inclusive" />
          </div>
          <button className="btn ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => toast('Preference editing is coming soon', 'ok')}><Pencil size={15} /> Edit Preferences</button>
        </Card>

        <Card title="Quick Links">
          <div className="minilist">
            <QuickRow Icon={Users2} title="Manage Admin Users" sub="Add or manage admin team" />
            <QuickRow Icon={ShieldCheck} title="Roles & Permissions" sub="Manage access and permissions" />
            <QuickRow Icon={FileText} title="System Logs" sub="View system activity logs" onClick={() => setNav('audit')} />
            <QuickRow Icon={KeyRound} title="API Keys" sub="Manage API keys and integrations" onClick={() => setNav('integrations')} />
          </div>
        </Card>
      </div>
    </div>
  )
}

function ToggleRow({ label, on, onClick, disabled }: { label: string; on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="toggle">
      <div className="toggle-info"><strong style={{ fontSize: 13.5 }}>{label}</strong></div>
      <button className={'switch' + (on ? ' on' : '')} disabled={disabled} onClick={onClick} />
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line-2)', fontSize: 13 }}>
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function PrefRow({ Icon, label, value }: { Icon: typeof Globe; label: string; value: string }) {
  return (
    <div className="mini-row" style={{ alignItems: 'center' }}>
      <span className="mini-ico" style={{ width: 28, height: 28 }}><Icon size={15} /></span>
      <span className="mini-bd" style={{ fontSize: 13 }}>{label}</span>
      <strong style={{ fontSize: 13 }}>{value}</strong>
    </div>
  )
}

function QuickRow({ Icon, title, sub, onClick }: { Icon: typeof Globe; title: string; sub: string; onClick?: () => void }) {
  return (
    <div className="mini-row link-row" style={{ alignItems: 'center', cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
      <span className="mini-ico"><Icon size={16} /></span>
      <div className="mini-bd"><strong>{title}</strong><small>{sub}</small></div>
      <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
    </div>
  )
}
