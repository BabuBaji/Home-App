import { useEffect, useState } from 'react'
import { Save, KeyRound, Globe, SlidersHorizontal, Settings as Cog, ShieldCheck } from 'lucide-react'
import { fetchSettings, updateSettings } from '../api'
import { Card, Field, Loading, ErrorState, useToast } from '../components/UI'
import { useStore, can } from '../store'

const TABS = [
  { k: 'general', label: 'General', Icon: Cog },
  { k: 'local', label: 'Localization & Fees', Icon: Globe },
  { k: 'ops', label: 'Operations', Icon: SlidersHorizontal },
  { k: 'keys', label: 'API Keys & Integrations', Icon: KeyRound },
]

// Integration key fields. `secret` ones come back masked from the server.
const KEYS = [
  { k: 'razorpay_key_id', label: 'Razorpay Key ID', hint: 'rzp_live_… / rzp_test_…', secret: false },
  { k: 'razorpay_key_secret', label: 'Razorpay Key Secret', hint: 'Stored securely, enables live payments', secret: true },
  { k: 'google_maps_key', label: 'Google Maps API Key', hint: 'Geocoding & live tracking maps', secret: true },
  { k: 'msg91_key', label: 'MSG91 / SMS Key', hint: 'OTP & transactional SMS', secret: true },
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
  const [tab, setTab] = useState('general')
  const [busy, setBusy] = useState(false)
  const editable = can(admin?.role, 'admin')

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
    <div>
      <div className="tabs">
        {TABS.filter((t) => t.k !== 'keys' || editable).map((t) => (
          <button key={t.k} className={'tab' + (tab === t.k ? ' active' : '')} onClick={() => setTab(t.k)}><t.Icon size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />{t.label}</button>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 18, maxWidth: 760 }}>
        {tab === 'general' && (
          <Card title="Platform Information">
            <div className="form-grid">
              <Field label="Platform name"><input disabled={!editable} value={s.platform_name || ''} onChange={(e) => set('platform_name', e.target.value)} /></Field>
              <Field label="Support email"><input disabled={!editable} value={s.support_email || ''} onChange={(e) => set('support_email', e.target.value)} /></Field>
              <Field label="Support phone"><input disabled={!editable} value={s.support_phone || ''} onChange={(e) => set('support_phone', e.target.value)} /></Field>
              <Field label="Timezone"><input disabled={!editable} value={s.timezone || ''} onChange={(e) => set('timezone', e.target.value)} /></Field>
            </div>
          </Card>
        )}

        {tab === 'local' && (
          <Card title="Currency, Tax & Fees">
            <div className="form-grid">
              <Field label="Currency code"><input disabled={!editable} value={s.currency || ''} onChange={(e) => set('currency', e.target.value)} /></Field>
              <Field label="Currency symbol"><input disabled={!editable} value={s.currency_symbol || ''} onChange={(e) => set('currency_symbol', e.target.value)} /></Field>
              <Field label="Platform fee (₹)"><input disabled={!editable} type="number" value={s.platform_fee || ''} onChange={(e) => set('platform_fee', e.target.value)} /></Field>
              <Field label="Tax / GST (%)"><input disabled={!editable} type="number" value={s.tax_percent || ''} onChange={(e) => set('tax_percent', e.target.value)} /></Field>
              <Field label="Cancellation fee (₹)"><input disabled={!editable} type="number" value={s.cancel_fee || ''} onChange={(e) => set('cancel_fee', e.target.value)} /></Field>
              <Field label="Worker commission (%)"><input disabled={!editable} type="number" value={s.commission_percent || ''} onChange={(e) => set('commission_percent', e.target.value)} /></Field>
            </div>
          </Card>
        )}

        {tab === 'ops' && (
          <Card title="Operational Settings">
            <div className="toggle">
              <div className="toggle-info"><strong>Auto-assign professionals</strong><small>Automatically dispatch the nearest available worker on new bookings.</small></div>
              <button className={'switch' + (s.auto_assign === 'true' ? ' on' : '')} disabled={!editable} onClick={() => toggle('auto_assign')} />
            </div>
            <div className="toggle">
              <div className="toggle-info"><strong>Maintenance mode</strong><small>Temporarily pause new bookings across all apps.</small></div>
              <button className={'switch' + (s.maintenance_mode === 'true' ? ' on' : '')} disabled={!editable} onClick={() => toggle('maintenance_mode')} />
            </div>
          </Card>
        )}

        {tab === 'keys' && editable && (
          <Card title="Backend API Keys & Integrations" right={<span className="badge green"><ShieldCheck size={12} /> Encrypted at rest</span>}>
            <p className="muted" style={{ fontSize: 13, marginTop: -4, marginBottom: 16 }}>
              These keys power live payments, maps, SMS/OTP and push. Secret values are masked once saved — leave a field as <code>••••</code> to keep it unchanged. Razorpay keys go live in the customer app on the next server restart.
            </p>
            {KEYS.map((f) => (
              <Field key={f.k} label={f.label}>
                <input className="keyrow" type={f.secret ? 'password' : 'text'} placeholder={f.hint}
                  value={s[f.k] || ''} onChange={(e) => set(f.k, e.target.value)}
                  onFocus={(e) => { if (f.secret && (s[f.k] || '').startsWith('••••')) set(f.k, '') }} />
              </Field>
            ))}
          </Card>
        )}

        {editable && (
          <div><button className="btn" disabled={busy} onClick={save}><Save size={16} /> {busy ? 'Saving…' : 'Save changes'}</button></div>
        )}
        {!editable && <p className="muted">You need admin access to edit settings.</p>}
      </div>
    </div>
  )
}
