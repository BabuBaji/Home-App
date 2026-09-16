// 92 · Language — the chosen language is persisted (/api/profile/language), cached locally and
// applied to the UI immediately via i18next, so the switch takes effect without a restart.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { fetchLanguage, updateLanguage } from '../../api'
import { LANGS, applyLanguage } from '../../i18n'

export default function Language() {
  const nav = useNavigate()
  const toast = useToast()
  const { t } = useTranslation()
  const [sel, setSel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchLanguage().then((r) => setSel(r.language || 'en')).catch(() => setSel(localStorage.getItem('hh_lang') || 'en')) }, [])

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('common.back')}><ArrowLeft size={18} /></button>
      <div className="titles"><h1>{t('language.title')}</h1></div>
      <span className="iconbtn ghost" />
    </header>
  )
  if (sel === null) return <div className="screen">{head}<Loading /></div>

  async function save() {
    if (!sel || busy) return
    setBusy(true)
    // Apply locally first so the UI switches even if the network call is slow or fails —
    // the preference is re-synced from the server the next time this screen opens.
    applyLanguage(sel)
    try { await updateLanguage(sel); toast(t('language.saved')); nav(-1) }
    catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="screen">
      {head}
      <div className="content pad-cta">
        <div className="lang-h">{t('language.choose')}</div>
        <div className="ws-card">
          {LANGS.map((l) => (
            <button key={l.code} className="lang-row" onClick={() => setSel(l.code)}>
              <span className="lang-main"><span className="lang-native">{l.native}</span><span className="lang-name">{l.name}</span></span>
              <span className={`lang-radio ${sel === l.code ? 'on' : ''}`}>{sel === l.code && <Check size={13} />}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="w-foot">
        <button className="btn full" onClick={save} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
      </div>
    </div>
  )
}
