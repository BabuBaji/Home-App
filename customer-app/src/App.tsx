import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { ToastHost } from './components/UI'
import Splash from './components/Splash'
import { useStore } from './store'
import { fetchMe, getToken, loadUser, captureLocationOnOpen } from './api'

import Login from './screens/Login'
import NameSelect from './screens/NameSelect'
import CountrySelect from './screens/CountrySelect'
import LocationSelect from './screens/LocationSelect'
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
import Wallet from './screens/Wallet'
import Profile from './screens/Profile'
import Support from './screens/Support'
import Addresses from './screens/Addresses'

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
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/support" element={<Support />} />
              <Route path="/addresses" element={<Addresses />} />
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
