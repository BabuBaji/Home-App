// Rich, Snabbit-style service catalogue: durations, inclusions, reviews, coupons.

export const CATEGORIES = ['Cleaning', 'Kitchen', 'Bathroom', 'Laundry', 'Deep Cleaning', 'Beauty', 'Repairs', 'Appliance', 'Care', 'Outdoor']

// base = starting price for the shortest (60 min) slot (INR). available toggled in DB.
// `image` is a photo for the Snabbit-style tile (falls back to the emoji if it fails to load).
export const SERVICES_SEED = [
  ['cleaning',   'House Cleaning',     '🧹', 129, 'Cleaning',      1],
  ['dusting',    'Dusting & Wiping',   '🧽', 129, 'Cleaning',      1],
  ['bathroom',   'Bathroom Cleaning',  '🚿', 149, 'Bathroom',      1],
  ['laundry',    'Laundry & Ironing',  '🧺', 129, 'Laundry',       1],
  ['dishwashing','Cleaning Dishes',    '🍽️', 119, 'Kitchen',       1],
  ['kitchen',    'Kitchen Cleaning',   '🍳', 149, 'Kitchen',       1],
  ['sofa',       'Sofa Cleaning',      '🛋️', 299, 'Deep Cleaning', 1],
  ['carpet',     'Carpet Cleaning',    '🧶', 249, 'Deep Cleaning', 1],
  ['window',     'Window Cleaning',    '🪟', 149, 'Cleaning',      1],
  ['fridge',     'Fridge Cleaning',    '🧊', 199, 'Kitchen',       1],
  ['deep',       'Deep Cleaning',      '✨', 299, 'Deep Cleaning', 1],
  ['cooking',    'Cooking Help',       '🍲', 199, 'Care',          1],
  ['babycare',   'Baby Care',          '🍼', 249, 'Care',          1],
  ['eldercare',  'Elderly Care',       '🧓', 249, 'Care',          1],
  ['petcare',    'Pet Care',           '🐾', 199, 'Care',          1],
  ['beauty',     'Beauty at Home',     '💅', 249, 'Beauty',        1],
  ['salon',      'Salon for Men',      '💈', 199, 'Beauty',        1],
  ['ac',         'AC Service & Repair','❄️', 399, 'Appliance',     1],
  ['appliance',  'Appliance Repair',   '🛠️', 199, 'Appliance',     1],
  ['plumbing',   'Plumbing',           '🔧', 149, 'Repairs',       1],
  ['electrical', 'Electrical',         '💡', 149, 'Repairs',       1],
  ['carpentry',  'Carpentry',          '🪚', 199, 'Repairs',       1],
  ['painting',   'Painting',           '🎨', 299, 'Repairs',       1],
  ['pestcontrol','Pest Control',       '🐜', 499, 'Outdoor',       1],
  ['gardening',  'Gardening',          '🌿', 199, 'Outdoor',       1],
]

// Photos for the home tiles (Unsplash; tiles fall back to a tinted emoji if offline).
const IMG = (id) => `https://images.unsplash.com/photo-${id}?w=400&q=70&auto=format&fit=crop`
export const SERVICE_IMAGES = {
  cleaning:    IMG('1628177142898-93e36e4e3a50'),
  dusting:     IMG('1527515637462-cff94eecc1ac'),
  bathroom:    IMG('1604709177225-055f99402ea3'),
  laundry:     IMG('1604335399105-a0c585fd81a1'),
  dishwashing: IMG('1556911220-bff31c812dba'),
  kitchen:     IMG('1556909114-f6e7ad7d3136'),
  sofa:        IMG('1555041469-a586c61ea9bc'),
  carpet:      IMG('1505693416388-ac5ce068fe85'),
  window:      IMG('1556912173-3bb406ef7e77'),
  fridge:      IMG('1584269600464-37b1b58a9fe7'),
  deep:        IMG('1581578731548-c64695cc6952'),
  cooking:     IMG('1466637574441-749b8f19452f'),
  babycare:    IMG('1492725764893-90b379c2b6e7'),
  eldercare:   IMG('1576765608535-5f04d1e3f289'),
  petcare:     IMG('1450778869180-41d0601e046e'),
  beauty:      IMG('1596755389378-c31d21fd1273'),
  salon:       IMG('1503951914875-452162b0f3f1'),
  ac:          IMG('1635048424329-a9bfb146d7aa'),
  appliance:   IMG('1581092918056-0c4c3acd3789'),
  plumbing:    IMG('1607472586893-edb57bdc0e39'),
  electrical:  IMG('1565608087341-404b25492fee'),
  carpentry:   IMG('1504148455328-c376907d081c'),
  painting:    IMG('1589939705384-5185137a7f0f'),
  pestcontrol: IMG('1558618666-fcd25c85cd64'),
  gardening:   IMG('1416879595882-3373a0480b5b'),
}

// Snabbit-style duration ladder. price = base + add; original is the struck-through
// "before discount" price, rounded to a clean ₹x99 just like the reference app.
const DUR = [
  { id: '60m',  label: '60 min',  minutes: 60,  add: 0 },
  { id: '90m',  label: '90 min',  minutes: 90,  add: 50 },
  { id: '2h',   label: '2 hrs',   minutes: 120, add: 100 },
  { id: '2h30', label: '2.5 hrs', minutes: 150, add: 160 },
  { id: '3h',   label: '3 hrs',   minutes: 180, add: 220 },
  { id: '3h30', label: '3.5 hrs', minutes: 210, add: 280 },
  { id: '4h',   label: '4 hrs',   minutes: 240, add: 340 },
]

export function durationsFor(base) {
  return DUR.map((d) => {
    const price = base + d.add
    const original = Math.ceil((price * 1.5) / 100) * 100 - 1
    return { id: d.id, label: d.label, minutes: d.minutes, price, original }
  })
}

const DETAILS = {
  cleaning: {
    desc: 'One expert who can do it all — reachable fans, kitchen prep, wardrobes, bedding and more, by a trained, verified pro.',
    includes: [
      'Clean reachable fans and cobwebs', 'Basic kitchen prep (washing/chopping)', 'Clean fridge',
      'Organising Wardrobes', 'Clean kitchen slab and stove top', 'Clean windows (interior areas)',
      'Change or rearrange existing bedding', 'Arrange sofa cushions', 'Arrange tabletops (dining or study)',
      'Clean and shine mirrors and taps', 'Clean appliance exteriors',
    ],
    excludes: ['Cleaning ceilings or high areas', 'Using unstable stools or ladders', 'Moving heavy furniture', 'Exterior grills/windows', 'Stain removal or restoration'],
  },
  dusting: {
    desc: 'Dust and wipe shelves, counters, decor and sills for a fresh, fingerprint-free home.',
    includes: ['Dusting shelves and furniture', 'Wipe counters, tables & decor', 'Clean window sills/grills', 'Remove accessible cobwebs', 'Clean appliance exteriors'],
    excludes: ['Dusting ceilings or high areas', 'Using unstable stools or ladders', 'No chandeliers or fragile items', 'No exterior grills/windows', 'Stain removal or restoration'],
  },
  dishwashing: {
    desc: 'Get all your utensils washed, dried and stacked neatly. Perfect after parties or busy days.',
    includes: ['Washing all utensils', 'Drying & stacking', 'Sink area wipe-down', 'Clean and shine taps'],
    excludes: ['Dishwasher loading', 'Utensil polishing', 'Stain removal or restoration'],
  },
  laundry: {
    desc: 'Sorting, machine wash, drying and crisp ironing of your clothes. Hassle-free laundry at home.',
    includes: ['Sorting by color/fabric', 'Machine wash & dry', 'Ironing of garments', 'Neat folding/hanging'],
    excludes: ['Dry cleaning', 'Starching', 'Hand-wash delicates (on request)'],
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
  sofa: {
    desc: 'Deep shampoo and vacuum of your sofa and upholstery to lift dust, stains and odour.',
    includes: ['Vacuuming of seats & crevices', 'Foam shampoo & scrub', 'Stain spot-treatment', 'Quick-dry blower'],
    excludes: ['Leather restoration', 'Permanent/old stains', 'Re-upholstery'],
  },
  carpet: {
    desc: 'Machine shampoo and deodorise carpets and rugs for a fresh, dust-free finish.',
    includes: ['Dry vacuuming', 'Shampoo & scrub', 'Deodorising', 'Quick dry'],
    excludes: ['Silk/handmade rugs', 'Colour-bleed guarantee', 'Permanent stains'],
  },
  window: {
    desc: 'Streak-free cleaning of windows, glass, sills and grills (interior reachable areas).',
    includes: ['Glass cleaning both sides (reachable)', 'Sill & track wipe', 'Grill dusting', 'Frame wipe'],
    excludes: ['Exterior high-rise glass', 'Ladders above 6ft', 'Broken glass repair'],
  },
  fridge: {
    desc: 'Inside-out cleaning and sanitising of your refrigerator, shelves and trays.',
    includes: ['Empty & wipe all shelves', 'Sanitise interior', 'Defrost (if needed)', 'Exterior polish'],
    excludes: ['Gas/coolant service', 'Repair work', 'Food disposal'],
  },
  cooking: {
    desc: 'Home-style cooking help — prep, cook and clean-up by a trained helper.',
    includes: ['Veg & ingredient prep', 'Cook up to a set menu', 'Kitchen tidy-up', 'Utensil washing'],
    excludes: ['Groceries cost', 'Bulk/party catering', 'Specialised cuisines (on request)'],
  },
  babycare: {
    desc: 'Caring, background-verified help for your baby — feeding, play and nap routines.',
    includes: ['Feeding & burping help', 'Diaper change & hygiene', 'Engaging play', 'Nap routine'],
    excludes: ['Medical/nursing care', 'Overnight stay (separate booking)', 'Cooking for family'],
  },
  eldercare: {
    desc: 'Compassionate assistance for elders — mobility, companionship and daily routines.',
    includes: ['Mobility & walking support', 'Meal & medicine reminders', 'Companionship', 'Light housekeeping'],
    excludes: ['Clinical/nursing procedures', 'Injections', 'Overnight stay (separate booking)'],
  },
  petcare: {
    desc: 'Loving care for your pet — walks, feeding, grooming basics and clean-up.',
    includes: ['Walk & exercise', 'Feeding & water', 'Basic grooming & brushing', 'Litter/area clean-up'],
    excludes: ['Veterinary treatment', 'Aggressive pets (on assessment)', 'Boarding'],
  },
  salon: {
    desc: 'Grooming for men at home — haircut, shave and styling by a trained barber.',
    includes: ['Haircut & styling', 'Beard trim/shave', 'Head wash', 'Sanitised tools'],
    excludes: ['Hair colour (separate booking)', 'Facial/spa add-ons', 'Bridal/party packages'],
  },
  ac: {
    desc: 'AC service and repair — cleaning, gas check and cooling restoration by a technician.',
    includes: ['Filter & coil cleaning', 'Gas pressure check', 'Drainage clearing', 'Cooling test'],
    excludes: ['Gas refill cost', 'Spare parts', 'Installation/uninstallation'],
  },
  carpentry: {
    desc: 'Fix and fit — hinges, locks, drawers, shelves and minor furniture repairs.',
    includes: ['Inspection & diagnosis', 'Hinge/lock/handle fixes', 'Drawer & shelf repair', 'Minor fittings'],
    excludes: ['Wood/material cost', 'New furniture making', 'Polishing'],
  },
  painting: {
    desc: 'Touch-ups and small painting jobs with a clean, professional finish.',
    includes: ['Surface prep & masking', 'Patch & touch-up', 'One-coat painting (small area)', 'Clean-up'],
    excludes: ['Paint & material cost', 'Full-home painting (quote)', 'Texture/POP work'],
  },
  pestcontrol: {
    desc: 'Safe, effective treatment for cockroaches, ants and common household pests.',
    includes: ['Inspection', 'Gel & spray treatment', 'Entry-point sealing tips', 'Safety guidance'],
    excludes: ['Termite/wood treatment (separate)', 'Rodent removal', 'Fumigation'],
  },
  gardening: {
    desc: 'Keep your garden tidy — trimming, weeding, watering and basic plant care.',
    includes: ['Trimming & pruning', 'Weeding & raking', 'Watering', 'Potting help'],
    excludes: ['Plants/manure cost', 'Tree felling', 'Landscaping design'],
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

export const EQUIPMENT_NOTE = 'Please provide all necessary equipments for the expert'

// Service terms & conditions shown on the booking page.
export const SERVICE_TERMS = [
  { t: 'Pricing', d: 'The price shown is for the duration you select. If the job needs more time, the expert will confirm any change with you before continuing.' },
  { t: 'Free cancellation', d: 'Cancel free of charge until an expert is assigned. A ₹50 fee applies once the expert is on the way to you.' },
  { t: 'Rescheduling', d: 'Reschedule at no cost up to 1 hour before your selected slot.' },
  { t: 'Equipment & supplies', d: 'Please provide the cleaning supplies and equipment required for the service unless otherwise stated.' },
  { t: 'Safe environment', d: 'Kindly ensure a safe and accessible workspace. Experts may decline unsafe, hazardous or out-of-scope tasks.' },
  { t: 'Payments', d: 'Online payments are charged at the time of booking. Cash payments are made directly to the expert after the service.' },
  { t: 'Respect & safety', d: 'All experts are background-verified. Please treat them with respect — any misconduct may lead to account suspension.' },
  { t: 'Liability', d: 'HomeHelp is not liable for pre-existing damage. Report any issue within 24 hours of service and our team will assist you.' },
  { t: 'Privacy', d: 'Your personal information is collected and used in line with our Privacy Policy.' },
]

export function detailsFor(id, base) {
  const d = DETAILS[id] || { desc: '', includes: [], excludes: [] }
  return {
    description: d.desc,
    image: SERVICE_IMAGES[id] || null,
    includes: d.includes,
    excludes: d.excludes,
    note: EQUIPMENT_NOTE,
    terms: SERVICE_TERMS,
    durations: durationsFor(base),
    rating: RATINGS[id] ?? 4.6,
    reviewsCount: 120 + (id.length * 37) % 400,
    reviews: SAMPLE_REVIEWS,
  }
}

// Referral card on the home screen.
export const REFERRAL = { code: 'HOMEHELP150', reward: 150, label: 'Earn ₹150 for every friend you refer' }

// Trust badges (the gold "Experts Vetted for Quality" section).
export const TRUST_BADGES = [
  { icon: '🏅', label: 'Top Rated Experts' },
  { icon: '📜', label: 'Professionally Trained' },
  { icon: '🛡️', label: 'Background Verified' },
]

// Payment gateway methods (grouped like a Razorpay/PhonePe checkout sheet).
export const PAYMENT_METHODS = [
  { group: 'UPI', recommended: true, options: [
    { id: 'phonepe', name: 'PhonePe', icon: '🟣', sub: 'UPI' },
    { id: 'gpay', name: 'Google Pay', icon: '🟢', sub: 'UPI' },
    { id: 'paytm', name: 'Paytm UPI', icon: '🔵', sub: 'UPI' },
    { id: 'bhim', name: 'BHIM / Other UPI', icon: '🇮🇳', sub: 'Enter UPI ID' },
  ] },
  { group: 'Cards', options: [
    { id: 'card', name: 'Credit / Debit Card', icon: '💳', sub: 'Visa, Mastercard, RuPay' },
  ] },
  { group: 'Net Banking', options: [
    { id: 'netbanking', name: 'Net Banking', icon: '🏦', sub: 'All major banks' },
  ] },
  { group: 'Wallets', options: [
    { id: 'wallet', name: 'HomeHelp Wallet', icon: '👛', sub: 'Use your balance' },
  ] },
  { group: 'Pay after service', options: [
    { id: 'cash', name: 'Cash after service', icon: '💵', sub: 'Pay the expert directly' },
  ] },
]

// External methods are settled by the gateway; wallet/cash are handled in-app.
export const EXTERNAL_METHODS = ['phonepe', 'gpay', 'paytm', 'bhim', 'upi', 'card', 'netbanking']
export function paymentLabel(id) {
  for (const g of PAYMENT_METHODS) { const o = g.options.find((x) => x.id === id); if (o) return o.name }
  return id
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
