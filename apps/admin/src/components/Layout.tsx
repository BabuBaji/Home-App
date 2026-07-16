import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, HardHat, CalendarDays, Sparkles, Tag, CreditCard, RotateCcw,
  AlertOctagon, Ban, Wallet, Bell, LifeBuoy, BarChart3, PieChart, Settings as Cog,
  UserCog, ShieldCheck, Menu, X, LogOut, ChevronRight, Calendar, ChevronDown, Home as HomeIcon, Activity as ActivityIcon, MapPin, Radio, CalendarClock, Timer, Boxes, GraduationCap,
  Building2, Layers, Package, Map as MapIcon, Store, Ticket,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore, can } from '../store'
import { fetchAlerts } from '../api'
import { Avatar } from './UI'

type NavItem = { to: string; label: string; Icon: LucideIcon; chev?: boolean; min?: string; end?: boolean }
type NavGroup = { section: string; items: NavItem[] }

const NAV: NavGroup[] = [
  { section: 'Manage', items: [
    { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { to: '/customers', label: 'Customers', Icon: Users, chev: true },
    { to: '/workers', label: 'Workers (Pros)', Icon: HardHat, chev: true },
    { to: '/bookings', label: 'Bookings', Icon: CalendarDays, chev: true },
    { to: '/services', label: 'Services', Icon: Sparkles, chev: true },
    { to: '/campaigns', label: 'Campaigns & Offers', Icon: Ticket, chev: true, min: 'manager' },
    { to: '/payments', label: 'Payments', Icon: CreditCard, chev: true },
    { to: '/refunds', label: 'Refunds', Icon: RotateCcw, chev: true },
  ] },
  { section: 'Zone Operations', items: [
    { to: '/zones', label: 'Zone Dashboard', Icon: LayoutDashboard, min: 'admin', end: true },
    { to: '/zones/cities', label: 'Cities', Icon: Building2, min: 'admin' },
    { to: '/zones/clusters', label: 'Clusters', Icon: Layers, min: 'admin' },
    { to: '/zones/apartments', label: 'Apartments', Icon: Boxes, min: 'admin' },
    { to: '/zones/stores', label: 'Stores', Icon: Store, min: 'admin' },
    { to: '/zones/pricing', label: 'Pricing', Icon: Tag, min: 'admin' },
    { to: '/zones/coverage', label: 'Service Coverage', Icon: MapIcon, min: 'admin' },
    { to: '/zones/inventory', label: 'Inventory', Icon: Package, min: 'admin' },
  ] },
  { section: 'Operations', items: [
    { to: '/live-ops', label: 'Live Ops', Icon: Radio, min: 'admin' },
    { to: '/service-areas', label: 'Service Areas', Icon: MapPin, min: 'admin' },
    { to: '/roster', label: 'Shifts / Roster', Icon: CalendarClock, min: 'admin' },
    { to: '/shift-plans', label: 'Shift Plans & Attendance', Icon: Timer, min: 'admin' },
    { to: '/training', label: 'Training & Assessment', Icon: GraduationCap, min: 'admin' },
    { to: '/complaints', label: 'Complaints', Icon: AlertOctagon },
    { to: '/cancellations', label: 'Cancellations', Icon: Ban },
    { to: '/worker-wallet', label: 'Add Funds / Wallet', Icon: Wallet },
    { to: '/notifications', label: 'Notifications', Icon: Bell },
    { to: '/tickets', label: 'Support Tickets', Icon: LifeBuoy },
  ] },
  { section: 'Analytics', items: [
    { to: '/reports', label: 'Reports', Icon: BarChart3 },
    { to: '/analytics', label: 'Analytics', Icon: PieChart },
    { to: '/activity', label: 'Activity Monitor', Icon: ActivityIcon },
  ] },
  { section: 'Settings', items: [
    { to: '/settings', label: 'Settings', Icon: Cog },
    { to: '/admins', label: 'Admin Users', Icon: UserCog, min: 'admin' },
    { to: '/roles', label: 'Roles & Permissions', Icon: ShieldCheck, min: 'admin' },
  ] },
]

const TITLES: Record<string, string> = {
  dashboard: 'Dashboard', customers: 'Customers', workers: 'Workers (Pros)', 'worker-wallet': 'Add Funds / Wallet', bookings: 'Bookings',
  services: 'Services', campaigns: 'Campaigns & Offers', payments: 'Payments', refunds: 'Refunds',
  zones: 'Zone Operations', 'live-ops': 'Live Ops', 'service-areas': 'Service Areas', roster: 'Shifts / Roster', 'shift-plans': 'Shift Plans & Attendance', training: 'Training & Assessment', complaints: 'Complaints', cancellations: 'Cancellations', notifications: 'Notifications', tickets: 'Support Tickets',
  reports: 'Reports', analytics: 'Analytics', activity: 'Activity Monitor', settings: 'Settings', admins: 'Admin Users', roles: 'Roles & Permissions',
}

const ROLE_LABEL: Record<string, string> = { super: 'Super Admin', admin: 'Admin', manager: 'Manager', support: 'Support' }

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
  const title = TITLES[seg] || 'Dashboard'
  const isDash = seg === 'dashboard'

  return (
    <div className={'shell' + (collapsed ? ' collapsed' : '')}>
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="brand">
          <span className="brand-logo"><HomeIcon size={20} /></span>
          <div><strong>HomeHelp</strong><small>Admin</small></div>
          <button className="iconbtn only-mobile" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <nav className="navlist">
          {NAV.map((grp) => (
            <div key={grp.section} className="navgrp">
              <span className="navgrp-title">{grp.section}</span>
              {grp.items.filter((it) => !it.min || can(admin?.role, it.min)).map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => 'navitem' + (isActive ? ' active' : '')} onClick={() => setOpen(false)}>
                  <it.Icon size={19} /> <span>{it.label}</span>
                  {it.chev && <ChevronRight className="nav-chev" size={15} />}
                </NavLink>
              ))}
            </div>
          ))}
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
