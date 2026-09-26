import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, HardHat, CalendarDays, Sparkles, Tag, CreditCard, RotateCcw,
  AlertOctagon, Ban, Wallet, Bell, LifeBuoy, BarChart3, PieChart, Settings as Cog,
  UserCog, ShieldCheck, Menu, X, LogOut, ChevronRight, Calendar, ChevronDown, Home as HomeIcon, Activity as ActivityIcon, MapPin, Radio, CalendarClock, Timer, Boxes, GraduationCap,
  Building2, Layers, Package, Map as MapIcon, Store, Ticket, IndianRupee, UserPlus, Gift, Stamp, Network, Gauge, RadioTower, CloudRain, Crown, Images, Clock, Siren,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore, has } from '../store'
import { fetchAlerts } from '../api'
import { Avatar } from './UI'

type NavItem = { to: string; label: string; Icon: LucideIcon; perm?: string; end?: boolean }
// A top-level entry is either a single link or a collapsible group of links.
type NavGroup = { key: string; label: string; Icon: LucideIcon; items: NavItem[] }
type NavEntry = NavItem | NavGroup
const isGroup = (e: NavEntry): e is NavGroup => 'items' in e

const NAV: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, perm: 'dashboard.view' },
  { key: 'live', label: 'Live Operations', Icon: Gauge, items: [
    // The SOS queue + phone-first field app (opens full screen). Managers are first responders.
    { to: '/field/sos', label: 'SOS & Field App', Icon: Siren, perm: 'safety.view' },
    { to: '/command-center', label: 'Command Center', Icon: Gauge, perm: 'liveops.view' },
    { to: '/control-tower', label: 'Control Tower', Icon: RadioTower, perm: 'liveops.view' },
    { to: '/live-ops', label: 'Live Ops', Icon: Radio, perm: 'liveops.view' },
  ] },
  { key: 'customers', label: 'Customers & Support', Icon: Users, items: [
    { to: '/customers', label: 'Customers', Icon: Users, perm: 'customers.view' },
    { to: '/bookings', label: 'Bookings', Icon: CalendarDays, perm: 'bookings.view' },
    { to: '/complaints', label: 'Complaints', Icon: AlertOctagon, perm: 'complaints.view' },
    { to: '/cancellations', label: 'Cancellations', Icon: Ban, perm: 'cancellations.view' },
    { to: '/tickets', label: 'Support Tickets', Icon: LifeBuoy, perm: 'tickets.view' },
  ] },
  { key: 'workforce', label: 'Workforce', Icon: HardHat, items: [
    { to: '/workers', label: 'Workers (Pros)', Icon: HardHat, perm: 'workers.view' },
    { to: '/roster', label: 'Shifts / Roster', Icon: CalendarClock, perm: 'roster.view' },
    { to: '/shift-plans', label: 'Shift Plans & Attendance', Icon: Timer, perm: 'attendance.view' },
    { to: '/training', label: 'Training & Assessment', Icon: GraduationCap, perm: 'training.view' },
    { to: '/equipment', label: 'Equipment', Icon: Package, perm: 'equipment.view' },
  ] },
  { key: 'pay', label: 'Pay & Incentives', Icon: IndianRupee, items: [
    { to: '/salary-plans', label: 'Salary Plans', Icon: IndianRupee, perm: 'salary_plans.view' },
    { to: '/incentive-plans', label: 'Incentive Plans', Icon: Gift, perm: 'incentive_plans.view' },
    { to: '/compensation-rules', label: 'Compensation Rules', Icon: Sparkles, perm: 'comp_rules.view' },
    { to: '/payroll', label: 'Payroll', Icon: Wallet, perm: 'payroll.view' },
  ] },
  { key: 'finance', label: 'Finance', Icon: CreditCard, items: [
    { to: '/payments', label: 'Payments', Icon: CreditCard, perm: 'payments.view' },
    { to: '/refunds', label: 'Refunds', Icon: RotateCcw, perm: 'refunds.view' },
    { to: '/worker-wallet', label: 'Add Funds / Wallet', Icon: Wallet, perm: 'wallet.view' },
  ] },
  { key: 'catalog', label: 'Services & Pricing', Icon: Tag, items: [
    { to: '/services', label: 'Services', Icon: Sparkles, perm: 'services.view' },
    { to: '/extension-rules', label: 'Time & Extensions', Icon: Clock, perm: 'services.view' },
    { to: '/zones/pricing', label: 'Pricing', Icon: Tag, perm: 'pricing.view' },
    { to: '/zones/surge', label: 'Surge Pricing', Icon: CloudRain, perm: 'pricing.view' },
    { to: '/membership', label: 'Membership', Icon: Crown, perm: 'pricing.view' },
  ] },
  { key: 'marketing', label: 'Marketing', Icon: Ticket, items: [
    { to: '/campaigns', label: 'Campaigns & Offers', Icon: Ticket, perm: 'campaigns.view' },
    { to: '/home-banners', label: 'Home Banners', Icon: Images, perm: 'campaigns.view' },
    { to: '/packages', label: 'Service Packages', Icon: Images, perm: 'campaigns.view' },
    { to: '/notifications', label: 'Notifications', Icon: Bell, perm: 'notifications.view' },
  ] },
  { key: 'zones', label: 'Zones & Coverage', Icon: MapIcon, items: [
    { to: '/zones', label: 'Zone Dashboard', Icon: LayoutDashboard, perm: 'zones.view', end: true },
    { to: '/zones/cities', label: 'Cities', Icon: Building2, perm: 'zones.view' },
    { to: '/zones/clusters', label: 'Clusters', Icon: Layers, perm: 'zones.view' },
    { to: '/zones/apartments', label: 'Apartments', Icon: Boxes, perm: 'zones.view' },
    { to: '/zones/stores', label: 'Stores', Icon: Store, perm: 'zones.view' },
    { to: '/zones/coverage', label: 'Service Coverage', Icon: MapIcon, perm: 'zones.view' },
    { to: '/service-areas', label: 'Service Areas', Icon: MapPin, perm: 'zones.view' },
    { to: '/zones/inventory', label: 'Inventory', Icon: Package, perm: 'zones.view' },
  ] },
  { key: 'insights', label: 'Insights', Icon: BarChart3, items: [
    { to: '/reports', label: 'Reports', Icon: BarChart3, perm: 'reports.view' },
    { to: '/analytics', label: 'Analytics', Icon: PieChart, perm: 'analytics.view' },
    { to: '/activity', label: 'Activity Monitor', Icon: ActivityIcon, perm: 'activity.view' },
  ] },
  { key: 'admin', label: 'Administration', Icon: ShieldCheck, items: [
    { to: '/settings', label: 'Settings', Icon: Cog, perm: 'settings.view' },
    { to: '/admins', label: 'Admin Users', Icon: UserCog, perm: 'admins.view' },
    { to: '/organization', label: 'Organization', Icon: Network, perm: 'admins.view' },
    { to: '/roles', label: 'Roles & Permissions', Icon: ShieldCheck, perm: 'roles.view' },
    { to: '/approvals', label: 'Approvals', Icon: Stamp, perm: 'approvals.review' },
  ] },
]

const matches = (it: NavItem, path: string) => path === it.to || (!it.end && path.startsWith(it.to + '/'))

const TITLES: Record<string, string> = {
  dashboard: 'Dashboard', customers: 'Customers', workers: 'Workers (Pros)', 'worker-wallet': 'Add Funds / Wallet', bookings: 'Bookings',
  services: 'Services', campaigns: 'Campaigns & Offers', packages: 'Service Packages', payments: 'Payments', refunds: 'Refunds',
  zones: 'Zone Operations', 'command-center': 'Operations Command Center', 'control-tower': 'Control Tower', 'live-ops': 'Live Ops', 'service-areas': 'Service Areas', roster: 'Shifts / Roster', 'shift-plans': 'Shift Plans & Attendance', training: 'Training & Assessment', equipment: 'Equipment', 'salary-plans': 'Salary Plans', 'incentive-plans': 'Incentive Plans', payroll: 'Payroll', 'compensation-rules': 'Compensation Rules', complaints: 'Complaints', cancellations: 'Cancellations', notifications: 'Notifications', tickets: 'Support Tickets',
  reports: 'Reports', analytics: 'Analytics', activity: 'Activity Monitor', settings: 'Settings', admins: 'Admin Users', organization: 'Organization', roles: 'Roles & Permissions', approvals: 'Approvals',
}

// Every menu item's label by its path — so a page never shows "Dashboard" as its title just
// because it's missing from TITLES (Time & Extensions, Membership, Home Banners did).
const NAV_LABEL: Record<string, string> = Object.fromEntries(NAV.flatMap((e) => (isGroup(e) ? e.items : [e]).map((it) => [it.to, it.label])))

const ROLE_LABEL: Record<string, string> = { super: 'Super Admin', admin: 'Admin', manager: 'Manager', support: 'Support', dispatcher: 'Dispatcher', finance: 'Finance', safety: 'Safety Response', recruiter: 'Recruiter', trainer: 'Trainer', marketing: 'Marketing', auditor: 'Auditor' }

export default function Layout({ children }: { children: ReactNode }) {
  const { admin, signOut } = useStore()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('hha_nav_collapsed') === '1' } catch { return false } })
  const toggleCollapsed = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem('hha_nav_collapsed', n ? '1' : '0') } catch { /* ignore */ } return n })
  const [alerts, setAlerts] = useState(0)
  useEffect(() => { fetchAlerts().then((a) => setAlerts(a.count)).catch(() => {}) }, [pathname])
  const seg = pathname.split('/')[1] || 'dashboard'
  // Most specific first: a sub-page's own menu label (/zones/cities → "Cities"), then the section.
  const title = NAV_LABEL[pathname] || TITLES[seg] || NAV_LABEL['/' + seg] || 'Dashboard'
  const isDash = seg === 'dashboard'
  // Accordion: one group open at a time; navigating opens the group that holds the current page.
  const activeGroup = NAV.find((e): e is NavGroup => isGroup(e) && e.items.some((it) => matches(it, pathname)))?.key ?? null
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroup)
  useEffect(() => { if (activeGroup) setOpenGroup(activeGroup) }, [activeGroup])

  return (
    <div className={'shell' + (collapsed ? ' collapsed' : '')}>
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="brand">
          <span className="brand-logo"><HomeIcon size={20} /></span>
          <div><strong>HomeHelp</strong><small>Admin</small></div>
          <button className="iconbtn only-mobile" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <nav className="navlist">
          {NAV.map((e) => {
            if (!isGroup(e)) {
              if (e.perm && !has(admin, e.perm)) return null
              return <NavLink key={e.to} to={e.to} end={e.end} title={e.label} className={({ isActive }) => 'navitem' + (isActive ? ' active' : '')} onClick={() => setOpen(false)}>
                <e.Icon size={19} /> <span>{e.label}</span>
              </NavLink>
            }
            const items = e.items.filter((it) => !it.perm || has(admin, it.perm))
            if (!items.length) return null // whole group hidden when the user holds none of its perms
            const isOpen = openGroup === e.key
            const hasActive = items.some((it) => matches(it, pathname))
            return (
              <div key={e.key} className={'navgroup' + (isOpen ? ' open' : '')}>
                <button type="button" title={e.label} className={'navitem navgroup-btn' + (hasActive ? ' has-active' : '')}
                  onClick={() => { if (collapsed) { toggleCollapsed(); setOpenGroup(e.key) } else setOpenGroup(isOpen ? null : e.key) }}>
                  <e.Icon size={19} /> <span>{e.label}</span>
                  <ChevronDown className="nav-chev" size={15} />
                </button>
                {isOpen && <div className="navgroup-items">
                  {items.map((it) => (
                    <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => 'navitem navsub' + (isActive ? ' active' : '')} onClick={() => setOpen(false)}>
                      <span>{it.label}</span>
                    </NavLink>
                  ))}
                </div>}
              </div>
            )
          })}
        </nav>
        <button className="signout" onClick={() => { signOut(); nav('/login') }}><LogOut size={18} /> <span>Sign out</span></button>
      </aside>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="iconbtn only-mobile" onClick={() => setOpen(true)}><Menu size={22} /></button>
          <button className="iconbtn only-desktop nav-toggle" onClick={toggleCollapsed} title={collapsed ? 'Expand menu' : 'Collapse menu'}><Menu size={20} /></button>
          <div className="titlewrap">
            <h1 className="page-title">{title}</h1>
            {isDash
              ? <span className="page-sub">Welcome back, {admin?.name?.split(' ')[0] || 'Admin'} <span className="wave">👋</span></span>
              : <span className="crumb">Dashboard <ChevronRight size={13} /> {title}</span>}
          </div>
          <div className="spacer" />
          <span className="daterange only-desktop"><Calendar size={15} /> Last 7 days <ChevronDown size={14} /></span>
          <div className="citysel only-desktop">All Cities <ChevronDown size={15} /></div>
          <button className="iconbtn"><Bell size={20} />{alerts > 0 && <span className="bell-count">{alerts}</span>}</button>
          <div className="me">
            <Avatar name={admin?.name || 'Admin'} src={admin?.avatar} size={36} />
            <div className="only-desktop"><strong>{admin?.name || 'Admin User'}</strong><small>{ROLE_LABEL[admin?.role || ''] || admin?.role}</small></div>
            <ChevronDown className="only-desktop me-chev" size={16} />
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
