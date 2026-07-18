import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { ToastHost, ConfirmHost } from './components/UI'
import SosAlert from './components/SosAlert'
import Layout from './components/Layout'
import { useStore, has } from './store'
import { fetchMe, getToken } from './api'
import { ShieldAlert } from 'lucide-react'

import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import Customers from './screens/Customers'
import AdminCustomerDetail from './screens/AdminCustomerDetail'
import Workers from './screens/Workers'
import WorkerDetail from './screens/WorkerDetail'
import WorkerWallet from './screens/WorkerWallet'
import Bookings from './screens/Bookings'
import AdminBookingDetail from './screens/AdminBookingDetail'
import Services from './screens/Services'
import Campaigns from './screens/Campaigns'
import MembershipPlans from './screens/MembershipPlans'
import ServiceAreas from './screens/ServiceAreas'
import ZoneOnboarding from './screens/ZoneOnboarding'
import Stores from './screens/Stores'
import { CitiesPage, ClustersPage, ApartmentsPage, InventoryPage, PricingPage, ServiceCoveragePage } from './screens/ZoneEntities'
import SurgePricing from './screens/SurgePricing'
import HomeBanners from './screens/HomeBanners'
import LiveOps from './screens/LiveOps'
import Roster from './screens/Roster'
import Shifts from './screens/Shifts'
import Training from './screens/Training'
import Equipment from './screens/Equipment'
import SalaryPlans from './screens/SalaryPlans'
import IncentivePlans from './screens/IncentivePlans'
import Payroll from './screens/Payroll'
import CompensationRules from './screens/CompensationRules'
import AddWorker from './screens/AddWorker'
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
import Approvals from './screens/Approvals'
import OrgHierarchy from './screens/OrgHierarchy'
import CommandCenter from './screens/CommandCenter'
import ControlTower from './screens/ControlTower'

export default function App() {
  const { admin, signIn, setAdmin } = useStore()

  useEffect(() => {
    if (getToken()) fetchMe().then(({ admin }) => { signIn(getToken(), admin); setAdmin(admin) }).catch(() => {})
  }, [])

  // Where a signed-in admin lands — their role's configured landing page, else the dashboard.
  const home = admin?.landing || '/dashboard'

  return (
    <ToastHost>
     <ConfirmHost>
      {admin && <SosAlert />}
      <Routes>
        <Route path="/login" element={admin ? <Navigate to={home} replace /> : <Login />} />
        <Route element={<Guard authed={!!admin} />}>
          <Route path="/dashboard" element={<Page perm="dashboard.view"><Dashboard /></Page>} />
          <Route path="/customers" element={<Page perm="customers.view"><Customers /></Page>} />
          <Route path="/customers/:id" element={<Page perm="customers.view"><AdminCustomerDetail /></Page>} />
          <Route path="/workers" element={<Page perm="workers.view"><Workers /></Page>} />
          <Route path="/workers/new" element={<Page perm="workers.create"><AddWorker /></Page>} />
          <Route path="/workers/:id/edit" element={<Page perm="workers.edit"><AddWorker /></Page>} />
          <Route path="/workers/:id" element={<Page perm="workers.view"><WorkerDetail /></Page>} />
          <Route path="/worker-wallet" element={<Page perm="wallet.view"><WorkerWallet /></Page>} />
          <Route path="/bookings" element={<Page perm="bookings.view"><Bookings /></Page>} />
          <Route path="/bookings/:id" element={<Page perm="bookings.view"><AdminBookingDetail /></Page>} />
          <Route path="/cancellations" element={<Page perm="cancellations.view"><Bookings /></Page>} />
          <Route path="/services" element={<Page perm="services.view"><Services /></Page>} />
          <Route path="/campaigns" element={<Page perm="campaigns.view"><Campaigns /></Page>} />
          <Route path="/membership" element={<Page perm="pricing.view"><MembershipPlans /></Page>} />
          <Route path="/home-banners" element={<Page perm="campaigns.view"><HomeBanners /></Page>} />
          <Route path="/service-areas" element={<Page perm="zones.view"><ServiceAreas /></Page>} />
          <Route path="/zones" element={<Page perm="zones.view"><ZoneOnboarding /></Page>} />
          <Route path="/zones/cities" element={<Page perm="zones.view"><CitiesPage /></Page>} />
          <Route path="/zones/clusters" element={<Page perm="zones.view"><ClustersPage /></Page>} />
          <Route path="/zones/apartments" element={<Page perm="zones.view"><ApartmentsPage /></Page>} />
          <Route path="/zones/stores" element={<Page perm="zones.view"><Stores /></Page>} />
          <Route path="/zones/pricing" element={<Page perm="pricing.view"><PricingPage /></Page>} />
          <Route path="/zones/surge" element={<Page perm="pricing.view"><SurgePricing /></Page>} />
          <Route path="/zones/coverage" element={<Page perm="zones.view"><ServiceCoveragePage /></Page>} />
          <Route path="/zones/inventory" element={<Page perm="zones.view"><InventoryPage /></Page>} />
          <Route path="/command-center" element={<Page perm="liveops.view"><CommandCenter /></Page>} />
          <Route path="/control-tower" element={<Page perm="liveops.view"><ControlTower /></Page>} />
          <Route path="/live-ops" element={<Page perm="liveops.view"><LiveOps /></Page>} />
          <Route path="/roster" element={<Page perm="roster.view"><Roster /></Page>} />
          <Route path="/shift-plans" element={<Page perm="attendance.view"><Shifts /></Page>} />
          <Route path="/training" element={<Page perm="training.view"><Training /></Page>} />
          <Route path="/equipment" element={<Page perm="equipment.view"><Equipment /></Page>} />
          <Route path="/salary-plans" element={<Page perm="salary_plans.view"><SalaryPlans /></Page>} />
          <Route path="/incentive-plans" element={<Page perm="incentive_plans.view"><IncentivePlans /></Page>} />
          <Route path="/payroll" element={<Page perm="payroll.view"><Payroll /></Page>} />
          <Route path="/compensation-rules" element={<Page perm="comp_rules.view"><CompensationRules /></Page>} />
          <Route path="/payments" element={<Page perm="payments.view"><Payments /></Page>} />
          <Route path="/refunds" element={<Page perm="refunds.view"><Refunds /></Page>} />
          <Route path="/complaints" element={<Page perm="complaints.view"><Complaints /></Page>} />
          <Route path="/notifications" element={<Page perm="notifications.view"><Notifications /></Page>} />
          <Route path="/tickets" element={<Page perm="tickets.view"><Tickets /></Page>} />
          <Route path="/reports" element={<Page perm="reports.view"><Reports /></Page>} />
          <Route path="/analytics" element={<Page perm="analytics.view"><Analytics /></Page>} />
          <Route path="/activity" element={<Page perm="activity.view"><Activity /></Page>} />
          <Route path="/settings" element={<Page perm="settings.view"><SettingsScreen /></Page>} />
          <Route path="/admins" element={<Page perm="admins.view"><Admins /></Page>} />
          <Route path="/roles" element={<Page perm="roles.view"><Roles /></Page>} />
          <Route path="/approvals" element={<Page perm="approvals.review"><Approvals /></Page>} />
          <Route path="/organization" element={<Page perm="admins.view"><OrgHierarchy /></Page>} />
        </Route>
        <Route path="*" element={<Navigate to={admin ? home : '/login'} replace />} />
      </Routes>
     </ConfirmHost>
    </ToastHost>
  )
}

function Page({ children, perm }: { children: React.ReactNode; perm?: string }) {
  const { admin } = useStore()
  // Route-level gate: the nav hides links you can't use, but this stops a hand-typed URL too.
  if (perm && !has(admin, perm)) return <Layout><NoAccess /></Layout>
  return <Layout>{children}</Layout>
}

function NoAccess() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center', gap: 10 }}>
      <ShieldAlert size={44} style={{ color: 'var(--muted, #98a2b3)' }} />
      <h2 style={{ fontSize: 18, margin: 0 }}>You don't have access to this page</h2>
      <p className="muted" style={{ fontSize: 13.5, maxWidth: 420 }}>
        Your role doesn't include permission for this section. If you need it, ask an administrator to update your role.
      </p>
    </div>
  )
}

function Guard({ authed }: { authed: boolean }) {
  const loc = useLocation()
  if (!authed) return <Navigate to="/login" replace state={{ from: loc }} />
  return <Outlet />
}
