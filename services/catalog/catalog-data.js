// Static catalogue content (durations, inclusions, reviews) — ported verbatim from the
// monolith's server/catalog.js so this service is self-contained. The service *list* and
// prices live in Postgres (system of record); this file supplies the rich detail content.

export const CATEGORIES = ['Cleaning']

export const SERVICES_SEED = [
  ['mopping',      'Sweeping & Mopping',        '🧹', 129, 'Cleaning', 1],
  ['dusting',      'Dusting Furniture',         '🪶', 119, 'Cleaning', 1],
  ['dishwashing',  'Dishwashing',               '🍽️', 119, 'Cleaning', 1],
  ['bathroom',     'Bathroom Cleaning',         '🚿', 149, 'Cleaning', 1],
  ['kitchen',      'Kitchen Cleaning',          '🍳', 149, 'Cleaning', 1],
  ['laundry',      'Laundry Washing & Folding', '🧺', 129, 'Cleaning', 1],
  ['window',       'Window Cleaning',           '🪟', 149, 'Cleaning', 1],
  ['fan',          'Fan Cleaning',              '🌀', 99,  'Cleaning', 1],
  ['bedmaking',    'Bed Making',                '🛏️', 99,  'Cleaning', 1],
  ['garbage',      'Garbage Disposal',          '🗑️', 79,  'Cleaning', 1],
  ['organization', 'Basic Home Organization',   '🗄️', 149, 'Cleaning', 1],
]

export const SERVICE_IMAGES = {
  mopping: '/services/mopping.jpg', dusting: '/services/dusting.jpg', dishwashing: '/services/dishwashing.jpg',
  bathroom: '/services/bathroom.jpg', kitchen: '/services/kitchen.jpg', laundry: '/services/laundry.jpg',
  window: '/services/window.jpg', fan: '/services/fan.jpg', bedmaking: '/services/bedmaking.jpg',
  garbage: '/services/garbage.jpg', organization: '/services/organization.jpg',
}

const DUR = [
  { id: '60m', label: '60 min', minutes: 60, add: 0 },
  { id: '90m', label: '90 min', minutes: 90, add: 50 },
  { id: '2h', label: '2 hrs', minutes: 120, add: 100 },
  { id: '2h30', label: '2.5 hrs', minutes: 150, add: 160 },
  { id: '3h', label: '3 hrs', minutes: 180, add: 220 },
  { id: '3h30', label: '3.5 hrs', minutes: 210, add: 280 },
  { id: '4h', label: '4 hrs', minutes: 240, add: 340 },
]

export function durationsFor(base) {
  return DUR.map((d) => {
    const price = base + d.add
    const original = Math.ceil((price * 1.5) / 100) * 100 - 1
    return { id: d.id, label: d.label, minutes: d.minutes, price, original }
  })
}

const DETAILS = {
  mopping: { desc: 'Thorough sweeping and wet mopping of all your floors for a spotless, fresh-smelling home.', includes: ['Sweep all floors & corners', 'Wet mop with floor cleaner', 'Spot-clean marks & spills', 'Clean under reachable furniture', 'Empty dustpan & tidy up'], excludes: ['Moving heavy furniture', 'Marble polishing or buffing', 'Cleaning ceilings or high areas', 'Stain removal or restoration'] },
  dusting: { desc: 'Careful dusting and wiping of furniture, shelves and décor to keep your home fresh and dust-free.', includes: ['Dust shelves, furniture & décor', 'Wipe counters & tabletops', 'Clean appliance exteriors', 'Dust frames & showpieces', 'Tidy and arrange surfaces'], excludes: ['Moving heavy furniture', 'Cleaning ceilings or high areas', 'Using unstable stools or ladders', 'Stain removal or restoration'] },
  dishwashing: { desc: 'Get all your utensils washed, dried and stacked neatly. Perfect after parties or busy days.', includes: ['Washing all utensils', 'Drying & stacking', 'Sink area wipe-down', 'Clean and shine taps'], excludes: ['Dishwasher loading', 'Utensil polishing', 'Stain removal or restoration'] },
  laundry: { desc: 'Sorting, machine wash, drying and neat folding of your clothes. Hassle-free laundry at home.', includes: ['Sorting by color/fabric', 'Machine wash & dry', 'Neat folding/hanging', 'Sink/area tidy-up'], excludes: ['Ironing (book separately)', 'Dry cleaning', 'Starching', 'Hand-wash delicates (on request)'] },
  bathroom: { desc: 'Deep scrub of tiles, fittings, toilet and floor for a sparkling, germ-free bathroom.', includes: ['Tile & floor scrubbing', 'Toilet & sink sanitization', 'Fittings & mirror polish'], excludes: ['Drain unclogging', 'Grout replacement'] },
  kitchen: { desc: 'Degrease and sanitize your kitchen — counters, stove, sink and tiles.', includes: ['Counter & stove degreasing', 'Sink & tile cleaning', 'Cabinet exterior wipe'], excludes: ['Chimney deep service', 'Inside-cabinet declutter'] },
  window: { desc: 'Streak-free cleaning of windows, glass, sills and grills (interior reachable areas).', includes: ['Glass cleaning both sides (reachable)', 'Sill & track wipe', 'Grill dusting', 'Frame wipe'], excludes: ['Exterior high-rise glass', 'Ladders above 6ft', 'Broken glass repair'] },
  fan: { desc: 'Dust and wipe your ceiling and table fans so they run clean and dust-free.', includes: ['Dust & wipe fan blades', 'Clean motor housing exterior', 'Wipe reachable mounts', 'Clear cobwebs around the fan'], excludes: ['Electrical repair or wiring', 'Dismantling the fan', 'Heights above safe reach', 'Using unstable ladders'] },
  bedmaking: { desc: 'Fresh bed making and tidy bedroom linen — neatly changed, tucked and arranged.', includes: ['Change & tuck bed sheets', 'Fluff & arrange pillows', 'Fold or arrange blankets', 'Tidy the bedside area'], excludes: ['Laundry/washing of linen', 'Mattress deep cleaning', 'Stain removal or restoration'] },
  garbage: { desc: 'Collect, bag and dispose of household garbage and reset clean bin liners.', includes: ['Collect waste from all bins', 'Bag & tie securely', 'Dispose at the collection point', 'Fit fresh bin liners', 'Wipe bin exterior'], excludes: ['Hazardous or chemical waste', 'Construction debris', 'Bulk/furniture disposal', 'Deep bin scrubbing'] },
  organization: { desc: 'Declutter and neatly arrange your wardrobes, shelves and everyday spaces.', includes: ['Organise wardrobes & shelves', 'Fold & arrange clothes', 'Declutter tabletops & drawers', 'Arrange everyday items neatly', 'Tidy living spaces'], excludes: ['Deep cleaning of surfaces', 'Moving heavy furniture', 'Discarding items without consent'] },
}

const HEADLINES = {
  mopping: 'Spotless Floors, Every Single Day', dusting: 'A Fresh, Dust-Free Home', dishwashing: 'Sparkling Utensils Without The Scrubbing',
  bathroom: 'A Sparkling, Germ-Free Bathroom', kitchen: 'A Clean Kitchen, Ready To Cook', laundry: 'Fresh, Neatly Folded Laundry',
  window: 'Crystal-Clear, Streak-Free Windows', fan: 'Dust-Free Fans That Run Clean', bedmaking: 'A Neatly Made Bed, Every Time',
  garbage: 'Hassle-Free Garbage Disposal', organization: 'An Organized, Clutter-Free Home',
}

const SAMPLE_REVIEWS = [
  { name: 'Priya S.', rating: 5, text: 'Expert arrived in 12 minutes and did a fantastic job!', date: '2 days ago' },
  { name: 'Amit K.', rating: 5, text: 'Very professional and thorough. Highly recommend.', date: '5 days ago' },
  { name: 'Neha R.', rating: 4, text: 'Good service, on time. Will book again.', date: '1 week ago' },
]

const RATINGS = { bathroom: 4.8, kitchen: 4.7, dishwashing: 4.7, laundry: 4.6 }
const EQUIPMENT_NOTE = 'Please provide all necessary equipments for the expert'
const SERVICE_TERMS = [
  { t: 'Pricing', d: 'The price shown is for the duration you select. If the job needs more time, the expert will confirm any change with you before continuing.' },
  { t: 'Free cancellation', d: 'Cancel free of charge until an expert is assigned. A ₹50 fee applies once the expert is on the way to you.' },
  { t: 'Rescheduling', d: 'Reschedule at no cost up to 1 hour before your selected slot.' },
  { t: 'Equipment & supplies', d: 'Please provide the cleaning supplies and equipment required for the service unless otherwise stated.' },
  { t: 'Payments', d: 'Online payments are charged at the time of booking. Cash payments are made directly to the expert after the service.' },
]

export function detailsFor(id, base) {
  const d = DETAILS[id] || { desc: '', includes: [], excludes: [] }
  return {
    description: d.desc, headline: HEADLINES[id] || '', image: SERVICE_IMAGES[id] || null,
    includes: d.includes, excludes: d.excludes, note: EQUIPMENT_NOTE, terms: SERVICE_TERMS,
    durations: durationsFor(base), rating: RATINGS[id] ?? 4.6,
    reviewsCount: 120 + (id.length * 37) % 400, reviews: SAMPLE_REVIEWS,
  }
}

/* ---------- pricing, coupons, home content (ported from the monolith catalog) ---------- */
export const REFERRAL = { code: 'HOMEHELP150', reward: 150, label: 'Earn ₹150 for every friend you refer' }

export const TRUST_BADGES = [
  { icon: '🏅', label: 'Top Rated Experts' },
  { icon: '📜', label: 'Professionally Trained' },
  { icon: '🛡️', label: 'Background Verified' },
]

export const COUPONS = [
  { code: 'SNAB50', type: 'flat', value: 50, min: 199, label: '₹50 off on orders above ₹199' },
  { code: 'FIRST100', type: 'flat', value: 100, min: 299, label: '₹100 off your first booking' },
  { code: 'CLEAN20', type: 'pct', value: 20, max: 120, min: 249, label: '20% off up to ₹120' },
]

export function applyCoupon(code, subtotal) {
  const c = COUPONS.find((x) => x.code === String(code || '').toUpperCase())
  if (!c) return { error: 'Invalid coupon code' }
  if (subtotal < c.min) return { error: `Add ₹${c.min - subtotal} more to use ${c.code}` }
  const discount = c.type === 'flat' ? c.value : Math.min(c.max, Math.round((subtotal * c.value) / 100))
  return { code: c.code, discount, label: c.label }
}

// Platform fee & taxes are 0 — total payable = item total − discount.
export function priceBreakdown(subtotal, discount = 0) {
  const fee = 0, tax = 0
  const total = Math.max(0, subtotal + fee + tax - discount)
  return { subtotal, fee, tax, discount, total }
}
