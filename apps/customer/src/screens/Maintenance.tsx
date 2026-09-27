import { useState } from 'react'
import { Phone, RefreshCw } from 'lucide-react'
import { loadAppConfig, useAppConfig } from '../appConfig'
import { t } from '../i18n'

// Shown instead of the app while Settings ▸ General ▸ Maintenance mode is on. Retry re-reads the
// config; the app also re-checks every minute and when it comes back to the foreground.
export default function Maintenance() {
  const { supportPhone } = useAppConfig()
  const [busy, setBusy] = useState(false)
  const retry = async () => { setBusy(true); await loadAppConfig(); setBusy(false) }
  return (
    <div className="screen jt">
      <div className="content cs" style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, overflowY: "auto", textAlign: "center" }}>
        <div className="cs-hero" style={{ width: '100%' }}>
          <div className="cs-hero-glow" />
          <div className="cs-hero-emoji">🛠️</div>
        </div>
        <h1 className="cs-title">{t("We'll be back shortly")}</h1>
        <p className="cs-sub">{t('HomeHelp is down for scheduled maintenance.')}<br />{t('Your bookings and wallet are safe.')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '22px 16px 0' }}>
          <button className="jt-btn" style={{ flex: 'none' }} disabled={busy} onClick={retry}><RefreshCw size={16} /> {busy ? t('Checking…') : t('Try again')}</button>
          {supportPhone && <a className="jt-btn ghost" style={{ flex: 'none', textDecoration: 'none' }} href={`tel:${supportPhone.replace(/\s+/g, '')}`}><Phone size={16} /> {t('Call support')}</a>}
        </div>
      </div>
    </div>
  )
}
