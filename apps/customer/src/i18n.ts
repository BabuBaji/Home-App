// Tiny i18n layer (no dependencies). Copy is written in English in the components and wrapped in
// t('…'); when the chosen language is Hindi the English text is looked up in the Hindi dictionary
// (keyed by the exact English string). Anything missing — or any language other than English and
// Hindi — falls back to the English text, so an untranslated string never breaks a screen.
//
//   t('Book Now')                         → 'अभी बुक करें' (hi) / 'Book Now' (en)
//   t('Hi {name}', { name: 'Asha' })      → placeholders are filled in both languages
//
// The language lives in localStorage 'hh_lang' (default 'en'). setLang() saves it, updates
// <html lang> and notifies subscribers; useLang() re-renders a component when it changes.
import { useSyncExternalStore } from 'react'
import { HI } from './i18n.hi'

export type LangCode = string
/** Languages with a real translation. Every other code falls back to English. */
export const TRANSLATED: readonly string[] = ['en', 'hi']

const KEY = 'hh_lang'

function readStored(): LangCode {
  try { return localStorage.getItem(KEY) || 'en' } catch { return 'en' }
}

let current: LangCode = readStored()
const listeners = new Set<() => void>()

function applyHtmlLang() {
  try { document.documentElement.lang = TRANSLATED.includes(current) ? current : 'en' } catch { /* SSR / no DOM */ }
}
applyHtmlLang()

export function getLang(): LangCode { return current }

/** Save the language and switch the UI immediately. */
export function setLang(code: LangCode) {
  const next = code || 'en'
  try { localStorage.setItem(KEY, next) } catch { /* private mode — still switch for this session */ }
  if (next === current) return
  current = next
  applyHtmlLang()
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Current language; the calling component re-renders when it changes. */
export function useLang(): LangCode {
  return useSyncExternalStore(subscribe, getLang, getLang)
}

function fill(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** Translate an English UI string (the English text is the key). */
export function t(en: string, vars?: Record<string, string | number>): string {
  const s = current === 'hi' ? (HI[en] ?? en) : en
  return fill(s, vars)
}

/** Locale for toLocaleDateString/toLocaleTimeString on display-only dates. */
export function dateLocale(): string { return current === 'hi' ? 'hi-IN' : 'en-IN' }
