// Rich, Snabbit-style service catalogue: durations, inclusions, reviews, coupons.

export const CATEGORIES = ['Cleaning', 'Kitchen', 'Bathroom', 'Laundry', 'Deep Cleaning', 'Beauty', 'Repairs']

// base = hourly/visit rate (INR). available toggled in DB.
export const SERVICES_SEED = [
  ['cleaning',   'Home Cleaning',     '🧹', 149, 'Cleaning',      1],
  ['dishwashing','Dishwashing',       '🍽️', 129, 'Kitchen',       1],
  ['laundry',    'Laundry',           '🧺', 149, 'Laundry',       1],
  ['ironing',    'Ironing',           '👔', 99,  'Laundry',       1],
  ['bathroom',   'Bathroom Cleaning', '🚿', 199, 'Bathroom',      1],
  ['kitchen',    'Kitchen Cleaning',  '🍳', 199, 'Kitchen',       1],
  ['deep',       'Deep Cleaning',     '✨', 499, 'Deep Cleaning', 1],
  ['beauty',     'Beauty at Home',    '💅', 299, 'Beauty',        1],
  ['plumbing',   'Plumbing',          '🔧', 199, 'Repairs',       1],
  ['electrical', 'Electrical',        '💡', 199, 'Repairs',       1],
  ['appliance',  'Appliance Repair',  '🛠️', 249, 'Repairs',       0],
]

// duration multipliers applied to the base rate
const DUR = [
  { id: '30m', label: '30 min', minutes: 30, mult: 0.6 },
  { id: '1h',  label: '1 hour', minutes: 60, mult: 1 },
  { id: '2h',  label: '2 hours', minutes: 120, mult: 1.9 },
  { id: '3h',  label: '3 hours', minutes: 180, mult: 2.7 },
]

export function durationsFor(base) {
  return DUR.map((d) => ({ id: d.id, label: d.label, minutes: d.minutes, price: Math.round(base * d.mult) }))
}

const DETAILS = {
  cleaning: {
    desc: 'Routine home cleaning — sweeping, mopping, dusting and fan cleaning by a trained, verified expert.',
    includes: ['Sweeping & mopping all rooms', 'Dusting surfaces & furniture', 'Fan & switchboard wiping', 'Trash disposal'],
    excludes: ['Wall/ceiling cleaning', 'Moving heavy furniture', 'Cleaning chemicals (if not provided)'],
  },
  dishwashing: {
    desc: 'Get all your utensils washed, dried and stacked neatly. Perfect after parties or busy days.',
    includes: ['Washing all utensils', 'Drying & stacking', 'Sink area wipe-down'],
    excludes: ['Dishwasher loading', 'Utensil polishing'],
  },
  laundry: {
    desc: 'Sorting, machine wash and drying of your clothes. Hassle-free laundry at home.',
    includes: ['Sorting by color/fabric', 'Machine wash & dry', 'Folding'],
    excludes: ['Dry cleaning', 'Hand-wash delicates (on request)'],
  },
  ironing: {
    desc: 'Crisp, wrinkle-free clothes ironed and folded by an expert.',
    includes: ['Ironing of garments', 'Neat folding/hanging'],
    excludes: ['Starching', 'Delicate silk/wool (on request)'],
  },
  bathroom: {
    desc: 'Deep scrub of tiles, fittings, toilet and floor for a sparkling, germ-free bathroom.',
    includes: ['Tile & floor scrubbing', 'Toilet & sink sanitization', 'Fittings & mirror polish'],
    excludes: ['Drain unclogging', 'Grout replacement'],
  },
  kitchen: {
    desc: 'Degrease and sanitize your kitchen — counters, stove, sink and tiles.',
    includes: ['Counter & stove degreasing', 'Sink & tile cleaning', 'Cabinet exterior wipe'],
    excludes: ['Chimney deep service', 'Inside-cabinet declutter'],
  },
  deep: {
    desc: 'Intensive top-to-bottom deep clean of your entire home. Recommended seasonally.',
    includes: ['All rooms deep cleaned', 'Kitchen & bathroom deep scrub', 'Windows & grills', 'Behind/under furniture'],
    excludes: ['Pest control', 'Sofa/carpet shampoo (add-on)'],
  },
  beauty: {
    desc: 'Salon-grade beauty services at home by certified beauticians.',
    includes: ['Service as selected', 'Sanitized, single-use kit', 'Premium products'],
    excludes: ['Bridal packages', 'Hair coloring (separate booking)'],
  },
  plumbing: {
    desc: 'Fix leaks, taps, flushes and pipe issues with a verified plumber.',
    includes: ['Inspection & diagnosis', 'Minor repairs & fittings', 'Leak fixing'],
    excludes: ['Spare parts cost', 'Major pipeline work'],
  },
  electrical: {
    desc: 'Switches, wiring, fans, lights and minor electrical repairs by a certified electrician.',
    includes: ['Inspection & diagnosis', 'Switch/socket/fan fixes', 'Minor wiring'],
    excludes: ['Spare parts cost', 'Full rewiring'],
  },
  appliance: {
    desc: 'Repair of common home appliances — washing machine, microwave, AC and more.',
    includes: ['Inspection & diagnosis', 'Minor repair', 'Performance check'],
    excludes: ['Spare parts cost', 'Gas refilling'],
  },
}

const SAMPLE_REVIEWS = [
  { name: 'Priya S.', rating: 5, text: 'Expert arrived in 12 minutes and did a fantastic job!', date: '2 days ago' },
  { name: 'Amit K.', rating: 5, text: 'Very professional and thorough. Highly recommend.', date: '5 days ago' },
  { name: 'Neha R.', rating: 4, text: 'Good service, on time. Will book again.', date: '1 week ago' },
]

const RATINGS = {
  cleaning: 4.8, dishwashing: 4.7, laundry: 4.6, ironing: 4.7, bathroom: 4.8,
  kitchen: 4.7, deep: 4.9, beauty: 4.8, plumbing: 4.6, electrical: 4.6, appliance: 4.5,
}

export function detailsFor(id, base) {
  const d = DETAILS[id] || { desc: '', includes: [], excludes: [] }
  return {
    description: d.desc,
    includes: d.includes,
    excludes: d.excludes,
    durations: durationsFor(base),
    rating: RATINGS[id] ?? 4.6,
    reviewsCount: 120 + (id.length * 37) % 400,
    reviews: SAMPLE_REVIEWS,
  }
}

export const COUPONS = [
  { code: 'SNAB50', type: 'flat', value: 50, min: 199, label: '₹50 off on orders above ₹199' },
  { code: 'FIRST100', type: 'flat', value: 100, min: 299, label: '₹100 off your first booking' },
  { code: 'CLEAN20', type: 'pct', value: 20, max: 120, min: 249, label: '20% off up to ₹120' },
]

export function applyCoupon(code, subtotal) {
  const c = COUPONS.find((x) => x.code === String(code || '').toUpperCase())
  if (!c) return { error: 'Invalid coupon code' }
  if (subtotal < c.min) return { error: `Add ₹${c.min - subtotal} more to use ${c.code}` }
  let discount = c.type === 'flat' ? c.value : Math.min(c.max, Math.round((subtotal * c.value) / 100))
  return { code: c.code, discount, label: c.label }
}

export const CANCEL_REASONS = [
  'Booked by mistake', 'Found a better price', 'Service no longer needed',
  'Pro is taking too long', 'Want to change date/time', 'Other',
]

export const PLATFORM_FEE = 20
export const TAX_RATE = 0.05 // 5% GST

export function priceBreakdown(subtotal, discount = 0) {
  const fee = subtotal > 0 ? PLATFORM_FEE : 0
  const tax = Math.round(subtotal * TAX_RATE)
  const total = Math.max(0, subtotal + fee + tax - discount)
  return { subtotal, fee, tax, discount, total }
}
