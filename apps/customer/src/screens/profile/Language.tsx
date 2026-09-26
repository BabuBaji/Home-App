// 92 · Language — every supported Indian language (src/i18n.ts LANGUAGES). Tapping a language
// switches the whole app immediately (setLang saves 'hh_lang', loads that language's dictionary
// chunk and re-renders; Urdu flips the layout to right-to-left) and saves it to the profile
// (/api/profile/language) in the background so it follows the customer to a fresh install.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { useToast } from '../../components/UI'
import { fetchLanguage, updateLanguage } from '../../api'
import { t, setLang, useLang, LANGUAGES } from '../../i18n'

export default function Language() {
  const nav = useNavigate()
  const toast = useToast()
  const sel = useLang()
  const [saving, setSaving] = useState(false)

  // Adopt the profile's saved language if it differs from this device's (e.g. set on another phone).
  useEffect(() => { fetchLanguage().then((r) => { if (r.language && r.language !== sel) setLang(r.language) }).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function choose(code: string) {
    if (code === sel) return
    setLang(code)                 // switch the UI right away
    setSaving(true)
    try { await updateLanguage(code); toast(t('Language preference saved')) }
    catch (e) { toast((e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={20} /></button>
        <div className="titles"><h1>{t('Language')}</h1></div>
        <span className="iconbtn ghost" />
      </header>
      <div className="content pad-cta">
        <div className="lang-h">{t('Choose your preferred language')}</div>
        <div className="ws-card" role="radiogroup" aria-label={t('Language')}>
          {LANGUAGES.map((l) => (
            <button key={l.code} className="lang-row" role="radio" aria-checked={sel === l.code} onClick={() => choose(l.code)}>
              <span className="lang-main">
                <span className="lang-native" lang={l.code} dir={l.rtl ? 'rtl' : 'ltr'}>{l.native}</span>
                <span className="lang-name" lang="en" dir="ltr">{l.name}</span>
              </span>
              <span className={`lang-radio ${sel === l.code ? 'on' : ''}`}>{sel === l.code && <Check size={13} />}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="w-foot">
        <button className="btn full" onClick={() => nav(-1)} disabled={saving}>{saving ? t('Saving…') : t('Done')}</button>
      </div>
    </div>
  )
}
