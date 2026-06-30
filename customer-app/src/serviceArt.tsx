// Premium, on-brand service icon pack — a single consistent visual language for every service:
// a soft pastel card with a centered colourful gradient "medallion" holding a clean flat icon
// (lucide). No photos, no text, fully vector, mobile-optimised, matches the violet brand system.
//
// To swap in real 3D illustrations later: drop a PNG at /assets/services/<service-id>.png and
// pass it as `art` — see usage notes at the bottom.
import { useState, type ComponentType } from 'react'
import {
  Sparkles, SprayCan, Bath, ChefHat, CookingPot, Sofa, WashingMachine, Wind, Refrigerator,
  Tv, Zap, Wrench, Hammer, PaintRoller, Droplets, ShieldCheck, Bug, Leaf, Baby, Dog,
  Car, Package, Truck, ShoppingBag, Building2, ClipboardCheck, Shirt, Utensils, HeartHandshake,
  ShowerHead, Camera, Cctv, Feather, Fan, BedDouble, Trash2, LayoutGrid,
} from 'lucide-react'

type Tone =
  | 'violet' | 'indigo' | 'blue' | 'sky' | 'cyan' | 'teal'
  | 'green' | 'lime' | 'amber' | 'orange' | 'rose' | 'pink'

// [gradient from, gradient to, soft pastel background]
const TONE: Record<Tone, [string, string, string]> = {
  violet: ['#8b7cff', '#5b51e8', '#efedfe'],
  indigo: ['#7a83f6', '#4338ca', '#ecefff'],
  blue: ['#5aa0ff', '#2563eb', '#eaf2ff'],
  sky: ['#56c5fb', '#0284c7', '#e6f5ff'],
  cyan: ['#3ddcef', '#0891b2', '#e2f8fc'],
  teal: ['#3fded0', '#0d9488', '#e1faf5'],
  green: ['#54dca0', '#059669', '#e6f9ef'],
  lime: ['#b6e84f', '#65a30d', '#f1fbe0'],
  amber: ['#ffce5c', '#d97706', '#fff4df'],
  orange: ['#ff9f5a', '#ea580c', '#fff0e6'],
  rose: ['#ff8aa0', '#e11d48', '#ffe9ee'],
  pink: ['#ff8ed0', '#db2777', '#ffe9f6'],
}

type Art = [Tone, ComponentType<any>]

// Exact matches by service id (the seeded services).
const BY_ID: Record<string, Art> = {
  mopping: ['violet', SprayCan], dusting: ['amber', Feather], dishwashing: ['sky', Utensils],
  bathroom: ['cyan', ShowerHead], kitchen: ['orange', CookingPot], laundry: ['blue', WashingMachine],
  window: ['teal', Sparkles], fan: ['indigo', Fan], bedmaking: ['rose', BedDouble],
  garbage: ['green', Trash2], organization: ['pink', LayoutGrid],
}

// Fallback by keyword in the service name — covers the full 40-service catalogue.
const BY_KEYWORD: [string, Art][] = [
  ['bathroom', ['cyan', Bath]], ['washing machine', ['indigo', WashingMachine]], ['kitchen', ['orange', CookingPot]],
  ['deep', ['indigo', SprayCan]], ['sofa', ['rose', Sofa]], ['carpet', ['amber', SprayCan]],
  ['window', ['sky', Sparkles]], ['floor', ['blue', Droplets]], ['dust', ['violet', Wind]],
  ['laundry', ['blue', WashingMachine]], ['iron', ['pink', Shirt]], ['dish', ['sky', Utensils]],
  ['utensil', ['sky', Utensils]], ['saniti', ['green', ShieldCheck]], ['pest', ['lime', Bug]],
  ['air condition', ['sky', Wind]], [' ac', ['sky', Wind]], ['fridge', ['blue', Refrigerator]],
  ['refriger', ['blue', Refrigerator]], ['tv', ['violet', Tv]], ['electric', ['amber', Zap]],
  ['plumb', ['blue', Wrench]], ['carpent', ['orange', Hammer]], ['paint', ['rose', PaintRoller]],
  ['furniture', ['amber', Hammer]], ['purifier', ['cyan', Droplets]], ['geyser', ['orange', ShowerHead]],
  ['cctv', ['indigo', Cctv]], ['camera', ['indigo', Camera]], ['appliance', ['blue', Wrench]],
  ['inspect', ['green', ClipboardCheck]], ['garden', ['green', Leaf]], ['cook', ['orange', ChefHat]],
  ['elder', ['rose', HeartHandshake]], ['baby', ['pink', Baby]], ['child', ['pink', Baby]],
  ['pet', ['amber', Dog]], ['driver', ['indigo', Car]], ['mov', ['violet', Truck]], ['pack', ['violet', Truck]],
  ['courier', ['blue', Package]], ['grocery', ['green', ShoppingBag]], ['handyman', ['orange', Wrench]],
  ['office', ['teal', Building2]], ['commercial', ['indigo', Building2]], ['maid', ['violet', Sparkles]],
  ['water', ['cyan', Droplets]], ['clean', ['violet', Sparkles]], ['repair', ['blue', Wrench]],
  ['care', ['rose', HeartHandshake]],
]

function artFor(s: { id?: string; name?: string }): Art {
  if (s.id && BY_ID[s.id]) return BY_ID[s.id]
  const n = ` ${(s.name || '').toLowerCase()} `
  for (const [k, a] of BY_KEYWORD) if (n.includes(k)) return a
  return ['violet', Sparkles]
}

/** A single colourful gradient medallion (the icon coin). */
export function ServiceMedallion({ service, size = 56 }: { service: { id?: string; name?: string }; size?: number }) {
  const [tone, Icon] = artFor(service)
  const [from, to] = TONE[tone]
  return (
    <span style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3),
      background: `linear-gradient(150deg, ${from}, ${to})`, display: 'grid', placeItems: 'center',
      boxShadow: `0 10px 20px ${to}55, inset 0 1.5px 0 rgba(255,255,255,.42)`, position: 'relative', overflow: 'hidden', flexShrink: 0,
    }}>
      <span style={{ position: 'absolute', top: -size * 0.28, left: -size * 0.12, width: size * 0.7, height: size * 0.7, borderRadius: '50%', background: 'rgba(255,255,255,.28)' }} />
      <Icon size={Math.round(size * 0.46)} color="#fff" strokeWidth={2.1} style={{ position: 'relative', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.16))' }} />
    </span>
  )
}

/** Fills its (position:relative) parent with a soft pastel card + centered medallion. */
export function ServiceArt({ service, medallion = 56 }: { service: { id?: string; name?: string }; medallion?: number }) {
  return (
    <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#ffffff' }}>
      <ServiceMedallion service={service} size={medallion} />
    </span>
  )
}

/** Service photo that fills its (position:relative) parent, falling back to the brand medallion
 *  card if there's no image or it fails to load. */
export function ServiceThumb({ service, medallion = 56 }: { service: { id?: string; name?: string; image?: string | null }; medallion?: number }) {
  const [ok, setOk] = useState(true)
  if (service.image && ok) {
    return <img alt="" loading="lazy" decoding="async" src={service.image} onError={() => setOk(false)}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#fff' }} />
  }
  return <ServiceArt service={service} medallion={medallion} />
}

/** Hero photo for the detail page; falls back to the vibrant gradient hero. */
export function ServiceHeroImg({ service }: { service: { id?: string; name?: string; image?: string | null } }) {
  const [ok, setOk] = useState(true)
  if (service.image && ok) {
    return <img className="sd2-img" alt="" src={service.image} onError={() => setOk(false)} />
  }
  return <div className="sd2-img"><ServiceHero service={service} /></div>
}

/** Full-bleed vibrant gradient hero with a big white icon (white overlay text stays readable). */
export function ServiceHero({ service }: { service: { id?: string; name?: string } }) {
  const [tone, Icon] = artFor(service)
  const [from, to] = TONE[tone]
  return (
    <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: `linear-gradient(160deg, ${from}, ${to})` }}>
      <span style={{ position: 'absolute', top: '-12%', right: '-8%', width: '55%', height: '55%', borderRadius: '50%', background: 'rgba(255,255,255,.16)' }} />
      <Icon size={104} color="#ffffff" strokeWidth={1.7} style={{ marginBottom: 46, filter: 'drop-shadow(0 8px 16px rgba(0,0,0,.22))', opacity: 0.96 }} />
    </span>
  )
}
