import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { ToastHost } from './components/UI'
import Splash from './components/Splash'
import { useStore } from './store'
import { fetchMe, getToken, loadUser, captureLocationOnOpen, fetchBookings } from './api'
import { ensureNotifPermission, fireLocalNotification } from './notify'
import { runTopBackHandler } from './backStack'

import Login from './screens/Login'
import NameSelect from './screens/NameSelect'
import CountrySelect from './screens/CountrySelect'
import LocationSelect from './screens/LocationSelect'
import AddressDetails from './screens/AddressDetails'
import SearchLocation from './screens/SearchLocation'
import ComingSoon from './screens/ComingSoon'
import Home from './screens/Home'
import ServiceDetails from './screens/ServiceDetails'
import Book from './screens/Book'
import Confirmed from './screens/Confirmed'
import Notifications from './screens/Notifications'
import Cart from './screens/Cart'
import AddressSelect from './screens/AddressSelect'
import Schedule from './screens/Schedule'
import Summary from './screens/Summary'
import Payment from './screens/Payment'
import Track from './screens/Track'
import Reschedule from './screens/Reschedule'
import Cancel from './screens/Cancel'
import Rate from './screens/Rate'
import Bookings from './screens/Bookings'
import History from './screens/History'
import BookingDetail from './screens/BookingDetail'
import Wallet from './screens/Wallet'
import Profile from './screens/Profile'
import Support from './screens/Support'
import Addresses from './screens/Addresses'
import CancelPolicy from './screens/CancelPolicy'
import PersonalInfo from './screens/PersonalInfo'
import Terms from './screens/Terms'

export default function App() {
  const { user, signIn, setUser } = useStore()
  const [minTime, setMinTime] = useState(false)
  // Returning users hydrate instantly from cache → no wait. Only a logged-in
  // user with no cached profile yet needs to wait for the first /me call.
  const [booted, setBooted] = useState(() => !(getToken() && !loadUser()))

  useEffect(() => {
    const t = setTimeout(() => setMinTime(true), 1700)       // let the welcome animation play fully
    const cap = setTimeout(() => setBooted(true), 2500)      // never hang on a slow network
    if (getToken()) fetchMe().then(({ user }) => { signIn(getToken(), user); setUser(user) }).catch(() => {}).finally(() => setBooted(true))
    return () => { clearTimeout(t); clearTimeout(cap) }
  }, [])

  // Capture the customer's GPS as soon as the app opens with a signed-in user (and right
  // after they log in). Cached + sent to their profile so bookings/worker/admin use it.
  useEffect(() => { if (user) captureLocationOnOpen() }, [user?.id])

  // App-wide push alert: notify the customer when a booking is auto-cancelled (no expert accepted),
  // even if they've left the Track screen. Polls every 30s; the first pass seeds silently so old
  // cancellations don't re-alert. (Fully-killed-app push would need FCM/Firebase.)
  useEffect(() => {
    if (!user) return
    ensureNotifPermission()
    const KEY = 'hh_autocancel_seen'
    const raw = localStorage.getItem(KEY)
    const seen = new Set<number>(raw ? JSON.parse(raw) : [])
    let first = raw === null
    let stopped = false
    const tick = async () => {
      try {
        const bs = await fetchBookings()
        let changed = false
        for (const b of bs) {
          if (b.status === 'cancelled' && b.cancelled_by === 'system' && !seen.has(b.id)) {
            seen.add(b.id); changed = true
            if (!first) fireLocalNotification('No expert available', `Booking ${b.ref} was cancelled — ₹${b.refund ?? b.total ?? 0} refunded to your wallet.`)
          }
        }
        if (changed || first) localStorage.setItem(KEY, JSON.stringify([...seen]))
        first = false
      } catch { /* offline — retry next tick */ }
    }
    tick()
    const iv = setInterval(() => { if (!stopped) tick() }, 30000)
    return () => { stopped = true; clearInterval(iv) }
  }, [user?.id])

  const showSplash = !minTime || !booted

  return (
    <ToastHost>
      <div className="device">
        <BackButtonHandler />
        <Splash visible={showSplash} />
        {(
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/home" replace /> : <Login />} />
            <Route element={<Guard authed={!!user} />}>
              <Route path="/onboarding/name" element={<NameSelect />} />
              <Route path="/onboarding/country" element={<CountrySelect />} />
              <Route path="/onboarding/location" element={<LocationSelect />} />
              <Route path="/address-details" element={<AddressDetails />} />
              <Route path="/locations" element={<SearchLocation />} />
              <Route path="/coming-soon" element={<ComingSoon standalone />} />
            </Route>
            <Route element={<AppGuard user={user} />}>
              <Route path="/home" element={<Home />} />
              <Route path="/service/:id" element={<ServiceDetails />} />
              <Route path="/book/:id" element={<Book />} />
              <Route path="/confirmed/:id" element={<Confirmed />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/address" element={<AddressSelect />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/summary" element={<Summary />} />
              <Route path="/payment" element={<Payment />} />
              <Route path="/track/:id" element={<Track />} />
              <Route path="/reschedule/:id" element={<Reschedule />} />
              <Route path="/cancel/:id" element={<Cancel />} />
              <Route path="/rate/:id" element={<Rate />} />
              <Route path="/bookings" element={<Bookings />} />
              <Route path="/history" element={<History />} />
              <Route path="/booking/:id" element={<BookingDetail />} />
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/support" element={<Support />} />
              <Route path="/addresses" element={<Addresses />} />
              <Route path="/cancellation-policy" element={<CancelPolicy />} />
              <Route path="/personal" element={<PersonalInfo />} />
              <Route path="/terms" element={<Terms />} />
            </Route>
            <Route path="*" element={<Navigate to={user ? '/home' : '/login'} replace />} />
          </Routes>
        )}
      </div>
    </ToastHost>
  )
}

// Wire the Android hardware/gesture back button to React Router. Without this the
// WebView's own back fails on SPA pushState navigation and Android exits the app.
// On the root tabs (home/login) back exits; otherwise it navigates one step back,
// falling back to /home when there is no in-app history to pop.
function BackButtonHandler() {
  const nav = useNavigate()
  const loc = useLocation()
  const locRef = useRef(loc)
  locRef.current = loc
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let remove: (() => void) | undefined
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('backButton', () => {
        if (runTopBackHandler()) return // close an open overlay (chat, invoice…) instead of navigating
        const { pathname, key } = locRef.current
        if (pathname === '/home' || pathname === '/login') CapApp.exitApp()
        else if (key === 'default') nav('/home')
        else nav(-1)
      }).then((h) => { remove = () => h.remove() })
    })
    return () => { remove?.() }
  }, [])
  return null
}

function Guard({ authed }: { authed: boolean }) {
  const loc = useLocation()
  if (!authed) return <Navigate to="/login" replace state={{ from: loc }} />
  return <Outlet />
}

// Gate for the main app: an authenticated user must have a name and a location
// before reaching the home screen. Sends them to whichever step is missing.
function AppGuard({ user }: { user: ReturnType<typeof useStore>['user'] }) {
  const loc = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />
  if (!user.name?.trim()) return <Navigate to="/onboarding/name" replace />
  if (!user.location) return <Navigate to="/onboarding/location" replace />
  return <Outlet />
}
