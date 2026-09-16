// i18n runtime. The customer's language is stored server-side (users.language, via
// /api/profile/language) and mirrored into localStorage so the very first paint after a
// cold start is already in the right language — before the profile fetch comes back.
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import hi from './locales/hi.json'
import te from './locales/te.json'
import ta from './locales/ta.json'
import kn from './locales/kn.json'
import mr from './locales/mr.json'
import bn from './locales/bn.json'

/** The languages offered on the Language screen. `native` is what the user sees. */
export const LANGS = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिंदी' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
] as const

export const LANG_CODES = LANGS.map((l) => l.code)
export const STORAGE_KEY = 'hh_lang'

function savedLang(): string {
  try {
    const l = localStorage.getItem(STORAGE_KEY)
    return l && (LANG_CODES as readonly string[]).includes(l) ? l : 'en'
  } catch { return 'en' }   // private mode / blocked storage
}

i18next.use(initReactI18next).init({
  resources: { en: { t: en }, hi: { t: hi }, te: { t: te }, ta: { t: ta }, kn: { t: kn }, mr: { t: mr }, bn: { t: bn } },
  lng: savedLang(),
  fallbackLng: 'en',          // an untranslated key falls back to English rather than showing the key
  defaultNS: 't',
  interpolation: { escapeValue: false },   // React already escapes
})

/** Switch language everywhere and remember it locally. Server persistence is the caller's job. */
export function applyLanguage(code: string) {
  if (!(LANG_CODES as readonly string[]).includes(code)) return
  i18next.changeLanguage(code)
  try { localStorage.setItem(STORAGE_KEY, code) } catch { /* non-fatal */ }
}

export default i18next
