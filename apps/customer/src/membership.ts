// Membership plan catalog for Module 10 (Subscription). This is plan/pricing CONTENT (like a
// pricing page), not user data — safe to define here. Real subscription state (who is subscribed,
// billing, renewals) is a later backend feature; these screens are the UI for it.
export interface Plan {
  key: 'silver' | 'gold' | 'platinum'
  name: string
  price: number
  tagline: string
  popular?: boolean
  features: string[]
  discountCap: number
}

export const PLANS: Plan[] = [
  { key: 'silver', name: 'Silver', price: 299, tagline: 'Best for small homes', discountCap: 1000,
    features: ['Up to ₹1,000 off on bookings', 'Priority customer support', 'Exclusive member offers'] },
  { key: 'gold', name: 'Gold', price: 599, tagline: 'Great for regular users', popular: true, discountCap: 2500,
    features: ['Up to ₹2,500 off on bookings', 'Free add-ons every month', 'Priority support', 'Exclusive member offers'] },
  { key: 'platinum', name: 'Platinum', price: 999, tagline: 'Best value for family', discountCap: 5000,
    features: ['Up to ₹5,000 off on bookings', 'Free add-ons every month', 'Priority support', 'Exclusive member offers', 'No convenience fees'] },
]

export const planByKey = (k: string) => PLANS.find((p) => p.key === k) || PLANS[1]

// Billing cycles (monthly base × months, with a saving for longer commitments).
export const CYCLES = [
  { key: 'monthly', label: 'Monthly', months: 1 },
  { key: '3m', label: '3 Months', months: 3, savePct: 0.11 },
  { key: '12m', label: '12 Months', months: 12, savePct: 0.17 },
]
export function cyclePrice(price: number, months: number, savePct = 0) {
  const gross = price * months
  return { total: Math.round(gross * (1 - savePct)), save: Math.round(gross * savePct) }
}

// Comparison matrix (rows × plan support). true=✓, false=—.
export const COMPARE_ROWS: { label: string; silver: string | boolean; gold: string | boolean; platinum: string | boolean }[] = [
  { label: 'Discount on Bookings', silver: 'Upto ₹1,000', gold: 'Upto ₹2,500', platinum: 'Upto ₹5,000' },
  { label: 'Free Add-ons', silver: false, gold: 'Monthly', platinum: 'Monthly' },
  { label: 'Priority Support', silver: true, gold: true, platinum: true },
  { label: 'Exclusive Offers', silver: true, gold: true, platinum: true },
  { label: 'No Convenience Fees', silver: false, gold: false, platinum: true },
  { label: 'Early Access to Offers', silver: false, gold: true, platinum: true },
  { label: 'Rollover Benefits', silver: false, gold: true, platinum: true },
]

export const BENEFITS = [
  { icon: '💸', t: 'Up to ₹2,500 off on every booking', d: 'Save more on every service' },
  { icon: '🎁', t: 'Free Add-ons every month', d: 'Get extra services at no cost' },
  { icon: '🎧', t: 'Priority Customer Support', d: 'Faster response, always' },
  { icon: '🏷️', t: 'Exclusive Member Offers', d: 'Special deals & early access' },
  { icon: '✅', t: 'No Convenience Fees', d: 'Pay less on every booking' },
  { icon: '🔁', t: 'Flexible Cancellation', d: 'Cancel or reschedule with ease' },
  { icon: '📦', t: 'Rollover Benefits', d: 'Unused benefits roll over' },
]

export const money = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`
