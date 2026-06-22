import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { ToastHost, Loading } from './components/UI'
import { useStore } from './store'
import { fetchMe, getToken } from './api'

import Login from './screens/Login'
import CountrySelect from './screens/CountrySelect'
import LocationSelect from './screens/LocationSelect'
import Home from './screens/Home'
import ServiceDetails from './screens/ServiceDetails'
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
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    if (!getToken()) { setBooting(false); return }
    fetchMe().then(({ user }) => { signIn(getToken(), user); setUser(user) }).catch(() => {}).finally(() => setBooting(false))
  }, [])

  return (
    <ToastHost>
      <div className="device">
        {booting ? <Loading /> : (
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/home" replace /> : <Login />} />
            <Route element={<Guard authed={!!user} />}>
              <Route path="/onboarding/country" element={<CountrySelect />} />
              <Route path="/onboarding/location" element={<LocationSelect />} />
            </Route>
            <Route element={<Guard authed={!!user} needsOnboard={!!user && !user.country} />}>
              <Route path="/home" element={<Home />} />
              <Route path="/service/:id" element={<ServiceDetails />} />
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

function Guard({ authed, needsOnboard }: { authed: boolean; needsOnboard?: boolean }) {
  const loc = useLocation()
  if (!authed) return <Navigate to="/login" replace state={{ from: loc }} />
  if (needsOnboard) return <Navigate to="/onboarding/country" replace />
  return <Outlet />
}
