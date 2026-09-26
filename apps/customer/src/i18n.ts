// Tiny i18n layer (no dependencies). Copy is written in English in the components and wrapped in
// t('…'); for any other language the English text is looked up in that language's dictionary
// (src/locales/<code>.ts, keyed by the exact English string). Anything missing falls back to the
// English text, so an untranslated string never breaks a screen.
//
//   t('Book Now')                         → 'அப்போதே புக் செய்யுங்கள்' (ta) / 'Book Now' (en)
//   t('Hi {name}', { name: 'Asha' })      → placeholders are filled in every language
//
// Dictionaries are lazy-loaded with dynamic import(), so each language is its own small chunk and
// the main bundle carries none of them. main.tsx waits (briefly) for the saved language to load
// before the first render; after that, setLang() switches immediately and re-renders again when the
// dictionary arrives (subscribers are notified on load too).
//
// The language lives in localStorage 'hh_lang' (default 'en'). setLang() saves it, updates
// <html lang> / <html dir> (Urdu is right-to-left) and notifies subscribers; useLang() re-renders a
// component when the language or a loaded dictionary changes.
import { useSyncExternalStore } from 'react'

export type LangCode = string
export interface Language { code: LangCode; name: string; native: string; rtl?: boolean }

/** Every supported language (same set and order as the worker app). */
export const LANGUAGES: readonly Language[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া' },
  { code: 'ur', name: 'Urdu', native: 'اردو', rtl: true },
]
/** Languages with a real translation (all of them). Kept for older callers. */
export const TRANSLATED: readonly string[] = LANGUAGES.map((l) => l.code)

type Dict = Record<string, string>
// One lazily-loaded chunk per language. English needs none (the keys ARE the English text).
const LOADERS: Record<string, () => Promise<{ default: Dict }>> = {
  hi: () => import('./locales/hi'),
  bn: () => import('./locales/bn'),
  te: () => import('./locales/te'),
  mr: () => import('./locales/mr'),
  ta: () => import('./locales/ta'),
  gu: () => import('./locales/gu'),
  kn: () => import('./locales/kn'),
  ml: () => import('./locales/ml'),
  or: () => import('./locales/or'),
  pa: () => import('./locales/pa'),
  as: () => import('./locales/as'),
  ur: () => import('./locales/ur'),
}

const KEY = 'hh_lang'
const known = (c: string) => LANGUAGES.some((l) => l.code === c)

function readStored(): LangCode {
  try { const c = localStorage.getItem(KEY) || 'en'; return known(c) ? c : 'en' } catch { return 'en' }
}

let current: LangCode = readStored()
let version = 0                                   // bumps whenever a dictionary finishes loading
const dicts: Record<string, Dict> = {}
const pending: Record<string, Promise<void>> = {}
const listeners = new Set<() => void>()
const notify = () => { version++; listeners.forEach((l) => l()) }

export const isRTL = (code: LangCode = current) => !!LANGUAGES.find((l) => l.code === code)?.rtl

function applyHtmlLang() {
  try {
    document.documentElement.lang = current
    document.documentElement.dir = isRTL() ? 'rtl' : 'ltr'
  } catch { /* SSR / no DOM */ }
}
applyHtmlLang()

/** Load a language's dictionary (no-op for English or once loaded). Subscribers re-render when it lands. */
export function loadLanguage(code: LangCode): Promise<void> {
  if (!LOADERS[code] || dicts[code]) return Promise.resolve()
  if (!pending[code]) {
    pending[code] = LOADERS[code]()
      .then((m) => { dicts[code] = m.default; if (code === current) notify() })
      .catch(() => { delete pending[code] })     // offline chunk miss → English for now, retry later
  }
  return pending[code]
}

/** Resolves once the saved language's dictionary is ready (used before the first render). */
export function i18nReady(): Promise<void> { return loadLanguage(current) }

export function getLang(): LangCode { return current }

/** Save the language and switch the UI immediately. */
export function setLang(code: LangCode) {
  const next = known(code) ? code : 'en'
  try { localStorage.setItem(KEY, next) } catch { /* private mode — still switch for this session */ }
  if (next === current) return
  current = next
  applyHtmlLang()
  void loadLanguage(next)
  notify()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
const snapshot = () => `${current}#${version}`

/** Current language; the calling component re-renders when it changes (or its dictionary loads). */
export function useLang(): LangCode {
  useSyncExternalStore(subscribe, snapshot, snapshot)
  return current
}

function fill(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** Translate an English UI string (the English text is the key). */
export function t(en: string, vars?: Record<string, string | number>): string {
  const d = current === 'en' ? undefined : dicts[current]
  return fill((d && d[en]) || en, vars)
}

/** The English text with placeholders filled — for fallbacks (e.g. an English TTS voice). */
export function tEn(en: string, vars?: Record<string, string | number>): string { return fill(en, vars) }

// Locales whose CLDR default digits are not Latin; keep Latin digits so dates match ₹ amounts.
const LATN = new Set(['mr', 'bn', 'as', 'ur'])
/** Locale for toLocaleDateString/toLocaleTimeString on display-only dates (e.g. 'ta-IN'). */
export function dateLocale(): string {
  if (current === 'en') return 'en-IN'
  return LATN.has(current) ? `${current}-IN-u-nu-latn` : `${current}-IN`
}

/** A duration label from the catalog ("30 min", "2 hrs", "2.5 hrs", "1 hr") in the current language. */
export function tDur(label: string): string {
  const m = /^\s*([\d.]+)\s*(min|mins|hr|hrs|hour|hours)\s*$/i.exec(label || '')
  if (!m) return t(label)
  const n = m[1]
  return /^m/i.test(m[2]) ? t('{n} min', { n }) : n === '1' ? t('1 hr') : t('{n} hrs', { n })
}
