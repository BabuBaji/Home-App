import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Save, KeyRound, Globe, Settings as Cog, ShieldCheck, Building2, Mail, Bell, FileText,
  CreditCard, Wallet, ChevronRight, ArrowRight,
} from 'lucide-react'
import { fetchSettings, updateSettings } from '../api'
import { Card, Field, Loading, ErrorState, useToast } from '../components/UI'
import { useStore, has } from '../store'

// One section per menu item. `link` items open another admin page instead of a form.
const NAV = [
  { k: 'general', label: 'General', Icon: Cog, sub: 'Platform name, support contacts and how the platform runs.' },
  { k: 'business', label: 'Business & Tax', Icon: Building2, sub: 'Legal details printed on every tax invoice.' },
  { k: 'local', label: 'Localization', Icon: Globe, sub: 'Currency, timezone and date formats.' },
  { k: 'payment', label: 'Payments', Icon: CreditCard, sub: 'Payment gateway, customer credits and per-booking settlement rates.' },
  { k: 'payouts', label: 'Expert Pay & Payouts', Icon: Wallet, sub: 'Bonuses paid to experts and how their payouts work.' },
  { k: 'email', label: 'SMS & Email', Icon: Mail, sub: 'Providers for login OTPs and email.' },
  { k: 'notif', label: 'Push Notifications', Icon: Bell, sub: 'Push delivery to the customer and expert apps.' },
  { k: 'security', label: 'Security', Icon: ShieldCheck, sub: 'Admin sessions, passwords and sign-in rules.' },
  { k: 'integrations', label: 'Integrations', Icon: KeyRound, sub: 'Maps and other third-party keys.' },
  { k: 'audit', label: 'Audit Logs', Icon: FileText, link: '/activity' },
] as const
type Section = (typeof NAV)[number]['k']

// Integration key fields. `secret` ones come back masked from the server.
type Key = { k: string; label: string; hint: string; secret: boolean; ph?: string }
const K = (k: string, label: string, hint: string, secret = false, ph?: string): Key => ({ k, label, hint, secret, ph })
const RAZORPAY_KEYS = [
  K('razorpay_key_id', 'Razorpay Key ID', 'From Razorpay ▸ Account & Settings ▸ API keys.', false, 'rzp_live_… or rzp_test_…'),
  K('razorpay_key_secret', 'Razorpay Key Secret', 'Stored securely, enables live payments', true),
  K('razorpay_webhook_secret', 'Razorpay Webhook Secret', 'Same secret as the webhook in Razorpay ▸ Webhooks. Payment & refund webhooks are refused while this is empty.', true),
]
const PAYOUT_KEYS = [
  K('razorpayx_account_number', 'RazorpayX Account Number', 'Source account for expert payouts & penny-drop. Enables real payouts.', false, 'e.g. 2323230012345678'),
  K('payout_mode', 'Payout Mode', 'IMPS, NEFT or UPI. Empty means IMPS.', false, 'IMPS'),
  K('payout_webhook_secret', 'Payout Webhook Secret', 'Verifies RazorpayX payout & account-validation webhooks', true),
]
const SMS_KEYS = [
  K('msg91_key', 'MSG91 / SMS Key', 'Sends login OTPs. While empty, codes are returned in the API response (dev only).', true),
  K('msg91_otp_template_id', 'MSG91 OTP Template ID', 'Required once the key is set — India needs a DLT-registered template.', false, 'e.g. 64f1c2…'),
  K('msg91_sender_id', 'MSG91 Sender ID', '6-character DLT-approved sender.', false, 'HHELP'),
]
const EMAIL_KEYS = [
  K('smtp_host', 'SMTP Host', 'Your mail provider’s SMTP server.', false, 'smtp.gmail.com'),
  K('smtp_user', 'SMTP Username', 'The address emails are sent from.', false, 'no-reply@homehelp.in'),
  K('smtp_pass', 'SMTP Password', 'Use an app password, not your login password.', true),
]
const PUSH_KEYS = [K('firebase_server_key', 'Firebase Server Key', 'From Firebase ▸ Project settings ▸ Cloud Messaging. Without it no push notifications are sent.', true)]
const MAP_KEYS = [K('google_maps_key', 'Google Maps API Key', 'Used for address lookup and live tracking maps.', true)]

export default function SettingsScreen() {
  const toast = useToast()
  const nav = useNavigate()
  const { admin } = useStore()
  const [params, setParams] = useSearchParams()
  const [s, setS] = useState<Record<string, string> | null>(null)
  const [saved, setSaved] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const editable = has(admin, 'settings.edit')
  const section = (NAV.find((n) => n.k === params.get('s') && !('link' in n)) || NAV[0]).k as Section

  const load = () => { setErr(''); fetchSettings().then((d) => { setS(d); setSaved(JSON.stringify(d)) }).catch((e) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!s) return <Loading />

  const dirty = JSON.stringify(s) !== saved
  const set = (k: string, v: string) => setS((p) => ({ ...p!, [k]: v }))
  const toggle = (k: string, defOn: boolean) => set(k, (defOn ? s[k] !== 'false' : s[k] === 'true') ? 'false' : 'true')
  const isOn = (k: string, defOn: boolean) => (defOn ? s[k] !== 'false' : s[k] === 'true')

  async function save() {
    setBusy(true)
    try { const updated = await updateSettings(s!); setS(updated); setSaved(JSON.stringify(updated)); toast('Settings saved') } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  const go = (k: string, link?: string) => {
    if (link) { nav(link); return }
    if (dirty && !confirm('You have unsaved changes. Leave this section without saving?')) return
    if (dirty) setS(JSON.parse(saved))
    setParams({ s: k }, { replace: true })
  }

  // small builders so every section reads the same
  const input = (k: string, label: string, opts: { placeholder?: string; type?: string; min?: number; max?: number; step?: string; soon?: boolean; hint?: string } = {}) => (
    <Field label={<>{label}{opts.soon && <Soon />}</>}>
      <input disabled={!editable} type={opts.type || 'text'} min={opts.min} max={opts.max} step={opts.step} value={s[k] ?? ''} onChange={(e) => set(k, e.target.value)} placeholder={opts.placeholder} />
      {opts.hint && <small className="muted" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>{opts.hint}</small>}
    </Field>
  )
  const keyFields = (keys: Key[]) => (
    <div className="form-grid">
      {keys.map((f) => (
        <Field key={f.k} label={f.label}>
          <input className="keyrow" disabled={!editable} type={f.secret ? 'password' : 'text'} placeholder={f.ph || (f.secret ? 'Not set' : '')}
            value={s[f.k] || ''} onChange={(e) => set(f.k, e.target.value)}
            onFocus={() => { if (f.secret && (s[f.k] || '').startsWith('••••')) set(f.k, '') }} />
          <small className="muted" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>{f.hint}</small>
        </Field>
      ))}
    </div>
  )
  const toggleRow = (k: string, label: string, defOn: boolean, opts: { soon?: boolean; hint?: string } = {}) => (
    <div className="toggle">
      <div className="toggle-info">
        <strong style={{ fontSize: 13.5 }}>{label}{opts.soon && <Soon />}</strong>
        {opts.hint && <small className="muted" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>{opts.hint}</small>}
      </div>
      <button className={'switch' + (isOn(k, defOn) ? ' on' : '')} disabled={!editable} onClick={() => toggle(k, defOn)} />
    </div>
  )

  const cur = NAV.find((n) => n.k === section)!
  const BODY: Record<Section, ReactNode> = {
    general: <>
      <Group title="Platform">
        <div className="form-grid">
          {input('platform_name', 'Platform name')}
          {input('platform_tagline', 'Tagline', { placeholder: 'We make home services simple', soon: true })}
          {input('support_email', 'Support email')}
          {input('support_phone', 'Support phone', { hint: 'Shown to customers on bookings and receipts.' })}
        </div>
      </Group>
      <Group title="Operations">
        <div className="toggle-grid">
          {toggleRow('auto_assign', 'Auto-assign jobs to on-shift experts', false, { hint: 'New bookings are offered to the nearest available expert automatically.' })}
          {toggleRow('maintenance_mode', 'Maintenance mode', false, { soon: true })}
          {toggleRow('allow_registration', 'Allow new customer sign-ups', true, { soon: true })}
          {toggleRow('service_available_default', 'New services available by default', true, { soon: true })}
          {toggleRow('enable_promo', 'Promo codes', true, { soon: true })}
          {toggleRow('enable_reviews', 'Reviews & ratings', true, { soon: true })}
        </div>
      </Group>
    </>,
    business: <>
      <Group title="Tax invoice details">
        <div className="form-grid">
          {input('company_name', 'Company legal name', { placeholder: 'HomeHelp Services Pvt. Ltd.' })}
          {input('company_gstin', 'Company GSTIN', { placeholder: '36AABCH1234M1Z7' })}
          {input('company_address', 'Registered address', { placeholder: 'Street, City, State, PIN' })}
          {input('company_state', 'State — place of supply', { placeholder: 'Telangana' })}
          {input('service_sac', 'Service SAC code', { placeholder: '9987' })}
        </div>
      </Group>
      <Group title="Pricing display">
        <div className="toggle-grid">
          {toggleRow('gst_inclusive', 'Show GST-inclusive prices to customers', true)}
        </div>
      </Group>
    </>,
    local: <>
      <Group title="Currency & time">
        <div className="form-grid">
          <Field label="Currency">
            <select disabled={!editable} value={s.currency || 'INR'} onChange={(e) => set('currency', e.target.value)}>
              <option value="INR">INR — Indian Rupee (₹)</option>
              <option value="USD">USD — US Dollar ($)</option>
              <option value="EUR">EUR — Euro (€)</option>
            </select>
          </Field>
          <Field label="Timezone">
            <select disabled={!editable} value={/IST|\+5:30|Kolkata/i.test(s.timezone || 'IST') ? 'Asia/Kolkata' : s.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {!/IST|\+5:30|Kolkata|^UTC$/i.test(s.timezone || 'IST') && <option value={s.timezone}>{s.timezone}</option>}
              <option value="Asia/Kolkata">(GMT +05:30) Asia/Kolkata</option>
              <option value="UTC">(GMT +00:00) UTC</option>
            </select>
          </Field>
          <Field label={<>Date format<Soon /></>}>
            <select disabled={!editable} value={s.date_format || 'DD MMM YYYY'} onChange={(e) => set('date_format', e.target.value)}>
              <option value="DD MMM YYYY">DD MMM YYYY (16 May 2025)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (05/16/2025)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (2025-05-16)</option>
            </select>
          </Field>
          <Field label={<>Time format<Soon /></>}>
            <select disabled={!editable} value={s.time_format || '12h'} onChange={(e) => set('time_format', e.target.value)}>
              <option value="12h">12 hour (hh:mm AM/PM)</option>
              <option value="24h">24 hour (HH:mm)</option>
            </select>
          </Field>
        </div>
      </Group>
    </>,
    payment: <>
      <Group title="Payment gateway">
        <div className="form-grid">
          <Field label="Mode">
            <select disabled={!editable} value={(s.payment_gateway || '').toLowerCase() === 'mock' ? 'mock' : ''} onChange={(e) => set('payment_gateway', e.target.value)}>
              <option value="">Razorpay (live when the keys below are set)</option>
              <option value="mock">Demo — no real money moves</option>
            </select>
          </Field>
        </div>
        {keyFields(RAZORPAY_KEYS)}
      </Group>
      <Group title="Customer credits">
        <div className="form-grid">
          {input('welcome_bonus', 'New-customer welcome credit (₹)', { type: 'number', min: 0, placeholder: '100', hint: 'Added to the promo balance at sign-up. 0 turns it off.' })}
        </div>
      </Group>
      <Group title="Settlement rates" note="These drive each booking's Payment & Settlement breakdown. The gateway fee and its GST are what a card/UPI payment really costs (0 on wallet); incentive, operational and marketing are allocated per-booking costs. Set any to 0 to drop that line.">
        <div className="form-grid">
          {input('pg_fee_percent', 'Payment gateway fee (%)', { type: 'number', step: '0.01', min: 0, placeholder: '2.36' })}
          {input('pg_fee_gst_percent', 'GST on gateway fee (%)', { type: 'number', step: '0.01', min: 0, placeholder: '18' })}
          {input('worker_incentive_percent', 'Expert incentive (% of service)', { type: 'number', step: '0.1', min: 0, placeholder: '3' })}
          {input('operational_cost_percent', 'Operational cost (% of order)', { type: 'number', step: '0.1', min: 0, placeholder: '2' })}
          {input('marketing_cost_percent', 'Marketing & platform cost (% of order)', { type: 'number', step: '0.1', min: 0, placeholder: '1' })}
        </div>
      </Group>
    </>,
    payouts: <>
      <Group title="Joining & referral bonus" note="Paid automatically into the expert's wallet when they reach the milestone. 0 turns a bonus off.">
        <div className="form-grid">
          {input('worker_joining_bonus', 'Joining bonus (₹)', { type: 'number', min: 0, placeholder: '500' })}
          {input('worker_joining_jobs', '…paid after this many jobs', { type: 'number', min: 0, placeholder: '5' })}
          {input('worker_joining_days', '…completed within days of joining', { type: 'number', min: 0, placeholder: '30' })}
          {input('worker_referral_bonus', 'Referral bonus to the referrer (₹)', { type: 'number', min: 0, placeholder: '1500' })}
          {input('worker_referee_bonus', 'Referral bonus to the new expert (₹)', { type: 'number', min: 0, placeholder: '500' })}
          {input('worker_referral_jobs', '…paid when the new expert completes jobs', { type: 'number', min: 0, placeholder: '10' })}
        </div>
      </Group>
      <Group title="Job start bonus" note="Paid the moment an expert starts a service (customer OTP verified), on every job. Takes effect on the next job started.">
        <div className="form-grid">
          {input('job_start_bonus', 'Job start bonus (₹)', { type: 'number', step: '1', min: 0, placeholder: '15' })}
        </div>
      </Group>
      <Group title="Payout policy" note="The minimum is enforced on every withdrawal request. Frequency only sets the estimated payout date shown to experts — payouts stay expert-requested and admin-approved.">
        <div className="form-grid">
          {input('min_payout_limit', 'Minimum payout (₹)', { type: 'number', min: 0, placeholder: '500' })}
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
            s.payout_frequency === 'monthly'
              ? input('payout_day', 'Payout day of month', { type: 'number', min: 1, max: 28, placeholder: '1' })
              : (
                <Field label="Payout day">
                  <select disabled={!editable} value={s.payout_day || '4'} onChange={(e) => set('payout_day', e.target.value)}>
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={d} value={String(i)}>{d}</option>)}
                  </select>
                </Field>
              )
          )}
        </div>
      </Group>
      <Group title="RazorpayX (bank payouts)">{keyFields(PAYOUT_KEYS)}</Group>
    </>,
    email: <>
      <Group title="SMS — login OTPs">{keyFields(SMS_KEYS)}</Group>
      <Group title="Email (SMTP)">{keyFields(EMAIL_KEYS)}</Group>
    </>,
    notif: <>
      <Group title="Push delivery">{keyFields(PUSH_KEYS)}</Group>
      <LinkRow title="Send a notification" sub="Broadcast to customers or experts, and see what was sent" onClick={() => nav('/notifications')} />
    </>,
    security: <>
      <Group title="Admin sessions & passwords">
        <div className="form-grid">
          <Field label={<>Session timeout<Soon /></>}>
            <select disabled={!editable} value={s.session_timeout || '30'} onChange={(e) => set('session_timeout', e.target.value)}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
            </select>
          </Field>
          <Field label={<>Password expiry<Soon /></>}>
            <select disabled={!editable} value={s.password_expiry || '90'} onChange={(e) => set('password_expiry', e.target.value)}>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </Field>
        </div>
        <div className="toggle-grid" style={{ marginTop: 6 }}>
          {toggleRow('require_2fa', 'Require two-factor sign-in for admins', false, { soon: true })}
        </div>
      </Group>
      {has(admin, 'admins.view') && <LinkRow title="Admin users" sub="Add admins, reset access, set zone scope" onClick={() => nav('/admins')} />}
      {has(admin, 'roles.view') && <LinkRow title="Roles & permissions" sub="What each role can see and change" onClick={() => nav('/roles')} />}
    </>,
    integrations: <>
      <Group title="Maps">{keyFields(MAP_KEYS)}</Group>
    </>,
    audit: null,
  }

  return (
    <div className="settings-layout">
      <Card className="settings-nav-card">
        <nav className="settings-nav">
          {NAV.map((n) => (
            <button key={n.k} className={'settings-navitem' + (section === n.k ? ' active' : '')} onClick={() => go(n.k, 'link' in n ? n.link : undefined)}>
              <n.Icon size={17} />
              <span>{n.label}</span>
              {'link' in n ? <ArrowRight size={14} className="nav-go" /> : <ChevronRight size={15} className="nav-go" />}
            </button>
          ))}
        </nav>
      </Card>

      <Card>
        <div className="card-head lg settings-head">
          <div>
            <h3>{cur.label}</h3>
            {'sub' in cur && <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>{cur.sub}</p>}
          </div>
          {editable && (
            <div className="head-actions">
              <button className="btn" disabled={busy || !dirty} onClick={save}><Save size={15} /> {busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          )}
        </div>
        {!editable && <p className="muted" style={{ margin: '0 0 12px' }}>You can view settings but not change them — that needs the “Edit settings” permission.</p>}
        <div className="settings-body">{BODY[section]}</div>
        {editable && dirty && (
          <div className="settings-savebar">
            <span>You have unsaved changes</span>
            <div className="tb-spacer" />
            <button className="btn line" onClick={() => setS(JSON.parse(saved))}>Discard</button>
            <button className="btn" disabled={busy} onClick={save}><Save size={15} /> {busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        )}
      </Card>
    </div>
  )
}

function Soon() {
  return <span className="soon-tag" title="Saved, but the platform doesn't act on this setting yet">Not active yet</span>
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h4>{title}</h4>
      {children}
      {note && <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>{note}</p>}
    </section>
  )
}

function LinkRow({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <button className="settings-link" onClick={onClick}>
      <div><strong>{title}</strong><small className="muted">{sub}</small></div>
      <ArrowRight size={16} />
    </button>
  )
}
