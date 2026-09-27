// The time chosen on the schedule screen travels with "Add to cart", so the cart and its checkout
// book that slot instead of asking again. One slot for the whole cart: all its services are done in
// one visit. Kept in localStorage so it survives closing the app (the cart itself is too).
export interface CartWhen { mode: 'now' | 'schedule'; date: string; min: number; time: string; label: string; freq: string }
const KEY = 'hh_cart_when'

export function getCartWhen(): CartWhen | null {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) as CartWhen : null } catch { return null }
}
export function setCartWhen(w: CartWhen | null) {
  try { if (w) localStorage.setItem(KEY, JSON.stringify(w)); else localStorage.removeItem(KEY) } catch { /* private mode */ }
}
