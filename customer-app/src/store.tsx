import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { CartItem, User } from './types'
import { clearToken, setToken, saveUser, loadUser, clearUser } from './api'

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
