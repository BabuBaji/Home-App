import type { Address } from './types'

/** Full address for a details row: the address line, with the flat / apartment / PIN prepended or
 *  appended only when the line doesn't already contain them ("Ag12, Kalpataru residency, 500018"). */
export function fullAddress(a: Pick<Address, 'house' | 'apartment' | 'line' | 'pincode'> | null | undefined): string {
  if (!a) return ''
  const line = (a.line || '').trim()
  const has = (v?: string | null) => !!v && line.toLowerCase().includes(String(v).trim().toLowerCase())
  const head = [a.house, a.apartment].map((v) => (v || '').trim()).filter((v) => v && !has(v))
  const pin = a.pincode && !has(a.pincode) ? [a.pincode] : []
  return [...head, line, ...pin].filter(Boolean).join(', ')
}

/** One-line "flat, building/area" summary — "Ag12, Kalpataru" — used wherever an address has to
 *  fit on a single line (Home header, booking screen). Falls back to the city, de-dupes repeats
 *  ("Hyderabad, Hyderabad"), and skips a part the line already contains. */
export function shortAddress(a: Pick<Address, 'house' | 'apartment' | 'line' | 'city'> | null | undefined): string {
  if (!a) return ''
  const line = (a.line || '').split(',')[0].trim()
  const parts = [a.house, a.apartment, line, a.city].map((v) => (v || '').trim()).filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    const lp = p.toLowerCase()
    if (out.some((x) => x.toLowerCase() === lp || x.toLowerCase().includes(lp) || lp.includes(x.toLowerCase()))) continue
    out.push(p)
    if (out.length === 2) break   // flat + building is enough for one line
  }
  return out.join(', ')
}
