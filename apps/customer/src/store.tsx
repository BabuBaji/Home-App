import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CartItem, User } from './types'
import { clearToken, setToken, saveUser, loadUser, clearUser, fetchMe, fetchZoneHours } from './api'
import { checkServiceable } from './geo'
import type { ZoneHours } from './components/Calendar'

interface Store {
  user: User | null
  signIn: (token: string, user: User) => void
  signOut: () => void
  setUser: (u: User) => void

  cart: CartItem[]
  addToCart: (i: CartItem) => void
  removeFromCart: (id: string) => void
  inCart: (id: string) => boolean
  clearCart: () => void

  bookingType: 'instant' | 'schedule'
  setBookingType: (t: 'instant' | 'schedule') => void
  date: string; setDate: (d: string) => void
  time: string; setTime: (t: string) => void
  payment: string; setPayment: (p: string) => void
  coupon: string; setCoupon: (c: string) => void
  addressLine: string; setAddressLine: (a: string) => void
  note: string; setNote: (n: string) => void
  pincode: string; setPincode: (p: string) => void   // current service-area pincode → zone pricing/offers
  serviceable: boolean | null                        // is the current pincode inside a live zone? (null = unknown/checking)
  zoneHours: ZoneHours | null                         // the serving zone's working hours (for open-now / slot checks)

  subtotal: number
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(loadUser())
  const [cart, setCart] = useState<CartItem[]>([])
  const [bookingType, setBookingType] = useState<'instant' | 'schedule'>('instant')
  const [date, setDate] = useState('16 May 2025')
  const [time, setTime] = useState('09:00 AM')
  const [payment, setPayment] = useState('phonepe')
  const [coupon, setCoupon] = useState('')
  const [addressLine, setAddressLine] = useState('')
  const [note, setNote] = useState('')
  const [pincode, setPincode] = useState('')
  const [serviceable, setServiceable] = useState<boolean | null>(null)
  const [zoneHours, setZoneHours] = useState<ZoneHours | null>(null)

  // Populate the current pincode from the customer's default address once signed in, so every
  // pricing screen can resolve the right zone's prices/offers without re-fetching addresses.
  useEffect(() => {
    if (!user) { setPincode(''); return }
    fetchMe().then(({ addresses }) => {
      const a = addresses.find((x) => x.is_default) || addresses[0]
      if (a?.pincode) setPincode(a.pincode)
    }).catch(() => {})
  }, [user])

  // Whenever the pincode changes, check if we actually serve that zone (drives the "coming soon" gate)
  // and load its working hours (drives the "we're closed now" gate for instant bookings).
  useEffect(() => {
    if (!pincode) { setServiceable(null); setZoneHours(null); return }
    setServiceable(null)
    checkServiceable(pincode).then((r) => setServiceable(r.serviceable)).catch(() => setServiceable(true))
    fetchZoneHours(pincode).then(setZoneHours).catch(() => setZoneHours(null))
  }, [pincode])

  const signIn = useCallback((t: string, u: User) => { setToken(t); saveUser(u); setUserState(u) }, [])
  const signOut = useCallback(() => { clearToken(); clearUser(); setUserState(null); setCart([]) }, [])
  const setUser = useCallback((u: User) => { saveUser(u); setUserState(u) }, [])

  const addToCart = (i: CartItem) => setCart((p) => [...p.filter((x) => x.id !== i.id), i])
  const removeFromCart = (id: string) => setCart((p) => p.filter((x) => x.id !== id))
  const inCart = (id: string) => cart.some((x) => x.id === id)
  const clearCart = () => { setCart([]); setCoupon('') }

  const subtotal = useMemo(() => Math.max(0, cart.reduce((s, x) => s + x.price, 0)), [cart])

  return (
    <Ctx.Provider value={{
      user, signIn, signOut, setUser,
      cart, addToCart, removeFromCart, inCart, clearCart,
      bookingType, setBookingType, date, setDate, time, setTime,
      payment, setPayment, coupon, setCoupon, addressLine, setAddressLine, note, setNote,
      pincode, setPincode, serviceable, zoneHours,
      subtotal,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useStore() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore must be inside StoreProvider')
  return c
}
