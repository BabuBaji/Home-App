import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { ToastHost } from './components/UI'
import Layout from './components/Layout'
import { useStore } from './store'
import { fetchMe, getToken } from './api'

import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import Customers from './screens/Customers'
import Workers from './screens/Workers'
import WorkerWallet from './screens/WorkerWallet'
import Bookings from './screens/Bookings'
import Services from './screens/Services'
import Pricing from './screens/Pricing'
import Payments from './screens/Payments'
import Refunds from './screens/Refunds'
import Complaints from './screens/Complaints'
import Notifications from './screens/Notifications'
import Tickets from './screens/Tickets'
import Reports from './screens/Reports'
import Analytics from './screens/Analytics'
import Activity from './screens/Activity'
import SettingsScreen from './screens/Settings'
import Admins from './screens/Admins'
import Roles from './screens/Roles'

export default function App() {
  const { admin, signIn, setAdmin } = useStore()

  useEffect(() => {
    if (getToken()) fetchMe().then(({ admin }) => { signIn(getToken(), admin); setAdmin(admin) }).catch(() => {})
  }, [])

  return (
    <ToastHost>
      <Routes>
        <Route path="/login" element={admin ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route element={<Guard authed={!!admin} />}>
          <Route path="/dashboard" element={<Page><Dashboard /></Page>} />
          <Route path="/customers" element={<Page><Customers /></Page>} />
          <Route path="/workers" element={<Page><Workers /></Page>} />
          <Route path="/worker-wallet" element={<Page><WorkerWallet /></Page>} />
          <Route path="/bookings" element={<Page><Bookings /></Page>} />
          <Route path="/cancellations" element={<Page><Bookings /></Page>} />
          <Route path="/services" element={<Page><Services /></Page>} />
          <Route path="/pricing" element={<Page><Pricing /></Page>} />
          <Route path="/payments" element={<Page><Payments /></Page>} />
          <Route path="/refunds" element={<Page><Refunds /></Page>} />
          <Route path="/complaints" element={<Page><Complaints /></Page>} />
          <Route path="/notifications" element={<Page><Notifications /></Page>} />
          <Route path="/tickets" element={<Page><Tickets /></Page>} />
          <Route path="/reports" element={<Page><Reports /></Page>} />
          <Route path="/analytics" element={<Page><Analytics /></Page>} />
          <Route path="/activity" element={<Page><Activity /></Page>} />
          <Route path="/settings" element={<Page><SettingsScreen /></Page>} />
          <Route path="/admins" element={<Page><Admins /></Page>} />
          <Route path="/roles" element={<Page><Roles /></Page>} />
        </Route>
        <Route path="*" element={<Navigate to={admin ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </ToastHost>
  )
}

function Page({ children }: { children: React.ReactNode }) { return <Layout>{children}</Layout> }

function Guard({ authed }: { authed: boolean }) {
  const loc = useLocation()
  if (!authed) return <Navigate to="/login" replace state={{ from: loc }} />
  return <Outlet />
}
