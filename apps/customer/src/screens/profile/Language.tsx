// 92 · Language — the chosen language is persisted (/api/profile/language), cached locally
// ('hh_lang') and applied immediately via the i18n layer (src/i18n.ts). English and Hindi are fully
// translated; the other Indian languages are listed as "coming soon" — they can still be chosen (the
// preference is saved) but the app shows English until their translations land.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { fetchLanguage, updateLanguage } from '../../api'
import { t, setLang, TRANSLATED } from '../../i18n'

const LANGS = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिंदी' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
]

export default function Language() {
  const nav = useNavigate()
  const toast = useToast()
  const [sel, setSel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchLanguage().then((r) => setSel(r.language || 'en')).catch(() => setSel(localStorage.getItem('hh_lang') || 'en')) }, [])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><ArrowLeft size={18} /></button>
      <div className="titles"><h1>{t('Language')}</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (sel === null) return <div className="screen">{head}<Loading /></div>

  async function save() {
    if (!sel || busy) return
    setBusy(true)
    try {
      await updateLanguage(sel)
      setLang(sel)   // saves 'hh_lang' and switches the whole UI right away
      toast(TRANSLATED.includes(sel) ? t('Language preference saved') : t('Saved — this language is coming soon, the app stays in English for now'))
      nav(-1)
    }
    catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="screen">
      {head}
      <div className="content pad-cta">
        <div className="lang-h">{t('Choose your preferred language')}</div>
        <div className="ws-card">
          {LANGS.map((l) => (
            <button key={l.code} className="lang-row" onClick={() => setSel(l.code)}>
              <span className="lang-main"><span className="lang-native">{l.native}</span><span className="lang-name">{l.name}{!TRANSLATED.includes(l.code) && <> · {t('Coming soon')}</>}</span></span>
              <span className={`lang-radio ${sel === l.code ? 'on' : ''}`}>{sel === l.code && <Check size={13} />}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="w-foot">
        <button className="btn full" onClick={save} disabled={busy}>{busy ? t('Saving…') : t('Save')}</button>
      </div>
    </div>
  )
}
