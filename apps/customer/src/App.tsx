import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, useParams, Outlet } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { ToastHost } from './components/UI'
import Splash from './components/Splash'
import { useStore } from './store'
import { fetchMe, getToken, loadUser, captureLocationOnOpen, fetchBookings } from './api'
import { ensureNotifPermission, fireLocalNotification } from './notify'
import { runTopBackHandler } from './backStack'

import Login from './screens/Login'
import NameSelect from './screens/NameSelect'
import SelectCity from './screens/SelectCity'
import Permissions from './screens/Permissions'
import CountrySelect from './screens/CountrySelect'
import LocationSelect from './screens/LocationSelect'
import AddressDetails from './screens/AddressDetails'
import SearchLocation from './screens/SearchLocation'
import ComingSoon from './screens/ComingSoon'
import Home from './screens/Home'
import PopularServices from './screens/PopularServices'
import ContinueBooking from './screens/ContinueBooking'
import ServiceDetails from './screens/ServiceDetails'
import ServiceFlow from './screens/ServiceFlow'
import BookingFlow from './screens/BookingFlow'
import Book from './screens/Book'
import Confirmed from './screens/Confirmed'
import Notifications from './screens/Notifications'
import Cart from './screens/Cart'
import AddressSelect from './screens/AddressSelect'
import Schedule from './screens/Schedule'
import Summary from './screens/Summary'
import Payment from './screens/Payment'
import BookingTracking from './screens/BookingTracking'
import Reschedule from './screens/Reschedule'
import Cancel from './screens/Cancel'
import Bookings from './screens/Bookings'
import History from './screens/History'
import BookingDetail from './screens/BookingDetail'
import OrdersList from './screens/OrdersList'
import ActiveBooking from './screens/ActiveBooking'
import Invoice from './screens/Invoice'
import Receipt from './screens/Receipt'
import Wallet from './screens/Wallet'
import WalletTransactions from './screens/wallet/WalletTransactions'
import AddMoney from './screens/wallet/AddMoney'
import Cashback from './screens/wallet/Cashback'
import ReferralEarnings from './screens/wallet/ReferralEarnings'
import GiftCards from './screens/wallet/GiftCards'
import RefundHistory from './screens/wallet/RefundHistory'
import WalletSettings from './screens/wallet/WalletSettings'
import Profile from './screens/Profile'
import MyProfile from './screens/profile/MyProfile'
import FamilyMembers from './screens/profile/FamilyMembers'
import PaymentMethods from './screens/profile/PaymentMethods'
import NotificationSettings from './screens/profile/NotificationSettings'
import Language from './screens/profile/Language'
import Privacy from './screens/profile/Privacy'
import About from './screens/profile/About'
import Help from './screens/profile/Help'
import Logout from './screens/profile/Logout'
import HelpCenter from './screens/support/HelpCenter'
import RaiseTicket from './screens/support/RaiseTicket'
import LiveChat from './screens/support/LiveChat'
import EmergencySupport from './screens/support/EmergencySupport'
import RefundStatus from './screens/support/RefundStatus'
import Cancellation from './screens/support/Cancellation'
import Escalation from './screens/support/Escalation'
import FAQs from './screens/support/FAQs'
import HomeHealthScore from './screens/ai/HomeHealthScore'
import AIRecommendations from './screens/ai/AIRecommendations'
import RecurringPlanner from './screens/ai/RecurringPlanner'
import MaintenanceCalendar from './screens/ai/MaintenanceCalendar'
import FestivalCleaning from './screens/ai/FestivalCleaning'
import AIBudgetPlanner from './screens/ai/AIBudgetPlanner'
import HomeTimeline from './screens/ai/HomeTimeline'
import { WaterCanReminder, GarbageReminder, PestControlReminder } from './screens/ai/reminders'
import AllQuickActions from './screens/AllQuickActions'
import MembershipPlans from './screens/membership/MembershipPlans'
import ComparePlans from './screens/membership/ComparePlans'
import Subscribe from './screens/membership/Subscribe'
import ActivePlan from './screens/membership/ActivePlan'
import MembershipUsage from './screens/membership/MembershipUsage'
import Renewal from './screens/membership/Renewal'
import CancelMembership from './screens/membership/CancelMembership'
import Benefits from './screens/membership/Benefits'
import Support from './screens/Support'
import Addresses from './screens/Addresses'
import AddAddress from './screens/address/AddAddress'
import SavedAddresses from './screens/SavedAddresses'
import DefaultAddress from './screens/DefaultAddress'
import CancelPolicy from './screens/CancelPolicy'
import PersonalInfo from './screens/PersonalInfo'
import Terms from './screens/Terms'
// Module 6 — Live Job Tracking
import JobTracking from './screens/job/JobTracking'
import WorkerProfile from './screens/job/WorkerProfile'
import OnTheWay from './screens/job/OnTheWay'
import LiveTrack from './screens/job/LiveTrack'
import Chat from './screens/job/Chat'
import CallWorker from './screens/job/CallWorker'
import ShareOtp from './screens/job/ShareOtp'
import ServiceStarted from './screens/job/ServiceStarted'
import LiveProgress from './screens/job/LiveProgress'
import ServiceCompleted from './screens/job/ServiceCompleted'
// Module 7 — Rating
import RateWorker from './screens/rate/RateWorker'
import UploadPhotos from './screens/rate/UploadPhotos'
import Complaint from './screens/rate/Complaint'
import TipWorker from './screens/rate/TipWorker'
import Rebook from './screens/rate/Rebook'
import Coupons from './screens/offers/Coupons'
import AutoOffers from './screens/offers/AutoOffers'
import Referral from './screens/offers/Referral'
import ZoneOffers from './screens/offers/ZoneOffers'
import ScratchCards from './screens/offers/ScratchCards'
import Loyalty from './screens/offers/Loyalty'

export default function App() {
  const { user, signIn, setUser } = useStore()
  const [minTime, setMinTime] = useState(false)
  // Returning users hydrate instantly from cache → no wait. Only a logged-in
  // user with no cached profile yet needs to wait for the first /me call.
  const [booted, setBooted] = useState(() => !(getToken() && !loadUser()))

  useEffect(() => {
    const t = setTimeout(() => setMinTime(true), 2000)       // poster splash shows ~2s
    const cap = setTimeout(() => setBooted(true), 2600)      // never hang on a slow network
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
              <Route path="/onboarding/city" element={<SelectCity />} />
              <Route path="/onboarding/permission" element={<Permissions />} />
              <Route path="/onboarding/country" element={<CountrySelect />} />
              <Route path="/onboarding/location" element={<LocationSelect />} />
              <Route path="/address-details" element={<AddressDetails />} />
              <Route path="/locations" element={<SearchLocation />} />
              <Route path="/coming-soon" element={<ComingSoon standalone />} />
            </Route>
            <Route element={<AppGuard user={user} />}>
              <Route path="/home" element={<Home />} />
              <Route path="/popular-services" element={<PopularServices />} />
              <Route path="/continue-booking" element={<ContinueBooking />} />
              <Route path="/service/:id" element={<ServiceDetails />} />
              <Route path="/configure/:id" element={<ServiceFlow />} />
              <Route path="/booking/:id" element={<BookingFlow />} />
              <Route path="/book/:id" element={<Book />} />
              <Route path="/confirmed/:id" element={<Confirmed />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/address" element={<AddressSelect />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/summary" element={<Summary />} />
              <Route path="/payment" element={<Payment />} />
              <Route path="/tracking/:id" element={<BookingTracking />} />
              {/* Old "Track Your Expert" screen is superseded by the redesigned /job/:id flow — send
                  every track entry point (Continue Booking, notifications, post-cancel/reschedule) there. */}
              <Route path="/track/:id" element={<TrackRedirect />} />
              <Route path="/reschedule/:id" element={<Reschedule />} />
              <Route path="/cancel/:id" element={<Cancel />} />
              {/* Module 6 — Live Job Tracking */}
              <Route path="/job/:id" element={<JobTracking />} />
              <Route path="/job/:id/worker" element={<WorkerProfile />} />
              <Route path="/job/:id/otw" element={<OnTheWay />} />
              <Route path="/job/:id/map" element={<LiveTrack />} />
              <Route path="/job/:id/chat" element={<Chat />} />
              <Route path="/job/:id/call" element={<CallWorker />} />
              <Route path="/job/:id/otp" element={<ShareOtp />} />
              <Route path="/job/:id/started" element={<ServiceStarted />} />
              <Route path="/job/:id/progress" element={<LiveProgress />} />
              <Route path="/job/:id/completed" element={<ServiceCompleted />} />
              {/* Module 7 — Rating */}
              <Route path="/rate/:id" element={<RateWorker />} />
              <Route path="/rate/:id/photos" element={<UploadPhotos />} />
              <Route path="/complaint/:id" element={<Complaint />} />
              <Route path="/tip/:id" element={<TipWorker />} />
              <Route path="/rebook/:id" element={<Rebook />} />
              {/* Module 11 — Offers (82-87) */}
              <Route path="/offers" element={<Coupons />} />
              <Route path="/offers/applied" element={<AutoOffers />} />
              <Route path="/offers/zone" element={<ZoneOffers />} />
              <Route path="/offers/scratch" element={<ScratchCards />} />
              <Route path="/offers/loyalty" element={<Loyalty />} />
              <Route path="/refer" element={<Referral />} />
              {/* Module 8 — Orders (58-65) */}
              <Route path="/bookings" element={<Bookings />} />
              <Route path="/bookings/active" element={<ActiveBooking />} />
              <Route path="/bookings/:status" element={<OrdersList />} />
              <Route path="/booking-details/:id" element={<BookingDetail />} />
              <Route path="/invoice/:id" element={<Invoice />} />
              <Route path="/receipt/:id" element={<Receipt />} />
              <Route path="/history" element={<History />} />
              <Route path="/booking/:id" element={<BookingDetail />} />
              {/* Module 9 — Wallet (66-73) */}
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/wallet/transactions" element={<WalletTransactions />} />
              <Route path="/wallet/add" element={<AddMoney />} />
              <Route path="/wallet/cashback" element={<Cashback />} />
              <Route path="/wallet/referrals" element={<ReferralEarnings />} />
              <Route path="/wallet/gift-cards" element={<GiftCards />} />
              <Route path="/wallet/refunds" element={<RefundHistory />} />
              <Route path="/wallet/settings" element={<WalletSettings />} />
              {/* Module 12 — Profile (88-96) */}
              <Route path="/profile" element={<MyProfile />} />
              <Route path="/profile/family" element={<FamilyMembers />} />
              <Route path="/profile/payment-methods" element={<PaymentMethods />} />
              <Route path="/profile/notifications" element={<NotificationSettings />} />
              <Route path="/profile/language" element={<Language />} />
              <Route path="/profile/privacy" element={<Privacy />} />
              <Route path="/profile/about" element={<About />} />
              <Route path="/profile/help" element={<Help />} />
              <Route path="/profile/logout" element={<Logout />} />
              <Route path="/profile/legacy" element={<Profile />} />
              <Route path="/quick-actions" element={<AllQuickActions />} />

              {/* Module 10 — Subscription (74-81) */}
              <Route path="/membership" element={<MembershipPlans />} />
              <Route path="/membership/compare" element={<ComparePlans />} />
              <Route path="/membership/subscribe" element={<Subscribe />} />
              <Route path="/membership/active" element={<ActivePlan />} />
              <Route path="/membership/manage" element={<ActivePlan />} />
              <Route path="/membership/usage" element={<MembershipUsage />} />
              <Route path="/membership/renewal" element={<Renewal />} />
              <Route path="/membership/cancel" element={<CancelMembership />} />
              <Route path="/membership/benefits" element={<Benefits />} />

              {/* Module 13 — AI Home (97-106) */}
              <Route path="/ai-home" element={<HomeHealthScore />} />
              <Route path="/ai/recommendations" element={<AIRecommendations />} />
              <Route path="/ai/planner" element={<RecurringPlanner />} />
              <Route path="/ai/calendar" element={<MaintenanceCalendar />} />
              <Route path="/ai/water" element={<WaterCanReminder />} />
              <Route path="/ai/garbage" element={<GarbageReminder />} />
              <Route path="/ai/pest" element={<PestControlReminder />} />
              <Route path="/ai/festival" element={<FestivalCleaning />} />
              <Route path="/ai/budget" element={<AIBudgetPlanner />} />
              <Route path="/ai/timeline" element={<HomeTimeline />} />

              {/* Module 14 — Support (107-114) */}
              <Route path="/support" element={<HelpCenter />} />
              <Route path="/support/ticket" element={<RaiseTicket />} />
              <Route path="/support/chat" element={<LiveChat />} />
              <Route path="/support/emergency" element={<EmergencySupport />} />
              <Route path="/support/refund-status" element={<RefundStatus />} />
              <Route path="/support/refund-status/:id" element={<RefundStatus />} />
              <Route path="/support/cancellation" element={<Cancellation />} />
              <Route path="/support/escalation" element={<Escalation />} />
              <Route path="/support/faqs" element={<FAQs />} />
              <Route path="/support/legacy" element={<Support />} />
              <Route path="/addresses" element={<Addresses />} />
              <Route path="/addresses/add" element={<AddAddress />} />
              <Route path="/addresses/saved" element={<SavedAddresses />} />
              <Route path="/addresses/default" element={<DefaultAddress />} />
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

// The old "Track Your Expert" screen (Track.tsx) is replaced by the redesigned /job/:id flow.
// Redirect the legacy /track/:id route so every entry point shows the new Booking Details UI.
function TrackRedirect() {
  const { id } = useParams()
  return <Navigate to={`/job/${id}`} replace />
}

// Gate for the main app: an authenticated user must have picked a city (location)
// before reaching home. Matches the Module-1 flow (Select City → Permission). Name
// is optional here (no name screen in the flow) and stays editable in Profile.
function AppGuard({ user }: { user: ReturnType<typeof useStore>['user'] }) {
  const loc = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />
  if (!user.location) return <Navigate to="/onboarding/city" replace />
  return <Outlet />
}
